/**
 * Desktop target — status and shape.
 *
 * This module is intentionally not an implementation. It exists so that:
 *
 *  1. the folder typechecks rather than being an empty shell,
 *  2. the planned adapter surface is expressed as *types the compiler checks*,
 *     so when the Tauri work starts the contracts are already pinned, and
 *  3. the parent `tsconfig.json` has a real input.
 *
 * The Tauri milestones are in `README.md`. Nothing here is imported by the web
 * app or the VS Code extension, so it is inert until the desktop work begins.
 */

import type { AssetsPort, HostPorts, OpsPort, SecretPort, StoragePort } from "@rachana/core/contracts";
import type { Workspace } from "@rachana/core/workspace";

/**
 * The complete set of adapters the desktop app must supply.
 *
 * Written as a single type rather than five loose ones: a target is only
 * "done" when every port exists, and this makes a missing one a compile error
 * instead of a runtime surprise.
 */
export interface DesktopAdapters {
  workspace: Workspace;
  ports: HostPorts;
}

/** Per-port implementation status, so progress is visible in one place. */
export type AdapterStatus = "planned" | "in-progress" | "done";

export interface DesktopMilestone {
  readonly id: string;
  readonly title: string;
  readonly status: AdapterStatus;
  /** What it proves, and therefore what "done" means. */
  readonly proves: string;
}

/**
 * The desktop milestones, in dependency order.
 *
 * Kept as data so the README and any future UI can read the same list rather
 * than drifting from a prose description.
 */
export const DESKTOP_MILESTONES: readonly DesktopMilestone[] = [
  {
    id: "shell",
    title: "Shell boots and renders the shared UI",
    status: "planned",
    proves: "Tauri window, `convertFileSrc`, and resource paths all resolve.",
  },
  {
    id: "save",
    title: "Round-trip save through the byte-preserving patcher",
    status: "planned",
    proves: "The core's save contract holds on a native filesystem.",
  },
  {
    id: "ports",
    title: "Native dialogs, storage and clipboard",
    status: "planned",
    proves: "Every panel works without a browser-only API.",
  },
  {
    id: "live",
    title: "Automatic Live mode",
    status: "planned",
    proves:
      "Rust spawns and supervises the project's dev server — the capability the browser cannot have.",
  },
  {
    id: "platforms",
    title: "Cross-platform webview pass",
    status: "planned",
    proves: "The canvas iframe and CodeMirror behave on WebView2, WKWebView and WebKitGTK.",
  },
];

/**
 * The four ports the desktop app must implement, named so the type checker
 * enforces that each one is provided.
 */
export interface DesktopPortImplementations {
  workspace: Workspace;
  storage: StoragePort;
  secrets: SecretPort;
  assets: AssetsPort;
  ops: OpsPort;
}
