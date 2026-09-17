import { useState } from "react";
import { useConnectStore } from "@/stores/connectStore";
import { SiteForm } from "./SiteForm";
import { Globe, Trash2, Zap, CheckCircle2, XCircle, ChevronRight, Plus, Loader2 } from "lucide-react";
import type { WebviewToHostMessage } from "@/types/hostMessages";

interface SiteManagerProps {
  sendToHost: (msg: WebviewToHostMessage) => void;
}

export function SiteManager({ sendToHost }: SiteManagerProps) {
  const { sites, selectedSiteId, setSelectedSiteId, setCurrentView, testingSiteId, siteTestResults, exportTarget } = useConnectStore();
  const [showForm, setShowForm] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);

  const handleAddSite = (data: { label: string; url: string; username: string; appPassword: string }) => {
    setAddingLoading(true);
    sendToHost({ type: "CONNECT_ADD_SITE", site: data });
    setTimeout(() => {
      setAddingLoading(false);
      setShowForm(false);
    }, 500);
  };

  const handleRemoveSite = (siteId: string) => {
    sendToHost({ type: "CONNECT_REMOVE_SITE", siteId });
  };

  const handleTestSite = (siteId: string) => {
    useConnectStore.getState().setTestingSiteId(siteId);
    sendToHost({ type: "CONNECT_TEST_SITE", siteId });
  };

  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    useConnectStore.getState().setPages([]);
    useConnectStore.getState().setPagesError(null);
    useConnectStore.getState().setPagesLoading(true);
    sendToHost({ type: "CONNECT_GET_PAGES", siteId, target: exportTarget });
    setCurrentView("pages");
  };

  return (
    <div className="space-y-3">
      {sites.length === 0 && !showForm && (
        <div className="text-center py-6">
          <Globe size={24} className="mx-auto text-zinc-600 mb-2" />
          <p className="text-xs text-zinc-500">No sites connected</p>
          <p className="text-[10px] text-zinc-600 mt-1">Add a WordPress site to get started</p>
        </div>
      )}

      {sites.map((site) => {
        const testResult = siteTestResults[site.id];
        const isTesting = testingSiteId === site.id;
        return (
          <div key={site.id} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">{site.label}</div>
                <div className="text-[10px] text-zinc-500 truncate">{site.url}</div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  onClick={() => handleTestSite(site.id)}
                  disabled={isTesting}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                  title="Test connection"
                >
                  {isTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                </button>
                <button
                  onClick={() => handleRemoveSite(site.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                  title="Remove site"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  onClick={() => handleSelectSite(site.id)}
                  className="flex h-7 items-center gap-1 px-2 rounded-md text-xs text-emerald-400 hover:bg-emerald-950/50 transition-colors"
                  title="Select site"
                >
                  Select <ChevronRight size={12} />
                </button>
              </div>
            </div>
            {testResult && (
              <div className={`mt-2 flex items-center gap-1.5 text-[10px] ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {testResult.success ? `Connected${testResult.siteName ? ` — ${testResult.siteName}` : ""}` : testResult.error || "Connection failed"}
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-zinc-300">Add WordPress Site</span>
            <button onClick={() => setShowForm(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
          </div>
          <SiteForm onSubmit={handleAddSite} loading={addingLoading} />
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          <Plus size={14} />
          Add Site
        </button>
      )}
    </div>
  );
}
