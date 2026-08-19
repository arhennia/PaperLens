/**
 * Button styles as class strings rather than a wrapper component.
 *
 * A `<Button>` component here would need to forward every native prop
 * (`type`, `disabled`, `form`, `formAction`, `aria-*`) to be useful, which is a
 * wrapper that adds nothing over the element it wraps. Exporting the classes
 * instead means call sites use a real `<button>` or `<Link>` and keep every
 * native behaviour for free.
 */

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonPrimary = `${base} bg-accent text-white hover:bg-accent-hover`;

export const buttonSecondary = `${base} border border-border-strong bg-surface text-ink hover:bg-canvas`;

export const buttonGhost = `${base} text-muted hover:bg-canvas hover:text-ink`;

export const buttonDanger = `${base} border border-danger/30 bg-danger-soft text-danger hover:bg-danger/10`;
