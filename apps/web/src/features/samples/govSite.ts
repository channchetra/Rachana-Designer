/**
 * Cambodia Government sample site.
 *
 * A complete, multi-page government website built to the `design.md`
 * specification: nine linked pages plus the shared chrome, assembled into
 * self-contained HTML files by `scripts/build-sample-site.mjs`.
 *
 * Every page is a real, valid document with no build step and no server
 * dependency, so it can be opened directly from disk and edited straight away in
 * Rachana Designer. The stylesheet is inlined into each page rather than shared
 * via a `<link>`, which keeps each page independently editable — the display
 * pipeline inlines linked sheets for the canvas anyway.
 *
 * The content is deliberately realistic-but-clearly-placeholder: `design.md`
 * §69 forbids inventing official statistics, fees, processing times or contact
 * data, so all figures carry a source/period note and a few fields are marked
 * with a neutral placeholder rather than fabricated values.
 */

/**
 * The design system stylesheet comes from `./govDesignSystem`, which Vite
 * resolves with `?raw` and the tests resolve with a disk read.
 */
import { GOV_GLOBAL_CSS } from "./govDesignSystem";

/* ------------------------------------------------------------------ *
 * Shared chrome
 * ------------------------------------------------------------------ */

export interface NavItem {
  label: string;
  labelEn: string;
  href: string;
}

/** §61: keep primary navigation to roughly 5–7 top-level items. */
export const NAV_ITEMS: NavItem[] = [
  { label: "អំពីយើង", labelEn: "About", href: "about.html" },
  { label: "សេវាសាធារណៈ", labelEn: "Public services", href: "services.html" },
  { label: "ចំណេះដឹងឌីជីថល", labelEn: "Digital knowledge", href: "knowledge.html" },
  { label: "ឯកសារ", labelEn: "Documents", href: "knowledge.html#documents" },
  { label: "ព័ត៌មាន", labelEn: "News", href: "news.html" },
  { label: "សំណួរញឹកញាប់", labelEn: "FAQs", href: "faq.html" },
  { label: "ទំនាក់ទំនង", labelEn: "Contact", href: "contact.html" },
];

const AGENCY_KM = "មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ";
const AGENCY_EN = "Takeo Provincial Department of Posts and Telecommunications";

