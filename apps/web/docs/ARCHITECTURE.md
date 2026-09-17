# Rachana Designer — Architecture

This document explains how the app is put together, the invariants that must not
be broken, and how to add to it safely.

---

## 1. The shape of the port

Rachana Designer is a standalone port of a VS Code extension's visual editor.
Understanding the original split makes everything else obvious:

| Original (VS Code) | Rachana Designer |
| --- | --- |
| Webview (React) | The same React app, now the whole page |
| `acquireVsCodeApi().postMessage()` | `useHostBridge().sendToHost()` |
| `webview.postMessage()` (host → UI) | `publishHostMessage()` / `useHostMessages()` |
| `MessageHandler` (Node process) | `HostBridgeProvider` + `src/platform/host/*` |
| `workspace.fs` (VS Code filesystem) | The `Workspace` interface (`memory` / `directory`) |
| `globalState` / `secrets` | `localStorage` / IndexedDB |
| `showInputBox`, `showQuickPick`, `showOpenDialog` | `DialogApi` (in-app modals) |
| `child_process.spawn` dev server | A user-supplied dev server URL |
| Licence activation | Always the Full Edition |

**The message contract is unchanged.** Every type string and payload key the UI
sends and expects is identical to the original, which is why the ported
components needed almost no edits — their logic still holds.

---

## 2. Layers

```
               ┌──────────────────────────────────────────┐
               │  src/app/*        React shell            │
               │  WorkspaceGate · DialogHost · Settings   │
               └───────────────────┬──────────────────────┘
                                   │ provides workspace, dialogs, settings
               ┌───────────────────▼──────────────────────┐
               │  src/platform/host/HostBridgeProvider    │
               │  owns the EditorSession, dispatches all  │
               │  WebviewToHostMessage cases              │
               └───────┬───────────────────────┬──────────┘
                       │                       │
        ┌──────────────▼──────────┐   ┌────────▼───────────────────┐
        │ src/components/editor/* │   │ src/features/*             │
        │ the ported UI           │   │ wordpress · fonts ·        │
        │ (never imports the host)│   │ templates                  │
        └──────────────┬──────────┘   └────────┬───────────────────┘
                       │                       │
        ┌──────────────▼───────────────────────▼──────────────────┐
        │ src/platform/{html,fs,canvas}/*                          │
        │ htmlPatcher · document pipeline · Workspace · inject js  │
        └──────────────────────────────────────────────────────────┘
```

**Rule:** dependencies point downward only. The UI never imports the host; the
host never imports React components; `src/features/*` never imports `src/app/*`.

---

## 3. The two message channels

There are two independent channels, and confusing them is the most common
mistake when extending the app.

### 3.1 UI ↔ Host (`src/types/hostMessages.ts`)

```ts
sendToHost({ type: "SAVE_PATCHES", patches, styleScope });   // UI → host
// host → UI:
publishHostMessage({ type: "FILE_SAVED" });
```

- `WebviewToHostMessage` — 47 variants. Dispatched by
  `HostBridgeProvider.sendToHost`.
- `HostToWebviewMessage` — 55 variants. Published by `emit()`, fanned out to
  stores by `useHostMessages()` in `src/platform/host/messageRouter.ts`.

Every host→UI message is handled in exactly one place: the big `switch` in
`messageRouter.ts`, which routes it into `editorStore`, `connectStore`,
`licenseStore`, `screenshotStore` or the transient `BridgeState`. Components
subscribe to stores, not to messages — except `Toolbar` and `LiveEditor`, which
use `useHostMessage([...types], handler)` for their request/response round-trips.

### 3.2 UI ↔ Canvas iframe (`src/types/editor.ts`)

The canvas is an `<iframe srcdoc>` running `editor-inject.js`. The two sides
exchange `ParentToIframeMessage` / `IframeToParentMessage` over
`window.postMessage`, bridged by `usePostMessage()`.

