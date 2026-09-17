"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode6 = __toESM(require("vscode"));

// src/rachanaPanel.ts
var vscode5 = __toESM(require("vscode"));

// src/adapters/ports.ts
var vscode = __toESM(require("vscode"));
var VsCodeStorage = class {
  constructor(context) {
    this.context = context;
  }
  get(key) {
    return this.context.globalState.get(key);
  }
  set(key, value) {
    void this.context.globalState.update(key, value);
  }
  remove(key) {
    void this.context.globalState.update(key, void 0);
  }
};
var VsCodeSecrets = class {
  constructor(context) {
    this.context = context;
  }
  async get(key) {
    return this.context.secrets.get(key);
  }
  async set(key, value) {
    await this.context.secrets.store(key, value);
  }
  async remove(key) {
    await this.context.secrets.delete(key);
  }
};
var VsCodeAssets = class {
  constructor(extensionUri, webview) {
    this.extensionUri = extensionUri;
    this.webview = webview;
  }
  attachWebview(webview) {
    this.webview = webview;
  }
  uri(path) {
    const clean = path.replace(/^\/+/, "");
    return vscode.Uri.joinPath(this.extensionUri, ...clean.split("/"));
  }
  async readText(path) {
    const bytes = await vscode.workspace.fs.readFile(this.uri(path));
    return new TextDecoder("utf-8").decode(bytes);
  }
  async readBytes(path) {
    return new Uint8Array(await vscode.workspace.fs.readFile(this.uri(path)));
  }
  toDisplayUrl(path) {
    if (!this.webview)
      return void 0;
    return this.webview.asWebviewUri(this.uri(path)).toString();
  }
};
var VsCodeOps = class {
  async prompt(request) {
    const value = await vscode.window.showInputBox({
      title: request.title,
      prompt: request.label ?? request.hint,
      value: request.value ?? "",
      placeHolder: request.placeholder,
      ignoreFocusOut: true
    });
    return value === void 0 ? null : value;
  }
  async choose(request) {
    const items = request.options.map((label, index) => ({
      label,
      description: request.descriptions?.[index]
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: request.title,
      ignoreFocusOut: true
    });
    if (!picked)
      return null;
    return request.options.indexOf(String(picked.label));
  }
  async confirm(request) {
    const confirmLabel = request.confirmLabel ?? (request.danger ? "Delete" : "Confirm");
    const choice = await vscode.window.showWarningMessage(
      request.message,
      { modal: true, detail: request.title },
      confirmLabel
    );
    return choice === confirmLabel;
  }
  notify(message, level = "info") {
    if (level === "error") {
      void vscode.window.showErrorMessage(message);
    } else if (level === "success") {
      void vscode.window.showInformationMessage(message);
    } else {
      void vscode.window.showInformationMessage(message);
    }
  }
  openExternal(url) {
    void vscode.env.openExternal(vscode.Uri.parse(url));
  }
  /** Works where `navigator.clipboard` does not. */
  async writeClipboard(text) {
    await vscode.env.clipboard.writeText(text);
  }
  /**
   * Screenshots are written next to the document, so there is nothing to ask.
   * The confirmation exists in the web app only because a browser cannot create
   * a directory silently.
   */
  async chooseExportTarget({
    suggestedFolder
  }) {
    return suggestedFolder;
  }
};

// src/adapters/workspace.ts
var vscode2 = __toESM(require("vscode"));

// ../../packages/core/src/contracts/workspace.ts
function extname(path) {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}
function basename(path) {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? clean : clean.slice(idx + 1);
}
function dirname(path) {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? "" : clean.slice(0, idx);
}
function joinPath(...parts) {
  const joined = parts.filter((p) => p !== void 0 && p !== null && p !== "").join("/").replace(/\\/g, "/");
  const out = [];
  for (const seg of joined.split("/")) {
    if (seg === "" || seg === ".")
      continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..")
        out.pop();
      else
        out.push("..");
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}
var SUPPORTED_EDITOR_EXTS = [".html", ".htm", ".md", ".mdx", ".astro"];
function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}
function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}
var MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".md": "text/markdown",
  ".astro": "text/plain",
  ".txt": "text/plain"
};
function mimeForPath(path) {
  return MIME_TYPES[extname(path)] ?? "application/octet-stream";
}

