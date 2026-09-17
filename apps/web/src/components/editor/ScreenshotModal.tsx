import { useCallback, useRef } from "react";
import {
  X,
  Camera,
  Monitor,
  Tablet,
  Smartphone,
  Laptop,
  Download,
  FolderDown,
  Check,
  Loader2,
  Info,
  CheckSquare,
  Square,
} from "lucide-react";
import { toCanvas } from "html-to-image";
import { useScreenshotStore, ScreenshotResult } from "@/stores/screenshotStore";
import { useEditorStore } from "@/stores/editorStore";
import { ColorInput } from "./ColorInput";
import type { WebviewToHostMessage } from "@/types/hostMessages";

interface ScreenshotModalProps {
  htmlContent: string;
  sendToHost: (msg: WebviewToHostMessage) => void;
}

const ICON_MAP: Record<string, typeof Monitor> = {
  monitor: Monitor,
  tablet: Tablet,
  smartphone: Smartphone,
  laptop: Laptop,
};

const EDITABLE_SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);
const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_AREA = 16777216;
const CAPTURE_PADDING = 2;

// ─── Element lookup ──────────────────────────────────────

function findElementByGlPath(doc: Document, targetPath: string): HTMLElement | null {
  function walk(node: Element, prefix: string): HTMLElement | null {
    const children = Array.from(node.children).filter(
      (c) => c.nodeType === 1 && !EDITABLE_SKIP.has(c.tagName)
    );
    for (let i = 0; i < children.length; i++) {
      const path = prefix ? `${prefix}.${i}` : `${i}`;
      if (path === targetPath) return children[i] as HTMLElement;
      const found = walk(children[i], path);
      if (found) return found;
    }
    return null;
  }
  return walk(doc.body, "");
}

// ─── Wait for fonts & images ─────────────────────────────

async function waitForIframeAssets(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) {
    try { await fonts.ready; } catch { /* ignore */ }
  }

  await Promise.allSettled(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const done = () => { img.removeEventListener("load", done); img.removeEventListener("error", done); resolve(); };
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// ─── Measurement helpers ─────────────────────────────────

function measureElementBounds(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left - CAPTURE_PADDING,
    top: rect.top - CAPTURE_PADDING,
    right: rect.right + CAPTURE_PADDING,
    bottom: rect.bottom + CAPTURE_PADDING,
    width: Math.max(1, Math.ceil(rect.right - rect.left + CAPTURE_PADDING * 2)),
    height: Math.max(1, Math.ceil(rect.bottom - rect.top + CAPTURE_PADDING * 2)),
  };
}

function getSafeCaptureScale(width: number, height: number, preferredScale: number) {
  if (width <= 0 || height <= 0) return 1;
  const dimScale = Math.min(MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height);
  const areaScale = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.max(0.5, Math.min(preferredScale, dimScale, areaScale));
}

function isUsableDataUrl(dataUrl: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl) && dataUrl.length > 64;
}

// ─── Core capture via html-to-image ──────────────────────

