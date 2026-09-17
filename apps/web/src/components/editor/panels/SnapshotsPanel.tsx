import { useState, useRef, useEffect } from "react";
import { History, Save, Upload, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";

interface SnapshotsPanelProps {
  /** Request current HTML capture. The caller should call onHtmlCaptured when ready. */
  onRequestCapture: (targetSnapshotId: string | null) => void;
  onLoadSnapshot: (html: string) => void;
}

export function SnapshotsPanel({ onRequestCapture, onLoadSnapshot }: SnapshotsPanelProps) {
  const { snapshots, renameSnapshot, deleteSnapshot } = useEditorStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const confirmRename = () => {
    if (editingId && editName.trim()) {
      renameSnapshot(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const cancelRename = () => setEditingId(null);

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <History size={14} className="text-amber-400" />
          <span className="text-xs font-medium text-zinc-200">Snapshots</span>
        </div>
        <span className="text-[10px] text-zinc-500">{snapshots.length}</span>
      </div>

      {/* Add snapshot button — always available; there is no licence tier. */}
      <div className="px-2 py-2 border-b border-zinc-800/50 shrink-0">
        <button
          onClick={() => onRequestCapture(null)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 text-[11px] font-medium transition-colors"
        >
          <Plus size={12} />
          Save Current as Snapshot
        </button>
      </div>

      {/* Snapshot list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {snapshots.length === 0 && (
          <div className="text-center py-10 px-4">
            <History size={24} className="text-zinc-800 mx-auto mb-3" />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              No snapshots yet. Save your current state to create one.
            </p>
          </div>
        )}

        {snapshots.map((snap) => (
          <div
            key={snap.id}
            className="group rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 transition-colors"
          >
            {/* Name row */}
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              {editingId === snap.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <input
                    ref={inputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="flex-1 min-w-0 bg-zinc-800 text-zinc-200 text-[11px] px-1.5 py-0.5 rounded border border-zinc-700 outline-none focus:border-amber-500"
                  />
                  <button onClick={confirmRename} className="p-0.5 text-emerald-400 hover:text-emerald-300">
                    <Check size={12} />
                  </button>
                  <button onClick={cancelRename} className="p-0.5 text-zinc-500 hover:text-zinc-300">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-[11px] text-zinc-300 truncate flex-1 min-w-0">{snap.name}</span>
                  <span className="text-[9px] text-zinc-600 shrink-0">
                    {new Date(snap.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => startRename(snap.id, snap.name)}
                      className="p-0.5 text-zinc-500 hover:text-zinc-300"
                      title="Rename"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={() => deleteSnapshot(snap.id)}
                      className="p-0.5 text-zinc-500 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Action buttons */}
            {editingId !== snap.id && (
              <div className="flex border-t border-zinc-800/50">
                <button
                  onClick={() => onRequestCapture(snap.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-zinc-500 hover:text-amber-400 hover:bg-amber-600/10 transition-colors border-r border-zinc-800/50"
                  title="Overwrite this snapshot with current state"
                >
                  <Save size={10} />
                  Save Current
                </button>
                <button
                  onClick={() => onLoadSnapshot(snap.html)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-zinc-500 hover:text-emerald-400 hover:bg-emerald-600/10 transition-colors"
                  title="Load this snapshot"
                >
                  <Upload size={10} />
                  Load
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
