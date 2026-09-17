# Rachana Designer — Test Plan

Everything in this document is a step you can follow in a browser, plus the
command that automates it where automation is possible.

- **Part A** — automated tests (run in CI, no browser needed).
- **Part B** — manual feature walkthrough, grouped by the panel or mode you are testing.
- **Part C** — regression checklist for the save pipeline (the highest-risk area).
- **Part D** — known limitations and how to confirm them.

---

## Part A — automated tests

### A.0 One-time setup

```bash
cd Rachana-Designer
npm install
```

If `npm` reports that `esbuild` has install scripts that were not run, approve
them — Vite will not build without the native binary:

```bash
npm install-scripts approve esbuild
```

### A.1 Run everything

```bash
npm test          # vitest, single run
npm run test:watch
npm run test:e2e  # Playwright, real Chromium
npm run verify    # clean check + typecheck + tests + samples + build
```

Expected: **144 unit tests** across 7 files, and **15 Playwright tests**.

| Test file | Covers | Tests |
| --- | --- | --- |
| `src/platform/html/htmlPatcher.test.ts` | Byte-preserving save: attribute edits, deletions, insertions, tag changes, class renames, managed `<style>`/`<script>` blocks, document scaffolding | 18 |
| `src/platform/html/document.test.ts` | Markdown ↔ HTML round trip, frontmatter and Astro component handling, display-transform stripping | 22 |
| `src/platform/fs/workspace.test.ts` | Path maths, filename sanitizing, sandbox escape rejection, memory-workspace semantics | 17 |
| `src/platform/host/styleRouter.test.ts` | CSS rule splitting, routing to project CSS / local block / global stylesheet, managed font segments | 22 |
| `src/features/wordpress/convert.test.ts` | Gutenberg block markup, attribute escaping, YouTube normalisation, CSS-variable and media extraction | 31 |
| `src/features/samples/govSite.test.ts` | The `design.md` sample site: structure, one-h1-per-page, trust bar, labels, link integrity, and the spec's prohibitions | 24 |
| `src/features/templates/library.test.ts` | Template catalog: offline fallback, government category, pagination, embedded design tokens | 10 |

### A.2 Browser tests

`npm run test:e2e` starts a dev server and drives the real app in Chromium. These
cover what unit tests structurally cannot:

| Area | What it proves |
| --- | --- |
| App boot | The welcome screen offers every entry point and has no sign-in |
| Canvas | `editor-inject.js` **executes** inside the sandboxed iframe (`__glGetFullHtml` is a function, `data-gl-path` nodes exist) |
| Editing | Clicking a canvas element selects it and opens the properties panel; edits reach the canvas |
| Panels | Design system, animations, wireframes and the elements tree all open |
| Sample site | The 13-page government project loads and its design tokens resolve inside the canvas |
| Accessibility | No horizontal overflow at 320px; controls are keyboard reachable |
| Theming | The primary action resolves to `#1C4076` |

If they fail on a fresh clone, install the browser once:

```bash
npx playwright install chromium
```

### A.3 What each unit suite proves

**`htmlPatcher.test.ts` — the save contract.**
The editor must never re-serialise a DOM. The tests assert that after a patch:
comments survive verbatim, single-quoted attributes keep their quoting, a
sibling element is byte-identical, and an untouched `<style>` block is
unchanged. If any of these fail, saves are lossy and the feature is not
shippable.

**`document.test.ts` — the markdown contract.**
Open a `.md` file, edit it visually, save: only the body may change, frontmatter
must be byte-identical. The round-trip test converts markdown → HTML → markdown
and asserts the structural elements survive.

**`workspace.test.ts` — the sandbox contract.**
`joinPath("a", "..", "..", "evil")` must yield `../evil`, not `evil`, and the
workspace must reject it. This is what stops a crafted template or an imported
folder from writing outside the project.

**`styleRouter.test.ts` — the Astro tidiness contract.**
Editing a rule that already exists in a project stylesheet updates it in place;
it never appends a duplicate. `:root` rules always go global. Removing the last
font segment actually deletes it from `global.css`.

