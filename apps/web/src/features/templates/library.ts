/**
 * Template / wireframe library.
 *
 * The original editor's wireframe panel is a window onto a remote WordPress
 * template library (`greenlightbuilder.pro/wp-json/gl-library/v1`). In a
 * browser that endpoint is cross-origin, so this module:
 *
 *  1. tries the remote library first using a configurable CORS proxy,
 *  2. falls back to a built-in starter catalog that is always available offline,
 *  3. lets the user supply their own library base URL (any WP REST endpoint that
 *     implements the same `/templates` + `/templates/:id` shape).
 *
 * Nothing is gated: every entry — including entries the remote API tags as
 * `pro` — is importable.
 */

import type { TemplateItem, TemplatesResponse } from "@/types/editor";
import { readString, writeString } from "@/platform/host/config";
import { SAMPLE_PAGES } from "@/features/samples/govSite";
import { GOV_GLOBAL_CSS } from "@/features/samples/govDesignSystem";

export const LIBRARY_URL_KEY = "rachana:library-url";
export const DEFAULT_LIBRARY_URL = "https://greenlightbuilder.pro/wp-json/gl-library/v1";

export function getLibraryUrl(): string {
  return readString(LIBRARY_URL_KEY, DEFAULT_LIBRARY_URL);
}

export function setLibraryUrl(url: string): void {
  writeString(LIBRARY_URL_KEY, url.trim());
}

export interface TemplateQuery {
  page: number;
  limit: number;
  category: string | null;
  tag: string | null;
}

/* ------------------------------------------------------------------ *
 * Built-in starter catalog
 * ------------------------------------------------------------------ */

interface StarterTemplate {
  name: string;
  category: string;
  html: string;
}

/**
 * Offline starter templates. Deliberately small and hand-written: they are
 * complete, valid fragments that demonstrate the editor's container model
 * (`.gl-section` / `.gl-content-wrap`) so imports look right immediately.
 */
