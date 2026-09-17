/**
 * The VS Code host channel for the webview.
 *
 * Implements the same `HostChannel` contract the in-page host satisfies, so the
 * React UI cannot tell which one it is talking to. `send` forwards to the
 * extension host; `subscribe` receives what the extension host sends back.
 */

import type { HostChannel } from "./ui";
import { sendToHost, subscribeHostMessages } from "./transport";

export function createVsCodeHost(): HostChannel {
  return {
    send: (msg) => sendToHost(msg),
    subscribe: (listener) => subscribeHostMessages(listener),
  };
}
