import { additiveChecksum } from "./checksum";
import { DATA_FRAME_HEADER, PAYLOAD_BLOCK_SIZE } from "./constants";
import { encodePacketIndex, getPayloadBlock } from "./packetizer";
import type { ByteMode, PacketPlan } from "./types";

/** Total length in bytes of one MCU_MAIN data frame: `FE EF` + index (2) + payload (1024) + checksum (1). */
export const DATA_FRAME_LENGTH = DATA_FRAME_HEADER.length + 2 + PAYLOAD_BLOCK_SIZE + 1;

/**
 * Builds one complete `FE EF` MCU_MAIN data packet (source: protocol_notes.md
 * "Data packet format").
 */
export function buildDataPacket(
  firmware: Uint8Array,
  packetIndex: number,
  plan: PacketPlan,
  mode: ByteMode,
): Uint8Array {
  const block = getPayloadBlock(firmware, packetIndex, plan);
  const { high, low } = encodePacketIndex(packetIndex, plan);

  const frame = new Uint8Array(DATA_FRAME_LENGTH);
  frame[0] = DATA_FRAME_HEADER[0]!;
  frame[1] = DATA_FRAME_HEADER[1]!;
  frame[2] = high;
  frame[3] = low;
  frame.set(block, 4);

  const body = frame.subarray(0, frame.length - 1);
  frame[frame.length - 1] = additiveChecksum(body, mode);
  return frame;
}
