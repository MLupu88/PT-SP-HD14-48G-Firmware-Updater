/**
 * Constants recovered from docs/gtool-analysis/GTool_2.0.6_protocol_notes.md
 * and docs/gtool-analysis/protocol_section.js.
 */

/** Firmware payload block size in bytes (source: protocol_notes.md "Data packet format"). */
export const PAYLOAD_BLOCK_SIZE = 1024;

/** Byte the final payload block is padded with. */
export const PADDING_BYTE = 0xff;

/** Constant two-byte header on every MCU_MAIN data frame. */
export const DATA_FRAME_HEADER = Uint8Array.of(0xfe, 0xef);

/** High-byte flag OR'd into the packet-index high byte on the final packet. */
export const FINAL_PACKET_FLAG = 0x80;

/** Command-frame prefix for 13-byte mode. */
export const PREFIX_13 = Uint8Array.of(0xa5, 0x5b);

/** Command-frame prefix for 18-byte mode (ASCII "PVT"). */
export const PREFIX_18 = Uint8Array.of(0x50, 0x56, 0x54);

/** MCU_MAIN module configuration (source: protocol_notes.md "Firmware selection for the supplied file"). */
export const MCU_MAIN_MODULE = {
  key: "MCU_MAIN",
  startCommand: [0x08, 0x07] as const,
  confirmCommand: [0x08, 0x08] as const,
  /** Response timeout in milliseconds while waiting for a data-frame reply. */
  responseTimeoutMs: 25_000,
  payloadBlockSize: PAYLOAD_BLOCK_SIZE,
  /** Default flag byte when the filename carries no `_HEX_`-style flag segment. */
  defaultFlag: 0x00,
} as const;

/** Delay GTool waits before resending a packet that the device asked to resend. */
export const RETRY_DELAY_MS = 100;

/** Outer retry attempts per send, per protocol_section.js `Q()` helper (source: `Q=(xe,Le,Be=5e3)=>...`, called with xe=2, i.e. up to 3 total attempts). */
export const MAX_SEND_ATTEMPTS = 3;

/** Delay GTool waits after the final packet is accepted, before reporting 100%. */
export const POST_FINAL_PACKET_DELAY_MS = 3_000;

/** Delay GTool waits after reporting 100%, before re-querying firmware version. */
export const POST_COMPLETE_SETTLE_DELAY_MS = 7_000;
