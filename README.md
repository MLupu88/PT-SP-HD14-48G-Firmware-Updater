<img src="public/logo-mark.png" width="56" alt="Firmware Updater logo" />

# PT-SP-HD14-48G Firmware Updater

A browser-based firmware updater for the PureLink PT-SP-HD14-48G, built to
eventually replace the Windows GTool firmware updater. Frontend-only:
firmware update commands travel over the Web Serial API directly between the
browser and the connected device. **Firmware files are never uploaded to a
server.**

## Design principle

The protocol engine, state machine, and transport layer are built to the
same rigor you'd expect from an engineering tool. The interface hides all
of that: one screen, one decision, at a time — connect, choose firmware,
confirm, update, done. No packet numbers, checksums, baud rates, or
protocol jargon on the main screen; anyone who needs that detail can open
**Technical details**, collapsed by default on every stage.

## Safety status

**Real firmware flashing is disabled in this build.** As of Phase 2B, the
real, firmware-writing transport is fully implemented and tested — but it
is software-complete and **hardware-unvalidated**: no physical
PT-SP-HD14-48G has ever been connected. It stays completely unreachable
unless all three of the following are `"true"` at once (see "Phase 2B"
below for the full detail):

- `VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION`
- `VITE_ENABLE_REAL_FLASHING`
- `VITE_ENABLE_HARDWARE_VALIDATION_MODE`

All three default to `"false"` everywhere (`.env.example`, `Dockerfile`,
`docker-compose.yml`), and this gate is checked as a single function,
`isRealFirmwareTransferEnabled()`, at the top of every method on
`WebSerialTransport` — not scattered across the codebase — so no one or
two flags can make firmware writing reachable. The only way to run a full
update end-to-end with the default (all-`false`) build is **demo mode**,
which uses a fully offline, deterministic simulator (`src/lib/simulator`)
and never touches Web Serial.

The recovered protocol itself is also flagged as hardware-unvalidated. See
`docs/gtool-analysis/GTool_2.0.6_protocol_notes.md` → "What is not yet
proven", and "Phase 2B" below → "What is proven vs. not proven", for the
specific open items that must be resolved with a real device before any
public build enables these flags.

## Phase 2A: read-only device connection

**Status: implemented, disabled by default.** This phase adds a real,
read-only connection to a physical PT-SP-HD14-48G over Web Serial — port
selection, opening, and a single harmless version query — so the device's
identity and installed firmware version can be read without writing
anything. **It does not implement firmware transfer.**

### The flag

```
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=false
```

- Defaults to `false` everywhere, including production Docker builds (see
  `Dockerfile` / `docker-compose.yml`, which now pass this through as a
  second, independently-defaulted build arg).
- When `true`, the **Connect device** button on a supported browser
  requests a real serial port, opens it with the parameters below, and
  sends only the recovered version-query command
  (`docs/gtool-analysis/protocol_section.js`, function `ge()`) — `A5 5B 01
  13 00×8 [checksum]` in 13-byte mode — to read back the installed
  firmware version.
