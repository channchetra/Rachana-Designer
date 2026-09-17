

import { StyleInfo } from "@/types/editor";
import { UnitControl } from "../UnitControl";
import { LayoutPresets } from "./LayoutPresets";
import { GridBuilder } from "./GridBuilder";
import { useState, useRef, useEffect } from "react";
import {
  ChevronRightIcon,
  Link2Icon,
  LinkBreak2Icon,
  SquareIcon,
  ColumnsIcon,
  GridIcon,
  BoxIcon,
  MixIcon,
  TextIcon,
  EyeNoneIcon,
  ArrowRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignCenterHorizontallyIcon,
  AlignTopIcon,
  AlignBottomIcon,
  AlignCenterVerticallyIcon,
  SpaceBetweenHorizontallyIcon,
  SpaceBetweenVerticallyIcon,
  SpaceEvenlyHorizontallyIcon,
  SpaceEvenlyVerticallyIcon,
  StretchHorizontallyIcon,
  StretchVerticallyIcon,
  UnderlineIcon,
  DashIcon,
} from "@/components/ui/radixIconsCompat";
import { FieldLabel, SideIcon, getEffectiveValue, getExplicitValue } from "@/components/ui/panelPrimitives";

interface LayoutPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  onInjectLayoutCss: (path: string, css: string) => void;
}

/** Return the explicitly-authored value (ignoring computed/browser defaults). */

/** Browsers report "normal" for gap/column-gap/row-gap when unset — normalise it. */
function normalizeGap(v: string): string {
  if (!v || v === "normal") return "";
  return v;
}

// ============================================================
// Clean SVG-based alignment icons (22×22 with inner container visual)
// ============================================================

