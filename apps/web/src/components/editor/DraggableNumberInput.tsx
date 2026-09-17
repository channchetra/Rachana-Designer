import { useRef, useCallback, useState, useEffect } from "react";

interface DraggableNumberInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  labelWidth?: string;
  compact?: boolean;
  step?: number;
  icon?: React.ReactNode;
  defaultValue?: string; // e.g. "0px", "1" — used to initialize on first drag/arrow
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

export function DraggableNumberInput({
  value,
  onChange,
  placeholder,
  label,
  labelWidth,
  compact = false,
  step = 1,
  icon,
  defaultValue,
}: DraggableNumberInputProps) {
  const startYRef = useRef(0);
  const startValueRef = useRef(0);
  const unitRef = useRef("");
  const isDraggingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
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

  if (compact) {
    return (
      <input
        type="text"
        value={localValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "0"}
        className="w-12 rounded-md bg-zinc-800/60 border border-zinc-700/40 px-1 py-0.5 text-[10px] text-center text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:bg-zinc-800 focus:outline-none transition-all"
      />
    );
  }

  // Icon mode: icon inside input on left, draggable
  if (icon) {
    return (
      <div className="flex w-full max-w-full min-w-0 items-center rounded-md bg-zinc-800/60 border border-zinc-700/40 overflow-hidden transition-all focus-within:border-zinc-500 focus-within:bg-zinc-800">
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-center w-7 h-7 shrink-0 cursor-ns-resize text-zinc-500 hover:text-zinc-300 border-r border-zinc-700/30 bg-zinc-800/40 transition-colors select-none"
          title="Drag to adjust value"
        >
          {icon}
        </div>
        <input
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "auto"}
          className="w-0 min-w-0 flex-1 bg-transparent px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full min-w-0 items-center gap-2">
      {label && (
        <label
          onMouseDown={handleMouseDown}
          className="text-[11px] font-medium text-zinc-500 shrink-0 cursor-ns-resize select-none hover:text-zinc-300 transition-colors"
          style={{ width: labelWidth || "auto" }}
          title="Drag to adjust value"
        >
          {label}
        </label>
      )}
      <input
        type="text"
        value={localValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "auto"}
        className="w-0 min-w-0 flex-1 rounded-md bg-zinc-800/60 border border-zinc-700/40 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:bg-zinc-800 focus:outline-none transition-all"
      />
    </div>
  );
}
