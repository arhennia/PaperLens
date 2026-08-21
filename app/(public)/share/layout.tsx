import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shared Exam Workspace · PaperLens",
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-primary/20">
      <header className="sticky top-0 z-40 border-b border-border bg-surface shadow-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-8 w-36 md:h-9 md:w-44 flex items-center">
              <Image
                src="/logo.png"
                alt="PaperLens"
                width={176}
                height={36}
                priority
                className="object-contain"
              />
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
              <span className="material-symbols-outlined text-[14px]">visibility</span>
              <span>Public Read-Only Workspace</span>
            </span>

            <Link
              href="/login"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors shadow-xs"
            >
              Sign In to Create Hub
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
