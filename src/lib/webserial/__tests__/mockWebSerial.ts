/**
 * Deterministic, in-memory mock of the Web Serial API, used only by tests.
 * Never touches a real port; lets tests script exact byte-level device
 * behavior (chunking, checksum failure, timeout, disconnection) without
 * physical hardware.
 */

export interface MockSerialPortOptions {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
  /**
   * Invoked synchronously inside the writable stream's sink for every write
   * — lets a test auto-respond (e.g. `port.emit(acceptedReply)`) without
   * hand-scheduling a `setTimeout` per packet. Because `ReadableStream`
   * buffers `enqueue()`d chunks internally, this is safe to call even
   * before a reader is attached for the next read.
   */
  readonly onWrite?: (chunk: Uint8Array) => void;
  /**
   * Makes the writable sink accept the chunk but never settle its write
   * promise, simulating a wedged USB-serial adapter (or hardware flow
   * control asserted and never released). Used to exercise the bounded
   * write phase; the chunk is still recorded in `writtenChunks` so a test
   * can assert what was *attempted*. `true` stalls every write; a predicate
   * stalls only the chunks it returns `true` for (e.g. one specific data
   * packet), letting a test prove writes before/after the stall still
   * behave normally.
   */
  readonly stallWrites?: boolean | ((chunk: Uint8Array) => boolean);
}

export class MockSerialPort extends EventTarget implements SerialPort {
  readonly writtenChunks: Uint8Array[] = [];
  lastOpenOptions: SerialOptions | null = null;

  private streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private _readable: ReadableStream<Uint8Array> | null = null;
  private _writable: WritableStream<Uint8Array> | null = null;
  private readonly info: SerialPortInfo;
  private readonly onWrite?: (chunk: Uint8Array) => void;
  private readonly stallWrites: boolean | ((chunk: Uint8Array) => boolean);
  /** Set when an aborted stream tears down the sink, so tests can assert the abandoned write was cancelled. */
  aborted = false;

  constructor(options: MockSerialPortOptions = {}) {
    super();
    this.info = { usbVendorId: options.usbVendorId, usbProductId: options.usbProductId };
    this.onWrite = options.onWrite;
    this.stallWrites = options.stallWrites ?? false;
  }

  getInfo(): SerialPortInfo {
    return this.info;
  }

  get readable(): ReadableStream<Uint8Array> | null {
    return this._readable;
  }

  get writable(): WritableStream<Uint8Array> | null {
    return this._writable;
  }

  async open(options: SerialOptions): Promise<void> {
    this.lastOpenOptions = options;
    this._readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamController = controller;
      },
    });
    this._writable = new WritableStream<Uint8Array>({
      write: (chunk, controller) => {
        this.writtenChunks.push(chunk);
        this.onWrite?.(chunk);
        const shouldStall =
          typeof this.stallWrites === "function" ? this.stallWrites(chunk) : this.stallWrites;
        if (shouldStall) {
          // Never settles on its own — simulates a wedged adapter that took
          // the chunk and went silent. Still reacts to `controller.signal`,
          // which the stream aborts the moment `writer.abort()` is called
          // even with this write still in flight: that's what lets a real
          // driver (and this mock) cancel an in-flight transfer rather than
          // waiting for it to finish on its own, which for a genuinely
          // wedged port would be never.
          return new Promise<void>((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => {
              reject(controller.signal.reason);
            });
          });
        }
        return undefined;
      },
      abort: () => {
        this.aborted = true;
      },
    });
  }

  async close(): Promise<void> {
    try {
      this.streamController?.close();
    } catch {
      // Already closed/errored — fine for a mock.
    }
    this._readable = null;
    this._writable = null;
  }

  /** Test helper: deliver a chunk of bytes to whatever reader is currently attached. */
  emit(bytes: Uint8Array): void {
    this.streamController?.enqueue(bytes);
  }

  /** Test helper: simulate the physical device being unplugged mid-read. */
  simulateDisconnect(): void {
    try {
      this.streamController?.error(new DOMException("The device has been lost.", "NetworkError"));
    } catch {
      // Stream may already be closed/errored.
    }
    this.dispatchEvent(new Event("disconnect"));
  }
}

export class MockSerial extends EventTarget implements Serial {
  private nextPort: SerialPort | null = null;
  private nextError: unknown = null;
  private pendingResolve: ((port: SerialPort) => void) | null = null;
  private pendingReject: ((error: unknown) => void) | null = null;

  requestPortCallCount = 0;

  /** Configure the result of the next requestPort() call, resolved immediately. */
  provideNextPort(port: SerialPort): void {
    this.nextPort = port;
    this.nextError = null;
  }

  provideNextError(error: unknown): void {
    this.nextError = error;
    this.nextPort = null;
  }

  /** Leaves the next requestPort() call pending until resolvePending()/rejectPending() is called. */
  requestPort(): Promise<SerialPort> {
    this.requestPortCallCount += 1;
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      return Promise.reject(error);
    }
    if (this.nextPort) {
      const port = this.nextPort;
      this.nextPort = null;
      return Promise.resolve(port);
    }
    return new Promise<SerialPort>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
    });
  }

  resolvePending(port: SerialPort): void {
    this.pendingResolve?.(port);
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  rejectPending(error: unknown): void {
    this.pendingReject?.(error);
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  async getPorts(): Promise<SerialPort[]> {
    return [];
  }
}

export function installMockSerial(): MockSerial {
  const mock = new MockSerial();
  Object.defineProperty(navigator, "serial", {
    value: mock,
    configurable: true,
    writable: true,
  });
  return mock;
}

export function uninstallMockSerial(): void {
  Object.defineProperty(navigator, "serial", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}
