# Migration status and plan

Status of the move from a single web app to a three-target monorepo, and the
concrete remaining work for each target.

---

## Done

### Monorepo split ✅

```
packages/core/     @rachana/core  — headless editor core
apps/web/          @rachana/web   — the browser app (fully working)
apps/desktop/      @rachana/desktop — Tauri skeleton (planned)
apps/vscode/       @rachana/vscode — VS Code extension (next)
```

Verified after the split:

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean, strict, across all workspaces |
| `npm test` | **144 passed** (unchanged from before the split) |
| `npm run test:e2e` | **16 passed** in real Chromium |
| `npm run build` | web app builds, 13 sample pages emitted |
| `npm run clean:check` | no emitted JS shadowing sources |

The split used **re-export shims** so no call site changed:

```ts
// apps/web/src/platform/html/htmlPatcher.ts
export * from "@rachana/core/html";
```

That is why the test counts are identical before and after. New code should
import `@rachana/core` directly; the shims exist for the ported components and
can be deleted once every consumer is migrated.

### What moved into the core

Only modules with **zero imports** were moved, which made the first step
risk-free. They cover the parts most worth sharing: the save engine, the
`Workspace` contract, and the WordPress converters.

---

## Remaining work

### Phase 2 — finish the core (≈7,000 lines)

These modules are host-adjacent but not host-specific; each moves when a target
needs it. Order chosen by dependency, so each step only depends on the previous.

| Module | Lines | Blocker before it can move |
| --- | --- | --- |
| `platform/host/config.ts` | ~120 | Uses `localStorage` → needs a `Storage` port |
| `platform/host/scaffold.ts` | ~80 | None — pure string |
| `platform/html/document.ts` | ~230 | None — only imports `marked`/`turndown` + core |
| `platform/html/displayPipeline.ts` | ~330 | None — only needs `Workspace` |
| `platform/host/globalCss.ts` | ~60 | Uses `config` |
| `platform/host/styleRouter.ts` | ~560 | Uses `Workspace` (already) + node:path-free |
| `platform/host/cssEdit.ts` | ~150 | None — pure text |
| `platform/host/astroEdit.ts` | ~240 | `@astrojs/compiler` (WASM; browser-safe) |
| `platform/host/astroCss.ts` | ~140 | Uses `Workspace` |
| `platform/host/editorSession.ts` | ~330 | Uses `?raw` inject script → needs an `Assets` port |
| `platform/host/dialogs.ts` | ~90 | Already an interface — pure |
| `platform/host/liveRuntime.ts` | ~380 | Uses `fetch` + `?raw` → needs `Assets` + `Http` ports |
| `features/fonts/library.ts` | ~120 | Uses `localStorage` + `Workspace` |
| `features/templates/library.ts` | ~380 | Uses `fetch` + `localStorage` |
| `features/wordpress/WordPressClient.ts` | ~600 | Uses `fetch` (fine) + settings |
| `features/wordpress/ConnectHandler.ts` | ~1290 | Uses `Workspace` + `localStorage` + `fetch` |

**Two new ports** are needed to unblock the tail:

```ts
/** Reading bundled assets (inject scripts, WASM, sample pages). */
export interface Assets {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
}

/** Persistence for settings and small records. */
export interface Storage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}
```

`Assets` is the important one: today `editorSession.ts` imports
`editor-inject.js?raw`, which is a Vite-specific mechanism. A `Assets` port lets
the web app keep `?raw` while VS Code reads the file from `extensionUri` and
Tauri reads it via the fs plugin.

### Phase 3 — VS Code extension ✅ (core milestone)

`apps/vscode/` builds and packages to a **loadable 956 KB `.vsix`**:

```
apps/vscode/
├── src/
│   ├── extension.ts          activate(): one command, extension gates
│   ├── panel.ts              one panel per document, keyed by URI
│   ├── rachanaPanel.ts       panel lifecycle + message routing
│   ├── documentHost.ts       read / prepare / save one document
│   ├── webviewHtml.ts        CSP-locked webview HTML with a per-load nonce
│   ├── protocol.ts           the shared message contract + receive guard
│   └── adapters/
│       ├── workspace.ts      vscode.workspace.fs → core Workspace
│       └── ports.ts          globalState / SecretStorage / extensionUri / env
├── webview/
│   ├── main.tsx              renders the SAME React UI as apps/web
│   ├── transport.ts          postMessage ↔ VS Code
│   ├── host.ts               HostChannel over that transport
│   └── ui.ts                 the seam that re-exports the web UI
└── esbuild.mjs               two bundles: extension.cjs and webview/index.js
```

**Implemented and verified**

| Capability | Status |
| --- | --- |
| Command, menus, configuration contributions | ✅ |
| One panel per document, reveal-on-reopen | ✅ |
| `Workspace` over `workspace.fs`, writes through open text buffers | ✅ |
| Byte-preserving patch save and full-document save | ✅ |
| Canvas inject script supplied by the host via `AssetsPort` | ✅ |
| Clipboard via `vscode.env.clipboard` (the webview API throws) | ✅ |
| Storage in `globalState`; WordPress passwords in `SecretStorage` | ✅ |
| Folder listing, file creation, image import, open-in-browser | ✅ |
| Government sample site bundled as a resource (13 pages) | ✅ |
| Astro compiler WASM bundled as a resource (5 MB, for Live mode) | ✅ staged |
| Packages to a loadable 2.28 MB `.vsix` | ✅ |

