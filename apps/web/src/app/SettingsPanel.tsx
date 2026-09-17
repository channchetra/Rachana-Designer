/**
 * Settings panel.
 *
 * The original extension's settings lived in VS Code's settings UI
 * (`greenlight.styleMode`, `greenlight.styleScope`) plus a licence modal. This
 * in-app panel covers those and adds the options a standalone app needs:
 * project layout, Live-mode dev server, the WordPress CORS transport and
 * workspace management.
 */

import { useEffect, useState } from "react";
import { FolderOpen, HardDrive, Info, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { useAppConfig, SETTINGS_OPEN_EVENT } from "@/platform/host/settings";
import { LIBRARY_URL_KEY, DEFAULT_LIBRARY_URL } from "@/features/templates/library";
import { readString, writeString } from "@/platform/host/config";
import { useHostBridge } from "@/platform/host/HostBridgeProvider";
import { basename } from "@/platform/fs/types";
import type { Workspace } from "@/platform/fs/types";

export interface SettingsPanelProps {
  workspace: Workspace;
  onChangeWorkspace: () => void;
}

export function SettingsPanel({ workspace, onChangeWorkspace }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useAppConfig();
  const [libraryUrl, setLibraryUrl] = useState(() => readString(LIBRARY_URL_KEY, DEFAULT_LIBRARY_URL));
  const { currentPath, sendToHost } = useHostBridge();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(SETTINGS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SETTINGS_OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;

  return (
    <div className="rd-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="rd-modal w-[620px]">
        <header className="rd-modal-header">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-accent-300" />
            <h2 className="text-[13px] font-semibold text-slate-100">Settings</h2>
          </div>
          <button type="button" className="rd-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} />
          </button>
        </header>

        <div className="rd-scroll flex-1 px-4 py-3.5">
          {/* ---------------------------- workspace --------------------------- */}
          <Section title="Project" icon={<HardDrive size={12} />}>
            <Row label="Workspace" hint={`${workspace.kind} · ${workspace.label}`} />
            <Row label="Open document" hint={currentPath ? basename(currentPath) : "none"} mono />
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="rd-btn" onClick={onChangeWorkspace}>
                <FolderOpen size={13} />
                Switch project
              </button>
              <button
                type="button"
                className="rd-btn"
                onClick={() => sendToHost({ type: "GET_FOLDER_FILES" })}
                title="List editable files in the current folder"
              >
                <RefreshCw size={13} />
                Rescan folder
              </button>
            </div>
          </Section>

          {/* ------------------------------ styling -------------------------- */}
          <Section title="Styling" icon={<Sparkles size={12} />}>
            <Field label="Style mode" hint="How style edits are applied.">
              <select
                className="rd-select"
                value={config.styleMode}
                onChange={(e) => {
                  setConfig({ styleMode: e.target.value });
                  sendToHost({ type: "SET_CONFIG", styleMode: e.target.value });
                }}
              >
                <option value="class">Apply to CSS classes</option>
                <option value="inline">Apply as inline styles</option>
              </select>
            </Field>

            <Field
              label="Astro style scope"
              hint="Where new CSS rules go for .astro files."
            >
              <select
                className="rd-select"
                value={config.styleScope}
                onChange={(e) => {
                  const scope = e.target.value as "global" | "local";
                  setConfig({ styleScope: scope });
                  sendToHost({ type: "SET_CONFIG", styleScope: scope });
                }}
              >
                <option value="local">This file — &lt;style data-gl-editor&gt;</option>
                <option value="global">Project stylesheet</option>
              </select>
            </Field>

            <Field label="Project stylesheet path" hint="Relative to the workspace root.">
              <input
                className="rd-input font-mono"
                value={config.globalCssPath}
                onChange={(e) => setConfig({ globalCssPath: e.target.value })}
                placeholder="src/styles/global.css"
              />
            </Field>
          </Section>

          {/* ---------------------------- live mode -------------------------- */}
          <Section title="Live mode (dev server)" icon={<Info size={12} />}>
            <p className="rd-hint mb-2">
              Live mode previews a running dev server and lets you click an element to edit the exact
              source line. A browser cannot start the server for you, so start it yourself (for example{" "}
              <code className="rd-kbd">npm run dev</code>) and enter its URL. The server must allow this
              page to fetch it.
            </p>
            <Field label="Dev server URL" hint="Leave empty to hide Live mode.">
              <input
                className="rd-input font-mono"
                value={config.liveServerUrl}
                placeholder="http://localhost:4321"
                onChange={(e) => setConfig({ liveServerUrl: e.target.value })}
              />
            </Field>
            <Toggle
              label="Enable Live mode toggle"
              hint="Shows the Edit / Live switch for .astro files."
              checked={config.livePreviewEnabled}
              onChange={(v) => setConfig({ livePreviewEnabled: v })}
            />
          </Section>

          {/* ---------------------------- wordpress -------------------------- */}
          <Section title="WordPress export" icon={<Info size={12} />}>
            <p className="rd-hint mb-2">
              A stock WordPress site does not send CORS headers, and WordPress Application Passwords use
              HTTP Basic auth, which browsers preflight. If a direct connection is blocked, either add a
              CORS allowance to the site or route requests through a proxy prefix.
            </p>
            <Field label="Transport">
              <select
                className="rd-select"
                value={config.wpTransport}
                onChange={(e) => setConfig({ wpTransport: e.target.value as "direct" | "proxy" })}
              >
                <option value="direct">Direct (site allows CORS)</option>
                <option value="proxy">Via CORS proxy prefix</option>
              </select>
            </Field>
            {config.wpTransport === "proxy" && (
              <Field label="Proxy prefix" hint="Prepended to every API URL.">
                <input
                  className="rd-input font-mono"
                  value={config.wpProxyPrefix}
                  placeholder="https://cors.example.com/"
                  onChange={(e) => setConfig({ wpProxyPrefix: e.target.value })}
                />
              </Field>
            )}
          </Section>

          {/* ----------------------------- library --------------------------- */}
          <Section title="Template library" icon={<Sparkles size={12} />}>
            <p className="rd-hint mb-2">
              The wireframe library reads a WordPress REST endpoint with{" "}
              <code className="rd-kbd">/templates</code> and <code className="rd-kbd">/templates/:id</code>.
              When it is unreachable, a built-in starter catalog is used instead — every template is
              unlocked either way.
            </p>
            <Field label="Library base URL">
              <input
                className="rd-input font-mono"
                value={libraryUrl}
                onChange={(e) => {
                  setLibraryUrl(e.target.value);
                  writeString(LIBRARY_URL_KEY, e.target.value.trim());
                }}
                placeholder={DEFAULT_LIBRARY_URL}
              />
            </Field>
          </Section>

          {/* ---------------------------- diagnostics ------------------------ */}
          <Section title="Diagnostics" icon={<Info size={12} />}>
            <Toggle
              label="Verbose logging"
              hint="Log every host message to the browser console."
              checked={config.verboseLogging}
              onChange={(v) => setConfig({ verboseLogging: v })}
            />
          </Section>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-white/[0.07] px-4 py-3">
          <span className="rd-hint">Settings are stored in this browser.</span>
          <button type="button" className="rd-btn-primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------ primitives ------------------------------ */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {icon}
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="rd-label mb-1 block">{label}</span>
      {children}
      {hint && <span className="rd-hint mt-1 block">{hint}</span>}
    </label>
  );
}

function Row({ label, hint, mono }: { label: string; hint: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className={`truncate text-slate-200 ${mono ? "font-mono text-[10.5px]" : ""}`} title={hint}>
        {hint}
      </span>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-[11.5px] text-slate-200">{label}</span>
        {hint && <span className="rd-hint block">{hint}</span>}
      </span>
    </label>
  );
}
