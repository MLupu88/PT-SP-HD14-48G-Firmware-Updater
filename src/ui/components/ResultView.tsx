import type { ErrorPresentation } from "../copy";

interface ResultViewProps {
  readonly outcome: "completed" | "failed" | "cancelled";
  readonly error: ErrorPresentation | null;
  readonly onRestart: () => void;
}

export function ResultView({ outcome, error, onRestart }: ResultViewProps) {
  if (outcome === "completed") {
    return (
      <section className="card">
        <div className="result-icon success" aria-hidden="true">
          ✓
        </div>
        <p className="result-title">Update complete</p>
        <p className="result-message">Your device has been updated successfully.</p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            Update another file
          </button>
        </div>
      </section>
    );
  }

  if (outcome === "cancelled") {
    return (
      <section className="card">
        <div className="result-icon neutral" aria-hidden="true">
          ↺
        </div>
        <p className="result-title">Update cancelled</p>
        <p className="result-message">
          The update was stopped before it finished. Your device was not left in a partially updated
          state by this step.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="result-icon error" aria-hidden="true">
        !
      </div>
      <p className="result-title">We could not complete the update</p>
      <p className="result-message">{error?.message}</p>
      {error && <p className="next-action">{error.nextAction}</p>}
      <div className="btn-row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={onRestart}>
          Try again
        </button>
      </div>
    </section>
  );
}
