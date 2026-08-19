import type { Metadata, Viewport } from "next";

import "./globals.css";
// KaTeX's own stylesheet. Without it, rendered maths falls back to unstyled
// markup that is worse than plain text. Imported once at the root so every route
// that renders a formula has it, rather than per-page.
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: {
    default: "PaperLens",
    template: "%s · PaperLens",
  },
  description:
    "Upload past exam papers, see which questions actually repeat, and revise by weightage instead of guesswork.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
