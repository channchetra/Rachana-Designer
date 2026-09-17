
import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X, Play, Pause, ChevronRight, Trash2, Code, Upload } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { TokenPicker } from "../TokenPicker";
import { FieldLabel, SideIcon, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface EffectsPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  onInjectKeyframes: (name: string, css: string) => void;
  onUploadImage: () => void;
}

// ============================================================
// PresetSelect
// ============================================================

function PresetSelect({
  value, onChange, options, label, placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  label: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!focused) setLocalValue(value); }, [value, focused]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleChange = useCallback((v: string) => { setLocalValue(v); onChange(v); }, [onChange]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div ref={ref} className="relative">
        <input type="text" value={localValue} onChange={(e) => handleChange(e.target.value)} onClick={() => setOpen(true)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder || "none"}
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors" />
        {open && (
          <div className="absolute left-0 top-full mt-1 w-full max-h-40 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl z-50 overflow-y-auto">
            {options.map((o) => (
              <button key={o.value} onMouseDown={(e) => { e.preventDefault(); handleChange(o.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-zinc-800/60 transition-colors ${localValue === o.value ? "text-violet-300" : "text-zinc-300"}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TextInputWithTokens
// ============================================================

function TextInputWithTokens({ value, onChange, placeholder, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const createCssVariable = useEditorStore((s) => s.createCssVariable);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (!focused) setLocalValue(value); }, [value, focused]);

  const handleChange = useCallback((v: string) => { setLocalValue(v); onChange(v); }, [onChange]);
  const handleTokenSelect = useCallback((v: string) => { setLocalValue(v); onChange(v); setShowTokens(false); }, [onChange]);

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div className="relative group/txtinput" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <input type="text" value={localValue} onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder || "none"}
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors" />
        {(hovered || showTokens) && (cssVariables.length > 0 || createCssVariable) && (
          <button ref={tokenBtnRef} onClick={(e) => { e.stopPropagation(); setShowTokens(!showTokens); }}
            className={`absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full transition-all z-10 ${showTokens ? "bg-violet-500 text-white shadow-md" : "bg-zinc-600 text-zinc-200 hover:bg-violet-500 hover:text-white shadow-sm"}`}
            title="Select token variable">
            <Plus size={9} strokeWidth={2.5} />
          </button>
        )}
        {showTokens && <TokenPicker variables={cssVariables} onSelect={handleTokenSelect} onClose={() => setShowTokens(false)} triggerRef={tokenBtnRef} onCreateVariable={createCssVariable || undefined} />}
      </div>
    </div>
  );
}

// ============================================================
// Options
// ============================================================

const MIX_BLEND_OPTIONS = [
  { label: "Normal", value: "normal" }, { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" }, { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" }, { label: "Lighten", value: "lighten" },
  { label: "Color Dodge", value: "color-dodge" }, { label: "Color Burn", value: "color-burn" },
  { label: "Hard Light", value: "hard-light" }, { label: "Soft Light", value: "soft-light" },
  { label: "Difference", value: "difference" }, { label: "Exclusion", value: "exclusion" },
  { label: "Hue", value: "hue" }, { label: "Saturation", value: "saturation" },
  { label: "Color", value: "color" }, { label: "Luminosity", value: "luminosity" },
];

const VISIBILITY_OPTIONS = [
  { label: "Visible", value: "visible" }, { label: "Hidden", value: "hidden" }, { label: "Collapse", value: "collapse" },
];

const POINTER_EVENTS_OPTIONS = [
  { label: "Auto", value: "auto" }, { label: "None", value: "none" },
];

const CURSOR_OPTIONS = [
  { label: "Default", value: "default" }, { label: "Pointer", value: "pointer" },
  { label: "Move", value: "move" }, { label: "Text", value: "text" },
  { label: "Wait", value: "wait" }, { label: "Crosshair", value: "crosshair" },
  { label: "Not Allowed", value: "not-allowed" }, { label: "Auto", value: "auto" },
  { label: "Grab", value: "grab" }, { label: "Grabbing", value: "grabbing" },
  { label: "Zoom In", value: "zoom-in" }, { label: "Zoom Out", value: "zoom-out" },
  { label: "None", value: "none" },
];

const USER_SELECT_OPTIONS = [
  { label: "Auto", value: "auto" }, { label: "Text", value: "text" },
  { label: "None", value: "none" }, { label: "All", value: "all" },
];

const CLIP_PATH_PRESETS = [
  { label: "None", value: "none" },
  { label: "Full", value: "inset(0% 0% 0% 0%)" },
  { label: "Right Zero", value: "inset(0% 0% 0% 100%)" },
  { label: "Left Zero", value: "inset(0% 100% 0% 0%)" },
  { label: "Bottom Zero", value: "inset(100% 0% 0% 0%)" },
  { label: "Top Zero", value: "inset(0% 0% 100% 0%)" },
  { label: "Full Circle", value: "circle(100% at 50% 50%)" },
  { label: "Middle Circle", value: "circle(50% at 50% 50%)" },
  { label: "Zero Circle", value: "circle(0% at 50% 50%)" },
  { label: "Rhombus", value: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
  { label: "Triangle", value: "polygon(50% 0%, 0% 100%, 100% 100%)" },
  { label: "Message", value: "polygon(0% 0%, 100% 0%, 100% 75%, 75% 75%, 75% 100%, 50% 75%, 0% 75%)" },
  { label: "Left Chevron", value: "polygon(100% 0%, 75% 50%, 100% 100%, 25% 100%, 0% 50%, 25% 0%)" },
  { label: "Right Chevron", value: "polygon(75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%, 0% 0%)" },
];

// ============================================================
// Filter definitions
// ============================================================

interface FilterFunction {
  key: string; label: string; fn: string; placeholder: string; defaultUnit: string; step?: number; iconLabel: string;
}

const FILTER_FUNCTIONS: FilterFunction[] = [
  { key: "blur", label: "Blur", fn: "blur", placeholder: "0", defaultUnit: "px", iconLabel: "Bl" },
  { key: "brightness", label: "Brightness", fn: "brightness", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "Br" },
  { key: "contrast", label: "Contrast", fn: "contrast", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "Co" },
  { key: "grayscale", label: "Grayscale", fn: "grayscale", placeholder: "0", defaultUnit: "", step: 0.05, iconLabel: "Gr" },
  { key: "hueRotate", label: "Hue Rotate", fn: "hue-rotate", placeholder: "0", defaultUnit: "deg", iconLabel: "HR" },
  { key: "invert", label: "Invert", fn: "invert", placeholder: "0", defaultUnit: "", step: 0.05, iconLabel: "In" },
  { key: "saturate", label: "Saturate", fn: "saturate", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "Sa" },
  { key: "sepia", label: "Sepia", fn: "sepia", placeholder: "0", defaultUnit: "", step: 0.05, iconLabel: "Se" },
  { key: "dropShadow", label: "Drop Shadow", fn: "drop-shadow", placeholder: "0px 4px 6px rgba(0,0,0,0.3)", defaultUnit: "", iconLabel: "DS" },
  { key: "opacity", label: "Opacity", fn: "opacity", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "Op" },
];

function parseFilterString(filter: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!filter || filter === "none") return values;
  const regex = /([\w-]+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(filter)) !== null) {
    const funcDef = FILTER_FUNCTIONS.find((f) => f.fn === match![1]);
    if (funcDef) values[funcDef.key] = match![2].trim();
  }
  return values;
}

function composeFilterString(enabled: Record<string, boolean>, values: Record<string, string>): string {
  const parts: string[] = [];
  for (const func of FILTER_FUNCTIONS) {
    if (enabled[func.key] && values[func.key]) parts.push(`${func.fn}(${values[func.key]})`);
  }
  return parts.join(" ") || "";
}

// ============================================================
// FilterSection
// ============================================================

function FilterSection({ label, property, styles, onStyleChange }: {
  label: string; property: string; styles: StyleInfo; onStyleChange: (p: string, v: string) => void;
}) {
  const currentFilter = getEffectiveValue(styles, property);
  const [enabledFilters, setEnabledFilters] = useState<Record<string, boolean>>(() => {
    const parsed = parseFilterString(currentFilter);
    const e: Record<string, boolean> = {};
    for (const f of FILTER_FUNCTIONS) { if (parsed[f.key]) e[f.key] = true; }
    return e;
  });
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const parsed = parseFilterString(currentFilter);
    const v: Record<string, string> = {};
    for (const f of FILTER_FUNCTIONS) { if (parsed[f.key]) v[f.key] = parsed[f.key]; }
    return v;
  });
  const [showToggle, setShowToggle] = useState(false);
  const toggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parsed = parseFilterString(getEffectiveValue(styles, property));
    const nv = { ...filterValues }; const ne = { ...enabledFilters }; let changed = false;
    for (const f of FILTER_FUNCTIONS) {
      if (parsed[f.key] && !ne[f.key]) { ne[f.key] = true; changed = true; }
      if (parsed[f.key] && parsed[f.key] !== nv[f.key]) { nv[f.key] = parsed[f.key]; changed = true; }
    }
    if (changed) { setFilterValues(nv); setEnabledFilters(ne); }
  }, [currentFilter]);

  useEffect(() => {
    if (!showToggle) return;
    const h = (e: MouseEvent) => { if (toggleRef.current && !toggleRef.current.contains(e.target as Node)) setShowToggle(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showToggle]);

  const apply = useCallback((ne: Record<string, boolean>, nv: Record<string, string>) => {
    onStyleChange(property, composeFilterString(ne, nv));
  }, [onStyleChange, property]);

  const handleChange = useCallback((key: string, val: string) => {
    const nv = { ...filterValues, [key]: val }; setFilterValues(nv); apply(enabledFilters, nv);
  }, [filterValues, enabledFilters, apply]);

  const toggle = useCallback((key: string) => {
    setEnabledFilters((prev) => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; const nv = { ...filterValues }; delete nv[key]; setFilterValues(nv); apply(next, nv); }
      else { next[key] = true; }
      return next;
    });
  }, [filterValues, apply]);

  return (
    <div>
      <div ref={toggleRef} className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
          <button onClick={() => setShowToggle(!showToggle)}
            className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${showToggle ? "bg-violet-500/20 text-violet-300" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50"}`}>
            <Plus size={12} />
          </button>
        </div>
        {showToggle && (
          <div className="absolute right-0 top-7 w-[160px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl overflow-hidden z-50">
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {FILTER_FUNCTIONS.map((item) => (
                <button key={item.key} onClick={() => toggle(item.key)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100 transition-colors">
                  <span>{item.label}</span>
                  {enabledFilters[item.key] && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mb-2">
        <TextInputWithTokens value={currentFilter} onChange={(v) => onStyleChange(property, v)} placeholder="none" />
      </div>
      {Object.keys(enabledFilters).length > 0 && (
        <div className="space-y-2">
          {FILTER_FUNCTIONS.filter((f) => enabledFilters[f.key]).map((func) => (
            <div key={func.key} className="flex items-center gap-2">
              <div className="flex-1">
                <FieldLabel>{func.label}</FieldLabel>
                {func.key === "dropShadow" ? (
                  <TextInputWithTokens value={filterValues[func.key] || ""} onChange={(v) => handleChange(func.key, v)} placeholder={func.placeholder} />
                ) : (
                  <UnitControl icon={<SideIcon label={func.iconLabel} />} value={filterValues[func.key] || ""} onChange={(v: string) => handleChange(func.key, v)}
                    placeholder={func.placeholder} step={func.step} defaultValue={func.placeholder + func.defaultUnit} />
                )}
              </div>
              <button onClick={() => toggle(func.key)}
                className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-4">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mask options
// ============================================================

const MASK_SIZE_OPTIONS = [
  { label: "Auto", value: "auto" }, { label: "Contain", value: "contain" },
  { label: "Cover", value: "cover" }, { label: "100% 100%", value: "100% 100%" },
];

const MASK_POSITION_OPTIONS = [
  { label: "Center", value: "center" }, { label: "Left Top", value: "left top" },
  { label: "Right Top", value: "right top" }, { label: "Left Bottom", value: "left bottom" },
  { label: "Right Bottom", value: "right bottom" },
];

const MASK_REPEAT_OPTIONS = [
  { label: "Repeat", value: "repeat" }, { label: "No Repeat", value: "no-repeat" },
  { label: "Repeat X", value: "repeat-x" }, { label: "Repeat Y", value: "repeat-y" },
];

const MASK_ORIGIN_OPTIONS = [
  { label: "Border Box", value: "border-box" }, { label: "Padding Box", value: "padding-box" },
  { label: "Content Box", value: "content-box" },
];

const MASK_COMPOSITE_OPTIONS = [
  { label: "Add", value: "add" }, { label: "Subtract", value: "subtract" },
  { label: "Intersect", value: "intersect" }, { label: "Exclude", value: "exclude" },
];

const MASK_MODE_OPTIONS = [
  { label: "Match Source", value: "match-source" }, { label: "Luminance", value: "luminance" },
  { label: "Alpha", value: "alpha" },
];

const MASK_IMAGE_PRESETS = [
  { label: "None", value: "none" },
  { label: "Fade Left", value: "linear-gradient(to left, black, transparent)" },
  { label: "Fade Right", value: "linear-gradient(to right, black, transparent)" },
  { label: "Fade Bottom", value: "linear-gradient(to bottom, black, transparent)" },
  { label: "Fade Top", value: "linear-gradient(to top, black, transparent)" },
  { label: "Fade Left & Right", value: "linear-gradient(to right, transparent, black 20%, black 80%, transparent)" },
  { label: "Fade Top & Bottom", value: "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)" },
  { label: "Radial Fade", value: "radial-gradient(circle, black 50%, transparent 100%)" },
  { label: "Radial Tight", value: "radial-gradient(circle, black 20%, transparent 70%)" },
];

// ============================================================
// MaskSection
// ============================================================

function MaskSection({
  styles,
  onStyleChange,
  onUploadImage,
}: {
  styles: StyleInfo;
  onStyleChange: (p: string, v: string) => void;
  onUploadImage: () => void;
}) {
  const [localActive, setLocalActive] = useState(false);
  const maskImageValue = getEffectiveValue(styles, "mask-image");
  const hasMaskImage = !!maskImageValue && maskImageValue !== "none";

  const handleMaskChange = (p: string, v: string) => {
    if (v && v !== "none") setLocalActive(true);
    else if (p === "mask-image" && (!v || v === "none")) setLocalActive(false);
    onStyleChange(p, v);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Mask</span>
      </div>
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <PresetSelect label="Mask Image" value={getEffectiveValue(styles, "mask-image")} onChange={(v) => handleMaskChange("mask-image", v)} options={MASK_IMAGE_PRESETS} placeholder="none" />
        </div>
        <button
          onClick={onUploadImage}
          className="flex h-7 items-center gap-1 px-2 rounded-md border border-zinc-700/40 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all shrink-0 text-[10px] mb-[1px]"
          title="Upload image"
        >
          <Upload size={11} />
          Upload
        </button>
      </div>
      {(hasMaskImage || localActive) && (
        <div className="space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <PresetSelect label="Size" value={getEffectiveValue(styles, "mask-size")} onChange={(v) => handleMaskChange("mask-size", v)} options={MASK_SIZE_OPTIONS} placeholder="auto" />
            <PresetSelect label="Position" value={getEffectiveValue(styles, "mask-position")} onChange={(v) => handleMaskChange("mask-position", v)} options={MASK_POSITION_OPTIONS} placeholder="center" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PresetSelect label="Repeat" value={getEffectiveValue(styles, "mask-repeat")} onChange={(v) => handleMaskChange("mask-repeat", v)} options={MASK_REPEAT_OPTIONS} placeholder="repeat" />
            <PresetSelect label="Origin" value={getEffectiveValue(styles, "mask-origin")} onChange={(v) => handleMaskChange("mask-origin", v)} options={MASK_ORIGIN_OPTIONS} placeholder="border-box" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PresetSelect label="Composite" value={getEffectiveValue(styles, "mask-composite")} onChange={(v) => handleMaskChange("mask-composite", v)} options={MASK_COMPOSITE_OPTIONS} placeholder="add" />
            <PresetSelect label="Mode" value={getEffectiveValue(styles, "mask-mode")} onChange={(v) => handleMaskChange("mask-mode", v)} options={MASK_MODE_OPTIONS} placeholder="match-source" />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Animation options
// ============================================================

const ANIMATION_DURATION_OPTIONS = [
  { label: "0.15s", value: "0.15s" }, { label: "0.3s", value: "0.3s" }, { label: "0.5s", value: "0.5s" },
  { label: "1s", value: "1s" }, { label: "2s", value: "2s" }, { label: "3s", value: "3s" },
  { label: "5s", value: "5s" }, { label: "10s", value: "10s" },
];

const ANIMATION_EASING_OPTIONS = [
  { label: "Linear", value: "linear" }, { label: "Ease", value: "ease" },
  { label: "Ease In", value: "ease-in" }, { label: "Ease Out", value: "ease-out" },
  { label: "Ease In-Out", value: "ease-in-out" },
  { label: "Spring", value: "cubic-bezier(0.35, 0.11, 0.22, 1.16)" },
];

const ANIMATION_DIRECTION_OPTIONS = [
  { label: "Normal", value: "normal" }, { label: "Reverse", value: "reverse" },
  { label: "Alternate", value: "alternate" }, { label: "Alt. Reverse", value: "alternate-reverse" },
];

const ANIMATION_FILL_OPTIONS = [
  { label: "None", value: "none" }, { label: "Forwards", value: "forwards" },
  { label: "Backwards", value: "backwards" }, { label: "Both", value: "both" },
];

const ANIMATION_COUNT_OPTIONS = [
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" },
  { label: "Infinite", value: "infinite" },
];

const ANIMATION_PLAY_OPTIONS = [
  { label: "Running", value: "running" }, { label: "Paused", value: "paused" },
];

const ANIMATION_TIMELINE_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "View", value: "view()" }, { label: "View (X)", value: "view(x)" },
  { label: "Scroll", value: "scroll()" }, { label: "Scroll (X)", value: "scroll(x)" },
  { label: "Scroll Root", value: "scroll(root block)" },
];

const ANIMATION_RANGE_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Entry", value: "entry" }, { label: "Exit", value: "exit" },
  { label: "Contain", value: "contain" }, { label: "Cover", value: "cover" },
  { label: "Entry 10% Exit 10%", value: "entry 10% exit -10%" },
  { label: "Entry 50% Exit 50%", value: "entry 50% exit 50%" },
];

// ============================================================
// Animation presets
// ============================================================

interface AnimationPreset {
  label: string;
  animation: string;
  timeline?: string;
  range?: string;
  keyframeName: string;
  keyframeCSS: string;
}

function makePresetName(): string {
  return "gl_" + Math.floor(1000 + Math.random() * 9000);
}

function parseAnimationNameFromShorthand(animationValue: string): string {
  if (!animationValue || animationValue === "none") return "";
  const firstItem = animationValue.split(",")[0]?.trim() || "";
  if (!firstItem) return "";
  const tokens = firstItem.split(/\s+/).filter(Boolean);
  const cssTimingFunctions = new Set(["ease", "linear", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end"]);
  const cssDirections = new Set(["normal", "reverse", "alternate", "alternate-reverse"]);
  const cssFillModes = new Set(["none", "forwards", "backwards", "both"]);
  const cssPlayStates = new Set(["running", "paused"]);

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith("var(")) continue;
    if (/^[-+]?\d*\.?\d+m?s$/.test(lower)) continue;
    if (/^steps\(.+\)$/.test(lower)) continue;
    if (/^cubic-bezier\(.+\)$/.test(lower)) continue;
    if (cssTimingFunctions.has(lower)) continue;
    if (cssDirections.has(lower)) continue;
    if (cssFillModes.has(lower)) continue;
    if (cssPlayStates.has(lower)) continue;
    if (lower === "infinite") continue;
    if (/^\d+$/.test(lower)) continue;
    return token;
  }
  return "";
}

function sanitizeAnimationNamePart(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return "element";
  if (/^[0-9]/.test(cleaned)) return `k-${cleaned}`;
  return cleaned;
}

function makeElementAnimationName(styles: StyleInfo): string {
  const base =
    styles.classList.find((cls) => cls && !cls.startsWith("gl-")) ||
    styles.classList[0] ||
    styles.id ||
    styles.tagName ||
    "element";
  return `${sanitizeAnimationNamePart(base)}-animation`;
}

const ANIMATION_PRESETS: (() => AnimationPreset)[] = [
  () => { const n = makePresetName(); return {
    label: "Fade In", keyframeName: n, animation: `${n} 0.5s ease both`,
    keyframeCSS: "0% { opacity: 0; } 100% { opacity: 1; }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Fade Out", keyframeName: n, animation: `${n} 0.5s ease both`,
    keyframeCSS: "0% { opacity: 1; } 100% { opacity: 0; }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Scale In", keyframeName: n, animation: `${n} 0.5s ease both`,
    keyframeCSS: "0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Slide Up", keyframeName: n, animation: `${n} 0.5s ease both`,
    keyframeCSS: "0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Slide Down", keyframeName: n, animation: `${n} 0.5s ease both`,
    keyframeCSS: "0% { opacity: 0; transform: translateY(-30px); } 100% { opacity: 1; transform: translateY(0); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Show on Entry", keyframeName: n,
    animation: `${n} linear both`, timeline: "view()", range: "entry",
    keyframeCSS: "0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Clip on Entry", keyframeName: n,
    animation: `${n} linear both`, timeline: "view()", range: "entry",
    keyframeCSS: "0% { clip-path: inset(45% 20% 45% 20%); transform: translateY(35%); } 100% { clip-path: inset(0% 0% 0% 0%); transform: translateY(0%); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Show In/Out", keyframeName: n,
    animation: `${n} linear`, timeline: "view()",
    keyframeCSS: "entry 0% { opacity: 0; transform: translateY(5%) scale(0.5); } entry 100%, exit 0% { opacity: 1; transform: translateY(0) scale(1); } exit 100% { opacity: 0; transform: translateY(-5%) scale(0.5); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Hide on Exit", keyframeName: n,
    animation: `${n} linear forwards`, timeline: "view()", range: "exit",
    keyframeCSS: "0% { opacity: 1; } 100% { opacity: 0; filter: blur(10px); transform: scale(0.7); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Scroll Parallax", keyframeName: n,
    animation: `${n} both`, timeline: "view()",
    keyframeCSS: "from { transform: translateY(100px); } to { transform: translateY(-100px); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Scroll Rotate", keyframeName: n,
    animation: `${n} both`, timeline: "view()",
    keyframeCSS: "from { transform: rotate(-180deg); } to { transform: rotate(180deg); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "UnBlur Center", keyframeName: n,
    animation: `${n} linear both`, timeline: "view()",
    keyframeCSS: "0% { filter: blur(40px); } 45%, 55% { filter: blur(0px); } 100% { filter: blur(40px); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Spin", keyframeName: n, animation: `${n} 1s linear infinite`,
    keyframeCSS: "from { transform: rotate(0deg); } to { transform: rotate(360deg); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Bounce", keyframeName: n, animation: `${n} 1s ease infinite`,
    keyframeCSS: "0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); }",
  }; },
  () => { const n = makePresetName(); return {
    label: "Pulse", keyframeName: n, animation: `${n} 2s ease-in-out infinite`,
    keyframeCSS: "0%, 100% { opacity: 1; } 50% { opacity: 0.5; }",
  }; },
];

// ============================================================
// Keyframe Builder Modal
// ============================================================

interface KeyframeData {
  position: number;
  properties: Record<string, string>;
}

function parseKeyframesCSS(css: string): KeyframeData[] {
  if (!css) return [{ position: 0, properties: {} }, { position: 100, properties: {} }];
  const kfs: KeyframeData[] = [];
  // Match percentage-based keyframes
  const regex = /(\d+)%\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const pos = parseInt(match[1], 10);
    const propsStr = match[2].trim();
    const props: Record<string, string> = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(propsStr)) !== null) {
      props[pm[1].trim()] = pm[2].trim();
    }
    kfs.push({ position: pos, properties: props });
  }
  // Also handle from/to syntax
  const fromTo = /\b(from|to)\s*\{([^}]*)\}/g;
  let ftm: RegExpExecArray | null;
  while ((ftm = fromTo.exec(css)) !== null) {
    const pos = ftm[1] === "from" ? 0 : 100;
    const propsStr = ftm[2].trim();
    const props: Record<string, string> = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(propsStr)) !== null) {
      props[pm[1].trim()] = pm[2].trim();
    }
    // Merge if position already exists
    const existing = kfs.find((k) => k.position === pos);
    if (existing) {
      Object.assign(existing.properties, props);
    } else {
      kfs.push({ position: pos, properties: props });
    }
  }
  if (kfs.length === 0) return [{ position: 0, properties: {} }, { position: 100, properties: {} }];
  return kfs.sort((a, b) => a.position - b.position);
}

function generateKeyframesCSS(keyframes: KeyframeData[]): string {
  return keyframes
    .sort((a, b) => a.position - b.position)
    .map((kf) => {
      const props = Object.entries(kf.properties)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `${kf.position}% {\n${props}\n}`;
    })
    .join("\n");
}

const KF_PROPERTY_PRESETS = [
  { label: "opacity", placeholder: "1" },
  { label: "transform", placeholder: "translateY(0)" },
  { label: "filter", placeholder: "blur(0px)" },
  { label: "clip-path", placeholder: "inset(0% 0% 0% 0%)" },
  { label: "background-color", placeholder: "#000" },
  { label: "color", placeholder: "#fff" },
  { label: "scale", placeholder: "1" },
  { label: "rotate", placeholder: "0deg" },
  { label: "translateX", placeholder: "0px" },
  { label: "translateY", placeholder: "0px" },
  { label: "translateZ", placeholder: "0px" },
];

function KeyframeBuilderModal({
  name,
  initialCSS,
  onApply,
  onClose,
}: {
  name: string;
  initialCSS: string;
  onApply: (css: string) => void;
  onClose: () => void;
}) {
  const [keyframes, setKeyframes] = useState<KeyframeData[]>(() => parseKeyframesCSS(initialCSS));
  const [activeIdx, setActiveIdx] = useState(0);
  const [codeView, setCodeView] = useState(false);
  const [codeText, setCodeText] = useState(() => generateKeyframesCSS(parseKeyframesCSS(initialCSS)));
  const [newPropName, setNewPropName] = useState("");
  const [showAddProp, setShowAddProp] = useState(false);
  const [addPropPos, setAddPropPos] = useState<{ top: number; right: number } | null>(null);
  const addPropRef = useRef<HTMLDivElement>(null);
  const addPropBtnRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ idx: number; startX: number; startPos: number } | null>(null);

  const activeKf = keyframes[activeIdx] || keyframes[0];

  useEffect(() => {
    if (!showAddProp) return;
    const h = (e: MouseEvent) => {
      if (addPropRef.current && !addPropRef.current.contains(e.target as Node) &&
          !(e.target as HTMLElement).closest?.('[data-kf-addprop-dropdown]')) {
        setShowAddProp(false);
      }
    };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showAddProp]);

  const updateKeyframes = useCallback((kfs: KeyframeData[]) => {
    setKeyframes(kfs);
    const css = generateKeyframesCSS(kfs);
    setCodeText(css);
  }, []);

  const updateProp = useCallback((prop: string, value: string) => {
    const nkfs = keyframes.map((kf, i) => {
      if (i !== activeIdx) return kf;
      const np = { ...kf.properties };
      if (value) np[prop] = value; else delete np[prop];
      return { ...kf, properties: np };
    });
    updateKeyframes(nkfs);
  }, [keyframes, activeIdx, updateKeyframes]);

  const addKeyframe = () => {
    const positions = keyframes.map((k) => k.position).sort((a, b) => a - b);
    let bestPos = 50; let maxGap = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      const gap = positions[i + 1] - positions[i];
      if (gap > maxGap) { maxGap = gap; bestPos = positions[i] + Math.floor(gap / 2); }
    }
    if (keyframes.some((k) => k.position === bestPos)) return;
    const nkfs = [...keyframes, { position: bestPos, properties: {} }].sort((a, b) => a.position - b.position);
    updateKeyframes(nkfs);
    setActiveIdx(nkfs.findIndex((k) => k.position === bestPos));
  };

  const removeKeyframe = (idx: number) => {
    if (keyframes.length <= 2) return;
    const nkfs = keyframes.filter((_, i) => i !== idx);
    updateKeyframes(nkfs);
    setActiveIdx(Math.min(activeIdx, nkfs.length - 1));
  };

  const updatePosition = useCallback((idx: number, pos: number) => {
    setKeyframes((prev) => {
      if (prev.some((k, i) => i !== idx && k.position === pos)) return prev;
      const nkfs = prev.map((kf, i) => i === idx ? { ...kf, position: pos } : kf).sort((a, b) => a.position - b.position);
      const newIdx = nkfs.findIndex((k) => k.position === pos);
      setActiveIdx(newIdx);
      // Update dragRef so subsequent mousemove events use the correct index after sort
      if (dragRef.current) dragRef.current.idx = newIdx;
      const css = generateKeyframesCSS(nkfs);
      setCodeText(css);
      return nkfs;
    });
  }, []);

  // Drag handlers for keyframe markers
  const handleMarkerMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveIdx(idx);
    if (!timelineRef.current) return;
    dragRef.current = { idx, startX: e.clientX, startPos: keyframes[idx].position };

    const onMouseMove = (me: MouseEvent) => {
      if (!dragRef.current || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const padding = 8;
      const x = me.clientX - rect.left - padding;
      const trackWidth = rect.width - padding * 2;
      const pct = Math.round(Math.max(0, Math.min(100, (x / trackWidth) * 100)));
      updatePosition(dragRef.current.idx, pct);
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [keyframes, updatePosition]);

  const handleCodeChange = (text: string) => {
    setCodeText(text);
    try {
      const parsed = parseKeyframesCSS(text);
      if (parsed.length > 0) { setKeyframes(parsed); setActiveIdx(0); }
    } catch {}
  };

  const handleApply = () => {
    const css = codeView ? codeText : generateKeyframesCSS(keyframes);
    onApply(css);
    onClose();
  };

  const toggleAddProp = () => {
    if (!showAddProp && addPropBtnRef.current) {
      const rect = addPropBtnRef.current.getBoundingClientRect();
      setAddPropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowAddProp(!showAddProp);
  };

  const addProperty = (propName: string) => {
    if (!propName.trim()) return;
    const preset = KF_PROPERTY_PRESETS.find((p) => p.label === propName);
    updateProp(propName.trim(), preset?.placeholder || "");
    setShowAddProp(false);
    setNewPropName("");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1a1a1e] border border-zinc-700/60 rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-zinc-200">Keyframe Builder</span>
            <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">@{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCodeView(!codeView)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${codeView ? "bg-violet-500/20 text-violet-300" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40"}`}>
              {codeView ? "Visual" : "Code"}
            </button>
            <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {codeView ? (
            <div>
              <FieldLabel>Keyframe CSS</FieldLabel>
              <textarea value={codeText} onChange={(e) => handleCodeChange(e.target.value)} spellCheck={false}
                className="w-full h-64 rounded-md border border-zinc-700/40 bg-zinc-900/80 px-3 py-2 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
                placeholder="0% { opacity: 0; }&#10;100% { opacity: 1; }" />
            </div>
          ) : (
            <>
              {/* Timeline */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel>Timeline</FieldLabel>
                  <button onClick={addKeyframe}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors">
                    <Plus size={10} /> Add
                  </button>
                </div>
                <div ref={timelineRef} className="relative h-12 bg-zinc-800/60 rounded-lg border border-zinc-700/30 px-2">
                  {/* Track line */}
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-zinc-700/60 rounded-full" />
                  {/* Ruler marks */}
                  {[0, 25, 50, 75, 100].map((p) => (
                    <div key={p} className="absolute bottom-0 flex flex-col items-center" style={{ left: `calc(${p}% - ${(p / 100) * 16}px + 8px)`, transform: "translateX(-50%)" }}>
                      <div className="w-px h-1.5 bg-zinc-600/50" />
                      <span className="text-[7px] text-zinc-600 mt-px leading-none">{p}</span>
                    </div>
                  ))}
                  {/* Keyframe markers - draggable */}
                  {keyframes.map((kf, idx) => (
                    <div key={idx}
                      onMouseDown={(e) => handleMarkerMouseDown(e, idx)}
                      className={`absolute top-1/2 flex flex-col items-center select-none ${
                        idx === activeIdx ? "z-20" : "z-10"
                      }`}
                      style={{ left: `calc(${kf.position}% - ${(kf.position / 100) * 16}px + 8px)`, transform: "translate(-50%, -50%)", cursor: "grab" }}
                      title={`${kf.position}% — drag to move`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-sm rotate-45 border-2 transition-all ${
                        idx === activeIdx
                          ? "bg-violet-500 border-violet-300 scale-125 shadow-lg shadow-violet-500/40"
                          : "bg-zinc-600 border-zinc-500 hover:bg-violet-400 hover:border-violet-300"
                      }`} />
                      <span className={`text-[8px] font-mono mt-1.5 leading-none ${
                        idx === activeIdx ? "text-violet-400 font-bold" : "text-zinc-500"
                      }`}>{kf.position}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active keyframe editor */}
              {activeKf && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase">Keyframe</span>
                      <span className="text-[11px] font-mono font-bold text-violet-400">{activeKf.position}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {keyframes.length > 2 && (
                        <button onClick={() => removeKeyframe(activeIdx)}
                          className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Properties */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <FieldLabel>Properties</FieldLabel>
                      <div ref={addPropRef}>
                        <button ref={addPropBtnRef} onClick={toggleAddProp}
                          className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${showAddProp ? "bg-violet-500/20 text-violet-300" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50"}`}>
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    {Object.keys(activeKf.properties).length === 0 ? (
                      <div className="text-[10px] text-zinc-600 text-center py-3">
                        No properties. Click + to add.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(activeKf.properties).map(([prop, val]) => (
                          <div key={prop} className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-[9px] font-mono text-zinc-500 mb-0.5 block">{prop}</label>
                              <input type="text" value={val}
                                onChange={(e) => updateProp(prop, e.target.value)}
                                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-colors" />
                            </div>
                            <button onClick={() => updateProp(prop, "")}
                              className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-4">
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="px-4 py-3 border-t border-zinc-700/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-medium text-zinc-500 uppercase">Preview</span>
          </div>
          <style>{`@keyframes ${name} { ${codeView ? codeText : generateKeyframesCSS(keyframes)} }`}</style>
          <div className="flex items-center justify-center h-16 bg-zinc-800/40 rounded-lg border border-zinc-700/20">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600"
              style={{ animation: `${name} 2s ease-in-out infinite alternate` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-700/40">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors">
            Cancel
          </button>
          <button onClick={handleApply}
            className="px-4 py-1.5 rounded-md text-[11px] font-medium text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm">
            Apply Keyframes
          </button>
        </div>

        {/* Add property dropdown — fixed to escape overflow clipping */}
        {showAddProp && addPropPos && (
          <div data-kf-addprop-dropdown className="fixed w-[160px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl overflow-hidden"
            style={{ top: addPropPos.top, right: addPropPos.right, zIndex: 99999 }}>
            <div className="p-2 border-b border-zinc-700/30">
              <input type="text" value={newPropName} onChange={(e) => setNewPropName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "NumpadEnter") {
                    e.preventDefault();
                    e.stopPropagation();
                    addProperty(newPropName);
                  }
                }}
                placeholder="Custom property..." autoFocus
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none" />
            </div>
            <div className="py-1 max-h-[200px] overflow-y-auto">
              {KF_PROPERTY_PRESETS.filter((p) => !activeKf.properties[p.label]).map((preset) => (
                <button key={preset.label} onClick={() => addProperty(preset.label)}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100 transition-colors">
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// Main EffectsPanel
// ============================================================

export function EffectsPanel({ styles, onStyleChange, onInjectKeyframes, onUploadImage }: EffectsPanelProps) {
  return (
    <div className="space-y-3">
      {/* Opacity */}
      <div>
        <FieldLabel>Opacity</FieldLabel>
        <UnitControl icon={<SideIcon label="Op" />} value={getEffectiveValue(styles, "opacity")}
          onChange={(v: string) => onStyleChange("opacity", v)} placeholder="1" step={0.05} defaultValue="1" />
      </div>

      {/* Mix Blend Mode */}
      <PresetSelect label="Mix Blend Mode" value={getEffectiveValue(styles, "mix-blend-mode")}
        onChange={(v) => onStyleChange("mix-blend-mode", v)} options={MIX_BLEND_OPTIONS} placeholder="normal" />

      {/* Clip Path */}
      <div className="border-t border-zinc-800/30 pt-2">
        <PresetSelect label="Clip Path" value={getEffectiveValue(styles, "clip-path")}
          onChange={(v) => onStyleChange("clip-path", v)} options={CLIP_PATH_PRESETS} placeholder="none" />
      </div>

      {/* Filter */}
      <div className="border-t border-zinc-800/30 pt-2">
        <FilterSection label="Filter" property="filter" styles={styles} onStyleChange={onStyleChange} />
      </div>

      {/* Backdrop Filter */}
      <div className="border-t border-zinc-800/30 pt-2">
        <FilterSection label="Backdrop Filter" property="backdrop-filter" styles={styles} onStyleChange={onStyleChange} />
      </div>

      {/* Mask */}
      <div className="border-t border-zinc-800/30 pt-2">
        <MaskSection styles={styles} onStyleChange={onStyleChange} onUploadImage={onUploadImage} />
      </div>

    </div>
  );
}
