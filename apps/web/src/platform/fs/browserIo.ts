/**
 * Browser I/O primitives shared by every workspace implementation.
 *
 * These wrap the three ways a web page can move bytes in and out:
 *  - `<input type="file">` for user-picked files (universally supported),
 *  - the File System Access API for real folders (Chromium),
 *  - Blob + object URL for downloads.
 */

export interface PickedFile {
  name: string;
  data: Uint8Array;
  type: string;
}

/** True when the browser supports the File System Access API. */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function"
  );
}

/**
 * Open the OS file picker and read the chosen file.
 * Uses `showOpenFilePicker` when available so the browser remembers the
 * directory across calls; otherwise falls back to a hidden `<input>`.
 */
export async function pickFileAsBytes(
  accept: string,
  suggestedName?: string
): Promise<PickedFile | null> {
  const w = window as unknown as {
    showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>;
  };

  if (typeof w.showOpenFilePicker === "function") {
    try {
      const handles = await w.showOpenFilePicker({
        multiple: false,
        suggestedName,
        types: buildPickerTypes(accept),
      });
      const file = await handles[0].getFile();
      return { name: file.name, data: new Uint8Array(await file.arrayBuffer()), type: file.type };
    } catch (err) {
      // AbortError = the user cancelled; anything else falls through to input.
      if ((err as DOMException)?.name === "AbortError") return null;
    }
  }

  return new Promise<PickedFile | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (value: PickedFile | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish({ name: file.name, data: new Uint8Array(await file.arrayBuffer()), type: file.type });
    });
    // There is no reliable "cancel" event for file inputs; resolve on refocus.
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => finish(null), 400),
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Read every file under a user-picked directory. Used for importing an
 * existing project into the memory workspace when the File System Access API
 * is unavailable.
 */
export async function pickDirectoryAsBytes(
  onProgress?: (count: number) => void
): Promise<{ dirName: string; files: { path: string; data: Uint8Array }[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Non-standard but supported by Chrome, Edge, Safari and Firefox.
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.style.display = "none";
    let settled = false;
    const finish = (value: { dirName: string; files: { path: string; data: Uint8Array }[] } | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", async () => {
      const list = Array.from(input.files ?? []);
      if (list.length === 0) return finish(null);
      const files: { path: string; data: Uint8Array }[] = [];
      let root = list[0].webkitRelativePath?.split("/")[0] ?? "project";
      for (const file of list) {
        const rel = (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
        files.push({ path: rel, data: new Uint8Array(await file.arrayBuffer()) });
        onProgress?.(files.length);
      }
      finish({ dirName: root, files });
    });
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => finish(null), 400),
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}

/** Trigger a browser download for the given bytes. */
export function downloadBlob(data: Uint8Array | string, filename: string, mime: string): void {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime })
      : new Blob([data.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Map a comma-separated `accept` string to File System Access picker types. */
function buildPickerTypes(accept: string): { description: string; accept: Record<string, string[]> }[] | undefined {
  const exts = accept
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(".") || s.includes("/"));
  if (exts.length === 0) return undefined;

  const mimeMap: Record<string, string[]> = {};
  for (const entry of exts) {
    if (entry.startsWith(".")) {
      mimeMap["application/octet-stream"] = [
        ...(mimeMap["application/octet-stream"] ?? []),
        entry,
      ];
    } else {
      mimeMap[entry] = [entry];
    }
  }
  // A single unrestricted entry is friendlier than many tiny ones.
  return [{ description: "Supported files", accept: mimeMap }];
}

/** Copy text to the clipboard with a legacy fallback. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
