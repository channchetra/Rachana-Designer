/// <reference types="vite/client" />

/**
 * Ambient declarations for the webview build.
 *
 * The webview bundles the *shared* UI from `apps/web`, which uses three
 * Vite-specific mechanisms that TypeScript cannot infer from the source alone:
 *
 *  1. `?raw` imports — the canvas inject scripts are inlined as text so they
 *     stay byte-identical instead of being parsed as modules.
 *  2. `import.meta.env` — Vite injects build-time environment values.
 *  3. asset imports — `logo.svg` and friends resolve to URLs.
 *
 * `vite/client` covers (2) and (3) for the web app; these explicit declarations
 * make the same code typecheck when it is compiled as part of the extension.
 */

declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*.css";
