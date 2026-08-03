import type { FirmwareFile } from "../lib/gtool/types";

/** Size of the real MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin example documented in docs/gtool-analysis. */
export const REFERENCE_FIRMWARE_LENGTH = 112_340;

export const REFERENCE_TOTAL_PACKETS = 110;
export const REFERENCE_FINAL_PACKET_INDEX = 109;
export const REFERENCE_FINAL_PACKET_REAL_BYTES = 724;
export const REFERENCE_FINAL_PACKET_PADDING = 300;

/**
 * The real firmware binary is copyrighted and intentionally not included in
 * this repository (only its size and SHA-256 are documented). This
 * generates a deterministic, non-repeating synthetic buffer of the same
 * length so structural framing (packet count, index encoding, padding,
 * checksum algorithm) can be tested precisely, without reproducing the
 * actual firmware bytes or its checksum values from packet_reference_output.txt.
 */
export function makeSyntheticFirmwareBytes(length: number = REFERENCE_FIRMWARE_LENGTH): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (i * 37 + 11) % 256;
  }
  return bytes;
}

export function makeMcuMainFirmwareFile(
  bytes: Uint8Array = makeSyntheticFirmwareBytes(),
  name = "MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin",
): FirmwareFile {
  return { name, bytes };
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.trim().split(/\s+/);
  return Uint8Array.from(cleaned.map((byte) => parseInt(byte, 16)));
}
