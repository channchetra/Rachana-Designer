import { useMemo } from "react";
import { useConnectStore } from "@/stores/connectStore";
import type { WebviewToHostMessage } from "@/types/hostMessages";
import type { ExternalAssetsMode, WPExportMode } from "@/types/connect";

interface ExportOptionsProps {
  sendToHost: (msg: WebviewToHostMessage) => void;
  rawHtmlContent: string;
}

const GOOGLE_FONT_LINK_RE = /<link\b[^>]*href=["'][^"']*fonts\.googleapis\.com\/css[^"']*["'][^>]*>/i;

const EXPORT_MODES: { value: WPExportMode; label: string; desc: string }[] = [
  {
    value: "blocks",
    label: "As GreenLight blocks",
    desc: "Convert HTML into separate editable GreenShift blocks",
  },
  {
    value: "gs_html",
    label: "As one GreenShift HTML block",
    desc: "Single HTML element block — all CSS goes to its Custom CSS, all JS to Custom JS. Use this if block conversion fails or the page is very big and complex.",
  },
  {
    value: "core_html",
    label: "As one core HTML block",
    desc: "Single WordPress core HTML block with embedded styles and scripts, wrapped in a full-width Group",
  },
];

export function ExportOptions({ sendToHost, rawHtmlContent }: ExportOptionsProps) {
  const {
    selectedSiteId, sites, selectedPageId, newPageTitle, setNewPageTitle, exportTarget,
    exportMode, setExportMode,
    exportMedia, setExportMedia, exportVariables, setExportVariables,
    convertToClasses, setConvertToClasses,
    wrapFullWidth, setWrapFullWidth,
    externalAssetsMode, setExternalAssetsMode,
    skipExistingMedia, setSkipExistingMedia,
    uploadCssAssets, setUploadCssAssets,
    exportFonts, setExportFonts,
    setCurrentView, setExporting, resetExport,
  } = useConnectStore();

  const hasGoogleFontLink = useMemo(
    () => GOOGLE_FONT_LINK_RE.test(rawHtmlContent || ""),
    [rawHtmlContent]
  );

  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const selectedPage = useConnectStore((s) => s.pages.find((p) => p.id === selectedPageId));
  const isNewPage = selectedPageId === "new";
  const trimmedNewPageTitle = newPageTitle.trim();
  const canExport = Boolean(selectedSiteId && selectedPageId !== null && (!isNewPage || trimmedNewPageTitle));
  const itemLabel = exportTarget === "template"
    ? "Template"
    : exportTarget === "template-part"
      ? (selectedPage?.kind === "site-template" ? "Site Template" : "Template Part")
      : "Page";
  const isBlocksMode = exportMode === "blocks";

  const handleExport = () => {
    if (!selectedSiteId || selectedPageId === null) return;
    resetExport();
    setExporting(true);
    setCurrentView("progress");
    sendToHost({
      type: "CONNECT_EXPORT",
      siteId: selectedSiteId,
      pageId: selectedPageId,
      pageTitle: isNewPage ? trimmedNewPageTitle : undefined,
      target: exportTarget,
      fseKind: exportTarget === "template-part"
        ? (isNewPage ? "template-part" : selectedPage?.kind)
        : undefined,
      exportMode,
      exportMedia,
      exportVariables,
      convertToClasses,
      wrapFullWidth,
      externalAssetsMode,
      skipExistingMedia,
      uploadCssAssets,
      exportFonts: hasGoogleFontLink && exportFonts,
    });
  };

  const handleExportCodeOnly = () => {
    resetExport();
    setExporting(true);
    setCurrentView("progress");
    sendToHost({ type: "CONNECT_GENERATE_CODE", convertToClasses, exportMode, externalAssetsMode });
  };

  const checkboxClass = "w-3.5 h-3.5 rounded border border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 accent-emerald-500 cursor-pointer";

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Export Summary</div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Site</span>
          <span className="text-zinc-200">{selectedSite?.label || "—"}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">{itemLabel}</span>
          <span className="text-zinc-200">
            {isNewPage ? (trimmedNewPageTitle || `New ${itemLabel}`) : selectedPage?.title || "—"}
          </span>
        </div>
      </div>

      {isNewPage && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{itemLabel} Title</div>
          <input
            type="text"
            value={newPageTitle}
            onChange={(e) => setNewPageTitle(e.target.value)}
            placeholder={`Enter ${itemLabel.toLowerCase()} title...`}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-600 placeholder:text-zinc-500"
            autoFocus
          />
        </div>
      )}

      {/* Export mode */}
      <div className="space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Export As</div>
        {EXPORT_MODES.map((mode) => (
          <label
            key={mode.value}
            className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
              exportMode === mode.value
                ? "border-emerald-600/60 bg-emerald-950/20"
                : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
            }`}
          >
            <input
              type="radio"
              name="wp-export-mode"
              checked={exportMode === mode.value}
              onChange={() => setExportMode(mode.value)}
              className="mt-0.5 accent-emerald-500 cursor-pointer"
            />
            <div>
              <div className="text-xs text-zinc-200">{mode.label}</div>
              <div className="text-[10px] text-zinc-500 leading-relaxed">{mode.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Options */}
      <div className="space-y-2.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Options</div>
        <label className="flex items-start gap-2.5 cursor-pointer group">
          <input type="checkbox" checked={exportMedia} onChange={(e) => setExportMedia(e.target.checked)} className={checkboxClass} />
          <div>
            <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Upload media files</div>
            <div className="text-[10px] text-zinc-500">Upload local images to WordPress and replace URLs</div>
          </div>
        </label>
        {exportMedia && (
          <label className="flex items-start gap-2.5 cursor-pointer group pl-6">
            <input type="checkbox" checked={skipExistingMedia} onChange={(e) => setSkipExistingMedia(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Skip existing media</div>
              <div className="text-[10px] text-zinc-500">Do not upload if a file with the same name already exists in the media library</div>
            </div>
          </label>
        )}
        {exportMedia && !isBlocksMode && (
          <label className="flex items-start gap-2.5 cursor-pointer group pl-6">
            <input type="checkbox" checked={uploadCssAssets} onChange={(e) => setUploadCssAssets(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Upload files from CSS url()</div>
              <div className="text-[10px] text-zinc-500">Upload fonts/images referenced in stylesheets and rewrite their URLs. Files the site rejects (e.g. woff2) are embedded as data URIs up to 1 MB</div>
            </div>
          </label>
        )}
        {exportMode !== "core_html" && (
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" checked={exportVariables} onChange={(e) => setExportVariables(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Export CSS variables</div>
              <div className="text-[10px] text-zinc-500">Send :root/body CSS custom properties as GreenShift global variables</div>
            </div>
          </label>
        )}
        {isBlocksMode && (
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" checked={convertToClasses} onChange={(e) => setConvertToClasses(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Convert styles to editable classes</div>
              <div className="text-[10px] text-zinc-500">Parse CSS into local classes in Style Manager. When off, styles go to custom CSS</div>
            </div>
          </label>
        )}
        {isBlocksMode && (
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" checked={wrapFullWidth} onChange={(e) => setWrapFullWidth(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Add full width WordPress section</div>
              <div className="text-[10px] text-zinc-500">Wrap all blocks inside a full-width GreenShift section block</div>
            </div>
          </label>
        )}
        {hasGoogleFontLink && (
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input type="checkbox" checked={exportFonts} onChange={(e) => setExportFonts(e.target.checked)} className={checkboxClass} />
            <div>
              <div className="text-xs text-zinc-200 group-hover:text-white transition-colors">Download font and save on site</div>
              <div className="text-[10px] text-zinc-500">Save Google Fonts to GreenShift settings and remove the link tag from exported code</div>
            </div>
          </label>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-zinc-200">Process external styles &amp; scripts</div>
          <select
            value={externalAssetsMode}
            onChange={(e) => setExternalAssetsMode(e.target.value as ExternalAssetsMode)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 cursor-pointer"
          >
            <option value="html_block">{isBlocksMode ? "Place as HTML block" : "Keep external links"}</option>
            <option value="download">{isBlocksMode ? "Download and import in Style Manager" : "Download and inline"}</option>
            <option value="remove">Remove</option>
          </select>
          <div className="text-[10px] text-zinc-500">
            {externalAssetsMode === "html_block" && (isBlocksMode
              ? "Wrap external CSS/JS links in wp:html blocks; styles before content, scripts after"
              : exportMode === "gs_html"
                ? "External https:// CSS/JS load via the block's Custom JS. Relative local files are always inlined."
                : "Keep external https:// link and script tags. Relative local files are always inlined.")}
            {externalAssetsMode === "download" && (isBlocksMode
              ? "Fetch external CSS/JS and import into GreenShift Style Manager as local"
              : exportMode === "gs_html"
                ? "Fetch external CSS/JS and merge into the block's Custom CSS / Custom JS. Relative local files are always inlined."
                : "Fetch external CSS/JS and embed inside the HTML block. Relative local files are always inlined.")}
            {externalAssetsMode === "remove" && (isBlocksMode
              ? "Strip all external stylesheet and script references from the output"
              : "Strip external https:// stylesheet and script references. Relative local files are still inlined.")}
          </div>
          {externalAssetsMode === "download" && isBlocksMode && (
            <p className="text-[10px] leading-relaxed text-amber-300/80 bg-amber-950/30 border border-amber-900/40 rounded-md p-2.5">
              Important! External styles and scripts will be registered before local ones in Style Manager. Make sure there are no conflicts with your theme or plugin styles.
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          onClick={handleExport}
          disabled={!canExport}
          className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isNewPage ? `Create ${itemLabel} & Export` : `Update ${itemLabel}`}
        </button>
        <button
          onClick={handleExportCodeOnly}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
        >
          Export Code Only
        </button>
      </div>
    </div>
  );
}