- **Completely independent from `VITE_ENABLE_REAL_FLASHING`, and never
  bypasses it.** Turning this flag on does not enable firmware writing.
  `src/lib/webserial/ReadOnlyDeviceConnection.ts` has no method capable of
  sending arbitrary bytes — `connect()`, `queryDeviceIdentity()`, and
  `disconnect()` are its entire public surface, and the only write it can
  ever perform is the exact version-query command above (locked in by
  `src/lib/webserial/__tests__/ReadOnlyDeviceConnection.test.ts`, "exposes
  no method beyond..."). Firmware initialization (`08 07`/`08 08`) and `FE
  EF` data packets can only be sent through `UpdateEngine` +
  `WebSerialTransport`, which Phase 2A does not touch —
  `WebSerialTransport.connect()`/`sendAndReceive()` still unconditionally
  reject, regardless of this flag (locked in by
  `src/lib/webserial/__tests__/WebSerialTransport.test.ts`).
- The production site remains demo-only until a later, explicitly approved
  build turns this on.

### Enabling it locally

Create `.env.local` (already covered by `.gitignore` — **never commit
it**):

```
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true
```

Then `npm run dev`. Demo mode behaves identically either way.

### Browser requirements

Same as Web Serial in general: a Chromium-based desktop browser (Chrome or
Edge — Web Serial is not available in Firefox or Safari), and the page
must be served over `https://` or `localhost`.

### Serial parameters used

Confirmed from `docs/gtool-analysis/main_serial_section.txt`
(`connect-com` handler): 8 data bits, 1 stop bit, set explicitly in the
source. Baud rate is documented as "user-selected... the manuals use
115200" — not hardcoded in the recovered source — so 115200 is used here
as the documented default, not a discovered constant. Parity and flow
control are never set in the source, so the Web Serial spec default of
`"none"` is used for both, made explicit in code rather than left
implicit. The version query itself times out after 2000ms, per
`main_serial_section.txt`'s `send-com-data` handler (`setTimeout(...,
i ?? 2e3)`) — not the 25s timeout used for MCU_MAIN firmware data packets.

### Safe bench-test procedure

1. Set `VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true` in `.env.local` and
   run `npm run dev` on a machine with Chrome or Edge.
2. Connect the PT-SP-HD14-48G over USB, powered on.
3. Click **Connect device**, and pick the device's serial port from the
   browser's picker.
4. Watch the calm status states (Choose your device → Connecting →
   Checking the device) resolve to either **Device connected** or **We
   could not identify this device**.
5. Open **Bench test diagnostics** (collapsed, shown once a real
   connection attempt starts) to confirm: the USB VID/PID the browser
   reports, the connection configuration, the exact query bytes sent, the
   raw reply bytes received, the parsed version, and the parser result.
6. Click **Disconnect** when done — this only closes the port; it never
   sends anything.

No firmware file is involved anywhere in this procedure. This has not yet
been run against physical hardware — see "Unresolved protocol
ambiguities" below for what that first real run needs to confirm.

### Recovery steps

- **Permission dismissed** ("You did not select a device"): click
  **Connect device** again — the browser reopens its port picker.
- **Timeout** ("The device did not respond"): check the USB cable and
  that the device is powered on, then try again. Nothing was sent that
  could have changed the device's state.
- **Disconnected** ("The device was disconnected"): reconnect the cable
  and click **Connect device** again.
- If the browser's port picker never lists the device at all, that's a
  driver/OS-level issue outside what this app can diagnose — check the
  OS's device manager.

### Unresolved protocol ambiguities carried into this phase

- **13- vs 18-byte mode is unconfirmed for this exact unit.** GTool relies
  on a user-set checkbox, not auto-detection; this phase defaults to
  13-byte mode (per protocol_notes.md) and does not attempt automatic
  mode-switching. The reader recognizes either length if a device happens
  to reply in 18-byte mode, but the outgoing query is always sent in
  13-byte mode by default.
- **No device/model name field exists in this reply.** The recovered
  version-query reply (`ge()`) encodes only numeric version bytes — no
  product name, chip name, or hardware identifier. GTool's only
  model-identifying mechanism is a separate JSON query
  (`{"guihead":"get_device_name"}`) using entirely different framing,
  which this phase does not implement. Consequence:
  `DeviceIdentityResult.compatible` — and the
  `"identified_compatible_device"` stage — can never be `true` today; the
  honest result of a valid, checksum-correct reply is "Device connected"
  with "Device responded, but compatibility could not be confirmed," not a
  specific model claim.
- **`reply[10] === 1` is still undocumented.** GTool reads it into a flag
  it never uses again anywhere in the recovered bundle. Exposed as raw,
  uninterpreted data (`ParsedVersionReply.unknownFlagAtOffset10`), not a
  guessed boolean.
- **USB VID/PID for this device are still unknown** ahead of time (see
  protocol_notes.md "What is not yet proven"), so `requestPort()` is
  called with no filter — the picker lists every available serial port,
  and the bench-test procedure above is how to actually learn the real
  VID/PID.

## Phase 2B: real firmware transfer (software-complete, hardware-unvalidated)

**Status: software-complete, disabled by default, not yet run against a physical device.** This phase
implements the complete real MCU_MAIN firmware-transfer path — initialization commands, `FE EF`
data packets, reply parsing, retry/rejection/timeout/disconnect handling, post-update verification,
and a bench-only "Hardware validation mode" confirmation UI — behind three independent safety flags
that all default to `false`. **No physical PT-SP-HD14-48G was connected during this phase.** Every
byte sequence and timing value below is either sourced directly from `docs/gtool-analysis/` or
explicitly marked as unproven; nothing here was guessed.

### The three-flag safety model

Real firmware transfer requires **all three** of the following to be `"true"` at once:

```
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true
VITE_ENABLE_REAL_FLASHING=true
VITE_ENABLE_HARDWARE_VALIDATION_MODE=true
```

- Checked as a single gate, `isRealFirmwareTransferEnabled()`
  (`src/lib/webserial/flags.ts`), not as three separate checks scattered
  through the code. `WebSerialTransport` calls this gate — not the
  individual flags — at the top of every method (`attachPort`, `connect`,
  `sendAndReceive`), so it is structurally impossible for any one or two
  flags to make firmware writing reachable. This is locked in by
  `src/lib/webserial/__tests__/flags.test.ts` (the full 2³ combination
  matrix) and `WebSerialTransport.test.ts` ("stays inert unless all three
  safety flags are true").
- All three default to `false` in `.env.example`, `Dockerfile` (build
  `ARG`s), and `docker-compose.yml` (build-arg passthrough). A clean
  `npm run build` or `docker compose build` with no `.env.local` produces a
  build where none of the three is `true`.
- `VITE_ENABLE_HARDWARE_VALIDATION_MODE` is the newest, **temporary**
  flag. It exists specifically because Phase 2A proved the recovered
  version-query reply carries no device/model-name field
  (`DeviceIdentityResult.compatible` can never be `true`). Since the
  filename, USB VID/PID, and a successful version reply are all
  insufficient proof of device identity on their own, this flag gates a
  bench-only screen (see below) that substitutes explicit, typed human
  confirmation for the missing electronic proof. It is meant to be removed
  once a real bench-test pass (see the runbook below) proves the protocol
  and a better identification mechanism can replace it.
- The normal consumer interface (Connect → Choose firmware → Ready →
  Updating → Done) never changes when this flag is `false` — it still
  behaves exactly as Phase 2A described. The "Hardware validation mode"
  screen only renders when all three flags are `true`.

### The real update sequence

Reachable only with all three flags true, using the exact sequence
recovered from GTool 2.0.6 (`protocol_section.js`, functions `_e`/`De`/`ge`):

1. User clicks **Connect device**, which now opens a real `WebSerialTransport`
   (a single `requestPort()` + `open()` — no second picker later; the same
   connection carries the harmless version query, the initialization
   commands, and every firmware packet — see "reuse the selected
   connection" below).
2. Port opens with the recovered serial configuration (115200 8N1, no
   parity, no flow control — see Phase 2A above).
3. The harmless version-query command (`A5 5B 01 13 …`) runs and its reply
   is shown (checksum-valid or not).
4. If all three flags are true and the reply was checksum-valid, **Continue
   to hardware validation** becomes available.
5. Firmware is selected locally and validated by
   `validateRealMcuMainFirmware` (see below) — stricter than the demo
   validator.
6. The **Hardware validation mode** screen requires: a valid device reply,
   the exact `PT-SP-HD14-48G` token in the firmware filename, a firmware
   file that passes real-path validation, physical-label / stable-power /
   stay-connected / no-tested-recovery-path acknowledgements, an extra
   acknowledgement if the selected version is the same as or older than the
   installed version, and typing `PT-SP-HD14-48G` exactly. All conditions
   are required at once (`isHardwareValidationGateOpen`,
   `src/lib/webserial/hardwareValidation.ts`) — there is no partial-credit
   path.
7. First initialization command (`A5 5B 08 07 00×8 F1`) is sent, with up to
   three total attempts (source: `Q(2, …)` retry helper).
8. GTool does not validate the content of the start command's reply beyond
   receiving one within the timeout — matched exactly: `UpdateEngine`
   retries the send on transport failure, but never inspects the reply's
   bytes.
9. The recovered ~2 second gap is observed (`initCommandGapMs`, default
   `2000`).
10. Second/confirm command (`A5 5B 08 08 00×8 F0`) is sent once, not
    retried — matching the recovered source exactly (`Le && await
    z(Le, {...})`, no `Q()` wrapper). Its reply content is likewise never
    validated, matching the recovered source.
11. Firmware packets (`FE EF` + index + 1024 bytes + checksum) are sent
    sequentially.
12. Each reply's byte 4 is parsed: `0` → next packet; `1` → resend the
    exact same packet after ~100ms, up to the configured retry limit; `2`
    or anything else → stop immediately, no retry.
13–17. Timeout, malformed reply, disconnection, and resend-limit exhaustion
    each stop the run safely with a distinct, honest failure code — none of
    them silently continue.
18. The final packet uses the final-packet flag (`0x80` OR'd into the index
    high byte) and `0xFF` padding.
19. The recovered post-final-packet delay (3s) and settle delay (7s) are
    observed before verification.
20. The installed version is queried again, best-effort — this never gates
    success or failure by itself (see "Completion" below).
21. Completion is classified honestly (see below) — never as a bare
    "success" just because the last packet was written.

### Reusing the connection instead of the frozen Phase 2A class

`ReadOnlyDeviceConnection`'s public surface is deliberately frozen to
exactly `connect`/`queryDeviceIdentity`/`disconnect`/`isConnected` (locked
in by its own test, "exposes no method beyond...") — Phase 2B does not add
a fifth method to hand its port to the real transport, to keep that
safety property intact. Instead, when all three flags are true, **Connect
device** uses the real `WebSerialTransport` directly for the harmless
version query too (`buildVersionQueryCommand` + `interpretCompleteReply`,
both reused from `src/lib/gtool` / `src/lib/webserial/deviceIdentity.ts` —
not duplicated), and the exact same open port then carries the firmware
transfer. There is only ever one `requestPort()` prompt per session on
this path, and the connection is genuinely reused end-to-end — see
`useFirmwareUpdater.connectHardwareValidationDevice` /
`beginHardwareValidation`.

### What is proven vs. not proven

| Detail | Status |
|---|---|
| Init command bytes, gap timing, retry count for the start command | Proven — `packet_reference_output.txt`, `protocol_section.js` |
| Confirm command sent once, reply content unchecked | Proven — `protocol_section.js` (`_e`) |
| Packet framing, final-packet flag, `0xFF` padding, checksum algorithm | Proven — `protocol_notes.md`, `gtool_packet_reference.py` |
| Reply status byte semantics (0/1/2), ~100ms resend delay, 3 total attempts | Proven — `protocol_notes.md` "Reply handling" |
| Post-final-packet 3s delay, 7s settle delay before re-query | Proven — `protocol_section.js` (`De`) |
| Reply length is 13 or 18 bytes for every command, including init and data | Proven — `main_serial_section.txt`, `protocol_section.js` |
| Whether a same-version/downgrade update is blocked by GTool | **Not proven** — no such policy found; this app never invents one, only adds an extra acknowledgement |
| Whether cancellation/abort mid-transfer is safe | **Not proven** — no recovered evidence either way; treated as unsafe, so no cancel action exists once initialization begins |
| Whether GTool reconnects or expects a reboot after the final packet | **Not proven** — recovered source only re-queries the version after fixed delays; it never re-opens the serial port or waits for a specific reboot signal |
| A dedicated "update complete" completion command from the device | **Not proven** — no such command was recovered; completion is inferred only from the final packet's accepted reply plus the best-effort version re-query |
| USB VID/PID, real device byte-mode (13 vs 18) confirmation | **Not proven** — see Phase 2A "Unresolved protocol ambiguities" |
| 13- vs 18-byte mode auto-selection | **Not proven** — GTool uses a user checkbox, not auto-detection; this app defaults to 13-byte mode and does not implement auto-switching |

Where a step could not be proven, the surrounding architecture was still
built (typed, tested, gated) but the step itself is either left
unreachable or explicitly labeled best-effort/unproven in the UI and code
— never replaced with a plausible-looking guess.

### Completion and recovery model

`UpdateEngine`'s `"completed"` event now carries a `verified: boolean`
flag. The final packet being accepted is **not** treated as unconditional
success — completion is classified as one of:

- **completed, verified** — the final packet was accepted and the
  post-update version query succeeded.
- **completed, verification unavailable** — the final packet was accepted,
  but the best-effort version re-query failed (timeout, disconnect,
  malformed reply). Never shown as a failure.
- **failed — protocol rejection** — the device actively rejected a packet
  or command (status 2) or exhausted the resend limit.
- **failed — interrupted** — a transport error (timeout, disconnect)
  occurred during the transfer itself.
- **cancelled** — only reachable before `start()` is called at all, for a
  real hardware run (see below).

`src/lib/update-engine/recovery.ts` (`classifyRecovery`) turns a finished
run's structured event log into one of six typed outcomes: `safe_to_retry`,
`initialization_started_no_packet_accepted`, `transfer_partially_completed`,
`completed_verification_failed`, `device_disconnected_or_rebooting`, or
`unknown`. **Only `safe_to_retry` is ever offered an automatic "Try
again"** — every other outcome shows conservative, plain-language guidance
plus a technical code in collapsed details instead. No new recovery
command is invented anywhere; the model only classifies what already
happened.

### Cancellation and interruption safety

- Cancelling is only available before `start()` is called (the "Update
  firmware" action itself) for a real hardware run. Once the engine enters
  `"initializing"`, `UpdatingStage` renders no Cancel action at all for a
  real hardware run — the demo/simulator path is unaffected and keeps its
  existing mid-run Cancel button, since an offline simulator can always
  unwind safely.
- A `beforeunload` guard (unchanged from before Phase 2B, already scoped to
  `isRunning()`) warns before page close/reload/browser shutdown while a
  run — demo or real — is in progress.
- The real-hardware screen displays an explicit "do not disconnect USB or
  power" warning and states that this update can no longer be safely
  cancelled, for as long as it runs.
- A best-effort Screen Wake Lock (`src/lib/webserial/wakeLock.ts`) is
  acquired only for a real hardware run and released after
  completion/failure/cancellation. Unavailability (unsupported browser,
  hidden tab, denied permission) never fails or blocks the update — it
  degrades silently.
- `WebSerialTransport` structurally prevents a second connection attempt,
  a second concurrent packet exchange, or swapping the port while one is
  attached (`PortChangeRejectedError`), and `UpdateEngine.isRunning()`
  already prevented parallel updates and mid-run firmware replacement
  before Phase 2B.
- An interrupted destructive update is never described as harmless: the
  UI states that the device's state may be incomplete and that it should
  stay powered until recovery guidance is followed.

### Real-path firmware validation

`validateRealMcuMainFirmware` (`src/lib/gtool/validation.ts`) layers
strictly additional checks around the unchanged `validateMcuMainFirmware`
used by the demo simulator — the demo's looser acceptance is untouched:

- must be a `.bin` file,
- filename must identify an `MCU_MAIN` image,
- filename must contain the exact product token `PT-SP-HD14-48G`,
- the file must not be empty,
- the file must not packetize into more packets than the recovered
  packet-index format can represent (`MAX_REPRESENTABLE_PACKET_INDEX =
  0x7FFF`, since the final-packet flag bit must stay free in the index
  high byte).

No downgrade-blocking policy is invented (none was recovered from GTool);
a same-version-or-older selection instead requires one additional explicit
acknowledgement in the Hardware validation mode checklist.

### What this phase does NOT claim

- It does not claim the protocol has been validated against a physical
  PT-SP-HD14-48G. It has not.
- It does not claim post-update verification is guaranteed — only
  best-effort, exactly matching GTool's own recovered behavior.
- It does not claim cancellation mid-transfer is safe.
- It does not claim electronic proof of device identity — "Hardware
  validation mode" exists precisely because that proof doesn't exist yet.
- Public production deployments must keep all three flags `false`. This
  phase does not change that default anywhere, and nothing in this
  repository flips it.

### Safe future bench-test procedure

See `docs/hardware-validation/PT-SP-HD14-48G-bench-test.md` for the full,
gated, step-by-step runbook to use once a physical splitter is available.
It is written to be followed later — it was not executed during this
phase, and no physical device was used to write it.

## Architecture

Strict separation between layers, so consumer-friendly presentation never
has to compromise protocol correctness:

```
src/lib/gtool/           Framework-independent protocol library (pure functions,
                          Uint8Array in/out): validation, packetization, framing,
                          checksums, command builders, reply parsing.