/** The site's trust, header and footer chrome, parameterised by active page. */
export function shell(options: {
  title: string;
  lang?: "km" | "en";
  activeHref: string;
  main: string;
  breadcrumbs?: { label: string; href?: string }[];
}): string {
  const { title, activeHref, main, breadcrumbs } = options;
  const lang = options.lang ?? "km";

  const navList = NAV_ITEMS.map((item) => {
    const current = item.href === activeHref ? ' aria-current="page"' : "";
    return `          <li><a class="gov-nav__link" href="${item.href}"${current}>${item.label} <span class="gov-visually-hidden">(${item.labelEn})</span></a></li>`;
  }).join("\n");

  const breadcrumbBlock = breadcrumbs?.length
    ? `
      <nav class="gov-breadcrumbs" aria-label="Breadcrumb">
        <div class="gov-container">
          <ol>
${breadcrumbs
  .map((crumb) =>
    crumb.href
      ? `            <li><a href="${crumb.href}">${crumb.label}</a></li>`
      : `            <li aria-current="page">${crumb.label}</li>`
  )
  .join("\n")}
          </ol>
        </div>
      </nav>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${AGENCY_EN}</title>
<meta name="description" content="${AGENCY_EN}. An official .gov.kh website providing public services, documents, news and digital knowledge for Takeo province.">
<style>
${GOV_GLOBAL_CSS}
</style>
</head>
<body>

<a class="gov-skip-link" href="#main">Skip to main content</a>

<!-- §8 Official government trust bar -->
<div class="gov-trust-bar">
  <div class="gov-container gov-trust-bar__inner">
    <p class="gov-trust-bar__message">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z"/></svg>
      This is an official government website. The address ends in <strong>.gov.kh</strong> and the connection is secure (HTTPS).
    </p>
    <a href="#main">Learn more<span class="gov-visually-hidden"> about secure government websites</span></a>
  </div>
</div>

<!-- §9/§80 Agency header -->
<header class="gov-header">
  <div class="gov-container gov-header__identity">
    <a class="gov-agency" href="index.html">
      <span class="gov-agency__emblem" aria-hidden="true">មន្ទីរ</span>
      <span class="gov-agency__text">
        <span class="gov-agency__name">${AGENCY_KM}</span>
        <span class="gov-agency__sub" lang="en">${AGENCY_EN}</span>
      </span>
    </a>

    <div class="gov-header__utilities">
      <form class="gov-search" role="search" action="search.html" method="get">
        <label class="gov-visually-hidden" for="site-search">Search this website</label>
        <input id="site-search" name="q" type="search" placeholder="ស្វែងរកសេវា ឬឯកសារ…" autocomplete="off">
        <button type="submit" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </button>
      </form>

      <!-- §12: language is shown as text, never as a country marker. Khmer is the
           default. English is presented as unavailable rather than linked to a
           page that does not exist — a broken language link is worse than a
           clearly unavailable one. -->
      <div class="gov-lang" role="group" aria-label="Language">
        <span aria-current="true">ខ្មែរ</span>
        <span aria-hidden="true">|</span>
        <span lang="en" title="English version coming soon" style="opacity:.6;">EN</span>
      </div>

      <button class="gov-nav__toggle" type="button" aria-expanded="false" aria-controls="primary-nav">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        ម៉ឺនុយ
      </button>
    </div>
  </div>

  <!-- §10 Primary navigation -->
  <nav class="gov-nav" aria-label="Primary">
    <div class="gov-container">
      <ul class="gov-nav__list" id="primary-nav" data-open="false">
${navList}
      </ul>
    </div>
  </nav>
</header>
${breadcrumbBlock}
<main id="main">
${main}
</main>

<!-- §30 Government footer -->
<footer class="gov-footer">
  <div class="gov-container">
    <div class="gov-footer__grid">
      <div>
        <h2 class="gov-footer__heading">${AGENCY_KM}</h2>
        <ul>
          <li>អាសយដ្ឋាន៖ ក្រុងតាកែវ ខេត្តតាកែវ កម្ពុជា</li>
          <li>ទូរស័ព្ទ៖ <a href="tel:+855320000000">+855 32 000 000</a></li>
          <li>អ៊ីមែល៖ <a href="mailto:info@takeo.gov.kh">info@takeo.gov.kh</a></li>
          <li>ម៉ោងធ្វើការ៖ ចន្ទ–សុក្រ 08:00–17:00</li>
        </ul>
      </div>

      <div>
        <h2 class="gov-footer__heading">តំណភ្ជាប់សំខាន់</h2>
        <ul>
          <li><a href="services.html">សេវាសាធារណៈ</a></li>
          <li><a href="knowledge.html">ចំណេះដឹងឌីជីថល</a></li>
          <li><a href="news.html">ព័ត៌មាន</a></li>
          <li><a href="faq.html">សំណួរញឹកញាប់</a></li>
        </ul>
      </div>

      <div>
        <h2 class="gov-footer__heading">ឯកសារ និងធនធាន</h2>
        <ul>
          <li><a href="knowledge.html#documents">ទាញយកឯកសារ</a></li>
          <li><a href="services.html#online">សេវាអនឡាញ</a></li>
          <li><a href="about.html">អំពីមន្ទីរ</a></li>
        </ul>
      </div>

      <div>
        <h2 class="gov-footer__heading">វេទិកាពាក់ព័ន្ធ</h2>
        <ul>
          <li><a href="https://www.mptc.gov.kh" rel="noopener">ក្រសួងប្រៃសណីយ៍ និងទូរគមនាគមន៍</a></li>
          <li><a href="https://www.cambodia.gov.kh" rel="noopener">រាជរដ្ឋាភិបាលកម្ពុជា</a></li>
          <li><a href="https://www.takeo.gov.kh" rel="noopener">រដ្ឋបាលខេត្តតាកែវ</a></li>
        </ul>
      </div>
    </div>

    <div class="gov-footer__bottom">
      <ul style="display:flex;gap:16px;flex-wrap:wrap;">
        <li><a href="privacy.html">គោលការណ៍ភាពឯកជន</a></li>
        <li><a href="terms.html">លក្ខខណ្ឌប្រើប្រាស់</a></li>
      </ul>
      <p style="margin:0;">© 2026 ${AGENCY_EN}. All rights reserved.</p>
    </div>
  </div>
</footer>

<script>
/* §10/§80 mobile navigation. Progressive enhancement only: the links exist and
   work without this script, which merely toggles visibility. */
(function () {
  var toggle = document.querySelector(".gov-nav__toggle");
  var list = document.getElementById("primary-nav");
  if (!toggle || !list) return;
  toggle.addEventListener("click", function () {
    var open = list.getAttribute("data-open") === "true";
    list.setAttribute("data-open", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
  });
})();
</script>

</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * §17 reusable section heading
 * ------------------------------------------------------------------ */

function heading(opts: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}): string {
  const action =
    opts.actionHref && opts.actionLabel
      ? `\n        <a class="gov-btn gov-btn--outline" href="${opts.actionHref}">${opts.actionLabel}</a>`
      : "";
  return `      <header class="gov-section-heading${action ? " gov-section-heading--with-action" : ""}">
        <div>
${opts.eyebrow ? `          <p class="gov-section-heading__eyebrow">${opts.eyebrow}</p>\n` : ""}          <h2 class="gov-section-heading__title">${opts.title}</h2>
${opts.description ? `          <p class="gov-section-heading__description">${opts.description}</p>\n` : ""}        </div>${action}
      </header>`;
}

/* ------------------------------------------------------------------ *
 * §14/§70 Homepage
 * ------------------------------------------------------------------ */

const SERVICES = [
  {
    icon: "M9 12h6M9 16h6M7 3h7l5 5v13H7V3Z",
    title: "អាជ្ញាបណ្ណទូរគមនាគមន៍",
    text: "ស្នើសុំ និងបន្តអាជ្ញាបណ្ណសម្រាប់ប្រតិបត្តិករទូរគមនាគមន៍ក្នុងខេត្ត។",
    status: "online",
    statusLabel: "សេវាអនឡាញ",
  },
  {
    icon: "M4 4h16v12H4z M2 20h20",
    title: "ការចុះបញ្ជីប្រៃសណីយ៍",
    text: "ចុះបញ្ជីសេវាប្រៃសណីយ៍ និងការដឹកជញ្ជូនក្នុងដែនសមត្ថកិច្ចខេត្ត។",
    status: "in-person",
    statusLabel: "ដោយផ្ទាល់",
  },
  {
    icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M2 12h20 M12 2c3 3 3 17 0 20",
    title: "ការតភ្ជាប់អ៊ីនធឺណិត",
    text: "ព័ត៌មានស្តីពីការតភ្ជាប់អ៊ីនធឺណិត និងគុណភាពសេវានៅតាមមូលដ្ឋាន។",
    status: "online",
    statusLabel: "សេវាអនឡាញ",
  },
  {
    icon: "M12 3 2 8l10 5 10-5-10-5Z M2 16l10 5 10-5 M2 12l10 5 10-5",
    title: "ការអនុញ្ញាតឧបករណ៍",
    text: "ស្នើសុំការអនុញ្ញាតនាំចូល និងប្រើប្រាស់ឧបករណ៍ទូរគមនាគមន៍។",
    status: "in-person",
    statusLabel: "ដោយផ្ទាល់",
  },
  {
    icon: "M4 4h16v16H4z M8 9h8 M8 13h5",
    title: "ពាក្យបណ្តឹងសេវា",
    text: "ដាក់ពាក្យបណ្តឹង ឬសំណើស្តីពីគុណភាពសេវាប្រៃសណីយ៍ និងទូរគមនាគមន៍។",
    status: "online",
    statusLabel: "សេវាអនឡាញ",
  },
  {
    icon: "M12 3v18 M5 10l7-7 7 7",
    title: "ការបណ្តុះបណ្តាលឌីជីថល",
    text: "វគ្គបណ្តុះបណ្តាលជំនាញឌីជីថលសម្រាប់មន្ត្រី និងសហគមន៍។",
    status: "in-person",
    statusLabel: "ដោយផ្ទាល់",
  },
];

const NEWS = [
  {
    category: "សេវាសាធារណៈ",
    date: "17 កញ្ញា 2026",
    dateEn: "17 September 2026",
    title: "ប្រកាសពីការបើកដំណើរការសេវាអនឡាញថ្មី",
    excerpt: "មន្ទីរបានប្រកាសដាក់ឱ្យប្រើប្រាស់សេវាអនឡាញថ្មី ដែលអនុញ្ញាតឱ្យប្រជាពលរដ្ឋដាក់សំណើបានដោយមិនចាំបាច់មកដល់ការិយាល័យ។",
  },
  {
    category: "ទូរគមនាគមន៍",
    date: "02 កញ្ញា 2026",
    dateEn: "2 September 2026",
    title: "កិច្ចសហការលើកកម្ពស់គុណភាពអ៊ីនធឺណិតនៅតាមមូលដ្ឋាន",
    excerpt: "កិច្ចប្រជុំបានពិភាក្សាលើផែនការពង្រីកគម្រោងអ៊ីនធឺណិតសហគមន៍ និងការត្រួតពិនិត្យគុណភាពសេវា។",
  },
  {
    category: "ចំណេះដឹងឌីជីថល",
    date: "21 សីហា 2026",
    dateEn: "21 August 2026",
    title: "សិក្ខាសាលាអំពីសុវត្ថិភាពអនឡាញសម្រាប់យុវជន",
    excerpt: "សិក្ខាសាលាបានបង្ហាញពីវិធីការពារព័ត៌មានផ្ទាល់ខ្លួន និងការទទួលស្គាល់ការឆបោកតាមអនឡាញ។",
  },
];

const STATS = [
  { value: "១២", valueEn: "12", label: "សេវាសាធារណៈអនឡាញ", note: "គិតត្រឹមខែកញ្ញា 2026" },
  { value: "១០០%", label: "ឃុំ/សង្កាត់មានសេវាទូរគមនាគមន៍", note: "របាយការណ៍ប្រចាំត្រីមាស" },
  { value: "៤៨", label: "មន្ត្រីដែលបានបណ្តុះបណ្តាលឌីជីថល", note: "វគ្គបណ្តុះបណ្តាល 2026" },
  { value: "២៤/៧", label: "ខ្សែទូរស័ព្ទជំនួយប្រជាពលរដ្ឋ", note: "សម្រាប់ការរាយការណ៍បញ្ហាសេវា" },
];

const PLATFORMS = [
  { name: "ច្រកទ្វារសេវាសាធារណៈជាតិ", href: "https://www.service.gov.kh" },
  { name: "ប្រព័ន្ធចុះបញ្ជីអាជីវកម្ម", href: "https://www.business.gov.kh" },
  { name: "វេទិកាចំណេះដឹងឌីជីថល", href: "knowledge.html" },
  { name: "ប្រព័ន្ធពាក្យបណ្តឹង", href: "services.html#online" },
  { name: "ព័ត៌មានអាកាសធាតុ និងគ្រោះមហន្តរាយ", href: "https://www.mptc.gov.kh" },
  { name: "រដ្ឋបាលខេត្តតាកែវ", href: "https://www.takeo.gov.kh" },
];

const AGENCIES = [
  { name: "ក្រសួងប្រៃសណីយ៍ និងទូរគមនាគមន៍", href: "https://www.mptc.gov.kh" },
  { name: "ក្រសួងមហាផ្ទៃ", href: "https://www.interior.gov.kh" },
  { name: "ក្រសួងសេដ្ឋកិច្ច និងហិរញ្ញវត្ថុ", href: "https://www.mef.gov.kh" },
  { name: "ក្រសួងអប់រំ យុវជន និងកីឡា", href: "https://www.moeys.gov.kh" },
  { name: "រដ្ឋបាលខេត្តតាកែវ", href: "https://www.takeo.gov.kh" },
  { name: "ធនាគារជាតិនៃកម្ពុជា", href: "https://www.nbc.gov.kh" },
  { name: "ក្រសួងសុខាភិបាល", href: "https://www.moh.gov.kh" },
  { name: "ក្រសួងកសិកម្ម រុក្ខាប្រមាញ់ និងនេសាទ", href: "https://www.maff.gov.kh" },
];

const KNOWLEDGE = [
  {
    title: "ការការពារព័ត៌មានផ្ទាល់ខ្លួនតាមអនឡាញ",
    topic: "សុវត្ថិភាពអនឡាញ",
    type: "មគ្គុទ្ទេសក៍",
    duration: "អាន ៦ នាទី",
  },
  {
    title: "របៀបប្រើប្រាស់សេវាសាធារណៈអនឡាញ",
    topic: "សេវាឌីជីថល",
    type: "វីដេអូ",
    duration: "មើល ៤ នាទី",
  },
  {
    title: "ការទទួលស្គាល់អ៊ីមែលឆបោក",
    topic: "សុវត្ថិភាពអនឡាញ",
    type: "អត្ថបទ",
    duration: "អាន ៤ នាទី",
  },
];

const FAQS = [
  {
    q: "តើខ្ញុំអាចដាក់សំណើសេវាតាមអនឡាញបានដែរឬទេ?",
    a: "បាទ/ចាស។ សេវាដែលមានស្លាក «សេវាអនឡាញ» អាចដាក់សំណើតាមរយៈច្រកទ្វារសេវាសាធារណៈជាតិ។ សេវាដែលមានស្លាក «ដោយផ្ទាល់» ត្រូវមកដល់ការិយាល័យ។",
  },
  {
    q: "តើត្រូវការឯកសារអ្វីខ្លះសម្រាប់ការស្នើសុំ?",
    a: "ឯកសារតម្រូវការខុសគ្នាតាមប្រភេទសេវា។ សូមមើលបញ្ជីឯកសារនៅក្នុងទំព័រលម្អិតនៃសេវានីមួយៗ។ បញ្ជីនេះត្រូវបានធ្វើបច្ចុប្បន្នភាពជាប្រចាំ។",
  },
  {
    q: "តើត្រូវចំណាយពេលប៉ុន្មានដើម្បីទទួលបានលទ្ធផល?",
    a: "រយៈពេលអាស្រ័យលើប្រភេទសេវា។ ព័ត៌មានរយៈពេលផ្លូវការត្រូវបានបង្ហាញនៅក្នុងទំព័រលម្អិតនៃសេវា។ យើងមិនបង្ហាញព័ត៌មានដែលមិនទាន់មានការបញ្ជាក់ជាផ្លូវការទេ។",
  },
  {
    q: "តើខ្ញុំអាចរាយការណ៍បញ្ហាសេវាបានដូចម្តេច?",
    a: "អ្នកអាចប្រើសេវា «ពាក្យបណ្តឹងសេវា» ឬទូរស័ព្ទមកខ្សែទូរស័ព្ទជំនួយប្រជាពលរដ្ឋដែលដំណើរការ ២៤ ម៉ោង។",
  },
];

/* ------------------------------------------------------------------ *
 * Page bodies
 * ------------------------------------------------------------------ */

function homepage(): string {
  const serviceCards = SERVICES.slice(0, 6)
    .map(
      (s) => `          <article class="gov-card gov-service-card">
            <span class="gov-service-card__icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${s.icon}"/></svg>
            </span>
            <h3 class="gov-action-card__title">${s.title}</h3>
            <p class="gov-action-card__text">${s.text}</p>
            <p><span class="gov-badge gov-badge--${s.status === "online" ? "online" : "info"}">${s.statusLabel}</span></p>
            <a class="gov-service-card__action" href="service-detail.html">មើលសេវា →</a>
          </article>`
    )
    .join("\n");

  const newsCards = NEWS.map(
    (n) => `          <a class="gov-news-card" href="news-article.html">
            <img class="gov-news-card__image" src="https://placehold.co/640x360/e4e7ec/667085?text=News" alt="" width="640" height="360" loading="lazy">
            <div class="gov-news-card__body">
              <p class="gov-news-card__meta">
                <span class="gov-news-card__category">${n.category}</span>
                <span class="gov-news-card__date"><time datetime="2026-09-17">${n.date}</time></span>
              </p>
              <h3 class="gov-news-card__title">${n.title}</h3>
              <p class="gov-news-card__excerpt">${n.excerpt}</p>
            </div>
          </a>`
  ).join("\n");

  const statItems = STATS.map(
    (s) => `          <div class="gov-stat">
            <div class="gov-stat__value">${s.value}</div>
            <div class="gov-stat__label">${s.label}</div>
            <p class="gov-stat__note">${s.note}</p>
          </div>`
  ).join("\n");

  const platformCards = PLATFORMS.map(
    (p) => `          <a class="gov-logo-card" href="${p.href}" rel="noopener">${p.name}</a>`
  ).join("\n");

  const agencyCards = AGENCIES.map(
    (a) => `          <a class="gov-logo-card" href="${a.href}" rel="noopener">${a.name}</a>`
  ).join("\n");

  const knowledgeCards = KNOWLEDGE.map(
    (k) => `          <a class="gov-card gov-action-card" href="knowledge.html">
            <p class="gov-eyebrow" style="margin:0;">${k.topic}</p>
            <h3 class="gov-action-card__title">${k.title}</h3>
            <p class="gov-action-card__text">${k.type} · ${k.duration}</p>
            <span class="gov-service-card__action">បើកធនធាន →</span>
          </a>`
  ).join("\n");

  const faqItems = FAQS.slice(0, 3)
    .map(
      (f) => `          <details class="gov-accordion__item">
            <summary class="gov-accordion__trigger">${f.q}</summary>
            <div class="gov-accordion__panel"><p>${f.a}</p></div>
          </details>`
    )
    .join("\n");

  return `  <!-- §15 Hero / key messages -->
  <section class="gov-hero" aria-labelledby="hero-title">
    <img class="gov-hero__media" src="https://placehold.co/1600x700/003a8a/002266?text=Takeo+Province" alt="" width="1600" height="700">
    <div class="gov-hero__overlay" aria-hidden="true"></div>
    <div class="gov-container gov-hero__inner">
      <div>
        <h1 class="gov-hero__title" id="hero-title">សេវាសាធារណៈឌីជីថល សម្រាប់ប្រជាពលរដ្ឋខេត្តតាកែវ</h1>
        <p class="gov-hero__text">ស្វែងរកសេវា ឯកសារ និងព័ត៌មានផ្លូវការពីមន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ ក្នុងកន្លែងតែមួយ។</p>
        <p style="display:flex;gap:12px;flex-wrap:wrap;margin:0;">
          <a class="gov-btn gov-btn--on-primary" href="services.html">រកមើលសេវាសាធារណៈ</a>
          <a class="gov-btn gov-btn--outline" href="contact.html" style="background:transparent;color:#fff;border-color:#fff;">ទំនាក់ទំនងមន្ទីរ</a>
        </p>
      </div>
      <div></div>
    </div>
  </section>

  <!-- §16 Leadership welcome -->
  <section class="gov-section" aria-labelledby="leadership-title">
    <div class="gov-container">
      <div class="gov-leadership">
        <div class="gov-leadership__portrait">
          <img src="https://placehold.co/480x600/e4e7ec/667085?text=Portrait" alt="រូបថតផ្លូវការរបស់ប្រធានមន្ទីរ" width="480" height="600">
        </div>
        <div>
          <p class="gov-eyebrow">សារស្វាគមន៍</p>
          <h2 id="leadership-title">សូមស្វាគមន៍មកកាន់មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ</h2>
          <p>មន្ទីរមានតួនាទីគ្រប់គ្រង និងលើកកម្ពស់វិស័យប្រៃសណីយ៍ និងទូរគមនាគមន៍ក្នុងដែនសមត្ថកិច្ចខេត្ត ដើម្បីធានាថាប្រជាពលរដ្ឋទទួលបានសេវាដែលមានគុណភាព និងអាចទុកចិត្តបាន។</p>
          <p>យើងប្តេជ្ញាបម្រើប្រជាពលរដ្ឋដោយតម្លាភាព និងប្រសិទ្ធភាព តាមរយៈការពង្រីកសេវាឌីជីថល និងការកែលម្អគុណភាពសេវាជាបន្តបន្ទាប់។</p>
          <div class="gov-leadership__signature">
            <p class="gov-leadership__name">ប្រធានមន្ទីរ</p>
            <p class="gov-leadership__role">មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- §21 Public services -->
  <section class="gov-section gov-section--subtle" aria-labelledby="services-title">
    <div class="gov-container">
${heading({
  eyebrow: "សេវាសាធារណៈ",
  title: "សេវាដែលប្រជាពលរដ្ឋអាចស្នើសុំបាន",
  description: "សេវាត្រូវបានរៀបចំតាមប្រភេទការងារ ដើម្បីឱ្យអ្នករកឃើញបានលឿន។",
  actionHref: "services.html",
  actionLabel: "មើលសេវាទាំងអស់",
}).replace(/<h2 /, '<h2 id="services-title" ')}
      <div class="gov-grid">
${serviceCards}
      </div>
    </div>
  </section>

  <!-- §28 About the department -->
  <section class="gov-section" aria-labelledby="about-title">
    <div class="gov-container">
      <div class="gov-split">
        <div>
          <p class="gov-eyebrow">អំពីមន្ទីរ</p>
          <h2 id="about-title">គ្រប់គ្រងវិស័យប្រៃសណីយ៍ និងទូរគមនាគមន៍ក្នុងខេត្តតាកែវ</h2>
          <p>មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ ជាអង្គភាពថ្នាក់ក្រោមជាតិដែលមានភារកិច្ចអនុវត្តគោលនយោបាយរបស់ក្រសួងនៅក្នុងដែនសមត្ថកិច្ចខេត្ត។</p>
          <p>ភារកិច្ចសំខាន់រួមមាន៖ ការគ្រប់គ្រងអាជ្ញាបណ្ណ ការត្រួតពិនិត្យគុណភាពសេវា ការអភិវឌ្ឍហេដ្ឋារចនាសម្ព័ន្ធឌីជីថល និងការផ្តល់សេវាសាធារណៈជូនប្រជាពលរដ្ឋ។</p>
          <p style="margin:0;"><a class="gov-btn gov-btn--outline" href="about.html">អានបន្ថែមអំពីមន្ទីរ</a></p>
        </div>
        <div class="gov-split__media">
          <img src="https://placehold.co/720x540/e4e7ec/667085?text=Department" alt="អគារការិយាល័យមន្ទីរ" width="720" height="540" loading="lazy">
        </div>
      </div>
    </div>
  </section>

  <!-- §22 Latest news -->
  <section class="gov-section gov-section--subtle" aria-labelledby="news-title">
    <div class="gov-container">
${heading({
  eyebrow: "ព័ត៌មាន",
  title: "ព័ត៌មាន និងសេចក្តីជូនដំណឹងថ្មីៗ",
  actionHref: "news.html",
  actionLabel: "មើលព័ត៌មានទាំងអស់",
}).replace(/<h2 /, '<h2 id="news-title" ')}
      <div class="gov-grid gov-grid--editorial">
${newsCards}
      </div>
    </div>
  </section>

  <!-- §23 Key statistics -->
  <section class="gov-section" aria-labelledby="stats-title">
    <div class="gov-container">
${heading({
  eyebrow: "ទិន្នន័យសង្ខេប",
  title: "ស្ថិតិសំខាន់ៗ",
  description: "លេខទាំងនេះផ្អែកលើរបាយការណ៍ផ្ទៃក្នុង និងមានការកត់ត្រាប្រភព និងរយៈពេល។",
}).replace(/<h2 /, '<h2 id="stats-title" ')}
      <div class="gov-stats">
${statItems}
      </div>
    </div>
  </section>

  <!-- §24 FAQ preview -->
  <section class="gov-section gov-section--subtle" aria-labelledby="faq-title">
    <div class="gov-container">
${heading({
  eyebrow: "ជំនួយ",
  title: "សំណួរដែលសួរញឹកញាប់",
  actionHref: "faq.html",
  actionLabel: "មើលសំណួរទាំងអស់",
}).replace(/<h2 /, '<h2 id="faq-title" ')}
      <div class="gov-accordion">
${faqItems}
      </div>
    </div>
  </section>

  <!-- §25 Digital services CTA -->
  <section class="gov-section">
    <div class="gov-container">
      <div class="gov-cta">
        <div>
          <h2 class="gov-cta__title">ប្រើប្រាស់សេវាសាធារណៈអនឡាញ</h2>
          <p class="gov-cta__text">ដាក់សំណើ តាមដានស្ថានភាព និងទទួលលទ្ធផលដោយមិនចាំបាច់មកដល់ការិយាល័យ។</p>
        </div>
        <a class="gov-btn gov-btn--on-primary" href="services.html#online">ចូលប្រើសេវាអនឡាញ</a>
      </div>
    </div>
  </section>

  <!-- §26 Related agencies -->
  <section class="gov-section" aria-labelledby="agencies-title">
    <div class="gov-container">
${heading({
  eyebrow: "បណ្តាញរដ្ឋាភិបាល",
  title: "ស្ថាប័នពាក់ព័ន្ធ",
  description: "តំណភ្ជាប់ទៅកាន់ស្ថាប័នរដ្ឋាភិបាលដែលពាក់ព័ន្ធ។",
}).replace(/<h2 /, '<h2 id="agencies-title" ')}
      <div class="gov-logo-grid">
${agencyCards}
      </div>
    </div>
  </section>

  <!-- §26 Digital platforms -->
  <section class="gov-section gov-section--subtle" aria-labelledby="platforms-title">
    <div class="gov-container">
${heading({
  eyebrow: "សេវាឌីជីថល",
  title: "វេទិកា និងកម្មវិធី",
  description: "វេទិកាឌីជីថលផ្លូវការសម្រាប់ប្រជាពលរដ្ឋ និងអាជីវកម្ម។",
}).replace(/<h2 /, '<h2 id="platforms-title" ')}
      <div class="gov-logo-grid">
${platformCards}
      </div>
    </div>
  </section>

  <!-- §27 Digital knowledge -->
  <section class="gov-section" aria-labelledby="knowledge-title">
    <div class="gov-container">
${heading({
  eyebrow: "ចំណេះដឹងឌីជីថល",
  title: "រៀនពីការប្រើប្រាស់បច្ចេកវិទ្យាដោយសុវត្ថិភាព",
  actionHref: "knowledge.html",
  actionLabel: "មើលធនធានទាំងអស់",
}).replace(/<h2 /, '<h2 id="knowledge-title" ')}
      <div class="gov-grid">
${knowledgeCards}
      </div>
    </div>
  </section>

  <!-- §29 Contact + map -->
  <section class="gov-section gov-section--subtle" aria-labelledby="contact-title">
    <div class="gov-container">
${heading({
  eyebrow: "ទំនាក់ទំនង",
  title: "មកដល់ ឬទាក់ទងយើង",
}).replace(/<h2 /, '<h2 id="contact-title" ')}
      <div class="gov-contact-split">
        <dl class="gov-contact-list">
          <div><dt>អាសយដ្ឋាន</dt><dd>ក្រុងតាកែវ ខេត្តតាកែវ កម្ពុជា</dd></div>
          <div><dt>ទូរស័ព្ទ</dt><dd><a href="tel:+855320000000">+855 32 000 000</a></dd></div>
          <div><dt>អ៊ីមែល</dt><dd><a href="mailto:info@takeo.gov.kh">info@takeo.gov.kh</a></dd></div>
          <div><dt>ម៉ោងធ្វើការ</dt><dd>ចន្ទ–សុក្រ 08:00–17:00 (បិទថ្ងៃសំរាក់ និងថ្ងៃបុណ្យជាតិ)</dd></div>
        </dl>
        <div class="gov-map">
          <div>
            <p style="margin:0 0 8px;font-weight:600;">ផែនទីទីតាំងការិយាល័យ</p>
            <p style="margin:0;">ផែនទីត្រូវបានផ្ទុកដោយឡែកនៅពេលអ្នកចុច។</p>
            <p style="margin:12px 0 0;"><a class="gov-btn gov-btn--outline" href="contact.html">មើលទំព័រទំនាក់ទំនង</a></p>
          </div>
        </div>
      </div>
    </div>
  </section>
`;
}

function servicesListing(): string {
  const rows = SERVICES.map(
    (s) => `          <article class="gov-card gov-service-card">
            <span class="gov-service-card__icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="${s.icon}"/></svg>
            </span>
            <h3 class="gov-action-card__title">${s.title}</h3>
            <p class="gov-action-card__text">${s.text}</p>
            <p style="display:flex;gap:8px;flex-wrap:wrap;">
              <span class="gov-badge gov-badge--${s.status === "online" ? "online" : "info"}">${s.statusLabel}</span>
              <span class="gov-badge">សម្រាប់៖ ប្រជាពលរដ្ឋ និងអាជីវកម្ម</span>
            </p>
            <a class="gov-service-card__action" href="service-detail.html">មើលសេវា →</a>
          </article>`
  ).join("\n");

  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>សេវាសាធារណៈ</h1>
      <p class="gov-reading">សេវាទាំងអស់ដែលមន្ទីរផ្តល់ជូនប្រជាពលរដ្ឋ និងអាជីវកម្មក្នុងខេត្តតាកែវ។ សូមជ្រើសរើសប្រភេទ ឬស្វែងរកតាមឈ្មោះសេវា។</p>

      <form class="gov-search" role="search" action="#" method="get" style="width:100%;max-width:520px;margin-block:16px;">
        <label class="gov-visually-hidden" for="service-search">ស្វែងរកសេវា</label>
        <input id="service-search" name="q" type="search" placeholder="ស្វែងរកសេវា…">
        <button type="submit" aria-label="ស្វែងរក">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </button>
      </form>

      <ul class="gov-chips" id="online">
        <li><a class="gov-chip" href="#" aria-current="true">ទាំងអស់</a></li>
        <li><a class="gov-chip" href="#">សេវាអនឡាញ</a></li>
        <li><a class="gov-chip" href="#">ដោយផ្ទាល់</a></li>
        <li><a class="gov-chip" href="#">អាជ្ញាបណ្ណ</a></li>
        <li><a class="gov-chip" href="#">ការចុះបញ្ជី</a></li>
      </ul>

      <div class="gov-grid">
${rows}
      </div>

      <nav aria-label="Pagination">
        <ul class="gov-pagination">
          <li><span>មុន</span></li>
          <li><a href="#" aria-current="page">1</a></li>
          <li><a href="#">2</a></li>
          <li><a href="#">3</a></li>
          <li><a href="#">បន្ទាប់</a></li>
        </ul>
      </nav>

      <div class="gov-alert" style="margin-top:32px;">
        <div>
          <p class="gov-alert__title">ត្រូវការជំនួយ?</p>
          <p class="gov-alert__text">ទាក់ទងមន្ទីរតាមទូរស័ព្ទ ឬអ៊ីមែល ប្រសិនបើអ្នកមិនអាចរកឃើញសេវាដែលត្រូវការ។ <a href="contact.html">ទំនាក់ទំនងយើង</a></p>
        </div>
      </div>
    </div>
  </section>
`;
}

