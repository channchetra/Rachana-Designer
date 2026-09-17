#!/usr/bin/env node
/**
 * Remove the dead `AnimationSection` from EffectsPanel.
 *
 * The original editor defines a second, complete inline animation editor inside
 * the Effects panel (~265 lines, with its own keyframe presets and modal) but
 * never renders it — the live `EffectsPanel` return only renders opacity, blend
 * mode, clip path, filters and mask. Animation editing lives in the dedicated
 * Animation panel.
 *
 * Deleting unreachable code is safe; the script verifies both preconditions
 * before touching the file and refuses to act if either fails.
 *
 * Usage:  node scripts/remove-dead-animation-section.mjs [--check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src", "components", "editor", "panels", "EffectsPanel.tsx");
const checkOnly = process.argv.includes("--check");

const lines = readFileSync(target, "utf8").split("\n");

/** Locate the banner comment that precedes the dead function. */
const bannerIndex = lines.findIndex((line) => line.trim() === "// AnimationSection");
if (bannerIndex === -1) {
  console.error("remove-dead-animation-section: banner comment not found — file already migrated?");
  process.exit(1);
}

// Walk back to the start of the `// ====` banner block (one line above).
const start = bannerIndex - 1;

/** Find the matching close brace of `function AnimationSection({`. */
const fnIndex = lines.findIndex((line, i) => i > start && line.startsWith("function AnimationSection({"));
if (fnIndex === -1) {
  console.error("remove-dead-animation-section: `function AnimationSection` not found");
  process.exit(1);
}

let depth = 0;
let started = false;
let end = -1;
for (let i = fnIndex; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === "{") {
      depth++;
      started = true;
    } else if (ch === "}") {
      depth--;
    }
  }
  if (started && depth === 0) {
    end = i;
    break;
  }
}

if (end === -1) {
  console.error("remove-dead-animation-section: could not find the function's closing brace");
  process.exit(1);
}

// Precondition 1: the component must never be rendered.
const source = lines.join("\n");
if (/<AnimationSection\b/.test(source)) {
  console.error("remove-dead-animation-section: <AnimationSection /> IS rendered — aborting, this is not dead code");
  process.exit(1);
}

// Precondition 2: nothing after the deleted range may reference a symbol that
// only the deleted range defined.
const after = lines.slice(end + 1).join("\n");
if (/\bAnimationSection\b/.test(after)) {
  console.error("remove-dead-animation-section: AnimationSection is still referenced later — aborting");
  process.exit(1);
}

const removedCount = end - start + 1;
console.log(
  `remove-dead-animation-section: removing ${removedCount} lines (${start + 1}-${end + 1}) from EffectsPanel.tsx`
);

if (checkOnly) {
  console.log("  [check] no changes written");
  process.exit(0);
}

const next = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
writeFileSync(target, next.replace(/\n{4,}/g, "\n\n\n"), "utf8");
console.log(`  new length: ${next.split("\n").length} lines`);
