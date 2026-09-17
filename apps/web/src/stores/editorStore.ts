import { create } from "zustand";
import { DomNode, StyleInfo, SaveStatus, CssVariable, CssClassInfo, TemplateItem, TemplatesResponse, UsedFont } from "@/types/editor";
import { GoogleFontCatalogEntry, UserFontInfo } from "@/types/hostMessages";

const AUTO_OPEN_PANEL_KEY = "rachana:auto-open-properties-panel";

function readAutoOpenPanelPreference() {
  if (typeof window === "undefined") return true;
  const saved = window.sessionStorage.getItem(AUTO_OPEN_PANEL_KEY);
  return saved === null ? true : saved === "true";
}

function writeAutoOpenPanelPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTO_OPEN_PANEL_KEY, String(enabled));
}

interface EditorState {
  selectedElement: StyleInfo | null;
  setSelectedElement: (el: StyleInfo | null) => void;
  selectedClass: string | null;
  setSelectedClass: (className: string | null) => void;
  selectedSubSelector: string | null;
  setSelectedSubSelector: (subSelector: string | null) => void;

  domTree: DomNode | null;
  setDomTree: (tree: DomNode | null) => void;

  deviceWidth: number | null;
  setDeviceWidth: (w: number | null) => void;

  saveStatus: SaveStatus;
  setSaveStatus: (s: SaveStatus) => void;

  isDragging: boolean;
  dragBlockHtml: string | null;
  setDragState: (dragging: boolean, html?: string | null) => void;

  iframeReady: boolean;
  setIframeReady: (ready: boolean) => void;

  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  autoOpenPanelOnSelect: boolean;
  setAutoOpenPanelOnSelect: (enabled: boolean) => void;
  togglePanel: () => void;
  openPanelManually: () => void;
  closePanelManually: () => void;

  elementsTreeOpen: boolean;
  toggleElementsTree: () => void;

  animationPanelOpen: boolean;
  toggleAnimationPanel: () => void;

  wireframesPanelOpen: boolean;
  toggleWireframesPanel: () => void;

  designSystemPanelOpen: boolean;
  toggleDesignSystemPanel: () => void;

  templates: TemplateItem[];
  templateCategories: string[];
  templatePage: number;
  templatePages: number;
  templateTotal: number;
  templateError: string | null;
  importingTemplateId: number | null;
  setTemplatesResponse: (data: TemplatesResponse) => void;
  setTemplateHtml: (id: number, html: string) => void;
  setImportingTemplateId: (id: number | null) => void;

  cssVariables: CssVariable[];
  setCssVariables: (vars: CssVariable[]) => void;

  cssClasses: CssClassInfo[];
  setCssClasses: (classes: CssClassInfo[]) => void;

  usedFonts: UsedFont[];
  setUsedFonts: (fonts: UsedFont[]) => void;

  userFonts: UserFontInfo[];
  setUserFonts: (fonts: UserFontInfo[]) => void;

  googleFontsCatalog: GoogleFontCatalogEntry[];
  setGoogleFontsCatalog: (fonts: GoogleFontCatalogEntry[]) => void;

  /** Result of an UPLOAD_FONT / PICK_USER_FONT host round-trip. */
  fontUploaded: { relativePath: string; webviewUri: string; family: string; nonce: number } | null;
  setFontUploaded: (payload: { relativePath: string; webviewUri: string; family: string; nonce: number } | null) => void;

  /** Callback to create a new CSS variable — set by EditorShell */
  createCssVariable: ((name: string, value: string) => void) | null;
  setCreateCssVariable: (fn: ((name: string, value: string) => void) | null) => void;

  markdownMode: boolean;
  setMarkdownMode: (enabled: boolean) => void;

  /** True when the active file has a `.astro` extension. Drives Live-mode toggle visibility and scope routing UI. */
  isAstroFile: boolean;
  setIsAstroFile: (enabled: boolean) => void;

  /** "edit" = current iframe-based editor; "live" = Astro dev-server preview with click-to-edit. Astro-only. */
  editorMode: "edit" | "live";
  setEditorMode: (mode: "edit" | "live") => void;

  /** Where new CSS rules go on save: "local" = <style data-gl-editor> in current file; "global" = src/styles/global.css. */
  styleScope: "global" | "local";
  setStyleScope: (scope: "global" | "local") => void;

  highSpecificity: boolean;
  toggleHighSpecificity: () => void;

  hasTailwindCdn: boolean;
  setHasTailwindCdn: (has: boolean) => void;

  snapshotsPanelOpen: boolean;
  toggleSnapshotsPanel: () => void;

