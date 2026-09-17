/**
 * Host → UI store fan-out.
 *
 * The ported components are unchanged: they read from the same Zustand stores
 * and switch on the same host message types. This hook is the single place
 * those messages are translated into store updates, plus a small amount of
 * transient per-document state that the original `App.tsx` held in `useState`.
 */

import { useCallback, useEffect, useState } from "react";
import type { HostToWebviewMessage } from "@/types/hostMessages";
import { useEditorStore } from "@/stores/editorStore";
import { useConnectStore } from "@/stores/connectStore";
import { useLicenseStore, toLicenseInfo } from "@/stores/licenseStore";
import { useScreenshotStore } from "@/stores/screenshotStore";
import { subscribeHostMessages } from "./hostEvents";

export interface BridgeState {
  document: {
    displayHtml: string;
    rawHtml: string;
    filename: string;
    filePath: string;
    injectScript: string;
    isMarkdown: boolean;
    isAstro: boolean;
  } | null;
  livePreviewHtml: string | null;
  livePreviewUrl: string | null;
  livePreviewError: string | null;
  uploadedImage: { relativePath: string; webviewUri: string; nonce: number } | null;
  pastedImage: { relativePath: string; webviewUri: string } | null;
  linkUrl: { url: string; linkText: string } | null;
  imageUpdate: { imgId: string; src: string; displayValue?: string } | null;
  linkChange: { linkId: string; href: string } | null;
  saveError: string | null;
}

export const INITIAL_BRIDGE_STATE: BridgeState = {
  document: null,
  livePreviewHtml: null,
  livePreviewUrl: null,
  livePreviewError: null,
  uploadedImage: null,
  pastedImage: null,
  linkUrl: null,
  imageUpdate: null,
  linkChange: null,
  saveError: null,
};

/** Reduce one host message into the transient bridge state. */
export function reduceBridgeState(state: BridgeState, msg: HostToWebviewMessage): BridgeState {
  switch (msg.type) {
    case "FILE_CONTENT":
      return {
        ...INITIAL_BRIDGE_STATE,
        document: {
          displayHtml: msg.content,
          rawHtml: msg.rawHtml ?? msg.content,
          filename: msg.filename,
          filePath: msg.filePath ?? "",
          injectScript: msg.injectScript,
          isMarkdown: !!msg.isMarkdown,
          isAstro: !!msg.isAstro,
        },
      };
    case "SAVE_ERROR":
      return { ...state, saveError: msg.error };
    case "FILE_SAVED":
      return { ...state, saveError: null };
    case "LIVE_PREVIEW":
      return { ...state, livePreviewHtml: msg.html, livePreviewUrl: msg.url, livePreviewError: null };
    case "LIVE_PREVIEW_ERROR":
      return { ...state, livePreviewError: msg.error };
    case "LIVE_STYLE_HISTORY_RESULT":
      return msg.error ? { ...state, livePreviewError: msg.error } : state;
    case "IMAGE_UPLOADED":
      return {
        ...state,
        uploadedImage: { relativePath: msg.relativePath, webviewUri: msg.webviewUri, nonce: Date.now() },
      };
    case "IMAGE_PASTED":
      return { ...state, pastedImage: { relativePath: msg.relativePath, webviewUri: msg.webviewUri } };
    case "LINK_URL":
      return { ...state, linkUrl: { url: msg.url, linkText: msg.linkText } };
    case "IMAGE_OPTIONS_RESULT":
      return { ...state, imageUpdate: { imgId: msg.imgId, src: msg.url, displayValue: msg.url } };
    case "IMAGE_UPLOADED_FOR_IMG":
      return {
        ...state,
        imageUpdate: { imgId: msg.imgId, src: msg.relativePath, displayValue: msg.webviewUri },
      };
    case "LINK_CHANGE_RESULT":
      return { ...state, linkChange: { linkId: msg.linkId, href: msg.href } };
    default:
      return state;
  }
}

/** Reduce one host message into the editor store. */
function applyToEditorStore(msg: HostToWebviewMessage): void {
  const editor = useEditorStore.getState();
  switch (msg.type) {
    case "FILE_CONTENT":
      editor.setMarkdownMode(!!msg.isMarkdown);
      editor.setIsAstroFile(!!msg.isAstro);
      if (msg.styleScope === "global" || msg.styleScope === "local") editor.setStyleScope(msg.styleScope);
      editor.setEditorMode("edit");
      break;
    case "FILE_SAVED":
      editor.setSaveStatus("saved");
      break;
    case "SAVE_ERROR":
      editor.setSaveStatus("unsaved");
      break;
    case "TEMPLATES_DATA":
      editor.setTemplatesResponse(msg);
      break;
    case "TEMPLATE_HTML":
      editor.setTemplateHtml(msg.id, msg.html);
      break;
    case "TEMPLATE_HTML_ERROR":
      editor.setImportingTemplateId(null);
      break;
    case "GOOGLE_FONTS_CATALOG":
      editor.setGoogleFontsCatalog(msg.fonts);
      break;
    case "USER_FONTS_LIST":
      editor.setUserFonts(msg.fonts);
      break;
    case "FONT_UPLOADED":
      editor.setFontUploaded({
        relativePath: msg.relativePath,
        webviewUri: msg.webviewUri,
        family: msg.family,
        nonce: Date.now(),
      });
      break;
    case "EXTERNAL_FILE_CHANGE":
      // Handled by the shell, which still holds the canvas ref.
      break;
    default:
      break;
  }
}

