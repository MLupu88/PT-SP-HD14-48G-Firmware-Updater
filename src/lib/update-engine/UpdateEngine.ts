import {
  MAX_SEND_ATTEMPTS,
  MCU_MAIN_MODULE,
  POST_COMPLETE_SETTLE_DELAY_MS,
  POST_FINAL_PACKET_DELAY_MS,
  RETRY_DELAY_MS,
} from "../gtool/constants";
import {
  buildDataPacket,
  buildMcuMainConfirmCommand,
  buildMcuMainStartCommand,
  buildVersionQueryCommand,
  packetProgressPercent,
  parseReply,
  parseVersionReply,
  validateMcuMainFirmware,
} from "../gtool";
import type { ByteMode, FirmwareFile, PacketPlan } from "../gtool/types";
import {
  InvalidStateTransitionError,
  ParallelUpdateError,
  ProtocolRejectionError,
  RetryLimitExceededError,
  TransportError,
} from "./errors";
import type { UpdateTransport } from "./transport";
import type { UpdateEvent, UpdateEventListener, UpdateProgress, UpdateState } from "./types";

/** Internal signal used to unwind out of a packet retry loop when `cancel()` is called mid-wait. */
class CancellationSignal extends Error {}

/**
 * Reads a duck-typed `.code` off a thrown error (e.g. from
 * `WebSerialTransport`'s error classes — see `readOnlyErrors.ts` /
 * `transportErrors.ts`) without importing any webserial-specific class here,
 * keeping this engine framework-independent. Falls back to a generic code
 * when the thrown value carries none (e.g. a plain `Error` from the
 * simulator), preserving prior behavior exactly for existing callers.
 */
function errorCodeOf(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return fallback;
}

const ALLOWED_TRANSITIONS: Record<UpdateState, readonly UpdateState[]> = {
  idle: ["firmware_loaded"],
  firmware_loaded: ["validating", "idle"],
  validating: ["ready", "failed"],
  ready: ["initializing", "firmware_loaded", "idle"],
  initializing: ["transferring", "failed", "cancelled"],
  transferring: ["retrying", "finalizing", "failed", "cancelled"],
  retrying: ["transferring", "failed", "cancelled"],
  finalizing: ["verifying", "failed"],
  verifying: ["completed", "failed"],
  completed: ["idle", "firmware_loaded"],
  failed: ["idle", "firmware_loaded"],
  cancelled: ["idle", "firmware_loaded"],
};

const RUNNING_STATES: readonly UpdateState[] = [
  "validating",
  "initializing",
  "transferring",
  "retrying",
  "finalizing",
  "verifying",
];

export interface UpdateEngineOptions {
  readonly transport: UpdateTransport;
  readonly mode?: ByteMode;
  /** Per-packet retry budget shared by transport errors and device "resend" replies. */
  readonly maxRetriesPerPacket?: number;
  readonly responseTimeoutMs?: number;
  readonly retryDelayMs?: number;
  /** Delay between the start and confirm init commands (doc: "waits about two seconds"). */
  readonly initCommandGapMs?: number;
  readonly postFinalPacketDelayMs?: number;
  readonly postCompleteSettleDelayMs?: number;
  /** Injectable delay function, overridable in tests for determinism/speed. */
  readonly wait?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Framework-independent MCU_MAIN firmware update state machine. Speaks to
 * hardware only through the injected `UpdateTransport`, so the same engine
 * drives both the deterministic simulator and (in a later phase) a real Web
 * Serial transport.
 */
export class UpdateEngine {
  private readonly transport: UpdateTransport;
  private readonly mode: ByteMode;
  private readonly maxRetriesPerPacket: number;
  private readonly responseTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly initCommandGapMs: number;
  private readonly postFinalPacketDelayMs: number;
  private readonly postCompleteSettleDelayMs: number;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private state: UpdateState = "idle";
  private listeners = new Set<UpdateEventListener>();
  private eventLog: UpdateEvent[] = [];
  private readonly eventLogLimit = 1000;

  private firmwareFile: FirmwareFile | null = null;
  private plan: PacketPlan | null = null;
  private flag = 0;
  private currentPacketIndex = 0;
  private cancelRequested = false;
  /**
   * Set synchronously at the top of `start()`, before any `await`. `state`
   * alone can't guard against parallel `start()` calls: the first async gap
   * (e.g. `transport.connect()`) happens before the state leaves "ready", so
   * two back-to-back calls could both pass a state-only check.
   */
  private updateInFlight = false;

