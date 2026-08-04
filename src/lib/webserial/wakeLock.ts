/**
 * Best-effort Screen Wake Lock wrapper for the real firmware-transfer path.
 * "Best-effort" is load-bearing here: a real firmware update must never fail
 * or be blocked because a browser doesn't support the Wake Lock API, the
 * page isn't visible, or the OS denies the request — see README "Safety
 * status" and the Phase 2B cancellation/interruption requirements. Every
 * failure mode here resolves to `null` rather than throwing.
 */

function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator && navigator.wakeLock != null;
}

/**
 * Requests a "screen" wake lock. Resolves to `null` (never rejects) if the
 * API is unavailable, the request is denied, or the page is not currently
 * visible — all of which are normal, expected outcomes that must not
 * interrupt an update in progress.
 */
export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  if (!isWakeLockSupported()) {
    return null;
  }
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    // NotAllowedError (hidden tab, permission policy), or any other
    // browser-specific rejection: treated identically as "unavailable now".
    return null;
  }
}

/** Releases a previously acquired wake lock, if any. Never throws. */
export async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel || sentinel.released) return;
  try {
    await sentinel.release();
  } catch {
    // Best-effort: nothing meaningful to recover from here.
  }
}
