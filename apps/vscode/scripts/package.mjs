/**
 * Package the extension into a `.vsix`.
 *
 * Why a script rather than a bare `vsce package` call:
 *
 *  1. **`@rachana/core` is a workspace package.** A published extension cannot
 *     install from a local path, and the core's TypeScript is already inlined
 *     into both bundles by esbuild — so the dependency must be rewritten out of
 *     the manifest before packaging.
 *  2. **Dev dependencies must not ship.** esbuild is a build tool; `node_modules`
 *     would add tens of megabytes to a `.vsix` that needs none of it.
 *  3. **`vsce` refuses to package without a repository field or a README**, so
 *     the staging copy supplies what the published manifest needs.
 *
 * Staging rather than mutating `apps/vscode/` keeps `npm run build` idempotent.
 *
 * Usage:  node scripts/package.mjs
 */

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const stagingDir = join(appDir, ".vsix-staging");
const distDir = join(appDir, "dist");

/** Fail loudly and early rather than shipping a broken package. */
function requireBuild() {
  const required = [
    ["dist/extension.cjs", "the extension host bundle"],
    ["dist/webview/index.js", "the webview bundle"],
    ["dist/webview/index.css", "the webview stylesheet"],
    ["dist/media/editor-inject.js", "the canvas inject script"],
  ];
  const missing = required.filter(([rel]) => !existsSync(join(appDir, rel)));
  if (missing.length) {
    console.error("package: build artefacts missing — run `npm run build` first:");
    for (const [rel, what] of missing) console.error(`  ${rel}  (${what})`);
    process.exit(1);
  }
}

requireBuild();

if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

// --- manifest -----------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));

// The core's TypeScript is already bundled; a local-path dependency would make
// the published extension uninstallable.
delete manifest.dependencies;

// Dev dependencies are build tooling and must not ship.
delete manifest.devDependencies;
delete manifest.scripts;

// `vsce` rejects a package without these.
manifest.repository = manifest.repository ?? {
  type: "git",
  url: "https://github.com/rachana/rachana-designer",
};

writeFileSync(join(stagingDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

// --- website assets -----------------------------------------------------------
cpSync(distDir, join(stagingDir, "dist"), { recursive: true });

/*
 * Strip source maps from the packaged copy.
 *
 * They are invaluable during development and worthless to a user — and at ~12 MB
 * they dwarf the 1.8 MB of real code. Nothing in the extension loads them at
 * runtime, so removing them only affects debugging inside an installed copy.
 */
function stripSourceMaps(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      stripSourceMaps(full);
    } else if (entry.name.endsWith(".map")) {
      rmSync(full, { force: true });
    }
  }
}
stripSourceMaps(join(stagingDir, "dist"));

for (const file of ["README.md", "LICENSE", "CHANGELOG.md"]) {
  const from = join(appDir, file);
  if (existsSync(from)) cpSync(from, join(stagingDir, file));
}

// The extension's own `media/` holds the icon the manifest references. It is
// distinct from `dist/media/`, which holds the runtime canvas scripts.
const sourceMedia = join(appDir, "media");
if (existsSync(sourceMedia)) {
  cpSync(sourceMedia, join(stagingDir, "media"), { recursive: true });
}

// vsce requires an icon when the manifest declares one; drop the reference if
// no icon was supplied rather than failing the whole package.
const iconPath = join(stagingDir, manifest.icon ?? "");
if (manifest.icon && !existsSync(iconPath)) {
  console.warn(`package: no ${manifest.icon} found — packaging without an icon`);
  const withoutIcon = { ...manifest };
  delete withoutIcon.icon;
  writeFileSync(join(stagingDir, "package.json"), `${JSON.stringify(withoutIcon, null, 2)}\n`, "utf8");
}

// --- run vsce -----------------------------------------------------------------
const out = join(appDir, `${manifest.name}-${manifest.version}.vsix`);

/*
 * Invoke vsce's CLI with the current Node binary rather than shelling out to
 * `npx`. On Windows, spawning a `.cmd` shim is blocked without `shell: true`
 * (a Node security mitigation), and enabling a shell would mean re-quoting every
 * argument. Running the JS entry point directly avoids the whole problem and
 * behaves identically on every platform.
 */
function resolveVsceCli() {
  const candidates = [
    join(appDir, "node_modules", "@vscode", "vsce", "vsce"),
    join(appDir, "..", "..", "node_modules", "@vscode", "vsce", "vsce"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const vsceCli = resolveVsceCli();
if (!vsceCli) {
  console.error("package: could not find @vscode/vsce — run `npm install` at the repo root");
  process.exit(1);
}

try {
  execFileSync(
    process.execPath,
    [vsceCli, "package", "--no-dependencies", "--allow-missing-repository", "--out", out],
    { cwd: stagingDir, stdio: "inherit" }
  );
  console.log(`\npackage: wrote ${out}`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
