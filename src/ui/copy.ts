import type { UpdateState } from "../lib/update-engine";

/**
 * All customer-facing copy for the guided update flow lives here, kept
 * deliberately separate from orchestration logic (`useFirmwareUpdater`) and
 * protocol internals (`src/lib/*`). Nothing in this file should mention
 * Web Serial, baud rate, packets, checksums, or other protocol terms —
 * that vocabulary belongs in `diagnostics.ts` and the Advanced details panel.
 */

export const PRODUCT_NAME = "Firmware Updater";

export const DESIGN_PRINCIPLE =
  "Advanced firmware-update technology presented as a simple, guided consumer experience.";

/** Primary status line shown during an active update, keyed by engine state. */
export const STATE_STATUS_TEXT: Partial<Record<UpdateState, string>> = {
  validating: "Checking your firmware file",
  ready: "Your device is ready to update",
  initializing: "Preparing the update",
  transferring: "Sending firmware",
  retrying: "Reconnecting to your device",
  finalizing: "Finishing installation",
  verifying: "Checking the new version",
  completed: "Update complete",
  failed: "We could not complete the update",
  cancelled: "Update cancelled",
};

export const COMPATIBLE_BROWSER_MESSAGE =
  "This updater works in Google Chrome or Microsoft Edge on a Windows, Mac, or Linux computer.";

export const DEMO_MODE_LABEL = "Demo mode — no changes will be made to your device";

export const DO_NOT_DISCONNECT_WARNING =
  "Keep your device powered on and connected until this finishes.";

export const LEAVE_PAGE_WARNING = "An update is in progress. Leaving now may interrupt it.";

export interface ErrorPresentation {
  readonly title: string;
  readonly message: string;
  readonly deviceSafe: boolean;
  readonly nextAction: string;
  readonly technicalCode: string;
}

const ERROR_PRESENTATIONS: Record<string, Omit<ErrorPresentation, "technicalCode">> = {
  TRANSPORT_FAILURE: {
    title: "Connection interrupted",
    message:
      "The connection was interrupted. Keep the device powered on, reconnect the USB cable, and try again.",
    deviceSafe: true,
    nextAction: "Reconnect the device and start again.",
  },
  RETRY_LIMIT_EXCEEDED: {
    title: "Update did not go through",
    message:
      "Your device kept asking us to resend part of the update. Keep it powered on and try again.",
    deviceSafe: true,
    nextAction: "Try the update again without disconnecting the device.",
  },
  PACKET_REJECTED: {
    title: "Device rejected the update",
    message: "Your device did not accept part of the update. Don't disconnect it — try again.",
    deviceSafe: true,
    nextAction: "Try the update again. If this keeps happening, contact support.",
  },
  UNPARSEABLE_REPLY: {
    title: "Unexpected response",
    message: "We received an unexpected response from your device. Try the update again.",
    deviceSafe: true,
    nextAction: "Try the update again.",
  },
  VALIDATION_FAILED: {
    title: "This file doesn't look right",
    message: "This file doesn't look like the right firmware for this device.",
    deviceSafe: true,
    nextAction: "Choose the correct firmware file and try again.",
  },
  REAL_FLASHING_DISABLED: {
    title: "Not available yet",
    message: "Connecting to a real device isn't available in this version. Try the demo instead.",
    deviceSafe: true,
    nextAction: "Use demo mode to preview the update experience.",
  },
  UPDATE_FAILED: {
    title: "Something went wrong",
    message: "Something went wrong during the update. Keep the device powered on and try again.",
    deviceSafe: true,
    nextAction: "Try the update again.",
  },
};

const FALLBACK_ERROR: Omit<ErrorPresentation, "technicalCode"> = ERROR_PRESENTATIONS.UPDATE_FAILED!;

export function presentError(code: string): ErrorPresentation {
  const presentation = ERROR_PRESENTATIONS[code] ?? FALLBACK_ERROR;
  return { ...presentation, technicalCode: code };
}
