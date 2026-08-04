import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { additiveChecksum } from "../../gtool/checksum";
import {
  ConnectionInProgressError,
  DeviceDisconnectedError,
  MalformedFramingError,
  NotConnectedError,
  ReadTimeoutError,
} from "../readOnlyErrors";
import { PortChangeRejectedError, WriteTimeoutError } from "../transportErrors";
import { RealFlashingDisabledError, WebSerialTransport } from "../WebSerialTransport";
import { installMockSerial, MockSerial, MockSerialPort, uninstallMockSerial } from "./mockWebSerial";

function acceptedReply(mode: 13 | 18 = 13): Uint8Array {
  const frame = new Uint8Array(mode);
  frame[4] = 0;
  frame[mode - 1] = additiveChecksum(frame.subarray(0, mode - 1), mode);
  return frame;
}

/** attachPort() reuses an already-open port — MockSerialPort's streams only exist after open(). */
async function openedPort(
  options: ConstructorParameters<typeof MockSerialPort>[0] = {},
): Promise<MockSerialPort> {
  const port = new MockSerialPort(options);
  await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
  return port;
}

let mockSerial: MockSerial;

function enableAllFlags(): void {
  vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
  vi.stubEnv("VITE_ENABLE_REAL_FLASHING", "true");
  vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", "true");
}

beforeEach(() => {
  mockSerial = installMockSerial();
});

afterEach(() => {
  uninstallMockSerial();
  vi.unstubAllEnvs();
});

