/** Base class for every error raised by the Phase 2A read-only connection path. */
export class ReadOnlyDeviceConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ReadOnlyConnectionDisabledError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super(
      'Read-only device connection is disabled (VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION is not "true").',
    );
  }
}

export class WebSerialUnsupportedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("This browser does not support Web Serial.");
  }
}

/** Thrown when the browser's port-selection dialog is dismissed without a choice. */
export class PortSelectionCancelledError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("No serial device was selected.");
  }
}

/** Thrown by connect()/queryDeviceIdentity() when an overlapping call is already running. */
export class ConnectionInProgressError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("A connection attempt is already in progress.");
  }
}

export class NotConnectedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("No device is connected.");
  }
}

/** Thrown by the bounded reader; `rawBytes` retains whatever partial data arrived before the deadline. */
export class ReadTimeoutError extends ReadOnlyDeviceConnectionError {
  readonly rawBytes: Uint8Array;
  constructor(rawBytes: Uint8Array) {
    super("The device did not respond in time.");
    this.rawBytes = rawBytes;
  }
}

/** Thrown when accumulated bytes never resolve into a recognized 13- or 18-byte frame. */
export class MalformedFramingError extends ReadOnlyDeviceConnectionError {
  readonly rawBytes: Uint8Array;
  constructor(rawBytes: Uint8Array) {
    super("The device replied with an unrecognized number of bytes.");
    this.rawBytes = rawBytes;
  }
}

export class DeviceDisconnectedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("The device was disconnected.");
  }
}
