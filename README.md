<img src="public/logo.svg" width="56" height="56" alt="Firmware Updater logo" />

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

**Real firmware flashing is disabled in this build.** This phase ships the
complete protocol engine, update state machine, and UI, but every path that
would write to a real device is inert:

- The app is built with `VITE_ENABLE_REAL_FLASHING=false` by default (see
  `.env.example`).
- Independently of that flag, `src/lib/webserial/WebSerialTransport.ts`
  does not implement firmware transmission at all yet — `connect()` and
  `sendAndReceive()` always reject with a clear "not available yet" error.
  The flag and the missing implementation are two separate safety nets.
- The only way to run a full update end-to-end right now is **demo mode**,
  which uses a fully offline, deterministic simulator
  (`src/lib/simulator`) and never touches Web Serial.

The recovered protocol itself is also flagged as hardware-unvalidated. See
`docs/gtool-analysis/GTool_2.0.6_protocol_notes.md` → "What is not yet
proven" for the specific open items (byte-mode confirmation, USB
VID/PID, a real device test pass, etc.) that must be resolved before a
future phase can safely enable `VITE_ENABLE_REAL_FLASHING`.

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
                          (the firmware-writing boundary — transmission still not
                          implemented, see "Safety status"); and, independently,
                          ReadOnlyDeviceConnection (Phase 2A's real, read-only
                          identification path — see "Phase 2A" above).
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
   (Phase 2A), in which case it opens a real, read-only connection.
2. **Device status** *(Phase 2A, real path only)* — calm connecting states,
   then an honest result ("Device connected" / "We could not identify this
   device"), the installed version when available, and Disconnect. This
   path never reaches step 3 onward — see "Phase 2A" above.
3. **Choose update** — confirms the (demo) connection, shows the device
   name and installed version, and lets the user pick a firmware file.
4. **Ready** — validation runs automatically; once it passes, the screen
   summarizes the version change and offers one "Update firmware" action.
5. **Updating** — a calm, full-focus progress screen. No packet counters,
   no configuration panels.
6. **Done** — a confident success screen (or a plain-language recovery
   screen on failure/cancellation).

Protocol state, transport label, packet counts, the structured event log,
and technical error codes live behind a collapsed **Technical details**
disclosure on stages 5 and 6. The real-device path has its own equivalent,
**Bench test diagnostics** (see "Phase 2A" above) — both are collapsed by
default.

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
prevention. A lock-in regression test also asserts `WebSerialTransport`
(the firmware-writing path) still unconditionally rejects every call.

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

To build with a different safety-flag value at image-build time (still
inert regardless — see "Safety status"):

```bash
VITE_ENABLE_REAL_FLASHING=false docker compose up --build
```

Because Vite inlines `VITE_*` variables at build time, the flag must be set
before `docker build`/`docker compose build`, not at container runtime.

## Protocol source

All protocol details come from `docs/gtool-analysis/` (static analysis of
the GTool 2.0.6 installer and the supplied firmware — no physical device
was connected during that analysis). Where those sources were ambiguous,
the code says so explicitly via a typed "unsupported" field and a `TODO`
comment pointing at the source line, instead of guessing — see
`ParsedVersionReply.unknownFlagAtOffset10` in `src/lib/gtool/types.ts` for
the one such case.
