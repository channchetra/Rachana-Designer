/**
 * Host bridge (React).
 *
 * Owns the single `EditorSession`, dispatches every `WebviewToHostMessage` the
 * UI sends, and exposes the small amount of host→UI state that the original
 * webview kept in `App.tsx`.
 *
 * This is the browser replacement for the extension's `MessageHandler` +
 * `webview.onDidReceiveMessage` pair. It is deliberately a context value rather
 * than a module singleton so tests can mount an isolated bridge.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Workspace } from "@/platform/fs/types";
import {
  SUPPORTED_EDITOR_EXTS,
  base64ToBytes,
  basename,
  bytesToDataUri,
  dirname,
  extname,
  joinPath,
  mimeForPath,
} from "@/platform/fs/types";
import type { HostToWebviewMessage, WebviewToHostMessage } from "@/types/hostMessages";
import { EditorSession } from "./editorSession";
import { appConfig } from "./config";
import { WorkspaceFontLibrary } from "@/features/fonts/library";
import { fetchGoogleFontsCatalog } from "@/utils/fonts";
import { DEFAULT_LIBRARY_URL, getLibraryUrl, loadTemplateHtml, loadTemplates } from "@/features/templates/library";
import { handleLicenseMessage } from "./licenseHandler";
import { readString } from "./config";
import { handleLiveMessage, resetLiveHistory } from "./liveRuntime";
import { SCAFFOLD_HTML } from "./scaffold";
import { copyTextToClipboard } from "@/platform/fs/browserIo";
import { publishHostMessage } from "./hostEvents";
import type { DialogApi } from "./dialogs";
import type { SettingsApi } from "./settings";

export interface BridgeApi {
  /** Send a message to the host. Identical to the extension's `sendToHost`. */
  sendToHost: (msg: WebviewToHostMessage) => void;
  workspace: Workspace;
  session: EditorSession;
  dialogs: DialogApi;
  settings: SettingsApi;
  /** The workspace path of the document currently open. */
  currentPath: string;
  /** Open a different document. */
  openDocument: (path: string) => Promise<void>;
  /** Re-read the current document from the workspace. */
  reloadDocument: () => Promise<void>;
  /** List editable files across the workspace (for the file browser). */
  listProjectFiles: () => Promise<{ path: string; name: string; dir: string }[]>;
  /** True while a save round-trip is in flight. */
  saving: boolean;
}

const BridgeContext = createContext<BridgeApi | null>(null);

export function useHostBridge(): BridgeApi {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error("useHostBridge must be used inside <HostBridgeProvider>");
  return ctx;
}

/**
 * The host this UI is talking to.
 *
 * When omitted (the web app) messages are dispatched by the in-page host below.
 * When supplied — as the VS Code webview does — the same messages are forwarded
 * to that host instead, and incoming host messages are delivered through
 * `subscribe`.
 *
 * This single seam is why the extension reuses the entire editor UI unchanged:
 * every component already talks only to `sendToHost`, so swapping what is behind
 * it needs no component edits.
 */
export interface HostChannel {
  send(msg: WebviewToHostMessage): void;
  subscribe(listener: (msg: HostToWebviewMessage) => void): () => void;
}

export interface HostBridgeProviderProps {
  workspace: Workspace;
  dialogs: DialogApi;
  settings: SettingsApi;
  /** Render a notice when a document fails to open. */
  onNotice?: (message: string, level?: "info" | "error" | "success") => void;
  /**
   * External host to forward messages to. Omit to use the in-page host, which is
   * what the browser build does.
   */
  host?: HostChannel;
  children: ReactNode;
}

