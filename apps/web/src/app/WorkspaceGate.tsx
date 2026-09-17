/**
 * Workspace gate.
 *
 * Rachana Designer can work against three back-ends, chosen once at start-up:
 *
 *  1. **Open a project folder** — a real directory via the File System Access
 *     API. Saves write straight to disk and sibling assets resolve. This is the
 *     closest match to "Open Folder" in VS Code and is the recommended mode.
 *  2. **Import a folder** — copies a folder into an in-memory project. Works in
 *     every browser; exports go out as downloads.
 *  3. **Start from a template** — a fresh in-memory project seeded with the
 *     starter page.
 *
 * The last real folder is remembered in IndexedDB and offered as a one-click
 * reopen, with a permission re-prompt if the browser dropped the grant.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Upload,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  History,
  HardDrive,
  Info,
} from "lucide-react";
import type { Workspace } from "@/platform/fs/types";
import { MemoryWorkspace } from "@/platform/fs/memoryWorkspace";
import { DirectoryWorkspace } from "@/platform/fs/directoryWorkspace";
import { pickDirectoryAsBytes, supportsFileSystemAccess } from "@/platform/fs/browserIo";
import {
  clearDirectoryHandle,
  clearMemoryProject,
  loadDirectoryHandle,
  loadMemoryProject,
  saveDirectoryHandle,
  saveMemoryProject,
} from "@/platform/fs/projectPersistence";
import { SCAFFOLD_HTML } from "@/platform/host/scaffold";
import { SAMPLE_PROJECT_LABEL, loadSampleSiteWorkspace } from "@/features/samples/sampleSiteLoader";
import { WelcomeLogo } from "./WelcomeLogo";

interface DirectoryHandleLike {
  name: string;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface WorkspaceGateProps {
  onReady: (workspace: Workspace) => void;
}

type Busy = "folder" | "import" | "blank" | "sample" | "restore" | null;

export function WorkspaceGate({ onReady }: WorkspaceGateProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{ kind: "folder" | "memory"; label: string; savedAt?: number } | null>(
    null
  );
  const [hasFsa, setHasFsa] = useState(false);
  const bootstrapped = useRef(false);

  /* ------------------------- detect a previous project ------------------ */

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setHasFsa(supportsFileSystemAccess());

    void (async () => {
      const handle = await loadDirectoryHandle<DirectoryHandleLike>();
      if (handle?.name) {
        setPrevious({ kind: "folder", label: handle.name });
        return;
      }
      const memory = loadMemoryProject();
      if (memory?.label) {
        setPrevious({ kind: "memory", label: memory.label, savedAt: memory.savedAt });
      }
    })();
  }, []);

  /* ------------------------------- actions ------------------------------ */

  const openFolder = useCallback(async () => {
    setBusy("folder");
    setError(null);
    try {
      const picked = await DirectoryWorkspace.pickWithHandle();
      if (!picked) {
        setBusy(null);
        return;
      }
      await saveDirectoryHandle(picked.handle);
      clearMemoryProject();
      onReady(picked.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the folder.");
      setBusy(null);
    }
  }, [onReady]);

  const reopenFolder = useCallback(async () => {
    setBusy("restore");
    setError(null);
    try {
      const handle = await loadDirectoryHandle<DirectoryHandleLike>();
      if (!handle?.name) {
        setPrevious(null);
        setBusy(null);
        return;
      }
      const workspace = await DirectoryWorkspace.fromHandle(handle as never);
      if (!workspace) {
        setError("Permission to write to that folder was declined. Choose it again to continue.");
        setBusy(null);
        return;
      }
      onReady(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen the folder.");
      setBusy(null);
    }
  }, [onReady]);

  const importFolder = useCallback(async () => {
    setBusy("import");
    setError(null);
    try {
      const picked = await pickDirectoryAsBytes();
      if (!picked) {
        setBusy(null);
        return;
      }
      const seed: Record<string, string> = {};
      const binary: Record<string, string> = {};
      for (const file of picked.files) {
        // Keep text files as text so the memory snapshot stays small.
        if (/\.(html?|mdx?|astro|css|js|mjs|cjs|json|txt|svg)$/i.test(file.path)) {
          try {
            seed[file.path] = new TextDecoder("utf-8").decode(file.data);
            continue;
          } catch {
            /* fall through to base64 */
          }
        }
        binary[file.path] = toBase64(file.data);
      }
      const workspace = new MemoryWorkspace(picked.dirName, seed);
      for (const [path, b64] of Object.entries(binary)) {
        await workspace.writeBinary(path, fromBase64(b64));
      }
      persistMemory(workspace, picked.dirName);
      onReady(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the folder.");
      setBusy(null);
    }
  }, [onReady]);

  const startBlank = useCallback(() => {
    setBusy("blank");
    setError(null);
    const workspace = new MemoryWorkspace("Rachana project", { "index.html": SCAFFOLD_HTML });
    persistMemory(workspace, "Rachana project");
    onReady(workspace);
  }, [onReady]);

  /**
   * Open the generated `design.md` government sample site: thirteen linked
   * pages seeded into an in-memory project, so a real multi-page website can be
   * browsed and edited immediately.
   */
  const startSampleSite = useCallback(async () => {
    setBusy("sample");
    setError(null);
    try {
      const workspace = await loadSampleSiteWorkspace();
      persistMemory(workspace, SAMPLE_PROJECT_LABEL);
      onReady(workspace);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the government sample site. Try running `npm run build:samples`."
      );
      setBusy(null);
    }
  }, [onReady]);

  const reopenMemory = useCallback(() => {
    setBusy("restore");
    setError(null);
    const memory = loadMemoryProject();
    if (!memory) {
      setPrevious(null);
      setBusy(null);
      return;
    }
    onReady(new MemoryWorkspace(memory.label, memory.files));
  }, [onReady]);

  const forget = useCallback(async () => {
    await clearDirectoryHandle();
    clearMemoryProject();
    setPrevious(null);
  }, []);

  /* --------------------------------- UI --------------------------------- */

  return (
    <div className="flex min-h-screen items-center justify-center bg-shell-950 p-6">
      <div className="w-full max-w-[880px]">
        <header className="mb-7 flex flex-col items-center gap-3 text-center">
          <WelcomeLogo className="h-[68px]" />
          <p className="max-w-[520px] text-[12.5px] leading-relaxed text-slate-400">
            A standalone visual editor for HTML, Markdown and Astro. Drag-and-drop layout, design
            tokens, animations, wireframes, snapshots and WordPress export — every feature unlocked.
          </p>
        </header>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[11.5px] text-red-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {previous && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-500/30 bg-accent-500/[0.08] px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {previous.kind === "folder" ? (
                <HardDrive size={16} className="shrink-0 text-accent-300" />
              ) : (
                <History size={16} className="shrink-0 text-accent-300" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-slate-100">{previous.label}</div>
                <div className="text-[10.5px] text-slate-400">
                  {previous.kind === "folder" ? "Project folder on disk" : "In-browser project"}
                  {previous.savedAt ? ` · saved ${new Date(previous.savedAt).toLocaleString()}` : ""}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rd-btn-primary"
                onClick={previous.kind === "folder" ? reopenFolder : reopenMemory}
                disabled={busy !== null}
              >
                {busy === "restore" ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                Continue
              </button>
              <button type="button" className="rd-btn-ghost" onClick={() => void forget()} disabled={busy !== null}>
                Forget
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ModeCard
            icon={<FolderOpen size={20} />}
            title="Open a project folder"
            description="Edit real files on disk. Saves write byte-preserving patches straight back, and sibling CSS and images resolve automatically."
            badge={hasFsa ? "Recommended" : "Unsupported browser"}
            disabled={!hasFsa || busy !== null}
            busy={busy === "folder"}
            onClick={() => void openFolder()}
          />
          <ModeCard
            icon={<Upload size={20} />}
            title="Import a folder"
            description="Copy a folder into an in-browser project. Works everywhere; exports are downloaded as files."
            disabled={busy !== null}
            busy={busy === "import"}
            onClick={() => void importFolder()}
          />
          <ModeCard
            icon={<LayoutTemplate size={20} />}
            title="Government sample site"
            description="Thirteen linked pages built to the design.md Cambodia Government Web Design System — homepage, services, news, FAQ, contact and more. Edit any page visually."
            badge="Sample"
            badgeTone="accent"
            disabled={busy !== null}
            busy={busy === "sample"}
            onClick={() => void startSampleSite()}
          />
          <ModeCard
            icon={<FilePlus2 size={20} />}
            title="Start from a template"
            description="A fresh project with a starter page, ready to edit and export immediately."
            disabled={busy !== null}
            busy={busy === "blank"}
            onClick={startBlank}
          />
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-slate-400">
          <Info size={13} className="mt-0.5 shrink-0 text-slate-500" />
          <div className="space-y-1">
            <p>
              <ShieldCheck size={11} className="mr-1 inline text-emerald-400" />
              Everything runs locally in this page. No account, no sign-in, and no feature limits.
            </p>
            {!hasFsa && (
              <p className="text-amber-300/90">
                This browser does not support the File System Access API, so saving to disk is unavailable.
                Import a folder or start from a template — every editing feature still works.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  /** Badge colour: 
eutral (default) for availability, ccent for curated content. */
  badgeTone?: "neutral" | "accent";
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}

function ModeCard({ icon, title, description, badge, badgeTone = "neutral", disabled, busy, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex h-full flex-col items-start gap-2.5 rounded-xl border border-white/[0.08] bg-shell-900 p-4 text-left transition-colors hover:border-accent-500/40 hover:bg-shell-850 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700/70 text-accent-200">
          {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
        </span>
        {badge && (
          <span
            className={
              badgeTone === "accent"
                ? "rd-badge border-accent-400/50 bg-accent-500/25 text-accent-100"
                : "rd-badge"
            }
          >
            {badge}
          </span>
        )}
      </div>
      <span className="text-[12.5px] font-semibold text-slate-100">{title}</span>
      <span className="text-[11px] leading-relaxed text-slate-400">{description}</span>
    </button>
  );
}

/* ------------------------------- helpers ------------------------------- */

function persistMemory(workspace: MemoryWorkspace, label: string): void {
  try {
    saveMemoryProject({ label, files: workspace.snapshot(), savedAt: Date.now() });
  } catch {
    /* snapshot is best-effort */
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
