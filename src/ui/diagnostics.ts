import type { UpdateEvent } from "../lib/update-engine";

export interface DiagnosticRow {
  readonly timestamp: number;
  readonly level: "info" | "warn" | "error";
  readonly message: string;
}

/**
 * Converts the engine's structured event log into technical, human-readable
 * rows for the collapsed "Advanced details" panel. This is the one place
 * packet numbers, protocol status codes, and transport details are allowed
 * to surface in the UI.
 */
export function toDiagnosticRows(events: readonly UpdateEvent[]): DiagnosticRow[] {
  return events.map((event) => {
    switch (event.type) {
      case "state_changed":
        return row(event.timestamp, "info", `State: ${event.from} → ${event.to}`);
      case "log":
        return row(event.timestamp, event.level, event.message);
      case "packet_sent":
        return row(
          event.timestamp,
          "info",
          `Sent packet ${event.packetIndex + 1}/${event.totalPackets} (attempt ${event.attempt})`,
        );
      case "packet_accepted":
        return row(
          event.timestamp,
          "info",
          `Packet ${event.packetIndex + 1}/${event.totalPackets} accepted`,
        );
      case "packet_retry":
        return row(
          event.timestamp,
          "warn",
          `Retrying packet ${event.packetIndex + 1} (attempt ${event.attempt}/${event.retryLimit}): ${event.reason}`,
        );
      case "progress":
        return row(event.timestamp, "info", `Progress: ${event.progress.percent}%`);
      case "transport_error":
        return row(event.timestamp, "error", `Transport error [${event.code}]: ${event.message}`);
      case "protocol_rejected":
        return row(event.timestamp, "error", `Device rejected [${event.code}]: ${event.message}`);
      case "completed":
        return row(event.timestamp, "info", "Update completed successfully");
      case "failed":
        return row(event.timestamp, "error", `Failed [${event.code}]: ${event.message}`);
      case "cancelled":
        return row(event.timestamp, "warn", "Update cancelled by user");
    }
  });
}

function row(timestamp: number, level: DiagnosticRow["level"], message: string): DiagnosticRow {
  return { timestamp, level, message };
}
