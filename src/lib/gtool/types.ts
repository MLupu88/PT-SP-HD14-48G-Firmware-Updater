/** Command/reply framing width. 13-byte mode uses prefix A5 5B; 18-byte mode uses ASCII "PVT". */
export type ByteMode = 13 | 18;

export interface FirmwareFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface PacketPlan {
  readonly firmwareLength: number;
  readonly totalPackets: number;
  readonly finalPacketIndex: number;
  /** Number of real firmware bytes present in the final packet (the rest is 0xFF padding). */
  readonly finalPacketRealByteCount: number;
  readonly finalPacketPaddingCount: number;
}

export interface PacketIndexEncoding {
  readonly high: number;
  readonly low: number;
  readonly isFinal: boolean;
}

/** Interpretation of device reply byte 4 for MCU_MAIN data frames (source: protocol_notes.md "Reply handling"). */
export type ReplyStatus = "accepted" | "resend" | "failed" | "unknown";

export interface ParsedReply {
  readonly mode: ByteMode;
  readonly raw: Uint8Array;
  readonly statusByte: number;
  readonly status: ReplyStatus;
  readonly checksumValid: boolean;
}

/**
 * A protocol detail that could not be safely inferred from the recovered
 * sources. Callers must handle this explicitly rather than receiving a
 * guessed value.
 */
export interface UnsupportedProtocolField {
  readonly supported: false;
  readonly rawValue: number;
  readonly reason: string;
}

export type VersionReplyFormat = "full" | "short";

export interface ParsedVersionReply {
  readonly mode: ByteMode;
  readonly raw: Uint8Array;
  readonly format: VersionReplyFormat;
  readonly major: number;
  /** Zero-padded two-character minor version segment, mirroring the source formatting. */
  readonly minor: string;
  /** Present only when `format` is `"full"` (command 01 13). */
  readonly patch?: string;
  readonly versionString: string;
  /**
   * TODO(docs/gtool-analysis/protocol_section.js:184): GTool reads
   * `reply[10] === 1` into a boolean it stores as `he.value` immediately
   * after a successful version query. Its semantic meaning is not covered
   * by GTool_2.0.6_protocol_notes.md and cannot be safely inferred from the
   * minified bundle alone, so it is exposed as raw, uninterpreted data
   * rather than a guessed boolean flag.
   */
  readonly unknownFlagAtOffset10: UnsupportedProtocolField;
}