// src/adapters/workspace.ts
var FILE_TYPE_DIRECTORY = 2;
var VsCodeWorkspace = class _VsCodeWorkspace {
  kind = "directory";
  label;
  root;
  webview;
  constructor(options) {
    this.root = options.root;
    this.webview = options.webview;
    this.label = basename(options.root.path.replace(/\/+$/, "")) || "workspace";
  }
  /**
   * The webview is created after the workspace in some flows (the panel needs
   * the workspace to build its HTML), so it can be attached later.
   */
  attachWebview(webview) {
    this.webview = webview;
  }
  /* ------------------------------ paths ------------------------------ */
  uri(path) {
    const clean = joinPath(path);
    if (clean.startsWith("..")) {
      throw new Error(`Path escapes the workspace: ${path}`);
    }
    if (!clean)
      return this.root;
    return vscode2.Uri.joinPath(this.root, ...clean.split("/"));
  }
  /* ------------------------------- read ------------------------------ */
  async readText(path) {
    return decodeUtf8(await this.readBinary(path));
  }
  async readBinary(path) {
    const bytes = await vscode2.workspace.fs.readFile(this.uri(path));
    return new Uint8Array(bytes);
  }
  /* ------------------------------- write ----------------------------- */
  async writeText(path, content) {
    const uri = this.uri(path);
    const open = vscode2.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString()
    );
    if (open) {
      if (open.getText() !== content) {
        const edit = new vscode2.WorkspaceEdit();
        edit.replace(uri, new vscode2.Range(open.positionAt(0), open.positionAt(open.getText().length)), content);
        await vscode2.workspace.applyEdit(edit);
      }
      await open.save();
      return;
    }
    await vscode2.workspace.fs.writeFile(uri, encodeUtf8(content));
  }
  async writeBinary(path, data) {
    await vscode2.workspace.fs.writeFile(this.uri(path), data);
  }
  /* ------------------------------ metadata --------------------------- */
  async exists(path) {
    try {
      await vscode2.workspace.fs.stat(this.uri(path));
      return true;
    } catch {
      return false;
    }
  }
  async stat(path) {
    const clean = joinPath(path);
    try {
      const s = await vscode2.workspace.fs.stat(this.uri(clean));
      const isDirectory = (s.type & FILE_TYPE_DIRECTORY) !== 0;
      return {
        path: clean,
        exists: true,
        isDirectory,
        size: s.size,
        lastModified: s.mtime
      };
    } catch {
      return { path: clean, exists: false, isDirectory: false, size: 0, lastModified: 0 };
    }
  }
  async remove(path) {
    await vscode2.workspace.fs.delete(this.uri(path), { recursive: true });
  }
  async mkdir(path) {
    await vscode2.workspace.fs.createDirectory(this.uri(path));
  }
  /* ------------------------------- list ------------------------------ */
  async list(dir) {
    let raw;
    try {
      raw = await vscode2.workspace.fs.readDirectory(this.uri(dir));
    } catch {
      return [];
    }
    const out = [];
    for (const [name, type] of raw) {
      const child = joinPath(dir, name);
      if ((type & FILE_TYPE_DIRECTORY) !== 0) {
        out.push({ path: child, name, ext: "", kind: "directory" });
        continue;
      }
      let size;
      let lastModified;
      try {
        const s = await vscode2.workspace.fs.stat(this.uri(child));
        size = s.size;
        lastModified = s.mtime;
      } catch {
      }
      out.push({ path: child, name, ext: extname(name), kind: "file", size, lastModified });
    }
    return out.sort((a, b) => {
      if (a.kind !== b.kind)
        return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  /** Directories that are never worth walking; mirrors the browser adapter. */
  static SKIP_DIRS = /* @__PURE__ */ new Set([
    "node_modules",
    ".git",
    "dist",
    ".astro",
    ".next",
    "build",
    "out"
  ]);
  async listRecursive(dir, limit = 5e3) {
    const out = [];
    const walk = async (path, depth) => {
      if (out.length >= limit || depth > 8)
        return;
      const entries = await this.list(path);
      for (const entry of entries) {
        if (out.length >= limit)
          return;
        if (entry.kind === "directory") {
          if (_VsCodeWorkspace.SKIP_DIRS.has(entry.name))
            continue;
          await walk(entry.path, depth + 1);
        } else {
          out.push(entry);
        }
      }
    };
    await walk(dir, 0);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  /* ---------------------------- display URLs -------------------------- */
  /**
   * A URL the canvas iframe may load. Without a webview attached there is no
   * loadable URL, so this falls back to a data URI of the file's contents.
   */
  async toDisplayUrl(path) {
    if (this.webview)
      return this.webview.asWebviewUri(this.uri(path)).toString();
    const bytes = await this.readBinary(path);
    let binary = "";
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${mimeForPath(path)};base64,${btoa(binary)}`;
  }
  revokeUrl() {
  }
  /* ---------------------------- file picking -------------------------- */
  async pickAndImportFile(opts) {
    const picked = await vscode2.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: filtersFromAccept(opts.accept),
      title: "Select a file"
    });
    if (!picked?.[0])
      return null;
    const data = new Uint8Array(await vscode2.workspace.fs.readFile(picked[0]));
    const name = opts.suggestedName || basename(picked[0].path);
    const target = joinPath(opts.targetDir ?? "", name);
    await this.writeBinary(target, data);
    return { path: target, name, data };
  }
  /* ------------------------------- export ---------------------------- */
  /**
   * Writing "out" of a workspace folder means writing into it — the user is
   * already looking at real files, so there is nothing to download.
   */
  async exportFile(path, data) {
    await this.writeBinary(path, typeof data === "string" ? encodeUtf8(data) : data);
  }
  async exportFolder(folderPath, files) {
    await this.mkdir(folderPath);
    for (const file of files) {
      await this.writeBinary(
        joinPath(folderPath, file.name),
        typeof file.data === "string" ? encodeUtf8(file.data) : file.data
      );
    }
  }
  /* -------------------------------- extra ---------------------------- */
  /** The directory holding a path, as an absolute URI. Needed by the host. */
  absoluteDirOf(path) {
    return vscode2.Uri.joinPath(this.root, ...dirname(path).split("/").filter(Boolean));
  }
  get rootUri() {
    return this.root;
  }
};
function filtersFromAccept(accept) {
  const exts = accept.split(",").map((s) => s.trim()).filter((s) => s.startsWith(".")).map((s) => s.slice(1));
  if (exts.length === 0)
    return {};
  return { Supported: exts };
}

// src/webviewHtml.ts
var vscode3 = __toESM(require("vscode"));
function buildWebviewHtml(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri(
    vscode3.Uri.joinPath(extensionUri, "dist", "webview", "index.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode3.Uri.joinPath(extensionUri, "dist", "webview", "index.css")
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
  <div id="rachana-boot"><div class="spinner"></div><span>Starting Rachana Designer\u2026</span></div>
</div>
<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++)
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// src/protocol.ts
var RECEIVE_TYPES = /* @__PURE__ */ new Set([
  "FILE_CONTENT",
  "FILE_SAVED",
  "SAVE_ERROR",
  "CONFIG_CHANGE",
  "FOLDER_FILES_LIST",
  "FILE_CREATED",
  "FILE_CREATE_ERROR",
  "TEMPLATES_DATA",
  "TEMPLATE_HTML",
  "TEMPLATE_HTML_ERROR",
  "GOOGLE_FONTS_CATALOG",
  "USER_FONTS_LIST",
  "FONT_UPLOADED",
  "IMAGE_UPLOADED",
  "IMAGE_PASTED",
  "IMAGE_OPTIONS_RESULT",
  "IMAGE_UPLOADED_FOR_IMG",
  "LINK_URL",
  "LINK_CHANGE_RESULT",
  "CONNECT_SITES_LIST",
  "CONNECT_SITE_ADDED",
  "CONNECT_SITE_REMOVED",
  "CONNECT_SITE_TEST_RESULT",
  "CONNECT_PAGES_LIST",
  "CONNECT_PAGES_ERROR",
  "CONNECT_SITE_INFO",
  "CONNECT_EXPORT_PROGRESS",
  "CONNECT_EXPORT_COMPLETE",
  "CONNECT_EXPORT_ERROR",
  "CONNECT_EXPORT_CODE",
  "LICENSE_STATUS",
  "LICENSE_ACTIVATED",
  "LICENSE_ACTIVATION_ERROR",
  "LICENSE_DEACTIVATED",
  "LICENSE_DEACTIVATION_ERROR",
  "LICENSE_PORTAL_URL",
  "LICENSE_PORTAL_ERROR",
  "SCREENSHOTS_SAVED",
  "SCREENSHOTS_SAVE_ERROR",
  "LIVE_PREVIEW",
  "LIVE_PREVIEW_ERROR",
  "LIVE_STYLE_HISTORY_RESULT",
  "ASTRO_SOURCE_RESULT",
  "ASTRO_EDIT_RESULT",
  "LIVE_STYLE_DECLARATION_EDIT_RESULT"
]);

// src/documentHost.ts
var vscode4 = __toESM(require("vscode"));

// ../../packages/core/src/html/htmlArtifactCleanup.js
var VOID_ELEMENTS = /* @__PURE__ */ new Set(["br", "hr", "img", "input", "source", "area", "base", "col", "embed", "param", "track", "wbr", "link", "meta"]);
var EXTENSION_ELEMENT_IDS = ["plasmo-shadow-container", "loom-companion-mv3"];
var EXTENSION_TAG_NAMES = ["plasmo-csui", "grammarly-desktop-integration", "grammarly-extension"];
var EXTENSION_CLASS_NAMES = ["plasmo-csui-container"];
var EXTENSION_ATTRS = ["cz-shortcut-listen", "data-new-gr-c-s-check-loaded", "data-gr-ext-installed", "monica-id", "monica-version"];
var EXTENSION_STYLE_MARKERS = ["plasmo-shadow-container", "plasmo-csui"];
var PROTECTED_ELEMENTS = /* @__PURE__ */ new Set(["script", "template", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function nextToken(html, from) {
  let start = html.indexOf("<", from);
  while (start >= 0) {
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      if (commentEnd < 0)
        return null;
      start = html.indexOf("<", commentEnd + 3);
      continue;
    }
    const lead = html.slice(start).match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/);
    if (!lead) {
      start = html.indexOf("<", start + 1);
      continue;
    }
    let quote = "";
    for (let end = start + lead[0].length; end < html.length; end++) {
      const ch = html[end];
      if (quote) {
        if (ch === quote)
          quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        end += 1;
        const text = html.slice(start, end);
        return { start, end, text, tagName: lead[2].toLowerCase(), closing: lead[1] === "/", selfClosing: /\/\s*>$/.test(text) };
      }
    }
    return null;
  }
  return null;
}
function readAttribute(tag, attr) {
  const match = tag.match(new RegExp(`\\s${escapeRegex(attr)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}
function findElementEnd(html, open) {
  if (open.selfClosing || VOID_ELEMENTS.has(open.tagName))
    return open.end;
  let depth = 1;
  let pos = open.end;
  while (true) {
    const token = nextToken(html, pos);
    if (!token)
      return null;
    if (!token.closing && PROTECTED_ELEMENTS.has(token.tagName)) {
      const protectedEnd = findElementEnd(html, token);
      if (protectedEnd === null)
        return null;
      pos = protectedEnd;
      continue;
    }
    if (token.tagName === open.tagName) {
      if (token.closing)
        depth--;
      else if (!token.selfClosing && !VOID_ELEMENTS.has(token.tagName))
        depth++;
      if (depth === 0)
        return token.end;
    }
    pos = token.end;
  }
}
function isExtensionElement(token) {
  if (EXTENSION_TAG_NAMES.includes(token.tagName))
    return true;
  const id = readAttribute(token.text, "id");
  if (id && EXTENSION_ELEMENT_IDS.includes(id.toLowerCase()))
    return true;
  const classes = (readAttribute(token.text, "class") || "").split(/\s+/).map((name) => name.toLowerCase());
  return EXTENSION_CLASS_NAMES.some((name) => classes.includes(name));
}
function stripBrowserExtensionArtifacts(html) {
  let result = "";
  let copiedThrough = 0;
  let pos = 0;
  while (true) {
    const token = nextToken(html, pos);
    if (!token)
      break;
    if (!token.closing && PROTECTED_ELEMENTS.has(token.tagName)) {
      const protectedEnd = findElementEnd(html, token);
      if (protectedEnd === null)
        break;
      pos = protectedEnd;
      continue;
    }
    let removalEnd = null;
    if (!token.closing && isExtensionElement(token)) {
      removalEnd = findElementEnd(html, token);
    } else if (!token.closing && token.tagName === "style") {
      const styleEnd = findElementEnd(html, token);
      if (styleEnd !== null) {
        const id = readAttribute(token.text, "id") || "";
        const css = html.slice(token.end, styleEnd).toLowerCase();
        if (!id.toLowerCase().startsWith("gl-") && EXTENSION_STYLE_MARKERS.some((marker) => css.includes(marker)))
          removalEnd = styleEnd;
      }
    }
    if (removalEnd !== null) {
      result += html.slice(copiedThrough, token.start);
      copiedThrough = removalEnd;
      pos = removalEnd;
      continue;
    }
    if (!token.closing && (token.tagName === "html" || token.tagName === "body")) {
      let cleaned = token.text;
      for (const attr of EXTENSION_ATTRS) {
        cleaned = cleaned.replace(new RegExp(`\\s+${escapeRegex(attr)}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "gi"), "");
      }
      if (cleaned !== token.text) {
        result += html.slice(copiedThrough, token.start) + cleaned;
        copiedThrough = token.end;
      }
    }
    pos = token.end;
  }
  return result + html.slice(copiedThrough);
}

// ../../packages/core/src/html/htmlPatcher.ts
var VOID_ELEMENTS2 = /* @__PURE__ */ new Set([
  "br",
  "hr",
  "img",
  "input",
  "source",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "track",
  "wbr"
]);
var SKIP_ELEMENTS = /* @__PURE__ */ new Set(["script", "style", "link", "meta", "noscript"]);
function buildElementMap(html) {
  const map = /* @__PURE__ */ new Map();
  const bodyMatch = html.match(/<body\b[^>]*>/i);
  if (bodyMatch && bodyMatch.index !== void 0) {
    const bodyOpenEnd = bodyMatch.index + bodyMatch[0].length;
    const bodyCloseIdx = html.indexOf("</body", bodyOpenEnd);
    map.set("", {
      path: "",
      tagName: "body",
      openStart: bodyMatch.index,
      openEnd: bodyOpenEnd,
      innerStart: bodyOpenEnd,
      innerEnd: bodyCloseIdx === -1 ? html.length : bodyCloseIdx,
      closeEnd: bodyCloseIdx === -1 ? html.length : html.indexOf(">", bodyCloseIdx) + 1
    });
    walkChildren(html, bodyOpenEnd, bodyCloseIdx === -1 ? html.length : bodyCloseIdx, "", map);
  } else {
    map.set("", {
      path: "",
      tagName: "body",
      openStart: 0,
      openEnd: 0,
      innerStart: 0,
      innerEnd: html.length,
      closeEnd: html.length
    });
    walkChildren(html, 0, html.length, "", map);
  }
  return map;
}
function walkChildren(html, start, end, parentPath, map) {
  let pos = start;
  let childIndex = 0;
  while (pos < end) {
    if (html[pos] !== "<") {
      pos++;
      continue;
    }
    if (html.startsWith("<!--", pos)) {
      const commentEnd = html.indexOf("-->", pos + 4);
      pos = commentEnd === -1 ? end : commentEnd + 3;
      continue;
    }
    if (html[pos + 1] === "/")
      break;
    const tagMatch = matchOpeningTag(html, pos);
    if (!tagMatch) {
      pos++;
      continue;
    }
    const { tagName, fullLength, selfClosing } = tagMatch;
    const openStart = pos;
    const openEnd = pos + fullLength;
    if (SKIP_ELEMENTS.has(tagName)) {
      if (VOID_ELEMENTS2.has(tagName) || selfClosing) {
        pos = openEnd;
      } else {
        pos = skipToClosingTag(html, tagName, openEnd, end);
      }
      continue;
    }
    if (VOID_ELEMENTS2.has(tagName) || selfClosing) {
      const path2 = parentPath ? parentPath + "." + childIndex : "" + childIndex;
      childIndex++;
      map.set(path2, {
        path: path2,
        tagName,
        openStart,
        openEnd,
        innerStart: openEnd,
        innerEnd: openEnd,
        closeEnd: openEnd
      });
      pos = openEnd;
      continue;
    }
    const closeInfo = findClosingTag(html, tagName, openEnd, end);
    const path = parentPath ? parentPath + "." + childIndex : "" + childIndex;
    childIndex++;
    map.set(path, {
      path,
      tagName,
      openStart,
      openEnd,
      innerStart: openEnd,
      innerEnd: closeInfo.closeStart,
      closeEnd: closeInfo.closeEnd
    });
    walkChildren(html, openEnd, closeInfo.closeStart, path, map);
    pos = closeInfo.closeEnd;
  }
}
function matchOpeningTag(html, pos) {
  if (html[pos] !== "<")
    return null;
  const sub = html.substring(pos, pos + 2e3);
  const m = sub.match(/^<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(\/?)>/);
  if (!m)
    return null;
  return {
    tagName: m[1].toLowerCase(),
    fullLength: m[0].length,
    selfClosing: m[3] === "/"
  };
}
function skipToClosingTag(html, tagName, start, limit) {
  const closeTag = "</" + tagName;
  let idx = start;
  while (idx < limit) {
    const found = html.indexOf(closeTag, idx);
    if (found === -1 || found >= limit)
      return limit;
    const gt = html.indexOf(">", found);
    return gt === -1 ? limit : gt + 1;
  }
  return limit;
}
function findClosingTag(html, tagName, start, limit) {
  let depth = 1;
  let pos = start;
  const openPat = "<" + tagName;
  const closePat = "</" + tagName;
  while (pos < limit && depth > 0) {
    if (html.startsWith("<!--", pos)) {
      const ce = html.indexOf("-->", pos + 4);
      pos = ce === -1 ? limit : ce + 3;
      continue;
    }
    if (html[pos] !== "<") {
      pos++;
      continue;
    }
    const subLower = html.substring(pos, pos + closePat.length + 1).toLowerCase();
    if (subLower.startsWith(closePat.toLowerCase()) && (html[pos + closePat.length] === ">" || /\s/.test(html[pos + closePat.length]))) {
      depth--;
      if (depth === 0) {
        const gt = html.indexOf(">", pos);
        return {
          closeStart: pos,
          closeEnd: gt === -1 ? limit : gt + 1
        };
      }
      pos += closePat.length;
      continue;
    }
    const subOpen = html.substring(pos, pos + openPat.length + 1).toLowerCase();
    if (subOpen.startsWith(openPat.toLowerCase()) && (html[pos + openPat.length] === ">" || /[\s\/]/.test(html[pos + openPat.length]))) {
      const tagEnd = html.indexOf(">", pos);
      if (tagEnd !== -1 && html[tagEnd - 1] !== "/") {
        depth++;
      }
      pos = tagEnd === -1 ? pos + 1 : tagEnd + 1;
      continue;
    }
    pos++;
  }
  return { closeStart: limit, closeEnd: limit };
}
function setAttrInTag(tag, attr, value) {
  const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attrPattern = new RegExp(`(\\s)${escapeRegex2(attr)}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
  if (attrPattern.test(tag)) {
    return tag.replace(attrPattern, (_m, ws) => `${ws}${attr}="${escaped}"`);
  }
  return tag.replace(/(\/?>)$/, (_m, close) => ` ${attr}="${escaped}"${close}`);
}
function removeAttrInTag(tag, attr) {
  const attrPattern = new RegExp(`\\s+${escapeRegex2(attr)}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
  return tag.replace(attrPattern, "");
}
function escapeRegex2(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function shouldWrapForTemplateImport(html, patches, options) {
  if (!options?.allowDocumentScaffold)
    return false;
  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasHeadTag = /<head[\s>]/i.test(html) || /<\/head>/i.test(html);
  const hasBodyTag = /<body[\s>]/i.test(html);
  if (hasHtmlTag || hasHeadTag || hasBodyTag)
    return false;
  const hasTemplateStyles = patches.styleBlocks?.some((block) => /^gl-tpl-/.test(block.id)) ?? false;
  const hasTemplateScripts = patches.scriptBlocks?.some((block) => /^(gl-tpl-|glmw-script-)/.test(block.id)) ?? false;
  const hasTemplateLinks = patches.linkBlocks?.some((block) => /^gl-design-system-font/.test(block.id)) ?? false;
  return hasTemplateStyles || hasTemplateScripts || hasTemplateLinks;
}
function applyPatches(html, patches, options) {
  let result = html;
  if (shouldWrapForTemplateImport(result, patches, options)) {
    result = `<html><head>
</head>
<body>
${result}
</body></html>`;
  }
  for (const rename of patches.classRenames) {
    const oldCls = escapeRegex2(rename.oldName);
    result = result.replace(
      new RegExp(`(class\\s*=\\s*")([^"]*\\b)${oldCls}(\\b[^"]*")`, "gi"),
      (m, pre, before, after) => pre + before + rename.newName + after
    );
    result = result.replace(
      new RegExp(`(class\\s*=\\s*')([^']*\\b)${oldCls}(\\b[^']*')`, "gi"),
      (m, pre, before, after) => pre + before + rename.newName + after
    );
    result = result.replace(
      new RegExp(`\\.${oldCls}\\b`, "g"),
      "." + rename.newName
    );
  }
  if (patches.linkEdits) {
    for (const edit of patches.linkEdits) {
      if (!edit.href)
        continue;
      const hrefPattern = escapeRegex2(edit.href).replace(/&/g, "(?:&amp;|&)");
      const linkPattern = new RegExp(
        `<link\\b[^>]*href\\s*=\\s*["']?${hrefPattern}["']?[^>]*/?>\\n?`,
        "i"
      );
      result = result.replace(linkPattern, () => edit.newOuterHTML ? edit.newOuterHTML + "\n" : "");
    }
  }
  const mapAfterRenames = buildElementMap(result);
  if (patches.moves && patches.moves.length > 0) {
    for (const mv of patches.moves) {
      const mapBeforeMove = buildElementMap(result);
      const source = mapBeforeMove.get(mv.sourcePath);
      if (!source)
        continue;
      const movedHtml = result.substring(source.openStart, source.closeEnd);
      const withoutSource = result.substring(0, source.openStart) + result.substring(source.closeEnd);
      const mapAfterSourceRemoval = buildElementMap(withoutSource);
      const parent = mapAfterSourceRemoval.get(mv.parentPath);
      if (!parent) {
        result = withoutSource;
        continue;
      }
      const childMap = /* @__PURE__ */ new Map();
      for (const [p, el] of mapAfterSourceRemoval) {
        if (p === mv.parentPath)
          continue;
        const parentPrefix = mv.parentPath ? mv.parentPath + "." : "";
        if (p.startsWith(parentPrefix) && !p.substring(parentPrefix.length).includes(".")) {
          const idx = parseInt(p.substring(parentPrefix.length), 10);
          childMap.set(idx, el);
        }
      }
      let insertPos;
      if (mv.position < 0 || mv.position >= childMap.size) {
        insertPos = parent.innerEnd;
      } else {
        const child = childMap.get(mv.position);
        insertPos = child ? child.openStart : parent.innerEnd;
      }
      result = withoutSource.substring(0, insertPos) + movedHtml + withoutSource.substring(insertPos);
    }
  }
  const deletionOps = [];
  for (const path of patches.deletions) {
    const info = mapAfterRenames.get(path);
    if (!info)
      continue;
    deletionOps.push({ start: info.openStart, end: info.closeEnd });
  }
  deletionOps.sort((a, b) => b.start - a.start);
  for (const op of deletionOps) {
    result = result.substring(0, op.start) + result.substring(op.end);
  }
  const mapAfterDeletions = buildElementMap(result);
  const sortedEls = [...patches.elements].sort((a, b) => {
    const ai = mapAfterDeletions.get(a.path)?.openStart ?? 0;
    const bi = mapAfterDeletions.get(b.path)?.openStart ?? 0;
    return bi - ai;
  });
  for (const patch of sortedEls) {
    const info = mapAfterDeletions.get(patch.path);
    if (!info)
      continue;
    if (patch.newTag) {
      if (info.innerEnd < info.closeEnd) {
        const closeTag = result.substring(info.innerEnd, info.closeEnd);
        const newClose = closeTag.replace(/<\/[a-zA-Z][a-zA-Z0-9-]*/i, "</" + patch.newTag);
        result = result.substring(0, info.innerEnd) + newClose + result.substring(info.closeEnd);
      }
      const openTag2 = result.substring(info.openStart, info.openEnd);
      const newOpen = openTag2.replace(/<[a-zA-Z][a-zA-Z0-9-]*/i, "<" + patch.newTag);
      result = result.substring(0, info.openStart) + newOpen + result.substring(info.openEnd);
      const lenDiff = newOpen.length - openTag2.length;
      info.openEnd += lenDiff;
      info.innerStart += lenDiff;
    }
    let openTag = result.substring(info.openStart, info.openEnd);
    if (patch.setAttrs) {
      for (const [attr, value] of Object.entries(patch.setAttrs)) {
        if (value === "") {
          openTag = removeAttrInTag(openTag, attr);
        } else {
          openTag = setAttrInTag(openTag, attr, value);
        }
      }
    }
    if (patch.removeAttrs) {
      for (const attr of patch.removeAttrs) {
        openTag = removeAttrInTag(openTag, attr);
      }
    }
    result = result.substring(0, info.openStart) + openTag + result.substring(info.openEnd);
    const openLenDiff = openTag.length - (info.openEnd - info.openStart);
    if (patch.innerHTML !== void 0) {
      const innerStart = info.innerStart + openLenDiff;
      const innerEnd = info.innerEnd + openLenDiff;
      result = result.substring(0, innerStart) + patch.innerHTML + result.substring(innerEnd);
    }
  }
  const mapForInsertions = buildElementMap(result);
  const sortedInsertions = [...patches.insertions].sort((a, b) => {
    const parentA = mapForInsertions.get(a.parentPath);
    const parentB = mapForInsertions.get(b.parentPath);
    return (parentB?.innerStart ?? 0) - (parentA?.innerStart ?? 0);
  });
  for (const ins of sortedInsertions) {
    const parent = mapForInsertions.get(ins.parentPath);
    if (!parent)
      continue;
    const childMap = /* @__PURE__ */ new Map();
    for (const [p, el] of mapForInsertions) {
      if (p === ins.parentPath)
        continue;
      const parentPrefix = ins.parentPath ? ins.parentPath + "." : "";
      if (p.startsWith(parentPrefix) && !p.substring(parentPrefix.length).includes(".")) {
        const idx = parseInt(p.substring(parentPrefix.length), 10);
        childMap.set(idx, el);
      }
    }
    let insertPos;
    if (ins.position < 0 || ins.position >= childMap.size) {
      insertPos = parent.innerEnd;
    } else {
      const child = childMap.get(ins.position);
      insertPos = child ? child.openStart : parent.innerEnd;
    }
    result = result.substring(0, insertPos) + ins.html + result.substring(insertPos);
  }
  if (patches.linkBlocks) {
    for (const link of patches.linkBlocks) {
      if (!link.outerHTML.trim())
        continue;
      const existingLinkPattern = new RegExp(
        `<link\\s[^>]*id\\s*=\\s*"${escapeRegex2(link.id)}"[^>]*/?>\\n?`,
        "i"
      );
      if (existingLinkPattern.test(result)) {
        result = result.replace(existingLinkPattern, link.outerHTML + "\n");
      } else {
        const firstStyleMatch = result.match(/<style[\s>]/i);
        if (firstStyleMatch && firstStyleMatch.index !== void 0) {
          result = result.substring(0, firstStyleMatch.index) + link.outerHTML + "\n" + result.substring(firstStyleMatch.index);
        } else {
          const headClose = result.indexOf("</head>");
          if (headClose !== -1) {
            result = result.substring(0, headClose) + link.outerHTML + "\n" + result.substring(headClose);
          } else {
            result = link.outerHTML + "\n" + result;
          }
        }
      }
    }
  }
  if (patches.removedStyleBlockIds) {
    for (const styleId of patches.removedStyleBlockIds) {
      const removePattern = new RegExp(
        `<style\\s+id\\s*=\\s*"${escapeRegex2(styleId)}"[^>]*>[\\s\\S]*?<\\/style>\\n?`,
        "i"
      );
      result = result.replace(removePattern, "");
    }
  }
  for (const block of patches.styleBlocks) {
    if (!block.css.trim())
      continue;
    const styleTag = `<style id="${block.id}">
${block.css}</style>`;
    const existingPattern = new RegExp(
      `<style\\s+id\\s*=\\s*"${escapeRegex2(block.id)}"[^>]*>[\\s\\S]*?<\\/style>`,
      "i"
    );
    if (existingPattern.test(result)) {
      result = result.replace(existingPattern, styleTag);
    } else if (block.id === "gl-design-system-variables") {
      const firstStyleMatch = result.match(/<style[\s>]/i);
      if (firstStyleMatch && firstStyleMatch.index !== void 0) {
        result = result.substring(0, firstStyleMatch.index) + styleTag + "\n" + result.substring(firstStyleMatch.index);
      } else {
        const headClose = result.indexOf("</head>");
        if (headClose !== -1) {
          result = result.substring(0, headClose) + styleTag + "\n" + result.substring(headClose);
        } else {
          result = styleTag + "\n" + result;
        }
      }
    } else {
      const headClose = result.indexOf("</head>");
      if (headClose !== -1) {
        result = result.substring(0, headClose) + styleTag + "\n" + result.substring(headClose);
      } else {
        const bodyMatch = result.match(/<body[\s>]/i);
        if (bodyMatch && bodyMatch.index !== void 0) {
          result = result.substring(0, bodyMatch.index) + styleTag + "\n" + result.substring(bodyMatch.index);
        } else {
          result = styleTag + "\n" + result;
        }
      }
    }
  }
  if (patches.userStyleEdits) {
    for (const edit of patches.userStyleEdits) {
      if (!edit.originalText?.trim() || !edit.newCss?.trim())
        continue;
      const originalTrimmed = edit.originalText.trim();
      const idx = result.indexOf(originalTrimmed);
      if (idx !== -1) {
        result = result.slice(0, idx) + edit.newCss + result.slice(idx + originalTrimmed.length);
        continue;
      }
      const styleRe = /(<style(?:\s[^>]*)?>)([\s\S]*?)(<\/style>)/gi;
      const normalizedOriginal = originalTrimmed.replace(/\s+/g, " ");
      let m;
      let replaced = false;
      while (!replaced && (m = styleRe.exec(result)) !== null) {
        if (m[2].trim().replace(/\s+/g, " ") === normalizedOriginal) {
          result = result.slice(0, m.index + m[1].length) + "\n" + edit.newCss + "\n" + result.slice(m.index + m[1].length + m[2].length);
          replaced = true;
        }
      }
    }
  }
  if (patches.scriptBlocks) {
    for (const block of patches.scriptBlocks) {
      if (!block.content.trim()) {
        const removePattern = new RegExp(
          `<script\\s+id\\s*=\\s*"${escapeRegex2(block.id)}"[^>]*>[\\s\\S]*?<\\/script>\\n?`,
          "i"
        );
        result = result.replace(removePattern, "");
        continue;
      }
      const scriptTag = `<script id="${block.id}">
${block.content}</script>`;
      const existingScriptPattern = new RegExp(
        `<script\\s+id\\s*=\\s*"${escapeRegex2(block.id)}"[^>]*>[\\s\\S]*?<\\/script>`,
        "i"
      );
      if (existingScriptPattern.test(result)) {
        result = result.replace(existingScriptPattern, scriptTag);
      } else {
        const bodyClose = result.indexOf("</body>");
        if (bodyClose !== -1) {
          result = result.substring(0, bodyClose) + scriptTag + "\n" + result.substring(bodyClose);
        } else {
          result += "\n" + scriptTag;
        }
      }
    }
  }
  return result;
}

// src/documentHost.ts
function splitFrontmatter(content) {
  const match = content.match(/^(---[\s\S]*?---\n?)/);
  return match ? { frontmatter: match[1], body: content.slice(match[1].length) } : { frontmatter: "", body: content };
}
var DocumentHost = class {
  constructor(options) {
    this.options = options;
    const dir = vscode4.Uri.joinPath(options.uri, "..");
    this.watcher = vscode4.workspace.createFileSystemWatcher(
      new vscode4.RelativePattern(dir, basename(options.uri.path))
    );
    this.disposables.push(
      this.watcher,
      this.watcher.onDidChange(() => void this.refreshFromDisk())
    );
  }
  /** Raw body with frontmatter removed — the patch baseline. */
  rawHtml = "";
  frontmatter = "";
  /** Full original file text, so a no-op save writes nothing. */
  fileText = "";
  dirty = false;
  watcher;
  disposables = [];
  suppressWatcher = false;
  /* ------------------------------------------------------------------ *
   * Paths
   * ------------------------------------------------------------------ */
  /** Workspace-relative path, which is what the core expects. */
  get relativePath() {
    const root = this.options.workspace.rootUri.path.replace(/\/+$/, "");
    const file = this.options.uri.path;
    return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : basename(file);
  }
  get extension() {
    const lower = this.options.uri.path.toLowerCase();
    if (lower.endsWith(".md"))
      return ".md";
    if (lower.endsWith(".mdx"))
      return ".mdx";
    if (lower.endsWith(".astro"))
      return ".astro";
    return ".html";
  }
  get isMarkdown() {
    return this.extension === ".md" || this.extension === ".mdx";
  }
  get isAstro() {
    return this.extension === ".astro";
  }
  /* ------------------------------------------------------------------ *
   * Open
   * ------------------------------------------------------------------ */
  /** Read the document and produce the `FILE_CONTENT` message. */
  async open() {
    const bytes = await vscode4.workspace.fs.readFile(this.options.uri);
    this.fileText = decodeUtf8(bytes);
    const { frontmatter, body } = splitFrontmatter(this.fileText);
    this.frontmatter = frontmatter;
    this.rawHtml = stripBrowserExtensionArtifacts(body);
    const injectScript = await this.buildInjectScript();
    const config = vscode4.workspace.getConfiguration("rachana");
    return {
      type: "FILE_CONTENT",
      content: this.rawHtml,
      rawHtml: this.rawHtml,
      filename: basename(this.options.uri.path),
      filePath: this.relativePath,
      injectScript,
      styleMode: config.get("styleMode", "class"),
      styleScope: config.get("styleScope", "local"),
      isMarkdown: this.isMarkdown,
      isAstro: this.isAstro
    };
  }
  /**
   * Build the script the canvas injects.
   *
   * `window.__GL_ORIGINAL_HTML` is the patch baseline the editor works against;
   * it is URI-encoded so arbitrary document content cannot break out of the
   * string literal.
   */
  async buildInjectScript() {
    const editor = await this.options.assets.readText("media/editor-inject.js");
    const encoded = encodeURIComponent(this.rawHtml);
    return `window.__GL_ORIGINAL_HTML = decodeURIComponent(${JSON.stringify(encoded)});
${editor}`;
  }
  /* ------------------------------------------------------------------ *
   * Save
   * ------------------------------------------------------------------ */
  async savePatches(patches, _styleScope) {
    if (!patches)
      return { ok: false, error: "No patches supplied" };
    try {
      const patched = applyPatches(this.rawHtml, patches, {
        allowDocumentScaffold: this.extension === ".html" || this.extension === ".htm"
      });
      this.rawHtml = patched;
      return await this.write(this.frontmatter + patched);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }
  async saveFull(content) {
    try {
      const clean = stripDisplayTransforms(content);
      this.rawHtml = clean;
      return await this.write(this.frontmatter + clean);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }
  async write(fileContent) {
    if (fileContent === this.fileText)
      return { ok: true };
    this.suppressWatcher = true;
    try {
      await this.options.workspace.writeText(this.relativePath, fileContent);
      this.fileText = fileContent;
      this.dirty = false;
      return { ok: true };
    } finally {
      setTimeout(() => {
        this.suppressWatcher = false;
      }, 600);
    }
  }
  /* ------------------------------------------------------------------ *
   * External changes
   * ------------------------------------------------------------------ */
  async refreshFromDisk() {
    if (this.suppressWatcher || this.dirty)
      return;
    const bytes = await vscode4.workspace.fs.readFile(this.options.uri);
    this.fileText = decodeUtf8(bytes);
  }
  /* ------------------------------------------------------------------ *
   * Remaining messages
   * ------------------------------------------------------------------ */
  /**
   * Handle the document-level messages this milestone does not yet implement.
   *
   * They are reported rather than silently ignored: a silently dropped message
   * looks like a broken feature, whereas an explicit notice tells the user what
   * is available. Each one maps to a core module that moves across in the next
   * milestone (see `docs/MIGRATION.md`).
   */
  async handle(msg, post) {
    switch (msg.type) {
      case "GET_FOLDER_FILES": {
        const dir = dirname(this.relativePath);
        const files = (await this.options.workspace.list(dir)).filter((entry) => entry.kind === "file").map((entry) => ({ name: entry.name, ext: entry.ext }));
        post({ type: "FOLDER_FILES_LIST", files });
        return;
      }
      case "OPEN_FILE":
        await vscode4.commands.executeCommand(
          "rachana.openVisualEditor",
          vscode4.Uri.joinPath(this.options.uri, "..", msg.filename)
        );
        return;
      case "CREATE_FILE": {
        const target = vscode4.Uri.joinPath(this.options.uri, "..", msg.filename);
        const exists = await this.options.workspace.exists(msg.filename);
        if (exists) {
          post({ type: "FILE_CREATE_ERROR", error: `File "${msg.filename}" already exists` });
          return;
        }
        await this.options.workspace.writeText(msg.filename, "");
        post({ type: "FILE_CREATED", filename: msg.filename });
        await vscode4.commands.executeCommand("rachana.openVisualEditor", target);
        return;
      }
      case "OPEN_CURRENT_FILE_IN_BROWSER":
        await vscode4.env.openExternal(this.options.uri);
        return;
      case "UPLOAD_IMAGE": {
        const picked = await this.options.workspace.pickAndImportFile({
          accept: ".png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.ico",
          targetDir: dirname(this.relativePath)
        });
        if (!picked)
          return;
        const url = await this.options.workspace.toDisplayUrl(picked.path);
        post({ type: "IMAGE_UPLOADED", relativePath: picked.name, webviewUri: url });
        return;
      }
      default:
        vscode4.window.showInformationMessage(
          `Rachana: "${msg.type}" is not wired up in this build yet.`
        );
        return;
    }
  }
  dispose() {
    for (const d of this.disposables)
      d.dispose();
  }
};
function stripDisplayTransforms(content) {
  return content.replace(/\s*data-gl-original-src="([^"]+)"\s+src="data:[^"]+"/gi, ' src="$1"').replace(/<!-- gl-original-link: (.+?) -->\s*<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>/g, "$1").replace(/<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>\s*/g, "").replace(/\s*<!--\s*gl-fm-css-start\s*-->[\s\S]*?<!--\s*gl-fm-css-end\s*-->\s*/g, "").replace(/\s*<base\b[^>]*data-gl-base="true"[^>]*>\s*/gi, "\n");
}

// src/rachanaPanel.ts
var RachanaPanel = class {
  constructor(context, uri, onDisposed) {
    this.context = context;
    this.uri = uri;
    this.onDisposed = onDisposed;
    const fileDir = vscode5.Uri.joinPath(uri, "..");
    const workspaceRoot = vscode5.workspace.getWorkspaceFolder(uri)?.uri ?? fileDir;
    this.panel = vscode5.window.createWebviewPanel(
      "rachanaEditor",
      `Rachana: ${uri.path.split("/").pop() ?? "document"}`,
      vscode5.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode5.Uri.joinPath(context.extensionUri, "dist"),
          vscode5.Uri.joinPath(context.extensionUri, "media"),
          fileDir,
          workspaceRoot
        ]
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
      secrets: new VsCodeSecrets(context)
    });
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, context.extensionUri);
    this.panel.webview.onDidReceiveMessage(
      (msg) => void this.handleMessage(msg),
      void 0,
      this.disposables
    );
    this.panel.onDidDispose(
      () => {
        this.onDisposed(this.uri.toString());
        this.document.dispose();
        for (const d of this.disposables)
          d.dispose();
      },
      void 0,
      this.disposables
    );
  }
  panel;
  workspace;
  assets;
  ops;
  document;
  disposables = [];
  ready = false;
  reveal() {
    this.panel.reveal();
  }
  dispose() {
    this.panel.dispose();
  }
  /* ------------------------------------------------------------------ *
   * Message handling
   * ------------------------------------------------------------------ */
  async handleMessage(msg) {
    if (!msg || typeof msg.type !== "string")
      return;
    try {
      switch (msg.type) {
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
        case "COPY_TO_CLIPBOARD": {
          await this.ops.writeClipboard(msg.text);
          this.ops.notify("Copied to clipboard", "success");
          return;
        }
        case "OPEN_EXTERNAL":
          this.ops.openExternal(msg.url);
          return;
        case "SET_CONFIG": {
          const config = vscode5.workspace.getConfiguration("rachana");
          if (msg.styleMode)
            await config.update("styleMode", msg.styleMode, vscode5.ConfigurationTarget.Global);
          if (msg.styleScope)
            await config.update("styleScope", msg.styleScope, vscode5.ConfigurationTarget.Global);
          if (msg.styleMode)
            this.post({ type: "CONFIG_CHANGE", styleMode: msg.styleMode });
          return;
        }
        case "LICENSE_GET_STATUS":
          this.post({
            type: "LICENSE_STATUS",
            license: {
              licenseKey: "RACHANA-FULL-EDITION",
              instanceId: "vscode",
              status: "active",
              expiresAt: null,
              activationLimit: 999,
              activation: 1,
              edition: "Full Edition"
            },
            machineId: "vscode"
          });
          return;
        case "CLOSE_PANEL":
          this.dispose();
          return;
        default:
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
  post(msg) {
    if (!RECEIVE_TYPES.has(msg.type)) {
      console.warn(`[Rachana] refusing to post unrecognised message type: ${msg.type}`);
      return;
    }
    void this.panel.webview.postMessage(msg);
  }
  /** True once the document has been delivered at least once. */
  get isReady() {
    return this.ready;
  }
};

// src/panel.ts
var RachanaPanelManager = class {
  constructor(context) {
    this.context = context;
  }
  panels = /* @__PURE__ */ new Map();
  /** Open (or reveal) the visual editor for a document. */
  open(uri) {
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
  disposeAll() {
    for (const panel of this.panels.values())
      panel.dispose();
    this.panels.clear();
  }
};

// src/extension.ts
function activate(context) {
  const panels = new RachanaPanelManager(context);
  context.subscriptions.push(
    vscode6.commands.registerCommand("rachana.openVisualEditor", (uri) => {
      const target = uri ?? vscode6.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode6.window.showErrorMessage("Select a file first, or run this from a file's context menu.");
        return;
      }
      if (!isSupported(target)) {
        void vscode6.window.showErrorMessage(
          `Rachana Designer opens ${SUPPORTED_EDITOR_EXTS.join(", ")} files.`
        );
        return;
      }
      panels.open(target);
    })
  );
  context.subscriptions.push({ dispose: () => panels.disposeAll() });
}
function deactivate() {
}
function isSupported(uri) {
  const lower = uri.path.toLowerCase();
  return SUPPORTED_EDITOR_EXTS.some((ext) => lower.endsWith(ext));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.cjs.map
