import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/index.ts"],
      thresholds: {
        // Core logic modules (errors, client, webhook) target 80%+.
        // HTTP pass-through modules (openbanking, cryptoramp, cryptoexchange) are
        // integration-tested in CI against the real sandbox, not unit-tested here.
        lines: 50,
        functions: 55,
        branches: 70,
        statements: 50,
      },
    },
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
