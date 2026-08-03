import type { UpdateState } from "../lib/update-engine";

/**
 * All customer-facing copy for the guided update flow lives here, kept
 * deliberately separate from orchestration logic (`useFirmwareUpdater`) and
 * protocol internals (`src/lib/*`). Nothing in this file should mention
 * Web Serial, baud rate, packets, checksums, or other protocol terms —
 * that vocabulary belongs in `diagnostics.ts` and the Technical details panel.
 */

export const PRODUCT_TITLE = "PT-SP-HD14-48G Firmware Updater";

export const CONNECT_SUBTITLE = "Update your device directly from this browser. No software to install.";

export const DEMO_LABEL = "Demo";
export const DEMO_EXPLANATION = "Explore the update process without connecting a device.";

export const FIRMWARE_SOURCE_LINE = "Choose the firmware file provided for your device.";

export const READY_LINE = "Your device is ready to update.";
export const POWER_REMINDER = "Keep it connected to power during the update.";

export const UPDATING_INSTRUCTION = "Keep the device powered and connected.";

export const PRIVACY_FOOTER = "Firmware files stay on your device — nothing is uploaded.";

export const CANCELLED_MESSAGE = "The update was stopped. Your device wasn't changed.";

/** Status line shown during an active update, keyed by engine state. Only running states are used. */
export const STATE_STATUS_TEXT: Partial<Record<UpdateState, string>> = {
  initializing: "Preparing the update",
  transferring: "Sending firmware",
  retrying: "Reconnecting to your device",
  finalizing: "Finishing installation",
  verifying: "Checking the new version",
};

export const COMPATIBLE_BROWSER_MESSAGE =
  "This updater works in Google Chrome or Microsoft Edge on a Windows, Mac, or Linux computer.";

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
    message: "The connection was interrupted.",
    deviceSafe: true,
    nextAction: "Keep the device powered on, reconnect the cable, and try again.",
  },
  RETRY_LIMIT_EXCEEDED: {
    title: "Update didn't go through",
    message: "Your device kept asking us to resend part of the update.",
    deviceSafe: true,
    nextAction: "Keep it powered on and try again.",
  },
  PACKET_REJECTED: {
    title: "Device rejected the update",
    message: "Your device didn't accept part of the update.",
    deviceSafe: true,
    nextAction: "Don't disconnect it — try again.",
  },
  UNPARSEABLE_REPLY: {
    title: "Unexpected response",
    message: "We received an unexpected response from your device.",
    deviceSafe: true,
    nextAction: "Try again.",
  },
  VALIDATION_FAILED: {
    title: "This file doesn't look right",
    message: "This doesn't look like the right firmware for this device.",
    deviceSafe: true,
    nextAction: "Choose a different file.",
  },
  REAL_FLASHING_DISABLED: {
    title: "Not available yet",
    message: "Connecting a real device isn't available in this version.",
    deviceSafe: true,
    nextAction: "Try the demo instead.",
  },
  UPDATE_FAILED: {
    title: "We couldn't finish the update",
    message: "Something interrupted the update.",
    deviceSafe: true,
    nextAction: "Keep the device powered on and try again.",
  },
};

const FALLBACK_ERROR: Omit<ErrorPresentation, "technicalCode"> = ERROR_PRESENTATIONS.UPDATE_FAILED!;

export function presentError(code: string): ErrorPresentation {
  const presentation = ERROR_PRESENTATIONS[code] ?? FALLBACK_ERROR;
  return { ...presentation, technicalCode: code };
}
