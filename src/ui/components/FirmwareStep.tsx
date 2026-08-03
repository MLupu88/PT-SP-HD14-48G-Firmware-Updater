import { useRef } from "react";
import type { ErrorPresentation } from "../copy";
import type { FirmwareInfo, ValidationStatus } from "../hooks/useFirmwareUpdater";

interface FirmwareStepProps {
  readonly firmware: FirmwareInfo | null;
  readonly validation: ValidationStatus;
  readonly validationError: ErrorPresentation | null;
  readonly onChooseFile: (file: File) => void;
  readonly onUseSample: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

export function FirmwareStep({
  firmware,
  validation,
  validationError,
  onChooseFile,
  onUseSample,
}: FirmwareStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="card">
      <h2>Choose firmware file</h2>
      <p className="help">Select the update file you downloaded for your device.</p>

      {!firmware && (
        <div className="file-drop">
          <p className="help" style={{ margin: 0 }}>
            No file selected yet.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              Choose file
            </button>
            <button type="button" className="btn-link" onClick={onUseSample}>
              Use a sample demo file instead
            </button>
          </div>
        </div>
      )}

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

      {firmware && (
        <>
          <div className="file-picked">
            <div>
              <div className="name">{firmware.name}</div>
              <div className="size">{formatSize(firmware.size)}</div>
            </div>
            <button type="button" className="btn-link" onClick={() => inputRef.current?.click()}>
              Change
            </button>
          </div>

          {validation === "validating" && (
            <p className="status-pill pending">
              <span className="dot" aria-hidden="true" />
              Checking your firmware file…
            </p>
          )}

          {validation === "valid" && (
            <p className="status-pill connected">
              <span className="dot" aria-hidden="true" />
              This file matches your device
            </p>
          )}

          {validation === "invalid" && validationError && (
            <div role="alert" className="warning-banner">
              {validationError.message}
            </div>
          )}
        </>
      )}
    </section>
  );
}
