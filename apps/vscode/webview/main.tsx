/**
 * VS Code webview entry point.
 *
 * Renders the *same* React UI as the web app. The only difference from
 * `apps/web` is the host transport: messages go to the extension host instead of
 * an in-page host.
 *
 * How the swap works: `HostBridgeProvider` accepts an optional `host` prop and
 * installs it as the message channel. When omitted (the web app) it dispatches
 * in-page exactly as before; when supplied (here) it forwards to VS Code. No
 * component knows the difference.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui";
import { createVsCodeHost } from "./host";
import "@web/styles/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from the webview HTML");
container.innerHTML = "";

const host = createVsCodeHost();

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App host={host} />
  </React.StrictMode>
);
