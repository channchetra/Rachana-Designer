

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { useState, useMemo } from "react";
import { Link, Unlink, AlignVerticalSpaceBetween, AlignHorizontalSpaceBetween, Frame } from "lucide-react";
import { FieldLabel, SideIcon, getEffectiveValue, getExplicitValue } from "@/components/ui/panelPrimitives";

interface SpacingPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

// Only returns explicitly set values (inline/id/class rules), not computed defaults

const OVERFLOW_OPTIONS = ["visible", "hidden", "scroll", "auto", "clip"];
const WHITE_SPACE_OPTIONS = ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"];

function VerticalSpacingIcon() {
  return <AlignVerticalSpaceBetween size={13} />;
}

function HorizontalSpacingIcon() {
  return <AlignHorizontalSpaceBetween size={13} />;
}

function FourSidesIcon({ active }: { active: boolean }) {
  return <Frame size={14} style={{ opacity: active ? 1 : 0.4 }} />;
}

function SpacingSection({
  label,
  prefix,
  styles,
  onStyleChange,
  accent,
}: {
  label: string;
  prefix: string;
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  accent: "zinc" | "emerald";
}) {
  const top = getExplicitValue(styles, `${prefix}-top`);
  const bottom = getExplicitValue(styles, `${prefix}-bottom`);
  const left = getExplicitValue(styles, `${prefix}-left`);
  const right = getExplicitValue(styles, `${prefix}-right`);

  // Auto-detect: enable 4-side mode only if a direction pair doesn't match
  // e.g. top !== bottom, or left !== right
  const sidesAreDifferent = useMemo(() => {
    const t = top || "0px";
    const b = bottom || "0px";
    const l = left || "0px";
    const r = right || "0px";
    return t !== b || l !== r;
  }, [top, bottom, left, right]);

  const [fourSidesOverride, setFourSidesOverride] = useState<boolean | null>(null);
  const fourSides = fourSidesOverride !== null ? fourSidesOverride : sidesAreDifferent;

  const accentColor = accent === "emerald" ? "text-emerald-400" : "text-zinc-400";

  const handleVerticalChange = (v: string) => {
    onStyleChange(`${prefix}-top`, v);
    onStyleChange(`${prefix}-bottom`, v);
  };

  const handleHorizontalChange = (v: string) => {
    onStyleChange(`${prefix}-left`, v);
    onStyleChange(`${prefix}-right`, v);
  };

  const verticalValue = top === bottom ? top : (top || "");
  const horizontalValue = left === right ? left : (left || "");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <FieldLabel>{label}</FieldLabel>
        <button
          onClick={() => setFourSidesOverride(fourSides ? false : true)}
          className={`flex items-center justify-center w-5 h-5 rounded transition-all ${
            fourSides
              ? `${accentColor} bg-zinc-700/60`
              : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
          }`}
          title={fourSides ? "Switch to H/V mode" : "Edit all 4 sides"}
        >
          <FourSidesIcon active={fourSides} />
        </button>
      </div>

      {fourSides ? (
        <div className="grid grid-cols-2 gap-3">
          <UnitControl
            icon={<SideIcon label="T" />}
            value={top}
            onChange={(v) => onStyleChange(`${prefix}-top`, v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="R" />}
            value={right}
            onChange={(v) => onStyleChange(`${prefix}-right`, v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="B" />}
            value={bottom}
            onChange={(v) => onStyleChange(`${prefix}-bottom`, v)}
            defaultValue="0px"
          />
          <UnitControl
            icon={<SideIcon label="L" />}
            value={left}
            onChange={(v) => onStyleChange(`${prefix}-left`, v)}
            defaultValue="0px"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <UnitControl
            icon={<VerticalSpacingIcon />}
            value={verticalValue}
            onChange={handleVerticalChange}
            defaultValue="0px"
          />
          <UnitControl
            icon={<HorizontalSpacingIcon />}
            value={horizontalValue}
            onChange={handleHorizontalChange}
            defaultValue="0px"
          />
        </div>
      )}
    </div>
  );
}

export function SpacingPanel({ styles, onStyleChange }: SpacingPanelProps) {
  const overflowXValue = getEffectiveValue(styles, "overflow-x") || getEffectiveValue(styles, "overflow");
  const overflowYValue = getEffectiveValue(styles, "overflow-y") || getEffectiveValue(styles, "overflow");
  const overflowIsSplitDetected = useMemo(
    () => overflowXValue !== overflowYValue,
    [overflowXValue, overflowYValue]
  );
  const [overflowSplitOverride, setOverflowSplitOverride] = useState<boolean | null>(null);
  const overflowSplit = overflowSplitOverride !== null ? overflowSplitOverride : overflowIsSplitDetected;

  const setLinkedOverflow = (value: string) => {
    onStyleChange("overflow", value);
    onStyleChange("overflow-x", value);
    onStyleChange("overflow-y", value);
  };

  const enableSplitOverflow = () => {
    const base = overflowXValue || overflowYValue || getEffectiveValue(styles, "overflow") || "visible";
    onStyleChange("overflow", "");
    onStyleChange("overflow-x", base);
    onStyleChange("overflow-y", base);
    setOverflowSplitOverride(true);
  };

  const disableSplitOverflow = () => {
    const unified = overflowXValue || overflowYValue || "visible";
    setLinkedOverflow(unified);
    setOverflowSplitOverride(false);
  };

  return (
    <div className="space-y-3">
      <SpacingSection
        label="Padding"
        prefix="padding"
        styles={styles}
        onStyleChange={onStyleChange}
        accent="emerald"
      />
      <SpacingSection
        label="Margin"
        prefix="margin"
        styles={styles}
        onStyleChange={onStyleChange}
        accent="zinc"
      />

      {/* White Space + Overflow — 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>White space</FieldLabel>
          <select
            value={getEffectiveValue(styles, "white-space")}
            onChange={(e) => onStyleChange("white-space", e.target.value)}
            className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
          >
            {WHITE_SPACE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>Overflow</FieldLabel>
            <button
              onClick={() => (overflowSplit ? disableSplitOverflow() : enableSplitOverflow())}
              className={`flex items-center justify-center w-5 h-5 rounded transition-all ${
                overflowSplit
                  ? "text-zinc-400 bg-zinc-700/60"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
              }`}
              title={overflowSplit ? "Link overflow X/Y" : "Unlink overflow X/Y"}
            >
              {overflowSplit ? <Unlink size={11} /> : <Link size={11} />}
            </button>
          </div>
          {overflowSplit ? (
            <div className="space-y-1.5">
              <select
                value={overflowXValue || "visible"}
                onChange={(e) => onStyleChange("overflow-x", e.target.value)}
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
              >
                {OVERFLOW_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{`X: ${opt}`}</option>
                ))}
              </select>
              <select
                value={overflowYValue || "visible"}
                onChange={(e) => onStyleChange("overflow-y", e.target.value)}
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
              >
                {OVERFLOW_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{`Y: ${opt}`}</option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={getEffectiveValue(styles, "overflow") || overflowXValue || overflowYValue || "visible"}
              onChange={(e) => setLinkedOverflow(e.target.value)}
              className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
            >
              {OVERFLOW_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