  constructor(options: UpdateEngineOptions) {
    this.transport = options.transport;
    this.mode = options.mode ?? 13;
    this.maxRetriesPerPacket = options.maxRetriesPerPacket ?? MAX_SEND_ATTEMPTS;
    this.responseTimeoutMs = options.responseTimeoutMs ?? MCU_MAIN_MODULE.responseTimeoutMs;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
    this.initCommandGapMs = options.initCommandGapMs ?? 2000;
    this.postFinalPacketDelayMs = options.postFinalPacketDelayMs ?? POST_FINAL_PACKET_DELAY_MS;
    this.postCompleteSettleDelayMs =
      options.postCompleteSettleDelayMs ?? POST_COMPLETE_SETTLE_DELAY_MS;
    this.wait = options.wait ?? defaultWait;
    this.now = options.now ?? (() => Date.now());
  }

  getState(): UpdateState {
    return this.state;
  }

  isRunning(): boolean {
    return this.updateInFlight || RUNNING_STATES.includes(this.state);
  }

  getProgress(): UpdateProgress | null {
    if (!this.plan) return null;
    return {
      currentPacketIndex: this.currentPacketIndex,
      totalPackets: this.plan.totalPackets,
      percent:
        this.state === "completed"
          ? 100
          : packetProgressPercent(Math.max(this.currentPacketIndex - 1, -1), this.plan),
    };
  }

  getEventLog(): readonly UpdateEvent[] {
    return this.eventLog;
  }

