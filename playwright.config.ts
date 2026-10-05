import { defineConfig } from "@playwright/test";

// The extension fixture must create its own persistent Chromium context.
// Do not add a production service worker just to discover an extension ID.
export default defineConfig({
  testDir: "./tests/e2e",
  projects: [
    { name: "foundation", testMatch: "foundation.spec.ts" },
    { name: "business", testIgnore: "foundation.spec.ts" },
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
});
