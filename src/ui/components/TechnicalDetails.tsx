import type { UpdateEvent, UpdateProgress, UpdateState } from "../../lib/update-engine";
import type { ErrorPresentation } from "../copy";
import { toDiagnosticRows } from "../diagnostics";

interface TechnicalDetailsProps {
  readonly engineState: UpdateState;
  readonly progress: UpdateProgress | null;
  readonly transportLabel: string;
  readonly events: readonly UpdateEvent[];
  readonly runError: ErrorPresentation | null;
  readonly realFlashingFlagEnabled: boolean;
}

/**
 * Fully collapsed by default. Every protocol term, engine state, transport
 * label, packet count, and diagnostic event lives here so the guided flow
 * above never has to mention them.
 */
export function TechnicalDetails({
  engineState,
  progress,
  transportLabel,
  events,
  runError,
  realFlashingFlagEnabled,
}: TechnicalDetailsProps) {
  const rows = toDiagnosticRows(events);

  return (
    <details className="technical-details">
      <summary>
        Technical details
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="content">
        <div className="diagnostic-facts">
          <div>
            <span className="label">Engine state</span>
            {engineState}
          </div>
          <div>
            <span className="label">Transport</span>
            {transportLabel}
          </div>
          <div>
            <span className="label">Current packet</span>
            {progress ? `${progress.currentPacketIndex + 1} / ${progress.totalPackets}` : "—"}
          </div>
          <div>
            <span className="label">Real flashing</span>
            {realFlashingFlagEnabled ? "flag enabled (inert this build)" : "disabled"}
          </div>
        </div>

        {runError && (
          <div>
            <span className="label" style={{ display: "block", marginBottom: 4 }}>
              Technical code
            </span>
            <code className="technical-code">{runError.technicalCode}</code>
          </div>
        )}

        <div className="event-log" role="log">
          {rows.length === 0 ? (
            <div className="empty">No events yet.</div>
          ) : (
            rows.map((row, index) => (
              <div className={`row ${row.level}`} key={index}>
                <span className="time">{new Date(row.timestamp).toLocaleTimeString()}</span>
                <span>{row.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </details>
  );
}
