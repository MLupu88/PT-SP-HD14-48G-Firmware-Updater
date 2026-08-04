import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { additiveChecksum } from "../../../lib/gtool/checksum";
import { PAYLOAD_BLOCK_SIZE } from "../../../lib/gtool/constants";
import { installMockSerial, MockSerialPort, uninstallMockSerial } from "../../../lib/webserial/__tests__/mockWebSerial";
import type { MockSerial } from "../../../lib/webserial/__tests__/mockWebSerial";
import { EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS, REQUIRED_TYPED_CONFIRMATION } from "../../../lib/webserial";
import { makeSyntheticFirmwareBytes } from "../../../test/fixtures";
import { useFirmwareUpdater } from "../useFirmwareUpdater";

/**
 * Orchestration-hook-level regression coverage for two Phase 2B pre-commit
 * safety review findings — I1 and M2 (each described just above its own
 * `describe` block below).
 */

function statusReply(statusByte: number): Uint8Array {
  const frame = new Uint8Array(13);
  frame[4] = statusByte;
  frame[12] = additiveChecksum(frame.subarray(0, 12), 13);
  return frame;
}

function isDataFrame(chunk: Uint8Array): boolean {
  return chunk.length > 4 && chunk[0] === 0xfe && chunk[1] === 0xef;
}

function packetIndexOf(chunk: Uint8Array): number {
  return (((chunk[2] ?? 0) & 0x7f) << 8) | (chunk[3] ?? 0);
}

const FIRMWARE_NAME = "MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin";

/**
 * `chooseFile` only ever calls `.name` and `.arrayBuffer()` on what it's
 * given — a duck-typed stand-in avoids depending on jsdom's incomplete
 * `File.prototype.arrayBuffer()` support.
 */
function makeFirmwareFile(): File {
  const bytes = makeSyntheticFirmwareBytes(PAYLOAD_BLOCK_SIZE * 3); // 3 packets
  return {
    name: FIRMWARE_NAME,
    arrayBuffer: async () => bytes.buffer,
  } as unknown as File;
}

