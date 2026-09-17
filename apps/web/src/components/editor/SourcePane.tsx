/**
 * Source pane.
 *
 * Live mode lets the user jump from a clicked element to the exact line of
 * source that produced it. In VS Code that opened a split text editor; here it
 * reveals an in-app CodeMirror pane beside the canvas, scrolled to the line and
 * column that was requested.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { Save, X, Loader2, Check, AlertCircle } from "lucide-react";
import { useHostBridge } from "@/platform/host/HostBridgeProvider";
import { basename } from "@/platform/fs/types";

export interface SourcePaneProps {
  path: string;
  line?: number;
  column?: number;
  onClose: () => void;
}

export function SourcePane({ path, line, column, onClose }: SourcePaneProps) {
  const { workspace } = useHostBridge();
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const scrollRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const text = await workspace.readText(path);
        if (cancelled) return;
        setValue(text);
        setOriginal(text);
        scrollRef.current = true;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not read the file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace, path]);

  const dirty = value !== original;

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      await workspace.writeText(path, value);
      setOriginal(value);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStatus("idle");
    }
  }, [workspace, path, value]);

  // Ctrl/Cmd+S saves without leaving the pane.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const extensions = useMemo(() => [html(), EditorView.lineWrapping], []);

  return (
    <aside className="flex w-[520px] shrink-0 flex-col overflow-hidden border-l border-white/[0.07] bg-shell-900">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-[11px] text-slate-300" title={path}>
            {basename(path)}
          </span>
          {line ? (
            <span className="rd-badge">
              {line}:{column ?? 1}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === "saving" && <Loader2 size={12} className="animate-spin text-slate-400" />}
          {status === "saved" && <Check size={12} className="text-emerald-400" />}
          <button
            type="button"
            className="rd-icon-btn"
            title="Save (Ctrl/Cmd+S)"
            onClick={() => void save()}
            disabled={!dirty}
          >
            <Save size={13} />
          </button>
          <button type="button" className="rd-icon-btn" title="Close source pane" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          <AlertCircle size={12} className="shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[11px] text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <CodeMirror
            value={value}
            height="100%"
            theme={oneDark}
            extensions={extensions}
            onChange={setValue}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
            style={{ fontSize: 11.5 }}
          />
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-500">
        <span>{dirty ? "Unsaved changes" : "Saved"}</span>
        <span className="font-mono">{path}</span>
      </footer>
    </aside>
  );
}
