import { additiveChecksum } from "../gtool/checksum";
import type { ByteMode } from "../gtool/types";
import type { UpdateTransport } from "../update-engine/transport";

/**
 * Deterministic scenarios the simulator can play back. Each scenario acts
 * on a specific packet index so tests (and the demo UI) can pick exactly
 * when the interesting behavior happens, while every other packet is
 * accepted normally.
 */
export type SimulatorScenario =
  | { readonly kind: "success" }
  | { readonly kind: "retry_once"; readonly packetIndex: number }
  | { readonly kind: "protocol_failure"; readonly packetIndex: number }
  | { readonly kind: "timeout"; readonly packetIndex: number }
  | { readonly kind: "disconnect"; readonly packetIndex: number };

export interface SimulatorTransportOptions {
  readonly scenario?: SimulatorScenario;
  readonly mode?: ByteMode;
  /** Artificial per-reply delay, useful for a realistic-feeling demo UI. Defaults to 0 for fast tests. */
  readonly responseDelayMs?: number;
}

const DATA_FRAME_HEADER_BYTE_0 = 0xfe;
const DATA_FRAME_HEADER_BYTE_1 = 0xef;

/**
 * A fully offline simulated MCU_MAIN device. Never touches Web Serial or any
 * real transport; exists so the complete update workflow (including retry,
 * failure, timeout, and disconnect handling) can be exercised deterministically
 * in tests and demonstrated safely in the UI's demo mode.
 */
export class SimulatorTransport implements UpdateTransport {
  readonly label = "Simulator";

  private readonly scenario: SimulatorScenario;
  private readonly mode: ByteMode;
  private readonly responseDelayMs: number;
  private readonly retriedPacketIndexes = new Set<number>();
  private connected = false;
  private permanentlyDisconnected = false;

  constructor(options: SimulatorTransportOptions = {}) {
    this.scenario = options.scenario ?? { kind: "success" };
    this.mode = options.mode ?? 13;
    this.responseDelayMs = options.responseDelayMs ?? 0;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.permanentlyDisconnected) {
      throw new Error("Simulated device disconnect: cannot reconnect this session.");
    }
    await this.delay();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.delay();
    this.connected = false;
  }

  async sendAndReceive(data: Uint8Array, _options: { timeoutMs: number }): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error("Simulator transport is not connected.");
    }
    if (this.permanentlyDisconnected) {
      throw new Error("Simulated device disconnect: device is no longer reachable.");
    }

    const isDataFrame =
      data.length > 4 && data[0] === DATA_FRAME_HEADER_BYTE_0 && data[1] === DATA_FRAME_HEADER_BYTE_1;

    await this.delay();

    if (!isDataFrame) {
      return this.buildStatusReply(0);
    }

    const highByte = data[2] ?? 0;
    const lowByte = data[3] ?? 0;
    const packetIndex = ((highByte & 0x7f) << 8) | lowByte;

    switch (this.scenario.kind) {
      case "success":
        return this.buildStatusReply(0);

      case "retry_once": {
        if (packetIndex === this.scenario.packetIndex && !this.retriedPacketIndexes.has(packetIndex)) {
          this.retriedPacketIndexes.add(packetIndex);
          return this.buildStatusReply(1);
        }
        return this.buildStatusReply(0);
      }

      case "protocol_failure": {
        if (packetIndex === this.scenario.packetIndex) {
          return this.buildStatusReply(2);
        }
        return this.buildStatusReply(0);
      }

      case "timeout": {
        if (packetIndex === this.scenario.packetIndex) {
          throw new Error("Simulated response timeout: no reply received from device.");
        }
        return this.buildStatusReply(0);
      }

      case "disconnect": {
        if (packetIndex === this.scenario.packetIndex) {
          this.connected = false;
          this.permanentlyDisconnected = true;
          throw new Error("Simulated device disconnect: device stopped responding.");
        }
        return this.buildStatusReply(0);
      }
    }
  }

  private buildStatusReply(statusByte: number): Uint8Array {
    const frame = new Uint8Array(this.mode);
    frame[4] = statusByte;
    frame[this.mode - 1] = additiveChecksum(frame.subarray(0, this.mode - 1), this.mode);
    return frame;
  }

  private delay(): Promise<void> {
    if (this.responseDelayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
  }
}
