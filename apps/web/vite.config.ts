import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Rachana Designer web app — build configuration.
 *
 * The editor canvas is an `<iframe srcdoc>` that receives a generated inject
 * script. That script is authored as a plain `.js` file and imported with
 * `?raw` so it stays byte-identical and debuggable instead of being bundled.
 *
 * `@rachana/core` is aliased straight to its source directory so the monorepo
 * needs no build step between the core and its consumers — Vite compiles the
 * TypeScript as if it were local, which keeps `npm run dev` and HMR working
 * across the package boundary. The `@rachana/core/*` subpath alias is ordered
 * first so a deep import never resolves to the barrel.
 */
const coreSrc = fileURLToPath(new URL("../../packages/core/src", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
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
  server: {
    port: 5178,
    strictPort: false,
    open: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            "@uiw/react-codemirror",
            "@codemirror/lang-html",
            "@codemirror/lang-markdown",
            "@codemirror/view",
            "@codemirror/state",
          ],
          markdown: ["marked", "turndown"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
