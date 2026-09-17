/**
 * Rachana Designer — application shell.
 *
 * The ported `EditorShell` orchestrates every panel exactly as it did in the
 * VS Code webview. The only differences are:
 *
 *  - `sendToHost` comes from the host bridge context instead of
 *    `acquireVsCodeApi()`,
 *  - `filePath` is a workspace-relative path rather than an absolute fsPath,
 *  - closing the editor hides the shell instead of disposing a webview panel,
 *  - an `onRevealSource` callback opens the built-in source pane instead of a
 *    VS Code split editor (Live mode).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FileCode2, X } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { usePostMessage } from "@/hooks/usePostMessage";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { IframeToParentMessage, ParentToIframeMessage } from "@/types/editor";
import type { SavePatchesPayload } from "@/types/hostMessages";
import { Canvas } from "./Canvas";
import { LiveEditor } from "./LiveEditor";
import { Toolbar } from "./Toolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { AnimationPanel } from "./panels/AnimationPanel";
import { WireframesPanel } from "./panels/WireframesPanel";
import { DesignSystemPanel } from "./panels/DesignSystemPanel";
import { ConnectPanel } from "./ConnectPanel";
import { ScreenshotModal } from "./ScreenshotModal";
import { SnapshotsPanel } from "./panels/SnapshotsPanel";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { SourcePane } from "./SourcePane";
import { useHostBridge } from "@/platform/host/HostBridgeProvider";
import { publishHostMessage } from "@/platform/host/hostEvents";
import { appConfig } from "@/platform/host/config";
import { loadGlobalCss } from "@/platform/host/globalCss";

export interface EditorShellProps {
  filename: string;
  filePath: string;
  htmlContent: string;
  rawHtmlContent: string;
  injectScript: string;
  styleMode: string;
  livePreviewHtml: string | null;
  livePreviewUrl: string | null;
  livePreviewError: string | null;
  /** Bumped to force a full canvas remount. */
  sessionKey: number;
  onClose: () => void;
  /** Set by the shell so external file changes can be pushed into the canvas. */
  externalChangeRef: React.MutableRefObject<((html: string, rawHtml: string) => void) | null>;
  uploadedImagePayload: { relativePath: string; webviewUri: string; nonce: number } | null;
  clearUploadedImage: () => void;
  pastedImagePayload: { relativePath: string; webviewUri: string } | null;
  clearPastedImage: () => void;
  linkUrlPayload: { url: string; linkText: string } | null;
  clearLinkUrl: () => void;
  imageUpdatePayload: { imgId: string; src: string; displayValue?: string } | null;
  clearImageUpdate: () => void;
  linkChangePayload: { linkId: string; href: string } | null;
  clearLinkChange: () => void;
  saveErrorMessage: string | null;
}

