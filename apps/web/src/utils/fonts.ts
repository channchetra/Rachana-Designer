/**
 * Font helpers — Google Fonts URL building, font stacks, `@font-face`
 * generation and in-editor previews.
 *
 * Ported from the original webview's `utils/fonts.ts` with the offline
 * fallback catalog preserved (the live catalog has no CORS headers on
 * `fonts.google.com`, so the fallback is what most installs will see).
 */

import type { GoogleFontCatalogEntry } from "@/types/hostMessages";

export type { GoogleFontCatalogEntry as GoogleFontEntry };

const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Families that are CSS keywords rather than real fonts. */
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "-apple-system",
  "blinkmacsystemfont",
]);

export function isGenericFamily(family: string): boolean {
  const n = (family || "").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!n) return true;
  if (n.startsWith("ui-")) return true;
  return GENERIC_FAMILIES.has(n);
}

/** `Inter Tight` → `inter-tight`. Used for style-tag and link ids. */
export function slugifyFamily(family: string): string {
  return (family || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Split a font stack into its individual family names. */
export function splitFontStack(stack: string): string[] {
  if (!stack) return [];
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of stack) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.map((s) => s.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

/** Best-effort generic fallback for a Google Fonts category. */
export function fallbackForCategory(category: string): string {
  const c = (category || "").toLowerCase();
  if (c.includes("serif") && !c.includes("sans")) return "serif";
  if (c.includes("mono")) return "monospace";
  if (c.includes("hand")) return "cursive";
  return "sans-serif";
}

/** Build a full CSS font stack for a Google font family. */
export function buildFontStack(family: string, category?: string): string {
  if (isGenericFamily(family)) return family;
  return `'${family}', ${fallbackForCategory(category ?? "")}`;
}

/** Build the Google Fonts stylesheet URL for a family + weights. */
export function buildGoogleFontsUrl(family: string, weights: number[]): string {
  const ws = Array.from(new Set(weights.filter((w) => (STANDARD_WEIGHTS as readonly number[]).includes(w))))
    .sort((a, b) => a - b);
  const effective = ws.length ? ws : [400, 700];
  const familyParam = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${effective.join(";")}&display=swap`;
}

/** `font.woff2` → `woff2`, `.otf` → `opentype`, else `truetype`. */
export function formatForFontUrl(url: string): string {
  const ext = (url.split("?")[0].split(".").pop() ?? "").toLowerCase();
  if (ext === "woff2") return "woff2";
  if (ext === "woff") return "woff";
  if (ext === "otf") return "opentype";
  return "truetype";
}

/** Generate a `@font-face` rule for a locally stored font file. */
export function buildFontFaceCss(family: string, url: string): string {
  return `@font-face {\n  font-family: '${family}';\n  src: url('${url}') format('${formatForFontUrl(url)}');\n  font-display: swap;\n}`;
}

/** Derive a human family name from an uploaded font's filename. */
export function deriveFamilyFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const words = stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "Custom Font";
  return words
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* ------------------------------------------------------------------ *
 * Preview loading
 * ------------------------------------------------------------------ */

const previewLoaded = new Set<string>();

/**
 * Inject a Google Fonts `<link>` once so panels can render live previews.
 *
 * `weights` is optional: the original panel called this with just the family,
 * so omitting it falls back to the design system's default pair.
 */
export function ensurePreviewGoogleFont(family: string, weights: number[] = [400, 700]): void {
  const key = `g:${family.toLowerCase()}`;
  if (previewLoaded.has(key)) return;
  previewLoaded.add(key);
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = buildGoogleFontsUrl(family, weights);
    link.setAttribute("data-gl-font-preview", family);
    document.head.appendChild(link);
  } catch {
    /* previews are best-effort */
  }
}

/** Register an uploaded font with the FontFace API for previews. */
export function ensurePreviewCustomFont(family: string, url: string): void {
  const key = `c:${family.toLowerCase()}`;
  if (previewLoaded.has(key)) return;
  previewLoaded.add(key);
  try {
    const face = new FontFace(family, `url("${url}")`);
    void face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {
        /* unreadable font — previews fall back to the system stack */
      });
  } catch {
    /* FontFace unsupported */
  }
}

/* ------------------------------------------------------------------ *
 * Offline fallback catalog
 * ------------------------------------------------------------------ */

const W = [400, 500, 600, 700];

/**
 * Last-resort catalog used when the live Google Fonts metadata cannot be
 * fetched (which is the common case in a browser, since
 * `fonts.google.com/metadata/fonts` sends no CORS headers).
 */
export const FALLBACK_CATALOG: GoogleFontCatalogEntry[] = [
  { f: "Inter", c: "Sans Serif", w: W },
  { f: "Roboto", c: "Sans Serif", w: W },
  { f: "Open Sans", c: "Sans Serif", w: W },
  { f: "Lato", c: "Sans Serif", w: W },
  { f: "Montserrat", c: "Sans Serif", w: W },
  { f: "Poppins", c: "Sans Serif", w: W },
  { f: "Source Sans 3", c: "Sans Serif", w: W },
  { f: "Nunito", c: "Sans Serif", w: W },
  { f: "Raleway", c: "Sans Serif", w: W },
  { f: "Work Sans", c: "Sans Serif", w: W },
  { f: "Rubik", c: "Sans Serif", w: W },
  { f: "Manrope", c: "Sans Serif", w: W },
  { f: "DM Sans", c: "Sans Serif", w: W },
  { f: "Outfit", c: "Sans Serif", w: W },
  { f: "Plus Jakarta Sans", c: "Sans Serif", w: W },
  { f: "Figtree", c: "Sans Serif", w: W },
  { f: "Barlow", c: "Sans Serif", w: W },
  { f: "Karla", c: "Sans Serif", w: W },
  { f: "Mulish", c: "Sans Serif", w: W },
  { f: "Public Sans", c: "Sans Serif", w: W },
  { f: "Playfair Display", c: "Serif", w: W },
  { f: "Merriweather", c: "Serif", w: W },
  { f: "Lora", c: "Serif", w: W },
  { f: "PT Serif", c: "Serif", w: W },
  { f: "Source Serif 4", c: "Serif", w: W },
  { f: "Crimson Text", c: "Serif", w: W },
  { f: "Libre Baskerville", c: "Serif", w: [400, 700] },
  { f: "EB Garamond", c: "Serif", w: [400, 500, 600, 700] },
  { f: "Cormorant Garamond", c: "Serif", w: W },
  { f: "Bebas Neue", c: "Display", w: [400] },
  { f: "Anton", c: "Display", w: [400] },
  { f: "Archivo Black", c: "Display", w: [400] },
  { f: "Oswald", c: "Display", w: W },
  { f: "Fjalla One", c: "Display", w: [400] },
  { f: "Righteous", c: "Display", w: [400] },
  { f: "Abril Fatface", c: "Display", w: [400] },
  { f: "Comfortaa", c: "Display", w: W },
  { f: "Titan One", c: "Display", w: [400] },
  { f: "Caveat", c: "Handwriting", w: W },
  { f: "Dancing Script", c: "Handwriting", w: W },
  { f: "Pacifico", c: "Handwriting", w: [400] },
  { f: "Satisfy", c: "Handwriting", w: [400] },
  { f: "JetBrains Mono", c: "Monospace", w: W },
  { f: "Fira Code", c: "Monospace", w: W },
  { f: "Source Code Pro", c: "Monospace", w: W },
  { f: "IBM Plex Mono", c: "Monospace", w: W },
  { f: "Roboto Mono", c: "Monospace", w: W },
  { f: "Space Mono", c: "Monospace", w: [400, 700] },
];

/** Fetch the live Google Fonts catalog. Returns null when unavailable. */
export async function fetchGoogleFontsCatalog(timeoutMs = 20000): Promise<GoogleFontCatalogEntry[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts", {
      signal: controller.signal,
      headers: { Accept: "*/*" },
    });
    if (!res.ok) return null;
    let text = await res.text();
    // Google prefixes the payload with an XSSI guard.
    if (text.startsWith(")]}'")) text = text.slice(4);
    const data = JSON.parse(text) as {
      familyMetadataList?: { family?: string; category?: string; fonts?: Record<string, unknown> }[];
    };
    const fonts: GoogleFontCatalogEntry[] = [];
    for (const fam of data?.familyMetadataList ?? []) {
      const family = fam?.family;
      if (!family) continue;
      const weights = Object.keys(fam?.fonts ?? {})
        .filter((k) => /^\d+$/.test(k))
        .map((k) => parseInt(k, 10))
        .sort((a, b) => a - b);
      fonts.push({ f: family, c: fam?.category || "", w: weights.length ? weights : [400] });
    }
    return fonts.length ? fonts : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
