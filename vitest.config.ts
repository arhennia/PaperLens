import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Matches the `@/*` path alias in tsconfig.json, so imports look identical
    // in tests and in application code.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Only TypeScript units. The Python suite runs under pytest and the policy
    // tests run under psql; `frontend/` is the retired Vite app (D-009).
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "frontend", "backend", ".next"],
  },
});
