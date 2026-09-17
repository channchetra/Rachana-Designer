/**
 * Host capability ports.
 *
 * The core is host-agnostic: it never touches `localStorage`, `fetch` for
 * bundled files, or a platform's file API directly. Anything it needs from the
 * outside world arrives through one of these interfaces, which is what lets the
 * same core run in a browser, a VS Code webview, a Tauri window or headless in a
 * test.
 *
 * Each target supplies exactly four implementations:
 *
 *   Web      File System Access / localStorage / public HTTP / navigator.clipboard
 *   VS Code  workspace.fs / globalState / extensionUri / vscode.env.clipboard
 *   Tauri    fs plugin / store plugin / resource dir / clipboard plugin
 */

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

/**
 * Small key/value persistence for settings and records.
 *
 * The web implementation is `localStorage`; VS Code's is `globalState` plus
 * `secrets` for credentials. Values must be JSON-serialisable.
 */
export interface StoragePort {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

/**
 * Persistence for values that must not sit in plain text (site passwords,
 * activation keys).
 *
 * VS Code has a real secret store; a browser does not, so the web implementation
 * is the same `localStorage` and says so in the UI. Keeping the split honest is
 * better than pretending browser storage is secure.
 */
export interface SecretPort {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Bundled assets
 * ------------------------------------------------------------------ */

/**
 * Read-only access to files shipped *with* the application rather than part of
 * the user's project: the canvas inject script, the Astro compiler WASM, and the
 * government sample pages.
 *
 * This exists because the natural web mechanism (`import ... ?raw`) is
 * Vite-specific. A `Assets` port lets the web app keep using it while VS Code
 * resolves the same files from `extensionUri` and Tauri from its resource
 * directory — no bundler coupling in the core.
 *
 * Paths are forward-slash and relative to the asset root, e.g.
 * `canvas/editor-inject.js`.
 */
export interface AssetsPort {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  /** Absolute URL a webview can load for this asset, when the host has one. */
  toDisplayUrl?(path: string): string | undefined;
}

/* ------------------------------------------------------------------ *
 * User interaction
 * ------------------------------------------------------------------ */

/** A single-line text prompt. Resolves `null` when cancelled. */
export interface PromptRequest {
  title: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  hint?: string;
}

/** A chooser. Resolves the chosen index, or `null` when cancelled. */
export interface ChooseRequest {
  title: string;
  options: string[];
  descriptions?: string[];
}

/** Confirm a destructive or notable action. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * Dialogs and messages the core needs but cannot render itself.
 *
 * The web app implements these with in-app modals; VS Code uses
 * `showInputBox`, `showQuickPick`, `showOpenDialog` and the notification API.
 */
export interface OpsPort {
  prompt(request: PromptRequest): Promise<string | null>;
  choose(request: ChooseRequest): Promise<number | null>;
  /** Confirm a destructive or notable action. */
  confirm(request: ConfirmRequest): Promise<boolean>;
  /** Show a transient message. */
  notify(message: string, level?: "info" | "error" | "success"): void;
  /** Open a URL outside the application. */
  openExternal(url: string): void;
  /** Write text to the system clipboard. */
  writeClipboard(text: string): Promise<void>;
  /**
   * Ask where a batch of generated files should be written.
   * Resolves the folder label used, or `null` when cancelled.
   */
  chooseExportTarget(request: { suggestedFolder: string; count: number }): Promise<string | null>;
}

/* ------------------------------------------------------------------ *
 * Aggregate
 * ------------------------------------------------------------------ */

/** Everything a host must provide to run the editor core. */
export interface HostPorts {
  readonly kind: "browser" | "vscode" | "tauri" | "node";
  readonly storage: StoragePort;
  readonly secrets: SecretPort;
  readonly assets: AssetsPort;
  readonly ops: OpsPort;
}
