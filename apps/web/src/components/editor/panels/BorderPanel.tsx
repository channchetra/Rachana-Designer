

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { ColorInput } from "../ColorInput";
import { useState, useMemo } from "react";
import { Link, Unlink, Code, Frame } from "lucide-react";
import { FieldLabel, SideIcon, getBorderEffectiveValue as getEffectiveValue } from "@/components/ui/panelPrimitives";

interface BorderPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"] as const;

// Visual border style selector
function BorderStyleSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-zinc-800/60 rounded-md border border-zinc-700/40 p-0.5">
      {BORDER_STYLES.map((style) => (
        <button
          key={style}
          onClick={() => onChange(style)}
          title={style}
          className={`flex-1 flex items-center justify-center py-1.5 px-1 rounded transition-all ${
            value === style
              ? "bg-zinc-600 text-zinc-200 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {style === "none" ? (
            <span className="text-[9px] font-medium">—</span>
          ) : (
            <span
              className="w-3.5 block h-0"
              style={{ borderTop: `2px ${style} currentColor` }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// Individual border side row: icon + width + style + color
function BorderSideRow({
  label,
  widthProp,
  styleProp,
  colorProp,
  styles,
  onStyleChange,
}: {
  label: string;
  widthProp: string;
  styleProp: string;
  colorProp: string;
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5 py-1.5 border-b border-zinc-800/30 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-semibold text-zinc-500 uppercase w-5 shrink-0">{label}</span>
        <div className="w-16 shrink-0">
          <UnitControl
            icon={<SideIcon label="W" />}
            value={getEffectiveValue(styles, widthProp)}
            onChange={(v: string) => onStyleChange(widthProp, v)}
            placeholder="0"
            defaultValue="0px"
          />
        </div>
        <div className="flex-1">
          <BorderStyleSelector
            value={getEffectiveValue(styles, styleProp)}
            onChange={(v) => onStyleChange(styleProp, v)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0" />
        <div className="flex-1">
          <ColorInput
            value={getEffectiveValue(styles, colorProp)}
            onChange={(v) => onStyleChange(colorProp, v)}
            computedValue={styles.computed[colorProp]}
          />
        </div>
      </div>
    </div>
  );
}

function FourSidesIcon({ active }: { active: boolean }) {
  return <Frame size={14} style={{ opacity: active ? 1 : 0.4 }} />;
}

export function BorderPanel({ styles, onStyleChange }: BorderPanelProps) {
  const [shorthandMode, setShorthandMode] = useState(false);

  // Auto-detect individual sides mode
  const sidesAreDifferent = useMemo(() => {
    const tw = getEffectiveValue(styles, "border-top-width");
    const rw = getEffectiveValue(styles, "border-right-width");
    const bw = getEffectiveValue(styles, "border-bottom-width");
    const lw = getEffectiveValue(styles, "border-left-width");
    return (tw !== bw || lw !== rw) && (tw || rw || bw || lw);
  }, [styles]);

  const [individualSides, setIndividualSides] = useState<boolean | null>(null);
  const showSides = individualSides !== null ? individualSides : !!sidesAreDifferent;

  // Auto-detect individual radius corners
  const cornersAreDifferent = useMemo(() => {
    const tl = getEffectiveValue(styles, "border-top-left-radius");
    const tr = getEffectiveValue(styles, "border-top-right-radius");
    const br = getEffectiveValue(styles, "border-bottom-right-radius");
    const bl = getEffectiveValue(styles, "border-bottom-left-radius");
    return (tl !== tr || tl !== br || tl !== bl) && (tl || tr || br || bl);
  }, [styles]);

  const [individualCorners, setIndividualCorners] = useState<boolean | null>(null);
  const showCorners = individualCorners !== null ? individualCorners : !!cornersAreDifferent;

  if (shorthandMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <FieldLabel>Border (Shorthand)</FieldLabel>
          <button
            onClick={() => setShorthandMode(false)}
            className="flex items-center justify-center w-5 h-5 rounded transition-all text-violet-400 bg-violet-500/15"
            title="Switch to visual editor"
          >
            <Code size={11} />
          </button>
        </div>
        <UnitControl
          icon={<SideIcon label="B" />}
          value={getEffectiveValue(styles, "border")}
          onChange={(v: string) => onStyleChange("border", v)}
          placeholder="1px solid #000"
          defaultValue="0px"
        />
        <div className="mt-2">
          <FieldLabel>Radius</FieldLabel>
          <UnitControl
            icon={<SideIcon label="R" />}
            value={getEffectiveValue(styles, "border-radius")}
            onChange={(v: string) => onStyleChange("border-radius", v)}
            placeholder="0"
            defaultValue="0px"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ===== BORDER ===== */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <FieldLabel>Border</FieldLabel>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShorthandMode(true)}
              className="flex items-center justify-center w-5 h-5 rounded transition-all text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
              title="Switch to shorthand mode"
            >
              <Code size={11} />
            </button>
            <button
              onClick={() => setIndividualSides(showSides ? false : true)}
              className={`flex items-center justify-center w-5 h-5 rounded transition-all ${
                showSides
                  ? "text-zinc-400 bg-zinc-700/60"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
              }`}
              title={showSides ? "Switch to uniform border" : "Edit individual sides"}
            >
              <FourSidesIcon active={showSides} />
            </button>
          </div>
        </div>

        {showSides ? (
          /* Individual sides */
          <div>
            <BorderSideRow label="Top" widthProp="border-top-width" styleProp="border-top-style" colorProp="border-top-color" styles={styles} onStyleChange={onStyleChange} />
            <BorderSideRow label="Right" widthProp="border-right-width" styleProp="border-right-style" colorProp="border-right-color" styles={styles} onStyleChange={onStyleChange} />
            <BorderSideRow label="Btm" widthProp="border-bottom-width" styleProp="border-bottom-style" colorProp="border-bottom-color" styles={styles} onStyleChange={onStyleChange} />
            <BorderSideRow label="Left" widthProp="border-left-width" styleProp="border-left-style" colorProp="border-left-color" styles={styles} onStyleChange={onStyleChange} />
          </div>
        ) : (
          /* Uniform border */
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-[88px] shrink-0">
                <UnitControl
                  icon={<SideIcon label="W" />}
                  value={getEffectiveValue(styles, "border-width")}
                  onChange={(v: string) => onStyleChange("border-width", v)}
                  placeholder="0"
                  defaultValue="0px"
                />
              </div>
              <div className="flex-1">
                <BorderStyleSelector
                  value={getEffectiveValue(styles, "border-style")}
                  onChange={(v) => onStyleChange("border-style", v)}
                />
              </div>
            </div>
            <ColorInput
              value={getEffectiveValue(styles, "border-color")}
              onChange={(v) => onStyleChange("border-color", v)}
              computedValue={styles.computed["border-color"]}
            />
          </div>
        )}
      </div>

      {/* ===== RADIUS ===== */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <FieldLabel>Radius</FieldLabel>
          <button
            onClick={() => setIndividualCorners(showCorners ? false : true)}
            className={`flex items-center justify-center w-5 h-5 rounded transition-all ${
              showCorners
                ? "text-zinc-400 bg-zinc-700/60"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
            }`}
            title={showCorners ? "Switch to uniform radius" : "Edit individual corners"}
          >
            {showCorners ? <Unlink size={11} /> : <Link size={11} />}
          </button>
        </div>

        {showCorners ? (
          <div className="grid grid-cols-2 gap-2">
            <UnitControl
              icon={<SideIcon label="TL" />}
              value={getEffectiveValue(styles, "border-top-left-radius")}
              onChange={(v: string) => onStyleChange("border-top-left-radius", v)}
              placeholder="0"
              defaultValue="0px"
            />
            <UnitControl
              icon={<SideIcon label="TR" />}
              value={getEffectiveValue(styles, "border-top-right-radius")}
              onChange={(v: string) => onStyleChange("border-top-right-radius", v)}
              placeholder="0"
              defaultValue="0px"
            />
            <UnitControl
              icon={<SideIcon label="BL" />}
              value={getEffectiveValue(styles, "border-bottom-left-radius")}
              onChange={(v: string) => onStyleChange("border-bottom-left-radius", v)}
              placeholder="0"
              defaultValue="0px"
            />
            <UnitControl
              icon={<SideIcon label="BR" />}
              value={getEffectiveValue(styles, "border-bottom-right-radius")}
              onChange={(v: string) => onStyleChange("border-bottom-right-radius", v)}
              placeholder="0"
              defaultValue="0px"
            />
          </div>
        ) : (
          <UnitControl
            icon={<SideIcon label="R" />}
            value={getEffectiveValue(styles, "border-radius")}
            onChange={(v: string) => onStyleChange("border-radius", v)}
            placeholder="0"
            defaultValue="0px"
          />
        )}
      </div>
    </div>
  );
}
