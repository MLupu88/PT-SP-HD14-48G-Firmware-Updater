import { parseReply } from "../gtool";
import { UnsupportedReplyLengthError } from "../gtool/errors";
import type { ParsedReply } from "../gtool/types";
import { DeviceDisconnectedError, MalformedFramingError, ReadTimeoutError } from "./readOnlyErrors";

/** No reply frame recovered from the source is longer than 18 bytes. */
const MAX_SUPPORTED_REPLY_LENGTH = 18;

export interface BoundedReadResult {
  readonly raw: Uint8Array;
  readonly reply: ParsedReply;
}

/**
 * Accumulates chunks from a Web Serial reader until a complete, recognized
 * reply is available, then stops — mirroring the recovered reader's own
 * completion check (`main_serial_section.txt`: `B.byteLength === (mode ? 13
 * : 18)`), generalized to recognize either recovered length rather than
 * assuming the mode ahead of time. Always releases the reader's lock,
 * whether it returns, times out, or the device disconnects.
 */
export async function readBoundedReply(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<BoundedReadResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel(new Error("Read-only device query timed out."));
  }, timeoutMs);

  try {
    for (;;) {
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await reader.read();
      } catch {
        // A cancelled read may reject rather than resolve with done:true,
        // depending on the underlying source; either shape means the same
        // thing here, distinguished only by whether our own timer fired.
        throw timedOut ? new ReadTimeoutError(concat(chunks, total)) : new DeviceDisconnectedError();
      }

      if (step.done) {
        throw timedOut ? new ReadTimeoutError(concat(chunks, total)) : new DeviceDisconnectedError();
      }

      if (step.value && step.value.length > 0) {
        chunks.push(step.value);
        total += step.value.length;
      }

      if (total > MAX_SUPPORTED_REPLY_LENGTH) {
        throw new MalformedFramingError(concat(chunks, total));
      }

      if (total >= 13) {
        const buffer = concat(chunks, total);
        try {
          const reply = parseReply(buffer);
          return { raw: buffer, reply };
        } catch (error) {
          if (!(error instanceof UnsupportedReplyLengthError)) {
            throw error;
          }
          // Not (yet) a recognized length — keep reading. The `total >
          // MAX_SUPPORTED_REPLY_LENGTH` check above guarantees this loop
          // still terminates once no valid length can ever be reached.
        }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
