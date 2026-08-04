import { describe, expect, it } from "vitest";
import { makeMcuMainFirmwareFile, makeSyntheticFirmwareBytes } from "../../../test/fixtures";
import { MAX_REPRESENTABLE_PACKET_INDEX, PAYLOAD_BLOCK_SIZE } from "../constants";
import {
  FirmwareValidationError,
  PacketCountExceedsRepresentableIndexError,
  UnsupportedModuleError,
} from "../errors";
import { extractFlagFromFilename, validateMcuMainFirmware, validateRealMcuMainFirmware } from "../validation";

const REQUIRED_PRODUCT_TOKEN = "PT-SP-HD14-48G";

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

describe("validateRealMcuMainFirmware (real-path only, stricter than the simulator's validateMcuMainFirmware)", () => {
  const options = { requiredProductToken: REQUIRED_PRODUCT_TOKEN };

  it("accepts a well-formed MCU_MAIN .bin file carrying the exact product token", () => {
    const file = makeMcuMainFirmwareFile();
    const result = validateRealMcuMainFirmware(file, options);
    expect(result.ok).toBe(true);
    expect(result.plan.totalPackets).toBe(110);
  });

  it("rejects a file that is not a .bin file", () => {
    const file = makeMcuMainFirmwareFile(
      makeSyntheticFirmwareBytes(1024),
      "MCU_MAIN_PT-SP-HD14-48G_V1.10.36.hex",
    );
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(FirmwareValidationError);
  });

  it("rejects a filename that identifies MCU_MAIN but is missing the exact product token", () => {
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(1024), "MCU_MAIN_OTHER-MODEL_V1.0.0.bin");
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(UnsupportedModuleError);
  });

  it("rejects a filename that is close to, but not exactly, the required product token", () => {
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(1024), "MCU_MAIN_PT-SP-HD14-48X_V1.0.0.bin");
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(UnsupportedModuleError);
  });

  it("still rejects an empty file", () => {
    const file = makeMcuMainFirmwareFile(new Uint8Array(0));
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(FirmwareValidationError);
  });

  it("still requires the filename to identify an MCU_MAIN image", () => {
    const file = makeMcuMainFirmwareFile(
      makeSyntheticFirmwareBytes(1024),
      "MCU_SUB_PT-SP-HD14-48G_V1.0.0.bin",
    );
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(UnsupportedModuleError);
  });

  it("rejects a firmware size that would packetize beyond the representable index format", () => {
    const tooLarge = (MAX_REPRESENTABLE_PACKET_INDEX + 2) * PAYLOAD_BLOCK_SIZE;
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(tooLarge));
    expect(() => validateRealMcuMainFirmware(file, options)).toThrow(
      PacketCountExceedsRepresentableIndexError,
    );
  });

  it("accepts a firmware size exactly at the representable index limit", () => {
    const atLimit = (MAX_REPRESENTABLE_PACKET_INDEX + 1) * PAYLOAD_BLOCK_SIZE;
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(atLimit));
    const result = validateRealMcuMainFirmware(file, options);
    expect(result.plan.finalPacketIndex).toBe(MAX_REPRESENTABLE_PACKET_INDEX);
  });

  it("does not weaken validateMcuMainFirmware (the simulator's validator still accepts non-.bin, tokenless names)", () => {
    const file = makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(1024), "MCU_MAIN_DEMO.hex");
    expect(() => validateMcuMainFirmware(file)).not.toThrow();
  });
});
