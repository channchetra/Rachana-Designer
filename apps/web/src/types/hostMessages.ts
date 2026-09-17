/**
 * Rachana Designer — host protocol.
 *
 * The editor UI is completely decoupled from whatever is hosting it. In the
 * original VS Code extension the host was a Node process `MessageHandler`; in
 * Rachana Designer the host is `src/platform/host/*` running in the same page.
 * These types are the contract between the two, and are intentionally the
 * single source of truth: adding a feature later means adding one member to
 * each union plus one `case` in the host router.
 */

/* ------------------------------------------------------------------ *
 * Shared value objects
 * ------------------------------------------------------------------ */

/** One CSS custom property discovered inside the edited document. */
export interface CssVariable {
  name: string;
  value: string;
  computed: string;
}

/** One CSS rule set keyed to a class selector. */
export interface CssClassInfo {
  name: string;
  selector: string;
  properties: Record<string, string>;
}

/** A font family actually referenced by the edited document. */
export interface UsedFont {
  family: string;
  count: number;
  sources: { css: boolean; inline: boolean; variable: boolean };
  hasFontFace: boolean;
  googleLinkHrefs: string[];
}

/**
 * Save-patch payload produced by the canvas for incremental file writes.
 * The authoritative definitions live with the patcher itself; these re-exports
 * keep the original import paths (`types/hostMessages`) working unchanged.
 */
export type {
  SavePatches,
  ElementPatch,
  InsertionPatch,
  MovePatch,
  ScriptBlockPatch,
  StyleBlockPatch,
} from "@/platform/html/htmlPatcher";

/** Back-compat alias used by the original webview sources. */
export type SavePatchesPayload =
  import("@/platform/html/htmlPatcher").SavePatches;

/** Google Fonts catalog entry as delivered to the Typography tab. */
export interface GoogleFontCatalogEntry {
  /** family */
  f: string;
  /** category */
  c: string;
  /** available weights */
  w: number[];
}

/** A user-uploaded font available in the local font library. */
export interface UserFontInfo {
  id: string;
  family: string;
  url: string;
}

/** A file that can be opened from the current project folder. */
export interface FolderFileInfo {
  name: string;
  ext: string;
}

/** WordPress site connection record. */
export interface SiteRecord {
  id: string;
  label: string;
  url: string;
  username: string;
  appPassword: string;
  provider: "greenshift" | "greenlight";
}

/** Minimal page descriptor returned by a WordPress site. */
export interface WpPageInfo {
  id: number;
  title: string;
  slug: string;
  status?: string;
  link?: string;
  modified?: string;
}

/* ------------------------------------------------------------------ *
 * Webview -> Host
 * ------------------------------------------------------------------ */

