import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildVersionQueryCommand, validateRealMcuMainFirmware } from "../../lib/gtool";
import type { FirmwareFile } from "../../lib/gtool";
import { createSampleMcuMainFirmware, SimulatorTransport } from "../../lib/simulator";
import { classifyRecovery, UpdateEngine } from "../../lib/update-engine";
import type { RecoveryOutcome, UpdateEvent, UpdateState, UpdateTransport } from "../../lib/update-engine";
import {
  acquireWakeLock,
  ConnectionInProgressError,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_SERIAL_OPTIONS,
  DeviceDisconnectedError,
  EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS,
  getBrowserCompatibility,
  interpretCompleteReply,
  isHardwareValidationGateOpen,
  isReadOnlyDeviceConnectionEnabled,
  isRealFirmwareTransferEnabled,
  isRealFlashingFlagEnabled,
  isSameOrDowngradeVersion,
  MalformedFramingError,
  NotConnectedError,
  PortSelectionCancelledError,
  ReadOnlyConnectionDisabledError,
  ReadOnlyDeviceConnection,
  ReadTimeoutError,
  releaseWakeLock,
  REQUIRED_PRODUCT_TOKEN,
  WebSerialTransport,
  WebSerialUnsupportedError,
} from "../../lib/webserial";
import type { BrowserCompatibility, DeviceIdentityResult, HardwareValidationAcknowledgements } from "../../lib/webserial";
import { presentError, presentRealUpdateError } from "../copy";
import type { ErrorPresentation } from "../copy";
import { extractVersionFromFilename } from "../deviceInfo";
import { toHex } from "../diagnostics";

export type UpdaterMode = "unselected" | "demo" | "real";
export type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

