/**
 * Phase 2A safety flag: gates real, read-only serial device identification
 * (port selection, opening, and the single recovered version-query command).
 * Independent from `VITE_ENABLE_REAL_FLASHING` (see
 * `WebSerialTransport.isRealFlashingFlagEnabled`) and never bypasses it —
 * `ReadOnlyDeviceConnection` has no method capable of sending firmware.
 * Defaults to false everywhere; see .env.example and README "Phase 2A".
 */
export function isReadOnlyDeviceConnectionEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION === "true";
}