  onEvent(listener: UpdateEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads a firmware file. Does not validate it — call `validate()` next. */
  loadFirmware(file: FirmwareFile): void {
    if (this.isRunning()) {
      throw new ParallelUpdateError();
    }
    this.firmwareFile = file;
    this.plan = null;
    this.flag = 0;
    this.currentPacketIndex = 0;
    this.transition("firmware_loaded");
    this.log("info", `Firmware loaded: ${file.name} (${file.bytes.length} bytes).`);
  }

  /**
   * Validates the loaded firmware. This is the only path to the "ready"
   * state, so `start()` can never be reached without it.
   */
  async validate(): Promise<void> {
    this.transition("validating");
    if (!this.firmwareFile) {
      // Unreachable via the public API (loadFirmware always sets firmwareFile
      // before allowing this transition), guarded for robustness only.
      this.fail("NO_FIRMWARE", "No firmware file is loaded.");
      return;
    }
    try {
      const result = validateMcuMainFirmware(this.firmwareFile);
      this.plan = result.plan;
      this.flag = result.flag;
      this.log(
        "info",
        `Validation passed: ${result.plan.totalPackets} packets, flag 0x${result.flag
          .toString(16)
          .padStart(2, "0")}.`,
      );
      this.transition("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.fail("VALIDATION_FAILED", message);
    }
  }

  /** Cancels the update. Takes effect between packets/attempts, not mid-flight. */
  cancel(): void {
    if (!this.isRunning()) return;
    this.cancelRequested = true;
    this.log("info", "Cancellation requested.");
  }

  /** Resets a finished engine (completed/failed/cancelled) back to idle. */
  reset(): void {
    this.transition("idle");
    this.firmwareFile = null;
    this.plan = null;
    this.flag = 0;
    this.currentPacketIndex = 0;
    this.cancelRequested = false;
    this.updateInFlight = false;
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      throw new ParallelUpdateError();
    }
    if (this.state !== "ready" || !this.plan || !this.firmwareFile) {
      throw new InvalidStateTransitionError(this.state, "initializing");
    }

    this.cancelRequested = false;
    this.updateInFlight = true;
    const plan = this.plan;
    const firmware = this.firmwareFile.bytes;

    try {
      if (!this.transport.isConnected()) {
        await this.transport.connect();
      }

      this.transition("initializing");
      this.log("info", "Sending update initialization commands.");
      await this.sendCommandWithRetries(buildMcuMainStartCommand(this.mode, this.flag));
      await this.wait(this.initCommandGapMs);
      await this.transport.sendAndReceive(buildMcuMainConfirmCommand(this.mode, this.flag), {
        timeoutMs: this.responseTimeoutMs,
      });

      this.transition("transferring");
      for (let packetIndex = 0; packetIndex < plan.totalPackets; packetIndex++) {
        this.currentPacketIndex = packetIndex;
        if (this.cancelRequested) {
          this.transition("cancelled");
          this.emit({ type: "cancelled", timestamp: this.now() });
          return;
        }
        await this.sendPacketWithRetries(firmware, packetIndex, plan);
        this.emit({
          type: "progress",
          progress: {
            currentPacketIndex: packetIndex,
            totalPackets: plan.totalPackets,
            percent: packetProgressPercent(packetIndex, plan),
          },
          timestamp: this.now(),
        });
        if (this.cancelRequested) {
          this.transition("cancelled");
          this.emit({ type: "cancelled", timestamp: this.now() });
          return;
        }
      }

      this.transition("finalizing");
      this.log("info", "Firmware transfer complete. Finalizing.");
      await this.wait(this.postFinalPacketDelayMs);
      await this.wait(this.postCompleteSettleDelayMs);

      this.transition("verifying");
      const verification = await this.verifyBestEffort();

      this.transition("completed");
      this.log(
        "info",
        verification.verified
          ? `Update completed successfully; installed version verified (${verification.version ?? "unknown"}).`
          : "Update completed; installed version could not be verified.",
      );
      this.emit({
        type: "completed",
        timestamp: this.now(),
        verified: verification.verified,
        verifiedVersion: verification.version,
      });
    } catch (error) {
      // `this.state` is widened explicitly here: TypeScript's control-flow
      // analysis otherwise keeps treating it as narrowed to "ready" from the
      // guard clause above the try block, even though the many `transition()`
      // calls inside it reassign `this.state` along the way.
      const stateAtCatch = this.state as UpdateState;
      if (error instanceof CancellationSignal) {
        if (stateAtCatch !== "cancelled") {
          this.transition("cancelled");
          this.emit({ type: "cancelled", timestamp: this.now() });
        }
        return;
      }
      if (stateAtCatch !== "failed" && stateAtCatch !== "cancelled") {
        const message = error instanceof Error ? error.message : String(error);
        this.fail(errorCodeOf(error, "UPDATE_FAILED"), message);
      }
    } finally {
      this.updateInFlight = false;
    }
  }

  // -- internals -----------------------------------------------------------

  private async sendCommandWithRetries(command: Uint8Array): Promise<Uint8Array> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetriesPerPacket; attempt++) {
      try {
        return await this.transport.sendAndReceive(command, {
          timeoutMs: this.responseTimeoutMs,
        });
      } catch (error) {
        lastError = error;
        this.log(
          "warn",
          `Init command attempt ${attempt}/${this.maxRetriesPerPacket} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async sendPacketWithRetries(
    firmware: Uint8Array,
    packetIndex: number,
    plan: PacketPlan,
  ): Promise<void> {
    const frame = buildDataPacket(firmware, packetIndex, plan, this.mode);

    for (let attempt = 1; attempt <= this.maxRetriesPerPacket; attempt++) {
      if (this.cancelRequested) {
        throw new CancellationSignal();
      }
      this.emit({
        type: "packet_sent",
        packetIndex,
        totalPackets: plan.totalPackets,
        attempt,
        timestamp: this.now(),
      });

      let rawReply: Uint8Array;
      try {
        rawReply = await this.transport.sendAndReceive(frame, {
          timeoutMs: this.responseTimeoutMs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = errorCodeOf(error, "TRANSPORT_FAILURE");
        if (attempt >= this.maxRetriesPerPacket) {
          this.emit({ type: "transport_error", code, message, timestamp: this.now() });
          this.fail(code, message);
          throw new TransportError(code, message);
        }
        await this.retryPacket(packetIndex, attempt, `Transport error: ${message}`);
        continue;
      }

      let reply;
      try {
        reply = parseReply(rawReply);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.emit({ type: "protocol_rejected", code: "UNPARSEABLE_REPLY", message, timestamp: this.now() });
        this.fail("UNPARSEABLE_REPLY", message);
        throw new ProtocolRejectionError("UNPARSEABLE_REPLY", message);
      }

      if (!reply.checksumValid) {
        // GTool's own decompiled reply handler does not verify the reply's
        // checksum before reading the status byte (protocol_section.js
        // `St`/`De`/`Ee`), so this is surfaced as a diagnostic warning
        // rather than a fatal error, to stay faithful to the recovered
        // behavior.
        this.log("warn", `Reply checksum mismatch for packet ${packetIndex} (continuing per recovered GTool behavior).`);
      }

      if (reply.status === "accepted") {
        this.emit({
          type: "packet_accepted",
          packetIndex,
          totalPackets: plan.totalPackets,
          timestamp: this.now(),
        });
        return;
      }

      if (reply.status === "resend") {
        if (attempt >= this.maxRetriesPerPacket) {
          const message = `Device requested resend of packet ${packetIndex} beyond the retry limit.`;
          this.fail("RETRY_LIMIT_EXCEEDED", message);
          throw new RetryLimitExceededError(packetIndex, this.maxRetriesPerPacket);
        }
        await this.retryPacket(packetIndex, attempt, "Device requested resend.");
        continue;
      }

      // status === "failed" or "unknown": doc says both fail the update, no retry.
      const message = `Device rejected packet ${packetIndex} (status byte ${reply.statusByte}).`;
      this.emit({ type: "protocol_rejected", code: "PACKET_REJECTED", message, timestamp: this.now() });
      this.fail("PACKET_REJECTED", message);
      throw new ProtocolRejectionError("PACKET_REJECTED", message);
    }
  }

  private async retryPacket(packetIndex: number, attempt: number, reason: string): Promise<void> {
    this.transition("retrying");
    this.emit({
      type: "packet_retry",
      packetIndex,
      attempt,
      retryLimit: this.maxRetriesPerPacket,
      reason,
      timestamp: this.now(),
    });
    await this.wait(this.retryDelayMs);
    this.transition("transferring");
  }

  /**
   * Best-effort post-update version query. Never throws: a failure here
   * means "transfer completed, verification unavailable" — a distinct,
   * honestly-labeled outcome from a real failure — not a fatal error (see
   * README "Recovery model" and "Do not declare success merely because the
   * last packet was written" in the Phase 2B spec, which this satisfies by
   * making that distinction explicit in the returned `verified` flag rather
   * than collapsing both into a single "completed").
   *
   * `verified: true` requires more than "a reply of plausible length
   * arrived" — it requires the reply to actually be trustworthy: correctly
   * framed (13/18 bytes, mirroring `readBoundedReply`'s own completion
   * check) AND checksum-valid, exactly like `interpretCompleteReply` already
   * requires for the pre-update identity check in
   * `src/lib/webserial/deviceIdentity.ts`. A reply that parses structurally
   * but fails its checksum is not proof of anything and must not be
   * presented as a confirmed installed version — it is reported as
   * unverified, same as a timeout or disconnect.
   */
  private async verifyBestEffort(): Promise<{ verified: boolean; version?: string }> {
    let raw: Uint8Array;
    try {
      const command = buildVersionQueryCommand(this.mode, "primary");
      raw = await this.transport.sendAndReceive(command, { timeoutMs: this.responseTimeoutMs });
    } catch (error) {
      // Mirrors GTool: the version re-query after upgrade runs best-effort
      // and does not gate the "Upgrade successfully" outcome.
      const message = error instanceof Error ? error.message : String(error);
      this.log("warn", `Post-update version query failed (non-fatal): ${message}`);
      return { verified: false };
    }

    let reply;
    try {
      reply = parseReply(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("warn", `Post-update version reply was malformed (non-fatal): ${message}`);
      return { verified: false };
    }

    if (!reply.checksumValid) {
      this.log(
        "warn",
        "Post-update version reply failed checksum verification (non-fatal): treated as unverified, not trusted.",
      );
      return { verified: false };
    }

    const version = parseVersionReply(raw, "full");
    this.log("info", `Post-update version query: ${version.versionString}.`);
    return { verified: true, version: version.versionString };
  }

  private fail(code: string, message: string): void {
    if (this.state === "failed" || this.state === "cancelled" || this.state === "completed") return;
    this.transition("failed");
    this.emit({ type: "failed", code, message, timestamp: this.now() });
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    this.emit({ type: "log", level, message, timestamp: this.now() });
  }

  private transition(to: UpdateState): void {
    const from = this.state;
    if (from === to) return;
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(from, to);
    }
    this.state = to;
    this.emit({ type: "state_changed", from, to, timestamp: this.now() });
  }

  private emit(event: UpdateEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.eventLogLimit) {
      this.eventLog.shift();
    }
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
