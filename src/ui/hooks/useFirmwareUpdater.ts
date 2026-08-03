import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildVersionQueryCommand } from "../../lib/gtool";
import type { FirmwareFile } from "../../lib/gtool";
import { createSampleMcuMainFirmware, SimulatorTransport } from "../../lib/simulator";
import { UpdateEngine } from "../../lib/update-engine";
import type { UpdateEvent, UpdateState, UpdateTransport } from "../../lib/update-engine";
import {
  ConnectionInProgressError,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_SERIAL_OPTIONS,
  DeviceDisconnectedError,
  getBrowserCompatibility,
  isReadOnlyDeviceConnectionEnabled,
  isRealFlashingFlagEnabled,
  MalformedFramingError,
  NotConnectedError,
  PortSelectionCancelledError,
  ReadOnlyConnectionDisabledError,
  ReadOnlyDeviceConnection,
  ReadTimeoutError,
  WebSerialTransport,
  WebSerialUnsupportedError,
} from "../../lib/webserial";
import type { BrowserCompatibility, DeviceIdentityResult } from "../../lib/webserial";
import { presentError } from "../copy";
import type { ErrorPresentation } from "../copy";
import { toHex } from "../diagnostics";

export type UpdaterMode = "unselected" | "demo" | "real";
export type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

/**
 * Phase 2A read-only connection phases. "selecting" covers the native
 * port-picker dialog; "connecting" covers `port.open()`, which follows it;
 * "checking" covers sending the version query and reading the reply.
 */
export type RealConnectionPhase = "idle" | "selecting" | "connecting" | "checking" | "done";

export interface FirmwareInfo {
  readonly name: string;
  readonly size: number;
}

function latestErrorCode(events: readonly UpdateEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === "failed") return event.code;
  }
  return "UPDATE_FAILED";
}

/** Maps a thrown Phase 2A read-only-connection error to an `ErrorPresentation` lookup code. */
function mapReadOnlyErrorToCode(error: unknown): string {
  if (error instanceof ReadOnlyConnectionDisabledError) return "READ_ONLY_DISABLED";
  if (error instanceof WebSerialUnsupportedError) return "WEB_SERIAL_UNSUPPORTED";
  if (error instanceof PortSelectionCancelledError) return "PORT_SELECTION_CANCELLED";
  if (error instanceof ConnectionInProgressError) return "CONNECTION_IN_PROGRESS";
  if (error instanceof NotConnectedError) return "TRANSPORT_FAILURE";
  if (error instanceof MalformedFramingError) return "MALFORMED_REPLY";
  if (error instanceof ReadTimeoutError) {
    return error.rawBytes.length > 0 ? "DEVICE_RESPONDED_INCOMPLETE" : "READ_TIMEOUT";
  }
  if (error instanceof DeviceDisconnectedError) return "DEVICE_DISCONNECTED";
  return "TRANSPORT_FAILURE";
}

/**
 * Update orchestration layer: owns the engine/transport lifecycle and
 * translates raw protocol state into the shape the guided UI needs.
 * Presentation components never touch `src/lib/*` directly.
 */
