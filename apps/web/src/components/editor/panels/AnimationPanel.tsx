/**
 * AnimationPanel — Standalone panel for creating and managing animation classes.
 * Opened via toolbar icon. Users create named animation classes, pick a trigger,
 * edit keyframes + timing, and can then apply those classes to any element.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useEditorStore } from "@/stores/editorStore";
import {
  Plus, X, Trash2, Code, Play, ChevronRight, ChevronDown,
  Eye, ScrollText, MousePointer, Zap, Search, Tag,
} from "lucide-react";

// ── Option constants ──────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: "0.15s", value: "0.15s" }, { label: "0.3s", value: "0.3s" }, { label: "0.5s", value: "0.5s" },
  { label: "1s", value: "1s" }, { label: "2s", value: "2s" }, { label: "3s", value: "3s" },
  { label: "5s", value: "5s" }, { label: "10s", value: "10s" },
];
const EASING_OPTIONS = [
  { label: "Linear", value: "linear" }, { label: "Ease", value: "ease" },
  { label: "Ease In", value: "ease-in" }, { label: "Ease Out", value: "ease-out" },
  { label: "Ease In-Out", value: "ease-in-out" },
  { label: "Spring", value: "cubic-bezier(0.35, 0.11, 0.22, 1.16)" },
];
const DIRECTION_OPTIONS = [
  { label: "Normal", value: "normal" }, { label: "Reverse", value: "reverse" },
  { label: "Alternate", value: "alternate" }, { label: "Alt. Reverse", value: "alternate-reverse" },
];
const FILL_OPTIONS = [
  { label: "None", value: "none" }, { label: "Forwards", value: "forwards" },
  { label: "Backwards", value: "backwards" }, { label: "Both", value: "both" },
];
const COUNT_OPTIONS = [
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" },
  { label: "Infinite", value: "infinite" },
];
const RANGE_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Entry", value: "entry" }, { label: "Exit", value: "exit" },
  { label: "Contain", value: "contain" }, { label: "Cover", value: "cover" },
];
const TIMELINE_OPTIONS = [
  { label: "View", value: "view()" }, { label: "View (X)", value: "view(x)" },
  { label: "Scroll", value: "scroll()" }, { label: "Scroll (X)", value: "scroll(x)" },
  { label: "Scroll Root", value: "scroll(root block)" },
];

type TriggerType = "active" | "hover" | "view" | "scroll" | "class";

const TRIGGER_OPTIONS: { type: TriggerType; label: string; icon: typeof Eye }[] = [
  { type: "active", label: "On Load", icon: Zap },
  { type: "hover", label: "On Hover", icon: MousePointer },
  { type: "view", label: "On View", icon: Eye },
  { type: "scroll", label: "On Scroll", icon: ScrollText },
  { type: "class", label: "On Class", icon: Tag },
];

// ── Animation class model ─────────────────────────────────────

export interface AnimationClassDef {
  id: string;
  className: string;
  trigger: TriggerType;
  keyframeName: string;
  keyframeCSS: string;
  duration: string;
  easing: string;
  delay: string;
  direction: string;
  fillMode: string;
  iterationCount: string;
  timeline: string;
  range: string;
  // class trigger specific
  activationClass: string;
  isParentClass: boolean;
}

function createDefaultAnimClass(name: string): AnimationClassDef {
  const kfName = name.replace(/[^a-zA-Z0-9_-]/g, "-") + "-kf";
  return {
    id: Math.random().toString(36).slice(2, 10),
    className: name,
    trigger: "active",
    keyframeName: kfName,
    keyframeCSS: "0% { opacity: 0; transform: translateY(20px); }\n100% { opacity: 1; transform: translateY(0); }",
    duration: "0.5s", easing: "ease", delay: "0s", direction: "normal",
    fillMode: "both", iterationCount: "1",
    timeline: "view()", range: "entry",
    activationClass: "", isParentClass: false,
  };
}

// ── Presets ────────────────────────────────────────────────────

interface AnimPreset {
  label: string;
  trigger: TriggerType;
  keyframeCSS: string;
  duration: string;
  easing: string;
  fillMode: string;
  iterationCount: string;
  timeline?: string;
  range?: string;
}

const PRESETS: AnimPreset[] = [
  { label: "Fade In", trigger: "active", keyframeCSS: "0% { opacity: 0; } 100% { opacity: 1; }", duration: "0.5s", easing: "ease", fillMode: "both", iterationCount: "1" },
  { label: "Slide Up", trigger: "active", keyframeCSS: "0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: translateY(0); }", duration: "0.5s", easing: "ease", fillMode: "both", iterationCount: "1" },
  { label: "Scale In", trigger: "active", keyframeCSS: "0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); }", duration: "0.5s", easing: "ease", fillMode: "both", iterationCount: "1" },
  { label: "Show on Entry", trigger: "view", keyframeCSS: "0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); }", duration: "1s", easing: "linear", fillMode: "both", iterationCount: "1", timeline: "view()", range: "entry" },
  { label: "Clip on Entry", trigger: "view", keyframeCSS: "0% { clip-path: inset(45% 20% 45% 20%); transform: translateY(35%); } 100% { clip-path: inset(0% 0% 0% 0%); transform: translateY(0%); }", duration: "1s", easing: "linear", fillMode: "both", iterationCount: "1", timeline: "view()", range: "entry" },
  { label: "Scroll Parallax", trigger: "scroll", keyframeCSS: "from { transform: translateY(100px); } to { transform: translateY(-100px); }", duration: "1s", easing: "linear", fillMode: "both", iterationCount: "1", timeline: "view()", range: "normal" },
  { label: "Hover Grow", trigger: "hover", keyframeCSS: "0% { transform: scale(1); } 100% { transform: scale(1.05); }", duration: "0.2s", easing: "ease-out", fillMode: "forwards", iterationCount: "1" },
  { label: "Spin", trigger: "active", keyframeCSS: "from { transform: rotate(0deg); } to { transform: rotate(360deg); }", duration: "1s", easing: "linear", fillMode: "none", iterationCount: "infinite" },
  { label: "Pulse", trigger: "active", keyframeCSS: "0%, 100% { opacity: 1; } 50% { opacity: 0.5; }", duration: "2s", easing: "ease-in-out", fillMode: "none", iterationCount: "infinite" },
  { label: "Bounce", trigger: "active", keyframeCSS: "0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); }", duration: "1s", easing: "ease", fillMode: "none", iterationCount: "infinite" },
];

// ── CSS generation ────────────────────────────────────────────

function generateClassCSS(def: AnimationClassDef): string {
  const kfName = def.keyframeName;
  const animValue = `${kfName} ${def.duration} ${def.easing} ${def.delay} ${def.iterationCount} ${def.direction} ${def.fillMode}`;

  let selector = `.${def.className}`;
  let extraProps = "";

  if (def.trigger === "hover") {
    selector = `.${def.className}:hover`;
  } else if (def.trigger === "view") {
    selector = `.${def.className}.gl-in-view`;
  } else if (def.trigger === "scroll") {
    extraProps += `  animation-timeline: ${def.timeline};\n`;
    if (def.range && def.range !== "normal") {
      extraProps += `  animation-range: ${def.range};\n`;
    }
  } else if (def.trigger === "class" && def.activationClass) {
    const actCls = def.activationClass.replace(/^\./, "");
    if (def.isParentClass) {
      selector = `.${actCls} .${def.className}`;
    } else {
      selector = `.${def.className}.${actCls}`;
    }
  }

  let css = `${selector} {\n  animation: ${animValue};\n${extraProps}}\n\n`;
  css += `@keyframes ${kfName} {\n${def.keyframeCSS}\n}`;
  return css;
}

// ── CSS parsing (restore from saved gl-anim-* style tags) ────

const EASING_KEYWORDS = new Set(["ease", "linear", "ease-in", "ease-out", "ease-in-out"]);
const DIRECTION_KEYWORDS = new Set(["normal", "reverse", "alternate", "alternate-reverse"]);
const FILL_KEYWORDS = new Set(["none", "forwards", "backwards", "both"]);
const PLAY_STATE_KEYWORDS = new Set(["running", "paused"]);
const TIME_RE = /^[\d.]+m?s$/;
const COUNT_RE = /^(\d+|infinite)$/;

/** Tokenize a CSS value, keeping parenthesized groups (e.g. cubic-bezier) together */
function tokenizeCSS(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Parse browser-normalized animation shorthand by detecting value types */
function parseAnimationShorthand(value: string) {
  const tokens = tokenizeCSS(value);
  let name = "";
  let duration = "0.5s";
  let easing = "ease";
  let delay = "0s";
  let iterationCount = "1";
  let direction = "normal";
  let fillMode = "both";
  let timeCount = 0;

  for (const token of tokens) {
    if (token.startsWith("cubic-bezier(") || token.startsWith("steps(")) {
      easing = token;
    } else if (TIME_RE.test(token)) {
      timeCount++;
      if (timeCount === 1) duration = token;
      else if (timeCount === 2) delay = token;
    } else if (EASING_KEYWORDS.has(token)) {
      easing = token;
    } else if (DIRECTION_KEYWORDS.has(token)) {
      direction = token;
    } else if (FILL_KEYWORDS.has(token)) {
      fillMode = token;
    } else if (PLAY_STATE_KEYWORDS.has(token)) {
      // skip — we don't store play-state
    } else if (COUNT_RE.test(token)) {
      iterationCount = token;
    } else {
      name = token;
    }
  }
  return { name, duration, easing, delay, iterationCount, direction, fillMode };
}

function parseAnimClassFromCSS(className: string, rawCSS: string): AnimationClassDef | null {
  const def = createDefaultAnimClass(className);

  // Extract @keyframes block
  const kfMatch = rawCSS.match(/@keyframes\s+([\w-]+)\s*\{([\s\S]*)\}\s*$/);
  if (kfMatch) {
    def.keyframeName = kfMatch[1];
    def.keyframeCSS = kfMatch[2].trim();
  }

  // Extract the rule block (everything before @keyframes)
  const ruleCSS = rawCSS.replace(/@keyframes[\s\S]*$/, "").trim();
  const selectorMatch = ruleCSS.match(/^([^{]+)\{([\s\S]*?)\}/);
  if (!selectorMatch) return null;

  const selector = selectorMatch[1].trim();
  const body = selectorMatch[2];

  // Determine trigger from selector
  if (selector.includes(":hover")) {
    def.trigger = "hover";
  } else if (selector.includes(".gl-in-view")) {
    def.trigger = "view";
  } else if (body.includes("animation-timeline")) {
    def.trigger = "scroll";
  } else {
    // Check for class trigger: ".parentClass .className" or ".className.activationClass"
    const esc = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const spacePattern = new RegExp(`^\\.(\\S+)\\s+\\.${esc}$`);
    const combinedPattern = new RegExp(`^\\.${esc}\\.(\\S+)$`);
    const spaceMatch = selector.match(spacePattern);
    const combinedMatch = selector.match(combinedPattern);
    if (spaceMatch) {
      def.trigger = "class";
      def.activationClass = spaceMatch[1];
      def.isParentClass = true;
    } else if (combinedMatch && combinedMatch[1] !== "gl-in-view") {
      def.trigger = "class";
      def.activationClass = combinedMatch[1];
      def.isParentClass = false;
    } else {
      def.trigger = "active";
    }
  }

  // Parse animation shorthand (browser normalizes order: duration easing delay count direction fill play-state name)
  const animMatch = body.match(/animation\s*:\s*([^;]+)/);
  if (animMatch) {
    const parsed = parseAnimationShorthand(animMatch[1]);
    def.keyframeName = parsed.name || def.keyframeName;
    def.duration = parsed.duration;
    def.easing = parsed.easing;
    def.delay = parsed.delay;
    def.iterationCount = parsed.iterationCount;
    def.direction = parsed.direction;
    def.fillMode = parsed.fillMode;
  }

  // Parse scroll-specific properties
  const timelineMatch = body.match(/animation-timeline\s*:\s*([^;]+)/);
  if (timelineMatch) def.timeline = timelineMatch[1].trim();
  const rangeMatch = body.match(/animation-range\s*:\s*([^;]+)/);
  if (rangeMatch) def.range = rangeMatch[1].trim();

  return def;
}

// ── Shared UI helpers ─────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[9px] font-medium uppercase tracking-wide text-zinc-600 mb-1">{children}</label>;
}

function MiniSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[]; placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-colors appearance-none cursor-pointer">
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Keyframe Builder Modal (migrated from EffectsPanel) ───────

interface KeyframeData {
  position: number;
  properties: Record<string, string>;
}

function parseKeyframesCSS(css: string): KeyframeData[] {
  if (!css) return [{ position: 0, properties: {} }, { position: 100, properties: {} }];
  const kfs: KeyframeData[] = [];
  const regex = /(\d+)%\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const pos = parseInt(match[1], 10);
    const propsStr = match[2].trim();
    const props: Record<string, string> = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(propsStr)) !== null) props[pm[1].trim()] = pm[2].trim();
    kfs.push({ position: pos, properties: props });
  }
  const fromTo = /\b(from|to)\s*\{([^}]*)\}/g;
  let ftm: RegExpExecArray | null;
  while ((ftm = fromTo.exec(css)) !== null) {
    const pos = ftm[1] === "from" ? 0 : 100;
    const propsStr = ftm[2].trim();
    const props: Record<string, string> = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRegex.exec(propsStr)) !== null) props[pm[1].trim()] = pm[2].trim();
    const existing = kfs.find((k) => k.position === pos);
    if (existing) Object.assign(existing.properties, props);
    else kfs.push({ position: pos, properties: props });
  }
  if (kfs.length === 0) return [{ position: 0, properties: {} }, { position: 100, properties: {} }];
  return kfs.sort((a, b) => a.position - b.position);
}

