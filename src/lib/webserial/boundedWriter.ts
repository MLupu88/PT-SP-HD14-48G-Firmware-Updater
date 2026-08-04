import { DeviceDisconnectedError } from "./readOnlyErrors";
import { WriteFailedError, WriteTimeoutError } from "./transportErrors";

/**
 * Writes `data` to a Web Serial port under a hard time bound, and always
 * releases the writer's lock — the write-side counterpart to
 * `readBoundedReply` in boundedReader.ts, with the same ownership contract.
 *
 * Why this exists: `writer.ready` (backpressure) and `writer.write()` are
 * both unbounded promises. A wedged USB-serial adapter, or hardware flow
 * control asserted and never released, can leave either pending forever. In
 * the middle of a firmware transfer that would hang the update with no
 * timeout and no way out — the progress screen would sit on "Sending
 * firmware" indefinitely while the device waits in its bootloader. Bounding
 * the write turns that into an ordinary, reportable failure that
 * `UpdateEngine` can classify and surface honestly.
 */
export async function writeBounded(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: Uint8Array,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const attempt = (async () => {
    await writer.ready;
    await writer.write(data);
  })();
  // An attempt abandoned by the timeout below still settles later (rejected
  // by the abort/lock release). Attach a no-op handler now so that late
  // rejection can never surface as an unhandled promise rejection.
  attempt.catch(() => undefined);

  try {
    await Promise.race([
      attempt,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new WriteTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (timedOut) {
      // Abort the stream rather than merely dropping the lock. A stalled
      // write is still queued against the sink; if it later drained on its
      // own, those bytes would land on the wire out of sequence — in the
      // middle of a firmware transfer, that means a corrupt packet stream
      // reaching a device in its bootloader. Aborting guarantees the
      // abandoned bytes can never be sent. Fire-and-forget: per the Streams
      // spec, abort() on a writer with an in-flight write doesn't settle
      // until that write itself settles — which, for the genuinely wedged
      // port this timeout exists to handle, may be never. Awaiting it here
      // would silently swallow the very timeout we just detected.
      void writer.abort(error).catch(() => undefined);
      throw error;
    }
    // A disconnect detected during the write is already the precise
    // diagnosis; anything else is an opaque browser/DOM failure.
    if (error instanceof DeviceDisconnectedError) throw error;
    throw new WriteFailedError(error);
  } finally {
    clearTimeout(timer);
    try {
      writer.releaseLock();
    } catch {
      // Already released or detached (e.g. by the abort above) — nothing to do.
    }
  }
}
