import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { CssVariable, ParentToIframeMessage, UsedFont } from "@/types/editor";
import { UserFontInfo, WebviewToHostMessage } from "@/types/hostMessages";
import { Search, X, Plus, Trash2, Upload, Zap, AlertTriangle, RefreshCw, Type } from "lucide-react";
import { isColorLike } from "../TokenPicker";
import {
  GoogleFontEntry,
  FALLBACK_CATALOG,
  buildFontStack,
  buildGoogleFontsUrl,
  buildFontFaceCss,
  ensurePreviewGoogleFont,
  ensurePreviewCustomFont,
} from "@/utils/fonts";

interface DesignSystemPanelProps {
  sendMessage: (msg: ParentToIframeMessage) => void;
  sendToHost: (msg: WebviewToHostMessage) => void;
  tailwindConverting?: boolean;
}

const FONT_FILE_ACCEPT = ".woff2,.woff,.ttf,.otf";
const PICKER_PAGE_SIZE = 50;

function deriveFamilyFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "Custom Font";
  return base
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── Typography tab ──────────────────────────────────────────────

function TypographySection({ sendMessage, sendToHost }: { sendMessage: (msg: ParentToIframeMessage) => void; sendToHost: (msg: WebviewToHostMessage) => void }) {
  const usedFonts = useEditorStore((s) => s.usedFonts);
  const userFonts = useEditorStore((s) => s.userFonts);
  const googleFontsCatalog = useEditorStore((s) => s.googleFontsCatalog);
  const fontUploaded = useEditorStore((s) => s.fontUploaded);
  const setFontUploaded = useEditorStore((s) => s.setFontUploaded);

  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleFontCount, setVisibleFontCount] = useState(PICKER_PAGE_SIZE);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // oldFamily awaiting a FONT_UPLOADED round-trip (upload or library copy)
  const pendingReplaceRef = useRef<string | null>(null);

  // Live catalog from the extension host; curated fallback until it arrives
  // (or when the host is offline with no cache).
  const catalog: GoogleFontEntry[] = useMemo(
    () => (googleFontsCatalog.length ? googleFontsCatalog : FALLBACK_CATALOG),
    [googleFontsCatalog]
  );

  // Refresh detection + libraries whenever the tab is shown
  useEffect(() => {
    sendMessage({ type: "GET_USED_FONTS" });
    sendToHost({ type: "LIST_USER_FONTS" });
    sendToHost({ type: "GET_GOOGLE_FONTS_CATALOG" });
  }, [sendMessage, sendToHost]);

  const catalogByKey = useMemo(() => {
    const map = new Map<string, GoogleFontEntry>();
    for (const entry of catalog) map.set(entry.f.toLowerCase(), entry);
    return map;
  }, [catalog]);

  const userFontByKey = useMemo(() => {
    const map = new Map<string, UserFontInfo>();
    for (const f of userFonts) map.set(f.family.toLowerCase(), f);
    return map;
  }, [userFonts]);

  // Load detected families into the panel document so names render in their own face
  useEffect(() => {
    for (const f of usedFonts) {
      const key = f.family.toLowerCase();
      const user = userFontByKey.get(key);
      if (user) ensurePreviewCustomFont(user.family, user.url);
      else if (catalogByKey.has(key)) ensurePreviewGoogleFont(catalogByKey.get(key)!.f);
    }
  }, [usedFonts, catalogByKey, userFontByKey]);

  // FONT_UPLOADED round-trip completed → run the replacement
  useEffect(() => {
    if (!fontUploaded) return;
    const oldFamily = pendingReplaceRef.current;
    pendingReplaceRef.current = null;
    setFontUploaded(null);
    setIsUploading(false);
    if (!oldFamily) return;
    ensurePreviewCustomFont(fontUploaded.family, fontUploaded.webviewUri);
    sendMessage({
      type: "REPLACE_FONT",
      oldFamily,
      newFamily: fontUploaded.family,
      newStack: `'${fontUploaded.family}', sans-serif`,
      fontFaceCss: buildFontFaceCss(fontUploaded.family, fontUploaded.relativePath),
    });
    setPickerFor(null);
    setSearch("");
  }, [fontUploaded, setFontUploaded, sendMessage]);

  const handleGooglePick = useCallback((entry: GoogleFontEntry) => {
    if (!pickerFor) return;
    ensurePreviewGoogleFont(entry.f);
    sendMessage({
      type: "REPLACE_FONT",
      oldFamily: pickerFor,
      newFamily: entry.f,
      newStack: buildFontStack(entry.f, entry.c),
      googleFontUrl: buildGoogleFontsUrl(entry.f, entry.w),
    });
    setPickerFor(null);
    setSearch("");
  }, [pickerFor, sendMessage]);

  useEffect(() => {
    setVisibleFontCount(PICKER_PAGE_SIZE);
  }, [pickerFor, search]);

  const handleUserFontPick = useCallback((font: UserFontInfo) => {
    if (!pickerFor) return;
    setUploadError("");
    setIsUploading(true);
    pendingReplaceRef.current = pickerFor;
    sendToHost({ type: "PICK_USER_FONT", id: font.id, family: font.family });
  }, [pickerFor, sendToHost]);

  const handleRemoveFont = useCallback((family: string) => {
    sendMessage({ type: "REMOVE_FONT", family });
  }, [sendMessage]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !pickerFor) return;
    setUploadError("");
    setIsUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      pendingReplaceRef.current = pickerFor;
      sendToHost({
        type: "UPLOAD_FONT",
        dataBase64,
        mimeType: file.type || "font/woff2",
        filename: file.name,
        family: deriveFamilyFromFilename(file.name),
      });
    } catch (err) {
      setIsUploading(false);
      setUploadError(err instanceof Error ? err.message : "Font upload failed");
    }
  }, [pickerFor, sendToHost]);

  const matchingCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? catalog.filter((f) => f.f.toLowerCase().includes(q) || f.c.toLowerCase().includes(q))
      : catalog;
  }, [catalog, search]);

  const filteredCatalog = useMemo(
    () => matchingCatalog.slice(0, visibleFontCount),
    [matchingCatalog, visibleFontCount]
  );

  const handleFontListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    setVisibleFontCount((count) => Math.min(count + PICKER_PAGE_SIZE, matchingCatalog.length));
  }, [matchingCatalog.length]);

  // Preview only the currently visible picker slice
  useEffect(() => {
    for (const entry of filteredCatalog) ensurePreviewGoogleFont(entry.f);
  }, [filteredCatalog]);

  const filteredUserFonts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? userFonts.filter((f) => f.family.toLowerCase().includes(q)) : userFonts;
  }, [userFonts, search]);

  useEffect(() => {
    for (const f of filteredUserFonts) ensurePreviewCustomFont(f.family, f.url);
  }, [filteredUserFonts]);

  const sourceBadges = (f: UsedFont) => {
    const badges: string[] = [];
    if (f.sources.css) badges.push("css");
    if (f.sources.inline) badges.push("inline");
    if (f.sources.variable) badges.push("var");
    return badges;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {usedFonts.length === 0 && (
        <div className="flex items-center justify-center py-8 text-[11px] text-zinc-600">
          No fonts detected in this file
        </div>
      )}
      {usedFonts.map((f) => (
        <div key={f.family} className="group border-b border-zinc-800/30 hover:bg-zinc-800/30 transition-colors">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div
                className="text-[13px] text-zinc-200 truncate"
                style={{ fontFamily: `'${f.family}', sans-serif` }}
                title={f.family}
              >
                {f.family}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-zinc-600">{f.count} use{f.count === 1 ? "" : "s"}</span>
                {sourceBadges(f).map((b) => (
                  <span key={b} className="px-1 py-px rounded bg-zinc-800/80 text-[8px] font-mono text-zinc-500">{b}</span>
                ))}
                {f.hasFontFace && (
                  <span className="px-1 py-px rounded bg-violet-500/10 text-[8px] font-mono text-violet-400">@font-face</span>
                )}
                {f.googleLinkHrefs.length > 0 && (
                  <span className="px-1 py-px rounded bg-sky-500/10 text-[8px] font-mono text-sky-400">Google</span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setPickerFor(f.family); setSearch(""); setUploadError(""); }}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 px-1.5 py-1 rounded text-[10px] text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10 transition-all"
              title={`Replace ${f.family}`}
            >
              <RefreshCw size={10} />
              <span>Replace</span>
            </button>
            <button
              onClick={() => handleRemoveFont(f.family)}
              className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title={`Remove ${f.family} font-family declarations and font load`}
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      ))}

      {/* Replace picker modal */}
      {pickerFor && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { if (!isUploading) setPickerFor(null); }}>
          <div className="w-[260px] max-h-[80%] flex flex-col rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/40 shrink-0">
              <span className="text-[10px] font-medium text-zinc-400 tracking-wide truncate">
                Replace <span className="text-zinc-200">{pickerFor}</span>
              </span>
              <button onClick={() => setPickerFor(null)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                <X size={12} />
              </button>
            </div>

            <div className="px-3 py-2 border-b border-zinc-800/40 shrink-0">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Google Fonts..."
                  autoFocus
                  className="w-full pl-6 pr-2 py-1.5 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-teal-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="px-3 py-1.5 border-b border-zinc-800/40 shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 w-full py-1.5 px-1.5 text-left hover:bg-teal-500/10 rounded-md transition-colors disabled:opacity-50"
              >
                <Upload size={11} className="text-teal-400 shrink-0" />
                <span className="text-[11px] text-teal-400">{isUploading ? "Uploading font..." : "Upload font file"}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={FONT_FILE_ACCEPT}
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              {uploadError && <div className="px-1.5 pb-1 text-[10px] text-red-400">{uploadError}</div>}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0" onScroll={handleFontListScroll}>
              {filteredUserFonts.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Your fonts</div>
                  {filteredUserFonts.map((font) => (
                    <button
                      key={font.id}
                      onClick={() => handleUserFontPick(font)}
                      disabled={isUploading}
                      className="w-full px-3 py-1.5 text-left hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
                    >
                      <span className="text-[13px] text-zinc-300" style={{ fontFamily: `'${font.family}', sans-serif` }}>{font.family}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="px-3 pt-2 pb-1 text-[9px] font-medium uppercase tracking-wider text-zinc-600">Google Fonts</div>
              {filteredCatalog.length === 0 && (
                <div className="px-3 py-3 text-[10px] text-zinc-600">No fonts match your search</div>
              )}
              {filteredCatalog.map((entry) => (
                <button
                  key={entry.f}
                  onClick={() => handleGooglePick(entry)}
                  disabled={isUploading}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
                >
                  <span className="text-[13px] text-zinc-300 truncate" style={{ fontFamily: `'${entry.f}', sans-serif` }}>{entry.f}</span>
                  <span className="text-[8px] text-zinc-600 shrink-0 ml-2">{entry.c}</span>
                </button>
              ))}
              {filteredCatalog.length > 0 && filteredCatalog.length < matchingCatalog.length && (
                <div className="px-3 py-2 text-[9px] text-zinc-600">
                  Showing {filteredCatalog.length} of {matchingCatalog.length} — scroll for more
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────

export function DesignSystemPanel({ sendMessage, sendToHost, tailwindConverting }: DesignSystemPanelProps) {
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const [activeTab, setActiveTab] = useState<"variables" | "typography">("variables");
  const [search, setSearch] = useState("");
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newVarName, setNewVarName] = useState("--");
  const [newVarValue, setNewVarValue] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showTailwindWarning, setShowTailwindWarning] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const hasTailwindCdn = useEditorStore((s) => s.hasTailwindCdn);

  // Migrate variables to gl-design-system-variables on mount
  useEffect(() => {
    sendMessage({ type: "MIGRATE_DESIGN_VARIABLES" });
  }, [sendMessage]);

  useEffect(() => {
    if (creating && nameInputRef.current) nameInputRef.current.focus();
  }, [creating]);

  useEffect(() => {
    if (editingVar && editInputRef.current) editInputRef.current.focus();
  }, [editingVar]);

  const filtered = cssVariables.filter(
    (v) => !search || v.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleStartEdit = useCallback((v: CssVariable) => {
    setEditingVar(v.name);
    setEditValue(v.value || v.computed || "");
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingVar || !editValue.trim()) return;
    sendMessage({ type: "UPDATE_DESIGN_VARIABLE", name: editingVar, value: editValue.trim() });
    setEditingVar(null);
    setEditValue("");
  }, [editingVar, editValue, sendMessage]);

  const handleDelete = useCallback((name: string) => {
    sendMessage({ type: "DELETE_DESIGN_VARIABLE", name });
    if (editingVar === name) {
      setEditingVar(null);
      setEditValue("");
    }
  }, [editingVar, sendMessage]);

  const handleCreate = useCallback(() => {
    const name = newVarName.trim().replace(/^-*/, "--");
    const value = newVarValue.trim();
    if (!name || name === "--" || !value) return;
    sendMessage({ type: "CREATE_VARIABLE", name, value });
    setCreating(false);
    setNewVarName("--");
    setNewVarValue("");
  }, [newVarName, newVarValue, sendMessage]);

  const generateCss = useCallback(() => {
    if (cssVariables.length === 0) return "";
    let css = ":root {\n";
    for (const v of cssVariables) {
      css += `  ${v.name}: ${v.value || v.computed};\n`;
    }
    css += "}";
    return css;
  }, [cssVariables]);

  const handleCopy = useCallback(() => {
    const css = generateCss();
    sendToHost({ type: "COPY_TO_CLIPBOARD", text: css });
  }, [generateCss, sendToHost]);

  const handleSaveToSiblings = useCallback(() => {
    const css = generateCss();
    sendToHost({ type: "SAVE_DESIGN_SYSTEM_TO_SIBLINGS", css });
    setShowExport(false);
  }, [generateCss, sendToHost]);

  return (
    // relative: the picker/export modals use `absolute inset-0` and must anchor
    // to this panel, not to the whole editor viewport.
    <div className="relative flex flex-col h-full bg-[#18181b]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <span className="text-[10px] font-medium text-zinc-400 capitalize tracking-wide">Design System</span>
        <div className="flex items-center gap-1">
          {hasTailwindCdn && (
            <button
              onClick={() => setShowTailwindWarning(true)}
              disabled={tailwindConverting}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              title="Convert Tailwind classes to static CSS"
            >
              <Zap size={10} />
              <span>{tailwindConverting ? "Converting..." : "Tailwind convert"}</span>
            </button>
          )}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
            title="Export variables"
          >
            <Upload size={10} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/60">
        <button
          onClick={() => setActiveTab("variables")}
          className={`flex-1 py-1.5 text-[10px] font-medium transition-colors border-b ${
            activeTab === "variables"
              ? "text-teal-400 border-teal-500/60"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
        >
          Variables
        </button>
        <button
          onClick={() => setActiveTab("typography")}
          className={`flex items-center justify-center gap-1 flex-1 py-1.5 text-[10px] font-medium transition-colors border-b ${
            activeTab === "typography"
              ? "text-teal-400 border-teal-500/60"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
        >
          <Type size={10} />
          Typography
        </button>
      </div>

      {activeTab === "typography" ? (
        <TypographySection sendMessage={sendMessage} sendToHost={sendToHost} />
      ) : (
        <>
      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800/40">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..."
            className="w-full pl-6 pr-6 py-1.5 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-teal-500/50 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Create new variable */}
      <div className="px-3 py-1.5 border-b border-zinc-800/40">
        {!creating ? (
          <button
            onClick={() => { setCreating(true); setNewVarName(search ? `--${search.replace(/^-*/, "")}` : "--"); setNewVarValue(""); }}
            className="flex items-center gap-2 w-full py-1.5 text-left hover:bg-teal-500/10 rounded-md px-1.5 transition-colors"
          >
            <Plus size={11} className="text-teal-400 shrink-0" />
            <span className="text-[11px] font-mono text-teal-400">Add variable</span>
          </button>
        ) : (
          <div className="space-y-1.5 py-1">
            <input
              ref={nameInputRef}
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="--variable-name"
              className="w-full px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-teal-500/50 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <input
              type="text"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              placeholder="value (e.g. #3498db, 16px)"
              className="w-full px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-teal-500/50 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleCreate}
                className="flex-1 py-1 rounded-md bg-teal-500/20 text-[10px] font-semibold text-teal-400 hover:bg-teal-500/30 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1 rounded-md bg-zinc-800/60 text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Variable list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-zinc-600">
            {search ? "No variables match your search" : "No CSS variables found"}
          </div>
        )}
        {filtered.map((v) => {
          const previewValue = v.computed || v.value || "";
          const showColor = isColorLike(previewValue);
          const isEditing = editingVar === v.name;

          return (
            <div
              key={v.name}
              className={`group border-b border-zinc-800/30 transition-colors ${isEditing ? "bg-zinc-800/40" : "hover:bg-zinc-800/30 cursor-pointer"}`}
              onClick={() => { if (!isEditing) handleStartEdit(v); }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Color indicator */}
                {showColor ? (
                  <div
                    className="w-5 h-5 rounded-sm border border-zinc-600/50 shrink-0"
                    style={{ backgroundColor: previewValue }}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-sm border border-zinc-700/30 bg-zinc-800/50 shrink-0 flex items-center justify-center">
                    <span className="text-[7px] text-zinc-600 font-mono">val</span>
                  </div>
                )}

                {/* Name + value */}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-zinc-300 truncate">{v.name}</div>
                  {!isEditing ? (
                    <div className="text-[10px] font-mono text-zinc-500 truncate max-w-full text-left">
                      {v.value || v.computed || "(empty)"}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-zinc-800 border border-teal-500/40 text-[10px] font-mono text-zinc-200 focus:outline-none focus:border-teal-500/70"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") { setEditingVar(null); setEditValue(""); }
                        }}
                        onBlur={handleSaveEdit}
                      />
                    </div>
                  )}
                </div>

                {/* Computed value badge */}
                {!isEditing && v.computed && v.computed !== v.value && (
                  <span className="text-[8px] font-mono text-zinc-600 truncate max-w-[60px] shrink-0" title={v.computed}>
                    {v.computed}
                  </span>
                )}

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(v.name); }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-all"
                  title="Remove variable"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowExport(false)}>
          <div className="w-[260px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/40">
              <span className="text-[10px] font-medium text-zinc-400 capitalize tracking-wide">Export Variables</span>
              <button onClick={() => setShowExport(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            </div>
            <div className="p-3">
              <textarea
                readOnly
                value={generateCss()}
                className="w-full h-40 rounded-md bg-zinc-900 border border-zinc-700/40 text-[10px] font-mono text-zinc-300 p-2 resize-none focus:outline-none focus:border-teal-500/50"
              />
              <div className="flex flex-col gap-1.5 mt-2">
                <button
                  onClick={handleCopy}
                  className="w-full py-1.5 rounded-md bg-zinc-700/40 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700/60 transition-colors"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleSaveToSiblings}
                  className="w-full py-1.5 rounded-md bg-teal-500/20 text-[10px] font-semibold text-teal-400 hover:bg-teal-500/30 transition-colors"
                >
                  Save on Sibling Files
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind Convert Warning Modal */}
      {showTailwindWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTailwindWarning(false)}>
          <div className="w-[280px] rounded-lg border border-amber-700/40 bg-[#1e1e22] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-700/30 bg-amber-500/5">
              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
              <span className="text-[10px] font-medium text-amber-400 tracking-wide">Tailwind Conversion</span>
              <button onClick={() => setShowTailwindWarning(false)} className="ml-auto text-zinc-500 hover:text-zinc-300">
                <X size={12} />
              </button>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                This will convert dynamic Tailwind CDN scripts to static CSS class styles embedded in a <code className="text-amber-300/80 bg-amber-500/10 px-1 rounded text-[10px]">&lt;style&gt;</code> tag.
              </p>
              <div className="text-[10px] text-zinc-500 space-y-1">
                <p>What will happen:</p>
                <ul className="list-disc list-inside space-y-0.5 text-zinc-400">
                  <li>Tailwind CDN script will be removed</li>
                  <li>Tailwind config script will be removed</li>
                  <li>All generated CSS rules will be saved as static styles</li>
                  <li>HTML classes remain unchanged</li>
                </ul>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setShowTailwindWarning(false);
                    sendMessage({ type: "CONVERT_TAILWIND_CSS" });
                  }}
                  className="flex-1 py-1.5 rounded-md bg-amber-500/20 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/30 transition-colors"
                >
                  Convert
                </button>
                <button
                  onClick={() => setShowTailwindWarning(false)}
                  className="px-3 py-1.5 rounded-md bg-zinc-800/60 text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