async function openPort(rejectPacketIndex: number | null): Promise<MockSerialPort> {
  let port: MockSerialPort;
  port = new MockSerialPort({
    onWrite: (chunk) => {
      if (rejectPacketIndex !== null && isDataFrame(chunk) && packetIndexOf(chunk) === rejectPacketIndex) {
        port.emit(statusReply(2)); // protocol rejection: fails, no retry
        return;
      }
      port.emit(statusReply(0));
    },
  });
  await port.open({ baudRate: 115_200, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
  return port;
}

async function openGate(result: { current: ReturnType<typeof useFirmwareUpdater> }): Promise<void> {
  await act(async () => {
    await result.current.actions.chooseFile(makeFirmwareFile());
  });
  await waitFor(() => expect(result.current.validation).toBe("valid"));

  act(() => {
    for (const key of Object.keys(
      EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS,
    ) as (keyof typeof EMPTY_HARDWARE_VALIDATION_ACKNOWLEDGEMENTS)[]) {
      result.current.actions.toggleHwAcknowledgement(key);
    }
    result.current.actions.setHwTypedConfirmation(REQUIRED_TYPED_CONFIRMATION);
  });

  expect(result.current.hardwareValidationGateOpen).toBe(true);
}

/**
 * I1 (Phase 2B pre-commit safety review): after a real-hardware run ends in
 * anything other than "safe_to_retry", the operator must be forced back
 * through a fresh port selection and a fresh version-query reply before
 * another attempt — never straight back to firmware selection on a stale
 * identity and an already-used transport. This is the counterpart, at the
 * orchestration-hook level, to `classifyRecovery`'s own unit coverage in
 * `src/lib/update-engine/__tests__/recovery.test.ts`.
 */
describe("useFirmwareUpdater — I1 stale identity after unsafe failure", () => {
  let mockSerial: MockSerial;

  beforeEach(() => {
    mockSerial = installMockSerial();
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
    vi.stubEnv("VITE_ENABLE_REAL_FLASHING", "true");
    vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", "true");
  });

  afterEach(() => {
    uninstallMockSerial();
    vi.unstubAllEnvs();
  });

  it(
    "after a partially completed transfer, pressing Done disconnects the transport, clears identity, and requires a fresh connection before the next attempt",
    async () => {
      const port1 = await openPort(1); // packet index 1 is rejected — packet 0 already accepted
      mockSerial.provideNextPort(port1);

      const { result } = renderHook(() => useFirmwareUpdater());

      await act(async () => {
        await result.current.actions.chooseRealDevice();
      });
      expect(result.current.deviceIdentity).not.toBeNull();
      expect(result.current.realConnectionPhase).toBe("done");

      act(() => {
        result.current.actions.beginHardwareValidation();
      });
      expect(result.current.hardwareValidationStarted).toBe(true);

      await openGate(result);

      await act(async () => {
        await result.current.actions.startUpdate();
      });

      expect(result.current.isFailed).toBe(true);
      expect(result.current.recoveryOutcome).toBe("transfer_partially_completed");
      // The transport is still attached at this point — nothing has torn it down yet.
      expect(port1.readable).not.toBeNull();

      // The "Done" action on the result screen.
      act(() => {
        result.current.actions.finishResult();
      });

      // Stale state must be gone: no identity, no hardware-validation gate,
      // and the transport that carried the failed run is disconnected.
      expect(result.current.deviceIdentity).toBeNull();
      expect(result.current.hardwareValidationStarted).toBe(false);
      expect(result.current.mode).toBe("unselected");
      expect(port1.readable).toBeNull();
      expect(port1.writable).toBeNull();

      // Trying to resume hardware validation without reconnecting is a no-op
      // — there is no transport left to wire up.
      act(() => {
        result.current.actions.beginHardwareValidation();
      });
      expect(result.current.hardwareValidationStarted).toBe(false);

      // The next attempt must go through a genuinely fresh port selection
      // and a fresh, valid version-query reply — not reuse anything above.
      const port2 = await openPort(null);
      mockSerial.provideNextPort(port2);

      await act(async () => {
        await result.current.actions.chooseRealDevice();
      });

      expect(mockSerial.requestPortCallCount).toBe(2);
      expect(result.current.deviceIdentity).not.toBeNull();
      expect(result.current.deviceIdentity?.checksumValid).toBe(true);

      act(() => {
        result.current.actions.beginHardwareValidation();
      });
      expect(result.current.hardwareValidationStarted).toBe(true);
    },
    10_000,
  );
});

/**
 * M2 (Phase 2B pre-commit safety review): `UpdateEngine.start()`'s own
 * parallel-run guard is set only once `startUpdate` reaches it — after the
 * wake-lock acquisition, which is itself awaited. A rapid double click on
 * "Start update" could otherwise let both calls race past that point before
 * either finished, each requesting its own wake lock and overwriting
 * `wakeLockRef.current`, leaking one sentinel forever.
 */
describe("useFirmwareUpdater — M2 rapid double-click wake-lock leak", () => {
  let mockSerial: MockSerial;
  let wakeLockRequest: ReturnType<typeof vi.fn>;
  let wakeLockRelease: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSerial = installMockSerial();
    vi.stubEnv("VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION", "true");
    vi.stubEnv("VITE_ENABLE_REAL_FLASHING", "true");
    vi.stubEnv("VITE_ENABLE_HARDWARE_VALIDATION_MODE", "true");

    wakeLockRelease = vi.fn().mockResolvedValue(undefined);
    wakeLockRequest = vi.fn().mockImplementation(async () => ({
      released: false,
      release: wakeLockRelease,
    }));
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: wakeLockRequest },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    uninstallMockSerial();
    vi.unstubAllEnvs();
    Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true, writable: true });
  });

  it(
    "requests exactly one wake lock and releases exactly one sentinel when Start is clicked twice rapidly",
    async () => {
      // Packet 0 is rejected outright: the run fails fast, right after the
      // unavoidable init-command gap, well before the (multi-second, real)
      // finalizing delays a full success would pay — this test only cares
      // about the wake-lock accounting, not about exercising a full transfer.
      const port = await openPort(0);
      mockSerial.provideNextPort(port);

      const { result } = renderHook(() => useFirmwareUpdater());

      await act(async () => {
        await result.current.actions.chooseRealDevice();
      });
      act(() => {
        result.current.actions.beginHardwareValidation();
      });
      await openGate(result);

      // Two rapid clicks: neither call is awaited before the second fires,
      // exactly like two pointerdown events landing before React re-renders
      // a disabled button.
      await act(async () => {
        const first = result.current.actions.startUpdate();
        const second = result.current.actions.startUpdate();
        await Promise.all([first, second]);
      });

      expect(result.current.isFailed).toBe(true);
      expect(wakeLockRequest).toHaveBeenCalledTimes(1);
      expect(wakeLockRelease).toHaveBeenCalledTimes(1);
      expect(result.current.startInProgress).toBe(false);
    },
    10_000,
  );
});
