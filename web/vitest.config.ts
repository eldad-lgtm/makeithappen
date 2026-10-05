import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws when imported outside a React server environment.
      // Tests exercise server modules directly, so stub it.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});
