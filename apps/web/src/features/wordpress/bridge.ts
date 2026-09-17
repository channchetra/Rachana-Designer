/**
 * WordPress bridge.
 *
 * A thin adapter between the host bridge and the ported `ConnectHandler`.
 * Keeping it separate means the WordPress pipeline has no knowledge of the
 * editor session or of React, and the host bridge has no knowledge of
 * WordPress — the same separation the original extension had between
 * `MessageHandler` and `ConnectHandler`.
 *
 * It also supplies the transport settings (direct vs. CORS proxy), which the
 * original extension never needed because its requests came from Node.
 */

import type { Workspace } from "@/platform/fs/types";
import type { HostToWebviewMessage, WebviewToHostMessage } from "@/types/hostMessages";
import { ConnectHandler } from "./ConnectHandler";
import { appConfig } from "@/platform/host/config";
import type { WPTransportMode } from "./WordPressClient";

export interface ConnectBridgeOptions {
  workspace: Workspace;
  send: (msg: HostToWebviewMessage) => void;
  /** Workspace-relative path of the edited document. */
  getSourcePath: () => string;
  /** Current HTML of the edited document. */
  getHtml: () => string;
  onDebug?: (message: string) => void;
}

/** The subset of messages this bridge forwards. */
const CONNECT_TYPES = new Set([
  "CONNECT_GET_SITES",
  "CONNECT_ADD_SITE",
  "CONNECT_REMOVE_SITE",
  "CONNECT_TEST_SITE",
  "CONNECT_GET_PAGES",
  "CONNECT_GET_SITE_INFO",
  "CONNECT_EXPORT",
  "CONNECT_GENERATE_CODE",
  "CONNECT_CANCEL_EXPORT",
]);

export interface ConnectBridge {
  handleMessage(msg: WebviewToHostMessage): Promise<void>;
}

/**
 * Build a connect handler bound to the current transport settings.
 *
 * A fresh handler is created per message so that a settings change takes effect
 * immediately and no state leaks between exports. Site storage and the export
 * cancellation flag therefore live in module scope inside `ConnectHandler`,
 * which is where the port put them.
 */
export function createConnectHandler(options: ConnectBridgeOptions): ConnectBridge {
  const config = appConfig.get();
  const handler = new ConnectHandler({
    workspace: options.workspace,
    send: options.send,
    getSourcePath: options.getSourcePath,
    getHtml: options.getHtml,
    transport: config.wpTransport as WPTransportMode,
    proxyPrefix: config.wpProxyPrefix,
    onDebug: options.onDebug,
  });

  return {
    async handleMessage(msg: WebviewToHostMessage): Promise<void> {
      if (!CONNECT_TYPES.has(msg.type)) {
        console.warn(`[Rachana] The WordPress bridge received an unexpected message: ${msg.type}`);
        return;
      }
      if (config.verboseLogging) {
        console.debug("[Rachana] WordPress ←", msg.type, msg);
      }
      await handler.handleMessage(msg as never);
    },
  };
}