  /**
   * Rachana-specific: the built-in source pane replaces VS Code's split editor
   * for Live-mode source reveals.
   */
  sourcePaneOpen: boolean;
  setSourcePaneOpen: (open: boolean) => void;
  toggleSourcePane: () => void;  snapshots: { id: string; name: string; html: string; timestamp: number }[];
  setSnapshots: (snapshots: { id: string; name: string; html: string; timestamp: number }[]) => void;
  addSnapshot: (html: string) => void;
  renameSnapshot: (id: string, name: string) => void;
  deleteSnapshot: (id: string) => void;
  updateSnapshotHtml: (id: string, html: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedElement: null,
  setSelectedElement: (el) =>
    set({
      selectedElement: el,
      selectedClass: el?.selectedClass ?? null,
      selectedSubSelector: el?.selectedSubSelector ?? null,
    }),
  selectedClass: null,
  setSelectedClass: (className) => set({ selectedClass: className }),
  selectedSubSelector: null,
  setSelectedSubSelector: (subSelector) => set({ selectedSubSelector: subSelector }),

  domTree: null,
  setDomTree: (tree) => set({ domTree: tree }),

  deviceWidth: null,
  setDeviceWidth: (w) => set({ deviceWidth: w }),

  saveStatus: "saved",
  setSaveStatus: (s) => set({ saveStatus: s }),

  isDragging: false,
  dragBlockHtml: null,
  setDragState: (dragging, html) =>
    set({ isDragging: dragging, dragBlockHtml: html || null }),

  iframeReady: false,
  setIframeReady: (ready) => set({ iframeReady: ready }),

  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open }),
  autoOpenPanelOnSelect: readAutoOpenPanelPreference(),
  setAutoOpenPanelOnSelect: (enabled) => {
    writeAutoOpenPanelPreference(enabled);
    set({ autoOpenPanelOnSelect: enabled });
  },
  togglePanel: () =>
    set((s) => {
      const nextOpen = !s.panelOpen;
      writeAutoOpenPanelPreference(nextOpen);
      return {
        panelOpen: nextOpen,
        autoOpenPanelOnSelect: nextOpen,
      };
    }),
  openPanelManually: () => {
    writeAutoOpenPanelPreference(true);
    set({ panelOpen: true, autoOpenPanelOnSelect: true });
  },
  closePanelManually: () => {
    writeAutoOpenPanelPreference(false);
    set({ panelOpen: false, autoOpenPanelOnSelect: false });
  },

  elementsTreeOpen: false,
  toggleElementsTree: () => set((s) => ({ elementsTreeOpen: !s.elementsTreeOpen })),

  animationPanelOpen: false,
  toggleAnimationPanel: () => set((s) => ({ animationPanelOpen: !s.animationPanelOpen })),

  wireframesPanelOpen: false,
  toggleWireframesPanel: () => set((s) => ({ wireframesPanelOpen: !s.wireframesPanelOpen })),

  designSystemPanelOpen: false,
  toggleDesignSystemPanel: () => set((s) => ({ designSystemPanelOpen: !s.designSystemPanelOpen })),

  templates: [],
  templateCategories: [],
  templatePage: 0,
  templatePages: 0,
  templateTotal: 0,
  templateError: null,
  importingTemplateId: null,
  setTemplatesResponse: (data) =>
    set((s) => ({
      templates: data.page === 1 ? data.templates : [...s.templates, ...data.templates],
      templateCategories: data.categories,
      templatePage: data.page,
      templatePages: data.pages,
      templateTotal: data.total,
      templateError: data.error ?? null,
    })),
  setTemplateHtml: (id, html) =>
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, html } : t)),
      importingTemplateId: null,
    })),
  setImportingTemplateId: (id) => set({ importingTemplateId: id }),

  cssVariables: [],
  setCssVariables: (vars) => set({ cssVariables: vars }),

  cssClasses: [],
  setCssClasses: (classes) => set({ cssClasses: classes }),

  usedFonts: [],
  setUsedFonts: (fonts) => set({ usedFonts: fonts }),

  userFonts: [],
  setUserFonts: (fonts) => set({ userFonts: fonts }),

  googleFontsCatalog: [],
  setGoogleFontsCatalog: (fonts) => set({ googleFontsCatalog: fonts }),

  fontUploaded: null,
  setFontUploaded: (payload) => set({ fontUploaded: payload }),

  createCssVariable: null,
  setCreateCssVariable: (fn) => set({ createCssVariable: fn }),

  markdownMode: false,
  setMarkdownMode: (enabled) => set({ markdownMode: enabled }),

  isAstroFile: false,
  setIsAstroFile: (enabled) => set({ isAstroFile: enabled }),

  editorMode: "edit",
  setEditorMode: (mode) => set({ editorMode: mode }),

  styleScope: "local",
  setStyleScope: (scope) => set({ styleScope: scope }),

  highSpecificity: false,
  toggleHighSpecificity: () => set((s) => ({ highSpecificity: !s.highSpecificity })),

  hasTailwindCdn: false,
  setHasTailwindCdn: (has) => set({ hasTailwindCdn: has }),

  snapshotsPanelOpen: false,
  toggleSnapshotsPanel: () => set((s) => ({ snapshotsPanelOpen: !s.snapshotsPanelOpen })),

  sourcePaneOpen: false,
  setSourcePaneOpen: (open) => set({ sourcePaneOpen: open }),
  toggleSourcePane: () => set((s) => ({ sourcePaneOpen: !s.sourcePaneOpen })),
  snapshots: [],
  setSnapshots: (snapshots) => set({ snapshots }),
  addSnapshot: (html) =>
    set((s) => ({
      // Use a collision-resistant id so updates target one snapshot only.
      // Date.now() alone can collide when snapshots are created rapidly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshots: (() => {
        const uniqueId = "snap-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        return [
          ...s.snapshots,
          { id: uniqueId, name: "Snapshot " + (s.snapshots.length + 1), html, timestamp: Date.now() },
        ];
      })(),
    })),
  renameSnapshot: (id, name) =>
    set((s) => ({
      snapshots: s.snapshots.map((snap) => (snap.id === id ? { ...snap, name } : snap)),
    })),
  deleteSnapshot: (id) =>
    set((s) => ({ snapshots: s.snapshots.filter((snap) => snap.id !== id) })),
  updateSnapshotHtml: (id, html) =>
    set((s) => ({
      snapshots: s.snapshots.map((snap) => (snap.id === id ? { ...snap, html, timestamp: Date.now() } : snap)),
    })),
}));
