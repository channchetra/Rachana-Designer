/**
 * Rachana Designer — VS Code extension entry point.
 *
 * Deliberately thin: it registers one command that opens a webview panel for a
 * supported file. Every editing decision lives in `@rachana/core` and the port
 * adapters, so this file is wiring rather than logic.
 */

import * as vscode from "vscode";
import { RachanaPanelManager } from "./panel";
import { SUPPORTED_EDITOR_EXTS } from "@rachana/core/contracts";

export function activate(context: vscode.ExtensionContext): void {
  const panels = new RachanaPanelManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("rachana.openVisualEditor", (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showErrorMessage("Select a file first, or run this from a file's context menu.");
        return;
      }
      if (!isSupported(target)) {
        void vscode.window.showErrorMessage(
          `Rachana Designer opens ${SUPPORTED_EDITOR_EXTS.join(", ")} files.`
        );
        return;
      }
      panels.open(target);
    })
  );

  // Reopening a file that is already open in a panel should reveal it, not stack
  // a second editor on the same document.
  context.subscriptions.push({ dispose: () => panels.disposeAll() });
}

export function deactivate(): void {
  /* panels are disposed through context.subscriptions */
}

function isSupported(uri: vscode.Uri): boolean {
  const lower = uri.path.toLowerCase();
  return SUPPORTED_EDITOR_EXTS.some((ext) => lower.endsWith(ext));
}
