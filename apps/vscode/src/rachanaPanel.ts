/**
 * A single visual-editor panel.
 *
 * Owns one document: it builds the webview, wires the message channel, and
 * adapts the document host-side (reading the file, injecting the canvas script,
 * writing saves back). The editing logic itself lives in `@rachana/core`; this
 * class is the VS Code-shaped shell around it.
 *
 * Two things here are specific to VS Code and worth understanding:
 *
 *  - **`localResourceRoots`** must include every directory the webview will load
 *    from — the bundled webview assets, the canvas inject scripts, the sample
 *    site, and the document's own folder so the canvas can show sibling images.
 *    Omitting any of them makes VS Code block the request with no useful error.
 *  - **The canvas script is injected by the host**, not fetched by the webview,
 *    because it must run inside the `srcdoc` iframe. It is read from the
 *    extension's media directory and prepended to the document HTML.
 */

import * as vscode from "vscode";
import { VsCodeAssets, VsCodeOps, VsCodeSecrets, VsCodeStorage } from "./adapters/ports";
import { VsCodeWorkspace } from "./adapters/workspace";
import { buildWebviewHtml } from "./webviewHtml";
import {
  RECEIVE_TYPES,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from "./protocol";
import { DocumentHost } from "./documentHost";

export class RachanaPanel {
  private readonly panel: vscode.WebviewPanel;
  private readonly workspace: VsCodeWorkspace;
  private readonly assets: VsCodeAssets;
  private readonly ops: VsCodeOps;
  private readonly document: DocumentHost;
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uri: vscode.Uri,
    private readonly onDisposed: (key: string) => void
  ) {
    const fileDir = vscode.Uri.joinPath(uri, "..");
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? fileDir;

    this.panel = vscode.window.createWebviewPanel(
      "rachanaEditor",
      `Rachana: ${uri.path.split("/").pop() ?? "document"}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist"),
          vscode.Uri.joinPath(context.extensionUri, "media"),
          fileDir,
          workspaceRoot,
        ],
      }
    );

    this.workspace = new VsCodeWorkspace({ root: workspaceRoot, webview: this.panel.webview });
    this.assets = new VsCodeAssets(context.extensionUri, this.panel.webview);
    this.ops = new VsCodeOps();
    this.document = new DocumentHost({
      uri,
      workspace: this.workspace,
      assets: this.assets,
      storage: new VsCodeStorage(context),
      secrets: new VsCodeSecrets(context),
    });

    this.panel.webview.html = buildWebviewHtml(this.panel.webview, context.extensionUri);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHostMessage) => void this.handleMessage(msg),
      undefined,
      this.disposables
    );

    // The canvas iframe reports readiness itself; until then, sending the
    // document would race the webview's React mount.
    this.panel.onDidDispose(
      () => {
        this.onDisposed(this.uri.toString());
        this.document.dispose();
        for (const d of this.disposables) d.dispose();
      },
      undefined,
      this.disposables
    );
  }

  reveal(): void {
    this.panel.reveal();
  }

  dispose(): void {
    this.panel.dispose();
  }

  /* ------------------------------------------------------------------ *
   * Message handling
   * ------------------------------------------------------------------ */

  private async handleMessage(msg: WebviewToHostMessage): Promise<void> {
    if (!msg || typeof msg.type !== "string") return;

    try {
      switch (msg.type) {
        // The webview asks for the document as soon as it mounts.
        case "READ_FILE": {
          const content = await this.document.open();
          this.ready = true;
          this.post(content);
          return;
        }

        case "SAVE_PATCHES": {
          const result = await this.document.savePatches(msg.patches, msg.styleScope);
          this.post(result.ok ? { type: "FILE_SAVED" } : { type: "SAVE_ERROR", error: result.error ?? "Save failed" });
          return;
        }

        case "SAVE_FILE": {
          const result = await this.document.saveFull(msg.content);
          this.post(result.ok ? { type: "FILE_SAVED" } : { type: "SAVE_ERROR", error: result.error ?? "Save failed" });
          return;
        }

        /*
         * Clipboard is the one capability a webview genuinely lacks:
         * `navigator.clipboard.writeText` throws NotAllowedError there, so the
         * call is routed through `vscode.env.clipboard` instead.
         */
        case "COPY_TO_CLIPBOARD": {
          await this.ops.writeClipboard(msg.text);
          this.ops.notify("Copied to clipboard", "success");
          return;
        }

        case "OPEN_EXTERNAL":
          this.ops.openExternal(msg.url);
          return;

        case "SET_CONFIG": {
          const config = vscode.workspace.getConfiguration("rachana");
          if (msg.styleMode) await config.update("styleMode", msg.styleMode, vscode.ConfigurationTarget.Global);
          if (msg.styleScope) await config.update("styleScope", msg.styleScope, vscode.ConfigurationTarget.Global);
          if (msg.styleMode) this.post({ type: "CONFIG_CHANGE", styleMode: msg.styleMode });
          return;
        }

        case "LICENSE_GET_STATUS":
          // No licence tier: every feature is available, always.
          this.post({
            type: "LICENSE_STATUS",
            license: {
              licenseKey: "RACHANA-FULL-EDITION",
              instanceId: "vscode",
              status: "active",
              expiresAt: null,
              activationLimit: 999,
              activation: 1,
              edition: "Full Edition",
            },
            machineId: "vscode",
          });
          return;

        case "CLOSE_PANEL":
          this.dispose();
          return;

        default:
          // Document-level operations (folder listing, file creation, templates,
          // fonts, screenshots, WordPress, live preview) are handled by the
          // document host so this class stays about panel lifecycle.
          await this.document.handle(msg, (reply) => this.post(reply));
          return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Rachana] failed to handle ${msg.type}:`, err);
      this.post({ type: "SAVE_ERROR", error: `${msg.type} failed: ${message}` });
    }
  }

  /** Send a message to the webview, ignoring anything it cannot receive. */
  private post(msg: HostToWebviewMessage): void {
    if (!RECEIVE_TYPES.has(msg.type)) {
      console.warn(`[Rachana] refusing to post unrecognised message type: ${msg.type}`);
      return;
    }
    void this.panel.webview.postMessage(msg);
  }

  /** True once the document has been delivered at least once. */
  get isReady(): boolean {
    return this.ready;
  }
}