async function captureElementAtWidth(
  htmlContent: string,
  elementPath: string,
  width: number,
  format: "png" | "webp",
  backgroundColor: string | null = null,
  scale: number = 2,
  viewportHeight: number = 900
): Promise<string> {
  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    container.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;z-index:-1;`;
    document.body.appendChild(container);

    const iframe = document.createElement("iframe");
    iframe.style.cssText = `width:${width}px;height:${viewportHeight}px;border:none;`;
    iframe.setAttribute("sandbox", "allow-same-origin");
    container.appendChild(iframe);
    iframe.srcdoc = htmlContent;

    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) throw new Error("Cannot access iframe document");

        await waitForIframeAssets(doc);

        const el = findElementByGlPath(doc, elementPath);
        if (!el) throw new Error("Element not found at path: " + elementPath);

        // Measure at correct viewport size so vh/vw units resolve properly
        const initialBounds = measureElementBounds(el);

        // Expand iframe if element extends beyond viewport
        let iframeH = viewportHeight;
        if (initialBounds.bottom > viewportHeight) {
          // Lock vh-based heights before expanding
          const cs = win.getComputedStyle(el);
          el.style.height = cs.height;
          el.style.minHeight = cs.minHeight;
          iframeH = Math.ceil(initialBounds.bottom + 100);
          iframe.style.height = `${iframeH}px`;
          container.style.height = `${iframeH}px`;
          await waitForIframeAssets(doc);
        }

        const finalBounds = initialBounds.bottom > viewportHeight
          ? measureElementBounds(el) : initialBounds;
        const cropW = finalBounds.width;
        const cropH = finalBounds.height;
        const safeScale = getSafeCaptureScale(cropW, cropH, scale);

        // Use html-to-image to capture the full body
        const fullCanvas = await toCanvas(doc.body, {
          pixelRatio: safeScale,
          width,
          height: iframeH,
          backgroundColor: undefined,
          cacheBust: true,
          skipAutoScale: true,
          filter: (node: HTMLElement) => {
            // Skip script tags
            if (node.tagName === "SCRIPT" || node.tagName === "NOSCRIPT") return false;
            return true;
          },
        });

        // Crop to element bounds
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(cropW * safeScale);
        canvas.height = Math.ceil(cropH * safeScale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot create crop canvas context");
        ctx.drawImage(
          fullCanvas,
          finalBounds.left * safeScale,
          finalBounds.top * safeScale,
          cropW * safeScale,
          cropH * safeScale,
          0, 0,
          canvas.width,
          canvas.height
        );

        // Composite background color
        let outputCanvas = canvas;
        if (backgroundColor) {
          const bgCanvas = document.createElement("canvas");
          bgCanvas.width = canvas.width;
          bgCanvas.height = canvas.height;
          const bgCtx = bgCanvas.getContext("2d");
          if (!bgCtx) throw new Error("Cannot create bg canvas context");
          bgCtx.fillStyle = backgroundColor;
          bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
          bgCtx.drawImage(canvas, 0, 0);
          outputCanvas = bgCanvas;
        }

        const mimeType = format === "webp" ? "image/webp" : "image/png";
        let dataUrl = outputCanvas.toDataURL(mimeType, 0.95);
        if (!isUsableDataUrl(dataUrl) && mimeType !== "image/png") {
          dataUrl = outputCanvas.toDataURL("image/png");
        }
        if (!isUsableDataUrl(dataUrl)) {
          throw new Error(`Generated invalid screenshot data URL (${cropW}x${cropH} @ ${safeScale.toFixed(2)}x)`);
        }

        document.body.removeChild(container);
        resolve(dataUrl);
      } catch (err) {
        document.body.removeChild(container);
        reject(err);
      }
    };

    iframe.onerror = () => {
      document.body.removeChild(container);
      reject(new Error("Failed to load iframe"));
    };
  });
}

// ─── Component ───────────────────────────────────────────

export function ScreenshotModal({ htmlContent, sendToHost }: ScreenshotModalProps) {
  const {
    modalOpen,
    closeModal,
    devices,
    toggleDevice,
    selectAllDevices,
    deselectAllDevices,
    format,
    setFormat,
    bgEnabled,
    setBgEnabled,
    bgColor,
    setBgColor,
    capturing,
    setCapturing,
    progress,
    totalDevices,
    setProgress,
    results,
    addResult,
    clearResults,
    savingToFolder,
    setSavingToFolder,
    savedFolderName,
  } = useScreenshotStore();

  const selectedElement = useEditorStore((s) => s.selectedElement);
  const abortRef = useRef(false);

  const selectedDevices = devices.filter((d) => d.checked);
  const allSelected = devices.every((d) => d.checked);
  const hasElement = !!selectedElement;

  const handleCapture = useCallback(async () => {
    if (!selectedElement?.path) return;
    const devicesToCapture = devices.filter((d) => d.checked);
    if (devicesToCapture.length === 0) return;

    abortRef.current = false;
    clearResults();
    setCapturing(true);
    setProgress(0, devicesToCapture.length);

    const ext = format === "webp" ? "webp" : "png";
    const bg = bgEnabled ? bgColor : null;

    for (let i = 0; i < devicesToCapture.length; i++) {
      if (abortRef.current) break;
      const device = devicesToCapture[i];
      setProgress(i + 1, devicesToCapture.length);

      try {
        const dataUrl = await captureElementAtWidth(
          htmlContent,
          selectedElement.path,
          device.w,
          format,
          bg,
          2,
          device.h
        );

        const result: ScreenshotResult = {
          deviceId: device.id,
          deviceName: device.name,
          width: device.w,
          height: device.h,
          dataUrl,
          filename: `${device.id}-${device.w}x${device.h}.${ext}`,
        };
        addResult(result);
      } catch (err) {
        console.error(`Failed to capture ${device.name}:`, err);
      }
    }

    setCapturing(false);
  }, [selectedElement, devices, format, bgEnabled, bgColor, htmlContent, clearResults, setCapturing, setProgress, addResult]);

  const handleDownloadSingle = useCallback((result: ScreenshotResult) => {
    const a = document.createElement("a");
    a.href = result.dataUrl;
    a.download = result.filename;
    a.click();
  }, []);

  const handleSaveToProject = useCallback(() => {
    if (results.length === 0) return;
    setSavingToFolder(true);
    const images = results.map((r) => ({
      filename: r.filename,
      dataBase64: r.dataUrl.split(",")[1],
    }));
    sendToHost({ type: "SAVE_SCREENSHOTS", images } as any);
  }, [results, setSavingToFolder, sendToHost]);

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="w-[520px] max-h-[85vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Camera size={14} className="text-emerald-400" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-200">Screenshot Tool</h2>
          </div>
          <button
            onClick={closeModal}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Info */}
          <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed ${
            hasElement
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/80"
              : "border-amber-500/20 bg-amber-500/5 text-amber-300/80"
          }`}>
            <Info size={14} className="shrink-0 mt-0.5" />
            <div>
              {hasElement ? (
                <>
                  Selected: <span className="font-mono text-emerald-400">&lt;{selectedElement!.tagName}&gt;</span>
                  {selectedElement!.path && (
                    <span className="text-zinc-500 ml-1.5">path: {selectedElement!.path}</span>
                  )}
                </>
              ) : (
                "Select a layer in the editor first. It will be used for screenshot capture."
              )}
            </div>
          </div>

          {/* Devices */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Target devices
              </div>
              <button
                onClick={allSelected ? deselectAllDevices : selectAllDevices}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {devices.map((device) => {
                const Icon = ICON_MAP[device.icon] || Monitor;
                return (
                  <button
                    key={device.id}
                    onClick={() => toggleDevice(device.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left ${
                      device.checked
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-800/30 hover:border-zinc-700"
                    }`}
                  >
                    <div className="shrink-0">
                      {device.checked ? (
                        <CheckSquare size={14} className="text-emerald-400" />
                      ) : (
                        <Square size={14} className="text-zinc-600" />
                      )}
                    </div>
                    <Icon size={16} className={device.checked ? "text-emerald-400/70" : "text-zinc-600"} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-medium ${device.checked ? "text-zinc-200" : "text-zinc-500"}`}>
                        {device.name}
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {device.w} × {device.h}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Format */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
              Format
            </div>
            <div className="flex gap-2">
              {(["png", "webp"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                    format === f
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                      : "border-zinc-800 bg-zinc-800/30 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                  }`}
                >
                  <div className="text-[12px]">{f.toUpperCase()}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {f === "png" ? "Lossless + alpha" : "Smaller + alpha"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
              Background
            </div>
            <div className="space-y-2.5">
              <button
                onClick={() => setBgEnabled(!bgEnabled)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border transition-all text-left ${
                  bgEnabled
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-zinc-800 bg-zinc-800/30 hover:border-zinc-700"
                }`}
              >
                <div className="shrink-0">
                  {bgEnabled ? (
                    <CheckSquare size={14} className="text-emerald-400" />
                  ) : (
                    <Square size={14} className="text-zinc-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className={`text-[12px] font-medium ${bgEnabled ? "text-zinc-200" : "text-zinc-500"}`}>
                    Enable background
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    {bgEnabled ? "Solid color behind the element" : "Transparent (alpha channel)"}
                  </div>
                </div>
              </button>
              {bgEnabled && (
                <div className="flex items-center gap-2.5 pl-1">
                  <div className="text-[11px] text-zinc-500 shrink-0">Color</div>
                  <div className="flex-1">
                    <ColorInput value={bgColor} onChange={setBgColor} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Capture Button */}
          <button
            onClick={handleCapture}
            disabled={capturing || !hasElement || selectedDevices.length === 0}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-semibold transition-all flex items-center justify-center gap-2"
          >
            {capturing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Capturing {progress}/{totalDevices}...
              </>
            ) : (
              <>
                <Camera size={14} />
                Make Screenshots
              </>
            )}
          </button>

          {/* Progress Bar */}
          {capturing && totalDevices > 0 && (
            <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${(progress / totalDevices) * 100}%` }}
              />
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                Results — {results.length} screenshot{results.length !== 1 ? "s" : ""}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {results.map((result) => (
                  <div
                    key={result.deviceId}
                    className="group rounded-lg border border-zinc-800 overflow-hidden bg-zinc-800/30 hover:border-emerald-500/30 transition-all"
                  >
                    <div className="relative aspect-[4/3] bg-[repeating-conic-gradient(#27272a_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] overflow-hidden">
                      <img
                        src={result.dataUrl}
                        alt={result.deviceName}
                        className="w-full h-full object-contain object-top"
                      />
                    </div>
                    <div className="px-2 py-1.5 border-t border-zinc-800/60">
                      <div className="text-[10px] font-medium text-zinc-400 truncate">
                        {result.deviceName}
                      </div>
                      <div className="text-[9px] text-zinc-600">{result.width}px</div>
                    </div>
                    <button
                      onClick={() => handleDownloadSingle(result)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/5 border-t border-zinc-800/60 transition-colors"
                    >
                      <Download size={10} />
                      Download
                    </button>
                  </div>
                ))}
              </div>

              {/* Save to Project Folder */}
              <div className="mt-3">
                {savedFolderName ? (
                  <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-[11px] text-emerald-400">
                    <Check size={14} />
                    Saved to {savedFolderName}/
                  </div>
                ) : (
                  <button
                    onClick={handleSaveToProject}
                    disabled={savingToFolder}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 disabled:opacity-50 text-[11px] text-zinc-300 font-medium transition-all"
                  >
                    {savingToFolder ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <FolderDown size={14} />
                        Download all to project folder
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
