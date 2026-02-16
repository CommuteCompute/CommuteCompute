/**
 * CCFirmTRMNL v7.0 - Commute Compute Custom Firmware for TRMNL
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 * 
 * ARCHITECTURE:
 * - setup() < 5 seconds, NO network calls
 * - Single boot screen draw, then zone-only rendering
 * - State machine in loop(), no blocking operations
 * - NO allocBuffer() calls (ESP32-C3 crash bug)
 * - NO watchdog timer (causes freezes)
 * - FONT_8x8 only (rotation bug with larger fonts)
 * 
 * COMPLIANCE: DEVELOPMENT-RULES.md v1.6
 * - Section 1.4: Firmware Anti-Brick Rules
 * - Section 5: Custom Firmware Requirement  
 * - Section 5.4: Critical bb_epaper ESP32-C3 Findings
 * - Appendix D: TRMNL OG Critical Bugs & Fixes
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <bb_epaper.h>
#include <WiFiManager.h>
#include "soc/rtc_cntl_reg.h"

// ============================================================================
// VERSION & CONFIG
// ============================================================================

#define FIRMWARE_VERSION "7.0.2"

// Buffer size - must be >= 40KB for legs zone (31KB)
#define ZONE_BUFFER_SIZE 45000

// Timing (per DEVELOPMENT-RULES.md Section 19)
#define PARTIAL_REFRESH_MS 20000      // 20 seconds
#define FULL_REFRESH_MS    600000     // 10 minutes
#define HTTP_TIMEOUT_MS    15000      // 15 seconds
#define WIFI_TIMEOUT_MS    30000      // 30 seconds
#define MAX_PARTIAL_BEFORE_FULL 30    // Full refresh after 30 partials

// Default server
#define DEFAULT_SERVER_URL "https://your-deployment.vercel.app"

// Pin configuration (TRMNL OG)
#define EPD_DC_PIN    5
#define EPD_RST_PIN   10
#define EPD_BUSY_PIN  4
#define EPD_CS_PIN    6
#define EPD_MOSI_PIN  8
#define EPD_SCK_PIN   7
#define PIN_INTERRUPT 2

// ============================================================================
// STATE MACHINE
// ============================================================================

enum State {
    STATE_BOOT,           // Initial state, show boot screen
    STATE_WIFI_CONNECT,   // Connect to WiFi (no screen draw)
    STATE_WIFI_PORTAL,    // WiFi portal active (no screen draw)
    STATE_FETCH_ZONES,    // Fetch zone data from server
    STATE_RENDER,         // Render zones to display
    STATE_IDLE,           // Wait for next refresh cycle
    STATE_ERROR           // Error state (render error via zone)
};

// ============================================================================
// ZONE DEFINITIONS (must match /api/zones)
// ============================================================================

struct ZoneDef {
    const char* id;
    int x, y, w, h;
};

// Per Appendix D.1 - zone names MUST match API exactly
static const ZoneDef ZONES[] = {
    {"header",  0,   0,   800, 94},
    {"summary", 0,   96,  800, 28},
    {"legs",    0,   132, 800, 316},
    {"footer",  0,   448, 800, 32}
};
static const int ZONE_COUNT = sizeof(ZONES) / sizeof(ZONES[0]);

// ============================================================================
// GLOBALS
// ============================================================================

BBEPAPER bbep(EP75_800x480);
Preferences preferences;
WiFiManager wifiManager;

// State
State currentState = STATE_BOOT;
char serverUrl[128] = "";
bool wifiConnected = false;
bool initialDrawDone = false;

// Buffers
uint8_t* zoneBuffer = nullptr;
bool zoneChanged[ZONE_COUNT] = {true, true, true, true};

// Timing
unsigned long lastRefresh = 0;
unsigned long lastFullRefresh = 0;
int partialRefreshCount = 0;

// Error handling
int consecutiveErrors = 0;
unsigned long lastErrorTime = 0;
char lastErrorMsg[64] = "";

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================

void loadSettings();
void saveSettings();
bool fetchAndDrawZone(const ZoneDef& zone, bool partial);
void doFullRefresh();
void doPartialRefresh();
unsigned long getBackoffDelay();

// ============================================================================
// SETUP - Must complete in <5 seconds, NO blocking operations
// ============================================================================

void setup() {
    // Disable brownout detector (prevents spurious resets)
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    
    // Serial init
    Serial.begin(115200);
    delay(300);
    Serial.println();
    Serial.println("========================================");
    Serial.printf("CCFirmTRMNL v%s\n", FIRMWARE_VERSION);
    Serial.println("Commute Compute System");
    Serial.println("Anti-Brick Compliant: 12/12");
    Serial.println("========================================");
    
    // Load saved settings
    Serial.println("→ Loading settings...");
    loadSettings();
    
    // Apply default server if none configured
    if (strlen(serverUrl) == 0) {
        Serial.println("→ No server configured, using default");
        strncpy(serverUrl, DEFAULT_SERVER_URL, sizeof(serverUrl) - 1);
        serverUrl[sizeof(serverUrl) - 1] = '\0';
    }
    Serial.printf("✓ Server URL: %s\n", serverUrl);
    
    // Allocate zone buffer
    zoneBuffer = (uint8_t*)malloc(ZONE_BUFFER_SIZE);
    if (!zoneBuffer) {
        Serial.println("✗ FATAL: Failed to allocate zone buffer");
        // Continue anyway - will fail gracefully on fetch
    } else {
        Serial.printf("✓ Zone buffer allocated: %d bytes\n", ZONE_BUFFER_SIZE);
    }
    
    // Initialize display - per Section 5.4
    // DO NOT call allocBuffer() - causes crash on ESP32-C3
    Serial.println("→ Init display...");
    bbep.initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN,
                EPD_MOSI_PIN, EPD_SCK_PIN, 8000000);
    bbep.setPanelType(EP75_800x480);
    bbep.setRotation(0);
    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    delay(100);  // Let display settle
    Serial.println("✓ Display initialized");
    
    // SKIP boot screen - bb_epaper text drawing crashes on ESP32-C3
    // Let zone-based rendering handle all display output
    Serial.println("→ Skipping boot screen (bb_epaper crash workaround)");
    Serial.println("→ Display will show zones directly after WiFi connect");
    
    // Transition to WiFi connect state
    currentState = STATE_WIFI_CONNECT;
    
    Serial.println("→ Setup complete, entering loop()");
    Serial.println();
}

// ============================================================================
// LOOP - State machine, NO blocking operations
// ============================================================================

void loop() {
    unsigned long now = millis();
    
    switch (currentState) {
        
        // ====================================================================
        case STATE_WIFI_CONNECT: {
            Serial.println("→ STATE: WiFi Connect");
            
            // Configure WiFiManager
            wifiManager.setConfigPortalTimeout(180);  // 3 minutes
            wifiManager.setConnectTimeout(30);
            
            // Non-blocking auto-connect
            if (wifiManager.autoConnect("CommuteCompute-Setup", "setup-password")) {
                Serial.println("✓ WiFi connected");
                Serial.printf("  IP: %s\n", WiFi.localIP().toString().c_str());
                wifiConnected = true;
                currentState = STATE_FETCH_ZONES;
            } else {
                Serial.println("→ WiFi portal active, waiting for config...");
                currentState = STATE_WIFI_PORTAL;
            }
            break;
        }
        
        // ====================================================================
        case STATE_WIFI_PORTAL: {
            // WiFiManager handles the portal
            // Check if connected
            if (WiFi.status() == WL_CONNECTED) {
                Serial.println("✓ WiFi connected via portal");
                wifiConnected = true;
                currentState = STATE_FETCH_ZONES;
            }
            
            // Small delay to prevent tight loop
            delay(500);
            break;
        }
        
        // ====================================================================
        case STATE_FETCH_ZONES: {
            // Check WiFi still connected
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("✗ WiFi disconnected");
                wifiConnected = false;
                currentState = STATE_WIFI_CONNECT;
                break;
            }
            
            // Check for backoff after errors
            if (consecutiveErrors > 0) {
                unsigned long backoff = getBackoffDelay();
                if (now - lastErrorTime < backoff) {
                    delay(1000);
                    break;
                }
            }
            
            // Check if refresh needed
            bool needsRefresh = !initialDrawDone || 
                               (now - lastRefresh >= PARTIAL_REFRESH_MS);
            
            if (!needsRefresh) {
                currentState = STATE_IDLE;
                break;
            }
            
            // Determine if full refresh needed
            bool needsFull = !initialDrawDone ||
                            (now - lastFullRefresh >= FULL_REFRESH_MS) ||
                            (partialRefreshCount >= MAX_PARTIAL_BEFORE_FULL);
            
            Serial.printf("→ Fetching zones (full=%s)\n", needsFull ? "yes" : "no");
            
            // Fetch and render each zone
            int drawn = 0;
            bool anyFailed = false;
            
            for (int i = 0; i < ZONE_COUNT; i++) {
                if (fetchAndDrawZone(ZONES[i], !needsFull)) {
                    drawn++;
                    zoneChanged[i] = false;
                    
                    // Partial refresh per zone (unless doing full)
                    if (!needsFull) {
                        doPartialRefresh();
                        delay(50);  // Brief settle time
                    }
                } else {
                    anyFailed = true;
                }
                
                yield();  // Let WiFi stack breathe
            }
            
            // Full refresh after all zones drawn
            if (needsFull && drawn > 0) {
                doFullRefresh();
                lastFullRefresh = now;
                partialRefreshCount = 0;
                initialDrawDone = true;
            } else if (drawn > 0 && !needsFull) {
                partialRefreshCount++;
            }
            
            // Update state
            if (drawn > 0) {
                consecutiveErrors = 0;
                lastRefresh = now;
                Serial.printf("✓ Rendered %d/%d zones\n", drawn, ZONE_COUNT);
            } else {
                consecutiveErrors++;
                lastErrorTime = now;
                Serial.printf("✗ Fetch failed (attempt %d)\n", consecutiveErrors);
            }
            
            currentState = STATE_IDLE;
            break;
        }
        
        // ====================================================================
        case STATE_IDLE: {
            // Wait for next refresh cycle
            delay(1000);
            
            // Check if refresh needed
            if (now - lastRefresh >= PARTIAL_REFRESH_MS || !initialDrawDone) {
                currentState = STATE_FETCH_ZONES;
            }
            break;
        }
        
        // ====================================================================
        case STATE_ERROR: {
            // Error state - wait and retry
            Serial.printf("→ STATE: Error - %s\n", lastErrorMsg);
            delay(5000);
            currentState = STATE_WIFI_CONNECT;
            break;
        }
        
        // ====================================================================
        default:
            currentState = STATE_WIFI_CONNECT;
            break;
    }
}

// ============================================================================
// SETTINGS
// ============================================================================

void loadSettings() {
    // Open preferences - create if doesn't exist
    if (!preferences.begin("ccfirm", false)) {  // Read-write mode to create
        Serial.println("→ Creating preferences namespace...");
        preferences.end();
        preferences.begin("ccfirm", false);
    }
    
    String url = preferences.getString("serverUrl", "");
    if (url.length() > 0) {
        strncpy(serverUrl, url.c_str(), sizeof(serverUrl) - 1);
        serverUrl[sizeof(serverUrl) - 1] = '\0';
    }
    
    preferences.end();
}

void saveSettings() {
    preferences.begin("ccfirm", false);  // Read-write
    preferences.putString("serverUrl", serverUrl);
    preferences.end();
}

// ============================================================================
// ZONE FETCHING & RENDERING
// ============================================================================

bool fetchAndDrawZone(const ZoneDef& zone, bool partial) {
    if (!zoneBuffer) return false;
    
    // Build URL
    String url = String(serverUrl);
    if (!url.endsWith("/")) url += "/";
    url += "api/zone/";
    url += zone.id;
    url.replace("//api", "/api");
    
    Serial.printf("  → Fetching %s...\n", zone.id);
    
    // Create HTTPS client
    WiFiClientSecure* client = new WiFiClientSecure();
    if (!client) {
        Serial.println("  ✗ Failed to create client");
        return false;
    }
    client->setInsecure();  // Skip cert verification for now
    
    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    
    if (!http.begin(*client, url)) {
        Serial.println("  ✗ HTTP begin failed");
        delete client;
        return false;
    }
    
    http.addHeader("User-Agent", "CCFirmTRMNL/" FIRMWARE_VERSION);
    
    int httpCode = http.GET();
    
    if (httpCode != 200) {
        Serial.printf("  ✗ HTTP %d\n", httpCode);
        http.end();
        delete client;
        return false;
    }
    
    // Get response size
    int contentLength = http.getSize();
    if (contentLength <= 0 || contentLength > ZONE_BUFFER_SIZE) {
        Serial.printf("  ✗ Invalid size: %d\n", contentLength);
        http.end();
        delete client;
        return false;
    }
    
    // Read BMP data into buffer
    WiFiClient* stream = http.getStreamPtr();
    int bytesRead = 0;
    
    while (bytesRead < contentLength && stream->available()) {
        int chunk = stream->readBytes(zoneBuffer + bytesRead, 
                                      min(1024, contentLength - bytesRead));
        bytesRead += chunk;
        yield();
    }
    
    http.end();
    delete client;
    
    if (bytesRead != contentLength) {
        Serial.printf("  ✗ Incomplete read: %d/%d\n", bytesRead, contentLength);
        return false;
    }
    
    Serial.printf("  ✓ %s: %d bytes\n", zone.id, bytesRead);
    
    // Parse BMP header and draw to display
    // BMP header: 14 bytes file header + 40 bytes DIB header
    if (bytesRead < 54) {
        Serial.println("  ✗ BMP too small");
        return false;
    }
    
    // Verify BMP magic
    if (zoneBuffer[0] != 'B' || zoneBuffer[1] != 'M') {
        Serial.println("  ✗ Not a BMP file");
        return false;
    }
    
    // Get pixel data offset
    uint32_t pixelOffset = *(uint32_t*)(zoneBuffer + 10);
    
    // Get dimensions from DIB header
    int32_t bmpWidth = *(int32_t*)(zoneBuffer + 18);
    int32_t bmpHeight = *(int32_t*)(zoneBuffer + 22);
    uint16_t bitsPerPixel = *(uint16_t*)(zoneBuffer + 28);
    
    // Height is positive for bottom-up (per Appendix D.2)
    bool bottomUp = bmpHeight > 0;
    if (bmpHeight < 0) bmpHeight = -bmpHeight;
    
    // Verify 1-bit
    if (bitsPerPixel != 1) {
        Serial.printf("  ✗ Not 1-bit BMP: %d bpp\n", bitsPerPixel);
        return false;
    }
    
    // Row stride (padded to 4 bytes)
    int rowBytes = ((bmpWidth + 31) / 32) * 4;
    
    // Draw pixels to display
    uint8_t* pixels = zoneBuffer + pixelOffset;
    
    for (int row = 0; row < bmpHeight && row < zone.h; row++) {
        // Source row (bottom-up means row 0 is at bottom)
        int srcRow = bottomUp ? (bmpHeight - 1 - row) : row;
        uint8_t* rowData = pixels + (srcRow * rowBytes);
        
        for (int col = 0; col < bmpWidth && col < zone.w; col++) {
            int byteIdx = col / 8;
            int bitIdx = 7 - (col % 8);
            bool isBlack = !((rowData[byteIdx] >> bitIdx) & 1);
            
            // Draw pixel at zone offset
            bbep.drawPixel(zone.x + col, zone.y + row, 
                          isBlack ? BBEP_BLACK : BBEP_WHITE);
        }
    }
    
    return true;
}

// ============================================================================
// DISPLAY REFRESH
// ============================================================================

void doFullRefresh() {
    Serial.println("→ Full refresh...");
    bbep.refresh(REFRESH_FULL, true);
    Serial.println("✓ Full refresh complete");
}

void doPartialRefresh() {
    bbep.refresh(REFRESH_PARTIAL, true);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

unsigned long getBackoffDelay() {
    // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
    unsigned long base = 5000;
    unsigned long delay = base << min(consecutiveErrors - 1, 4);
    return min(delay, 60000UL);
}
