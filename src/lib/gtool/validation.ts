import { MCU_MAIN_MODULE } from "./constants";
import { FirmwareValidationError, UnsupportedModuleError } from "./errors";
import { computePacketPlan } from "./packetizer";
import type { FirmwareFile, PacketPlan } from "./types";

/**
 * Filename flag extraction, e.g. `MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin` has
 * no `_HEX_`-style segment so the flag defaults to `00` (source:
 * protocol_notes.md "Firmware selection for the supplied file", cross-checked
 * against protocol_section.js `R = xe => { const Le=/_([0-9A-Fa-f]{1,3})_/ ... }`).
 */
const FLAG_SEGMENT_PATTERN = /_([0-9A-Fa-f]{1,3})_/;

export function extractFlagFromFilename(filename: string): number {
  const match = filename.match(FLAG_SEGMENT_PATTERN);
  if (!match || !match[1]) {
    return MCU_MAIN_MODULE.defaultFlag;
  }
  return parseInt(match[1], 16) & 0xff;
}

export interface McuMainValidationResult {
  readonly ok: true;
  readonly flag: number;
  readonly plan: PacketPlan;
}

/**
 * Validates that `file` looks like an MCU_MAIN firmware image and computes
 * its packetization plan. Only the MCU_MAIN module table was recovered from
 * the decompiled sources (start `08 07` / confirm `08 08` / 1024-byte
 * blocks); other module keys referenced by the original `Fv` lookup (e.g.
 * MCU_SUB, EDID) were not recovered and are rejected as unsupported rather
 * than guessed.
 *
 * @throws {FirmwareValidationError} if the file is empty.
 * @throws {UnsupportedModuleError} if the filename does not identify an
 *   MCU_MAIN image.
 */
export function validateMcuMainFirmware(file: FirmwareFile): McuMainValidationResult {
  if (file.bytes.length === 0) {
    throw new FirmwareValidationError(`Firmware file "${file.name}" is empty.`);
  }
  if (!file.name.includes(MCU_MAIN_MODULE.key)) {
    throw new UnsupportedModuleError(
      `Firmware file "${file.name}" does not identify itself as an ${MCU_MAIN_MODULE.key} image. ` +
        "Only the MCU_MAIN module table was recovered from the GTool sources.",
    );
  }

  const flag = extractFlagFromFilename(file.name);
  const plan = computePacketPlan(file.bytes.length);
  return { ok: true, flag, plan };
}
