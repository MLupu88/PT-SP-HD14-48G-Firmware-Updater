import { useRef } from "react";
import { FIRMWARE_SOURCE_LINE } from "../copy";
import type { ErrorPresentation } from "../copy";
import type { FirmwareInfo, UpdaterMode, ValidationStatus } from "../hooks/useFirmwareUpdater";

interface DeviceStageProps {
  readonly deviceName: string;
  readonly currentVersion: string | null;
  readonly mode: UpdaterMode;
  readonly firmware: FirmwareInfo | null;
  readonly validation: ValidationStatus;
  readonly validationError: ErrorPresentation | null;
  readonly onChooseFile: (file: File) => void;
  readonly onUseSample: () => void;
}

export function DeviceStage({
  deviceName,
  currentVersion,
  mode,
  firmware,
  validation,
  validationError,
  onChooseFile,
  onUseSample,
}: DeviceStageProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="stage stage-device">
      <p className="status-line">
        <span className="status-dot" aria-hidden="true" />
        Connected
      </p>
      <h1 className="display-title">{deviceName}</h1>
      {currentVersion && <p className="stage-subtitle">Currently running {currentVersion}</p>}
      <p className="stage-subtitle">{FIRMWARE_SOURCE_LINE}</p>

      <div className="stage-actions">
        <button type="button" className="btn-primary btn-large" onClick={() => inputRef.current?.click()}>
          Choose firmware
        </button>
        {mode === "demo" && (
          <button type="button" className="btn-plain" onClick={onUseSample}>
            Use a sample file
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".bin"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onChooseFile(file);
          event.target.value = "";
        }}
      />

      {validation === "validating" && <p className="inline-note">Checking firmware…</p>}
      {validation === "invalid" && validationError && (
        <p className="inline-note error" role="alert">
          {validationError.message}
        </p>
      )}
      {firmware && validation !== "invalid" && <p className="file-caption">{firmware.name}</p>}
    </section>
  );
}