function serviceDetail(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <div class="gov-with-sidebar">
        <aside class="gov-side-nav" aria-label="ខ្លឹមសារនៅក្នុងទំព័រ">
          <h2 class="gov-footer__heading" style="color:var(--gov-gray-700);font-size:14px;">ខ្លឹមសារ</h2>
          <ul>
            <li><a href="#eligibility" aria-current="page">លក្ខខណ្ឌចាំបាច់</a></li>
            <li><a href="#documents">ឯកសារតម្រូវការ</a></li>
            <li><a href="#steps">ជំហានដាក់សំណើ</a></li>
            <li><a href="#responsible">អង្គភាពទទួលបន្ទុក</a></li>
          </ul>
        </aside>

        <div>
          <p class="gov-eyebrow">សេវាសាធារណៈ</p>
          <h1>អាជ្ញាបណ្ណទូរគមនាគមន៍</h1>
          <p class="gov-reading">ការស្នើសុំ និងបន្តអាជ្ញាបណ្ណសម្រាប់ប្រតិបត្តិករទូរគមនាគមន៍ដែលប្រតិបត្តិការក្នុងដែនសមត្ថកិច្ចខេត្តតាកែវ។</p>

          <p style="display:flex;gap:12px;flex-wrap:wrap;">
            <span class="gov-badge gov-badge--online">សេវាអនឡាញ</span>
            <span class="gov-badge">អាជ្ញាបណ្ណ</span>
          </p>

          <p style="margin-block:24px;">
            <a class="gov-btn gov-btn--primary gov-btn--block-sm" href="#">ចាប់ផ្តើមដាក់សំណើ</a>
            <a class="gov-btn gov-btn--link" href="#documents">មើលឯកសារតម្រូវការ</a>
          </p>

          <h2 id="eligibility">លក្ខខណ្ឌចាំបាច់</h2>
          <ul>
            <li>ជានីតិបុគ្គលដែលបានចុះបញ្ជីត្រឹមត្រូវនៅកម្ពុជា។</li>
            <li>មានឯកសារបច្ចេកទេស និងផែនការប្រតិបត្តិការច្បាស់លាស់។</li>
            <li>បំពេញតាមលក្ខខណ្ឌបច្ចេកទេសដែលក្រសួងកំណត់។</li>
          </ul>

          <h2 id="documents">ឯកសារតម្រូវការ</h2>
          <ul class="gov-doc-list">
            <li class="gov-doc">
              <span class="gov-doc__icon" aria-hidden="true">PDF</span>
              <div class="gov-doc__body">
                <p class="gov-doc__title">ពាក្យសុំអាជ្ញាបណ្ណ</p>
                <p class="gov-doc__meta">ទម្រង់ផ្លូវការ · PDF · 0.4 MB</p>
              </div>
              <a class="gov-btn gov-btn--outline" href="#">ទាញយក PDF (0.4 MB)</a>
            </li>
            <li class="gov-doc">
              <span class="gov-doc__icon" aria-hidden="true">PDF</span>
              <div class="gov-doc__body">
                <p class="gov-doc__title">បញ្ជីត្រួតពិនិត្យឯកសារ</p>
                <p class="gov-doc__meta">បញ្ជីត្រួតពិនិត្យ · PDF · 0.2 MB</p>
              </div>
              <a class="gov-btn gov-btn--outline" href="#">ទាញយក PDF (0.2 MB)</a>
            </li>
          </ul>

          <h2 id="steps">ជំហានដាក់សំណើ</h2>
          <ol class="gov-stepper">
            <li aria-current="step">បំពេញពាក្យសុំ</li>
            <li>ភ្ជាប់ឯកសារ</li>
            <li>ពិនិត្យ និងដាក់ស្នើ</li>
            <li>ទទួលលទ្ធផល</li>
          </ol>

          <div class="gov-alert gov-alert--warning">
            <div>
              <p class="gov-alert__title">ព័ត៌មានថ្លៃសេវា និងរយៈពេល</p>
              <p class="gov-alert__text">ព័ត៌មានថ្លៃសេវា និងរយៈពេលផ្លូវការមិនត្រូវបានបង្ហាញនៅទីនេះទេ ដោយសារត្រូវរង់ចាំការបញ្ជាក់ជាផ្លូវការ។ សូមទាក់ទងមន្ទីរសម្រាប់ព័ត៌មានច្បាស់លាស់។</p>
            </div>
          </div>

          <h2 id="responsible">អង្គភាពទទួលបន្ទុក</h2>
          <dl class="gov-contact-list">
            <div><dt>ការិយាល័យ</dt><dd>ការិយាល័យអាជ្ញាបណ្ណ និងលិខិតបទដ្ឋាន</dd></div>
            <div><dt>ទូរស័ព្ទ</dt><dd><a href="tel:+855320000000">+855 32 000 000</a></dd></div>
            <div><dt>អ៊ីមែល</dt><dd><a href="mailto:licensing@takeo.gov.kh">licensing@takeo.gov.kh</a></dd></div>
          </dl>
        </div>
      </div>
    </div>
  </section>
`;
}

function newsListing(): string {
  const cards = NEWS.concat(NEWS)
    .map(
      (n, i) => `          <a class="gov-news-card" href="news-article.html">
            <img class="gov-news-card__image" src="https://placehold.co/640x360/e4e7ec/667085?text=News+${i + 1}" alt="" width="640" height="360" loading="lazy">
            <div class="gov-news-card__body">
              <p class="gov-news-card__meta">
                <span class="gov-news-card__category">${n.category}</span>
                <span class="gov-news-card__date"><time datetime="2026-09-17">${n.date}</time></span>
              </p>
              <h2 class="gov-news-card__title">${n.title}</h2>
              <p class="gov-news-card__excerpt">${n.excerpt}</p>
            </div>
          </a>`
    )
    .join("\n");

  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>ព័ត៌មាន</h1>
      <p class="gov-reading">សេចក្តីជូនដំណឹង ព្រឹត្តិការណ៍ និងព័ត៌មានផ្លូវការពីមន្ទីរ។</p>

      <ul class="gov-chips">
        <li><a class="gov-chip" href="#" aria-current="true">ទាំងអស់</a></li>
        <li><a class="gov-chip" href="#">សេវាសាធារណៈ</a></li>
        <li><a class="gov-chip" href="#">ទូរគមនាគមន៍</a></li>
        <li><a class="gov-chip" href="#">ចំណេះដឹងឌីជីថល</a></li>
      </ul>

      <div class="gov-grid gov-grid--editorial">
${cards}
      </div>

      <nav aria-label="Pagination">
        <ul class="gov-pagination">
          <li><span>មុន</span></li>
          <li><a href="#" aria-current="page">1</a></li>
          <li><a href="#">2</a></li>
          <li><a href="#">បន្ទាប់</a></li>
        </ul>
      </nav>
    </div>
  </section>
`;
}

