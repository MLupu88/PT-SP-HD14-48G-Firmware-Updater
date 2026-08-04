import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeMcuMainFirmwareFile,
  makeSyntheticFirmwareBytes,
  REFERENCE_FINAL_PACKET_INDEX,
  REFERENCE_FINAL_PACKET_PADDING,
  REFERENCE_FIRMWARE_LENGTH,
  REFERENCE_TOTAL_PACKETS,
} from "../../../test/fixtures";
import { additiveChecksum } from "../../gtool/checksum";
import { PAYLOAD_BLOCK_SIZE } from "../../gtool/constants";
import { classifyRecovery, UpdateEngine } from "../../update-engine";
import { WebSerialTransport } from "../WebSerialTransport";
import { installMockSerial, MockSerialPort, uninstallMockSerial } from "./mockWebSerial";

/**
 * End-to-end coverage of the real firmware-writing path — `UpdateEngine`
 * driving the real `WebSerialTransport` against a scripted, deterministic
 * mock of the Web Serial API (never a physical device; never the
 * simulator). This is the closest thing in this repository to "actually
 * flashing a PT-SP-HD14-48G" — it proves the exact sequence of bytes
 * documented in docs/gtool-analysis/packet_reference_output.txt travels
 * correctly through the real transport, not just through the pure
 * protocol-library functions in isolation.
 */

function statusReply(statusByte: number): Uint8Array {
  const frame = new Uint8Array(13);
  frame[4] = statusByte;
  frame[12] = additiveChecksum(frame.subarray(0, 12), 13);
  return frame;
}

function isDataFrame(chunk: Uint8Array): boolean {
  return chunk.length > 4 && chunk[0] === 0xfe && chunk[1] === 0xef;
}

function packetIndexOf(chunk: Uint8Array): number {
  return (((chunk[2] ?? 0) & 0x7f) << 8) | (chunk[3] ?? 0);
}

function makeEngine(transport: WebSerialTransport, overrides: Partial<ConstructorParameters<typeof UpdateEngine>[0]> = {}) {
  return new UpdateEngine({
    transport,
    maxRetriesPerPacket: 3,
    responseTimeoutMs: 200,
    retryDelayMs: 0,
    initCommandGapMs: 0,
    postFinalPacketDelayMs: 0,
    postCompleteSettleDelayMs: 0,
    wait: () => Promise.resolve(),
    now: () => 0,
    ...overrides,
  });
}

beforeEach(() => {
  installMockSerial();
  vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
  vi.stubEnv("VITE_ENABLE_REAL_FLASHING", "true");
  vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", "true");
});

afterEach(() => {
  uninstallMockSerial();
  vi.unstubAllEnvs();
});

