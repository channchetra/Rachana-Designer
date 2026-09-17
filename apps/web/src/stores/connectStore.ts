/**
 * WordPress connect store.
 *
 * Ported from the original webview's `connectStore` with two additions for the
 * standalone build:
 *  - `transport` / `proxyPrefix`, because a browser cannot send Basic auth to a
 *    cross-origin WordPress site without CORS or a proxy,
 *  - `cancelRequested`, so the in-page export pipeline has a cancellation flag
 *    like the original host had.
 */

import { create } from "zustand";
import type {
  ExportProgressInfo,
  ExternalAssetsMode,
  WPExportMode,
  WPExportResult,
  WPExportTarget,
  WPPageInfo,
  WPSiteInfo,
  WPSiteThemeInfo,
  WordPressTransport,
} from "@/types/connect";
import { DEFAULT_TRANSPORT_CONFIG } from "@/types/connect";

export type ConnectView = "home" | "sites" | "pages" | "options" | "progress" | "code";

interface ConnectState {
  connectPanelOpen: boolean;
  setConnectPanelOpen: (open: boolean) => void;
  toggleConnectPanel: () => void;

  currentView: ConnectView;
  setCurrentView: (view: ConnectView) => void;

  sites: WPSiteInfo[];
  setSites: (sites: WPSiteInfo[]) => void;
  addSite: (site: WPSiteInfo) => void;
  removeSite: (siteId: string) => void;

  selectedSiteId: string | null;
  setSelectedSiteId: (id: string | null) => void;

  testingSiteId: string | null;
  setTestingSiteId: (id: string | null) => void;
  siteTestResults: Record<string, { success: boolean; error?: string; siteName?: string }>;
  setSiteTestResult: (siteId: string, result: { success: boolean; error?: string; siteName?: string }) => void;

  pages: WPPageInfo[];
  setPages: (pages: WPPageInfo[]) => void;
  pagesLoading: boolean;
  setPagesLoading: (loading: boolean) => void;
  pagesError: string | null;
  setPagesError: (error: string | null) => void;

  selectedPageId: number | string | "new" | null;
  setSelectedPageId: (id: number | string | "new" | null) => void;
  newPageTitle: string;
  setNewPageTitle: (title: string) => void;

  exportTarget: WPExportTarget;
  setExportTarget: (target: WPExportTarget) => void;

  siteThemeInfo: Record<string, WPSiteThemeInfo>;
  setSiteThemeInfo: (siteId: string, info: WPSiteThemeInfo) => void;

  exportMode: WPExportMode;
  setExportMode: (v: WPExportMode) => void;
  exportMedia: boolean;
  setExportMedia: (v: boolean) => void;
  exportVariables: boolean;
  setExportVariables: (v: boolean) => void;
  convertToClasses: boolean;
  setConvertToClasses: (v: boolean) => void;
  wrapFullWidth: boolean;
  setWrapFullWidth: (v: boolean) => void;
  externalAssetsMode: ExternalAssetsMode;
  setExternalAssetsMode: (v: ExternalAssetsMode) => void;
  skipExistingMedia: boolean;
  setSkipExistingMedia: (v: boolean) => void;
  uploadCssAssets: boolean;
  setUploadCssAssets: (v: boolean) => void;
  exportFonts: boolean;
  setExportFonts: (v: boolean) => void;

  exporting: boolean;
  setExporting: (v: boolean) => void;
  exportProgress: ExportProgressInfo | null;
  setExportProgress: (progress: ExportProgressInfo | null) => void;
  exportResult: WPExportResult | null;
  setExportResult: (result: WPExportResult | null) => void;
  exportError: string | null;
  setExportError: (error: string | null) => void;
  exportCode: string | null;
  setExportCode: (code: string | null) => void;

  /** Set by the user cancelling a running export. */
  cancelRequested: boolean;
  requestCancel: () => void;
  clearCancel: () => void;

  /** Browser transport for the WordPress REST API. */
  transport: WordPressTransport;
  proxyPrefix: string;
  setTransport: (t: WordPressTransport, proxyPrefix?: string) => void;

