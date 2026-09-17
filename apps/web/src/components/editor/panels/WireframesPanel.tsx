import { useEffect, useRef, useState, useCallback } from "react";
import { LayoutGrid, GripVertical, Loader2, ServerOff, Download } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import type { TemplateItem } from "@/types/editor";

interface WireframesPanelProps {
  onDragStart: (html: string) => void;
  onDragEnd: () => void;
  onLoadTemplates: (page: number, limit: number, category: string | null, tag: string | null) => void;
  onImportTemplate: (id: number) => void;
  onInsertTemplate: (html: string, templateId?: string) => void;
}

export function WireframesPanel({ onDragStart, onDragEnd, onLoadTemplates, onImportTemplate, onInsertTemplate }: WireframesPanelProps) {
  const {
    templates,
    templateCategories,
    templatePage,
    templatePages,
    templateTotal,
    templateError,
    importingTemplateId,
    setImportingTemplateId,
  } = useEditorStore();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  // Initial load (once)
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      onLoadTemplates(1, 12, null, null);
    }
  }, [onLoadTemplates]);

  // Clear initial loading once first data arrives
  useEffect(() => {
    if (templatePage > 0 || templateError) {
      setInitialLoading(false);
    }
  }, [templatePage, templateError]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && templatePage < templatePages) {
          onLoadTemplates(templatePage + 1, 12, selectedCategory, selectedTag);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [templatePage, templatePages, selectedCategory, selectedTag, onLoadTemplates]);

  const handleCategoryChange = useCallback(
    (cat: string | null) => {
      setSelectedCategory(cat);
      onLoadTemplates(1, 12, cat, selectedTag);
    },
    [onLoadTemplates, selectedTag]
  );

  const handleTagChange = useCallback(
    (tag: string | null) => {
      setSelectedTag(tag);
      onLoadTemplates(1, 12, selectedCategory, tag);
    },
    [onLoadTemplates, selectedCategory]
  );

  const handleImport = useCallback(
    (template: TemplateItem) => {
      const tplId = "gl-tpl-" + template.id;
      if (template.html) {
        onInsertTemplate(template.html, tplId);
        return;
      }
      setImportingTemplateId(template.id);
      onImportTemplate(template.id);
    },
    [onInsertTemplate, onImportTemplate, setImportingTemplateId]
  );

  // When HTML arrives for a template being imported, insert it
  const prevImportingRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevImportingRef.current !== null && importingTemplateId === null) {
      const t = templates.find((t) => t.id === prevImportingRef.current);
      if (t?.html) {
        onInsertTemplate(t.html, "gl-tpl-" + t.id);
      }
    }
    prevImportingRef.current = importingTemplateId;
  }, [importingTemplateId, templates, onInsertTemplate]);

  const hasMore = templatePage < templatePages;

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-emerald-400" />
          <span className="text-xs font-medium text-zinc-200">Wireframes</span>
        </div>
        {templateTotal > 0 && (
          <span className="text-[10px] text-zinc-500">{templateTotal} templates</span>
        )}
      </div>

      {/* Tag filter (pro/free/all) */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-zinc-800/50 shrink-0">
        <TagPill label="All" active={selectedTag === null} onClick={() => handleTagChange(null)} />
        <TagPill label="Free" active={selectedTag === "free"} onClick={() => handleTagChange("free")} />
        <TagPill label="Pro" active={selectedTag === "pro"} onClick={() => handleTagChange("pro")} />
      </div>

      {/* Category pills */}
      {templateCategories.length > 0 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-zinc-800/50 overflow-x-auto shrink-0">
          <CategoryPill
            label="All"
            active={selectedCategory === null}
            onClick={() => handleCategoryChange(null)}
          />
          {templateCategories.map((cat) => (
            <CategoryPill
              key={cat}
              label={cat}
              active={selectedCategory === cat}
              onClick={() => handleCategoryChange(cat)}
            />
          ))}
        </div>
      )}

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {/* Initial loading skeleton */}
        {initialLoading && (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 overflow-hidden animate-pulse">
                <div className="w-full bg-zinc-800/60" style={{ height: 133 }} />
                <div className="flex items-center gap-2 px-2 py-2 bg-zinc-900/80 border-t border-zinc-800/50">
                  <div className="h-3 w-24 bg-zinc-800 rounded" />
                  <div className="h-3 w-12 bg-zinc-800 rounded ml-auto" />
                </div>
              </div>
            ))}
          </>
        )}

        {/* Error state */}
        {!initialLoading && templateError && templates.length === 0 && (
          <div className="text-center py-10 px-3">
            <ServerOff size={24} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
              {templateError}
            </p>
          </div>
        )}

        {/* Template cards */}
        {!initialLoading && templates.map((template, i) => (
          <TemplateCard
            key={`${template.id}-${i}`}
            template={template}
            isImporting={importingTemplateId === template.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onImport={handleImport}
          />
        ))}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            <Loader2 size={16} className="text-zinc-600 animate-spin" />
          </div>
        )}

        {/* "More soon" card at the end */}
        {!initialLoading && !hasMore && templates.length > 0 && (
          <div className="rounded-lg border border-dashed border-zinc-700 overflow-hidden">
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <LayoutGrid size={20} className="text-zinc-700 mb-2" />
              <p className="text-[11px] text-zinc-500 font-medium">More templates soon</p>
            </div>
          </div>
        )}

        {/* Empty state (no error) */}
        {!initialLoading && !templateError && templates.length === 0 && templatePage > 0 && (
          <div className="text-center py-10 px-4">
            <LayoutGrid size={24} className="text-zinc-800 mx-auto mb-3" />
            <p className="text-xs text-zinc-500">No templates in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TagPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] rounded-md whitespace-nowrap font-medium transition-colors ${
        active
          ? "bg-emerald-950 text-emerald-400"
          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
      }`}
    >
      {label}
    </button>
  );
}

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded-md whitespace-nowrap capitalize transition-colors ${
        active
          ? "bg-emerald-950 text-emerald-400"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
      }`}
    >
      {label.replace(/[-_]/g, " ")}
    </button>
  );
}

