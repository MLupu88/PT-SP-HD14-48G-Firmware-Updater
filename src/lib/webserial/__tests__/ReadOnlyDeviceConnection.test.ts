import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { additiveChecksum } from "../../gtool/checksum";
import type { ByteMode } from "../../gtool/types";
import { ReadOnlyDeviceConnection } from "../ReadOnlyDeviceConnection";
import {
  ConnectionInProgressError,
  DeviceDisconnectedError,
  MalformedFramingError,
  PortSelectionCancelledError,
  ReadOnlyConnectionDisabledError,
  ReadTimeoutError,
} from "../readOnlyErrors";
import { installMockSerial, MockSerial, MockSerialPort, uninstallMockSerial } from "./mockWebSerial";

function buildValidVersionReply(mode: ByteMode, major: number, minor: number, patch: number): Uint8Array {
  const frame = new Uint8Array(mode);
  const offset = mode === 13 ? 4 : 5;
  frame[offset] = major;
  frame[offset + 2] = minor;
  frame[offset + 4] = patch;
  frame[mode - 1] = additiveChecksum(frame.subarray(0, mode - 1), mode);
  return frame;
}

let mockSerial: MockSerial;

beforeEach(() => {
  mockSerial = installMockSerial();
  vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
});

afterEach(() => {
  uninstallMockSerial();
  vi.unstubAllEnvs();
});

describe("read-only flag disabled", () => {
  it("rejects connect() before touching navigator.serial at all", async () => {
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "false");
    const connection = new ReadOnlyDeviceConnection();
    await expect(connection.connect()).rejects.toBeInstanceOf(ReadOnlyConnectionDisabledError);
    expect(mockSerial.requestPortCallCount).toBe(0);
  });

  it("rejects queryDeviceIdentity() even if somehow called", async () => {
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "false");
    const connection = new ReadOnlyDeviceConnection();
    await expect(connection.queryDeviceIdentity()).rejects.toBeInstanceOf(ReadOnlyConnectionDisabledError);
  });
});

it("rejects when the user cancels the port picker", async () => {
  mockSerial.provideNextError(new DOMException("No port was selected.", "NotFoundError"));
  const connection = new ReadOnlyDeviceConnection();
  await expect(connection.connect()).rejects.toBeInstanceOf(PortSelectionCancelledError);
  expect(connection.isConnected()).toBe(false);
});

it("opens the port successfully and reports its USB VID/PID", async () => {
  const port = new MockSerialPort({ usbVendorId: 0x1a2b, usbProductId: 0x3c4d });
  mockSerial.provideNextPort(port);
  const connection = new ReadOnlyDeviceConnection();

  const result = await connection.connect();

  expect(connection.isConnected()).toBe(true);
  expect(result.port).toEqual({ usbVendorId: 0x1a2b, usbProductId: 0x3c4d });
  expect(port.lastOpenOptions?.baudRate).toBe(115_200);
  expect(port.lastOpenOptions?.dataBits).toBe(8);
  expect(port.lastOpenOptions?.stopBits).toBe(1);
});

