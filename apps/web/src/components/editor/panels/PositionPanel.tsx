

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { DraggableNumberInput } from "../DraggableNumberInput";
import { FieldLabel, SideIcon, getEffectiveValue, getExplicitValue } from "@/components/ui/panelPrimitives";

interface PositionPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

const POSITION_OPTIONS = ["static", "relative", "absolute", "fixed", "sticky"];
const ISOLATION_OPTIONS = ["auto", "isolate"];

export function PositionPanel({ styles, onStyleChange }: PositionPanelProps) {
  const position = getEffectiveValue(styles, "position");
  const showOffsets = position !== "static" && position !== "";

  return (
    <div className="space-y-3">
      {/* Position */}
      <div>
        <FieldLabel>Position</FieldLabel>
        <select
          value={position}
          onChange={(e) => onStyleChange("position", e.target.value)}
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
        >
          {POSITION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Top / Right / Bottom / Left */}
      {showOffsets && (
        <div className="grid grid-cols-2 gap-3">
          <UnitControl
            icon={<SideIcon label="T" />}
            value={getExplicitValue(styles, "top")}
            onChange={(v) => onStyleChange("top", v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="R" />}
            value={getExplicitValue(styles, "right")}
            onChange={(v) => onStyleChange("right", v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="B" />}
            value={getExplicitValue(styles, "bottom")}
            onChange={(v) => onStyleChange("bottom", v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="L" />}
            value={getExplicitValue(styles, "left")}
            onChange={(v) => onStyleChange("left", v)}
            defaultValue="0px"
          />
        </div>
      )}

      {/* Z-Index + Isolation — 2 columns */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="min-w-0">
          <FieldLabel>Z-index</FieldLabel>
          <DraggableNumberInput
            value={getExplicitValue(styles, "z-index")}
            onChange={(v) => onStyleChange("z-index", v)}
            defaultValue="0"
            step={1}
          />
        </div>
        <div className="min-w-0">
          <FieldLabel>Isolation</FieldLabel>
          <select
            value={getEffectiveValue(styles, "isolation")}
            onChange={(e) => onStyleChange("isolation", e.target.value)}
            className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
          >
            {ISOLATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
