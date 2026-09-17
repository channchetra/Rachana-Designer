import { useState, useRef, useEffect, useCallback } from "react";
import { StyleInfo } from "@/types/editor";
import {
  Grid3X3,
  X,
  Plus,
  Minus,
  Monitor,
  Tablet,
  Smartphone,
  GripVertical,
  Maximize2,
} from "lucide-react";
import { getEffectiveValue } from "@/components/ui/panelPrimitives";

// ============================================================
// Types
// ============================================================

interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DeviceLayout {
  layouts: GridItem[];
  cols: number;
}

interface GridLayouts {
  desktop: DeviceLayout;
  tablet: DeviceLayout;
  mobile: DeviceLayout;
}

type DeviceTab = "desktop" | "tablet" | "mobile";

interface GridBuilderProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  onInjectLayoutCss: (path: string, css: string) => void;
}

// ============================================================
// Helpers
// ============================================================

const DEFAULT_LAYOUTS: GridLayouts = {
  desktop: { layouts: [], cols: 4 },
  tablet: { layouts: [], cols: 2 },
  mobile: { layouts: [], cols: 1 },
};

function createDefaultItems(count: number, cols: number): GridItem[] {
  const items: GridItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      i: i.toString(),
      x: i % cols,
      y: Math.floor(i / cols),
      w: 1,
      h: 1,
    });
  }
  return items;
}

function buildGridCss(layouts: GridLayouts): string {
  let css = "";

  // Desktop (default)
  const desktop = layouts.desktop;
  if (desktop.layouts.length > 0) {
    css += `{SELECTOR} { display: grid; grid-template-columns: repeat(${desktop.cols}, 1fr); }\n`;
    desktop.layouts.forEach((item, idx) => {
      css += `{SELECTOR} > *:nth-child(${idx + 1}) { grid-area: ${item.y + 1} / ${item.x + 1} / span ${item.h} / span ${item.w}; }\n`;
    });
  }

  // Tablet
  const tablet = layouts.tablet;
  if (tablet.layouts.length > 0) {
    css += `@media (max-width: 768px) {\n`;
    css += `  {SELECTOR} { grid-template-columns: repeat(${tablet.cols}, 1fr); }\n`;
    tablet.layouts.forEach((item, idx) => {
      css += `  {SELECTOR} > *:nth-child(${idx + 1}) { grid-area: ${item.y + 1} / ${item.x + 1} / span ${item.h} / span ${item.w}; }\n`;
    });
    css += `}\n`;
  }

  // Mobile
  const mobile = layouts.mobile;
  if (mobile.layouts.length > 0) {
    css += `@media (max-width: 480px) {\n`;
    css += `  {SELECTOR} { grid-template-columns: repeat(${mobile.cols}, 1fr); }\n`;
    mobile.layouts.forEach((item, idx) => {
      css += `  {SELECTOR} > *:nth-child(${idx + 1}) { grid-area: ${item.y + 1} / ${item.x + 1} / span ${item.h} / span ${item.w}; }\n`;
    });
    css += `}\n`;
  }

  return css;
}

/** Compact items vertically: push all items up so no empty rows remain. */
function compactLayout(items: GridItem[], cols: number): GridItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const occupied: boolean[][] = [];

  function isOccupied(x: number, y: number, w: number, h: number, excludeIdx: number): boolean {
    for (let iy = y; iy < y + h; iy++) {
      for (let ix = x; ix < x + w; ix++) {
        if (occupied[iy] && occupied[iy][ix]) return true;
      }
    }
    return false;
  }

  function markOccupied(x: number, y: number, w: number, h: number) {
    for (let iy = y; iy < y + h; iy++) {
      if (!occupied[iy]) occupied[iy] = [];
      for (let ix = x; ix < x + w; ix++) {
        occupied[iy][ix] = true;
      }
    }
  }

  return sorted.map((item) => {
    // Try to place the item as high as possible
    let bestY = 0;
    while (isOccupied(item.x, bestY, item.w, item.h, -1)) {
      bestY++;
      if (bestY > 100) break; // safety
    }
    const compacted = { ...item, y: bestY };
    markOccupied(compacted.x, compacted.y, compacted.w, compacted.h);
    return compacted;
  });
}

// ============================================================
// Interactive Grid Canvas
// ============================================================

const CELL_GAP = 2;