const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "Hero — Centered",
    category: "hero",
    html: `<style id="gl-tpl-hero-center">
.gl-hero-center{padding-top:96px;padding-bottom:96px;text-align:center;background:linear-gradient(160deg,#1C4076 0%,#26A5DE 100%);color:#fff;}
.gl-hero-center h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1;margin:0 0 16px;font-weight:800;letter-spacing:-0.02em;}
.gl-hero-center p{font-size:1.125rem;opacity:.9;margin:0 auto 32px;max-width:620px;}
.gl-hero-cta{display:inline-block;padding:14px 28px;border-radius:999px;background:#fff;color:#1C4076;font-weight:600;text-decoration:none;}
</style>
<section class="gl-section alignfull gl-hero-center" data-type="section-component">
  <div class="gl-content-wrap" data-type="content-area-component">
    <h1>Build something remarkable</h1>
    <p>Drag, drop and style production-ready HTML without leaving the visual editor.</p>
    <a class="gl-hero-cta" href="#">Get started</a>
  </div>
</section>`,
  },
  {
    name: "Hero — Split",
    category: "hero",
    html: `<style id="gl-tpl-hero-split">
.gl-hero-split{padding-top:80px;padding-bottom:80px;}
.gl-hero-split .gl-hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;align-items:center;}
.gl-hero-split h1{font-size:clamp(1.75rem,4vw,3rem);line-height:1.15;margin:0 0 16px;color:#1C4076;font-weight:800;}
.gl-hero-split p{font-size:1.0625rem;color:#475569;margin:0 0 28px;}
.gl-hero-split img{width:100%;border-radius:16px;box-shadow:0 24px 48px -24px rgba(28,64,118,.45);}
@media (max-width:768px){.gl-hero-split .gl-hero-grid{grid-template-columns:1fr;}}
</style>
<section class="gl-section alignfull gl-hero-split" data-type="section-component">
  <div class="gl-content-wrap gl-hero-grid" data-type="content-area-component">
    <div>
      <h1>Design in the browser, ship anywhere</h1>
      <p>Export clean, semantic markup to WordPress, Astro or plain HTML.</p>
      <a class="gl-hero-cta" href="#" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#1C4076;color:#fff;text-decoration:none;font-weight:600;">Start building</a>
    </div>
    <img src="https://placehold.co/720x480" alt="Product preview" />
  </div>
</section>`,
  },
  {
    name: "Feature Grid — 3 Columns",
    category: "features",
    html: `<style id="gl-tpl-features-3">
.gl-features-3{padding-top:64px;padding-bottom:64px;}
.gl-features-3 .gl-fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;}
.gl-features-3 .gl-card{padding:28px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;}
.gl-features-3 .gl-card h3{margin:0 0 8px;font-size:1.125rem;color:#1C4076;}
.gl-features-3 .gl-card p{margin:0;color:#64748b;line-height:1.6;}
@media (max-width:900px){.gl-features-3 .gl-fgrid{grid-template-columns:1fr;}}
</style>
<section class="gl-section alignfull gl-features-3" data-type="section-component">
  <div class="gl-content-wrap gl-fgrid" data-type="content-area-component">
    <div class="gl-card"><h3>Visual editing</h3><p>Click any element on the canvas and style it with real controls.</p></div>
    <div class="gl-card"><h3>Design tokens</h3><p>Manage CSS custom properties across the whole document.</p></div>
    <div class="gl-card"><h3>One-click export</h3><p>Push blocks straight into a WordPress site when you are ready.</p></div>
  </div>
</section>`,
  },
  {
    name: "Pricing — 3 Tiers",
    category: "pricing",
    html: `<style id="gl-tpl-pricing-3">
.gl-pricing-3{padding-top:72px;padding-bottom:72px;}
.gl-pricing-3 .gl-pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:stretch;}
.gl-pricing-3 .gl-plan{border:1px solid #e2e8f0;border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:14px;background:#fff;}
.gl-pricing-3 .gl-plan--featured{border-color:#1C4076;box-shadow:0 20px 40px -24px rgba(28,64,118,.5);}
.gl-pricing-3 .gl-price{font-size:2.25rem;font-weight:800;color:#1C4076;}
.gl-pricing-3 .gl-price span{font-size:.875rem;font-weight:500;color:#64748b;}
.gl-pricing-3 ul{list-style:none;padding:0;margin:0;display:grid;gap:8px;color:#475569;}
@media (max-width:900px){.gl-pricing-3 .gl-pgrid{grid-template-columns:1fr;}}
</style>
<section class="gl-section alignfull gl-pricing-3" data-type="section-component">
  <div class="gl-content-wrap gl-pgrid" data-type="content-area-component">
    <div class="gl-plan"><h3>Starter</h3><div class="gl-price">$0<span>/mo</span></div><ul><li>1 project</li><li>HTML export</li></ul></div>
    <div class="gl-plan gl-plan--featured"><h3>Pro</h3><div class="gl-price">$29<span>/mo</span></div><ul><li>Unlimited projects</li><li>WordPress export</li><li>Snapshots</li></ul></div>
    <div class="gl-plan"><h3>Agency</h3><div class="gl-price">$79<span>/mo</span></div><ul><li>Everything in Pro</li><li>Team library</li></ul></div>
  </div>
</section>`,
  },
  {
    name: "Call To Action",
    category: "cta",
    html: `<style id="gl-tpl-cta">
.gl-cta{padding-top:64px;padding-bottom:64px;background:#0d1220;color:#fff;text-align:center;border-radius:20px;}
.gl-cta h2{margin:0 0 12px;font-size:clamp(1.5rem,3.5vw,2.25rem);}
.gl-cta p{margin:0 0 24px;color:#94a3b8;}
</style>
<section class="gl-section alignfull gl-cta" data-type="section-component">
  <div class="gl-content-wrap" data-type="content-area-component">
    <h2>Ready to design faster?</h2>
    <p>Bring your HTML in, style it visually, export it anywhere.</p>
    <a href="#" style="display:inline-block;padding:12px 26px;border-radius:8px;background:#26A5DE;color:#0d1220;font-weight:700;text-decoration:none;">Open the editor</a>
  </div>
</section>`,
  },
  {
    name: "FAQ Accordion",
    category: "content",
    html: `<style id="gl-tpl-faq">
.gl-faq{padding-top:56px;padding-bottom:56px;max-width:760px;}
.gl-faq details{border-bottom:1px solid #e2e8f0;padding:16px 0;}
.gl-faq summary{cursor:pointer;font-weight:600;color:#1C4076;}
.gl-faq p{margin:10px 0 0;color:#64748b;}
</style>
<section class="gl-section gl-faq" data-type="section-component">
  <div class="gl-content-wrap" data-type="content-area-component">
    <h2>Frequently asked questions</h2>
    <details open><summary>Does it work with my existing HTML?</summary><p>Yes — open any .html file and edit it visually, then save byte-preserving patches.</p></details>
    <details><summary>Can I export to WordPress?</summary><p>Yes, export as GreenLight blocks, a GreenShift HTML block, or a core HTML block.</p></details>
    <details><summary>Are there any locked features?</summary><p>No. Rachana Designer ships the full feature set unlocked.</p></details>
  </div>
</section>`,
  },
  {
    name: "Footer",
    category: "structure",
    html: `<style id="gl-tpl-footer">
.gl-footer{padding-top:48px;padding-bottom:48px;background:#0d1220;color:#94a3b8;}
.gl-footer .gl-fgrid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:32px;}
.gl-footer h4{color:#fff;margin:0 0 12px;font-size:.875rem;text-transform:uppercase;letter-spacing:.08em;}
.gl-footer a{display:block;color:#94a3b8;text-decoration:none;padding:4px 0;}
@media (max-width:768px){.gl-footer .gl-fgrid{grid-template-columns:1fr;}}
</style>
<footer class="gl-section alignfull gl-footer" data-type="section-component">
  <div class="gl-content-wrap gl-fgrid" data-type="content-area-component">
    <div><h4>Rachana Designer</h4><p>Visual editing for HTML, Markdown and Astro.</p></div>
    <div><h4>Product</h4><a href="#">Features</a><a href="#">Pricing</a></div>
    <div><h4>Company</h4><a href="#">About</a><a href="#">Contact</a></div>
  </div>
</footer>`,
  },
  {
    name: "Two Column Text",
    category: "content",
    html: `<section class="gl-section" data-type="section-component">
  <div class="gl-content-wrap" data-type="content-area-component" style="display:grid;grid-template-columns:1fr 1fr;gap:32px;">
    <div><h3>Left column</h3><p>Drop your copy here. Every element is directly editable on the canvas.</p></div>
    <div><h3>Right column</h3><p>Use the layout panel to change columns, gaps and alignment.</p></div>
  </div>
</section>`,
  },
  {
    name: "Image + Caption",
    category: "media",
    html: `<figure class="gl-section" data-type="section-component" style="margin:0;padding:24px 0;">
  <img src="https://placehold.co/960x540" alt="Placeholder" style="width:100%;border-radius:12px;" />
  <figcaption style="margin-top:10px;color:#64748b;font-size:.875rem;">Replace this caption with your own.</figcaption>
</figure>`,
  },
  {
    name: "Stats Row",
    category: "content",
    html: `<style id="gl-tpl-stats">
.gl-stats{padding-top:56px;padding-bottom:56px;}
.gl-stats .gl-sgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center;}
.gl-stats .gl-num{font-size:2.5rem;font-weight:800;color:#1C4076;}
.gl-stats .gl-lbl{color:#64748b;font-size:.875rem;}
@media (max-width:768px){.gl-stats .gl-sgrid{grid-template-columns:repeat(2,1fr);}}
</style>
<section class="gl-section alignfull gl-stats" data-type="section-component">
  <div class="gl-content-wrap gl-sgrid" data-type="content-area-component">
    <div><div class="gl-num">12k+</div><div class="gl-lbl">Designers</div></div>
    <div><div class="gl-num">48</div><div class="gl-lbl">Countries</div></div>
    <div><div class="gl-num">99.9%</div><div class="gl-lbl">Uptime</div></div>
    <div><div class="gl-num">4.9</div><div class="gl-lbl">Rating</div></div>
  </div>
</section>`,
  },
  {
    name: "Testimonial",
    category: "content",
    html: `<section class="gl-section" data-type="section-component" style="padding:56px 0;">
  <div class="gl-content-wrap" data-type="content-area-component" style="max-width:720px;text-align:center;">
    <blockquote style="margin:0 0 18px;font-size:1.25rem;line-height:1.6;color:#1C4076;">“The visual editor replaced three tools in our workflow.”</blockquote>
    <p style="margin:0;color:#64748b;">— A very happy customer</p>
  </div>
</section>`,
  },
  {
    name: "Contact Form",
    category: "forms",
    html: `<style id="gl-tpl-contact">
.gl-contact{padding-top:56px;padding-bottom:56px;max-width:560px;}
.gl-contact label{display:block;font-size:.8125rem;font-weight:600;color:#334155;margin:14px 0 6px;}
.gl-contact input,.gl-contact textarea{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;}
.gl-contact button{margin-top:18px;padding:12px 24px;border:0;border-radius:8px;background:#1C4076;color:#fff;font-weight:600;cursor:pointer;}
</style>
<form class="gl-section gl-contact" data-type="section-component">
  <h2>Get in touch</h2>
  <label for="gl-name">Name</label><input id="gl-name" name="name" type="text" placeholder="Your name" />
  <label for="gl-email">Email</label><input id="gl-email" name="email" type="email" placeholder="you@example.com" />
  <label for="gl-msg">Message</label><textarea id="gl-msg" name="message" rows="4" placeholder="How can we help?"></textarea>
  <button type="submit">Send message</button>
</form>`,
  },
];

