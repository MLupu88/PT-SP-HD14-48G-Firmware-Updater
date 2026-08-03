import { describe, expect, it } from "vitest";
import { parseReply } from "../../gtool/replies";
import { SimulatorTransport } from "../SimulatorTransport";

function dataFrame(packetIndex: number, isFinal: boolean): Uint8Array {
  const high = (Math.floor(packetIndex / 256) | (isFinal ? 0x80 : 0)) & 0xff;
  const low = packetIndex % 256;
  const frame = new Uint8Array(2 + 2 + 1024 + 1);
  frame[0] = 0xfe;
  frame[1] = 0xef;
  frame[2] = high;
  frame[3] = low;
  return frame;
}

describe("SimulatorTransport", () => {
  it("never uses Web Serial and starts disconnected", () => {
    const transport = new SimulatorTransport();
    expect(transport.isConnected()).toBe(false);
  });

  it("rejects sends before connect() is called", async () => {
    const transport = new SimulatorTransport();
    await expect(transport.sendAndReceive(dataFrame(0, false), { timeoutMs: 10 })).rejects.toThrow();
  });

  it("accepts every packet in the success scenario", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "success" } });
    await transport.connect();
    const reply = parseReply(await transport.sendAndReceive(dataFrame(0, false), { timeoutMs: 10 }));
    expect(reply.status).toBe("accepted");
  });

  it("requests a resend exactly once for the targeted packet", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "retry_once", packetIndex: 2 } });
    await transport.connect();
    const first = parseReply(await transport.sendAndReceive(dataFrame(2, false), { timeoutMs: 10 }));
    const second = parseReply(await transport.sendAndReceive(dataFrame(2, false), { timeoutMs: 10 }));
    expect(first.status).toBe("resend");
    expect(second.status).toBe("accepted");
  });

  it("reports a protocol failure for the targeted packet", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "protocol_failure", packetIndex: 0 } });
    await transport.connect();
    const reply = parseReply(await transport.sendAndReceive(dataFrame(0, false), { timeoutMs: 10 }));
    expect(reply.status).toBe("failed");
  });

  it("throws instead of replying for a timed-out packet", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "timeout", packetIndex: 0 } });
    await transport.connect();
    await expect(transport.sendAndReceive(dataFrame(0, false), { timeoutMs: 10 })).rejects.toThrow(/timeout/i);
  });

  it("permanently disconnects after the targeted packet", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "disconnect", packetIndex: 0 } });
    await transport.connect();
    await expect(transport.sendAndReceive(dataFrame(0, false), { timeoutMs: 10 })).rejects.toThrow(/disconnect/i);
    expect(transport.isConnected()).toBe(false);
    await expect(transport.sendAndReceive(dataFrame(1, false), { timeoutMs: 10 })).rejects.toThrow();
  });

  it("returns a generic accepted-shaped reply for non-data command frames", async () => {
    const transport = new SimulatorTransport({ scenario: { kind: "protocol_failure", packetIndex: 0 } });
    await transport.connect();
    const commandFrame = Uint8Array.of(0xa5, 0x5b, 0x08, 0x07, 0x00, 0, 0, 0, 0, 0, 0, 0, 0xf1);
    const reply = await transport.sendAndReceive(commandFrame, { timeoutMs: 10 });
    expect(reply).toHaveLength(13);
  });
});
