import { BenchDiagnostics } from "./ui/components/BenchDiagnostics";
import { ConnectStage } from "./ui/components/ConnectStage";
import { DemoBadge } from "./ui/components/DemoBadge";
import { DeviceStage } from "./ui/components/DeviceStage";
import { DeviceStatusStage } from "./ui/components/DeviceStatusStage";
import { Logo } from "./ui/components/Logo";
import { ReadyStage } from "./ui/components/ReadyStage";
import { ResultStage } from "./ui/components/ResultStage";
import { UpdatingStage } from "./ui/components/UpdatingStage";
import { PRIVACY_FOOTER } from "./ui/copy";
import { DEMO_CURRENT_VERSION, DEVICE_DISPLAY_NAME, extractVersionFromFilename } from "./ui/deviceInfo";
import { useFirmwareUpdater } from "./ui/hooks/useFirmwareUpdater";
import type { RealConnectionPhase, UpdaterMode } from "./ui/hooks/useFirmwareUpdater";

type Stage = "connect" | "device_status" | "choose" | "ready" | "updating" | "result";

function computeStage(
  mode: UpdaterMode,
  realConnectionPhase: RealConnectionPhase,
  deviceConnected: boolean,
  firmwareValid: boolean,
  isRunning: boolean,
  isFinished: boolean,
): Stage {
  if (isRunning) return "updating";
  if (isFinished) return "result";
  // The real read-only journey is routed entirely separately from the
  // demo/update pipeline below: it can never reach "ready"/"updating" for
  // an actual device, only its own connect/device_status pair.
  if (mode === "real" && realConnectionPhase !== "idle") return "device_status";
  if (!deviceConnected) return "connect";
  if (!firmwareValid) return "choose";
  return "ready";
}

export default function App() {
  const {
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
    realFlashingFlagEnabled,
    actions,
  } = useFirmwareUpdater();

  const isFinished = isComplete || isFailed || isCancelled;
  const stage = computeStage(
    mode,
    realConnectionPhase,
    deviceConnected,
    readiness.firmwareValid,
    isRunning,
    isFinished,
  );

  const transportLabel = mode === "demo" ? "Simulator" : mode === "real" ? "Web Serial (real device)" : "—";
  const currentVersion = mode === "demo" && deviceConnected ? DEMO_CURRENT_VERSION : null;
  const selectedVersion = firmware ? extractVersionFromFilename(firmware.name) : null;
  const outcome = isComplete ? "completed" : isCancelled ? "cancelled" : "failed";
  const showBenchDiagnostics = mode === "real" && (realConnectionPhase !== "idle" || deviceIdentity || connectError);

  return (
    <div className="shell">
      <header className="top-bar">
        <Logo width={28} />
        {mode === "demo" && <DemoBadge />}
      </header>

      <main className="stage-viewport">
        <div key={stage} className="stage-transition">
          {stage === "connect" && (
            <ConnectStage
              connecting={connecting}
              connectError={connectError}
              browserCompatibility={browserCompatibility}
              onConnect={() => void actions.chooseRealDevice()}
              onDemo={actions.chooseDemoMode}
            />
          )}

          {stage === "device_status" && (
            <DeviceStatusStage
              phase={realConnectionPhase}
              deviceIdentity={deviceIdentity}
              onDisconnect={actions.disconnectRealDevice}
            />
          )}

          {stage === "choose" && (
            <DeviceStage
              deviceName={DEVICE_DISPLAY_NAME}
              currentVersion={currentVersion}
              mode={mode}
              firmware={firmware}
              validation={validation}
              validationError={validationError}
              onChooseFile={(file) => void actions.chooseFile(file)}
              onUseSample={actions.useSampleFirmware}
            />
          )}

          {stage === "ready" && (
            <ReadyStage
              currentVersion={currentVersion}
              selectedVersion={selectedVersion}
              onStart={() => void actions.startUpdate()}
            />
          )}

          {stage === "updating" && (
            <UpdatingStage
              engineState={engineState}
              progress={progress}
              transportLabel={transportLabel}
              events={events}
              runError={runError}
              realFlashingFlagEnabled={realFlashingFlagEnabled}
              onCancel={actions.cancelUpdate}
            />
          )}

          {stage === "result" && (
            <ResultStage
              outcome={outcome}
              installedVersion={selectedVersion}
              error={runError}
              onDone={actions.reset}
              engineState={engineState}
              progress={progress}
              transportLabel={transportLabel}
              events={events}
              realFlashingFlagEnabled={realFlashingFlagEnabled}
            />
          )}
        </div>

        {showBenchDiagnostics && (
          <BenchDiagnostics
            port={deviceIdentity?.port ?? null}
            serialConfigSummary={serialConfigSummary}
            queryCommandHex={readOnlyQueryCommandHex}
            deviceIdentity={deviceIdentity}
            connectError={connectError}
            failureRawBytes={lastFailureRawBytes}
          />
        )}
      </main>

      <footer className="app-footer">{PRIVACY_FOOTER}</footer>
    </div>
  );
}
