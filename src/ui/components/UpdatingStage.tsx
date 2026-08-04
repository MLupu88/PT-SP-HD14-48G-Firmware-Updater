import type { UpdateEvent, UpdateProgress, UpdateState } from "../../lib/update-engine";
import { DO_NOT_DISCONNECT_WARNING, REAL_UPDATE_CANCEL_UNAVAILABLE, STATE_STATUS_TEXT, UPDATING_INSTRUCTION } from "../copy";
import type { ErrorPresentation } from "../copy";
import { ProgressRing } from "./ProgressRing";
import { TechnicalDetails } from "./TechnicalDetails";

interface UpdatingStageProps {
  readonly engineState: UpdateState;
  readonly progress: UpdateProgress | null;
  readonly transportLabel: string;
  readonly events: readonly UpdateEvent[];
  readonly runError: ErrorPresentation | null;
  readonly realFlashingFlagEnabled: boolean;
  /** True only for a real-hardware run (never the demo/simulator), once destructive initialization has begun. */
  readonly isRealHardwareRun: boolean;
  readonly onCancel: () => void;
}

/**
 * Demo/simulator cancellation stays available through the whole run — an
 * offline simulator can always unwind safely. For a real hardware run,
 * cancellation is only ever offered before `start()` is called at all (the
 * "Update firmware" button on `ReadyStage`, not this screen) — see README
 * "Cancellation and interruption safety": no recovered GTool source proves
 * that aborting mid-transfer is safe, so once a real run reaches this
 * screen, no cancel action exists here at all.
 */
const DEMO_CANCELLABLE_STATES: readonly UpdateState[] = ["initializing", "transferring", "retrying"];

export function UpdatingStage({
  engineState,
  progress,
  transportLabel,
  events,
  runError,
  realFlashingFlagEnabled,
  isRealHardwareRun,
  onCancel,
}: UpdatingStageProps) {
  const statusText = STATE_STATUS_TEXT[engineState] ?? "Updating";
  const canCancel = !isRealHardwareRun && DEMO_CANCELLABLE_STATES.includes(engineState);

  return (
    <section className="stage stage-updating">
      <ProgressRing percent={progress?.percent ?? 0} />
      <p className="progress-stage-text" aria-live="polite">
        {statusText}
      </p>
      <p className="hint-text">{UPDATING_INSTRUCTION}</p>
      {isRealHardwareRun && (
        <>
          <p className="hint-text warn">{DO_NOT_DISCONNECT_WARNING}</p>
          <p className="hint-text warn">{REAL_UPDATE_CANCEL_UNAVAILABLE}</p>
        </>
      )}

      {canCancel && (
        <button type="button" className="btn-plain" onClick={onCancel}>
          Cancel
        </button>
      )}

      <TechnicalDetails
        engineState={engineState}
        progress={progress}
        transportLabel={transportLabel}
        events={events}
        runError={runError}
        realFlashingFlagEnabled={realFlashingFlagEnabled}
      />
    </section>
  );
}