/** Shared wrapper: 22×22 rounded box that looks like a mini container */
function VizBox({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

// ============================================================
// Segmented button control for option groups
// ============================================================

interface SegmentOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

function SegmentedControl({
  options,
  value,
  onChange,
  fluid = false,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  fluid?: boolean;
}) {
  return (
    <div className={`flex rounded-md overflow-hidden border border-zinc-700/40 bg-zinc-800/30 ${fluid ? "w-full" : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.value || opt.title || opt.label}
          className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] transition-all ${fluid ? "flex-1" : ""} ${
            value === opt.value
              ? "bg-zinc-700/70 text-zinc-200 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
          }`}
        >
          {opt.icon || opt.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Visual flex box picker (like Greenshift's visual grids)
// ============================================================

interface FlexPickerOption {
  value: string;
  label: string;
  viz: React.ReactNode;
}

function FlexPicker({
  options,
  value,
  onChange,
}: {
  options: FlexPickerOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.value || opt.label}
          className={`flex items-center justify-center w-[26px] h-[26px] rounded-[4px] border transition-all ${
            value === opt.value
              ? "text-violet-400 border-violet-500/60 bg-violet-500/10"
              : "text-zinc-500 border-zinc-700/40 hover:text-zinc-300 hover:border-zinc-600/50 hover:bg-zinc-800/60"
          }`}
        >
          {opt.viz}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Preset dropdown for grid template values
// ============================================================

function PresetInput({
  label,
  value,
  onChange,
  presets,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets: { label: string; value: string }[];
  placeholder?: string;
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
          placeholder={placeholder || "auto"}
          className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors font-mono"
        />
        {showPresets && (
          <div className="absolute left-0 top-full mt-1 w-full max-h-48 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl z-50 overflow-y-auto">
            {presets.map((p) => (
              <button
                key={p.value}
                onMouseDown={(e) => { e.preventDefault(); onChange(p.value); setShowPresets(false); }}
                className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-zinc-800/60 transition-colors ${
                  value === p.value ? "text-violet-300" : "text-zinc-300"
                }`}
              >
                <span className="text-zinc-400">{p.label}</span>
                {p.label !== p.value && (
                  <span className="ml-1.5 text-[10px] text-zinc-600 font-mono">{p.value}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Flex Wrap SVG icons
// ============================================================

function makeWrapViz(wrap: string) {
  if (wrap === "nowrap") {
    return (
      <VizBox>
        <line x1={1} y1={5} x2={1} y2={17} stroke="currentColor" strokeWidth={1.2} opacity={0.25} strokeLinecap="round" />
        <line x1={21} y1={5} x2={21} y2={17} stroke="currentColor" strokeWidth={1.2} opacity={0.25} strokeLinecap="round" />
        <rect x={2.5} y={6} width={4} height={10} rx={1} fill="currentColor" opacity={0.85} />
        <rect x={7.5} y={6} width={4} height={10} rx={1} fill="currentColor" opacity={0.85} />
        <rect x={12.5} y={6} width={4} height={10} rx={1} fill="currentColor" opacity={0.85} />
        <rect x={17.5} y={6} width={4} height={10} rx={1} fill="currentColor" opacity={0.5} />
      </VizBox>
    );
  }

  const topY = wrap === "wrap-reverse" ? 12 : 2;
  const botY = wrap === "wrap-reverse" ? 2 : 12;
  return (
    <VizBox>
      <line x1={1} y1={5} x2={1} y2={17} stroke="currentColor" strokeWidth={1.2} opacity={0.25} strokeLinecap="round" />
      <line x1={21} y1={5} x2={21} y2={17} stroke="currentColor" strokeWidth={1.2} opacity={0.25} strokeLinecap="round" />
      {/* First row */}
      <rect x={3} y={topY} width={7} height={8} rx={1} fill="currentColor" opacity={0.85} />
      <rect x={11.5} y={topY} width={7} height={8} rx={1} fill="currentColor" opacity={0.85} />
      {/* Wrapped row */}
      <rect x={3} y={botY} width={7} height={8} rx={1} fill="currentColor" opacity={0.5} />
    </VizBox>
  );
}

// ============================================================
// Display option definitions
// ============================================================

const DISPLAY_OPTIONS: SegmentOption[] = [
  { value: "block", label: "Block", icon: <SquareIcon width={14} height={14} />, title: "Block" },
  { value: "flex", label: "Flex", icon: <ColumnsIcon width={14} height={14} />, title: "Flexbox" },
  { value: "grid", label: "Grid", icon: <GridIcon width={14} height={14} />, title: "CSS Grid" },
  { value: "inline-block", label: "IB", icon: <BoxIcon width={14} height={14} />, title: "Inline Block" },
  { value: "inline-flex", label: "IF", icon: <MixIcon width={14} height={14} />, title: "Inline Flex" },
  { value: "inline", label: "Inl", icon: <TextIcon width={14} height={14} />, title: "Inline" },
  { value: "none", label: "None", icon: <EyeNoneIcon width={14} height={14} />, title: "None (hidden)" },
];

// Grid template presets (inspired by the reference code)
const GRID_COLUMN_PRESETS = [
  { label: "2 Columns", value: "repeat(2, 1fr)" },
  { label: "3 Columns", value: "repeat(3, 1fr)" },
  { label: "4 Columns", value: "repeat(4, 1fr)" },
  { label: "5 Columns", value: "repeat(5, 1fr)" },
  { label: "Auto-fit 150px", value: "repeat(auto-fit, minmax(150px, 1fr))" },
  { label: "Auto-fit 250px", value: "repeat(auto-fit, minmax(250px, 1fr))" },
  { label: "Auto-fill 200px", value: "repeat(auto-fill, minmax(200px, 1fr))" },
  { label: "Sidebar Left", value: "240px 1fr" },
  { label: "Sidebar Right", value: "1fr 240px" },
  { label: "Holy Grail", value: "auto 1fr auto" },
  { label: "Max-content + 1fr", value: "max-content 1fr" },
  { label: "Min-content + 1fr", value: "min-content 1fr" },
  { label: "Masonry", value: "masonry" },
  { label: "Unset", value: "unset" },
];

const GRID_ROW_PRESETS = [
  { label: "Auto", value: "auto" },
  { label: "2 Rows", value: "repeat(2, 200px)" },
  { label: "3 Rows", value: "repeat(3, 1fr)" },
  { label: "Auto-fit", value: "repeat(auto-fit, minmax(150px, 1fr))" },
  { label: "Stretch center", value: "auto 1fr auto" },
  { label: "Minmax", value: "minmax(100px, 1fr)" },
  { label: "Masonry", value: "masonry" },
];

const GRID_AUTO_FLOW_PRESETS = [
  { label: "Row", value: "row" },
  { label: "Column", value: "column" },
  { label: "Row Dense", value: "row dense" },
  { label: "Column Dense", value: "column dense" },
];

// ============================================================
// Main Layout Panel
// ============================================================

export function LayoutPanel({ styles, onStyleChange, onInjectLayoutCss }: LayoutPanelProps) {
  const display = getEffectiveValue(styles, "display");
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid";
  const isFlexOrGrid = isFlex || isGrid;

  const flexDirection = getEffectiveValue(styles, "flex-direction") || "row";
  const isColumn = flexDirection === "column" || flexDirection === "column-reverse";

  // Gap link state — use explicit (authored) values for detection, normalise "normal"
  const explicitGap = normalizeGap(getExplicitValue(styles, "gap"));
  const explicitColGap = normalizeGap(getExplicitValue(styles, "column-gap"));
  const explicitRowGap = normalizeGap(getExplicitValue(styles, "row-gap"));

  const autoGapLinked = !(explicitColGap && explicitRowGap && explicitColGap !== explicitRowGap);
  const [gapLinkedOverride, setGapLinkedOverride] = useState<boolean | null>(null);
  const gapLinked = gapLinkedOverride ?? autoGapLinked;

  // Reset manual link/unlink when selection changes.
  useEffect(() => {
    setGapLinkedOverride(null);
  }, [styles.path]);

  // Always force unlink when explicit column/row gaps are mismatched.
  useEffect(() => {
    if (!autoGapLinked) {
      setGapLinkedOverride(null);
    }
  }, [autoGapLinked]);

  // Advanced child props toggle
  const [showChild, setShowChild] = useState(false);

  const handleGapChange = (v: string) => {
    onStyleChange("gap", v);
  };

  const handleColumnGapChange = (v: string) => {
    if (gapLinked) {
      onStyleChange("gap", v);
    } else {
      onStyleChange("column-gap", v);
    }
  };

  const handleRowGapChange = (v: string) => {
    if (gapLinked) {
      onStyleChange("gap", v);
    } else {
      onStyleChange("row-gap", v);
    }
  };

  const effectiveColGap = explicitColGap || explicitGap || "";
  const effectiveRowGap = explicitRowGap || explicitGap || "";

  // Justify content options — main axis: row→horizontal, column→vertical
  const S = 14;
  const justifyOptions: FlexPickerOption[] = [
    { value: "flex-start", label: "Start", viz: isColumn ? <AlignTopIcon width={S} height={S} /> : <AlignLeftIcon width={S} height={S} /> },
    { value: "flex-end", label: "End", viz: isColumn ? <AlignBottomIcon width={S} height={S} /> : <AlignRightIcon width={S} height={S} /> },
    { value: "center", label: "Center", viz: isColumn ? <AlignCenterVerticallyIcon width={S} height={S} /> : <AlignCenterHorizontallyIcon width={S} height={S} /> },
    { value: "space-between", label: "Between", viz: isColumn ? <SpaceBetweenVerticallyIcon width={S} height={S} /> : <SpaceBetweenHorizontallyIcon width={S} height={S} /> },
    { value: "space-around", label: "Around", viz: isColumn ? <SpaceEvenlyVerticallyIcon width={S} height={S} /> : <SpaceEvenlyHorizontallyIcon width={S} height={S} /> },
    { value: "space-evenly", label: "Evenly", viz: isColumn ? <StretchVerticallyIcon width={S} height={S} /> : <StretchHorizontallyIcon width={S} height={S} /> },
  ];

  // Align items options — cross axis: row→vertical, column→horizontal
  const alignOptions: FlexPickerOption[] = [
    { value: "stretch", label: "Stretch", viz: isColumn ? <StretchHorizontallyIcon width={S} height={S} /> : <StretchVerticallyIcon width={S} height={S} /> },
    { value: "flex-start", label: "Start", viz: isColumn ? <AlignLeftIcon width={S} height={S} /> : <AlignTopIcon width={S} height={S} /> },
    { value: "center", label: "Center", viz: isColumn ? <AlignCenterHorizontallyIcon width={S} height={S} /> : <AlignCenterVerticallyIcon width={S} height={S} /> },
    { value: "flex-end", label: "End", viz: isColumn ? <AlignRightIcon width={S} height={S} /> : <AlignBottomIcon width={S} height={S} /> },
    { value: "baseline", label: "Baseline", viz: <UnderlineIcon width={S} height={S} /> },
  ];

  // Align content options — cross axis: row→vertical, column→horizontal
  const alignContentOptions: FlexPickerOption[] = [
    { value: "flex-start", label: "Start", viz: isColumn ? <AlignLeftIcon width={S} height={S} /> : <AlignTopIcon width={S} height={S} /> },
    { value: "flex-end", label: "End", viz: isColumn ? <AlignRightIcon width={S} height={S} /> : <AlignBottomIcon width={S} height={S} /> },
    { value: "center", label: "Center", viz: isColumn ? <AlignCenterHorizontallyIcon width={S} height={S} /> : <AlignCenterVerticallyIcon width={S} height={S} /> },
    { value: "space-between", label: "Between", viz: isColumn ? <SpaceBetweenHorizontallyIcon width={S} height={S} /> : <SpaceBetweenVerticallyIcon width={S} height={S} /> },
    { value: "space-around", label: "Around", viz: isColumn ? <SpaceEvenlyHorizontallyIcon width={S} height={S} /> : <SpaceEvenlyVerticallyIcon width={S} height={S} /> },
    { value: "stretch", label: "Stretch", viz: isColumn ? <StretchHorizontallyIcon width={S} height={S} /> : <StretchVerticallyIcon width={S} height={S} /> },
  ];

  // Wrap options
  const wrapOptions: FlexPickerOption[] = [
    { value: "nowrap", label: "No Wrap", viz: makeWrapViz("nowrap") },
    { value: "wrap", label: "Wrap", viz: makeWrapViz("wrap") },
    { value: "wrap-reverse", label: "Wrap Reverse", viz: makeWrapViz("wrap-reverse") },
  ];

  // Grid align items — visual icon pickers (cross axis = vertical)
  const gridAlignOptions: FlexPickerOption[] = [
    { value: "", label: "auto", viz: <DashIcon width={S} height={S} /> },
    { value: "stretch", label: "stretch", viz: <StretchVerticallyIcon width={S} height={S} /> },
    { value: "start", label: "start", viz: <AlignTopIcon width={S} height={S} /> },
    { value: "center", label: "center", viz: <AlignCenterVerticallyIcon width={S} height={S} /> },
    { value: "end", label: "end", viz: <AlignBottomIcon width={S} height={S} /> },
  ];

  // Grid justify content — main axis = horizontal
  const gridJustifyOptions: FlexPickerOption[] = [
    { value: "", label: "auto", viz: <DashIcon width={S} height={S} /> },
    { value: "start", label: "start", viz: <AlignLeftIcon width={S} height={S} /> },
    { value: "center", label: "center", viz: <AlignCenterHorizontallyIcon width={S} height={S} /> },
    { value: "end", label: "end", viz: <AlignRightIcon width={S} height={S} /> },
    { value: "space-between", label: "space-between", viz: <SpaceBetweenHorizontallyIcon width={S} height={S} /> },
    { value: "space-around", label: "space-around", viz: <SpaceEvenlyHorizontallyIcon width={S} height={S} /> },
    { value: "space-evenly", label: "space-evenly", viz: <StretchHorizontallyIcon width={S} height={S} /> },
  ];

  return (
    <div className="space-y-3">
      {/* Display */}
      <div>
        <FieldLabel>Display</FieldLabel>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={display}
          onChange={(v) => onStyleChange("display", v)}
          fluid
        />
      </div>

      {/* ======== FLEXBOX CONTROLS ======== */}
      {isFlex && (
        <div className="space-y-3 pt-1 mt-1 border-t border-zinc-800/30">
          {/* Layout Presets */}
          <LayoutPresets
            styles={styles}
            onStyleChange={onStyleChange}
            onInjectLayoutCss={onInjectLayoutCss}
          />

          {/* Direction */}
          <div>
            <FieldLabel>Direction</FieldLabel>
            <SegmentedControl
              options={[
                { value: "row", label: "Row", icon: <ArrowRightIcon width={15} height={15} />, title: "Row" },
                { value: "column", label: "Column", icon: <ArrowDownIcon width={15} height={15} />, title: "Column" },
                { value: "row-reverse", label: "Row Rev", icon: <ArrowLeftIcon width={15} height={15} />, title: "Row Reverse" },
                { value: "column-reverse", label: "Col Rev", icon: <ArrowUpIcon width={15} height={15} />, title: "Column Reverse" },
              ]}
              value={flexDirection}
              onChange={(v) => onStyleChange("flex-direction", v)}
              fluid
            />
          </div>

          {/* Justify Content */}
          <div>
            <FieldLabel>Justify Content</FieldLabel>
            <FlexPicker
              options={justifyOptions}
              value={getEffectiveValue(styles, "justify-content")}
              onChange={(v) => onStyleChange("justify-content", v)}
            />
          </div>

          {/* Align Items */}
          <div>
            <FieldLabel>Align Items</FieldLabel>
            <FlexPicker
              options={alignOptions}
              value={getEffectiveValue(styles, "align-items")}
              onChange={(v) => onStyleChange("align-items", v)}
            />
          </div>

          {/* Align Content */}
          <div>
            <FieldLabel>Align Content</FieldLabel>
            <FlexPicker
              options={alignContentOptions}
              value={getEffectiveValue(styles, "align-content")}
              onChange={(v) => onStyleChange("align-content", v)}
            />
          </div>

          {/* Wrap */}
          <div>
            <FieldLabel>Wrap</FieldLabel>
            <FlexPicker
              options={wrapOptions}
              value={getEffectiveValue(styles, "flex-wrap") || "nowrap"}
              onChange={(v) => onStyleChange("flex-wrap", v)}
            />
          </div>
        </div>
      )}

      {/* ======== GRID CONTROLS ======== */}
      {isGrid && (
        <div className="space-y-3 pt-1 mt-1 border-t border-zinc-800/30">
          {/* Grid Builder */}
          <GridBuilder
            styles={styles}
            onStyleChange={onStyleChange}
            onInjectLayoutCss={onInjectLayoutCss}
          />

          {/* Grid Template Columns */}
          <PresetInput
            label="Grid Columns"
            value={getEffectiveValue(styles, "grid-template-columns")}
            onChange={(v) => onStyleChange("grid-template-columns", v)}
            presets={GRID_COLUMN_PRESETS}
            placeholder="e.g. repeat(3, 1fr)"
          />

          {/* Grid Template Rows */}
          <PresetInput
            label="Grid Rows"
            value={getEffectiveValue(styles, "grid-template-rows")}
            onChange={(v) => onStyleChange("grid-template-rows", v)}
            presets={GRID_ROW_PRESETS}
            placeholder="e.g. auto"
          />

          {/* Grid Auto Flow */}
          <PresetInput
            label="Auto Flow"
            value={getEffectiveValue(styles, "grid-auto-flow")}
            onChange={(v) => onStyleChange("grid-auto-flow", v)}
            presets={GRID_AUTO_FLOW_PRESETS}
            placeholder="row"
          />

          {/* Grid Align Items */}
          <div>
            <FieldLabel>Align Items</FieldLabel>
            <FlexPicker
              options={gridAlignOptions}
              value={getEffectiveValue(styles, "align-items")}
              onChange={(v) => onStyleChange("align-items", v)}
            />
          </div>

          {/* Grid Justify Content */}
          <div>
            <FieldLabel>Justify Content</FieldLabel>
            <FlexPicker
              options={gridJustifyOptions}
              value={getEffectiveValue(styles, "justify-content")}
              onChange={(v) => onStyleChange("justify-content", v)}
            />
          </div>
        </div>
      )}

      {/* ======== GAP (Flex + Grid) ======== */}
      {isFlexOrGrid && (
        <div className="pt-1 mt-1 border-t border-zinc-800/30">
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>Gap</FieldLabel>
            <button
              onClick={() => {
                const nextLinked = !gapLinked;
                setGapLinkedOverride(nextLinked);
                if (nextLinked) {
                  const unifiedGap = effectiveColGap || effectiveRowGap || "0px";
                  onStyleChange("gap", unifiedGap);
                }
              }}
              className={`flex items-center justify-center w-5 h-5 rounded transition-all ${
                gapLinked
                  ? "text-zinc-400 bg-zinc-700/60"
                  : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60"
              }`}
              title={gapLinked ? "Unlink column/row gap" : "Link column/row gap"}
            >
              {gapLinked ? <Link2Icon width={11} height={11} /> : <LinkBreak2Icon width={11} height={11} />}
            </button>
          </div>
          {gapLinked ? (
            <UnitControl
              icon={<SideIcon label="G" />}
              value={effectiveColGap}
              onChange={handleGapChange}
              defaultValue="0px"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <UnitControl
                icon={<SideIcon label="CG" />}
                value={effectiveColGap}
                onChange={handleColumnGapChange}
                defaultValue="0px"
              />
              <UnitControl
                icon={<SideIcon label="RG" />}
                value={effectiveRowGap}
                onChange={handleRowGapChange}
                defaultValue="0px"
              />
            </div>
          )}
        </div>
      )}

      {/* ======== CHILD PROPERTIES (Flex + Grid) ======== */}
      {isFlexOrGrid && (
        <div className="border-t border-zinc-800/30 pt-2">
          <button
            onClick={() => setShowChild(!showChild)}
            className="group flex w-full items-center gap-1.5 text-[10px] font-medium tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronRightIcon
              width={10}
              height={10}
              className={`text-zinc-600 transition-transform duration-200 ${showChild ? "rotate-90" : ""}`}
            />
            Child properties
          </button>

          {showChild && (
            <div className="space-y-3 mt-3">
              {/* Align Self */}
              <div>
                <FieldLabel>Align Self</FieldLabel>
                <SegmentedControl
                  options={[
                    { value: "", label: "Auto", title: "Auto" },
                    { value: "stretch", label: "Str", title: "Stretch" },
                    { value: "flex-start", label: "Start", title: "Start" },
                    { value: "center", label: "Ctr", title: "Center" },
                    { value: "flex-end", label: "End", title: "End" },
                  ]}
                  value={getEffectiveValue(styles, "align-self")}
                  onChange={(v) => onStyleChange("align-self", v)}
                  fluid
                />
              </div>

              {/* Justify Self */}
              <div>
                <FieldLabel>Justify Self</FieldLabel>
                <SegmentedControl
                  options={[
                    { value: "", label: "Auto", title: "Auto" },
                    { value: "stretch", label: "Str", title: "Stretch" },
                    { value: "start", label: "Start", title: "Start" },
                    { value: "center", label: "Ctr", title: "Center" },
                    { value: "end", label: "End", title: "End" },
                  ]}
                  value={getEffectiveValue(styles, "justify-self")}
                  onChange={(v) => onStyleChange("justify-self", v)}
                  fluid
                />
              </div>

              {/* Flex Grow / Shrink / Basis */}
              {isFlex && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <FieldLabel>Grow</FieldLabel>
                    <UnitControl
                      icon={<SideIcon label="G" />}
                      value={getEffectiveValue(styles, "flex-grow")}
                      onChange={(v) => onStyleChange("flex-grow", v)}
                      defaultValue="0"
                    />
                  </div>
                  <div>
                    <FieldLabel>Shrink</FieldLabel>
                    <UnitControl
                      icon={<SideIcon label="S" />}
                      value={getEffectiveValue(styles, "flex-shrink")}
                      onChange={(v) => onStyleChange("flex-shrink", v)}
                      defaultValue="1"
                    />
                  </div>
                  <div>
                    <FieldLabel>Basis</FieldLabel>
                    <UnitControl
                      icon={<SideIcon label="B" />}
                      value={getEffectiveValue(styles, "flex-basis")}
                      onChange={(v) => onStyleChange("flex-basis", v)}
                      defaultValue="auto"
                    />
                  </div>
                </div>
              )}

              {/* Order */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Order</FieldLabel>
                  <UnitControl
                    icon={<SideIcon label="O" />}
                    value={getEffectiveValue(styles, "order")}
                    onChange={(v) => onStyleChange("order", v)}
                    defaultValue="0"
                  />
                </div>
                {isGrid && (
                  <div>
                    <FieldLabel>Grid Column</FieldLabel>
                    <UnitControl
                      icon={<SideIcon label="C" />}
                      value={getEffectiveValue(styles, "grid-column")}
                      onChange={(v) => onStyleChange("grid-column", v)}
                      defaultValue="auto"
                    />
                  </div>
                )}
              </div>

              {/* Grid Row (grid only) */}
              {isGrid && (
                <div>
                  <FieldLabel>Grid Row</FieldLabel>
                  <UnitControl
                    icon={<SideIcon label="R" />}
                    value={getEffectiveValue(styles, "grid-row")}
                    onChange={(v) => onStyleChange("grid-row", v)}
                    defaultValue="auto"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
