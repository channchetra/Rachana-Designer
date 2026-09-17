/**
 * Type surface for the byte-preserving HTML cleanup helper.
 *
 * `htmlArtifactCleanup.js` is deliberately kept as plain JavaScript so the
 * cleanup rules can be unit-tested without a second TypeScript toolchain (the
 * same reason the original extension kept it as `.js`).
 */

/**
 * Remove artefacts a browser or a previous extension run may have injected into
 * a document: extension-injected `<script>` tags, editor markers and duplicate
 * injected `<style>` blocks.
 *
 * @param html The document text to clean.
 * @returns The cleaned document text.
 */
export function stripBrowserExtensionArtifacts(html: string): string;
