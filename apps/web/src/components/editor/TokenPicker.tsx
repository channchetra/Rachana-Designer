import type { CssVariable } from "@/types/editor";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Search, X, Plus } from "lucide-react";

// ============================================================
// Variable grouping utilities
// ============================================================

interface VariableGroup {
  label: string;
  keywords: string[];
}

const VARIABLE_GROUPS: VariableGroup[] = [
  { label: "Colors", keywords: ["color", "bg", "background", "fill", "stroke", "border-color", "text-color", "accent", "primary", "secondary", "success", "warning", "danger", "error", "info", "muted", "foreground"] },
  { label: "Spacing", keywords: ["spacing", "space", "gap", "margin", "padding", "inset", "offset"] },
  { label: "Size", keywords: ["size", "width", "height", "radius", "rounded", "border-width", "stroke-width", "thickness"] },
  { label: "Typography", keywords: ["font", "text", "letter", "line-height", "leading", "tracking", "weight"] },
  { label: "Shadows", keywords: ["shadow", "elevation", "blur"] },
  { label: "Transitions", keywords: ["duration", "timing", "delay", "ease", "transition", "animation"] },
  { label: "Z-Index", keywords: ["z-index", "z-"] },
  { label: "Opacity", keywords: ["opacity", "alpha"] },
];

function classifyVariable(name: string): string {
  const lower = name.toLowerCase();
  for (const group of VARIABLE_GROUPS) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      return group.label;
    }
  }
  return "Other";
}

function groupVariables(variables: CssVariable[]): Map<string, CssVariable[]> {
  const groups = new Map<string, CssVariable[]>();
  for (const v of variables) {
    const group = classifyVariable(v.name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(v);
  }
  const ordered = new Map<string, CssVariable[]>();
  for (const g of VARIABLE_GROUPS) {
    if (groups.has(g.label)) ordered.set(g.label, groups.get(g.label)!);
  }
  if (groups.has("Other")) ordered.set("Other", groups.get("Other")!);
  return ordered;
}

export function isColorLike(v: string): boolean {
  return v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl");
}

function parseColorPreview(value: string): string {
  if (!value || value === "transparent") return "#000000";
  const rgbaMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]), g = parseInt(rgbaMatch[2]), b = parseInt(rgbaMatch[3]);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  if (value.startsWith("#") && (value.length === 4 || value.length === 7 || value.length === 9)) return value.slice(0, 7);
  return "#333";
}

export function TokenPicker({
  variables,
  onSelect,
  onClose,
  triggerRef,
  onCreateVariable,
}: {
  variables: CssVariable[];
  onSelect: (varRef: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | HTMLDivElement | null>;
  onCreateVariable?: (name: string, value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarValue, setNewVarValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(4, rect.right - 256) });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [triggerRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    if (creating && nameInputRef.current) nameInputRef.current.focus();
  }, [creating]);

  const filtered = variables.filter(
    (v) => !search || v.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupVariables(filtered);
  const hasMultipleGroups = grouped.size > 1;

  // Flat list for keyboard navigation (excludes group headers)
  const flatItems = filtered;

  // Reset active index when search changes
  useEffect(() => { setActiveIndex(-1); }, [search]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-picker-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (creating) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const v = flatItems[activeIndex];
      if (v) { onSelect(`var(${v.name})`); onClose(); }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleCreate = () => {
    const name = newVarName.trim().replace(/^-*/, "--");
    const value = newVarValue.trim();
    if (!name || name === "--" || !value || !onCreateVariable) return;
    onCreateVariable(name, value);
    onSelect(`var(${name})`);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed w-64 max-h-80 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl flex flex-col overflow-hidden"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        zIndex: 9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="px-2.5 py-2 border-b border-zinc-700/40">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tokens..."
            autoFocus
            className="w-full pl-6 pr-6 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X size={10} />
            </button>
          )}
        </div>
      </div>
      <div ref={listRef} className="overflow-y-auto flex-1">
        {/* Create new variable */}
        {onCreateVariable && !creating && (
          <button
            onClick={() => { setCreating(true); setNewVarName(search ? `--${search.replace(/^-*/, "")}` : "--"); setNewVarValue(""); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-emerald-500/10 transition-colors border-b border-zinc-700/30"
          >
            <Plus size={11} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] font-mono text-emerald-400">Create new variable</span>
          </button>
        )}
        {creating && (
          <div className="px-3 py-2 border-b border-zinc-700/30 space-y-1.5">
            <input
              ref={nameInputRef}
              type="text"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="--variable-name"
              className="w-full px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <input
              type="text"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              placeholder="value (e.g. #3498db, 16px)"
              className="w-full px-2 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleCreate}
                className="flex-1 py-1 rounded-md bg-emerald-500/20 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1 rounded-md bg-zinc-800/60 text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {filtered.length === 0 && !creating && (
          <div className="flex items-center justify-center py-6 text-[11px] text-zinc-600">No tokens found</div>
        )}
        {(() => {
          let flatIdx = 0;
          return Array.from(grouped.entries()).map(([groupLabel, vars]) => (
            <div key={groupLabel}>
              {hasMultipleGroups && (
                <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600 sticky top-0 bg-[#1e1e22]">
                  {groupLabel}
                </div>
              )}
              {vars.map((v) => {
                const itemIndex = flatIdx++;
                const previewValue = v.computed || v.value || "";
                const showColorBadge = isColorLike(previewValue);
                return (
                  <button
                    key={v.name}
                    data-picker-item
                    onClick={() => { onSelect(`var(${v.name})`); onClose(); }}
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors ${activeIndex === itemIndex ? "bg-zinc-700/60" : "hover:bg-zinc-800/60"}`}
                  >
                    {showColorBadge && (
                      <div
                        className="w-4 h-4 rounded-sm border border-zinc-600/50 shrink-0"
                        style={{ backgroundColor: previewValue }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono text-zinc-300 truncate">{v.name}</div>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-600 truncate max-w-[80px]">{v.computed}</span>
                  </button>
                );
              })}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
