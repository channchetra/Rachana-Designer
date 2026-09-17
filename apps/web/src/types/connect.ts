/**
 * WordPress connect types.
 *
 * Ported from the original extension's `types/connect.ts` (which was not part
 * of the source-map extract and has been reconstructed from every call site:
 * `connectStore`, `ConnectPanel`, `ExportOptions`, `PageSelector`,
 * `SiteManager`, `ExportProgress`, `ConnectHandler`, `WordPressClient`).
 */

export interface WPSiteInfo {
  id: string;
  label: string;
  url: string;
  username: string;
}

export interface WPSiteThemeInfo {
  isBlockTheme: boolean;
  stylesheet: string;
}

/** A page, reusable block, site template or template part. */
export interface WPPageInfo {
  id: number | string;
  title: string;
  slug?: string;
  status?: string;
  modified?: string;
  /** Only present for full-site-editing targets. */
  kind?: "site-template" | "template-part";
  area?: string;
  origin?: "Theme" | "Plugin" | "Customized";
}

/** Where an export lands on the target site. */
export type WPExportTarget = "page" | "template" | "template-part";

/** How the HTML is packaged into Gutenberg content. */
export type WPExportMode = "blocks" | "gs_html" | "core_html";

/** What happens to `<link rel=stylesheet>` / `<script src>` tags. */
export type ExternalAssetsMode = "html_block" | "download" | "remove";

export type ExportStep =
  | "parsing"
  | "downloading_assets"
  | "saving_fonts"
  | "uploading_media"
  | "converting_blocks"
  | "exporting_variables"
  | "creating_page"
  | "done"
  | "error";

export interface ExportProgressInfo {
  step: ExportStep;
  totalSteps: number;
  currentStep: number;
  message: string;
}

export interface WPExportResult {
  pageUrl: string;
  pageId: number | string;
  target: WPExportTarget;
}

/** Human labels for the export-step progress UI. */
export const EXPORT_STEP_LABELS: Record<ExportStep, string> = {
  parsing: "Reading document",
  downloading_assets: "Downloading external assets",
  saving_fonts: "Saving Google Fonts",
  uploading_media: "Uploading media",
  converting_blocks: "Converting to blocks",
  exporting_variables: "Exporting CSS variables",
  creating_page: "Creating destination",
  done: "Finished",
  error: "Failed",
};

export const EXPORT_MODE_LABELS: Record<WPExportMode, string> = {
  blocks: "As GreenLight blocks",
  gs_html: "As one GreenShift HTML block",
  core_html: "As one core HTML block",
};

export const EXPORT_TARGET_LABELS: Record<WPExportTarget, string> = {
  page: "Page",
  template: "Reusable block",
  "template-part": "Site template / part",
};

/**
 * CORS is the one browser-only obstacle for the WordPress pipeline.
 *
 * A stock WordPress site does not send `Access-Control-Allow-*` headers, and
 * `Authorization: Basic` forces a preflight, so a page served from another
 * origin cannot call `/wp-json/` directly. Rachana Designer therefore offers
 * three transports and lets the user choose per install.
 */
export type WordPressTransport = "direct" | "proxy" | "manual";

export interface WordPressTransportConfig {
  transport: WordPressTransport;
  /** Prefix for a CORS proxy, e.g. `https://cors.example.com/`. */
  proxyPrefix: string;
}

export const DEFAULT_TRANSPORT_CONFIG: WordPressTransportConfig = {
  transport: "direct",
  proxyPrefix: "",
};
