import { describe, expect, it } from "vitest";
import type { UpdateEvent } from "../../lib/update-engine";
import { toDiagnosticRows } from "../diagnostics";

describe("toDiagnosticRows", () => {
  it("distinguishes a verified completion and includes the verified version (I2)", () => {
    const event: UpdateEvent = { type: "completed", timestamp: 0, verified: true, verifiedVersion: "V1.10.36" };
    const [row] = toDiagnosticRows([event]);
    expect(row?.message).toBe("Update completed and version verified (V1.10.36).");
  });

  it("never claims success for an unverified completion (I2)", () => {
    const event: UpdateEvent = { type: "completed", timestamp: 0, verified: false };
    const [row] = toDiagnosticRows([event]);
    expect(row?.message).toBe("Firmware transferred; version verification unavailable.");
    expect(row?.message).not.toContain("successfully");
  });

  it("does not claim a packet was sent before the write has resolved (M1)", () => {
    const event: UpdateEvent = {
      type: "packet_sent",
      packetIndex: 0,
      totalPackets: 10,
      attempt: 1,
      timestamp: 0,
    };
    const [row] = toDiagnosticRows([event]);
    expect(row?.message).toBe("Attempting packet 1/10 (attempt 1)");
  });
});
