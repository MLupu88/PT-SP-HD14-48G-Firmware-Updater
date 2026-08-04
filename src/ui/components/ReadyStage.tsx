import { POWER_REMINDER, READY_LINE } from "../copy";

interface ReadyStageProps {
  readonly currentVersion: string | null;
  readonly selectedVersion: string | null;
  /** True from the moment "Update firmware" is clicked until the update actually starts — guards against a rapid double click requesting a second wake lock (see M2, Phase 2B pre-commit safety review). */
  readonly starting: boolean;
  readonly onStart: () => void;
}

export function ReadyStage({ currentVersion, selectedVersion, starting, onStart }: ReadyStageProps) {
  const title = selectedVersion ?? "New firmware";
  const subtitle =
    currentVersion && selectedVersion
      ? `Updating from ${currentVersion} to ${selectedVersion}.`
      : READY_LINE;

  return (
    <section className="stage stage-ready">
      <h1 className="display-title">{title}</h1>
      <p className="stage-subtitle">{subtitle}</p>

      <div className="stage-actions">
        <button type="button" className="btn-primary btn-large" onClick={onStart} disabled={starting}>
          Update firmware
        </button>
        <p className="hint-text">{POWER_REMINDER}</p>
      </div>
    </section>
  );
}
