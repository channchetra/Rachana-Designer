/**
 * WordPress REST API Client — browser build.
 *
 * Handles authentication, pages, media uploads, and GreenShift settings.
 *
 * Rewritten from the original extension's Node `http`/`https` version to the
 * browser `fetch` API:
 *  - `request()` / `uploadFile()` / `fetchUrl()` use `fetch` + `AbortController`
 *    with the original timeout budgets (30 s, 120 s, 15 s).
 *  - Basic auth is built without `Buffer`, UTF-8 safe.
 *  - Media uploads go through `FormData` + `Blob` so the browser sets
 *    `Content-Type` and the multipart boundary (and `Content-Length`) itself.
 *  - A CORS transport layer can prefix every absolute request URL with a
 *    user-supplied proxy, because a browser cannot call a stock WordPress site
 *    cross-origin (`Authorization: Basic` forces a preflight that the site's
 *    missing `Access-Control-Allow-*` headers reject).
 *
 * Endpoints, query parameters, request bodies and response-field consumption
 * are unchanged from the original; see the endpoint list in each method.
 */

import { extname } from "@/platform/fs/types";

const GREENSHIFT_NAMESPACE = "greenshift/v1";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const FETCH_URL_TIMEOUT_MS = 15_000;

/** How the client reaches the site. `proxy` prefixes every absolute URL. */
export type WPTransportMode = "direct" | "proxy";

export interface WordPressClientOptions {
  siteUrl: string;
  username: string;
  appPassword: string;
  /** Defaults to `"direct"`. */
  transport?: WPTransportMode;
  /** Required for `transport: "proxy"`, e.g. `https://cors.example.com/`. */
  proxyPrefix?: string;
  /** Diagnostics tap; the original wrote these to `console.error`. */
  onDebug?: (message: string) => void;
}

/* ------------------------------------------------------------------ *
 * REST response shapes (the original imported these from `./types`)
 * ------------------------------------------------------------------ */

export interface WPPage {
  id: number;
  title: { rendered?: string; raw?: string };
  slug: string;
  status?: string;
  link?: string;
  modified?: string;
}

export interface WPMediaUploadResult {
  id: number;
  source_url: string;
}

export interface WPThemeInfo {
  stylesheet: string;
  isBlockTheme: boolean;
}

/** A `wp_template` / `wp_template_part` item. Theme files use `theme//slug` ids. */
export interface WPFseItem {
  id: string;
  slug: string;
  title?: { rendered?: string; raw?: string };
  status?: string;
  /** `theme`, `plugin` or `custom` — see `fseOrigin`. */
  source?: string;
  area?: string;
  modified?: string;
}

/**
 * UTF-8-safe base64 without Node's `Buffer`.
 * `btoa` only accepts latin1, so the string is encoded to UTF-8 bytes first and
 * each byte is mapped to a code unit.
 */
