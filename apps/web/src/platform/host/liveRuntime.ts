/**
 * Live mode — dev-server preview with click-to-edit.
 *
 * The original extension spawned the project's `dev` script and fetched the
 * rendered page from it. A browser cannot spawn processes, so Rachana Designer
 * asks the user for the dev server origin once (persisted in settings) and
 * fetches the rendered route from it. Everything after the fetch is the same
 * idea as the original: inline what the sandboxed iframe cannot load itself,
 * inject the live-edit script, and map `data-astro-source-loc` coordinates back
 * to the source file so clicking an element edits the real `.astro` code.
 *
 * Requirements on the user's side: the dev server must be running and must
 * allow this origin to fetch it (`npm run dev -- --host` plus a CORS allowance,
 * or serve Rachana Designer from the same origin).
 */

import type { Workspace } from "@/platform/fs/types";
import { basename, dirname, joinPath } from "@/platform/fs/types";
import type { HostToWebviewMessage, WebviewToHostMessage } from "@/types/hostMessages";
import type { AppConfig } from "./config";
import { applyAstroEdit, getElementSource } from "./astroEdit";
import { editCssDeclarationValue } from "./cssEdit";
import liveEditInjectSource from "@/platform/canvas/live-edit-inject.js?raw";

export interface LiveRuntimeDeps {
  workspace: Workspace;
  session: {
    currentPath: string;
    raw: string;
    writeTextFile(path: string, content: string): Promise<void>;
    readText?(path: string): Promise<string>;
  };
  config: AppConfig;
  send: (msg: HostToWebviewMessage) => void;
  revealSource: (opts: { path: string; line: number; column: number }) => void;
}

interface CssHistoryEntry {
  undo: { filePath: string; line: number; column: number; property: string; value: string };
  redo: { filePath: string; line: number; column: number; property: string; value: string };
}

const undoStack: CssHistoryEntry[] = [];
const redoStack: CssHistoryEntry[] = [];

/** Map a workspace source path onto a dev-server route. */
export function mapFileToRoute(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const pagesIdx = normalized.indexOf("src/pages/");
  if (pagesIdx === -1) return null;
  let route = normalized.slice(pagesIdx + "src/pages/".length);
  if (!/\.(astro|html|md|mdx)$/i.test(route)) return null;
  route = route.replace(/\.(astro|html|md|mdx)$/i, "");
  const segments = route.split("/").filter((s) => s.length > 0 && !s.startsWith("["));
  if (segments.length && segments[segments.length - 1] === "index") segments.pop();
  return "/" + segments.join("/");
}

/** Absolute-ise a URL against the preview base. */
function absolutize(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

/**
 * Inline same-origin stylesheets and absolutise remaining URLs so the sandboxed
 * iframe renders the page faithfully without a document origin of its own.
 */
async function preparePreviewHtml(html: string, pageUrl: string): Promise<string> {
  let out = html;

  // Drop Vite's dev runtime; it cannot work inside a null-origin iframe.
  out = out.replace(/<link\b[^>]*rel\s*=\s*["']modulepreload["'][^>]*>/gi, "");
  out = out.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']*(?:@vite\/client|@react-refresh|astro\/runtime)[^"']*)["'][^>]*>\s*<\/script>/gi,
    ""
  );

  // Inline same-origin stylesheets.
  const linkTags = [...out.matchAll(/<link\s+[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => m[0]);
  for (const tag of linkTags) {
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const absolute = absolutize(hrefMatch[1], pageUrl);
    if (!isSameOrigin(absolute, pageUrl)) continue;
    try {
      const res = await fetch(absolute, { headers: { "Cache-Control": "no-cache" } });
      if (!res.ok) continue;
      const css = await res.text();
      const media = tag.match(/media\s*=\s*["']([^"']+)["']/i);
      const mediaAttr = media ? ` media="${media[1]}"` : "";
      out = out.split(tag).join(`<style data-gl-live-inline="${absolute}"${mediaAttr}>\n${css}\n</style>`);
    } catch {
      /* leave the tag alone and let <base> resolve it */
    }
  }

  // Make remaining relative references absolute.
  out = out.replace(/(\s(?:src|href|poster)\s*=\s*")([^"]+)(")/gi, (_m, pre: string, value: string, post: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return `${pre}${value}${post}`;
    return `${pre}${absolutize(value, pageUrl)}${post}`;
  });

  out = out.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (match, quote: string, value: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return match;
    return `url(${quote}${absolutize(value, pageUrl)}${quote})`;
  });

  // A <base> lets anything we missed still resolve.
  const baseTag = `<base data-gl-live-base="true" href="${pageUrl}">`;
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/(<head\b[^>]*>)/i, `$1\n${baseTag}`);
  else if (/<html\b[^>]*>/i.test(out)) out = out.replace(/(<html\b[^>]*>)/i, `$1\n<head>${baseTag}</head>`);
  else out = `<head>${baseTag}</head>\n${out}`;

  // Inject the live-edit script last so it can see the final DOM.
  const scriptTag = `<script data-gl-live="1">\n${liveEditInjectSource}\n</script>`;
  if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, () => `${scriptTag}\n</head>`);
  else if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, () => `${scriptTag}\n</body>`);
  else out += `\n${scriptTag}`;

  return out;
}