`editor-inject.js` is deliberately **not** bundled or transpiled — it is 5 200
lines of readable ES5 and is imported with `?raw`, so the shipped bytes equal the
authored bytes. It assigns a `data-gl-path` to every editable element (skipping
`SCRIPT`, `STYLE`, `LINK`, `META`, `NOSCRIPT`) and that path is the key used by
the save pipeline.

---

## 4. The save pipeline (the highest-risk area)

### 4.1 The invariant

> **Saving edits text. It never re-serialises a DOM.**

`applyPatches(originalHtml, patches)` walks the original source with
`buildElementMap` — the *same* path-assignment algorithm the iframe uses — and
splices bytes at computed offsets. Comments, attribute quoting, indentation and
every untouched node survive exactly.

This is why a change to `editor-inject.js`'s path algorithm is a breaking change:
`buildElementMap` in `htmlPatcher.ts` must mirror it. `htmlPatcher.test.ts` and
the checklist in `docs/TESTING.md` Part C guard this.

### 4.2 Flow

```
user edits on canvas
  → editor-inject.js records the change and, after 1500 ms idle,
    exposes window.__glGetPatches()
  → useAutoSave() calls it and sends SAVE_PATCHES
  → HostBridgeProvider.savePatches()
      → EditorSession.savePatches()
          1. (Astro only) routeFontPatches  → global.css segments
          2. (Astro only) routeStylePatches → existing CSS file / local block / global.css
          3. applyPatches(rawHtml, patches)  ← byte-preserving splice
          4. markdown: htmlToMarkdown(); else keep HTML
          5. prepend the untouched frontmatter
          6. workspace.writeText(path, fileText)
          7. re-run the display pipeline so the canvas matches the file
      → publishHostMessage({ type: "FILE_SAVED" })
```

### 4.3 Display transforms are one-way

The canvas cannot resolve relative asset paths (an `<iframe srcdoc>` has a null
origin), so the display pipeline rewrites them: images become `data:` URIs with
the original kept in `data-gl-original-src`, local stylesheets are inlined as
`<style data-gl-inlined>`, a `<base data-gl-base>` is added, and Astro frontmatter
CSS is injected between `<!-- gl-fm-css-start -->` markers.

**None of this reaches the user's file.** Patch saves build on the raw source.
For the rare full-document save (snapshot restore, markdown mode),
`stripDisplayTransforms()` reverses every marker first.

---

## 5. The `Workspace` abstraction

`src/platform/fs/types.ts` defines one interface with three implementations:

| Implementation | When | Saves go to |
| --- | --- | --- |
| `DirectoryWorkspace` | The user picked a folder (Chromium) | The real file, immediately |
| `MemoryWorkspace` | Imported folder, new project, or no FSA support | An in-page virtual project |
| *(reserved)* `HttpWorkspace` | A future dev-server-backed workspace | — |

Paths are always POSIX-style and relative to the workspace root
(`src/pages/index.astro`). Two helpers matter:

- `joinPath()` **preserves** a leading `..` rather than dropping it, so
  `joinPath("a", "..", "..", "evil")` is `../evil`.
- `escapesWorkspace()` is the guard every workspace applies, so a crafted
  template or an imported folder cannot write outside the project.

Directories are represented as entries with `kind: "directory"`, which is what
lets the CSS router walk `src/styles/**` in either back-end.

Directory handles are persisted in **IndexedDB** (`projectPersistence.ts`),
because `localStorage` cannot hold a structured-cloneable handle.

---

## 6. Feature modules

### 6.1 WordPress (`src/features/wordpress/`)

- `WordPressClient.ts` — the REST client. Basic auth with Application
  Passwords, exact endpoint templates, 30 s / 120 s / 15 s timeouts, and a
  configurable CORS transport (direct, or a proxy prefix).
- `convert.ts` — HTML → GreenLight blocks. The generated block markup, attribute
  JSON escaping and the `{CURRENT}` custom-CSS sentinel are byte-exact; see
  `convert.test.ts`.
