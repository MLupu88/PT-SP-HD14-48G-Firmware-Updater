# PT-SP-HD14-48G bench-test runbook

## Status

This runbook has **not been executed**. It was written during Phase 2B
without a physical PT-SP-HD14-48G available, so it describes the procedure
to run *later*, once a real splitter is on the bench. Do not treat any
step below as having already happened.

Do not run this against a device you cannot afford to leave in an unknown
state. Read the whole document before starting, especially the stop
conditions before each destructive milestone.

## Before you start

- A physical PT-SP-HD14-48G, powered from a stable, dedicated supply — not
  a shared/daisy-chained strip.
- A known-good USB cable, kept connected for the entire session.
- Desktop Chrome or Edge (Web Serial is unavailable in Firefox and
  Safari), on `localhost` or a real `https://` origin.
- The exact `MCU_MAIN_PT-SP-HD14-48G_V…bin` firmware file you intend to
  test, obtained from a trusted source, sitting locally on the bench
  machine. It is never uploaded anywhere by this app.
- A way to record raw bytes/notes as you go (this document, a text file, a
  camera for the physical label — anything durable).
- Nobody else depending on this specific unit during the session.

## Stop conditions (read first)

- **Before enabling any flag:** if you cannot physically read the
  PT-SP-HD14-48G label on the unit in front of you, stop. Do not proceed
  on the assumption that "it's probably the right one."
- **Before enabling the three Phase 2B flags (step 9):** if the read-only
  steps (1–8) surfaced anything unexpected — a checksum-invalid reply, an
  unrecognized reply length, a USB VID/PID that looks like a different
  OEM device family — stop and investigate before going further. Update
  `docs/gtool-analysis/GTool_2.0.6_protocol_notes.md` with what you found.
- **Before step 11 (starting the update):** if power is not confirmed
  stable, or you are not prepared to keep the device powered and connected
  uninterrupted until the process finishes, stop. Once initialization
  begins, this app will not offer a cancel action, and no tested recovery
  path exists.
- **During the update:** if anything about the reply bytes looks different
  from what steps 1–10 led you to expect, let the run finish or fail on
  its own rather than intervening physically (do not pull the cable to
  "stop it early" — that is more likely to cause the unknown-state
  outcome you are trying to avoid, not less).

## Steps

### 1. Photograph and verify the physical product label

Take a clear photo of the label on the unit itself confirming it reads
`PT-SP-HD14-48G`. Keep the photo with your session notes. This is the one
piece of evidence the app itself cannot obtain electronically — see
README "Phase 2B" for why.

### 2. Record power supply specification and USB cable type

Note the PSU's rated voltage/current and the exact USB cable used (length,
USB-A/C, any hub involved). If anything goes wrong later, this is the
first thing worth re-checking.

### 3. Use desktop Chrome or Edge over localhost or HTTPS

Confirm the app loads and its Connect screen reports the browser as
supported before doing anything else.

### 4. Enable only read-only connection first

In `.env.local` (never commit this file):

```
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true
```

Leave `VITE_ENABLE_REAL_FLASHING` and `VITE_ENABLE_HARDWARE_VALIDATION_MODE`
at `false`. Restart `npm run dev`. At this point nothing in the app can
send anything except the single harmless version-query command — see
README "Phase 2A" for the full safety argument.

### 5. Capture USB VID/PID

Connect the device, click **Connect device**, pick it from the browser's
port picker. Open **Bench test diagnostics** and record the exact USB
vendor/product IDs the browser reports. Compare against
`docs/gtool-analysis/GTool_2.0.6_protocol_notes.md` "What is not yet
proven" — this is one of the open items that resolves here.

### 6. Query and record the installed firmware version

Confirm the connection reaches "Device connected" or "We could not
identify this device," and record the parsed version string (or lack of
one) shown.

### 7. Export/copy the diagnostic bytes