describe("full documented 110-packet transfer", () => {
  it("writes exact init bytes, all 110 packets in order, and the post-update query — completing verified", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: () => port.emit(statusReply(0)),
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });

    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport);

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(REFERENCE_FIRMWARE_LENGTH)));
    await engine.validate();
    expect(engine.getState()).toBe("ready");

    await engine.start();

    expect(engine.getState()).toBe("completed");
    expect(engine.getProgress()?.percent).toBe(100);

    // Exact ordered list of writes: 2 init commands, 110 data packets, 1 post-update version query.
    expect(port.writtenChunks).toHaveLength(2 + REFERENCE_TOTAL_PACKETS + 1);

    expect(Array.from(port.writtenChunks[0]!)).toEqual(
      Array.from(Uint8Array.of(0xa5, 0x5b, 0x08, 0x07, 0, 0, 0, 0, 0, 0, 0, 0, 0xf1)),
    );
    expect(Array.from(port.writtenChunks[1]!)).toEqual(
      Array.from(Uint8Array.of(0xa5, 0x5b, 0x08, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0xf0)),
    );

    const dataFrames = port.writtenChunks.slice(2, 2 + REFERENCE_TOTAL_PACKETS);
    expect(dataFrames).toHaveLength(REFERENCE_TOTAL_PACKETS);

    // No skipped packet, no duplicated accepted packet: indexes are exactly 0..109 in order.
    const indexes = dataFrames.map(packetIndexOf);
    expect(indexes).toEqual(Array.from({ length: REFERENCE_TOTAL_PACKETS }, (_, i) => i));

    expect(Array.from(dataFrames[0]!.subarray(0, 4))).toEqual([0xfe, 0xef, 0x00, 0x00]);
    const lastFrame = dataFrames[REFERENCE_TOTAL_PACKETS - 1]!;
    expect(Array.from(lastFrame.subarray(0, 4))).toEqual([0xfe, 0xef, 0x80, 0x6d]);
    expect(REFERENCE_FINAL_PACKET_INDEX).toBe(109);

    // FF padding on the final packet's payload, after the real bytes.
    const lastPayload = lastFrame.subarray(4, 4 + PAYLOAD_BLOCK_SIZE);
    const padding = lastPayload.subarray(PAYLOAD_BLOCK_SIZE - REFERENCE_FINAL_PACKET_PADDING);
    expect(Array.from(padding).every((byte) => byte === 0xff)).toBe(true);

    // The 113th and final write is the best-effort post-update version query, not a data frame.
    const lastWrite = port.writtenChunks[port.writtenChunks.length - 1]!;
    expect(isDataFrame(lastWrite)).toBe(false);
    expect(Array.from(lastWrite.subarray(0, 4))).toEqual([0xa5, 0x5b, 0x01, 0x13]);

    const events = engine.getEventLog();
    const completedEvent = events.find((e) => e.type === "completed");
    expect(completedEvent).toMatchObject({ type: "completed", verified: true });
  });

  it("uses the recovered ~2 second gap between the start and confirm init commands by default", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({ onWrite: () => port.emit(statusReply(0)) });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    const waited: number[] = [];
    const engine = makeEngine(transport, {
      wait: (ms) => {
        waited.push(ms);
        return Promise.resolve();
      },
      initCommandGapMs: undefined, // fall through to the engine's own recovered default
    });

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE)));
    await engine.validate();
    await engine.start();

    expect(waited[0]).toBe(2000);
  });
});

