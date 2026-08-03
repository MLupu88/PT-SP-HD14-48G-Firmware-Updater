import { parseReply, parseVersionReply } from "../gtool";
import type { ByteMode, ParsedVersionReply } from "../gtool/types";

/**
 * The 9 checkpoints this phase distinguishes are split across two channels,
 * matching how the rest of this codebase separates outcomes from failures
 * (e.g. `UpdateEngine` events vs. its typed errors):
 *
 * - "Port selected" / "Port opened": implied by `ReadOnlyDeviceConnection
 *   .connect()` resolving (or its specific thrown error otherwise).
 * - "Device responded" (incomplete) / "Timed out" / "Malformed reply" /
 *   "Device disconnected": thrown as `ReadTimeoutError` /
 *   `MalformedFramingError` / `DeviceDisconnectedError` from
 *   `queryDeviceIdentity()`, each carrying raw bytes for diagnostics.
 * - "Valid supported reply" / "Identified compatible device" / "Unknown
 *   serial device": the three stages below, returned (not thrown) because
 *   they are genuine — if sometimes inconclusive — read outcomes.
 */
export type DeviceConnectionStage = "valid_supported_reply" | "identified_compatible_device" | "unknown_serial_device";

export interface SerialPortSummary {
  readonly usbVendorId: number | null;
  readonly usbProductId: number | null;
}

export interface DeviceIdentityResult {
  readonly stage: DeviceConnectionStage;
  readonly port: SerialPortSummary;
  /** Byte mode inferred from the actual reply length received, never assumed. */
  readonly mode: ByteMode;
  readonly rawReplyLength: number;
  readonly rawReplyBytes: Uint8Array;
  readonly checksumValid: boolean;
  readonly version: ParsedVersionReply | null;
  /** Plain-language label, honesty-scoped per stage. */
  readonly deviceLabel: string;
  /**
   * True only for `stage === "identified_compatible_device"`. The recovered
   * version-query reply (docs/gtool-analysis/protocol_section.js `ge()`)
   * carries no device/model name field, only numeric version bytes, so this
   * implementation can never produce `true` today — see README "Phase 2A".
   * The field and stage are kept (not removed) so a future phase that adds
   * genuine model evidence (e.g. the separate JSON `get_device_name` query)
   * has a defined place to report it, without a guessed value existing here.
   */
  readonly compatible: boolean;
}

/**
 * Interprets a complete, recognized-length (13 or 18 byte) reply to the
 * version-query command. Reuses `parseReply`/`parseVersionReply` rather than
 * duplicating checksum or offset logic.
 */
export function interpretCompleteReply(raw: Uint8Array, port: SerialPortSummary): DeviceIdentityResult {
  const reply = parseReply(raw);
  let version: ParsedVersionReply | null;
  try {
    version = parseVersionReply(raw, "full");
  } catch {
    version = null;
  }

  if (!reply.checksumValid) {
    return {
      stage: "unknown_serial_device",
      port,
      mode: reply.mode,
      rawReplyLength: raw.length,
      rawReplyBytes: raw,
      checksumValid: false,
      version,
      deviceLabel: "Serial device connected",
      compatible: false,
    };
  }

  return {
    stage: "valid_supported_reply",
    port,
    mode: reply.mode,
    rawReplyLength: raw.length,
    rawReplyBytes: raw,
    checksumValid: true,
    version,
    deviceLabel: "Device responded, but compatibility could not be confirmed.",
    compatible: false,
  };
}
