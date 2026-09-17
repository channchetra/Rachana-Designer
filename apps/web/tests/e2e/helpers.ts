import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the E2E suite.
 *
 * The app persists its workspace in `localStorage`, so every test starts from a
 * clean slate; otherwise a project left behind by a previous run would change
 * what the first screen shows.
 */

/** Clear persisted state so the welcome screen always appears. */
export async function resetAppState(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.evaluate(async () => {
    // Directory handles live in IndexedDB, not localStorage.
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("rachana-designer");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

/** Land on the welcome screen. */
export async function reachWelcome(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 2 }).or(page.getByText("Start from a template"))).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Start from a template")).toBeVisible();
}

/**
 * Start an in-memory project and wait for the editor shell.
 * Returns the canvas iframe so callers can reach into the document.
 */
export async function startTemplateProject(page: Page) {
  await reachWelcome(page);
  await page.getByText("Start from a template").click();

  // The shell is ready once the title bar and the canvas iframe both exist.
  await expect(page.getByText("Rachana Designer").first()).toBeVisible({ timeout: 30_000 });
  const canvas = page.locator('iframe[title="Editor Canvas"]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

/**
 * Wait until `editor-inject.js` has finished booting inside the canvas.
 *
 * The inject script assigns a `data-gl-path` to every editable element and
 * publishes `window.__glGetFullHtml`, so the presence of either proves the
 * script actually executed rather than merely being present in the markup.
 */
export async function waitForCanvasReady(page: Page): Promise<void> {
  const handle = await page.locator('iframe[title="Editor Canvas"]').elementHandle();
  if (!handle) throw new Error("Canvas iframe not found");
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("Canvas iframe has no content frame");

  await frame.waitForFunction(
    () => {
      const w = window as unknown as Record<string, unknown>;
      return typeof w.__glGetFullHtml === "function" || !!document.querySelector("[data-gl-path]");
    },
    undefined,
    { timeout: 30_000 }
  );
}

/** Read the canvas document's full HTML through the inject script. */
export async function readCanvasHtml(page: Page): Promise<string> {
  const handle = await page.locator('iframe[title="Editor Canvas"]').elementHandle();
  const frame = await handle!.contentFrame();
  return frame!.evaluate(() => {
    const w = window as unknown as { __glGetFullHtml?: () => string };
    return typeof w.__glGetFullHtml === "function" ? w.__glGetFullHtml() : document.documentElement.outerHTML;
  });
}

/** Open the host-message diagnostics drawer. */
export async function openDiagnostics(page: Page): Promise<void> {
  await page.getByTitle("Host message log").click();
  // Target the drawer heading precisely: the trigger button carries the
  // similarly-worded title "Host message log", so a loose text match would
  // resolve to the wrong element.
  await expect(page.getByRole("heading", { name: "Host messages" })).toBeVisible();
}
