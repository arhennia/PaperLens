/**
 * Button styles as class strings and helper component.
 */

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ease-in-out cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none";

export const buttonPrimary = `${base} bg-primary text-white shadow-sm hover:bg-primary-hover active:scale-[0.98]`;

export const buttonSecondary = `${base} border border-border bg-surface text-ink hover:bg-surface-container hover:border-border-strong active:scale-[0.98]`;

export const buttonGhost = `${base} text-muted hover:bg-surface-container hover:text-ink`;

export const buttonDanger = `${base} border border-danger/30 bg-danger-soft text-danger hover:bg-danger/10 active:scale-[0.98]`;

export const buttonOutline = `${base} border border-primary/30 text-primary bg-primary-soft/40 hover:bg-primary-soft hover:border-primary/50`;
