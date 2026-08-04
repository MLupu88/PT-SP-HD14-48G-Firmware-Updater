/**
 * Base class for every error raised by real (non-simulated) Web Serial
 * mechanics — port selection, opening, reading, and writing. Originally
 * written for the Phase 2A read-only connection path; Phase 2B's real
 * `WebSerialTransport` reuses these same classes for the identical
 * underlying browser-API failure modes rather than duplicating them, since
 * "the port picker was cancelled" or "the device disconnected mid-read"
 * mean the same thing whether the caller was reading a version or writing
 * a firmware packet.
 */
export class ReadOnlyDeviceConnectionError extends Error {
  /** Stable machine code, read by `UpdateEngine` (duck-typed, no import of this class) to classify a transport failure without guessing from the message string. */
  readonly code: string;
  constructor(message: string, code: string = "TRANSPORT_FAILURE") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ReadOnlyConnectionDisabledError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super(
      'Read-only device connection is disabled (VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION is not "true").',
      "READ_ONLY_DISABLED",
    );
  }
}

export class WebSerialUnsupportedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("This browser does not support Web Serial.", "WEB_SERIAL_UNSUPPORTED");
  }
}

/** Thrown when the browser's port-selection dialog is dismissed without a choice. */
export class PortSelectionCancelledError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("No serial device was selected.", "PORT_SELECTION_CANCELLED");
  }
}

/** Thrown by connect()/queryDeviceIdentity() when an overlapping call is already running. */
export class ConnectionInProgressError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("A connection attempt is already in progress.", "CONNECTION_IN_PROGRESS");
  }
}

export class NotConnectedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("No device is connected.", "NOT_CONNECTED");
  }
}

/** Thrown by the bounded reader; `rawBytes` retains whatever partial data arrived before the deadline. */
export class ReadTimeoutError extends ReadOnlyDeviceConnectionError {
  readonly rawBytes: Uint8Array;
  constructor(rawBytes: Uint8Array) {
    super("The device did not respond in time.", "READ_TIMEOUT");
    this.rawBytes = rawBytes;
  }
}

/** Thrown when accumulated bytes never resolve into a recognized 13- or 18-byte frame. */
export class MalformedFramingError extends ReadOnlyDeviceConnectionError {
  readonly rawBytes: Uint8Array;
  constructor(rawBytes: Uint8Array) {
    super("The device replied with an unrecognized number of bytes.", "MALFORMED_REPLY");
    this.rawBytes = rawBytes;
  }
}

export class DeviceDisconnectedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("The device was disconnected.", "DEVICE_DISCONNECTED");
  }
}