function GridCanvas({
  layout,
  cols,
  onLayoutChange,
}: {
  layout: GridItem[];
  cols: number;
  onLayoutChange: (items: GridItem[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragState, setDragState] = useState<{
    itemIdx: number;
    type: "move" | "resize";
    startX: number;
    startY: number;
    origItem: GridItem;
  } | null>(null);
  const [hoverItem, setHoverItem] = useState<number | null>(null);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Compute cell size from available width
  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - (cols - 1) * CELL_GAP) / cols)
    : 24;

  // Calculate grid dimensions
  const maxRow = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const rows = Math.max(maxRow + 1, 2); // At least 2 rows visible
  const gridHeight = rows * (cellSize + CELL_GAP) - CELL_GAP;

  // Convert grid coordinates to pixel position
  const toPixel = (gridPos: number) => gridPos * (cellSize + CELL_GAP);
  // Convert pixel position to grid coordinate
  const toGrid = (px: number) => Math.round(px / (cellSize + CELL_GAP));

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      const newItems = [...layout];
      const item = { ...dragState.origItem };

      if (dragState.type === "move") {
        const gridDx = toGrid(dx);
        const gridDy = toGrid(dy);
        item.x = Math.max(0, Math.min(cols - item.w, item.x + gridDx));
        item.y = Math.max(0, item.y + gridDy);
      } else {
        // resize
        const gridDx = toGrid(dx);
        const gridDy = toGrid(dy);
        item.w = Math.max(1, Math.min(cols - item.x, item.w + gridDx));
        item.h = Math.max(1, item.h + gridDy);
      }

      newItems[dragState.itemIdx] = item;
      onLayoutChange(newItems);
    };

    const handleUp = () => {
      setDragState(null);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, layout, cols, onLayoutChange, cellSize]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden"
      style={{ minHeight: gridHeight }}
    >
      {/* Grid background lines */}
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((_, col) => (
          <div
            key={`bg-${row}-${col}`}
            className="absolute rounded-[3px] bg-zinc-800/40 border border-zinc-700/20"
            style={{
              left: toPixel(col),
              top: toPixel(row),
              width: cellSize,
              height: cellSize,
            }}
          />
        ))
      )}

      {/* Grid items */}
      {layout.map((item, idx) => {
        const left = toPixel(item.x);
        const top = toPixel(item.y);
        const width = item.w * (cellSize + CELL_GAP) - CELL_GAP;
        const height = item.h * (cellSize + CELL_GAP) - CELL_GAP;

        return (
          <div
            key={item.i}
            className={`absolute rounded-[4px] flex items-center justify-center select-none transition-shadow ${
              dragState?.itemIdx === idx
                ? "bg-violet-500/30 border-violet-400/70 border shadow-lg shadow-violet-500/10 z-20"
                : hoverItem === idx
                ? "bg-violet-500/20 border-violet-400/50 border z-10"
                : "bg-violet-500/15 border-violet-400/30 border"
            }`}
            style={{ left, top, width, height, cursor: "grab" }}
            onMouseEnter={() => setHoverItem(idx)}
            onMouseLeave={() => setHoverItem(null)}
            onMouseDown={(e) => {
              e.preventDefault();
              setDragState({
                itemIdx: idx,
                type: "move",
                startX: e.clientX,
                startY: e.clientY,
                origItem: { ...item },
              });
            }}
          >
            <span className="text-[8px] font-bold text-violet-300/70 pointer-events-none">
              {parseInt(item.i) + 1}
            </span>

            {/* Resize handle (bottom-right corner) */}
            <div
              className="absolute bottom-0 right-0 w-2.5 h-2.5 cursor-se-resize flex items-end justify-end"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragState({
                  itemIdx: idx,
                  type: "resize",
                  startX: e.clientX,
                  startY: e.clientY,
                  origItem: { ...item },
                });
              }}
            >
              <svg width="5" height="5" viewBox="0 0 5 5" className="text-violet-400/50">
                <path d="M4 1v3H1" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main GridBuilder Component
// ============================================================

export function GridBuilder({ styles, onStyleChange, onInjectLayoutCss }: GridBuilderProps) {
  const [enabled, setEnabled] = useState(false);
  const [layouts, setLayouts] = useState<GridLayouts>(JSON.parse(JSON.stringify(DEFAULT_LAYOUTS)));
  const [activeTab, setActiveTab] = useState<DeviceTab>("desktop");
  const [itemCount, setItemCount] = useState(4);
  const [showPanel, setShowPanel] = useState(false);

  // Reset when element changes
  useEffect(() => {
    setEnabled(false);
    setShowPanel(false);
    setLayouts(JSON.parse(JSON.stringify(DEFAULT_LAYOUTS)));
    setItemCount(4);
  }, [styles.path]);

  const currentDevice = layouts[activeTab];

  const applyLayout = useCallback(
    (newLayouts: GridLayouts) => {
      setLayouts(newLayouts);
      const css = buildGridCss(newLayouts);
      onInjectLayoutCss(styles.path, css);
    },
    [onInjectLayoutCss, styles.path]
  );

  const handleEnable = () => {
    setEnabled(true);
    setShowPanel(true);
    // Create default layout
    const count = itemCount;
    const newLayouts: GridLayouts = {
      desktop: { layouts: createDefaultItems(count, 4), cols: 4 },
      tablet: { layouts: createDefaultItems(count, 2), cols: 2 },
      mobile: { layouts: createDefaultItems(count, 1), cols: 1 },
    };
    setLayouts(newLayouts);
    // Set display:grid on the element
    onStyleChange("display", "grid");
    // Inject layout CSS
    const css = buildGridCss(newLayouts);
    onInjectLayoutCss(styles.path, css);
  };

  const handleDisable = () => {
    setEnabled(false);
    setShowPanel(false);
    setLayouts(JSON.parse(JSON.stringify(DEFAULT_LAYOUTS)));
    // Remove the injected layout CSS
    onInjectLayoutCss(styles.path, "");
    // Clean up grid-related inline styles
    onStyleChange("grid-template-columns", "");
    onStyleChange("grid-template-rows", "");
    onStyleChange("grid-auto-flow", "");
  };

  const handleItemCountChange = (newCount: number) => {
    if (newCount < 1 || newCount > 24) return;
    setItemCount(newCount);

    const newLayouts = { ...layouts };
    for (const device of ["desktop", "tablet", "mobile"] as DeviceTab[]) {
      const deviceLayout = { ...newLayouts[device] };
      const existing = deviceLayout.layouts;
      const cols = deviceLayout.cols;

      if (newCount > existing.length) {
        // Add new items
        const added: GridItem[] = [];
        let lastItem = existing[existing.length - 1] || { x: -1, y: 0, w: 1, h: 1 };
        for (let i = existing.length; i < newCount; i++) {
          const x = (lastItem.x + 1) % cols;
          const y = x === 0 ? lastItem.y + 1 : lastItem.y;
          const item: GridItem = { i: i.toString(), x, y, w: 1, h: 1 };
          added.push(item);
          lastItem = item;
        }
        deviceLayout.layouts = [...existing, ...added];
      } else {
        deviceLayout.layouts = existing.slice(0, newCount);
      }
      newLayouts[device] = deviceLayout;
    }

    applyLayout(newLayouts);
  };

  const handleColsChange = (newCols: number, device: DeviceTab) => {
    if (newCols < 1 || newCols > 12) return;
    const newLayouts = { ...layouts };
    const deviceLayout = { ...newLayouts[device] };
    deviceLayout.cols = newCols;
    // Refit items that exceed column bounds
    deviceLayout.layouts = deviceLayout.layouts.map((item) => ({
      ...item,
      x: Math.min(item.x, newCols - 1),
      w: Math.min(item.w, newCols - item.x),
    }));
    deviceLayout.layouts = compactLayout(deviceLayout.layouts, newCols);
    newLayouts[device] = deviceLayout;
    applyLayout(newLayouts);
  };

  const handleLayoutChange = (newItems: GridItem[]) => {
    const newLayouts = { ...layouts };
    newLayouts[activeTab] = { ...newLayouts[activeTab], layouts: newItems };
    applyLayout(newLayouts);
  };

  return (
    <div className="space-y-2">
      {/* Toggle Button */}
      <button
        onClick={() => {
          if (enabled) {
            setShowPanel(!showPanel);
          } else {
            handleEnable();
          }
        }}
        className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md text-[10px] font-medium transition-all border ${
          enabled
            ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
            : "border-zinc-700/40 bg-zinc-800/30 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600/50"
        }`}
      >
        <Grid3X3 className="w-3 h-3" />
        {enabled ? "Grid Builder Enabled" : "Enable Grid Builder"}
        {enabled && (
          <X
            className="w-3 h-3 ml-1 text-zinc-500 hover:text-zinc-300"
            onClick={(e) => {
              e.stopPropagation();
              handleDisable();
            }}
          />
        )}
      </button>

      {/* Builder Panel */}
      {enabled && showPanel && (
        <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/50 p-2 space-y-3">
          {/* Item Count */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Items
              </label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleItemCountChange(itemCount - 1)}
                  className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600/50 transition-all"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <span className="text-[11px] font-mono text-zinc-300 w-5 text-center">{itemCount}</span>
                <button
                  onClick={() => handleItemCountChange(itemCount + 1)}
                  className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600/50 transition-all"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Device Tabs */}
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

          {/* Columns Control */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
              Columns
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleColsChange(currentDevice.cols - 1, activeTab)}
                className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600/50 transition-all"
              >
                <Minus className="w-2.5 h-2.5" />
              </button>
              <span className="text-[11px] font-mono text-zinc-300 w-5 text-center">{currentDevice.cols}</span>
              <button
                onClick={() => handleColsChange(currentDevice.cols + 1, activeTab)}
                className="w-5 h-5 rounded flex items-center justify-center bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600/50 transition-all"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          {/* Interactive Grid Canvas */}
          <div>
            <label className="text-[9px] font-medium text-zinc-500 uppercase tracking-wide mb-1 block">
              Drag to move · Corner to resize
            </label>
            <GridCanvas
              layout={currentDevice.layouts}
              cols={currentDevice.cols}
              onLayoutChange={handleLayoutChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