From the same **Bench test diagnostics** panel, record: the exact query
bytes sent, the raw reply bytes received, the detected byte mode (13 or
18), and whether the checksum was valid. Save these bytes verbatim in your
session notes — they are the first real-hardware evidence for
`docs/gtool-analysis`.

### 8. Verify firmware filename and checksum locally

Before going further, confirm the firmware file's name matches
`MCU_MAIN_PT-SP-HD14-48G_V<version>.bin` and (if you have one) compare its
SHA-256 against a known-good value from the vendor. Do this outside the
app, on the bench machine, with standard OS tooling.

### 9. Enable the three hardware-validation flags locally only

Still in `.env.local`, never committed:

```
VITE_ENABLE_READ_ONLY_DEVICE_CONNECTION=true
VITE_ENABLE_REAL_FLASHING=true
VITE_ENABLE_HARDWARE_VALIDATION_MODE=true
```

Restart `npm run dev`. Confirm the app is running only on this bench
machine, not reachable from any other host on the network.

### 10. Confirm initialization bytes before transmission

Reconnect, select the firmware file, and open **Technical details**/bench
diagnostics on the Hardware validation mode screen. Before typing the
confirmation and starting the update, re-verify against
`docs/gtool-analysis/packet_reference_output.txt`:

- start command: `A5 5B 08 07 00 00 00 00 00 00 00 00 F1`
- confirm command: `A5 5B 08 08 00 00 00 00 00 00 00 00 F0`
- first data packet header: `FE EF 00 00`
- last data packet header (should match your firmware's actual packet
  count, not necessarily `FE EF 80 6D` unless your file is exactly
  112,340 bytes)

### 11. Start the update with stable power

Complete every acknowledgement in Hardware validation mode, type
`PT-SP-HD14-48G` exactly, and click **Start update** only once you are
certain power and USB will remain undisturbed until it finishes.

### 12. Record every reply and retry

Keep **Technical details** open. Note any `packet_retry` events (resend
requested), their packet index and attempt number, and whether the retry
limit was ever approached. This is the first real confirmation of the
recovered ~100ms resend delay and 3-attempt retry budget.

### 13. Confirm final-packet acceptance

Confirm the event log shows the final packet's index reaching
`packet_accepted` with the final-packet flag, and progress reaching 100%.

### 14. Query the installed version afterward

Let the post-update delay and version re-query run to completion. Record
whether the result was "verified" (version confirmed) or "verification
unavailable" (transfer succeeded, but the query failed) — both are
distinguishable in the result screen and the event log.

### 15. Record whether the device rebooted or disconnected

Note whether the serial connection dropped at any point after the final
packet (expected if the device reboots to apply the update) and, if so,
roughly how long it stayed disconnected before becoming reachable again
(power-cycle the read-only connection to check, once you're confident
the update itself finished). This directly answers the open question in
`docs/gtool-analysis/GTool_2.0.6_protocol_notes.md`: "whether GTool
performs a reconnect or expects a reboot."

### 16. Test HDMI input and all four outputs

With the device back on stable power, physically verify HDMI switching
still works end-to-end on all inputs/outputs before considering the test
successful. Firmware transfer succeeding is not the same as the device
functioning correctly afterward.

### 17. Disable all flags again

Remove or set all three flags back to `false` in `.env.local` (or delete
the file) as soon as the session is done. Restart `npm run dev` and
confirm the Hardware validation mode screen is no longer reachable.

### 18. Do not deploy enabled flags publicly

Never commit `.env.local`. Never set these flags in `.env`,
`docker-compose.yml`, or any deployed environment. Public production must
always build with all three flags `false` — see README "Phase 2B".

## After the session

Update `docs/gtool-analysis/GTool_2.0.6_protocol_notes.md` "What is not
yet proven" with whatever this run resolved, and update the "What is
proven vs. not proven" table in the README's "Phase 2B" section
accordingly. Treat anything this runbook didn't explicitly cover
(different byte mode, unexpected reply lengths, different retry behavior)
as still unproven rather than assuming it matches what's documented here.