/* ------------------------------------------------------------------ *
 * Government page templates (design.md)
 * ------------------------------------------------------------------ */

export const GOVERNMENT_CATEGORY = "government";

/**
 * The `design.md` sample pages, offered as insertable templates.
 *
 * Each entry is a complete page section set built to the Cambodia Government
 * Web Design System. The shared stylesheet is prepended as one `<style>` block
 * so an inserted page is self-contained and renders correctly inside the canvas
 * — the design system's `gov-*` classes are scoped and do not leak into the
 * host document's own styles.
 *
 * Pages are inserted as full page compositions rather than fragments because
 * the specification's value is in the composition (§14/§70), and a fragment
 * without the token layer would not render.
 */
function governmentTemplates(): TemplateItem[] {
  // Positive ids below the API's range so they never collide with remote
  // template ids, which are database row ids starting at 1 on a real site.
  return SAMPLE_PAGES.map((page, index) => ({
    id: 900_000 + index,
    name: `Gov — ${page.title}`,
    category: GOVERNMENT_CATEGORY,
    tag: "free" as const,
    video_minimal: "",
    video_full: "",
    html: `<style data-gov-design-system>\n${GOV_GLOBAL_CSS}\n</style>\n${page.main}`,
  }));
}

function starterCatalog(): TemplateItem[] {
  const builtIns = STARTER_TEMPLATES.map((t, index) => ({
    id: -(index + 1), // negative ids mark built-ins so they never collide with the API
    name: t.name,
    category: t.category,
    tag: "free" as const,
    video_minimal: "",
    video_full: "",
    html: t.html,
  }));
  return [...builtIns, ...governmentTemplates()];
}

