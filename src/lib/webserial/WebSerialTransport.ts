import type { UpdateTransport } from "../update-engine/transport";

export class RealFlashingDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealFlashingDisabledError";
  }
}

/**
 * Reads the build-time safety flag for display purposes (e.g. a footer
 * status line). This does NOT gate `WebSerialTransport`'s behavior below —
 * see the class comment for why.
 */
export function isRealFlashingFlagEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_REAL_FLASHING === "true";
}

/**
 * Typed Web Serial transport boundary: capability detection and the shape
 * future real-device code will fill in. This phase intentionally does not
 * implement or activate firmware transmission over a real serial port —
 * every method below is inert regardless of VITE_ENABLE_REAL_FLASHING,
 * because that flag is meant to gate a real implementation that does not
 * exist yet, not to be the only thing standing between this build and a
 * physical device. Harmless read-only diagnostics (e.g. a version query)
 * may be added in a later phase once the protocol has been validated
 * against real hardware (see docs/gtool-analysis "What is not yet proven").
 */
export class WebSerialTransport implements UpdateTransport {
  readonly label = "Real device (Web Serial)";
  private port: SerialPort | null = null;

  isConnected(): boolean {
    return this.port !== null;
  }

  connect(): Promise<void> {
    return Promise.reject(
      new RealFlashingDisabledError(
        "Connecting to a real device isn't available yet. Try the demo instead.",
      ),
    );
  }

  disconnect(): Promise<void> {
    this.port = null;
    return Promise.resolve();
  }

  sendAndReceive(): Promise<Uint8Array> {
    return Promise.reject(
      new RealFlashingDisabledError("Sending firmware to a real device is disabled in this build."),
    );
  }
}
