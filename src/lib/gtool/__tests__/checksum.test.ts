import { describe, expect, it } from "vitest";
import { additiveChecksum, verifyChecksum } from "../checksum";
import { InvalidByteModeError } from "../errors";

describe("additiveChecksum", () => {
  it("computes the two's complement of the sum for 13-byte mode", () => {
    // sum = 0x01 + 0x02 + 0x03 = 6; two's complement low byte = 250 (0xFA)
    expect(additiveChecksum(Uint8Array.of(0x01, 0x02, 0x03), 13)).toBe(0xfa);
  });

  it("returns 0 when the sum is already a multiple of 256 (13-byte mode)", () => {
    expect(additiveChecksum(Uint8Array.of(0x00, 0x00), 13)).toBe(0);
    expect(additiveChecksum(Uint8Array.of(0x80, 0x80), 13)).toBe(0);
  });

  it("computes the low byte of the sum for 18-byte mode", () => {
    expect(additiveChecksum(Uint8Array.of(0x01, 0x02, 0x03), 18)).toBe(0x06);
    expect(additiveChecksum(Uint8Array.of(0xff, 0xff), 18)).toBe(0xfe);
  });

  it("wraps sums larger than 255", () => {
    const bytes = new Uint8Array(300).fill(1); // sum = 300
    expect(additiveChecksum(bytes, 18)).toBe(300 % 256);
    expect(additiveChecksum(bytes, 13)).toBe((256 - (300 % 256)) & 0xff);
  });

  it("rejects unsupported byte modes", () => {
    // @ts-expect-error deliberately invalid mode to verify the runtime guard
    expect(() => additiveChecksum(Uint8Array.of(1), 16)).toThrow(InvalidByteModeError);
  });
});

describe("verifyChecksum", () => {
  it("confirms a self-consistent 13-byte frame sums to zero mod 256", () => {
    const body = Uint8Array.of(0xa5, 0x5b, 0x08, 0x07, 0x00);
    const checksum = additiveChecksum(body, 13);
    const frame = Uint8Array.of(...body, checksum);
    expect(verifyChecksum(frame, 13)).toBe(true);
    const total = frame.reduce((sum, byte) => (sum + byte) & 0xff, 0);
    expect(total).toBe(0);
  });

  it("detects a corrupted checksum byte", () => {
    const body = Uint8Array.of(0xa5, 0x5b, 0x08, 0x07, 0x00);
    const checksum = additiveChecksum(body, 13);
    const frame = Uint8Array.of(...body, (checksum + 1) & 0xff);
    expect(verifyChecksum(frame, 13)).toBe(false);
  });
});
