import { useCallback, useEffect, useRef, useState } from "react";
import type { WebviewToHostMessage } from "@/types/hostMessages";
import { SourceEditor } from "./SourceEditor";
import { useEditorStore } from "@/stores/editorStore";
import { Pencil } from "lucide-react";

interface LiveEditorProps {
  filePath: string;
  sendToHost: (msg: WebviewToHostMessage) => void;
  livePreviewHtml: string | null;
  livePreviewUrl: string | null;
  livePreviewError: string | null;
  onReload: () => void;
}

interface LiveSelection {
  file: string;
  line: number;
  column: number;
  tagName: string;
  classes: string;
  id: string;
  styles?: LiveSelectionStyle[];
}

interface LiveSelectionStyle {
  selector: string;
  cssText: string;
  declarations?: LiveStyleDeclaration[];
  source: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  context?: string;
}

interface LiveStyleDeclaration {
  property: string;
  value: string;
  priority?: string;
  line?: number;
  column?: number;
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function isMissingElementError(error: unknown): boolean {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return /^No element found at\b/.test(message);
}

function resolveRelativeStyleSource(source: string | undefined, selectionFile: string): string | null {
  if (!source || !selectionFile) return null;
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(source).pathname);
  } catch {
    pathname = source;
  }
  pathname = pathname.split(/[?#]/)[0];
  if (pathname.startsWith("/@fs/")) return pathname.slice(4);
  if (pathname.startsWith("/Users/") || pathname.startsWith("/Volumes/")) return pathname;
  if (pathname.startsWith("/src/") && selectionFile.includes("/src/")) {
    return `${selectionFile.slice(0, selectionFile.indexOf("/src/"))}${pathname}`;
  }
  return null;
}

function getStyleSourceFile(style: LiveSelectionStyle, selectionFile: string): string | null {
  if (style.sourceFile) return style.sourceFile;
  return resolveRelativeStyleSource(style.source, selectionFile);
}

/**
 * Live mode editor: renders the runtime-rendered page (with Astro source-loc
 * annotations) inside an iframe via `srcDoc`, listens for clicks bubbled from
 * the injected script, and routes class/source edits through the AST primitive
 * in the extension host. Astro HMR will not fire because we serve via srcDoc,
 * so we re-fetch after every successful edit.
 */
export function LiveEditor({ filePath, sendToHost, livePreviewHtml, livePreviewUrl, livePreviewError, onReload }: LiveEditorProps) {
  const [selection, setSelection] = useState<LiveSelection | null>(null);
  const [blockSource, setBlockSource] = useState<string>("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [stylePendingKey, setStylePendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSelection, setLiveSelection] = useState(false);
  const deviceWidth = useEditorStore((s) => s.deviceWidth);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Force the iframe to remount on every fresh preview — updating srcDoc on the
  // same DOM node doesn't always trigger a navigation, so we bump a key instead.
  const [reloadKey, setReloadKey] = useState(0);
  // Track in-flight async requests by their requestId so we can correlate replies.
  const sourceReqRef = useRef<string | null>(null);
  const editReqRef = useRef<string | null>(null);
  const styleEditReqRef = useRef<string | null>(null);
  const styleEditContextRef = useRef<{ style: LiveSelectionStyle; property: string; value: string; priority: string; pendingKey: string } | null>(null);
  const selectionRef = useRef<LiveSelection | null>(null);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    if (livePreviewHtml) {
      setReloadKey((k) => k + 1);
      setSelection(null);
      setBlockSource("");
      setStylePendingKey(null);
    }
  }, [livePreviewHtml]);

  useEffect(() => {
    setSelection(null);
    setBlockSource("");
    setError(null);
  }, [filePath]);

  // Click in iframe → injected script posts GL_LIVE_SELECT; capture it here.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "GL_LIVE_SELECT" && msg.payload) {
        setSelection(msg.payload as LiveSelection);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Listen for ASTRO_SOURCE_RESULT / ASTRO_EDIT_RESULT replies from the host.
  useEffect(() => {
    function onHostMessage(e: MessageEvent) {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ASTRO_SOURCE_RESULT" && msg.requestId === sourceReqRef.current) {
        setSourceLoading(false);
        if (msg.error) {
          if (!isMissingElementError(msg.error)) setError(msg.error);
          setBlockSource("");
        } else {
          setBlockSource(msg.source || "");
        }
        sourceReqRef.current = null;
      }
      if (msg.type === "ASTRO_EDIT_RESULT" && msg.requestId === editReqRef.current) {
        setPending(false);
        if (msg.error) {
          if (!isMissingElementError(msg.error)) setError(msg.error);
        }
        else if (msg.written) onReload();
        editReqRef.current = null;
      }
      if (msg.type === "LIVE_STYLE_DECLARATION_EDIT_RESULT" && msg.requestId === styleEditReqRef.current) {
        const editContext = styleEditContextRef.current;
        setStylePendingKey(null);
        if (msg.error) setError(msg.error);
        else if (msg.written && editContext) {
          patchLiveStyle(editContext);
          updateSelectionStyleValue(editContext);
        }
        styleEditReqRef.current = null;
        styleEditContextRef.current = null;
      }
    }
    window.addEventListener("message", onHostMessage);
    return () => window.removeEventListener("message", onHostMessage);
  }, [onReload]);

  const patchLiveStyle = useCallback((editContext: { style: LiveSelectionStyle; property: string; value: string; priority: string }) => {
    const iframe = iframeRef.current;
    const currentSelection = selectionRef.current;
    if (!currentSelection || !iframe?.contentWindow) return;
    const currentFilePath = filePathRef.current;
    iframe.contentWindow.postMessage({
      type: "GL_LIVE_STYLE_PATCH",
      selector: editContext.style.selector,
      source: editContext.style.source,
      sourceFile: getStyleSourceFile(editContext.style, currentSelection.file || currentFilePath) || "",
      property: editContext.property,
      value: editContext.value,
      priority: editContext.priority,
      elementFile: currentSelection.file || currentFilePath,
      elementLoc: `${currentSelection.line}:${currentSelection.column}`,
    }, "*");
  }, []);

  const updateSelectionStyleValue = useCallback((editContext: { style: LiveSelectionStyle; property: string; value: string }) => {
    setSelection((current) => {
      if (!current?.styles) return current;
      return {
        ...current,
        styles: current.styles.map((style) => {
          if (style.selector !== editContext.style.selector || style.source !== editContext.style.source) return style;
          return {
            ...style,
            declarations: (style.declarations || []).map((declaration) => (
              declaration.property === editContext.property
                ? { ...declaration, value: editContext.value }
                : declaration
            )),
          };
        }),
      };
    });
  }, []);

  // When user picks an element, request its source slice from the host.
  useEffect(() => {
    if (!selection) return;
    const requestId = makeId();
    sourceReqRef.current = requestId;
    setSourceLoading(true);
    setBlockSource("");
    setError(null);
    sendToHost({
      type: "GET_ASTRO_SOURCE",
      requestId,
      filePath: selection.file || filePath,
      line: selection.line,
      column: selection.column,
    });
  }, [selection, filePath, sendToHost]);

  const applyBlock = useCallback(() => {
    if (!selection) return;
    const requestId = makeId();
    editReqRef.current = requestId;
    setPending(true);
    setError(null);
    sendToHost({
      type: "ASTRO_EDIT",
      requestId,
      filePath: selection.file || filePath,
      line: selection.line,
      column: selection.column,
      op: "replaceElementSource",
      replacement: blockSource,
    });
  }, [blockSource, filePath, selection, sendToHost]);

  const openSelectionInEditor = useCallback(() => {
    if (!selection) return;
    sendToHost({
      type: "OPEN_ASTRO_SOURCE_IN_EDITOR",
      filePath: selection.file || filePath,
      line: selection.line,
      column: selection.column,
    });
  }, [filePath, selection, sendToHost]);

  const openStyleDeclarationInEditor = useCallback((style: LiveSelectionStyle, declaration?: LiveStyleDeclaration) => {
    if (!selection) return;
    const sourceFile = getStyleSourceFile(style, selection.file || filePath);
    if (!sourceFile) return;
    sendToHost({
      type: "OPEN_ASTRO_SOURCE_IN_EDITOR",
      filePath: sourceFile,
      line: declaration?.line || style.line || 1,
      column: declaration?.column || style.column || 1,
    });
  }, [filePath, selection, sendToHost]);

  const applyStyleDeclarationValue = useCallback((style: LiveSelectionStyle, declaration: LiveStyleDeclaration, value: string, pendingKey: string) => {
    if (!selection) return;
    const sourceFile = getStyleSourceFile(style, selection.file || filePath);
    if (!sourceFile) return;
    const line = declaration.line || style.line || 0;
    const column = declaration.column || style.column || 0;
    if (!line || !column) return;
    const requestId = makeId();
    styleEditReqRef.current = requestId;
    styleEditContextRef.current = { style, property: declaration.property, value, priority: declaration.priority || "", pendingKey };
    setStylePendingKey(pendingKey);
    setError(null);
    sendToHost({
      type: "LIVE_STYLE_DECLARATION_EDIT",
      requestId,
      filePath: sourceFile,
      line,
      column,
      property: declaration.property,
      value,
    });
  }, [filePath, selection, sendToHost]);

  /** Live Selection is always available — there is no licence tier. */
  const toggleLiveSelection = useCallback(() => {
    setLiveSelection((v) => !v);
  }, []);

  // Live Selection: auto-reveal selected element in a VS Code split editor.
  useEffect(() => {
    if (!liveSelection || !selection) return;
    sendToHost({
      type: "OPEN_ASTRO_SOURCE_IN_EDITOR",
      filePath: selection.file || filePath,
      line: selection.line,
      column: selection.column,
      preferSplit: true,
      preserveFocus: true,
    });
  }, [liveSelection, selection, sendToHost, filePath]);

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col bg-zinc-950">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">Live</span>
        {livePreviewUrl ? <span className="truncate text-[11px] text-zinc-500">{livePreviewUrl}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLiveSelection}
            aria-pressed={liveSelection}
            title="Auto-reveal the selected element in the source pane"
            className={
              liveSelection
                ? "rounded-md border border-emerald-500 bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300"
                : "rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
            }
          >
            Live Selection
          </button>
          <button
            onClick={onReload}
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 bg-zinc-950 overflow-auto flex justify-center items-start">
          <div
            className="bg-white shadow-lg shadow-black/30 transition-all duration-300 h-full min-h-full relative"
            style={{ width: deviceWidth ? `${deviceWidth}px` : "100%" }}
          >
            {livePreviewHtml ? (
              <iframe
                ref={iframeRef}
                key={reloadKey}
                srcDoc={livePreviewHtml}
                title="Live preview"
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                {livePreviewError ?? "Starting dev server… this can take up to a minute."}
              </div>
            )}
          </div>
        </div>
        {liveSelection ? null : (
        <aside className="flex w-[280px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-200">
          <div className="border-b border-zinc-800 px-4 py-3 text-[12px] font-medium uppercase tracking-wider text-zinc-400">
            Selection
          </div>
          {selection ? (
            <div className="flex flex-1 min-h-0 flex-col gap-3 px-4 py-3 text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Tag</div>
                <div className="text-zinc-100">&lt;{selection.tagName}&gt;{selection.id ? ` #${selection.id}` : ""}</div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Source</div>
                  <button
                    type="button"
                    onClick={openSelectionInEditor}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300 hover:bg-zinc-800"
                  >
                    Open in Editor
                  </button>
                </div>
                <div className="break-all text-[11px] text-zinc-400">
                  {(selection.file || "").split("/").slice(-2).join("/")}:{selection.line}:{selection.column}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Element source</label>
                <SourceEditor
                  value={blockSource}
                  onChange={setBlockSource}
                  disabled={sourceLoading}
                  placeholder={sourceLoading ? "Loading…" : ""}
                />
              </div>
              <div className="max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/50">
                <div className="border-b border-zinc-800 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Related styles</div>
                {selection.styles && selection.styles.length > 0 ? (
                  <div className="divide-y divide-zinc-800/80">
                    {selection.styles.map((style, index) => {
                      const sourceFile = getStyleSourceFile(style, selection.file || filePath);
                      const declarations: LiveStyleDeclaration[] = style.declarations && style.declarations.length > 0
                        ? style.declarations
                        : style.cssText.split(";").map((part) => {
                            const [property, ...valueParts] = part.split(":");
                            return { property: property.trim(), value: valueParts.join(":").trim() };
                          }).filter((decl) => decl.property && decl.value);
                      return (
                        <div key={`${style.selector}-${style.source}-${index}`} className="px-3 py-2">
                          <div className="break-all font-mono text-[11px] text-emerald-300">{style.selector}</div>
                          {style.context ? <div className="mt-1 break-all text-[10px] text-sky-300/80">{style.context}</div> : null}
                          <div className="mt-1 break-all text-[10px] text-zinc-500">{style.source}</div>
                          <div className="mt-2 overflow-hidden rounded border border-zinc-800 bg-zinc-950/70">
                            {declarations.length > 0 ? declarations.map((declaration, declIndex) => {
                              const canOpen = !!sourceFile && (!!declaration.line || !!style.line);
                              const pendingKey = `${style.selector}-${style.source}-${declaration.property}-${declIndex}`;
                              const canEdit = canOpen && stylePendingKey !== pendingKey;
                              return (
                                <div key={`${declaration.property}-${declIndex}`} className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-800/60 px-2 py-1.5 last:border-b-0">
                                  <div className="truncate font-mono text-[10px] font-semibold text-sky-300" title={declaration.property}>{declaration.property}</div>
                                  <div className="flex min-w-0 items-center gap-1">
                                    <input
                                      key={`${pendingKey}-${declaration.value}`}
                                      className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 font-mono text-[10px] text-zinc-300 outline-none focus:border-emerald-500 disabled:opacity-50"
                                      defaultValue={declaration.value}
                                      disabled={!canEdit}
                                      title={declaration.value}
                                      onBlur={(event) => {
                                        const nextValue = event.currentTarget.value;
                                        if (nextValue !== declaration.value) applyStyleDeclarationValue(style, declaration, nextValue, pendingKey);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = declaration.value;
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    {declaration.priority ? <span className="shrink-0 font-mono text-[10px] text-zinc-500">!{declaration.priority}</span> : null}
                                  </div>
                                  {canOpen ? (
                                    <button
                                      type="button"
                                      onClick={() => openStyleDeclarationInEditor(style, declaration)}
                                      title="Open in Editor"
                                      aria-label="Open style declaration in editor"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                    >
                                      <Pencil className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                  ) : <span className="h-6 w-6" />}
                                </div>
                              );
                            }) : (
                              <div className="px-2 py-1.5 font-mono text-[10px] text-zinc-500">No declarations exposed.</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-[11px] text-zinc-500">No matching CSS rules were exposed by the preview.</div>
                )}
              </div>
              <button
                type="button"
                onClick={applyBlock}
                disabled={pending || sourceLoading}
                className="h-8 w-full rounded-md bg-emerald-500 text-[12px] font-medium text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
              >
                {pending ? "Saving..." : "Apply"}
              </button>
              {error ? <div className="text-[11px] text-rose-400">{error}</div> : null}
            </div>
          ) : (
            <div className="px-4 py-3 text-[12px] text-zinc-500">
              Click any element in the preview to edit its source.
            </div>
          )}
        </aside>
        )}
      </div>
    </div>
  );
}
