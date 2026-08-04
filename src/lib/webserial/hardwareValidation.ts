/**
 * Gate logic for the "Hardware validation mode" bench override (exposed
 * only when all three safety flags are true — see flags.ts). Phase 2A
 * established that a successful version-query reply carries no device/model
 * name field, so it can never positively confirm a connected device is
 * genuinely a PT-SP-HD14-48G. This module represents the explicit,
 * human-provided evidence that stands in for that missing electronic proof,
 * and the all-or-nothing gate that decides whether the real update action
 * may be enabled. Pure and framework-independent — no Web Serial, no React.
 */

export const REQUIRED_PRODUCT_TOKEN = "PT-SP-HD14-48G";

/** The exact string an operator must type to enable the real update action. */
export const REQUIRED_TYPED_CONFIRMATION = REQUIRED_PRODUCT_TOKEN;

export interface HardwareValidationAcknowledgements {
  /** "I have physically read the PT-SP-HD14-48G label on this device." */
  readonly physicallyLabeled: boolean;
  /** "This device has stable power." */
  readonly stablePower: boolean;
  /** "USB and power will remain connected for the whole update." */
  readonly stayConnected: boolean;
  /** "I understand no tested recovery path exists if this update is interrupted." */
  readonly noRecoveryPathAcknowledged: boolean;
  /** Required only when `requiresVersionWarningAcknowledgement` is true (see `isSameOrDowngradeVersion`). */
  readonly sameOrDowngradeVersionAcknowledged: boolean;
}

export const EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS: HardwareValidationAcknowledgements = {
  physicallyLabeled: false,
  stablePower: false,
  stayConnected: false,
  noRecoveryPathAcknowledged: false,
  sameOrDowngradeVersionAcknowledged: false,
};

export interface HardwareValidationGateInput {
  /** A valid (checksum-correct) reply was received from the connected device — see DeviceIdentityResult.checksumValid. */
  readonly deviceReplyValid: boolean;
  /** The selected firmware's filename contains the exact product token. */
  readonly firmwareFilenameHasProductToken: boolean;
  /** The selected file passed `validateRealMcuMainFirmware`. */
  readonly firmwareIsValidMcuMainBin: boolean;
  readonly typedConfirmation: string;
  readonly acknowledgements: HardwareValidationAcknowledgements;
  readonly requiresVersionWarningAcknowledgement: boolean;
}

export function isTypedConfirmationValid(value: string): boolean {
  return value.trim() === REQUIRED_TYPED_CONFIRMATION;
}

/**
 * All-or-nothing gate: every condition below must hold before the real
 * "Start update" action may be enabled. There is no partial-credit path —
 * missing any single item keeps the action disabled.
 */
export function isHardwareValidationGateOpen(input: HardwareValidationGateInput): boolean {
  const { acknowledgements } = input;
  return (
    input.deviceReplyValid &&
    input.firmwareFilenameHasProductToken &&
    input.firmwareIsValidMcuMainBin &&
    isTypedConfirmationValid(input.typedConfirmation) &&
    acknowledgements.physicallyLabeled &&
    acknowledgements.stablePower &&
    acknowledgements.stayConnected &&
    acknowledgements.noRecoveryPathAcknowledged &&
    (!input.requiresVersionWarningAcknowledgement || acknowledgements.sameOrDowngradeVersionAcknowledged)
  );
}

/**
 * Compares two "V1.10.36"-style version strings component-wise. Returns a
 * negative number if `a` < `b`, positive if `a` > `b`, else 0. Informational
 * only — GTool's recovered source proves no downgrade-blocking policy, so
 * this never blocks a transfer by itself (see
 * `requiresVersionWarningAcknowledgement` above, which only requires an
 * extra acknowledgement, never a hard stop).
 */
export function compareVersionStrings(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/i, "")
      .split(".")
      .map((part) => parseInt(part, 10));
  const partsA = parse(a);
  const partsB = parse(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (Number.isNaN(numA) || Number.isNaN(numB)) return 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

/** True when `selected` is not newer than `installed`. False (no warning required) when either version is unknown. */
export function isSameOrDowngradeVersion(installed: string | null, selected: string | null): boolean {
  if (!installed || !selected) return false;
  return compareVersionStrings(selected, installed) <= 0;
}
