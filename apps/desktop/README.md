# Rachana Designer — Tauri desktop app (skeleton)

**Status: not implemented.** This folder holds the plan and the shape of the
adapters, so the design is settled before any Rust is written. Nothing here is on
the build or test path yet.

---

## Why a desktop target at all

The web app is complete, but three of its limitations are browser limitations
rather than design choices. Tauri removes all three:

| Limitation in the web app | Why | With Tauri |
| --- | --- | --- |
| Live mode needs a URL you start yourself | A page cannot spawn a process | **Spawn `npm run dev` and stream its log** — what the original VS Code extension did |
| WordPress export may need a CORS proxy | Browser preflight and no `Access-Control-Allow-*` on a stock site | **Requests go through Rust.** No CORS, no proxy |
| "Open a project folder" needs Chromium | File System Access API | Native folder picker everywhere |

That first row is the strongest argument: Tauri restores a capability the
browser genuinely cannot have. Live mode is currently the weakest feature in the
web app precisely because it is half-manual.

---

## Shape

```
apps/desktop/
├── src-tauri/            Rust shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs       app setup, plugin registration
│       ├── commands.rs   exposed commands (file ops, dev server, http)
│       └── devserver.rs  spawn + supervise the project's dev server
├── adapters/             the four ports, implemented against Tauri
│   ├── workspace.ts      plugin-fs        → core Workspace
│   ├── ports.ts          plugin-store/dialog/clipboard → core ports
│   └── assets.ts         resource dir     → core AssetsPort
└── webview/              the shared UI
    ├── main.tsx          same entry as the VS Code webview
    └── host.ts           HostChannel over Tauri IPC
```

`webview/` is nearly identical to `apps/vscode/webview/` — the same `App`, the
same `HostChannel` contract, a different transport. That is the payoff of the
`HostChannel` seam.

---

## Adapter mapping

| Core port | Tauri API | Notes |
| --- | --- | --- |
| `Workspace` | `@tauri-apps/plugin-fs` | Directory-backed, like the VS Code adapter. `toDisplayUrl` uses `convertFileSrc`. |
| `StoragePort` | `@tauri-apps/plugin-store` | JSON store in the app data directory. |
| `SecretPort` | `plugin-store` + OS keychain via `keyring` | A real improvement over the web app, which stores WordPress passwords in plain `localStorage`. |
| `AssetsPort` | `path.resourceDir()` + `plugin-fs` | The inject scripts and sample site ship as bundled resources. |
| `OpsPort` | `plugin-dialog`, `plugin-clipboard-manager` | Native dialogs; clipboard works without a user gesture. |

---

## What Tauri does *better* than the other two targets

### 1. Live mode becomes fully automatic

A Rust command spawns the project's dev server, watches stdout for the URL, and
streams it to the UI — then the preview renders the running site.

```rust
#[tauri::command]
async fn start_dev_server(root: String, state: State<'_, DevServers>) -> Result<String, String> {
    // Detect the package manager from the lockfile, run `<pm> dev`,
    // scan stdout for `http://localhost:PORT`, return the URL.
}
```

This is exactly what `runtimeManager.ts` did in the original VS Code extension,
and it is the one piece of that design worth restoring.

### 2. No CORS anywhere

Route `fetch` through a Rust command and the WordPress exporter works against any
site with no proxy prefix. Tiered CORS in the web app currently pushes that
complexity onto the user.

### 3. Real file watching

`notify` gives proper OS-level file events, so "external change" detection stops
being a 4-second poll (what the web app does today).

---

## Risks, stated honestly

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Webview differs per platform** — WebKitGTK on Linux, WKWebView on macOS, WebView2 on Windows | The canvas iframe and CodeMirror are the most likely to diverge | Test all three early; the canvas uses a nested `srcdoc` iframe, which is the riskiest construct |
| Rust toolchain required to build | Contributors cannot build the desktop app without it | The web and VS Code targets stay Rust-free, so the shared work is never blocked |
| Bundle size and signing | Distribution friction | Out of scope for the first milestone |
| `@astrojs/compiler` WASM in the webview | Live-mode AST editing | Ship the WASM as a resource and load it with `convertFileSrc`; verify WebKitGTK permits it |

---

## Milestones

1. **Shell boots** — Tauri window renders the shared UI from `apps/web`, reading a
   file through the `Workspace` adapter. Proves `convertFileSrc` and the resource
   paths.
2. **Round-trip save** — edit and save through the same byte-preserving patcher,
   verified with the shared `htmlPatcher` tests.
3. **Native dialogs and storage** — the remaining ports, so every panel works.
4. **Automatic Live mode** — the Rust dev-server supervisor, which is the reason
   this target exists.
5. **Cross-platform pass** — the three webviews, with the canvas and CodeMirror
   specifically exercised.

---

## Not started

No Rust code, no `tauri.conf.json`, no implementation of the adapters. This is a
plan and a folder layout. The `/goal` objective for this stage was the monorepo,
the VS Code extension and the plan documents; the desktop app is the next
objective.
