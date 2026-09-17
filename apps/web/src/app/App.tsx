/**
 * Rachana Designer — app root.
 *
 * Composition order:
 *  1. `WorkspaceGate` obtains a workspace (real folder, imported folder, or
 *     in-memory) and shows the welcome screen until one exists.
 *  2. `DialogHostProvider` supplies the promise-based dialogs the host needs,
 *     plus the toast stack.
 *  3. `HostBridgeProvider` owns the editor session and the host dispatcher.
 *  4. `EditorBody` renders the ported editor shell once a document is loaded.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bug, RefreshCw, Settings2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HostBridgeProvider, useHostBridge } from "@/platform/host/HostBridgeProvider";
import type { HostChannel } from "@/platform/host/HostBridgeProvider";
import { useHostMessages } from "@/platform/host/messageRouter";
import { createSettingsApi, SETTINGS_OPEN_EVENT } from "@/platform/host/settings";
import { DialogHostProvider, ToastStack, useDialogs } from "@/app/DialogHost";
import { WorkspaceGate } from "@/app/WorkspaceGate";
import { SettingsPanel } from "@/app/SettingsPanel";
import { DiagnosticsPanel } from "@/app/DiagnosticsPanel";
import { EditorShell } from "@/components/editor/EditorShell";
import { WelcomeLogo, BrandIcon } from "@/app/WelcomeLogo";
import type { Workspace } from "@/platform/fs/types";
import { basename } from "@/platform/fs/types";

/**
 * App root.
 *
 * `host` is the one environment-specific input. The web app omits it and gets the
 * in-page host; the VS Code webview supplies a channel that forwards the same
 * messages to the extension host. Everything below is identical either way.
 */
