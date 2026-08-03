/**
 * Presentation-only device/version helpers. Purely cosmetic display logic —
 * does not touch the protocol library or engine.
 */

export const DEVICE_DISPLAY_NAME = "PT-SP-HD14-48G";

/** Shown as the "currently installed" version while exploring demo mode. */
export const DEMO_CURRENT_VERSION = "V1.10.30";

const VERSION_PATTERN = /_V(\d+\.\d+\.\d+)(?:_|\.bin$)/i;

/**
 * MCU_MAIN firmware filenames encode their version (e.g.
 * `MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin`, per docs/gtool-analysis). Returns
 * null when a name doesn't follow that convention, so callers can fall back
 * to calmer copy instead of showing a broken label.
 */
export function extractVersionFromFilename(filename: string): string | null {
  const match = filename.match(VERSION_PATTERN);
  return match ? `V${match[1]}` : null;
}
