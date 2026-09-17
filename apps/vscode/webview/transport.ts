/**
 * VS Code webview transport.
 *
 * Rachana Designer's UI is deliberately host-agnostic: it takes a single
 * `sendToHost` function and receives host messages. In the web app that function
 * dispatches to an in-page host; inside a VS Code webview it posts to the
 * extension host instead.
 *
 * This module is the entire adaptation. The same React components, the same
 * message shapes, and the same 47-case protocol run in both — which is why the
 * extension did not need the UI rewritten.
 *
 * `acquireVsCodeApi()` may only be called once per webview, so the instance is
 * cached here rather than acquired per call.
 */

import type { HostToWebviewMessage, WebviewToHostMessage } from "./ui";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

/** The webview's single VS Code API handle. */
export function getVsCodeApi(): VsCodeApi {
  if (!api) api = acquireVsCodeApi();
  return api;
}

type Listener = (msg: HostToWebviewMessage) => void;
const listeners = new Set<Listener>();
let listening = false;

/**
 * Forward every message from the extension host to subscribers.
 *
 * VS Code delivers host messages through the same `window` message event that
 * the canvas iframe uses, so the canvas's own messages must be filtered out.
 * They are identified by their types, the same way the web app's hook does it.
 */
const HOST_MESSAGE_TYPES = new Set<string>([
  "FILE_CONTENT", "FILE_SAVED", "SAVE_ERROR", "CONFIG_CHANGE",
  "FOLDER_FILES_LIST", "FILE_CREATED", "FILE_CREATE_ERROR",
  "TEMPLATES_DATA", "TEMPLATE_HTML", "TEMPLATE_HTML_ERROR",
  "GOOGLE_FONTS_CATALOG", "USER_FONTS_LIST", "FONT_UPLOADED",
  "IMAGE_UPLOADED", "IMAGE_PASTED", "IMAGE_OPTIONS_RESULT", "IMAGE_UPLOADED_FOR_IMG",
  "LINK_URL", "LINK_CHANGE_RESULT",
  "CONNECT_SITES_LIST", "CONNECT_SITE_ADDED", "CONNECT_SITE_REMOVED", "CONNECT_SITE_TEST_RESULT",
  "CONNECT_PAGES_LIST", "CONNECT_PAGES_ERROR", "CONNECT_SITE_INFO",
  "CONNECT_EXPORT_PROGRESS", "CONNECT_EXPORT_COMPLETE", "CONNECT_EXPORT_ERROR", "CONNECT_EXPORT_CODE",
  "LICENSE_STATUS", "LICENSE_ACTIVATED", "LICENSE_ACTIVATION_ERROR",
  "LICENSE_DEACTIVATED", "LICENSE_DEACTIVATION_ERROR",
  "LICENSE_PORTAL_URL", "LICENSE_PORTAL_ERROR",
  "SCREENSHOTS_SAVED", "SCREENSHOTS_SAVE_ERROR",
  "LIVE_PREVIEW", "LIVE_PREVIEW_ERROR", "LIVE_STYLE_HISTORY_RESULT",
  "ASTRO_SOURCE_RESULT", "ASTRO_EDIT_RESULT", "LIVE_STYLE_DECLARATION_EDIT_RESULT",
]);

function ensureListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data as HostToWebviewMessage | undefined;
    if (!msg || typeof msg.type !== "string") return;
    if (!HOST_MESSAGE_TYPES.has(msg.type)) return;
    for (const listener of [...listeners]) {
      try {
        listener(msg);
      } catch (err) {
        console.error(`[Rachana] webview listener failed for ${msg.type}:`, err);
      }
    }
  });
}

/** Subscribe to host messages. Returns an unsubscribe function. */
export function subscribeHostMessages(listener: Listener): () => void {
  ensureListening();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Send a message to the extension host. Identical signature to the web app's. */
export function sendToHost(msg: WebviewToHostMessage): void {
  getVsCodeApi().postMessage(msg);
}
