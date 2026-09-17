

import { StyleInfo, DomNode } from "@/types/editor";
import { useEditorStore } from "@/stores/editorStore";
import { getVsCodeApi } from "@/platform/host/vscodeApi";
import { LayoutPanel } from "./panels/LayoutPanel";
import { SizePanel } from "./panels/SizePanel";
import { SpacingPanel } from "./panels/SpacingPanel";
import { TypographyPanel } from "./panels/TypographyPanel";
import { ColorPanel } from "./panels/ColorPanel";
import { BorderPanel } from "./panels/BorderPanel";
import { ShadowPanel } from "./panels/ShadowPanel";
import { TransformPanel } from "./panels/TransformPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { PositionPanel } from "./panels/PositionPanel";
import { CssPanel } from "./panels/CssPanel";
import { AttributesPanel } from "./panels/AttributesPanel";
import { DescendantColorsPanel } from "./panels/DescendantColorsPanel";
import { DomTreeNode } from "./DomTreeNode";
import {
  ChevronRight,
  CornerDownRight,
  Layout,
  Maximize2,
  Box,
  Type,
  Palette,
  Square,
  Trash2,
  Layers,
  Plus,
  Search,
  X,
  Eclipse,
  Wand2,
  Crosshair,
  Sparkles,
  Image,
  Upload,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from "react";

interface PropertiesPanelProps {
  element: StyleInfo | null;
  selectedClass: string | null;
  selectedSubSelector: string | null;
  tree: DomNode | null;
  selectedPath: string | null;
  onTreeSelect: (path: string) => void;
  onTreeDelete: (path: string) => void;
  onTreeTagChange: (path: string, newTag: string) => void;
  onTreeHover?: (path: string | null) => void;
  onStyleChange: (property: string, value: string) => void;
  onInjectKeyframes: (name: string, css: string) => void;
  onInjectLayoutCss: (path: string, css: string) => void;
  onDelete: () => void;
  onAddClass: (path: string, className: string) => void;
  onRemoveClass: (path: string, className: string) => void;
  onRemoveClassWithStyles: (path: string, className: string) => void;
  onRenameClass: (path: string, oldClassName: string, newClassName: string) => void;
  onSelectedClassChange: (className: string | null, subSelector?: string | null) => void;
  onUploadImage: (property?: "background-image" | "mask-image" | "src") => void;
  onAttributeChange: (name: string, value: string) => void;
  onAttributeRemove: (name: string) => void;
  onDescendantStyleChange: (
    path: string,
    property: string,
    value: string,
    className: string | null,
    selector: string | null
  ) => void;
}

type PanelTab = "design" | "css" | "attributes" | "descendants";

// ============================================================
// Panel open/close persistence via vscode webview state
// ============================================================

const PANEL_STATE_KEY = "panelOpenStates";

function getSavedPanelStates(): Record<string, boolean> {
  try {
    const state = getVsCodeApi().getState() as Record<string, unknown> | null;
    if (state && typeof state[PANEL_STATE_KEY] === "object") {
      return state[PANEL_STATE_KEY] as Record<string, boolean>;
    }
  } catch {}
  return {};
}

function savePanelState(sectionId: string, open: boolean) {
  try {
    const api = getVsCodeApi();
    const state = (api.getState() as Record<string, unknown>) || {};
    const panels = (typeof state[PANEL_STATE_KEY] === "object" ? state[PANEL_STATE_KEY] : {}) as Record<string, boolean>;
    panels[sectionId] = open;
    api.setState({ ...state, [PANEL_STATE_KEY]: panels });
  } catch {}
}

function PanelSection({
  title,
  sectionId,
  icon: Icon,
  children,
  defaultOpen = true,
  properties,
  styles,
  onStyleChange,
}: {
  title: string;
  sectionId: string;
  icon: LucideIcon;
  children: React.ReactNode;
  defaultOpen?: boolean;
  properties?: string[];
  styles?: StyleInfo;
  onStyleChange?: (property: string, value: string) => void;
}) {
  const hasActiveProps = useMemo(() => {
    if (!properties || !styles) return false;
    return properties.some(
      (p) => styles.inline[p] || styles.idRules[p] || styles.classRules[p]
    );
  }, [properties, styles]);

  // Resolve initial open state: saved > (hasActiveProps overrides defaultOpen=false) > defaultOpen
  const [open, setOpen] = useState(() => {
    const saved = getSavedPanelStates();
    if (sectionId in saved) return saved[sectionId];
    if (!defaultOpen && hasActiveProps) return true;
    return defaultOpen;
  });

  // If panel was auto-closed but props appear, auto-open
  useEffect(() => {
    if (!open && hasActiveProps) {
      const saved = getSavedPanelStates();
      // Only auto-open if user hasn't explicitly closed it
      if (!(sectionId in saved)) {
        setOpen(true);
      }
    }
  }, [hasActiveProps, sectionId, open]);

  const [dotHovered, setDotHovered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    savePanelState(sectionId, next);
    // Scroll section into view when opening
    if (next) {
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!properties || !onStyleChange) return;
    for (const p of properties) {
      onStyleChange(p, "");
    }
  };

  return (
    <div ref={sectionRef} className="border-b border-[#2a2a2e]/60 last:border-b-0">
      <button
        onClick={handleToggle}
        className="group flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-[#2a2a2e]/60 group-hover:bg-[#2a2a2e] transition-colors">
          <Icon size={11} className="text-zinc-400 group-hover:text-zinc-300 transition-colors" />
        </div>
        <span className="flex-1 text-left">{title}</span>
        {hasActiveProps && (
          <div
            onClick={handleClear}
            onMouseEnter={() => setDotHovered(true)}
            onMouseLeave={() => setDotHovered(false)}
            className="flex items-center justify-center w-4 h-4 rounded-full transition-all duration-200"
            title="Clear all"
            style={{
              transform: dotHovered ? "scale(1)" : "scale(0.45)",
              backgroundColor: dotHovered ? "rgba(239,68,68,0.15)" : "rgba(167,139,250,0.8)",
            }}
          >
            {dotHovered && <X size={9} className="text-red-400" />}
          </div>
        )}
        <ChevronRight
          size={12}
          className={`text-zinc-600 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div ref={contentRef} className="px-3 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

function EditableClassChip({
  cls,
  isActive,
  onSelect,
  onRemove,
  onRemoveWithStyles,
  onRename,
}: {
  cls: string;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRemoveWithStyles: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [value, setValue] = useState(cls);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = value.trim().replace(/^\./, "").replace(/\s+/g, "-");
    if (trimmed && trimmed !== cls) {
      onRename(trimmed);
    } else {
      setValue(cls);
    }
  }, [value, cls, onRename]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setValue(cls); setEditing(false); }
        }}
        className="w-20 text-[9px] font-mono font-medium text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/40 focus:outline-none focus:border-sky-400"
      />
    );
  }

  return (
    <span
      ref={menuRef}
      className={`inline-flex items-center gap-0.5 text-[9px] font-mono font-medium pl-1.5 pr-0.5 py-0.5 rounded group cursor-pointer border transition-colors ${
        isActive
          ? "text-emerald-300 bg-emerald-500/20 border-emerald-400/50"
          : "text-sky-400/80 bg-sky-500/10 border-transparent hover:border-sky-400/30"
      }`}
      style={{ position: "relative" }}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to rename"
    >
      .{cls}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className="flex items-center justify-center w-3 h-3 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-sky-500/20 transition-all"
        title={`Remove .${cls}`}
      >
        <X size={7} />
      </button>
      {menuOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[170px] rounded-md border border-zinc-700/80 bg-[#1e1e22] shadow-xl z-20 overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onRemove();
            }}
            className="w-full text-left px-2.5 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-800/70 transition-colors"
          >
            Remove class from block
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onRemoveWithStyles();
            }}
            className="w-full text-left px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10 transition-colors border-t border-zinc-700/60"
          >
            Remove class and styles
          </button>
        </div>
      )}
    </span>
  );
}

function InlineEditableAttributeValue({
  name,
  value,
  onCommit,
}: {
  name: string;
  value: string;
  onCommit: (name: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) {
      onCommit(name, draft);
    }
  }, [draft, value, name, onCommit]);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className="text-zinc-500 font-normal">{name}=</span>
        <span className="text-emerald-400/70">&quot;</span>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="w-28 bg-zinc-800/70 border border-zinc-700/60 rounded px-1 py-0.5 text-[10px] text-emerald-300 font-mono focus:outline-none focus:border-zinc-500"
        />
        <span className="text-emerald-400/70">&quot;</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 cursor-text"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title={`Edit ${name}`}
    >
      <span className="text-zinc-500 font-normal">{name}=</span>
      <span className="text-emerald-400/70">&quot;{value}&quot;</span>
    </span>
  );
}

function ClassPicker({
  onSelect,
  onClose,
  triggerRef,
}: {
  onSelect: (className: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cssClasses = useEditorStore((s) => s.cssClasses);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: Math.max(4, rect.left - 200) });
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const filtered = cssClasses.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Sanitize search text as a valid class name
  const newClassName = search.trim().replace(/^\./, "").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
  const exactMatch = newClassName && cssClasses.some((c) => c.name === newClassName);

  // Build a flat list of selectable items: [createNew?, ...filtered]
  const createEntry = newClassName && !exactMatch ? newClassName : null;
  const totalItems = (createEntry ? 1 : 0) + filtered.length;

  // Reset active index when search changes
  useEffect(() => { setActiveIndex(-1); }, [search]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-picker-item]");
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        if (createEntry && activeIndex === 0) {
          onSelect(createEntry); onClose();
        } else {
          const idx = activeIndex - (createEntry ? 1 : 0);
          if (filtered[idx]) { onSelect(filtered[idx].name); onClose(); }
        }
      } else if (newClassName && !exactMatch) {
        onSelect(newClassName); onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="fixed w-64 max-h-72 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl flex flex-col overflow-hidden"
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
            placeholder="Search or create class..."
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
        {createEntry && (
          <button
            data-picker-item
            onClick={() => { onSelect(createEntry); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors border-b border-zinc-700/30 ${activeIndex === 0 ? "bg-emerald-500/20" : "hover:bg-emerald-500/10"}`}
          >
            <Plus size={11} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] font-mono text-emerald-400">Create .{createEntry}</span>
          </button>
        )}
        {filtered.length === 0 && !newClassName && (
          <div className="flex items-center justify-center py-6 text-[11px] text-zinc-600">
            No classes found
          </div>
        )}
        {filtered.map((c, i) => {
          const itemIndex = i + (createEntry ? 1 : 0);
          return (
            <button
              key={c.selector}
              data-picker-item
              onClick={() => { onSelect(c.name); onClose(); }}
              className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors ${activeIndex === itemIndex ? "bg-zinc-700/60" : "hover:bg-zinc-800/60"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono text-zinc-300 truncate">.{c.name}</div>
              </div>
              <span className="text-[9px] font-mono text-zinc-600 truncate max-w-[100px]">
                {Object.keys(c.properties).length} props
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImageGeneralPanel({
  styles,
  onAttributeChange,
  onUploadImage,
}: {
  styles: StyleInfo;
  onAttributeChange: (name: string, value: string) => void;
  onUploadImage: () => void;
}) {
  const srcValue = styles.attributes?.src || "";
  const altValue = styles.attributes?.alt || "";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-zinc-500 tracking-wide mb-1 block">
          Source (src)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={srcValue}
            onChange={(e) => onAttributeChange("src", e.target.value)}
            placeholder="Enter image URL or upload..."
            className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all min-w-0"
          />
          <button
            onClick={onUploadImage}
            className="flex h-7 items-center gap-1 px-2 rounded-md border border-zinc-700/40 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all shrink-0 text-[10px]"
            title="Upload image"
          >
            <Upload size={11} />
            Upload
          </button>
        </div>
      </div>
      {srcValue && (
        <div className="rounded-md border border-zinc-700/30 bg-zinc-800/30 overflow-hidden">
          <img
            src={srcValue}
            alt={altValue || "preview"}
            className="w-full h-auto max-h-32 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      <div>
        <label className="text-[10px] font-medium text-zinc-500 tracking-wide mb-1 block">
          Alt Text
        </label>
        <input
          type="text"
          value={altValue}
          onChange={(e) => onAttributeChange("alt", e.target.value)}
          placeholder="Describe this image..."
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
        />
      </div>
    </div>
  );
}

export function PropertiesPanel({
  element,
  selectedClass,
  selectedSubSelector,
  tree,
  selectedPath,
  onTreeSelect,
  onTreeDelete,
  onTreeTagChange,
  onTreeHover,
  onStyleChange,
  onInjectKeyframes,
  onInjectLayoutCss,
  onDelete,
  onAddClass,
  onRemoveClass,
  onRemoveClassWithStyles,
  onRenameClass,
  onSelectedClassChange,
  onUploadImage,
  onAttributeChange,
  onAttributeRemove,
  onDescendantStyleChange,
}: PropertiesPanelProps) {
  const panelOpen = useEditorStore((s) => s.panelOpen);
  const elementsTreeOpen = useEditorStore((s) => s.elementsTreeOpen);
  const highSpecificity = useEditorStore((s) => s.highSpecificity);
  const toggleHighSpecificity = useEditorStore((s) => s.toggleHighSpecificity);
  const [activeTab, setActiveTab] = useState<PanelTab>("design");
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [subselectorsByClass, setSubselectorsByClass] = useState<Record<string, string[]>>({});
  const [isAddingSubselector, setIsAddingSubselector] = useState(false);
  const [newSubselector, setNewSubselector] = useState("");
  const classPickerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!element?.subSelectorsByClass) return;
    setSubselectorsByClass((prev) => {
      const next = { ...prev };
      const fromStyles = element.subSelectorsByClass;
      for (const cls of Object.keys(fromStyles)) {
        const existing = next[cls] || [];
        const merged = Array.from(new Set([...existing, ...(fromStyles[cls] || [])]));
        next[cls] = merged;
      }
      return next;
    });
  }, [element]);

  const activeSubselectors = selectedClass ? (subselectorsByClass[selectedClass] || []) : [];
  const hasDescendants = !!element?.descendants?.length;

  useEffect(() => {
    if (activeTab === "descendants" && !hasDescendants) {
      setActiveTab("design");
    }
  }, [activeTab, hasDescendants]);

  if (!panelOpen) return null;

  return (
    <aside className="w-[280px] border-l border-[#2a2a2e]/60 bg-[#1a1a1e] overflow-y-auto shrink-0 flex flex-col">
      {/* Elements tree */}
      {elementsTreeOpen && (
        <div className="border-b border-[#2a2a2e]/60">
          <div className="flex items-center gap-2 px-3 py-2 shrink-0">
            <Layers size={11} className="text-zinc-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Elements
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto py-0.5 px-1">
            {tree ? (
              tree.children.map((child) => (
                <DomTreeNode
                  key={child.path}
                  node={child}
                  selectedPath={selectedPath}
                  onSelect={onTreeSelect}
                  onDelete={onTreeDelete}
                  onTagChange={onTreeTagChange}
                  onHover={onTreeHover}
                  depth={0}
                />
              ))
            ) : (
              <div className="flex items-center justify-center h-12 text-xs text-zinc-600">
                Loading...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Properties */}
      {element ? (
        <>
          {/* Element info bar */}
          <div className="px-3 py-2 border-b border-[#2a2a2e]/60 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                <span className="text-[11px] font-mono font-semibold text-rose-400 truncate" title={`<${element.tagName}${Object.entries(element.attributes || {}).map(([k, v]) => ` ${k}="${v}"`).join("")}>`}>
                  &lt;{element.tagName}
                  {Object.entries(element.attributes || {}).length > 0 && (
                    <span className="text-zinc-500 font-normal">
                      {" "}
                      {Object.entries(element.attributes).map(([k, v]) => (
                        <span key={k} className="inline-block mr-1">
                          <InlineEditableAttributeValue
                            name={k}
                            value={v}
                            onCommit={onAttributeChange}
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  &gt;
                </span>
                {element.id && (
                  <span className="text-[9px] font-mono font-medium text-amber-400/80 bg-amber-500/8 px-1.5 py-0.5 rounded shrink-0">
                    #{element.id}
                  </span>
                )}
              </div>
              <button
                onClick={onDelete}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                title="Delete element"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {/* Class list */}
            <div className="flex items-center flex-wrap gap-1">
              {element.classList.length > 1 && (
                <button
                  onClick={() => onSelectedClassChange(null, null)}
                  className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                    selectedClass === null
                      ? "text-zinc-200 bg-zinc-700/40 border-zinc-500/60"
                      : "text-zinc-500 bg-zinc-800/40 border-transparent hover:text-zinc-300 hover:border-zinc-600/60"
                  }`}
                  title="Use combined class styles"
                >
                  All classes
                </button>
              )}
              {element.classList.map((cls) => (
                <EditableClassChip
                  key={cls}
                  cls={cls}
                  isActive={selectedClass === cls}
                  onSelect={() => onSelectedClassChange(cls, null)}
                  onRemove={() => onRemoveClass(element.path, cls)}
                  onRemoveWithStyles={() => onRemoveClassWithStyles(element.path, cls)}
                  onRename={(newName) => onRenameClass(element.path, cls, newName)}
                />
              ))}
              <button
                ref={classPickerTriggerRef}
                onClick={() => setShowClassPicker(!showClassPicker)}
                className={`flex h-5 w-5 items-center justify-center rounded transition-all ${
                  showClassPicker
                    ? "bg-sky-500/20 text-sky-400"
                    : "text-zinc-600 hover:text-sky-400 hover:bg-sky-500/10"
                }`}
                title="Add class"
              >
                <Plus size={11} />
              </button>
              {showClassPicker && (
                <ClassPicker
                  triggerRef={classPickerTriggerRef}
                  onSelect={(className) => onAddClass(element.path, className)}
                  onClose={() => setShowClassPicker(false)}
                />
              )}
            </div>
            {selectedClass && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center flex-wrap gap-1">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded text-zinc-500 bg-zinc-800/60 border border-zinc-700/50">
                    <CornerDownRight size={10} />
                  </span>
                  {activeSubselectors.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => onSelectedClassChange(selectedClass, sub)}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                        selectedSubSelector === sub
                          ? "text-emerald-200 bg-emerald-500/20 border-emerald-400/50"
                          : "text-zinc-400 bg-zinc-800/40 border-transparent hover:text-zinc-300 hover:border-zinc-600/60"
                      }`}
                      title={`Use selector .${selectedClass}${sub}`}
                    >
                      {sub}
                    </button>
                  ))}
                  {!isAddingSubselector && (
                    <button
                      onClick={() => setIsAddingSubselector(true)}
                      className="px-2 py-0.5 text-[10px] rounded border border-zinc-600/70 bg-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60 transition-colors"
                    >
                      Add subselector
                    </button>
                  )}
                </div>
                {isAddingSubselector ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newSubselector}
                      onChange={(e) => setNewSubselector(e.target.value)}
                      placeholder=".secondary, :hover, .subclass"
                      className="flex-1 min-w-0 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-1 text-[10px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const sub = newSubselector.trim();
                          if (!selectedClass || !sub) return;
                          setSubselectorsByClass((prev) => {
                            const current = prev[selectedClass] || [];
                            if (current.includes(sub)) return prev;
                            return { ...prev, [selectedClass]: [...current, sub] };
                          });
                          onSelectedClassChange(selectedClass, sub);
                          setNewSubselector("");
                          setIsAddingSubselector(false);
                        }
                        if (e.key === "Escape") {
                          setIsAddingSubselector(false);
                          setNewSubselector("");
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        const sub = newSubselector.trim();
                        if (!selectedClass || !sub) return;
                        setSubselectorsByClass((prev) => {
                          const current = prev[selectedClass] || [];
                          if (current.includes(sub)) return prev;
                          return { ...prev, [selectedClass]: [...current, sub] };
                        });
                        onSelectedClassChange(selectedClass, sub);
                        setNewSubselector("");
                        setIsAddingSubselector(false);
                      }}
                      className="px-2 py-1 text-[10px] rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingSubselector(false);
                        setNewSubselector("");
                      }}
                      className="px-2 py-1 text-[10px] rounded border border-zinc-600/70 bg-zinc-700/30 text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex items-center px-3 py-1.5 gap-1 border-b border-[#2a2a2e]/60 shrink-0">
            <button
              onClick={() => setActiveTab("design")}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                activeTab === "design"
                  ? "bg-[#2a2a2e] text-zinc-200 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#2a2a2e]/50"
              }`}
            >
              Design
            </button>
            <button
              onClick={() => setActiveTab("css")}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                activeTab === "css"
                  ? "bg-[#2a2a2e] text-zinc-200 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#2a2a2e]/50"
              }`}
            >
              CSS
            </button>
            <button
              onClick={() => setActiveTab("attributes")}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                activeTab === "attributes"
                  ? "bg-[#2a2a2e] text-zinc-200 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#2a2a2e]/50"
              }`}
            >
              Attr
            </button>
            {hasDescendants && (
              <button
                onClick={() => setActiveTab("descendants")}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                  activeTab === "descendants"
                    ? "bg-[#2a2a2e] text-zinc-200 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-[#2a2a2e]/50"
                }`}
              >
                Child
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={toggleHighSpecificity}
              className={`p-1 rounded transition-all ${
                highSpecificity
                  ? "text-amber-400 bg-amber-400/10"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
              title="Enable high specificity (!important)"
            >
              <ShieldAlert size={13} />
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "attributes" ? (
            <div className="flex-1 overflow-y-auto">
              <AttributesPanel styles={element} onAttributeChange={onAttributeChange} onAttributeRemove={onAttributeRemove} />
            </div>
          ) : activeTab === "descendants" ? (
            <div className="flex-1 overflow-y-auto">
              <DescendantColorsPanel
                descendants={element.descendants || []}
                onStyleChange={onDescendantStyleChange}
              />
            </div>
          ) : activeTab === "design" ? (
            <div className="flex-1 overflow-y-auto">
              {element.tagName.toLowerCase() === "img" && (
                <PanelSection
                  title="General" sectionId="general-img" icon={Image}
                  defaultOpen={true}
                >
                  <ImageGeneralPanel
                    styles={element}
                    onAttributeChange={onAttributeChange}
                    onUploadImage={() => onUploadImage("src")}
                  />
                </PanelSection>
              )}
              <PanelSection
                title="Typography" sectionId="typography" icon={Type}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "font-size", "line-height", "font-weight", "text-align",
                  "text-decoration", "text-transform", "letter-spacing",
                  "word-break", "white-space", "text-overflow", "font-style",
                  "writing-mode", "text-shadow", "font-family",
                ]}
              >
                <TypographyPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Colors" sectionId="colors" icon={Palette}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "color", "background-color", "background-image",
                  "background-size", "background-repeat", "background-position",
                  "background-attachment", "background-blend-mode", "background-clip",
                ]}
              >
                <ColorPanel styles={element} onStyleChange={onStyleChange} onUploadImage={() => onUploadImage("background-image")} />
              </PanelSection>
              <PanelSection
                title="Spacing" sectionId="spacing" icon={Box}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "padding-top", "padding-right", "padding-bottom", "padding-left",
                  "margin-top", "margin-right", "margin-bottom", "margin-left",
                  "white-space", "overflow", "overflow-x", "overflow-y",
                ]}
              >
                <SpacingPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Layout" sectionId="layout" icon={Layout}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "display", "flex-direction", "flex-wrap",
                  "justify-content", "align-items", "align-content",
                  "gap", "column-gap", "row-gap",
                  "grid-template-columns", "grid-template-rows",
                  "grid-auto-flow",
                  "align-self", "justify-self",
                  "flex-grow", "flex-shrink", "flex-basis",
                  "order", "grid-column", "grid-row",
                ]}
              >
                <LayoutPanel styles={element} onStyleChange={onStyleChange} onInjectLayoutCss={onInjectLayoutCss} />
              </PanelSection>
              <PanelSection
                title="Position" sectionId="position" icon={Crosshair}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "position", "top", "right", "bottom", "left",
                  "z-index", "isolation",
                ]}
              >
                <PositionPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Size" sectionId="size" icon={Maximize2}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "width", "height", "min-width", "min-height",
                  "max-width", "max-height", "aspect-ratio",
                  "object-fit", "object-position",
                  "scroll-snap-type", "scroll-snap-align", "touch-action",
                  "scrollbar-width", "scrollbar-color",
                ]}
              >
                <SizePanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Border" sectionId="border" icon={Square}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "border", "border-width", "border-style", "border-color",
                  "border-top-width", "border-top-style", "border-top-color",
                  "border-right-width", "border-right-style", "border-right-color",
                  "border-bottom-width", "border-bottom-style", "border-bottom-color",
                  "border-left-width", "border-left-style", "border-left-color",
                  "border-radius", "border-top-left-radius", "border-top-right-radius",
                  "border-bottom-left-radius", "border-bottom-right-radius",
                ]}
              >
                <BorderPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Shadow" sectionId="shadow" icon={Eclipse}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={["box-shadow", "text-shadow"]}
              >
                <ShadowPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Transform" sectionId="transform" icon={Wand2}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "transition", "transform", "translate", "rotate", "scale",
                  "perspective", "transform-origin", "transform-style",
                  "backface-visibility",
                ]}
              >
                <TransformPanel styles={element} onStyleChange={onStyleChange} />
              </PanelSection>
              <PanelSection
                title="Effects" sectionId="effects" icon={Sparkles}
                defaultOpen={false}
                styles={element} onStyleChange={onStyleChange}
                properties={[
                  "opacity", "mix-blend-mode", "visibility", "pointer-events",
                  "cursor", "user-select", "clip-path", "filter", "backdrop-filter",
                  "mask-image", "mask-size", "mask-position", "mask-repeat",
                  "mask-origin", "mask-composite", "mask-mode",
                  "animation", "animation-name", "animation-duration",
                  "animation-timing-function", "animation-delay",
                  "animation-direction", "animation-fill-mode",
                  "animation-iteration-count", "animation-play-state",
                  "animation-timeline", "animation-range",
                ]}
              >
                <EffectsPanel
                  styles={element}
                  onStyleChange={onStyleChange}
                  onInjectKeyframes={onInjectKeyframes}
                  onUploadImage={() => onUploadImage("mask-image")}
                />
              </PanelSection>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <CssPanel styles={element} onStyleChange={onStyleChange} />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2a2a2e]/40 flex items-center justify-center border border-[#2a2a2e]/60">
            <Box size={16} className="text-zinc-700" />
          </div>
          <p className="text-[11px] font-medium text-zinc-600">Select an element to edit</p>
        </div>
      )}
    </aside>
  );
}
