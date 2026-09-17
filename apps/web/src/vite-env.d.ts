/// <reference types="vite/client" />

/**
 * Vite `?raw` import typing.
 *
 * `vite/client` already declares `*?raw`, but declaring it explicitly here keeps
 * the intent obvious next to the module that relies on it and protects the build
 * if the vite/client reference is ever removed.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
