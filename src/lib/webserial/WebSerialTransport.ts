import type { UpdateTransport } from "../update-engine/transport";
import { readBoundedReply } from "./boundedReader";
import { writeBounded } from "./boundedWriter";
import type { SerialPortSummary } from "./deviceIdentity";
import { isRealFirmwareTransferEnabled } from "./flags";
import { DEFAULT_SERIAL_OPTIONS } from "./ReadOnlyDeviceConnection";
import {
  ConnectionInProgressError,
  DeviceDisconnectedError,
  NotConnectedError,
  PortSelectionCancelledError,
  WebSerialUnsupportedError,
} from "./readOnlyErrors";
import { PortChangeRejectedError, RealFlashingDisabledError, WriteTimeoutError } from "./transportErrors";

export { RealFlashingDisabledError } from "./transportErrors";

/**
 * Hard bound on the write phase of a single `sendAndReceive` exchange.
 *
 * This is a defensive engineering limit, **not** a recovered protocol value:
 * nothing in docs/gtool-analysis specifies a write timeout, because GTool's
 * Node `serialport` write path could not stall the way a browser
 * `WritableStream` can. It is deliberately far above any plausible real
 * duration — the largest frame sent is 1,029 bytes, ~90ms of wire time at
 * 115200 baud, and `write()` resolves once the data is handed to the driver,
 * not when the device has consumed it — so it can only be reached by a
 * genuinely wedged port, never by normal slowness.
 */
export const DEFAULT_WRITE_TIMEOUT_MS = 5_000;

export interface WebSerialTransportOptions {
  /** Overrides `DEFAULT_WRITE_TIMEOUT_MS`; exists so tests can bound the write phase in milliseconds. */
  readonly writeTimeoutMs?: number;
}

function summarizePort(port: SerialPort): SerialPortSummary {
  const info = port.getInfo();
  return {
    usbVendorId: info.usbVendorId ?? null,
    usbProductId: info.usbProductId ?? null,
  };
}

/**
 * Real, gated Web Serial transport: the only object in this codebase capable
 * of sending an MCU_MAIN initialization command or an `FE EF` firmware data
 * packet to physical hardware. `UpdateEngine` drives it exclusively through
 * `UpdateTransport` — it never sees the port, the reader, or the writer
 * directly — so every byte that ever reaches the wire through this class was
 * constructed by `src/lib/gtool` from the recovered protocol, never from
 * free-form UI input. There is no method here that accepts arbitrary bytes
 * from a caller outside the engine, and no terminal/console surface exists
 * anywhere in the UI layer that could reach it.
 *
 * Gated on `isRealFirmwareTransferEnabled()` — all three independent safety
 * flags — checked at the top of every method below, not just once at
 * construction, so flipping a flag mid-session (e.g. in a test) takes effect
 * immediately rather than being cached.
 */
export class WebSerialTransport implements UpdateTransport {
  readonly label = "Real device (Web Serial)";

  private port: SerialPort | null = null;
  private connecting = false;
  /** Guards against overlapping sendAndReceive calls: only one write+read cycle in flight at a time. */
  private busy = false;
  private readonly writeTimeoutMs: number;

  constructor(options: WebSerialTransportOptions = {}) {
    this.writeTimeoutMs = options.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS;
  }

  private readonly handleDisconnect = (event: Event): void => {
    if (event.target === this.port) {
      this.port = null;
    }
  };

  isConnected(): boolean {
    return this.port !== null;
  }

  /** Best-effort USB descriptor summary for diagnostics; null until a port is attached. */
  getPortInfo(): SerialPortSummary | null {
    return this.port ? summarizePort(this.port) : null;
  }

  /**
   * Attaches an already-open port — normally the exact port the user just
   * selected and confirmed via `ReadOnlyDeviceConnection` a moment earlier —
   * instead of opening a second one. This is what "reuse the selected
   * connection where safe" means in practice: the operator picks a device
   * once, not twice, and no path here can silently swap it mid-update.
   */
  attachPort(port: SerialPort): void {
    if (!isRealFirmwareTransferEnabled()) {
      throw new RealFlashingDisabledError();
    }
    if (this.port) {
      throw new PortChangeRejectedError();
    }
    this.port = port;
    port.addEventListener("disconnect", this.handleDisconnect);
  }