function generateKeyframesCSS(keyframes: KeyframeData[]): string {
  return keyframes.sort((a, b) => a.position - b.position).map((kf) => {
    const props = Object.entries(kf.properties).filter(([, v]) => v.trim()).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    return `${kf.position}% {\n${props}\n}`;
  }).join("\n");
}

const KF_PROPERTY_PRESETS = [
  { label: "opacity", placeholder: "1" },
  { label: "transform", placeholder: "translateY(0)" },
  { label: "filter", placeholder: "blur(0px)" },
  { label: "clip-path", placeholder: "inset(0% 0% 0% 0%)" },
  { label: "background-color", placeholder: "#000" },
  { label: "color", placeholder: "#fff" },
  { label: "scale", placeholder: "1" },
  { label: "rotate", placeholder: "0deg" },
  { label: "translateX", placeholder: "0px" },
  { label: "translateY", placeholder: "0px" },
];

function KeyframeBuilderModal({ name, initialCSS, onApply, onClose }: {
  name: string; initialCSS: string;
  onApply: (css: string) => void; onClose: () => void;
}) {
  const [keyframes, setKeyframes] = useState<KeyframeData[]>(() => parseKeyframesCSS(initialCSS));
  const [activeIdx, setActiveIdx] = useState(0);
  const [codeView, setCodeView] = useState(false);
  const [codeText, setCodeText] = useState(() => generateKeyframesCSS(parseKeyframesCSS(initialCSS)));
  const [newPropName, setNewPropName] = useState("");
  const [showAddProp, setShowAddProp] = useState(false);
  const [addPropPos, setAddPropPos] = useState<{ top: number; right: number } | null>(null);
  const addPropRef = useRef<HTMLDivElement>(null);
  const addPropBtnRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ idx: number; startX: number; startPos: number } | null>(null);

  const activeKf = keyframes[activeIdx] || keyframes[0];

  useEffect(() => {
    if (!showAddProp) return;
    const h = (e: MouseEvent) => {
      if (addPropRef.current && !addPropRef.current.contains(e.target as Node) &&
          !(e.target as HTMLElement).closest?.("[data-kf-addprop-dropdown]")) setShowAddProp(false);
    };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showAddProp]);

  const updateKeyframes = useCallback((kfs: KeyframeData[]) => {
    setKeyframes(kfs); setCodeText(generateKeyframesCSS(kfs));
  }, []);

  const updateProp = useCallback((prop: string, value: string) => {
    const nkfs = keyframes.map((kf, i) => {
      if (i !== activeIdx) return kf;
      const np = { ...kf.properties };
      if (value) np[prop] = value; else delete np[prop];
      return { ...kf, properties: np };
    });
    updateKeyframes(nkfs);
  }, [keyframes, activeIdx, updateKeyframes]);

  const addKeyframe = () => {
    const positions = keyframes.map((k) => k.position).sort((a, b) => a - b);
    let bestPos = 50; let maxGap = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      const gap = positions[i + 1] - positions[i];
      if (gap > maxGap) { maxGap = gap; bestPos = positions[i] + Math.floor(gap / 2); }
    }
    if (keyframes.some((k) => k.position === bestPos)) return;
    const nkfs = [...keyframes, { position: bestPos, properties: {} }].sort((a, b) => a.position - b.position);
    updateKeyframes(nkfs);
    setActiveIdx(nkfs.findIndex((k) => k.position === bestPos));
  };

  const removeKeyframe = (idx: number) => {
    if (keyframes.length <= 2) return;
    const nkfs = keyframes.filter((_, i) => i !== idx);
    updateKeyframes(nkfs);
    setActiveIdx(Math.min(activeIdx, nkfs.length - 1));
  };

  const updatePosition = useCallback((idx: number, pos: number) => {
    setKeyframes((prev) => {
      if (prev.some((k, i) => i !== idx && k.position === pos)) return prev;
      const nkfs = prev.map((kf, i) => i === idx ? { ...kf, position: pos } : kf).sort((a, b) => a.position - b.position);
      const newIdx = nkfs.findIndex((k) => k.position === pos);
      setActiveIdx(newIdx);
      if (dragRef.current) dragRef.current.idx = newIdx;
      setCodeText(generateKeyframesCSS(nkfs));
      return nkfs;
    });
  }, []);

  const handleMarkerMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault(); e.stopPropagation(); setActiveIdx(idx);
    if (!timelineRef.current) return;
    dragRef.current = { idx, startX: e.clientX, startPos: keyframes[idx].position };
    const onMouseMove = (me: MouseEvent) => {
      if (!dragRef.current || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = me.clientX - rect.left - 8;
      const pct = Math.round(Math.max(0, Math.min(100, (x / (rect.width - 16)) * 100)));
      updatePosition(dragRef.current.idx, pct);
    };
    const onMouseUp = () => { dragRef.current = null; document.removeEventListener("mousemove", onMouseMove); document.removeEventListener("mouseup", onMouseUp); };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [keyframes, updatePosition]);

  const handleCodeChange = (text: string) => {
    setCodeText(text);
    try { const parsed = parseKeyframesCSS(text); if (parsed.length > 0) { setKeyframes(parsed); setActiveIdx(0); } } catch {}
  };

  const handleApply = () => { onApply(codeView ? codeText : generateKeyframesCSS(keyframes)); onClose(); };

  const toggleAddProp = () => {
    if (!showAddProp && addPropBtnRef.current) {
      const rect = addPropBtnRef.current.getBoundingClientRect();
      setAddPropPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setShowAddProp(!showAddProp);
  };

  const addPropertyToAll = (propName: string) => {
    if (!propName.trim()) return;
    const prop = propName.trim();
    const preset = KF_PROPERTY_PRESETS.find((p) => p.label === prop);
    const value = preset?.placeholder || "";
    const nkfs = keyframes.map((kf) => {
      if (prop in kf.properties) return kf;
      return { ...kf, properties: { ...kf.properties, [prop]: value } };
    });
    updateKeyframes(nkfs);
    setShowAddProp(false); setNewPropName("");
  };

  const selectPrevKeyframe = useCallback(() => {
    setActiveIdx((prev) => Math.max(0, prev - 1));
  }, []);

  const selectNextKeyframe = useCallback(() => {
    setActiveIdx((prev) => Math.min(keyframes.length - 1, prev + 1));
  }, [keyframes.length]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-[#1a1a1e] border border-zinc-700/60 rounded-xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-zinc-200">Keyframe Builder</span>
            <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">@{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCodeView(!codeView)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${codeView ? "bg-violet-500/20 text-violet-300" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40"}`}>
              {codeView ? "Visual" : "Code"}
            </button>
            <button onClick={onClose} className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"><X size={14} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {codeView ? (
            <div>
              <FieldLabel>Keyframe CSS</FieldLabel>
              <textarea value={codeText} onChange={(e) => handleCodeChange(e.target.value)} spellCheck={false}
                className="w-full h-64 rounded-md border border-zinc-700/40 bg-zinc-900/80 px-3 py-2 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
                placeholder={"0% { opacity: 0; }\n100% { opacity: 1; }"} />
            </div>
          ) : (
            <>
              {/* Timeline */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel>Timeline</FieldLabel>
                  <button onClick={addKeyframe} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors">
                    <Plus size={10} /> Add
                  </button>
                </div>
                <div ref={timelineRef} className="relative h-12 bg-zinc-800/60 rounded-lg border border-zinc-700/30 px-2">
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-zinc-700/60 rounded-full" />
                  {[0, 25, 50, 75, 100].map((p) => (
                    <div key={p} className="absolute bottom-0 flex flex-col items-center" style={{ left: `calc(${p}% - ${(p / 100) * 16}px + 8px)`, transform: "translateX(-50%)" }}>
                      <div className="w-px h-1.5 bg-zinc-600/50" />
                      <span className="text-[7px] text-zinc-600 mt-px leading-none">{p}</span>
                    </div>
                  ))}
                  {keyframes.map((kf, idx) => (
                    <div key={idx} onMouseDown={(e) => handleMarkerMouseDown(e, idx)}
                      className={`absolute top-1/2 flex flex-col items-center select-none ${idx === activeIdx ? "z-20" : "z-10"}`}
                      style={{ left: `calc(${kf.position}% - ${(kf.position / 100) * 16}px + 8px)`, transform: "translate(-50%, -50%)", cursor: "grab" }}
                      title={`${kf.position}% — drag to move`}>
                      <div className={`w-3.5 h-3.5 rounded-sm rotate-45 border-2 transition-all ${idx === activeIdx ? "bg-violet-500 border-violet-300 scale-125 shadow-lg shadow-violet-500/40" : "bg-zinc-600 border-zinc-500 hover:bg-violet-400 hover:border-violet-300"}`} />
                      <span className={`text-[8px] font-mono mt-1.5 leading-none ${idx === activeIdx ? "text-violet-400 font-bold" : "text-zinc-500"}`}>{kf.position}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active keyframe editor */}
              {activeKf && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase">Keyframe</span>
                    <div className="flex items-center gap-1.5">
                      {keyframes.length > 2 && (
                        <button onClick={() => removeKeyframe(activeIdx)} className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all mr-1"><Trash2 size={10} /></button>
                      )}
                      <button
                        onClick={selectPrevKeyframe}
                        disabled={activeIdx <= 0}
                        className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        title="Previous keyframe"
                      >
                        <ChevronRight size={12} className="rotate-180" />
                      </button>
                      <span className="text-[11px] font-mono font-bold text-violet-400 min-w-[32px] text-center">{activeKf.position}%</span>
                      <button
                        onClick={selectNextKeyframe}
                        disabled={activeIdx >= keyframes.length - 1}
                        className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        title="Next keyframe"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                  <div>
                    {Object.keys(activeKf.properties).length === 0 ? (
                      <div className="text-[10px] text-zinc-600 text-center py-3">No properties. Click "Add Option" below.</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(activeKf.properties).map(([prop, val]) => (
                          <div key={prop} className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-[9px] font-mono text-zinc-500 mb-0.5 block">{prop}</label>
                              <input type="text" value={val} onChange={(e) => updateProp(prop, e.target.value)}
                                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-colors" />
                            </div>
                            <button onClick={() => updateProp(prop, "")} className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all mt-4"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add Option button at bottom */}
                    <div className="mt-3" ref={addPropRef}>
                      <button
                        ref={addPropBtnRef}
                        onClick={toggleAddProp}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors ${showAddProp ? "bg-violet-500/20 text-violet-300" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40 border border-zinc-700/40 border-dashed"}`}
                      >
                        <Plus size={10} /> Add Option
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="px-4 py-3 border-t border-zinc-700/40">
          <style>{`@keyframes ${name} { ${codeView ? codeText : generateKeyframesCSS(keyframes)} }`}</style>
          <div className="flex items-center justify-center h-16 bg-zinc-800/40 rounded-lg border border-zinc-700/20">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600" style={{ animation: `${name} 2s ease-in-out infinite alternate` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-700/40">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors">Cancel</button>
          <button onClick={handleApply} className="px-4 py-1.5 rounded-md text-[11px] font-medium text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm">Apply Keyframes</button>
        </div>

        {/* Add property dropdown */}
        {showAddProp && addPropPos && (
          <div data-kf-addprop-dropdown className="fixed w-[160px] rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-2xl overflow-hidden"
            style={{ top: addPropPos.top, right: addPropPos.right, zIndex: 99999 }}>
            <div className="p-2 border-b border-zinc-700/30">
              <input type="text" value={newPropName} onChange={(e) => setNewPropName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPropertyToAll(newPropName); } }}
                placeholder="Custom property..." autoFocus
                className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[10px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none" />
            </div>
            <div className="py-1 max-h-[200px] overflow-y-auto">
              {KF_PROPERTY_PRESETS.filter((p) => !activeKf.properties[p.label]).map((preset) => (
                <button key={preset.label} onClick={() => addPropertyToAll(preset.label)}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100 transition-colors">{preset.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AnimationPanel ───────────────────────────────────────

interface AnimationPanelProps {
  onInjectAnimationCSS: (id: string, css: string) => void;
  onInjectKeyframes: (name: string, css: string) => void;
  onInjectObserverScript: (enable: boolean) => void;
  onDeleteAnimationClass: (className: string) => void;
  savedAnimStyles?: { className: string; css: string }[];
}

export function AnimationPanel({ onInjectAnimationCSS, onInjectKeyframes, onInjectObserverScript, onDeleteAnimationClass, savedAnimStyles }: AnimationPanelProps) {
  const [animClasses, setAnimClasses] = useState<AnimationClassDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [didRestore, setDidRestore] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showKeyframeBuilder, setShowKeyframeBuilder] = useState(false);
  const [showCssModal, setShowCssModal] = useState(false);

  const selected = useMemo(() => animClasses.find((a) => a.id === selectedId) || null, [animClasses, selectedId]);

  // Restore animation classes from saved gl-anim-* style tags on load
  useEffect(() => {
    if (didRestore || !savedAnimStyles || savedAnimStyles.length === 0) return;
    setDidRestore(true);
    const restored: AnimationClassDef[] = [];
    for (const { className, css } of savedAnimStyles) {
      const def = parseAnimClassFromCSS(className, css);
      if (def) restored.push(def);
    }
    if (restored.length > 0) setAnimClasses(restored);
  }, [savedAnimStyles, didRestore]);

  const injectCSS = useCallback((def: AnimationClassDef) => {
    const css = generateClassCSS(def);
    onInjectAnimationCSS(def.className, css);
    const hasViewTrigger = animClasses.some((a) => a.trigger === "view") || def.trigger === "view";
    onInjectObserverScript(hasViewTrigger);
  }, [animClasses, onInjectAnimationCSS, onInjectObserverScript]);

  const handleCreate = () => {
    const name = newClassName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "").replace(/^-+/, "");
    if (!name) return;
    const def = createDefaultAnimClass(name);
    setAnimClasses((prev) => [...prev, def]);
    setSelectedId(def.id);
    setNewClassName(""); setShowCreate(false);
    injectCSS(def);
  };

  const handleApplyPreset = (preset: AnimPreset) => {
    const name = newClassName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "").replace(/^-+/, "") || preset.label.toLowerCase().replace(/\s+/g, "-");
    const def = createDefaultAnimClass(name);
    def.trigger = preset.trigger;
    def.keyframeCSS = preset.keyframeCSS;
    def.duration = preset.duration;
    def.easing = preset.easing;
    def.fillMode = preset.fillMode;
    def.iterationCount = preset.iterationCount;
    if (preset.timeline) def.timeline = preset.timeline;
    if (preset.range) def.range = preset.range;
    setAnimClasses((prev) => [...prev, def]);
    setSelectedId(def.id);
    setNewClassName(""); setShowCreate(false); setShowPresets(false);
    injectCSS(def);
  };

  const updateSelected = (patch: Partial<AnimationClassDef>) => {
    if (!selectedId) return;
    setAnimClasses((prev) =>
      prev.map((a) => {
        if (a.id !== selectedId) return a;
        const updated = { ...a, ...patch };
        setTimeout(() => injectCSS(updated), 0);
        return updated;
      })
    );
  };

  const handleKeyframeApply = (css: string) => {
    updateSelected({ keyframeCSS: css });
  };

  const deleteSelected = () => {
    if (!selectedId || !selected) return;
    const remaining = animClasses.filter((a) => a.id !== selectedId);
    onDeleteAnimationClass(selected.className);
    onInjectObserverScript(remaining.some((a) => a.trigger === "view"));
    setAnimClasses(remaining);
    setSelectedId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1e] text-zinc-300 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#2a2a2e]/60 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Animations</span>
          <button onClick={() => { setShowCreate(true); setShowPresets(false); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors">
            <Plus size={11} /> New
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-3 py-2.5 border-b border-[#2a2a2e]/60 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-zinc-500">.</span>
            <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
              placeholder="class-name" autoFocus
              className="flex-1 rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleCreate} className="flex-1 py-1.5 rounded-md bg-emerald-500/20 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors">Create Empty</button>
            <button onClick={() => setShowPresets(!showPresets)} className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-colors ${showPresets ? "bg-violet-500/20 text-violet-300" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"}`}>From Preset</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md bg-zinc-800/60 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"><X size={10} /></button>
          </div>
          {showPresets && (
            <div className="max-h-[200px] overflow-y-auto rounded-md border border-zinc-700/40 bg-zinc-900/60">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => handleApplyPreset(p)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-zinc-700/50 transition-colors">
                  <span className="text-[11px] text-zinc-300">{p.label}</span>
                  <span className="text-[9px] text-zinc-600">{p.trigger}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Class list */}
      <div className="flex-1 overflow-y-auto">
        {animClasses.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
            <Play size={20} className="text-zinc-700" />
            <p className="text-[11px]">No animation classes yet</p>
            <button onClick={() => setShowCreate(true)} className="text-[10px] text-emerald-400 hover:underline">Create one</button>
          </div>
        )}

        {animClasses.map((ac) => (
          <div key={ac.id}>
            <button onClick={() => setSelectedId(selectedId === ac.id ? null : ac.id)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${selectedId === ac.id ? "bg-violet-500/10 text-violet-300" : "hover:bg-zinc-800/60 text-zinc-300"}`}>
              {selectedId === ac.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="text-[11px] font-mono">.{ac.className}</span>
              <span className="text-[9px] text-zinc-600 ml-auto">{ac.trigger}</span>
            </button>

            {selectedId === ac.id && selected && (
              <div className="px-3 pb-3 space-y-3 border-b border-zinc-700/20">
                {/* Trigger selector */}
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <FieldLabel>Trigger</FieldLabel>
                    <button onClick={() => setShowCssModal(true)} title="View generated CSS"
                      className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-500 hover:text-violet-300 hover:bg-violet-500/10 transition-colors">
                      <Code size={11} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {TRIGGER_OPTIONS.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button key={t.type} onClick={() => updateSelected({ trigger: t.type })}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] transition-colors ${
                            selected.trigger === t.type ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-zinc-800/40 text-zinc-400 border border-zinc-700/20 hover:border-zinc-600"
                          }`}>
                          <Icon size={11} />
                          <span className="font-medium">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Class trigger options */}
                {selected.trigger === "class" && (
                  <div className="space-y-2 rounded-md bg-zinc-800/30 p-2 border border-zinc-700/20">
                    <div>
                      <FieldLabel>Activation Class</FieldLabel>
                      <input type="text" value={selected.activationClass}
                        onChange={(e) => updateSelected({ activationClass: e.target.value.replace(/\s+/g, "-") })}
                        placeholder="e.g. is-active"
                        className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selected.isParentClass}
                        onChange={(e) => updateSelected({ isParentClass: e.target.checked })}
                        className="rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500/30 w-3.5 h-3.5" />
                      <span className="text-[10px] text-zinc-400">Is parent class</span>
                    </label>
                    <div className="text-[9px] font-mono text-zinc-600 bg-zinc-900/60 rounded px-2 py-1">
                      {selected.isParentClass
                        ? `.${selected.activationClass || "?"} .${selected.className}`
                        : `.${selected.className}.${selected.activationClass || "?"}`}
                    </div>
                  </div>
                )}

                {/* Timing controls */}
                <div className="grid grid-cols-2 gap-2">
                  <MiniSelect label="Duration" value={selected.duration} onChange={(v) => updateSelected({ duration: v })} options={DURATION_OPTIONS} />
                  <MiniSelect label="Easing" value={selected.easing} onChange={(v) => updateSelected({ easing: v })} options={EASING_OPTIONS} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniSelect label="Direction" value={selected.direction} onChange={(v) => updateSelected({ direction: v })} options={DIRECTION_OPTIONS} />
                  <MiniSelect label="Fill Mode" value={selected.fillMode} onChange={(v) => updateSelected({ fillMode: v })} options={FILL_OPTIONS} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniSelect label="Count" value={selected.iterationCount} onChange={(v) => updateSelected({ iterationCount: v })} options={COUNT_OPTIONS} />
                  <div>
                    <FieldLabel>Delay</FieldLabel>
                    <input type="text" value={selected.delay} onChange={(e) => updateSelected({ delay: e.target.value })}
                      className="w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-500 focus:outline-none transition-colors" placeholder="0s" />
                  </div>
                </div>

                {/* Scroll-specific */}
                {selected.trigger === "scroll" && (
                  <div className="border-t border-zinc-700/20 pt-2 grid grid-cols-2 gap-2">
                    <MiniSelect label="Timeline" value={selected.timeline} onChange={(v) => updateSelected({ timeline: v })} options={TIMELINE_OPTIONS} />
                    <MiniSelect label="Range" value={selected.range} onChange={(v) => updateSelected({ range: v })} options={RANGE_OPTIONS} />
                  </div>
                )}

                {/* View note */}
                {selected.trigger === "view" && (
                  <div className="rounded-md bg-sky-500/5 border border-sky-500/20 px-2.5 py-1.5 text-[9px] text-sky-400/80">
                    Uses IntersectionObserver. Class <span className="font-mono">.gl-in-view</span> is added when the element enters the viewport.
                  </div>
                )}

                {/* Keyframes section */}
                <div className="border-t border-zinc-700/20 pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <FieldLabel>Keyframes</FieldLabel>
                    <span className="text-[9px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">@{selected.keyframeName}</span>
                  </div>
                  <button onClick={() => setShowKeyframeBuilder(true)}
                    className="w-full px-3 py-2 rounded-md border border-zinc-700/40 bg-zinc-800/40 text-[11px] text-zinc-400 hover:text-violet-300 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-center">
                    Open Keyframe Builder
                  </button>
                  {selected.keyframeCSS && (
                    <div className="mt-2 p-2 rounded-md bg-zinc-900/60 border border-zinc-700/20">
                      <pre className="text-[9px] font-mono text-zinc-500 whitespace-pre-wrap max-h-20 overflow-y-auto">{selected.keyframeCSS}</pre>
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div>
                  <FieldLabel>Preview</FieldLabel>
                  <style>{`@keyframes ${selected.keyframeName} { ${selected.keyframeCSS} }`}</style>
                  <div className="flex items-center justify-center h-14 bg-zinc-800/40 rounded-lg border border-zinc-700/20">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600"
                      style={{ animation: `${selected.keyframeName} ${selected.duration} ${selected.easing} infinite alternate` }} />
                  </div>
                </div>

                {/* Delete */}
                <button onClick={deleteSelected}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full justify-center">
                  <Trash2 size={10} /> Delete animation class
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Keyframe Builder Modal */}
      {showKeyframeBuilder && selected && (
        <KeyframeBuilderModal
          name={selected.keyframeName}
          initialCSS={selected.keyframeCSS}
          onApply={handleKeyframeApply}
          onClose={() => setShowKeyframeBuilder(false)}
        />
      )}

      {/* CSS Code Modal */}
      {showCssModal && selected && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setShowCssModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-[#1a1a1e] border border-zinc-700/60 rounded-xl shadow-2xl w-[440px] max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
              <div className="flex items-center gap-2">
                <Code size={12} className="text-violet-400" />
                <span className="text-[12px] font-semibold text-zinc-200">Generated CSS</span>
                <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">.{selected.className}</span>
              </div>
              <button onClick={() => setShowCssModal(false)} className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/60 rounded-lg p-3 whitespace-pre-wrap border border-zinc-700/20 leading-relaxed">
                {generateClassCSS(selected)}
              </pre>
            </div>
            <div className="flex items-center justify-end px-4 py-3 border-t border-zinc-700/40">
              <button onClick={() => {
                navigator.clipboard.writeText(generateClassCSS(selected));
              }} className="px-4 py-1.5 rounded-md text-[11px] font-medium text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm">
                Copy CSS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
