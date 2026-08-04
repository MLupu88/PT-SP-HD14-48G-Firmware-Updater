import type { HardwareValidationAcknowledgements } from "../../lib/webserial/hardwareValidation";
import { REQUIRED_TYPED_CONFIRMATION } from "../../lib/webserial/hardwareValidation";
import {
  HARDWARE_VALIDATION_HEADING,
  HARDWARE_VALIDATION_INTRO,
  HARDWARE_VALIDATION_NO_RECOVERY_WARNING,
} from "../copy";

interface HardwareValidationStageProps {
  readonly installedVersion: string | null;
  readonly firmwareName: string | null;
  readonly firmwareHasProductToken: boolean;
  readonly acknowledgements: HardwareValidationAcknowledgements;
  readonly onToggleAcknowledgement: (key: keyof HardwareValidationAcknowledgements) => void;
  readonly requiresVersionWarning: boolean;
  readonly typedConfirmation: string;
  readonly onTypedConfirmationChange: (value: string) => void;
  readonly gateOpen: boolean;
  /** True from the moment "Start update" is clicked until the update actually starts — guards against a rapid double click requesting a second wake lock (see M2, Phase 2B pre-commit safety review). */
  readonly starting: boolean;
  readonly onStart: () => void;
  readonly onBack: () => void;
}

export function HardwareValidationStage({
  installedVersion,
  firmwareName,
  firmwareHasProductToken,
  acknowledgements,
  onToggleAcknowledgement,
  requiresVersionWarning,
  typedConfirmation,
  onTypedConfirmationChange,
  gateOpen,
  starting,
  onStart,
  onBack,
}: HardwareValidationStageProps) {
  return (
    <section className="stage stage-hardware-validation">
      <p className="status-line">
        <span className="status-dot warn" aria-hidden="true" />
        {HARDWARE_VALIDATION_HEADING}
      </p>
      <p className="stage-subtitle">{HARDWARE_VALIDATION_INTRO}</p>

      <div className="diagnostic-facts">
        <div>
          <span className="label">Installed firmware</span>
          {installedVersion ?? "unknown"}
        </div>
        <div>
          <span className="label">Selected file</span>
          {firmwareName ?? "none"}
        </div>
        <div>
          <span className="label">Contains product token</span>
          {firmwareHasProductToken ? "yes" : "no"}
        </div>
      </div>

      <ul className="hardware-validation-checklist">
        <li>
          <label>
            <input
              type="checkbox"
              checked={acknowledgements.physicallyLabeled}
              onChange={() => onToggleAcknowledgement("physicallyLabeled")}
            />
            I have physically read the PT-SP-HD14-48G label on this device.
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={acknowledgements.stablePower}
              onChange={() => onToggleAcknowledgement("stablePower")}
            />
            This device has stable power.
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={acknowledgements.stayConnected}
              onChange={() => onToggleAcknowledgement("stayConnected")}
            />
            USB and power will remain connected for the entire update.
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={acknowledgements.noRecoveryPathAcknowledged}
              onChange={() => onToggleAcknowledgement("noRecoveryPathAcknowledged")}
            />
            {HARDWARE_VALIDATION_NO_RECOVERY_WARNING}
          </label>
        </li>
        {requiresVersionWarning && (
          <li>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.sameOrDowngradeVersionAcknowledged}
                onChange={() => onToggleAcknowledgement("sameOrDowngradeVersionAcknowledged")}
              />
              This file is the same version as, or older than, the installed firmware. I want to install it anyway.
            </label>
          </li>
        )}
      </ul>

      <div className="stage-actions">
        <label className="hardware-validation-confirm-label" htmlFor="hardware-validation-confirm">
          Type {REQUIRED_TYPED_CONFIRMATION} to confirm
        </label>
        <input
          id="hardware-validation-confirm"
          type="text"
          className="hardware-validation-confirm-input"
          value={typedConfirmation}
          onChange={(event) => onTypedConfirmationChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        <button type="button" className="btn-primary btn-large" onClick={onStart} disabled={!gateOpen || starting}>
          Start update
        </button>
        <button type="button" className="btn-plain" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
