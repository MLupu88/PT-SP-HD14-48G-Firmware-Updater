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
        // "Attempting", not "Sent": this event fires before the transport
        // write has resolved (see UpdateEngine.sendPacketWithRetries), so no
        // reliable post-write signal exists yet to justify the past tense —
        // see M1 (Phase 2B pre-commit safety review).
        return row(
          event.timestamp,
          "info",
          `Attempting packet ${event.packetIndex + 1}/${event.totalPackets} (attempt ${event.attempt})`,
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
        // I2 (Phase 2B pre-commit safety review): never claim unconditional
        // success here — `verified` distinguishes a confirmed installed
        // version from a transfer that completed with no way to confirm it
        // (see README "Recovery model").
        return row(
          event.timestamp,
          "info",
          event.verified
            ? `Update completed and version verified (${event.verifiedVersion ?? "unknown"}).`
            : "Firmware transferred; version verification unavailable.",
        );
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

/** Uppercase, space-separated hex dump for the bench-test diagnostic panel. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ")
    .toUpperCase();
}
