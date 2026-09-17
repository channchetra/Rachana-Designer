/**
 * Template library tests.
 *
 * The wireframe gallery has three sources — a remote WordPress library, a
 * built-in starter catalog and the `design.md` government pages — and the app
 * must behave predictably whichever is reachable.
 */

import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  GOVERNMENT_CATEGORY,
  loadTemplateHtml,
  loadTemplates,
} from "@/features/templates/library";
import { SAMPLE_PAGES } from "@/features/samples/govSite";

const ALL = { page: 1, limit: 200, category: null, tag: null };

describe("built-in catalog", () => {
  it("is served when no remote library is reachable", async () => {
    // In tests the remote fetch fails, which is exactly the offline path.
    const response = await loadTemplates(ALL);
    expect(response.total).toBeGreaterThan(20);
    expect(response.templates.length).toBeGreaterThan(0);
  });

  it("exposes the government category", () => {
    expect(BUILTIN_CATEGORIES).toContain(GOVERNMENT_CATEGORY);
  });

  it("includes every design.md sample page", async () => {
    const gov = await loadTemplates({ ...ALL, category: GOVERNMENT_CATEGORY });
    expect(gov.templates).toHaveLength(SAMPLE_PAGES.length);
    for (const template of gov.templates) {
      expect(template.name.startsWith("Gov — ")).toBe(true);
      // Nothing is gated: every entry is importable.
      expect(template.tag).toBe("free");
    }
  });

  it("filters by category without leaking other categories", async () => {
    const gov = await loadTemplates({ ...ALL, category: GOVERNMENT_CATEGORY });
    for (const template of gov.templates) expect(template.category).toBe(GOVERNMENT_CATEGORY);
  });

  it("paginates consistently", async () => {
    const first = await loadTemplates({ page: 1, limit: 5, category: null, tag: null });
    const second = await loadTemplates({ page: 2, limit: 5, category: null, tag: null });
    expect(first.templates).toHaveLength(5);
    expect(first.pages).toBeGreaterThan(1);
    const firstIds = new Set(first.templates.map((t) => t.id));
    for (const template of second.templates) {
      expect(firstIds.has(template.id), "pages overlap").toBe(false);
    }
  });
});

describe("government template payloads", () => {
  it("embeds the design system so an inserted page renders correctly", async () => {
    const html = await loadTemplateHtml(900_000);
    expect(html.length).toBeGreaterThan(1000);
    // The token layer must travel with the markup, or the gov-* classes are inert.
    expect(html).toContain("--gov-primary: #1c4076");
    expect(html).toContain("data-gov-design-system");
  });

  it("returns the page body, not a full document", async () => {
    const html = await loadTemplateHtml(900_000);
    // A full document would nest <html> inside the editor's document.
    expect(html).not.toContain("<!DOCTYPE html>");
    expect(html).toContain("gov-trust-bar");
  });

  it("resolves the same content the generator produced", async () => {
    for (let i = 0; i < SAMPLE_PAGES.length; i++) {
      const html = await loadTemplateHtml(900_000 + i);
      expect(html).toContain(SAMPLE_PAGES[i].main.trim().slice(0, 80));
    }
  });

  it("returns an empty string for an unknown built-in id", async () => {
    expect(await loadTemplateHtml(999_999)).toBe("");
  });
});
