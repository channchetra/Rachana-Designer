# Rachana Designer — Visual Editor

A visual, drag-and-drop editor for **HTML, Markdown and Astro**, right inside VS Code.

Click any element in a live canvas and style it with real controls — typography,
colour, spacing, layout, grid, shadows, transforms, filters, animations — then
save. Saves are **byte-preserving patches**: comments, attribute quoting and
unrelated formatting survive exactly, because the editor splices the original
source text rather than re-serialising a DOM.

**Every feature is unlocked.** There is no account, no sign-in and no licence tier.

## Open the editor

Right-click an `.html`, `.htm`, `.astro`, `.md` or `.mdx` file and choose
**Open in Rachana Designer** — or use the pencil icon in the editor title bar, or
run the command from the palette.

## What it does

### Editing

- **Direct-manipulation canvas** — click, hover, select, double-click to edit text.
- **DOM tree** — select, hover-highlight, rename a tag inline, delete nodes.
- **Source pane** — open the real source at the exact line, with `Ctrl/Cmd+S` to save.

### Styling

Typography, colours (with a gradient editor), spacing, layout, position, size,
border, shadow, transform and effects — plus a read-only computed-CSS inspector
and an attribute editor. Manage CSS classes (add, remove, rename,
remove-with-styles) and design tokens from the built-in design system panel.

### Layout and motion

- **Layout presets** with a drag-to-resize column planner.
- **Grid builder** with per-device placement and generated CSS.
- **Animations** with five trigger types, ten presets, and a visual keyframe
  builder. View-triggered effects inject an observer so they work in the exported
  page, not just in the editor.

### Content and export

- **Template library** — wireframe gallery plus 13 government sample pages.
- **Snapshots** — point-in-time captures per file.
- **Screenshots** at 16 device presets, PNG or WebP.
- **WordPress export** in three packaging modes, with media upload and CSS-variable
  export.

## File formats

| Format | Behaviour |
| --- | --- |
| `.html` / `.htm` | Edited directly. Saves are byte-preserving patches. |
| `.md` / `.mdx` | YAML frontmatter preserved verbatim; the body is edited visually and converted back with GFM support. |
| `.astro` | Frontmatter preserved; template bodies edited as HTML; new CSS rules routed into your project's existing stylesheets. |

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `rachana.styleMode` | `class` | Apply changes to CSS classes, or as inline styles. |
| `rachana.styleScope` | `local` | Where new CSS rules go for `.astro` files. |
| `rachana.globalCssPath` | `src/styles/global.css` | The project stylesheet. |
| `rachana.liveServerUrl` | *(empty)* | A running dev server origin for Live mode. |

WordPress application passwords are stored in VS Code's **SecretStorage**, not in
plain text.

## Architecture

This extension is one of three hosts for the same editor core. The UI, the save
engine and the WordPress converters are shared; only file access, dialogs,
storage and clipboard are implemented per host.

- `@rachana/core` — headless, host-agnostic core
- `apps/web` — the browser app
- `apps/vscode` — this extension
- `apps/desktop` — a planned Tauri desktop app

## Licence

MIT.
