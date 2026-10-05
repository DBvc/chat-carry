import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    exclude: ["tests/e2e/**"],
    passWithNoTests: false,
  },
});
