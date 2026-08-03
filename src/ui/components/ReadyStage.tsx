import { POWER_REMINDER, READY_LINE } from "../copy";

interface ReadyStageProps {
  readonly currentVersion: string | null;
  readonly selectedVersion: string | null;
  readonly onStart: () => void;
}

export function ReadyStage({ currentVersion, selectedVersion, onStart }: ReadyStageProps) {
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
        <button type="button" className="btn-primary btn-large" onClick={onStart}>
          Update firmware
        </button>
        <p className="hint-text">{POWER_REMINDER}</p>
      </div>
    </section>
  );
}
