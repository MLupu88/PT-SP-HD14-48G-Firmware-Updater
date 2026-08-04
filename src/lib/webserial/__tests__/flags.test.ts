import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isHardwareValidationModeEnabled,
  isReadOnlyDeviceConnectionEnabled,
  isRealFirmwareTransferEnabled,
  isRealFlashingFlagEnabled,
} from "../flags";

/**
 * The feature-gate matrix: real firmware transfer must require all three
 * independent flags simultaneously. Every combination with fewer than three
 * "true" flags must leave `isRealFirmwareTransferEnabled()` false.
 */
describe("feature-gate matrix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stub(readOnly: boolean, realFlashing: boolean, hardwareValidation: boolean): void {
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", String(readOnly));
    vi.stubEnv("VITE_ENABLE_REAL_FLASHING", String(realFlashing));
    vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", String(hardwareValidation));
  }

  it("defaults to false when no flags are set", () => {
    vi.unstubAllEnvs();
    expect(isReadOnlyDeviceConnectionEnabled()).toBe(false);
    expect(isRealFlashingFlagEnabled()).toBe(false);
    expect(isHardwareValidationModeEnabled()).toBe(false);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("all three flags false", () => {
    stub(false, false, false);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("read-only only", () => {
    stub(true, false, false);
    expect(isReadOnlyDeviceConnectionEnabled()).toBe(true);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("real-flashing only", () => {
    stub(false, true, false);
    expect(isRealFlashingFlagEnabled()).toBe(true);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("hardware-validation only", () => {
    stub(false, false, true);
    expect(isHardwareValidationModeEnabled()).toBe(true);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("read-only + real-flashing (no hardware-validation)", () => {
    stub(true, true, false);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("read-only + hardware-validation (no real-flashing)", () => {
    stub(true, false, true);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("real-flashing + hardware-validation (no read-only)", () => {
    stub(false, true, true);
    expect(isRealFirmwareTransferEnabled()).toBe(false);
  });

  it("all three flags true — the only combination that opens the gate", () => {
    stub(true, true, true);
    expect(isRealFirmwareTransferEnabled()).toBe(true);
  });

  it("every single-flag-false combination out of three-true leaves the gate closed", () => {
    const combinations: Array<[boolean, boolean, boolean]> = [
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ];
    for (const [readOnly, realFlashing, hardwareValidation] of combinations) {
      stub(readOnly, realFlashing, hardwareValidation);
      expect(isRealFirmwareTransferEnabled()).toBe(false);
    }
  });
});
