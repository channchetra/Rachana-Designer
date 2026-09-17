/**
 * Compatibility shim.
 *
 * The canonical implementation of the byte-preserving HTML patcher lives in
 * `@rachana/core`. This module re-exports it so the web app's existing imports
 * keep working, which is what let the monorepo split land without touching every
 * call site.
 *
 * New code should import from `@rachana/core` directly.
 */

export * from "@rachana/core/html";
