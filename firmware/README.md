<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

<h1 align="center">CCFirm™ — Commute Compute Custom Firmware</h1>

![Version](https://img.shields.io/badge/version-7.2.1-blue)
![Anti-Brick](https://img.shields.io/badge/Anti--Brick-12%2F12%20✓-brightgreen)
![Platform](https://img.shields.io/badge/platform-ESP32--C3-orange)
![Logo](https://img.shields.io/badge/Logos-32bit%20Aligned%20✓-brightgreen)

<p align="center">
  <img src="https://img.shields.io/badge/version-CC--FW--7.2.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/status-[LOCKED]%20LOCKED-green" alt="Locked">
  <img src="https://img.shields.io/badge/Anti--Brick-12%2F12%20✓-brightgreen" alt="Anti-Brick">
  <img src="https://img.shields.io/badge/platform-ESP32--C3-orange" alt="Platform">
</p>

---

## Overview

CCFirm™ is the custom firmware that runs on TRMNL e-ink display hardware to power the Commute Compute System. It implements:

- **BLE + Pairing Code provisioning** (WiFiManager removed — causes ESP32-C3 crashes)
- **60-second partial refresh** (HARDCODED per DEVELOPMENT-RULES.md Section 19)
- **VCOM stabilization** — Safe power-off at any time
- **Zone-based rendering** — Server renders, device displays
- **Anti-brick compliance** — 12/12 safety rules enforced

> [CAUTION] **LOCKED FIRMWARE**: CC-FW-7.4.3 is the production-locked version. Do not modify without explicit approval per DEVELOPMENT-RULES.md Section 5.6.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMMUTE COMPUTE SYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐         ┌──────────────────────────────────┐ │
│   │   TRMNL      │  WiFi   │        Vercel Server             │ │
│   │   Device     │ ◄─────► │                                  │ │
│   │              │         │  ┌─────────────────────────────┐ │ │
│   │  CC-FW-7.4.3 │         │  │ CommuteCompute™ Engine      │ │ │
│   │              │         │  │ • Journey calculation       │ │ │
│   │  • Display   │         │  │ • Coffee decision           │ │ │
│   │  • Refresh   │         │  │ • Real-time departures      │ │ │
│   │  • Sleep     │         │  └─────────────────────────────┘ │ │
│   │              │         │                                  │ │
│   │  bb_epaper   │         │  ┌─────────────────────────────┐ │ │
│   │  (bit-bang)  │         │  │ CCDashRenderer™ V15.0       │ │ │
│   │              │         │  │ • 1-bit BMP generation      │ │ │
│   └──────────────┘         │  │ • Zone diffing              │ │ │
│                            │  └─────────────────────────────┘ │ │
│                            └──────────────────────────────────┘ │
│                                                                  │
│   The server is the brain — the device just displays.           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Specifications

| Attribute | Value |
|-----------|-------|
| **Version** | CC-FW-7.4.3 |
| **Status** | [LOCKED] LOCKED (2026-02-02) |
| **Commit** | `22f92ac` |
| **Refresh Interval** | 60 seconds (HARDCODED) |
| **Provisioning** | BLE + 6-character Pairing Code |
| **Display Library** | bb_epaper (bit-bang mode, speed=0) |
| **Font** | FONT_8x8 only (FONT_12x16 has rotation bug) |
| **Anti-Brick** | 12/12 rules compliant |

---

## Device Setup Flow

### Phase 1: BLE Provisioning
1. Device boots, shows welcome screen with pairing code
2. User opens Setup Wizard on phone/computer
3. Wizard connects via BLE, sends WiFi credentials (SSID + password only)
4. Device connects to WiFi

### Phase 2: Server Pairing
1. Device displays 6-character pairing code (e.g., `A3X7K9`)
2. User enters code in Setup Wizard
3. Wizard calls `/api/pair/[code]` with server URL
4. Device polls `/api/pair/[code]` and receives configuration
5. Device begins normal operation

```
┌─────────────┐    BLE     ┌─────────────┐    HTTP    ┌─────────────┐
│   Phone     │ ─────────► │   TRMNL     │ ─────────► │   Vercel    │
│   Wizard    │  WiFi creds│   Device    │  Poll pair │   Server    │
└─────────────┘            └─────────────┘            └─────────────┘
      │                          │                          │
      │    Enter pairing code    │                          │
      └──────────────────────────┼──────────────────────────►
                                 │   /api/pair/A3X7K9       │
                                 ◄──────────────────────────┘
```

> **Why not WiFiManager?** ESP32-C3 crashes with `0xbaad5678` error due to static NVS initialization and memory pressure from the captive portal. See DEVELOPMENT-RULES.md Section 21.7.

---

## Hardware Requirements

| Component | Specification |
|-----------|---------------|
| **Device** | TRMNL OG or TRMNL Mini |
| **MCU** | ESP32-C3 (RISC-V, single-core, 160MHz) |
| **Display** | 7.5" e-ink, 800×480 (OG) or 600×448 (Mini) |
| **Memory** | 400KB SRAM, 4MB Flash |
| **Connectivity** | WiFi 802.11 b/g/n (2.4GHz), BLE 5.0 |
| **USB** | USB-C for flashing and power |

---

## Pin Configuration (TRMNL OG)

| Signal | GPIO | Note |
|--------|------|------|
| SCK | 7 | SPI Clock (bit-bang) |
| MOSI | 8 | SPI Data |
| CS | 6 | Chip Select |
| DC | 5 | Data/Command |
| RST | 10 | Reset |
| BUSY | 4 | Busy signal |
| INT | 2 | Button interrupt |

---

## Build & Flash

### Prerequisites
- PlatformIO CLI or VS Code extension
- USB-C cable (data-capable)

### Commands

```bash
cd firmware

# Build
pio run -e trmnl

# Flash via USB
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*

# Monitor serial (115200 baud via USB CDC)
# WARNING: Do NOT use `pio device monitor` -- it causes crash/freeze on ESP32-C3.
# Use a standalone serial terminal instead:
screen /dev/cu.usbmodem* 115200          # macOS
# On Windows, use PuTTY (Serial mode, 115200 baud)
```

### Expected Boot Output

```
=== Commute Compute v7.2.1 ===
BLE Provisioning Firmware
[Display] Initializing...
[Display] Full refresh complete
[VCOM] Display in light sleep - safe for power-off
[BLE] Advertising started
```

---

## Anti-Brick Compliance

All 12 rules from DEVELOPMENT-RULES.md Section 1.4:

| # | Rule | Status |
|---|------|--------|
| 1 | `setup()` completes in < 5 seconds | [YES] |
| 2 | NO network operations in `setup()` | [YES] |
| 3 | NO `deepSleep()` in `setup()` | [YES] |
| 4 | NO delays > 2 seconds anywhere | [YES] |
| 5 | NO watchdog timer | [YES] |
| 6 | Brownout detection DISABLED | [YES] |
| 7 | State machine architecture | [YES] |
| 8 | `FONT_8x8` only (TRMNL OG) | [YES] |
| 9 | NO `allocBuffer()` calls | [YES] |
| 10 | Bit-bang SPI mode (speed=0) | [YES] |
| 11 | NVS init before WiFiManager | [YES] |
| 12 | USB CDC flags enabled | [YES] |

---

## VCOM Discharge (Safe Power-Off)

Press and hold button for 3 seconds to trigger safe shutdown:

1. Display clears to WHITE (full refresh)
2. Brief flash to BLACK (100ms)
3. Return to WHITE (full refresh)
4. Enter light sleep mode
5. Serial: `[VCOM] Discharge complete - safe to power off`

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/zones` | Zone data for partial refresh (1-bit BMP) |
| `/api/screen` | Full 800×480 PNG for fallback |
| `/api/pair/[code]` | Device pairing endpoint |
| `/api/status` | Server health check |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No serial output | USB CDC flags missing | Add `-D ARDUINO_USB_MODE=1 -D ARDUINO_USB_CDC_ON_BOOT=1` |
| Display blank after flash | First load in progress | Allow 2--3 minutes for initial WiFi connection and first dashboard fetch |
| WiFi network not found | 5 GHz only | ESP32-C3 supports 2.4 GHz only. Ensure router broadcasts on 2.4 GHz. |
| WiFi scan selection fails | BLE provisioning issue | Try typing the network name manually instead of selecting from scan |
| Display shows garbage | `allocBuffer()` called | Remove all `allocBuffer()` calls |
| Text rotated 90° | FONT_12x16 bug | Use FONT_8x8 only |
| `SPI does not have default pins` | Hardware SPI on C3 | Use bit-bang mode (speed=0) |
| Silent hang before setup() | Static init crash | Use pointers, init in setup() |

See `docs/FLASHING.md` for detailed troubleshooting.

---

## License

**AGPL-3.0 Dual License**  
Copyright © 2026 Angus Bergman  
https://www.gnu.org/licenses/agpl-3.0.html

---

<p align="center">
  <em>Part of the Commute Compute System™</em>
</p>
