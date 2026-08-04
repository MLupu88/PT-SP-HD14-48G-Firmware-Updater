/**
 * Phase 2A safety flag: gates real, read-only serial device identification
 * (port selection, opening, and the single recovered version-query command).
 * Independent from `VITE_ENABLE_REAL_FLASHING` (see
 * `isRealFlashingFlagEnabled` below) and never bypasses it —
 * `ReadOnlyDeviceConnection` has no method capable of sending firmware.
 * Defaults to false everywhere; see .env.example and README "Phase 2A".
 */
export function isReadOnlyDeviceConnectionEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION === "true";
}

/**
 * Master safety switch for sending real firmware-update commands to
 * hardware over Web Serial (see .env.example and README "Safety status").
 * Reading this alone does not gate anything by itself — `WebSerialTransport`
 * gates on `isRealFirmwareTransferEnabled()` below, which requires this
 * flag together with the other two.
 */
export function isRealFlashingFlagEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REAL_FLASHING === "true";
}

/**
 * Phase 2B temporary bench-testing gate. Phase 2A established that the
 * version-query reply carries no device/model name field, so a successful
 * reply alone never proves a connected device is genuinely a
 * PT-SP-HD14-48G (see `DeviceIdentityResult.compatible`,
 * `src/lib/webserial/deviceIdentity.ts`). This flag exposes the explicitly
 * human-confirmed "Hardware validation mode" bench override
 * (`src/lib/webserial/hardwareValidation.ts`) that stands in for that
 * missing electronic proof. Defaults to false everywhere; see .env.example
 * and README "Phase 2B".
 */
export function isHardwareValidationModeEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_HARDWARE_VALIDATION_MODE === "true";
}

/**
 * The single gate real firmware transfer must pass: all three independent
 * safety flags true. Any one or two alone leave firmware writing
 * unreachable — see `WebSerialTransport`, which checks this (not the
 * individual flags) before every real operation.
 */
export function isRealFirmwareTransferEnabled(): boolean {
  return (
    isReadOnlyDeviceConnectionEnabled() &&
    isRealFlashingFlagEnabled() &&
    isHardwareValidationModeEnabled()
  );
}
