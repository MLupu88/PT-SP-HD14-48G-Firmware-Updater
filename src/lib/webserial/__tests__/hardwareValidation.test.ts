import { describe, expect, it } from "vitest";
import {
  compareVersionStrings,
  EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS,
  isHardwareValidationGateOpen,
  isSameOrDowngradeVersion,
  isTypedConfirmationValid,
  REQUIRED_TYPED_CONFIRMATION,
} from "../hardwareValidation";
import type { HardwareValidationAcknowledgements, HardwareValidationGateInput } from "../hardwareValidation";

const ALL_ACKNOWLEDGED: HardwareValidationAcknowledgements = {
  physicallyLabeled: true,
  stablePower: true,
  stayConnected: true,
  noRecoveryPathAcknowledged: true,
  sameOrDowngradeVersionAcknowledged: true,
};

function baseInput(overrides: Partial<HardwareValidationGateInput> = {}): HardwareValidationGateInput {
  return {
    deviceReplyValid: true,
    firmwareFilenameHasProductToken: true,
    firmwareIsValidMcuMainBin: true,
    typedConfirmation: REQUIRED_TYPED_CONFIRMATION,
    acknowledgements: ALL_ACKNOWLEDGED,
    requiresVersionWarningAcknowledgement: false,
    ...overrides,
  };
}

describe("isTypedConfirmationValid", () => {
  it("requires an exact match", () => {
    expect(isTypedConfirmationValid("PT-SP-HD14-48G")).toBe(true);
    expect(isTypedConfirmationValid("pt-sp-hd14-48g")).toBe(false);
    expect(isTypedConfirmationValid("PT-SP-HD14-48G ")).toBe(true); // trimmed
    expect(isTypedConfirmationValid(" PT-SP-HD14-48G")).toBe(true);
    expect(isTypedConfirmationValid("PT-SP-HD14-48")).toBe(false);
    expect(isTypedConfirmationValid("")).toBe(false);
  });
});

describe("isHardwareValidationGateOpen — all-or-nothing gate", () => {
  it("opens when every condition holds", () => {
    expect(isHardwareValidationGateOpen(baseInput())).toBe(true);
  });

  it("stays closed with the default (nothing acknowledged) state", () => {
    expect(
      isHardwareValidationGateOpen(baseInput({ acknowledgements: EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS })),
    ).toBe(false);
  });

  it("closes if the device reply was not checksum-valid", () => {
    expect(isHardwareValidationGateOpen(baseInput({ deviceReplyValid: false }))).toBe(false);
  });

  it("closes if the firmware filename is missing the exact product token", () => {
    expect(isHardwareValidationGateOpen(baseInput({ firmwareFilenameHasProductToken: false }))).toBe(false);
  });

  it("closes if the firmware failed real-path validation", () => {
    expect(isHardwareValidationGateOpen(baseInput({ firmwareIsValidMcuMainBin: false }))).toBe(false);
  });

  it("closes if the typed confirmation does not match exactly", () => {
    expect(isHardwareValidationGateOpen(baseInput({ typedConfirmation: "PT-SP-HD14-48g" }))).toBe(false);
  });

  it("closes if any individual acknowledgement checkbox is missing", () => {
    const keys: (keyof HardwareValidationAcknowledgements)[] = [
      "physicallyLabeled",
      "stablePower",
      "stayConnected",
      "noRecoveryPathAcknowledged",
    ];
    for (const key of keys) {
      const acknowledgements = { ...ALL_ACKNOWLEDGED, [key]: false };
      expect(isHardwareValidationGateOpen(baseInput({ acknowledgements }))).toBe(false);
    }
  });

  it("does not require the version-downgrade acknowledgement when it isn't applicable", () => {
    const acknowledgements = { ...ALL_ACKNOWLEDGED, sameOrDowngradeVersionAcknowledged: false };
    expect(
      isHardwareValidationGateOpen(
        baseInput({ acknowledgements, requiresVersionWarningAcknowledgement: false }),
      ),
    ).toBe(true);
  });

  it("requires the version-downgrade acknowledgement when it is applicable", () => {
    const acknowledgements = { ...ALL_ACKNOWLEDGED, sameOrDowngradeVersionAcknowledged: false };
    expect(
      isHardwareValidationGateOpen(
        baseInput({ acknowledgements, requiresVersionWarningAcknowledgement: true }),
      ),
    ).toBe(false);
  });
});

describe("compareVersionStrings / isSameOrDowngradeVersion", () => {
  it("compares component-wise", () => {
    expect(compareVersionStrings("V1.10.36", "V1.10.35")).toBeGreaterThan(0);
    expect(compareVersionStrings("V1.10.35", "V1.10.36")).toBeLessThan(0);
    expect(compareVersionStrings("V1.10.36", "V1.10.36")).toBe(0);
    expect(compareVersionStrings("V2.0.0", "V1.99.99")).toBeGreaterThan(0);
  });

  it("flags same-version and downgrade attempts", () => {
    expect(isSameOrDowngradeVersion("V1.10.36", "V1.10.36")).toBe(true);
    expect(isSameOrDowngradeVersion("V1.10.36", "V1.10.30")).toBe(true);
  });

  it("does not flag an upgrade", () => {
    expect(isSameOrDowngradeVersion("V1.10.30", "V1.10.36")).toBe(false);
  });

  it("does not flag anything when either version is unknown — informational only, never a hard block", () => {
    expect(isSameOrDowngradeVersion(null, "V1.10.36")).toBe(false);
    expect(isSameOrDowngradeVersion("V1.10.36", null)).toBe(false);
    expect(isSameOrDowngradeVersion(null, null)).toBe(false);
  });
});