function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  const delays = [0, 400, 900, 1600];
  let lastError: unknown = null;
  for (let i = 0; i < Math.min(attempts, delays.length); i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Dev server unreachable");
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export async function handleLiveMessage(
  msg: WebviewToHostMessage,
  deps: LiveRuntimeDeps
): Promise<void> {
  switch (msg.type) {
    case "FETCH_LIVE_PREVIEW":
      await fetchLivePreview(deps);
      break;

    case "STOP_LIVE_RUNTIME":
      // Nothing to tear down: the dev server belongs to the user.
      break;

    case "GET_ASTRO_SOURCE": {
      try {
        const source = await deps.workspace.readText(msg.filePath);
        const res = await getElementSource(source, { line: msg.line, column: msg.column });
        deps.send({
          type: "ASTRO_SOURCE_RESULT",
          requestId: msg.requestId,
          source: res.source,
          start: res.start,
          end: res.end,
        } as HostToWebviewMessage);
      } catch (err) {
        deps.send({
          type: "ASTRO_SOURCE_RESULT",
          requestId: msg.requestId,
          error: err instanceof Error ? err.message : String(err),
        } as HostToWebviewMessage);
      }
      break;
    }

    case "OPEN_ASTRO_SOURCE_IN_EDITOR":
      deps.revealSource({ path: msg.filePath, line: msg.line, column: msg.column });
      break;

    case "ASTRO_EDIT": {
      try {
        const result = await applyAstroEdit(deps.workspace, {
          filePath: msg.filePath,
          line: msg.line,
          column: msg.column,
          op: msg.op,
          ...(msg.op === "setClassList"
            ? { classList: msg.classList ?? "" }
            : { replacement: msg.replacement ?? "" }),
        } as Parameters<typeof applyAstroEdit>[1]);
        if (result.written) await new Promise((r) => setTimeout(r, 400));
        deps.send({
          type: "ASTRO_EDIT_RESULT",
          requestId: msg.requestId,
          written: result.written,
        } as HostToWebviewMessage);
      } catch (err) {
        deps.send({
          type: "ASTRO_EDIT_RESULT",
          requestId: msg.requestId,
          error: err instanceof Error ? err.message : String(err),
        } as HostToWebviewMessage);
      }
      break;
    }

    case "LIVE_STYLE_DECLARATION_EDIT": {
      try {
        const before = await deps.workspace.readText(msg.filePath);
        const result = await editCssDeclarationValue(
          before,
          {
            filePath: msg.filePath,
            line: msg.line,
            column: msg.column,
            property: msg.property,
            value: msg.value,
          },
          (path, content) => deps.workspace.writeText(path, content)
        );
        if (result.written) {
          undoStack.push({
            undo: {
              filePath: msg.filePath,
              line: msg.line,
              column: msg.column,
              property: msg.property,
              value: result.oldValue ?? "",
            },
            redo: {
              filePath: msg.filePath,
              line: msg.line,
              column: msg.column,
              property: msg.property,
              value: result.newValue ?? msg.value,
            },
          });
          redoStack.length = 0;
          await new Promise((r) => setTimeout(r, 200));
        }
        deps.send({
          type: "LIVE_STYLE_DECLARATION_EDIT_RESULT",
          requestId: msg.requestId,
          written: result.written,
        } as HostToWebviewMessage);
      } catch (err) {
        deps.send({
          type: "LIVE_STYLE_DECLARATION_EDIT_RESULT",
          requestId: msg.requestId,
          error: err instanceof Error ? err.message : String(err),
        } as HostToWebviewMessage);
      }
      break;
    }

    case "LIVE_STYLE_UNDO":
      await applyHistory("undo", deps);
      break;

    case "LIVE_STYLE_REDO":
      await applyHistory("redo", deps);
      break;

    default:
      break;
  }
}

async function applyHistory(action: "undo" | "redo", deps: LiveRuntimeDeps): Promise<void> {
  const from = action === "undo" ? undoStack : redoStack;
  const to = action === "undo" ? redoStack : undoStack;
  const entry = from.pop();
  if (!entry) {
    deps.send({ type: "LIVE_STYLE_HISTORY_RESULT", action, written: false } as HostToWebviewMessage);
    return;
  }
  const req = action === "undo" ? entry.undo : entry.redo;
  try {
    const before = await deps.workspace.readText(req.filePath);
    const result = await editCssDeclarationValue(before, req, (path, content) =>
      deps.workspace.writeText(path, content)
    );
    if (result.written) to.push(entry);
    deps.send({
      type: "LIVE_STYLE_HISTORY_RESULT",
      action,
      written: result.written,
    } as HostToWebviewMessage);
  } catch (err) {
    from.push(entry);
    deps.send({
      type: "LIVE_STYLE_HISTORY_RESULT",
      action,
      written: false,
      error: err instanceof Error ? err.message : String(err),
    } as HostToWebviewMessage);
  }
}

async function fetchLivePreview(deps: LiveRuntimeDeps): Promise<void> {
  const base = deps.config.liveServerUrl.trim().replace(/\/+$/, "");
  if (!base) {
    deps.send({
      type: "LIVE_PREVIEW_ERROR",
      error:
        "Live mode needs a running dev server. Start it (for example `npm run dev`) and set its URL in Settings.",
    });
    return;
  }

  const path = deps.session.currentPath;
  const route = mapFileToRoute(path);
  if (!route) {
    deps.send({
      type: "LIVE_PREVIEW_ERROR",
      error: `Live mode previews pages under src/pages. ${basename(path)} is a component or layout — open the page that renders it, or use Edit mode.`,
    });
    return;
  }

  const pageUrl = new URL(route, base + "/").toString();
  try {
    const separator = pageUrl.includes("?") ? "&" : "?";
    const res = await fetchWithRetry(`${pageUrl}${separator}_gl=${Date.now()}`);
    const html = await res.text();
    const prepared = await preparePreviewHtml(html, pageUrl);
    deps.send({ type: "LIVE_PREVIEW", html: prepared, url: pageUrl });
  } catch (err) {
    deps.send({
      type: "LIVE_PREVIEW_ERROR",
      error:
        err instanceof Error
          ? `Could not reach the dev server at ${base}: ${err.message}. Make sure it is running and allows cross-origin requests from this page.`
          : `Could not reach the dev server at ${base}.`,
    });
  }
}

/** Reset the in-memory Live undo history (called when the document changes). */
export function resetLiveHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}

export { preparePreviewHtml, dirname, joinPath };
