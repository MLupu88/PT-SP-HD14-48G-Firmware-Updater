import { describe, expect, it } from "vitest";
import {
  REFERENCE_FINAL_PACKET_PADDING,
  REFERENCE_FINAL_PACKET_REAL_BYTES,
  makeSyntheticFirmwareBytes,
} from "../../../test/fixtures";
import { additiveChecksum } from "../checksum";
import { PADDING_BYTE, PAYLOAD_BLOCK_SIZE } from "../constants";
import { buildDataPacket, DATA_FRAME_LENGTH } from "../packet";
import { computePacketPlan } from "../packetizer";

/**
 * The real firmware's data-packet checksums (AC for the first packet, 0E
 * for the last, per packet_reference_output.txt) depend on the actual
 * copyrighted firmware bytes, which are not present in this repository. The
 * framing structure — header, index bytes, final-packet flag, padding, and
 * checksum algorithm — does not depend on firmware content and is asserted
 * exactly here using a synthetic buffer of the documented length instead.
 */
describe("buildDataPacket", () => {
  const firmware = makeSyntheticFirmwareBytes();
  const plan = computePacketPlan(firmware.length);

  it("frames the first packet as FE EF 00 00", () => {
    const frame = buildDataPacket(firmware, 0, plan, 13);
    expect(frame).toHaveLength(DATA_FRAME_LENGTH);
    expect(Array.from(frame.subarray(0, 4))).toEqual([0xfe, 0xef, 0x00, 0x00]);
  });

  it("frames the last packet (index 109) as FE EF 80 6D", () => {
    const frame = buildDataPacket(firmware, plan.finalPacketIndex, plan, 13);
    expect(Array.from(frame.subarray(0, 4))).toEqual([0xfe, 0xef, 0x80, 0x6d]);
  });

  it("carries real firmware bytes verbatim in the payload", () => {
    const frame = buildDataPacket(firmware, 0, plan, 13);
    const payload = frame.subarray(4, 4 + PAYLOAD_BLOCK_SIZE);
    expect(payload).toEqual(firmware.subarray(0, PAYLOAD_BLOCK_SIZE));
  });

  it("pads the last packet's payload with 0xFF after the real bytes", () => {
    const frame = buildDataPacket(firmware, plan.finalPacketIndex, plan, 13);
    const payload = frame.subarray(4, 4 + PAYLOAD_BLOCK_SIZE);
    const padding = payload.subarray(REFERENCE_FINAL_PACKET_REAL_BYTES);
    expect(padding).toHaveLength(REFERENCE_FINAL_PACKET_PADDING);
    expect(Array.from(padding).every((byte) => byte === PADDING_BYTE)).toBe(true);
  });

  it("appends a checksum consistent with additiveChecksum for both byte modes", () => {
    for (const mode of [13, 18] as const) {
      const frame = buildDataPacket(firmware, 0, plan, mode);
      const expected = additiveChecksum(frame.subarray(0, frame.length - 1), mode);
      expect(frame[frame.length - 1]).toBe(expected);
    }
  });

  it("produces a 13-byte-mode frame that sums to zero modulo 256", () => {
    const frame = buildDataPacket(firmware, 0, plan, 13);
    const sum = frame.reduce((total, byte) => (total + byte) & 0xff, 0);
    expect(sum).toBe(0);
  });
});
