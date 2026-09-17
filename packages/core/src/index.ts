/**
 * @rachana/core — the headless core of Rachana Designer.
 *
 * Everything in this package is **host-agnostic**: no DOM access, no
 * `localStorage`, no `fetch`, no Node built-ins. The only capabilities it needs
 * from a host arrive as interfaces (`Workspace`, and the platform-ops contract),
 * which is what lets the same core run inside a browser, a VS Code webview, a
 * Tauri window, or headless in a test.
 *
 * The three targets therefore differ only in their adapters:
 *
 *   apps/web      → File System Access API, in-app dialogs, localStorage
 *   apps/vscode   → workspace.fs, showInputBox/showQuickPick, globalState
 *   apps/desktop  → Tauri fs plugin, Tauri dialogs, Tauri store
 */

/* ---------------------------------------------------------------- *
 * Contracts — what a host must provide
 * ---------------------------------------------------------------- */

export type {
  Workspace,
  WorkspaceFileEntry,
  WorkspaceKind,
  WorkspaceStat,
} from "./contracts/workspace";

export {
  SUPPORTED_EDITOR_EXTS,
  EXT_FROM_MIME,
  MIME_TYPES,
  base64ToBytes,
  basename,
  bytesToBase64,
  bytesToDataUri,
  decodeUtf8,
  dirname,
  encodeUtf8,
  escapesWorkspace,
  extname,
  isAstroPath,
  isEditablePath,
  isHtmlPath,
  isInside,
  isMarkdownPath,
  joinPath,
  mimeForPath,
  normalizePath,
  sanitizeFilename,
} from "./contracts/workspace";

/* ---------------------------------------------------------------- *
 * HTML — the byte-preserving patcher
 * ---------------------------------------------------------------- */

export {
  applyPatches,
  buildElementMap,
  stripBrowserExtensionArtifacts,
} from "./html/htmlPatcher";

export type {
  ApplyPatchesOptions,
  ElementPatch,
  ElementPosition,
  InsertionPatch,
  MovePatch,
  SavePatches,
  ScriptBlockPatch,
  StyleBlockPatch,
} from "./html/htmlPatcher";

/* ---------------------------------------------------------------- *
 * WordPress — block conversion
 * ---------------------------------------------------------------- */

export { convert, extractCssVariables, extractMediaUrls, replaceMediaUrls } from "./wordpress/convert";
export type { ConvertOptions } from "./wordpress/convert";

export {
  extractMarkdownMediaUrls,
  markdownHtmlToBlocks,
  replaceMarkdownMediaUrls,
} from "./wordpress/markdownToBlocks";
