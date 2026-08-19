/**
 * A small labelled pill.
 *
 * Generic on purpose: it knows nothing about folders, questions, or priority.
 * Callers pass the colour classes they want, which come from `lib/format.ts` for
 * anything data-driven so the mapping lives in one place.
 */
export function Badge({
  children,
  className = "bg-low-soft text-low border-low/30",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}
