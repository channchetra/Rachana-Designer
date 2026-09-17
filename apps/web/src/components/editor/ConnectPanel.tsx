import { useEffect } from "react";
import { useConnectStore } from "@/stores/connectStore";
import { SiteManager } from "./connect/SiteManager";
import { PageSelector } from "./connect/PageSelector";
import { ExportOptions } from "./connect/ExportOptions";
import { ExportProgress } from "./connect/ExportProgress";
import { X, ArrowLeft, Code2, Globe, Loader2, Info, Lock } from "lucide-react";
import type { WebviewToHostMessage } from "@/types/hostMessages";

interface ConnectPanelProps {
  sendToHost: (msg: WebviewToHostMessage) => void;
  rawHtmlContent: string;
}

const VIEW_TITLES: Record<string, string> = {
  home: "Connect",
  sites: "WordPress Sites",
  pages: "Select Destination",
  options: "Export Options",
  progress: "Exporting",
  code: "Export Code",
};

function HomeView({ sendToHost, onNavigate }: { sendToHost: (msg: WebviewToHostMessage) => void; onNavigate: (view: "sites" | "code") => void }) {
  const { setExporting, resetExport, setCurrentView, convertToClasses, exportMode, externalAssetsMode } = useConnectStore();

  const handleGenerateCode = () => {
    resetExport();
    setExporting(true);
    setCurrentView("code");
    sendToHost({ type: "CONNECT_GENERATE_CODE", convertToClasses, exportMode, externalAssetsMode });
  };

  /**
   * Both export routes are always available — Rachana Designer has no licence
   * tier, so there is nothing to check and nothing to unlock.
   */
  const handleExportClick = () => {
    onNavigate("sites");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2.5 rounded-lg border border-blue-900/50 bg-blue-950/30 p-3">
        <Info size={14} className="shrink-0 text-blue-400 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-blue-300/80">
          Your WordPress site must have the{" "}
          <button type="button" onClick={() => sendToHost({ type: "OPEN_EXTERNAL", url: "https://greenshiftwp.com" })} className="font-medium text-blue-200 underline hover:text-blue-100 cursor-pointer bg-transparent border-0 p-0 inline">GreenShift</button>{" "}
          free plugin installed to use this export feature.
        </p>
      </div>

      <button
        onClick={handleGenerateCode}
        className="w-full flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-left hover:border-emerald-600/50 hover:bg-zinc-800 transition-colors group"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-950/50 text-emerald-400 group-hover:bg-emerald-950">
          <Code2 size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-zinc-200">Generate Code</div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Convert current HTML to GreenShift block code. No site connection needed.</div>
        </div>
      </button>

      <button
        onClick={handleExportClick}
        className="w-full flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-left hover:border-emerald-600/50 hover:bg-zinc-800 transition-colors group"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-950/50 text-blue-400 group-hover:bg-blue-950">
          <Globe size={18} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-zinc-200">Export to WordPress</div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Connect to a WordPress site and export as GreenShift blocks to pages or reusable templates.</div>
        </div>
      </button>
    </div>
  );
}

export function ConnectPanel({ sendToHost, rawHtmlContent }: ConnectPanelProps) {
  const { connectPanelOpen, setConnectPanelOpen, currentView, setCurrentView } = useConnectStore();

  // Load sites when navigating to sites view
  useEffect(() => {
    if (connectPanelOpen && currentView === "sites") {
      sendToHost({ type: "CONNECT_GET_SITES" });
    }
  }, [connectPanelOpen, currentView, sendToHost]);

  // When entering pages view, refresh active-theme info so we know if the
  // "Template Parts" tab should be shown (block theme detection).
  useEffect(() => {
    if (!connectPanelOpen || currentView !== "pages") return;
    const siteId = useConnectStore.getState().selectedSiteId;
    if (siteId) sendToHost({ type: "CONNECT_GET_SITE_INFO", siteId });
  }, [connectPanelOpen, currentView, sendToHost]);

  if (!connectPanelOpen) return null;

  const handleClose = () => {
    setConnectPanelOpen(false);
    setCurrentView("home");
  };

  const handleBack = () => {
    const backMap: Record<string, string> = {
      sites: "home",
      pages: "sites",
      options: "pages",
      progress: "home",
      code: "home",
    };
    setCurrentView((backMap[currentView] || "home") as typeof currentView);
  };

  const canGoBack = currentView !== "home";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[440px] max-h-[600px] flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button
                onClick={handleBack}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <span className="text-sm font-medium text-zinc-200">{VIEW_TITLES[currentView]}</span>
          </div>
          <button
            onClick={handleClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {currentView === "home" && <HomeView sendToHost={sendToHost} onNavigate={setCurrentView} />}
          {currentView === "sites" && <SiteManager sendToHost={sendToHost} />}
          {currentView === "pages" && <PageSelector sendToHost={sendToHost} />}
          {currentView === "options" && <ExportOptions sendToHost={sendToHost} rawHtmlContent={rawHtmlContent} />}
          {(currentView === "progress" || currentView === "code") && <ExportProgress sendToHost={sendToHost} />}
        </div>
      </div>
    </div>
  );
}
