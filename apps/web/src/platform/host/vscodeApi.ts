/**
 * Legacy webview-API shim.
 *
 * The original webview obtained a tiny state API from the VS Code host:
 *
 * ```ts
 * const api = acquireVsCodeApi();
 * api.getState(); api.setState({...}); api.postMessage(msg);
 * ```
 *
 * Two ported components still use it — `PropertiesPanel` for remembering which
 * collapsible sections the user opened, and (historically) the message hook.
 * Rather than rewrite their persistence logic, this shim keeps the same three
 * methods and backs them with `localStorage`, so their state survives a reload
 * exactly as it did in the webview.
 *
 * `postMessage` is deliberately a no-op with a warning: every ported component
 * that needs to talk to the host now receives a `sendToHost` prop wired to the
 * host bridge.
 */

export interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

const STATE_PREFIX = "rachana:webview-state:";

let api: VsCodeApi | undefined;

function readState(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STATE_PREFIX + "root");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeState(state: Record<string, unknown>): void {
  try {
    localStorage.setItem(STATE_PREFIX + "root", JSON.stringify(state));
  } catch {
    /* private mode — panel state simply is not remembered */
  }
}

export function getVsCodeApi(): VsCodeApi {
  if (api) return api;
  api = {
    postMessage(msg: unknown) {
      console.warn(
        "[Rachana] A ported component called the legacy postMessage shim. " +
          "Use the `sendToHost` prop instead.",
        msg
      );
    },
    getState() {
      return readState();
    },
    setState(state: unknown) {
      const current = readState();
      const patch = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
      writeState({ ...current, ...patch });
    },
  };
  return api;
}

/** Reset all persisted webview-style state (used by Settings → Reset). */
export function clearPersistedWebviewState(): void {
  try {
    localStorage.removeItem(STATE_PREFIX + "root");
  } catch {
    /* nothing to do */
  }
}
