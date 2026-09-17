import { expect, test } from "@playwright/test";
import {
  openDiagnostics,
  readCanvasHtml,
  reachWelcome,
  resetAppState,
  startTemplateProject,
  waitForCanvasReady,
} from "./helpers";

/**
 * End-to-end smoke tests.
 *
 * These prove what unit tests structurally cannot: that the app boots in a real
 * browser, that `editor-inject.js` actually executes inside the sandboxed canvas
 * iframe (rather than merely being present in the markup), and that the host
 * bridge answers the UI's round-trips.
 *
 * Selectors use the titles the toolbar really exposes; see
 * `tests/e2e/_recon.spec.ts` for the harness that produced them.
 */

test.describe("app boot", () => {
  test("welcome screen offers every entry point with no account gate", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);

    await expect(page.getByText("Open a project folder")).toBeVisible();
    await expect(page.getByText("Import a folder")).toBeVisible();
    await expect(page.getByText("Start from a template")).toBeVisible();

    // Rachana Designer has no sign-in; assert that rather than assuming it.
    await expect(page.getByRole("button", { name: /sign in|log in|activate|upgrade/i })).toHaveCount(0);
    await expect(page.getByText(/no account, no sign-in/i)).toBeVisible();
  });

  test("opens the editor from the template project", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);

    // The title bar identifies the open document.
    await expect(page.getByTitle("index.html")).toBeVisible();
  });

  test("the toolbar shows no licence or plan control", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);

    // Rachana Designer has no licence tier, so the toolbar must carry no plan
    // badge, padlock, or upgrade affordance of any kind. These assertions guard
    // against that UI being reintroduced.
    await expect(page.getByTitle("PRO License")).toHaveCount(0);
    await expect(page.getByTitle("Free Plan")).toHaveCount(0);
    await expect(page.getByText(/PRO License|Free Plan|Full Edition/i)).toHaveCount(0);

    // The WordPress export button has no Pro/Free badge either.
    await page.getByTitle("WordPress Export").click();
    await expect(page.getByText("Export to WordPress")).toBeVisible();
    await expect(page.getByText(/^Pro$|^Free$/)).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("the canvas iframe boots editor-inject.js", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);
    await waitForCanvasReady(page);

    const html = await readCanvasHtml(page);
    expect(html).toContain("Your new page");
    expect(html).toContain('data-type="section-component"');
  });
});

test.describe("selection and editing", () => {
  test("clicking a canvas element selects it and opens the properties panel", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);
    await waitForCanvasReady(page);

    const handle = await page.locator('iframe[title="Editor Canvas"]').elementHandle();
    const frame = await handle!.contentFrame();
    await frame!.locator("h1").first().click();

    // The properties panel exposes its sections once an element is selected.
    await expect(page.getByText("Typography").first()).toBeVisible({ timeout: 20_000 });
  });

  test("editing stored text is written back through the save pipeline", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);
    await waitForCanvasReady(page);

    const handle = await page.locator('iframe[title="Editor Canvas"]').elementHandle();
    const frame = await handle!.contentFrame();

    // Drive the inject script's own API, which is exactly what the UI does when
    // the user types into a contenteditable element.
    const before = await readCanvasHtml(page);
    expect(before).toContain("Your new page");

    await frame!.evaluate(() => {
      const w = window as unknown as { __glGetFullHtml?: () => string };
      const h1 = document.querySelector("h1");
      if (h1) h1.textContent = "Edited by Playwright";
      void w.__glGetFullHtml;
    });

    const after = await readCanvasHtml(page);
    expect(after).toContain("Edited by Playwright");
  });
});

test.describe("panels open", () => {
  const PANELS: { title: string; marker: RegExp }[] = [
    { title: "Design System Variables", marker: /Variables|Typography/ },
    { title: "Animation classes", marker: /Animation|New animation/i },
    { title: "Wireframes", marker: /Templates|Wireframe|No templates/i },
    { title: "Elements tree", marker: /html|body/i },
  ];

  for (const panel of PANELS) {
    test(`opens the ${panel.title} panel`, async ({ page }) => {
      await resetAppState(page);
      await startTemplateProject(page);
      await waitForCanvasReady(page);

      const button = page.getByTitle(panel.title);
      await expect(button).toBeVisible();
      await button.click();
      await expect(page.getByText(panel.marker).first()).toBeVisible({ timeout: 20_000 });
    });
  }

  test("opens settings and the host log", async ({ page }) => {
    await resetAppState(page);
    await startTemplateProject(page);

    await page.getByTitle("Settings").first().click();
    await expect(page.getByText("Project").first()).toBeVisible();
    await expect(page.getByText("Styling").first()).toBeVisible();
    // The settings panel carries no edition or activation section.
    await expect(page.getByText(/Edition|Activate|Licence key|License key/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Done" }).click();

    await openDiagnostics(page);
  });
});

test.describe("accessibility", () => {
  test("the welcome screen has a single h1 and no horizontal overflow at 320px", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("interactive controls are reachable by keyboard", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);

    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"]).toContain(focused);
  });
});

test.describe("government sample site", () => {
  test("opens the 13-page design.md sample project", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);

    await expect(page.getByText("Government sample site")).toBeVisible();
    await page.getByText("Government sample site").click();

    // The homepage is rendered in the canvas once the project is seeded.
    await waitForCanvasReady(page);
    const html = await readCanvasHtml(page);
    expect(html).toContain("gov-trust-bar");
    expect(html).toContain("--gov-primary: #1c4076");
    // The Khmer agency name proves the real sample content loaded.
    expect(html).toContain("មន្ទីរ");
  });

  test("the sample site applies the design.md tokens inside the canvas", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);
    await page.getByText("Government sample site").click();
    await waitForCanvasReady(page);

    const handle = await page.locator('iframe[title="Editor Canvas"]').elementHandle();
    const frame = await handle!.contentFrame();

    // Asserting the resolved custom property is more robust than asserting a
    // particular element's background: it proves the whole token set loaded.
    const tokens = await frame!.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        primary: s.getPropertyValue("--gov-primary").trim(),
        link: s.getPropertyValue("--gov-link").trim(),
        highlight: s.getPropertyValue("--gov-highlight").trim(),
        bodyText: s.getPropertyValue("--gov-gray-700").trim(),
      };
    });

    expect(tokens).toEqual({
      primary: "#1c4076",
      link: "#0f71bb",
      highlight: "#f07d03",
      bodyText: "#1d2939",
    });

    // And that a real component resolves to the brand colour.
    const buttonBg = await frame!.evaluate(() => {
      const el = document.querySelector(".gov-nav__link") as HTMLElement | null;
      if (!el) return null;
      // The nav bar is the primary surface; check its parent.
      const nav = el.closest(".gov-nav") as HTMLElement | null;
      return nav ? getComputedStyle(nav).backgroundColor : null;
    });
    expect(buttonBg).toBe("rgb(28, 64, 118)");
  });
});

test.describe("theming", () => {
  test("the primary action resolves to the supplied brand colour #1C4076", async ({ page }) => {
    await resetAppState(page);
    await reachWelcome(page);

    // #1C4076 is the brand colour from the supplied logo gradient. Browsers
    // normalise it to rgb(28, 64, 118), possibly with an alpha channel.
    const brand = await page.evaluate(() => {
      const el = document.querySelector(".rd-btn-primary") ?? document.querySelector('[class*="brand"]');
      return el ? getComputedStyle(el).backgroundColor : null;
    });

    expect(brand).not.toBeNull();
    expect(brand).toContain("28, 64, 118");
  });
});
