import { describe, expect, it } from "vitest";
import { classifyRecovery } from "../recovery";
import type { UpdateEvent, UpdateState } from "../types";

function stateChanged(from: UpdateState, to: UpdateState): UpdateEvent {
  return { type: "state_changed", from, to, timestamp: 0 };
}

function packetAccepted(packetIndex: number): UpdateEvent {
  return { type: "packet_accepted", packetIndex, totalPackets: 10, timestamp: 0 };
}

function failed(code: string): UpdateEvent {
  return { type: "failed", code, message: "x", timestamp: 0 };
}

function transportError(code: string): UpdateEvent {
  return { type: "transport_error", code, message: "x", timestamp: 0 };
}

function completed(verified: boolean): UpdateEvent {
  return { type: "completed", timestamp: 0, verified };
}

describe("classifyRecovery", () => {
  it("returns safe_to_retry when initialization was never reached", () => {
    const events: UpdateEvent[] = [stateChanged("ready", "validating"), failed("TRANSPORT_FAILURE")];
    expect(classifyRecovery(events)).toBe("safe_to_retry");
  });

  it("returns safe_to_retry when the connect() step itself failed before initializing", () => {
    const events: UpdateEvent[] = [failed("PORT_SELECTION_CANCELLED")];
    expect(classifyRecovery(events)).toBe("safe_to_retry");
  });

  it("returns initialization_started_no_packet_accepted when init began but no packet was ever accepted", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("initializing", "transferring"),
      failed("TRANSPORT_FAILURE"),
    ];
    expect(classifyRecovery(events)).toBe("initialization_started_no_packet_accepted");
  });

  it("returns transfer_partially_completed when some packets were accepted before failure", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("initializing", "transferring"),
      packetAccepted(0),
      packetAccepted(1),
      failed("PACKET_REJECTED"),
    ];
    expect(classifyRecovery(events)).toBe("transfer_partially_completed");
  });

  it("returns device_disconnected_or_rebooting when a DEVICE_DISCONNECTED failure code is present, regardless of progress", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("initializing", "transferring"),
      packetAccepted(0),
      transportError("DEVICE_DISCONNECTED"),
      failed("DEVICE_DISCONNECTED"),
    ];
    expect(classifyRecovery(events)).toBe("device_disconnected_or_rebooting");
  });

  it("returns device_disconnected_or_rebooting even when no packet was ever accepted", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      failed("DEVICE_DISCONNECTED"),
    ];
    expect(classifyRecovery(events)).toBe("device_disconnected_or_rebooting");
  });

  it("returns completed_verification_failed for a completed-but-unverified run", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("finalizing", "verifying"),
      completed(false),
    ];
    expect(classifyRecovery(events)).toBe("completed_verification_failed");
  });

  it("returns unknown when finalizing was reached but no completed event exists (defensive fallback)", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("initializing", "transferring"),
      packetAccepted(0),
      stateChanged("transferring", "finalizing"),
    ];
    expect(classifyRecovery(events)).toBe("unknown");
  });

  it("classifies a cancellation the same as any other terminal event, using state/progress evidence", () => {
    const events: UpdateEvent[] = [
      stateChanged("ready", "initializing"),
      stateChanged("initializing", "transferring"),
      { type: "cancelled", timestamp: 0 },
    ];
    expect(classifyRecovery(events)).toBe("initialization_started_no_packet_accepted");
  });
});
