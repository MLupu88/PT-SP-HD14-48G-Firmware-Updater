import { REQUIRED_TYPED_CONFIRMATION } from "../lib/webserial/hardwareValidation";
import type { RecoveryOutcome, UpdateState } from "../lib/update-engine";
import type { RealConnectionPhase } from "./hooks/useFirmwareUpdater";

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
  validating: "Checking the update file",
  initializing: "Preparing the device",
  transferring: "Sending firmware",
  retrying: "Reconnecting to your device",
  finalizing: "Finishing installation",
  verifying: "Checking the installed version",
};

export const HARDWARE_VALIDATION_HEADING = "Hardware validation mode";
export const HARDWARE_VALIDATION_INTRO =
  "This is a bench-testing screen, not part of the normal consumer experience. " +
  "Compatibility could not be electronically confirmed — the device's reply does not carry " +
  "a model name. Everything below must be true before this update can start.";
export const HARDWARE_VALIDATION_NO_RECOVERY_WARNING =
  "No tested recovery path currently exists if this update is interrupted.";
export const HARDWARE_VALIDATION_CONFIRM_LABEL = `Type ${REQUIRED_TYPED_CONFIRMATION} to confirm`;

export const STARTING_UPDATE_TEXT = "Starting the update";
export const DO_NOT_DISCONNECT_WARNING =
  "Do not disconnect the USB cable or power while this is running.";
export const REAL_UPDATE_CANCEL_UNAVAILABLE =
  "This update can no longer be safely cancelled. Keep the device powered on until it finishes.";

export const UPDATE_TRANSFERRED_UNVERIFIED_TITLE = "Update transferred, verification unavailable";
export const UPDATE_TRANSFERRED_UNVERIFIED_MESSAGE =
  "The firmware finished sending, but we couldn't confirm the installed version afterward.";
export const DEVICE_REJECTED_UPDATE_TITLE = "The device rejected the update";
export const CONNECTION_INTERRUPTED_TITLE = "The connection was interrupted";
export const DEVICE_STATE_UNKNOWN_TITLE = "The device state could not be confirmed";

/** Plain-language recovery guidance, keyed by `RecoveryOutcome` (see src/lib/update-engine/recovery.ts). */
export const RECOVERY_GUIDANCE: Record<RecoveryOutcome, { readonly message: string; readonly canRetryAutomatically: boolean }> = {
  safe_to_retry: {
    message: "The device did not respond. Nothing was changed. Check the USB cable and power, then try again.",
    canRetryAutomatically: true,
  },
  initialization_started_no_packet_accepted: {
    message:
      "The update started, but no part of the firmware was installed. Keep the device powered on, then try again.",
    canRetryAutomatically: false,
  },
  transfer_partially_completed: {
    message:
      "The connection was interrupted while firmware was being installed. The device state could not be confirmed. " +
      "Keep the device powered on and reconnect it before attempting recovery.",
    canRetryAutomatically: false,
  },
  completed_verification_failed: {
    message: UPDATE_TRANSFERRED_UNVERIFIED_MESSAGE,
    canRetryAutomatically: false,
  },
  device_disconnected_or_rebooting: {
    message:
      "The device disconnected, which can also happen normally while it reboots after an update. " +
      "Wait a minute, then reconnect to check its status before trying anything else.",
    canRetryAutomatically: false,
  },
  unknown: {
    message:
      "The device's final state could not be confirmed. Keep it powered on and reconnect to check its " +
      "status before trying anything else.",
    canRetryAutomatically: false,
  },
};

/** Calm labels for the Phase 2A real-device connection phases (see RealConnectionPhase). */
export const REAL_CONNECTION_PHASE_TEXT: Partial<Record<RealConnectionPhase, string>> = {
  selecting: "Choose your device",
  connecting: "Connecting",
  checking: "Checking the device",
};

