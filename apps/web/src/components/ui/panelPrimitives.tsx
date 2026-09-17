/**
 * Shared property-panel primitives.
 *
 * The original editor copy-pasted four small helpers into every panel: a CSS
 * cascade resolver, a field label, a side label and a preset popover. That grew
 * to ~35 near-identical copies across 19 files, which is the main reason the
 * panel layer was hard to change.
 *
 * This module is the single source of truth for them. Every panel imports from
 * here, so a change to field spacing, popover behaviour or cascade priority now
 * happens once.
 *
 * Behaviour is deliberately identical to the copies it replaces. Where the
 * original had genuine variants (`PresetSelect` with deferred vs. immediate
 * commits, `BorderPanel`'s shorthand `var()` probe), both behaviours are
 * preserved behind explicit, named exports rather than silently unified.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DescendantStyleInfo, StyleInfo } from "@/types/editor";

/* ------------------------------------------------------------------ *
 * CSS cascade resolution
 * ------------------------------------------------------------------ */

/** Any style snapshot shape: a panel's `StyleInfo`, or a descendant's. */
export type StyleSnapshot = StyleInfo | DescendantStyleInfo;

/** The three sources an author can actually edit (no browser defaults). */
export type ExplicitSource = "inline" | "id" | "class";

/** Every source, including the browser's computed value. */
export type ValueSource = ExplicitSource | "computed" | "none";

/**
 * Resolve a property through the full cascade:
 * `inline > #id rules > .class rules > computed`.
 *
 * A panel needs the computed value so it can show what the element actually
 * renders, even when nothing author-set exists yet.
 */
export function getEffectiveValue(styles: StyleSnapshot, prop: string): string {
  return (
    styles.inline[prop] ||
    styles.idRules[prop] ||
    styles.classRules[prop] ||
    styles.computed[prop] ||
    ""
  );
}

/**
 * Resolve a property using author-set values only.
 *
 * Used where showing an inherited/computed value would be misleading — spacing
 * and position fields, which need to distinguish "I set this" from "the browser
 * happens to compute this".
 */
export function getExplicitValue(styles: StyleSnapshot, prop: string): string {
  return styles.inline[prop] || styles.idRules[prop] || styles.classRules[prop] || "";
}

/**
 * Shorthand border properties whose longhand sides a browser may decompose.
 * Used to detect a `var()` reference hiding in a longhand.
 */
const BORDER_SHORTHAND_SUB: Record<string, string> = {
  "border-color": "border-top-color",
  "border-width": "border-top-width",
  "border-style": "border-top-style",
};

/**
 * Border-aware resolution.
 *
 * Browsers often expand `border: 1px solid var(--x)` into longhands, so the
 * shorthand reads empty while `border-top-color` holds the real `var()`. This
 * prefers that longhand so the panel shows the token instead of the resolved
 * colour.
 */
export function getBorderEffectiveValue(styles: StyleSnapshot, prop: string): string {
  const direct = styles.inline[prop] || styles.idRules[prop] || styles.classRules[prop];
  if (direct) return direct;

  const sub = BORDER_SHORTHAND_SUB[prop];
  if (sub) {
    const subVal = styles.inline[sub] || styles.idRules[sub] || styles.classRules[sub];
    if (subVal && subVal.startsWith("var(")) return subVal;
  }

  return styles.computed[prop] || "";
}

/** Which cascade tier supplied a property's value. Drives the CSS inspector badges. */
export function getValueSource(styles: StyleSnapshot, prop: string): ValueSource {
  if (styles.inline[prop]) return "inline";
  if (styles.idRules[prop]) return "id";
  if (styles.classRules[prop]) return "class";
  if (styles.computed[prop]) return "computed";
  return "none";
}

/* ------------------------------------------------------------------ *
 * Field chrome
 * ------------------------------------------------------------------ */

/** Small uppercase field label used by every style panel. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[10px] font-medium text-zinc-500 tracking-wide mb-1 block">
      {children}
    </label>
  );
}

/**
 * Denser label variant used by the animation panel, which needs more fields on
 * screen at once.
 */
export function DenseFieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[9px] font-medium uppercase tracking-wide text-zinc-600 mb-1">
      {children}
    </label>
  );
}

/** Compact box-side abbreviation (T / R / B / L). */
export function SideIcon({ label }: { label: string }) {
  return <span className="text-[9px] font-semibold leading-none">{label}</span>;
}

/* ------------------------------------------------------------------ *
 * Popovers
 * ------------------------------------------------------------------ */

const POPOVER_INPUT_CLASS =
  "w-full rounded-md border border-zinc-700/40 bg-zinc-800/60 px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none transition-colors";

const POPOVER_PANEL_CLASS =
  "absolute left-0 top-full mt-1 w-full max-h-40 rounded-lg border border-zinc-700/60 bg-[#1e1e22] shadow-xl z-50 overflow-y-auto";

