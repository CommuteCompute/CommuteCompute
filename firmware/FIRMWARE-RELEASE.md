<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Firmware Releases

## [LOCKED] Current Production: CC-FW-7.4.3

**Version:** 7.2.1  
**Commit:** `22f92ac`  
**Date:** 2026-02-02  
**Status:** [LOCKED] LOCKED — PRODUCTION RELEASE

### Key Features
- **BLE Provisioning** — Hybrid BLE + Pairing Code flow (WiFiManager removed)
- **60-second partial refresh** — HARDCODED per DEVELOPMENT-RULES.md Section 19
- **VCOM Stabilization** — `setLightSleep(true)` after every refresh
- **Zone-based rendering** — 5 zones, partial refresh supported
- **Anti-brick compliant** — 12/12 rules per Section 1.4

### VCOM Protection
- Display always in safe state for power-off/unplug
- MAX_PARTIAL_BEFORE_FULL reduced to 10
- Long-press (3s) triggers full VCOM discharge sequence

### Zones
| Zone | Position | Size |
|------|----------|------|
| header | 0, 0 | 800×94 |
| divider | 0, 94 | 800×2 |
| summary | 0, 96 | 800×28 |
| legs | 0, 132 | 800×316 |
| footer | 0, 448 | 800×32 |

### Server Compatibility
- **Required:** `your-project.vercel.app`
- **Endpoints:** `/api/zones`, `/api/zone/[id]`, `/api/screen`, `/api/pair/[code]`
- **Pairing:** 6-character code displayed on screen, user enters in Setup Wizard

### Hardware
- **Device:** TRMNL OG (ESP32-C3), TRMNL Mini
- **Display:** 800×480 / 600×448 e-ink
- **Library:** bb_epaper (bit-bang mode, speed=0)
- **Font:** FONT_8x8 only (FONT_12x16 has rotation bug)

### Build & Flash
```bash
cd firmware
pio run -e trmnl           # Compile
pio run -e trmnl -t upload # Flash via USB
# Monitor serial output (do NOT use pio device monitor -- causes crash/freeze on ESP32-C3)
screen /dev/cu.usbmodem* 115200          # macOS
# On Windows, use PuTTY (Serial mode, 115200 baud)
```

### Recovery
If device is bricked, use USB flash:
```bash
git checkout v7.2.1
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*
```

---

## Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| **7.2.1** | 2026-02-02 | [LOCKED] LOCKED | VCOM stabilization after every refresh |
| 7.2.0 | 2026-02-02 | Superseded | Added button handler, reduced partial count |
| 7.1.0 | 2026-02-01 | Superseded | Redis Cloud KV, Transit API validation |
| 7.0.0 | 2026-02-01 | Superseded | Hybrid BLE + Pairing provisioning |
| 6.1-60s | 2026-01-31 | Superseded | 60s refresh timing locked |
| 6.0-STABLE | 2026-01-30 | Superseded | First stable bb_epaper version |
| 5.15 | 2026-01-29 | Superseded | Boot sequence refinements |
| 3.3 | 2026-01-28 | Superseded | Anti-brick compliance |
| 1.0.0-stable | 2026-01-29 | Superseded | First production release |

---

## Why WiFiManager Was Removed

ESP32-C3 crashes with `0xbaad5678` error when WiFiManager/captive portal is used due to:
- Static NVS initialization before `setup()` runs
- Memory pressure from captive portal web server
- ArduinoJson stack corruption on C3 architecture

**Solution:** Hybrid BLE + Pairing Code provisioning (Section 21.7)

---

**Maintained by:** Angus Bergman  
**License:** AGPL-3.0 Dual License
