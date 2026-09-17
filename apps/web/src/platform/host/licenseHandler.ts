/**
 * License / edition handler.
 *
 * A self-contained host handler for the `LICENSE_*` message family. Extracting
 * it keeps the edition story in one file: Rachana Designer is the Full Edition,
 * so every `isPro` check the ported UI performs is satisfied without editing a
 * single component.
 *
 * The original extension validated keys against a remote WordPress licence API
 * and cached the result in VS Code's `globalState`. There is nothing to validate
 * here, but the message contract is preserved exactly so the ported
 * `LicenseModal` keeps working unchanged.
 */

import type { HostToWebviewMessage, WebviewToHostMessage } from "@/types/hostMessages";
import { EDITION_NAME, createFullEditionRecord } from "@/stores/licenseStore";
import { readString, writeString } from "./config";

const MACHINE_ID_KEY = "rachana:machine-id";

/** A stable per-install identifier, mirroring VS Code's `env.machineId`. */
export function getMachineId(): string {
  let id = readString(MACHINE_ID_KEY, "");
  if (!id) {
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : fallbackUuid();
    writeString(MACHINE_ID_KEY, id);
  }
  return id;
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The `LICENSE_*` variants this handler answers. */
export type LicenseMessage = Extract<
  WebviewToHostMessage,
  { type: "LICENSE_GET_STATUS" | "LICENSE_ACTIVATE" | "LICENSE_DEACTIVATE" | "LICENSE_GET_PORTAL" }
>;

export interface LicenseHandlerDeps {
  send: (msg: HostToWebviewMessage) => void;
}

/**
 * Answer a licence message.
 *
 * `LICENSE_STATUS` reports an always-active Full Edition record, which is what
 * makes the ported `SnapshotsPanel`, `LiveEditor` and `ConnectPanel` gates pass.
 */
export function handleLicenseMessage(msg: LicenseMessage, deps: LicenseHandlerDeps): void {
  const machineId = getMachineId();

  switch (msg.type) {
    case "LICENSE_GET_STATUS": {
      const record = createFullEditionRecord(machineId);
      deps.send({
        type: "LICENSE_STATUS",
        license: {
          licenseKey: record.licenseKey,
          instanceId: record.instanceId,
          status: record.status,
          expiresAt: record.expiresAt,
          // Unlimited is reported as a large finite number because the store
          // renders it as "activation / limit".
          activationLimit: 999,
          activation: 1,
          edition: EDITION_NAME,
        },
        machineId,
      });
      break;
    }

    case "LICENSE_ACTIVATE": {
      // A key may be recorded for the user's own reference, but it cannot change
      // what is available: the edition is already complete.
      const record = createFullEditionRecord(machineId);
      record.licenseKey = msg.licenseKey.trim() || record.licenseKey;
      record.email = msg.email.trim();
      deps.send({ type: "LICENSE_ACTIVATED", license: record });
      break;
    }

    case "LICENSE_DEACTIVATE":
      deps.send({ type: "LICENSE_DEACTIVATED" });
      break;

    case "LICENSE_GET_PORTAL":
      deps.send({
        type: "LICENSE_PORTAL_ERROR",
        error: `Rachana Designer is the ${EDITION_NAME} — there is no billing portal to open.`,
      });
      break;
  }
}

/** True for messages this handler owns. */
export function isLicenseMessage(type: string): boolean {
  return type.startsWith("LICENSE_");
}
