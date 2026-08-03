import { describe, expect, it } from "vitest";
import { additiveChecksum } from "../checksum";
import { UnsupportedReplyLengthError } from "../errors";
import { interpretStatusByte, parseReply, parseVersionReply } from "../replies";

function makeReply(mode: 13 | 18, statusByte: number): Uint8Array {
  const frame = new Uint8Array(mode);
  frame[4] = statusByte;
  frame[mode - 1] = additiveChecksum(frame.subarray(0, mode - 1), mode);
  return frame;
}

describe("interpretStatusByte", () => {
  it("maps 0 to accepted", () => expect(interpretStatusByte(0)).toBe("accepted"));
  it("maps 1 to resend", () => expect(interpretStatusByte(1)).toBe("resend"));
  it("maps 2 to failed", () => expect(interpretStatusByte(2)).toBe("failed"));
  it("maps any other value to unknown", () => expect(interpretStatusByte(99)).toBe("unknown"));
});

describe("parseReply", () => {
  it("parses a well-formed 13-byte accepted reply", () => {
    const reply = parseReply(makeReply(13, 0));
    expect(reply.mode).toBe(13);
    expect(reply.status).toBe("accepted");
    expect(reply.statusByte).toBe(0);
    expect(reply.checksumValid).toBe(true);
  });

  it("parses a well-formed 13-byte resend reply", () => {
    const reply = parseReply(makeReply(13, 1));
    expect(reply.status).toBe("resend");
  });

  it("parses a well-formed 13-byte failed reply", () => {
    const reply = parseReply(makeReply(13, 2));
    expect(reply.status).toBe("failed");
  });

  it("parses a well-formed 18-byte reply using the same byte-4 status offset", () => {
    const reply = parseReply(makeReply(18, 0));
    expect(reply.mode).toBe(18);
    expect(reply.status).toBe("accepted");
  });

  it("flags an invalid checksum without throwing", () => {
    const frame = makeReply(13, 0);
    frame[frame.length - 1] = (frame[frame.length - 1]! + 1) & 0xff;
    const reply = parseReply(frame);
    expect(reply.checksumValid).toBe(false);
    expect(reply.status).toBe("accepted");
  });

  it("rejects a reply of an unsupported length", () => {
    expect(() => parseReply(new Uint8Array(10))).toThrow(UnsupportedReplyLengthError);
  });
});

describe("parseVersionReply", () => {
  it("parses a full-format 13-byte version reply (V1.10.36)", () => {
    const frame = new Uint8Array(13);
    // offset = 4 for 13-byte mode; major/minor/patch at offset, offset+2, offset+4
    frame[4] = 1;
    frame[6] = 10;
    frame[8] = 36;
    const version = parseVersionReply(frame, "full");
    expect(version.versionString).toBe("V1.10.36");
    expect(version.major).toBe(1);
    expect(version.minor).toBe("10");
    expect(version.patch).toBe("36");
  });

  it("parses a short-format reply with only major.minor", () => {
    const frame = new Uint8Array(13);
    frame[4] = 2;
    frame[6] = 5;
    const version = parseVersionReply(frame, "short");
    expect(version.versionString).toBe("V2.05");
    expect(version.patch).toBeUndefined();
  });

  it("uses offset 5 instead of 4 for 18-byte mode", () => {
    const frame = new Uint8Array(18);
    frame[5] = 1;
    frame[7] = 10;
    frame[9] = 36;
    const version = parseVersionReply(frame, "full");
    expect(version.versionString).toBe("V1.10.36");
  });

  it("exposes the undocumented offset-10 flag as an unsupported field rather than a guessed boolean", () => {
    const frame = new Uint8Array(13);
    frame[10] = 1;
    const version = parseVersionReply(frame, "full");
    expect(version.unknownFlagAtOffset10.supported).toBe(false);
    expect(version.unknownFlagAtOffset10.rawValue).toBe(1);
  });
});