- `markdownToBlocks.ts` — HTML → **core** blocks, used for `.md` sources.
- `ConnectHandler.ts` — the orchestrator: option resolution, media upload,
  Google Font import, CSS-variable export, destination creation.
- `bridge.ts` — the thin adapter the host bridge calls. Keeps WordPress out of
  the host and the host out of WordPress.

Sites are stored in `localStorage` (`rachana.wpSites` plus one key per site's
password). This is documented in Settings: browsers have no OS keychain.

### 6.2 Fonts (`src/features/fonts/`)

Uploaded fonts live in the **workspace** under `fonts/` (where the saved CSS
references them) with a `family → filename` index in `localStorage`. Previews go
through blob URLs, because the canvas cannot fetch sibling files.

### 6.3 Templates (`src/features/templates/`)

Tries the configured remote library first, then falls back to a built-in catalog:
12 hand-written starter sections plus the 13 `design.md` government pages, under
the `government` category. Both paths are fully unlocked — the original editor's
remote API tagged some entries as `pro`, and those are importable here too.

Built-in ids live outside the range a real WordPress site would assign (negative
for the generic starters, `900_000+` for the government pages), so
`loadTemplateHtml` can tell a local template from a remote one without a lookup
table.

Each government template carries the design system stylesheet as one `<style>`
block. That is deliberate: the `gov-*` classes are meaningless without the token
layer, so a template that omitted it would insert inert markup.

### 6.4 Government samples (`src/features/samples/`)

Implements the `design.md` Cambodia Government Web Design System. One source
feeds three consumers, which is what stops them drifting:

```
govSite.ts ─────────► scripts/build-sample-site.mjs ──► public/sample-site/*.html
   │                                                    (browsable, self-contained)
   ├─────────────────► sampleSiteLoader.ts ───────────► an editable in-app project
   └─────────────────► templates/library.ts ──────────► gallery templates
```

- `govDesignSystem.css` — the tokens and component styles, traceable by section
  to `design.md`.
- `govSite.ts` — the page compositions, shells and shared chrome.
- `sampleSiteLoader.ts` — fetches the generated pages and seeds a workspace.

**Why the stylesheet is mirrored to JSON.** The CSS must reach the app as a
*string* so it can be inlined into each page. `?raw` resolves to an empty string
under Vitest, and `node:fs` cannot be imported in app code because Vite
externalises it for the browser. A JSON import behaves identically in Vite,
Vitest and esbuild, so `scripts/sync-gov-css.mjs` mirrors one file to the other
and a test fails if the mirror goes stale.

**Why pages are full documents on disk but body-only in the gallery.** On disk
they are standalone, so they open without a server. In the gallery they are body
markup plus the stylesheet, because inserting a nested `<html>` into an editor
document would be invalid.

---

## 7. Live mode

`src/platform/host/liveRuntime.ts` replaces the extension's process manager.

1. The user supplies the dev server origin (Settings → Live mode).
2. `mapFileToRoute()` maps a workspace path to a route (`src/pages/blog/[slug].astro`
   → not previewable; `src/pages/about.astro` → `/about`).
3. The route is fetched, then `preparePreviewHtml()` inlines same-origin
   stylesheets, absolutises URLs, adds a `<base>` and injects
   `live-edit-inject.js`.
4. Clicking an element sends the Astro `data-astro-source-loc` coordinates back.
   `astroEdit.ts` maps them to the AST via `@astrojs/compiler` (WASM, imported
   lazily) and splices the original source string, preserving formatting and
   frontmatter expressions.
5. `cssEdit.ts` rewrites a single declaration's value in place, with an undo /
   redo stack over the exact old and new values.

---

## 8. Design system

Tailwind with `brand` (from `#1C4076`), `accent` (from `#26A5DE`) and `shell`
scales. `src/styles/globals.css` adds:

- CSS custom properties for the shell, border and focus colours;
- base styles (dark scrollbars, brand-tinted range/checkbox/colour inputs);
- reusable component classes: `rd-input`, `rd-select`, `rd-btn*`, `rd-icon-btn`,
  `rd-panel`, `rd-section`, `rd-chip`, `rd-tab`, `rd-modal`, `rd-badge`, `rd-kbd`;
- utilities `rd-scroll`, `rd-focus-ring`.

Ported panels intentionally keep their original `zinc-*` utility classes so they
render exactly as they did — new UI should use the `rd-*` classes instead.

---

## 9. How to extend

### Add a host message

1. Add the member to `WebviewToHostMessage` or `HostToWebviewMessage` in
   `src/types/hostMessages.ts`.
2. Handle it:
   - UI → host: add a `case` to the `switch` in `HostBridgeProvider.sendToHost`.
   - host → UI: add a `case` to `applyToEditorStore` / `applyToFeatureStores` /
     `reduceBridgeState` in `messageRouter.ts`.
3. Add a test if the handler has any logic worth pinning.

### Add a property panel

1. Create `src/components/editor/panels/MyPanel.tsx`.
2. Props are callbacks only (`onStyleChange`, …). Read shared state from
   `useEditorStore`; call `useHostBridge()` only if you genuinely need a host
   round-trip.
3. Reuse the shared primitives from `@/components/ui/panelPrimitives` —
   `getEffectiveValue` / `getExplicitValue` / `getBorderEffectiveValue` for the
   cascade, and `FieldLabel`, `SideIcon`, `PresetSelect`, `PresetInput`,
   `SegmentedControl` for chrome. Do not copy them into a new panel; the original
   editor did that 35 times and it is the main reason the panel layer was hard to
   change.
4. Register it in `PropertiesPanel.tsx` (as a collapsible section) or in
   `EditorShell.tsx` (as a docked `<aside>`).
5. Add a store slice only if the state outlives the component.

### Add a government sample page

1. Add the page body to `govSite.ts` and register it in `SAMPLE_PAGES`.
2. Run `npm run build:samples` (it syncs the CSS mirror and regenerates the
   HTML).
3. `npm run test` — the sample-site suite checks the new page has one `h1`, the
   trust bar, a skip link and no broken internal links. The gallery picks it up
   automatically.

### Add a workspace back-end

Implement `Workspace` and pass it to `WorkspaceGate`'s `onReady`. Nothing else
needs to change — that is the point of the abstraction.

### Change the design system

1. Edit `src/features/samples/govDesignSystem.css`.
2. Run `npm run build:samples` to sync the JSON mirror and regenerate the pages.
3. Add any new `gov-*` colour or radius to `tailwind.config.js` so the token is
   available to Tailwind classes as well (the spec's §67 naming).

---

## 10. Invariants to protect

1. **Saves are byte-preserving patches against the raw source.** Never rebuild
   the document from the DOM.
2. **`buildElementMap` mirrors `editor-inject.js`'s path assignment.** Change one,
   change the other, and re-run the Part C checklist.
3. **Display transforms are marked and reversible** (`data-gl-original-src`,
   `data-gl-inlined`, `data-gl-base`, `gl-fm-css-*`, `data-gl-original-*`).
4. **The host and the UI only speak in `hostMessages` types.** No ad-hoc shapes.
5. **Nothing talks upward.** UI → host → platform → workspace.
6. **No feature is gated.** `licenseStatus` is always `"active"`, so every
   ported `isPro` check passes without editing the components.
7. **Every workspace path is validated** with `escapesWorkspace()` before any
   filesystem call.
8. **Shared panel primitives live in one place.** Add to
   `components/ui/panelPrimitives.tsx` rather than copying into a panel.
9. **The government sample is generated, never hand-edited.** Change
   `govSite.ts` or `govDesignSystem.css` and run `npm run build:samples`; the
   stylesheet mirror and the on-disk pages are both verified by tests.
10. **No stray compiled `.js` in `src/`.** `npm run clean:check` (part of
   `verify`) fails if a build artefact is shadowing a TypeScript source.
