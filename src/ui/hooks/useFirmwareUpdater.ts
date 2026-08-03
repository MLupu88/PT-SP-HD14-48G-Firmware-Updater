import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FirmwareFile } from "../../lib/gtool";
import { createSampleMcuMainFirmware, SimulatorTransport } from "../../lib/simulator";
import { UpdateEngine } from "../../lib/update-engine";
import type { UpdateEvent, UpdateState, UpdateTransport } from "../../lib/update-engine";
import { getBrowserCompatibility, isRealFlashingFlagEnabled, WebSerialTransport } from "../../lib/webserial";
import type { BrowserCompatibility } from "../../lib/webserial";
import { presentError } from "../copy";
import type { ErrorPresentation } from "../copy";

export type UpdaterMode = "unselected" | "demo" | "real";
export type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

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

  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  const engineRef = useRef<UpdateEngine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<UpdateEvent[]>([]);

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

  const chooseRealDevice = useCallback(async () => {
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
  }, [ensureEngine]);

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
    actions: {
      chooseDemoMode,
      chooseRealDevice,
      chooseFile,
      useSampleFirmware,
      startUpdate,
      cancelUpdate,
      reset,
    },
  };
}

export type FirmwareUpdaterController = ReturnType<typeof useFirmwareUpdater>;
