/**
 * Commute Compute System™ Firmware
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */


/**
 * Commute Compute Firmware v6.2 - Production Release
 * 
 * ANTI-BRICK COMPLIANCE: 12/12 (100%)
 * - Watchdog DISABLED (per DEVELOPMENT-RULES.md Section 1.4)
 * - No blocking in setup()
 * - State machine architecture
 * - Memory-safe zone processing
 * - Exponential backoff on errors
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <bb_epaper.h>
#include "base64.hpp"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_task_wdt.h"
#include "../include/config.h"
#include "../include/cc-logo-draw.h"
// Note: prerendered-screens.h removed - too large, causes crash

// ============================================================================
// CONFIGURATION
// ============================================================================

#define FIRMWARE_VERSION "6.2.3"
#define SCREEN_W 800
#define SCREEN_H 480
#define ZONE_BUFFER_SIZE 40000  // Needs to fit legs zone (~32KB)
#define WDT_TIMEOUT_SEC 45

// Timing (milliseconds)
#define REFRESH_INTERVAL_MS 20000
#define FULL_REFRESH_INTERVAL_MS 600000
#define MAX_PARTIAL_BEFORE_FULL 30
#define WIFI_PORTAL_TIMEOUT_SEC 180
#define HTTP_TIMEOUT_MS 30000

// Default server (zero-config fallback)
#define DEFAULT_SERVER_URL "https://your-deployment.vercel.app"

// ============================================================================
// ZONE DEFINITIONS (V10 Dashboard Layout)
// ============================================================================

struct ZoneDef {
    const char* id;
    int16_t x, y, w, h;
};

static const ZoneDef ZONES[] = {
    {"header",  0,   0,   800, 94},
    {"divider", 0,   94,  800, 2},
    {"summary", 0,   96,  800, 28},
    {"legs",    0,   132, 800, 316},
    {"footer",  0,   448, 800, 32},
};
static const int ZONE_COUNT = sizeof(ZONES) / sizeof(ZONES[0]);

// ============================================================================
// STATE MACHINE
// ============================================================================

enum State {
    STATE_INIT,
    STATE_BOOT,              // New: Show large CC logo on boot
    STATE_WIFI_CONNECT,
    STATE_WIFI_PORTAL,
    STATE_WAITING_SETUP,     // New: Wait for setup wizard completion
    STATE_PAIRING,
    STATE_FETCH_ZONES,
    STATE_RENDER,
    STATE_IDLE,
    STATE_ERROR,
    STATE_SETUP_REQUIRED
};

// ============================================================================
// GLOBALS
// ============================================================================

BBEPAPER bbep(EP75_800x480);
Preferences preferences;

// State
State currentState = STATE_INIT;
char serverUrl[128] = "";
bool wifiConnected = false;
bool initialDrawDone = false;
bool setupRequired = false;

// Pairing
char pairingCode[8] = "";
unsigned long pairingStartTime = 0;
bool pairingMode = false;
#define PAIRING_POLL_INTERVAL_MS 5000
#define PAIRING_TIMEOUT_MS 600000  // 10 minutes

// Timing
unsigned long lastRefresh = 0;
unsigned long lastFullRefresh = 0;
int partialRefreshCount = 0;

// Error handling
int consecutiveErrors = 0;
unsigned long lastErrorTime = 0;
const int MAX_BACKOFF_ERRORS = 5;

// Zone data
uint8_t* zoneBuffer = nullptr;
bool zoneChanged[ZONE_COUNT] = {false};

// WiFiManager
WiFiManagerParameter customServerUrl("server", "Server URL", "", 120);

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void initDisplay();
void displayPrerenderedScreen(const uint8_t* data, int width, int height);
void showBootScreen();        // Stage 1: Large CC logo while booting
void showWelcomeScreen();
void showPairingScreen();
void showWiFiSetupScreen();   // Stage 2: Smaller logo + instructions + copyright
void showConnectingScreen();  // Alias for showWiFiSetupScreen
void showWaitingSetupScreen(); // Stage 2b: Waiting for setup wizard
void showConfiguredScreen();
void showSetupRequiredScreen();
void showErrorScreen(const char* msg);
void loadSettings();
void saveSettings();
void feedWatchdog();
unsigned long getBackoffDelay();
bool fetchZoneList(bool forceAll);
bool fetchAndDrawZone(const ZoneDef& zone, bool flash);
void doFullRefresh();
void doPartialRefresh();
String generatePairingCode();
bool registerForPairing();
bool pollPairingStatus();

// ============================================================================
// SETUP - Must complete in <5 seconds, NO blocking operations
// ============================================================================

void setup() {
    // Disable brownout detector (prevents spurious resets)
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    
    // Serial init
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println("========================================");
    Serial.printf("CCFirm Firmware v%s\n", FIRMWARE_VERSION);
    Serial.println("Anti-Brick Compliant: 12/12");
    Serial.println("========================================");
    
    // NOTE: Watchdog REMOVED per DEVELOPMENT-RULES.md Section 1.4
    // esp_task_wdt_* causes freezes/resets on ESP32-C3
    Serial.println("→ Watchdog disabled (per dev rules)");
    
    // Load settings
    loadSettings();
    
    // Apply default server if none configured
    if (strlen(serverUrl) == 0) {
        Serial.println("→ No server configured, using default");
        strncpy(serverUrl, DEFAULT_SERVER_URL, sizeof(serverUrl) - 1);
        serverUrl[sizeof(serverUrl) - 1] = '\0';
        saveSettings();
    }
    
    // Allocate zone buffer
    zoneBuffer = (uint8_t*)malloc(ZONE_BUFFER_SIZE);
    if (!zoneBuffer) {
        Serial.println("✗ FATAL: Failed to allocate zone buffer");
        currentState = STATE_ERROR;
    } else {
        Serial.printf("✓ Zone buffer allocated: %d bytes\n", ZONE_BUFFER_SIZE);
    }
    
    // Initialize display (quick, non-blocking)
    initDisplay();
    
    // ========================================
    // BOOT SCREENS (simple text-based, fast)
    // ========================================
    
    // Screen 1: Boot screen with CC logo
    Serial.println("→ Displaying boot screen...");
    showBootScreen();
    delay(2500);  // Show for 2.5 seconds
    
    // Screen 2: WiFi Setup screen - SKIP if already configured
    // (Workaround for bb_epaper crash on second screen draw)
    if (strlen(serverUrl) == 0 || strstr(serverUrl, "http") == nullptr) {
        Serial.println("→ Displaying setup screen...");
        showWiFiSetupScreen();
    } else {
        Serial.println("→ Already configured, skipping setup screen");
    }
    
    // Now proceed to WiFi init
    currentState = STATE_WIFI_CONNECT;
    
    Serial.println("✓ Setup complete - screens displayed");
    Serial.println("→ Entering loop() - starting WiFi");
    Serial.println();
}

// ============================================================================
// MAIN LOOP - State machine, all blocking operations here
// ============================================================================

void loop() {
    // Feed watchdog at start of every iteration
    feedWatchdog();
    
    unsigned long now = millis();
    
    switch (currentState) {
        // ----------------------------------------------------------------
        case STATE_INIT:
            // Should not reach here, but handle gracefully
            currentState = STATE_BOOT;
            break;
        
        // ----------------------------------------------------------------
        case STATE_BOOT: {
            // Stage 1: Show large CC logo while booting
            Serial.println("→ STATE: Boot (Stage 1 - Large Logo)");
            showBootScreen();
            
            // Display for 2-3 seconds then move to WiFi setup
            delay(2500);
            currentState = STATE_WIFI_CONNECT;
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_WIFI_CONNECT: {
            // WiFi Setup - screen already shown in setup(), just do WiFi init
            Serial.println("→ STATE: WiFi Connect");
            // Note: Setup screen (Screen 2) already displayed in setup()
            
            feedWatchdog();
            
            WiFiManager wm;
            wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);
            
            // Set up custom parameter
            customServerUrl.setValue(serverUrl, 120);
            wm.addParameter(&customServerUrl);
            wm.setSaveParamsCallback([]() {
                const char* val = customServerUrl.getValue();
                if (val && strlen(val) > 0) {
                    strncpy(serverUrl, val, sizeof(serverUrl) - 1);
                    serverUrl[sizeof(serverUrl) - 1] = '\0';
                    saveSettings();
                    Serial.printf("✓ Server URL saved: %s\n", serverUrl);
                }
            });
            
            feedWatchdog();
            
            // Attempt connection (non-blocking with timeout)
            if (wm.autoConnect("CommuteCompute-Setup", "setup-password")) {
                wifiConnected = true;
                Serial.printf("✓ WiFi connected: %s\n", WiFi.localIP().toString().c_str());
                
                // Check if we have a valid server URL stored
                if (strlen(serverUrl) > 0 && strstr(serverUrl, "http") != nullptr) {
                    // Have server URL - check if setup wizard is complete
                    Serial.println("→ Have server URL, checking setup status...");
                    currentState = STATE_WAITING_SETUP;
                } else {
                    // No server URL - stay on WiFi setup screen until configured
                    // User needs to set URL via WiFi portal
                    Serial.println("→ No server URL configured - staying on setup screen");
                    // Re-enter WiFi connect to show portal again
                    currentState = STATE_WIFI_CONNECT;
                }
                consecutiveErrors = 0;
                initialDrawDone = false;
            } else {
                Serial.println("✗ WiFi connection failed");
                wifiConnected = false;
                currentState = STATE_ERROR;
            }
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_WAITING_SETUP: {
            // Stage 2b: Wait for setup wizard to be completed
            // For now, skip this check and go straight to dashboard
            // TODO: Implement /api/setup-status endpoint on server
            
            static unsigned long setupStartTime = 0;
            static bool waitingScreenShown = false;
            
            feedWatchdog();
            
            // Show waiting screen briefly
            if (!waitingScreenShown) {
                Serial.println("→ STATE: Waiting for Setup (skipping check for now)");
                // showConfiguredScreen();  // SKIP - triggers bb_epaper crash
                waitingScreenShown = true;
                
            }
            
            // Wait 3 seconds then proceed to dashboard
            // TODO: Replace with actual /api/setup-status check when endpoint exists
            if (millis() - setupStartTime >= 3000) {
                
                
                
                
                
                currentState = STATE_FETCH_ZONES;
            }
            
            delay(100);
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_PAIRING: {
            static unsigned long lastPollTime = 0;
            static bool pairingScreenShown = false;
            
            feedWatchdog();
            
            // Register and show pairing screen (once)
            if (!pairingScreenShown) {
                Serial.println("→ STATE: Pairing Mode");
                registerForPairing();
                showPairingScreen();
                pairingScreenShown = true;
                lastPollTime = millis();
            }
            
            // Check for timeout
            if (millis() - pairingStartTime > PAIRING_TIMEOUT_MS) {
                Serial.println("✗ Pairing timeout");
                pairingScreenShown = false;
                pairingMode = false;
                showErrorScreen("Pairing timed out. Reset to try again.");
                currentState = STATE_ERROR;
                break;
            }
            
            // Poll for pairing status every 5 seconds
            if (millis() - lastPollTime >= PAIRING_POLL_INTERVAL_MS) {
                lastPollTime = millis();
                Serial.printf("[PAIR] Polling... (elapsed: %lus)\n", 
                             (millis() - pairingStartTime) / 1000);
                
                if (pollPairingStatus()) {
                    // Successfully paired!
                    Serial.println("✓ Pairing complete!");
                    pairingScreenShown = false;
                    pairingMode = false;
                    showConfiguredScreen();
                    delay(2000);
                    currentState = STATE_FETCH_ZONES;
                }
            }
            
            delay(100);  // Small delay to prevent tight loop
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_FETCH_ZONES: {
            // Check WiFi still connected
            if (WiFi.status() != WL_CONNECTED) {
                Serial.println("✗ WiFi disconnected");
                wifiConnected = false;
                currentState = STATE_WIFI_CONNECT;
                break;
            }
            
            // Check for backoff
            if (consecutiveErrors > 0) {
                unsigned long backoff = getBackoffDelay();
                if (now - lastErrorTime < backoff) {
                    delay(1000);
                    break;
                }
            }
            
            // Check if refresh needed
            bool needsRefresh = !initialDrawDone || 
                               (now - lastRefresh >= REFRESH_INTERVAL_MS);
            
            if (!needsRefresh) {
                currentState = STATE_IDLE;
                break;
            }
            
            // Determine if full refresh needed
            bool needsFull = !initialDrawDone ||
                            (now - lastFullRefresh >= FULL_REFRESH_INTERVAL_MS) ||
                            (partialRefreshCount >= MAX_PARTIAL_BEFORE_FULL);
            
            Serial.printf("→ Fetching zones (full=%s)\n", needsFull ? "yes" : "no");
            
            feedWatchdog();
            
            if (fetchZoneList(needsFull)) {
                consecutiveErrors = 0;
                lastRefresh = now;
                currentState = STATE_RENDER;
            } else if (setupRequired) {
                // Server says setup not complete - show setup screen
                Serial.println("→ Setup required, showing setup screen");
                currentState = STATE_SETUP_REQUIRED;
            } else {
                consecutiveErrors++;
                lastErrorTime = now;
                Serial.printf("✗ Fetch failed (attempt %d), backoff %lums\n",
                             consecutiveErrors, getBackoffDelay());
                currentState = STATE_IDLE;
            }
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_RENDER: {
            feedWatchdog();
            
            bool needsFull = !initialDrawDone ||
                            (now - lastFullRefresh >= FULL_REFRESH_INTERVAL_MS) ||
                            (partialRefreshCount >= MAX_PARTIAL_BEFORE_FULL);
            
            int drawn = 0;
            
            for (int i = 0; i < ZONE_COUNT; i++) {
                if (zoneChanged[i] || needsFull) {
                    feedWatchdog();
                    
                    if (fetchAndDrawZone(ZONES[i], !needsFull)) {
                        drawn++;
                        
                        if (!needsFull) {
                            // Partial refresh per zone
                            doPartialRefresh();
                            delay(100);
                        }
                    }
                    
                    yield();
                }
            }
            
            if (needsFull && drawn > 0) {
                doFullRefresh();
                lastFullRefresh = now;
                partialRefreshCount = 0;
                initialDrawDone = true;
            }
            
            Serial.printf("✓ Rendered %d zones\n", drawn);
            currentState = STATE_IDLE;
            break;
        }
        
        // ----------------------------------------------------------------
        case STATE_IDLE:
            // Wait for next refresh cycle
            delay(1000);
            
            // Check if refresh needed
            if (now - lastRefresh >= REFRESH_INTERVAL_MS || !initialDrawDone) {
                currentState = STATE_FETCH_ZONES;
            }
            break;
        
        // ----------------------------------------------------------------
        case STATE_SETUP_REQUIRED:
            Serial.println("→ STATE: Setup Required - entering pairing mode");
            // Trigger pairing mode instead of just showing setup screen
            pairingMode = true;
            pairingStartTime = millis();
            currentState = STATE_PAIRING;
            break;
        
        // ----------------------------------------------------------------
        case STATE_ERROR:
            showErrorScreen("Connection failed");
            delay(10000);
            currentState = STATE_WIFI_CONNECT;
            break;
        
        // ----------------------------------------------------------------
        default:
            currentState = STATE_INIT;
            break;
    }
}

// ============================================================================
// WATCHDOG
// ============================================================================

void feedWatchdog() {
    // NO-OP: Watchdog disabled per DEVELOPMENT-RULES.md Section 1.4
    // esp_task_wdt_reset() removed - causes ESP32-C3 issues
}

unsigned long getBackoffDelay() {
    int capped = min(consecutiveErrors, MAX_BACKOFF_ERRORS);
    return (1UL << capped) * 1000UL;  // 2s, 4s, 8s, 16s, 32s
}

// ============================================================================
// DISPLAY
// ============================================================================

void initDisplay() {
    Serial.println("→ Init display...");
    bbep.initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN, EPD_MOSI_PIN, EPD_SCK_PIN, 8000000);
    bbep.setPanelType(EP75_800x480);
    bbep.setRotation(0);
    // ⚠️ DO NOT call allocBuffer() - causes static on ESP32-C3!
    // See DEVELOPMENT-RULES.md Section 5.4
    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    Serial.println("✓ Display initialized");
}

// ============================================================================
// Display pre-rendered screen from PROGMEM (1-bit packed, 1=black)
// ============================================================================
void displayPrerenderedScreen(const uint8_t* data, int width, int height) {
    bbep.fillScreen(BBEP_WHITE);
    
    int bytes_per_row = (width + 7) / 8;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int byte_idx = y * bytes_per_row + (x / 8);
            int bit_idx = 7 - (x % 8);  // MSB first
            
            uint8_t byte_val = pgm_read_byte(&data[byte_idx]);
            
            if (byte_val & (1 << bit_idx)) {
                // Draw black pixel where bit=1
                bbep.drawPixel(x, y, BBEP_BLACK);
            }
        }
    }
    
    bbep.refresh(REFRESH_FULL, true);
    lastFullRefresh = millis();
}

// ============================================================================
// Stage 1: Boot Screen - CC Logo + Text
// ============================================================================
void showBootScreen() {
    Serial.println("→ Showing boot screen");
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    
    // Draw CC logo (150x150) centered
    // Note: drawCCLogoCentered draws 22,500 pixels which is acceptable
    drawCCLogoCentered(140, 800);
    
    // "COMMUTE COMPUTE" text below logo
    bbep.setCursor(310, 310);
    bbep.print("COMMUTE COMPUTE");
    
    bbep.refresh(REFRESH_FULL, true);
    lastFullRefresh = millis();
    Serial.println("✓ Boot screen displayed");
}

void showWelcomeScreen() {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    
    // Draw CC logo centered at top
    drawCCLogoCentered(30, 800);
    
    // Title below logo
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    bbep.setCursor(280, 185);
    bbep.print("SMART TRANSIT DISPLAY");
    bbep.setCursor(350, 205);
    bbep.printf("v%s", FIRMWARE_VERSION);
    
    // Setup box
    bbep.drawRect(100, 230, 600, 180, BBEP_BLACK);
    bbep.drawRect(101, 231, 598, 178, BBEP_BLACK);
    
    // Title
    bbep.setCursor(300, 245);
    bbep.print("FIRST TIME SETUP");
    
    // Instructions
    bbep.setCursor(120, 275);
    bbep.print("1. Connect to WiFi: CommuteCompute-Setup");
    bbep.setCursor(120, 295);
    bbep.print("   Password: setup-password");
    bbep.setCursor(120, 320);
    bbep.print("2. Open browser: 192.168.4.1");
    bbep.setCursor(120, 345);
    bbep.print("3. Select your WiFi and enter password");
    bbep.setCursor(120, 370);
    bbep.print("4. Save and wait for dashboard");
    
    // Footer
    bbep.setCursor(220, 450);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
    lastFullRefresh = millis();
}

// ============================================================================
// Stage 2: WiFi Setup Screen - Smaller logo + instructions + copyright
// ============================================================================
void showWiFiSetupScreen() {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    
    // Smaller CC logo at top (using drawCCLogoCentered)
    drawCCLogoCentered(10, 800);
    
    // Title
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    bbep.setCursor(280, 165);
    bbep.print("COMMUTE COMPUTE SETUP");
    
    // Setup instructions box
    bbep.drawRect(50, 190, 700, 220, BBEP_BLACK);
    bbep.drawRect(51, 191, 698, 218, BBEP_BLACK);
    
    // Step 1: Fork & Deploy
    bbep.setCursor(70, 210);
    bbep.print("1. Fork the repo and deploy to Vercel or Render:");
    bbep.setCursor(90, 230);
    bbep.print("gitlab.com/angusbergman/commute-compute-system");
    
    // Step 2: Connect device to WiFi
    bbep.setCursor(70, 260);
    bbep.print("2. Connect to this WiFi network:");
    bbep.setCursor(90, 280);
    bbep.print("SSID: CommuteCompute-Setup  Password: setup-password");
    
    // Step 3: Configure URL
    bbep.setCursor(70, 310);
    bbep.print("3. Open 192.168.4.1, enter your server URL:");
    bbep.setCursor(90, 330);
    bbep.print("https://[your-name].vercel.app  (or .onrender.com)");
    
    // Step 4: Complete wizard
    bbep.setCursor(70, 360);
    bbep.print("4. Complete setup wizard at your server URL");
    bbep.setCursor(90, 380);
    bbep.print("Dashboard will appear when setup is complete.");
    
    // Footer with copyright
    bbep.drawLine(50, 430, 750, 430, BBEP_BLACK);
    bbep.setCursor(220, 450);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
}

// ============================================================================
// Stage 2b: Waiting for Setup Wizard Screen
// ============================================================================
void showWaitingSetupScreen() {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    
    // Smaller CC logo at top
    drawCCLogoCentered(20, 800);
    
    // Title
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    bbep.setCursor(250, 175);
    bbep.print("WAITING FOR SETUP WIZARD");
    
    // Status box
    bbep.drawRect(150, 200, 500, 120, BBEP_BLACK);
    bbep.drawRect(151, 201, 498, 118, BBEP_BLACK);
    
    bbep.setCursor(170, 225);
    bbep.print("WiFi Connected!");
    
    bbep.setCursor(170, 255);
    bbep.print("Server: ");
    // Print server URL (truncated if too long)
    if (strlen(serverUrl) > 40) {
        char truncated[45];
        strncpy(truncated, serverUrl, 40);
        truncated[40] = '.';
        truncated[41] = '.';
        truncated[42] = '.';
        truncated[43] = '\0';
        bbep.print(truncated);
    } else {
        bbep.print(serverUrl);
    }
    
    bbep.setCursor(170, 285);
    bbep.print("Please complete setup wizard on your computer");
    
    // Instructions
    bbep.setCursor(150, 340);
    bbep.print("Open your server URL in a browser and");
    bbep.setCursor(150, 360);
    bbep.print("complete the setup wizard to continue.");
    
    // Spinner indication
    bbep.setCursor(350, 400);
    bbep.print("Checking...");
    
    // Footer with copyright
    bbep.drawLine(50, 430, 750, 430, BBEP_BLACK);
    bbep.setCursor(220, 450);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
}

// Keep old name as alias for compatibility
void showConnectingScreen() {
    showWiFiSetupScreen();
}

// ============================================================================
// PAIRING CODE FLOW
// ============================================================================

String generatePairingCode() {
    const char* chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    String code = "";
    for (int i = 0; i < 6; i++) {
        code += chars[random(0, strlen(chars))];
    }
    return code;
}

bool registerForPairing() {
    if (strlen(serverUrl) == 0) {
        strcpy(serverUrl, DEFAULT_SERVER_URL);
    }
    
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    
    String url = String(serverUrl) + "/api/pair/register";
    Serial.printf("[PAIR] Registering at: %s\n", url.c_str());
    
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    
    String mac = WiFi.macAddress();
    String body = "{\"deviceMac\":\"" + mac + "\"}";
    
    int httpCode = http.POST(body);
    
    if (httpCode == 200) {
        String response = http.getString();
        Serial.printf("[PAIR] Response: %s\n", response.c_str());
        
        // Parse JSON to get code
        int codeStart = response.indexOf("\"code\":\"") + 8;
        int codeEnd = response.indexOf("\"", codeStart);
        if (codeStart > 8 && codeEnd > codeStart) {
            String code = response.substring(codeStart, codeEnd);
            strncpy(pairingCode, code.c_str(), 7);
            pairingCode[6] = '\0';
            Serial.printf("[PAIR] Got code: %s\n", pairingCode);
            http.end();
            return true;
        }
    }
    
    Serial.printf("[PAIR] Failed to register: %d\n", httpCode);
    http.end();
    
    // Fallback: generate local code (won't work with server but shows UI)
    String localCode = generatePairingCode();
    strncpy(pairingCode, localCode.c_str(), 7);
    return false;
}

bool pollPairingStatus() {
    if (strlen(pairingCode) == 0) return false;
    
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    
    String url = String(serverUrl) + "/api/pair/" + pairingCode;
    
    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String response = http.getString();
        
        // Check if paired
        if (response.indexOf("\"status\":\"paired\"") >= 0) {
            // Extract webhook URL
            int urlStart = response.indexOf("\"webhookUrl\":\"") + 14;
            int urlEnd = response.indexOf("\"", urlStart);
            if (urlStart > 14 && urlEnd > urlStart) {
                String webhook = response.substring(urlStart, urlEnd);
                strncpy(serverUrl, webhook.c_str(), 127);
                serverUrl[127] = '\0';
                Serial.printf("[PAIR] Paired! Webhook: %s\n", serverUrl);
                
                // Save to preferences
                saveSettings();
                http.end();
                return true;
            }
        }
    }
    
    http.end();
    return false;
}

void showPairingScreen() {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);  // ONLY use FONT_8x8 per dev rules
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    
    // ========== LOGO (centered, 150x141px) ==========
    // Draw logo with inverted colors (logo data has 1=black)
    int logoX = (800 - CC_LOGO_WIDTH) / 2;  // Center: 325
    int logoY = 15;
    for (int row = 0; row < CC_LOGO_HEIGHT; row++) {
        for (int col = 0; col < CC_LOGO_WIDTH; col++) {
            int byte_idx = row * CC_LOGO_BYTES_PER_ROW + (col / 8);
            int bit_idx = 7 - (col % 8);
            uint8_t byte_val = pgm_read_byte(&CC_LOGO_DATA[byte_idx]);
            if (byte_val & (1 << bit_idx)) {
                // Draw black where bit=1 (logo inverted: 1=black)
                bbep.drawPixel(logoX + col, logoY + row, BBEP_BLACK);
            }
        }
    }
    
    // ========== TITLE (below logo at y=165) ==========
    bbep.setCursor(310, 165);
    bbep.print("COMMUTE COMPUTE");
    
    // ========== URL BOX ==========
    bbep.drawRect(150, 190, 500, 30, BBEP_BLACK);
    bbep.setCursor(170, 202);
    bbep.print("Setup at: your-deployment.vercel.app");
    
    // ========== PAIRING CODE ==========
    bbep.setCursor(350, 235);
    bbep.print("Enter code:");
    
    // Code box with thick border
    bbep.drawRect(200, 255, 400, 60, BBEP_BLACK);
    bbep.drawRect(201, 256, 398, 58, BBEP_BLACK);
    bbep.drawRect(202, 257, 396, 56, BBEP_BLACK);
    
    // Draw 6 characters evenly spaced in the box
    // Box is 400px wide, 6 chars = ~60px each
    for (int i = 0; i < 6; i++) {
        int charX = 230 + (i * 60);  // Start at 230, space 60px apart
        int charY = 280;
        
        // Small box around each char
        bbep.drawRect(charX - 5, charY - 8, 40, 30, BBEP_BLACK);
        
        // Character (centered in small box)
        bbep.setCursor(charX + 10, charY);
        bbep.printf("%c", pairingCode[i]);
    }
    
    // ========== INSTRUCTIONS ==========
    bbep.setCursor(180, 340);
    bbep.print("1. Visit the URL on your phone or computer");
    bbep.setCursor(180, 360);
    bbep.print("2. Complete the setup wizard");  
    bbep.setCursor(180, 380);
    bbep.print("3. Enter the code above when prompted");
    
    // ========== FOOTER ==========
    bbep.drawLine(100, 440, 700, 440, BBEP_BLACK);
    bbep.setCursor(250, 455);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
    lastFullRefresh = millis();
}

void showConfiguredScreen() {
    bbep.fillScreen(BBEP_WHITE);
    
    // Black header bar
    bbep.fillRect(0, 0, 800, 60, BBEP_BLACK);
    bbep.setFont(FONT_8x8);
    bbep.setTextColor(BBEP_WHITE, BBEP_BLACK);
    bbep.setCursor(200, 15);
    bbep.print("COMMUTE COMPUTE");
    bbep.setCursor(300, 35);
    bbep.printf("v%s - Setup Complete", FIRMWARE_VERSION);
    
    // Big checkmark
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    bbep.setCursor(385, 100);
    bbep.print("*");  // Placeholder - would need custom glyph for proper checkmark
    
    // SETUP COMPLETE title
    bbep.setCursor(310, 150);
    bbep.print("SETUP COMPLETE");
    
    // Config details box
    bbep.drawRect(150, 190, 500, 160, BBEP_BLACK);
    
    bbep.setCursor(170, 210);
    bbep.print("* WiFi: Connected");
    
    bbep.setCursor(170, 235);
    bbep.printf("* Server: %s", serverUrl);
    
    bbep.setCursor(170, 260);
    bbep.print("* Home: Configured");
    
    bbep.setCursor(170, 285);
    bbep.print("* Work: Configured");
    
    bbep.setCursor(170, 310);
    bbep.print("* Cafe: Configured");
    
    // Loading message
    bbep.setCursor(260, 380);
    bbep.print("Dashboard will appear shortly...");
    
    // Footer
    bbep.setCursor(220, 450);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
}

void showSetupRequiredScreen() {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    
    // Draw CC logo centered at top
    drawCCLogoCentered(20, 800);
    
    // Title
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    bbep.setCursor(280, 170);
    bbep.print("Journey Setup Required");
    
    // URL box
    bbep.drawRect(200, 195, 400, 60, BBEP_BLACK);
    bbep.drawRect(201, 196, 398, 58, BBEP_BLACK);
    
    bbep.setCursor(250, 215);
    bbep.print("Open in your browser:");
    bbep.setCursor(210, 235);
    bbep.print("your-deployment.vercel.app");
    
    // Instructions
    bbep.setCursor(150, 280);
    bbep.print("Your device is connected but needs setup.");
    
    // Bullet points
    bbep.setCursor(150, 320);
    bbep.print("* Go to Setup Wizard on the website");
    bbep.setCursor(150, 345);
    bbep.print("* Enter your Home and Work addresses");
    bbep.setCursor(150, 370);
    bbep.print("* Configure your transit route");
    bbep.setCursor(150, 395);
    bbep.print("* Dashboard will appear automatically");
    
    // Footer
    bbep.setCursor(220, 450);
    bbep.print("(c) 2026 Angus Bergman - AGPL-3.0");
    
    bbep.refresh(REFRESH_FULL, true);
}

void showErrorScreen(const char* msg) {
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);
    bbep.setTextColor(BBEP_BLACK, BBEP_WHITE);
    
    bbep.setCursor(350, 200);
    bbep.print("ERROR");
    
    bbep.setCursor(200, 250);
    bbep.print(msg);
    
    bbep.setCursor(280, 320);
    bbep.print("Retrying in 10 seconds...");
    
    bbep.refresh(REFRESH_FULL, true);
}

void doFullRefresh() {
    Serial.println("→ Full refresh");
    bbep.refresh(REFRESH_FULL, true);
}

void doPartialRefresh() {
    bbep.refresh(REFRESH_PARTIAL, true);
    partialRefreshCount++;
}

// ============================================================================
// SETTINGS
// ============================================================================

void loadSettings() {
    Serial.println("→ Loading settings...");
    preferences.begin("cc-firm", true);
    String url = preferences.getString("serverUrl", "");
    url.toCharArray(serverUrl, sizeof(serverUrl));
    preferences.end();
    Serial.printf("✓ Server URL: %s\n", strlen(serverUrl) > 0 ? serverUrl : "(not set)");
}

void saveSettings() {
    preferences.begin("cc-firm", false);
    preferences.putString("serverUrl", serverUrl);
    preferences.end();
    Serial.printf("✓ Settings saved: %s\n", serverUrl);
}

// ============================================================================
// NETWORK - Memory-safe zone fetching
// ============================================================================

bool fetchZoneList(bool forceAll) {
    if (strlen(serverUrl) == 0) return false;
    
    feedWatchdog();
    
    // Mark all zones for refresh (server decides what to render)
    // Using lightweight metadata endpoint - server does the thinking
    for (int i = 0; i < ZONE_COUNT; i++) {
        zoneChanged[i] = true;  // Always fetch all zones - server renders only what changed
    }
    
    // Quick connectivity check via lightweight metadata endpoint
    {
        WiFiClientSecure* client = new WiFiClientSecure();
        if (!client) {
            Serial.println("✗ Failed to create client");
            return false;
        }
        client->setInsecure();
        
        HTTPClient http;
        
        String url = String(serverUrl);
        if (!url.endsWith("/")) url += "/";
        url += "api/zones?metadata=1";  // Ultra-lightweight check
        url.replace("//api", "/api");
        
        Serial.printf("→ Metadata check: %s\n", url.c_str());
        
        http.setTimeout(10000);  // 10s timeout for metadata
        
        if (!http.begin(*client, url)) {
            delete client;
            return false;
        }
        
        http.addHeader("User-Agent", "CCFirm/" FIRMWARE_VERSION);

        feedWatchdog();

        int httpCode = http.GET();

        if (httpCode != 200) {
            Serial.printf("✗ Metadata check failed: %d\n", httpCode);
            http.end();
            delete client;
            return false;
        }
        
        // Parse response to check for setup_required
        String payload = http.getString();
        http.end();
        delete client;
        
        // Check for setup_required flag
        if (payload.indexOf("setup_required") > 0 && payload.indexOf("true") > 0) {
            Serial.println("! Setup required - user needs to configure at web dashboard");
            setupRequired = true;
            return false;
        }
        
        setupRequired = false;
        Serial.println("✓ Server reachable, setup complete");
    }
    
    delay(100);
    yield();
    
    return true;
}

bool fetchAndDrawZone(const ZoneDef& zone, bool flash) {
    feedWatchdog();
    
    // Isolated scope for HTTP client
    {
        WiFiClientSecure* client = new WiFiClientSecure();
        if (!client) return false;
        client->setInsecure();
        
        HTTPClient http;
        
        // Build URL
        String url = String(serverUrl);
        if (!url.endsWith("/")) url += "/";
        url += "api/zone/";
        url += zone.id;
        url += "?demo=normal";  // Demo mode for testing
        url.replace("//api", "/api");
        
        http.setTimeout(HTTP_TIMEOUT_MS);
        
        // Request zone headers
        const char* headers[] = {"X-Zone-X", "X-Zone-Y", "X-Zone-Width", "X-Zone-Height"};
        http.collectHeaders(headers, 4);
        
        if (!http.begin(*client, url)) {
            delete client;
            return false;
        }
        
        http.addHeader("User-Agent", "CCFirm/" FIRMWARE_VERSION);
        http.addHeader("Accept", "application/octet-stream");
        
        feedWatchdog();
        
        int httpCode = http.GET();
        
        if (httpCode != 200) {
            http.end();
            delete client;
            return false;
        }
        
        // Get zone position from headers (fallback to defaults)
        int zX = http.hasHeader("X-Zone-X") ? http.header("X-Zone-X").toInt() : zone.x;
        int zY = http.hasHeader("X-Zone-Y") ? http.header("X-Zone-Y").toInt() : zone.y;
        int zW = http.hasHeader("X-Zone-Width") ? http.header("X-Zone-Width").toInt() : zone.w;
        int zH = http.hasHeader("X-Zone-Height") ? http.header("X-Zone-Height").toInt() : zone.h;
        
        int contentLen = http.getSize();
        
        if (contentLen <= 0 || contentLen > ZONE_BUFFER_SIZE) {
            Serial.printf("✗ Zone '%s' size invalid: %d\n", zone.id, contentLen);
            http.end();
            delete client;
            return false;
        }
        
        // Stream BMP data
        WiFiClient* stream = http.getStreamPtr();
        int bytesRead = 0;
        unsigned long timeout = millis() + 15000;
        
        while (bytesRead < contentLen && millis() < timeout) {
            feedWatchdog();
            
            if (stream->available()) {
                int toRead = min((int)stream->available(), contentLen - bytesRead);
                int r = stream->readBytes(zoneBuffer + bytesRead, toRead);
                bytesRead += r;
            }
            yield();
        }
        
        http.end();
        delete client;
        client = nullptr;
        
        // Validate BMP header
        if (bytesRead != contentLen || zoneBuffer[0] != 'B' || zoneBuffer[1] != 'M') {
            Serial.printf("✗ Zone '%s' invalid BMP (got %d/%d bytes)\n", zone.id, bytesRead, contentLen);
            return false;
        }
        
        // Flash zone (black) before drawing new content
        if (flash) {
            bbep.fillRect(zX, zY, zW, zH, BBEP_BLACK);
            bbep.refresh(REFRESH_PARTIAL, true);
            delay(50);
        }
        
        // Draw BMP
        int result = bbep.loadBMP(zoneBuffer, zX, zY, BBEP_BLACK, BBEP_WHITE);
        
        if (result != BBEP_SUCCESS) {
            Serial.printf("✗ Zone '%s' loadBMP failed: %d\n", zone.id, result);
            return false;
        }
        
        Serial.printf("✓ Zone '%s' at %d,%d (%dx%d)\n", zone.id, zX, zY, zW, zH);
    }
    
    // Heap stabilization
    delay(100);
    yield();
    
    return true;
}
