import { additiveChecksum } from "./checksum";
import { MCU_MAIN_MODULE, PREFIX_13, PREFIX_18 } from "./constants";
import type { ByteMode } from "./types";

/**
 * Builds a generic zero-padded command frame: prefix + 2 command bytes +
 * flag byte, zero-padded to `mode - 1` bytes, followed by the checksum
 * (source: protocol_notes.md "Initial command frames", cross-checked
 * against protocol_section.js `pe()`/`Se()`).
 */
export function buildCommandFrame(
  command: readonly [number, number],
  flag: number,
  mode: ByteMode,
): Uint8Array {
  const prefix = mode === 13 ? PREFIX_13 : PREFIX_18;
  const frame = new Uint8Array(mode);
  frame.set(prefix, 0);
  frame[prefix.length] = command[0];
  frame[prefix.length + 1] = command[1];
  frame[prefix.length + 2] = flag & 0xff;
  // Remaining bytes up to the checksum stay zero (Uint8Array default-initializes to 0).
  const body = frame.subarray(0, mode - 1);
  frame[mode - 1] = additiveChecksum(body, mode);
  return frame;
}

/** The MCU_MAIN start command (`08 07`), sent with up to two retries before the confirm command. */
export function buildMcuMainStartCommand(
  mode: ByteMode,
  flag: number = MCU_MAIN_MODULE.defaultFlag,
): Uint8Array {
  return buildCommandFrame(MCU_MAIN_MODULE.startCommand, flag, mode);
}

/** The MCU_MAIN second/confirm command (`08 08`), sent ~2 seconds after the start command. */
export function buildMcuMainConfirmCommand(
  mode: ByteMode,
  flag: number = MCU_MAIN_MODULE.defaultFlag,
): Uint8Array {
  return buildCommandFrame(MCU_MAIN_MODULE.confirmCommand, flag, mode);
}

export type VersionQueryVariant = "primary" | "fallback";

/**
 * Version query command. `"primary"` uses command bytes `01 13`; `"fallback"`
 * uses `01 03` for devices that reply with the shorter version format
 * (source: protocol_notes.md "Version query").
 */
export function buildVersionQueryCommand(
  mode: ByteMode,
  variant: VersionQueryVariant = "primary",
): Uint8Array {
  const command: readonly [number, number] = variant === "primary" ? [0x01, 0x13] : [0x01, 0x03];
  return buildCommandFrame(command, 0x00, mode);
}
