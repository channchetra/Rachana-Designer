
import { StyleInfo, CssVariable } from "@/types/editor";
import { useEditorStore } from "@/stores/editorStore";
import { useState, useRef, useEffect, useCallback } from "react";
import { Palette, Pipette, Upload, Trash2 } from "lucide-react";
import { TokenPicker, isColorLike } from "../TokenPicker";
import { ColorInput, resolveVariablePreviewColor } from "../ColorInput";
import { FieldLabel, getEffectiveValue } from "@/components/ui/panelPrimitives";

interface ColorPanelProps {
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  onUploadImage: () => void;
}

// ============================================================
// Color conversion utilities
// ============================================================

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; v /= 100;
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(max * 100) };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

function parseColorValue(value: string): { hex: string; alpha: number } {
  if (!value || value === "transparent") return { hex: "#000000", alpha: 0 };
  const rgbaMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]), g = parseInt(rgbaMatch[2]), b = parseInt(rgbaMatch[3]);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return { hex: rgbToHex(r, g, b), alpha: a };
  }
  if (value.startsWith("#") && value.length === 9) {
    return { hex: value.slice(0, 7), alpha: Math.round((parseInt(value.slice(7, 9), 16) / 255) * 100) / 100 };
  }
  if (value.startsWith("#") && value.length === 4) {
    const r = value[1], g = value[2], b = value[3];
    return { hex: `#${r}${r}${g}${g}${b}${b}`, alpha: 1 };
  }
  if (value.startsWith("#") && value.length === 7) return { hex: value, alpha: 1 };
  return { hex: "#000000", alpha: 1 };
}