/**
 * Phase 2A read-only connection phases. "selecting" covers the native
 * port-picker dialog; "connecting" covers `port.open()`, which follows it;
 * "checking" covers sending the version query and reading the reply. Reused
 * as-is for the Phase 2B hardware-validation connect flow (same three
 * phases, different transport underneath — see `connectHardwareValidationDevice`).
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

function latestCompletedEvent(
  events: readonly UpdateEvent[],
): Extract<UpdateEvent, { type: "completed" }> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === "completed") return event;
  }
  return null;
}

/** Reads a duck-typed `.code` off a thrown error (see readOnlyErrors.ts / transportErrors.ts). */
function errorCode(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return fallback;
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

  /**
   * Phase 2B: true once the operator has moved past the Phase 2A identity
   * check into the "Hardware validation mode" bench flow (all three safety
   * flags true). Distinguishes a real, destructive run from both the demo
   * and the Phase 2A read-only path throughout the rest of this hook.
   */
  const [hardwareValidationStarted, setHardwareValidationStarted] = useState(false);
  const [hwAcknowledgements, setHwAcknowledgements] = useState<HardwareValidationAcknowledgements>(
    EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS,
  );
  const [hwTypedConfirmation, setHwTypedConfirmation] = useState("");

  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  const engineRef = useRef<UpdateEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<UpdateEvent[]>([]);
  const readOnlyConnectionRef = useRef<ReadOnlyDeviceConnection | null>(null);
  /** The real transport, connected once and reused through the entire hardware-validation session. */
  const hardwareTransportRef = useRef<WebSerialTransport | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
  useEffect(() => () => void hardwareTransportRef.current?.disconnect(), []);

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

  /**
   * Phase 2B journey, reachable only when all three safety flags are true.
   * Connects the same real `WebSerialTransport` that will later carry the
   * actual firmware transfer, and sends only the recovered harmless
   * version-query command through it — reusing the exact serial connection
   * ("reuse the selected connection where safe") rather than opening a
   * second one later in `beginHardwareValidation`.
   */
  const connectHardwareValidationDevice = useCallback(async () => {
    setMode("real");
    setConnectError(null);
    setDeviceIdentity(null);
    setLastFailureRawBytes(null);
    setConnecting(true);
    setRealConnectionPhase("selecting");
    const transport = new WebSerialTransport();
    hardwareTransportRef.current = transport;
    try {
      await transport.connect(() => setRealConnectionPhase("connecting"));
      setRealConnectionPhase("checking");
      const command = buildVersionQueryCommand(13, "primary");
      const raw = await transport.sendAndReceive(command, { timeoutMs: DEFAULT_QUERY_TIMEOUT_MS });
      const identity = interpretCompleteReply(
        raw,
        transport.getPortInfo() ?? { usbVendorId: null, usbProductId: null },
      );
      setDeviceIdentity(identity);
      setRealConnectionPhase("done");
    } catch (error) {
      setRealConnectionPhase("idle");
      setConnectError(presentError(errorCode(error, "TRANSPORT_FAILURE")));
      if (error instanceof ReadTimeoutError || error instanceof MalformedFramingError) {
        setLastFailureRawBytes(error.rawBytes);
      }
      void transport.disconnect();
      hardwareTransportRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectRealDevice = useCallback(() => {
    void readOnlyConnectionRef.current?.disconnect();
    readOnlyConnectionRef.current = null;
    void hardwareTransportRef.current?.disconnect();
    hardwareTransportRef.current = null;
    setRealConnectionPhase("idle");
    setDeviceIdentity(null);
    setLastFailureRawBytes(null);
    setConnectError(null);
    setMode("unselected");
    setHardwareValidationStarted(false);
    setHwAcknowledgements(EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS);
    setHwTypedConfirmation("");
  }, []);

  const chooseRealDevice = useCallback(async () => {
    if (isRealFirmwareTransferEnabled()) {
      await connectHardwareValidationDevice();
      return;
    }
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
  }, [connectHardwareValidationDevice, connectReadOnlyDevice, ensureEngine]);

  /**
   * Moves from the Phase 2A-style identity screen into the "Hardware
   * validation mode" bench flow: wires `UpdateEngine` to the already-open
   * `WebSerialTransport` (no new port picker) and clears any stale firmware
   * selection so the strengthened real-path validator runs fresh.
   */
  const beginHardwareValidation = useCallback(() => {
    const transport = hardwareTransportRef.current;
    if (!transport) return;
    ensureEngine(transport);
    setHardwareValidationStarted(true);
    setHwAcknowledgements(EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS);
    setHwTypedConfirmation("");
    setFirmware(null);
    setValidation("idle");
    setValidationError(null);
  }, [ensureEngine]);

  const toggleHwAcknowledgement = useCallback((key: keyof HardwareValidationAcknowledgements) => {
    setHwAcknowledgements((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setHwTypedConfirmationValue = useCallback((value: string) => {
    setHwTypedConfirmation(value);
  }, []);

  const loadFirmwareFile = useCallback(
    (file: FirmwareFile) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (hardwareValidationStarted) {
        try {
          validateRealMcuMainFirmware(file, { requiredProductToken: REQUIRED_PRODUCT_TOKEN });
        } catch {
          setFirmware({ name: file.name, size: file.bytes.length });
          setValidation("invalid");
          setValidationError(presentError("VALIDATION_FAILED"));
          return;
        }
      }

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
    },
    [hardwareValidationStarted],
  );

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

  /**
   * `UpdateEngine.start()`'s own `updateInFlight` guard is set synchronously,
   * but only once `startUpdate` reaches it — after the wake-lock acquisition
   * below, which is itself an `await`. A rapid double click on "Start
   * update" would otherwise let both calls race past that point, each
   * requesting its own wake lock and overwriting `wakeLockRef.current`,
   * leaking one sentinel forever (see M2, Phase 2B pre-commit safety
   * review). This ref is checked and set synchronously, before any await,
   * to close that window.
   */
  const startInProgressRef = useRef(false);
  const [startInProgress, setStartInProgress] = useState(false);

  const startUpdate = useCallback(async () => {
    if (startInProgressRef.current) return;
    startInProgressRef.current = true;
    setStartInProgress(true);

    const isHardware = hardwareValidationStarted;
    try {
      if (isHardware) {
        wakeLockRef.current = await acquireWakeLock();
      }
      await engineRef.current?.start();
    } finally {
      if (isHardware) {
        await releaseWakeLock(wakeLockRef.current);
        wakeLockRef.current = null;
      }
      startInProgressRef.current = false;
      setStartInProgress(false);
    }
  }, [hardwareValidationStarted]);

  const cancelUpdate = useCallback(() => {
    engineRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    setFirmware(null);
    setValidation("idle");
    setValidationError(null);
    setHwAcknowledgements(EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS);
    setHwTypedConfirmation("");
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

  const completedEvent = useMemo(() => latestCompletedEvent(events), [events]);
  const verified = completedEvent ? completedEvent.verified : null;
  const verifiedVersion = completedEvent?.verifiedVersion ?? null;

  const recoveryOutcome = useMemo<RecoveryOutcome | null>(() => {
    if (isFailed || isCancelled || (isComplete && verified === false)) {
      return classifyRecovery(events);
    }
    return null;
  }, [isFailed, isCancelled, isComplete, verified, events]);

  const runError = useMemo<ErrorPresentation | null>(() => {
    if (!isFailed) return null;
    const code = latestErrorCode(events);
    if (hardwareValidationStarted) {
      return presentRealUpdateError(code, recoveryOutcome ?? "unknown");
    }
    return presentError(code);
  }, [isFailed, events, hardwareValidationStarted, recoveryOutcome]);

  /**
   * Handler for the result screen's Done/Try again action (Phase 2B
   * pre-commit safety review, I1). A real hardware run that ended anywhere
   * other than "safe_to_retry" must never let the operator go straight back
   * to firmware selection on a stale device identity and an already-used
   * transport — the device's true state after a partial transfer or an
   * unverified completion is not known, so the next attempt has to start
   * from a fresh port selection and a fresh version-query reply, exactly
   * like a first-time connection (see README "Recovery model"). Anything
   * else — a demo run, a fully verified success, or a safe
   * pre-initialization failure — keeps the existing lightweight reset.
   */
  const finishResult = useCallback(() => {
    const unsafeRealFailure =
      hardwareValidationStarted && recoveryOutcome !== null && recoveryOutcome !== "safe_to_retry";

    if (unsafeRealFailure) {
      void hardwareTransportRef.current?.disconnect();
      hardwareTransportRef.current = null;
      setDeviceIdentity(null);
      setLastFailureRawBytes(null);
      setConnectError(null);
      setRealConnectionPhase("idle");
      setHardwareValidationStarted(false);
      setMode("unselected");
    }

    reset();
  }, [hardwareValidationStarted, recoveryOutcome, reset]);

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

  const firmwareHasProductToken = useMemo(
    () => (firmware ? firmware.name.includes(REQUIRED_PRODUCT_TOKEN) : false),
    [firmware],
  );
  const selectedVersion = useMemo(
    () => (firmware ? extractVersionFromFilename(firmware.name) : null),
    [firmware],
  );
  const requiresVersionWarning = useMemo(
    () => isSameOrDowngradeVersion(deviceIdentity?.version?.versionString ?? null, selectedVersion),
    [deviceIdentity, selectedVersion],
  );
  const hardwareValidationGateOpen = useMemo(
    () =>
      isHardwareValidationGateOpen({
        deviceReplyValid: deviceIdentity?.checksumValid ?? false,
        firmwareFilenameHasProductToken: firmwareHasProductToken,
        firmwareIsValidMcuMainBin: validation === "valid",
        typedConfirmation: hwTypedConfirmation,
        acknowledgements: hwAcknowledgements,
        requiresVersionWarningAcknowledgement: requiresVersionWarning,
      }),
    [deviceIdentity, firmwareHasProductToken, validation, hwTypedConfirmation, hwAcknowledgements, requiresVersionWarning],
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
    startInProgress,
    runError,
    verified,
    verifiedVersion,
    recoveryOutcome,
    events,
    readiness,
    realFlashingFlagEnabled: isRealFlashingFlagEnabled(),
    readOnlyDeviceConnectionEnabled: isReadOnlyDeviceConnectionEnabled(),
    hardwareValidationAvailable: isRealFirmwareTransferEnabled(),
    hardwareValidationStarted,
    hwAcknowledgements,
    hwTypedConfirmation,
    firmwareHasProductToken,
    selectedVersion,
    requiresVersionWarning,
    hardwareValidationGateOpen,
    actions: {
      chooseDemoMode,
      chooseRealDevice,
      disconnectRealDevice,
      beginHardwareValidation,
      toggleHwAcknowledgement,
      setHwTypedConfirmation: setHwTypedConfirmationValue,
      chooseFile,
      useSampleFirmware,
      startUpdate,
      cancelUpdate,
      reset,
      finishResult,
    },
  };
}

export type FirmwareUpdaterController = ReturnType<typeof useFirmwareUpdater>;
