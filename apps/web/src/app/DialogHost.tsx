/**
 * Dialog host.
 *
 * Implements the promise-based `DialogApi` the host layer depends on, using
 * accessible in-app modals. This replaces VS Code's `showInputBox`,
 * `showQuickPick`, `showOpenDialog` and `showInformationMessage`.
 *
 * The provider also exposes a `toast` channel so host code can surface
 * non-blocking notices.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import type { ChooseOptions, DialogApi, PromptOptions } from "@/platform/host/dialogs";
import { DirectoryWorkspace } from "@/platform/fs/directoryWorkspace";

interface PendingPrompt extends PromptOptions {
  kind: "prompt";
  resolve: (value: string | null) => void;
}

interface PendingChoose extends ChooseOptions {
  kind: "choose";
  resolve: (value: number | null) => void;
}

interface PendingConfirm {
  kind: "confirm";
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

type Pending = PendingPrompt | PendingChoose | PendingConfirm;

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used inside <DialogHostProvider>");
  return ctx;
}

export function DialogHostProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);

  const enqueue = useCallback((next: Pending) => {
    setPending((current) => {
      if (current) {
        queue.current.push(next);
        return current;
      }
      return next;
    });
  }, []);

  const settle = useCallback(() => {
    const next = queue.current.shift() ?? null;
    setPending(next);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      prompt: (options) =>
        new Promise<string | null>((resolve) => enqueue({ kind: "prompt", ...options, resolve })),
      choose: (options) =>
        new Promise<number | null>((resolve) => enqueue({ kind: "choose", ...options, resolve })),
      chooseScreenshotTarget: ({ suggestedFolder, count }) =>
        new Promise<string | null>((resolve) =>
          enqueue({
            kind: "confirm",
            title: "Save screenshots",
            message:
              count === 1
                ? `Save 1 screenshot into “${suggestedFolder}”?`
                : `Save ${count} screenshots into “${suggestedFolder}”?`,
            confirmLabel: "Save",
            resolve: (ok) => resolve(ok ? suggestedFolder : null),
          })
        ),
      requestDirectory: async () => {
        const workspace = await DirectoryWorkspace.pick();
        return workspace !== null;
      },
      confirm: (options) =>
        new Promise<boolean>((resolve) =>
          enqueue({
            kind: "confirm",
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel,
            danger: options.danger,
            resolve,
          })
        ),
    }),
    [enqueue]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && <DialogView pending={pending} onSettle={settle} />}
    </DialogContext.Provider>
  );
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function DialogView({ pending, onSettle }: { pending: Pending; onSettle: () => void }) {
  const [value, setValue] = useState(pending.kind === "prompt" ? (pending.value ?? "") : "");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending.kind === "prompt") {
      setValue(pending.value ?? "");
      // Focus after the modal paints.
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    } else {
      setSelected(0);
    }
  }, [pending]);

  const finish = useCallback(
    (result: string | number | boolean | null) => {
      if (pending.kind === "prompt") pending.resolve(result as string | null);
      else if (pending.kind === "choose") pending.resolve(result as number | null);
      else pending.resolve(result as boolean);
      onSettle();
    },
    [pending, onSettle]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  return (
    <div className="rd-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(null)}>
      <div className="rd-modal w-[440px]">
        <header className="rd-modal-header">
          <h2 className="text-[12.5px] font-semibold text-slate-100">{pending.title}</h2>
          <button type="button" className="rd-icon-btn" onClick={() => finish(null)} aria-label="Close">
            <X size={13} />
          </button>
        </header>

        <div className="px-4 py-3.5">
          {pending.kind === "prompt" && (
            <div className="space-y-2">
              {pending.label && <label className="rd-label block">{pending.label}</label>}
              <input
                ref={inputRef}
                className="rd-input"
                value={value}
                placeholder={pending.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    finish(value);
                  }
                }}
              />
              {pending.hint && <p className="rd-hint">{pending.hint}</p>}
            </div>
          )}

          {pending.kind === "choose" && (
            <ul className="space-y-1">
              {pending.options.map((option, index) => (
                <li key={option}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                      index === selected
                        ? "border-accent-500/50 bg-accent-500/15"
                        : "border-white/[0.07] hover:bg-white/[0.05]"
                    }`}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => finish(index)}
                  >
                    <span className="text-[12px] text-slate-100">{option}</span>
                    {pending.descriptions?.[index] && (
                      <span className="text-[10.5px] text-slate-400">{pending.descriptions[index]}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pending.kind === "confirm" && (
            <p className="text-[11.5px] leading-relaxed text-slate-300">{pending.message}</p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3">
          <button type="button" className="rd-btn-ghost" onClick={() => finish(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={pending.kind === "confirm" && pending.danger ? "rd-btn-danger" : "rd-btn-primary"}
            onClick={() =>
              finish(pending.kind === "prompt" ? value : pending.kind === "choose" ? selected : true)
            }
          >
            {pending.kind === "prompt" ? (pending.confirmLabel ?? "OK") : pending.kind === "choose" ? "Choose" : (pending.confirmLabel ?? "Confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export type ToastLevel = "info" | "error" | "success";
export interface Toast {
  id: number;
  message: string;
  level: ToastLevel;
}

const TOAST_EVENT = "rachana:toast";

/** Publish a toast from anywhere (including non-React host code). */
export function pushToast(message: string, level: ToastLevel = "info"): void {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, level } }));
}

/** Render the toast stack. Mounted once by the app shell. */
export function ToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let id = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; level: ToastLevel }>).detail;
      const toast: Toast = { id: ++id, message: detail.message, level: detail.level ?? "info" };
      setToasts((prev) => [...prev.slice(-4), toast]);
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 5200);
    };
    window.addEventListener(TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(TOAST_EVENT, onToast as EventListener);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-[520px] -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[11.5px] shadow-panel backdrop-blur ${
            toast.level === "error"
              ? "border-red-500/30 bg-red-950/85 text-red-100"
              : toast.level === "success"
                ? "border-emerald-500/30 bg-emerald-950/85 text-emerald-100"
                : "border-accent-500/30 bg-shell-900/95 text-slate-100"
          }`}
        >
          {toast.level === "error" ? (
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          ) : toast.level === "success" ? (
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
          ) : (
            <Info size={13} className="mt-0.5 shrink-0" />
          )}
          <span className="leading-relaxed">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

/** Small inline busy indicator reused by panels. */
export function Busy({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-400">
      <Loader2 size={12} className="animate-spin" />
      {label}
    </span>
  );
}
