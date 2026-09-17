import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

const htmlErrorLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const docLen = view.state.doc.length;
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.type.isError) {
        const from = Math.min(node.from, docLen);
        const to = Math.min(Math.max(node.to, from + 1), docLen);
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: "HTML syntax error",
        });
      }
    },
  });
  return diagnostics;
});

interface SourceEditorProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

export function SourceEditor({ value, onChange, disabled, placeholder, minHeight = 200 }: SourceEditorProps) {
  const extensions = useMemo(
    () => [html(), htmlErrorLinter, lintGutter(), EditorView.lineWrapping],
    []
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={oneDark}
      editable={!disabled}
      readOnly={!!disabled}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        highlightSelectionMatches: false,
      }}
      style={{ minHeight: `${minHeight}px`, fontSize: 11 }}
      className="flex-1 overflow-hidden rounded-md border border-zinc-800 focus-within:border-emerald-500"
    />
  );
}
