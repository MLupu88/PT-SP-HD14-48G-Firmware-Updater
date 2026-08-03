import type { BrowserCompatibility } from "../../lib/webserial";
import { CONNECT_SUBTITLE, DEMO_EXPLANATION, PRODUCT_TITLE } from "../copy";
import type { ErrorPresentation } from "../copy";
import { Logo } from "./Logo";

interface ConnectStageProps {
  readonly connecting: boolean;
  readonly connectError: ErrorPresentation | null;
  readonly browserCompatibility: BrowserCompatibility;
  readonly onConnect: () => void;
  readonly onDemo: () => void;
}

export function ConnectStage({
  connecting,
  connectError,
  browserCompatibility,
  onConnect,
  onDemo,
}: ConnectStageProps) {
  return (
    <section className="stage stage-connect">
      <h1 className="display-title">{PRODUCT_TITLE}</h1>
      <p className="stage-subtitle">{CONNECT_SUBTITLE}</p>

      <div className="hero-visual" aria-hidden="true">
        <Logo size={72} />
      </div>

      <div className="stage-actions">
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={onConnect}
          disabled={connecting || !browserCompatibility.supported}
        >
          {connecting ? "Connecting…" : "Connect device"}
        </button>
        <button type="button" className="btn-plain" onClick={onDemo}>
          Try demo
        </button>
        <p className="hint-text">
          {browserCompatibility.supported ? DEMO_EXPLANATION : browserCompatibility.reason}
        </p>
      </div>

      {connectError && (
        <p className="inline-note" role="alert">
          {connectError.message} {connectError.nextAction}
        </p>
      )}
    </section>
  );
}