function newsArticle(): string {
  return `  <article class="gov-section">
    <div class="gov-container">
      <div class="gov-reading" style="margin-inline:auto;">
        <p class="gov-eyebrow">សេវាសាធារណៈ</p>
        <h1>ប្រកាសពីការបើកដំណើរការសេវាអនឡាញថ្មី</h1>
        <p class="gov-meta">
          ចេញផ្សាយ៖ <time datetime="2026-09-17">១៧ កញ្ញា 2026</time>
          <span aria-hidden="true"> · </span>
          ប្រភព៖ មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ
        </p>

        <img src="https://placehold.co/960x540/e4e7ec/667085?text=Announcement" alt="" width="960" height="540" style="border-radius:10px;margin-block:24px;">

        <p>មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ បានប្រកាសដាក់ឱ្យប្រើប្រាស់សេវាអនឡាញថ្មី ដែលអនុញ្ញាតឱ្យប្រជាពលរដ្ឋដាក់សំណើបានដោយមិនចាំបាច់មកដល់ការិយាល័យ។</p>

        <h2>អត្ថប្រយោជន៍សំខាន់ៗ</h2>
        <ul>
          <li>កាត់បន្ថយពេលវេលាធ្វើដំណើរ និងការរង់ចាំនៅការិយាល័យ។</li>
          <li>អាចតាមដានស្ថានភាពសំណើបានគ្រប់ពេល។</li>
          <li>ទទួលការជូនដំណឹងតាមអ៊ីមែល ឬសារ។</li>
        </ul>

        <blockquote style="border-left:4px solid var(--gov-gray-300);margin:24px 0;padding:8px 16px;color:var(--gov-gray-600);">
          <p style="margin:0;">សេវាអនឡាញជួយឱ្យការទំនាក់ទំនងរវាងប្រជាពលរដ្ឋ និងមន្ទីរកាន់តែមានប្រសិទ្ធភាព។</p>
        </blockquote>

        <h2>ឯកសារពាក់ព័ន្ធ</h2>
        <ul class="gov-doc-list">
          <li class="gov-doc">
            <span class="gov-doc__icon" aria-hidden="true">PDF</span>
            <div class="gov-doc__body">
              <p class="gov-doc__title">សេចក្តីជូនដំណឹងផ្លូវការ</p>
              <p class="gov-doc__meta">សេចក្តីជូនដំណឹង · PDF · 0.3 MB</p>
            </div>
            <a class="gov-btn gov-btn--outline" href="#">ទាញយក PDF (0.3 MB)</a>
          </li>
        </ul>

        <p style="margin-top:32px;">
          <a class="gov-btn gov-btn--outline" href="news.html">← ត្រឡប់ទៅបញ្ជីព័ត៌មាន</a>
        </p>
      </div>

      <section class="gov-section" aria-labelledby="related-news">
        <h2 id="related-news">ព័ត៌មានពាក់ព័ន្ធ</h2>
        <div class="gov-grid">
${NEWS.slice(1)
  .map(
    (n) => `          <a class="gov-news-card" href="news-article.html">
            <div class="gov-news-card__body">
              <p class="gov-news-card__meta"><span class="gov-news-card__category">${n.category}</span><span class="gov-news-card__date">${n.date}</span></p>
              <h3 class="gov-news-card__title">${n.title}</h3>
            </div>
          </a>`
  )
  .join("\n")}
        </div>
      </section>
    </div>
  </article>
`;
}