export const BUILTIN_CATEGORIES = Array.from(
  new Set([...STARTER_TEMPLATES.map((t) => t.category), GOVERNMENT_CATEGORY])
).sort();

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

interface RemoteTemplatesPayload {
  templates?: TemplateItem[];
  total?: number;
  page?: number;
  pages?: number;
  categories?: string[];
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a page of templates, falling back to the built-in catalog. */
export async function loadTemplates(query: TemplateQuery): Promise<TemplatesResponse> {
  const { page, limit, category, tag } = query;
  const base = getLibraryUrl().replace(/\/+$/, "");

  if (base) {
    let url = `${base}/templates?page=${page}&limit=${limit}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;
    try {
      const data = (await fetchJson(url)) as RemoteTemplatesPayload;
      const templates = Array.isArray(data?.templates) ? data.templates : [];
      if (templates.length || (data?.total ?? 0) > 0) {
        return {
          templates,
          total: data.total ?? templates.length,
          page: data.page ?? page,
          pages: data.pages ?? 1,
          categories: data.categories ?? [],
        };
      }
    } catch (err) {
      console.info("[Rachana] Template library unreachable, using built-ins:", err);
    }
  }

  return clientSidePage(query);
}

/** Filter + paginate the built-in catalog in place. */
function clientSidePage(query: TemplateQuery): TemplatesResponse {
  const all = starterCatalog();
  const filtered = all.filter((t) => {
    if (query.category && t.category !== query.category) return false;
    if (query.tag && t.tag !== query.tag) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / query.limit));
  const start = (Math.max(1, query.page) - 1) * query.limit;
  return {
    templates: filtered.slice(start, start + query.limit),
    total: filtered.length,
    page: Math.max(1, query.page),
    pages,
    categories: BUILTIN_CATEGORIES,
  };
}

/**
 * Resolve a template's HTML.
 *
 * Built-ins are already in memory: the general starter templates use negative
 * ids and the government pages use ids at 900_000 and above, both outside the
 * range a real WordPress site would assign.
 */
export async function loadTemplateHtml(id: number): Promise<string> {
  if (id < 0 || id >= 900_000) {
    const entry = starterCatalog().find((t) => t.id === id);
    return entry?.html ?? "";
  }
  const base = getLibraryUrl().replace(/\/+$/, "");
  if (!base) throw new Error("No template library configured.");
  const data = (await fetchJson(`${base}/templates/${id}`)) as { html?: string };
  return data?.html ?? "";
}

/** True when the requested tag filter maps to a built-in tag value. */
export function normalizeTemplateTag(tag: string | null): string | null {
  return tag;
}
