import { verifyChecksum } from "./checksum";
import { UnsupportedReplyLengthError } from "./errors";
import type {
  ByteMode,
  ParsedReply,
  ParsedVersionReply,
  ReplyStatus,
  VersionReplyFormat,
} from "./types";

function byteModeForLength(length: number): ByteMode {
  if (length === 13) return 13;
  if (length === 18) return 18;
  throw new UnsupportedReplyLengthError(length);
}

/**
 * Interprets reply byte 4 for MCU_MAIN data-frame acknowledgements (source:
 * protocol_notes.md "Reply handling": 0 = accepted, 1 = resend, 2 = failed,
 * any other value = failed/unrecognized).
 */
export function interpretStatusByte(statusByte: number): ReplyStatus {
  switch (statusByte) {
    case 0:
      return "accepted";
    case 1:
      return "resend";
    case 2:
      return "failed";
    default:
      return "unknown";
  }
}

/**
 * Parses a fixed 13- or 18-byte device reply. Works for both frame widths:
 * GTool reads the same byte offset (index 4) for data-frame status
 * regardless of mode (source: protocol_section.js `St`/`De`/`Ee`, all of
 * which check `reply[4]` unconditionally).
 */
export function parseReply(raw: Uint8Array): ParsedReply {
  const mode = byteModeForLength(raw.length);
  const statusByte = raw[4] ?? 0xff;
  return {
    mode,
    raw,
    statusByte,
    status: interpretStatusByte(statusByte),
    checksumValid: verifyChecksum(raw, mode),
  };
}

function padTwoDigits(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Parses a version-query reply (source: protocol_section.js `ge()`).
 * The field offset is mode-dependent: byte 4 in 13-byte mode, byte 5 in
 * 18-byte mode. `"full"` format (command `01 13`) encodes
 * major/minor/patch at `offset`, `offset+2`, `offset+4`; `"short"` format
 * (fallback command `01 03`) encodes only major/minor.
 */
export function parseVersionReply(raw: Uint8Array, format: VersionReplyFormat): ParsedVersionReply {
  const mode = byteModeForLength(raw.length);
  const offset = mode === 13 ? 4 : 5;

  const major = raw[offset] ?? 0;
  const minor = padTwoDigits(raw[offset + 2] ?? 0);
  const patch = format === "full" ? padTwoDigits(raw[offset + 4] ?? 0) : undefined;
  const versionString = format === "full" ? `V${major}.${minor}.${patch}` : `V${major}.${minor}`;

  return {
    mode,
    raw,
    format,
    major,
    minor,
    patch,
    versionString,
    unknownFlagAtOffset10: {
      supported: false,
      rawValue: raw[10] ?? 0,
      reason:
        "GTool reads reply[10] === 1 into an undocumented flag after a version query " +
        "(docs/gtool-analysis/protocol_section.js:184). Its meaning is not covered by " +
        "GTool_2.0.6_protocol_notes.md, so it is exposed as raw data only.",
    },
  };
}
