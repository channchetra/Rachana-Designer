/**
 * Storage, assets and ops adapters for VS Code.
 *
 * Each one implements a core port, so the core never imports `vscode`. The four
 * together are the entire difference between the web app and this extension —
 * which is the whole point of the port design.
 */

import * as vscode from "vscode";
import type {
  AssetsPort,
  ChooseRequest,
  OpsPort,
  PromptRequest,
  SecretPort,
  StoragePort,
} from "@rachana/core/contracts";

/* ------------------------------------------------------------------ *
 * Storage — globalState
 * ------------------------------------------------------------------ */

/**
 * `globalState`-backed storage.
 *
 * `globalState` persists across sessions and is shared across workspaces, which
 * matches the web app's `localStorage` semantics: settings and snapshots follow
 * the user, not the project.
 */
export class VsCodeStorage implements StoragePort {
  constructor(private context: vscode.ExtensionContext) {}

  get<T>(key: string): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  set<T>(key: string, value: T): void {
    // Fire-and-forget: the port is synchronous because the web implementation
    // is, and a settings write does not need to block the caller.
    void this.context.globalState.update(key, value);
  }

  remove(key: string): void {
    void this.context.globalState.update(key, undefined);
  }
}

/* ------------------------------------------------------------------ *
 * Secrets — SecretStorage
 * ------------------------------------------------------------------ */

/**
 * `SecretStorage`-backed secrets.
 *
 * This is a real improvement over the web app, which has no OS keychain and
 * stores WordPress application passwords in `localStorage` in plain text.
 */
export class VsCodeSecrets implements SecretPort {
  constructor(private context: vscode.ExtensionContext) {}

  async get(key: string): Promise<string | undefined> {
    return this.context.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }

  async remove(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }
}

/* ------------------------------------------------------------------ *
 * Assets — the extension's own files
 * ------------------------------------------------------------------ */

/**
 * Reads files bundled with the extension: the canvas inject scripts, the Astro
 * compiler, and the generated government sample pages.
 *
 * `toDisplayUrl` matters most: `editor-inject.js` is injected into the canvas by
 * the host, and the sample pages need URLs the webview is permitted to load. The
 * webview's `localResourceRoots` must include this directory or VS Code blocks
 * the request.
 */
export class VsCodeAssets implements AssetsPort {
  constructor(
    private extensionUri: vscode.Uri,
    private webview?: vscode.Webview
  ) {}

  attachWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  private uri(path: string): vscode.Uri {
    const clean = path.replace(/^\/+/, "");
    return vscode.Uri.joinPath(this.extensionUri, ...clean.split("/"));
  }

  async readText(path: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(this.uri(path));
    return new TextDecoder("utf-8").decode(bytes);
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await vscode.workspace.fs.readFile(this.uri(path)));
  }

  toDisplayUrl(path: string): string | undefined {
    if (!this.webview) return undefined;
    return this.webview.asWebviewUri(this.uri(path)).toString();
  }
}

/* ------------------------------------------------------------------ *
 * Ops — dialogs, notifications, clipboard
 * ------------------------------------------------------------------ */

/**
 * Native VS Code dialogs.
 *
 * The clipboard method is the important one: a webview's
 * `navigator.clipboard.writeText` throws `NotAllowedError` because the call
 * needs a permission the webview does not have. Routing through
 * `vscode.env.clipboard` is not a nicety — without it, "Copy to clipboard"
 * silently fails.
 */
export class VsCodeOps implements OpsPort {
  async prompt(request: PromptRequest): Promise<string | null> {
    const value = await vscode.window.showInputBox({
      title: request.title,
      prompt: request.label ?? request.hint,
      value: request.value ?? "",
      placeHolder: request.placeholder,
      ignoreFocusOut: true,
    });
    return value === undefined ? null : value;
  }

  async choose(request: ChooseRequest): Promise<number | null> {
    const items = request.options.map((label, index) => ({
      label,
      description: request.descriptions?.[index],
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: request.title,
      ignoreFocusOut: true,
    });
    if (!picked) return null;
    // Match on the label rather than the returned object so a duplicate label
    // resolves to the first occurrence, matching the web picker's behaviour.
    return request.options.indexOf(String(picked.label));
  }

  async confirm(request: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }): Promise<boolean> {
    const confirmLabel = request.confirmLabel ?? (request.danger ? "Delete" : "Confirm");
    const choice = await vscode.window.showWarningMessage(
      request.message,
      { modal: true, detail: request.title },
      confirmLabel
    );
    return choice === confirmLabel;
  }

  notify(message: string, level: "info" | "error" | "success" = "info"): void {
    if (level === "error") {
      void vscode.window.showErrorMessage(message);
    } else if (level === "success") {
      void vscode.window.showInformationMessage(message);
    } else {
      void vscode.window.showInformationMessage(message);
    }
  }

  openExternal(url: string): void {
    void vscode.env.openExternal(vscode.Uri.parse(url));
  }

  /** Works where `navigator.clipboard` does not. */
  async writeClipboard(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }

  /**
   * Screenshots are written next to the document, so there is nothing to ask.
   * The confirmation exists in the web app only because a browser cannot create
   * a directory silently.
   */
  async chooseExportTarget({
    suggestedFolder,
  }: {
    suggestedFolder: string;
    count: number;
  }): Promise<string | null> {
    return suggestedFolder;
  }
}
