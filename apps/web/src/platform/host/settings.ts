/**
 * Settings API.
 *
 * A thin, observable façade over `appConfig` plus the few shell actions the
 * host needs to trigger (opening the settings panel, revealing a source
 * location in the in-app source editor).
 */

import { useEffect, useState } from "react";
import { appConfig, type AppConfig } from "./config";

export interface SettingsApi {
  get(): AppConfig;
  set(patch: Partial<AppConfig>): void;
  subscribe(listener: (config: AppConfig) => void): () => void;
  /** Show the settings panel. */
  open(): void;
  /** Reveal a workspace file at a 1-based line/column in the source pane. */
  revealSource(opts: { path: string; line: number; column: number }): void;
}

export const SETTINGS_OPEN_EVENT = "rachana:open-settings";
export const REVEAL_SOURCE_EVENT = "rachana:reveal-source";

export function createSettingsApi(): SettingsApi {
  return {
    get: () => appConfig.get(),
    set: (patch) => {
      appConfig.set(patch);
    },
    subscribe: (listener) => appConfig.subscribe(listener),
    open: () => window.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT)),
    revealSource: (opts) =>
      window.dispatchEvent(new CustomEvent(REVEAL_SOURCE_EVENT, { detail: opts })),
  };
}

/** React hook: subscribe to configuration changes. */
export function useAppConfig(): [AppConfig, (patch: Partial<AppConfig>) => void] {
  const [config, setConfig] = useState<AppConfig>(() => appConfig.get());
  useEffect(() => appConfig.subscribe(setConfig), []);
  return [config, (patch) => appConfig.set(patch)];
}
