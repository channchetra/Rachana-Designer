#!/usr/bin/env node
/**
 * Guard against stray TypeScript emit output (monorepo-wide).
 *
 * `tsc -b` with project references can emit `.js` files next to their `.ts`
 * sources. Vite then resolves the stale `.js` instead of the source, so a
 * working change silently appears to have no effect.
 *
 * This walks every workspace (`apps/*`, `packages/*`) and removes any
 * `.js`/`.d.ts` under `src/` that shadows a TypeScript source, while leaving
 * deliberately-authored JavaScript in place.
 *
 * Usage:  node scripts/clean-emitted-js.mjs [--check]
 *   --check  exit 1 and list the files instead of deleting them (for CI)
 */

import { readdirSync, statSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Hand-written JavaScript that must never be deleted. */
const INTENTIONAL_JS = new Set([
  "editor-inject.js",
  "live-edit-inject.js",
  "htmlArtifactCleanup.js",
  "htmlArtifactCleanup.d.ts",
]);

const checkOnly = process.argv.includes("--check");
const offenders = [];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function* srcDirs() {
  for (const group of ["apps", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = join(groupDir, entry.name, "src");
      if (existsSync(src)) yield src;
    }
  }
}

for (const srcDir of srcDirs()) {
  for (const file of walk(srcDir)) {
    const name = basename(file);
    const ext = extname(name);
    if (ext !== ".js" && ext !== ".d.ts") continue;
    if (INTENTIONAL_JS.has(name)) continue;

    const stem = name.replace(/\.d\.ts$/, "").replace(/\.js$/, "");
    const shadowsTs = existsSync(join(dirname(file), `${stem}.ts`));
    const shadowsTsx = existsSync(join(dirname(file), `${stem}.tsx`));
    if (shadowsTs || shadowsTsx) offenders.push(file);
  }
}

if (offenders.length === 0) {
  console.log("clean-emitted-js: nothing to do");
  process.exit(0);
}

if (checkOnly) {
  console.error(`clean-emitted-js: found ${offenders.length} emitted file(s) shadowing TypeScript sources:`);
  for (const file of offenders) console.error(`  ${file.replace(root, "").replace(/\\/g, "/")}`);
  console.error("\nRun `node scripts/clean-emitted-js.mjs` to remove them.");
  process.exit(1);
}

for (const file of offenders) {
  statSync(file);
  unlinkSync(file);
}
console.log(`clean-emitted-js: removed ${offenders.length} emitted file(s)`);
