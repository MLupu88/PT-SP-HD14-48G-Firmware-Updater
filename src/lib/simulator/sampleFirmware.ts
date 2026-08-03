import type { FirmwareFile } from "../gtool/types";

/**
 * Generates a synthetic, deterministic firmware-shaped file entirely in the
 * browser, so demo mode can be tried without requiring the user to already
 * have a real .bin file on hand. Never touches the network and is never
 * used outside demo mode.
 */
export function createSampleMcuMainFirmware(
  length = 112_340,
  name = "MCU_MAIN_PT-SP-HD14-48G_DEMO.bin",
): FirmwareFile {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (i * 37 + 11) % 256;
  }
  return { name, bytes };
}
