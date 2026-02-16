<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Boot Welcome Screen Specification

**Firmware Display Behaviour During First Boot and Setup**

**Copyright (c) 2026 Angus Bergman**
**AGPL-3.0 Dual Licence**

---

## Overview

The boot welcome screen guides users through initial device setup. It displays when:
1. Device first boots after flashing
2. Device has no saved WiFi credentials
3. User triggers factory reset
4. Setup has not been completed on the server

---

## Screen Layouts

### State 1: WiFi Setup Required

Displayed when device has no WiFi credentials.

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                                              │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                    WiFi Setup Required                        │
│                    ═══════════════════                        │
│                                                               │
│         Connect to WiFi network:                              │
│                                                               │
│              "Commute Compute-Setup"                                │
│                                                               │
│         Then open in browser:                                 │
│                                                               │
│            http://192.168.4.1                                 │
│                                                               │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**
- Use FONT_8x8 only (FONT_12x16 causes rotation bug)
- Centre text horizontally
- Keep layout simple for e-ink readability
- Refresh once, then deep sleep until WiFi config received

---

### State 2: Connecting to WiFi

Displayed while device connects to saved WiFi network.

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                                             │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                    Connecting to WiFi...                      │
│                                                               │
│                    Network: "HomeWiFi"                        │
│                                                               │
│                         ⟳                                     │
│                                                               │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**
- Show network name being connected to
- Update display if connection fails
- Timeout after 30 seconds, show error screen

---

### State 3: Setup Required (WiFi Connected)

Displayed when WiFi is connected but server setup not complete.

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                          Connected ✓        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                                                               │
│                    SETUP REQUIRED                             │
│                    ══════════════                             │
│                                                               │
│         Complete setup at your admin panel:                   │
│                                                               │
│         https://[server-url]/setup                            │
│                                                               │
│                                                               │
│         Device will refresh when setup is complete.           │
│                                                               │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

**Implementation Notes:**
- Replace `[server-url]` with actual configured server URL
- Poll server every 60 seconds to check if setup complete
- Show "Connected ✓" in top right to confirm WiFi working

---

### State 4: Fetching Data

Displayed when fetching initial transit data from server.

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                          Connected ✓        │
├───────────────────────────────────┬───────────────────────────┤
│                                   │  Loading...               │
│                                   │  ═══════════              │
│      Fetching transit data...     │                           │
│                                   │  ✓ WiFi connected         │
│                                   │  ✓ Server reached         │
│             ⟳                     │  ⟳ Fetching data...       │
│                                   │                           │
│                                   │                           │
│                                   │                           │
│                                   │  © 2026 Angus Bergman     │
└───────────────────────────────────┴───────────────────────────┘
```

**Implementation Notes:**
- Split screen layout: main message left, progress log right
- Update log entries incrementally (don't clear previous)
- Use partial refresh to add new log entries

---

### State 5: Ready (Normal Operation)

Displayed after successful setup - transitions to normal dashboard display.

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                          08:05 Mon 28 Jan   │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Setup Complete! ✓                                            │
│                                                               │
│  Starting dashboard in 3 seconds...                           │
│                                                               │
│                                                               │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

Then immediately transitions to normal dashboard display.

---

### State 6: Error States

#### WiFi Connection Failed

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                                              │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                    WiFi Connection Failed                     │
│                    ════════════════════                       │
│                                                               │
│         Could not connect to "HomeWiFi"                       │
│                                                               │
│         Please check:                                         │
│         • WiFi password is correct                            │
│         • Network is 2.4GHz (not 5GHz)                        │
│         • Router is in range                                  │
│                                                               │
│         Retrying in 30 seconds...                             │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

#### Server Unreachable

```
┌───────────────────────────────────────────────────────────────┐
│  Commute Compute CC-FW-7.5.0                           Connected ✓        │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│                    Server Unreachable                         │
│                    ══════════════════                         │
│                                                               │
│         Could not reach:                                      │
│         https://[server-url]                                  │
│                                                               │
│         Please check:                                         │
│         • Server is deployed and running                      │
│         • URL is correct                                      │
│         • Server is not sleeping (Render free tier)           │
│                                                               │
│         Retrying in 60 seconds...                             │
│                                                               │
│                                          © 2026 Angus Bergman │
└───────────────────────────────────────────────────────────────┘
```

---

## Firmware Implementation

### State Machine

```cpp
enum BootState {
    BOOT_INIT,
    BOOT_WIFI_SETUP_REQUIRED,
    BOOT_WIFI_CONNECTING,
    BOOT_WIFI_CONNECTED,
    BOOT_CHECKING_SETUP,
    BOOT_SETUP_REQUIRED,
    BOOT_FETCHING_DATA,
    BOOT_READY,
    BOOT_ERROR_WIFI,
    BOOT_ERROR_SERVER,
    BOOT_NORMAL_OPERATION
};