src/lib/update-engine/   Framework-independent state machine (UpdateEngine).
                          Drives any UpdateTransport through
                          idle → firmware_loaded → validating → ready →
                          initializing → transferring ⇄ retrying → finalizing →
                          verifying → completed | failed | cancelled.
src/lib/simulator/       Deterministic offline UpdateTransport used by demo
                          mode and the test suite. Never touches Web Serial.
src/lib/webserial/       Typed Web Serial capability detection; WebSerialTransport
                          (the real firmware-writing boundary — implemented and
                          tested, but reachable only when all three Phase 2B
                          safety flags are true, see "Phase 2B" above); and,
                          independently, ReadOnlyDeviceConnection (Phase 2A's
                          real, read-only identification path); plus
                          hardwareValidation.ts (the bench-confirmation gate)
                          and wakeLock.ts (best-effort screen wake lock).
src/ui/                  Consumer-facing React layer: a guided-flow hook
                          (useFirmwareUpdater) that talks to lib/*, plain-
                          language copy (copy.ts), a technical→readable
                          diagnostics mapper (diagnostics.ts), and one
                          presentational component per stage.
```

`UpdateEngine` never imports React, and no UI component imports
`src/lib/gtool` directly — everything technical is mediated by
`useFirmwareUpdater`.

### Guided flow

One stage is visible at a time, each with a single dominant action:

1. **Connect** — browser compatibility is checked automatically. "Connect
   device" tries the demo instead unless `VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true`
   (Phase 2A) or all three Phase 2B flags are true, in which case it opens
   a real connection (read-only, or read-write when all three flags allow it).
2. **Device status** *(real path only)* — calm connecting states, then an
   honest result ("Device connected" / "We could not identify this
   device"), the installed version when available, and Disconnect. With
   only the Phase 2A flag on, this path never reaches step 3 onward. With
   all three Phase 2B flags on and a checksum-valid reply, a **Continue to
   hardware validation** action becomes available instead.
3. **Choose update** — confirms the connection, shows the device name and
   installed version, and lets the user pick a firmware file (validated by
   the stricter real-path validator on the Phase 2B bench path).
4. **Hardware validation mode** *(Phase 2B bench path only)* — a clearly
   labelled, non-consumer screen requiring every acknowledgement plus a
   typed `PT-SP-HD14-48G` confirmation before the update action unlocks
   — see "Phase 2B" above.
5. **Ready** — validation runs automatically; once it passes, the screen
   summarizes the version change and offers one "Update firmware" action.
6. **Updating** — a calm, full-focus progress screen. No packet counters,
   no configuration panels. On the Phase 2B real path, Cancel disappears
   once initialization begins and an explicit "do not disconnect" warning
   appears.
7. **Done** — a confident success screen (verified or unverified), or a
   plain-language recovery screen on failure/cancellation, with automatic
   "Try again" offered only when nothing was sent to the device yet.

Protocol state, transport label, packet counts, the structured event log,
and technical error codes live behind a collapsed **Technical details**
disclosure on the updating/done stages. The real-device path has its own
equivalent, **Bench test diagnostics** (see "Phase 2A" above) — both are
collapsed by default.

## Local development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Web Serial requires a Chromium-based
desktop browser (Chrome or Edge) and either `https://` or `localhost` — the
dev server satisfies the latter automatically. Demo mode works in any
browser.

## Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Covers the protocol library (init commands, checksum algorithm, packet
count/framing/padding for the documented 112,340-byte firmware, reply
parsing), the update engine (retry, failure, cancellation, parallel-update
prevention, full simulated completion), and the simulator transport itself.

Phase 2A's real, read-only connection path is covered against a
deterministic in-memory mock of the Web Serial API
(`src/lib/webserial/__tests__/mockWebSerial.ts` — no physical hardware
involved): port selection/cancellation, chunked and exact replies in both
13- and 18-byte mode, checksum failure, malformed framing, timeout,
mid-read disconnection, reader/writer lock cleanup, and parallel-attempt
prevention.

Phase 2B's real, firmware-writing transport is covered against the same
mock, gated behind the full 2³ feature-flag combination matrix
(`src/lib/webserial/__tests__/flags.test.ts`,
`WebSerialTransport.test.ts` "stays inert unless all three safety flags
are true"): connection reuse/attach, concurrent-access guards, reader/writer
lock cleanup, backpressure, and every reply-handling case (chunked, 13- and
18-byte, invalid checksum, malformed framing, timeout, disconnect).
`WebSerialTransport.realTransfer.test.ts` drives `UpdateEngine` against the
real transport end-to-end for the documented 112,340-byte / 110-packet
example — exact init command bytes, the recovered ~2s inter-command gap,
every packet in order with no skips or duplicates, the exact final-packet
header (`FE EF 80 6D`) and `0xFF` padding, the post-update version query,
and a `completed, verified: true` outcome — plus dedicated tests for
single-packet resend, retry-limit exhaustion, protocol rejection (status
2), mid-transfer timeout, mid-transfer disconnection, and disconnection
during the post-update query (`completed, verified: false`, never reported
as a failure). `src/lib/update-engine/__tests__/recovery.test.ts` covers
all six typed recovery outcomes; `hardwareValidation.test.ts` covers the
all-or-nothing bench-confirmation gate; `wakeLock.test.ts` covers
best-effort acquire/release including unavailability.

The real firmware binary referenced in `docs/gtool-analysis` is
copyrighted and intentionally **not** included in this repository — tests
use a synthetic buffer of the same documented length for structural
assertions, and assert exact bytes only where `packet_reference_output.txt`
provides values that don't depend on firmware content (the init commands).
See the comments in `src/lib/gtool/__tests__/packet.test.ts` for details.

Other checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Production build

```bash
npm run build    # outputs static assets to dist/
npm run preview  # serve the production build locally
```

## Docker

```bash
docker compose up --build
```

Serves the static build via an unprivileged Nginx (`nginxinc/nginx-unprivileged`,
non-root, listens on 8080) at `http://localhost:8080`. A `/health` endpoint
is provided for container health checks (backed by `public/health.txt`).

To build with different safety-flag values at image-build time (all three
default to `false`; see "Phase 2B" above for why the third exists):

```bash
VITE_ENABLE_REAL_FLASHING=false \
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=false \
VITE_ENABLE_HARDWARE_VALIDATION_MODE=false \
  docker compose up --build
```

Because Vite inlines `VITE_*` variables at build time, the flags must be
set before `docker build`/`docker compose build`, not at container
runtime. **Public production deployments must always build with all three
flags `false`** — enabling any of them is a local bench-only action, never
appropriate for a deployed image.

## Protocol source

All protocol details come from `docs/gtool-analysis/` (static analysis of
the GTool 2.0.6 installer and the supplied firmware — no physical device
was connected during that analysis). Where those sources were ambiguous,
the code says so explicitly via a typed "unsupported" field and a `TODO`
comment pointing at the source line, instead of guessing — see
`ParsedVersionReply.unknownFlagAtOffset10` in `src/lib/gtool/types.ts` for
the one such case.