describe("WebSerialTransport (firmware-writing path) stays inert unless all three safety flags are true", () => {
  it("rejects connect() unconditionally", async () => {
    const transport = new WebSerialTransport();
    await expect(transport.connect()).rejects.toBeInstanceOf(RealFlashingDisabledError);
  });

  it("rejects sendAndReceive() unconditionally when the safety gate is closed", async () => {
    const transport = new WebSerialTransport();
    await expect(
      transport.sendAndReceive(new Uint8Array([0xfe, 0xef]), { timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(RealFlashingDisabledError);
  });

  it("rejects attachPort() unconditionally", () => {
    const transport = new WebSerialTransport();
    const port = new MockSerialPort();
    expect(() => transport.attachPort(port)).toThrow(RealFlashingDisabledError);
  });

  it("never reports itself as connected", () => {
    const transport = new WebSerialTransport();
    expect(transport.isConnected()).toBe(false);
    expect(transport.getPortInfo()).toBeNull();
  });

  it("stays inert with only two of the three flags true", async () => {
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
    vi.stubEnv("VITE_ENABLE_REAL_FLASHING", "true");
    vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", "false");
    const transport = new WebSerialTransport();
    await expect(transport.connect()).rejects.toBeInstanceOf(RealFlashingDisabledError);
  });
});

describe("connect()", () => {
  beforeEach(() => enableAllFlags());

  it("requests a port and opens it with the recovered serial configuration", async () => {
    const port = new MockSerialPort({ usbVendorId: 0x1a2b, usbProductId: 0x3c4d });
    mockSerial.provideNextPort(port);
    const transport = new WebSerialTransport();

    await transport.connect();

    expect(transport.isConnected()).toBe(true);
    expect(transport.getPortInfo()).toEqual({ usbVendorId: 0x1a2b, usbProductId: 0x3c4d });
    expect(port.lastOpenOptions?.baudRate).toBe(115_200);
    expect(port.lastOpenOptions?.dataBits).toBe(8);
    expect(port.lastOpenOptions?.stopBits).toBe(1);
    expect(port.lastOpenOptions?.parity).toBe("none");
    expect(port.lastOpenOptions?.flowControl).toBe("none");
  });

  it("invokes onPortSelected after the picker resolves and before open()", async () => {
    const port = new MockSerialPort();
    mockSerial.provideNextPort(port);
    const transport = new WebSerialTransport();
    const events: string[] = [];
    const originalOpen = port.open.bind(port);
    port.open = async (options) => {
      events.push("open");
      return originalOpen(options);
    };

    await transport.connect(() => events.push("selected"));

    expect(events).toEqual(["selected", "open"]);
  });

  it("rejects with PortSelectionCancelledError when the picker is dismissed", async () => {
    mockSerial.provideNextError(new DOMException("No port was selected.", "NotFoundError"));
    const transport = new WebSerialTransport();
    await expect(transport.connect()).rejects.toMatchObject({ code: "PORT_SELECTION_CANCELLED" });
    expect(transport.isConnected()).toBe(false);
  });

  it("prevents a second connect() while one is already in progress", async () => {
    const transport = new WebSerialTransport();
    const first = transport.connect(); // requestPort() left pending deliberately
    await expect(transport.connect()).rejects.toBeInstanceOf(ConnectionInProgressError);
    mockSerial.rejectPending(new DOMException("No port was selected.", "NotFoundError"));
    await expect(first).rejects.toMatchObject({ code: "PORT_SELECTION_CANCELLED" });
  });

  it("is a no-op when a port is already attached", async () => {
    const port = new MockSerialPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    await transport.connect();

    expect(mockSerial.requestPortCallCount).toBe(0);
    expect(transport.isConnected()).toBe(true);
  });
});

describe("attachPort()", () => {
  beforeEach(() => enableAllFlags());

  it("reuses an already-open port without requesting a new one", () => {
    const port = new MockSerialPort({ usbVendorId: 0x9, usbProductId: 0x10 });
    const transport = new WebSerialTransport();

    transport.attachPort(port);

    expect(transport.isConnected()).toBe(true);
    expect(transport.getPortInfo()).toEqual({ usbVendorId: 0x9, usbProductId: 0x10 });
    expect(mockSerial.requestPortCallCount).toBe(0);
  });

  it("rejects PortChangeRejectedError when a port is already attached", () => {
    const transport = new WebSerialTransport();
    transport.attachPort(new MockSerialPort());
    expect(() => transport.attachPort(new MockSerialPort())).toThrow(PortChangeRejectedError);
  });
});

describe("sendAndReceive()", () => {
  beforeEach(() => enableAllFlags());

  it("throws NotConnectedError when no port is attached", async () => {
    const transport = new WebSerialTransport();
    await expect(
      transport.sendAndReceive(new Uint8Array([1, 2, 3]), { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(NotConnectedError);
  });

  it("writes the exact given bytes exactly once and returns the exact reply", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const command = Uint8Array.of(0xa5, 0x5b, 0x08, 0x07, 0, 0, 0, 0, 0, 0, 0, 0, 0xf1);
    const reply = acceptedReply();
    setTimeout(() => port.emit(reply), 0);

    const result = await transport.sendAndReceive(command, { timeoutMs: 500 });

    expect(port.writtenChunks).toHaveLength(1);
    expect(port.writtenChunks[0]).toEqual(command);
    expect(result).toEqual(reply);
  });

  it("reassembles a reply that arrives across several chunks", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const reply = acceptedReply();
    setTimeout(() => {
      port.emit(reply.subarray(0, 4));
      port.emit(reply.subarray(4, 9));
      port.emit(reply.subarray(9, 13));
    }, 0);

    const result = await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 });
    expect(result).toEqual(reply);
  });

  it("supports an 18-byte reply", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const reply = acceptedReply(18);
    setTimeout(() => port.emit(reply), 0);

    const result = await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 });
    expect(result).toEqual(reply);
    expect(result).toHaveLength(18);
  });

  it("returns a reply even when its checksum is invalid — checksum interpretation is the caller's job, not the transport's, per recovered GTool behavior", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    const reply = acceptedReply();
    reply[12] = (reply[12]! + 1) & 0xff; // corrupt the checksum
    setTimeout(() => port.emit(reply), 0);

    const result = await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 });
    expect(result).toEqual(reply);
  });

  it("rejects with ReadTimeoutError (code READ_TIMEOUT) on silence", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 30 }),
    ).rejects.toMatchObject({ constructor: ReadTimeoutError, code: "READ_TIMEOUT" });
  });

  it("rejects with MalformedFramingError (code MALFORMED_REPLY) when bytes never resolve into a recognized length", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    setTimeout(() => port.emit(new Uint8Array(20)), 0);

    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 }),
    ).rejects.toMatchObject({ constructor: MalformedFramingError, code: "MALFORMED_REPLY" });
  });

  it("rejects with DeviceDisconnectedError and clears isConnected() on mid-read disconnect", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    setTimeout(() => port.simulateDisconnect(), 0);

    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 }),
    ).rejects.toMatchObject({ constructor: DeviceDisconnectedError, code: "DEVICE_DISCONNECTED" });
    expect(transport.isConnected()).toBe(false);
  });

  it("prevents a second sendAndReceive() while one is already in progress", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    const first = transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 });
    await expect(
      transport.sendAndReceive(new Uint8Array([2]), { timeoutMs: 500 }),
    ).rejects.toBeInstanceOf(ConnectionInProgressError);

    port.emit(acceptedReply());
    await first;
  });

  it("releases the reader and writer locks after a successful exchange", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);
    setTimeout(() => port.emit(acceptedReply()), 0);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 });

    expect(port.readable?.locked ?? false).toBe(false);
    expect(port.writable?.locked ?? false).toBe(false);
  });

  it("releases the reader lock after a timeout", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 30 }).catch(() => undefined);

    expect(port.readable?.locked ?? false).toBe(false);
  });
});