const POPOVER_ITEM_CLASS = "w-full px-3 py-1.5 text-left text-[11px] hover:bg-zinc-800/60 transition-colors";

export interface PresetOption {
  label: string;
  value: string;
}

export interface PresetSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: PresetOption[];
  placeholder?: string;
  /**
   * `"commit"` (default) writes every keystroke straight through — the size and
   * transform panels' behaviour. `"defer"` keeps a local copy and only commits
   * on change of the popover selection or on blur — the effects panel's
   * behaviour, which avoids re-rendering the canvas while the user is mid-word.
   */
  commitMode?: "commit" | "defer";
}

/**
 * Text input with a click-to-open preset list.
 *
 * The original shipped three implementations of this control with subtly
 * different commit behaviour; the difference is real and user-visible, so it is
 * exposed as `commitMode` rather than averaged away.
 */
export function PresetSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "auto",
  commitMode = "commit",
}: PresetSelectProps) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Deferred mode mirrors the prop only while the field is unfocused, so
  // external changes land but in-progress typing is never clobbered.
  useEffect(() => {
    if (commitMode === "defer" && !focused) setLocalValue(value);
  }, [value, focused, commitMode]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleChange = useCallback(
    (next: string) => {
      if (commitMode === "defer") setLocalValue(next);
      onChange(next);
    },
    [commitMode, onChange]
  );

  const displayed = commitMode === "defer" ? localValue : value;

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div ref={ref} className="relative">
        <input
          type="text"
          value={displayed}
          onChange={(e) => handleChange(e.target.value)}
          onClick={() => setOpen(true)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className={POPOVER_INPUT_CLASS}
        />
        {open && (
          <div className={POPOVER_PANEL_CLASS}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleChange(option.value);
                  setOpen(false);
                }}
                className={`${POPOVER_ITEM_CLASS} ${
                  displayed === option.value ? "text-violet-300" : "text-zinc-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface PresetInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Either plain strings (used as both label and value) or label/value pairs. */
  presets: string[] | PresetOption[];
  placeholder?: string;
}

/**
 * Text input with a plain-string preset list, used for background size/position
 * and grid template presets.
 */
export function PresetInput({ label, value, onChange, presets, placeholder }: PresetInputProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const options: PresetOption[] = presets.map((preset) =>
    typeof preset === "string" ? { label: preset, value: preset } : preset
  );

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div ref={ref} className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          className={POPOVER_INPUT_CLASS}
        />
        {open && (
          <div className={POPOVER_PANEL_CLASS}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`${POPOVER_ITEM_CLASS} ${
                  value === option.value ? "text-violet-300" : "text-zinc-300"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Segmented control
 * ------------------------------------------------------------------ */

export interface SegmentOption<T extends string = string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  title?: string;
  viz?: ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  /** Vertical stacking, used by the flex-col direction layouts. */
  vertical?: boolean;
}

/**
 * Row of mutually exclusive buttons. Used for display, alignment, text-align,
 * overflow and similar enumerated properties.
 */
export function SegmentedControl<T extends string = string>({
  label,
  value,
  onChange,
  options,
  vertical = false,
}: SegmentedControlProps<T>) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div
        role="group"
        className={`flex ${vertical ? "flex-col" : "flex-row"} gap-1 rounded-md border border-zinc-800/60 bg-zinc-900/40 p-0.5`}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.title ?? option.label ?? option.value}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] transition-colors ${
                active
                  ? "bg-zinc-700/70 text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
              }`}
            >
              {option.viz ?? option.icon}
              {option.label && <span>{option.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Collapsible section
 * ------------------------------------------------------------------ */

export interface PanelSectionProps {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Forced open state; when set, the section cannot be collapsed by the user. */
  forceOpen?: boolean;
  /** Renders a dot indicating the section has authored values. */
  hasActive?: boolean;
  onClear?: () => void;
  children: ReactNode;
}

/**
 * Collapsible group with an optional "clear all in this section" affordance.
 * State is intentionally local: the properties panel already persists which
 * sections are open, and duplicating that here would fight it.
 */
export function PanelSection({
  title,
  icon,
  defaultOpen = true,
  forceOpen = false,
  hasActive = false,
  onClear,
  children,
}: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = forceOpen || open;

  return (
    <section className="border-b border-zinc-800/40">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          onClick={() => setOpen((v) => !v)}
          disabled={forceOpen}
        >
          {icon}
          <span className="text-[11px] font-semibold text-zinc-300">{title}</span>
          {hasActive && <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
        </button>
        {onClear && hasActive && (
          <button
            type="button"
            title={`Clear all ${title} values`}
            className="rounded px-1 text-[9px] text-zinc-500 hover:text-zinc-300"
            onClick={onClear}
          >
            clear
          </button>
        )}
      </div>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}
