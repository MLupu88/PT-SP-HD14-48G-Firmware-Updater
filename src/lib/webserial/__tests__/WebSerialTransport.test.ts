import { describe, expect, it } from "vitest";
import { RealFlashingDisabledError, WebSerialTransport } from "../WebSerialTransport";

/**
 * Lock-in regression coverage: Phase 2A adds a real, read-only connection
 * path, but the `UpdateTransport` implementation `UpdateEngine` would use
 * for a real firmware update must remain exactly as inert as before —
 * these assertions fail loudly if that ever changes.
 */
describe("WebSerialTransport (firmware-writing path) stays inert", () => {
  it("rejects connect() unconditionally", async () => {
    const transport = new WebSerialTransport();
    await expect(transport.connect()).rejects.toBeInstanceOf(RealFlashingDisabledError);
  });

  it("rejects sendAndReceive() unconditionally — no initialization command or FE EF packet can ever be sent", async () => {
    const transport = new WebSerialTransport();
    // The method takes no parameters at all: there is no way to route bytes
    // through it, regardless of what a caller might try to pass.
    await expect(transport.sendAndReceive()).rejects.toBeInstanceOf(RealFlashingDisabledError);
  });

  it("never reports itself as connected", () => {
    const transport = new WebSerialTransport();
    expect(transport.isConnected()).toBe(false);
  });
});
