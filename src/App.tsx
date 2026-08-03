import { AdvancedDetails } from "./ui/components/AdvancedDetails";
import { ConnectStep } from "./ui/components/ConnectStep";
import { DemoModeBanner } from "./ui/components/DemoModeBanner";
import { FirmwareStep } from "./ui/components/FirmwareStep";
import { ProgressView } from "./ui/components/ProgressView";
import { ReadinessChecklist } from "./ui/components/ReadinessChecklist";
import { ResultView } from "./ui/components/ResultView";
import { StepIndicator, type StepIndex } from "./ui/components/StepIndicator";
import { DESIGN_PRINCIPLE, PRODUCT_NAME } from "./ui/copy";
import { useFirmwareUpdater } from "./ui/hooks/useFirmwareUpdater";

function currentStep(
  deviceConnected: boolean,
  validationValid: boolean,
  isRunning: boolean,
  isFinished: boolean,
): StepIndex {
  if (isRunning) return 3;
  if (isFinished) return 4;
  if (!deviceConnected) return 0;
  if (!validationValid) return 1;
  return 2;
}

export default function App() {
  const controller = useFirmwareUpdater();
  const {
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
    realFlashingFlagEnabled,
    actions,
  } = controller;

  const isFinished = isComplete || isFailed || isCancelled;
  const step = currentStep(deviceConnected, readiness.firmwareValid, isRunning, isFinished);
  const transportLabel = mode === "demo" ? "Simulator" : mode === "real" ? "Web Serial (real device)" : "—";

  return (
    <div className="page">
      <header className="app-header">
        <h1>{PRODUCT_NAME}</h1>
        <p className="tagline">{DESIGN_PRINCIPLE}</p>
        <p className={`compatibility-line ${browserCompatibility.supported ? "" : "unsupported"}`.trim()}>
          {browserCompatibility.supported
            ? "Your browser supports connecting to a real device."
            : browserCompatibility.reason}
        </p>
      </header>

      {mode === "demo" && <DemoModeBanner />}

      <StepIndicator current={step} />

      <main style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {!isRunning && !isFinished && (
          <>
            <ConnectStep
              mode={mode}
              deviceConnected={deviceConnected}
              connecting={connecting}
              connectError={connectError}
              browserCompatibility={browserCompatibility}
              onChooseDemo={actions.chooseDemoMode}
              onChooseReal={actions.chooseRealDevice}
            />

            {deviceConnected && (
              <FirmwareStep
                firmware={firmware}
                validation={validation}
                validationError={validationError}
                onChooseFile={(file) => void actions.chooseFile(file)}
                onUseSample={actions.useSampleFirmware}
              />
            )}

            {deviceConnected && firmware && (
              <ReadinessChecklist
                deviceConnected={readiness.deviceConnected}
                firmwareValid={readiness.firmwareValid}
                allReady={readiness.allReady}
                onStart={() => void actions.startUpdate()}
              />
            )}
          </>
        )}

        {isRunning && (
          <ProgressView engineState={engineState} progress={progress} onCancel={actions.cancelUpdate} />
        )}

        {isFinished && (
          <ResultView
            outcome={isComplete ? "completed" : isCancelled ? "cancelled" : "failed"}
            error={runError}
            onRestart={actions.reset}
          />
        )}

        <AdvancedDetails
          engineState={engineState}
          progress={progress}
          transportLabel={transportLabel}
          events={events}
          runError={runError}
          realFlashingFlagEnabled={realFlashingFlagEnabled}
        />
      </main>

      <footer className="app-footer">
        <span>Real firmware flashing is disabled in this build.</span>
        <span>Firmware files stay on your computer and are never uploaded.</span>
      </footer>
    </div>
  );
}
