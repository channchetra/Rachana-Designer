/**
 * App configuration.
 *
 * Mirrors the original extension's two settings and adds the project-level
 * options a standalone app needs. Persisted in `localStorage` (the browser
 * equivalent of `ConfigurationTarget.Global`) and observable, so the host can
 * emit `CONFIG_CHANGE` the way VS Code did.
 */

export interface AppConfig {
  /** How style edits are written: into CSS classes, or inline on the element. */
  styleMode: string;
  /** Where new Astro rules are saved. */
  styleScope: "global" | "local";
  /** Relative path of the project's global stylesheet. */
  globalCssPath: string;
  /** Enable the "Live" (dev-server) editing mode for `.astro` files. */
  livePreviewEnabled: boolean;
  /** User-supplied dev server origin for Live mode, e.g. http://localhost:4321. */
  liveServerUrl: string;
  /** How the WordPress exporter reaches the site. */
  wpTransport: "direct" | "proxy";
  /** CORS proxy prefix used when `wpTransport` is `proxy`. */
  wpProxyPrefix: string;
  /** Persist the workspace in IndexedDB so a reload keeps the project. */
  autoPersist: boolean;
  /** Show the verbose host log in the diagnostics drawer. */
  verboseLogging: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  styleMode: "class",
  styleScope: "local",
  globalCssPath: "src/styles/global.css",
  livePreviewEnabled: false,
  liveServerUrl: "",
  wpTransport: "direct",
  wpProxyPrefix: "",
  autoPersist: true,
  verboseLogging: false,
};

const STORAGE_KEY = "rachana:config";

type ConfigListener = (config: AppConfig) => void;

class ConfigStore {
  private config: AppConfig = { ...DEFAULT_CONFIG };
  private listeners = new Set<ConfigListener>();
  private loaded = false;

  load(): AppConfig {
    if (this.loaded) return this.config;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      /* corrupt or unavailable storage — keep defaults */
    }
    return this.config;
  }

  get(): AppConfig {
    if (!this.loaded) this.load();
    return this.config;
  }

  set(patch: Partial<AppConfig>): AppConfig {
    this.config = { ...this.get(), ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      /* private mode — settings stay in memory */
    }
    for (const l of [...this.listeners]) l(this.config);
    return this.config;
  }

  subscribe(listener: ConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.set({ ...DEFAULT_CONFIG });
  }
}

export const appConfig = new ConfigStore();

/* ------------------------------------------------------------------ *
 * Small persisted helpers reused across feature modules
 * ------------------------------------------------------------------ */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function readString(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or unavailable */
  }
}
