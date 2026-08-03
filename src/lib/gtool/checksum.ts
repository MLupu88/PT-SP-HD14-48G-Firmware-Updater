import { InvalidByteModeError } from "./errors";
import type { ByteMode } from "./types";

/**
 * Additive checksum recovered from GTool 2.0.6 (source: protocol_notes.md
 * "13-byte versus 18-byte mode", cross-checked against
 * docs/gtool-analysis/gtool_packet_reference.py `checksum()`).
 *
 * - 13-byte mode: two's complement of the low byte of the sum, so the
 *   complete frame (including this checksum byte) sums to zero modulo 256.
 * - 18-byte mode: the low byte of the sum of the preceding frame bytes.
 */
export function additiveChecksum(bytes: Uint8Array, mode: ByteMode): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    sum = (sum + (bytes[i] ?? 0)) & 0xff;
  }
  if (mode === 13) {
    return (256 - sum) & 0xff;
  }
  if (mode === 18) {
    return sum & 0xff;
  }
  throw new InvalidByteModeError(mode as number);
}

/** True when `frame`'s trailing checksum byte matches the additive checksum of the preceding bytes. */
export function verifyChecksum(frame: Uint8Array, mode: ByteMode): boolean {
  if (frame.length === 0) return false;
  const body = frame.subarray(0, frame.length - 1);
  const expected = additiveChecksum(body, mode);
  return expected === frame[frame.length - 1];
}
