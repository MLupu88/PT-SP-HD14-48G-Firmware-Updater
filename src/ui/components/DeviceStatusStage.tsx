import type { DeviceIdentityResult } from "../../lib/webserial";
import { DEVICE_IDENTIFIED_HEADING, DEVICE_UNIDENTIFIED_HEADING, REAL_CONNECTION_PHASE_TEXT } from "../copy";
import type { RealConnectionPhase } from "../hooks/useFirmwareUpdater";

interface DeviceStatusStageProps {
  readonly phase: RealConnectionPhase;
  readonly deviceIdentity: DeviceIdentityResult | null;
  readonly onDisconnect: () => void;
}

export function DeviceStatusStage({ phase, deviceIdentity, onDisconnect }: DeviceStatusStageProps) {
  if (phase !== "done") {
    return (
      <section className="stage stage-device-status">
        <p className="progress-stage-text" aria-live="polite">
          {REAL_CONNECTION_PHASE_TEXT[phase] ?? "Connecting"}
        </p>
      </section>
    );
  }

  const identified = deviceIdentity?.compatible ?? false;
  const heading = identified ? DEVICE_IDENTIFIED_HEADING : DEVICE_UNIDENTIFIED_HEADING;

  return (
    <section className="stage stage-device-status">
      <p className="status-line">
        <span className="status-dot" aria-hidden="true" />
        {heading}
      </p>
      {deviceIdentity?.version && (
        <p className="stage-subtitle">Installed firmware: {deviceIdentity.version.versionString}</p>
      )}
      {deviceIdentity && <p className="stage-subtitle">{deviceIdentity.deviceLabel}</p>}

      <div className="stage-actions">
        {/* Only rendered once a genuine model match exists (DeviceIdentityResult.compatible).
            The recovered version-query reply carries no device/model name field, so this can
            never be true in Phase 2A — see README "Phase 2A". Kept for forward-compatibility;
            intentionally not wired to firmware transfer regardless. */}
        {identified && (
          <button
            type="button"
            className="btn-primary btn-large"
            disabled
            title="Firmware updates for connected devices aren't available in this version yet."
          >
            Choose firmware
          </button>
        )}
        <button type="button" className="btn-plain" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
