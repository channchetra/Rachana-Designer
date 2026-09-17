import { useState, useRef, useEffect } from "react";
import type { ParentToIframeMessage } from "@/types/editor";

interface MarkdownToolbarProps {
  sendMessage: (msg: ParentToIframeMessage) => void;
}

type FormatAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "heading"
  | "unorderedList"
  | "orderedList"
  | "table"
  | "blockquote"
  | "pre"
  | "code"
  | "link"
  | "image";

interface ToolbarButton {
  action: FormatAction;
  label: string;
  icon: React.ReactElement;
  hasDropdown?: boolean;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export function MarkdownToolbar({ sendMessage }: MarkdownToolbarProps) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setShowHeadingMenu(false);
      }
    }
    if (showHeadingMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showHeadingMenu]);

  const execFormat = (action: FormatAction, value?: string) => {
    sendMessage({ type: "MD_FORMAT", action, value } as ParentToIframeMessage);
  };

  // Prevent mousedown from stealing focus from iframe
  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const buttons: ToolbarButton[] = [
    {
      action: "bold",
      label: "Bold",
      icon: <span className="font-bold text-[13px]">B</span>,
    },
    {
      action: "italic",
      label: "Italic",
      icon: <span className="italic text-[13px] font-serif">I</span>,
    },
    {
      action: "strikethrough",
      label: "Strikethrough",
      icon: <span className="line-through text-[13px]">S</span>,
    },
    {
      action: "heading",
      label: "Heading",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M17 12l3 6" /><path d="M20 12l-3 6" />
        </svg>
      ),
      hasDropdown: true,
    },
    {
      action: "unorderedList",
      label: "Bullet List",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3" cy="6" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="3" cy="18" r="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      action: "orderedList",
      label: "Numbered List",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
          <text x="1" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="1" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="1" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      ),
    },
    {
      action: "table",
      label: "Table",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
    },
    {
      action: "blockquote",
      label: "Blockquote",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M3 6h3c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2H3v-6z" /><path d="M3 14c0 2 1 3 3 3" />
          <path d="M13 6h3c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-3v-6z" /><path d="M13 14c0 2 1 3 3 3" />
        </svg>
      ),
    },
    {
      action: "pre",
      label: "Inline Code",
      icon: <span className="font-mono text-[10px] font-semibold tracking-wide">PRE</span>,
    },
    {
      action: "code",
      label: "Code Block",
      icon: <span className="font-mono text-[11px] font-semibold">```</span>,
    },
    {
      action: "link",
      label: "Link",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
    },
    {
      action: "image",
      label: "Image",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800 rounded-lg border border-zinc-700/50"
      onMouseDown={preventFocusLoss}
    >
      {buttons.map((btn, i) => {
        if (btn.action === "heading") {
          return (
            <div key={btn.action} className="relative" ref={headingRef}>
              <button
                onClick={() => setShowHeadingMenu(!showHeadingMenu)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  showHeadingMenu
                    ? "text-emerald-400 bg-emerald-950"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                }`}
                title={btn.label}
              >
                {btn.icon}
              </button>
              {showHeadingMenu && (
                <div className="absolute left-0 top-full mt-1 w-32 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl z-50">
                  {HEADING_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        execFormat("heading", `h${level}`);
                        setShowHeadingMenu(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <span className="font-semibold" style={{ fontSize: `${1.1 - level * 0.08}em` }}>
                        H{level}
                      </span>
                      <span className="text-zinc-500">Heading {level}</span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-700 my-1" />
                  <button
                    onClick={() => {
                      execFormat("heading", "p");
                      setShowHeadingMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <span>P</span>
                    <span className="text-zinc-500">Paragraph</span>
                  </button>
                </div>
              )}
            </div>
          );
        }

        return (
          <span key={btn.action} className="contents">
            {(btn.action === "unorderedList" || btn.action === "table" || btn.action === "pre" || btn.action === "link") && (
              <div className="w-px h-4 bg-zinc-700 mx-0.5" />
            )}
            <button
              onClick={() => execFormat(btn.action)}
              className={`flex h-7 items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors ${
                btn.action === "pre" || btn.action === "code" ? "min-w-7 px-2" : "w-7"
              }`}
              title={btn.label}
            >
              {btn.icon}
            </button>
          </span>
        );
      })}
    </div>
  );
}
