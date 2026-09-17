

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { ColorInput } from "../ColorInput";
import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { FieldLabel, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface ShadowPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

// ============================================================
// Shadow layer parsing / building
// ============================================================

interface ShadowLayer {
  inset: boolean;
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
}

function parseShadowLayer(raw: string): ShadowLayer {
  const trimmed = raw.trim();
  // inset can appear at start OR end of shadow value (browsers often put it at the end)
  const inset = /\binset\b/.test(trimmed);
  const rest = trimmed.replace(/\binset\b/g, "").trim();

  // Extract color (rgb/rgba/hsl/hsla/hex/named) from the end or start
  let color = "#000000";
  let values = rest;

  // Try rgba/rgb at the end
  const rgbaEnd = values.match(/\s+(rgba?\([^)]+\))\s*$/);
  if (rgbaEnd) {
    color = rgbaEnd[1];
    values = values.slice(0, rgbaEnd.index!).trim();
  } else {
    // Try hex at the end
    const hexEnd = values.match(/\s+(#[0-9a-fA-F]{3,8})\s*$/);
    if (hexEnd) {
      color = hexEnd[1];
      values = values.slice(0, hexEnd.index!).trim();
    } else {
      // Try color at the start (e.g. "rgb(0,0,0) 0px 4px 6px")
      const rgbaStart = values.match(/^(rgba?\([^)]+\))\s+/);
      if (rgbaStart) {
        color = rgbaStart[1];
        values = values.slice(rgbaStart[0].length).trim();
      } else {
        const hexStart = values.match(/^(#[0-9a-fA-F]{3,8})\s+/);
        if (hexStart) {
          color = hexStart[1];
          values = values.slice(hexStart[0].length).trim();
        }
      }
    }
  }

  const parts = values.split(/\s+/);
  return {
    inset,
    x: parts[0] || "0px",
    y: parts[1] || "0px",
    blur: parts[2] || "0px",
    spread: parts[3] || "0px",
    color,
  };
}

function buildShadowLayer(l: ShadowLayer): string {
  const parts: string[] = [];
  if (l.inset) parts.push("inset");
  parts.push(l.x, l.y, l.blur, l.spread, l.color);
  return parts.join(" ");
}

function parseShadowValue(value: string): ShadowLayer[] {
  if (!value || value === "none") return [];

  // Split by comma but respect parentheses (for rgb/rgba)
  const layers: string[] = [];
  let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      layers.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) layers.push(cur.trim());

  return layers.map(parseShadowLayer);
}

function buildShadowValue(layers: ShadowLayer[]): string {
  if (layers.length === 0) return "none";
  return layers.map(buildShadowLayer).join(", ");
}

// ============================================================
// Shadow Layer Editor
// ============================================================

function ShadowLayerEditor({
  layer,
  index,
  onChange,
  onRemove,
}: {
  layer: ShadowLayer;
  index: number;
  onChange: (updated: ShadowLayer) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1.5 py-2 border-b border-zinc-800/30 last:border-b-0">
      {/* Header: color + inset toggle + delete */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <ColorInput
            value={layer.color}
            onChange={(v) => onChange({ ...layer, color: v })}
          />
        </div>
        <button
          onClick={() => onChange({ ...layer, inset: !layer.inset })}
          className={`px-1.5 py-1 rounded text-[9px] font-semibold uppercase tracking-wide transition-colors border shrink-0 ${
            layer.inset
              ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
              : "bg-zinc-800/60 text-zinc-600 border-zinc-700/40 hover:text-zinc-400 hover:border-zinc-600"
          }`}
          title="Toggle inset"
        >
          Inset
        </button>
        <button
          onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
          title="Remove shadow"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* X / Y */}
      <div className="grid grid-cols-2 gap-1.5">
        <UnitControl
          icon={<span className="text-[9px] font-semibold leading-none">X</span>}
          value={layer.x}
          onChange={(v: string) => onChange({ ...layer, x: v })}
          placeholder="0px"
          defaultValue="0px"
        />
        <UnitControl
          icon={<span className="text-[9px] font-semibold leading-none">Y</span>}
          value={layer.y}
          onChange={(v: string) => onChange({ ...layer, y: v })}
          placeholder="0px"
          defaultValue="0px"
        />
      </div>

      {/* Blur / Spread */}
      <div className="grid grid-cols-2 gap-1.5">
        <UnitControl
          icon={<span className="text-[9px] font-semibold leading-none">Bl</span>}
          value={layer.blur}
          onChange={(v: string) => onChange({ ...layer, blur: v })}
          placeholder="0px"
          defaultValue="0px"
        />
        <UnitControl
          icon={<span className="text-[9px] font-semibold leading-none">Sp</span>}
          value={layer.spread}
          onChange={(v: string) => onChange({ ...layer, spread: v })}
          placeholder="0px"
          defaultValue="0px"
        />
      </div>
    </div>
  );
}

// ============================================================
// Shadow Section (reused for box-shadow and text-shadow)
// ============================================================

function ShadowSection({
  label,
  property,
  styles,
  onStyleChange,
  showSpread,
}: {
  label: string;
  property: string;
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  showSpread?: boolean;
}) {
  const value = getEffectiveValue(styles, property);

  // Use local state so changes (especially inset) are reflected immediately
  // without waiting for the round-trip through the extension.
  const [localLayers, setLocalLayers] = useState<ShadowLayer[]>(() => parseShadowValue(value));
  const lastExternalValue = useRef(value);

  // Sync from external when the CSS value actually changes from outside
  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      setLocalLayers(parseShadowValue(value));
    }
  }, [value]);

  const updateLayers = useCallback((newLayers: ShadowLayer[]) => {
    setLocalLayers(newLayers);
    const cssValue = buildShadowValue(newLayers);
    lastExternalValue.current = cssValue;
    onStyleChange(property, cssValue);
  }, [property, onStyleChange]);

  const addLayer = () => {
    const newLayer: ShadowLayer = {
      inset: false,
      x: "0px",
      y: "4px",
      blur: "6px",
      spread: showSpread !== false ? "0px" : "0px",
      color: "rgba(0, 0, 0, 0.15)",
    };
    updateLayers([...localLayers, newLayer]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <FieldLabel>{label}</FieldLabel>
        <button
          onClick={addLayer}
          className="flex items-center justify-center w-5 h-5 rounded text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
          title={`Add ${label.toLowerCase()} layer`}
        >
          <Plus size={11} />
        </button>
      </div>

      {localLayers.length === 0 ? (
        <div className="flex items-center justify-center py-3 text-[10px] text-zinc-600">
          No {label.toLowerCase()} set
        </div>
      ) : (
        <div>
          {localLayers.map((layer, i) => (
            <ShadowLayerEditor
              key={i}
              layer={layer}
              index={i}
              onChange={(updated) => {
                const newLayers = localLayers.map((l, j) => (j === i ? updated : l));
                updateLayers(newLayers);
              }}
              onRemove={() => {
                updateLayers(localLayers.filter((_, j) => j !== i));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main ShadowPanel
// ============================================================

const TEXT_TAGS = ["span", "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "em", "strong", "b", "i", "label", "small"];

export function ShadowPanel({ styles, onStyleChange }: ShadowPanelProps) {
  const isTextElement = TEXT_TAGS.includes(styles.tagName.toLowerCase());

  return (
    <div className="space-y-3">
      <ShadowSection
        label="Box Shadow"
        property="box-shadow"
        styles={styles}
        onStyleChange={onStyleChange}
        showSpread
      />

      {isTextElement && (
        <ShadowSection
          label="Text Shadow"
          property="text-shadow"
          styles={styles}
          onStyleChange={onStyleChange}
          showSpread={false}
        />
      )}
    </div>
  );
}