/** Reduce one host message into the connect / screenshot / license stores. */
function applyToFeatureStores(msg: HostToWebviewMessage): void {
  const connect = useConnectStore.getState();
  const license = useLicenseStore.getState();
  const screenshot = useScreenshotStore.getState();

  switch (msg.type) {
    case "CONNECT_SITES_LIST":
      connect.setSites(msg.sites);
      break;
    case "CONNECT_SITE_ADDED":
      connect.addSite(msg.site);
      break;
    case "CONNECT_SITE_REMOVED":
      connect.removeSite(msg.siteId);
      break;
    case "CONNECT_SITE_TEST_RESULT":
      connect.setTestingSiteId(null);
      connect.setSiteTestResult(msg.siteId, {
        success: msg.success,
        error: msg.error,
        siteName: msg.siteName,
      });
      break;
    case "CONNECT_PAGES_LIST":
      if (useConnectStore.getState().exportTarget !== msg.target) break;
      connect.setPages(msg.pages);
      connect.setPagesLoading(false);
      connect.setPagesError(null);
      break;
    case "CONNECT_PAGES_ERROR":
      if (useConnectStore.getState().exportTarget !== msg.target) break;
      connect.setPagesLoading(false);
      connect.setPagesError(msg.error);
      break;
    case "CONNECT_SITE_INFO":
      connect.setSiteThemeInfo(msg.siteId, { isBlockTheme: msg.isBlockTheme, stylesheet: msg.stylesheet });
      break;
    case "CONNECT_EXPORT_PROGRESS":
      connect.setExportProgress(msg.progress);
      break;
    case "CONNECT_EXPORT_COMPLETE":
      connect.setExporting(false);
      connect.setExportResult({ pageUrl: msg.pageUrl, pageId: msg.pageId, target: msg.target });
      break;
    case "CONNECT_EXPORT_ERROR":
      connect.setExporting(false);
      connect.setExportError(msg.error);
      break;
    case "CONNECT_EXPORT_CODE":
      connect.setExporting(false);
      connect.setExportCode(msg.code);
      connect.setCurrentView("code");
      break;
    case "SCREENSHOTS_SAVED":
      screenshot.setSavedFolderName(msg.folderName);
      break;
    case "SCREENSHOTS_SAVE_ERROR":
      screenshot.setSavingToFolder(false);
      break;
    case "LICENSE_STATUS":
      license.setMachineId(msg.machineId);
      license.setDeactivating(false);
      license.setDeactivationError(null);
      if (msg.license) license.setLicense(toLicenseInfo(msg.license, msg.machineId));
      break;
    case "LICENSE_ACTIVATED":
      license.setActivating(false);
      license.setLicense(msg.license as never);
      license.setCurrentView("status");
      break;
    case "LICENSE_ACTIVATION_ERROR":
      license.setActivating(false);
      license.setActivationError(msg.error);
      break;
    case "LICENSE_DEACTIVATED":
      license.setDeactivating(false);
      license.setCurrentView("status");
      break;
    case "LICENSE_DEACTIVATION_ERROR":
      license.setDeactivating(false);
      license.setDeactivationError(msg.error);
      break;
    case "LICENSE_PORTAL_URL":
      license.setPortalLoading(false);
      license.setPortalUrl(msg.portalUrl);
      break;
    case "LICENSE_PORTAL_ERROR":
      license.setPortalLoading(false);
      license.setPortalError(msg.error);
      break;
    default:
      break;
  }
}

/** Bridge state + store fan-out, wired once by the app shell. */
export function useHostMessages(): {
  state: BridgeState;
  /** Clear a transient payload once the canvas has consumed it. */
  clear: (key: keyof BridgeState) => void;
} {
  const [state, setState] = useState<BridgeState>(INITIAL_BRIDGE_STATE);

  useEffect(
    () =>
      subscribeHostMessages((msg) => {
        applyToEditorStore(msg);
        applyToFeatureStores(msg);
        setState((prev) => reduceBridgeState(prev, msg));
      }),
    []
  );

  const clear = useCallback((key: keyof BridgeState) => {
    setState((prev) => ({ ...prev, [key]: INITIAL_BRIDGE_STATE[key] }));
  }, []);

  return { state, clear };
}