export function App({ host }: { host?: HostChannel } = {}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [generation, setGeneration] = useState(0);

  const handleReady = useCallback((next: Workspace) => {
    setWorkspace(next);
    setGeneration((g) => g + 1);
  }, []);

  if (!workspace) {
    return (
      <ErrorBoundary>
        <WorkspaceGate onReady={handleReady} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <DialogHostProvider>
        <EditorRoot
          key={generation}
          workspace={workspace}
          host={host}
          onChangeWorkspace={() => setWorkspace(null)}
        />
        <ToastStack />
      </DialogHostProvider>
    </ErrorBoundary>
  );
}

interface EditorRootProps {
  workspace: Workspace;
  /** External host channel, or undefined for the in-page host. */
  host?: HostChannel;
  onChangeWorkspace: () => void;
}

function EditorRoot({ workspace, host, onChangeWorkspace }: EditorRootProps) {
  const dialogs = useDialogs();
  const settings = useMemo(() => createSettingsApi(), []);
  const [notice, setNotice] = useState<{ message: string; level: "info" | "error" | "success" } | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [editorOpen, setEditorOpen] = useState(true);

  const handleNotice = useCallback((message: string, level: "info" | "error" | "success" = "info") => {
    setNotice({ message, level });
    window.setTimeout(
      () => setNotice((current) => (current?.message === message ? null : current)),
      6000
    );
  }, []);

  return (
    <HostBridgeProvider
      workspace={workspace}
      dialogs={dialogs}
      settings={settings}
      onNotice={handleNotice}
      host={host}
    >
      <EditorBody
        workspace={workspace}
        notice={notice}
        sessionKey={sessionKey}
        editorOpen={editorOpen}
        onCloseEditor={() => setEditorOpen(false)}
        onReopenEditor={() => {
          setEditorOpen(true);
          setSessionKey((k) => k + 1);
        }}
        onChangeWorkspace={onChangeWorkspace}
        onDismissNotice={() => setNotice(null)}
      />
    </HostBridgeProvider>
  );
}

interface EditorBodyProps {
  workspace: Workspace;
  notice: { message: string; level: "info" | "error" | "success" } | null;
  sessionKey: number;
  editorOpen: boolean;
  onCloseEditor: () => void;
  onReopenEditor: () => void;
  onChangeWorkspace: () => void;
  onDismissNotice: () => void;
}

function EditorBody({
  workspace,
  notice,
  sessionKey,
  editorOpen,
  onCloseEditor,
  onReopenEditor,
  onChangeWorkspace,
  onDismissNotice,
}: EditorBodyProps) {
  const { state, clear } = useHostMessages();
  const { currentPath, session } = useHostBridge();

  // External file changes are pushed straight into the canvas by the shell.
  const externalChangeRef = useMemo(
    () => ({ current: null as ((html: string, raw: string) => void) | null }),
    []
  );

  // `CLOSE_PANEL` closes the editor tab.
  useEffect(() => {
    const listener = () => onCloseEditor();
    window.addEventListener("rachana:close-editor", listener);
    return () => window.removeEventListener("rachana:close-editor", listener);
  }, [onCloseEditor]);

  // Keep the canvas in sync when the file changes on disk underneath us.
  useEffect(() => {
    if (!state.document) return;
    let cancelled = false;
    const check = async () => {
      const refreshed = await session.refreshFromWorkspace();
      if (cancelled || !refreshed) return;
      externalChangeRef.current?.(refreshed.content, refreshed.rawHtml);
    };
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.document, session, externalChangeRef]);

  if (!state.document) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-shell-950 text-slate-400">
        <WelcomeLogo className="h-12" />
        <div className="flex items-center gap-2 text-[12px]">
          <RefreshCw size={14} className="animate-spin text-accent-400" />
          Preparing the editor…
        </div>
      </div>
    );
  }

  if (!editorOpen) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-shell-950 text-slate-400">
        <WelcomeLogo className="h-12" />
        <p className="text-[12px]">The editor tab was closed.</p>
        <div className="flex items-center gap-2">
          <button type="button" className="rd-btn-primary" onClick={onReopenEditor}>
            Reopen editor
          </button>
          <button type="button" className="rd-btn-ghost" onClick={onChangeWorkspace}>
            Open a different project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <TitleBar
        workspace={workspace}
        documentName={state.document.filename}
        documentPath={currentPath || state.document.filePath}
        onChangeWorkspace={onChangeWorkspace}
      />

      {notice && (
        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-[11px] ${
            notice.level === "error"
              ? "border-red-500/25 bg-red-500/10 text-red-200"
              : notice.level === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                : "border-accent-500/25 bg-accent-500/10 text-accent-100"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {notice.level === "error" && <AlertTriangle size={13} className="shrink-0" />}
            <span className="truncate">{notice.message}</span>
          </div>
          <button type="button" className="shrink-0 text-[10px] underline opacity-80" onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <EditorShell
          filename={state.document.filename}
          filePath={state.document.filePath}
          htmlContent={state.document.displayHtml}
          rawHtmlContent={state.document.rawHtml}
          injectScript={state.document.injectScript}
          styleMode="class"
          livePreviewHtml={state.livePreviewHtml}
          livePreviewUrl={state.livePreviewUrl}
          livePreviewError={state.livePreviewError}
          sessionKey={sessionKey}
          onClose={onCloseEditor}
          externalChangeRef={externalChangeRef}
          uploadedImagePayload={state.uploadedImage}
          clearUploadedImage={() => clear("uploadedImage")}
          pastedImagePayload={state.pastedImage}
          clearPastedImage={() => clear("pastedImage")}
          linkUrlPayload={state.linkUrl}
          clearLinkUrl={() => clear("linkUrl")}
          imageUpdatePayload={state.imageUpdate}
          clearImageUpdate={() => clear("imageUpdate")}
          linkChangePayload={state.linkChange}
          clearLinkChange={() => clear("linkChange")}
          saveErrorMessage={state.saveError}
        />
      </div>

      <SettingsPanel workspace={workspace} onChangeWorkspace={onChangeWorkspace} />
      <DiagnosticsPanel />
    </div>
  );
}

/** Thin app-level bar: workspace identity plus settings and diagnostics. */
function TitleBar({
  workspace,
  documentName,
  documentPath,
  onChangeWorkspace,
}: {
  workspace: Workspace;
  documentName: string;
  documentPath: string;
  onChangeWorkspace: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-shell-900 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandIcon size={18} />
        <span className="text-[12px] font-semibold tracking-tight text-slate-100">Rachana Designer</span>
      </div>

      <button
        type="button"
        className="rd-chip max-w-[320px] truncate"
        title={documentPath || documentName}
        onClick={onChangeWorkspace}
      >
        {workspace.label} / {basename(documentPath || documentName) || documentName}
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rd-icon-btn"
          title="Settings"
          onClick={() => window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT))}
        >
          <Settings2 size={14} />
        </button>
        <button
          type="button"
          className="rd-icon-btn"
          title="Host message log"
          onClick={() => window.dispatchEvent(new CustomEvent("rachana:toggle-diagnostics"))}
        >
          <Bug size={14} />
        </button>
      </div>
    </header>
  );
}
