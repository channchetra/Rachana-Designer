/**
 * Webview panel lifecycle.
 *
 * One panel per open document, keyed by URI so opening the same file twice
 * reveals the existing panel rather than stacking a second editor on it — the
 * behaviour a VS Code user expects from a document-based view.
 *
 * The panel is created **before** the host is built, because the workspace
 * adapter needs `webview.asWebviewUri` to serve sibling assets to the canvas.
 * That means the host is constructed inside the provider callback, which is why
 * {@link RachanaPanel} rather than the manager owns the host.
 */

import * as vscode from "vscode";
import { RachanaPanel } from "./rachanaPanel";

export class RachanaPanelManager {
  private readonly panels = new Map<string, RachanaPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Open (or reveal) the visual editor for a document. */
  open(uri: vscode.Uri): void {
    const key = uri.toString();

    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = new RachanaPanel(this.context, uri, (disposedKey) => {
      this.panels.delete(disposedKey);
    });
    this.panels.set(key, panel);
  }

  disposeAll(): void {
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }
}