function aboutPage(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>អំពីមន្ទីរ</h1>
      <p class="gov-reading">មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ ជាអង្គភាពថ្នាក់ក្រោមជាតិ ដែលមានភារកិច្ចអនុវត្តគោលនយោបាយរបស់ក្រសួងប្រៃសណីយ៍ និងទូរគមនាគមន៍ នៅក្នុងដែនសមត្ថកិច្ចខេត្ត។</p>

      <div class="gov-split" style="margin-top:32px;">
        <div>
          <h2>ភារកិច្ច និងសមត្ថកិច្ច</h2>
          <ul>
            <li>គ្រប់គ្រង និងត្រួតពិនិត្យការផ្តល់សេវាប្រៃសណីយ៍ និងទូរគមនាគមន៍ក្នុងខេត្ត។</li>
            <li>ផ្តល់អាជ្ញាបណ្ណ និងការអនុញ្ញាតតាមលិខិតបទដ្ឋានជាធរមាន។</li>
            <li>លើកកម្ពស់ការអភិវឌ្ឍហេដ្ឋារចនាសម្ព័ន្ធឌីជីថលនៅតាមមូលដ្ឋាន។</li>
            <li>ផ្តល់សេវាសាធារណៈ និងព័ត៌មានជូនប្រជាពលរដ្ឋ។</li>
          </ul>
        </div>
        <div class="gov-split__media">
          <img src="https://placehold.co/720x540/e4e7ec/667085?text=Mandate" alt="" width="720" height="540" loading="lazy">
        </div>
      </div>

      <h2 style="margin-top:48px;">រចនាសម្ព័ន្ធអង្គភាព</h2>
      <p class="gov-reading">មន្ទីរមានការិយាល័យជំនាញដែលទទួលបន្ទុកលើផ្នែកអាជ្ញាបណ្ណ ប្រៃសណីយ៍ ទូរគមនាគមន៍ និងរដ្ឋបាល។</p>
      <div class="gov-grid">
        <article class="gov-card"><h3 class="gov-action-card__title">ការិយាល័យអាជ្ញាបណ្ណ</h3><p class="gov-action-card__text">ទទួលបន្ទុកលើការផ្តល់ និងបន្តអាជ្ញាបណ្ណ។</p></article>
        <article class="gov-card"><h3 class="gov-action-card__title">ការិយាល័យប្រៃសណីយ៍</h3><p class="gov-action-card__text">ត្រួតពិនិត្យគុណភាពសេវាប្រៃសណីយ៍។</p></article>
        <article class="gov-card"><h3 class="gov-action-card__title">ការិយាល័យទូរគមនាគមន៍</h3><p class="gov-action-card__text">គ្រប់គ្រងសេវាទូរគមនាគមន៍ និងអ៊ីនធឺណិត។</p></article>
        <article class="gov-card"><h3 class="gov-action-card__title">ការិយាល័យរដ្ឋបាល</h3><p class="gov-action-card__text">ទទួលបន្ទុកលើការងាររដ្ឋបាល និងធនធានមនុស្ស។</p></article>
      </div>

      <h2 style="margin-top:48px;">ទស្សនវិស័យ និងបេសកកម្ម</h2>
      <div class="gov-split">
        <div class="gov-card gov-card--soft">
          <h3>ទស្សនវិស័យ</h3>
          <p style="margin:0;">ក្លាយជាមន្ទីរឈានមុខក្នុងការផ្តល់សេវាប្រៃសណីយ៍ និងទូរគមនាគមន៍ដែលមានគុណភាព និងអាចចូលប្រើបានសម្រាប់គ្រប់គ្នា។</p>
        </div>
        <div class="gov-card gov-card--soft">
          <h3>បេសកកម្ម</h3>
          <p style="margin:0;">ផ្តល់សេវាសាធារណៈដោយតម្លាភាព និងប្រសិទ្ធភាព ព្រមទាំងលើកកម្ពស់ការអភិវឌ្ឍឌីជីថលនៅមូលដ្ឋាន។</p>
        </div>
      </div>
    </div>
  </section>
`;
}

function faqPage(): string {
  const groups = [
    { title: "សេវាសាធារណៈ", items: FAQS.slice(0, 2) },
    { title: "ឯកសារ និងលទ្ធផល", items: FAQS.slice(2) },
  ];

  const body = groups
    .map(
      (g) => `      <h2 style="margin-top:32px;">${g.title}</h2>
      <div class="gov-accordion">
${g.items
  .map(
    (f) => `        <details class="gov-accordion__item">
          <summary class="gov-accordion__trigger">${f.q}</summary>
          <div class="gov-accordion__panel"><p>${f.a}</p></div>
        </details>`
  )
  .join("\n")}
      </div>`
    )
    .join("\n\n");

  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>សំណួរញឹកញាប់</h1>
      <p class="gov-reading">ចម្លើយចំពោះសំណួរដែលប្រជាពលរដ្ឋសួរញឹកញាប់បំផុត។</p>

      <form class="gov-search" role="search" action="#" method="get" style="width:100%;max-width:520px;margin-block:16px;">
        <label class="gov-visually-hidden" for="faq-search">ស្វែងរកសំណួរ</label>
        <input id="faq-search" name="q" type="search" placeholder="ស្វែងរកសំណួរ…">
        <button type="submit" aria-label="ស្វែងរក">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </button>
      </form>

${body}

      <div class="gov-cta" style="margin-top:48px;">
        <div>
          <h2 class="gov-cta__title">នៅតែត្រូវការជំនួយ?</h2>
          <p class="gov-cta__text">ក្រុមការងាររបស់យើងអាចជួយអ្នកបាន។</p>
        </div>
        <a class="gov-btn gov-btn--on-primary" href="contact.html">ទំនាក់ទំនងមន្ទីរ</a>
      </div>
    </div>
  </section>
`;
}

