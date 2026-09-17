/**
 * Compatibility shim for the path/byte helpers.
 *
 * The canonical interfaces (`Workspace` and the path, byte and MIME helpers)
 * live in `@rachana/core`. This re-export keeps the web app's existing imports
 * working so the monorepo split needed no call-site changes.
 *
 * New code should import from `@rachana/core` directly.
 */

export * from "@rachana/core";
