/**
 * Transport abstraction the update engine talks to. A real Web Serial
 * transport and the deterministic simulator transport both implement this
 * interface, so the engine never depends on either concretely.
 */
export interface UpdateTransport {
  readonly label: string;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Sends `data` and resolves with the device's reply bytes, or rejects if
   * the transport itself fails (timeout, disconnect, port error). The
   * transport is responsible only for byte transport and framing-agnostic
   * timeouts — protocol interpretation happens in the engine.
   */
  sendAndReceive(data: Uint8Array, options: { timeoutMs: number }): Promise<Uint8Array>;
}