**`convert.test.ts` — the WordPress contract.**
Block delimiters and attribute JSON are byte-exact, because a mismatch makes
WordPress reject the block.

**`govSite.test.ts` — the design-system contract.**
Asserts the generated pages satisfy `design.md`: exactly one `h1` per page, the
trust bar on every page, a skip link, `aria-current` on the active nav item, a
labelled language switcher, labelled form controls, document format and size on
downloads, a source/period note beside every statistic, no emoji, and — the
easy one to get wrong — that no page invents a fee or a price. It also checks
every internal link resolves to a generated page, so a rename cannot ship a
broken link.

**`library.test.ts` — the gallery contract.**
The template gallery must work offline; the tests prove the built-in catalog
serves when the remote library is unreachable, that the `government` category
holds every sample page, that pagination does not overlap, and that each
government template carries the design token layer (without it, the `gov-*`
classes would be inert on insert).

### A.4 Type safety

```bash
npm run typecheck
```

Expected: no output, exit code 0. The project builds under `strict: true`.

### A.5 Production build

```bash
npm run build
npm run preview     # serves dist/ on http://localhost:4173
```

Expected: `dist/` contains `index.html`, a CSS bundle, the JS chunks (`react`,
`codemirror`, `markdown`, `bridge`) and a `sample-site/` folder with 13 pages.

`npm run build` also runs the emitted-JS guard, which fails if a stray compiled
`.js` is shadowing a TypeScript source — see Part D.

---

## Part B — manual feature walkthrough

Start the dev server:

```bash
npm run dev
```

