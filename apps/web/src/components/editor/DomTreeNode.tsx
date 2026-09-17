import type { DomNode } from "@/types/editor";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

interface DomTreeNodeProps {
  node: DomNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onTagChange: (path: string, newTag: string) => void;
  onHover?: (path: string | null) => void;
  depth: number;
}

export function DomTreeNode({
  node,
  selectedPath,
  onSelect,
  onDelete,
  onTagChange,
  onHover,
  depth,
}: DomTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [editingTag, setEditingTag] = useState(false);
  const [tagValue, setTagValue] = useState(node.tagName);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedPath === node.path;
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-expand when a descendant is selected
  const isAncestorOfSelected =
    selectedPath !== null &&
    node.path !== "" &&
    selectedPath.startsWith(node.path + ".");

  useEffect(() => {
    if (isAncestorOfSelected) {
      setExpanded(true);
    }
  }, [isAncestorOfSelected]);

  // Scroll selected node into view
  useEffect(() => {
    if (isSelected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTag && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTag]);

  // Reset tag value when node changes
  useEffect(() => {
    setTagValue(node.tagName);
    setEditingTag(false);
  }, [node.tagName]);

  const handleTagDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTag(true);
      setTagValue(node.tagName);
    },
    [node.tagName]
  );

  const handleTagSubmit = useCallback(() => {
    const trimmed = tagValue.trim().toLowerCase();
    if (trimmed && trimmed !== node.tagName) {
      onTagChange(node.path, trimmed);
    }
    setEditingTag(false);
  }, [tagValue, node.tagName, node.path, onTagChange]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleTagSubmit();
      } else if (e.key === "Escape") {
        setEditingTag(false);
        setTagValue(node.tagName);
      }
    },
    [handleTagSubmit, node.tagName]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(node.path);
    },
    [onDelete, node.path]
  );

  const label = node.tagName;
  const idBadge = node.id ? `#${node.id}` : "";
  const classBadge =
    node.classList.length > 0 ? `.${node.classList[0]}` : "";

  return (
    <div>
      <div
        ref={nodeRef}
        className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs font-mono transition-all ${
          isSelected
            ? "bg-emerald-500/15 text-emerald-300 border-l-2 border-emerald-500/50"
            : "text-zinc-400 hover:bg-zinc-800/50 border-l-2 border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.path)}
        onMouseEnter={() => onHover?.(node.path)}
        onMouseLeave={() => onHover?.(null)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-4 w-4 items-center justify-center shrink-0 text-zinc-500"
          >
            {expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {editingTag ? (
          <>
            <span className="text-rose-400">&lt;</span>
            <input
              ref={inputRef}
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              onBlur={handleTagSubmit}
              onKeyDown={handleTagKeyDown}
              className="bg-zinc-900/80 text-rose-400 border border-zinc-700/80 rounded-sm px-1 py-0.5 w-16 text-xs font-mono outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 shadow-sm"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-rose-400">&gt;</span>
          </>
        ) : (
          <span
            className="text-rose-400"
            onDoubleClick={handleTagDoubleClick}
          >
            &lt;{label}&gt;
          </span>
        )}

        {idBadge && <span className="text-amber-400">{idBadge}</span>}
        {classBadge && <span className="text-sky-400">{classBadge}</span>}

        <button
          onClick={handleDelete}
          className={`ml-auto flex h-5 w-5 items-center justify-center rounded-md shrink-0 transition-all ${
            isSelected
              ? "text-emerald-600/50 hover:text-red-400 hover:bg-red-500/10"
              : "text-transparent group-hover:text-zinc-500 hover:!text-red-400 hover:!bg-red-500/10"
          }`}
          title="Delete element"
        >
          <Trash2 size={10} />
        </button>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <DomTreeNode
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onDelete={onDelete}
            onTagChange={onTagChange}
            onHover={onHover}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