export const DEVICE_IDENTIFIED_HEADING = "Device connected";
export const DEVICE_UNIDENTIFIED_HEADING = "We could not identify this device";

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
  WRITE_FAILED: {
    title: "Connection interrupted",
    message: "The connection was interrupted while sending data.",
    deviceSafe: true,
    nextAction: "Keep the device powered on, reconnect the cable, and try again.",
  },
  WRITE_TIMEOUT: {
    title: "Connection stopped responding",
    message: "The device stopped accepting data.",
    deviceSafe: true,
    nextAction: "Keep the device powered on, reconnect the cable, and try again.",
  },
  PORT_CHANGE_REJECTED: {
    title: "Already connected",
    message: "This device is already connected. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Disconnect first if you want to choose a different device.",
  },
  NOT_CONNECTED: {
    title: "No device connected",
    message: "No device is connected. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Connect a device and try again.",
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
  READ_ONLY_DISABLED: {
    title: "Not available yet",
    message: "Connecting a real device isn't available in this version.",
    deviceSafe: true,
    nextAction: "Try the demo instead.",
  },
  WEB_SERIAL_UNSUPPORTED: {
    title: "Not supported",
    message: "This browser can't connect to a real device.",
    deviceSafe: true,
    nextAction: "Try the demo instead, or use Chrome or Edge on a computer.",
  },
  PORT_SELECTION_CANCELLED: {
    title: "No device selected",
    message: "You did not select a device. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Choose Connect device to try again.",
  },
  CONNECTION_IN_PROGRESS: {
    title: "Already connecting",
    message: "A connection attempt is already in progress. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Wait for it to finish, or refresh the page.",
  },
  READ_TIMEOUT: {
    title: "No response",
    message: "The device did not respond. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Check the USB cable and power, then try again.",
  },
  DEVICE_RESPONDED_INCOMPLETE: {
    title: "No response",
    message: "The device responded, but not completely. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Check the USB cable and power, then try again.",
  },
  MALFORMED_REPLY: {
    title: "Could not identify device",
    message: "The connected device responded, but it could not be identified safely. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Try again, or use a different cable or port.",
  },
  DEVICE_DISCONNECTED: {
    title: "Device disconnected",
    message: "The device was disconnected. Nothing was changed.",
    deviceSafe: true,
    nextAction: "Reconnect it and try again.",
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

/** Titles for `presentRealUpdateError`, one per `RecoveryOutcome`. */
const RECOVERY_OUTCOME_TITLE: Record<RecoveryOutcome, string> = {
  safe_to_retry: "No response",
  initialization_started_no_packet_accepted: "Update didn't start",
  transfer_partially_completed: CONNECTION_INTERRUPTED_TITLE,
  completed_verification_failed: UPDATE_TRANSFERRED_UNVERIFIED_TITLE,
  device_disconnected_or_rebooting: "Device disconnected",
  unknown: DEVICE_STATE_UNKNOWN_TITLE,
};

/**
 * Honest, real-hardware-aware error presentation for a finished
 * `UpdateEngine` run. Unlike `presentError(code)` (used for demo-mode
 * failures, which are inherently harmless because nothing simulated can
 * ever leave the device in an unknown state), this one leads with what the
 * *device* state actually is — computed from the structured event log via
 * `classifyRecovery` — rather than only the raw failure code, because the
 * same technical code (e.g. `DEVICE_DISCONNECTED`) means "nothing was
 * risked" before initialization and "the device's state is now uncertain"
 * during a real transfer.
 */
export function presentRealUpdateError(technicalCode: string, outcome: RecoveryOutcome): ErrorPresentation {
  if (technicalCode === "PACKET_REJECTED" || technicalCode === "UNPARSEABLE_REPLY") {
    return {
      title: DEVICE_REJECTED_UPDATE_TITLE,
      message: "The device rejected the firmware update. The installation stopped.",
      deviceSafe: false,
      nextAction: "Keep the device powered on and confirm that the update file is intended for PT-SP-HD14-48G.",
      technicalCode,
    };
  }
  if (technicalCode === "RETRY_LIMIT_EXCEEDED") {
    return {
      title: DEVICE_REJECTED_UPDATE_TITLE,
      message:
        "The device kept asking to resend part of the update, beyond the retry limit. The installation stopped.",
      deviceSafe: false,
      nextAction: "Keep the device powered on and confirm that the update file is intended for PT-SP-HD14-48G.",
      technicalCode,
    };
  }

  const guidance = RECOVERY_GUIDANCE[outcome];
  return {
    title: RECOVERY_OUTCOME_TITLE[outcome],
    message: guidance.message,
    deviceSafe: outcome === "safe_to_retry" || outcome === "completed_verification_failed",
    nextAction: guidance.canRetryAutomatically
      ? "Try again."
      : "Keep the device powered on before doing anything else.",
    technicalCode,
  };
}
