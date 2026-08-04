export type UpdateState =
  | "idle"
  | "firmware_loaded"
  | "validating"
  | "ready"
  | "initializing"
  | "transferring"
  | "retrying"
  | "finalizing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface UpdateProgress {
  readonly currentPacketIndex: number;
  readonly totalPackets: number;
  readonly percent: number;
}

export type UpdateEvent =
  | { readonly type: "state_changed"; readonly from: UpdateState; readonly to: UpdateState; readonly timestamp: number }
  | { readonly type: "log"; readonly level: "info" | "warn" | "error"; readonly message: string; readonly timestamp: number }
  | {
      readonly type: "packet_sent";
      readonly packetIndex: number;
      readonly totalPackets: number;
      readonly attempt: number;
      readonly timestamp: number;
    }
  | {
      readonly type: "packet_accepted";
      readonly packetIndex: number;
      readonly totalPackets: number;
      readonly timestamp: number;
    }
  | {
      readonly type: "packet_retry";
      readonly packetIndex: number;
      readonly attempt: number;
      readonly retryLimit: number;
      readonly reason: string;
      readonly timestamp: number;
    }
  | { readonly type: "progress"; readonly progress: UpdateProgress; readonly timestamp: number }
  | { readonly type: "transport_error"; readonly code: string; readonly message: string; readonly timestamp: number }
  | { readonly type: "protocol_rejected"; readonly code: string; readonly message: string; readonly timestamp: number }
  | {
      readonly type: "completed";
      readonly timestamp: number;
      /**
       * Whether the post-update version query (best-effort, per recovered
       * GTool behavior) succeeded. `false` means the firmware transfer
       * itself still completed — the final packet was accepted — but
       * verification is unavailable, not that the update failed. See
       * README "Recovery model": never label this outcome as a plain
       * failure.
       */
      readonly verified: boolean;
      readonly verifiedVersion?: string;
    }
  | { readonly type: "failed"; readonly code: string; readonly message: string; readonly timestamp: number }
  | { readonly type: "cancelled"; readonly timestamp: number };

export type UpdateEventListener = (event: UpdateEvent) => void;
