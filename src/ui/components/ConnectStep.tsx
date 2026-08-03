import type { BrowserCompatibility } from "../../lib/webserial";
import type { ErrorPresentation } from "../copy";
import type { UpdaterMode } from "../hooks/useFirmwareUpdater";

interface ConnectStepProps {
  readonly mode: UpdaterMode;
  readonly deviceConnected: boolean;
  readonly connecting: boolean;
  readonly connectError: ErrorPresentation | null;
  readonly browserCompatibility: BrowserCompatibility;
  readonly onChooseDemo: () => void;
  readonly onChooseReal: () => void;
}

export function ConnectStep({
  mode,
  deviceConnected,
  connecting,
  connectError,
  browserCompatibility,
  onChooseDemo,
  onChooseReal,
}: ConnectStepProps) {
  return (
    <section className="card">
      <h2>Connect your device</h2>
      <p className="help">Choose how you'd like to update your device.</p>

      <div className="mode-options">
        <button
          type="button"
          className="mode-option"
          onClick={onChooseDemo}
          disabled={mode === "demo" && deviceConnected}
        >
          <span className="badge">Recommended</span>
          <strong>Try the demo</strong>
          <span className="detail">
            See exactly how an update works with no real device required. Nothing on your computer
            or any device is changed.
          </span>
        </button>

        <button
          type="button"
          className="mode-option"
          onClick={onChooseReal}
          disabled={!browserCompatibility.supported || connecting}
        >
          <span className="badge muted">Coming soon</span>
          <strong>Connect your device</strong>
          <span className="detail">
            {browserCompatibility.supported
              ? "Real device updates aren't available in this version yet."
              : browserCompatibility.reason}
          </span>
        </button>
      </div>

      {mode === "demo" && deviceConnected && (
        <p className="status-pill connected">
          <span className="dot" aria-hidden="true" />
          Demo device connected
        </p>
      )}

      {mode === "real" && connecting && (
        <p className="status-pill pending">
          <span className="dot" aria-hidden="true" />
          Connecting…
        </p>
      )}

      {connectError && (
        <div role="alert" className="warning-banner">
          {connectError.message}
        </div>
      )}
    </section>
  );
}
