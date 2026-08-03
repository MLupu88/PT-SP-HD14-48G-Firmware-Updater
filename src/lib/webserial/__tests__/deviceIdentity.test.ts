import { describe, expect, it } from "vitest";
import { additiveChecksum } from "../../gtool/checksum";
import { interpretCompleteReply } from "../deviceIdentity";

const PORT = { usbVendorId: null, usbProductId: null };

function frame(mode: 13 | 18, major: number, minor: number, patch: number, corrupt = false): Uint8Array {
  const buf = new Uint8Array(mode);
  const offset = mode === 13 ? 4 : 5;
  buf[offset] = major;
  buf[offset + 2] = minor;
  buf[offset + 4] = patch;
  buf[mode - 1] = additiveChecksum(buf.subarray(0, mode - 1), mode);
  if (corrupt) buf[mode - 1] = (buf[mode - 1]! + 1) & 0xff;
  return buf;
}

describe("interpretCompleteReply", () => {
  it("returns valid_supported_reply for a checksum-valid 13-byte frame", () => {
    const result = interpretCompleteReply(frame(13, 1, 10, 36), PORT);
    expect(result.stage).toBe("valid_supported_reply");
    expect(result.checksumValid).toBe(true);
    expect(result.version?.versionString).toBe("V1.10.36");
    expect(result.compatible).toBe(false);
  });

  it("returns valid_supported_reply for a checksum-valid 18-byte frame", () => {
    const result = interpretCompleteReply(frame(18, 4, 4, 4), PORT);
    expect(result.stage).toBe("valid_supported_reply");
    expect(result.mode).toBe(18);
    expect(result.version?.versionString).toBe("V4.04.04");
  });

  it("returns unknown_serial_device for a recognized length with an invalid checksum", () => {
    const result = interpretCompleteReply(frame(13, 1, 10, 36, true), PORT);
    expect(result.stage).toBe("unknown_serial_device");
    expect(result.checksumValid).toBe(false);
    expect(result.deviceLabel).toBe("Serial device connected");
  });

  it("never claims a positively identified device from this reply type", () => {
    const result = interpretCompleteReply(frame(13, 1, 10, 36), PORT);
    expect(result.stage).not.toBe("identified_compatible_device");
    expect(result.compatible).toBe(false);
  });
});
