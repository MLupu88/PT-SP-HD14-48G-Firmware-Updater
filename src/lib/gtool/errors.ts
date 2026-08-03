/** Base class for all errors raised by the gtool protocol library. */
export class GToolProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class FirmwareValidationError extends GToolProtocolError {}

/**
 * Raised when a firmware file's module cannot be determined. Only MCU_MAIN
 * is documented in docs/gtool-analysis; other module tables referenced by
 * the decompiled `Fv` lookup (e.g. MCU_SUB, EDID) were not recovered, so
 * they are treated as unsupported rather than guessed.
 */
export class UnsupportedModuleError extends GToolProtocolError {}

export class InvalidByteModeError extends GToolProtocolError {
  constructor(mode: number) {
    super(`Unsupported byte mode: ${mode}. Only 13 or 18 are defined.`);
  }
}

export class PacketIndexOutOfRangeError extends GToolProtocolError {
  constructor(index: number, totalPackets: number) {
    super(`Packet index ${index} is outside firmware range [0, ${totalPackets}).`);
  }
}

export class UnsupportedReplyLengthError extends GToolProtocolError {
  constructor(length: number) {
    super(`Unsupported reply length: ${length} bytes. Only 13 or 18 are defined.`);
  }
}
