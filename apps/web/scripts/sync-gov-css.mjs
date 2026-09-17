#!/usr/bin/env node
/**
 * Sync the design system stylesheet into a JSON module.
 *
 * Why JSON: the CSS text has to reach the app as a *string* so it can be inlined
 * into each generated sample page. `?raw` imports behave differently across Vite
 * (works) and Vitest (resolves to an empty string because its CSS plugin claims
 * the import), and `node:fs` cannot be used in app code because Vite externalises
 * it for the browser.
 *
 * A JSON import is handled identically by Vite, Vitest and esbuild and needs no
 * filesystem access, so one source of truth works everywhere.
 *
 * Run this after editing `govDesignSystem.css`; `npm run build:samples` does it
 * automatically, and a test fails if the JSON is out of date.
 *
 * Usage:  node scripts/sync-gov-css.mjs [--check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "src", "features", "samples", "govDesignSystem.css");
const jsonPath = join(root, "src", "features", "samples", "govDesignSystem.json");

const checkOnly = process.argv.includes("--check");
const css = readFileSync(cssPath, "utf8");

if (checkOnly) {
  let current = "";
  try {
    current = JSON.parse(readFileSync(jsonPath, "utf8")).css ?? "";
  } catch {
    console.error("sync-gov-css: govDesignSystem.json is missing or unreadable");
    process.exit(1);
  }
  if (current !== css) {
    console.error(
      "sync-gov-css: govDesignSystem.json is out of date — run `node scripts/sync-gov-css.mjs`"
    );
    process.exit(1);
  }
  console.log("sync-gov-css: up to date");
  process.exit(0);
}

// A single `css` key keeps the payload obvious and diff-friendly.
writeFileSync(jsonPath, `${JSON.stringify({ css }, null, 2)}\n`, "utf8");
console.log(
  `sync-gov-css: wrote ${(Buffer.byteLength(css, "utf8") / 1024).toFixed(1)} kB of CSS to govDesignSystem.json`
);
