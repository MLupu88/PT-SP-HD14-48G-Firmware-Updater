import { ReadOnlyDeviceConnectionError } from "./readOnlyErrors";

/**
 * Errors specific to the real, firmware-writing `WebSerialTransport`. Reuses
 * `ReadOnlyDeviceConnectionError` as a common base (see that file's updated
 * header comment) purely so every real Web Serial failure — read or write —
 * carries the same `.code` contract that `UpdateEngine` duck-types against,
 * without either module importing the other's class.
 */

/**
 * Thrown by every real `WebSerialTransport` operation unless all three
 * independent safety flags are true (`isRealFirmwareTransferEnabled()`):
 * `VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION`, `VITE_ENABLE_REAL_FLASHING`,
 * and `VITE_ENABLE_HARDWARE_VALIDATION_MODE`.
 */
export class RealFlashingDisabledError extends ReadOnlyDeviceConnectionError {
  constructor(message = "Sending firmware to a real device is disabled in this build.") {
    super(message, "REAL_FLASHING_DISABLED");
  }
}

/**
 * Thrown when `attachPort()`/`connect()` is called while a port is already
 * attached — the real transport reuses one connection for the whole update
 * and never allows swapping the port mid-flight (see README "Cancellation
 * and interruption safety": "prevent selecting another serial port during a
 * running update").
 */
export class PortChangeRejectedError extends ReadOnlyDeviceConnectionError {
  constructor() {
    super("The connected device cannot be changed while it is in use.", "PORT_CHANGE_REJECTED");
  }
}

/**
 * Wraps a raw browser/DOM error (e.g. a `DOMException` from
 * `WritableStreamDefaultWriter.write()`) that isn't one of the more specific
 * recovered-protocol failure modes, so the UI can label it distinctly from
 * a timeout, disconnection, or protocol rejection.
 */
export class WriteFailedError extends ReadOnlyDeviceConnectionError {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Failed to write to the device.", "WRITE_FAILED");
    this.cause = cause;
  }
}

/**
 * Thrown when the write phase itself stalls — `writer.ready` (backpressure)
 * or `writer.write()` never settling — rather than the device simply not
 * replying afterwards (`ReadTimeoutError`). Distinguished from
 * `WriteFailedError` because nothing failed outright: the bytes were never
 * confirmed handed to the port at all, so how much of the packet (if any)
 * reached the device is genuinely unknown.
 *
 * The bound that produces this is a defensive engineering limit, not a
 * recovered protocol value — see `DEFAULT_WRITE_TIMEOUT_MS`.
 */
export class WriteTimeoutError extends ReadOnlyDeviceConnectionError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Writing to the device did not complete within ${timeoutMs}ms.`, "WRITE_TIMEOUT");
    this.timeoutMs = timeoutMs;
  }
}