BootState currentBootState = BOOT_INIT;
```

### Display Functions

```cpp
void displayBootScreen(BootState state) {
    switch (state) {
        case BOOT_WIFI_SETUP_REQUIRED:
            drawWiFiSetupScreen();
            break;
        case BOOT_WIFI_CONNECTING:
            drawConnectingScreen();
            break;
        case BOOT_SETUP_REQUIRED:
            drawSetupRequiredScreen();
            break;
        case BOOT_FETCHING_DATA:
            drawFetchingDataScreen();
            break;
        case BOOT_READY:
            drawReadyScreen();
            delay(3000);
            transitionToNormalOperation();
            break;
        case BOOT_ERROR_WIFI:
            drawWiFiErrorScreen();
            break;
        case BOOT_ERROR_SERVER:
            drawServerErrorScreen();
            break;
    }
}
```

### Text Rendering Rules

**CRITICAL: Use FONT_8x8 only!**

```cpp
// CORRECT - Use FONT_8x8
bbep.setFont(FONT_8x8);
bbep.setCursor(x, y);
bbep.print("Your text here");

// WRONG - FONT_12x16 causes 90° rotation bug on TRMNL OG
// bbep.setFont(FONT_12x16);  // [NO] DO NOT USE
```

### Screen Coordinates (800x480 Landscape)

```cpp
// Header
#define HEADER_Y 10
#define HEADER_HEIGHT 30

// Main content area
#define CONTENT_START_Y 50
#define CONTENT_END_Y 430

// Footer
#define FOOTER_Y 450
#define FOOTER_HEIGHT 30

// Split screen (for progress logs)
#define LEFT_PANEL_WIDTH 450
#define RIGHT_PANEL_START_X 470
#define RIGHT_PANEL_WIDTH 320

// Centering helper
int centerTextX(const char* text, int fontWidth) {
    return (800 - (strlen(text) * fontWidth)) / 2;
}
```

---

## Progress Log Display

### Log Entry Structure

```cpp
struct LogEntry {
    char status;      // 'S' = success, 'E' = error, 'L' = loading
    String message;
    unsigned long timestamp;
};

#define MAX_LOG_ENTRIES 8
LogEntry logEntries[MAX_LOG_ENTRIES];
int logEntryCount = 0;
```

### Adding Log Entries

```cpp
void addLogEntry(char status, String message) {
    if (logEntryCount < MAX_LOG_ENTRIES) {
        logEntries[logEntryCount].status = status;
        logEntries[logEntryCount].message = message;
        logEntries[logEntryCount].timestamp = millis();
        logEntryCount++;
        
        // Partial refresh to show new entry
        drawLogPanel();
        bbep.refresh(REFRESH_PARTIAL, true);
    }
}

// Usage during boot
addLogEntry('S', "WiFi connected");
addLogEntry('L', "Reaching server...");
addLogEntry('S', "Server connected");
addLogEntry('L', "Fetching data...");
```

### Log Panel Rendering

```cpp
void drawLogPanel() {
    int y = CONTENT_START_Y + 20;
    int lineHeight = 20;
    
    // Header
    bbep.setFont(FONT_8x8);
    bbep.setCursor(RIGHT_PANEL_START_X, CONTENT_START_Y);
    bbep.print("Progress");
    
    // Separator line
    bbep.drawLine(RIGHT_PANEL_START_X, CONTENT_START_Y + 12, 
                  RIGHT_PANEL_START_X + RIGHT_PANEL_WIDTH - 20, CONTENT_START_Y + 12, 
                  BBEP_BLACK);
    
    // Log entries
    for (int i = 0; i < logEntryCount; i++) {
        bbep.setCursor(RIGHT_PANEL_START_X, y);
        
        // Status icon
        switch (logEntries[i].status) {
            case 'S': bbep.print("[OK] "); break;
            case 'E': bbep.print("[!!] "); break;
            case 'L': bbep.print("[..] "); break;
        }
        
        bbep.print(logEntries[i].message);
        y += lineHeight;
    }
    
    // Copyright at bottom
    bbep.setCursor(RIGHT_PANEL_START_X, FOOTER_Y);
    bbep.print("(c) 2026 Angus Bergman");
}
```

---

## Server Communication

### Check Setup Status

```cpp
bool checkSetupStatus() {
    HTTPClient http;
    String url = String(SERVER_URL) + "/api/setup-status";
    
    http.begin(url);
    http.addHeader("Accept", "application/json");
    http.setTimeout(10000);  // 10 second timeout
    
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, payload);
        
        return doc["setupComplete"].as<bool>();
    }
    
    return false;
}
```

### Server Endpoint Required

The server must provide `/api/setup-status`:

```javascript
// server.js
app.get('/api/setup-status', (req, res) => {
    const preferences = loadPreferences();
    const setupComplete = preferences.homeAddress && 
                          preferences.workAddress && 
                          preferences.homeStop;
    
    res.json({
        setupComplete: setupComplete,
        serverTime: new Date().toISOString(),
        version: "3.4.0"
    });
});
```

---

## Testing Checklist

- [ ] Device shows WiFi setup screen on first boot
- [ ] WiFi captive portal works at 192.168.4.1
- [ ] Device connects to WiFi after credentials entered
- [ ] "Setup Required" screen shows correct server URL
- [ ] Progress log entries appear incrementally
- [ ] Partial refresh works for log updates
- [ ] Error screens display with retry countdown
- [ ] Device transitions to dashboard after setup complete
- [ ] All text renders correctly (no rotation bugs)
- [ ] Copyright shows in footer

---

**Copyright (c) 2026 Angus Bergman**
**AGPL-3.0 Dual Licence**
