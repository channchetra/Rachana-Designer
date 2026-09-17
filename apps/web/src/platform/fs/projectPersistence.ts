/**
 * Directory-handle persistence.
 *
 * The File System Access API hands out `FileSystemDirectoryHandle`s that survive
 * a page reload only if they are stored somewhere persistent. IndexedDB is the
 * one store that can hold them (they are structured-cloneable); localStorage
 * cannot. This module is a tiny promise wrapper plus a memory fallback for
 * browsers without the API.
 */

const DB_NAME = "rachana-designer";
const DB_VERSION = 1;
const STORE = "handles";
const HANDLE_KEY = "project-directory";

/** In-memory fallback when IndexedDB is unavailable (private mode, old browser). */
let memoryHandle: unknown = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Persist a directory handle so the project reopens automatically. */
export async function saveDirectoryHandle(handle: unknown): Promise<void> {
  memoryHandle = handle;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Read back the persisted directory handle, if any. */
export async function loadDirectoryHandle<T = unknown>(): Promise<T | null> {
  const db = await openDb();
  if (!db) return (memoryHandle as T) ?? null;
  const value = await new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return value ?? ((memoryHandle as T) ?? null);
}

/** Forget the persisted project. */
export async function clearDirectoryHandle(): Promise<void> {
  memoryHandle = null;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/* ------------------------------------------------------------------ *
 * In-memory project persistence
 * ------------------------------------------------------------------ */

const MEMORY_PROJECT_KEY = "rachana:memory-project";

export interface PersistedMemoryProject {
  label: string;
  files: Record<string, string>;
  savedAt: number;
}

export function saveMemoryProject(project: PersistedMemoryProject): void {
  try {
    localStorage.setItem(MEMORY_PROJECT_KEY, JSON.stringify(project));
  } catch {
    /* quota exceeded — the project simply is not restored next time */
  }
}

export function loadMemoryProject(): PersistedMemoryProject | null {
  try {
    const raw = localStorage.getItem(MEMORY_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMemoryProject;
    if (parsed && typeof parsed.files === "object") return parsed;
  } catch {
    /* corrupt */
  }
  return null;
}

export function clearMemoryProject(): void {
  try {
    localStorage.removeItem(MEMORY_PROJECT_KEY);
  } catch {
    /* nothing to do */
  }
}
