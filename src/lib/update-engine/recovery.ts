import type { UpdateEvent } from "./types";

/**
 * Typed recovery outcomes for a finished (non-fully-verified-success) run,
 * derived only from the engine's own structured event log — no new
 * recovery command is invented here, only a classification of which of
 * these evidenced states the run ended in (see README "Recovery model").
 */
export type RecoveryOutcome =
  | "safe_to_retry"
  | "initialization_started_no_packet_accepted"
  | "transfer_partially_completed"
  | "completed_verification_failed"
  | "device_disconnected_or_rebooting"
  | "unknown";

/** Failure/transport-error codes that specifically indicate the device was disconnected or is rebooting. */
const DISCONNECT_CODES: ReadonlySet<string> = new Set(["DEVICE_DISCONNECTED"]);

function reachedState(events: readonly UpdateEvent[], state: string): boolean {
  return events.some((event) => event.type === "state_changed" && event.to === state);
}

function anyPacketAccepted(events: readonly UpdateEvent[]): boolean {
  return events.some((event) => event.type === "packet_accepted");
}

function anyDisconnectSignal(events: readonly UpdateEvent[]): boolean {
  return events.some(
    (event) =>
      (event.type === "transport_error" || event.type === "failed") && DISCONNECT_CODES.has(event.code),
  );
}

/**
 * Classifies the recovery state of a run that did not end in a fully
 * verified success. Callers should only invoke this for failed, cancelled,
 * or completed-but-unverified runs — a run that completed with
 * `verified: true` needs no recovery guidance at all.
 *
 * Only "Try again" should ever be offered automatically for
 * `"safe_to_retry"` (failure occurred before the first initialization
 * command could have had any effect); every other outcome calls for
 * conservative, plain-language guidance instead (see README "Recovery
 * model").
 */
export function classifyRecovery(events: readonly UpdateEvent[]): RecoveryOutcome {
  const completedEvent = events.find(
    (event): event is Extract<UpdateEvent, { type: "completed" }> => event.type === "completed",
  );
  if (completedEvent) {
    // The only reachable case here per this function's documented
    // precondition: `verified: true` runs shouldn't be passed in at all.
    return "completed_verification_failed";
  }

  if (anyDisconnectSignal(events)) {
    return "device_disconnected_or_rebooting";
  }

  if (!reachedState(events, "initializing")) {
    return "safe_to_retry";
  }

  if (!anyPacketAccepted(events)) {
    return "initialization_started_no_packet_accepted";
  }

  if (reachedState(events, "finalizing")) {
    // Every packet was accepted and finalizing began, yet no "completed"
    // event exists — verifyBestEffort() never throws, so this should be
    // unreachable in practice. Defensive fallback rather than a guess.
    return "unknown";
  }

  return "transfer_partially_completed";
}
