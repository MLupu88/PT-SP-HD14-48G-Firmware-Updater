import type { UpdateEvent, UpdateProgress, UpdateState } from "../../lib/update-engine";
import { CANCELLED_MESSAGE } from "../copy";
import type { ErrorPresentation } from "../copy";
import { Logo } from "./Logo";
import { TechnicalDetails } from "./TechnicalDetails";

interface ResultStageProps {
  readonly outcome: "completed" | "failed" | "cancelled";
  readonly installedVersion: string | null;
  readonly error: ErrorPresentation | null;
  readonly onDone: () => void;
  readonly engineState: UpdateState;
  readonly progress: UpdateProgress | null;
  readonly transportLabel: string;
  readonly events: readonly UpdateEvent[];
  readonly realFlashingFlagEnabled: boolean;
}

export function ResultStage({
  outcome,
  installedVersion,
  error,
  onDone,
  engineState,
  progress,
  transportLabel,
  events,
  realFlashingFlagEnabled,
}: ResultStageProps) {
  const title =
    outcome === "completed"
      ? "Update complete"
      : outcome === "cancelled"
        ? "Update cancelled"
        : (error?.title ?? "We couldn't finish the update");

  const message =
    outcome === "completed"
      ? installedVersion
        ? `${installedVersion} is installed.`
        : "Your device is up to date."
      : outcome === "cancelled"
        ? CANCELLED_MESSAGE
        : error?.message;

  return (
    <section className="stage stage-result">
      {outcome === "completed" ? (
        <div className="result-mark check">
          <Logo width={32} />
        </div>
      ) : (
        <div className={`result-mark ${outcome === "cancelled" ? "neutral" : "error"}`} aria-hidden="true">
          {outcome === "cancelled" ? "↺" : "!"}
        </div>
      )}

      <h1 className="display-title">{title}</h1>
      {message && <p className="stage-subtitle">{message}</p>}
      {outcome === "failed" && error && <p className="hint-text">{error.nextAction}</p>}

      <div className="stage-actions">
        <button type="button" className="btn-primary btn-large" onClick={onDone}>
          {outcome === "completed" ? "Done" : "Try again"}
        </button>
      </div>

      <TechnicalDetails
        engineState={engineState}
        progress={progress}
        transportLabel={transportLabel}
        events={events}
        runError={outcome === "failed" ? error : null}
        realFlashingFlagEnabled={realFlashingFlagEnabled}
      />
    </section>
  );
}
