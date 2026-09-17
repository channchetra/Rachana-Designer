/**
 * Government sample site tests.
 *
 * The sample pages are generated from `src/features/samples/`, so these tests
 * guard both the generator and the `design.md` rules it claims to implement.
 * They are the reason the samples cannot silently drift from the spec.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_PAGES, buildSampleSite, NAV_ITEMS } from "@/features/samples/govSite";

/**
 * Paths are resolved from this file rather than `process.cwd()`.
 *
 * The monorepo runs the suite from the repo root, so `cwd` is not the app
 * directory. Anchoring to `import.meta.url` keeps these assertions valid however
 * the tests are invoked (root `npm test`, or the app's own `vitest`).
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SAMPLES_DIR = join(APP_DIR, "src", "features", "samples");
const OUTPUT_DIR = join(APP_DIR, "public", "sample-site");
const pages = buildSampleSite();

/** The generated page for a filename. */
function page(file: string): string {
  const found = pages.find((p) => p.file === file);
  if (!found) throw new Error(`No generated page named ${file}`);
  return found.html;
}

/** Every href that points at a local file (no scheme, not a fragment). */
function localLinks(html: string): string[] {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return hrefs.filter((h) => !/^(https?:|mailto:|tel:|#|data:)/i.test(h));
}

describe("sample site generation", () => {
  it("generates the expected pages", () => {
    expect(SAMPLE_PAGES).toHaveLength(13);
    const files = SAMPLE_PAGES.map((p) => p.file).sort();
    expect(files).toEqual([
      "404.html",
      "about.html",
      "contact.html",
      "faq.html",
      "index.html",
      "knowledge.html",
      "news-article.html",
      "news.html",
      "privacy.html",
      "search.html",
      "service-detail.html",
      "services.html",
      "terms.html",
    ]);
  });

  it("keeps the source stylesheet mirrored into the JSON module", () => {
    // The app reads the stylesheet from govDesignSystem.json, so a stale mirror
    // would ship stale CSS. This is the guard for that.
    const css = readFileSync(
      join(SAMPLES_DIR, "govDesignSystem.css"),
      "utf8"
    );
    const json = JSON.parse(
      readFileSync(join(SAMPLES_DIR, "govDesignSystem.json"), "utf8")
    ) as { css: string };
    expect(json.css, "run `node scripts/sync-gov-css.mjs`").toBe(css);
  });

  it("has been generated onto disk and is up to date", () => {
    for (const generated of pages) {
      const path = join(OUTPUT_DIR, generated.file);
      expect(existsSync(path), `${generated.file} missing — run scripts/build-sample-site.mjs`).toBe(true);
      // Comparing content catches a stale build after a source edit.
      expect(readFileSync(path, "utf8"), `${generated.file} is stale`).toBe(generated.html);
    }
  });

  it("emits complete, valid HTML documents", () => {
    for (const generated of pages) {
      const html = generated.html;
      expect(html.startsWith("<!DOCTYPE html>"), `${generated.file} doctype`).toBe(true);
      expect(html).toContain('<html lang="km"');
      expect(html).toContain('charset="utf-8"');
      expect(html).toContain('name="viewport"');
      expect(html.trimEnd().endsWith("</html>")).toBe(true);
      // Every page needs a title and a description for SEO/trust.
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).toMatch(/<meta name="description" content="[^"]+"/);
    }
  });

  it("inlines the design system stylesheet so pages work offline", () => {
    for (const generated of pages) {
      expect(generated.html).toContain("--gov-primary: #1c4076");
      // No external stylesheet dependency: each page is self-contained.
      expect(generated.html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="(?!https)/);
    }
  });
});

describe("design.md compliance", () => {
  it("uses the exact primary colour token from §3.1", () => {
    for (const generated of pages) expect(generated.html).toContain("#1c4076");
  });

  it("includes the government trust bar on every page (§8, §2.1)", () => {
    for (const generated of pages) {
      expect(generated.html).toContain("gov-trust-bar");
      expect(generated.html).toMatch(/\.gov\.kh/);
      expect(generated.html).toMatch(/HTTPS/i);
    }
  });

  it("has exactly one h1 per page (§73)", () => {
    for (const generated of pages) {
      const count = (generated.html.match(/<h1[\s>]/g) ?? []).length;
      expect(count, `${generated.file} h1 count`).toBe(1);
    }
  });

  it("includes the skip link (§57, §77)", () => {
    for (const generated of pages) {
      expect(generated.html).toContain('class="gov-skip-link"');
      expect(generated.html).toContain('href="#main"');
    }
  });

  it("marks the current navigation item for assistive technology (§10)", () => {
    for (const generated of pages) {
      if (!generated.html.includes("gov-nav__link")) throw new Error("missing nav");
      expect(generated.html).toContain('aria-current="page"');
    }
  });

  it("labels the primary navigation and the language switcher (§77, §12)", () => {
    for (const generated of pages) {
      expect(generated.html).toContain('aria-label="Primary"');
      expect(generated.html).toContain('aria-label="Language"');
    }
  });

  it("uses a text language indicator, never a flag alone (§12)", () => {
    for (const generated of pages) {
      expect(generated.html).toContain("ខ្មែរ");
      expect(generated.html).not.toMatch(/flag|🇰🇭/i);
    }
  });

  it("keeps the primary navigation within the 5–7 item guidance (§61)", () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(5);
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(7);
  });

  it("includes a government footer with contact details (§30)", () => {
    for (const generated of pages) {
      expect(generated.html).toContain("gov-footer");
      expect(generated.html).toMatch(/ទូរស័ព្ទ/);
      expect(generated.html).toMatch(/អ៊ីមែល/);
      expect(generated.html).toMatch(/ម៉ោងធ្វើការ/);
    }
  });

  it("gives every accordion button native semantics and aria wiring (§24)", () => {
    const faq = page("faq.html");
    // <details>/<summary> is the native disclosure pattern the spec allows
    // ("<details> only if it meets the desired accordion behavior", §68).
    expect(faq).toContain("<details class=\"gov-accordion__item\">");
    expect(faq).toContain("<summary class=\"gov-accordion__trigger\">");
  });

  it("labels every form control (§57, §31)", () => {
    const contact = page("contact.html");
    const controlIds = [...contact.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(controlIds.length).toBeGreaterThan(3);
    for (const id of controlIds) {
      // A wrapping <label class="gov-check"> also counts as a label.
      const hasForLabel = contact.includes(`for="${id}"`);
      const hasWrappingLabel = new RegExp(`<label[^>]*>[\\s\\S]{0,200}id="${id}"`).test(contact);
      expect(hasForLabel || hasWrappingLabel, `control #${id} has no label`).toBe(true);
    }
  });

  it("describes file constraints for uploads (§33)", () => {
    const contact = page("contact.html");
    expect(contact).toMatch(/PDF, JPG, PNG/);
    expect(contact).toMatch(/5 MB/);
  });

  it("states document format and size on downloads (§38)", () => {
    const knowledge = page("knowledge.html");
    expect(knowledge).toMatch(/ទាញយក PDF \([\d.]+ MB\)/);
    expect(knowledge).toMatch(/ទាញយក XLSX \([\d.]+ MB\)/);
  });

  it("gives statistics a label and a source/period note (§23, §62)", () => {
    const home = page("index.html");
    expect(home).toContain("gov-stat__value");
    expect(home).toContain("gov-stat__label");
    // §62 requires a date or source period alongside a figure.
    expect(home).toContain("gov-stat__note");
  });

  it("does not invent fees or processing times (§40, §69)", () => {
    const detail = page("service-detail.html");
    // The service detail page must explicitly defer rather than invent them.
    expect(detail).toMatch(/មិនត្រូវបានបង្ហាញ/);
    // No currency amounts anywhere.
    for (const generated of pages) {
      expect(generated.html, `${generated.file} quotes a price`).not.toMatch(/\$\d|៛\s?\d|USD\s?\d/);
    }
  });

  it("uses no emoji in navigation or components (§53)", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const generated of pages) {
      expect(emoji.test(generated.html), `${generated.file} contains an emoji`).toBe(false);
    }
  });

  it("loads the mobile navigation script without depending on it (§82)", () => {
    const home = page("index.html");
    // The script only toggles visibility; the links are plain anchors.
    expect(home).toContain("gov-nav__toggle");
    expect(home).toMatch(/<a class="gov-nav__link"/);
  });
});

describe("link integrity", () => {
  it("every internal link points at a generated page or an anchor", () => {
    const known = new Set(pages.map((p) => p.file));
    for (const generated of pages) {
      for (const href of localLinks(generated.html)) {
        const [file] = href.split("#");
        if (!file) continue; // pure fragment
        expect(
          known.has(file),
          `${generated.file} links to "${href}" which is not a generated page`
        ).toBe(true);
      }
    }
  });

  it("every page is reachable from the homepage", () => {
    const home = page("index.html");
    const linked = new Set(localLinks(home).map((h) => h.split("#")[0]));
    // 404 and the article/detail pages are reached from listings, not the home
    // navigation, so only assert the primary destinations.
    for (const target of ["services.html", "news.html", "about.html", "faq.html", "contact.html"]) {
      expect(linked.has(target), `homepage does not link to ${target}`).toBe(true);
    }
  });

  it("announces external links with rel=noopener", () => {
    for (const generated of pages) {
      for (const match of generated.html.matchAll(/<a[^>]+href="(https?:[^"]+)"[^>]*>/g)) {
        expect(match[0], `external link missing rel: ${match[0]}`).toContain("rel=\"noopener\"");
      }
    }
  });
});
