/** A bordered surface. The default container for a block of content. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A single labelled number.
 *
 * Used for the dashboard and analytics stat rows. `hint` carries the caveat that
 * a number needs — "cached", "of total marks" — so a figure is never presented
 * with more authority than it has.
 */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-ink tabular-nums">
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}