function contactPage(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>ទំនាក់ទំនង</h1>
      <p class="gov-reading">ព័ត៌មានទំនាក់ទំនងផ្លូវការ ម៉ោងធ្វើការ និងទីតាំងការិយាល័យ។</p>

      <div class="gov-contact-split" style="margin-top:32px;">
        <dl class="gov-contact-list">
          <div><dt>អាសយដ្ឋាន</dt><dd>ក្រុងតាកែវ ខេត្តតាកែវ កម្ពុជា</dd></div>
          <div><dt>ទូរស័ព្ទ</dt><dd><a href="tel:+855320000000">+855 32 000 000</a></dd></div>
          <div><dt>អ៊ីមែល</dt><dd><a href="mailto:info@takeo.gov.kh">info@takeo.gov.kh</a></dd></div>
          <div><dt>ម៉ោងធ្វើការ</dt><dd>ចន្ទ–សុក្រ 08:00–17:00</dd></div>
          <div><dt>ខ្សែទូរស័ព្ទជំនួយ</dt><dd>+855 32 111 111 (២៤ ម៉ោង)</dd></div>
        </dl>
        <div class="gov-map">
          <div>
            <p style="margin:0 0 8px;font-weight:600;">ផែនទីទីតាំងការិយាល័យ</p>
            <p style="margin:0;">ផែនទីត្រូវបានផ្ទុកដោយឡែកនៅពេលអ្នកចុច ដើម្បីកាត់បន្ថយពេលផ្ទុកទំព័រ។</p>
            <p style="margin:12px 0 0;"><a class="gov-btn gov-btn--outline" href="#">បើកទិសដៅ</a></p>
          </div>
        </div>
      </div>

      <h2 style="margin-top:48px;">ផ្ញើសារមកយើង</h2>
      <p class="gov-reading">សូមបំពេញព័ត៌មានខាងក្រោម។ ព័ត៌មានផ្ទាល់ខ្លួនត្រូវបានប្រើសម្រាប់ការឆ្លើយតបតែប៉ុណ្ណោះ។</p>

      <form class="gov-form" novalidate>
        <div class="gov-field">
          <label class="gov-field__label" for="c-name">ឈ្មោះ <span class="gov-field__required" aria-hidden="true">*</span></label>
          <input id="c-name" name="name" type="text" autocomplete="name" required aria-describedby="c-name-help">
          <p class="gov-field__help" id="c-name-help">សូមបំពេញឈ្មោះពេញរបស់អ្នក។</p>
        </div>

        <div class="gov-field">
          <label class="gov-field__label" for="c-email">អ៊ីមែល <span class="gov-field__required" aria-hidden="true">*</span></label>
          <input id="c-email" name="email" type="email" autocomplete="email" required>
        </div>

        <div class="gov-field">
          <label class="gov-field__label" for="c-phone">លេខទូរស័ព្ទ</label>
          <input id="c-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel">
        </div>

        <div class="gov-field">
          <label class="gov-field__label" for="c-topic">ប្រធានបទ</label>
          <select id="c-topic" name="topic">
            <option value="">សូមជ្រើសរើស</option>
            <option>សំណួរអំពីសេវា</option>
            <option>ពាក្យបណ្តឹង</option>
            <option>ការស្នើសុំព័ត៌មាន</option>
          </select>
        </div>

        <div class="gov-field">
          <label class="gov-field__label" for="c-message">សារ <span class="gov-field__required" aria-hidden="true">*</span></label>
          <textarea id="c-message" name="message" required></textarea>
        </div>

        <fieldset style="border:0;margin:0;padding:0;">
          <legend class="gov-field__label">ឯកសារភ្ជាប់ (ជាជម្រើស)</legend>
          <div class="gov-file">
            <label class="gov-field__label" for="c-file">ជ្រើសរើសឯកសារ</label>
            <input id="c-file" name="attachment" type="file" accept=".pdf,.jpg,.png">
            <p class="gov-field__help">ប្រភេទដែលអនុញ្ញាត៖ PDF, JPG, PNG · ទំហំអតិបរមា៖ 5 MB</p>
          </div>
        </fieldset>

        <label class="gov-check">
          <input type="checkbox" name="consent" required>
          <span>ខ្ញុំយល់ព្រមឱ្យប្រើប្រាស់ព័ត៌មានផ្ទាល់ខ្លួនរបស់ខ្ញុំសម្រាប់ការឆ្លើយតប។</span>
        </label>

        <p style="margin:0;">
          <button class="gov-btn gov-btn--primary gov-btn--block-sm" type="submit">ផ្ញើសារ</button>
        </p>
      </form>
    </div>
  </section>
`;
}

function knowledgePage(): string {
  const cards = KNOWLEDGE.concat(KNOWLEDGE)
    .map(
      (k) => `        <a class="gov-card gov-action-card" href="#">
          <p class="gov-eyebrow" style="margin:0;">${k.topic}</p>
          <h3 class="gov-action-card__title">${k.title}</h3>
          <p class="gov-action-card__text">${k.type} · ${k.duration}</p>
          <span class="gov-service-card__action">បើកធនធាន →</span>
        </a>`
    )
    .join("\n");

  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>ចំណេះដឹងឌីជីថល</h1>
      <p class="gov-reading">ធនធានសិក្សាអំពីសុវត្ថិភាពអនឡាញ ការប្រើប្រាស់សេវាឌីជីថល និងជំនាញបច្ចេកវិទ្យាជាមូលដ្ឋាន។</p>

      <ul class="gov-chips">
        <li><a class="gov-chip" href="#" aria-current="true">ទាំងអស់</a></li>
        <li><a class="gov-chip" href="#">សុវត្ថិភាពអនឡាញ</a></li>
        <li><a class="gov-chip" href="#">សេវាឌីជីថល</a></li>
        <li><a class="gov-chip" href="#">មគ្គុទ្ទេសក៍</a></li>
      </ul>

      <div class="gov-grid">
${cards}
      </div>

      <h2 id="documents" style="margin-top:48px;">ឯកសារ និងទម្រង់</h2>
      <p class="gov-reading">ទម្រង់ និងឯកសារផ្លូវការសម្រាប់ទាញយក។</p>
      <ul class="gov-doc-list">
        <li class="gov-doc">
          <span class="gov-doc__icon" aria-hidden="true">PDF</span>
          <div class="gov-doc__body">
            <p class="gov-doc__title">ទម្រង់ពាក្យសុំអាជ្ញាបណ្ណ</p>
            <p class="gov-doc__meta">ការិយាល័យអាជ្ញាបណ្ណ · ធ្វើបច្ចុប្បន្នភាព 12/08/2026 · PDF · 0.4 MB</p>
          </div>
          <a class="gov-btn gov-btn--outline" href="#">ទាញយក PDF (0.4 MB)</a>
        </li>
        <li class="gov-doc">
          <span class="gov-doc__icon" aria-hidden="true">PDF</span>
          <div class="gov-doc__body">
            <p class="gov-doc__title">មគ្គុទ្ទេសក៍សុវត្ថិភាពអនឡាញ</p>
            <p class="gov-doc__meta">ការិយាល័យទូរគមនាគមន៍ · ធ្វើបច្ចុប្បន្នភាព 02/07/2026 · PDF · 1.1 MB</p>
          </div>
          <a class="gov-btn gov-btn--outline" href="#">ទាញយក PDF (1.1 MB)</a>
        </li>
        <li class="gov-doc">
          <span class="gov-doc__icon" aria-hidden="true">XLS</span>
          <div class="gov-doc__body">
            <p class="gov-doc__title">បញ្ជីសេវាសាធារណៈ</p>
            <p class="gov-doc__meta">ការិយាល័យរដ្ឋបាល · ធ្វើបច្ចុប្បន្នភាព 21/06/2026 · XLSX · 0.2 MB</p>
          </div>
          <a class="gov-btn gov-btn--outline" href="#">ទាញយក XLSX (0.2 MB)</a>
        </li>
      </ul>
    </div>
  </section>
`;
}

