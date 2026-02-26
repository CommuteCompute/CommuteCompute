<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Boot Sequence and Initialization Protocol

> **Note:** This document describes the legacy WiFiManager boot sequence used in firmware versions prior to v7.0. Current firmware (CCFirm v8.0.0) uses BLE provisioning. See [QUICK_START.md](QUICK_START.md) for current setup instructions.

**Version**: CC-FW-7.4.3
**Last Updated**: 2026-02-01

---

## Boot Sequence Overview

The firmware follows a strict sequential initialization protocol to ensure proper system startup and configuration validation.

---

## 1. Hardware Initialization (setup())

### Serial Communication
```cpp
Serial.begin(115200);
delay(500);
```
- Baud rate: 115200
- 500ms stabilization delay

### Persistent Storage
```cpp
preferences.begin("trmnl", false);
friendlyID = preferences.getString("friendly_id", "");
apiKey = preferences.getString("api_key", "");
```
- Namespace: "trmnl"
- Read-only: false
- Loads device credentials if previously registered

### Display Initialization
```cpp
bbep.initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN,
            EPD_MOSI_PIN, EPD_SCK_PIN, 8000000);
bbep.setPanelType(EP75_800x480);
bbep.setRotation(0);  // CRITICAL: 0 = Landscape (800x480)
```
- SPI clock: 8MHz
- Panel: 7.5" Waveshare 800x480
- Rotation: 0 (landscape orientation)
- **NEVER change rotation** - causes text rendering issues with FONT_12x16

---

## 2. Main Loop State Machine (loop())

The firmware operates as a state machine with the following states:

### STATE 1: WiFi Connection
```cpp
if (!wifiConnected) {
    connectWiFiSafe();
    if (!wifiConnected) {
        delay(5000);  // Retry every 5s
        return;
    }
    delay(2000);
    drawUnifiedSetupScreen();  // Show setup screen
    return;
}
```

**Actions**:
- Use WiFiManager for captive portal
- Timeout: 30s for config portal, 20s for connection
- On success: Start NTP time client
- Display: Show unified setup screen

---

### STATE 2: Device Registration
```cpp
if (!deviceRegistered) {
    registerDeviceSafe();
    if (!deviceRegistered) {
        delay(5000);  // Retry every 5s
        return;
    }
    delay(2000);
    fetchAndDisplaySafe();  // Immediately check setup status
    return;
}
```

**Actions**:
- POST to `SERVER_URL/api/setup` with MAC address header
- Uses HTTPS (WiFiClientSecure)
- Receives: friendly_id, api_key
- Saves credentials to preferences
- **CRITICAL**: Calls fetchAndDisplaySafe() to check if setup is complete

---

### STATE 3: Normal Operation
```cpp
if (now - lastRefresh >= REFRESH_INTERVAL) {
    fetchAndDisplaySafe();
}
```

**Actions**:
- Refresh every 20 seconds (REFRESH_INTERVAL = 20000ms)
- Fetches data from server
- Determines whether to show setup screen or live dashboard

---

## 3. Setup Progress Validation (fetchAndDisplaySafe())

This function determines which screen to display based on configuration status.

### API Call
```cpp
GET SERVER_URL/api/display
Headers:
  - ID: friendlyID
  - Access-Token: apiKey
  - FW-Version: 7.2.1
```

### Response Handling

#### HTTP 500 (System Not Configured)
```cpp
systemConfigured = false;
drawUnifiedSetupScreen();
```
- Indicates backend error or device not found
- Show setup screen

#### HTTP 200 (Success)
```json
{
  "status": 0,
  "current_time": "09:30",
  "weather": "Clear",
  "location": "Melbourne Central",
  "setup_addresses": true/false,
  "setup_transit_api": true/false,
  "setup_journey": true/false
}
```

Parse setup flags:
```cpp
setupAddresses = doc["setup_addresses"] | false;
setupTransitAPI = doc["setup_transit_api"] | false;
setupJourney = doc["setup_journey"] | false;

bool allStepsComplete = setupAddresses && setupTransitAPI && setupJourney;

if (allStepsComplete) {
    systemConfigured = true;
    drawLiveDashboard(currentTime, weather, location);
} else {
    systemConfigured = false;
    drawUnifiedSetupScreen();
}
```

### Decision Logic

**Show Unified Setup Screen IF**:
- HTTP 500 response
- OR any setup flag is false

**Show Live Dashboard ONLY IF**:
- HTTP 200 response
- AND setup_addresses == true
- AND setup_transit_api == true
- AND setup_journey == true

