# GTool 2.0.6 - reconstructed MCU_MAIN firmware protocol

## Status

This document is based on static analysis of the user-supplied GTool 2.0.6 installer and the supplied firmware file. The Electron ASAR payload was extracted and the JavaScript bundles were inspected. No physical device was connected, so the protocol still requires hardware validation before it is used to flash a device.

## Application identity

- Package name: `gtool`
- Version: `2.0.6`
- Description: `General Upgrade tool`
- Author: `HDCVT`
- Runtime: Electron/JavaScript
- Serial library: Node `serialport` 10.5.0

## Serial connection

GTool opens the selected COM port with:

- user-selected baud rate (the manuals use 115200)
- 8 data bits
- 1 stop bit
- no parity specified (Node SerialPort default: none)
- no hardware/software flow control specified
- 2048-byte high-water mark

The serial port remains open throughout the update. The updater contains no serial-port re-enumeration or second-VID/PID reconnection path during MCU_MAIN flashing.

## 13-byte versus 18-byte mode

The checkbox changes both command framing and checksum behavior.

### 13-byte mode

- Prefix: `A5 5B`
- Command/reply length: exactly 13 bytes
- Checksum: two's complement of the low byte of the sum, so the complete frame sums to zero modulo 256

### 18-byte mode

- Prefix: `50 56 54` (ASCII `PVT`)
- Command/reply length: exactly 18 bytes
- Checksum: low byte of the sum of the preceding frame bytes

Public instructions for this updater family normally specify 13-byte mode.

## Firmware selection for the supplied file

The filename `MCU_MAIN_PT-SP-HD14-48G_V1.10.36.bin` matches the `MCU_MAIN` module configuration:

- start command: `08 07`
- second/confirm command: `08 08`
- response timeout: 25 seconds
- payload block size: 1024 bytes
- filename flag: `00` because no `_HEX_` flag is present in this filename

The firmware is 112,340 bytes and contains the ASCII device name `PT-SP-HD14-48G`.

## Initial command frames

### 13-byte mode, flag 00

Start:

`A5 5B 08 07 00 00 00 00 00 00 00 00 F1`

Second/confirm:

`A5 5B 08 08 00 00 00 00 00 00 00 00 F0`

### 18-byte mode, flag 00

Start:

`50 56 54 08 07 00 00 00 00 00 00 00 00 00 00 00 00 09`

Second/confirm:

`50 56 54 08 08 00 00 00 00 00 00 00 00 00 00 00 00 0A`

GTool sends the start command with up to two retries, waits about two seconds, sends the second command, and then begins data transfer.

## Data packet format

Each MCU_MAIN data frame is 1,029 bytes:

| Offset | Length | Meaning |
|---|---:|---|
| 0 | 2 | constant header `FE EF` |
| 2 | 1 | packet index high byte; add `0x80` on the final packet |
| 3 | 1 | packet index low byte |
| 4 | 1024 | firmware data, final block padded with `FF` |
| 1028 | 1 | additive checksum according to selected 13/18 mode |

Packet index is zero-based and split as `high = floor(index/256)`, `low = index % 256`.

The supplied firmware produces 110 packets. The last packet is index 109 (`0x006D`), marked as final with header:

`FE EF 80 6D`

The final block contains 724 firmware bytes and 300 bytes of `FF` padding.

## Reply handling

GTool expects a fixed 13- or 18-byte reply after every command/data frame. For ordinary MCU_MAIN data frames, it reads byte 4 of the reply:

- `0`: packet accepted; continue, or finish if it was the final packet
- `1`: retry the same packet after approximately 100 ms
- `2`: fail the update
- another value: fail the update

Each send is attempted up to three times total by the outer retry helper.

After the final packet is accepted, GTool waits approximately 3 seconds, reports 100%, waits approximately 7 more seconds, then queries the firmware version again.

## Version query

GTool constructs a framed command containing command bytes `01 13` and reads version fields from fixed positions in the 13/18-byte response. It also has a fallback command `01 03` for devices returning a shorter version format.

## Firmware compatibility logic

Newer packaged firmware can include JSON metadata records marked with little-endian magic `0xABCD5555` and protected by CRC-16/CCITT (`init 0xFFFF`, polynomial `0x1021`). GTool compares fields such as product name, firmware type, chip name, and hardware information with a JSON response to:

`{"guihead":"get_device_name"}\r`

The supplied PureLink firmware does not contain this newer metadata marker. It does contain the product name in plain ASCII.

## What is solved

The key proprietary-looking MCU_MAIN transfer logic is recoverable from the application:

- serial parameters
- 13/18-byte command framing
- start and second command
- block size
- data packet layout
- final-packet marker
- checksum behavior
- response status codes
- retry behavior
- timing sequence
- version-query framing

## What is not yet proven

Before an iPad updater can safely flash hardware, the following still require a real device:

1. Confirm that this exact PureLink unit uses 13-byte mode.
2. Obtain USB VID/PID and descriptors in normal operation.
3. Identify the USB-to-serial bridge; CH340 is plausible for this OEM family but unconfirmed for this unit.
4. Capture at least one harmless version query and compare it with the reconstructed frames.
5. Perform a same-version update on a spare/test unit and verify all response bytes.
6. Determine recovery behavior after power or cable interruption.
7. Prove the iPad USBDriverKit transport and obtain production entitlements from Apple.

## Recommended next milestone

Build a desktop test utility that only:

1. lists the serial port,
2. opens it at 115200 8N1,
3. sends the reconstructed 13-byte version query,
4. displays the raw 13-byte response,
5. performs no firmware write.

Once this matches GTool, add the start/confirm handshake without transferring data. Actual firmware transfer should be the last validation step and should use a spare device if possible.
