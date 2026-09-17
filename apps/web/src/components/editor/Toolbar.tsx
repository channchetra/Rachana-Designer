import { useEditorStore } from "@/stores/editorStore";
import { useConnectStore } from "@/stores/connectStore";
import { useScreenshotStore } from "@/stores/screenshotStore";
import { DEVICE_PRESETS, BLOCK_TEMPLATES } from "@/types/editor";
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  RotateCcw,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  Plus,
  List,
  PanelRight,
  Settings,
  Heading,
  AlignLeft,
  MousePointerClick,
  Image,
  LayoutTemplate,
  Square,
  Zap,
  LayoutGrid,
  Paintbrush,
  Camera,
  History,
  FolderOpen,
  ExternalLink,
  FilePlus,
  X,
  FileText,
  Edit3,
  Globe,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { ParentToIframeMessage } from "@/types/editor";
import { WebviewToHostMessage } from "@/types/hostMessages";
import { useState, useRef, useEffect, useCallback } from "react";

const deviceIconMap: Record<string, LucideIcon> = {
  Monitor,
  Tablet,
  Smartphone,
};

const blockIconMap: Record<string, LucideIcon> = {
  Heading,
  AlignLeft,
  MousePointerClick,
  Image,
  LayoutTemplate,
  Square,
};

interface ToolbarProps {
  filename: string;
  styleMode: string;
  sendMessage: (msg: ParentToIframeMessage) => void;
  sendToHost: (msg: WebviewToHostMessage) => void;
  onDragStart: (html: string) => void;
  onDragEnd: () => void;
  onClose: () => void;
  onReload: () => void;
  onStyleModeChange: (mode: string) => void;
  onStyleScopeChange: (scope: "global" | "local") => void;
  onEditorModeChange: (mode: "edit" | "live") => void;
}