export function HostBridgeProvider({
  workspace,
  dialogs,
  settings,
  onNotice,
  host,
  children,
}: HostBridgeProviderProps) {
  const sessionRef = useRef<EditorSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new EditorSession(workspace);
  const session = sessionRef.current;

  const fontLibraryRef = useRef<WorkspaceFontLibrary | null>(null);
  if (!fontLibraryRef.current) fontLibraryRef.current = new WorkspaceFontLibrary(workspace);
  const fontLibrary = fontLibraryRef.current;

  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  const [currentPath, setCurrentPath] = useState("");
  const [saving, setSaving] = useState(false);
  const googleFontsCache = useRef<{ fonts: { f: string; c: string; w: number[] }[]; fetchedAt: number } | null>(
    null
  );

  const emit = useCallback((msg: HostToWebviewMessage) => {
    publishHostMessage(msg);
  }, []);

  /* --------------------------- document open --------------------------- */

  const openDocument = useCallback(
    async (path: string) => {
      const config = appConfig.get();
      resetLiveHistory();
      try {
        const snapshot = await session.open(path, { styleScope: config.styleScope });
        setCurrentPath(path);
        emit({
          type: "FILE_CONTENT",
          content: snapshot.displayHtml,
          rawHtml: snapshot.rawHtml,
          filename: snapshot.filename,
          filePath: snapshot.path,
          injectScript: snapshot.injectScript,
          styleMode: config.styleMode,
          styleScope: config.styleScope,
          isMarkdown: snapshot.isMarkdown,
          isAstro: snapshot.isAstro,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : `Could not open ${path}`;
        emit({ type: "SAVE_ERROR", error: message });
        onNoticeRef.current?.(message, "error");
      }
    },
    [session, emit]
  );

  const reloadDocument = useCallback(async () => {
    if (currentPath) await openDocument(currentPath);
  }, [currentPath, openDocument]);

  const listProjectFiles = useCallback(async () => {
    try {
      const files = await workspace.listRecursive("", 2000);
      return files
        .filter((f) => (SUPPORTED_EDITOR_EXTS as readonly string[]).includes(f.ext))
        .map((f) => ({ path: f.path, name: f.name, dir: dirname(f.path) }))
        .sort((a, b) => a.path.localeCompare(b.path));
    } catch {
      return [];
    }
  }, [workspace]);

  /* ------------------------------ save paths ---------------------------- */

  const savePatches = useCallback(
    async (patches: Parameters<EditorSession["savePatches"]>[0], styleScope?: "global" | "local") => {
      setSaving(true);
      const scope = styleScope ?? appConfig.get().styleScope;
      const result = await session.savePatches(patches, { styleScope: scope });
      setSaving(false);
      if (result.ok) emit({ type: "FILE_SAVED" });
      else emit({ type: "SAVE_ERROR", error: result.error ?? "Save failed" });
    },
    [session, emit]
  );

  const saveFull = useCallback(
    async (content: string) => {
      setSaving(true);
      const result = await session.saveFullContent(content, { styleScope: appConfig.get().styleScope });
      setSaving(false);
      if (result.ok) emit({ type: "FILE_SAVED" });
      else emit({ type: "SAVE_ERROR", error: result.error ?? "Save failed" });
    },
    [session, emit]
  );

  /* --------------------------- feature handlers ------------------------- */

  const handleGoogleFonts = useCallback(async () => {
    const TTL = 7 * 24 * 3600 * 1000;
    if (googleFontsCache.current && Date.now() - googleFontsCache.current.fetchedAt < TTL) {
      emit({ type: "GOOGLE_FONTS_CATALOG", fonts: googleFontsCache.current.fonts });
      return;
    }
    const stored = readPersistedFonts();
    if (stored && Date.now() - stored.fetchedAt < TTL) {
      googleFontsCache.current = stored;
      emit({ type: "GOOGLE_FONTS_CATALOG", fonts: stored.fonts });
      return;
    }
    const fonts = await fetchGoogleFontsCatalog();
    if (fonts?.length) {
      googleFontsCache.current = { fonts, fetchedAt: Date.now() };
      writePersistedFonts(fonts);
      emit({ type: "GOOGLE_FONTS_CATALOG", fonts });
      return;
    }
    if (stored) emit({ type: "GOOGLE_FONTS_CATALOG", fonts: stored.fonts });
    else
      emit({
        type: "GOOGLE_FONTS_CATALOG",
        fonts: [],
        error: "Live Google Fonts metadata is not reachable — using the built-in catalog.",
      });
  }, [emit]);

  const uploadImage = useCallback(async () => {
    const dir = dirname(session.currentPath);
    const picked = await workspace.pickAndImportFile({
      accept: ".png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.ico",
      targetDir: dir,
    });
    if (!picked) return;
    emit({
      type: "IMAGE_UPLOADED",
      relativePath: picked.name,
      webviewUri: bytesToDataUri(picked.data, mimeForPath(picked.name)),
    });
  }, [workspace, session, emit]);

  const savePastedImage = useCallback(
    async (dataBase64: string, mimeType: string) => {
      const dir = dirname(session.currentPath);
      const EXT: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
        "image/webp": ".webp",
        "image/avif": ".avif",
        "image/x-icon": ".ico",
      };
      const fileName = `pasted-${Date.now()}${EXT[mimeType] ?? ".png"}`;
      try {
        await workspace.writeBinary(joinPath(dir, fileName), base64ToBytes(dataBase64));
        emit({ type: "IMAGE_PASTED", relativePath: fileName, webviewUri: `data:${mimeType};base64,${dataBase64}` });
      } catch (err) {
        onNoticeRef.current?.(
          `Failed to save pasted image: ${err instanceof Error ? err.message : "unknown error"}`,
          "error"
        );
      }
    },
    [workspace, session, emit]
  );

  const saveScreenshots = useCallback(
    async (images: { filename: string; dataBase64: string }[]) => {
      if (!images.length) return;
      const fileDir = dirname(session.currentPath);
      const tag = basename(session.currentPath).replace(/\.[^.]+$/, "");
      const folderName = `screenshots_${tag}_${Date.now().toString(36).slice(-5)}`;
      try {
        const target = await dialogs.chooseScreenshotTarget({
          suggestedFolder: folderName,
          count: images.length,
        });
        if (target === null) {
          emit({ type: "SCREENSHOTS_SAVE_ERROR", error: "Cancelled" });
          return;
        }
        await workspace.exportFolder(
          joinPath(fileDir, folderName),
          images.map((img) => ({
            name: img.filename,
            data: Uint8Array.from(atob(img.dataBase64), (c) => c.charCodeAt(0)),
          }))
        );
        emit({ type: "SCREENSHOTS_SAVED", folderName });
        onNoticeRef.current?.(`Screenshots saved to ${folderName}/`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        emit({ type: "SCREENSHOTS_SAVE_ERROR", error: message });
        onNoticeRef.current?.(`Failed to save screenshots: ${message}`, "error");
      }
    },
    [workspace, session, emit, dialogs]
  );

  const saveDesignSystemToSiblings = useCallback(
    async (css: string) => {
      const dir = dirname(session.currentPath);
      const current = basename(session.currentPath);
      const styleTag = `<style id="gl-design-system-variables">\n${css}\n</style>`;
      const existing = /<style\s+id\s*=\s*["']gl-design-system-variables["'][^>]*>[\s\S]*?<\/style>/i;
      let count = 0;
      try {
        for (const entry of await workspace.list(dir)) {
          if (entry.name === current || !/\.html?$/i.test(entry.name)) continue;
          const path = joinPath(dir, entry.name);
          let content: string;
          try {
            content = await workspace.readText(path);
          } catch {
            continue;
          }
          if (existing.test(content)) {
            content = content.replace(existing, styleTag);
          } else {
            const firstStyle = content.match(/<style[\s>]/i);
            if (firstStyle?.index !== undefined) {
              content = content.slice(0, firstStyle.index) + styleTag + "\n" + content.slice(firstStyle.index);
            } else {
              const headClose = content.indexOf("</head>");
              if (headClose !== -1) content = content.slice(0, headClose) + styleTag + "\n" + content.slice(headClose);
            }
          }
          await workspace.writeText(path, content);
          count++;
        }
        onNoticeRef.current?.(
          `Design system saved to ${count} sibling HTML file${count === 1 ? "" : "s"}.`,
          "success"
        );
      } catch (err) {
        onNoticeRef.current?.(
          `Failed to save design system to siblings: ${err instanceof Error ? err.message : "unknown error"}`,
          "error"
        );
      }
    },
    [workspace, session]
  );

  const placeFontNextToDocument = useCallback(
    async (data: Uint8Array, safeName: string, family: string) => {
      const relative = joinPath("fonts", safeName);
      const absolute = joinPath(dirname(session.currentPath), relative);
      try {
        await workspace.mkdir(joinPath(dirname(session.currentPath), "fonts"));
        await workspace.writeBinary(absolute, data);
        const url = await workspace.toDisplayUrl(absolute);
        emit({ type: "FONT_UPLOADED", relativePath: relative, webviewUri: url, family });
      } catch (err) {
        emit({ type: "SAVE_ERROR", error: err instanceof Error ? err.message : "Font copy failed" });
      }
    },
    [workspace, session, emit]
  );

  /* ------------------------------ dispatcher ---------------------------- */

  const handleInPage = useCallback(
    (msg: WebviewToHostMessage): void => {
      void (async () => {
        try {
          switch (msg.type) {
            case "READ_FILE":
              await openDocument(session.currentPath || (await defaultDocument(workspace)));
              break;

            case "SAVE_PATCHES":
              await savePatches(msg.patches, msg.styleScope);
              break;

            case "SAVE_FILE":
              await saveFull(msg.content);
              break;

            case "CLOSE_PANEL":
              window.dispatchEvent(new CustomEvent("rachana:close-editor"));
              break;

            case "SET_CONFIG": {
              const patch: Record<string, unknown> = {};
              if (msg.styleMode) patch.styleMode = msg.styleMode;
              if (msg.styleScope) patch.styleScope = msg.styleScope;
              appConfig.set(patch);
              if (msg.styleMode) emit({ type: "CONFIG_CHANGE", styleMode: msg.styleMode });
              break;
            }

            case "GET_FOLDER_FILES": {
              const dir = dirname(session.currentPath);
              try {
                const files = (await workspace.list(dir))
                  .filter((e) => (SUPPORTED_EDITOR_EXTS as readonly string[]).includes(e.ext))
                  .map((e) => ({ name: e.name, ext: e.ext }))
                  .sort((a, b) => a.name.localeCompare(b.name));
                emit({ type: "FOLDER_FILES_LIST", files });
              } catch {
                emit({ type: "FOLDER_FILES_LIST", files: [] });
              }
              break;
            }

            case "OPEN_FILE": {
              const target = joinPath(dirname(session.currentPath), msg.filename);
              if (!(await workspace.exists(target))) {
                onNoticeRef.current?.(`File not found: ${msg.filename}`, "error");
                break;
              }
              await openDocument(target);
              break;
            }

            case "CREATE_FILE": {
              const name = msg.filename.replace(/[\\/]/g, "-");
              const target = joinPath(dirname(session.currentPath), name);
              if (await workspace.exists(target)) {
                emit({ type: "FILE_CREATE_ERROR", error: `File "${name}" already exists` });
                break;
              }
              try {
                await workspace.writeText(target, "");
                emit({ type: "FILE_CREATED", filename: name });
                await openDocument(target);
              } catch (err) {
                emit({
                  type: "FILE_CREATE_ERROR",
                  error: err instanceof Error ? err.message : "Could not create the file",
                });
              }
              break;
            }

            case "OPEN_CURRENT_FILE_IN_BROWSER": {
              if (!session.isHtml) {
                onNoticeRef.current?.("Open in browser is only available for HTML files.", "info");
                break;
              }
              try {
                const url = await workspace.toDisplayUrl(session.currentPath);
                window.open(url, "_blank", "noopener");
              } catch (err) {
                onNoticeRef.current?.(err instanceof Error ? err.message : "Could not open the file", "error");
              }
              break;
            }

            case "SAVE_DESIGN_SYSTEM_TO_SIBLINGS":
              await saveDesignSystemToSiblings(msg.css);
              break;

            case "UPLOAD_IMAGE":
              await uploadImage();
              break;

            case "PASTE_IMAGE":
              await savePastedImage(msg.dataBase64, msg.mimeType);
              break;

            case "GET_LINK_URL": {
              const url = await dialogs.prompt({
                title: "Insert link",
                label: "Link URL",
                value: "https://",
                placeholder: "https://example.com",
                confirmLabel: "Insert",
              });
              if (url !== null) emit({ type: "LINK_URL", url: url.trim() || "#", linkText: msg.linkText });
              break;
            }

            case "REQUEST_IMAGE_OPTIONS": {
              const choice = await dialogs.choose({
                title: "Image options",
                options: ["Change image URL", "Upload new image"],
              });
              if (choice === null) break;
              if (choice === 0) {
                const url = await dialogs.prompt({
                  title: "Image source",
                  label: "Image URL",
                  value: msg.currentSrc,
                  placeholder: "https://example.com/image.png",
                  confirmLabel: "Apply",
                });
                if (url !== null) emit({ type: "IMAGE_OPTIONS_RESULT", imgId: msg.imgId, url: url.trim() });
              } else {
                const picked = await workspace.pickAndImportFile({
                  accept: ".png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.ico",
                  targetDir: dirname(session.currentPath),
                });
                if (picked) {
                  emit({
                    type: "IMAGE_UPLOADED_FOR_IMG",
                    imgId: msg.imgId,
                    relativePath: picked.name,
                    webviewUri: bytesToDataUri(picked.data, mimeForPath(picked.name)),
                  });
                }
              }
              break;
            }

            case "REQUEST_LINK_CHANGE": {
              const href = await dialogs.prompt({
                title: "Change link",
                label: "Link URL",
                value: msg.currentHref,
                placeholder: "https://example.com",
                confirmLabel: "Update",
              });
              if (href !== null) {
                emit({ type: "LINK_CHANGE_RESULT", linkId: msg.linkId, href: href.trim() || "#" });
              }
              break;
            }

            case "SAVE_SCREENSHOTS":
              await saveScreenshots(msg.images);
              break;

            case "GET_TEMPLATES": {
              const response = await loadTemplates({
                page: msg.page ?? 1,
                limit: msg.limit ?? 12,
                category: msg.category ?? null,
                tag: msg.tag ?? null,
              });
              emit({ type: "TEMPLATES_DATA", ...response });
              break;
            }

            case "GET_TEMPLATE_HTML": {
              if (!msg.id) break;
              try {
                const html = await loadTemplateHtml(msg.id);
                emit({ type: "TEMPLATE_HTML", id: msg.id, html });
              } catch (err) {
                emit({
                  type: "TEMPLATE_HTML_ERROR",
                  id: msg.id,
                  error: err instanceof Error ? err.message : "Failed to load template HTML",
                });
              }
              break;
            }

            case "GET_GOOGLE_FONTS_CATALOG":
              await handleGoogleFonts();
              break;

            case "UPLOAD_FONT": {
              try {
                        const bytes = base64ToBytes(msg.dataBase64);
                const stored = await fontLibrary.put(bytes, msg.filename, msg.family);
                await placeFontNextToDocument(bytes, stored.name, msg.family);
              } catch (err) {
                emit({
                  type: "SAVE_ERROR",
                  error: err instanceof Error ? err.message : "Font upload failed",
                });
              }
              break;
            }

            case "LIST_USER_FONTS":
              emit({ type: "USER_FONTS_LIST", fonts: await fontLibrary.list() });
              break;

            case "PICK_USER_FONT": {
              const found = await fontLibrary.get(msg.id);
              if (!found) {
                emit({ type: "SAVE_ERROR", error: "Font is not in the font library" });
                break;
              }
              await placeFontNextToDocument(found.data, found.filename, msg.family);
              break;
            }

            case "CONNECT_GET_SITES":
            case "CONNECT_ADD_SITE":
            case "CONNECT_REMOVE_SITE":
            case "CONNECT_TEST_SITE":
            case "CONNECT_GET_PAGES":
            case "CONNECT_GET_SITE_INFO":
            case "CONNECT_EXPORT":
            case "CONNECT_GENERATE_CODE":
            case "CONNECT_CANCEL_EXPORT": {
              const { createConnectHandler } = await import("@/features/wordpress/bridge");
              const handler = createConnectHandler({
                workspace,
                send: emit,
                getSourcePath: () => session.currentPath,
                getHtml: () => session.raw,
              });
              await handler.handleMessage(msg);
              break;
            }

            case "FETCH_LIVE_PREVIEW":
            case "STOP_LIVE_RUNTIME":
            case "GET_ASTRO_SOURCE":
            case "OPEN_ASTRO_SOURCE_IN_EDITOR":
            case "ASTRO_EDIT":
            case "LIVE_STYLE_DECLARATION_EDIT":
            case "LIVE_STYLE_UNDO":
            case "LIVE_STYLE_REDO":
              await handleLiveMessage(msg, {
                workspace,
                session: {
                  currentPath: session.currentPath,
                  raw: session.raw,
                  writeTextFile: (p, c) => session.writeTextFile(p, c),
                },
                config: appConfig.get(),
                send: emit,
                revealSource: (opts) => settings.revealSource(opts),
              });
              break;

            case "OPEN_EXTERNAL":
              window.open(msg.url, "_blank", "noopener");
              break;

            case "COPY_TO_CLIPBOARD": {
              const ok = await copyTextToClipboard(msg.text);
              onNoticeRef.current?.(ok ? "Copied to clipboard" : "Clipboard unavailable", ok ? "success" : "error");
              break;
            }

            case "LICENSE_GET_STATUS":
            case "LICENSE_ACTIVATE":
            case "LICENSE_DEACTIVATE":
            case "LICENSE_GET_PORTAL":
              handleLicenseMessage(msg, { send: emit });
              break;
          }
        } catch (err) {
          console.error(`[Rachana] Host failed to handle ${msg.type}:`, err);
          onNoticeRef.current?.(
            `${msg.type} failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error"
          );
        }
      })();
    },
    [
      emit,
      openDocument,
      savePatches,
      saveFull,
      session,
      workspace,
      dialogs,
      settings,
      saveDesignSystemToSiblings,
      uploadImage,
      savePastedImage,
      saveScreenshots,
      handleGoogleFonts,
      fontLibrary,
      placeFontNextToDocument,
    ]
  );

  /**
   * The channel every component talks to.
   *
   * With no external host this dispatches in-page, exactly as the browser build
   * has always done. With an external host (the VS Code webview) it forwards the
   * same message, so the UI needs no knowledge of where it is running.
   */
  const handleInPageRef = useRef(handleInPage);
  handleInPageRef.current = handleInPage;

  const sendToHost = useCallback(
    (msg: WebviewToHostMessage): void => {
      if (host) {
        host.send(msg);
        return;
      }
      handleInPageRef.current(msg);
    },
    [host]
  );

  /* -------------------------- external host wiring ---------------------- */

  useEffect(() => {
    if (!host) return;
    return host.subscribe((msg) => publishHostMessage(msg));
  }, [host]);

  /* -------------------------- initial document -------------------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const first = await defaultDocument(workspace);
      if (cancelled) return;
      await openDocument(first);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, openDocument]);

  const value = useMemo<BridgeApi>(
    () => ({
      sendToHost,
      workspace,
      session,
      dialogs,
      settings,
      currentPath,
      openDocument,
      reloadDocument,
      listProjectFiles,
      saving,
    }),
    [sendToHost, workspace, session, dialogs, settings, currentPath, openDocument, reloadDocument, listProjectFiles, saving]
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Pick the document to open when the app starts. */
export async function defaultDocument(workspace: Workspace): Promise<string> {
  try {
    const files = await workspace.listRecursive("", 500);
    const editable = files.filter((f) => (SUPPORTED_EDITOR_EXTS as readonly string[]).includes(f.ext));
    const index = editable.find((f) => f.name === "index.html") ?? editable[0];
    if (index) return index.path;
  } catch {
    /* empty or unreadable workspace */
  }
  await workspace.writeText("index.html", SCAFFOLD_HTML);
  return "index.html";
}

const FONTS_CACHE_KEY = "rachana:google-fonts-cache";

function readPersistedFonts(): { fonts: { f: string; c: string; w: number[] }[]; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(FONTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fonts?: unknown; fetchedAt?: number };
    if (Array.isArray(parsed?.fonts) && parsed.fonts.length > 0) {
      return { fonts: parsed.fonts as { f: string; c: string; w: number[] }[], fetchedAt: parsed.fetchedAt ?? 0 };
    }
  } catch {
    /* corrupt cache */
  }
  return null;
}

function writePersistedFonts(fonts: { f: string; c: string; w: number[] }[]): void {
  try {
    localStorage.setItem(FONTS_CACHE_KEY, JSON.stringify({ fonts, fetchedAt: Date.now() }));
  } catch {
    /* storage full */
  }
}

export { DEFAULT_LIBRARY_URL, getLibraryUrl, extname };
