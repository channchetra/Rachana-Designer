/**
 * Message protocol, re-exported for the extension host.
 *
 * The contract lives in the shared UI package because the webview is what sends
 * these messages. The extension host imports the same types, so a change to the
 * protocol fails to compile on both sides rather than silently breaking one.
 *
 * `RECEIVE_TYPES` is the host's guard against posting a message the webview does
 * not handle — VS Code drops those silently, which is a difficult bug to trace.
 */

import type { HostToWebviewMessage, WebviewToHostMessage } from "@web/types/hostMessages";

export type { HostToWebviewMessage, WebviewToHostMessage };

/** Every message type the webview can receive. */
export const RECEIVE_TYPES = new Set<string>([
  "FILE_CONTENT",
  "FILE_SAVED",
  "SAVE_ERROR",
  "CONFIG_CHANGE",
  "FOLDER_FILES_LIST",
  "FILE_CREATED",
  "FILE_CREATE_ERROR",
  "TEMPLATES_DATA",
  "TEMPLATE_HTML",
  "TEMPLATE_HTML_ERROR",
  "GOOGLE_FONTS_CATALOG",
  "USER_FONTS_LIST",
  "FONT_UPLOADED",
  "IMAGE_UPLOADED",
  "IMAGE_PASTED",
  "IMAGE_OPTIONS_RESULT",
  "IMAGE_UPLOADED_FOR_IMG",
  "LINK_URL",
  "LINK_CHANGE_RESULT",
  "CONNECT_SITES_LIST",
  "CONNECT_SITE_ADDED",
  "CONNECT_SITE_REMOVED",
  "CONNECT_SITE_TEST_RESULT",
  "CONNECT_PAGES_LIST",
  "CONNECT_PAGES_ERROR",
  "CONNECT_SITE_INFO",
  "CONNECT_EXPORT_PROGRESS",
  "CONNECT_EXPORT_COMPLETE",
  "CONNECT_EXPORT_ERROR",
  "CONNECT_EXPORT_CODE",
  "LICENSE_STATUS",
  "LICENSE_ACTIVATED",
  "LICENSE_ACTIVATION_ERROR",
  "LICENSE_DEACTIVATED",
  "LICENSE_DEACTIVATION_ERROR",
  "LICENSE_PORTAL_URL",
  "LICENSE_PORTAL_ERROR",
  "SCREENSHOTS_SAVED",
  "SCREENSHOTS_SAVE_ERROR",
  "LIVE_PREVIEW",
  "LIVE_PREVIEW_ERROR",
  "LIVE_STYLE_HISTORY_RESULT",
  "ASTRO_SOURCE_RESULT",
  "ASTRO_EDIT_RESULT",
  "LIVE_STYLE_DECLARATION_EDIT_RESULT",
]);
