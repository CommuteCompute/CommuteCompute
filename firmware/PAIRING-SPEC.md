<p align="center">
  <img src="../assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# CCFirm™ Device Pairing Specification

**Version:** 2.0 (Hybrid BLE + Pairing)
**Last Updated:** 2026-02-01
**Copyright:** (c) 2026 Angus Bergman — AGPL-3.0 Dual License

---

## Overview

This document specifies the **hybrid two-phase provisioning flow** for CCFirm firmware:

1. **Phase 1 (BLE):** WiFi credentials sent via Bluetooth Low Energy
2. **Phase 2 (Pairing Code):** Server configuration via 6-character code

This architecture avoids WiFiManager/captive portal which crashes ESP32-C3.

---

## Why Hybrid?

| Approach | Problem |
|----------|---------|
| WiFiManager / Captive Portal | **CRASHES** ESP32-C3 with 0xbaad5678 Guru Meditation |
| BLE sends everything | Works, but couples WiFi and server config |
| **Hybrid (BLE + Pairing)** | [YES] Clean separation, no crashes, re-configurable |

**Benefits:**
- No captive portal crashes
- Minimal BLE payload (WiFi only)
- Rich server config via pairing
- Re-configurable without BLE

---

## Phase 1: BLE WiFi Provisioning

### User Flow

1. User powers on device (first boot or factory reset)
2. Device displays BLE setup screen
3. User opens Setup Wizard in Chrome/Edge
4. User clicks "Connect Device"
5. Browser shows Bluetooth device picker
6. User selects "CommuteCompute-XXXX"
7. Wizard reads available WiFi networks
8. User selects network and enters password
9. Wizard sends SSID + password via BLE
10. Device saves credentials and connects to WiFi

### BLE Characteristics

| UUID | Name | Direction | Purpose |
|------|------|-----------|---------|
| `CC000002-0000-1000-8000-00805F9B34FB` | SSID | Write | WiFi network name |
| `CC000003-0000-1000-8000-00805F9B34FB` | Password | Write | WiFi password |
| `CC000005-0000-1000-8000-00805F9B34FB` | Status | Read/Notify | Connection status |
| `CC000006-0000-1000-8000-00805F9B34FB` | WiFiList | Read | Available networks (CSV) |

**[PROHIBITED] NO URL CHARACTERISTIC** — Server URL comes via pairing code in Phase 2.

### BLE Setup Screen

```
┌─────────────────────────────────────────┐
│                                         │
│         COMMUTE COMPUTE                 │
│                                         │
│         BLUETOOTH SETUP                 │
│                                         │
│   1. Open setup wizard in Chrome/Edge   │
│   2. Click "Connect Device"             │
│   3. Select "CommuteCompute-XXXX"       │
│   4. Enter your WiFi credentials        │
│                                         │
│   Your device: CommuteCompute-A1B2      │
│                                         │
│   Waiting for connection...             │
│                                         │
│   © 2026 Angus Bergman                  │
└─────────────────────────────────────────┘
```

---

## Phase 2: Pairing Code Server Config

### Prerequisite

Device MUST be connected to WiFi (from Phase 1) before entering pairing mode.

### User Flow

1. Device connects to WiFi successfully
2. Device generates 6-character pairing code
3. Device displays code on e-ink screen
4. User enters code in Setup Wizard
5. User completes journey configuration
6. Wizard POSTs config to `/api/pair/{CODE}`
7. Device polls and receives webhookUrl
8. Device saves URL and transitions to dashboard

### Pairing Screen

```
┌─────────────────────────────────────────┐
│                                         │
│         COMMUTE COMPUTE                 │
│                                         │
│   WiFi Connected: ✓                     │
│                                         │
│   Enter this code in Setup Wizard:      │
│                                         │
│         ┌─────────────┐                 │
│         │   A7X9K2    │                 │
│         └─────────────┘                 │
│                                         │
│   [your-url].vercel.app/setup           │
│                                         │
│   Waiting for configuration...          │
│                                         │
│   © 2026 Angus Bergman                  │
└─────────────────────────────────────────┘
```

### Pairing Code Generation

```cpp
String generatePairingCode() {
  // Exclude ambiguous characters: 0, O, 1, I, L
  const char* chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  String code = "";
  for (int i = 0; i < 6; i++) {
    code += chars[random(0, strlen(chars))];
  }
  return code;
}
```

### Poll Pairing Endpoint

Device polls every 5 seconds:

```
GET https://[your-url].vercel.app/api/pair/[CODE]
```

**Response when waiting:**
```json
{
  "success": true,
  "status": "waiting",
  "message": "Waiting for setup to complete..."
}
```

**Response when paired:**
```json
{
  "success": true,
  "status": "paired",
  "webhookUrl": "https://[your-url].vercel.app/api/zones?token=...",
  "message": "Device paired successfully!"
}
```

---

## API Endpoints

### GET /api/pair/[code]

Device polls this to check if config is ready.

**Parameters:**
- `code`: 6-character pairing code (case-insensitive)

**Responses:**
- `200` with `status: "waiting"` — keep polling
- `200` with `status: "paired"` — config ready, includes webhookUrl
- `400` — invalid code format

### POST /api/pair/[code]

Setup wizard sends config to this endpoint.

**Body:**
```json
{
  "webhookUrl": "https://[your-url].vercel.app/api/zones?token=...",
  "config": {
    "home": { "address": "...", "lat": -37.8, "lng": 145.0 },
    "work": { "address": "...", "lat": -37.8, "lng": 145.0 },
    "coffee": { "enabled": true, "name": "..." }
  }
}
```

**Response:**
```json
{
  "success": true,
  "status": "configured",
  "message": "Device code A7X9K2 configured."
}
```

---

## Firmware State Machine

```
STATE_INIT
    │
    ▼
STATE_CHECK_CREDENTIALS ──── Has WiFi? ──── Yes ───► STATE_WIFI_CONNECT
    │                                                      │
    No                                                     │
    ▼                                                      │
STATE_BLE_PROVISION                                        │
    │ Advertise BLE                                        │
    │ Wait for SSID + Password                             │
    │ Save to Preferences                                  │
    ▼                                                      │
STATE_WIFI_CONNECT ◄───────────────────────────────────────┘
    │ Connect to WiFi
    │
    ▼
STATE_CHECK_SERVER_URL ──── Has URL? ──── Yes ───► STATE_FETCH_ZONES
    │
    No
    ▼
STATE_PAIRING_MODE
    │ Generate 6-char code
    │ Display on screen
    │ Poll /api/pair/[code]
    │ Save webhookUrl when received
    ▼
STATE_FETCH_ZONES → STATE_RENDER → STATE_IDLE
```

---

## Timing

| Action | Duration |
|--------|----------|
| BLE advertising timeout | 5 minutes |
| Pairing code validity | 10 minutes |
| Device poll interval | 5 seconds |
| Timeout (show error) | 10 minutes |

---

## Re-Configuration Scenarios

| Scenario | Action |
|----------|--------|
| Change WiFi network | Factory reset → Re-provision via BLE |
| Change server/preferences | New pairing code (no BLE needed) |
| Move to new home | Factory reset → Full re-provision |

---

## Factory Reset

Factory reset clears:
- WiFi SSID
- WiFi password
- Server URL
- All preferences

Device returns to `STATE_BLE_PROVISION` and displays BLE setup screen.

---

## Security Notes

- BLE credentials: WiFi password only, not server config
- Pairing codes: Single-use, expire after 10 minutes
- Vercel KV: Required for serverless persistence
- HTTPS: Required for all server communication

---

*This specification is part of the Commute Compute System™ by Angus Bergman*
