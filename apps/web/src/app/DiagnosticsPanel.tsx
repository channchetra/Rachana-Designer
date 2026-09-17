/**
 * Diagnostics drawer.
 *
 * A small developer-facing log of every host round-trip. It is invaluable when
 * a ported feature misbehaves, because it shows the exact message shapes the UI
 * and the host exchanged — the same information VS Code's "Developer: Open
 * Webview Developer Tools" gave for the extension.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Trash2, X, Bug } from "lucide-react";
import { subscribeHostMessages } from "@/platform/host/hostEvents";
import { pushToast } from "./DialogHost";

interface Entry {
  id: number;
  direction: "to-host" | "to-ui";
  type: string;
  detail: string;
  at: number;
}

const MAX_ENTRIES = 300;

export function DiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paused, setPaused] = useState(false);
  const counter = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("rachana:toggle-diagnostics", onToggle);
    return () => window.removeEventListener("rachana:toggle-diagnostics", onToggle);
  }, []);

  useEffect(() => {
    return subscribeHostMessages((msg) => {
      if (paused) return;
      counter.current += 1;
      const detail = summarize(msg as unknown as Record<string, unknown>);
      setEntries((prev) => [
        ...prev.slice(-(MAX_ENTRIES - 1)),
        { id: counter.current, direction: "to-ui", type: msg.type, detail, at: Date.now() },
      ]);
    });
  }, [paused]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries, open]);

  const copyAll = useCallback(() => {
    const text = entries
      .map((e) => `${new Date(e.at).toISOString()} ${e.direction} ${e.type} ${e.detail}`)
      .join("\n");
    void navigator.clipboard?.writeText(text).then(
      () => pushToast("Diagnostics copied", "success"),
      () => pushToast("Clipboard unavailable", "error")
    );
  }, [entries]);

  if (!open) return null;

  return (
    <aside className="flex h-[260px] shrink-0 flex-col border-t border-white/[0.07] bg-shell-900">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-accent-300" />
          {/* A real heading, so screen readers can navigate to the drawer by
              heading rather than by guessing at a styled span. */}
          <h2 className="text-[11px] font-semibold text-slate-200">Host messages</h2>
          <span className="rd-hint">{entries.length} captured</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="mr-1 flex cursor-pointer items-center gap-1 text-[10px] text-slate-400">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            Pause
          </label>
          <button type="button" className="rd-icon-btn" title="Copy log" onClick={copyAll}>
            <Bug size={12} />
          </button>
          <button type="button" className="rd-icon-btn" title="Clear" onClick={() => setEntries([])}>
            <Trash2 size={12} />
          </button>
          <button type="button" className="rd-icon-btn" title="Close" onClick={() => setOpen(false)}>
            <X size={12} />
          </button>
        </div>
      </header>

      <div ref={listRef} className="rd-scroll flex-1 px-3 py-2 font-mono text-[10.5px] leading-relaxed">
        {entries.length === 0 ? (
          <p className="text-slate-500">No host messages yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-2 border-b border-white/[0.04] py-0.5">
              <span className="shrink-0 text-slate-600">
                {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
              </span>
              <span
                className={`w-[54px] shrink-0 ${
                  entry.direction === "to-ui" ? "text-accent-300" : "text-emerald-300"
                }`}
              >
                {entry.direction}
              </span>
              <span className="shrink-0 text-slate-200">{entry.type}</span>
              <span className="min-w-0 flex-1 truncate text-slate-500" title={entry.detail}>
                {entry.detail}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

/** Compact one-line summary of a host message's payload. */
function summarize(msg: Record<string, unknown>): string {
  return Object.entries(msg)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${key}=null`;
      if (typeof value === "string") return `${key}="${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`;
      if (typeof value === "number" || typeof value === "boolean") return `${key}=${value}`;
      if (Array.isArray(value)) return `${key}[${value.length}]`;
      if (typeof value === "object") return `${key}{${Object.keys(value).slice(0, 5).join(",")}}`;
      return `${key}=?`;
    })
    .join("  ");
}
