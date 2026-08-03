import type { UpdateProgress, UpdateState } from "../../lib/update-engine";
import { DO_NOT_DISCONNECT_WARNING, STATE_STATUS_TEXT } from "../copy";

interface ProgressViewProps {
  readonly engineState: UpdateState;
  readonly progress: UpdateProgress | null;
  readonly onCancel: () => void;
}

export function ProgressView({ engineState, progress, onCancel }: ProgressViewProps) {
  const statusText = STATE_STATUS_TEXT[engineState] ?? "Updating";
  const percent = progress?.percent ?? 0;
  const canCancel = engineState === "transferring" || engineState === "retrying" || engineState === "initializing";

  return (
    <section className="card" aria-live="polite">
      <p className="progress-status">{statusText}</p>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-percent">{percent}%</p>
      <div className="warning-banner">{DO_NOT_DISCONNECT_WARNING}</div>
      <div className="btn-row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn btn-danger" onClick={onCancel} disabled={!canCancel}>
          Cancel update
        </button>
      </div>
    </section>
  );
}
