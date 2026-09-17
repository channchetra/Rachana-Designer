import { useState, useRef, useEffect, useCallback } from "react";
import { StyleInfo } from "@/types/editor";
import {
  Monitor,
  Tablet,
  Smartphone,
  LayoutGrid,
  X,
  GripVertical,
} from "lucide-react";
import { getEffectiveValue } from "@/components/ui/panelPrimitives";

// ============================================================
// Column Presets (from WordPress plugin)
// ============================================================

interface WidthPreset {
  name: string;
  widths: number[];
}

interface ColumnPreset {
  columns: number;
  desktopPresets: WidthPreset[];
  tabletPresets: WidthPreset[];
  mobilePresets: WidthPreset[];
}

const columnPresets: ColumnPreset[] = [
  {
    columns: 2,
    desktopPresets: [
      { name: "50/50", widths: [50, 50] },
      { name: "33/67", widths: [33.33, 66.67] },
      { name: "67/33", widths: [66.67, 33.33] },
      { name: "25/75", widths: [25, 75] },
      { name: "75/25", widths: [75, 25] },
      { name: "40/60", widths: [40, 60] },
      { name: "60/40", widths: [60, 40] },
    ],
    tabletPresets: [
      { name: "50/50", widths: [50, 50] },
      { name: "100/100", widths: [100, 100] },
      { name: "33/67", widths: [33.33, 66.67] },
      { name: "67/33", widths: [66.67, 33.33] },
    ],
    mobilePresets: [
      { name: "100/100", widths: [100, 100] },
      { name: "50/50", widths: [50, 50] },
    ],
  },
  {
    columns: 3,
    desktopPresets: [
      { name: "33/33/33", widths: [33.33, 33.33, 33.34] },
      { name: "25/50/25", widths: [25, 50, 25] },
      { name: "50/25/25", widths: [50, 25, 25] },
      { name: "25/25/50", widths: [25, 25, 50] },
      { name: "20/60/20", widths: [20, 60, 20] },
    ],
    tabletPresets: [
      { name: "33/33/33", widths: [33.33, 33.33, 33.34] },
      { name: "50/50/100", widths: [50, 50, 100] },
      { name: "100/100/100", widths: [100, 100, 100] },
    ],
    mobilePresets: [
      { name: "100/100/100", widths: [100, 100, 100] },
      { name: "50/50/100", widths: [50, 50, 100] },
    ],
  },
  {
    columns: 4,
    desktopPresets: [
      { name: "25/25/25/25", widths: [25, 25, 25, 25] },
      { name: "40/20/20/20", widths: [40, 20, 20, 20] },
      { name: "20/40/20/20", widths: [20, 40, 20, 20] },
      { name: "20/20/40/20", widths: [20, 20, 40, 20] },
      { name: "20/20/20/40", widths: [20, 20, 20, 40] },
    ],
    tabletPresets: [
      { name: "50/50/50/50", widths: [50, 50, 50, 50] },
      { name: "100/100/100/100", widths: [100, 100, 100, 100] },
      { name: "25/25/25/25", widths: [25, 25, 25, 25] },
    ],
    mobilePresets: [
      { name: "100/100/100/100", widths: [100, 100, 100, 100] },
      { name: "50/50/50/50", widths: [50, 50, 50, 50] },
    ],
  },
  {
    columns: 5,
    desktopPresets: [
      { name: "20/20/20/20/20", widths: [20, 20, 20, 20, 20] },
      { name: "30/20/15/15/20", widths: [30, 20, 15, 15, 20] },
      { name: "15/15/40/15/15", widths: [15, 15, 40, 15, 15] },
    ],
    tabletPresets: [
      { name: "33/33/33/50/50", widths: [33.33, 33.33, 33.34, 50, 50] },
      { name: "100×5", widths: [100, 100, 100, 100, 100] },
    ],
    mobilePresets: [
      { name: "100×5", widths: [100, 100, 100, 100, 100] },
    ],
  },
  {
    columns: 6,
    desktopPresets: [
      { name: "16×6", widths: [16.67, 16.67, 16.67, 16.67, 16.67, 16.65] },
      { name: "25/15/15/15/15/15", widths: [25, 15, 15, 15, 15, 15] },
    ],
    tabletPresets: [
      { name: "33×6", widths: [33.33, 33.33, 33.34, 33.33, 33.33, 33.34] },
      { name: "100×6", widths: [100, 100, 100, 100, 100, 100] },
    ],
    mobilePresets: [
      { name: "100×6", widths: [100, 100, 100, 100, 100, 100] },
    ],
  },
];

// ============================================================
// Types
// ============================================================

type DeviceTab = "desktop" | "tablet" | "mobile";

interface LayoutPresetsState {
  columns: number | null;
  desktop: WidthPreset | null;
  tablet: WidthPreset | null;
  mobile: WidthPreset | null;
}

interface LayoutPresetsProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  onInjectLayoutCss: (path: string, css: string) => void;
}

