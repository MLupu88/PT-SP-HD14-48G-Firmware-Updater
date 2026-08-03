export class UpdateEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown by `start()` when an update is already running on this engine instance. */
export class ParallelUpdateError extends UpdateEngineError {
  constructor() {
    super("An update is already running on this engine instance.");
  }
}

/** Thrown by `start()` when firmware has not been loaded and validated first. */
export class ValidationRequiredError extends UpdateEngineError {
  constructor() {
    super("Firmware must be loaded and successfully validated before starting an update.");
  }
}

/** Thrown when a per-packet retry budget is exhausted. */
export class RetryLimitExceededError extends UpdateEngineError {
  constructor(packetIndex: number, limit: number) {
    super(`Packet ${packetIndex} exceeded the retry limit (${limit}).`);
  }
}

/**
 * A failure originating in the transport (serial link down, timeout,
 * disconnect) as opposed to a rejection from the device's own protocol
 * logic. Kept distinct from ProtocolRejectionError so the UI/diagnostics can
 * tell "the cable/port failed" apart from "the device rejected the data".
 */
export class TransportError extends UpdateEngineError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The device actively rejected a command or packet at the protocol level
 * (reply status byte 2 = "failed", or an unparseable/invalid reply).
 */
export class ProtocolRejectionError extends UpdateEngineError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class UpdateCancelledError extends UpdateEngineError {
  constructor() {
    super("The update was cancelled.");
  }
}

export class InvalidStateTransitionError extends UpdateEngineError {
  constructor(from: string, to: string) {
    super(`Cannot transition from "${from}" to "${to}".`);
  }
}