export type WebviewToHostMessage =
  /* -- document lifecycle -- */
  | { type: "READ_FILE" }
  | { type: "SAVE_FILE"; content: string }
  | { type: "SAVE_PATCHES"; patches: import("@/platform/html/htmlPatcher").SavePatches; styleScope?: "global" | "local" }
  | { type: "CLOSE_PANEL" }
  | { type: "SET_CONFIG"; styleMode?: string; styleScope?: "global" | "local" }
  | { type: "OPEN_EXTERNAL"; url: string }
  | { type: "COPY_TO_CLIPBOARD"; text: string }
  /* -- folder / project -- */
  | { type: "GET_FOLDER_FILES" }
  | { type: "OPEN_FILE"; filename: string }
  | { type: "CREATE_FILE"; filename: string }
  | { type: "OPEN_CURRENT_FILE_IN_BROWSER" }
  | { type: "SAVE_DESIGN_SYSTEM_TO_SIBLINGS"; css: string }
  /* -- media -- */
  | { type: "UPLOAD_IMAGE" }
  | { type: "PASTE_IMAGE"; dataBase64: string; mimeType: string }
  | { type: "GET_LINK_URL"; linkText: string }
  | { type: "REQUEST_IMAGE_OPTIONS"; imgId: string; currentSrc: string }
  | { type: "REQUEST_LINK_CHANGE"; linkId: string; currentHref: string; linkText: string }
  | { type: "SAVE_SCREENSHOTS"; images: { filename: string; dataBase64: string }[] }
  /* -- template library -- */
  | { type: "GET_TEMPLATES"; page: number; limit: number; category: string | null; tag: string | null }
  | { type: "GET_TEMPLATE_HTML"; id: number }
  /* -- typography -- */
  | { type: "GET_GOOGLE_FONTS_CATALOG" }
  | { type: "UPLOAD_FONT"; dataBase64: string; filename: string; family: string; mimeType?: string }
  | { type: "LIST_USER_FONTS" }
  | { type: "PICK_USER_FONT"; id: string; family: string }
  /* -- WordPress connect -- */
  | { type: "CONNECT_GET_SITES" }
  | { type: "CONNECT_ADD_SITE"; site: { label: string; url: string; username: string; appPassword: string } }
  | { type: "CONNECT_REMOVE_SITE"; siteId: string }
  | { type: "CONNECT_TEST_SITE"; siteId: string }
  | {
      type: "CONNECT_GET_PAGES";
      siteId: string;
      search?: string;
      target: import("./connect").WPExportTarget;
    }
  | { type: "CONNECT_GET_SITE_INFO"; siteId: string }
  | {
      type: "CONNECT_EXPORT";
      siteId: string;
      pageId: number | string | "new";
      pageTitle?: string;
      search?: string;
      target?: import("./connect").WPExportTarget;
      fseKind?: "site-template" | "template-part";
      exportMode?: import("./connect").WPExportMode;
      exportMedia?: boolean;
      exportVariables?: boolean;
      convertToClasses?: boolean;
      wrapFullWidth?: boolean;
      externalAssetsMode?: import("./connect").ExternalAssetsMode;
      skipExistingMedia?: boolean;
      uploadCssAssets?: boolean;
      exportFonts?: boolean;
    }
  | {
      type: "CONNECT_GENERATE_CODE";
      convertToClasses?: boolean;
      exportMode?: import("./connect").WPExportMode;
      externalAssetsMode?: import("./connect").ExternalAssetsMode;
    }
  | { type: "CONNECT_CANCEL_EXPORT" }
  /* -- live (Astro) mode -- */
  | { type: "FETCH_LIVE_PREVIEW" }
  | { type: "STOP_LIVE_RUNTIME" }
  | { type: "GET_ASTRO_SOURCE"; requestId: string; filePath: string; line: number; column: number }
  | {
      type: "OPEN_ASTRO_SOURCE_IN_EDITOR";
      filePath: string;
      line: number;
      column: number;
      preferSplit?: boolean;
      preserveFocus?: boolean;
    }
  | {
      type: "ASTRO_EDIT";
      requestId: string;
      filePath: string;
      line: number;
      column: number;
      op: "setClassList" | "replaceElementSource";
      classList?: string;
      replacement?: string;
    }
  | {
      type: "LIVE_STYLE_DECLARATION_EDIT";
      requestId: string;
      filePath: string;
      line: number;
      column: number;
      property: string;
      value: string;
    }
  | { type: "LIVE_STYLE_UNDO" }
  | { type: "LIVE_STYLE_REDO" }
  /* -- license (kept for API parity; always returns Full Edition) -- */
  | { type: "LICENSE_GET_STATUS" }
  | { type: "LICENSE_ACTIVATE"; licenseKey: string; email: string; allowEmailSend?: boolean }
  | { type: "LICENSE_DEACTIVATE" }
  | { type: "LICENSE_GET_PORTAL"; licenseKey: string };

/* ------------------------------------------------------------------ *
 * Host -> Webview
 * ------------------------------------------------------------------ */

