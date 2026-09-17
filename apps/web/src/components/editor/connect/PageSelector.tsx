import { useState, useEffect, useCallback } from "react";
import { useConnectStore } from "@/stores/connectStore";
import { Search, FileText, Plus, Loader2, AlertCircle } from "lucide-react";
import type { WebviewToHostMessage } from "@/types/hostMessages";

interface PageSelectorProps {
  sendToHost: (msg: WebviewToHostMessage) => void;
}

export function PageSelector({ sendToHost }: PageSelectorProps) {
  const {
    selectedSiteId,
    pages,
    pagesLoading,
    pagesError,
    selectedPageId,
    setSelectedPageId,
    setCurrentView,
    exportTarget,
    setExportTarget,
    siteThemeInfo,
  } = useConnectStore();
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const isBlockTheme = !!(selectedSiteId && siteThemeInfo[selectedSiteId]?.isBlockTheme);
  const itemLabelPlural =
    exportTarget === "template" ? "templates" : exportTarget === "template-part" ? "template parts" : "pages";

  const doSearch = useCallback(
    (q: string) => {
      if (!selectedSiteId) return;
      useConnectStore.getState().setPagesLoading(true);
      useConnectStore.getState().setPagesError(null);
      sendToHost({ type: "CONNECT_GET_PAGES", siteId: selectedSiteId, search: q || undefined, target: exportTarget });
    },
    [selectedSiteId, sendToHost, exportTarget]
  );

  useEffect(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => doSearch(search), 300);
    setSearchTimeout(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleSelectPage = (pageId: number | string | "new") => {
    setSelectedPageId(pageId);
    setCurrentView("options");
  };

  const switchTab = (target: "page" | "template" | "template-part") => {
    setSearch("");
    setExportTarget(target);
    if (selectedSiteId) {
      useConnectStore.getState().setPagesLoading(true);
      useConnectStore.getState().setPagesError(null);
      sendToHost({ type: "CONNECT_GET_PAGES", siteId: selectedSiteId, target });
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-xs font-medium transition-colors ${
      active
        ? "bg-emerald-600 text-white"
        : "border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
    }`;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${itemLabelPlural}...`}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 pl-8 pr-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-600 placeholder:text-zinc-500"
        />
      </div>

      <div className={`grid gap-2 ${isBlockTheme ? "grid-cols-3" : "grid-cols-2"}`}>
        <button onClick={() => switchTab("page")} className={tabClass(exportTarget === "page")}>
          Pages
        </button>
        <button onClick={() => switchTab("template")} className={tabClass(exportTarget === "template")}>
          Templates
        </button>
        {isBlockTheme && (
          <button onClick={() => switchTab("template-part")} className={tabClass(exportTarget === "template-part")}>
            Template Parts
          </button>
        )}
      </div>

      <button
        onClick={() => handleSelectPage("new")}
        className={`w-full flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
          selectedPageId === "new"
            ? "border-emerald-600 bg-emerald-950/30 text-emerald-400"
            : "border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
        }`}
      >
        <Plus size={14} />
        <span>
          {exportTarget === "template"
            ? "Create New Template"
            : exportTarget === "template-part"
              ? "Create New Template Part"
              : "Create New Page"}
        </span>
      </button>

      {pagesLoading && (
        <div className="flex items-center justify-center py-4 text-zinc-500">
          <Loader2 size={16} className="animate-spin" />
        </div>
      )}

      {pagesError && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-400 py-2">
          <AlertCircle size={12} />
          {pagesError}
        </div>
      )}

      {!pagesLoading && pages.length > 0 && (
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {pages.map((page) => {
            const kindLabel = page.kind === "site-template"
              ? "Template"
              : page.kind === "template-part"
                ? page.area && page.area !== "uncategorized" ? `Part · ${page.area}` : "Part"
                : null;
            return (
              <button
                key={String(page.id)}
                onClick={() => handleSelectPage(page.id)}
                className={`w-full flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                  selectedPageId === page.id
                    ? "border-emerald-600 bg-emerald-950/30"
                    : "border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60 hover:border-zinc-600"
                }`}
              >
                <FileText size={14} className="text-zinc-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-200 truncate">{page.title}</span>
                    {kindLabel && (
                      <span className="shrink-0 rounded border border-zinc-600/60 bg-zinc-800 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-zinc-400">
                        {kindLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {[page.slug ? `/${page.slug}` : "", page.origin || page.status].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!pagesLoading && !pagesError && pages.length === 0 && (
        <p className="text-center text-[10px] text-zinc-600 py-3">No {itemLabelPlural} found</p>
      )}
    </div>
  );
}