export function useFirmwareUpdater() {
  const [browserCompatibility] = useState<BrowserCompatibility>(() => getBrowserCompatibility());
  const [mode, setMode] = useState<UpdaterMode>("unselected");
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<ErrorPresentation | null>(null);

  const [firmware, setFirmware] = useState<FirmwareInfo | null>(null);
  const [validation, setValidation] = useState<ValidationStatus>("idle");
  const [validationError, setValidationError] = useState<ErrorPresentation | null>(null);

  const [realConnectionPhase, setRealConnectionPhase] = useState<RealConnectionPhase>("idle");
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentityResult | null>(null);
  /** Raw bytes retained from a failed read-only query (timeout/malformed) for bench diagnostics. */
  const [lastFailureRawBytes, setLastFailureRawBytes] = useState<Uint8Array | null>(null);

  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  const engineRef = useRef<UpdateEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<UpdateEvent[]>([]);
  const readOnlyConnectionRef = useRef<ReadOnlyDeviceConnection | null>(null);

  const ensureEngine = useCallback(
    (transport: UpdateTransport) => {
      unsubscribeRef.current?.();
      eventsRef.current = [];
      const engine = new UpdateEngine({ transport });
      engineRef.current = engine;
      unsubscribeRef.current = engine.onEvent((event) => {
        eventsRef.current = [...eventsRef.current, event];
        forceUpdate();
      });
      forceUpdate();
      return engine;
    },
    [forceUpdate],
  );

  useEffect(() => () => unsubscribeRef.current?.(), []);
  useEffect(() => () => void readOnlyConnectionRef.current?.disconnect(), []);

  const chooseDemoMode = useCallback(() => {
    setMode("demo");
    setConnectError(null);
    setDeviceConnected(false);
    const transport = new SimulatorTransport({
      scenario: { kind: "success" },
      // Per-reply pacing chosen purely for a legible demo animation; not a
      // documented protocol timing value (see docs/gtool-analysis).
      responseDelayMs: 30,
    });
    ensureEngine(transport);
    void transport.connect().then(() => {
      setDeviceConnected(true);
      forceUpdate();
    });
  }, [ensureEngine, forceUpdate]);

  /**
   * Phase 2A read-only journey: request a port, open it, and send only the
   * recovered version-query command via `ReadOnlyDeviceConnection` — never
   * wired to `UpdateEngine`/`WebSerialTransport`, so there is no path from
   * here into firmware transfer, real or simulated.
   */
  const connectReadOnlyDevice = useCallback(async () => {
    setMode("real");
    setConnectError(null);
    setDeviceIdentity(null);
    setLastFailureRawBytes(null);
    setConnecting(true);
    setRealConnectionPhase("selecting");
    const connection = new ReadOnlyDeviceConnection();
    readOnlyConnectionRef.current = connection;
    try {
      await connection.connect({}, () => setRealConnectionPhase("connecting"));
      setRealConnectionPhase("checking");
      const identity = await connection.queryDeviceIdentity();
      setDeviceIdentity(identity);
      setRealConnectionPhase("done");
    } catch (error) {
      setRealConnectionPhase("idle");
      setConnectError(presentError(mapReadOnlyErrorToCode(error)));
      if (error instanceof ReadTimeoutError || error instanceof MalformedFramingError) {
        setLastFailureRawBytes(error.rawBytes);
      }
      readOnlyConnectionRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectRealDevice = useCallback(() => {
    void readOnlyConnectionRef.current?.disconnect();
    readOnlyConnectionRef.current = null;
    setRealConnectionPhase("idle");
    setDeviceIdentity(null);
    setLastFailureRawBytes(null);
    setConnectError(null);
    setMode("unselected");
  }, []);

  const chooseRealDevice = useCallback(async () => {
    if (isReadOnlyDeviceConnectionEnabled()) {
      await connectReadOnlyDevice();
      return;
    }

    // Unchanged from before Phase 2A: real flashing stays disabled
    // regardless of this flag, and WebSerialTransport still implements no
    // real transmission — see src/lib/webserial/WebSerialTransport.ts.
    setMode("real");
    setConnectError(null);
    setConnecting(true);
    setDeviceConnected(false);
    const transport = new WebSerialTransport();
    ensureEngine(transport);
    try {
      await transport.connect();
      setDeviceConnected(true);
    } catch (error) {
      const code =
        error instanceof Error && error.name === "RealFlashingDisabledError"
          ? "REAL_FLASHING_DISABLED"
          : "TRANSPORT_FAILURE";
      setConnectError(presentError(code));
    } finally {
      setConnecting(false);
    }
  }, [connectReadOnlyDevice, ensureEngine]);

  const loadFirmwareFile = useCallback((file: FirmwareFile) => {
    const engine = engineRef.current;
    if (!engine) return;
    setFirmware({ name: file.name, size: file.bytes.length });
    setValidation("validating");
    setValidationError(null);
    engine.loadFirmware(file);
    void engine.validate().then(() => {
      if (engine.getState() === "ready") {
        setValidation("valid");
      } else {
        setValidation("invalid");
        setValidationError(presentError(latestErrorCode(engine.getEventLog())));
      }
    });
  }, []);

  const chooseFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      loadFirmwareFile({ name: file.name, bytes: new Uint8Array(buffer) });
    },
    [loadFirmwareFile],
  );

  const useSampleFirmware = useCallback(() => {
    loadFirmwareFile(createSampleMcuMainFirmware());
  }, [loadFirmwareFile]);

  const startUpdate = useCallback(async () => {
    await engineRef.current?.start();
  }, []);

  const cancelUpdate = useCallback(() => {
    engineRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    setFirmware(null);
    setValidation("idle");
    setValidationError(null);
    forceUpdate();
  }, [forceUpdate]);

  const engine = engineRef.current;
  const engineState: UpdateState = engine?.getState() ?? "idle";
  const progress = engine?.getProgress() ?? null;
  const events = eventsRef.current;

  const isRunning = engine?.isRunning() ?? false;
  const isComplete = engineState === "completed";
  const isFailed = engineState === "failed";
  const isCancelled = engineState === "cancelled";

  const runError = useMemo<ErrorPresentation | null>(() => {
    if (!isFailed) return null;
    return presentError(latestErrorCode(events));
  }, [isFailed, events]);

  /** Bench-diagnostic display data: exact bytes/config the read-only path uses, computed once. */
  const readOnlyQueryCommandHex = useMemo(() => toHex(buildVersionQueryCommand(13, "primary")), []);
  const serialConfigSummary = useMemo(
    () =>
      `${DEFAULT_SERIAL_OPTIONS.baudRate} baud, ${DEFAULT_SERIAL_OPTIONS.dataBits} data bits, ` +
      `${DEFAULT_SERIAL_OPTIONS.stopBits} stop bit, parity ${DEFAULT_SERIAL_OPTIONS.parity}, ` +
      `flow control ${DEFAULT_SERIAL_OPTIONS.flowControl} · ${DEFAULT_QUERY_TIMEOUT_MS}ms timeout`,
    [],
  );

  const readiness = useMemo(
    () => ({
      deviceConnected,
      firmwareValid: validation === "valid",
      allReady: deviceConnected && validation === "valid" && engineState === "ready",
    }),
    [deviceConnected, validation, engineState],
  );

  useEffect(() => {
    if (!isRunning) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  return {
    browserCompatibility,
    mode,
    deviceConnected,
    connecting,
    connectError,
    firmware,
    validation,
    validationError,
    realConnectionPhase,
    deviceIdentity,
    lastFailureRawBytes,
    readOnlyQueryCommandHex,
    serialConfigSummary,
    engineState,
    progress,
    isRunning,
    isComplete,
    isFailed,
    isCancelled,
    runError,
    events,
    readiness,
    realFlashingFlagEnabled: isRealFlashingFlagEnabled(),
    readOnlyDeviceConnectionEnabled: isReadOnlyDeviceConnectionEnabled(),
    actions: {
      chooseDemoMode,
      chooseRealDevice,
      disconnectRealDevice,
      chooseFile,
      useSampleFirmware,
      startUpdate,
      cancelUpdate,
      reset,
    },
  };
}

export type FirmwareUpdaterController = ReturnType<typeof useFirmwareUpdater>;
