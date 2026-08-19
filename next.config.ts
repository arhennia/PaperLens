import type { NextConfig } from "next";

/**
 * Next.js configuration.
 *
 * Deliberately almost empty. The defaults are correct for this app, and every
 * option added here is one more thing a future reader has to understand before
 * trusting what the framework does.
 */
const nextConfig: NextConfig = {
  // Fail the production build on a type error rather than shipping it. This is
  // the default, stated explicitly because the opposite (`ignoreBuildErrors`) is
  // a common copy-paste and would silently defeat the type layer D-027 exists
  // for.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
