/**
 * Webview HTML.
 *
 * A strict CSP that loads only from the extension's own resources — no CDN, no
 * inline script — plus the boot element the React bundle mounts into.
 *
 * `unsafe-eval` is deliberately absent. The canvas inject script runs inside the
 * `srcdoc` iframe, which the webview's CSP does not govern, so the outer document
 * does not need it. `unsafe-inline` is present only for styles, because the
 * editor's panels set inline styles through React.
 */

import * as vscode from "vscode";

export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "index.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "index.css")
  );
  const nonce = createNonce();

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}' ${webview.cspSource};
  img-src ${webview.cspSource} data: blob: https:;
  font-src ${webview.cspSource} data: https:;
  media-src ${webview.cspSource} data: blob: https:;
  connect-src ${webview.cspSource} https: http: data: blob:;
  frame-src blob: data: ${webview.cspSource};
  worker-src blob: ${webview.cspSource};
">
<title>Rachana Designer</title>
<link rel="stylesheet" href="${styleUri}">
<style nonce="${nonce}">
  html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  body { background: var(--vscode-editor-background, #0d1220); }
  #rachana-boot {
    display: flex; align-items: center; justify-content: center;
    height: 100%; gap: 12px;
    color: var(--vscode-descriptionForeground, #94a3b8);
    font: 13px system-ui, sans-serif;
  }
  #rachana-boot .spinner {
    width: 22px; height: 22px; border-radius: 999px;
    border: 2px solid rgba(127,162,214,0.25); border-top-color: #26A5DE;
    animation: rachana-spin 0.8s linear infinite;
  }
  @keyframes rachana-spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="root">
  <div id="rachana-boot"><div class="spinner"></div><span>Starting Rachana Designer…</span></div>
</div>
<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * A per-load nonce for the script and style tags.
 *
 * VS Code recreates the webview on reload, so a fresh nonce costs nothing and
 * keeps the CSP from being a blanket allowance.
 */
function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
