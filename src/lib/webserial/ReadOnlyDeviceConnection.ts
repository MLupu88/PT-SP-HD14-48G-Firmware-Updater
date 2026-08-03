import { buildVersionQueryCommand } from "../gtool";
import type { ByteMode } from "../gtool/types";
import { readBoundedReply } from "./boundedReader";
import { isWebSerialSupported } from "./capability";
import { interpretCompleteReply } from "./deviceIdentity";
import type { DeviceIdentityResult, SerialPortSummary } from "./deviceIdentity";
import { isReadOnlyDeviceConnectionEnabled } from "./flags";
import {
  ConnectionInProgressError,
  DeviceDisconnectedError,
  NotConnectedError,
  PortSelectionCancelledError,
  ReadOnlyConnectionDisabledError,
  WebSerialUnsupportedError,
} from "./readOnlyErrors";

/**
 * Serial parameters confirmed from docs/gtool-analysis/main_serial_section.txt
 * (`connect-com` handler): `stopBits: 1, dataBits: 8` are set explicitly in
 * the source. Baud rate is documented as "user-selected... the manuals use
 * 115200" (GTool_2.0.6_protocol_notes.md) — not hardcoded in the source —
 * so 115200 is used here as the documented default, not a discovered
 * constant. Parity and flow control are never set in the source, so the
 * Web Serial spec default of "none" is used for both, written out
 * explicitly rather than left implicit.
 */
export const DEFAULT_SERIAL_OPTIONS: SerialOptions = {
  baudRate: 115_200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
};

/**
 * Default read timeout for the version query (source:
 * main_serial_section.txt `send-com-data` handler: `setTimeout(..., i ?? 2e3)`;
 * the version query (`ge()` in protocol_section.js) calls its send helper
 * without a timeout override, so 2000ms is GTool's real default for this
 * exact command — not the 25s timeout used for MCU_MAIN data packets).
 */
export const DEFAULT_QUERY_TIMEOUT_MS = 2_000;

/**
 * Byte mode used for the outgoing query. protocol_notes.md: "Public
 * instructions for this updater family normally specify 13-byte mode."
 * GTool itself does not auto-detect the mode — it relies on a user-set
 * checkbox — so no automatic 13/18 negotiation is implemented here either;
 * this is simply the documented default.
 */
const DEFAULT_QUERY_MODE: ByteMode = 13;

export interface ConnectResult {
  readonly port: SerialPortSummary;
}

/**
 * Real, read-only Web Serial connection for Phase 2A device identification.
 *
 * By construction, not only by flag check, this class cannot send firmware:
 * the only method able to write to the port is `queryDeviceIdentity()`,
 * which always writes exactly `buildVersionQueryCommand(...)` — the single
 * recovered harmless query — and nothing else. There is no generic
 * send/write method, so no caller can route arbitrary bytes (an
 * initialization command or an FE EF data packet) through this class.
 */
export class ReadOnlyDeviceConnection {
  private port: SerialPort | null = null;
  private connecting = false;
  private querying = false;
  private readonly mode: ByteMode;

  private readonly handleDisconnect = (event: Event): void => {
    if (event.target === this.port) {
      this.port = null;
    }
  };

  constructor(options: { mode?: ByteMode } = {}) {
    this.mode = options.mode ?? DEFAULT_QUERY_MODE;
  }

  isConnected(): boolean {
    return this.port !== null;
  }

  /**
   * `onPortSelected` fires right after the browser's port-selection dialog
   * resolves and before `port.open()` starts, purely so a caller (the UI
   * hook) can distinguish the "Choose your device" phase from the brief
   * "Connecting" phase that follows it.
   */
  async connect(
    serialOptions: Partial<SerialOptions> = {},
    onPortSelected?: () => void,
  ): Promise<ConnectResult> {
    if (!isReadOnlyDeviceConnectionEnabled()) {
      throw new ReadOnlyConnectionDisabledError();
    }
    if (!isWebSerialSupported() || !navigator.serial) {
      throw new WebSerialUnsupportedError();
    }
    if (this.connecting || this.port) {
      throw new ConnectionInProgressError();
    }

    this.connecting = true;
    try {
      const serial = navigator.serial;
      let port: SerialPort;
      try {
        // No usbVendorId/usbProductId filter: protocol_notes.md lists
        // "Obtain USB VID/PID and descriptors" as an unresolved item, so we
        // let the user pick from every available port rather than guessing one.
        port = await serial.requestPort();
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
          throw new PortSelectionCancelledError();
        }
        throw error;
      }
      onPortSelected?.();

      await port.open({ ...DEFAULT_SERIAL_OPTIONS, ...serialOptions });
      port.addEventListener("disconnect", this.handleDisconnect);
      this.port = port;
      return { port: summarizePort(port) };
    } finally {
      this.connecting = false;
    }
  }

  /** Sends only the recovered version-query command and interprets the reply. Never sends anything else. */
  async queryDeviceIdentity(timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS): Promise<DeviceIdentityResult> {
    if (!isReadOnlyDeviceConnectionEnabled()) {
      throw new ReadOnlyConnectionDisabledError();
    }
    const port = this.port;
    if (!port) {
      throw new NotConnectedError();
    }
    if (this.querying) {
      throw new ConnectionInProgressError();
    }
    if (!port.readable || !port.writable) {
      this.port = null;
      throw new DeviceDisconnectedError();
    }

    this.querying = true;
    try {
      const command = buildVersionQueryCommand(this.mode, "primary");

      const writer = port.writable.getWriter();
      try {
        await writer.write(command);
      } finally {
        writer.releaseLock();
      }

      const reader = port.readable.getReader();
      // ReadTimeoutError / MalformedFramingError / DeviceDisconnectedError
      // from readBoundedReply propagate to the caller as-is: each already
      // carries the exact evidence (raw bytes, or nothing for a disconnect)
      // needed to explain what happened, so there's nothing useful to add
      // by catching and rewrapping them here. A reply that completes a
      // recognized 13/18-byte frame is always returned (never thrown), even
      // with an invalid checksum ("unknown_serial_device") — that is a
      // genuine, if inconclusive, read outcome, not an operational failure.
      try {
        const { raw } = await readBoundedReply(reader, timeoutMs);
        return interpretCompleteReply(raw, summarizePort(port));
      } catch (error) {
        if (error instanceof DeviceDisconnectedError) {
          this.port = null;
        }
        throw error;
      }
    } finally {
      this.querying = false;
    }
  }

  async disconnect(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (!port) return;
    port.removeEventListener("disconnect", this.handleDisconnect);
    try {
      await port.close();
    } catch {
      // Best-effort: the port may already be gone if the device was unplugged.
    }
  }
}

function summarizePort(port: SerialPort): SerialPortSummary {
  const info = port.getInfo();
  return {
    usbVendorId: info.usbVendorId ?? null,
    usbProductId: info.usbProductId ?? null,
  };
}