describe("packet-level protocol behavior over the real transport", () => {
  it("retransmits exactly the same packet once when the device requests a resend, then continues", async () => {
    const RESEND_INDEX = 1;
    let resent = false;
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (isDataFrame(chunk) && packetIndexOf(chunk) === RESEND_INDEX && !resent) {
          resent = true;
          port.emit(statusReply(1)); // resend
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport);

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 3)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("completed");
    const dataWrites = port.writtenChunks.filter(isDataFrame);
    const forResendIndex = dataWrites.filter((c) => packetIndexOf(c) === RESEND_INDEX);
    expect(forResendIndex).toHaveLength(2); // sent, resent, nothing more
    expect(forResendIndex[0]).toEqual(forResendIndex[1]); // exactly the same packet bytes both times
  });

  it("fails with a retry-limit error once resends exceed the configured limit, and sends no further packets", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({ onWrite: () => port.emit(statusReply(1)) }); // always resend
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport, { maxRetriesPerPacket: 2 });

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 3)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("failed");
    const failedEvent = engine.getEventLog().find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "RETRY_LIMIT_EXCEEDED" });
    const dataWrites = port.writtenChunks.filter(isDataFrame);
    // Only packet 0 was ever attempted, exactly maxRetriesPerPacket times.
    expect(dataWrites).toHaveLength(2);
    expect(dataWrites.every((c) => packetIndexOf(c) === 0)).toBe(true);
  });

  it("stops immediately (no retry) on a protocol rejection (status 2), and sends no further packets", async () => {
    const REJECT_INDEX = 1;
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (isDataFrame(chunk) && packetIndexOf(chunk) === REJECT_INDEX) {
          port.emit(statusReply(2));
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport);

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 4)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("failed");
    const failedEvent = engine.getEventLog().find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "PACKET_REJECTED" });
    const dataWrites = port.writtenChunks.filter(isDataFrame);
    expect(dataWrites.map(packetIndexOf)).toEqual([0, 1]); // never reached packet 2 or 3
  });

  it("fails with a timeout code when the device goes silent on a packet, after exhausting retries", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({ onWrite: () => undefined }); // never replies
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport, { maxRetriesPerPacket: 1, responseTimeoutMs: 20 });

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("failed");
    const failedEvent = engine.getEventLog().find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "READ_TIMEOUT" });
  });

  it("fails with a disconnect code when the device disconnects mid-packet, and sends no packet afterward", async () => {
    const DISCONNECT_INDEX = 1;
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (isDataFrame(chunk) && packetIndexOf(chunk) === DISCONNECT_INDEX) {
          port.simulateDisconnect();
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport, { maxRetriesPerPacket: 1 });

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 4)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("failed");
    const failedEvent = engine.getEventLog().find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "DEVICE_DISCONNECTED" });
    expect(transport.isConnected()).toBe(false);
    const dataWrites = port.writtenChunks.filter(isDataFrame);
    expect(dataWrites.map(packetIndexOf)).toEqual([0, 1]); // never reached packet 2 or 3
  });

  it("completes the transfer (final packet accepted) but reports unverified when the device disconnects during the post-update query", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (!isDataFrame(chunk) && chunk[2] === 0x01 && chunk[3] === 0x13) {
          // The post-update version query specifically.
          port.simulateDisconnect();
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport);

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE)));
    await engine.validate();
    await engine.start();

    // The transfer itself still succeeded — the final packet was accepted —
    // even though the device disconnected before verification could run.
    expect(engine.getState()).toBe("completed");
    const completedEvent = engine.getEventLog().find((e) => e.type === "completed");
    expect(completedEvent).toMatchObject({ type: "completed", verified: false });
  });

  it("completes the transfer but reports unverified — never a guessed version — when the post-update reply's checksum is invalid (I4)", async () => {
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (!isDataFrame(chunk) && chunk[2] === 0x01 && chunk[3] === 0x13) {
          // The post-update version query: a structurally valid 13-byte
          // reply, but with a deliberately corrupted checksum byte — a
          // real-world scenario (line noise, a different/unexpected device
          // replying) that must not be trusted as a confirmed version.
          const reply = statusReply(0);
          reply[4] = 9; // plausible-looking "major version" byte
          reply[12] = (reply[12]! + 1) & 0xff; // corrupt the checksum
          port.emit(reply);
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport);

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE)));
    await engine.validate();
    await engine.start();

    expect(engine.getState()).toBe("completed");
    const completedEvent = engine.getEventLog().find((e) => e.type === "completed");
    expect(completedEvent).toMatchObject({ type: "completed", verified: false });
    expect((completedEvent as { verifiedVersion?: string } | undefined)?.verifiedVersion).toBeUndefined();
  });

  it("stops on a malformed reply mid-transfer, sends no later packet, classifies conservatively, and leaves the transport clean (I5)", async () => {
    const MALFORMED_INDEX = 1;
    let port: MockSerialPort;
    port = new MockSerialPort({
      onWrite: (chunk) => {
        if (isDataFrame(chunk) && packetIndexOf(chunk) === MALFORMED_INDEX) {
          // Garbage that never resolves into a recognized 13/18-byte reply —
          // readBoundedReply keeps accumulating bytes until the total
          // exceeds the longest recognized length, then throws
          // MalformedFramingError (code MALFORMED_REPLY).
          port.emit(new Uint8Array(25).fill(0xff));
          return;
        }
        port.emit(statusReply(0));
      },
    });
    await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const engine = makeEngine(transport, { maxRetriesPerPacket: 2 });

    engine.loadFirmware(makeMcuMainFirmwareFile(makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 4)));
    await engine.validate();
    await engine.start();

    // The update stops.
    expect(engine.getState()).toBe("failed");
    const failedEvent = engine.getEventLog().find((e) => e.type === "failed");
    expect(failedEvent).toMatchObject({ code: "MALFORMED_REPLY" });

    // No later packet is written: packet 0 (accepted), then packet 1
    // (malformed, retried once up to the configured limit) — packets 2 and
    // 3 are never attempted.
    const dataWrites = port.writtenChunks.filter(isDataFrame);
    expect(dataWrites.map(packetIndexOf)).toEqual([0, 1, 1]);

    // Recovery state is conservative: at least one packet was accepted
    // before the failure and finalizing was never reached, so this must
    // classify as a partial transfer, never as safe-to-retry.
    expect(classifyRecovery(engine.getEventLog())).toBe("transfer_partially_completed");

    // Locks and connection are cleaned up appropriately: a malformed reply
    // is not itself a disconnect, so the port stays attached, but nothing is
    // left locked or busy — a subsequent exchange is not blocked.
    expect(transport.isConnected()).toBe(true);
    expect(port.readable?.locked ?? false).toBe(false);
    expect(port.writable?.locked ?? false).toBe(false);
    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 200 }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});
