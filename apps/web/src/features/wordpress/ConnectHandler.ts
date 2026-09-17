/**
 * ConnectHandler — handles all CONNECT_* messages from the webview.
 * Orchestrates WordPress site management and the export pipeline.
 *
 * Browser port of the original VS Code extension handler. What changed:
 *  - VS Code APIs are gone. `send(msg)` is a plain callback (the host bus) and
 *    the edited document comes from `getSourcePath()` / `getHtml()`.
 *  - `globalState` / `SecretStorage` are gone. Sites live in `localStorage`
 *    under `rachana.wpSites` and each app password under
 *    `rachana.wp.<id>.appPassword`.
 *  - `node:fs` / `node:path` are gone. All file access goes through the
 *    `Workspace` abstraction (`readBinary`, `readText`, `exists`) and all path
 *    math through `@/platform/fs/types`.
 *  - `crypto.randomBytes` is gone (`crypto.getRandomValues`), and `Buffer` is
 *    gone (`bytesToBase64` / `bytesToDataUri`).
 *
 * The export pipeline itself — step order, progress accounting, block markup
 * and message shapes — is preserved from the original.
 *
 * SECURITY NOTE: browser storage is not encrypted. Application passwords are
 * kept in `localStorage` because a page has no equivalent of VS Code's
 * `SecretStorage`; anything running on this origin (or anyone with access to
 * this browser profile) can read them. That is a deliberate trade-off, not an
 * oversight.
 */

import { appConfig, readJson, readString, writeJson, writeString } from "@/platform/host/config";
import type { Workspace } from "@/platform/fs/types";
import { basename, bytesToDataUri, dirname, extname, joinPath, mimeForPath } from "@/platform/fs/types";
import type {
  ExportProgressInfo,
  ExportStep,
  ExternalAssetsMode,
  WPExportMode,
  WPExportTarget,
  WPPageInfo,
  WPSiteInfo,
} from "@/types/connect";
import type { HostToWebviewMessage, WebviewToHostMessage } from "@/types/hostMessages";
import {
  WordPressClient,
  describeWPError,
  fseOrigin,
  normalizeFseArea,
  type WPTransportMode,
} from "./WordPressClient";
import { convert, extractCssVariables, extractMediaUrls, replaceMediaUrls } from "./convert";
import { extractMarkdownMediaUrls, markdownHtmlToBlocks, replaceMarkdownMediaUrls } from "./markdownToBlocks";

const WP_SITES_KEY = "rachana.wpSites";

/** Per-site application password key. Documented in the file header. */
function wpPasswordKey(siteId: string): string {
  return `rachana.wp.${siteId}.appPassword`;
}