export function EditorShell({
  filename,
  filePath,
  htmlContent,
  rawHtmlContent,
  injectScript,
  styleMode,
  livePreviewHtml,
  livePreviewUrl,
  livePreviewError,
  sessionKey,
  onClose,
  externalChangeRef,
  uploadedImagePayload,
  clearUploadedImage,
  pastedImagePayload,
  clearPastedImage,
  linkUrlPayload,
  clearLinkUrl,
  imageUpdatePayload,
  clearImageUpdate,
  linkChangePayload,
  clearLinkChange,
  saveErrorMessage,
}: EditorShellProps) {
  const { sendToHost, session } = useHostBridge();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingUploadPropertyRef = useRef<"background-image" | "mask-image" | "src">("background-image");
  const pendingUploadPathRef = useRef<string | null>(null);
  const latestFileHtmlRef = useRef(rawHtmlContent);
  const snapshotsLoadedRef = useRef(false);
  const [sourcePane, setSourcePane] = useState<{ path: string; line?: number; column?: number } | null>(null);

  const {
    selectedElement,
    setSelectedElement,
    selectedClass,
    setSelectedClass,
    selectedSubSelector,
    setSelectedSubSelector,
    domTree,
    setDomTree,
    setIframeReady,
    setDragState,
    setPanelOpen,
    setSaveStatus,
    setCssVariables,
    setCssClasses,
    setCreateCssVariable,
    animationPanelOpen,
    wireframesPanelOpen,
    designSystemPanelOpen,
    snapshotsPanelOpen,
    markdownMode,
    setHasTailwindCdn,
    snapshots,
    setSnapshots,
    editorMode,
    isAstroFile,
  } = useEditorStore();

  const deviceWidth = useEditorStore((s) => s.deviceWidth);
  const iframeReady = useEditorStore((s) => s.iframeReady);
  const styleScope = useEditorStore((s) => s.styleScope);
  const [savedAnimStyles, setSavedAnimStyles] = useState<{ className: string; css: string }[]>([]);
  const [tailwindConverting, setTailwindConverting] = useState(false);
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);

  useEffect(() => {
    latestFileHtmlRef.current = rawHtmlContent;
  }, [rawHtmlContent]);

  /* --------------------------- snapshot storage -------------------------- */

  const snapshotStorageKey = `rachana:snapshots:${filePath || filename}`;

  useEffect(() => {
    snapshotsLoadedRef.current = false;
    if (isAstroFile) {
      setSnapshots([]);
      snapshotsLoadedRef.current = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(snapshotStorageKey);
      if (!raw) {
        setSnapshots([]);
      } else {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          const normalized = parsed
            .filter(
              (item): item is { id: string; name: string; html: string; timestamp: number } =>
                !!item &&
                typeof (item as { id?: unknown }).id === "string" &&
                typeof (item as { name?: unknown }).name === "string" &&
                typeof (item as { html?: unknown }).html === "string" &&
                typeof (item as { timestamp?: unknown }).timestamp === "number"
            )
            .map((item) => {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                return item;
              }
              const newId = `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
              seen.add(newId);
              return { ...item, id: newId };
            });
          setSnapshots(normalized);
        } else {
          setSnapshots([]);
        }
      }
    } catch {
      setSnapshots([]);
    } finally {
      snapshotsLoadedRef.current = true;
    }
  }, [isAstroFile, snapshotStorageKey, setSnapshots]);

  useEffect(() => {
    if (!snapshotsLoadedRef.current || isAstroFile) return;
    try {
      window.localStorage.setItem(snapshotStorageKey, JSON.stringify(snapshots));
    } catch {
      /* storage quota / private mode */
    }
  }, [isAstroFile, snapshotStorageKey, snapshots]);

  /* ------------------------------ iframe glue ---------------------------- */

  const sendMessageRef = useRef<(msg: ParentToIframeMessage) => void>(() => {});
  const triggerSaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (animationPanelOpen && iframeReady) {
      sendMessageRef.current({ type: "GET_ANIMATION_STYLES" });
    }
  }, [animationPanelOpen, iframeReady]);

  const getCurrentEditorHtml = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow as unknown as {
        __glGetBodyHtml?: () => string;
        __glGetFullHtml?: () => string;
      } | null;
      if (markdownMode && typeof win?.__glGetBodyHtml === "function") {
        const bodyHtml = win.__glGetBodyHtml();
        if (bodyHtml) return bodyHtml;
      }
      if (typeof win?.__glGetFullHtml === "function") {
        const fullHtml = win.__glGetFullHtml();
        if (fullHtml) return fullHtml;
      }
    } catch {
      /* cross-origin or not ready — fall through */
    }
    return latestFileHtmlRef.current || rawHtmlContent || htmlContent;
  }, [markdownMode, rawHtmlContent, htmlContent]);

  const handleSnapshotCapture = useCallback(
    (targetSnapshotId: string | null) => {
      if (isAstroFile) return;
      const html = getCurrentEditorHtml();
      if (!html) return;
      latestFileHtmlRef.current = html;
      const store = useEditorStore.getState();
      if (!targetSnapshotId) store.addSnapshot(html);
      else store.updateSnapshotHtml(targetSnapshotId, html);
    },
    [getCurrentEditorHtml, isAstroFile]
  );

  const handleLoadSnapshot = useCallback(
    (html: string) => {
      if (isAstroFile) return;
      latestFileHtmlRef.current = html;
      setSaveStatus("saving");
      sendToHost({ type: "SAVE_FILE", content: html });
      sendMessageRef.current({ type: "REPLACE_DOCUMENT", html, rawHtml: html });
    },
    [isAstroFile, sendToHost, setSaveStatus]
  );

  const handleMessage = useCallback((msg: IframeToParentMessage) => {
    switch (msg.type) {
      case "READY": {
        setReloadNotice(null);
        setIframeReady(true);
        const mdMode = useEditorStore.getState().markdownMode;
        sendMessageRef.current({
          type: "CONFIG",
          styleMode: appConfig.get().styleMode,
          deviceWidth: useEditorStore.getState().deviceWidth,
          ...(mdMode ? { markdownMode: true } : {}),
        } as ParentToIframeMessage);
        sendMessageRef.current({ type: "GET_DOM_TREE" });
        sendMessageRef.current({ type: "GET_CSS_VARIABLES" });
        sendMessageRef.current({ type: "GET_CSS_CLASSES" });
        sendMessageRef.current({ type: "GET_ANIMATION_STYLES" });
        sendMessageRef.current({ type: "GET_USED_FONTS" });
        break;
      }
      case "DOM_TREE":
        setDomTree(msg.tree);
        break;
      case "ELEMENT_SELECTED":
        setSelectedElement(msg.data);
        if (useEditorStore.getState().autoOpenPanelOnSelect) setPanelOpen(true);
        break;
      case "ELEMENT_DESELECTED":
        setSelectedElement(null);
        break;
      case "STYLE_CHANGED":
        setSelectedElement(msg.data);
        break;
      case "DOM_MUTATED":
        sendMessageRef.current({ type: "GET_DOM_TREE" });
        triggerSaveRef.current();
        break;
      case "CSS_VARIABLES":
        setCssVariables(msg.variables);
        break;
      case "CSS_CLASSES":
        setCssClasses(msg.classes);
        break;
      case "USED_FONTS":
        useEditorStore.getState().setUsedFonts(msg.fonts);
        break;
      case "ANIMATION_STYLES":
        setSavedAnimStyles(msg.styles);
        break;
      case "EDITOR_WARNING":
        if (msg.code === "reload-required") {
          setReloadNotice(msg.message || "Page requires reload to apply new changes");
        }
        break;
      case "SAVE_PATCHES":
        if (msg.patches) {
          setSaveStatus("saving");
          const state = useEditorStore.getState();
          sendToHost({
            type: "SAVE_PATCHES",
            patches: msg.patches as SavePatchesPayload,
            ...(state.isAstroFile ? { styleScope: state.styleScope } : {}),
          });
        }
        break;
      case "FULL_HTML":
        if (msg.html) {
          latestFileHtmlRef.current = msg.html;
          setSaveStatus("saving");
          sendToHost({ type: "SAVE_FILE", content: msg.html });
        }
        break;
      case "PASTE_IMAGE":
        sendToHost({ type: "PASTE_IMAGE", dataBase64: msg.dataBase64, mimeType: msg.mimeType });
        break;
      case "REQUEST_LINK_URL":
        sendToHost({ type: "GET_LINK_URL", linkText: msg.linkText });
        break;
      case "IMAGE_CLICKED":
        sendToHost({ type: "REQUEST_IMAGE_OPTIONS", imgId: msg.imgId, currentSrc: msg.currentSrc });
        break;
      case "LINK_CLICKED":
        sendToHost({
          type: "REQUEST_LINK_CHANGE",
          linkId: msg.linkId,
          currentHref: msg.currentHref,
          linkText: msg.linkText,
        });
        break;
      case "TAILWIND_CONVERT_RESULT":
        setTailwindConverting(false);
        if (msg.success) setHasTailwindCdn(false);
        break;
      case "HAS_TAILWIND_CDN":
        setHasTailwindCdn(msg.hasTailwindCdn);
        break;
      default:
        break;
    }
  }, [sendToHost, setCssClasses, setCssVariables, setDomTree, setIframeReady, setPanelOpen, setSaveStatus, setSelectedElement, setHasTailwindCdn]);

  const { sendMessage } = usePostMessage(iframeRef, handleMessage);
  const { triggerSave } = useAutoSave(iframeRef, sendToHost);
  sendMessageRef.current = sendMessage;
  triggerSaveRef.current = triggerSave;

  /* -------------------------- external file changes ---------------------- */

  useEffect(() => {
    externalChangeRef.current = (html: string, raw: string) => {
      latestFileHtmlRef.current = raw || html;
      sendMessageRef.current({ type: "REPLACE_DOCUMENT", html, rawHtml: raw });
    };
    return () => {
      externalChangeRef.current = null;
    };
  }, [externalChangeRef]);

  /* --------------------------- source pane events ----------------------- */

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; line: number; column: number }>).detail;
      if (!detail?.path) return;
      setSourcePane({ path: detail.path, line: detail.line, column: detail.column });
    };
    window.addEventListener("rachana:reveal-source", onReveal as EventListener);
    return () => window.removeEventListener("rachana:reveal-source", onReveal as EventListener);
  }, []);

  /* ------------------------------- actions ------------------------------ */

  const requestImmediateFullSave = useCallback(() => {
    window.setTimeout(() => sendMessageRef.current({ type: "GET_FULL_HTML" }), 0);
  }, []);

  useEffect(() => {
    setCreateCssVariable((name: string, value: string) => {
      sendMessageRef.current({ type: "CREATE_VARIABLE", name, value });
    });
    return () => setCreateCssVariable(null);
  }, [setCreateCssVariable]);

  useEffect(() => {
    sendMessage({ type: "CONFIG", styleMode, deviceWidth });
  }, [styleMode, deviceWidth, sendMessage]);

  // Apply an uploaded image to the element/property captured at upload time.
  useEffect(() => {
    if (!uploadedImagePayload) return;
    const targetProperty = pendingUploadPropertyRef.current || "background-image";
    const targetPath = pendingUploadPathRef.current || selectedElement?.path;
    if (!targetPath) {
      clearUploadedImage();
      return;
    }
    const uploadedImagePath = uploadedImagePayload.relativePath;
    const webviewUri = uploadedImagePayload.webviewUri;
    if (targetProperty === "src") {
      sendMessage({
        type: "UPDATE_ATTRIBUTE",
        path: targetPath,
        name: "src",
        value: uploadedImagePath,
        displayValue: webviewUri,
      });
    } else {
      sendMessage({
        type: "UPDATE_STYLE",
        path: targetPath,
        property: targetProperty,
        value: `url('${uploadedImagePath}')`,
        className: selectedClass,
        selector: selectedClass ? `.${selectedClass}${selectedSubSelector || ""}` : null,
      });
    }
    pendingUploadPathRef.current = null;
    clearUploadedImage();
  }, [uploadedImagePayload, selectedElement, selectedClass, selectedSubSelector, sendMessage, clearUploadedImage]);

  useEffect(() => {
    if (!pastedImagePayload) return;
    const timer = setTimeout(() => {
      sendMessage({
        type: "MD_INSERT_IMAGE",
        relativePath: pastedImagePayload.relativePath,
        webviewUri: pastedImagePayload.webviewUri,
      });
      clearPastedImage();
    }, 0);
    return () => clearTimeout(timer);
  }, [pastedImagePayload, sendMessage, clearPastedImage]);

  useEffect(() => {
    if (!linkUrlPayload) return;
    sendMessage({ type: "MD_INSERT_LINK", url: linkUrlPayload.url, linkText: linkUrlPayload.linkText });
    clearLinkUrl();
  }, [linkUrlPayload, sendMessage, clearLinkUrl]);

  useEffect(() => {
    if (!imageUpdatePayload) return;
    sendMessage({
      type: "MD_UPDATE_IMAGE",
      imgId: imageUpdatePayload.imgId,
      src: imageUpdatePayload.src,
      displayValue: imageUpdatePayload.displayValue,
    });
    clearImageUpdate();
  }, [imageUpdatePayload, sendMessage, clearImageUpdate]);

  useEffect(() => {
    if (!linkChangePayload) return;
    sendMessage({ type: "MD_UPDATE_LINK", linkId: linkChangePayload.linkId, href: linkChangePayload.href });
    clearLinkChange();
  }, [linkChangePayload, sendMessage, clearLinkChange]);

  /* ------------------------------- handlers ----------------------------- */

  const handleTreeSelect = useCallback((path: string) => sendMessage({ type: "SELECT_ELEMENT", path }), [sendMessage]);
  const handleTreeHover = useCallback(
    (path: string | null) => sendMessage({ type: "HIGHLIGHT_ELEMENT", path }),
    [sendMessage]
  );

  const handleStyleChange = useCallback(
    (property: string, value: string) => {
      if (!selectedElement) return;
      const hi = useEditorStore.getState().highSpecificity;
      const finalValue = hi && value && !value.includes("!important") ? `${value} !important` : value;
      const selector = selectedClass ? `.${selectedClass}${selectedSubSelector || ""}` : null;
      sendMessage({
        type: "UPDATE_STYLE",
        path: selectedElement.path,
        property,
        value: finalValue,
        className: selectedClass,
        selector,
      });
    },
    [sendMessage, selectedElement, selectedClass, selectedSubSelector]
  );

  const handleDescendantStyleChange = useCallback(
    (path: string, property: string, value: string, className: string | null, selector: string | null) => {
      sendMessage({ type: "UPDATE_STYLE", path, property, value, className, selector });
    },
    [sendMessage]
  );

  const handleInjectKeyframes = useCallback(
    (name: string, css: string) => sendMessage({ type: "INJECT_KEYFRAMES", name, css }),
    [sendMessage]
  );
  const handleInjectLayoutCss = useCallback(
    (path: string, css: string) => sendMessage({ type: "INJECT_LAYOUT_CSS", path, css }),
    [sendMessage]
  );

  const handleDelete = useCallback(() => {
    if (!selectedElement) return;
    sendMessage({ type: "DELETE_ELEMENT", path: selectedElement.path });
    requestImmediateFullSave();
  }, [sendMessage, selectedElement, requestImmediateFullSave]);

  const handleTreeDelete = useCallback(
    (path: string) => {
      sendMessage({ type: "DELETE_ELEMENT", path });
      requestImmediateFullSave();
    },
    [sendMessage, requestImmediateFullSave]
  );

  const handleTagChange = useCallback(
    (path: string, newTag: string) => sendMessage({ type: "CHANGE_TAG", path, newTag }),
    [sendMessage]
  );

  const handleAddClass = useCallback(
    (path: string, className: string) => {
      sendMessage({ type: "ADD_CLASS", path, className });
      setSelectedClass(className);
    },
    [sendMessage, setSelectedClass]
  );

  const handleRemoveClass = useCallback(
    (path: string, className: string) => {
      sendMessage({ type: "REMOVE_CLASS", path, className });
      if (selectedClass === className) {
        setSelectedClass(null);
        setSelectedSubSelector(null);
      }
    },
    [sendMessage, selectedClass, setSelectedClass, setSelectedSubSelector]
  );

  const handleRemoveClassWithStyles = useCallback(
    (path: string, className: string) => {
      sendMessage({ type: "REMOVE_CLASS_WITH_STYLES", path, className });
      if (selectedClass === className) {
        setSelectedClass(null);
        setSelectedSubSelector(null);
      }
    },
    [sendMessage, selectedClass, setSelectedClass, setSelectedSubSelector]
  );

  const handleRenameClass = useCallback(
    (path: string, oldClassName: string, newClassName: string) => {
      sendMessage({ type: "RENAME_CLASS", path, oldClassName, newClassName });
      if (selectedClass === oldClassName) setSelectedClass(newClassName);
    },
    [sendMessage, selectedClass, setSelectedClass]
  );

  const handleSelectedClassChange = useCallback(
    (className: string | null, subSelector: string | null = null) => {
      if (!selectedElement) return;
      setSelectedClass(className);
      setSelectedSubSelector(className ? subSelector : null);
      sendMessage({
        type: "SET_ACTIVE_CLASS",
        path: selectedElement.path,
        className,
        subSelector: className ? subSelector : null,
      });
    },
    [selectedElement, sendMessage, setSelectedClass, setSelectedSubSelector]
  );

  const handleAttributeChange = useCallback(
    (name: string, value: string) => {
      if (!selectedElement) return;
      sendMessage({ type: "UPDATE_ATTRIBUTE", path: selectedElement.path, name, value });
    },
    [sendMessage, selectedElement]
  );

  const handleAttributeRemove = useCallback(
    (name: string) => {
      if (!selectedElement) return;
      sendMessage({ type: "REMOVE_ATTRIBUTE", path: selectedElement.path, name });
    },
    [sendMessage, selectedElement]
  );

  const handleUploadImage = useCallback(
    (property: "background-image" | "mask-image" | "src" = "background-image") => {
      pendingUploadPropertyRef.current = property;
      pendingUploadPathRef.current = selectedElement?.path || null;
      sendToHost({ type: "UPLOAD_IMAGE" });
    },
    [sendToHost, selectedElement]
  );

  const handleDragStart = useCallback((html: string) => setDragState(true, html), [setDragState]);
  const handleDragEnd = useCallback(() => setDragState(false), [setDragState]);
  const handleClose = useCallback(() => {
    sendToHost({ type: "CLOSE_PANEL" });
    onClose();
  }, [sendToHost, onClose]);

  const handleStyleModeChange = useCallback(
    (mode: string) => {
      sendMessage({ type: "CONFIG", styleMode: mode, deviceWidth: useEditorStore.getState().deviceWidth });
      sendToHost({ type: "SET_CONFIG", styleMode: mode });
    },
    [sendMessage, sendToHost]
  );

  const handleStyleScopeChange = useCallback(
    (scope: "global" | "local") => {
      useEditorStore.getState().setStyleScope(scope);
      sendToHost({ type: "SET_CONFIG", styleScope: scope });
    },
    [sendToHost]
  );

  const handleEditorModeChange = useCallback(
    (mode: "edit" | "live") => {
      useEditorStore.getState().setEditorMode(mode);
      if (mode === "live") {
        useEditorStore.getState().setPanelOpen(false);
        sendToHost({ type: "FETCH_LIVE_PREVIEW" });
      } else {
        sendToHost({ type: "STOP_LIVE_RUNTIME" });
      }
    },
    [sendToHost]
  );

  const handleLoadTemplates = useCallback(
    (page: number, limit: number, category: string | null, tag: string | null = null) => {
      sendToHost({ type: "GET_TEMPLATES", page, limit, category, tag });
    },
    [sendToHost]
  );

  const handleImportTemplate = useCallback(
    (id: number) => {
      sendToHost({ type: "GET_TEMPLATE_HTML", id });
    },
    [sendToHost]
  );

  const handleInsertTemplate = useCallback((html: string, templateId?: string) => {
    sendMessageRef.current({
      type: "IMPORT_TEMPLATE",
      html,
      templateId: templateId || `gl-tpl-${Date.now()}`,
    });
  }, []);

  /* ---------------------------------------------------------------------- */

  const showSourcePane = useEditorStore((s) => s.sourcePaneOpen);
  const rejectSaveNotice = Boolean(saveErrorMessage);

  return (
    <div className="relative flex h-screen flex-col bg-shell-950">
      <Toolbar
        filename={filename}
        styleMode={styleMode}
        sendMessage={sendMessage}
        sendToHost={sendToHost}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClose={handleClose}
        onReload={() => sendToHost({ type: "READ_FILE" })}
        onStyleModeChange={handleStyleModeChange}
        onStyleScopeChange={handleStyleScopeChange}
        onEditorModeChange={handleEditorModeChange}
      />

      {(saveErrorMessage || reloadNotice) && (
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-[11px] ${
            rejectSaveNotice
              ? "border-red-500/20 bg-red-500/10 text-red-200"
              : "border-amber-500/20 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle size={13} className={`shrink-0 ${rejectSaveNotice ? "text-red-300" : "text-amber-300"}`} />
            <span className="truncate">
              {saveErrorMessage || reloadNotice}
              {rejectSaveNotice ? " Reload the page to apply new changes." : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => sendToHost({ type: "READ_FILE" })}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              rejectSaveNotice
                ? "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                : "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
            }`}
          >
            Reload
          </button>
        </div>
      )}

      {markdownMode && (
        <div className="flex shrink-0 items-center justify-center border-b border-white/[0.07] bg-shell-900/60 px-4 py-1.5">
          <MarkdownToolbar sendMessage={sendMessage} />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!markdownMode && wireframesPanelOpen && (
          <aside className="w-[276px] shrink-0 overflow-hidden border-r border-white/[0.07]">
            <WireframesPanel
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onLoadTemplates={handleLoadTemplates}
              onImportTemplate={handleImportTemplate}
              onInsertTemplate={handleInsertTemplate}
            />
          </aside>
        )}

        {editorMode === "live" ? (
          <LiveEditor
            filePath={filePath}
            sendToHost={sendToHost}
            livePreviewHtml={livePreviewHtml}
            livePreviewUrl={livePreviewUrl}
            livePreviewError={livePreviewError}
            onReload={() => sendToHost({ type: "FETCH_LIVE_PREVIEW" })}
          />
        ) : (
          <Canvas
            key={sessionKey}
            htmlContent={htmlContent}
            injectScript={injectScript}
            ref={iframeRef}
            sendMessage={sendMessage}
          />
        )}

        {showSourcePane && sourcePane && (
          <SourcePane
            path={sourcePane.path}
            line={sourcePane.line}
            column={sourcePane.column}
            onClose={() => setSourcePane(null)}
          />
        )}

        {!markdownMode && (
          <PropertiesPanel
            element={selectedElement}
            selectedClass={selectedClass}
            selectedSubSelector={selectedSubSelector}
            tree={domTree}
            selectedPath={selectedElement?.path ?? null}
            onTreeSelect={handleTreeSelect}
            onTreeDelete={handleTreeDelete}
            onTreeTagChange={handleTagChange}
            onTreeHover={handleTreeHover}
            onStyleChange={handleStyleChange}
            onDescendantStyleChange={handleDescendantStyleChange}
            onInjectKeyframes={handleInjectKeyframes}
            onInjectLayoutCss={handleInjectLayoutCss}
            onDelete={handleDelete}
            onAddClass={handleAddClass}
            onRemoveClass={handleRemoveClass}
            onRemoveClassWithStyles={handleRemoveClassWithStyles}
            onRenameClass={handleRenameClass}
            onSelectedClassChange={handleSelectedClassChange}
            onUploadImage={handleUploadImage}
            onAttributeChange={handleAttributeChange}
            onAttributeRemove={handleAttributeRemove}
          />
        )}

        {!markdownMode && designSystemPanelOpen && (
          <aside className="w-[300px] shrink-0 overflow-hidden border-l border-white/[0.07]">
            <DesignSystemPanel
              sendMessage={sendMessage}
              sendToHost={sendToHost}
              tailwindConverting={tailwindConverting}
            />
          </aside>
        )}

        {!markdownMode && !isAstroFile && snapshotsPanelOpen && (
          <aside className="w-[276px] shrink-0 overflow-hidden border-l border-white/[0.07]">
            <SnapshotsPanel onRequestCapture={handleSnapshotCapture} onLoadSnapshot={handleLoadSnapshot} />
          </aside>
        )}

        {!markdownMode && animationPanelOpen && (
          <aside className="w-[300px] shrink-0 border-l border-white/[0.07]">
            <AnimationPanel
              onInjectAnimationCSS={(className, css) => sendMessage({ type: "INJECT_ANIMATION_CSS", className, css })}
              onInjectKeyframes={handleInjectKeyframes}
              onInjectObserverScript={(enable) => sendMessage({ type: "INJECT_OBSERVER_SCRIPT", enable })}
              onDeleteAnimationClass={(className) => sendMessage({ type: "INJECT_ANIMATION_CSS", className, css: "" })}
              savedAnimStyles={savedAnimStyles}
            />
          </aside>
        )}
      </div>

      <ConnectPanel sendToHost={sendToHost} rawHtmlContent={rawHtmlContent} />
      <ScreenshotModal htmlContent={htmlContent} sendToHost={sendToHost} />
    </div>
  );
}

/** Small helper used by the settings panel to read the project stylesheet. */
export { loadGlobalCss };

/** Re-export so the shell can publish synthetic host messages if needed. */
export { publishHostMessage };

/** Close button used by the tab strip when the editor is embedded. */
export function EditorCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="rd-icon-btn" title="Close editor" onClick={onClick}>
      <X size={13} />
    </button>
  );
}

/** Icon reused by the tab strip. */
export { FileCode2 };
