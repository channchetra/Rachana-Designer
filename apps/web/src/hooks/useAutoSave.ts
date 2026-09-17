import { useCallback, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { WebviewToHostMessage } from "@/types/hostMessages";

export function useAutoSave(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  sendToHost: (msg: WebviewToHostMessage) => void
) {
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback(() => {
    console.log("[AutoSave] triggerSave called — setting unsaved, debouncing 1500ms");
    setSaveStatus("unsaved");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      console.log("[AutoSave] debounce fired");
      try {
        const iframe = iframeRef.current;
        if (!iframe) {
          console.warn("[AutoSave] iframe ref is null — cannot save");
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = iframe?.contentWindow as any;

        // In markdown mode, use full HTML save (body content only)
        if (typeof win?.__glIsMarkdownMode === "function" && win.__glIsMarkdownMode()) {
          const getBodyHtml = win.__glGetBodyHtml;
          if (typeof getBodyHtml === "function") {
            const bodyHtml = getBodyHtml();
            if (bodyHtml) {
              setSaveStatus("saving");
              sendToHost({ type: "SAVE_FILE", content: bodyHtml });
              return;
            }
          }
          setSaveStatus("saved");
          return;
        }

        const getPatches = win?.__glGetPatches;
        if (typeof getPatches !== "function") {
          console.warn("[AutoSave] __glGetPatches is not a function:", typeof getPatches);
          return;
        }
        const patches = getPatches();
        console.log("[AutoSave] patches result:", patches
          ? `HAS_PATCHES (styleBlocks:${patches.styleBlocks?.length ?? 0}, elements:${patches.elements?.length ?? 0}, deletions:${patches.deletions?.length ?? 0}, insertions:${patches.insertions?.length ?? 0})`
          : "null/empty — no changes detected");
        if (patches) {
          // Structural changes are supported by the patch pipeline too, and
          // template/wireframe imports rely on SAVE_PATCHES so the host can
          // selectively scaffold clean HTML files when needed.
          setSaveStatus("saving");
          const { styleScope, isAstroFile } = useEditorStore.getState();
          sendToHost({ type: "SAVE_PATCHES", patches, ...(isAstroFile ? { styleScope } : {}) });
        } else {
          // Nothing changed — reset status
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error("[AutoSave] error calling __glGetPatches (cross-origin?):", err);
        // If direct access fails (cross-origin), use postMessage fallback
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          console.log("[AutoSave] falling back to GET_FULL_HTML postMessage");
          setSaveStatus("saving");
          iframe.contentWindow.postMessage({ type: "GET_FULL_HTML" }, "*");
        } else {
          console.warn("[AutoSave] fallback failed — no iframe contentWindow");
        }
      }
    }, 1500);
  }, [setSaveStatus, iframeRef, sendToHost]);

  return { triggerSave };
}
