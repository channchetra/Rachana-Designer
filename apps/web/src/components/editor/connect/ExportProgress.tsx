import { useState } from "react";
import { useConnectStore } from "@/stores/connectStore";
import { CheckCircle2, Loader2, XCircle, ExternalLink, Copy, RotateCcw } from "lucide-react";
import type { WebviewToHostMessage } from "@/types/hostMessages";
import type { ExportStep } from "@/types/connect";

interface ExportProgressProps {
  sendToHost: (msg: WebviewToHostMessage) => void;
}

const STEP_LABELS: Record<ExportStep, string> = {
  parsing: "Parsing HTML & CSS",
  downloading_assets: "Downloading external assets",
  saving_fonts: "Saving fonts to site",
  uploading_media: "Uploading media",
  converting_blocks: "Converting blocks",
  exporting_variables: "Exporting CSS variables",
  creating_page: "Creating/updating destination",
  done: "Complete",
  error: "Error",
};

export function ExportProgress({ sendToHost }: ExportProgressProps) {
  const { exporting, exportProgress, exportResult, exportError, exportCode, setCurrentView, resetExport, setExporting, selectedSiteId, sites } = useConnectStore();
  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const [copied, setCopied] = useState(false);

  const handleCancel = () => {
    sendToHost({ type: "CONNECT_CANCEL_EXPORT" });
    setExporting(false);
  };

  const handleRetry = () => {
    setCurrentView("options");
    resetExport();
  };

  const handleCopyCode = () => {
    if (!exportCode) return;
    sendToHost({ type: "COPY_TO_CLIPBOARD", text: exportCode });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Show export code result
  if (exportCode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 size={14} />
          Block code generated
        </div>
        <div className="relative">
          <textarea
            readOnly
            value={exportCode}
            rows={12}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 p-2.5 text-[10px] font-mono text-zinc-300 resize-none outline-none"
          />
          <button
            onClick={handleCopyCode}
            className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            {copied ? <CheckCircle2 size={10} className="text-emerald-400" /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  // Show error
  if (exportError) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <XCircle size={14} />
          Export failed
        </div>
        <p className="text-[10px] text-red-300 bg-red-950/30 rounded-md p-2.5 border border-red-900/50">{exportError}</p>
        <button
          onClick={handleRetry}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
        >
          <RotateCcw size={12} />
          Retry
        </button>
      </div>
    );
  }

  // Show success
  if (exportResult) {
    const targetLabel = exportResult.target === "template"
      ? "Template"
      : exportResult.target === "template-part"
        ? "Template Part"
        : "Page";
    const isFse = exportResult.target === "template-part";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 size={14} />
          Export complete!
        </div>
        <p className="text-[10px] leading-relaxed text-amber-300/80 bg-amber-950/30 border border-amber-900/40 rounded-md p-2.5">
          The first time you open this page in the editor it may take a while to process, especially with a large number of blocks. Give it some time for caching. Subsequent openings will be much faster.
        </p>
        <button
          onClick={() => {
            const siteUrl = selectedSite?.url || "";
            const editUrl = isFse
              ? exportResult.pageUrl
              : `${siteUrl}/wp-admin/post.php?post=${exportResult.pageId}&action=edit`;
            sendToHost({ type: "OPEN_EXTERNAL", url: editUrl });
          }}
          className="w-full flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          <ExternalLink size={12} />
          {`Open ${targetLabel} and Finalize Saving`}
        </button>
      </div>
    );
  }

  // Show simple loading spinner (e.g. for Generate Code which has no multi-step progress)
  if (exporting && !exportProgress) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-emerald-400" />
        <span className="ml-2 text-xs text-zinc-400">Generating code...</span>
      </div>
    );
  }

  // Show progress
  const currentStep = exportProgress?.step;
  const steps: ExportStep[] = ["parsing", "downloading_assets", "saving_fonts", "uploading_media", "exporting_variables", "creating_page", "done"];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {steps.map((step) => {
          const isActive = currentStep === step;
          const isDone = currentStep === "done" || (exportProgress && steps.indexOf(step) < steps.indexOf(currentStep || "parsing"));

          return (
            <div key={step} className={`flex items-center gap-2 text-xs ${isActive ? "text-emerald-400" : isDone ? "text-zinc-400" : "text-zinc-600"}`}>
              {isActive ? (
                <Loader2 size={13} className="animate-spin shrink-0" />
              ) : isDone ? (
                <CheckCircle2 size={13} className="shrink-0" />
              ) : (
                <div className="w-[13px] h-[13px] rounded-full border border-zinc-700 shrink-0" />
              )}
              <span>{STEP_LABELS[step]}</span>
            </div>
          );
        })}
      </div>

      {exportProgress?.message && (
        <p className="text-[10px] text-zinc-500">{exportProgress.message}</p>
      )}

      <button
        onClick={handleCancel}
        className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
