/**
 * Splitting text into prose and maths, for safe KaTeX rendering.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS RATHER THAN CALLING KaTeX ON THE WHOLE STRING
 *
 * Question text is extracted from PDFs the user uploaded, so it is untrusted
 * input. AGENTS.md requires KaTeX for maths and that rendered content be
 * sanitized appropriately.
 *
 * The safe shape is to never put untrusted prose through `innerHTML` at all.
 * This module finds the maths *spans* in a string and leaves everything else as
 * plain text, so the renderer can pass prose to React as a text child — React
 * escapes it — and use `dangerouslySetInnerHTML` only for markup KaTeX itself
 * generated from the maths source.
 *
 * KaTeX is then called with `trust: false` (its default), which refuses
 * `\href`, `\url`, `\includegraphics` and `\htmlClass`, so its output cannot
 * carry a link or a script even when the maths source asks for one. Combined
 * with `throwOnError: false`, a malformed formula renders as visible red text
 * instead of taking down the page — the right trade for OCR'd input, which will
 * sometimes produce broken LaTeX.
 * ---------------------------------------------------------------------------
 *
 * Everything here is pure and has no React dependency, so it is unit-testable
 * and safe on the server. The React component is `components/ui/math-text.tsx`.
 */

/** One piece of a string: prose, inline maths, or display maths. */
export interface MathSegment {
  kind: "text" | "inline" | "display";
  /** For maths segments this is the LaTeX source, delimiters stripped. */
  value: string;
}

/**
 * Splits text into prose and maths segments.
 *
 * Recognised delimiters, matched longest-first so `$$` wins over `$`:
 *
 *   `$$ … $$`  and  `\[ … \]`   display maths
 *   `$ … $`    and  `\( … \)`   inline maths
 *
 * A backslash-escaped `\$` is literal text and never opens maths.
 *
 * ## The currency problem, and the heuristic that handles it
 *
 * Exam papers contain money: "a component costs $5 and another $10". Matching
 * `$…$` naively turns "5 and another 1" into a formula. Two rules avoid the
 * common cases, borrowed from how Markdown maths extensions handle it:
 *
 *   1. The character after the opening `$` must not be whitespace.
 *   2. The character before the closing `$` must not be whitespace.
 *
 * "costs $5 and $10" fails rule 2 (the closing `$` follows a space), so it stays
 * prose. `$x + 1$` satisfies both and renders.
 *
 * This is a heuristic and it has a known ceiling: `$5+$10` has no spaces and
 * would render as maths. That is accepted rather than solved — the alternative
 * is asking the user to mark up maths by hand, and a mis-rendered price is a
 * visible cosmetic error, not a correctness or security problem. `\(…\)` is
 * always unambiguous and is what a LaTeX-native paper uses.
 *
 * An unclosed delimiter is treated as literal text rather than swallowing the
 * rest of the string, so one stray `$` cannot blank a question.
 *
 * @example
 * segmentMath("Find $x^2$ now")
 * // [{kind:"text",value:"Find "},{kind:"inline",value:"x^2"},{kind:"text",value:" now"}]
 */
export function segmentMath(input: string): MathSegment[] {
  if (!input) return [];

  const segments: MathSegment[] = [];
  let prose = "";
  let i = 0;

  /** Flushes accumulated prose, skipping empty runs. */
  const flushProse = () => {
    if (prose) {
      segments.push({ kind: "text", value: prose });
      prose = "";
    }
  };

  while (i < input.length) {
    const char = input[i];

    // An escaped delimiter is literal. Consume both characters so the `$` cannot
    // be reconsidered as an opener on the next pass.
    if (char === "\\" && (input[i + 1] === "$" || input[i + 1] === "\\")) {
      prose += input[i + 1] === "$" ? "$" : "\\\\";
      i += 2;
      continue;
    }

    // \[ … \]  and  \( … \)
    if (char === "\\" && (input[i + 1] === "[" || input[i + 1] === "(")) {
      const isDisplay = input[i + 1] === "[";
      const closer = isDisplay ? "\\]" : "\\)";
      const end = input.indexOf(closer, i + 2);
      if (end !== -1) {
        const value = input.slice(i + 2, end).trim();
        if (value) {
          flushProse();
          segments.push({ kind: isDisplay ? "display" : "inline", value });
          i = end + 2;
          continue;
        }
      }
      // Unclosed or empty: literal.
      prose += input.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (char === "$") {
      const isDisplay = input[i + 1] === "$";
      const delimiter = isDisplay ? "$$" : "$";
      const contentStart = i + delimiter.length;
      const end = findClosingDollar(input, contentStart, delimiter);

      if (end !== -1) {
        const raw = input.slice(contentStart, end);
        const value = raw.trim();
        // Display maths may span lines; inline maths may not, since a `$` on one
        // line and another three paragraphs later is far more likely to be two
        // stray characters than one formula.
        const spansLines = !isDisplay && /\n/.test(raw);
        if (value && !spansLines) {
          flushProse();
          segments.push({ kind: isDisplay ? "display" : "inline", value });
          i = end + delimiter.length;
          continue;
        }
      }

      prose += delimiter;
      i += delimiter.length;
      continue;
    }

    prose += char;
    i += 1;
  }

  flushProse();
  return segments;
}

/**
 * Finds the closing delimiter for a maths span, or -1.
 *
 * Enforces the whitespace rules described on {@link segmentMath}: the opening
 * delimiter must be followed by a non-space, and the closing one preceded by a
 * non-space. Escaped `\$` is skipped rather than treated as a closer.
 */
function findClosingDollar(
  input: string,
  contentStart: number,
  delimiter: string,
): number {
  const first = input[contentStart];
  // Rule 1: `$ x$` is prose containing dollars, not maths.
  if (first === undefined || /\s/.test(first)) return -1;

  for (let j = contentStart; j < input.length; j += 1) {
    if (input[j] === "\\") {
      // Skip the escaped character so `\$` inside maths does not close it.
      j += 1;
      continue;
    }
    if (input[j] !== "$") continue;

    if (delimiter === "$$") {
      if (input[j + 1] !== "$") continue;
    } else if (input[j + 1] === "$") {
      // A `$$` while scanning for a single `$` is not this span's closer.
      continue;
    }

    // Rule 2: the closer must not follow whitespace.
    const previous = input[j - 1];
    if (previous !== undefined && /\s/.test(previous) && delimiter === "$") {
      continue;
    }
    return j;
  }
  return -1;
}

/** True when a string contains anything this module would render as maths. */
export function containsMath(input: string): boolean {
  return segmentMath(input).some((segment) => segment.kind !== "text");
}

/**
 * KaTeX options used everywhere maths is rendered.
 *
 * Exported as a single frozen object so no call site can quietly enable `trust`,
 * which is what keeps `\href` and `\includegraphics` out of the output.
 */
export const KATEX_OPTIONS = Object.freeze({
  /** Render a broken formula as visible red text rather than throwing. OCR'd
   *  input will sometimes be malformed and must not blank the page. */
  throwOnError: false,
  errorColor: "#b42318",
  /** Refuses \href, \url, \includegraphics, \htmlClass — the commands that could
   *  turn a formula into a link or inject attributes. Never set this true. */
  trust: false,
  /** Warn-level handling of non-standard LaTeX: render what is understandable
   *  instead of rejecting the whole formula. */
  strict: false as const,
  output: "htmlAndMathml" as const,
});
