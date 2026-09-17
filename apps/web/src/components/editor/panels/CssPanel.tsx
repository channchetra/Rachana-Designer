

import { StyleInfo } from "@/types/editor";
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { getEffectiveValue, getValueSource } from "@/components/ui/panelPrimitives";

interface CssPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  inline: "text-amber-400",
  id: "text-purple-400",
  class: "text-sky-400",
  computed: "text-zinc-500",
  none: "text-zinc-600",
};

export function CssPanel({ styles, onStyleChange }: CssPanelProps) {
  const [search, setSearch] = useState("");
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const allProperties = useMemo(() => {
    const propSet = new Set<string>();
    Object.keys(styles.computed).forEach((k) => propSet.add(k));
    Object.keys(styles.inline).forEach((k) => propSet.add(k));
    Object.keys(styles.classRules).forEach((k) => propSet.add(k));
    Object.keys(styles.idRules).forEach((k) => propSet.add(k));
    return Array.from(propSet).sort();
  }, [styles]);

  const filtered = useMemo(() => {
    if (!search) return allProperties;
    const q = search.toLowerCase();
    return allProperties.filter((p) => p.toLowerCase().includes(q));
  }, [allProperties, search]);

  const startEdit = (prop: string) => {
    setEditingProp(prop);
    setEditValue(getEffectiveValue(styles, prop));
  };

  const commitEdit = () => {
    if (editingProp) {
      onStyleChange(editingProp, editValue);
      setEditingProp(null);
    }
  };

  const cancelEdit = () => {
    setEditingProp(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800/40 sticky top-0 bg-zinc-950 z-10">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter properties..."
            className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" /> inline</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-400/80" /> #id</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400/80" /> .class</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500/80" /> computed</span>
        </div>
      </div>

      {/* Properties list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-zinc-800/30">
          {filtered.map((prop) => {
            const val = getEffectiveValue(styles, prop);
            const source = getValueSource(styles, prop);
            const isEditing = editingProp === prop;

            return (
              <div
                key={prop}
                className="group flex items-start gap-2 px-3 py-1.5 hover:bg-zinc-900/40 transition-colors"
              >
                <span className={`text-[11px] font-mono shrink-0 w-[45%] pt-0.5 truncate ${SOURCE_COLORS[source]}`} title={prop}>
                  {prop}
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    className="flex-1 min-w-0 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 focus:border-zinc-500 focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(prop)}
                    className="flex-1 min-w-0 text-[11px] font-mono text-zinc-400 truncate pt-0.5 cursor-text hover:text-zinc-200 transition-colors"
                    title={val}
                  >
                    {val || <span className="text-zinc-700 italic">unset</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-zinc-600">
            No matching properties
          </div>
        )}
      </div>
    </div>
  );
}
