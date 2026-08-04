import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireWakeLock, releaseWakeLock } from "../wakeLock";

function installMockWakeLock(request: (type: string) => Promise<WakeLockSentinel>): void {
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
    writable: true,
  });
}

function uninstallMockWakeLock(): void {
  Object.defineProperty(navigator, "wakeLock", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  uninstallMockWakeLock();
});

describe("acquireWakeLock", () => {
  it("resolves to null when the Wake Lock API is unavailable, without throwing", async () => {
    uninstallMockWakeLock();
    await expect(acquireWakeLock()).resolves.toBeNull();
  });

  it("requests a 'screen' wake lock and returns the sentinel when available", async () => {
    const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) } as unknown as WakeLockSentinel;
    const request = vi.fn().mockResolvedValue(sentinel);
    installMockWakeLock(request);

    const result = await acquireWakeLock();

    expect(request).toHaveBeenCalledWith("screen");
    expect(result).toBe(sentinel);
  });

  it("resolves to null (never rejects) when the browser denies the request", async () => {
    installMockWakeLock(() => Promise.reject(new DOMException("Permission denied.", "NotAllowedError")));
    await expect(acquireWakeLock()).resolves.toBeNull();
  });
});

describe("releaseWakeLock", () => {
  it("is a safe no-op for null", async () => {
    await expect(releaseWakeLock(null)).resolves.toBeUndefined();
  });

  it("releases a held, unreleased sentinel", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = { released: false, release } as unknown as WakeLockSentinel;

    await releaseWakeLock(sentinel);

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not call release() again on an already-released sentinel", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = { released: true, release } as unknown as WakeLockSentinel;

    await releaseWakeLock(sentinel);

    expect(release).not.toHaveBeenCalled();
  });

  it("never throws even if release() itself rejects", async () => {
    const sentinel = {
      released: false,
      release: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as WakeLockSentinel;

    await expect(releaseWakeLock(sentinel)).resolves.toBeUndefined();
  });
});
