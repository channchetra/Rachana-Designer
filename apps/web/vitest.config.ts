import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Vitest configuration for the web app.
 *
 * Mirrors `vite.config.ts`'s aliases so tests resolve `@/` and `@rachana/core`
 * exactly as the app does. It also collects the shared core's tests, which sit
 * next to their sources in `packages/core/`, so one `npm test` covers both.
 */
const coreSrc = fileURLToPath(new URL("../../packages/core/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@rachana\/core$/, replacement: `${coreSrc}/index.ts` },
      // Explicit subpath aliases: a bare alias does not satisfy a subpath
      // export, so the ones in use are listed rather than trusted to the
      // package.json exports map.
      { find: "@rachana/core/html", replacement: `${coreSrc}/html/htmlPatcher.ts` },
      { find: "@rachana/core/wordpress", replacement: `${coreSrc}/wordpress/index.ts` },
      { find: /^@rachana\/core\//, replacement: `${coreSrc}/` },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "../../packages/core/**/*.test.ts",
    ],
    globals: true,
  },
});
