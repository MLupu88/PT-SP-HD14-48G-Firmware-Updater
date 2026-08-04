import { FINAL_PACKET_FLAG, MAX_REPRESENTABLE_PACKET_INDEX, PADDING_BYTE, PAYLOAD_BLOCK_SIZE } from "./constants";
import {
  FirmwareValidationError,
  PacketCountExceedsRepresentableIndexError,
  PacketIndexOutOfRangeError,
} from "./errors";
import type { PacketIndexEncoding, PacketPlan } from "./types";

/** The largest unmarked high byte (`floor(index / 256)`) that leaves `FINAL_PACKET_FLAG` (0x80) free. */
const MAX_UNMARKED_HIGH_BYTE = MAX_REPRESENTABLE_PACKET_INDEX >> 8;

/**
 * Computes the packetization plan for a firmware image: how many 1024-byte
 * blocks it splits into, and how much 0xFF padding the final block needs
 * (source: protocol_notes.md "Data packet format").
 *
 * This is the single, earliest, framework-independent place that enforces
 * `MAX_REPRESENTABLE_PACKET_INDEX` — every caller of this protocol library,
 * demo or real, UI-mediated or direct, gets the same protection. A UI layer
 * (see `validateRealMcuMainFirmware`'s caller in `useFirmwareUpdater`) may
 * still pre-check this for a friendlier, earlier error message, but it must
 * never be the *only* thing standing between an oversized firmware image and
 * a packet index that collides with the final-packet flag bit.
 */
export function computePacketPlan(firmwareLength: number): PacketPlan {
  if (firmwareLength <= 0) {
    throw new FirmwareValidationError("Firmware is empty; cannot compute a packet plan.");
  }
  const totalPackets = Math.ceil(firmwareLength / PAYLOAD_BLOCK_SIZE);
  const finalPacketIndex = totalPackets - 1;
  if (finalPacketIndex > MAX_REPRESENTABLE_PACKET_INDEX) {
    throw new PacketCountExceedsRepresentableIndexError(totalPackets);
  }
  const finalPacketStart = finalPacketIndex * PAYLOAD_BLOCK_SIZE;
  const finalPacketRealByteCount = firmwareLength - finalPacketStart;
  const finalPacketPaddingCount = PAYLOAD_BLOCK_SIZE - finalPacketRealByteCount;
  return {
    firmwareLength,
    totalPackets,
    finalPacketIndex,
    finalPacketRealByteCount,
    finalPacketPaddingCount,
  };
}

/**
 * Zero-based packet index split into high/low bytes, with the final packet's
 * high byte OR'd with 0x80 (source: protocol_notes.md "Packet index is
 * zero-based and split as `high = floor(index/256)`, `low = index % 256`").
 *
 * Every `PacketPlan` produced by `computePacketPlan` above is already
 * guaranteed to stay within the representable range, so the check below
 * should be unreachable through this library's own public API. It exists as
 * defense in depth against a hand-built or otherwise-malformed `PacketPlan`
 * reaching this function directly: a non-final packet's high byte must never
 * be able to collide with `FINAL_PACKET_FLAG` through index overflow.
 */
export function encodePacketIndex(packetIndex: number, plan: PacketPlan): PacketIndexEncoding {
  if (packetIndex < 0 || packetIndex >= plan.totalPackets) {
    throw new PacketIndexOutOfRangeError(packetIndex, plan.totalPackets);
  }
  const isFinal = packetIndex === plan.finalPacketIndex;
  const highBits = Math.floor(packetIndex / 256);
  if (highBits > MAX_UNMARKED_HIGH_BYTE) {
    throw new PacketIndexOutOfRangeError(packetIndex, plan.totalPackets);
  }
  const high = (highBits | (isFinal ? FINAL_PACKET_FLAG : 0)) & 0xff;
  const low = packetIndex % 256;
  return { high, low, isFinal };
}

/**
 * Returns the 1024-byte payload block for `packetIndex`, copying real
 * firmware bytes and padding any remainder with 0xFF (final block only).
 */
export function getPayloadBlock(
  firmware: Uint8Array,
  packetIndex: number,
  plan: PacketPlan,
): Uint8Array {
  if (packetIndex < 0 || packetIndex >= plan.totalPackets) {
    throw new PacketIndexOutOfRangeError(packetIndex, plan.totalPackets);
  }
  const block = new Uint8Array(PAYLOAD_BLOCK_SIZE).fill(PADDING_BYTE);
  const start = packetIndex * PAYLOAD_BLOCK_SIZE;
  const end = Math.min(start + PAYLOAD_BLOCK_SIZE, firmware.length);
  block.set(firmware.subarray(start, end), 0);
  return block;
}

/**
 * Whole-transfer completion percentage after `packetIndex` has been
 * accepted, capped at 99 until the caller marks the transfer complete
 * (mirrors protocol_section.js, which never reports 100% from the packet
 * loop itself — it is set separately after the post-final-packet delay).
 */
export function packetProgressPercent(packetIndex: number, plan: PacketPlan): number {
  const sentBytes = Math.min((packetIndex + 1) * PAYLOAD_BLOCK_SIZE, plan.firmwareLength);
  return Math.min(Math.floor((sentBytes / plan.firmwareLength) * 100), 99);
}