/**
 * Legal pages.
 *
 * `design.md` §30 requires privacy and terms links in the footer but specifies no
 * wording, and §69 forbids inventing legal language. These pages therefore state
 * what the site collects and defer to the department for the binding text, which
 * is the honest placeholder.
 */
function privacyPage(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <div class="gov-reading">
        <h1>គោលការណ៍ភាពឯកជន</h1>
        <p>មន្ទីរប្រៃសណីយ៍ និងទូរគមនាគមន៍ខេត្តតាកែវ គោរពការពារព័ត៌មានផ្ទាល់ខ្លួនរបស់អ្នកប្រើប្រាស់គេហទំព័រនេះ។</p>

        <h2>ព័ត៌មានដែលយើងប្រមូល</h2>
        <ul>
          <li>ព័ត៌មានដែលអ្នកបំពេញក្នុងទម្រង់ ដូចជាឈ្មោះ អ៊ីមែល និងលេខទូរស័ព្ទ។</li>
          <li>ព័ត៌មានបច្ចេកទេសមូលដ្ឋានសម្រាប់ការវិភាគ និងសុវត្ថិភាព។</li>
        </ul>

        <h2>របៀបប្រើប្រាស់ព័ត៌មាន</h2>
        <p>ព័ត៌មានត្រូវបានប្រើសម្រាប់ការឆ្លើយតបសំណើ ការផ្តល់សេវា និងការកែលម្អគេហទំព័រ។ យើងមិនលក់ ឬចែករំលែកព័ត៌មានផ្ទាល់ខ្លួនទៅភាគីទីបីដោយគ្មានមូលដ្ឋានច្បាប់ទេ។</p>

        <div class="gov-alert gov-alert--warning">
          <div>
            <p class="gov-alert__title">ឯកសារផ្លូវការ</p>
            <p class="gov-alert__text">អត្ថបទពេញលេញនៃគោលការណ៍ភាពឯកជនជាឯកសារផ្លូវការរបស់មន្ទីរ។ សូមទាក់ទងមន្ទីរដើម្បីទទួលបានឯកសារផ្លូវការ។</p>
          </div>
        </div>

        <h2>ទំនាក់ទំនង</h2>
        <p>សម្រាប់សំណួរអំពីទិន្នន័យផ្ទាល់ខ្លួន សូមទាក់ទង <a href="mailto:info@takeo.gov.kh">info@takeo.gov.kh</a>។</p>
      </div>
    </div>
  </section>
`;
}

function termsPage(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <div class="gov-reading">
        <h1>លក្ខខណ្ឌប្រើប្រាស់</h1>
        <p>ការប្រើប្រាស់គេហទំព័រនេះបង្ហាញថាអ្នកយល់ព្រមនឹងលក្ខខណ្ឌខាងក្រោម។</p>

        <h2>គោលបំណងនៃគេហទំព័រ</h2>
        <p>គេហទំព័រនេះផ្តល់ព័ត៌មានអំពីសេវាសាធារណៈ ឯកសារ និងព័ត៌មានផ្លូវការរបស់មន្ទីរ។</p>

        <h2>ភាពត្រឹមត្រូវនៃព័ត៌មាន</h2>
        <p>យើងខិតខំរក្សាព័ត៌មានឱ្យមានភាពត្រឹមត្រូវ និងទាន់សម័យ។ ព័ត៌មានអាចមានការផ្លាស់ប្តូរដោយគ្មានការជូនដំណឹងជាមុន។</p>

        <h2>ការទទួលខុសត្រូវ</h2>
        <p>យើងមិនទទួលខុសត្រូវចំពោះការប្រើប្រាស់ព័ត៌មានខុសគោលបំណង ឬការខូចខាតដែលកើតឡើងពីការប្រើប្រាស់គេហទំព័រនេះទេ។</p>

        <div class="gov-alert gov-alert--warning">
          <div>
            <p class="gov-alert__title">ឯកសារផ្លូវការ</p>
            <p class="gov-alert__text">លក្ខខណ្ឌផ្លូវការពេញលេញជាឯកសាររបស់មន្ទីរ។ សូមទាក់ទងមន្ទីរសម្រាប់អត្ថបទផ្លូវការ។</p>
          </div>
        </div>
      </div>
    </div>
  </section>
`;
}