describe("querying device identity", () => {
  let port: MockSerialPort;
  let connection: ReadOnlyDeviceConnection;

  beforeEach(async () => {
    port = new MockSerialPort({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    mockSerial.provideNextPort(port);
    connection = new ReadOnlyDeviceConnection();
    await connection.connect();
  });

  it("parses an exact valid 13-byte version reply", async () => {
    const reply = buildValidVersionReply(13, 1, 10, 36);
    setTimeout(() => port.emit(reply), 0);

    const result = await connection.queryDeviceIdentity(500);

    expect(result.stage).toBe("valid_supported_reply");
    expect(result.mode).toBe(13);
    expect(result.checksumValid).toBe(true);
    expect(result.version?.versionString).toBe("V1.10.36");
    expect(result.rawReplyLength).toBe(13);
    expect(result.compatible).toBe(false); // no model-name evidence in this reply — see README "Phase 2A"
  });

  it("sends exactly the recovered version-query command and nothing else", async () => {
    setTimeout(() => port.emit(buildValidVersionReply(13, 1, 10, 36)), 0);
    await connection.queryDeviceIdentity(500);

    expect(port.writtenChunks).toHaveLength(1);
    // A5 5B 01 13 00*8 [checksum] — from docs/gtool-analysis/packet_reference_output.txt structure.
    expect(Array.from(port.writtenChunks[0]!.subarray(0, 4))).toEqual([0xa5, 0x5b, 0x01, 0x13]);
    expect(port.writtenChunks[0]).toHaveLength(13);
  });

  it("reassembles a reply that arrives across several chunks", async () => {
    const reply = buildValidVersionReply(13, 2, 5, 1);
    setTimeout(() => {
      port.emit(reply.subarray(0, 3));
      port.emit(reply.subarray(3, 7));
      port.emit(reply.subarray(7, 13));
    }, 0);

    const result = await connection.queryDeviceIdentity(500);

    expect(result.stage).toBe("valid_supported_reply");
    expect(result.version?.versionString).toBe("V2.05.01");
  });

  it("flags a checksum failure as an unknown serial device, not a crash", async () => {
    const reply = buildValidVersionReply(13, 1, 10, 36);
    reply[12] = (reply[12]! + 1) & 0xff; // corrupt the checksum byte
    setTimeout(() => port.emit(reply), 0);

    const result = await connection.queryDeviceIdentity(500);

    expect(result.stage).toBe("unknown_serial_device");
    expect(result.checksumValid).toBe(false);
    expect(result.compatible).toBe(false);
  });

  it("rejects with MalformedFramingError when bytes never resolve into a recognized length", async () => {
    setTimeout(() => port.emit(new Uint8Array(20)), 0); // longer than the max supported 18 bytes
    await expect(connection.queryDeviceIdentity(500)).rejects.toBeInstanceOf(MalformedFramingError);
  });

  it("times out cleanly with zero bytes and retains that fact on the error", async () => {
    // Never emit anything.
    await expect(connection.queryDeviceIdentity(30)).rejects.toMatchObject({
      constructor: ReadTimeoutError,
      rawBytes: expect.objectContaining({ length: 0 }),
    });
  });

  it("distinguishes a partial response from silence on timeout", async () => {
    setTimeout(() => port.emit(new Uint8Array([0xfe, 0xef, 0x00])), 0);
    try {
      await connection.queryDeviceIdentity(60);
      expect.unreachable("expected a timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(ReadTimeoutError);
      expect((error as ReadTimeoutError).rawBytes.length).toBe(3);
    }
  });

  it("reports disconnection during read and marks the connection as no longer connected", async () => {
    setTimeout(() => port.simulateDisconnect(), 0);
    await expect(connection.queryDeviceIdentity(500)).rejects.toBeInstanceOf(DeviceDisconnectedError);
    expect(connection.isConnected()).toBe(false);
  });

  it("releases the reader and writer locks after a successful query", async () => {
    setTimeout(() => port.emit(buildValidVersionReply(13, 1, 10, 36)), 0);
    await connection.queryDeviceIdentity(500);
    expect(port.readable?.locked ?? false).toBe(false);
    expect(port.writable?.locked ?? false).toBe(false);
  });

  it("releases the reader lock after a timeout", async () => {
    await connection.queryDeviceIdentity(30).catch(() => undefined);
    expect(port.readable?.locked ?? false).toBe(false);
  });
});

it("supports a valid 18-byte reply when explicitly configured for 18-byte mode", async () => {
  const port = new MockSerialPort();
  mockSerial.provideNextPort(port);
  const connection = new ReadOnlyDeviceConnection({ mode: 18 });
  await connection.connect();

  const reply = buildValidVersionReply(18, 3, 2, 7);
  setTimeout(() => port.emit(reply), 0);

  const result = await connection.queryDeviceIdentity(500);

  expect(result.stage).toBe("valid_supported_reply");
  expect(result.mode).toBe(18);
  expect(result.version?.versionString).toBe("V3.02.07");
  expect(port.writtenChunks[0]).toHaveLength(18);
  expect(Array.from(port.writtenChunks[0]!.subarray(0, 3))).toEqual([0x50, 0x56, 0x54]); // "PVT"
});

it("prevents a second connect() while one is already in progress", async () => {
  const connection = new ReadOnlyDeviceConnection();
  const firstAttempt = connection.connect(); // requestPort() left pending deliberately

  await expect(connection.connect()).rejects.toBeInstanceOf(ConnectionInProgressError);

  mockSerial.rejectPending(new DOMException("No port was selected.", "NotFoundError"));
  await expect(firstAttempt).rejects.toBeInstanceOf(PortSelectionCancelledError);
});

it("prevents a second queryDeviceIdentity() while one is already in progress", async () => {
  const port = new MockSerialPort();
  mockSerial.provideNextPort(port);
  const connection = new ReadOnlyDeviceConnection();
  await connection.connect();

  const firstQuery = connection.queryDeviceIdentity(500);
  await expect(connection.queryDeviceIdentity(500)).rejects.toBeInstanceOf(ConnectionInProgressError);

  port.emit(buildValidVersionReply(13, 1, 0, 0));
  await firstQuery;
});

describe("firmware-writing remains structurally unavailable", () => {
  it("exposes no method beyond connect/queryDeviceIdentity/disconnect/isConnected", () => {
    const proto = Object.getPrototypeOf(new ReadOnlyDeviceConnection()) as object;
    const publicMethods = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== "constructor" && !name.startsWith("_"),
    );
    expect(new Set(publicMethods)).toEqual(
      new Set(["connect", "queryDeviceIdentity", "disconnect", "isConnected"]),
    );
  });
});