/**
 * C3 (pre-commit safety review): the reply half of an exchange was already
 * bounded by `readBoundedReply`, but `writer.ready`/`writer.write()` were
 * not. A wedged port could therefore hang an in-progress firmware transfer
 * forever, with the device sitting in its bootloader and no timeout, no
 * failure, and no way for the engine to recover. These cover the bound.
 */
describe("bounded write phase (C3)", () => {
  beforeEach(() => enableAllFlags());

  it("rejects with WriteTimeoutError (code WRITE_TIMEOUT) when the port accepts bytes but never completes the write", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    const error = await transport
      .sendAndReceive(new Uint8Array([1, 2, 3]), { timeoutMs: 10_000 })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WriteTimeoutError);
    expect((error as WriteTimeoutError).code).toBe("WRITE_TIMEOUT");
    expect((error as WriteTimeoutError).timeoutMs).toBe(30);
  });

  it("fails from the write bound rather than waiting for the much longer reply timeout", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    const startedAt = Date.now();
    await transport
      .sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 })
      .catch(() => undefined);

    // Comfortably under the 10s reply timeout: the write bound is what fired.
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("aborts the stream on a write timeout so the abandoned bytes can never reach the wire later", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 }).catch(() => undefined);

    expect(port.aborted).toBe(true);
  });

  it("releases the writer lock after a write timeout", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 }).catch(() => undefined);

    expect(port.writable?.locked ?? false).toBe(false);
  });

  it("never leaves the transport busy after a write timeout, so the engine's next attempt is not blocked", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 }).catch(() => undefined);
    const second = await transport
      .sendAndReceive(new Uint8Array([2]), { timeoutMs: 10_000 })
      .then(() => null)
      .catch((caught: unknown) => caught);

    // Whatever the second attempt fails with, it must not be the
    // "already in flight" guard — that would mean `busy` leaked.
    expect(second).not.toBeInstanceOf(ConnectionInProgressError);
  });

  it("does not bound a normal write: a healthy exchange completes under the default limit", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport(); // DEFAULT_WRITE_TIMEOUT_MS
    transport.attachPort(port);
    setTimeout(() => port.emit(acceptedReply()), 0);

    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 500 }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it("invalidates the connection on a write timeout: isConnected() is false, and reuse requires a fresh connection", async () => {
    const port = await openedPort({ stallWrites: true });
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    await transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 }).catch(() => undefined);

    // The write itself never settled, so whether any bytes reached the
    // device is unknown — the port must not be silently reusable afterward.
    expect(transport.isConnected()).toBe(false);
    await expect(
      transport.sendAndReceive(new Uint8Array([2]), { timeoutMs: 10_000 }),
    ).rejects.toBeInstanceOf(NotConnectedError);
  });

  it("never hangs closing a doubly-wedged port: close() itself never resolving does not block the write-timeout rejection", async () => {
    const port = await openedPort({ stallWrites: true });
    // A port wedged badly enough to stall a write may just as easily stall
    // close() — the fix under test must not await that.
    port.close = () => new Promise<void>(() => undefined);
    const transport = new WebSerialTransport({ writeTimeoutMs: 30 });
    transport.attachPort(port);

    const startedAt = Date.now();
    const error = await transport
      .sendAndReceive(new Uint8Array([1]), { timeoutMs: 10_000 })
      .then(() => null)
      .catch((caught: unknown) => caught);

    // The promise settles promptly — nowhere near the 10s reply timeout,
    // let alone forever — even though close() beneath it never will.
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(error).toBeInstanceOf(WriteTimeoutError);
    expect((error as WriteTimeoutError).code).toBe("WRITE_TIMEOUT");
    expect(transport.isConnected()).toBe(false);

    // busy is cleared too: the next call fails on "not connected", never on
    // the "already in flight" guard.
    const second = await transport
      .sendAndReceive(new Uint8Array([2]), { timeoutMs: 10_000 })
      .then(() => null)
      .catch((caught: unknown) => caught);
    expect(second).toBeInstanceOf(NotConnectedError);
  });
});

describe("disconnect()", () => {
  beforeEach(() => enableAllFlags());

  it("closes the port and NotConnectedError is thrown on subsequent sends", async () => {
    const port = await openedPort();
    const transport = new WebSerialTransport();
    transport.attachPort(port);

    await transport.disconnect();

    expect(transport.isConnected()).toBe(false);
    await expect(
      transport.sendAndReceive(new Uint8Array([1]), { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(NotConnectedError);
  });

  it("is a safe no-op when nothing is connected", async () => {
    const transport = new WebSerialTransport();
    await expect(transport.disconnect()).resolves.toBeUndefined();
  });
});
