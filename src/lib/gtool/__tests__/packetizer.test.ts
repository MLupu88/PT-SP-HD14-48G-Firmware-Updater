import { describe, expect, it } from "vitest";
import {
  REFERENCE_FINAL_PACKET_INDEX,
  REFERENCE_FINAL_PACKET_PADDING,
  REFERENCE_FINAL_PACKET_REAL_BYTES,
  REFERENCE_FIRMWARE_LENGTH,
  REFERENCE_TOTAL_PACKETS,
  makeSyntheticFirmwareBytes,
} from "../../../test/fixtures";
import { MAX_REPRESENTABLE_PACKET_INDEX, PADDING_BYTE, PAYLOAD_BLOCK_SIZE } from "../constants";
import { PacketCountExceedsRepresentableIndexError, PacketIndexOutOfRangeError } from "../errors";
import {
  computePacketPlan,
  encodePacketIndex,
  getPayloadBlock,
  packetProgressPercent,
} from "../packetizer";
import type { PacketPlan } from "../types";

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

  /**
   * C2 (pre-commit safety review): the representable-packet-index limit
   * must be enforced structurally here — the earliest, framework-independent
   * shared protocol function — not only by a real-path-specific UI check,
   * so every caller (demo or real) is protected regardless of how it got
   * here.
   */
  describe("representable packet-index boundary (C2)", () => {
    it("accepts a firmware that packetizes into exactly the maximum representable packet count", () => {
      const maxTotalPackets = MAX_REPRESENTABLE_PACKET_INDEX + 1; // 32768
      const length = maxTotalPackets * PAYLOAD_BLOCK_SIZE;
      const plan = computePacketPlan(length);
      expect(plan.totalPackets).toBe(maxTotalPackets);
      expect(plan.finalPacketIndex).toBe(MAX_REPRESENTABLE_PACKET_INDEX);
    });

    it("rejects a firmware that would need one packet more than the maximum", () => {
      const maxTotalPackets = MAX_REPRESENTABLE_PACKET_INDEX + 1; // 32768
      const length = maxTotalPackets * PAYLOAD_BLOCK_SIZE + 1; // one byte over -> one packet over
      expect(() => computePacketPlan(length)).toThrow(PacketCountExceedsRepresentableIndexError);
    });
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

  describe("representable packet-index boundary (C2)", () => {
    it("encodes the final valid index (32767) unambiguously as high=0xFF low=0xFF", () => {
      const maxTotalPackets = MAX_REPRESENTABLE_PACKET_INDEX + 1; // 32768
      const boundaryPlan = computePacketPlan(maxTotalPackets * PAYLOAD_BLOCK_SIZE);
      expect(boundaryPlan.finalPacketIndex).toBe(MAX_REPRESENTABLE_PACKET_INDEX);
      const encoding = encodePacketIndex(MAX_REPRESENTABLE_PACKET_INDEX, boundaryPlan);
      // high = floor(32767/256)=127=0x7F, OR'd with the final flag 0x80 -> 0xFF.
      // Unambiguous: masking back off the flag (0xFF & 0x7F) recovers exactly 127.
      expect(encoding).toEqual({ high: 0xff, low: 0xff, isFinal: true });
      expect(encoding.high & 0x7f).toBe(0x7f);
    });

    it("refuses to encode a non-final packet index whose high byte would collide with the final-packet flag", () => {
      // A hand-built (not computePacketPlan-derived) plan, simulating a
      // caller that bypasses the protocol-level guard in computePacketPlan.
      // Index 32768 is NOT final in this plan, yet floor(32768/256) = 128 =
      // 0x80 — exactly FINAL_PACKET_FLAG. encodePacketIndex must refuse
      // this outright rather than silently emitting an indistinguishable
      // "final packet, index 0" frame.
      const overflowingPlan: PacketPlan = {
        firmwareLength: (MAX_REPRESENTABLE_PACKET_INDEX + 3) * PAYLOAD_BLOCK_SIZE,
        totalPackets: MAX_REPRESENTABLE_PACKET_INDEX + 3,
        finalPacketIndex: MAX_REPRESENTABLE_PACKET_INDEX + 2,
        finalPacketRealByteCount: PAYLOAD_BLOCK_SIZE,
        finalPacketPaddingCount: 0,
      };
      expect(() => encodePacketIndex(MAX_REPRESENTABLE_PACKET_INDEX + 1, overflowingPlan)).toThrow(
        PacketIndexOutOfRangeError,
      );
    });
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