/** External <link rel=stylesheet> / <script src> reference found in the HTML. */
interface ExternalAssetRef {
  url: string;
  tag: string;
  remote: boolean;
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi;
const CSS_SKIP_REF_RE = /^(data:|blob:|https?:|\/\/|#)/i;
const FONT_MIME_FALLBACKS: Record<string, string> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

// Re-executes the preceding text/plain script after decoding HTML entities, so JS survives
// WordPress content filters that entity-encode bare "&" (convert_chars/kses). Must itself
// contain no "&", "<" or ">" characters.
const CORE_JS_LOADER =
  '(function(){var c=document.currentScript;if(!c){return;}' +
  'var p=c.previousElementSibling;if(!p){return;}' +
  'var t=document.createElement("textarea");t.innerHTML=p.textContent;' +
  'var s=document.createElement("script");s.textContent=t.value;' +
  'p.parentNode.replaceChild(s,p);c.parentNode.removeChild(c);})();';

interface FigmaFontEntry {
  fontFamily: string;
  fontStyle: string;
  fontFile: string;
}

const WEIGHT_TO_STYLE: Record<string, string> = {
  "100": "Thin",
  "200": "Extra Light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semi Bold",
  "700": "Bold",
  "800": "Extra Bold",
  "900": "Black",
};

/** The `site` payload of `CONNECT_ADD_SITE`. */
export interface ConnectSiteInput {
  label: string;
  url: string;
  username: string;
  appPassword: string;
  provider?: "greenshift" | "greenlight";
}

/**
 * Inbound `CONNECT_*` message.
 *
 * Structurally accepts every `CONNECT_*` variant declared in
 * `src/types/hostMessages.ts` (see `ConnectContractAccepted` at the bottom),
 * plus the original handler's extra knobs — `target` as a real `WPExportTarget`,
 * `fseKind`, `skipExistingMedia`, `exportFonts`, `uploadCssAssets` — which the
 * connect UI sends and the narrowed contract omits. Fields can be `undefined`
 * on the wire, so every read goes through a default in `handleMessage`.
 */
export interface ConnectInboundMessage {
  type:
    | "CONNECT_GET_SITES"
    | "CONNECT_ADD_SITE"
    | "CONNECT_REMOVE_SITE"
    | "CONNECT_TEST_SITE"
    | "CONNECT_GET_PAGES"
    | "CONNECT_GET_SITE_INFO"
    | "CONNECT_EXPORT"
    | "CONNECT_GENERATE_CODE"
    | "CONNECT_CANCEL_EXPORT";
  site?: ConnectSiteInput;
  siteId?: string;
  search?: string;
  pageId?: number | string | "new";
  pageTitle?: string;
  /** Either the export target string or the contract's routing label. */
  target?: WPExportTarget | "export" | "code";
  /** For target=="template-part" with pageId!="new": which FSE kind. */
  fseKind?: "site-template" | "template-part";
  exportMedia?: boolean;
  exportVariables?: boolean;
  convertToClasses?: boolean;
  wrapFullWidth?: boolean;
  externalAssetsMode?: string;
  skipExistingMedia?: boolean;
  exportFonts?: boolean;
  exportMode?: string;
  uploadCssAssets?: boolean;
}

/**
 * Outbound messages this handler emits.
 *
 * These are the original shapes verbatim. Four of them are deliberately wider
 * than the reconstructed `HostToWebviewMessage` members (`CONNECT_SITES_LIST`
 * and `CONNECT_SITE_ADDED` carry `WPSiteInfo` — never the password;
 * `CONNECT_PAGES_LIST` / `CONNECT_PAGES_ERROR` / `CONNECT_EXPORT_COMPLETE`
 * carry the real `WPExportTarget`; `CONNECT_EXPORT_COMPLETE.pageId` may be an
 * FSE `theme//slug`; `CONNECT_EXPORT_PROGRESS` carries `ExportProgressInfo`,
 * which is what the connect store and the progress UI actually read).
 */
export type ConnectHostMessage =
  | { type: "CONNECT_SITES_LIST"; sites: WPSiteInfo[] }
  | { type: "CONNECT_SITE_ADDED"; site: WPSiteInfo }
  | { type: "CONNECT_SITE_REMOVED"; siteId: string }
  | { type: "CONNECT_SITE_TEST_RESULT"; siteId: string; success: boolean; error?: string; siteName?: string }
  | { type: "CONNECT_PAGES_LIST"; siteId: string; pages: WPPageInfo[]; target: WPExportTarget }
  | { type: "CONNECT_PAGES_ERROR"; siteId: string; error: string; target: WPExportTarget }
  | { type: "CONNECT_SITE_INFO"; siteId: string; isBlockTheme: boolean; stylesheet: string }
  | { type: "CONNECT_EXPORT_PROGRESS"; progress: ExportProgressInfo }
  | { type: "CONNECT_EXPORT_COMPLETE"; pageUrl: string; pageId: number | string; target: WPExportTarget }
  | { type: "CONNECT_EXPORT_ERROR"; error: string }
  | { type: "CONNECT_EXPORT_CODE"; code: string };

export interface ConnectHandlerOptions {
  /** Host → UI message sink (the original `panel.webview.postMessage`). */
  send: (msg: HostToWebviewMessage) => void;
  /** Project filesystem, replacing `node:fs`. */
  workspace: Workspace;
  /** Workspace-relative path of the edited document (original `getFileUri().fsPath`). */
  getSourcePath: () => string;
  /** Current HTML of the edited document. */
  getHtml: () => string;
  /** Override `appConfig.wpTransport` (tests, per-panel settings). */
  transport?: WPTransportMode;
  /** Override `appConfig.wpProxyPrefix`. */
  proxyPrefix?: string;
  /** Diagnostics tap, in addition to the `[GL-Connect]` console logs. */
  onDebug?: (message: string) => void;
}

/** `crypto.randomBytes(n).toString("hex")`, browser edition. */
function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/**
 * The wire can carry the export target ("page" | "template" | "template-part"),
 * which is what the connect UI sends and what selects the REST collection, or
 * the routing label the host contract declares ("export" | "code"). Anything
 * that is not an FSE target lists pages.
 */
function resolveWpTarget(value: string | undefined): WPExportTarget {
  return value === "template" || value === "template-part" ? value : "page";
}

/** Narrow a wire value to the three modes the pipeline understands. */
function toExternalAssetsMode(value: string | undefined): ExternalAssetsMode {
  return value === "download" || value === "remove" ? value : "html_block";
}

/** Narrow a wire value to the three packaging modes the pipeline understands. */
function toExportMode(value: string | undefined): WPExportMode {
  return value === "gs_html" || value === "core_html" ? value : "blocks";
}

/**
 * Standalone text fetch for remote assets (external CSS/JS, Google Fonts CSS).
 * Kept out of `WordPressClient` because `CONNECT_GENERATE_CODE` can reach it
 * with no site selected at all. Same 15 s budget and redirect handling as the
 * original `fetchUrl`.
 */
async function fetchRemoteText(url: string, transport: WPTransportMode, proxyPrefix: string): Promise<string> {
  const target = transport === "proxy" && proxyPrefix.trim()
    ? `${proxyPrefix.trim().replace(/\/+$/, "")}/${url}`
    : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // No `User-Agent` header: browsers forbid it. The browser's own UA is a
    // modern one, so fonts.googleapis.com still returns woff2 @font-face rules.
    const res = await fetch(target, { signal: controller.signal, redirect: "follow" });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout fetching " + url);
    }
    if (err instanceof TypeError) {
      throw new Error("Cannot reach the site. Check the URL and your internet connection.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class ConnectHandler {
  private cancelExport = false;

  private readonly send: (msg: HostToWebviewMessage) => void;
  private readonly workspace: Workspace;
  private readonly getSourcePath: () => string;
  private readonly getHtml: () => string;
  private readonly transportOverride?: WPTransportMode;
  private readonly proxyPrefixOverride?: string;
  private readonly onDebug?: (message: string) => void;

  constructor(options: ConnectHandlerOptions) {
    this.send = options.send;
    this.workspace = options.workspace;
    this.getSourcePath = options.getSourcePath;
    this.getHtml = options.getHtml;
    this.transportOverride = options.transport;
    this.proxyPrefixOverride = options.proxyPrefix;
    this.onDebug = options.onDebug;
  }

  private isMarkdownFile(): boolean {
    const p = this.getSourcePath().toLowerCase();
    return p.endsWith(".md") || p.endsWith(".mdx");
  }

  /** Directory of the edited document, for resolving relative asset URLs. */
  private htmlDir(): string {
    return dirname(this.getSourcePath());
  }

  private debug(message: string, err?: unknown): void {
    if (err === undefined) console.error(`[GL-Connect] ${message}`);
    else console.error(`[GL-Connect] ${message}`, err);
    this.onDebug?.(err === undefined ? message : `${message} ${describeUnknown(err)}`);
  }

  private transportMode(): WPTransportMode {
    // "manual" (export the code and paste it yourself) never reaches the REST
    // client, so anything other than "proxy" is a direct request.
    const configured = this.transportOverride ?? appConfig.get().wpTransport;
    return configured === "proxy" ? "proxy" : "direct";
  }

  private proxyPrefix(): string {
    return this.proxyPrefixOverride ?? appConfig.get().wpProxyPrefix;
  }

  async handleMessage(msg: ConnectInboundMessage): Promise<void> {
    switch (msg.type) {
      case "CONNECT_GET_SITES":
        await this.getSites();
        break;
      case "CONNECT_ADD_SITE":
        if (msg.site) await this.addSite(msg.site);
        break;
      case "CONNECT_REMOVE_SITE":
        if (msg.siteId) await this.removeSite(msg.siteId);
        break;
      case "CONNECT_TEST_SITE":
        if (msg.siteId) await this.testSite(msg.siteId);
        break;
      case "CONNECT_GET_PAGES":
        if (msg.siteId) await this.getPages(msg.siteId, msg.search, resolveWpTarget(msg.target));
        break;
      case "CONNECT_GET_SITE_INFO":
        if (msg.siteId) await this.getSiteInfo(msg.siteId);
        break;
      case "CONNECT_EXPORT":
        if (msg.siteId) {
          await this.exportToSite(
            msg.siteId,
            msg.pageId ?? "new",
            msg.pageTitle,
            resolveWpTarget(msg.target),
            msg.exportMedia ?? false,
            msg.exportVariables ?? false,
            msg.convertToClasses ?? true,
            msg.wrapFullWidth ?? false,
            toExternalAssetsMode(msg.externalAssetsMode),
            msg.skipExistingMedia ?? true,
            msg.exportFonts ?? false,
            toExportMode(msg.exportMode),
            msg.uploadCssAssets ?? false,
            msg.fseKind
          );
        }
        break;
      case "CONNECT_GENERATE_CODE":
        await this.generateCodeOnly(
          toExportMode(msg.exportMode),
          toExternalAssetsMode(msg.externalAssetsMode),
          msg.convertToClasses ?? true
        );
        break;
      case "CONNECT_CANCEL_EXPORT":
        this.cancelExport = true;
        break;
    }
  }

  // ─── Site Management ─────────────────────────────────────────

  private async getSites(): Promise<void> {
    const sites = this.loadSites();
    const safeList: WPSiteInfo[] = sites.map((s) => ({
      id: s.id,
      label: s.label,
      url: s.url,
      username: s.username,
    }));
    this.emit({ type: "CONNECT_SITES_LIST", sites: safeList });
  }

  private async addSite(data: ConnectSiteInput): Promise<void> {
    const id = crypto.randomUUID();
    const site: WPSiteInfo = {
      id,
      label: data.label,
      url: data.url.replace(/\/+$/, ""),
      username: data.username,
    };

    // Save site info (never the password — that lives under its own key).
    const sites = this.loadSites();
    sites.push(site);
    await this.saveSites(sites);

    // Browser storage is not encrypted; see the file header.
    writeString(wpPasswordKey(id), data.appPassword);

    const safeInfo: WPSiteInfo = {
      id: site.id,
      label: site.label,
      url: site.url,
      username: site.username,
    };
    this.emit({ type: "CONNECT_SITE_ADDED", site: safeInfo });
  }

  private async removeSite(siteId: string): Promise<void> {
    let sites = this.loadSites();
    sites = sites.filter((s) => s.id !== siteId);
    await this.saveSites(sites);
    this.clearStoredPassword(siteId);
    this.emit({ type: "CONNECT_SITE_REMOVED", siteId });
  }

  private async testSite(siteId: string): Promise<void> {
    const sites = this.loadSites();
    const site = sites.find((s) => s.id === siteId);
    if (!site) {
      this.emit({ type: "CONNECT_SITE_TEST_RESULT", siteId, success: false, error: "Site not found" });
      return;
    }
    const appPassword = readString(wpPasswordKey(siteId));
    if (!appPassword) {
      this.emit({ type: "CONNECT_SITE_TEST_RESULT", siteId, success: false, error: "Application Password not found. Please remove this site and add it again." });
      return;
    }
    const client = this.makeClient(site, appPassword);
    const result = await client.testConnection();
    this.emit({ type: "CONNECT_SITE_TEST_RESULT", siteId, ...result });
  }

  // ─── Pages ───────────────────────────────────────────────────

  private async getPages(siteId: string, search?: string, target: WPExportTarget = "page"): Promise<void> {
    const client = await this.getClient(siteId);
    if (!client) {
      this.emit({ type: "CONNECT_PAGES_ERROR", siteId, error: "Site not found. Try removing and re-adding the site.", target });
      return;
    }
    try {
      let pageInfos: WPPageInfo[];
      if (target === "template-part") {
        const [parts, templates] = await Promise.all([
          client.getTemplateParts(search).catch(() => []),
          client.getSiteTemplates(search).catch(() => []),
        ]);
        const partInfos: WPPageInfo[] = parts.map((p) => ({
          id: p.id,
          title: p.title?.rendered || p.title?.raw || p.slug || "(No title)",
          slug: p.slug,
          status: p.status || "publish",
          modified: p.modified || "",
          kind: "template-part",
          area: normalizeFseArea(p.area),
          origin: fseOrigin(p.source),
        }));
        // Headers and footers are what a card is usually pushed into, so they lead.
        const areaRank = (a?: string) => (a === "header" ? 0 : a === "footer" ? 1 : 2);
        partInfos.sort((a, b) =>
          areaRank(a.area) - areaRank(b.area) || a.title.localeCompare(b.title)
        );
        const tplInfos: WPPageInfo[] = templates.map((p) => ({
          id: p.id,
          title: p.title?.rendered || p.title?.raw || p.slug || "(No title)",
          slug: p.slug,
          status: p.status || "publish",
          modified: p.modified || "",
          kind: "site-template",
          origin: fseOrigin(p.source),
        }));
        pageInfos = [...partInfos, ...tplInfos];
      } else {
        const pages = target === "template"
          ? await client.getTemplates(search)
          : await client.getPages(search);
        pageInfos = pages.map((p) => ({
          id: p.id,
          title: p.title?.rendered || p.title?.raw || "(No title)",
          slug: p.slug,
          status: p.status,
          modified: p.modified,
        }));
      }
      this.emit({ type: "CONNECT_PAGES_LIST", siteId, pages: pageInfos, target });
    } catch (err: unknown) {
      const message = describeWPError(
        err,
        `Failed to load ${target === "template" ? "templates" : target === "template-part" ? "template parts" : "pages"}`
      );
      this.debug("getPages — ERROR:", message);
      this.emit({ type: "CONNECT_PAGES_ERROR", siteId, error: message, target });
    }
  }

  private async getSiteInfo(siteId: string): Promise<void> {
    const client = await this.getClient(siteId);
    if (!client) {
      this.emit({ type: "CONNECT_SITE_INFO", siteId, isBlockTheme: false, stylesheet: "" });
      return;
    }
    try {
      const info = await client.getActiveTheme();
      this.emit({ type: "CONNECT_SITE_INFO", siteId, isBlockTheme: info.isBlockTheme, stylesheet: info.stylesheet });
    } catch {
      this.emit({ type: "CONNECT_SITE_INFO", siteId, isBlockTheme: false, stylesheet: "" });
    }
  }

  // ─── Generate Code (no site needed) ─────────────────────────

  private async generateCodeOnly(
    exportMode: WPExportMode = "blocks",
    externalAssetsMode: ExternalAssetsMode = "html_block",
    convertToClasses = true
  ): Promise<void> {
    try {
      const rawHtml = this.getHtml();
      if (!rawHtml) {
        this.emit({ type: "CONNECT_EXPORT_ERROR", error: "No HTML content to convert" });
        return;
      }
      let blockContent: string;
      if (exportMode === "gs_html" || exportMode === "core_html") {
        const htmlDir = this.htmlDir();
        blockContent = await this.buildSingleBlockContent(rawHtml, exportMode, externalAssetsMode, htmlDir);
      } else {
        blockContent = this.isMarkdownFile()
          ? markdownHtmlToBlocks(rawHtml)
          : convert(rawHtml, { editableClasses: convertToClasses });
      }
      this.emit({ type: "CONNECT_EXPORT_CODE", code: blockContent });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Code generation failed";
      this.emit({ type: "CONNECT_EXPORT_ERROR", error: message });
    }
  }

  // ─── Export Pipeline ─────────────────────────────────────────

  private async exportToSite(
    siteId: string,
    pageId: number | string | "new",
    pageTitle?: string,
    target: WPExportTarget = "page",
    exportMedia = false,
    exportVariables = false,
    convertToClasses = true,
    wrapFullWidth = false,
    externalAssetsMode: ExternalAssetsMode = "html_block",
    skipExistingMedia = true,
    exportFonts = false,
    exportMode: WPExportMode = "blocks",
    uploadCssAssets = false,
    fseKind?: "site-template" | "template-part"
  ): Promise<void> {
    this.cancelExport = false;
    const singleBlock = exportMode === "gs_html" || exportMode === "core_html";

    const client = await this.getClient(siteId);
    if (!client) {
      this.emit({ type: "CONNECT_EXPORT_ERROR", error: "Site not found" });
      return;
    }

    const totalSteps = 2 + (exportMedia ? 1 : 0) + (exportVariables ? 1 : 0) + (externalAssetsMode === "download" ? 1 : 0) + (exportFonts ? 1 : 0);
    let currentStep = 0;

    const sendProgress = (step: ExportStep, message: string) => {
      currentStep++;
      this.emit({
        type: "CONNECT_EXPORT_PROGRESS",
        progress: { step, totalSteps, currentStep, message },
      });
    };

    try {
      // Step 1: Parse HTML
      sendProgress("parsing", "Parsing HTML and CSS...");
      let rawHtml = this.getHtml();
      if (!rawHtml) {
        this.emit({ type: "CONNECT_EXPORT_ERROR", error: "No HTML content to export" });
        return;
      }

      // Optional: download Google Fonts and save them to GreenShift settings.
      // This must run before extractExternalAssets so the font <link> tags
      // are stripped from the HTML before the rest of the pipeline sees them.
      if (exportFonts) {
        const { fontUrls, cleanedHtml: htmlNoFonts } = this.extractGoogleFontLinks(rawHtml);
        if (fontUrls.length > 0) {
          sendProgress("saving_fonts", `Fetching ${fontUrls.length} Google Font stylesheet(s)...`);
          try {
            const fontEntries: FigmaFontEntry[] = [];
            for (const url of fontUrls) {
              try {
                const css = await this.fetchUrl(url, true);
                fontEntries.push(...this.parseGoogleFontCss(css));
              } catch (err) {
                this.debug(`Failed to fetch Google Font CSS: ${url}`, err);
              }
            }
            if (fontEntries.length > 0) {
              await this.saveFontsToSite(client, fontEntries);
            }
          } catch (err) {
            this.debug("Failed to save fonts to site:", err);
          }
          rawHtml = htmlNoFonts;
        }
      }

      const isMarkdown = this.isMarkdownFile();
      const htmlDir = this.htmlDir();
      let blockContent: string;

      if (singleBlock) {
        // Single-block modes serialize the HTML into JSON block attributes, so media URLs
        // must be swapped in the source HTML before the block is built.
        if (exportMedia) {
          sendProgress("uploading_media", "Finding media files...");
          const mediaUrls = extractMediaUrls(rawHtml);
          const urlMap = await this.uploadLocalFiles(client, mediaUrls, htmlDir, skipExistingMedia, false, (i, total, name) => {
            this.emit({
              type: "CONNECT_EXPORT_PROGRESS",
              progress: { step: "uploading_media", totalSteps, currentStep, message: `Uploading media ${i + 1} of ${total}: ${name}` },
            });
          });
          if (this.cancelExport) return;
          if (urlMap.size > 0) {
            rawHtml = replaceMediaUrls(rawHtml, urlMap);
          }
        }

        if (externalAssetsMode === "download") {
          sendProgress("downloading_assets", "Downloading external assets...");
        }

        // Files referenced from CSS url() (fonts, background images) are uploaded too;
        // files WordPress rejects (e.g. woff2) are embedded as data URIs up to 1 MB.
        const cssMediaMapper = exportMedia && uploadCssAssets
          ? (refs: string[]) => this.uploadLocalFiles(client, refs, htmlDir, skipExistingMedia, true)
          : undefined;
        blockContent = await this.buildSingleBlockContent(rawHtml, exportMode, externalAssetsMode, htmlDir, cssMediaMapper);
      } else {
        // Extract external stylesheets/scripts and remove them from HTML
        const { styles: extStyles, scripts: extScripts, cleanedHtml } = this.extractExternalAssets(rawHtml);
        let htmlToConvert = cleanedHtml;

        // "download" mode: fetch content and inject as inline <style>/<script> so
        // convert.js adds them to the GreenShift Style Manager block naturally
        if (externalAssetsMode === "download" && (extStyles.length > 0 || extScripts.length > 0)) {
          sendProgress("downloading_assets", `Downloading ${extStyles.length + extScripts.length} external asset(s)...`);
          const cssChunks: string[] = [];
          const jsChunks: string[] = [];

          for (const style of extStyles) {
            try {
              const css = await this.fetchUrl(style.url);
              cssChunks.push(`/* ${style.url} */\n${css}`);
            } catch (err) {
              this.debug(`Failed to fetch CSS: ${style.url}`, err);
            }
          }
          for (const script of extScripts) {
            try {
              const js = await this.fetchUrl(script.url);
              jsChunks.push(`/* ${script.url} */\n${js}`);
            } catch (err) {
              this.debug(`Failed to fetch JS: ${script.url}`, err);
            }
          }

          if (cssChunks.length > 0) {
            htmlToConvert = `<style>\n${cssChunks.join("\n\n")}\n</style>\n` + htmlToConvert;
          }
          if (jsChunks.length > 0) {
            htmlToConvert = `<script>\n${jsChunks.join("\n\n")}\n</script>\n` + htmlToConvert;
          }
        }

        blockContent = isMarkdown
          ? markdownHtmlToBlocks(htmlToConvert)
          : convert(htmlToConvert, { editableClasses: convertToClasses });

        // "html_block" mode: wrap original external tags as wp:html blocks
        // styles go before content, scripts go after
        if (externalAssetsMode === "html_block" && (extStyles.length > 0 || extScripts.length > 0)) {
          const styleBlocks = extStyles
            .map((s) => `<!-- wp:html -->\n${s.tag}\n<!-- /wp:html -->`)
            .join("\n");
          const scriptBlocks = extScripts
            .map((s) => `<!-- wp:html -->\n${s.tag}\n<!-- /wp:html -->`)
            .join("\n");
          if (styleBlocks) blockContent = styleBlocks + "\n" + blockContent;
          if (scriptBlocks) blockContent = blockContent + "\n" + scriptBlocks;
        }

        if (this.cancelExport) return;

        // Step 2: Upload media (optional)
        if (exportMedia) {
          sendProgress("uploading_media", "Finding media files...");
          const mediaUrls = isMarkdown ? extractMarkdownMediaUrls(rawHtml) : extractMediaUrls(rawHtml);
          const urlMap = await this.uploadLocalFiles(client, mediaUrls, htmlDir, skipExistingMedia, false, (i, total, name) => {
            this.emit({
              type: "CONNECT_EXPORT_PROGRESS",
              progress: {
                step: "uploading_media",
                totalSteps,
                currentStep,
                message: `Uploading media ${i + 1} of ${total}: ${name}`,
              },
            });
          });
          if (this.cancelExport) return;

          // Replace URLs in block content
          if (urlMap.size > 0) {
            blockContent = isMarkdown
              ? replaceMarkdownMediaUrls(blockContent, urlMap)
              : replaceMediaUrls(blockContent, urlMap);
          }
        }
      }

      if (this.cancelExport) return;

      // Step 3: Export variables (optional)
      // Extract CSS from style tags in the raw HTML
      const cssMatches = rawHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
      const combinedCss = cssMatches.map((s: string) => s.replace(/<\/?style[^>]*>/gi, "")).join("\n");
      const globalVariables = extractCssVariables(combinedCss);

      if (exportVariables && globalVariables.length > 0 && !isMarkdown) {
        sendProgress("exporting_variables", `Exporting ${globalVariables.length} CSS variables...`);

        const variables = globalVariables.map((v: { name: string; value: string }) => ({
          variable: v.name,
          variable_value: v.value,
          label: v.name.replace(/^--/, ""),
          value: `var(${v.name})`,
          group: "imported",
        }));

        try {
          await client.updateGlobalSettings({ variables });
        } catch (err) {
          // Non-fatal — continue with export
          this.debug("Failed to export variables:", err);
        }
      }

      if (this.cancelExport) return;

      if (wrapFullWidth && !isMarkdown && !singleBlock) {
        const sectionJson = JSON.stringify({"tag":"section","type":"inner","align":"full","isVariation":"section"})
          .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
        blockContent = `<!-- wp:greenshift-blocks/element ${sectionJson} -->\n<section class="alignfull">${blockContent}</section>\n<!-- /wp:greenshift-blocks/element -->`;
      }

      // Step 4: Create or update the selected destination
      const destinationLabel = target === "template"
        ? "template"
        : target === "template-part"
          ? (fseKind === "site-template" ? "site template" : "template part")
          : "page";
      sendProgress(
        "creating_page",
        pageId === "new" ? `Creating new ${destinationLabel}...` : `Updating ${destinationLabel}...`
      );

      let result: { id: number | string; link: string };
      if (target === "template-part") {
        if (pageId === "new") {
          // New FSE items always create a template part (site templates are tied to theme files
          // and need a proper area/slug — create-from-scratch via REST is restricted).
          const theme = (await client.getActiveTheme()).stylesheet;
          if (!theme) throw new Error("Could not determine active theme. The site may not be a block theme.");
          const title = pageTitle || "Imported from GreenLight";
          const slug = this.slugify(title) || `gl-part-${Date.now()}`;
          result = await client.createTemplatePart(slug, theme, title, blockContent);
        } else if (fseKind === "site-template") {
          result = await client.updateSiteTemplate(String(pageId), blockContent);
        } else {
          result = await client.updateTemplatePart(String(pageId), blockContent);
        }
      } else if (target === "template") {
        if (pageId === "new") {
          result = await client.createTemplate(pageTitle || "Imported from GreenLight", blockContent);
        } else {
          result = await client.updateTemplate(Number(pageId), blockContent);
        }
      } else {
        if (pageId === "new") {
          result = await client.createPage(pageTitle || "Imported from GreenLight", blockContent);
        } else {
          result = await client.updatePage(Number(pageId), blockContent);
        }
      }

      sendProgress("done", "Export complete!");
      this.emit({ type: "CONNECT_EXPORT_COMPLETE", pageUrl: result.link, pageId: result.id, target });
    } catch (err: unknown) {
      const message = describeWPError(err, "Export failed");
      this.emit({ type: "CONNECT_EXPORT_ERROR", error: message });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  private extractExternalAssets(html: string): {
    styles: Array<{ url: string; tag: string }>;
    scripts: Array<{ url: string; tag: string }>;
    cleanedHtml: string;
  } {
    const styles: Array<{ url: string; tag: string }> = [];
    const scripts: Array<{ url: string; tag: string }> = [];

    // External stylesheets
    const linkRe = /<link\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const attrs = m[1];
      if (/\brel=["']stylesheet["']/i.test(attrs)) {
        const hrefM = /\bhref=["'](https?:\/\/[^"'\s>]+)["']/i.exec(attrs);
        if (hrefM) styles.push({ url: hrefM[1], tag: m[0] });
      }
    }

    // External scripts
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    while ((m = scriptRe.exec(html)) !== null) {
      const attrs = m[1];
      const srcM = /\bsrc=["'](https?:\/\/[^"'\s>]+)["']/i.exec(attrs);
      if (srcM) scripts.push({ url: srcM[1], tag: m[0] });
    }

    let cleanedHtml = html;
    for (const asset of [...styles, ...scripts]) {
      cleanedHtml = cleanedHtml.split(asset.tag).join("");
    }

    return { styles, scripts, cleanedHtml };
  }

  // ─── Single-block export (gs_html / core_html) ───────────────
  // TypeScript port of the moodboard backend implementation
  // (backend/wordpress_export.py: _build_single_block_content and friends).

  /**
   * Like extractExternalAssets, but also captures relative (local) hrefs/srcs
   * and tags each asset with `remote`. Port of Python _extract_external_assets(include_relative=True).
   */
  private extractExternalAssetsFull(html: string): {
    styles: ExternalAssetRef[];
    scripts: ExternalAssetRef[];
    cleanedHtml: string;
  } {
    const styles: ExternalAssetRef[] = [];
    const scripts: ExternalAssetRef[] = [];

    const linkRe = /<link\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const attrs = m[1];
      if (!/\brel=["']stylesheet["']/i.test(attrs)) continue;
      const hrefM = /\bhref=["']([^"'\s>]+)["']/i.exec(attrs);
      if (!hrefM) continue;
      const url = hrefM[1];
      if (/^https?:\/\//i.test(url)) {
        styles.push({ url, tag: m[0], remote: true });
      } else if (!/^(data:|blob:|\/\/|#)/i.test(url)) {
        styles.push({ url, tag: m[0], remote: false });
      }
    }

    const scriptRe = /<script\b([^>]*)>[\s\S]*?<\/script>/gi;
    while ((m = scriptRe.exec(html)) !== null) {
      const srcM = /\bsrc=["']([^"'\s>]+)["']/i.exec(m[1]);
      if (!srcM) continue;
      const url = srcM[1];
      if (/^https?:\/\//i.test(url)) {
        scripts.push({ url, tag: m[0], remote: true });
      } else if (!/^(data:|blob:|\/\/|#)/i.test(url)) {
        scripts.push({ url, tag: m[0], remote: false });
      }
    }

    let cleanedHtml = html;
    for (const asset of [...styles, ...scripts]) {
      cleanedHtml = cleanedHtml.split(asset.tag).join("");
    }
    return { styles, scripts, cleanedHtml };
  }

  /** Python urljoin equivalent, good enough for CSS refs against http(s) or relative bases. */
  private urlJoin(base: string, ref: string): string {
    if (/^https?:\/\//i.test(base)) {
      try {
        return new URL(ref, base).toString();
      } catch {
        return ref;
      }
    }
    if (ref.startsWith("/")) return ref;
    const dir = dirname(base.split("#")[0].split("?")[0]);
    return joinPath(dir, ref);
  }

  /**
   * Makes url() refs inside an inlined stylesheet resolve from the HTML document instead of the
   * (now gone) CSS file location: "css/system.css" + url(fonts/a.woff2) -> css/fonts/a.woff2.
   */
  private rewriteCssUrls(cssText: string, baseUrl: string): string {
    return cssText.replace(CSS_URL_RE, (whole, quote: string, ref: string) => {
      if (CSS_SKIP_REF_RE.test(ref)) return whole;
      return `url(${quote}${this.urlJoin(baseUrl, ref)}${quote})`;
    });
  }

  private extractCssAssetRefs(cssText: string): string[] {
    const refs: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(cssText)) !== null) {
      const ref = m[2];
      if (CSS_SKIP_REF_RE.test(ref) || seen.has(ref)) continue;
      seen.add(ref);
      refs.push(ref);
    }
    return refs;
  }

  private applyCssUrlMap(cssText: string, urlMap: Map<string, string>): string {
    return cssText.replace(CSS_URL_RE, (whole, quote: string, ref: string) => {
      const replacement = urlMap.get(ref);
      return replacement ? `url(${quote}${replacement}${quote})` : whole;
    });
  }

  /**
   * Resolve a relative URL from the edited document to a file in the workspace.
   * Tries the raw URL first (matches the historical media-upload behavior),
   * then a query/hash-stripped, percent-decoded variant.
   */
  private async resolveLocalAssetPath(url: string, htmlDir: string): Promise<string | null> {
    if (/^(https?:|data:|blob:|\/\/|#)/i.test(url)) return null;
    try {
      const direct = joinPath(htmlDir, url);
      if (await this.workspace.exists(direct)) return direct;
      let clean = url.split("#")[0].split("?")[0];
      try {
        clean = decodeURIComponent(clean);
      } catch {
        // keep as-is
      }
      const stripped = joinPath(htmlDir, clean);
      return (await this.workspace.exists(stripped)) ? stripped : null;
    } catch {
      return null;
    }
  }

  private async readLocalAsset(url: string, htmlDir: string): Promise<string | null> {
    const filePath = await this.resolveLocalAssetPath(url, htmlDir);
    if (!filePath) return null;
    try {
      return await this.workspace.readText(filePath);
    } catch {
      return null;
    }
  }

  /** Python's str.encode("ascii", "xmlcharrefreplace"): non-ASCII -> decimal numeric entities. */
  private toAsciiEntities(text: string): string {
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0) as number;
      out += cp > 0x7f ? `&#${cp};` : ch;
    }
    return out;
  }

  /**
   * Mirrors WordPress serialize_block_attributes() escaping so the JSON survives inside an HTML comment.
   * ensure_ascii-style \uXXXX escaping keeps emoji/unicode out of post_content so wp_encode_emoji
   * can't corrupt the attributes.
   */
  private wpBlockAttrs(attrs: Record<string, unknown>): string {
    let encoded = JSON.stringify(attrs).replace(/[\u007f-\uffff]/g, (ch) =>
      "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")
    );
    encoded = encoded.split("--").join("\\u002d\\u002d");
    encoded = encoded.split("<").join("\\u003c");
    encoded = encoded.split(">").join("\\u003e");
    encoded = encoded.split("&").join("\\u0026");
    encoded = encoded.split('\\"').join("\\u0022");
    return encoded;
  }

  /**
   * Loads kept external assets from customJs — raw <link>/<script src> tags in the GS block
   * markup get mutated by WP content filters and break block validation.
   */
  private gsAssetLoader(cssUrls: string[], jsUrls: string[]): string {
    if (cssUrls.length === 0 && jsUrls.length === 0) return "";
    const parts = ["(function(){var d=document,h=d.head;"];
    if (cssUrls.length > 0) {
      parts.push(
        "var c=" + JSON.stringify(cssUrls) + ";" +
        'for(var i=0;i<c.length;i++){var l=d.createElement("link");l.rel="stylesheet";l.href=c[i];h.appendChild(l);}'
      );
    }
    if (jsUrls.length > 0) {
      parts.push(
        "var j=" + JSON.stringify(jsUrls) + ";" +
        'for(var k=0;k<j.length;k++){var s=d.createElement("script");s.src=j[k];s.async=false;h.appendChild(s);}'
      );
    }
    parts.push("})();");
    return parts.join("");
  }

  /**
   * Build the whole page as a single block. Port of Python _build_single_block_content.
   * - "gs_html": one wp:greenshift-blocks/element (type "html") — CSS into styleAttributes.customCSS_Extra,
   *   JS into customJs.
   * - "core_html": one wp:html block with embedded <style>/<script>, wrapped in a full-width wp:group.
   */
  private async buildSingleBlockContent(
    rawHtml: string,
    exportMode: "gs_html" | "core_html",
    externalAssetsMode: ExternalAssetsMode,
    htmlDir: string,
    cssMediaMapper?: (refs: string[]) => Promise<Map<string, string>>
  ): Promise<string> {
    const { styles, scripts, cleanedHtml } = this.extractExternalAssetsFull(rawHtml || "");
    const assetsMode: ExternalAssetsMode = ["html_block", "download", "remove"].includes(externalAssetsMode)
      ? externalAssetsMode
      : "html_block";
    const remoteStyles = styles.filter((s) => s.remote);
    const remoteScripts = scripts.filter((s) => s.remote);
    const cssChunks: string[] = [];
    const jsChunks: string[] = [];

    if (assetsMode === "download") {
      for (const item of remoteStyles) {
        try {
          const fetched = this.rewriteCssUrls(await this.fetchUrl(item.url), item.url);
          cssChunks.push(`/* ${item.url} */\n${fetched}`);
        } catch (err) {
          this.debug(`Failed to fetch CSS: ${item.url}`, err);
        }
      }
      for (const item of remoteScripts) {
        try {
          jsChunks.push(`/* ${item.url} */\n${await this.fetchUrl(item.url)}`);
        } catch (err) {
          this.debug(`Failed to fetch JS: ${item.url}`, err);
        }
      }
    }

    // Relative links point at files next to the exported HTML document — they can never
    // resolve on the WordPress site, so inline them from disk regardless of assets mode.
    for (const item of styles.filter((s) => !s.remote)) {
      const text = await this.readLocalAsset(item.url, htmlDir);
      if (text !== null) {
        cssChunks.push(`/* ${item.url} */\n${this.rewriteCssUrls(text.trim(), item.url)}`);
      } else {
        cssChunks.push(`/* ${item.url} — local file not found, link removed */`);
      }
    }
    for (const item of scripts.filter((s) => !s.remote)) {
      const text = await this.readLocalAsset(item.url, htmlDir);
      if (text !== null) {
        jsChunks.push(`/* ${item.url} */\n${text.trim()}`);
      }
    }

    // Move inline <style> text into the CSS chunks and inline (non-src) <script> text
    // into the JS chunks, removing the tags from the markup.
    let markup = cleanedHtml;
    markup = markup.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_whole, css: string) => {
      if (css.trim()) cssChunks.push(css.trim());
      return "";
    });
    markup = markup.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs: string, js: string) => {
      if (/\bsrc\s*=/i.test(attrs)) return whole; // src'd scripts (data:/blob:) stay in the markup
      if (js.trim()) jsChunks.push(js.trim());
      return "";
    });
    // HTML comments would collide with block delimiter comments, so drop them from the markup section.
    markup = markup.replace(/<!--[\s\S]*?-->/g, "");

    // Extract the body children (or strip document wrappers when there is no <body>).
    const bodyM = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(markup);
    if (bodyM) {
      markup = bodyM[1];
    } else {
      markup = markup
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?html\b[^>]*>/gi, "")
        .replace(/<\/?body\b[^>]*>/gi, "");
    }
    let htmlSection = markup.trim();

    if (assetsMode === "html_block" && exportMode === "core_html") {
      const linkTags = remoteStyles.map((s) => s.tag).join("\n");
      const scriptTags = remoteScripts.map((s) => s.tag).join("\n");
      if (linkTags) htmlSection = linkTags + "\n" + htmlSection;
      if (scriptTags) htmlSection = htmlSection + "\n" + scriptTags;
    }

    // ASCII-only markup: non-ASCII becomes numeric entities and every "&" is already an entity,
    // so WordPress save/display filters (kses entity normalization, convert_chars, wp_encode_emoji)
    // can't mutate the stored HTML — critical for GS block validation (textContent must match).
    htmlSection = this.toAsciiEntities(htmlSection);

    let css = cssChunks.join("\n\n").trim();
    let js = jsChunks.join("\n\n").trim();

    if (css && cssMediaMapper) {
      const refs = this.extractCssAssetRefs(css);
      if (refs.length > 0) {
        const mapping = await cssMediaMapper(refs);
        if (mapping && mapping.size > 0) {
          css = this.applyCssUrlMap(css, mapping);
        }
      }
    }

    if (assetsMode === "html_block" && exportMode !== "core_html") {
      const loader = this.gsAssetLoader(remoteStyles.map((s) => s.url), remoteScripts.map((s) => s.url));
      if (loader) {
        js = `${loader}\n\n${js}`.trim();
      }
    }

    if (exportMode === "core_html") {
      const parts = ['<!-- wp:html {"align":"full"} -->'];
      if (css) parts.push(`<style data-wp-block-html="css">\n${css}\n</style>`);
      if (htmlSection) parts.push(htmlSection);
      if (js) {
        // Scripts go after the markup (like end-of-body scripts) and are shipped inert as
        // text/plain: the loader entity-decodes and re-executes them, undoing any "&" mangling.
        parts.push(`<script type="text/plain" data-wp-block-html="js">\n${js}\n</script>`);
        parts.push(`<script data-wp-block-html="js-loader">${CORE_JS_LOADER}</script>`);
      }
      parts.push("<!-- /wp:html -->");
      const inner = parts.join("\n");
      return (
        '<!-- wp:group {"align":"full","layout":{"type":"default"}} -->\n' +
        `<div class="wp-block-group alignfull">${inner}</div>\n` +
        "<!-- /wp:group -->"
      );
    }

    const localId = "gsbp-" + randomHex(4).slice(0, 7);
    const attrs: Record<string, unknown> = {
      id: localId,
      textContent: htmlSection,
      type: "html",
      localId,
      align: "full",
    };
    if (css) attrs.styleAttributes = { customCSS_Extra: css };
    if (js) {
      attrs.customJs = js;
      attrs.customJsEnabled = true;
    }
    return (
      `<!-- wp:greenshift-blocks/element ${this.wpBlockAttrs(attrs)} -->\n` +
      `<div class="${localId} alignfull">${htmlSection}</div>\n` +
      "<!-- /wp:greenshift-blocks/element -->"
    );
  }