export type HostToWebviewMessage =
  | {
      type: "FILE_CONTENT";
      content: string;
      rawHtml?: string;
      filename: string;
      filePath?: string;
      injectScript: string;
      styleMode: string;
      styleScope?: "global" | "local";
      isMarkdown?: boolean;
      isAstro?: boolean;
    }
  | { type: "FILE_SAVED" }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "EXTERNAL_FILE_CHANGE"; content: string; rawHtml?: string }
  | { type: "CONFIG_CHANGE"; styleMode: string }
  | { type: "IMAGE_UPLOADED"; relativePath: string; webviewUri: string }
  | { type: "IMAGE_PASTED"; relativePath: string; webviewUri: string }
  | { type: "LINK_URL"; url: string; linkText: string }
  | { type: "IMAGE_OPTIONS_RESULT"; imgId: string; url: string }
  | { type: "IMAGE_UPLOADED_FOR_IMG"; imgId: string; relativePath: string; webviewUri: string }
  | { type: "LINK_CHANGE_RESULT"; linkId: string; href: string }
  | { type: "FOLDER_FILES_LIST"; files: FolderFileInfo[] }
  | { type: "FILE_CREATED"; filename: string }
  | { type: "FILE_CREATE_ERROR"; error: string }
  | {
      type: "TEMPLATES_DATA";
      templates: import("./editor").TemplateItem[];
      total: number;
      page: number;
      pages: number;
      categories: string[];
      error?: string;
    }
  | { type: "TEMPLATE_HTML"; id: number; html: string }
  | { type: "TEMPLATE_HTML_ERROR"; id: number; error: string }
  | { type: "GOOGLE_FONTS_CATALOG"; fonts: GoogleFontCatalogEntry[]; error?: string }
  | { type: "USER_FONTS_LIST"; fonts: UserFontInfo[] }
  | { type: "FONT_UPLOADED"; relativePath: string; webviewUri: string; family: string }
  | { type: "CONNECT_SITES_LIST"; sites: SiteRecord[] }
  | { type: "CONNECT_SITE_ADDED"; site: SiteRecord }
  | { type: "CONNECT_SITE_REMOVED"; siteId: string }
  | { type: "CONNECT_SITE_TEST_RESULT"; siteId: string; success: boolean; error?: string; siteName?: string }
  | {
      type: "CONNECT_PAGES_LIST";
      siteId?: string;
      target: import("./connect").WPExportTarget;
      pages: WpPageInfo[];
    }
  | { type: "CONNECT_PAGES_ERROR"; siteId?: string; target: import("./connect").WPExportTarget; error: string }
  | { type: "CONNECT_SITE_INFO"; siteId: string; isBlockTheme: boolean; stylesheet: string }
  | { type: "CONNECT_EXPORT_PROGRESS"; progress: import("./connect").ExportProgressInfo }
  | {
      type: "CONNECT_EXPORT_COMPLETE";
      pageUrl: string;
      pageId: number | string;
      target: import("./connect").WPExportTarget;
    }
  | { type: "CONNECT_EXPORT_ERROR"; error: string }
  | { type: "CONNECT_EXPORT_CODE"; code: string }
  | { type: "SCREENSHOTS_SAVED"; folderName: string }
  | { type: "SCREENSHOTS_SAVE_ERROR"; error: string }
  | { type: "LIVE_PREVIEW"; html: string; url: string }
  | { type: "LIVE_PREVIEW_ERROR"; error: string }
  | { type: "LIVE_STYLE_HISTORY_RESULT"; action: "undo" | "redo"; written: boolean; error?: string }
  /* -- Live mode: Astro source mapping -- */
  | { type: "ASTRO_SOURCE_RESULT"; requestId: string; source?: string; start?: number; end?: number; error?: string }
  | { type: "ASTRO_EDIT_RESULT"; requestId: string; written?: boolean; error?: string }
  | {
      type: "LIVE_STYLE_DECLARATION_EDIT_RESULT";
      requestId: string;
      written?: boolean;
      error?: string;
    }
  | {
      type: "LICENSE_STATUS";
      license: LicenseRecord | null;
      machineId: string;
    }
  | { type: "LICENSE_ACTIVATED"; license: LicenseRecord }
  | { type: "LICENSE_ACTIVATION_ERROR"; error: string }
  | { type: "LICENSE_DEACTIVATED" }
  | { type: "LICENSE_DEACTIVATION_ERROR"; error: string }
  | { type: "LICENSE_PORTAL_URL"; portalUrl: string }
  | { type: "LICENSE_PORTAL_ERROR"; error: string };

/** License-shaped record. Rachana Designer always reports Full Edition. */
export interface LicenseRecord {
  licenseKey: string;
  instanceId: string;
  email?: string;
  status: string;
  expiresAt: string | null;
  activationLimit: number;
  activation: number;
  /** Rachana-specific: the edition string surfaced in the About modal. */
  edition?: string;
}

/** Blanket error surface used by feature modules that cannot reply inline. */
export interface HostErrorReport {
  scope: string;
  message: string;
}
