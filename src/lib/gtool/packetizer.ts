import { FINAL_PACKET_FLAG, PADDING_BYTE, PAYLOAD_BLOCK_SIZE } from "./constants";
import { FirmwareValidationError, PacketIndexOutOfRangeError } from "./errors";
import type { PacketIndexEncoding, PacketPlan } from "./types";

/**
 * Computes the packetization plan for a firmware image: how many 1024-byte
 * blocks it splits into, and how much 0xFF padding the final block needs
 * (source: protocol_notes.md "Data packet format").
 */
export function computePacketPlan(firmwareLength: number): PacketPlan {
  if (firmwareLength <= 0) {
    throw new FirmwareValidationError("Firmware is empty; cannot compute a packet plan.");
  }
  const totalPackets = Math.ceil(firmwareLength / PAYLOAD_BLOCK_SIZE);
  const finalPacketIndex = totalPackets - 1;
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
 */
export function encodePacketIndex(packetIndex: number, plan: PacketPlan): PacketIndexEncoding {
  if (packetIndex < 0 || packetIndex >= plan.totalPackets) {
    throw new PacketIndexOutOfRangeError(packetIndex, plan.totalPackets);
  }
  const isFinal = packetIndex === plan.finalPacketIndex;
  const high = (Math.floor(packetIndex / 256) | (isFinal ? FINAL_PACKET_FLAG : 0)) & 0xff;
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