function TemplateCard({
  template,
  isImporting,
  onDragStart,
  onDragEnd,
  onImport,
}: {
  template: TemplateItem;
  isImporting: boolean;
  onDragStart: (html: string) => void;
  onDragEnd: () => void;
  onImport: (template: TemplateItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div
      draggable={!!template.html}
      onDragStart={(e) => {
        if (template.html) {
          e.dataTransfer.setData("text/html", template.html);
          e.dataTransfer.effectAllowed = "copy";
          onDragStart(template.html);
        }
      }}
      onDragEnd={onDragEnd}
      className="group rounded-lg border border-zinc-800 hover:border-zinc-600 transition-all hover:shadow-lg hover:shadow-black/20 overflow-hidden"
    >
      {/* Video preview */}
      <div
        className="relative w-full overflow-hidden bg-zinc-950"
        style={{ height: 133 }}
        onMouseEnter={() => videoRef.current?.play()}
        onMouseLeave={() => {
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
          }
        }}
      >
        {template.video_minimal ? (
          <video
            ref={videoRef}
            src={template.video_minimal}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <LayoutGrid size={20} className="text-zinc-800" />
          </div>
        )}

        {/* Pro/Free badge */}
        <span
          className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wide ${
            template.tag === "pro"
              ? "bg-amber-500/90 text-black"
              : "bg-emerald-600/90 text-white"
          }`}
        >
          {template.tag}
        </span>
      </div>

      {/* Label + Import */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-900/80 border-t border-zinc-800/50">
        <GripVertical
          size={10}
          className={`text-zinc-600 shrink-0 transition-opacity ${template.html ? "opacity-0 group-hover:opacity-100 cursor-grab" : "opacity-0"}`}
        />
        <span className="text-[11px] text-zinc-400 group-hover:text-zinc-300 capitalize truncate transition-colors">
          {template.name}
        </span>
        <span className="text-[9px] text-zinc-600 capitalize shrink-0">
          {template.category}
        </span>
        <button
          onClick={() => onImport(template)}
          disabled={isImporting}
          className="ml-auto shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
          title="Import template"
        >
          {isImporting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
        </button>
      </div>
    </div>
  );
}
