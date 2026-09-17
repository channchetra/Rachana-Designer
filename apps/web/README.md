# Rachana Designer

**A standalone visual editor for HTML, Markdown and Astro. Every feature unlocked.**

Rachana Designer is a browser app that lets you open a real project folder, click
any element on a live canvas, style it with real CSS controls, and save
byte-preserving edits back to disk. It is a complete, standalone port of the
GreenLight visual editor: drag-and-drop layout, design tokens, animations,
wireframes, a grid builder, snapshots, device screenshots, Astro support and a
WordPress exporter.

There is **no account, no sign-in, and no licence gate**. Every capability that
the original editor held behind a Pro licence — WordPress export, Live selection,
snapshot overwrite, the design system, the wireframe library — is available
immediately.

---

## Quick start

```bash
cd Rachana-Designer
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5178>) and pick how you want to
work:

| Mode | Best for | Requirement |
| --- | --- | --- |
| **Open a project folder** | Real work. Saves write straight to disk, sibling CSS and images resolve | Chrome / Edge (File System Access API) |
| **Import a folder** | Trying it out, or any other browser. Exports download as files | Any modern browser |
| **Government sample site** | Exploring a complete, real design system end to end | Any modern browser |
| **Start from a template** | A blank starter page, ready to edit | Any modern browser |

New here? Click **Government sample site**. It seeds thirteen linked pages built
to the Cambodia Government Web Design System, so you can click through a real
multi-page site and edit any of it visually — no setup, no sample files to find.

Then read **[docs/TESTING.md](docs/TESTING.md)** for the full feature
walkthrough, and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** if you intend
to extend the app.

---

## What it does

### Editing

- **Direct-manipulation canvas** — click, hover, select, double-click to edit
  text, drag blocks in, drag elements around.
- **DOM tree** — select, hover-highlight, rename a tag inline, delete nodes.
- **Source pane** — a real CodeMirror editor with HTML linting and `Ctrl/Cmd+S`.

### Styling

A full properties panel, ported feature-for-feature:

- Typography, colors (with a gradient editor and eyedropper), spacing, layout,
  position, size, border, shadow, transform, effects (filters, masks,
  clip-paths), a read-only computed-CSS inspector, and an attribute editor.
- **Class management** — add, remove, rename, and remove-with-styles, with
  sub-selector support.
- **Design system** — create and edit CSS custom properties, manage fonts from a
  Google Fonts catalog or your own uploaded font files, and export the whole
  token set to sibling files.
- **High-specificity mode** — append `!important` to every generated value.

### Layout tools

- **Layout presets** — column layouts from a 44-entry preset table with a
  drag-to-resize column planner.
- **Grid builder** — visual grid placement with per-device layouts, packed
  compaction, and generated CSS for desktop, tablet and mobile.

### Motion

- **Animations panel** — class-based animations with five trigger types (load,
  hover, view, scroll, class), 10 presets, and a visual keyframe builder.
- **View-triggered animations** inject an IntersectionObserver script, so the
  effect works in the exported page, not just in the editor.

### Content

- **Wireframe / template library** — an infinite-scrolling gallery with video
  previews and drag-to-insert. Falls back to a built-in starter catalog when the
  remote library is unreachable.
- **Snapshots** — point-in-time captures per file, with rename, load, overwrite
  and delete.

### File formats

| Format | Behaviour |
| --- | --- |
| `.html` / `.htm` | Edited directly. Saves are **byte-preserving patches** — comments, quoting and unrelated formatting survive |
| `.md` / `.mdx` | YAML frontmatter is preserved verbatim; the body is edited visually and converted back with Turndown (GFM tables and strikethrough supported) |
| `.astro` | Frontmatter is preserved; template bodies are edited as HTML, Astro component tags are normalised for display, and new CSS rules are routed into your project's existing stylesheets |

### Export

- **Open in browser** for HTML files.
- **Screenshots** at 16 device presets, PNG or WebP, single downloads or a
  `screenshots_<file>_<hash>/` folder.
- **WordPress export** in three packaging modes (GreenLight blocks, one
  GreenShift HTML block, one core HTML block), with media upload, CSS-variable
  export, Google Font import, block-theme and template-part support, and a
  code-only mode that needs no site at all.

### Live mode

For Astro projects: point Rachana Designer at your running dev server and click
elements in the real rendered page to edit the exact source line that produced
them, using a WASM Astro compiler for AST-accurate edits.

---

## The government design system samples

The repo root contains `design.md`: a **Cambodia Government Web Design System**
specification (86 sections) synthesised from the Rachana design system and a live
provincial government site. Rachana Designer implements it as working pages.

**Thirteen generated pages**, in `public/sample-site/`:

| Page | Specification |
| --- | --- |
| `index.html` | Homepage — the full §14/§70 blueprint: trust bar, hero, leadership, services, about, news, statistics, FAQ, CTA, related agencies, platforms, knowledge, contact, footer |
| `services.html` | Public service listing with search, category chips and pagination (§39) |
| `service-detail.html` | Single service: eligibility, documents, steps, responsible unit (§40) |
| `news.html` | News listing (§41) |
| `news-article.html` | Article with breadcrumbs, metadata, downloads and related items (§42) |
| `knowledge.html` | Digital knowledge library plus document downloads (§43/§38) |
| `about.html` | Department overview, mandate and organisational structure (§44) |
| `faq.html` | Grouped FAQ accordion with search and a contact CTA (§45) |
| `contact.html` | Contact details, map and a full accessible form (§46/§31) |
| `404.html`, `search.html`, `privacy.html`, `terms.html` | Supporting pages (§64/§63/§30) |

Every page is a **self-contained HTML document** — the design system stylesheet is
inlined, so it opens correctly straight from disk with no build step and no
server, and it can be edited visually in Rachana Designer immediately.

All thirteen are also **insertable from the wireframe gallery** under the
`government` category, so you can drop a full page composition into your own
document.

**Where the tokens live.** `gov-primary` is `#1C4076` — the same value as the
editor's own brand colour and the supplied logo gradient's dark stop, so the
editor chrome and the government templates share one identity colour. Tailwind
exposes the spec's tokens under the `gov-*` prefix the document mandates
(`bg-gov-primary`, `text-gov-gray-700`, `rounded-gov-md`), and the runtime tokens
are in `src/features/samples/govDesignSystem.css`.

