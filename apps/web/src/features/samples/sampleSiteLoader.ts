/**
 * Government sample site loader.
 *
 * The sample pages are generated into `public/sample-site/` by
 * `scripts/build-sample-site.mjs`, so they are fetched at runtime rather than
 * bundled — which keeps the app bundle small and means the same files can be
 * opened directly from disk, browsed on their own, or edited in the app.
 *
 * Opening the sample seeds an in-memory workspace with every page, so a user can
 * immediately click through a real multi-page site and edit any of it visually.
 */

import { MemoryWorkspace } from "@/platform/fs/memoryWorkspace";
import { SAMPLE_PAGES } from "./govSite";

export const SAMPLE_SITE_DIR = "sample-site";
export const SAMPLE_PROJECT_LABEL = "Government sample site";

/** Index page opened when the sample project starts. */
export const SAMPLE_ENTRY = "index.html";

/**
 * Fetch the generated sample pages and seed a workspace with them.
 *
 * @param onProgress Called with (loaded, total) so the UI can show progress.
 * @throws When the pages are missing, which means the build script has not run.
 */
export async function loadSampleSiteWorkspace(
  onProgress?: (loaded: number, total: number) => void
): Promise<MemoryWorkspace> {
  const total = SAMPLE_PAGES.length;
  const seed: Record<string, string> = {};
  let loaded = 0;

  const results = await Promise.all(
    SAMPLE_PAGES.map(async (page) => {
      const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_SITE_DIR}/${page.file}`);
      if (!response.ok) {
        throw new Error(
          `Could not load ${page.file} (HTTP ${response.status}). ` +
            "Run `npm run build:samples` to generate the sample site."
        );
      }
      const html = await response.text();
      loaded += 1;
      onProgress?.(loaded, total);
      return [page.file, html] as const;
    })
  );

  for (const [file, html] of results) seed[file] = html;

  return new MemoryWorkspace(SAMPLE_PROJECT_LABEL, seed);
}

/** True when the sample site appears to be present in this build. */
export async function isSampleSiteAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_SITE_DIR}/${SAMPLE_ENTRY}`, {
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}