  /**
   * Upload local files referenced by relative URLs and return oldUrl -> newUrl.
   * Port of Python _upload_local_files: shared by the media step and the CSS url() step.
   * With allowDataUri, files WordPress refuses to host (fonts, svg, ...) are embedded
   * as data: URIs when they are at most 1,000,000 bytes.
   */
  private async uploadLocalFiles(
    client: WordPressClient,
    urls: string[],
    htmlDir: string,
    skipExistingMedia: boolean,
    allowDataUri: boolean,
    onProgress?: (index: number, total: number, name: string) => void
  ): Promise<Map<string, string>> {
    const urlMap = new Map<string, string>();
    for (let i = 0; i < urls.length; i++) {
      if (this.cancelExport) break;
      const localUrl = urls[i];
      onProgress?.(i, urls.length, basename(localUrl));
      try {
        const filePath = await this.resolveLocalAssetPath(localUrl, htmlDir);
        if (!filePath) continue;
        const filename = basename(filePath);
        const ext = extname(filePath).toLowerCase();
        let mimeType = mimeForPath(filePath);
        if (mimeType === "application/octet-stream" && FONT_MIME_FALLBACKS[ext]) {
          mimeType = FONT_MIME_FALLBACKS[ext];
        }
        if (skipExistingMedia) {
          const existingUrl = await client.findMediaByFilename(filename);
          if (existingUrl) {
            urlMap.set(localUrl, existingUrl);
            continue;
          }
        }
        const bytes = await this.workspace.readBinary(filePath);
        try {
          const result = await client.uploadMedia(filename, bytes, mimeType);
          if (result.source_url) {
            urlMap.set(localUrl, result.source_url);
            continue;
          }
        } catch (err) {
          // Skip failed uploads but continue
          this.debug(`Failed to upload ${localUrl}:`, err);
        }
        // WP blocks some upload types by default (fonts, svg) — embed small files instead.
        if (allowDataUri && bytes.length <= 1_000_000) {
          urlMap.set(localUrl, bytesToDataUri(bytes, mimeType));
        }
      } catch (err) {
        this.debug(`Failed to process ${localUrl}:`, err);
        continue;
      }
    }
    return urlMap;
  }

