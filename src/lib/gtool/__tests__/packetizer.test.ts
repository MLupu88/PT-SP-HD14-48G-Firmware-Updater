import { describe, expect, it } from "vitest";
import {
  REFERENCE_FINAL_PACKET_INDEX,
  REFERENCE_FINAL_PACKET_PADDING,
  REFERENCE_FINAL_PACKET_REAL_BYTES,
  REFERENCE_FIRMWARE_LENGTH,
  REFERENCE_TOTAL_PACKETS,
  makeSyntheticFirmwareBytes,
} from "../../../test/fixtures";
import { PADDING_BYTE, PAYLOAD_BLOCK_SIZE } from "../constants";
import { PacketIndexOutOfRangeError } from "../errors";
import {
  computePacketPlan,
  encodePacketIndex,
  getPayloadBlock,
  packetProgressPercent,
} from "../packetizer";

describe("computePacketPlan", () => {
  it("produces exactly 110 packets for the documented 112,340-byte firmware", () => {
    const plan = computePacketPlan(REFERENCE_FIRMWARE_LENGTH);
    expect(plan.totalPackets).toBe(REFERENCE_TOTAL_PACKETS);
    expect(plan.finalPacketIndex).toBe(REFERENCE_FINAL_PACKET_INDEX);
    expect(plan.finalPacketRealByteCount).toBe(REFERENCE_FINAL_PACKET_REAL_BYTES);
    expect(plan.finalPacketPaddingCount).toBe(REFERENCE_FINAL_PACKET_PADDING);
  });

  it("handles a firmware that divides evenly into blocks", () => {
    const plan = computePacketPlan(PAYLOAD_BLOCK_SIZE * 4);
    expect(plan.totalPackets).toBe(4);
    expect(plan.finalPacketRealByteCount).toBe(PAYLOAD_BLOCK_SIZE);
    expect(plan.finalPacketPaddingCount).toBe(0);
  });

  it("rejects an empty firmware", () => {
    expect(() => computePacketPlan(0)).toThrow(/empty/i);
  });
});

describe("encodePacketIndex", () => {
  const plan = computePacketPlan(REFERENCE_FIRMWARE_LENGTH);

  it("encodes packet 0 as high=0x00 low=0x00", () => {
    expect(encodePacketIndex(0, plan)).toEqual({ high: 0x00, low: 0x00, isFinal: false });
  });

  it("encodes a normal mid-stream packet as plain high/low bytes", () => {
    // packet 5: high = floor(5/256) = 0, low = 5
    expect(encodePacketIndex(5, plan)).toEqual({ high: 0x00, low: 0x05, isFinal: false });
  });

  it("marks the final packet (index 109) with the 0x80 high-byte flag", () => {
    expect(encodePacketIndex(REFERENCE_FINAL_PACKET_INDEX, plan)).toEqual({
      high: 0x80,
      low: 0x6d,
      isFinal: true,
    });
  });

  it("OR's the 0x80 flag onto a nonzero high byte for large firmware", () => {
    // 300 packets: final index 299 -> high = floor(299/256)=1 | 0x80 = 0x81, low = 299 % 256 = 43 (0x2B)
    const bigPlan = computePacketPlan(300 * PAYLOAD_BLOCK_SIZE - 1);
    const encoding = encodePacketIndex(bigPlan.finalPacketIndex, bigPlan);
    expect(encoding.high).toBe(0x81);
    expect(encoding.low).toBe(0x2b);
  });

  it("throws for an out-of-range packet index", () => {
    expect(() => encodePacketIndex(-1, plan)).toThrow(PacketIndexOutOfRangeError);
    expect(() => encodePacketIndex(plan.totalPackets, plan)).toThrow(PacketIndexOutOfRangeError);
  });
});

describe("getPayloadBlock", () => {
  const firmware = makeSyntheticFirmwareBytes();
  const plan = computePacketPlan(firmware.length);

  it("returns a full 1024-byte block copied verbatim for a non-final packet", () => {
    const block = getPayloadBlock(firmware, 0, plan);
    expect(block).toHaveLength(PAYLOAD_BLOCK_SIZE);
    expect(block).toEqual(firmware.subarray(0, PAYLOAD_BLOCK_SIZE));
  });

  it("pads the final block with 0xFF after the real firmware bytes", () => {
    const block = getPayloadBlock(firmware, plan.finalPacketIndex, plan);
    expect(block).toHaveLength(PAYLOAD_BLOCK_SIZE);

    const realBytes = block.subarray(0, REFERENCE_FINAL_PACKET_REAL_BYTES);
    const padding = block.subarray(REFERENCE_FINAL_PACKET_REAL_BYTES);

    expect(realBytes).toEqual(
      firmware.subarray(plan.finalPacketIndex * PAYLOAD_BLOCK_SIZE, firmware.length),
    );
    expect(padding).toHaveLength(REFERENCE_FINAL_PACKET_PADDING);
    expect(Array.from(padding).every((byte) => byte === PADDING_BYTE)).toBe(true);
  });
});

describe("packetProgressPercent", () => {
  const plan = computePacketPlan(REFERENCE_FIRMWARE_LENGTH);

  it("never reports 100 before the transfer loop finishes", () => {
    expect(packetProgressPercent(plan.finalPacketIndex, plan)).toBeLessThanOrEqual(99);
  });

  it("increases monotonically with packet index", () => {
    expect(packetProgressPercent(10, plan)).toBeLessThan(packetProgressPercent(50, plan));
  });
});
