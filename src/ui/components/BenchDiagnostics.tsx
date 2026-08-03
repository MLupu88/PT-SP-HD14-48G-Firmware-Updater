import type { DeviceIdentityResult, SerialPortSummary } from "../../lib/webserial";
import { toHex } from "../diagnostics";
import type { ErrorPresentation } from "../copy";

interface BenchDiagnosticsProps {
  readonly port: SerialPortSummary | null;
  readonly serialConfigSummary: string;
  readonly queryCommandHex: string;
  readonly deviceIdentity: DeviceIdentityResult | null;
  readonly connectError: ErrorPresentation | null;
  readonly failureRawBytes: Uint8Array | null;
}

function formatUsbId(id: number | null): string {
  if (id === null) return "unavailable";
  return `0x${id.toString(16).padStart(4, "0").toUpperCase()}`;
}

/**
 * Collapsed, bench-test-only diagnostic panel for Phase 2A. Read-only by
 * design: it only ever displays data already produced by
 * `ReadOnlyDeviceConnection` — there is no terminal, no free-text command
 * field, and no way to send arbitrary bytes from here.
 */
export function BenchDiagnostics({
  port,
  serialConfigSummary,
  queryCommandHex,
  deviceIdentity,
  connectError,
  failureRawBytes,
}: BenchDiagnosticsProps) {
  const rawBytes = deviceIdentity?.rawReplyBytes ?? failureRawBytes;

  return (
    <details className="technical-details bench-diagnostics">
      <summary>
        Bench test diagnostics
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="content">
        <div className="diagnostic-facts">
          <div>
            <span className="label">USB vendor ID</span>
            {formatUsbId(port?.usbVendorId ?? null)}
          </div>
          <div>
            <span className="label">USB product ID</span>
            {formatUsbId(port?.usbProductId ?? null)}
          </div>
          <div>
            <span className="label">Connection</span>
            {serialConfigSummary}
          </div>
          <div>
            <span className="label">Detected mode</span>
            {deviceIdentity ? `${deviceIdentity.mode}-byte` : "—"}
          </div>
        </div>

        <div>
          <span className="label" style={{ display: "block", marginBottom: 4 }}>
            Query bytes sent
          </span>
          <code className="technical-code">{queryCommandHex}</code>
        </div>

        <div>
          <span className="label" style={{ display: "block", marginBottom: 4 }}>
            Raw reply bytes received
          </span>
          <code className="technical-code">
            {rawBytes && rawBytes.length > 0 ? toHex(rawBytes) : "(none)"}
          </code>
        </div>

        <div className="diagnostic-facts">
          <div>
            <span className="label">Parsed version</span>
            {deviceIdentity?.version?.versionString ?? "—"}
          </div>
          <div>
            <span className="label">Checksum valid</span>
            {deviceIdentity ? String(deviceIdentity.checksumValid) : "—"}
          </div>
          <div>
            <span className="label">Parser result</span>
            {deviceIdentity?.stage ?? "—"}
          </div>
          <div>
            <span className="label">Error code</span>
            {connectError?.technicalCode ?? "—"}
          </div>
        </div>
      </div>
    </details>
  );
}