  /**
   * Requests and opens a new port using the recovered serial configuration.
   * A no-op if a port is already attached (e.g. via `attachPort`) — the real
   * update flow always attaches first, so this only runs the full
   * request/open sequence for direct/standalone use (including tests).
   *
   * `onPortSelected` fires right after the browser's port-selection dialog
   * resolves and before `port.open()` starts, mirroring
   * `ReadOnlyDeviceConnection.connect()` so the UI can show the same
   * "Choose your device" → "Connecting" phase split for the real path.
   */
  async connect(onPortSelected?: () => void): Promise<void> {
    if (!isRealFirmwareTransferEnabled()) {
      throw new RealFlashingDisabledError();
    }
    if (this.port) return;
    if (this.connecting) {
      throw new ConnectionInProgressError();
    }
    if (typeof navigator === "undefined" || !navigator.serial) {
      throw new WebSerialUnsupportedError();
    }

    this.connecting = true;
    try {
      let port: SerialPort;
      try {
        port = await navigator.serial.requestPort();
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          throw new PortSelectionCancelledError();
        }
        throw error;
      }
      onPortSelected?.();
      await port.open(DEFAULT_SERIAL_OPTIONS);
      port.addEventListener("disconnect", this.handleDisconnect);
      this.port = port;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.invalidatePort();
  }

  /**
   * Detaches and orderly-closes the current port for an explicit
   * `disconnect()`: awaited, since there is no reason here to believe the
   * port itself is wedged. Do not reuse this for the write-timeout path
   * below — see `invalidatePortAfterWriteTimeout()`.
   */
  private async invalidatePort(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (!port) return;
    port.removeEventListener("disconnect", this.handleDisconnect);
    try {
      await port.close();
    } catch {
      // Best-effort: the port may already be gone.
    }
  }

  /**
   * Detaches the current port synchronously — `isConnected()` reports false
   * the instant this returns, before anything is awaited — then closes it
   * best-effort in the background. A write timeout means the port itself
   * may be the thing that's wedged, so unlike `invalidatePort()` above,
   * `port.close()` here must never be awaited: a wedged port can just as
   * easily hang on close() as it did on write(), and the caller (a rejecting
   * `sendAndReceive()`) must never be blocked waiting to find out.
   */
  private invalidatePortAfterWriteTimeout(): void {
    const port = this.port;
    this.port = null;
    if (!port) return;
    port.removeEventListener("disconnect", this.handleDisconnect);
    void port.close().catch(() => undefined);
  }

  /**
   * Writes exactly `data` once and returns the device's raw reply bytes.
   * Never retries internally — `UpdateEngine` is the only place a retry
   * decision is made, based on the parsed reply status byte or a caught
   * error here, per the recovered retry behavior.
   *
   * Both halves are time-bounded: the write by `writeTimeoutMs` (see
   * `DEFAULT_WRITE_TIMEOUT_MS`) and the reply by `options.timeoutMs`, so no
   * single exchange can hang the update indefinitely.
   */
  async sendAndReceive(data: Uint8Array, options: { timeoutMs: number }): Promise<Uint8Array> {
    if (!isRealFirmwareTransferEnabled()) {
      throw new RealFlashingDisabledError();
    }
    const port = this.port;
    if (!port) {
      throw new NotConnectedError();
    }
    if (this.busy) {
      throw new ConnectionInProgressError();
    }
    if (!port.writable || !port.readable) {
      this.port = null;
      throw new DeviceDisconnectedError();
    }

    this.busy = true;
    try {
      // writeBounded respects backpressure (awaits `writer.ready` before
      // writing), enforces the write time bound, and always releases the
      // writer's lock — see src/lib/webserial/boundedWriter.ts.
      try {
        await writeBounded(port.writable.getWriter(), data, this.writeTimeoutMs);
      } catch (error) {
        if (error instanceof WriteTimeoutError) {
          // Neither `writer.ready` nor `writer.write()` ever settled, so
          // whether any bytes of this packet reached the device is
          // genuinely unknown — reusing this same port for anything, even a
          // read, would mean talking to a device whose protocol state we
          // can no longer reason about. Invalidate the connection outright,
          // not just the writer, so `isConnected()` reports false and any
          // further destructive operation requires a fresh connection.
          this.invalidatePortAfterWriteTimeout();
        }
        throw error;
      }

      const reader = port.readable.getReader();
      // readBoundedReply always releases the reader's lock itself (success,
      // timeout, or disconnect) — see src/lib/webserial/boundedReader.ts.
      try {
        const { raw } = await readBoundedReply(reader, options.timeoutMs);
        return raw;
      } catch (error) {
        if (error instanceof DeviceDisconnectedError) {
          this.port = null;
        }
        throw error;
      }
    } finally {
      this.busy = false;
    }
  }
}
