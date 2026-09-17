/**
 * Project stylesheet access.
 *
 * The style router writes new global rules into the project's global
 * stylesheet. In the original extension that path was fixed at
 * `src/styles/global.css`; here it is configurable so non-Astro projects can
 * point at `styles.css`, `assets/css/main.css`, and so on.
 */

import type { Workspace } from "@/platform/fs/types";
import { appConfig } from "./config";

/** The configured global stylesheet path, relative to the workspace root. */
export function globalCssPath(): string {
  return appConfig.get().globalCssPath || "src/styles/global.css";
}

/** Read the global stylesheet, returning "" when it does not exist yet. */
export async function loadGlobalCss(workspace: Workspace): Promise<string> {
  try {
    return await workspace.readText(globalCssPath());
  } catch {
    return "";
  }
}

/** Write the global stylesheet, creating parent directories as needed. */
export async function saveGlobalCss(workspace: Workspace, css: string): Promise<void> {
  const path = globalCssPath();
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (dir) await workspace.mkdir(dir);
  await workspace.writeText(path, css);
}

/** True when the project looks like an Astro project. */
export async function isAstroProject(workspace: Workspace): Promise<boolean> {
  if (await workspace.exists("astro.config.mjs")) return true;
  if (await workspace.exists("astro.config.ts")) return true;
  if (await workspace.exists("astro.config.js")) return true;
  if (await workspace.exists("src/pages")) return true;
  return false;
}
