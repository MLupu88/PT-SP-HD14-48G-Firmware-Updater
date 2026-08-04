import type { RecoveryOutcome, UpdateEvent, UpdateProgress, UpdateState } from "../../lib/update-engine";
import { CANCELLED_MESSAGE, UPDATE_TRANSFERRED_UNVERIFIED_MESSAGE, UPDATE_TRANSFERRED_UNVERIFIED_TITLE } from "../copy";
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
  /**
   * `null` unless `outcome === "completed"`. `false` means the transfer
   * itself succeeded (the final packet was accepted) but the best-effort
   * post-update version query could not confirm it — a distinct, still
   * successful outcome, never shown as a failure (see README "Recovery model").
   */
  readonly verified: boolean | null;
  /** True only for a real-hardware run whose failure did not occur before destructive initialization began. */
  readonly isRealHardwareRun: boolean;
  readonly recoveryOutcome: RecoveryOutcome | null;
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
  verified,
  isRealHardwareRun,
  recoveryOutcome,
}: ResultStageProps) {
  const unverified = outcome === "completed" && verified === false;

  const title = unverified
    ? UPDATE_TRANSFERRED_UNVERIFIED_TITLE
    : outcome === "completed"
      ? "Update complete"
      : outcome === "cancelled"
        ? "Update cancelled"
        : (error?.title ?? "We couldn't finish the update");

  const message = unverified
    ? UPDATE_TRANSFERRED_UNVERIFIED_MESSAGE
    : outcome === "completed"
      ? installedVersion
        ? `${installedVersion} is installed.`
        : "Your device is up to date."
      : outcome === "cancelled"
        ? CANCELLED_MESSAGE
        : error?.message;

  // Never offered as an automatic retry for a real hardware run unless the
  // failure happened before any destructive command was sent — see README
  // "Recovery model": only "safe_to_retry" gets a "Try again" action.
  const offerAutomaticRetry =
    outcome === "failed" && (!isRealHardwareRun || recoveryOutcome === "safe_to_retry");

  return (
    <section className="stage stage-result">
      {outcome === "completed" ? (
        <div className={`result-mark ${unverified ? "neutral" : "check"}`}>
          {unverified ? "?" : <Logo width={32} />}
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
          {outcome === "failed" && offerAutomaticRetry ? "Try again" : "Done"}
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
