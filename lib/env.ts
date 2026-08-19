/**
 * Environment configuration, validated at first use.
 *
 * The split here is a security boundary, not a naming convention (D-019). In
 * Next.js, `NEXT_PUBLIC_`-prefixed variables are inlined into the browser bundle
 * at build time; everything else stays on the server. So the prefix IS the
 * control that keeps the service-role key and the LLM key out of the browser.
 *
 * Rules this file enforces:
 *   - No secret ever carries a NEXT_PUBLIC_ prefix.
 *   - Reading a server-only secret from browser code throws instead of
 *     returning undefined and failing somewhere less obvious.
 *   - A missing variable fails with a message naming the variable.
 */

/**
 * Public variables must be referenced as literal `process.env.X` property
 * accesses. Next.js performs a textual substitution at build time, so a
 * computed lookup like `process.env[name]` is NOT replaced and reads as
 * undefined in the browser.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

function requirePublic(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return requirePublic(publicEnv.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
}

export function supabasePublishableKey(): string {
  return requirePublic(
    publicEnv.supabasePublishableKey,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

/**
 * Reads a variable that must never reach the browser.
 *
 * The `window` check is a genuine second line of defence rather than
 * decoration: if a server-only module is ever pulled into a client bundle by an
 * import chain nobody noticed, this throws loudly at the call site instead of
 * silently yielding undefined.
 */
function requireServer(name: string): string {
  if (typeof window !== "undefined") {
    throw new Error(
      `${name} is a server-only secret and must never be read in browser code.`,
    );
  }
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Service-role key. Bypasses RLS entirely — server route handlers only. */
export function supabaseSecretKey(): string {
  return requireServer("SUPABASE_SECRET_KEY");
}

/** Base URL of the Python processing service. Never exposed to the browser. */
export function processingServiceUrl(): string {
  return requireServer("PROCESSING_SERVICE_URL");
}

/** Shared secret proving a caller is trusted Next.js server code (D-021). */
export function processingServiceToken(): string {
  return requireServer("PROCESSING_SERVICE_TOKEN");
}

/**
 * Storage bucket name. `exam-pdfs` per AGENTS.md — the old `.env.example` said
 * `exam-papers`, which was wrong (D-016).
 */
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "exam-pdfs";
