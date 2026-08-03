import { beforeEach, describe, expect, it } from "vitest";
import { makeMcuMainFirmwareFile, makeSyntheticFirmwareBytes } from "../../../test/fixtures";
import { PAYLOAD_BLOCK_SIZE } from "../../gtool/constants";
import { SimulatorTransport } from "../../simulator";
import { ParallelUpdateError } from "../errors";
import { UpdateEngine } from "../UpdateEngine";
import type { UpdateEvent } from "../types";

// 3 packets' worth of firmware keeps tests fast while still exercising the
// multi-packet loop. Delays are all zeroed via `wait` so tests run instantly
// regardless of GTool's real-world timing constants.
const SMALL_FIRMWARE_LENGTH = PAYLOAD_BLOCK_SIZE * 2 + 100;

function makeEngine(transport: SimulatorTransport, overrides: Partial<ConstructorParameters<typeof UpdateEngine>[0]> = {}) {
  return new UpdateEngine({
    transport,
    maxRetriesPerPacket: 3,
    responseTimeoutMs: 50,
    retryDelayMs: 0,
    initCommandGapMs: 0,
    postFinalPacketDelayMs: 0,
    postCompleteSettleDelayMs: 0,
    wait: () => Promise.resolve(),
    now: () => 0,
    ...overrides,
  });
}

async function loadAndValidate(engine: UpdateEngine, length = SMALL_FIRMWARE_LENGTH) {
  engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(length)));
  await engine.validate();
  expect(engine.getState()).toBe("ready");
}

describe("UpdateEngine state machine", () => {
  let events: UpdateEvent[];

  beforeEach(() => {
    events = [];
  });

  it("never allows start() before validate()", async () => {
    const engine = makeEngine(new SimulatorTransport());
    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(SMALL_FIRMWARE_LENGTH)));
    await expect(engine.start()).rejects.toThrow();
    expect(engine.getState()).toBe("firmware_loaded");
  });

  it("completes a full update through the simulator on the happy path", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "success" } });
    const engine = makeEngine(transport);
    engine.onEvent((e) => events.push(e));
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("completed");
    expect(engine.getProgress()?.percent).toBe(100);
    const accepted = events.filter((e) => e.type === "packet_accepted");
    expect(accepted).toHaveLength(3); // ceil(2148/1024) = 3 packets
    expect(events.some((e) => e.type === "completed")).toBe(true);
  });

  it("retries a packet once when the device requests a resend, then succeeds", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "retry_once", packetIndex: 1 } });
    const engine = makeEngine(transport);
    engine.onEvent((e) => events.push(e));
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("completed");
    const retries = events.filter((e) => e.type === "packet_retry");
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({ packetIndex: 1, reason: expect.stringContaining("resend") });
    const sentForPacket1 = events.filter((e) => e.type === "packet_sent" && e.packetIndex === 1);
    expect(sentForPacket1).toHaveLength(2);
  });

  it("fails immediately (no retry) when the device reports a protocol failure", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "protocol_failure", packetIndex: 1 } });
    const engine = makeEngine(transport);
    engine.onEvent((e) => events.push(e));
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("failed");
    const rejected = events.find((e) => e.type === "protocol_rejected");
    expect(rejected).toMatchObject({ code: "PACKET_REJECTED" });
    const sentForPacket1 = events.filter((e) => e.type === "packet_sent" && e.packetIndex === 1);
    expect(sentForPacket1).toHaveLength(1); // no retry after a hard failure
  });

  it("fails after exhausting the retry limit on a persistent transport timeout", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "timeout", packetIndex: 0 } });
    const engine = makeEngine(transport, { maxRetriesPerPacket: 2 });
    engine.onEvent((e) => events.push(e));
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("failed");
    const failedEvent = events.find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "TRANSPORT_FAILURE" });
    const transportErrors = events.filter((e) => e.type === "transport_error");
    expect(transportErrors).toHaveLength(1);
  });

  it("fails cleanly when the device disconnects mid-transfer", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "disconnect", packetIndex: 1 } });
    const engine = makeEngine(transport, { maxRetriesPerPacket: 1 });
    engine.onEvent((e) => events.push(e));
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("failed");
    expect(events.some((e) => e.type === "transport_error")).toBe(true);
  });

  it("supports cancellation between packets", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "success" } });
    const engine = makeEngine(transport);
    engine.onEvent((e) => {
      events.push(e);
      if (e.type === "packet_accepted" && e.packetIndex === 0) {
        engine.cancel();
      }
    });
    await loadAndValidate(engine);

    await engine.start();

    expect(engine.getState()).toBe("cancelled");
    const accepted = events.filter((e) => e.type === "packet_accepted");
    expect(accepted.length).toBeLessThan(3);
    expect(events.some((e) => e.type === "cancelled")).toBe(true);
  });

  it("prevents parallel updates on the same engine instance", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "success" } });
    const engine = makeEngine(transport);
    await loadAndValidate(engine);

    const firstRun = engine.start();
    // start() is async, so even a synchronous guard failure surfaces as a
    // rejected promise rather than a thrown exception at the call site.
    await expect(engine.start()).rejects.toThrow(ParallelUpdateError);
    await firstRun;

    expect(engine.getState()).toBe("completed");
  });

  it("enforces a configurable retry limit", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "timeout", packetIndex: 0 } });
    const engineTightLimit = makeEngine(transport, { maxRetriesPerPacket: 1 });
    const localEvents: UpdateEvent[] = [];
    engineTightLimit.onEvent((e) => localEvents.push(e));
    await loadAndValidate(engineTightLimit);

    await engineTightLimit.start();

    expect(engineTightLimit.getState()).toBe("failed");
    // With a retry limit of 1, there should be exactly one send attempt before failing.
    const sends = localEvents.filter((e) => e.type === "packet_sent");
    expect(sends).toHaveLength(1);
  });
});
