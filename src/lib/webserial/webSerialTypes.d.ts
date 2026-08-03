/**
 * Minimal local Web Serial API type declarations.
 *
 * The default TypeScript DOM lib does not reliably include the (still
 * evolving) Web Serial API. These declarations cover only what this project
 * uses, so we can compile safely without `any` regardless of the TS/DOM lib
 * version in use. Extend as real transmission support is added in a later
 * phase.
 */
export {};

declare global {
  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: "none" | "even" | "odd";
    bufferSize?: number;
    flowControl?: "none" | "hardware";
  }

  interface SerialPortRequestOptions {
    filters?: ReadonlyArray<{ usbVendorId?: number; usbProductId?: number }>;
  }

  interface SerialPort extends EventTarget {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
  }

  interface Serial extends EventTarget {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }

  interface Navigator {
    readonly serial?: Serial;
  }
}
