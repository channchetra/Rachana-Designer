import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Root Vitest configuration (monorepo-wide).
 *
 * Resolves `@/` and `@rachana/core` the same way the web app's Vite config does,
 * so `npm test` from the repo root exercises both the app and the shared core in
 * one run.
 *
 * The E2E directory is excluded on purpose: those specs use `@playwright/test`,
 * whose `test.describe` cannot be loaded by Vitest. Run them with
 * `npm run test:e2e`.
 */
const webSrc = fileURLToPath(new URL("./apps/web/src", import.meta.url));
const coreSrc = fileURLToPath(new URL("./packages/core/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@rachana\/core$/, replacement: `${coreSrc}/index.ts` },
      // Explicit subpath aliases: a bare alias does not satisfy a subpath
      // export, so the ones in use are listed rather than trusted to the
      // package.json map (which Vite does not consult for aliased specifiers).
      { find: "@rachana/core/html", replacement: `${coreSrc}/html/htmlPatcher.ts` },
      { find: "@rachana/core/wordpress", replacement: `${coreSrc}/wordpress/index.ts` },
      { find: /^@rachana\/core\//, replacement: `${coreSrc}/` },
      { find: /^@\//, replacement: `${webSrc}/` },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/web/tests/e2e/**"],
  },
});
