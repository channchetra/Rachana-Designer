/**
 * Screenshot store.
 *
 * Ported verbatim from the original webview (device presets, format, optional
 * background composite). The only change is that the preset list is exported
 * so the settings UI and tests can reference it.
 */

import { create } from "zustand";

export interface ScreenshotDevice {
  id: string;
  name: string;
  icon: string;
  w: number;
  h: number;
  checked: boolean;
}

export interface ScreenshotResult {
  deviceId: string;
  deviceName: string;
  width: number;
  height: number;
  dataUrl: string;
  filename: string;
}

export type ScreenshotFormat = "png" | "webp";

export const DEFAULT_DEVICES: ScreenshotDevice[] = [
  { id: "mobile-s", name: "Mobile S", icon: "smartphone", w: 375, h: 667, checked: true },
  { id: "mobile-l", name: "Mobile L", icon: "smartphone", w: 414, h: 896, checked: true },
  { id: "square-post", name: "Square Post", icon: "monitor", w: 1080, h: 1080, checked: false },
  { id: "tablet", name: "Tablet", icon: "tablet", w: 768, h: 1024, checked: true },
  { id: "laptop", name: "Laptop", icon: "laptop", w: 1280, h: 800, checked: true },
  { id: "desktop", name: "Desktop", icon: "monitor", w: 1440, h: 900, checked: true },
  { id: "ultrawide", name: "Ultrawide", icon: "monitor", w: 1920, h: 1080, checked: false },
  { id: "leaderboard", name: "Leaderboard", icon: "monitor", w: 728, h: 90, checked: false },
  { id: "large-leaderboard", name: "Large Leaderboard", icon: "monitor", w: 970, h: 90, checked: false },
  { id: "billboard", name: "Billboard", icon: "monitor", w: 970, h: 250, checked: false },
  { id: "medium-rectangle", name: "Medium Rectangle", icon: "monitor", w: 300, h: 250, checked: false },
  { id: "large-rectangle", name: "Large Rectangle", icon: "monitor", w: 336, h: 280, checked: false },
  { id: "skyscraper", name: "Skyscraper", icon: "monitor", w: 160, h: 600, checked: false },
  { id: "half-page", name: "Half Page", icon: "monitor", w: 300, h: 600, checked: false },
  { id: "mobile-banner", name: "Mobile Banner", icon: "smartphone", w: 320, h: 50, checked: false },
  { id: "large-mobile-banner", name: "Large Mobile Banner", icon: "smartphone", w: 320, h: 100, checked: false },
];

interface ScreenshotState {
  modalOpen: boolean;
  toggleModal: () => void;
  openModal: () => void;
  closeModal: () => void;

  devices: ScreenshotDevice[];
  toggleDevice: (id: string) => void;
  selectAllDevices: () => void;
  deselectAllDevices: () => void;

  format: ScreenshotFormat;
  setFormat: (f: ScreenshotFormat) => void;

  bgEnabled: boolean;
  setBgEnabled: (enabled: boolean) => void;
  bgColor: string;
  setBgColor: (color: string) => void;

  capturing: boolean;
  setCapturing: (c: boolean) => void;

  progress: number;
  totalDevices: number;
  setProgress: (current: number, total: number) => void;

  results: ScreenshotResult[];
  addResult: (r: ScreenshotResult) => void;
  clearResults: () => void;

  savingToFolder: boolean;
  setSavingToFolder: (s: boolean) => void;
  savedFolderName: string | null;
  setSavedFolderName: (name: string | null) => void;
}

export const useScreenshotStore = create<ScreenshotState>((set) => ({
  modalOpen: false,
  toggleModal: () =>
    set((s) => ({
      modalOpen: !s.modalOpen,
      results: [],
      progress: 0,
      totalDevices: 0,
      savedFolderName: null,
    })),
  openModal: () => set({ modalOpen: true, results: [], progress: 0, totalDevices: 0, savedFolderName: null }),
  closeModal: () => set({ modalOpen: false, capturing: false }),

  devices: DEFAULT_DEVICES.map((d) => ({ ...d })),
  toggleDevice: (id) =>
    set((s) => ({ devices: s.devices.map((d) => (d.id === id ? { ...d, checked: !d.checked } : d)) })),
  selectAllDevices: () => set((s) => ({ devices: s.devices.map((d) => ({ ...d, checked: true })) })),
  deselectAllDevices: () => set((s) => ({ devices: s.devices.map((d) => ({ ...d, checked: false })) })),

  format: "png",
  setFormat: (f) => set({ format: f }),

  bgEnabled: false,
  setBgEnabled: (enabled) => set({ bgEnabled: enabled }),
  bgColor: "#ffffff",
  setBgColor: (color) => set({ bgColor: color }),

  capturing: false,
  setCapturing: (c) => set({ capturing: c }),

  progress: 0,
  totalDevices: 0,
  setProgress: (current, total) => set({ progress: current, totalDevices: total }),

  results: [],
  addResult: (r) => set((s) => ({ results: [...s.results, r] })),
  clearResults: () => set({ results: [], progress: 0 }),

  savingToFolder: false,
  setSavingToFolder: (s) => set({ savingToFolder: s }),
  savedFolderName: null,
  setSavedFolderName: (name) => set({ savedFolderName: name, savingToFolder: false }),
}));