function base64FromUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export class WordPressClient {
  private siteUrl: string;
  private username: string;
  private authHeader: string;
  private transport: WPTransportMode;
  private proxyPrefix: string;
  private onDebug?: (message: string) => void;

  constructor(options: WordPressClientOptions) {
    // Normalize URL — remove trailing slash
    this.siteUrl = options.siteUrl.replace(/\/+$/, "");
    this.username = options.username.trim();
    this.transport = options.transport === "proxy" ? "proxy" : "direct";
    this.proxyPrefix = (options.proxyPrefix || "").trim();
    this.onDebug = options.onDebug;
    // Basic Auth header. WordPress displays application passwords in spaced
    // groups ("abcd EFGH ijkl") and strips the spaces itself before hashing,
    // but a stray newline from a paste would break the header, so drop any
    // whitespace here too.
    const credentials = base64FromUtf8(`${this.username}:${options.appPassword.replace(/\s+/g, "")}`);
    this.authHeader = `Basic ${credentials}`;
  }

  /** Site URL without a trailing slash (used for admin/editor links). */
  getSiteUrl(): string {
    return this.siteUrl;
  }

  /**
   * Test the connection and return site name.
   *
   * The three things that can be wrong — the site is unreachable, the
   * application password is rejected, GreenShift is missing — are checked
   * separately. Probing a GreenShift route to answer all three cannot work:
   * once WordPress rejects the credentials, `rest_authentication_errors`
   * makes *every* route reply 401, so a bad password reads as a missing
   * plugin and vice versa.
   */
  async testConnection(): Promise<{ success: boolean; siteName?: string; error?: string }> {
    // 1. Reachability + installed plugins. The REST index is public on a stock
    //    site, so it answers even when the credentials are bad.
    let index: { name?: string; namespaces?: string[] };
    try {
      index = await this.getRestIndex();
    } catch (err) {
      return { success: false, error: describeRequestError(err) };
    }
    const siteName = index.name || "WordPress Site";

    // 2. Credentials. The index proves nothing about them — /users/me does.
    try {
      await this.request("GET", "/wp-json/wp/v2/users/me?context=edit");
    } catch (err) {
      const status = requestStatus(err);
      if (status === 401 || status === 403) {
        return {
          success: false,
          error:
            `WordPress rejected the credentials for "${this.username}" (${describeRequestError(err)}). ` +
            `Application Passwords are per-user and revocable — generate a fresh one under ` +
            `Users → Profile → Application Passwords, then remove and re-add this site.`,
        };
      }
      return { success: false, error: describeRequestError(err) };
    }

    // 3. GreenShift. Namespaces come from the index; confirm against the real
    //    route before accusing a site of not having the plugin, since security
    //    setups can hide the index from guests.
    if (!index.namespaces?.includes(GREENSHIFT_NAMESPACE) && !(await this.hasGreenShiftRoute())) {
      return { success: false, error: "GreenShift plugin not found. Ensure GreenShift is installed and activated." };
    }

    return { success: true, siteName };
  }

  /**
   * Read the REST index (`/wp-json/`) for the site name and the namespaces the
   * installed plugins register. Tried without credentials first: that keeps a
   * rejected password from masking what is actually installed. Sites that hide
   * the index from guests get a second, authenticated attempt.
   */
  private async getRestIndex(): Promise<{ name?: string; namespaces?: string[] }> {
    try {
      return await this.request<{ name?: string; namespaces?: string[] }>(
        "GET",
        "/wp-json/",
        undefined,
        { anonymous: true }
      );
    } catch (err) {
      const status = requestStatus(err);
      if (status !== 401 && status !== 403) throw err;
      return this.request<{ name?: string; namespaces?: string[] }>("GET", "/wp-json/");
    }
  }

  /**
   * Whether the GreenShift REST route exists. Only a 404 means "no route" —
   * a 401/403 says the route is registered and merely refused us.
   */
  private async hasGreenShiftRoute(): Promise<boolean> {
    try {
      await this.request("GET", `/wp-json/${GREENSHIFT_NAMESPACE}/figma_settings`);
      return true;
    } catch (err) {
      return requestStatus(err) !== 404;
    }
  }

  /**
   * Get pages from the site.
   * GET /wp-json/wp/v2/pages?per_page=50&orderby=modified&order=desc[&search=]
   */
  async getPages(search?: string): Promise<WPPage[]> {
    let endpoint = "/wp-json/wp/v2/pages?per_page=50&orderby=modified&order=desc";
    if (search) {
      endpoint += `&search=${encodeURIComponent(search)}`;
    }
    const result = await this.request<WPPage[]>("GET", endpoint);
    return result;
  }

  /**
   * Get reusable blocks ("templates" in the UI).
   * GET /wp-json/wp/v2/blocks?per_page=50&orderby=modified&order=desc[&search=]
   */
  async getTemplates(search?: string): Promise<WPPage[]> {
    let endpoint = "/wp-json/wp/v2/blocks?per_page=50&orderby=modified&order=desc";
    if (search) {
      endpoint += `&search=${encodeURIComponent(search)}`;
    }
    const result = await this.request<WPPage[]>("GET", endpoint);
    return result;
  }

  /**
   * Get info about the active theme — used to detect whether it is a block theme.
   * Strategy:
   *   1. Read `is_block_theme` from /wp/v2/themes?status=active (WP 6.2+).
   *   2. Fallback: probe /wp/v2/template-parts. WP only registers that route when
   *      the active theme supports block templates, so a 200 = block theme.
   */
  async getActiveTheme(): Promise<WPThemeInfo> {
    let stylesheet = "";
    let isBlockTheme = false;

    try {
      const themes = await this.request<Array<{ stylesheet: string; is_block_theme?: boolean; status?: string }>>(
        "GET",
        "/wp-json/wp/v2/themes?status=active"
      );
      const active = Array.isArray(themes) && themes.length > 0 ? themes[0] : null;
      if (active) {
        stylesheet = active.stylesheet || "";
        if (active.is_block_theme === true) {
          return { stylesheet, isBlockTheme: true };
        }
      }
    } catch {
      // fall through to the probe
    }

    try {
      await this.request<unknown>("GET", "/wp-json/wp/v2/template-parts?per_page=1");
      isBlockTheme = true;
    } catch {
      // route not registered — not a block theme
    }

    if (!stylesheet && isBlockTheme) {
      try {
        const themes = await this.request<Array<{ stylesheet: string }>>("GET", "/wp-json/wp/v2/themes?status=active");
        if (Array.isArray(themes) && themes[0]?.stylesheet) stylesheet = themes[0].stylesheet;
      } catch { /* ignore */ }
    }

    return { stylesheet, isBlockTheme };
  }

  /**
   * Get FSE site templates (wp_template) — only meaningful on block themes.
   * GET /wp-json/wp/v2/templates
   */
  async getSiteTemplates(search?: string): Promise<WPFseItem[]> {
    return filterFseItems(await this.request<WPFseItem[]>("GET", "/wp-json/wp/v2/templates"), search);
  }

  /**
   * Get FSE template parts (wp_template_part) — only meaningful on block themes.
   * GET /wp-json/wp/v2/template-parts
   */
  async getTemplateParts(search?: string): Promise<WPFseItem[]> {
    return filterFseItems(await this.request<WPFseItem[]>("GET", "/wp-json/wp/v2/template-parts"), search);
  }

  /**
   * Update an existing FSE site template by its theme//slug id.
   * WP creates a customized override automatically if the source is "theme".
   * POST /wp-json/wp/v2/templates/{id}
   */
  async updateSiteTemplate(id: string, content: string): Promise<{ id: string; link: string }> {
    const result = await this.request<{ id: string; _links?: unknown }>(
      "POST",
      `/wp-json/wp/v2/templates/${encodeFseId(id)}`,
      { content }
    );
    return { id: result.id, link: fseEditorLink(this.siteUrl, "wp_template", result.id) };
  }

  /**
   * Update an existing FSE template part by its theme//slug id.
   * POST /wp-json/wp/v2/template-parts/{id}
   */
  async updateTemplatePart(id: string, content: string): Promise<{ id: string; link: string }> {
    const result = await this.request<{ id: string }>(
      "POST",
      `/wp-json/wp/v2/template-parts/${encodeFseId(id)}`,
      { content }
    );
    return { id: result.id, link: fseEditorLink(this.siteUrl, "wp_template_part", result.id) };
  }

  /**
   * Create a new FSE template part. `slug` should be a unique URL-safe identifier.
   * POST /wp-json/wp/v2/template-parts
   */
  async createTemplatePart(
    slug: string,
    theme: string,
    title: string,
    content: string,
    area = "uncategorized"
  ): Promise<{ id: string; link: string }> {
    let result = await this.request<{ id: string; slug?: string }>(
      "POST",
      "/wp-json/wp/v2/template-parts",
      { slug, theme, title, content, area, status: "publish" }
    );
    // After the insert, core re-reads the part with get_block_templates(wp_id) and
    // returns the first hit. Plugins that inject their own parts into that filter
    // (WooCommerce does) make it answer with an unrelated part, so the response id
    // can name someone else's header. Never return that id — a later write to it
    // would overwrite the wrong part.
    if (result.slug !== slug) {
      result = await this.request<{ id: string; slug?: string }>(
        "GET",
        `/wp-json/wp/v2/template-parts/${encodeFseId(`${theme}//${slug}`)}`
      );
    }
    if (result.slug !== slug) {
      throw new Error(
        `The template part "${slug}" was created but WordPress reported a different part. ` +
        `Open the Site Editor to check it before exporting again.`
      );
    }
    return { id: result.id, link: fseEditorLink(this.siteUrl, "wp_template_part", result.id) };
  }

  /**
   * Create a new page.
   * POST /wp-json/wp/v2/pages
   */
  async createPage(title: string, content: string, status = "draft"): Promise<{ id: number; link: string }> {
    const result = await this.request<{ id: number; link: string }>(
      "POST",
      "/wp-json/wp/v2/pages",
      { title, content, status }
    );
    return { id: result.id, link: result.link };
  }

  /** POST /wp-json/wp/v2/blocks */
  async createTemplate(title: string, content: string, status = "publish"): Promise<{ id: number; link: string }> {
    const result = await this.request<{ id: number; link?: string }>(
      "POST",
      "/wp-json/wp/v2/blocks",
      { title, content, status }
    );
    return { id: result.id, link: result.link || `${this.siteUrl}/wp-admin/post.php?post=${result.id}&action=edit` };
  }

  /**
   * Update an existing page's content.
   * POST /wp-json/wp/v2/pages/{id}
   */
  async updatePage(pageId: number, content: string): Promise<{ id: number; link: string }> {
    const result = await this.request<{ id: number; link: string }>(
      "POST",
      `/wp-json/wp/v2/pages/${pageId}`,
      { content }
    );
    return { id: result.id, link: result.link };
  }

  /** POST /wp-json/wp/v2/blocks/{id} */
  async updateTemplate(templateId: number, content: string): Promise<{ id: number; link: string }> {
    const result = await this.request<{ id: number; link?: string }>(
      "POST",
      `/wp-json/wp/v2/blocks/${templateId}`,
      { content }
    );
    return { id: result.id, link: result.link || `${this.siteUrl}/wp-admin/post.php?post=${result.id}&action=edit` };
  }

  /**
   * Upload a media file.
   * POST /wp-json/wp/v2/media
   */
  async uploadMedia(filename: string, data: Uint8Array, mimeType: string): Promise<WPMediaUploadResult> {
    return this.uploadFile("/wp-json/wp/v2/media", filename, data, mimeType);
  }

  /**
   * Find existing media by filename. Returns source_url if found, null otherwise.
   * GET /wp-json/wp/v2/media?search=...&per_page=10
   */
  async findMediaByFilename(filename: string): Promise<string | null> {
    try {
      const results = await this.request<Array<{ source_url: string }>>(
        "GET",
        `/wp-json/wp/v2/media?search=${encodeURIComponent(filename)}&per_page=10`
      );
      if (!Array.isArray(results)) return null;
      const name = filename.toLowerCase();
      const match = results.find((r) => {
        const url = r.source_url || "";
        return url.toLowerCase().endsWith("/" + name) || url.toLowerCase().includes("/" + name + ".");
      });
      return match ? match.source_url : null;
    } catch {
      return null;
    }
  }

  /**
   * Update GreenShift global settings (variables, colors, etc.).
   * POST /wp-json/greenshift/v1/figma_settings
   */
  async updateGlobalSettings(settings: Record<string, unknown>): Promise<void> {
    await this.request("POST", "/wp-json/greenshift/v1/figma_settings", settings);
  }

  /**
   * Read GreenShift figma_settings (colours, elements, figma_fonts, etc.).
   * GET /wp-json/greenshift/v1/figma_settings
   */
  async getFigmaSettings<T = unknown>(): Promise<T> {
    return this.request<T>("GET", "/wp-json/greenshift/v1/figma_settings");
  }

  // ─── HTTP helpers ────────────────────────────────────────────

  /**
   * Route an absolute URL through the configured CORS proxy, if any.
   * The proxy prefix is a user-supplied origin such as
   * `https://cors.example.com/`, which expects the target URL appended raw
   * (`https://cors.example.com/https://site.example/wp-json/`).
   */
  transportUrl(absoluteUrl: string): string {
    if (this.transport !== "proxy" || !this.proxyPrefix) return absoluteUrl;
    return `${this.proxyPrefix.replace(/\/+$/, "")}/${absoluteUrl}`;
  }

  private debug(message: string): void {
    console.error(`[GL-WPClient] ${message}`);
    this.onDebug?.(message);
  }

  private request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    opts?: { anonymous?: boolean }
  ): Promise<T> {
    return this.send(method, endpoint, body, opts);
  }

  private async send<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    opts?: { anonymous?: boolean }
  ): Promise<T> {
    const url = this.transportUrl(this.siteUrl + endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers: Record<string, string> = {};
    if (!opts?.anonymous) headers.Authorization = this.authHeader;
    // NOTE: the original sent `User-Agent: GreenLight-VSCode/1.0`. Browsers
    // forbid setting `User-Agent` (it is a forbidden header name — the fetch
    // spec silently drops it), so the request goes out with the browser's own
    // User-Agent instead. Deliberate omission, not an oversight.

    let bodyStr: string | undefined;
    if (body) {
      bodyStr = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
      // `Content-Length` is set by the browser from the body; setting it
      // manually is a forbidden header and would be dropped anyway.
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: controller.signal,
      });
      const data = await res.text();
      if (!res.ok) {
        this.debug(`${method} ${endpoint} → ${res.status}: ${data.substring(0, 300)}`);
        throw new WPRequestError(res.status, data);
      }
      try {
        return JSON.parse(data) as T;
      } catch {
        this.debug(`Invalid JSON, first 200 chars: ${data.substring(0, 200)}`);
        throw new Error("Invalid JSON response");
      }
    } catch (err) {
      throw mapTransportError(err, "Request timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  private async uploadFile<T>(endpoint: string, filename: string, data: Uint8Array, mimeType: string): Promise<T> {
    const url = this.transportUrl(this.siteUrl + endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    // `FormData` + `Blob` replaces the hand-built multipart body: the browser
    // generates the boundary and the part headers and sets both
    // `Content-Type: multipart/form-data; boundary=...` and `Content-Length`.
    // The original's extra `Content-Disposition` request header is not sent —
    // the part's own filename is what `/wp/v2/media` reads.
    const form = new FormData();
    // The `Uint8Array<ArrayBufferLike>` → `BlobPart` mismatch is purely a lib
    // typing artifact (`SharedArrayBuffer` in the default buffer type); a
    // Uint8Array is a valid BlobPart at runtime.
    const filePart = data as unknown as BlobPart;
    form.append("file", new Blob([filePart], { type: mimeType }), filename);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: form,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        this.debug(`POST ${endpoint} → ${res.status}: ${text.substring(0, 300)}`);
        throw new WPRequestError(res.status, text);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error("Invalid JSON response from media upload");
      }
    } catch (err) {
      throw mapTransportError(err, "Upload timeout");
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch a remote document (external CSS/JS, Google Fonts stylesheet) as text.
   *
   * Redirects are followed by `fetch` itself (the original chased a single
   * 301/302 manually). No `User-Agent` is sent: browsers forbid it, and the
   * browser's own UA is a modern one, so fonts.googleapis.com still answers
   * with the woff2 `@font-face` blocks the pipeline expects.
   */
  async fetchUrl(url: string, browserUa = false): Promise<string> {
    void browserUa;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_URL_TIMEOUT_MS);
    try {
      const res = await fetch(this.transportUrl(url), {
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }
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
}

/**
 * Map a `fetch` failure onto the error the original Node transport produced,
 * keeping every user-facing string identical.
 *
 * A browser network failure surfaces as `TypeError` ("Failed to fetch" /
 * "Load failed") rather than a Node `Error` carrying `ECONNREFUSED` or
 * `ENOTFOUND`, and a timeout surfaces as `AbortError` rather than the
 * `req.setTimeout` callback, so both are translated here and `describeRequestError`
 * then leaves them alone.
 */
function mapTransportError(err: unknown, timeoutMessage: string): unknown {
  if (err instanceof WPRequestError) return err;
  if (err instanceof Error && err.name === "AbortError") return new Error(timeoutMessage);
  if (err instanceof TypeError) {
    return new Error("Cannot reach the site. Check the URL and your internet connection.");
  }
  return err;
}

/**
 * A non-2xx REST response. Carries the status and the WordPress error code so
 * callers can branch on them instead of grepping the message for "401" — a
 * substring that also appears in perfectly ordinary response bodies.
 */
export class WPRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: string) {
    let code = "";
    let detail = "";
    try {
      const parsed = JSON.parse(body);
      code = typeof parsed?.code === "string" ? parsed.code : "";
      detail = typeof parsed?.message === "string" ? parsed.message : "";
    } catch {
      // Not a REST error envelope — a server error page, a redirect, a WAF block.
    }
    super(detail ? `${detail} (HTTP ${status})` : `HTTP ${status}: ${body.substring(0, 200)}`);
    this.name = "WPRequestError";
    this.status = status;
    this.code = code;
  }
}

/** HTTP status of a failed request, or 0 for transport-level failures. */
function requestStatus(err: unknown): number {
  return err instanceof WPRequestError ? err.status : 0;
}

/**
 * A user-facing message for any failure a request can produce. Rejected
 * credentials get the one instruction that actually resolves them, since
 * WordPress answers every route with 401 once auth fails and the raw envelope
 * ("incorrect_password") reads like a bug in the export rather than a
 * revoked password.
 */
export function describeWPError(err: unknown, fallback: string): string {
  if (err instanceof WPRequestError && (err.status === 401 || err.status === 403)) {
    return (
      `${err.message} — WordPress rejected the stored credentials. Application Passwords are ` +
      `revocable and change when regenerated: create a new one under Users → Profile → ` +
      `Application Passwords, then remove and re-add the site.`
    );
  }
  if (err instanceof Error) return describeRequestError(err);
  return fallback;
}

/** A message worth showing a user, for both REST and transport failures. */
function describeRequestError(err: unknown): string {
  if (err instanceof WPRequestError) return err.message;
  const message = err instanceof Error ? err.message : "Connection failed";
  if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND") || message.includes("EAI_AGAIN")) {
    return "Cannot reach the site. Check the URL and your internet connection.";
  }
  if (message.includes("CERT") || message.includes("SSL") || message.includes("certificate")) {
    return `The site's HTTPS certificate was rejected: ${message}`;
  }
  return message;
}

