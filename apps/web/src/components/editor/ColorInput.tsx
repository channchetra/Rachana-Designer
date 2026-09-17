import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Palette, Pipette } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { TokenPicker, isColorLike } from "./TokenPicker";
import type { CssVariable } from "@/types/editor";

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

export function parseColorValue(value: string): { hex: string; alpha: number } {
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

export function formatColorOutput(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

export function resolveVariablePreviewColor(
  rawValue: string,
  cssVariables: CssVariable[],
  computedValue?: string,
  visited = new Set<string>()
): string | null {
  const value = rawValue.trim();
  if (!value) return computedValue || null;

  if (!value.startsWith("var(")) {
    return isColorLike(value) || value === "transparent" ? value : computedValue || null;
  }

  const match = value.match(/^var\(\s*(--[^,\s)]+)\s*(?:,\s*(.+))?\)$/);
  if (!match) return computedValue || null;

  const [, varName, fallback] = match;
  if (visited.has(varName)) return computedValue || null;

  const variable = cssVariables.find((v) => v.name === varName);
  const nextVisited = new Set(visited).add(varName);

  if (variable) {
    const resolved =
      resolveVariablePreviewColor(variable.computed || variable.value, cssVariables, computedValue, nextVisited) ||
      variable.computed ||
      variable.value;
    if (resolved) return resolved;
  }

  if (fallback) {
    return resolveVariablePreviewColor(fallback.trim(), cssVariables, computedValue, nextVisited);
  }

  return computedValue || null;
}

// ============================================================
// HSV Color Picker Popover (with opacity)
// ============================================================

export function ColorPickerPopover({
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

  const hR = useRef(hue); hR.current = hue;
  const sR = useRef(sat); sR.current = sat;
  const vR = useRef(val); vR.current = val;
  const aR = useRef(localAlpha); aR.current = localAlpha;

  const svAreaRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);
  const alphaBarRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

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
      <div className="relative w-full h-2.5 rounded-full cursor-pointer mt-2 overflow-hidden">
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
// Reusable ColorInput (swatch + text + token picker)
// ============================================================

interface ColorInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Browser-computed color value, used as fallback when resolving var() references */
  computedValue?: string;
}

export function ColorInput({ value, onChange, computedValue }: ColorInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);
  const cssVariables = useEditorStore((s) => s.cssVariables);
  const createCssVariable = useEditorStore((s) => s.createCssVariable);

  // Resolve var() references to their computed color for the swatch preview
  const normalizedValue = value.trim();
  const isVar = normalizedValue.startsWith("var(");
  const resolvedColor = useMemo(() => {
    if (!isVar) return null;
    return resolveVariablePreviewColor(normalizedValue, cssVariables, computedValue);
  }, [isVar, normalizedValue, cssVariables, computedValue]);

  // When value is var(), use resolved color from cssVariables, then computedValue fallback
  const effectiveColor = resolvedColor || (isVar ? (computedValue || null) : null);
  const { hex, alpha } = parseColorValue(effectiveColor || value);
  const previewColor = effectiveColor || value || "#000";

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
        onChange(formatColorOutput(result.sRGBHex, alpha));
      }
    } catch {
      // User cancelled or the browser blocked the eyedropper.
    }
  }, [alpha, onChange]);

  return (
    <div className="relative">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          ref={swatchRef}
          onClick={() => { setShowPicker(!showPicker); setShowTokens(false); }}
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
            showPicker
              ? "border-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
              : "border-zinc-700/40 hover:border-zinc-600"
          }`}
          style={{ backgroundColor: previewColor }}
          title="Open custom color controls"
        >
          <span className="absolute inset-0 rounded-md bg-gradient-to-br from-white/10 to-transparent" />
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="inherit"
          className="flex-1 min-w-0 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors"
        />
        {(cssVariables.length > 0 || createCssVariable) && (
          <button
            ref={tokenBtnRef}
            onClick={() => { setShowTokens(!showTokens); setShowPicker(false); }}
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors shrink-0 ${
              showTokens
                ? "border-zinc-500 bg-zinc-700 text-zinc-200"
                : "border-zinc-700/40 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
            }`}
            title="Select token"
          >
            <Palette size={13} />
          </button>
        )}
      </div>
      {showPicker && (
        <ColorPickerPopover
          color={hex}
          alpha={alpha}
          onChange={(newHex, newAlpha) => onChange(formatColorOutput(newHex, newAlpha))}
          onClose={() => setShowPicker(false)}
          onPickFromScreen={
            (window as Window & { EyeDropper?: unknown }).EyeDropper
              ? handleEyeDropper
              : undefined
          }
        />
      )}
      {showTokens && (
        <TokenPicker
          variables={cssVariables}
          onSelect={(varRef) => { onChange(varRef); setShowTokens(false); }}
          onClose={() => setShowTokens(false)}
          triggerRef={tokenBtnRef}
          onCreateVariable={createCssVariable || undefined}
        />
      )}
    </div>
  );
}
