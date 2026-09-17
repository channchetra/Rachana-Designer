
import { StyleInfo } from "@/types/editor";
import { useState, useMemo, useRef, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";

interface AttributesPanelProps {
  styles: StyleInfo;
  onAttributeChange: (name: string, value: string) => void;
  onAttributeRemove: (name: string) => void;
}

export function AttributesPanel({ styles, onAttributeChange, onAttributeRemove }: AttributesPanelProps) {
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const newNameRef = useRef<HTMLInputElement>(null);

  const allAttributes = useMemo(() => {
    return Object.entries(styles.attributes || {}).sort(([a], [b]) => a.localeCompare(b));
  }, [styles.attributes]);

  const startEdit = (name: string, value: string) => {
    setEditingAttr(name);
    setEditValue(value);
  };

  const commitEdit = () => {
    if (editingAttr) {
      onAttributeChange(editingAttr, editValue);
      setEditingAttr(null);
    }
  };

  const cancelEdit = () => {
    setEditingAttr(null);
  };

  const startAdd = () => {
    setAddingNew(true);
    setNewName("");
    setNewValue("");
    setTimeout(() => newNameRef.current?.focus(), 0);
  };

  const commitAdd = () => {
    const name = newName.trim();
    if (name) {
      onAttributeChange(name, newValue);
    }
    setAddingNew(false);
    setNewName("");
    setNewValue("");
  };

  const cancelAdd = () => {
    setAddingNew(false);
    setNewName("");
    setNewValue("");
  };

  useEffect(() => {
    if (addingNew && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [addingNew]);

  return (
    <div className="flex flex-col h-full">
      {/* Attributes list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-zinc-800/30">
          {allAttributes.map(([name, value]) => {
            const isEditing = editingAttr === name;

            return (
              <div
                key={name}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-900/40 transition-colors"
              >
                <span className="text-[11px] font-mono shrink-0 w-[35%] pt-0.5 truncate text-cyan-400" title={name}>
                  {name}
                </span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    className="flex-1 min-w-0 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 focus:border-zinc-500 focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(name, value)}
                    className="flex-1 min-w-0 text-[11px] font-mono text-zinc-400 truncate pt-0.5 cursor-text hover:text-zinc-200 transition-colors"
                    title={value}
                  >
                    {value || <span className="text-zinc-700 italic">empty</span>}
                  </span>
                )}
                <button
                  onClick={() => onAttributeRemove(name)}
                  className="flex items-center justify-center w-5 h-5 rounded text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                  title={`Remove ${name}`}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add new attribute row */}
        {addingNew && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-800/30">
            <input
              ref={newNameRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="name"
              className="w-[35%] shrink-0 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") cancelAdd();
              }}
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              className="flex-1 min-w-0 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") cancelAdd();
              }}
            />
            <button
              onClick={cancelAdd}
              className="flex items-center justify-center w-5 h-5 rounded text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {/* Add button inline after attributes */}
        {!addingNew && (
          <div className="px-3 py-1.5">
            <button
              onClick={startAdd}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus size={12} />
              <span>Add attribute</span>
            </button>
          </div>
        )}

        {allAttributes.length === 0 && !addingNew && (
          <div className="flex items-center justify-center py-8 text-xs text-zinc-600">
            No attributes
          </div>
        )}
      </div>
    </div>
  );
}
