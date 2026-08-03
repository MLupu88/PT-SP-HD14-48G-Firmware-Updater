import { describe, expect, it } from "vitest";
import { makeMcuMainFirmwareFile, makeSyntheticFirmwareBytes } from "../../../test/fixtures";
import { FirmwareValidationError, UnsupportedModuleError } from "../errors";
import { extractFlagFromFilename, validateMcuMainFirmware } from "../validation";

describe("extractFlagFromFilename", () => {
  it("defaults to 0x00 when no _HEX_-style segment is present", () => {
    expect(extractFlagFromFilename("MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin")).toBe(0x00);
  });

  it("extracts a flag from an underscore-delimited hex segment", () => {
    expect(extractFlagFromFilename("MCU_MAIN_PT-SP_1A_V1.10.36.bin")).toBe(0x1a);
  });
});

describe("validateMcuMainFirmware", () => {
  it("accepts a well-formed MCU_MAIN firmware file and computes its packet plan", () => {
    const file = makeMcuMainFirmwareFile();
    const result = validateMcuMainFirmware(file);
    expect(result.ok).toBe(true);
    expect(result.flag).toBe(0x00);
    expect(result.plan.totalPackets).toBe(110);
  });

  it("rejects an empty file", () => {
    const file = makeMcuMainFirmwareFile(new Uint8Array(0));
    expect(() => validateMcuMainFirmware(file)).toThrow(FirmwareValidationError);
  });

  it("rejects a filename that does not identify an MCU_MAIN image", () => {
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(1024), "SOME_OTHER_MODULE.bin");
    expect(() => validateMcuMainFirmware(file)).toThrow(UnsupportedModuleError);
  });
});