**Deferred to the next milestone** — these message types are currently answered
with an explicit "not wired up yet" notice rather than failing silently:

`GET_TEMPLATES`, `GET_TEMPLATE_HTML`, `GET_GOOGLE_FONTS_CATALOG`,
`UPLOAD_FONT`, `LIST_USER_FONTS`, `PICK_USER_FONT`, `SAVE_SCREENSHOTS`,
`PASTE_IMAGE`, `REQUEST_IMAGE_OPTIONS`, `GET_LINK_URL`, `REQUEST_LINK_CHANGE`,
`SAVE_DESIGN_SYSTEM_TO_SIBLINGS`, `CONNECT_*`, `FETCH_LIVE_PREVIEW`,
`GET_ASTRO_SOURCE`, `ASTRO_EDIT`, `LIVE_STYLE_*`.

Each maps to a module that must first move into `packages/core` (see Phase 2) —
`ConnectHandler` needs the `Storage` port, `liveRuntime` needs `Assets` and
`Http`, and fonts need `Storage` plus the workspace. So Phase 2 and this
milestone's remainder are the same work.

**Three gaps handled, each verified rather than assumed**

| Gap | Finding | Handling |
| --- | --- | --- |
| Canvas | Nested `srcdoc` iframe + `contentWindow` access **works** in a webview | Ported unchanged |
| Clipboard | `navigator.clipboard.writeText` **throws `NotAllowedError`** | Routed through `vscode.env.clipboard` |
| Sample site | Cannot be fetched from `public/` | Bundled into `dist/media/sample-site` and declared in `localResourceRoots` |

### Phase 4 — Tauri desktop app (skeleton in place)

`apps/desktop/` holds the plan, the adapter mapping and the milestone list as
checked types (`src/status.ts`). No Rust yet — see
[`apps/desktop/README.md`](../apps/desktop/README.md).

| Concern | Choice | Rationale |
| --- | --- | --- |
| Shell | Tauri v2 | ~10 MB binaries, uses the OS webview |
| Files | `@tauri-apps/plugin-fs` | Real paths, so `Workspace` is directory-backed |
| Dialogs | `@tauri-apps/plugin-dialog` | Native open/save/folder pickers |
| Storage | `@tauri-apps/plugin-store` | JSON store in the app data dir |
| Clipboard | `@tauri-apps/plugin-clipboard-manager` | Works without a user gesture |
| Live mode | Spawn the dev server from Rust | **A capability the web app cannot have** |
| Sample site | Read from the bundled resource dir | No HTTP |

Two things Tauri does better than the web app, worth designing for deliberately:

1. **Live mode can start the dev server itself.** The web app must ask the user
   for a URL; the desktop app can spawn the process and stream its log — what the
   original VS Code extension did.
2. **No CORS.** Requests go through Rust, so the WordPress exporter works against
   any site with no proxy prefix.

Risks, stated honestly: the OS webview differs per platform (WebKitGTK on Linux,
WKWebView on macOS, WebView2 on Windows), so the canvas and CodeMirror need
testing on all three; and building requires the Rust toolchain, which is why the
web and VS Code targets stay Rust-free.

### Phase 5 — DeepSeek Harness plugin

**This needs a scope decision before design**, because a DSH plugin is not a
webview host — it is a tool provider. Two plausible readings, with a
recommendation.

**A. Headless tools (recommended).** Expose the core as DSH tools, so an agent can
operate on a project without any UI:

```
rachana_open_document(path)            → document + computed styles
rachana_query_element(path, selector)  → element details
rachana_apply_style(path, sel, prop, value)
rachana_import_template(templateId)
rachana_export_wordpress(siteId, options)
rachana_snapshot(path) / rachana_diff(path, snapshot)
```

This is the natural fit: `packages/core` is already headless and testable, so the
plugin becomes a thin tool layer. It also makes the editor scriptable and
agent-drivable, which is arguably more valuable than a second UI.

**B. UI panel.** Serve the editor as a DSH web surface. Possible, but it would
duplicate the VS Code webview work for little gain.

**Recommendation: A**, and defer until Phase 2 completes — every tool above maps
to a core module that must first be host-free.

---

## Status summary

| Phase | State |
| --- | --- |
| 1. Monorepo split | ✅ done and verified |
| 2. Finish the core (~7,000 lines, two new ports) | ⏳ next |
| 3. VS Code extension | ✅ core milestone (loadable `.vsix`); feature parity needs Phase 2 |
| 4. Tauri desktop app | 📋 skeleton and plan |
| 5. DSH plugin | 📋 plan; needs a scope decision |

**Verification after this round:** typecheck clean across four workspaces, 144
unit tests passing, 16 Playwright tests passing, web app builds, and the
extension packages to a 2.28 MB `.vsix` from a clean build.


---

## Invariants that must survive every target

1. **Saves are byte-preserving patches against the raw source.** Never rebuild the
   document from the DOM. This is why the core has no DOM dependency at all.
2. **The core never imports a host API.** If a module needs one, it takes a port.
3. **`buildElementMap` mirrors `editor-inject.js`'s path assignment.** They change
   together.
4. **No feature is gated.** There is no licence tier in any target.
5. **Each target's tests run against that target's adapters**, but the core's tests
   are shared and must pass everywhere.

---

## Immediate next step

Scaffold `apps/vscode/` with the four adapters, a webview build of the existing
React UI, and the message bridge — then package a `.vsix` and load it in VS Code
to verify real file handling end to end.