  /**
   * Fetch a remote document as text, honouring the configured CORS transport.
   * Kept on the handler (not only on the client) because the single-block code
   * path can be reached with no site selected.
   */
  private fetchUrl(url: string, browserUa = false): Promise<string> {
    // `browserUa` mirrored the original's Chrome UA for Google Fonts; a browser
    // cannot set `User-Agent`, so the flag is accepted and ignored.
    void browserUa;
    return fetchRemoteText(url, this.transportMode(), this.proxyPrefix());
  }

  // ─── Google Fonts helpers ────────────────────────────────────

  /**
   * Find <link rel="stylesheet" href="https://fonts.googleapis.com/...">
   * tags in the HTML and return their URLs, plus the HTML with those tags removed.
   */
  private extractGoogleFontLinks(html: string): { fontUrls: string[]; cleanedHtml: string } {
    const fontUrls: string[] = [];
    const tags: string[] = [];
    const linkRe = /<link\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const attrs = m[1];
      const hrefM = /\bhref=["']([^"']+)["']/i.exec(attrs);
      if (!hrefM) continue;
      const href = hrefM[1];
      if (/(?:^|\/\/)fonts\.googleapis\.com\/css/i.test(href)) {
        fontUrls.push(href);
        tags.push(m[0]);
      }
    }
    let cleanedHtml = html;
    for (const tag of tags) {
      cleanedHtml = cleanedHtml.split(tag).join("");
    }
    return { fontUrls, cleanedHtml };
  }

  /**
   * Parse the CSS returned by fonts.googleapis.com into a list of figma_fonts entries.
   * Picks one file URL per (font-family, weight, italic) combination.
   */
  private parseGoogleFontCss(css: string): FigmaFontEntry[] {
    const entries: FigmaFontEntry[] = [];
    const seen = new Set<string>();
    const blockRe = /@font-face\s*\{([\s\S]*?)\}/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(css)) !== null) {
      const block = m[1];
      const familyM = /font-family\s*:\s*['"]?([^;'"]+?)['"]?\s*;/i.exec(block);
      const weightM = /font-weight\s*:\s*([0-9]+)\s*;/i.exec(block);
      const styleM = /font-style\s*:\s*([a-zA-Z]+)\s*;/i.exec(block);
      const srcM = /src\s*:[^;]*url\(([^)]+)\)\s*format\(['"]?(woff2|woff|truetype|opentype)['"]?\)/i.exec(block);
      if (!familyM || !srcM) continue;

      const family = familyM[1].trim();
      const weight = weightM ? weightM[1] : "400";
      const isItalic = styleM ? /italic|oblique/i.test(styleM[1]) : false;
      const fileUrl = srcM[1].trim().replace(/^['"]|['"]$/g, "");

      const key = `${family}::${weight}::${isItalic ? "i" : "n"}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const baseStyle = WEIGHT_TO_STYLE[weight] || "Regular";
      const fontStyle = isItalic ? `${baseStyle} Italic` : baseStyle;

      entries.push({ fontFamily: family, fontStyle, fontFile: fileUrl });
    }
    return entries;
  }

  /**
   * GET current GS figma_settings, merge in the new figma_fonts (deduped by
   * fontFamily + fontStyle, preserving existing entries), POST back.
   *
   * `newFonts[].fontFile` is a remote Google Fonts URL — the GreenShift WP
   * plugin downloads each file server-side into /uploads/GreenShift/ when
   * figma_fonts is received, so we just forward the URL as-is.
   *
   * The plugin has a bug: it saves the file under /uploads/GreenShift/ but
   * stores the URL under /uploads/YYYY/MM/, leaving a broken Download link
   * and missing @font-face src. After the first POST we read `localfont` /
   * `localfontcss` back and rewrite the URLs to point at /uploads/GreenShift/.
   */
  private async saveFontsToSite(client: WordPressClient, newFonts: FigmaFontEntry[]): Promise<void> {
    type GsSettings = {
      colours?: Record<string, unknown>;
      elements?: Record<string, unknown>;
      figma_fonts?: FigmaFontEntry[];
      localfont?: string;
      localfontcss?: string;
    };
    let existing: GsSettings = {};
    try {
      const resp = await client.getFigmaSettings<{ settings?: GsSettings }>();
      existing = (resp && resp.settings) || {};
    } catch (err) {
      this.debug("Failed to read existing figma_settings, will overwrite fonts only:", err);
    }
    const merged: FigmaFontEntry[] = [...(existing.figma_fonts || [])];
    const seen = new Set(merged.map((f) => `${f.fontFamily}::${f.fontStyle}`));
    for (const f of newFonts) {
      const key = `${f.fontFamily}::${f.fontStyle}`;
      if (!seen.has(key)) {
        merged.push(f);
        seen.add(key);
      }
    }
    await client.updateGlobalSettings({
      colours: existing.colours || {},
      elements: existing.elements || {},
      figma_fonts: merged,
    });

    await this.fixGreenShiftFontUrls(client, newFonts);
  }

  /**
   * Workaround for a GreenShift plugin bug: after `figma_settings` POST the
   * downloaded woff2 lives at /uploads/GreenShift/<file> but `localfont` and
   * `localfontcss` reference /uploads/YYYY/MM/<file>. Rewrite both to point
   * at the actual file location.
   */
  private async fixGreenShiftFontUrls(client: WordPressClient, newFonts: FigmaFontEntry[]): Promise<void> {
    type GsSettings = { localfont?: string; localfontcss?: string };
    let after: GsSettings;
    try {
      const resp = await client.getFigmaSettings<{ settings?: GsSettings }>();
      after = (resp && resp.settings) || {};
    } catch (err) {
      this.debug("Could not read settings to patch font URLs:", err);
      return;
    }

    let localFontMap: Record<string, Record<string, string>> = {};
    if (typeof after.localfont === "string" && after.localfont) {
      try {
        const parsed = JSON.parse(after.localfont);
        if (parsed && typeof parsed === "object") localFontMap = parsed;
      } catch {
        return;
      }
    } else if (after.localfont && typeof after.localfont === "object") {
      localFontMap = after.localfont as Record<string, Record<string, string>>;
    }

    const targetFamilies = new Set(newFonts.map((f) => f.fontFamily));
    const replacements = new Map<string, string>();
    let changed = false;

    for (const family of Object.keys(localFontMap)) {
      if (!targetFamilies.has(family)) continue;
      const exts = localFontMap[family];
      if (!exts || typeof exts !== "object") continue;
      for (const ext of Object.keys(exts)) {
        const url = exts[ext];
        if (typeof url !== "string" || !url) continue;
        const fixed = this.rewriteToGreenShiftUploads(url);
        if (fixed && fixed !== url) {
          exts[ext] = fixed;
          replacements.set(url, fixed);
          changed = true;
        }
      }
    }

    if (!changed) return;

    let css = typeof after.localfontcss === "string" ? after.localfontcss : "";
    for (const [from, to] of replacements) {
      css = css.split(from).join(to);
    }

    try {
      await client.updateGlobalSettings({
        localfont: JSON.stringify(localFontMap),
        localfontcss: css,
      });
    } catch (err) {
      this.debug("Failed to patch GreenShift font URLs:", err);
    }
  }

  /**
   * If `url` looks like `<base>/wp-content/uploads/<subdir>/<file.ext>`,
   * return the same URL with `<subdir>` replaced by `GreenShift`. Otherwise
   * return null (so callers know not to overwrite).
   */
  private rewriteToGreenShiftUploads(url: string): string | null {
    const m = /^(.*\/uploads\/)([^?#]+\/)?([^/?#]+\.(?:woff2|woff|ttf|otf|tiff))(\?.*)?$/i.exec(url);
    if (!m) return null;
    const base = m[1];
    const file = m[3];
    const query = m[4] || "";
    return `${base}GreenShift/${file}${query}`;
  }

  // ─── Site storage (localStorage) ─────────────────────────────

  private loadSites(): WPSiteInfo[] {
    const sites = readJson<WPSiteInfo[]>(WP_SITES_KEY, []);
    return Array.isArray(sites) ? sites : [];
  }

  private async saveSites(sites: WPSiteInfo[]): Promise<void> {
    // The app password lives under its own key, never in the site list.
    writeJson(WP_SITES_KEY, sites);
  }

  private clearStoredPassword(siteId: string): void {
    try {
      localStorage.removeItem(wpPasswordKey(siteId));
    } catch {
      /* storage unavailable */
    }
  }

  private makeClient(site: WPSiteInfo, appPassword: string): WordPressClient {
    return new WordPressClient({
      siteUrl: site.url,
      username: site.username,
      appPassword,
      transport: this.transportMode(),
      proxyPrefix: this.proxyPrefix(),
      onDebug: this.onDebug,
    });
  }

  private async getClient(siteId: string): Promise<WordPressClient | null> {
    const sites = this.loadSites();
    const site = sites.find((s) => s.id === siteId);
    if (!site) return null;

    // Retrieve the app password from browser storage.
    const appPassword = readString(wpPasswordKey(siteId));
    if (!appPassword) {
      this.debug(`App password not found in localStorage for site ${siteId}`);
      return null;
    }

    return this.makeClient(site, appPassword);
  }

  /**
   * Send one of this handler's messages to the UI.
   *
   * The outbound shapes above are the original ones (the connect store and the
   * progress UI read `ExportProgressInfo` / `WPExportTarget` / FSE string ids),
   * while `HostToWebviewMessage` narrows some of those same members. The cast
   * is erased at runtime, so the UI keeps receiving the richer original
   * payloads; see `ConnectHostMessage`.
   */
  private emit(msg: ConnectHostMessage): void {
    this.send(msg as unknown as HostToWebviewMessage);
  }

  dispose(): void {
    this.cancelExport = true;
  }
}

function describeUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : String(err);
}

/**
 * Compile-time proof that every `CONNECT_*` variant declared in the host
 * contract (`src/types/hostMessages.ts`) is accepted by `handleMessage`.
 * `true` here means the webview can hand its messages over as-is.
 */
export type ConnectContractAccepted =
  Extract<WebviewToHostMessage, { type: `CONNECT_${string}` }> extends ConnectInboundMessage ? true : false;
