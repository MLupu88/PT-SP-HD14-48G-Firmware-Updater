# Firmware Updater

A browser-based firmware updater for the PureLink PT-SP-HD14-48G, built to
eventually replace the Windows GTool firmware updater. Frontend-only:
firmware update commands travel over the Web Serial API directly between the
browser and the connected device. **Firmware files are never uploaded to a
server.**

## Design principle

> Advanced firmware-update technology presented as a simple, guided consumer
> experience.

The protocol engine, state machine, and transport layer are built to the
same rigor you'd expect from an engineering tool. The default interface
hides all of that: no packet numbers, checksums, baud rates, or protocol
jargon on the main screen. Anyone who needs that detail can open **Advanced
details** at the bottom of the page.

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
src/lib/webserial/       Typed Web Serial capability detection + transport
                          boundary. Transmission is not implemented yet
                          (see "Safety status").
src/ui/                  Consumer-facing React layer: a guided-flow hook
                          (useFirmwareUpdater) that talks to lib/*, plain-
                          language copy (copy.ts), a technical→readable
                          diagnostics mapper (diagnostics.ts), and
                          presentational components.
```

`UpdateEngine` never imports React, and no UI component imports
`src/lib/gtool` directly — everything technical is mediated by
`useFirmwareUpdater`.

### Guided flow

1. Check browser compatibility
2. Connect the device (demo mode today; real device is a later phase)
3. Choose the firmware file
4. Automatic validation
5. Readiness checklist
6. Start the update
7. Progress
8. Success or a plain-language recovery screen

Technical details (protocol state, transport label, packet counts, the
structured event log, and technical error codes) live behind the collapsed
**Advanced details** panel, never on the main screen.

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
