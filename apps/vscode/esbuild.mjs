/**
 * esbuild configuration for the VS Code extension.
 *
 * Two independent bundles, because they run in different places:
 *
 *  1. **`dist/extension.cjs`** — the extension host. Runs in Node inside VS Code,
 *     so `vscode` is external (it is injected by the host) and the output is
 *     CommonJS, which is what VS Code's extension loader expects.
 *  2. **`dist/webview/index.js`** — the webview UI. Runs in a browser context, so
 *     everything is bundled and the format is ESM.
 *
 * `@rachana/core` is bundled *into* each rather than left external: it is
 * TypeScript source with no build step, and bundling is what makes that work on
 * both sides.
 *
 * Usage:  node esbuild.mjs [--watch]
 */

import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cpSync, mkdirSync, existsSync, statSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const coreSrc = join(here, "..", "..", "packages", "core", "src");
const webSrc = join(here, "..", "web", "src");

/**
 * Resolve an aliased specifier to a real file.
 *
 * esbuild does not apply extension or index resolution to a path returned from
 * `onResolve`, so an aliased `@web/app/App` would look for a file literally named
 * `App`. This probes the candidates the way a bundler would: exact file, then
 * each TypeScript/JavaScript extension, then a directory `index`.
 *
 * Returns `null` when nothing matches, which lets esbuild report the original
 * specifier so the error message stays useful.
 */
function resolveFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.json`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * Shared alias resolution.
 *
 * The specifiers are mapped to absolute paths, so the plugin needs no
 * `resolveDir` to continue resolution — esbuild resolves the absolute file
 * directly. Regexes are ordered most-specific first: a bare `@rachana/core`
 * must not swallow `@rachana/core/contracts`.
 */
const aliasPlugin = {
  name: "rachana-aliases",
  setup(build) {
    const exact = new Map([
      ["@rachana/core", join(coreSrc, "index.ts")],
      ["@rachana/core/contracts", join(coreSrc, "contracts", "index.ts")],
      ["@rachana/core/workspace", join(coreSrc, "contracts", "workspace.ts")],
      ["@rachana/core/html", join(coreSrc, "html", "htmlPatcher.ts")],
      ["@rachana/core/wordpress", join(coreSrc, "wordpress", "index.ts")],
    ]);

    build.onResolve({ filter: /^@/ }, (args) => {
      // `?raw` is Vite's inline-as-text suffix. The shared UI uses it for the
      // canvas inject scripts, which must stay byte-identical. Stripping the
      // suffix makes the path resolvable, and the loader below inlines the text.
      const isRaw = args.path.endsWith("?raw");
      const specifier = isRaw ? args.path.slice(0, -"?raw".length) : args.path;

      const exactHit = exact.get(specifier);
      if (exactHit) return { path: exactHit, namespace: isRaw ? "raw" : "file" };

      let base;
      if (specifier.startsWith("@rachana/core/")) {
        base = join(coreSrc, specifier.slice("@rachana/core/".length));
      } else if (specifier.startsWith("@web/")) {
        base = join(webSrc, specifier.slice("@web/".length));
      } else if (specifier.startsWith("@/")) {
        base = join(webSrc, specifier.slice(2));
      } else {
        return null;
      }

      const resolved = resolveFile(base);
      // Falling through to esbuild keeps the original specifier in the error,
      // which is far easier to act on than a mangled absolute path.
      if (!resolved) return null;
      return { path: resolved, namespace: isRaw ? "raw" : "file" };
    });

    // Inline a `?raw` import as a string export, matching Vite's behaviour.
    build.onLoad({ filter: /.*/, namespace: "raw" }, (args) => {
      const text = readFileSync(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
    });
  },
};

/** Copy the hand-authored canvas scripts next to the bundle. */
function copyMedia() {
  const outDir = join(here, "dist", "media");
  mkdirSync(outDir, { recursive: true });
  const sources = [
    [join(webSrc, "platform", "canvas", "editor-inject.js"), join(outDir, "editor-inject.js")],
    [join(webSrc, "platform", "canvas", "live-edit-inject.js"), join(outDir, "live-edit-inject.js")],
  ];
  for (const [from, to] of sources) {
    if (existsSync(from)) cpSync(from, to);
  }
}

/** Copy the generated government sample site so the webview can load it. */
function copySampleSite() {
  const from = join(here, "..", "web", "public", "sample-site");
  const to = join(here, "dist", "media", "sample-site");
  if (!existsSync(from)) {
    console.warn("esbuild: no sample-site found — run `npm run build:samples` first");
    return;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

/**
 * Stage the Astro compiler WASM as an extension resource.
 *
 * Live mode maps a clicked element back to the source AST with
 * `@astrojs/compiler`. That package loads its WebAssembly at runtime, so the
 * `.wasm` must sit beside the bundle as a real file — bundling cannot inline it.
 *
 * It is copied now, before Live mode is wired up, because a missing WASM fails at
 * runtime with an opaque error rather than at build time. Having the resource in
 * place means Live mode works the moment its code lands.
 *
 * ~5 MB, which is exactly why it belongs in `dist/media/` and not in the webview
 * bundle.
 */
function copyAstroWasm() {
  const from = [
    join(here, "..", "..", "node_modules", "@astrojs", "compiler", "dist", "astro.wasm"),
    join(here, "..", "web", "node_modules", "@astrojs", "compiler", "dist", "astro.wasm"),
  ].find((candidate) => existsSync(candidate));

  if (!from) {
    console.warn("esbuild: @astrojs/compiler not installed — Live mode will be unavailable");
    return;
  }
  const to = join(here, "dist", "media", "astro.wasm");
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

if (watch) {
  copyMedia();
  copySampleSite();
  copyAstroWasm();
}

const extensionCtx = await esbuild.context({
  entryPoints: [join(here, "src", "extension.ts")],
  outfile: join(here, "dist", "extension.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  // `vscode` is provided by the host at runtime and must never be bundled.
  external: ["vscode"],
  plugins: [aliasPlugin],
  logLevel: "info",
});

const webviewCtx = await esbuild.context({
  entryPoints: [join(here, "webview", "main.tsx")],
  outfile: join(here, "dist", "webview", "index.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  sourcemap: true,
  jsx: "automatic",
  loader: { ".css": "css", ".json": "json", ".svg": "dataurl" },
  plugins: [aliasPlugin],
  logLevel: "info",
});

if (watch) {
  await extensionCtx.watch();
  await webviewCtx.watch();
  console.log("esbuild: watching…");
} else {
  await extensionCtx.rebuild();
  await extensionCtx.dispose();
  await webviewCtx.rebuild();
  await webviewCtx.dispose();
  copyMedia();
  copySampleSite();
  copyAstroWasm();
  console.log("esbuild: built dist/extension.cjs and dist/webview/index.js");
}
