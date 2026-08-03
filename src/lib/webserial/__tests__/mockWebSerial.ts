/**
 * Deterministic, in-memory mock of the Web Serial API, used only by tests.
 * Never touches a real port; lets tests script exact byte-level device
 * behavior (chunking, checksum failure, timeout, disconnection) without
 * physical hardware.
 */

export interface MockSerialPortOptions {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

export class MockSerialPort extends EventTarget implements SerialPort {
  readonly writtenChunks: Uint8Array[] = [];
  lastOpenOptions: SerialOptions | null = null;

  private streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private _readable: ReadableStream<Uint8Array> | null = null;
  private _writable: WritableStream<Uint8Array> | null = null;
  private readonly info: SerialPortInfo;

  constructor(options: MockSerialPortOptions = {}) {
    super();
    this.info = { usbVendorId: options.usbVendorId, usbProductId: options.usbProductId };
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
      write: (chunk) => {
        this.writtenChunks.push(chunk);
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
