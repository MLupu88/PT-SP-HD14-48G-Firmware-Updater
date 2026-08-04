import type { DeviceIdentityResult } from "../../lib/webserial";
import { DEVICE_IDENTIFIED_HEADING, DEVICE_UNIDENTIFIED_HEADING, REAL_CONNECTION_PHASE_TEXT } from "../copy";
import type { RealConnectionPhase } from "../hooks/useFirmwareUpdater";

interface DeviceStatusStageProps {
  readonly phase: RealConnectionPhase;
  readonly deviceIdentity: DeviceIdentityResult | null;
  /** All three Phase 2B safety flags are true — the "Hardware validation mode" bench path exists in this build. */
  readonly hardwareValidationAvailable: boolean;
  readonly onDisconnect: () => void;
  readonly onContinueToHardwareValidation: () => void;
}

export function DeviceStatusStage({
  phase,
  deviceIdentity,
  hardwareValidationAvailable,
  onDisconnect,
  onContinueToHardwareValidation,
}: DeviceStatusStageProps) {
  if (phase !== "done") {
    return (
      <section className="stage stage-device-status">
        <p className="progress-stage-text" aria-live="polite">
          {REAL_CONNECTION_PHASE_TEXT[phase] ?? "Connecting"}
        </p>
      </section>
    );
  }

  // `compatible` can never be true from this reply alone — see README
  // "Phase 2A". The heading stays honestly non-committal either way; only a
  // checksum-valid reply (not a specific model claim) unlocks the bench path.
  const identified = deviceIdentity?.compatible ?? false;
  const heading = identified ? DEVICE_IDENTIFIED_HEADING : DEVICE_UNIDENTIFIED_HEADING;
  const canOfferHardwareValidation = hardwareValidationAvailable && (deviceIdentity?.checksumValid ?? false);

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
        {canOfferHardwareValidation ? (
          <button type="button" className="btn-primary btn-large" onClick={onContinueToHardwareValidation}>
            Continue to hardware validation
          </button>
        ) : (
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
