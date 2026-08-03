import type { UpdateEvent, UpdateProgress, UpdateState } from "../../lib/update-engine";
import { STATE_STATUS_TEXT, UPDATING_INSTRUCTION } from "../copy";
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
  readonly onCancel: () => void;
}

const CANCELLABLE_STATES: readonly UpdateState[] = ["initializing", "transferring", "retrying"];

export function UpdatingStage({
  engineState,
  progress,
  transportLabel,
  events,
  runError,
  realFlashingFlagEnabled,
  onCancel,
}: UpdatingStageProps) {
  const statusText = STATE_STATUS_TEXT[engineState] ?? "Updating";
  const canCancel = CANCELLABLE_STATES.includes(engineState);

  return (
    <section className="stage stage-updating">
      <ProgressRing percent={progress?.percent ?? 0} />
      <p className="progress-stage-text" aria-live="polite">
        {statusText}
      </p>
      <p className="hint-text">{UPDATING_INSTRUCTION}</p>

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
