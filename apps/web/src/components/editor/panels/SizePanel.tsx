

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { useState, useRef, useEffect } from "react";
import { ChevronRight, Maximize2, Move } from "lucide-react";
import { FieldLabel, SideIcon, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface SizePanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

// Preset popover — click to toggle presets
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

  // Close on outside click
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
          placeholder="auto"
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

const ASPECT_RATIO_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "1 / 1 (Square)", value: "1/1" },
  { label: "4 / 3", value: "4/3" },
  { label: "16 / 9", value: "16/9" },
  { label: "21 / 9", value: "21/9" },
  { label: "2 / 1", value: "2/1" },
  { label: "3 / 1", value: "3/1" },
  { label: "0.5", value: "0.5" },
  { label: "1.5", value: "1.5" },
];

const OBJECT_FIT_OPTIONS = [
  { label: "Fill", value: "fill" },
  { label: "Contain", value: "contain" },
  { label: "Cover", value: "cover" },
  { label: "None", value: "none" },
  { label: "Scale Down", value: "scale-down" },
];

const OBJECT_POSITION_OPTIONS = [
  { label: "Center", value: "center" },
  { label: "Top", value: "top" },
  { label: "Bottom", value: "bottom" },
  { label: "Left", value: "left" },
  { label: "Right", value: "right" },
  { label: "Top Left", value: "top left" },
  { label: "Top Right", value: "top right" },
  { label: "Bottom Left", value: "bottom left" },
  { label: "Bottom Right", value: "bottom right" },
];

const SCROLL_SNAP_TYPE_OPTIONS = [
  { label: "None", value: "none" },
  { label: "X Mandatory", value: "x mandatory" },
  { label: "X Proximity", value: "x proximity" },
  { label: "Y Mandatory", value: "y mandatory" },
  { label: "Y Proximity", value: "y proximity" },
  { label: "Both Mandatory", value: "both mandatory" },
  { label: "Both Proximity", value: "both proximity" },
];

const SCROLL_SNAP_ALIGN_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Start", value: "start" },
  { label: "End", value: "end" },
  { label: "Center", value: "center" },
];

const TOUCH_ACTION_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "None", value: "none" },
  { label: "Pan X", value: "pan-x" },
  { label: "Pan Y", value: "pan-y" },
  { label: "Pan X + Y", value: "pan-x pan-y" },
  { label: "Manipulation", value: "manipulation" },
];

const SCROLLBAR_WIDTH_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "Thin", value: "thin" },
  { label: "None", value: "none" },
];

const SCROLLBAR_COLOR_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "Transparent", value: "transparent transparent" },
  { label: "Grey", value: "grey transparent" },
  { label: "Blue", value: "blue transparent" },
  { label: "Dark", value: "#555 #1a1a1a" },
  { label: "Light", value: "#ccc #f0f0f0" },
];

export function SizePanel({ styles, onStyleChange }: SizePanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3">
      {/* Row 1: Width / Height */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Width</FieldLabel>
          <UnitControl
            icon={<SideIcon label="W" />}
            value={getEffectiveValue(styles, "width")}
            onChange={(v: string) => onStyleChange("width", v)}
            defaultValue="0px"
          />
        </div>
        <div>
          <FieldLabel>Height</FieldLabel>
          <UnitControl
            icon={<SideIcon label="H" />}
            value={getEffectiveValue(styles, "height")}
            onChange={(v: string) => onStyleChange("height", v)}
            defaultValue="0px"
          />
        </div>
      </div>

      {/* Row 2: Min Width / Min Height */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Min W</FieldLabel>
          <UnitControl
            icon={<SideIcon label="mW" />}
            value={getEffectiveValue(styles, "min-width")}
            onChange={(v: string) => onStyleChange("min-width", v)}
            defaultValue="0px"
          />
        </div>
        <div>
          <FieldLabel>Min H</FieldLabel>
          <UnitControl
            icon={<SideIcon label="mH" />}
            value={getEffectiveValue(styles, "min-height")}
            onChange={(v: string) => onStyleChange("min-height", v)}
            defaultValue="0px"
          />
        </div>
      </div>

      {/* Row 3: Max Width / Max Height */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Max W</FieldLabel>
          <UnitControl
            icon={<SideIcon label="MW" />}
            value={getEffectiveValue(styles, "max-width")}
            onChange={(v: string) => onStyleChange("max-width", v)}
            defaultValue="0px"
          />
        </div>
        <div>
          <FieldLabel>Max H</FieldLabel>
          <UnitControl
            icon={<SideIcon label="MH" />}
            value={getEffectiveValue(styles, "max-height")}
            onChange={(v: string) => onStyleChange("max-height", v)}
            defaultValue="0px"
          />
        </div>
      </div>

      {/* Advanced Options (collapsible) */}
      <div className="border-t border-zinc-800/30 pt-2">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="group flex w-full items-center gap-1.5 text-[10px] font-medium tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronRight
            size={10}
            className={`text-zinc-600 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
          />
          Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-3 mt-3">
            {/* Aspect Ratio + Object Fit */}
            <div className="grid grid-cols-2 gap-3">
              <PresetSelect
                label="Aspect Ratio"
                value={getEffectiveValue(styles, "aspect-ratio")}
                onChange={(v) => onStyleChange("aspect-ratio", v)}
                options={ASPECT_RATIO_OPTIONS}
              />
              <PresetSelect
                label="Object Fit"
                value={getEffectiveValue(styles, "object-fit")}
                onChange={(v) => onStyleChange("object-fit", v)}
                options={OBJECT_FIT_OPTIONS}
              />
            </div>

            {/* Object Position */}
            <PresetSelect
              label="Object Position"
              value={getEffectiveValue(styles, "object-position")}
              onChange={(v) => onStyleChange("object-position", v)}
              options={OBJECT_POSITION_OPTIONS}
            />

            {/* Scroll Snap */}
            <div className="grid grid-cols-2 gap-3">
              <PresetSelect
                label="Scroll Snap"
                value={getEffectiveValue(styles, "scroll-snap-type")}
                onChange={(v) => onStyleChange("scroll-snap-type", v)}
                options={SCROLL_SNAP_TYPE_OPTIONS}
              />
              <PresetSelect
                label="Snap Align"
                value={getEffectiveValue(styles, "scroll-snap-align")}
                onChange={(v) => onStyleChange("scroll-snap-align", v)}
                options={SCROLL_SNAP_ALIGN_OPTIONS}
              />
            </div>

            {/* Touch Action */}
            <PresetSelect
              label="Touch Action"
              value={getEffectiveValue(styles, "touch-action")}
              onChange={(v) => onStyleChange("touch-action", v)}
              options={TOUCH_ACTION_OPTIONS}
            />

            {/* Scrollbar */}
            <div className="grid grid-cols-2 gap-3">
              <PresetSelect
                label="Scrollbar Width"
                value={getEffectiveValue(styles, "scrollbar-width")}
                onChange={(v) => onStyleChange("scrollbar-width", v)}
                options={SCROLLBAR_WIDTH_OPTIONS}
              />
              <PresetSelect
                label="Scrollbar Color"
                value={getEffectiveValue(styles, "scrollbar-color")}
                onChange={(v) => onStyleChange("scrollbar-color", v)}
                options={SCROLLBAR_COLOR_OPTIONS}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
