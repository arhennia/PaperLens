import { describe, expect, it } from "vitest";

import { KATEX_OPTIONS, containsMath, segmentMath } from "@/lib/math";

/**
 * Tests for the maths segmenter.
 *
 * This is the sanitization boundary for untrusted PDF text (see `lib/math.ts`),
 * so the cases that matter most are the ones where prose must NOT be treated as
 * maths — a false positive means arbitrary question text reaches KaTeX, and a
 * missed prose segment is what would eventually be passed to `innerHTML`.
 */

describe("segmentMath", () => {
  it("returns nothing for empty input", () => {
    expect(segmentMath("")).toEqual([]);
  });

  it("returns a single text segment when there is no maths", () => {
    expect(segmentMath("Explain paging in virtual memory.")).toEqual([
      { kind: "text", value: "Explain paging in virtual memory." },
    ]);
  });

  it("splits inline maths out of surrounding prose", () => {
    expect(segmentMath("Find $x^2$ now")).toEqual([
      { kind: "text", value: "Find " },
      { kind: "inline", value: "x^2" },
      { kind: "text", value: " now" },
    ]);
  });

  it("recognises display maths with $$", () => {
    expect(segmentMath("$$\\int_0^1 x\\,dx$$")).toEqual([
      { kind: "display", value: "\\int_0^1 x\\,dx" },
    ]);
  });

  it("recognises \\( \\) and \\[ \\] delimiters", () => {
    expect(segmentMath("Let \\(x\\) be")).toEqual([
      { kind: "text", value: "Let " },
      { kind: "inline", value: "x" },
      { kind: "text", value: " be" },
    ]);
    expect(segmentMath("\\[a+b\\]")).toEqual([
      { kind: "display", value: "a+b" },
    ]);
  });

  it("prefers $$ over $ so display maths is not read as two inline spans", () => {
    const segments = segmentMath("$$a$$");
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("display");
  });

  // --- The cases that keep prose out of KaTeX -----------------------------

  it("leaves currency amounts as text", () => {
    // The closing `$` follows a space, so it cannot close a maths span. Without
    // this rule "costs $5 and $10" renders as the formula "5 and 1".
    expect(segmentMath("costs $5 and $10")).toEqual([
      { kind: "text", value: "costs $5 and $10" },
    ]);
  });

  it("does not open maths when the delimiter is followed by whitespace", () => {
    expect(segmentMath("a $ b $ c")).toEqual([
      { kind: "text", value: "a $ b $ c" },
    ]);
  });

  it("treats an unclosed delimiter as literal text", () => {
    // One stray `$` must not swallow the rest of a question.
    expect(segmentMath("Cost is $50 per unit")).toEqual([
      { kind: "text", value: "Cost is $50 per unit" },
    ]);
    expect(segmentMath("$x")).toEqual([{ kind: "text", value: "$x" }]);
  });

  it("treats an escaped \\$ as a literal dollar sign", () => {
    expect(segmentMath("Cost \\$5 today")).toEqual([
      { kind: "text", value: "Cost $5 today" },
    ]);
  });

  it("does not let inline maths span a line break", () => {
    // A `$` on one line and another further down is far more likely to be two
    // stray characters than one formula.
    expect(segmentMath("$a\nb$")).toEqual([{ kind: "text", value: "$a\nb$" }]);
  });

  it("allows display maths to span lines", () => {
    expect(segmentMath("$$a\nb$$")).toEqual([
      { kind: "display", value: "a\nb" },
    ]);
  });

  it("does not treat an escaped dollar inside maths as the closer", () => {
    const segments = segmentMath("$a\\$b$");
    expect(segments).toEqual([{ kind: "inline", value: "a\\$b" }]);
  });

  it("ignores empty maths spans", () => {
    expect(segmentMath("$$")).toEqual([{ kind: "text", value: "$$" }]);
  });

  it("preserves every character of the original text across segments", () => {
    // A dropped character would mean question text silently changing, which is
    // worse than a formula failing to render.
    const inputs = [
      "Derive $E=mc^2$ and explain",
      "costs $5 and $10",
      "\\(a\\) then \\[b\\] end",
      "no maths at all",
      "$$display$$ plus $inline$",
    ];
    for (const input of inputs) {
      const rebuilt = segmentMath(input)
        .map((s) => s.value)
        .join("");
      // Delimiters are stripped from maths segments, so compare the letters that
      // are not delimiters rather than the raw string.
      const strip = (s: string) => s.replace(/[$\\()[\]\s]/g, "");
      expect(strip(rebuilt)).toBe(strip(input));
    }
  });
});

describe("containsMath", () => {
  it("is false for plain prose and true for real maths", () => {
    expect(containsMath("Explain deadlock avoidance.")).toBe(false);
    expect(containsMath("costs $5 and $10")).toBe(false);
    expect(containsMath("Find $x^2$")).toBe(true);
  });
});

describe("KATEX_OPTIONS", () => {
  it("never trusts input, so \\href and \\includegraphics stay disabled", () => {
    // This is a security property, not a preference: `trust: true` would let a
    // formula in an uploaded PDF emit a link or an image reference.
    expect(KATEX_OPTIONS.trust).toBe(false);
  });

  it("does not throw on malformed input", () => {
    // OCR'd LaTeX will sometimes be broken; it must render as visible red text
    // rather than crashing the page that shows the question.
    expect(KATEX_OPTIONS.throwOnError).toBe(false);
  });

  it("is frozen so no call site can enable trust", () => {
    expect(Object.isFrozen(KATEX_OPTIONS)).toBe(true);
  });
});