---

## 4. Setup Progress Flags (Server-Side)

From `src/server.js` line 1726-1743:

```javascript
const setupAddresses = Boolean(
  prefs?.journey?.homeAddress && prefs?.journey?.workAddress
);

const setupTransitAPI = Boolean(
  prefs?.apis?.transport?.apiKey || prefs?.apis?.transport?.devId
);

const setupJourney = Boolean(
  prefs?.journey?.transitRoute?.mode1?.departure
);
```

### Flag Definitions

| Flag | Criteria | Admin Page Tab |
|------|----------|----------------|
| `setup_addresses` | Home AND work addresses configured | Setup |
| `setup_transit_api` | Transport Victoria API key OR devId configured | Setup |
| `setup_journey` | Journey calculated (mode1.departure exists) | Setup → Calculate Journey |

---

## 5. Screen Selection Rules

### Unified Setup Screen
**When**: `!systemConfigured || (HTTP 500) || (any flag false)`

**Shows**:
- QR code to `SERVER_URL/admin`
- Device ID
- WiFi status
- Server registration status
- Decision log: [ ] Addresses, [ ] Transit API, [ ] Journey Settings
- Real-time clock (NTP synced)
- Firmware version, refresh count, heap memory

**Refresh**: Every 20 seconds (partial refresh for time/counters)

---

### Live Dashboard
**When**: `systemConfigured && (all flags true)`

**Shows**:
- Current time from NTP
- Weather
- Location
- Transit departure times
- Next service information

**Refresh**: Every 20 seconds

---

## 6. Critical Requirements

### [WARNING] DO NOT CHANGE
1. **Display Rotation**: Must stay at 0 (landscape)
   - Rotation 1/2/3 cause text misalignment
   - FONT_12x16 has rotation bug, use FONT_8x8 for headers

2. **NO WATCHDOG**: Removed in v7.2.1
   - Caused crashes in earlier versions
   - Continuous operation required for dashboard

3. **Screen Switching Logic**: Must check ALL three flags
   - Premature dashboard display shows "mashed up" content
   - User experience: setup must be complete before dashboard

### MUST DO
1. **Sequential Setup Validation**
   - Always check flags after device registration
   - Never assume setup is complete
   - Show setup screen until ALL flags are true

2. **HTTPS for Registration**
   - Use WiFiClientSecure for Render.com
   - setInsecure() for self-signed certs

3. **NTP Time Sync**
   - Sync on WiFi connect
   - Update every 60s
   - Melbourne timezone: UTC+10 (36000 seconds)

---

## 7. Error Handling

### WiFi Connection Failure
- Retry every 5 seconds
- Never proceed to registration without WiFi
- Display remains off until WiFi connects

### Registration Failure
- Retry every 5 seconds
- Never proceed to fetchAndDisplaySafe() without credentials
- Display shows "Server: Registering..."

### Fetch Failure
- HTTP 500 → Show setup screen
- Network error → Keep current display, retry in 20s
- Parse error → Log and retry

---

## 8. Development Rules

### Adding New Setup Steps
1. Add new flag to server `/api/display` response
2. Add new boolean variable to firmware
3. Parse new flag in fetchAndDisplaySafe()
4. Add to `allStepsComplete` logic
5. Add checkbox to drawUnifiedSetupScreen()

### Debugging Boot Issues
1. Check serial output at 115200 baud
2. Verify WiFi connects (look for IP address)
3. Verify registration (look for friendly_id)
4. Verify fetch response (look for setup flags)
5. Check which screen is being drawn

### Common Issues
| Issue | Cause | Fix |
|-------|-------|-----|
| Text rotated 90° | FONT_12x16 used for headers | Use FONT_8x8 |
| Premature dashboard | Missing flag check | Add to allStepsComplete |
| "Registering" stuck | HTTP vs HTTPS mismatch | Use WiFiClientSecure |
| Time not updating | NTP not initialized | Call timeClient.begin() |

---

## Version History

- **v5.9**: Working baseline (had rotated boot screen)
- **v5.10-v5.13**: Watchdog crashes
- **v5.14**: Removed watchdog, rotation fixes
- **v7.2.1**: Current version (CC-FW-7.4.3)
  - Unified setup screen
  - QR code with error correction
  - HTTPS registration
  - NTP time sync
  - Sequential setup validation

---

**Last Validated**: 2026-01-27 18:30 AEDT

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual Licence
