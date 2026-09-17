import { forwardRef, useCallback, useEffect, useState, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { ParentToIframeMessage } from "@/types/editor";

function sanitizeDroppedHtml(html: string): string {
  if (!html) return "";

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const container = document.createElement("div");
  const sourceNodes = parsed.body.childNodes.length > 0 ? parsed.body.childNodes : parsed.childNodes;

  sourceNodes.forEach((node) => {
    container.appendChild(document.importNode(node, true));
  });

  container.querySelectorAll("meta").forEach((meta) => meta.remove());
  return container.innerHTML;
}

interface CanvasProps {
  htmlContent: string;
  injectScript: string;
  sendMessage: (msg: ParentToIframeMessage) => void;
}

export const Canvas = forwardRef<HTMLIFrameElement, CanvasProps>(
  function Canvas({ htmlContent, injectScript, sendMessage }, ref) {
    const deviceWidth = useEditorStore((s) => s.deviceWidth);
    const dragBlockHtml = useEditorStore((s) => s.dragBlockHtml);
    const isDragging = useEditorStore((s) => s.isDragging);
    const setDragState = useEditorStore((s) => s.setDragState);
    const [showOverlay, setShowOverlay] = useState(false);

    // Preserve scroll position across iframe reloads
    const savedScrollRef = useRef<{ x: number; y: number } | null>(null);

    // Compute HTML with injected script
    const [finalHtml, setFinalHtml] = useState<string>("");

    useEffect(() => {
      // Capture scroll position before reload
      const iframeEl = typeof ref === "function" ? null : ref?.current;
      try {
        const win = iframeEl?.contentWindow;
        if (win) {
          savedScrollRef.current = { x: win.scrollX, y: win.scrollY };
        }
      } catch {
        // cross-origin or no contentWindow yet
      }

      let html = htmlContent;
      const scriptTag = `<script data-gl-inject>${injectScript}<\/script>`;
      if (html.includes("</body>")) {
        // Function-form replacement: the inject script may contain `$`-pattern
        // sequences (e.g. "$`") that a string replacement would expand into
        // chunks of the surrounding document, corrupting the script.
        html = html.replace("</body>", () => `${scriptTag}\n</body>`);
      } else {
        html += `\n${scriptTag}`;
      }
      setFinalHtml(html);
    }, [htmlContent, injectScript, ref]);

    // Listen for READY from iframe and restore scroll
    useEffect(() => {
      function onMessage(e: MessageEvent) {
        if (e.data?.type === "READY" && savedScrollRef.current) {
          const iframeEl = typeof ref === "function" ? null : ref?.current;
          const scroll = savedScrollRef.current;
          savedScrollRef.current = null;
          // Small delay to let the iframe fully render
          setTimeout(() => {
            try {
              iframeEl?.contentWindow?.scrollTo(scroll.x, scroll.y);
            } catch { /* ignore */ }
          }, 50);
        }
      }
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, [ref]);

    useEffect(() => {
      if (isDragging) {
        const t = setTimeout(() => setShowOverlay(true), 50);
        return () => clearTimeout(t);
      } else {
        setShowOverlay(false);
      }
    }, [isDragging]);

    // Safety: reset drag state if a drop/dragend happens anywhere
    useEffect(() => {
      if (!isDragging) return;
      const reset = () => setDragState(false);
      window.addEventListener("drop", reset, true);
      window.addEventListener("dragend", reset, true);
      return () => {
        window.removeEventListener("drop", reset, true);
        window.removeEventListener("dragend", reset, true);
      };
    }, [isDragging, setDragState]);

    const getIframeCoords = useCallback(
      (e: React.MouseEvent) => {
        const iframeEl = typeof ref === "function" ? null : ref?.current;
        if (!iframeEl) return null;
        const rect = iframeEl.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      },
      [ref]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        const coords = getIframeCoords(e);
        if (coords) {
          sendMessage({ type: "DRAG_OVER", x: coords.x, y: coords.y, html: "" });
        }
      },
      [getIframeCoords, sendMessage]
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        const rawHtml = dragBlockHtml || e.dataTransfer.getData("text/html") || "";
        const html = sanitizeDroppedHtml(rawHtml);
        if (html) {
          sendMessage({ type: "DROP", html });
        }
        setDragState(false);
        setShowOverlay(false);
      },
      [sendMessage, dragBlockHtml, setDragState]
    );

    const handleDragLeave = useCallback(
      (e: React.DragEvent) => {
        if (e.currentTarget === e.target) {
          sendMessage({ type: "DRAG_END" });
        }
      },
      [sendMessage]
    );

    return (
      <div className="flex-1 bg-zinc-950 overflow-auto flex justify-center items-start p-6">
        <div
          className="bg-white shadow-lg shadow-black/30 transition-all duration-300 h-full min-h-full relative"
          style={{ width: deviceWidth ? `${deviceWidth}px` : "100%" }}
        >
          <iframe
            ref={ref}
            srcDoc={finalHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="Editor Canvas"
          />
          {showOverlay && (
            <div
              className="absolute inset-0 bg-blue-500/5"
              style={{ zIndex: 10, cursor: "copy" }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          )}
        </div>
      </div>
    );
  }
);
