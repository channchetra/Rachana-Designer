
import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { TokenPicker } from "../TokenPicker";
import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { FieldLabel, SideIcon, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface TransformPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

// Click-to-toggle preset select
function PresetSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  label: string;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPresets) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPresets]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div ref={ref} className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setShowPresets(true)}
          placeholder="none"
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
        />
        {showPresets && (
          <div className="absolute left-0 top-full mt-1 w-full max-h-40 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl z-50 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value}
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setShowPresets(false); }}
                className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-zinc-800/60 transition-colors ${
                  value === o.value ? "text-violet-300" : "text-zinc-300"
                }`}
              >
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
// Text input with local state + token picker on hover
// Handles its own local state to avoid round-trip lag.
// Parent value syncs in only when the input is NOT focused.
// ============================================================

function TextInputWithTokens({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const createCssVariable = useEditorStore((s) => s.createCssVariable);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);

  // Sync from parent ONLY when not focused (avoid overwriting typing)
  useEffect(() => {
    if (!focused) {
      setLocalValue(value);
    }
  }, [value, focused]);

  const handleChange = useCallback((newVal: string) => {
    setLocalValue(newVal);
    onChange(newVal);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const handleTokenSelect = useCallback((varRef: string) => {
    setLocalValue(varRef);
    onChange(varRef);
    setShowTokens(false);
  }, [onChange]);

  return (
    <div
      className="relative group/txtinput"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || "none"}
        className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
      />
      {(hovered || showTokens) && (cssVariables.length > 0 || createCssVariable) && (
        <button
          ref={tokenBtnRef}
          onClick={(e) => { e.stopPropagation(); setShowTokens(!showTokens); }}
          className={`absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full transition-all z-10 ${
            showTokens
              ? "bg-violet-500 text-white shadow-md"
              : "bg-zinc-600 text-zinc-200 hover:bg-violet-500 hover:text-white shadow-sm"
          }`}
          title="Select token variable"
        >
          <Plus size={9} strokeWidth={2.5} />
        </button>
      )}
      {showTokens && (
        <TokenPicker
          variables={cssVariables}
          onSelect={handleTokenSelect}
          onClose={() => setShowTokens(false)}
          triggerRef={tokenBtnRef}
          onCreateVariable={createCssVariable || undefined}
        />
      )}
    </div>
  );
}

// ============================================================
// Transition presets
// ============================================================

const TRANSITION_PRESETS = [
  { label: "Ease", value: "all 0.3s ease" },
  { label: "Ease In-Out", value: "all 0.3s ease-in-out" },
  { label: "Linear", value: "all 0.3s linear" },
  { label: "Quick", value: "all 0.15s ease" },
  { label: "Smooth", value: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)" },
  { label: "Bouncy", value: "all 0.5s cubic-bezier(0.35, 0.11, 0.22, 1.16)" },
  { label: "Slow", value: "all 1s cubic-bezier(0.66, 0, 0.34, 1)" },
  { label: "Accent", value: "all 1s cubic-bezier(0.48, 0.04, 0.52, 0.96)" },
  { label: "Motion", value: "all 1s cubic-bezier(0.84, 0, 0.16, 1)" },
  { label: "Light", value: "all 1s cubic-bezier(0.4, 0.8, 0.74, 1)" },
];

// ============================================================
// Transform function definitions (compose into `transform`)
// ============================================================

interface TransformFunction {
  key: string;
  label: string;
  fn: string;  // CSS function name: translateX, rotateY, etc.
  placeholder: string;
  defaultUnit: string;  // appended if user enters bare number
  step?: number;
  iconLabel: string;
}

const TRANSFORM_FUNCTIONS: TransformFunction[] = [
  { key: "translateX", label: "Translate X", fn: "translateX", placeholder: "0", defaultUnit: "px", iconLabel: "tX" },
  { key: "translateY", label: "Translate Y", fn: "translateY", placeholder: "0", defaultUnit: "px", iconLabel: "tY" },
  { key: "translateZ", label: "Translate Z", fn: "translateZ", placeholder: "0", defaultUnit: "px", iconLabel: "tZ" },
  { key: "rotate", label: "Rotate", fn: "rotate", placeholder: "0", defaultUnit: "deg", iconLabel: "R" },
  { key: "rotateX", label: "Rotate X", fn: "rotateX", placeholder: "0", defaultUnit: "deg", iconLabel: "rX" },
  { key: "rotateY", label: "Rotate Y", fn: "rotateY", placeholder: "0", defaultUnit: "deg", iconLabel: "rY" },
  { key: "scale", label: "Scale", fn: "scale", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "S" },
  { key: "scaleX", label: "Scale X", fn: "scaleX", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "sX" },
  { key: "scaleY", label: "Scale Y", fn: "scaleY", placeholder: "1", defaultUnit: "", step: 0.05, iconLabel: "sY" },
  { key: "skewX", label: "Skew X", fn: "skewX", placeholder: "0", defaultUnit: "deg", iconLabel: "kX" },
  { key: "skewY", label: "Skew Y", fn: "skewY", placeholder: "0", defaultUnit: "deg", iconLabel: "kY" },
  { key: "perspective", label: "Perspective", fn: "perspective", placeholder: "0", defaultUnit: "px", iconLabel: "P" },
];

const TRANSFORM_ORIGIN_OPTIONS = [
  { label: "Center", value: "center" },
  { label: "Top Left", value: "top left" },
  { label: "Top Center", value: "top center" },
  { label: "Top Right", value: "top right" },
  { label: "Center Left", value: "center left" },
  { label: "Center Right", value: "center right" },
  { label: "Bottom Left", value: "bottom left" },
  { label: "Bottom Center", value: "bottom center" },
  { label: "Bottom Right", value: "bottom right" },
];

const TRANSFORM_STYLE_OPTIONS = [
  { label: "Flat", value: "flat" },
  { label: "Preserve 3D", value: "preserve-3d" },
];

const BACKFACE_OPTIONS = [
  { label: "Visible", value: "visible" },
  { label: "Hidden", value: "hidden" },
];

// ============================================================
// Parse existing transform string into individual values
// ============================================================

function parseTransformString(transform: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!transform || transform === "none") return values;
  // Match patterns like: translateX(10px) rotate(45deg) scale(1.5)
  const regex = /(\w+)\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(transform)) !== null) {
    const fn = match[1];
    const val = match[2].trim();
    values[fn] = val;
  }
  return values;
}

function composeTransformString(
  enabled: Record<string, boolean>,
  values: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const func of TRANSFORM_FUNCTIONS) {
    if (enabled[func.key] && values[func.key]) {
      const val = values[func.key];
      parts.push(`${func.fn}(${val})`);
    }
  }
  return parts.join(" ") || "";
}

// ============================================================
// Main TransformPanel
// ============================================================

export function TransformPanel({ styles, onStyleChange }: TransformPanelProps) {
  const [showTransitionPresets, setShowTransitionPresets] = useState(false);
  const [showTransformToggle, setShowTransformToggle] = useState(false);

  // Parse current transform value into individual values
  const currentTransform = getEffectiveValue(styles, "transform");
  const [enabledTransforms, setEnabledTransforms] = useState<Record<string, boolean>>(() => {
    const parsed = parseTransformString(currentTransform);
    const enabled: Record<string, boolean> = {};
    for (const func of TRANSFORM_FUNCTIONS) {
      if (parsed[func.fn]) {
        enabled[func.key] = true;
      }
    }
    return enabled;
  });

  const [transformValues, setTransformValues] = useState<Record<string, string>>(() => {
    const parsed = parseTransformString(currentTransform);
    const values: Record<string, string> = {};
    for (const func of TRANSFORM_FUNCTIONS) {
      if (parsed[func.fn]) {
        values[func.key] = parsed[func.fn];
      }
    }
    return values;
  });

  const presetPopoverRef = useRef<HTMLDivElement>(null);
  const togglePopoverRef = useRef<HTMLDivElement>(null);

  // Sync transform values from props when transform changes externally
  useEffect(() => {
    const newTransform = getEffectiveValue(styles, "transform");
    const parsed = parseTransformString(newTransform);
    // Only update values that come from outside, don't override user typing
    const newValues: Record<string, string> = { ...transformValues };
    let changed = false;
    for (const func of TRANSFORM_FUNCTIONS) {
      if (parsed[func.fn] && !enabledTransforms[func.key]) {
        // New function appeared from outside, auto-enable
        setEnabledTransforms((prev) => ({ ...prev, [func.key]: true }));
      }
      if (parsed[func.fn] && parsed[func.fn] !== newValues[func.key]) {
        newValues[func.key] = parsed[func.fn];
        changed = true;
      }
    }
    if (changed) {
      setTransformValues(newValues);
    }
  }, [currentTransform]);

  // Close preset popover on outside click
  useEffect(() => {
    if (!showTransitionPresets) return;
    function handleClick(e: MouseEvent) {
      if (presetPopoverRef.current && !presetPopoverRef.current.contains(e.target as Node)) {
        setShowTransitionPresets(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTransitionPresets]);

  // Close transform toggle popover on outside click
  useEffect(() => {
    if (!showTransformToggle) return;
    function handleClick(e: MouseEvent) {
      if (togglePopoverRef.current && !togglePopoverRef.current.contains(e.target as Node)) {
        setShowTransformToggle(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTransformToggle]);

  // Compose and apply all transform functions
  const applyComposedTransform = useCallback((
    newEnabled: Record<string, boolean>,
    newValues: Record<string, string>,
  ) => {
    const composed = composeTransformString(newEnabled, newValues);
    onStyleChange("transform", composed);
  }, [onStyleChange]);

  const handleTransformValueChange = useCallback((key: string, value: string) => {
    const newValues = { ...transformValues, [key]: value };
    setTransformValues(newValues);
    applyComposedTransform(enabledTransforms, newValues);
  }, [transformValues, enabledTransforms, applyComposedTransform]);

  const toggleTransformProp = useCallback((key: string) => {
    setEnabledTransforms((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        // Clear value and recompose
        const newValues = { ...transformValues };
        delete newValues[key];
        setTransformValues(newValues);
        applyComposedTransform(next, newValues);
      } else {
        next[key] = true;
      }
      return next;
    });
  }, [transformValues, applyComposedTransform]);

  // Immediate override for preset selection (avoids waiting for round-trip)
  const [transitionOverride, setTransitionOverride] = useState<string | null>(null);
  const transitionValue = getEffectiveValue(styles, "transition");

  // Clear override once the real value catches up
  useEffect(() => {
    if (transitionOverride !== null && transitionValue === transitionOverride) {
      setTransitionOverride(null);
    }
  }, [transitionValue, transitionOverride]);

  const hasEnabledTransforms = Object.keys(enabledTransforms).length > 0;

  return (
    <div className="space-y-3">
      {/* ===== TRANSITION ===== */}
      <div>
        <div ref={presetPopoverRef} className="relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Transition
            </span>
            <button
              onClick={() => setShowTransitionPresets(!showTransitionPresets)}
              className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${
                showTransitionPresets
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50"
              }`}
              title="Add transition preset"
            >
              <Plus size={12} />
            </button>
          </div>

          {showTransitionPresets && (
            <div className="absolute right-0 top-7 w-[200px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl overflow-hidden z-50">
              <div className="py-1 max-h-[240px] overflow-y-auto">
                {TRANSITION_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTransitionOverride(p.value);
                      onStyleChange("transition", p.value);
                      setShowTransitionPresets(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-zinc-700/50 hover:text-zinc-100 transition-colors ${
                      transitionValue === p.value ? "text-violet-300" : "text-zinc-300"
                    }`}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-[9px] text-zinc-500 mt-0.5">{p.value}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <TextInputWithTokens
          value={transitionOverride ?? transitionValue}
          onChange={(v) => { setTransitionOverride(null); onStyleChange("transition", v); }}
          placeholder="all 0.3s ease"
        />
      </div>

      {/* ===== TRANSFORM ===== */}
      <div className="border-t border-zinc-800/30 pt-2">
        <div ref={togglePopoverRef} className="relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Transform
            </span>
            <button
              onClick={() => setShowTransformToggle(!showTransformToggle)}
              className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${
                showTransformToggle
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700/50"
              }`}
              title="Toggle transform properties"
            >
              <Plus size={12} />
            </button>
          </div>

          {showTransformToggle && (
            <div className="absolute right-0 top-7 w-[160px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl overflow-hidden z-50">
              <div className="py-1 max-h-[300px] overflow-y-auto">
                {TRANSFORM_FUNCTIONS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => toggleTransformProp(item.key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100 transition-colors"
                  >
                    <span>{item.label}</span>
                    {enabledTransforms[item.key] && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Transform shorthand (always visible, reflects composed value) */}
        <div className="mb-2">
          <FieldLabel>Transform</FieldLabel>
          <TextInputWithTokens
            value={getEffectiveValue(styles, "transform")}
            onChange={(v) => onStyleChange("transform", v)}
            placeholder="none"
          />
        </div>

        {/* Enabled transform function controls */}
        {hasEnabledTransforms && (
          <div className="space-y-2">
            {TRANSFORM_FUNCTIONS.filter((f) => enabledTransforms[f.key]).map((func) => (
              <div key={func.key} className="flex items-center gap-2">
                <div className="flex-1">
                  <FieldLabel>{func.label}</FieldLabel>
                  <UnitControl
                    icon={<SideIcon label={func.iconLabel} />}
                    value={transformValues[func.key] || ""}
                    onChange={(v: string) => handleTransformValueChange(func.key, v)}
                    placeholder={func.placeholder}
                    step={func.step}
                    defaultValue={func.placeholder + func.defaultUnit}
                  />
                </div>
                <button
                  onClick={() => toggleTransformProp(func.key)}
                  className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-4"
                  title={`Remove ${func.label}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== TRANSFORM OPTIONS (always visible) ===== */}
      <div className="border-t border-zinc-800/30 pt-2 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <PresetSelect
            label="Transform Origin"
            value={getEffectiveValue(styles, "transform-origin")}
            onChange={(v) => onStyleChange("transform-origin", v)}
            options={TRANSFORM_ORIGIN_OPTIONS}
          />
          <PresetSelect
            label="Transform Style"
            value={getEffectiveValue(styles, "transform-style")}
            onChange={(v) => onStyleChange("transform-style", v)}
            options={TRANSFORM_STYLE_OPTIONS}
          />
        </div>
        <PresetSelect
          label="Backface Visibility"
          value={getEffectiveValue(styles, "backface-visibility")}
          onChange={(v) => onStyleChange("backface-visibility", v)}
          options={BACKFACE_OPTIONS}
        />
      </div>
    </div>
  );
}
