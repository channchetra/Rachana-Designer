

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { useState } from "react";
import {
  ChevronRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ALargeSmall,
  MoveVertical,
  MoveHorizontal,
} from "lucide-react";
import { FieldLabel, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface TypographyPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
}

const FONT_FAMILY_OPTIONS = [
  "inherit",
  "Arial, sans-serif",
  "'Helvetica Neue', Helvetica, sans-serif",
  "Georgia, serif",
  "'Times New Roman', serif",
  "'Courier New', monospace",
  "system-ui, sans-serif",
  "Inter, sans-serif",
];

const FONT_WEIGHT_OPTIONS = [
  { value: "normal", label: "Default" },
  { value: "bold", label: "Bold" },
  { value: "100", label: "Thin (100)" },
  { value: "200", label: "Extra Light (200)" },
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "Semi Bold (600)" },
  { value: "700", label: "Bold (700)" },
  { value: "800", label: "Extra Bold (800)" },
  { value: "900", label: "Black (900)" },
];

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: React.ReactNode; title?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-zinc-800/60 rounded-md border border-zinc-700/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.title}
          className={`flex-1 flex items-center justify-center py-1 text-[10px] font-medium rounded transition-all ${
            value === opt.value
              ? "bg-zinc-600 text-zinc-200 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TypographyPanel({ styles, onStyleChange }: TypographyPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3">
      {/* Row 1: Size + Line Height */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Size</FieldLabel>
          <UnitControl
            value={getEffectiveValue(styles, "font-size")}
            onChange={(v: string) => onStyleChange("font-size", v)}
            icon={<ALargeSmall size={13} />}
            defaultValue="0px"
          />
        </div>
        <div>
          <FieldLabel>Line Height</FieldLabel>
          <UnitControl
            value={getEffectiveValue(styles, "line-height")}
            onChange={(v: string) => onStyleChange("line-height", v)}
            step={0.1}
            icon={<MoveVertical size={13} />}
            defaultValue="0"
          />
        </div>
      </div>

      {/* Row 2: Font Weight + Text Align */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Font Weight</FieldLabel>
          <select
            value={getEffectiveValue(styles, "font-weight")}
            onChange={(e) => onStyleChange("font-weight", e.target.value)}
            className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
          >
            {FONT_WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Align</FieldLabel>
          <SegmentedControl
            value={getEffectiveValue(styles, "text-align")}
            onChange={(v) => onStyleChange("text-align", v)}
            options={[
              { value: "left", label: <AlignLeft size={11} />, title: "Left" },
              { value: "center", label: <AlignCenter size={11} />, title: "Center" },
              { value: "right", label: <AlignRight size={11} />, title: "Right" },
              { value: "justify", label: <AlignJustify size={11} />, title: "Justify" },
            ]}
          />
        </div>
      </div>

      {/* Row 3: Decoration + Letter Case */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Decoration</FieldLabel>
          <SegmentedControl
            value={getEffectiveValue(styles, "text-decoration")}
            onChange={(v) => onStyleChange("text-decoration", v)}
            options={[
              { value: "none", label: "N", title: "None" },
              { value: "underline", label: <span className="underline">U</span>, title: "Underline" },
              { value: "line-through", label: <span className="line-through">S</span>, title: "Strikethrough" },
              { value: "overline", label: <span className="overline">O</span>, title: "Overline" },
            ]}
          />
        </div>
        <div>
          <FieldLabel>Letter Case</FieldLabel>
          <SegmentedControl
            value={getEffectiveValue(styles, "text-transform")}
            onChange={(v) => onStyleChange("text-transform", v)}
            options={[
              { value: "none", label: "-", title: "None" },
              { value: "lowercase", label: "aa", title: "Lowercase" },
              { value: "capitalize", label: "Aa", title: "Capitalize" },
              { value: "uppercase", label: "AA", title: "Uppercase" },
            ]}
          />
        </div>
      </div>

      {/* Advanced Typography Options (collapsible) */}
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
            {/* Letter Spacing */}
            <div>
              <FieldLabel>Letter Spacing</FieldLabel>
              <UnitControl
                value={getEffectiveValue(styles, "letter-spacing")}
                onChange={(v: string) => onStyleChange("letter-spacing", v)}
                step={0.1}
                icon={<MoveHorizontal size={13} />}
                defaultValue="0px"
              />
            </div>

            {/* Word Break + White Space */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Word Break</FieldLabel>
                <SegmentedControl
                  value={getEffectiveValue(styles, "word-break")}
                  onChange={(v) => onStyleChange("word-break", v)}
                  options={[
                    { value: "normal", label: "No", title: "Normal" },
                    { value: "break-all", label: "All", title: "Break All" },
                    { value: "break-word", label: "Word", title: "Break Word" },
                  ]}
                />
              </div>
              <div>
                <FieldLabel>White Space</FieldLabel>
                <SegmentedControl
                  value={getEffectiveValue(styles, "white-space")}
                  onChange={(v) => onStyleChange("white-space", v)}
                  options={[
                    { value: "normal", label: "Def", title: "Default" },
                    { value: "nowrap", label: "No", title: "No Wrap" },
                    { value: "pre", label: "Pre", title: "Pre" },
                  ]}
                />
              </div>
            </div>

            {/* Text Overflow + Font Style */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Text Overflow</FieldLabel>
                <SegmentedControl
                  value={getEffectiveValue(styles, "text-overflow")}
                  onChange={(v) => onStyleChange("text-overflow", v)}
                  options={[
                    { value: "clip", label: "Clip", title: "Clip" },
                    { value: "ellipsis", label: "...", title: "Ellipsis" },
                  ]}
                />
              </div>
              <div>
                <FieldLabel>Font Style</FieldLabel>
                <SegmentedControl
                  value={getEffectiveValue(styles, "font-style")}
                  onChange={(v) => onStyleChange("font-style", v)}
                  options={[
                    { value: "normal", label: "Def", title: "Normal" },
                    { value: "italic", label: <span className="italic">I</span>, title: "Italic" },
                    { value: "oblique", label: <span className="italic">O</span>, title: "Oblique" },
                  ]}
                />
              </div>
            </div>

            {/* Writing Mode */}
            <div>
              <FieldLabel>Writing Mode</FieldLabel>
              <SegmentedControl
                value={getEffectiveValue(styles, "writing-mode")}
                onChange={(v) => onStyleChange("writing-mode", v)}
                options={[
                  { value: "horizontal-tb", label: "Default", title: "Horizontal" },
                  { value: "vertical-lr", label: "LR", title: "Vertical Left to Right" },
                  { value: "vertical-rl", label: "RL", title: "Vertical Right to Left" },
                ]}
              />
            </div>

            {/* Text Shadow */}
            <div>
              <FieldLabel>Text Shadow</FieldLabel>
              <input
                type="text"
                value={getEffectiveValue(styles, "text-shadow")}
                onChange={(e) => onStyleChange("text-shadow", e.target.value)}
                placeholder="none"
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all"
              />
            </div>

            {/* Font Family */}
            <div>
              <FieldLabel>Font Family</FieldLabel>
              <select
                value={getEffectiveValue(styles, "font-family")}
                onChange={(e) => onStyleChange("font-family", e.target.value)}
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none truncate transition-all"
              >
                {FONT_FAMILY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.split(",")[0].replace(/'/g, "")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
