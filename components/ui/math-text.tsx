import katex from "katex";

import { KATEX_OPTIONS, segmentMath } from "@/lib/math";

/**
 * Renders text that may contain LaTeX maths.
 *
 * ---------------------------------------------------------------------------
 * THE SANITIZATION BOUNDARY
 *
 * Question text comes from user-uploaded PDFs, so it is untrusted. The rule this
 * component exists to enforce is: **untrusted prose is never passed to
 * `dangerouslySetInnerHTML`.**
 *
 * `segmentMath` splits the string into prose and maths spans. Prose is rendered
 * as a React text child, which React escapes, so `<script>` in a PDF becomes
 * visible text. `dangerouslySetInnerHTML` receives only markup KaTeX itself
 * generated, from a maths source, with `trust: false` — so it cannot contain a
 * link, an image reference, or an event handler (see `lib/math.ts`).
 * ---------------------------------------------------------------------------
 *
 * Not a Client Component on purpose. `katex.renderToString` is pure string
 * computation with no DOM dependency, so this renders on the server for static
 * question text and costs no client JavaScript. It still works unchanged when
 * called from inside a Client Component.
 */
export function MathText({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const text = children ?? "";
  if (!text) return null;

  const segments = segmentMath(text);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        // React escapes this, so untrusted prose cannot inject markup.
        if (segment.kind === "text") {
          // eslint-disable-next-line react/no-array-index-key -- segments are
          // positional and the array is rebuilt whenever the text changes.
          return <span key={index}>{segment.value}</span>;
        }

        const html = renderMath(segment.value, segment.kind === "display");

        // KaTeX failed hard enough to return nothing usable: show the raw source
        // rather than an empty gap, so no content silently disappears.
        if (html === null) {
          return (
            <code key={index} className="font-mono text-sm text-danger">
              {segment.value}
            </code>
          );
        }

        return (
          <span
            key={index}
            className={segment.kind === "display" ? "block my-2" : undefined}
            // Safe: `html` is KaTeX output from a maths source, generated with
            // trust:false. Never widen this to cover `segment.kind === "text"`.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}

/**
 * Renders one maths span to HTML, or null if KaTeX could not.
 *
 * `throwOnError: false` already makes KaTeX emit red error markup for malformed
 * input rather than throwing, so the catch here is a genuine last resort for
 * failures that option does not cover.
 */
function renderMath(source: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(source, { ...KATEX_OPTIONS, displayMode });
  } catch {
    return null;
  }
}