function formatColorOutput(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

// ============================================================
// Custom HSV color picker popover with opacity
// ============================================================

function ColorPickerPopover({
  color,
  alpha,
  onChange,
  onClose,
  onPickFromScreen,
}: {
  color: string;
  alpha: number;
  onChange: (hex: string, alpha: number) => void;
  onClose: () => void;
  onPickFromScreen?: () => void;
}) {
  const initRgb = hexToRgb(color);
  const initHsv = rgbToHsv(initRgb.r, initRgb.g, initRgb.b);

  const [hue, setHue] = useState(initHsv.h);
  const [sat, setSat] = useState(initHsv.s);
  const [val, setVal] = useState(initHsv.v);
  const [localAlpha, setLocalAlpha] = useState(alpha <= 0 ? 1 : alpha);
  const [hexText, setHexText] = useState(color);

  // Refs for latest values during drag
  const hR = useRef(hue); hR.current = hue;
  const sR = useRef(sat); sR.current = sat;
  const vR = useRef(val); vR.current = val;
  const aR = useRef(localAlpha); aR.current = localAlpha;

  const svAreaRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const alphaBarRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const emit = useCallback((h: number, s: number, v: number, a: number) => {
    const rgb = hsvToRgb(h, s, v);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    setHexText(hex);
    onChange(hex, a);
  }, [onChange]);

  // Sat/Val area drag
  const startSVDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = svAreaRef.current;
    if (!el) return;
    const update = (cx: number, cy: number) => {
      const rect = el.getBoundingClientRect();
      const s = Math.min(100, Math.max(0, ((cx - rect.left) / rect.width) * 100));
      const v = Math.min(100, Math.max(0, (1 - (cy - rect.top) / rect.height) * 100));
      setSat(s); setVal(v);
      emit(hR.current, s, v, aR.current);
    };
    update(e.clientX, e.clientY);
    const onMove = (me: MouseEvent) => { me.preventDefault(); update(me.clientX, me.clientY); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [emit]);

  // Hue bar drag
  const startHueDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = hueBarRef.current;
    if (!el) return;
    const update = (cx: number) => {
      const rect = el.getBoundingClientRect();
      const h = Math.min(360, Math.max(0, ((cx - rect.left) / rect.width) * 360));
      setHue(h);
      emit(h, sR.current, vR.current, aR.current);
    };
    update(e.clientX);
    const onMove = (me: MouseEvent) => { me.preventDefault(); update(me.clientX); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [emit]);

  // Alpha bar drag
  const startAlphaDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = alphaBarRef.current;
    if (!el) return;
    const update = (cx: number) => {
      const rect = el.getBoundingClientRect();
      const a = Math.min(1, Math.max(0, (cx - rect.left) / rect.width));
      setLocalAlpha(a);
      emit(hR.current, sR.current, vR.current, a);
    };
    update(e.clientX);
    const onMove = (me: MouseEvent) => { me.preventDefault(); update(me.clientX); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [emit]);

  const handleHexInput = (text: string) => {
    setHexText(text);
    const clean = text.startsWith("#") ? text : `#${text}`;
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      const rgb = hexToRgb(clean);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      setHue(hsv.h); setSat(hsv.s); setVal(hsv.v);
      onChange(clean, aR.current);
    }
  };

  const handleAlphaInput = (text: string) => {
    const n = parseInt(text);
    if (!isNaN(n)) {
      const a = Math.min(100, Math.max(0, n)) / 100;
      setLocalAlpha(a);
      emit(hR.current, sR.current, vR.current, a);
    }
  };

  const pureHueRgb = hsvToRgb(hue, 100, 100);
  const pureHueHex = rgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);
  const currentRgb = hsvToRgb(hue, sat, val);
  const currentHex = rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b);

  return (
    <div
      ref={popRef}
      className="absolute left-0 top-full mt-2 w-[236px] rounded-xl border border-zinc-700/60 bg-[#1e1e22] shadow-2xl p-2.5"
      style={{ zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
    >
      {/* Saturation/Value area */}
      <div
        ref={svAreaRef}
        className="relative w-full h-[140px] rounded-md cursor-crosshair overflow-hidden"
        style={{ backgroundColor: pureHueHex }}
        onMouseDown={startSVDrag}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, #fff, transparent)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent, #000)" }} />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${sat}%`,
            top: `${100 - val}%`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)",
          }}
        />
      </div>

      {/* Hue bar */}
      <div
        ref={hueBarRef}
        className="relative w-full h-2.5 rounded-full cursor-pointer mt-2.5"
        style={{ background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" }}
        onMouseDown={startHueDrag}
      >
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none -translate-x-1/2 top-1/2 -translate-y-1/2"
          style={{
            left: `${(hue / 360) * 100}%`,
            backgroundColor: pureHueHex,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.3)",
          }}
        />
      </div>

      {/* Alpha bar */}
      <div className="relative w-full h-2.5 rounded-full cursor-pointer mt-2 overflow-hidden">
        {/* Checkerboard */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundImage: "linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)",
            backgroundSize: "6px 6px",
            backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0",
          }}
        />
        <div
          ref={alphaBarRef}
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(to right, transparent, ${currentHex})` }}
          onMouseDown={startAlphaDrag}
        />
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white pointer-events-none -translate-x-1/2 top-1/2 -translate-y-1/2"
          style={{
            left: `${localAlpha * 100}%`,
            backgroundColor: currentHex,
            opacity: localAlpha,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.3)",
          }}
        />
      </div>

      {/* Hex + Alpha inputs */}
      <div className="flex items-center gap-1.5 mt-2.5">
        <div
          className="w-7 h-7 rounded-md border border-zinc-600/50 shrink-0"
          style={{ backgroundColor: currentHex, opacity: localAlpha }}
        />
        <input
          type="text"
          value={hexText}
          onChange={(e) => handleHexInput(e.target.value)}
          className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 font-mono focus:border-zinc-500 focus:outline-none min-w-0"
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(localAlpha * 100)}
            onChange={(e) => handleAlphaInput(e.target.value)}
            className="w-10 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-1 py-1 text-[11px] text-zinc-300 text-center focus:border-zinc-500 focus:outline-none"
          />
          <span className="text-[9px] text-zinc-600">%</span>
        </div>
        <button
          type="button"
          onClick={onPickFromScreen}
          disabled={!onPickFromScreen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700/40 bg-zinc-800/60 text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          title="Pick color from screen"
        >
          <Pipette size={13} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Color Field (swatch opens popover, text input, token button)
// ============================================================

function ColorField({
  label,
  property,
  styles,
  onStyleChange,
  variables,
}: {
  label: string;
  property: string;
  styles: StyleInfo;
  onStyleChange: (property: string, value: string) => void;
  variables: CssVariable[];
}) {
  const createCssVariable = useEditorStore((s) => s.createCssVariable);
  const [showPicker, setShowPicker] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState("");
  const swatchRef = useRef<HTMLButtonElement>(null);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);

  // Show explicit value (inline/class/id) — NOT computed fallback
  const explicitValue = styles.inline[property] || styles.idRules[property] || styles.classRules[property] || "";
  const computedValue = styles.computed[property] || "";
  const isVar = explicitValue.startsWith("var(");
  // Only show color in swatch when it's explicitly set on this class/element
  const hasExplicitColor = !!explicitValue;
  const swatchColor = hasExplicitColor
    ? (isVar ? (computedValue || "#000") : (explicitValue || "#000"))
    : "";
  const previewValue = explicitValue || computedValue || "";
  const { hex, alpha } = parseColorValue(isVar ? (computedValue || previewValue) : (explicitValue || "#000000"));

  const displayValue = editing ? localValue : explicitValue;

  const commitValue = useCallback(() => {
    setEditing(false);
    const trimmed = localValue.trim();
    onStyleChange(property, trimmed);
  }, [localValue, property, onStyleChange]);

  const handleEyeDropper = useCallback(async () => {
    const eyedropperCtor = (window as Window & {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
    }).EyeDropper;
    if (!eyedropperCtor) return;
    try {
      setShowPicker(false);
      setShowTokens(false);
      const result = await new eyedropperCtor().open();
      if (result?.sRGBHex) {
        onStyleChange(property, formatColorOutput(result.sRGBHex, alpha));
      }
    } catch {
      // User cancelled or browser blocked the eyedropper.
    }
  }, [alpha, onStyleChange, property]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <div className="flex min-w-0 items-center gap-1.5">
        {/* Swatch — opens custom picker */}
          <button
            ref={swatchRef}
            onClick={() => { setShowPicker(!showPicker); setShowTokens(false); }}
            className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
              showPicker
                ? "border-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                : "border-zinc-700/40 hover:border-zinc-600"
            }`}
            style={hasExplicitColor
              ? { backgroundColor: swatchColor }
              : { backgroundImage: "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0" }
            }
            title="Open custom color controls"
          >
            <span className="absolute inset-0 rounded-md bg-gradient-to-br from-white/10 to-transparent" />
          </button>
        {showPicker && (
          <ColorPickerPopover
            color={hex}
            alpha={alpha}
            onChange={(newHex, newAlpha) => onStyleChange(property, formatColorOutput(newHex, newAlpha))}
            onClose={() => setShowPicker(false)}
            onPickFromScreen={
              (window as Window & { EyeDropper?: unknown }).EyeDropper
                ? handleEyeDropper
                : undefined
            }
          />
        )}
        {/* Text value */}
        <input
          type="text"
          value={displayValue}
          placeholder={previewValue || "inherited"}
          onFocus={() => { setEditing(true); setLocalValue(explicitValue); }}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitValue();
            if (e.key === "Escape") { setEditing(false); }
          }}
          className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all min-w-0"
        />
        {/* Token picker */}
        <button
          ref={tokenBtnRef}
          onClick={() => { setShowTokens(!showTokens); setShowPicker(false); }}
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all shrink-0 ${
            showTokens
              ? "border-zinc-500 bg-zinc-700 text-zinc-200"
              : "border-zinc-700/40 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
          }`}
          title="Select token"
        >
          <Palette size={13} />
        </button>
        {showTokens && (
          <TokenPicker
            variables={variables}
            onSelect={(varRef) => onStyleChange(property, varRef)}
            onClose={() => setShowTokens(false)}
            triggerRef={tokenBtnRef}
            onCreateVariable={createCssVariable || undefined}
          />
        )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Gradient Editor with draggable stops
// ============================================================

interface GradientStop {
  color: string;
  position: number;
}

function parseGradient(value: string): { type: "linear" | "radial"; angle: number; stops: GradientStop[] } | null {
  if (!value) return null;
  const linearAngle = value.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
  if (linearAngle) return { type: "linear", angle: parseInt(linearAngle[1]), stops: parseGradientStops(linearAngle[2]) };
  const linearPlain = value.match(/linear-gradient\((.+)\)/);
  if (linearPlain) return { type: "linear", angle: 180, stops: parseGradientStops(linearPlain[1]) };
  const radial = value.match(/radial-gradient\((?:circle,?\s*)?(.+)\)/);
  if (radial) return { type: "radial", angle: 0, stops: parseGradientStops(radial[1]) };
  return null;
}

function parseGradientStops(str: string): GradientStop[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  const stops: GradientStop[] = [];
  for (const part of parts) {
    const m = part.match(/^(.+?)\s+([\d.]+)%?\s*$/);
    if (m) stops.push({ color: m[1].trim(), position: parseFloat(m[2]) });
    else if (part.trim()) stops.push({ color: part.trim(), position: stops.length === 0 ? 0 : 100 });
  }
  if (stops.length < 2) return [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 100 }];
  return stops;
}

function buildGradient(type: "linear" | "radial", angle: number, stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const s = sorted.map((st) => `${st.color} ${st.position}%`).join(", ");
  return type === "radial" ? `radial-gradient(circle, ${s})` : `linear-gradient(${angle}deg, ${s})`;
}

function buildGradientPreview(type: "linear" | "radial", angle: number, stops: GradientStop[], cssVariables: CssVariable[]): string {
  const resolvedStops = stops.map((stop) => ({
    ...stop,
    color: resolveVariablePreviewColor(stop.color, cssVariables) || stop.color,
  }));
  return buildGradient(type, angle, resolvedStops);
}

function GradientEditor({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const parsed = parseGradient(value) || { type: "linear" as const, angle: 180, stops: [
    { color: "#000000", position: 0 },
    { color: "#ffffff", position: 100 },
  ]};

  const [type, setType] = useState<"linear" | "radial">(parsed.type);
  const [angle, setAngle] = useState(parsed.angle);
  const [stops, setStops] = useState<GradientStop[]>(parsed.stops);
  const [selectedStop, setSelectedStop] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  // Refs for callbacks during drag
  const typeR = useRef(type); typeR.current = type;
  const angleR = useRef(angle); angleR.current = angle;
  const stopsR = useRef(stops); stopsR.current = stops;

  const emitChange = useCallback(
    (t: "linear" | "radial", a: number, s: GradientStop[]) => onChange(buildGradient(t, a, s)),
    [onChange]
  );

  // Drag a stop along the bar
  const startStopDrag = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedStop(idx);
    const bar = barRef.current;
    if (!bar) return;
    const update = (cx: number) => {
      const rect = bar.getBoundingClientRect();
      const pos = Math.min(100, Math.max(0, Math.round(((cx - rect.left) / rect.width) * 100)));
      setStops((prev) => {
        const next = prev.map((s, i) => (i === idx ? { ...s, position: pos } : s));
        stopsR.current = next;
        return next;
      });
      // Emit with latest refs
      emitChange(typeR.current, angleR.current, stopsR.current.map((s, i) =>
        i === idx ? { ...s, position: pos } : s
      ));
    };
    const onMove = (me: MouseEvent) => { me.preventDefault(); update(me.clientX); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [emitChange]);

  // Click on bar to add stop
  const handleBarClick = useCallback((e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pos = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const nearbyIdx = stops.findIndex((s) => Math.abs(s.position - pos) < 5);
    if (nearbyIdx !== -1) { setSelectedStop(nearbyIdx); return; }
    const newStops = [...stops, { color: "#888888", position: pos }].sort((a, b) => a.position - b.position);
    setStops(newStops);
    setSelectedStop(newStops.findIndex((s) => s.position === pos));
    emitChange(type, angle, newStops);
  }, [stops, type, angle, emitChange]);

  const updateStop = useCallback((idx: number, updates: Partial<GradientStop>) => {
    const newStops = stops.map((s, i) => (i === idx ? { ...s, ...updates } : s));
    setStops(newStops);
    emitChange(type, angle, newStops);
  }, [stops, type, angle, emitChange]);

  const removeStop = useCallback((idx: number) => {
    if (stops.length <= 2) return;
    const newStops = stops.filter((_, i) => i !== idx);
    setStops(newStops);
    setSelectedStop(Math.min(selectedStop, newStops.length - 1));
    emitChange(type, angle, newStops);
  }, [stops, selectedStop, type, angle, emitChange]);

  return (
    <div className="space-y-2">
      {/* Type + angle */}
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => { const t = e.target.value as "linear" | "radial"; setType(t); emitChange(t, angle, stops); }}
          className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none"
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
        {type === "linear" && (
          <div className="flex items-center gap-1">
            <input
              type="number" min={0} max={360} value={angle}
              onChange={(e) => { const a = parseInt(e.target.value) || 0; setAngle(a); emitChange(type, a, stops); }}
              className="w-14 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 text-center focus:border-zinc-500 focus:outline-none"
            />
            <span className="text-[9px] text-zinc-600">deg</span>
          </div>
        )}
      </div>

      {/* Gradient bar with draggable stops */}
      <div className="relative pb-4">
        <div
          ref={barRef}
          onClick={handleBarClick}
          className="h-6 rounded-md border border-zinc-700/40 cursor-crosshair"
          style={{ background: buildGradientPreview(type, angle, stops, cssVariables) }}
        />
        {stops.map((stop, i) => (
          <div
            key={i}
            className={`absolute w-3.5 h-3.5 rounded-full border-2 cursor-grab active:cursor-grabbing -translate-x-1/2 ${
              i === selectedStop ? "border-white shadow-lg z-10" : "border-zinc-400"
            }`}
            style={{
              left: `${stop.position}%`,
              top: 18,
              backgroundColor: resolveVariablePreviewColor(stop.color, cssVariables) || stop.color,
              boxShadow: i === selectedStop ? "0 0 0 2px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.3)",
            }}
            onMouseDown={(e) => startStopDrag(i, e)}
          />
        ))}
      </div>

      {/* Selected stop editor */}
      {stops[selectedStop] && (() => {
        const stopColor = stops[selectedStop].color;
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              <ColorInput
                value={stopColor}
                onChange={(nextColor) => updateStop(selectedStop, { color: nextColor })}
              />
            </div>
            <input
              type="number" min={0} max={100}
              value={stops[selectedStop].position}
              onChange={(e) => updateStop(selectedStop, { position: parseInt(e.target.value) || 0 })}
              className="w-12 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-1 py-1 text-[11px] text-zinc-300 text-center focus:border-zinc-500 focus:outline-none"
            />
            <span className="text-[9px] text-zinc-600">%</span>
            {stops.length > 2 && (
              <button
                onClick={() => removeStop(selectedStop)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                title="Remove stop"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Preset Input (text field + hover popover with presets)
// ============================================================

function PresetInput({
  value,
  onChange,
  presets,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  presets: string[];
  placeholder?: string;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => setShowPresets(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-colors"
      />
      {showPresets && (
        <div className="absolute left-0 top-full mt-1 w-full max-h-40 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl z-50 overflow-y-auto">
          {presets.map((p) => (
            <button
              key={p}
              onMouseDown={(e) => { e.preventDefault(); onChange(p); setShowPresets(false); }}
              className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Background Type
// ============================================================

type BgType = "none" | "image" | "gradient";

function detectBgType(styles: StyleInfo): BgType {
  const bgImage = getEffectiveValue(styles, "background-image");
  if (!bgImage || bgImage === "none") return "none";
  if (bgImage.includes("gradient")) return "gradient";
  if (bgImage.includes("url(")) return "image";
  return "none";
}

// ============================================================
// Main Color Panel
// ============================================================

const SIZE_PRESETS = ["auto", "cover", "contain", "100%", "100% 100%", "50%", "auto 50%", "300px 300px"];
const POSITION_PRESETS = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right", "25% 75%", "50% 50%"];

export function ColorPanel({ styles, onStyleChange, onUploadImage }: ColorPanelProps) {
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const detectedType = detectBgType(styles);

  // Local state so user can switch to "image" before setting a URL
  const [bgTypeOverride, setBgTypeOverride] = useState<BgType | null>(null);
  const bgType = bgTypeOverride ?? detectedType;

  // Sync override back to null when external value changes to match
  useEffect(() => {
    if (bgTypeOverride && detectedType === bgTypeOverride) setBgTypeOverride(null);
  }, [detectedType, bgTypeOverride]);

  return (
    <div className="space-y-3">
      {/* Text Color */}
      <ColorField
        label="Text Color"
        property="color"
        styles={styles}
        onStyleChange={onStyleChange}
        variables={cssVariables}
      />

      {/* Background Color */}
      <ColorField
        label="Background Color"
        property="background-color"
        styles={styles}
        onStyleChange={onStyleChange}
        variables={cssVariables}
      />

      {/* Background Type Selector */}
      <div>
        <FieldLabel>Background Type</FieldLabel>
        <div className="flex rounded-md border border-zinc-700/40 bg-zinc-800/60 overflow-hidden">
          {(["none", "image", "gradient"] as BgType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setBgTypeOverride(t);
                if (t === "none") {
                  onStyleChange("background-image", "none");
                  setBgTypeOverride(null);
                } else if (t === "gradient") {
                  const current = getEffectiveValue(styles, "background-image");
                  if (!current.includes("gradient")) {
                    onStyleChange("background-image", "linear-gradient(180deg, #000000 0%, #ffffff 100%)");
                  }
                }
                // "image": just show the UI, don't change CSS yet
              }}
              className={`flex-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                bgType === t
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50"
              }`}
            >
              {t === "none" ? "Color" : t === "image" ? "Image" : "Gradient"}
            </button>
          ))}
        </div>
      </div>

      {/* Gradient Editor */}
      {bgType === "gradient" && (
        <div>
          <FieldLabel>Gradient</FieldLabel>
          <GradientEditor
            value={getEffectiveValue(styles, "background-image")}
            onChange={(val) => onStyleChange("background-image", val)}
          />
        </div>
      )}

      {/* Image background */}
      {bgType === "image" && (
        <div>
          <FieldLabel>Background Image</FieldLabel>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={getEffectiveValue(styles, "background-image").replace(/^url\(["']?|["']?\)$/g, "")}
              onChange={(e) => onStyleChange("background-image", e.target.value ? `url('${e.target.value}')` : "none")}
              placeholder="Enter URL..."
              className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-all min-w-0"
            />
            <button
              onClick={onUploadImage}
              className="flex h-7 items-center gap-1 px-2 rounded-md border border-zinc-700/40 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-all shrink-0 text-[10px]"
              title="Upload image"
            >
              <Upload size={11} />
              Upload
            </button>
          </div>
        </div>
      )}

      {/* Image-specific options: Size, Repeat, Position, Attachment */}
      {bgType === "image" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>BG Size</FieldLabel>
              <PresetInput
                value={getEffectiveValue(styles, "background-size")}
                onChange={(v) => onStyleChange("background-size", v)}
                presets={SIZE_PRESETS}
                placeholder="auto"
              />
            </div>
            <div>
              <FieldLabel>BG Repeat</FieldLabel>
              <select
                value={getEffectiveValue(styles, "background-repeat")}
                onChange={(e) => onStyleChange("background-repeat", e.target.value)}
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
              >
                {["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>BG Position</FieldLabel>
              <PresetInput
                value={getEffectiveValue(styles, "background-position")}
                onChange={(v) => onStyleChange("background-position", v)}
                presets={POSITION_PRESETS}
                placeholder="center"
              />
            </div>
            <div>
              <FieldLabel>BG Attach</FieldLabel>
              <select
                value={getEffectiveValue(styles, "background-attachment")}
                onChange={(e) => onStyleChange("background-attachment", e.target.value)}
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
              >
                {["scroll", "fixed", "local"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Blend Mode + Clip — always available */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Blend Mode</FieldLabel>
          <select
            value={getEffectiveValue(styles, "background-blend-mode")}
            onChange={(e) => onStyleChange("background-blend-mode", e.target.value)}
            className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
          >
            {["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "difference", "exclusion", "hue", "saturation", "color"].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>BG Clip</FieldLabel>
          <select
            value={getEffectiveValue(styles, "background-clip")}
            onChange={(e) => onStyleChange("background-clip", e.target.value)}
            className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-all"
          >
            {["border-box", "padding-box", "content-box", "text"].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