// ============================================================
// Helpers
// ============================================================

function calculateWidth(width: number, gap: string, columns: number): string {
  if (width === 100) return "100%";
  if (!gap || gap === "0px" || gap === "0" || gap === "normal") return `${width}%`;
  return `calc(${width}% - (${gap} * ${columns - 1} / ${columns}))`;
}

function buildLayoutCss(
  state: LayoutPresetsState,
  gap: string
): string {
  if (!state.columns || !state.desktop) return "";

  const n = state.columns;
  let css = "";

  // Desktop widths
  for (let i = 1; i <= n; i++) {
    const w = state.desktop.widths[i - 1];
    css += `{SELECTOR} > *:nth-child(${n}n+${i}) { width: ${calculateWidth(w, gap, n)}; }\n`;
  }

  // Tablet widths
  if (state.tablet) {
    css += `@media (max-width: 768px) {\n`;
    for (let i = 1; i <= n; i++) {
      const w = state.tablet.widths[i - 1];
      css += `  {SELECTOR} > *:nth-child(${n}n+${i}) { width: ${calculateWidth(w, "0px", n)}; }\n`;
    }
    css += `}\n`;
  }

  // Mobile widths
  if (state.mobile) {
    css += `@media (max-width: 480px) {\n`;
    for (let i = 1; i <= n; i++) {
      const w = state.mobile.widths[i - 1];
      css += `  {SELECTOR} > *:nth-child(${n}n+${i}) { width: ${calculateWidth(w, "0px", n)}; }\n`;
    }
    css += `}\n`;
  }

  return css;
}

// ============================================================
// Visual Preset Option
// ============================================================