/**
 * Search results.
 *
 * `design.md` defines no search-results template (§8 gap 9), so this uses the
 * composition the specification does provide: a search control (§11), a results
 * list, and the empty-state pattern from §63.
 */
function searchPage(): string {
  return `  <section class="gov-section">
    <div class="gov-container">
      <h1>ស្វែងរក</h1>
      <p class="gov-reading">ស្វែងរកសេវា ឯកសារ និងព័ត៌មាននៅក្នុងគេហទំព័រនេះ។</p>

      <form class="gov-search" role="search" action="search.html" method="get" style="width:100%;max-width:620px;margin-block:16px;">
        <label class="gov-visually-hidden" for="results-search">ស្វែងរកក្នុងគេហទំព័រ</label>
        <input id="results-search" name="q" type="search" placeholder="បញ្ចូលពាក្យគន្លឹះ…">
        <button type="submit" aria-label="ស្វែងរក">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        </button>
      </form>

      <!-- §63 empty state: the honest starting state, since this is a static site. -->
      <div class="gov-state">
        <p class="gov-state__title">មិនមានលទ្ធផល</p>
        <p class="gov-state__text">សូមសាកល្បងប្តូរពាក្យគន្លឹះ ឬជ្រើសរើសប្រភេទផ្សេង។</p>
        <a class="gov-btn gov-btn--outline" href="services.html">រកមើលសេវាសាធារណៈ</a>
      </div>

      <h2 style="margin-top:32px;">ទំព័រដែលពេញនិយម</h2>
      <ul>
        <li><a href="services.html">សេវាសាធារណៈ</a></li>
        <li><a href="knowledge.html#documents">ឯកសារ និងទម្រង់</a></li>
        <li><a href="news.html">ព័ត៌មាន</a></li>
        <li><a href="faq.html">សំណួរញឹកញាប់</a></li>
      </ul>
    </div>
  </section>
`;
}

function notFoundPage(): string {  return `  <section class="gov-section">
    <div class="gov-container" style="text-align:center;max-width:640px;">
      <p class="gov-error-code">404</p>
      <h1>រកមិនឃើញទំព័រ</h1>
      <p>ទំព័រដែលអ្នកកំពុងស្វែងរកអាចត្រូវបានផ្លាស់ប្តូរ ឬអាសយដ្ឋានមិនត្រឹមត្រូវ។</p>

      <p style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-block:24px;">
        <a class="gov-btn gov-btn--primary" href="index.html">ទំព័រដើម</a>
        <a class="gov-btn gov-btn--outline" href="search.html">ស្វែងរកក្នុងគេហទំព័រ</a>
      </p>

      <div class="gov-card" style="text-align:left;">
        <h2 style="font-size:var(--gov-h4);">ទំព័រដែលអ្នកអាចចង់បាន</h2>
        <ul>
          <li><a href="services.html">សេវាសាធារណៈ</a></li>
          <li><a href="knowledge.html#documents">ឯកសារ និងទម្រង់</a></li>
          <li><a href="faq.html">សំណួរញឹកញាប់</a></li>
          <li><a href="contact.html">ទំនាក់ទំនង</a></li>
        </ul>
      </div>
    </div>
  </section>
`;
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export interface SamplePage {
  /** Output filename. */
  file: string;
  /** Document title. */
  title: string;
  /** Which nav item is current. */
  activeHref: string;
  breadcrumbs?: { label: string; href?: string }[];
  /** Page body markup. */
  main: string;
}

const HOME_CRUMBS = undefined;

export const SAMPLE_PAGES: SamplePage[] = [
  {
    file: "index.html",
    title: "ទំព័រដើម",
    activeHref: "",
    breadcrumbs: HOME_CRUMBS,
    main: homepage(),
  },
  {
    file: "services.html",
    title: "សេវាសាធារណៈ",
    activeHref: "services.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "សេវាសាធារណៈ" }],
    main: servicesListing(),
  },
  {
    file: "service-detail.html",
    title: "អាជ្ញាបណ្ណទូរគមនាគមន៍",
    activeHref: "services.html",
    breadcrumbs: [
      { label: "ទំព័រដើម", href: "index.html" },
      { label: "សេវាសាធារណៈ", href: "services.html" },
      { label: "អាជ្ញាបណ្ណទូរគមនាគមន៍" },
    ],
    main: serviceDetail(),
  },
  {
    file: "news.html",
    title: "ព័ត៌មាន",
    activeHref: "news.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "ព័ត៌មាន" }],
    main: newsListing(),
  },
  {
    file: "news-article.html",
    title: "ប្រកាសពីការបើកដំណើរការសេវាអនឡាញថ្មី",
    activeHref: "news.html",
    breadcrumbs: [
      { label: "ទំព័រដើម", href: "index.html" },
      { label: "ព័ត៌មាន", href: "news.html" },
      { label: "ប្រកាសពីការបើកដំណើរការសេវាអនឡាញថ្មី" },
    ],
    main: newsArticle(),
  },
  {
    file: "knowledge.html",
    title: "ចំណេះដឹងឌីជីថល",
    activeHref: "knowledge.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "ចំណេះដឹងឌីជីថល" }],
    main: knowledgePage(),
  },
  {
    file: "about.html",
    title: "អំពីមន្ទីរ",
    activeHref: "about.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "អំពីមន្ទីរ" }],
    main: aboutPage(),
  },
  {
    file: "faq.html",
    title: "សំណួរញឹកញាប់",
    activeHref: "faq.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "សំណួរញឹកញាប់" }],
    main: faqPage(),
  },
  {
    file: "contact.html",
    title: "ទំនាក់ទំនង",
    activeHref: "contact.html",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "ទំនាក់ទំនង" }],
    main: contactPage(),
  },
  {
    file: "404.html",
    title: "រកមិនឃើញទំព័រ",
    activeHref: "",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "រកមិនឃើញទំព័រ" }],
    main: notFoundPage(),
  },
  {
    file: "search.html",
    title: "ស្វែងរក",
    activeHref: "",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "ស្វែងរក" }],
    main: searchPage(),
  },
  {
    file: "privacy.html",
    title: "គោលការណ៍ភាពឯកជន",
    activeHref: "",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "គោលការណ៍ភាពឯកជន" }],
    main: privacyPage(),
  },
  {
    file: "terms.html",
    title: "លក្ខខណ្ឌប្រើប្រាស់",
    activeHref: "",
    breadcrumbs: [{ label: "ទំព័រដើម", href: "index.html" }, { label: "លក្ខខណ្ឌប្រើប្រាស់" }],
    main: termsPage(),
  },
];

/** Render every sample page to a complete HTML document. */
export function buildSampleSite(): { file: string; html: string }[] {
  return SAMPLE_PAGES.map((page) => ({
    file: page.file,
    html: shell({
      title: page.title,
      activeHref: page.activeHref,
      main: page.main,
      breadcrumbs: page.breadcrumbs,
    }),
  }));
}