  resetExport: () => void;
}

export const useConnectStore = create<ConnectState>((set) => ({
  connectPanelOpen: false,
  setConnectPanelOpen: (open) => set({ connectPanelOpen: open }),
  toggleConnectPanel: () => set((s) => ({ connectPanelOpen: !s.connectPanelOpen })),

  currentView: "home",
  setCurrentView: (view) => set({ currentView: view }),

  sites: [],
  setSites: (sites) => set({ sites }),
  addSite: (site) => set((s) => ({ sites: [...s.sites, site] })),
  removeSite: (siteId) => set((s) => ({ sites: s.sites.filter((x) => x.id !== siteId) })),

  selectedSiteId: null,
  setSelectedSiteId: (id) => set({ selectedSiteId: id }),

  testingSiteId: null,
  setTestingSiteId: (id) => set({ testingSiteId: id }),
  siteTestResults: {},
  setSiteTestResult: (siteId, result) =>
    set((s) => ({ siteTestResults: { ...s.siteTestResults, [siteId]: result } })),

  pages: [],
  setPages: (pages) => set({ pages }),
  pagesLoading: false,
  setPagesLoading: (loading) => set({ pagesLoading: loading }),
  pagesError: null,
  setPagesError: (error) => set({ pagesError: error }),

  selectedPageId: null,
  setSelectedPageId: (id) => set({ selectedPageId: id }),
  newPageTitle: "",
  setNewPageTitle: (title) => set({ newPageTitle: title }),

  exportTarget: "page",
  setExportTarget: (target) =>
    set({ exportTarget: target, selectedPageId: null, newPageTitle: "", pages: [], pagesError: null }),

  siteThemeInfo: {},
  setSiteThemeInfo: (siteId, info) =>
    set((s) => ({ siteThemeInfo: { ...s.siteThemeInfo, [siteId]: info } })),

  exportMode: "blocks",
  setExportMode: (v) => set({ exportMode: v }),
  exportMedia: false,
  setExportMedia: (v) => set({ exportMedia: v }),
  exportVariables: true,
  setExportVariables: (v) => set({ exportVariables: v }),
  convertToClasses: true,
  setConvertToClasses: (v) => set({ convertToClasses: v }),
  wrapFullWidth: false,
  setWrapFullWidth: (v) => set({ wrapFullWidth: v }),
  externalAssetsMode: "html_block",
  setExternalAssetsMode: (v) => set({ externalAssetsMode: v }),
  skipExistingMedia: true,
  setSkipExistingMedia: (v) => set({ skipExistingMedia: v }),
  uploadCssAssets: true,
  setUploadCssAssets: (v) => set({ uploadCssAssets: v }),
  exportFonts: true,
  setExportFonts: (v) => set({ exportFonts: v }),

  exporting: false,
  setExporting: (v) => set({ exporting: v }),
  exportProgress: null,
  setExportProgress: (progress) => set({ exportProgress: progress }),
  exportResult: null,
  setExportResult: (result) => set({ exportResult: result }),
  exportError: null,
  setExportError: (error) => set({ exportError: error }),
  exportCode: null,
  setExportCode: (code) => set({ exportCode: code }),

  cancelRequested: false,
  requestCancel: () => set({ cancelRequested: true }),
  clearCancel: () => set({ cancelRequested: false }),

  transport: DEFAULT_TRANSPORT_CONFIG.transport,
  proxyPrefix: DEFAULT_TRANSPORT_CONFIG.proxyPrefix,
  setTransport: (t, proxyPrefix) =>
    set((s) => ({ transport: t, proxyPrefix: proxyPrefix ?? s.proxyPrefix })),

  resetExport: () =>
    set({ exporting: false, exportProgress: null, exportResult: null, exportError: null, exportCode: null, cancelRequested: false }),
}));

/** Persisted store keys for the connect settings. */
export const CONNECT_STORAGE_KEY = "rachana:wp-connect";