Open the printed URL (default <http://localhost:5178>).

> **Which browser?** Use Chrome or Edge. They support the File System Access API,
> which is what makes "Open a project folder" write straight to disk. Firefox and
> Safari fall back to the in-browser project, where exports download as files —
> every editing feature still works.

### B.1 Start screen and workspace selection

| Step | Expected |
| --- | --- |
| Load the app | The Rachana wordmark, the tagline, and four cards: **Open a project folder**, **Import a folder**, **Government sample site**, **Start from a template** |
| Confirm no sign-in is requested anywhere | There is no login, no account prompt, no "activate" gate |
| Click **Start from a template** | The editor opens with a starter page named `index.html`. The canvas shows "Your new page" |
| Reload the page | A **Continue** card appears offering the in-browser project, because it was persisted |
| Click **Forget** | The card disappears and `localStorage` key `rachana:memory-project` is removed |

**With the File System Access API:**
1. Point a folder at a small HTML project (one `.html` file plus an `images/`
   folder and a `styles.css`).
2. Click **Open a project folder** and pick it.
3. The editor opens the first editable file and the title bar shows
   `<folder> / <file>`.
4. Edit something, wait ~2 s, then open the file in a text editor: the change is
   on disk and unrelated lines are untouched.

**Verify the sandbox:** a path containing `..` must never create a file outside
the project. Import a folder that contains such a path and confirm nothing is
written above the project root — the guard is unit-tested in
`workspace.test.ts` ("refuses paths that escape the workspace").

### B.1a The government sample site

This is the fastest way to see the whole tool working on real material.

| Step | Expected |
| --- | --- |
| Click **Government sample site** | Thirteen pages load into an in-browser project and the homepage opens in the canvas |
| Click any headline in the canvas | It is selected and the properties panel opens with the element's real computed styles |
| Change a colour in **Colors** | The change applies live and is saved into the project |
| Use the file browser (folder icon) | All thirteen pages are listed: `index.html`, `services.html`, `service-detail.html`, `news.html`, `news-article.html`, `knowledge.html`, `about.html`, `faq.html`, `contact.html`, `404.html`, `search.html`, `privacy.html`, `terms.html` |
| Open `contact.html` | The form renders with labels, help text, a file-upload field and a required checkbox |
| Open `faq.html` | The accordion expands and collapses; each item is a real `<button>`-equivalent disclosure |
| Zoom the browser to 200% | Khmer text reflows; no glyphs are clipped and no horizontal scrollbar appears |
| Open the **Wireframes** panel and filter to the `government` category | All thirteen pages appear as insertable templates |
| Insert one | The page composes into the canvas with its design tokens intact |

**Verify the design tokens** — in the canvas iframe's console:

```js
getComputedStyle(document.documentElement).getPropertyValue("--gov-primary")
// → "#1c4076"
```

**Verify the pages stand alone** — open `public/sample-site/index.html` directly
in a browser (no server): it renders fully, because each page inlines its
stylesheet.

### B.2 The canvas and element selection

| Step | Expected |
| --- | --- |
| Click any element in the canvas | It gets a selection outline; the Properties panel opens on the right |
| Hover an element | A hover outline appears |
| Click empty canvas area | The selection clears |
| Double-click text | It becomes editable in place; typing updates the canvas |
| Drag a block from the toolbar's **Add** menu onto the canvas | A drop indicator appears and the block is inserted at the drop point |

### B.3 Properties panel — every section

Select a `<div>` that contains text, then walk each collapsible section. All of
these are ported unchanged from the original editor.

| Section | What to verify |
| --- | --- |
| **Typography** | Font size, line height, weight, align, decoration, letter case all update live. **Advanced** adds letter spacing, word break, white space, text overflow, font style, writing mode, text shadow, font family |
| **Colors** | Text color, background color, background **image** with a real gradient editor (add/drag/remove stops), size/position presets, repeat, attachment, blend mode, clip |
| **Spacing** | Padding and margin with a linked/unlinked toggle and an auto H/V mode; overflow with a linked/split mode |
| **Layout** | Display segmented control, a direction-aware flex picker, gap with link/unlink, plus the **Layout presets** and **Grid builder** tools |
| **Position** | Offsets appear only when `position` is not `static` |
| **Size** | Width/height/min/max, aspect ratio, object fit/position, scroll snap, touch action, scrollbar |
| **Border** | Per-side and per-corner modes, plus a shorthand mode; the style swatches preview each border style |
| **Shadow** | Add multiple layers; toggling `inset` updates immediately (no flicker) |
| **Transform** | Toggle individual transform functions; the composed value is always emitted in table order |
| **Effects** | Opacity, blend mode, clip-path presets, filters (blur, brightness, drop-shadow…), backdrop filter, mask |
| **CSS** | A read-only list of every computed property with a colour-coded source badge (inline / #id / .class / computed) |
| **Attributes** | Add, edit and remove attributes; a value renders as *empty* when blank |
| **DOM tree** | Click to select, hover to highlight, rename a tag inline, delete a node |

**Reset check:** the coloured dot next to a section name clears every property in
that section when clicked.

### B.4 Design system panel

| Step | Expected |
| --- | --- |
| Open the **Design system** panel (right side of the toolbar) | It lists every CSS variable in the document |
| Create a variable (name `--brand`, value `#1C4076`) | It appears in the list and is injected into the document |
| Edit a variable's value | The canvas updates immediately |
| Delete a variable | It disappears from the list and the document |
| Open the **Typography** tab | Detected fonts are listed, plus a searchable Google Fonts catalog (the built-in catalog is used when `fonts.google.com` is unreachable) |
| Click **Use** on a Google font | The `@font-face`/`@import` is injected and the text re-renders |
| Upload a `.woff2` file | The panel reports the family name and the font becomes selectable |
| Click **Export** | A `:root { … }` block is shown with **Copy to clipboard** and **Save on sibling files** |
| With a Tailwind CDN document open, click **Tailwind convert** | A warning modal explains the conversion; confirming replaces the CDN with static CSS and the button disappears |

> No option is locked. The original editor gated parts of this panel behind a
> licence; Rachana Designer does not.

### B.5 Animations panel

| Step | Expected |
| --- | --- |
| Open the **Animations** panel | A list with an empty state and a **New animation** button |
| Add an animation | A class name, trigger, duration, easing, delay, direction, fill and iteration count are editable |
| Pick a trigger: **On load / On hover / On view / On scroll / On class** | The generated selector changes accordingly (`:hover`, `.gl-in-view`, `animation-timeline`, or a class pair) |
| Choose **On view** | An observer script is injected so the class flips when the element scrolls into view |
| Use the keyframe builder | Add/remove keyframes, drag the markers, type CSS directly; the preview plays |
| Apply 10 different presets (Fade In, Slide Up, Scale In, Show on Entry, Clip on Entry, Scroll Parallax, Hover Grow, Spin, Pulse, Bounce) | Each generates valid CSS and animates |
| Reload the page and reopen the panel | Saved animations are restored from the document |

### B.6 Wireframes / template library

| Step | Expected |
| --- | --- |
| Open the **Wireframes** panel | Template cards load (from the configured library, or the built-in starter catalog when it is unreachable) |
| Filter by **Free** / **Full** | The list filters; both are importable |
| Click a card | The template loads and is inserted into the canvas |
| Drag a card onto the canvas | It drops at the drop indicator |
| Scroll to the bottom | More templates load (infinite scroll) |
| Hover a card with a video preview | The preview plays; leaving pauses and rewinds it |

**Offline check:** disconnect the network, reload, and open the panel. The
built-in catalog appears and importing still works.

### B.7 Snapshots

| Step | Expected |
| --- | --- |
| Open the **Snapshots** panel | Empty state with a **Save Current as Snapshot** button |
| Click it | A snapshot appears, timestamped, with Rename / Load / Save Current / Delete |
| Make more edits, then **Load** an older snapshot | The canvas and the on-disk file both revert to that snapshot |
| Reload the page | Snapshots persist (they live in `localStorage` under `rachana:snapshots:<file>`) |
| Open an `.astro` file | The Snapshots button is hidden, because rule routing makes a point-in-time HTML snapshot meaningless there |

> There is no "Upgrade" path and no locked overwrite: the original editor gated
> overwriting a snapshot behind a licence.

### B.8 Screenshots

| Step | Expected |
| --- | --- |
| Click the **Camera** button | A modal lists 16 device presets, PNG/WebP, and an optional background colour |
| Tick a few devices and capture | Progress advances per device and thumbnails appear |
| Click download on a thumbnail | A single image downloads |
| Click **Save to folder** | The workspace writes `screenshots_<file>_<hash>/` with every image; the folder name is reported |

### B.9 Markdown mode

| Step | Expected |
| --- | --- |
| Open a `.md` file | The markdown toolbar appears (bold, italic, strikethrough, headings, lists, table, quote, code, link, image) |
| Select text and click **Bold** | The text is wrapped and the canvas updates |
| Insert a link | A dialog asks for the URL, then the link is inserted |
| Paste an image from the clipboard | The image is written next to the file and inserted at the cursor |
| Save and inspect the file | The markdown body changed and the YAML frontmatter is byte-identical |

### B.10 Astro files

| Step | Expected |
| --- | --- |
| Open a `.astro` file | Frontmatter is stripped from the canvas; the template body is editable |
| Edit a style | The rule is routed: into an existing project stylesheet if the selector already exists there, otherwise into `<project root>/src/styles/global.css` or a local `<style data-gl-editor>` block |
| Switch the **style scope** control in the toolbar | The label and hints change, and new rules land accordingly |
| Save and inspect the file | Frontmatter is untouched; the body has only the intended edits |

### B.11 Live mode (dev server)

Live mode needs a dev server, because a browser cannot start one.

1. In a terminal, start your Astro project: `npm run dev`.
2. In Rachana Designer open **Settings → Live mode** and enter the dev server URL
   (for example `http://localhost:4321`).
3. Open a page under `src/pages/`, then click the **Live** switch in the toolbar.

| Step | Expected |
| --- | --- |
| Click an element in the live preview | A live-selection panel appears with the source file and line |
| Click **Edit source** | The built-in source pane opens at that line |
| Edit a CSS declaration in the live panel | The source file is rewritten and the preview refreshes |
| Press **Undo** / **Redo** in the toolbar while in Live mode | The declaration edit is reverted / reapplied |
| Open a component or layout (not under `src/pages/`) | A clear message explains that Live mode previews pages, and suggests Edit mode |

> **This is the one feature with an environment prerequisite.** If the dev server
> does not allow this page to fetch it, the panel shows the URL it tried. Either
> serve Rachana Designer from the same origin, or add a CORS allowance to the dev
> server. Edit mode needs none of this.

### B.12 WordPress export

Open **Connect** in the toolbar.

**Code-only export (no site required):**
1. Choose an export mode: **As GreenLight blocks**, **As one GreenShift HTML
   block**, or **As one core HTML block**.
2. Choose how external assets are handled: keep as an HTML block, download and
   inline, or remove.
3. Click **Export Code Only**. The generated markup appears in a copyable pane.

**Exporting to a site:**
1. **Add site** with label, URL, username and a WordPress *Application Password*
   (Users → Application Passwords).
2. Click the test button. Success reports the site name; failure reports the
   reason (bad credentials, missing GreenShift plugin, unreachable host).
3. Choose a destination: Page, Reusable block, or Site template / part.
4. Choose the options: upload media, skip existing media, export CSS variables,
   convert styles to editable classes, wrap in a full-width section, export
   Google Fonts.
5. Export. Progress advances through parsing → assets → fonts → media →
   variables → destination, and the result links to the created item.

> **CORS is the one real constraint.** A stock WordPress site sends no CORS
> headers, and Application Passwords use HTTP Basic auth, which browsers
> preflight. If the direct connection is blocked, either add a CORS allowance to
> the site or set **Settings → WordPress export → Transport** to *Via CORS proxy
> prefix* and supply a prefix. Edit mode and code-only export are unaffected.

> Nothing in this flow is licence-gated. The original editor required an
> activated licence to export to a site.

### B.13 Toolbar, settings and diagnostics

| Step | Expected |
| --- | --- |
| Click **Undo** / **Redo** | The canvas history moves (Live mode delegates to source undo instead) |
| Click the device buttons | The canvas resizes to desktop / tablet / mobile |
| Click the folder button | A list of editable files in the current folder; clicking one opens it |
| Click **New file** | A dialog validates the name; an existing name is rejected with a clear error |
| Click **Open in browser** on an `.html` file | The file opens in a new tab |
| Open **Settings** | Project, styling, Live mode, WordPress, template library, edition and diagnostics sections |
| Open the **bug** icon in the title bar | The host-message log lists every round-trip with a byte-level summary; pause, clear and copy work |
| Trigger an error (rename a file on disk while it is open) | A red banner appears with a **Reload** action |

### B.14 Edition / no-lock verification

Confirm that **no** feature is gated. Search the source for the old gating
patterns — there should be no functional hits:

```bash
grep -rn "licenseStatus === \"active\"" src --include=*.tsx --include=*.ts
grep -rn "setLicenseModalOpen(true)" src --include=*.tsx --include=*.ts
grep -rn "Upgrade" src --include=*.tsx --include=*.ts
```

Expected: the only remaining reference is in `SettingsPanel.tsx`, which *displays*
the "Full Edition" badge. `licenseStore.ts` reports `licenseStatus: "active"`
unconditionally, which is why every `isPro` check that was ported still passes.

---

## Part C — save-pipeline regression checklist

Run this before shipping any change that touches the canvas, the inject script or
the patcher. It is the path where a bug silently corrupts a user's file.

1. **Unrelated bytes are preserved.** Open an HTML file containing a comment, a
   single-quoted attribute, indentation you care about, and a `<style>` block.
   Change one colour in the Colors panel. Diff the file: only that declaration
   may differ. *(Automated in `htmlPatcher.test.ts`.)*
2. **Attributes.** Add an attribute, edit it, remove it. Reopening the file shows
   `name="value"` with `&` and `"` correctly escaped.
3. **Text edits.** Double-click text, change it, save, reopen: no entity
   double-escaping (`&amp;amp;`).
4. **Structural edits.** Delete an element, insert a block, move an element by
   drag. Save and reopen: the document is still well-formed and unrelated nodes
   are unchanged.
5. **Class rename.** Rename a class in the panel: both the `class` attribute and
   the `.selector` in the stylesheet update, and no stale name remains.
6. **Managed blocks.** Apply an animation (creates `gl-anim-*`), then delete it.
   The style block is gone from `<head>` and the file has no orphan markers.
7. **Markdown.** Edit a `.md` file with frontmatter. Save. The frontmatter is
   byte-identical and the body reflects the edit.
8. **Astro.** Edit a style whose selector already exists in a project stylesheet.
   The rule is updated in place — no duplicate is appended to `global.css`.
9. **Reload safety.** Reload the page after each step above and confirm the
   canvas matches the file (the app re-reads from the workspace).
10. **External change.** Edit the file in another editor, wait ~4 s, and confirm
    the canvas picks the change up without a full reload.

---

## Part D — known limitations

Each item below is honest, verified behaviour — not a bug to report.

| Limitation | Why | How to confirm |
| --- | --- | --- |
| "Open a project folder" needs Chrome or Edge | It uses the File System Access API | Open the app in Firefox: the card is disabled and explains why; the other two modes work fully |
| Live mode needs a running dev server | A page cannot spawn a process | Switch to Live with no URL set: the panel explains what to configure |
| Live mode needs cross-origin access to the dev server | The page fetches the dev server directly | With the server running but no CORS allowance, the error names the URL it tried |
| WordPress REST calls may need a proxy | WordPress sends no CORS headers and Basic auth preflights | Try a direct connection; on failure set the proxy prefix in Settings |
| WordPress site passwords live in `localStorage`, not an OS keychain | Browsers have no secret store | Settings documents this; the export flow still works |
| Google Fonts metadata falls back to a built-in catalog | `fonts.google.com/metadata/fonts` sends no CORS headers | Disconnect the network, open Design system → Typography: 48 curated families are listed |
| The template library falls back to built-in starters | Same cross-origin constraint | Disconnect the network, open Wireframes: 12 starter templates are listed |
| Only `@astrojs/compiler` (WASM) is used for Live AST edits | `@astrojs/compiler` ships a browser build; a Node-only compiler would not run | Live mode's element-level edit works; scoped Astro `<style>` hashing cannot be reproduced in the preview, which is why frontmatter CSS is inlined unwrapped |
| Snapshot history is per file, keyed by path | Matches the original editor's behaviour | Move a file and its snapshots do not follow it |
| In-memory projects are capped by `localStorage` (~5 MB) | Persistence uses `localStorage` | A very large imported folder may not be restored after reload; choose a real folder for large projects |
| The government sample content is placeholder text | `design.md` §69 forbids inventing official statistics, legal language, fees or processing times | Every figure carries a source/period note; the service detail page defers on fees rather than inventing them; `govSite.test.ts` enforces both |
| The sample site is generated, not hand-edited | Deriving all three consumers (browsable site, app project, gallery templates) from one source is what stops them drifting | Edit `src/features/samples/govSite.ts` or `govDesignSystem.css`, then run `npm run build:samples`; a test fails if `govDesignSystem.json` is stale |
| The English language switcher is not a link | `design.md` §58 describes a `/km` and English pairing but no English pages exist in the sample | The switcher shows `EN` as clearly unavailable rather than linking to a missing page; a test asserts no internal link 404s |

---

## Part E — build guards

Two scripts protect against failure modes that are otherwise silent.

### E.1 Emitted-JavaScript shadowing

`tsc -b` with project references can emit `.js` files next to their `.ts`
sources. Vite then resolves the stale `.js` and a correct source change appears
to have no effect.

```bash
npm run clean:check   # fails and lists the files (used by `npm run verify`)
npm run clean         # removes them
```

Three JavaScript files are legitimately hand-written and are never removed:
`editor-inject.js`, `live-edit-inject.js` and `htmlArtifactCleanup.js`.

### E.2 Stylesheet mirror

The government design system's CSS is authored in `govDesignSystem.css` and
mirrored into `govDesignSystem.json` for import. The mirror exists because
`?raw` imports resolve to an empty string under Vitest and `node:fs` cannot be
imported in app code.

```bash
npm run sync:samples-css   # rewrite the mirror
```

`govSite.test.ts` fails if the mirror is out of date, so a stale stylesheet
cannot ship.