**Regenerating.** The pages are generated, never hand-edited:

```bash
npm run build:samples      # sync the CSS mirror, then regenerate the pages
```

**On placeholder content.** `design.md` §69 forbids inventing official
statistics, legal language, fees or processing times. The samples therefore carry
a source and period note beside every figure, and the service detail page
explicitly defers on fees and processing time rather than inventing them. A test
enforces this.

---

## Commands

```bash
npm run dev          # dev server with HMR
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
npm test             # 144 unit tests
npm run test:watch   # tests in watch mode
npm run test:e2e     # 15 Playwright tests in a real Chromium
npm run build:samples# regenerate the government sample site
npm run typecheck    # tsc, strict
npm run verify       # clean check + typecheck + tests + samples + build
```

`npm run test:e2e` starts its own dev server and drives the real app: it proves
the app boots, that `editor-inject.js` executes inside the sandboxed canvas, that
selection opens the properties panel, and that the design system tokens resolve
in the canvas.

---

## Project layout

```
src/
├── app/                      # React shell: root, workspace gate, dialogs, settings
├── components/
│   ├── editor/               # The ported editor UI
│   │   ├── panels/           # Right-hand property panels (19 files)
│   │   └── connect/          # WordPress export flow
│   └── ui/                   # Shared primitives (panel fields, icon shim)
├── features/
│   ├── fonts/                # Local font library
│   ├── samples/              # design.md government sample site (source of truth)
│   ├── templates/            # Template/wireframe library + built-in catalog
│   └── wordpress/            # REST client, block converters, orchestrator
├── hooks/                    # Canvas postMessage bridge and autosave
├── platform/
│   ├── canvas/               # editor-inject.js and live-edit-inject.js
│   ├── fs/                   # Workspace abstraction (memory + directory)
│   ├── host/                 # The host layer: session, routing, settings
│   └── html/                 # Byte-preserving patcher and document pipeline
├── stores/                   # Zustand stores
├── styles/                   # Design tokens and component classes
├── types/                    # The host↔UI message contract
└── utils/                    # Font helpers

scripts/                      # Codemods, generators and build guards
tests/e2e/                    # Playwright browser tests
```

Key entry points:

- `src/main.tsx` → `src/app/App.tsx` — bootstrap.
- `src/platform/host/HostBridgeProvider.tsx` — the browser replacement for the
  extension's `MessageHandler`; dispatches every UI message.
- `src/platform/html/htmlPatcher.ts` — the save engine.
- `src/types/hostMessages.ts` — the full message contract.
- `src/features/samples/govSite.ts` — the government sample pages.

---

## Design

The brand colour is **`#1C4076`**, which is also the dark stop of the supplied
logo gradient — so the logo, the icon and the UI palette are consistent by
construction. The accent (`#26A5DE`) is the gradient's light stop.

Tailwind exposes them as `brand-*` and `accent-*` scales, with `shell-*` neutrals
for the editor chrome. The chrome is deliberately dark: the canvas frames the
user's own (usually light) document, and a dark shell keeps the document the
visual focus. Reusable component classes (`rd-input`, `rd-btn`, `rd-panel`, …)
live in `src/styles/globals.css`.

---

## Browser support

| Feature | Chrome / Edge | Firefox | Safari |
| --- | --- | --- | --- |
| Visual editing, all panels | ✅ | ✅ | ✅ |
| Save to a real folder | ✅ | — | — |
| In-browser project + downloads | ✅ | ✅ | ✅ |
| Eyedropper | ✅ | — | — |
| Live mode | ✅ | ✅ | ✅ |

Everything degrades gracefully: when the File System Access API is missing, the
folder card is disabled and explains why, and the other two modes work fully.

---

## Extending it

Adding a feature touches at most three places, and the seams are deliberate:

1. **A new host message** — add one member to `WebviewToHostMessage` in
   `src/types/hostMessages.ts`, one `case` in
   `src/platform/host/HostBridgeProvider.tsx`, and (if the UI needs to react) one
   `case` in `src/platform/host/messageRouter.ts`.
2. **A new panel** — create it under `src/components/editor/panels/`, take the
   callbacks it needs as props, and render it from `EditorShell.tsx`. Panels
   never talk to the host directly except through `useHostBridge()`.
3. **A new workspace back-end** — implement the `Workspace` interface in
   `src/platform/fs/types.ts`. Nothing else in the app knows which back-end is
   in use.

Package-by-feature, not by layer: `src/features/*` holds self-contained
capabilities with their own client, logic and tests, and the host layer only
wires them up. That is what keeps the app easy to grow.

Full details, including the save pipeline and the message protocol, are in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Licence

See [LICENSE](LICENSE).