/**
 * FSE template/template-part IDs are shaped like "theme//slug".
 * encodeURIComponent turns the slashes into %2F, which Apache/LiteSpeed/Nginx
 * reject by default (AllowEncodedSlashes off) → server-level 404 HTML page.
 * Encode each segment separately so the literal "/" survives in the path.
 */
export function encodeFseId(id: string): string {
  return id.split("/").map(encodeURIComponent).join("/");
}

/**
 * The templates / template-parts controllers take neither `search` nor `per_page`
 * — they return the theme's files merged with the customized posts in one go, so
 * an unknown query arg is silently ignored and every item comes back. Filtering
 * therefore has to happen here or the search box does nothing.
 */
function filterFseItems(items: WPFseItem[], search?: string): WPFseItem[] {
  if (!Array.isArray(items)) return [];
  const needle = (search || "").trim().toLowerCase();
  if (!needle) return items;
  return items.filter((i) => {
    const title = i.title?.rendered || i.title?.raw || "";
    return title.toLowerCase().includes(needle) || (i.slug || "").toLowerCase().includes(needle);
  });
}

/**
 * Some parts store their area JSON-encoded, so it arrives as '"uncategorized"'
 * (quotes included) instead of `uncategorized`.
 */
export function normalizeFseArea(area?: string): string {
  return (area || "").trim().replace(/^"+|"+$/g, "") || "uncategorized";
}

/**
 * Theme and plugin items live in files until something writes to them, at which
 * point WordPress stores a DB override and the source flips to "custom".
 */
export function fseOrigin(source?: string): "Theme" | "Plugin" | "Customized" {
  return source === "custom" ? "Customized" : source === "plugin" ? "Plugin" : "Theme";
}

/**
 * Build a site-editor URL for an FSE template / template-part.
 * Format expected by the block editor: ?p=/{postType}/{id}&canvas=edit
 * where the whole `p` value is URL-encoded (so the slashes inside become %2F).
 */
export function fseEditorLink(siteUrl: string, postType: "wp_template" | "wp_template_part", id: string): string {
  return `${siteUrl}/wp-admin/site-editor.php?p=${encodeURIComponent(`/${postType}/${id}`)}&canvas=edit`;
}

/**
 * Get MIME type from file extension.
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