function LayoutOption({
  widths,
  onClick,
  isSelected,
  compact,
}: {
  widths: number[];
  onClick: () => void;
  isSelected: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[4px] border p-[3px] transition-all w-full ${
        isSelected
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-zinc-700/40 hover:border-zinc-600/50 hover:bg-zinc-800/60"
      }`}
    >
      <div className="flex flex-wrap">
        {widths.map((w, i) => (
          <div
            key={i}
            style={{ width: `${w}%` }}
            className={`${compact ? "h-[16px]" : "h-[22px]"} box-border border border-violet-400/30 bg-violet-500/15 rounded-[2px]`}
          />
        ))}
      </div>
    </button>
  );
}

// ============================================================
// Drag-to-Resize Column Preview
// ============================================================

function ColumnResizer({
  widths,
  onWidthsChange,
  snapEnabled,
}: {
  widths: number[];
  onWidthsChange: (w: number[]) => void;
  snapEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    if (dragging === null) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let pos = ((e.clientX - rect.left) / rect.width) * 100;
      if (snapEnabled) pos = Math.round(pos / 5) * 5;

      const newWidths = [...widths];
      const leftSum = newWidths.slice(0, dragging).reduce((s, v) => s + v, 0);
      const rightSum = newWidths.slice(dragging + 2).reduce((s, v) => s + v, 0);
      const available = 100 - leftSum - rightSum;

      const newLeft = Math.max(5, Math.min(available - 5, pos - leftSum));
      const newRight = available - newLeft;

      newWidths[dragging] = parseFloat(newLeft.toFixed(2));
      newWidths[dragging + 1] = parseFloat(newRight.toFixed(2));
      onWidthsChange(newWidths);
    };

    const handleUp = () => setDragging(null);

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, widths, onWidthsChange, snapEnabled]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[48px] rounded-md border border-zinc-700/50 bg-zinc-900/50 overflow-hidden"
    >
      {widths.map((w, i) => (
        <div
          key={i}
          style={{ width: `${w}%` }}
          className="relative flex items-center justify-center bg-violet-500/10 border-r border-violet-400/20 last:border-r-0"
        >
          <span className="text-[9px] font-mono text-violet-300/70 select-none">
            {w.toFixed(1)}%
          </span>
          {i < widths.length - 1 && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setDragging(i);
              }}
              className="absolute right-[-5px] top-0 w-[10px] h-full cursor-col-resize z-10 flex items-center justify-center group"
            >
              <div className="w-[2px] h-3/5 rounded bg-zinc-500/40 group-hover:bg-violet-400/60 transition-colors" />
            </div>
          )}
        </div>
      ))}
      {/* Snap ticks */}
      {snapEnabled &&
        Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((tick) => (
          <div
            key={tick}
            className="absolute bottom-0 w-px h-[6px] bg-zinc-600/30"
            style={{ left: `${tick}%` }}
          />
        ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function LayoutPresets({ styles, onStyleChange, onInjectLayoutCss }: LayoutPresetsProps) {
  const [state, setState] = useState<LayoutPresetsState>({
    columns: null,
    desktop: null,
    tablet: null,
    mobile: null,
  });
  const [activeTab, setActiveTab] = useState<DeviceTab>("desktop");
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Reset when element changes
  useEffect(() => {
    setState({ columns: null, desktop: null, tablet: null, mobile: null });
    setShowPresets(false);
  }, [styles.path]);

  const gap = getEffectiveValue(styles, "column-gap") || getEffectiveValue(styles, "gap") || "0px";

  const applyPreset = useCallback(
    (newState: LayoutPresetsState) => {
      setState(newState);
      // Set parent to flex + wrap
      onStyleChange("display", "flex");
      onStyleChange("flex-wrap", "wrap");
      // Inject child CSS
      const css = buildLayoutCss(newState, gap);
      onInjectLayoutCss(styles.path, css);
    },
    [onStyleChange, onInjectLayoutCss, styles.path, gap]
  );

  const handleColumnSelect = (preset: ColumnPreset) => {
    const defaults: LayoutPresetsState = {
      columns: preset.columns,
      desktop: preset.desktopPresets[0],
      tablet: preset.tabletPresets[0],
      mobile: preset.mobilePresets[0],
    };
    applyPreset(defaults);
    setActiveTab("desktop");
  };

  const handleWidthPresetSelect = (preset: WidthPreset) => {
    const updated = { ...state, [activeTab]: preset };
    applyPreset(updated);
  };

  const handleCustomWidthsChange = (newWidths: number[]) => {
    if (!state[activeTab]) return;
    const updated = {
      ...state,
      [activeTab]: { ...state[activeTab]!, widths: newWidths },
    };
    applyPreset(updated);
  };

  const handleClear = () => {
    setState({ columns: null, desktop: null, tablet: null, mobile: null });
    // Remove the layout style tag (child width rules)
    onInjectLayoutCss(styles.path, "");
    // Remove flex-wrap that was set when enabling
    onStyleChange("flex-wrap", "");
  };

  const isActive = state.columns !== null;
  const selectedColumnPreset = state.columns
    ? columnPresets.find((p) => p.columns === state.columns)
    : null;

  const tabPresets = selectedColumnPreset
    ? activeTab === "desktop"
      ? selectedColumnPreset.desktopPresets
      : activeTab === "tablet"
      ? selectedColumnPreset.tabletPresets
      : selectedColumnPreset.mobilePresets
    : [];

  return (
    <div className="space-y-2">
      {/* Quick column selector (when active) */}
      {isActive && (
        <div className="flex gap-1">
          {columnPresets.map((preset) => (
            <LayoutOption
              key={preset.columns}
              widths={preset.desktopPresets[0].widths}
              onClick={() => handleColumnSelect(preset)}
              isSelected={state.columns === preset.columns}
              compact
            />
          ))}
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setShowPresets(!showPresets)}
        className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md text-[10px] font-medium transition-all border ${
          isActive
            ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
            : "border-zinc-700/40 bg-zinc-800/30 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600/50"
        }`}
      >
        <LayoutGrid className="w-3 h-3" />
        {isActive ? "Layout Presets Enabled" : "Enable Layout Presets"}
        {isActive && (
          <X
            className="w-3 h-3 ml-1 text-zinc-500 hover:text-zinc-300"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        )}
      </button>

      {/* Presets Panel */}
      {showPresets && (
        <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/50 p-2 space-y-2">
          {!selectedColumnPreset ? (
            /* Step 1: Choose column count */
            <div className="grid grid-cols-3 gap-1.5">
              {columnPresets.map((preset) => (
                <LayoutOption
                  key={preset.columns}
                  widths={preset.desktopPresets[0].widths}
                  onClick={() => handleColumnSelect(preset)}
                  isSelected={false}
                />
              ))}
            </div>
          ) : (
            /* Step 2: Device tabs + width presets */
            <>
              {/* Device tabs */}
              <div className="flex rounded-md overflow-hidden border border-zinc-700/40 bg-zinc-800/30">
                {(["desktop", "tablet", "mobile"] as DeviceTab[]).map((tab) => {
                  const Icon = tab === "desktop" ? Monitor : tab === "tablet" ? Tablet : Smartphone;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] transition-all ${
                        activeTab === tab
                          ? "bg-zinc-700/70 text-zinc-200"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  );
                })}
              </div>

              {/* Preset grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {tabPresets.map((preset, i) => (
                  <LayoutOption
                    key={i}
                    widths={preset.widths}
                    onClick={() => handleWidthPresetSelect(preset)}
                    isSelected={state[activeTab]?.name === preset.name}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Column Resizer (drag to adjust) */}
      {isActive && state[activeTab] && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-wide">
              Drag to resize
            </span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnapEnabled(e.target.checked)}
                className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 accent-violet-500"
              />
              <span className="text-[9px] text-zinc-500">Snap</span>
            </label>
          </div>
          <ColumnResizer
            widths={state[activeTab]!.widths}
            onWidthsChange={handleCustomWidthsChange}
            snapEnabled={snapEnabled}
          />
        </div>
      )}
    </div>
  );
}
