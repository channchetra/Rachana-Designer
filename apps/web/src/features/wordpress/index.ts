/**
 * WordPress feature barrel.
 *
 * Everything the host router needs to wire the connect panel up: the
 * orchestrator, the REST client, and the two block converters.
 */

export { ConnectHandler } from "./ConnectHandler";
export type {
  ConnectContractAccepted,
  ConnectHandlerOptions,
  ConnectHostMessage,
  ConnectInboundMessage,
  ConnectSiteInput,
} from "./ConnectHandler";

export {
  WordPressClient,
  WPRequestError,
  describeWPError,
  encodeFseId,
  fseEditorLink,
  fseOrigin,
  getMimeType,
  normalizeFseArea,
} from "./WordPressClient";
export type {
  WPMediaUploadResult,
  WPPage,
  WPFseItem,
  WPThemeInfo,
  WPTransportMode,
  WordPressClientOptions,
} from "./WordPressClient";

export { convert, extractCssVariables, extractMediaUrls, replaceMediaUrls } from "./convert";
export type { ConvertOptions } from "./convert";

export { extractMarkdownMediaUrls, markdownHtmlToBlocks, replaceMarkdownMediaUrls } from "./markdownToBlocks";
