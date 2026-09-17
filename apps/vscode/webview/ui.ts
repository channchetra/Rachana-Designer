/**
 * The editor UI, reused from the web app.
 *
 * The extension does **not** fork the React components. `apps/web` already
 * contains a complete, host-agnostic UI: every component talks only to
 * `sendToHost`, and the host is chosen by the `host` prop on `App`. So the
 * webview renders exactly the same components, and the only VS Code-specific
 * code is the transport in `./transport.ts` and the channel in `./host.ts`.
 *
 * The `@web/*` alias (declared in `tsconfig.json` and `esbuild.mjs`) resolves to
 * `apps/web/src`, so this barrel is a thin, explicit seam rather than a deep
 * cross-app import scattered through the webview.
 */

export { App } from "@web/app/App";
export { ErrorBoundary } from "@web/components/ErrorBoundary";

/** The host-channel contract the extension's channel must satisfy. */
export type { HostChannel } from "@web/platform/host/HostBridgeProvider";
export type { WebviewToHostMessage, HostToWebviewMessage } from "@web/types/hostMessages";
