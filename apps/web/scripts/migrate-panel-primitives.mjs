#!/usr/bin/env node
/**
 * Codemod: replace panel-local copies of the shared primitives with imports.
 *
 * The original editor duplicated four helpers into every property panel. This
 * script removes those local definitions and rewrites the imports so every panel
 * uses `@/components/ui/panelPrimitives`.
 *
 * It is deliberately conservative: a helper is only removed when its full text
 * matches one of the known variants byte-for-byte. Anything that does not match
 * is reported and left alone, so a partial migration is always safe to commit.
 *
 * Usage:  node scripts/migrate-panel-primitives.mjs [--check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const panelsDir = join(root, "src", "components", "editor", "panels");
const checkOnly = process.argv.includes("--check");

const PANELS = [
  "SizePanel.tsx",
  "SpacingPanel.tsx",
  "TypographyPanel.tsx",
  "ColorPanel.tsx",
  "BorderPanel.tsx",
  "ShadowPanel.tsx",
  "TransformPanel.tsx",
  "PositionPanel.tsx",
  "EffectsPanel.tsx",
  "LayoutPanel.tsx",
  "LayoutPresets.tsx",
  "GridBuilder.tsx",
  "CssPanel.tsx",
  "DescendantColorsPanel.tsx",
  "AttributesPanel.tsx",
  "SnapshotsPanel.tsx",
];

/** Each entry: the exact local text to delete, and what to import instead. */
const REMOVALS = [
  {
    name: "getEffectiveValue",
    import: "getEffectiveValue",
    patterns: [
      `function getEffectiveValue(styles: StyleInfo, prop: string): string {
  return styles.inline[prop] || styles.idRules[prop] || styles.classRules[prop] || styles.computed[prop] || "";
}`,
      `function getEffectiveValue(styles: DescendantStyleInfo, prop: string): string {
  return styles.inline[prop] || styles.idRules[prop] || styles.classRules[prop] || styles.computed[prop] || "";
}`,
    ],
  },
  {
    name: "getExplicitValue",
    import: "getExplicitValue",
    patterns: [
      `function getExplicitValue(styles: StyleInfo, prop: string): string {
  return styles.inline[prop] || styles.idRules[prop] || styles.classRules[prop] || "";
}`,
    ],
  },
  {
    name: "getValueSource",
    import: "getValueSource",
    patterns: [
      `function getValueSource(styles: StyleInfo, prop: string): "inline" | "id" | "class" | "computed" | "none" {
  if (styles.inline[prop]) return "inline";
  if (styles.idRules[prop]) return "id";
  if (styles.classRules[prop]) return "class";
  if (styles.computed[prop]) return "computed";
  return "none";
}`,
    ],
  },
  {
    name: "FieldLabel",
    import: "FieldLabel",
    patterns: [
      `function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-medium text-zinc-500 tracking-wide mb-1 block">
      {children}
    </label>
  );
}`,
      `function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-medium text-zinc-500 tracking-wide mb-1 block">{children}</label>;
}`,
    ],
  },
  {
    name: "SideIcon",
    import: "SideIcon",
    patterns: [
      `function SideIcon({ label }: { label: string }) {
  return (
    <span className="text-[9px] font-semibold leading-none">{label}</span>
  );
}`,
      `function SideIcon({ label }: { label: string }) {
  return <span className="text-[9px] font-semibold leading-none">{label}</span>;
}`,
    ],
  },
];

const report = [];

for (const file of PANELS) {
  const path = join(panelsDir, file);
  let source = readFileSync(path, "utf8");
  const imported = new Set();
  const removed = [];

  for (const { name, import: symbol, patterns } of REMOVALS) {
    for (const pattern of patterns) {
      if (source.includes(pattern)) {
        source = source.replace(pattern + "\n", "");
        // Also drop now-dangling blank lines left behind.
        source = source.replace(/\n{3,}/g, "\n\n");
        imported.add(symbol);
        removed.push(name);
        break;
      }
    }
  }

  if (imported.size === 0) {
    report.push({ file, status: "no change" });
    continue;
  }

  // Insert the import after the LAST complete import statement.
  //
  // Import statements can span multiple lines (`import {\n a,\n b,\n} from "x";`),
  // so "the last line starting with `import`" is wrong — it lands inside the
  // braces of a multi-line import and produces invalid syntax. Instead we track
  // the terminating semicolon of the final import statement.
  const importLine = `import { ${[...imported].sort().join(", ")} } from "@/components/ui/panelPrimitives";`;
  const insertionIndex = findEndOfLastImport(source);
  if (insertionIndex === -1) {
    report.push({ file, status: "SKIPPED: no import block found" });
    continue;
  }
  source = source.slice(0, insertionIndex) + "\n" + importLine + source.slice(insertionIndex);

  if (!checkOnly) writeFileSync(path, source, "utf8");
  report.push({ file, status: `migrated: ${[...new Set(removed)].join(", ")}` });
}

/**
 * Return the index just past the `;` that ends the last top-level import
 * statement, or -1 when the file has none.
 */
function findEndOfLastImport(source) {
  const re = /^import\s[\s\S]*?;/gm;
  let end = -1;
  let match;
  while ((match = re.exec(source)) !== null) {
    end = match.index + match[0].length;
  }
  return end;
}

for (const { file, status } of report) {
  console.log(`${file.padEnd(30)} ${status}`);
}

const migrated = report.filter((r) => r.status.startsWith("migrated")).length;
console.log(`\n${checkOnly ? "[check] " : ""}${migrated}/${PANELS.length} panels migrated`);
