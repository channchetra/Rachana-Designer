import { useRef, useCallback, useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { TokenPicker } from "./TokenPicker";

interface UnitControlProps {
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  step?: number;
  placeholder?: string;
  defaultValue?: string; // e.g. "0px", "0deg", "1" — used to initialize on first drag/arrow
}

function parseNumericValue(val: string): { num: number; unit: string } | null {
  const match = val.match(/^(-?[\d.]+)\s*(%|px|em|rem|vh|vw|vmin|vmax|ch|ex|pt|cm|mm|in|pc|s|ms|deg|turn|rad)?$/);
  if (!match) return null;
  return { num: parseFloat(match[1]), unit: match[2] || "" };
}

function formatValue(num: number, unit: string): string {
  const rounded = Math.round(num * 100) / 100;
  return `${rounded}${unit}`;
}

export function UnitControl({
  value,
  onChange,
  icon,
  step = 1,
  placeholder = "0",
  defaultValue,
}: UnitControlProps) {
  const [localValue, setLocalValue] = useState(value);
  const [hovered, setHovered] = useState(false);
  const [showTokens, setShowTokens] = useState(false);

  const cssVariables = useEditorStore((s) => s.cssVariables);
  const createCssVariable = useEditorStore((s) => s.createCssVariable);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);

  const startYRef = useRef(0);
  const startValueRef = useRef(0);
  const unitRef = useRef("");
  const isDraggingRef = useRef(false);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      let parsed = parseNumericValue(value);
      if (!parsed) {
        if (!defaultValue) return;
        parsed = parseNumericValue(defaultValue);
        if (!parsed) return;
        const formatted = formatValue(parsed.num, parsed.unit);
        setLocalValue(formatted);
        onChange(formatted);
      }

      e.preventDefault();
      isDraggingRef.current = true;
      startYRef.current = e.clientY;
      startValueRef.current = parsed.num;
      unitRef.current = parsed.unit;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      const handleMove = (me: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startYRef.current - me.clientY;
        const multiplier = me.shiftKey ? 10 : me.altKey ? 0.1 : 1;
        const newVal = startValueRef.current + delta * step * multiplier;
        const formatted = formatValue(newVal, unitRef.current);
        setLocalValue(formatted);
        onChange(formatted);
      };

      const handleUp = () => {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [value, onChange, step, defaultValue]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value);
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        let parsed = parseNumericValue(localValue);
        if (!parsed) {
          if (!defaultValue) return;
          parsed = parseNumericValue(defaultValue);
          if (!parsed) return;
        }
        const dir = e.key === "ArrowUp" ? 1 : -1;
        const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
        const newVal = parsed.num + dir * step * multiplier;
        const formatted = formatValue(newVal, parsed.unit);
        setLocalValue(formatted);
        onChange(formatted);
      }
    },
    [localValue, onChange, step, defaultValue]
  );

  const handleTokenSelect = useCallback((varRef: string) => {
    onChange(varRef);
    setShowTokens(false);
  }, [onChange]);

  const isVar = value.startsWith("var(");

  return (
    <div
      ref={containerRef}
      className="relative group/unit"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center rounded-md bg-zinc-800/60 border border-zinc-700/40 overflow-hidden transition-all focus-within:border-zinc-500 focus-within:bg-zinc-800">
        {/* Draggable icon area */}
        <div
          onMouseDown={handleMouseDown}
          className={`flex items-center justify-center w-7 h-7 shrink-0 border-r border-zinc-700/30 bg-zinc-800/40 transition-colors select-none ${
            isVar ? "text-zinc-500" : "cursor-ns-resize text-zinc-500 hover:text-zinc-300"
          }`}
          title={isVar ? undefined : "Drag to adjust value"}
        >
          {icon}
        </div>
        {/* Value input — shows full value with unit, like Typography */}
        <input
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { isFocusedRef.current = true; }}
          onBlur={() => { isFocusedRef.current = false; setLocalValue(value); }}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none min-w-0"
        />
      </div>

      {/* Token picker trigger — shows on hover */}
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

      {/* Token picker popover */}
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
