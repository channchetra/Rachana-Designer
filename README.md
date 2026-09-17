# Rachana Designer — monorepo

One headless editor core, three host adapters.

```
packages/core/     headless, host-agnostic editor core   (no DOM, no host APIs)
apps/web/          browser app — File System Access API   ✅ working
apps/vscode/       VS Code extension — workspace.fs       ✅ packages to a .vsix
apps/desktop/      Tauri desktop app                      📋 skeleton + plan
```

## Install the VS Code extension

```bash
npm install
npm run vscode:package
code --install-extension apps/vscode/rachana-vscode-1.0.0.vsix
```

Then right-click any `.html`, `.astro`, `.md` or `.mdx` file and choose
**Open in Rachana Designer**.

## Why a monorepo

The three targets differ only in *where files come from* and *how dialogs appear*.
Everything else — the byte-preserving save engine, the document pipeline, CSS
routing, the WordPress converters, the 14k-line editor UI — is identical. A
monorepo makes that structural instead of aspirational: the shared code lives in
one place and each host supplies four small adapters.

| Port | Web (done) | VS Code | Tauri |
| --- | --- | --- | --- |
| `Workspace` | File System Access API | `workspace.fs` | `@tauri-apps/plugin-fs` |
| `PlatformOps` | in-app modals | `showInputBox` / `showQuickPick` | Tauri dialog plugin |
| `Storage` | `localStorage` | `globalState` | Tauri store |
| `Clipboard` | `navigator.clipboard` | `vscode.env.clipboard` | Tauri clipboard |

## Commands

```bash
npm install                # installs every workspace, links @rachana/core

npm run dev                # web app dev server (http://localhost:5178)
npm run build              # build the web app
npm test                   # 144 unit tests across core + web
npm run test:e2e           # 16 Playwright tests in real Chromium
npm run typecheck          # strict tsc across all workspaces
npm run verify             # clean check + typecheck + tests + build

npm run vscode:package     # build a loadable .vsix
```

## How the split works

`@rachana/core` is resolved straight to TypeScript source — no build step between
the core and its consumers. Vite compiles it as if it were local, so `npm run dev`
and HMR work across the package boundary, and editing core code hot-reloads the
app immediately.

The web app keeps its original import paths through thin re-export shims
(`apps/web/src/platform/html/htmlPatcher.ts` → `@rachana/core/html`). That is what
let the split land without touching a single call site, which is why all 144 unit
tests and 16 browser tests still pass unchanged.

New code should import from `@rachana/core` directly.

## What is in the core today

| Module | Lines | Why it is safe to share |
| --- | --- | --- |
| `html/htmlPatcher.ts` | ~700 | **Zero imports.** Pure text splicing. |
| `html/htmlArtifactCleanup.js` | ~150 | **Zero imports.** Plain JS so the rules stay testable. |
| `contracts/workspace.ts` | ~280 | **Zero imports.** The `Workspace` interface plus path/byte helpers. |
| `wordpress/convert.ts` | ~1040 | **Zero imports.** Hand-written parser and serialiser. |
| `wordpress/markdownToBlocks.ts` | ~270 | **Zero imports.** Same. |

The remaining host-adjacent code (editor session, CSS routing, Astro/CSS editors,
live runtime, fonts, templates, WordPress client and orchestrator) moves into the
core as each target needs it — see [`docs/MIGRATION.md`](docs/MIGRATION.md).

## Documentation

| Document | Contents |
| --- | --- |
| [`apps/web/README.md`](apps/web/README.md) | The app itself: features, quick start, design system samples |
| [`apps/web/docs/TESTING.md`](apps/web/docs/TESTING.md) | Full test plan: automated, manual walkthrough, regression checklist, build guards |
| [`apps/web/docs/ARCHITECTURE.md`](apps/web/docs/ARCHITECTURE.md) | The save pipeline, message contract, and invariants to protect |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | Status, remaining work, and the plan for each target |

## Licence

MIT — see [`apps/web/LICENSE`](apps/web/LICENSE).
