import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration.
 *
 * The E2E suite drives the real app in Chromium to prove two things the unit
 * tests cannot:
 *
 *  1. the canvas iframe boots and `editor-inject.js` actually loads,
 *  2. a real edit round-trips through the save pipeline into a workspace file.
 *
 * A dev server is started automatically. The app is served from `localhost`, so
 * the File System Access API is available, but the tests use the in-memory
 * workspace (the default when no folder is picked) so they are deterministic and
 * need no user gesture.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5178",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --port 5178 --strictPort",
    url: "http://localhost:5178",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