export function Toolbar({ filename, styleMode, sendMessage, sendToHost, onDragStart, onDragEnd, onClose, onReload, onStyleModeChange, onStyleScopeChange, onEditorModeChange }: ToolbarProps) {
  const {
    deviceWidth,
    setDeviceWidth,
    saveStatus,
    panelOpen,
    togglePanel,
    openPanelManually,
    elementsTreeOpen,
    toggleElementsTree,
    animationPanelOpen,
    toggleAnimationPanel,
    wireframesPanelOpen,
    toggleWireframesPanel,
    designSystemPanelOpen,
    toggleDesignSystemPanel,
    snapshotsPanelOpen,
    toggleSnapshotsPanel,
    markdownMode,
    isAstroFile,
    editorMode,
    styleScope,
  } = useEditorStore();
  const { connectPanelOpen, toggleConnectPanel } = useConnectStore();
  const { toggleModal: toggleScreenshotModal } = useScreenshotStore();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folderFiles, setFolderFiles] = useState<{ name: string; ext: string }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileExt, setNewFileExt] = useState(".html");
  const [createError, setCreateError] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const openFolderBrowser = useCallback(() => {
    setShowFolderBrowser(true);
    sendToHost({ type: "GET_FOLDER_FILES" });
  }, [sendToHost]);

  useEffect(() => {
    function handleFolderMsg(event: MessageEvent) {
      const msg = event.data;
      if (!msg?.type) return;
      if (msg.type === "FOLDER_FILES_LIST") {
        setFolderFiles(msg.files);
      } else if (msg.type === "FILE_CREATED") {
        setShowCreateModal(false);
        setShowFolderBrowser(false);
        setNewFileName("");
        setCreateError(null);
      } else if (msg.type === "FILE_CREATE_ERROR") {
        setCreateError(msg.error);
      }
    }
    window.addEventListener("message", handleFolderMsg);
    return () => window.removeEventListener("message", handleFolderMsg);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
      if (folderRef.current && !folderRef.current.contains(e.target as Node) && !showCreateModal) {
        setShowFolderBrowser(false);
      }
    }
    if (showAddMenu || showSettings || showFolderBrowser) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showAddMenu, showSettings, showFolderBrowser, showCreateModal]);

  const statusIcon = {
    saved: <Check size={14} className="text-emerald-500" />,
    saving: <Loader2 size={14} className="text-amber-500 animate-spin" />,
    unsaved: <AlertCircle size={14} className="text-amber-500" />,
  };

  const statusText = {
    saved: "Saved",
    saving: "Saving...",
    unsaved: "Unsaved changes",
  };
  const snapshotsActive = snapshotsPanelOpen;
  const isHtmlFile = /\.html?$/i.test(filename);

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 h-12 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Close visual editor"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="h-5 w-px bg-zinc-700" />
        <div className="relative" ref={folderRef}>
          <button
            onClick={() => showFolderBrowser ? setShowFolderBrowser(false) : openFolderBrowser()}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              showFolderBrowser
                ? "text-emerald-400 bg-emerald-950"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
            title="Browse folder files"
          >
            <FolderOpen size={15} />
          </button>
          {showFolderBrowser && (
            <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  setNewFileName("");
                  setNewFileExt(".html");
                  setCreateError(null);
                  setTimeout(() => newFileInputRef.current?.focus(), 50);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-emerald-400 hover:bg-zinc-700 transition-colors border-b border-zinc-700"
              >
                <FilePlus size={14} />
                <span>Create new file</span>
              </button>
              <div className="max-h-64 overflow-y-auto">
                {folderFiles.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-zinc-500 text-center">No supported files found</div>
                ) : (
                  folderFiles.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => {
                        sendToHost({ type: "OPEN_FILE", filename: file.name });
                        setShowFolderBrowser(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                        file.name === filename
                          ? "text-emerald-400 bg-emerald-950/50"
                          : "text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      <FileText size={13} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="ml-auto text-[10px] text-zinc-500">{file.ext}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {isHtmlFile && (
          <button
            onClick={() => sendToHost({ type: "OPEN_CURRENT_FILE_IN_BROWSER" })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Open current file in browser"
          >
            <ExternalLink size={15} />
          </button>
        )}
        <span className="text-sm font-medium text-zinc-200">{filename}</span>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          {statusIcon[saveStatus]}
          <span>{statusText[saveStatus]}</span>
        </div>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setCreateError(null); } }}>
            <div className="w-80 rounded-xl border border-zinc-700 bg-zinc-800 p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-200">Create New File</h3>
                <button onClick={() => { setShowCreateModal(false); setCreateError(null); }} className="text-zinc-400 hover:text-zinc-200 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">File name</label>
                  <input
                    ref={newFileInputRef}
                    type="text"
                    value={newFileName}
                    onChange={(e) => { setNewFileName(e.target.value); setCreateError(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFileName.trim()) {
                        sendToHost({ type: "CREATE_FILE", filename: newFileName.trim() + newFileExt });
                      }
                    }}
                    placeholder="my-page"
                    className="w-full px-2.5 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-600 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Extension</label>
                  <div className="flex gap-1.5">
                    {[".html", ".md", ".mdx", ".astro"].map((ext) => (
                      <button
                        key={ext}
                        onClick={() => setNewFileExt(ext)}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          newFileExt === ext
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                        }`}
                      >
                        {ext}
                      </button>
                    ))}
                  </div>
                </div>
                {createError && (
                  <p className="text-xs text-red-400">{createError}</p>
                )}
                <button
                  onClick={() => {
                    if (newFileName.trim()) {
                      sendToHost({ type: "CREATE_FILE", filename: newFileName.trim() + newFileExt });
                    }
                  }}
                  disabled={!newFileName.trim()}
                  className="w-full py-1.5 text-xs font-medium rounded-md transition-colors bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Create {newFileName.trim() ? newFileName.trim() + newFileExt : "file"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => editorMode === "live" ? sendToHost({ type: "LIVE_STYLE_UNDO" }) : sendMessage({ type: "UNDO" })}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={() => editorMode === "live" ? sendToHost({ type: "LIVE_STYLE_REDO" }) : sendMessage({ type: "REDO" })}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Redo"
        >
          <Redo2 size={16} />
        </button>
        <button
          onClick={onReload}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Hard reload editor"
        >
          <RotateCcw size={16} />
        </button>

        {!markdownMode && (
          <>
            <div className="h-5 w-px bg-zinc-700 mx-1" />

            {DEVICE_PRESETS.map((preset) => {
              const Icon = deviceIconMap[preset.icon];
              const isActive = deviceWidth === preset.width;
              return (
                <button
                  key={preset.label}
                  onClick={() => setDeviceWidth(preset.width)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? "text-emerald-400 bg-emerald-950"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                  title={preset.label}
                >
                  {Icon && <Icon size={16} />}
                </button>
              );
            })}
            {deviceWidth !== null && (
              <span className="text-[10px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded ml-0.5">
                @{deviceWidth}px
              </span>
            )}

            <div className="h-5 w-px bg-zinc-700 mx-1" />

            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  showAddMenu
                    ? "text-emerald-400 bg-emerald-950"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="Add block"
              >
                <Plus size={16} />
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl z-50">
                  {BLOCK_TEMPLATES.map((block) => {
                    const Icon = blockIconMap[block.icon];
                    return (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/html", block.html);
                          e.dataTransfer.effectAllowed = "copy";
                          onDragStart(block.html);
                        }}
                        onDragEnd={() => {
                          onDragEnd();
                          setShowAddMenu(false);
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 cursor-grab hover:bg-zinc-700 active:cursor-grabbing transition-colors"
                      >
                        {Icon && <Icon size={14} className="text-zinc-400" />}
                        <span>{block.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {editorMode === "edit" && (
            <button
              onClick={() => {
                toggleElementsTree();
                if (!elementsTreeOpen && !panelOpen) openPanelManually();
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                elementsTreeOpen
                  ? "text-emerald-400 bg-emerald-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Elements tree"
            >
              <List size={16} />
            </button>
            )}

            <button
              onClick={toggleWireframesPanel}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                wireframesPanelOpen
                  ? "text-emerald-400 bg-emerald-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Wireframes"
            >
              <LayoutGrid size={16} />
            </button>

            {editorMode === "edit" && (
            <button
              onClick={toggleDesignSystemPanel}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                designSystemPanelOpen
                  ? "text-teal-400 bg-teal-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Design System Variables"
            >
              <Paintbrush size={16} />
            </button>
            )}

            <button
              onClick={toggleAnimationPanel}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                animationPanelOpen
                  ? "text-violet-400 bg-violet-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Animation classes"
            >
              <Zap size={16} />
            </button>

            {editorMode === "edit" && (
            <button
              onClick={toggleScreenshotModal}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Screenshot tool"
            >
              <Camera size={16} />
            </button>
            )}

            {editorMode === "edit" && !isAstroFile && (
            <button
              onClick={toggleSnapshotsPanel}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                snapshotsActive
                  ? "text-amber-400 bg-amber-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Snapshots"
            >
              <History size={16} />
            </button>
            )}

            <button
              onClick={togglePanel}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                panelOpen
                  ? "text-emerald-400 bg-emerald-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
              title="Toggle panel"
            >
              <PanelRight size={16} />
            </button>

            <div className="h-5 w-px bg-zinc-700 mx-1" />

            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  showSettings
                    ? "text-emerald-400 bg-emerald-950"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                title="Settings"
              >
                <Settings size={16} />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-800 py-2 shadow-xl z-50">
                  <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Style mode
                  </div>
                  <button
                    onClick={() => { onStyleModeChange("class"); setShowSettings(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                      styleMode === "class"
                        ? "text-emerald-400 bg-emerald-950/50"
                        : "text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                      styleMode === "class" ? "border-emerald-400" : "border-zinc-500"
                    }`}>
                      {styleMode === "class" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </div>
                    <div className="text-left">
                      <div>Class</div>
                      <div className="text-[10px] text-zinc-500">Add styles to CSS classes</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { onStyleModeChange("inline"); setShowSettings(false); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                      styleMode === "inline"
                        ? "text-emerald-400 bg-emerald-950/50"
                        : "text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                      styleMode === "inline" ? "border-emerald-400" : "border-zinc-500"
                    }`}>
                      {styleMode === "inline" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </div>
                    <div className="text-left">
                      <div>Inline</div>
                      <div className="text-[10px] text-zinc-500">Add styles as inline attributes</div>
                    </div>
                  </button>
                  {isAstroFile && (
                    <>
                      <div className="mx-2 my-2 h-px bg-zinc-700" />
                      <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Style scope
                      </div>
                      <button
                        onClick={() => { onStyleScopeChange("local"); setShowSettings(false); }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                          styleScope === "local"
                            ? "text-emerald-400 bg-emerald-950/50"
                            : "text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        <Lock size={12} className={styleScope === "local" ? "text-emerald-400" : "text-zinc-500"} />
                        <div className="text-left">
                          <div>Local</div>
                          <div className="text-[10px] text-zinc-500">Save into &lt;style&gt; in this file</div>
                        </div>
                      </button>
                      <button
                        onClick={() => { onStyleScopeChange("global"); setShowSettings(false); }}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
                          styleScope === "global"
                            ? "text-emerald-400 bg-emerald-950/50"
                            : "text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        <Globe size={12} className={styleScope === "global" ? "text-emerald-400" : "text-zinc-500"} />
                        <div className="text-left">
                          <div>Global</div>
                          <div className="text-[10px] text-zinc-500">Save into src/styles/global.css</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {isAstroFile && (
          <>
            <div className="h-5 w-px bg-zinc-700 mx-1" />
            <div className="flex h-7 rounded-md border border-zinc-700 bg-zinc-900 p-0.5 text-[11px]">
              <button
                onClick={() => onEditorModeChange("edit")}
                className={`flex items-center gap-1 rounded-sm px-2 transition-colors ${
                  editorMode === "edit" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Edit mode"
              >
                <Edit3 size={12} />
                Edit
              </button>
              <button
                onClick={() => onEditorModeChange("live")}
                className={`flex items-center gap-1 rounded-sm px-2 transition-colors ${
                  editorMode === "live" ? "bg-emerald-600 text-zinc-50" : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="Live preview mode (Astro dev server)"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${editorMode === "live" ? "bg-white animate-pulse" : "bg-zinc-500"}`} />
                Live
              </button>
            </div>
          </>
        )}

        <button
          onClick={toggleConnectPanel}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            connectPanelOpen
              ? "text-emerald-400 bg-emerald-950"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          }`}
          title="WordPress Export"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zM3.443 12c0-1.584.436-3.065 1.189-4.34l3.278 8.98A8.563 8.563 0 013.443 12zm8.557 8.557c-.924 0-1.814-.147-2.649-.416l2.813-8.17 2.882 7.896c.019.047.042.089.065.13a8.518 8.518 0 01-3.111.56zm1.307-12.57c.564-.03 1.072-.089 1.072-.089.506-.06.446-.803-.059-.773 0 0-1.52.119-2.5.119-.921 0-2.47-.119-2.47-.119-.505-.03-.565.743-.059.773 0 0 .478.06 .982.089L11.86 12l-2.156 6.467-2.408-7.165L8.291 7.987c.565-.03 1.072-.089 1.072-.089.506-.06.446-.803-.06-.773 0 0-1.518.119-2.5.119a5.265 5.265 0 01-.381-.01A8.533 8.533 0 0112 3.443c2.096 0 4.008.76 5.49 2.016a.197.197 0 00-.025.002c-.921 0-1.574.803-1.574 1.664 0 .773.445 1.426.922 2.199.357.624.773 1.426.773 2.583 0 .803-.307 1.732-.713 3.03l-.935 3.121-2.631-7.838zm4.474 10.15l2.139-6.176c.4-1 .703-1.793.703-2.505 0-.258-.017-.496-.047-.717A8.555 8.555 0 0120.557 12a8.54 8.54 0 01-2.776 6.337z"/></svg>
        </button>
      </div>
    </div>
  );
}
