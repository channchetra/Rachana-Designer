/**
 * License store — Rachana Designer Full Edition.
 *
 * The original editor gated a handful of features behind an activated licence
 * ("Export to WordPress", "Live Selection", snapshot overwrite). Rachana
 * Designer ships every capability unlocked, so `licenseStatus` is permanently
 * `"active"` and `license` describes the built-in edition rather than a
 * purchased key.
 *
 * The activation API is kept intact behind `useLicenseStore` (and the
 * `LICENSE_*` host messages) so an optional key can still be recorded and
 * displayed, but nothing in the app checks it to decide whether a feature is
 * available. This keeps every `isPro` guard in the ported components working
 * without touching their logic.
 */

import { create } from "zustand";
import type { LicenseRecord } from "@/types/hostMessages";

export type LicenseStatus = "free" | "active" | "expired" | "suspended";
export type LicenseView = "status" | "activate";

export interface LicenseInfo {
  licenseKey: string;
  instanceId: string;
  status: LicenseStatus;
  /** `null` means lifetime. */
  expiresAt: string | null;
  activationLimit: number;
  activation: number;
  edition?: string;
  email?: string;
}

export const EDITION_NAME = "Full Edition";

/** The built-in, always-valid edition record. */
export function createFullEditionRecord(machineId: string): LicenseInfo {
  return {
    licenseKey: "RACHANA-FULL-EDITION",
    instanceId: machineId,
    status: "active",
    expiresAt: null,
    activationLimit: Number.POSITIVE_INFINITY,
    activation: 1,
    edition: EDITION_NAME,
  };
}

/** Convert a host `LicenseRecord` into the store shape. */
export function toLicenseInfo(record: LicenseRecord, machineId: string): LicenseInfo {
  return {
    licenseKey: record.licenseKey,
    instanceId: record.instanceId || machineId,
    status: (record.status as LicenseStatus) ?? "active",
    expiresAt: record.expiresAt,
    activationLimit: record.activationLimit,
    activation: record.activation,
    edition: record.edition ?? EDITION_NAME,
    email: record.email,
  };
}

interface LicenseState {
  licenseModalOpen: boolean;
  setLicenseModalOpen: (open: boolean) => void;
  toggleLicenseModal: () => void;

  currentView: LicenseView;
  setCurrentView: (view: LicenseView) => void;

  machineId: string;
  setMachineId: (id: string) => void;

  license: LicenseInfo | null;
  setLicense: (license: LicenseInfo | null) => void;

  licenseStatus: LicenseStatus;
  setLicenseStatus: (status: LicenseStatus) => void;

  activating: boolean;
  setActivating: (v: boolean) => void;
  activationError: string | null;
  setActivationError: (error: string | null) => void;

  deactivating: boolean;
  setDeactivating: (v: boolean) => void;
  deactivationError: string | null;
  setDeactivationError: (error: string | null) => void;

  portalLoading: boolean;
  setPortalLoading: (v: boolean) => void;
  portalUrl: string | null;
  setPortalUrl: (url: string | null) => void;
  portalError: string | null;
  setPortalError: (error: string | null) => void;

  /** Always true in Rachana Designer — every feature is unlocked. */
  isFullEdition: () => boolean;
}

export const useLicenseStore = create<LicenseState>((set) => ({
  licenseModalOpen: false,
  setLicenseModalOpen: (open) => set({ licenseModalOpen: open }),
  toggleLicenseModal: () => set((s) => ({ licenseModalOpen: !s.licenseModalOpen })),

  currentView: "status",
  setCurrentView: (view) => set({ currentView: view }),

  machineId: "",
  setMachineId: (id) =>
    set((s) => ({
      machineId: id,
      // Keep the built-in edition record pointing at the resolved machine id.
      license: s.license ? { ...s.license, instanceId: s.license.instanceId || id } : s.license,
    })),

  license: null,
  /**
   * A host-reported licence never downgrades the edition: Rachana Designer is
   * always "active". An expired third-party key is still displayed, but it
   * cannot lock a feature.
   */
  setLicense: (license) =>
    set((s) => ({
      license: license ?? s.license,
      licenseStatus: "active",
    })),

  licenseStatus: "active",
  setLicenseStatus: () => set({ licenseStatus: "active" }),

  activating: false,
  setActivating: (v) => set({ activating: v }),
  activationError: null,
  setActivationError: (error) => set({ activationError: error }),

  deactivating: false,
  setDeactivating: (v) => set({ deactivating: v }),
  deactivationError: null,
  setDeactivationError: (error) => set({ deactivationError: error }),

  portalLoading: false,
  setPortalLoading: (v) => set({ portalLoading: v }),
  portalUrl: null,
  setPortalUrl: (url) => set({ portalUrl: url }),
  portalError: null,
  setPortalError: (error) => set({ portalError: error }),

  isFullEdition: () => true,
}));
