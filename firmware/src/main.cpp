/**
 * CCFirm™ v7.6 — Hybrid BLE + Pairing Code Firmware
 * Part of the Commute Compute System™
 *
 * BLE PROVISIONING (see DEVELOPMENT-RULES.md Section 21.7):
 *   WiFi credentials (SSID + password) + webhook URL from Setup Wizard
 *   No hardcoded server URLs — all config via BLE from user's instance
 *
 * This avoids WiFiManager/captive portal which crashes ESP32-C3.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <nvs_flash.h>
#include <bb_epaper.h>
#include "base64.hpp"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "../include/config.h"
#include "../include/cc_logo_data.h"
#include "../include/text_renderer.h"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Screen dimensions
#ifdef BOARD_TRMNL_MINI
  #define SCREEN_W 600
  #define SCREEN_H 448
  #define LOGO_BOOT CC_LOGO_BOOT_MINI
  #define LOGO_BOOT_W 192
  #define LOGO_BOOT_H 280
  #define LOGO_SMALL CC_LOGO_SMALL_MINI
  #define LOGO_SMALL_W 128
  #define LOGO_SMALL_H 130
  #define PANEL_TYPE EP583R_600x448
#else
  #define SCREEN_W 800
  #define SCREEN_H 480
  #define LOGO_BOOT CC_LOGO_BOOT
  #define LOGO_BOOT_W 256
  #define LOGO_BOOT_H 380
  #define LOGO_SMALL CC_LOGO_SMALL
  #define LOGO_SMALL_W 128
  #define LOGO_SMALL_H 130
  #define PANEL_TYPE EP75_800x480
#endif

// Full-screen BMP: 800x480 1-bit = (800/8)*480 + 62 header = 48062 bytes
#define ZONE_BMP_MAX_SIZE 50000
// TURNKEY: Replace with your Vercel deployment URL before building
// Example: "https://your-project.vercel.app"
#define DEFAULT_SERVER "https://your-project.vercel.app"

// ============================================================================
// LOGGING SYSTEM (v7.4.3)
// ============================================================================
// Log levels: 0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG
// Set LOG_LEVEL to control verbosity. Production recommended: 2 (WARN)
#define LOG_LEVEL 3  // INFO level for normal operation

#define LOG_ERROR(fmt, ...) do { if (LOG_LEVEL >= 1) Serial.printf("[ERROR] " fmt "\n", ##__VA_ARGS__); } while(0)
#define LOG_WARN(fmt, ...)  do { if (LOG_LEVEL >= 2) Serial.printf("[WARN] " fmt "\n", ##__VA_ARGS__); } while(0)
#define LOG_INFO(fmt, ...)  do { if (LOG_LEVEL >= 3) Serial.printf("[INFO] " fmt "\n", ##__VA_ARGS__); } while(0)
#define LOG_DEBUG(fmt, ...) do { if (LOG_LEVEL >= 4) Serial.printf("[DEBUG] " fmt "\n", ##__VA_ARGS__); } while(0)

// BLE UUIDs (WiFi credentials + webhook URL from Setup Wizard)
#define BLE_SERVICE_UUID        "CC000001-0000-1000-8000-00805F9B34FB"
#define BLE_CHAR_SSID_UUID      "CC000002-0000-1000-8000-00805F9B34FB"
#define BLE_CHAR_PASSWORD_UUID  "CC000003-0000-1000-8000-00805F9B34FB"
#define BLE_CHAR_URL_UUID       "CC000004-0000-1000-8000-00805F9B34FB"
#define BLE_CHAR_STATUS_UUID    "CC000005-0000-1000-8000-00805F9B34FB"
#define BLE_CHAR_WIFI_LIST_UUID "CC000006-0000-1000-8000-00805F9B34FB"

// ============================================================================
// ZONE DEFINITIONS
// ============================================================================

struct ZoneDef {
    const char* id;
    int x, y, w, h;
};

const ZoneDef ZONE_DEFS[] = {
    {"header",  0,   0, 800,  94},
    {"divider", 0,  94, 800,   2},
    {"summary", 0,  96, 800,  28},
    {"legs",    0, 132, 800, 316},
    {"footer",  0, 448, 800,  32}
};
const int NUM_ZONES = 5;

// ============================================================================
// STATE MACHINE
// ============================================================================

enum State {
    STATE_BOOT,
    STATE_CHECK_WIFI,
    STATE_BLE_SETUP,
    STATE_WIFI_CONNECT,
    STATE_CHECK_PAIRING,
    STATE_SHOW_PAIRING,
    STATE_POLL_PAIRING,
    STATE_FETCH_DASHBOARD,
    STATE_IDLE,
    STATE_ERROR
};

// State name helper for logging (v7.4.3)
const char* stateName(State s) {
    switch(s) {
        case STATE_BOOT: return "BOOT";
        case STATE_CHECK_WIFI: return "CHECK_WIFI";
        case STATE_BLE_SETUP: return "BLE_SETUP";
        case STATE_WIFI_CONNECT: return "WIFI_CONNECT";
        case STATE_CHECK_PAIRING: return "CHECK_PAIRING";
        case STATE_SHOW_PAIRING: return "SHOW_PAIRING";
        case STATE_POLL_PAIRING: return "POLL_PAIRING";
        case STATE_FETCH_DASHBOARD: return "FETCH_DASHBOARD";
        case STATE_IDLE: return "IDLE";
        case STATE_ERROR: return "ERROR";
        default: return "UNKNOWN";
    }
}

// ============================================================================
// GLOBALS
// ============================================================================

BBEPAPER* bbep = nullptr;
Preferences preferences;

// State
State currentState = STATE_BOOT;
char wifiSSID[64] = "";
char wifiPassword[64] = "";
char webhookUrl[1024] = "";  // Large buffer for config tokens with full addresses
char pairingCode[8] = "";
bool wifiConnected = false;
bool devicePaired = false;
bool initialDrawDone = false;

// BLE
BLEServer* pServer = nullptr;
BLECharacteristic* pCharStatus = nullptr;
BLECharacteristic* pCharWiFiList = nullptr;
bool bleDeviceConnected = false;
bool bleCredentialsReceived = false;
String wifiNetworkList = "";

// Timing
unsigned long lastRefresh = 0;
unsigned long lastFullRefresh = 0;
unsigned long pairingStartTime = 0;
unsigned long lastPollTime = 0;
int partialRefreshCount = 0;
int consecutiveErrors = 0;

// Buffers
uint8_t* zoneBmpBuffer = nullptr;

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void initDisplay();
void showBootScreen();
void showSetupScreen();
void showConnectingScreen();
void showPairedScreen();
void showErrorScreen(const char* msg);
void loadSettings();
void saveSettings();
void initBLE();
void stopBLE();
String scanWiFiNetworks();
bool connectWiFi();
void generatePairingCode();
bool pollPairingServer();
bool fetchZoneUpdates(bool forceAll);
int fetchAndRenderZone(const char* baseUrl, const ZoneDef& def, bool forceAll);
void doFullRefresh();
void doVcomDischarge();
void doFactoryReset();
void doVcomMaintenance();

// ============================================================================
// JSON HELPERS
// ============================================================================

String jsonGetString(const String& json, const char* key) {
    String search = String("\"") + key + "\":\"";
    int start = json.indexOf(search);
    if (start < 0) return "";
    start += search.length();
    int end = json.indexOf("\"", start);
    if (end < 0) return "";
    return json.substring(start, end);
}

// ============================================================================
// BLE CALLBACKS
// ============================================================================

String scanWiFiNetworks() {
    Serial.println("[WiFi] Scanning...");
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    int n = WiFi.scanNetworks();
    String result = "";

    for (int i = 0; i < n && i < 10; i++) {
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0) continue;
        if (result.indexOf(ssid + ",") >= 0) continue;
        if (result.length() > 0) result += ",";
        result += ssid;
    }

    WiFi.scanDelete();
    Serial.printf("[WiFi] Found: %s\n", result.c_str());
    return result;
}

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        bleDeviceConnected = true;
        Serial.println("[BLE] Connected");

        wifiNetworkList = scanWiFiNetworks();
        if (pCharWiFiList && wifiNetworkList.length() > 0) {
            pCharWiFiList->setValue(wifiNetworkList.c_str());
        }

        if (pCharStatus) {
            pCharStatus->setValue("connected");
            pCharStatus->notify();
        }
    }

    void onDisconnect(BLEServer* pServer) {
        bleDeviceConnected = false;
        Serial.println("[BLE] Disconnected");

        if (!bleCredentialsReceived) {
            BLEDevice::startAdvertising();
        }
    }
};

class CredentialCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pChar) {
        std::string value = pChar->getValue();
        String uuid = pChar->getUUID().toString().c_str();

        if (value.length() > 0) {
            if (uuid.indexOf("0002") > 0) {
                // SSID received
                strncpy(wifiSSID, value.c_str(), sizeof(wifiSSID) - 1);
                Serial.printf("[BLE] SSID: %s\n", wifiSSID);
            }
            else if (uuid.indexOf("0003") > 0) {
                // Password received
                strncpy(wifiPassword, value.c_str(), sizeof(wifiPassword) - 1);
                Serial.println("[BLE] Password received");
            }
            else if (uuid.indexOf("0004") > 0) {
                // Webhook URL received from Setup Wizard
                strncpy(webhookUrl, value.c_str(), sizeof(webhookUrl) - 1);
                Serial.printf("[BLE] Webhook URL: %s\n", webhookUrl);
            }

            // Check if all credentials received (SSID + Password + URL)
            if (strlen(wifiSSID) > 0 && strlen(wifiPassword) > 0 && strlen(webhookUrl) > 0) {
                bleCredentialsReceived = true;
                devicePaired = true;
                saveSettings();

                if (pCharStatus) {
                    pCharStatus->setValue("configured");
                    pCharStatus->notify();
                }
                Serial.println("[BLE] Fully configured - WiFi + webhook URL saved");
            }
        }
    }
};

// ============================================================================
// SETUP
// ============================================================================

void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

        Serial.begin(115200);
    delay(500);
    
    // ===== FACTORY RESET CHECK (hold button during power-on for 5 seconds) =====
    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    delay(50);  // Debounce
    if (digitalRead(PIN_INTERRUPT) == LOW) {
        Serial.println("\n[BOOT] Button held at startup!");
        Serial.println("[BOOT] Keep holding for 5 seconds to factory reset...");
        
        int countdown = 5;
        while (digitalRead(PIN_INTERRUPT) == LOW && countdown > 0) {
            Serial.printf("[BOOT] Factory reset in %d...\n", countdown);
            delay(1000);
            countdown--;
        }
        
        if (digitalRead(PIN_INTERRUPT) == LOW) {
            Serial.println("[BOOT] FACTORY RESET TRIGGERED!");
            // Erase everything
            nvs_flash_erase();
            WiFi.disconnect(true, true);
            Preferences prefs;
            prefs.begin("cc-device", false);
            prefs.clear();
            prefs.end();
            Serial.println("[BOOT] Reset complete. Restarting...");
            delay(1000);
            ESP.restart();
        } else {
            Serial.println("[BOOT] Button released - normal boot");
        }
    }
    
    Serial.println("\n=== Commute Compute v" FIRMWARE_VERSION " ===");
    Serial.println("BLE Provisioning Firmware");

    // Initialize NVS
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    // Create display
    bbep = new BBEPAPER(PANEL_TYPE);

    // Load settings
    loadSettings();

    // Allocate buffer
    zoneBmpBuffer = (uint8_t*)malloc(ZONE_BMP_MAX_SIZE);
    if (!zoneBmpBuffer) {
        LOG_ERROR("Buffer alloc failed - heap exhausted");
    }

    // Init display
    initDisplay();

    currentState = STATE_BOOT;
}

// ============================================================================
// MAIN LOOP
// ============================================================================



// =============================================================================
// FACTORY RESET (button held at boot)
// Clears all settings: WiFi, preferences, NVS
// =============================================================================

void doFactoryReset() {
    Serial.println("\n[FACTORY RESET] Starting...");
    
    // Show reset message on display (using BMP text renderer — see text_renderer.h)
    bbep->fillScreen(BBEP_WHITE);
    drawTextCentered(bbep, "FACTORY RESET", SCREEN_W, 220);
    drawTextCentered(bbep, "Clearing all data...", SCREEN_W, 250);
    bbep->refresh(REFRESH_FULL, true);
    delay(1000);
    
    // Clear WiFi credentials
    Serial.println("[FACTORY RESET] Clearing WiFi...");
    WiFi.disconnect(true, true);
    delay(500);
    
    // Clear preferences
    Serial.println("[FACTORY RESET] Clearing preferences...");
    preferences.begin("cc-device", false);
    preferences.clear();
    preferences.end();
    delay(500);
    
    // Full NVS erase
    Serial.println("[FACTORY RESET] Erasing NVS...");
    nvs_flash_erase();
    nvs_flash_init();
    delay(500);
    
    // Show complete message
    bbep->fillScreen(BBEP_WHITE);
    drawTextCentered(bbep, "RESET COMPLETE", SCREEN_W, 220);
    drawTextCentered(bbep, "Restarting device...", SCREEN_W, 250);
    bbep->refresh(REFRESH_FULL, true);
    delay(2000);
    
    Serial.println("[FACTORY RESET] Complete. Restarting...");
    ESP.restart();
}

// =============================================================================
// VCOM DISCHARGE SEQUENCE (for proper power-down)
// Prevents e-ink fading by properly discharging the VCOM rail
// See: TPS65185 PMIC datasheet - VCOM is last on, first off
// =============================================================================

void doVcomDischarge() {
    Serial.println("[VCOM] Starting discharge sequence...");
    
    // Step 1: Clear to white (baseline state)
    Serial.println("[VCOM] Step 1: Clear to white");
    bbep->fillScreen(BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    delay(500);  // Let display settle
    
    // Step 2: Flash to black briefly (helps reset particles)
    Serial.println("[VCOM] Step 2: Flash to black");
    bbep->fillScreen(BBEP_BLACK);
    bbep->refresh(REFRESH_FULL, true);
    delay(200);
    
    // Step 3: Return to white (final state - safest for storage)
    Serial.println("[VCOM] Step 3: Return to white");
    bbep->fillScreen(BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    delay(500);  // Critical: wait for VCOM to stabilize
    
    // Step 4: Enter light sleep mode (if supported by bb_epaper)
    bbep->sleep(0);  // Proper VCOM discharge - sends UC8151_POFF command

    // Step 5: Post-discharge stabilization (TPS65185 PMIC requires settling time)
    delay(200);  // Allow VCOM rail to fully discharge

    Serial.println("[VCOM] Discharge complete - safe to power off");
}

// Static counter for VCOM maintenance
static int vcomMaintenanceCounter = 0;

void doVcomMaintenance() {
    vcomMaintenanceCounter++;
    
    // Every 5 full refreshes, do a white-black-white cycle to prevent fading
    if (vcomMaintenanceCounter >= 5) {
        Serial.println("[VCOM] Maintenance cycle...");
        
        // Quick black-white flash to reset particle positions
        bbep->fillScreen(BBEP_BLACK);
        bbep->refresh(REFRESH_FULL, true);
        delay(100);
        bbep->fillScreen(BBEP_WHITE);
        bbep->refresh(REFRESH_FULL, true);
        
        vcomMaintenanceCounter = 0;
        Serial.println("[VCOM] Maintenance complete");
    }
}

void loop() {
    unsigned long now = millis();
    static State lastState = STATE_BOOT;
    
    // Log state transitions
    if (currentState != lastState) {
        LOG_INFO("State: %s -> %s", stateName(lastState), stateName(currentState));
        lastState = currentState;
    }

    switch (currentState) {
        // ==== BOOT: Show logo ====
        case STATE_BOOT: {
            LOG_DEBUG("Showing boot screen");
            showBootScreen();
            delay(2500);
            currentState = STATE_CHECK_WIFI;
            break;
        }

        // ==== CHECK WIFI: Have credentials? ====
        case STATE_CHECK_WIFI: {
            if (strlen(wifiSSID) > 0 && strlen(wifiPassword) > 0) {
                LOG_INFO("WiFi credentials found");
                currentState = STATE_WIFI_CONNECT;
            } else {
                LOG_INFO("No WiFi credentials - starting BLE setup");
                currentState = STATE_BLE_SETUP;
            }
            break;
        }

        // ==== BLE SETUP ====
        case STATE_BLE_SETUP: {
            static bool screenShown = false;
            static bool bleInit = false;

            // STEP 1: Generate pairing code and render screen FIRST (before BLE eats memory)
            if (!screenShown) {
                generatePairingCode();
                Serial.println("[Setup] Rendering setup screen before BLE init...");
                showSetupScreen();
                screenShown = true;
                Serial.printf("[Setup] Screen done. Free heap: %d bytes\n", ESP.getFreeHeap());
            }

            // STEP 2: Start BLE AFTER display is rendered
            if (!bleInit) {
                Serial.println("[Setup] Now starting BLE...");
                initBLE();
                bleInit = true;
                Serial.printf("[Setup] BLE started. Free heap: %d bytes\n", ESP.getFreeHeap());
            }

            if (bleCredentialsReceived) {
                Serial.println("[BLE] Credentials received!");
                stopBLE();
                delay(100);  // Let BLE fully deinitialize

                // CRITICAL: Reinitialize display after BLE deinit corrupts memory
                Serial.println("[Display] Reinitializing after BLE shutdown...");
                initDisplay();
                Serial.printf("[Display] Reinitialized. Free heap: %d bytes\n", ESP.getFreeHeap());

                bleInit = false;
                screenShown = false;
                currentState = STATE_WIFI_CONNECT;
            }

            delay(100);
            break;
        }

        // ==== WIFI CONNECT ====
        case STATE_WIFI_CONNECT: {
            Serial.println("[STATE] WiFi Connect");
            // Skip connecting screen - causes crash on ESP32-C3 after BLE/reboot
            // WiFi connection is fast enough that screen update isn't needed
            Serial.printf("[WiFi] Connecting to %s...\n", wifiSSID);

            if (connectWiFi()) {
                wifiConnected = true;
                Serial.printf("[OK] Connected: %s\n", WiFi.localIP().toString().c_str());
                consecutiveErrors = 0;

                // Check if we have a valid webhook URL (provided via BLE)
                if (devicePaired && strlen(webhookUrl) > 0) {
                    Serial.println("[OK] Already paired with URL - fetching dashboard");
                    Serial.printf("[OK] Webhook: %s\n", webhookUrl);
                    currentState = STATE_FETCH_DASHBOARD;
                } else {
                    // No webhook URL configured - device needs BLE provisioning
                    LOG_WARN("No webhook URL configured - returning to BLE setup");
                    currentState = STATE_BLE_SETUP;
                }
            } else {
                LOG_ERROR("WiFi connection failed after retries");
                consecutiveErrors++;

                if (consecutiveErrors >= 3) {
                    // Clear credentials and go back to BLE
                    wifiSSID[0] = '\0';
                    wifiPassword[0] = '\0';
                    saveSettings();
                    currentState = STATE_BLE_SETUP;
                    consecutiveErrors = 0;
                } else {
                    delay(5000);
                }
            }
            break;
        }

        // ==== CHECK PAIRING ====
        case STATE_CHECK_PAIRING: {
            Serial.println("[STATE] Check Pairing");
            if (devicePaired && strlen(webhookUrl) > 0) {
                Serial.println("[OK] Already paired");
                currentState = STATE_FETCH_DASHBOARD;
            } else {
                Serial.println("[INFO] Not paired - show pairing screen");
                currentState = STATE_SHOW_PAIRING;
            }
            break;
        }

        // ==== SHOW UNIFIED SETUP SCREEN (WiFi connected, awaiting pairing) ====
        case STATE_SHOW_PAIRING: {
            if (strlen(pairingCode) == 0) {
                generatePairingCode();
            }
            showSetupScreen();  // Unified screen with both BLE and pairing code
            pairingStartTime = millis();
            lastPollTime = 0;
            currentState = STATE_POLL_PAIRING;
            break;
        }

        // ==== POLL PAIRING ====
        case STATE_POLL_PAIRING: {
            // Check timeout
            if (now - pairingStartTime > 600000) {
                Serial.println("[PAIR] Timeout - regenerating");
                currentState = STATE_SHOW_PAIRING;
                break;
            }

            // Poll every 5 seconds
            if (now - lastPollTime >= 5000) {
                lastPollTime = now;
                if (pollPairingServer()) {
                    devicePaired = true;
                    saveSettings();
                    // Skip showPairedScreen() - crashes on ESP32-C3
                    // Go straight to dashboard fetch
                    Serial.println("[OK] Paired! Loading dashboard...");
                    initialDrawDone = false;
                    currentState = STATE_FETCH_DASHBOARD;
                }
            }

            delay(500);
            break;
        }

        // ==== FETCH DASHBOARD ====
        case STATE_FETCH_DASHBOARD: {
            Serial.println("[STATE] Fetch Dashboard");

            bool needsFull = !initialDrawDone ||
                            (now - lastFullRefresh >= 300000) ||
                            (partialRefreshCount >= MAX_PARTIAL_BEFORE_FULL);

            Serial.printf("[Fetch] needsFull=%d, initialDrawDone=%d\n", needsFull, initialDrawDone);
            if (fetchZoneUpdates(needsFull)) {
                if (needsFull) {
                    Serial.println("[Display] Doing full refresh...");
                    doFullRefresh();
                    Serial.println("[Display] Full refresh complete");
                    bbep->sleep(0);  // VCOM discharge - sends UC8151_POFF command
                    delay(100);      // VCOM stabilization delay (TPS65185 settling)
                    Serial.println("[VCOM] Display in light sleep - safe for power-off");
                    lastFullRefresh = now;
                    partialRefreshCount = 0;
                } else {
                    Serial.println("[Display] Doing partial refresh...");
                    bbep->refresh(REFRESH_PARTIAL, true);
                    Serial.println("[Display] Partial refresh complete");
                    bbep->sleep(0);  // VCOM discharge - sends UC8151_POFF command
                    delay(100);      // VCOM stabilization delay (TPS65185 settling)
                    Serial.println("[VCOM] Display in light sleep - safe for power-off");
                    partialRefreshCount++;
                }
                lastRefresh = now;
                initialDrawDone = true;
                consecutiveErrors = 0;
                currentState = STATE_IDLE;
            } else {
                // Check if pairing was cleared due to invalid token
                if (!devicePaired || strlen(webhookUrl) == 0) {
                    Serial.println("[INFO] Pairing cleared - returning to setup");
                    currentState = STATE_SHOW_PAIRING;
                    consecutiveErrors = 0;
                } else {
                    consecutiveErrors++;
                    if (consecutiveErrors > 5) {
                        currentState = STATE_ERROR;
                    } else {
                        delay(5000);
                    }
                }
            }
            break;
        }

        // ==== IDLE ====
        // Button handling:
        //   3s hold + release → VCOM discharge (safe power-off)
        //   10s continuous hold → Factory reset + BLE config wipe
        static unsigned long buttonPressStart = 0;
        static bool buttonWasPressed = false;
        static bool resetWarningShown = false;
        case STATE_IDLE: {
            if (now - lastRefresh >= 60000) {
                currentState = STATE_FETCH_DASHBOARD;
            }

            if (WiFi.status() != WL_CONNECTED) {
                wifiConnected = false;
                currentState = STATE_WIFI_CONNECT;
            }

            // Check button for VCOM discharge (3s) or factory reset (10s)
            if (digitalRead(PIN_INTERRUPT) == LOW) {
                if (!buttonWasPressed) {
                    buttonPressStart = now;
                    buttonWasPressed = true;
                    resetWarningShown = false;
                    Serial.println("[Button] Press detected");
                } else {
                    unsigned long held = now - buttonPressStart;
                    if (held >= 10000) {
                        // 10-second hold: FACTORY RESET
                        Serial.println("[Button] 10s hold — FACTORY RESET triggered");
                        doFactoryReset();
                        // doFactoryReset calls ESP.restart(), won't reach here
                    } else if (held >= 5000 && !resetWarningShown) {
                        Serial.println("[Button] 5s hold — keep holding for FACTORY RESET (10s total)");
                        // Show warning on e-ink display
                        bbep->fillScreen(BBEP_WHITE);
                        drawTextCentered(bbep, "KEEP HOLDING FOR", SCREEN_W, 200);
                        drawTextCentered(bbep, "FACTORY RESET", SCREEN_W, 230);
                        drawTextCentered(bbep, "Release now for safe power-off", SCREEN_W, 270);
                        bbep->refresh(REFRESH_FULL, true);
                        resetWarningShown = true;
                    }
                }
            } else {
                if (buttonWasPressed) {
                    unsigned long held = now - buttonPressStart;
                    if (held >= 3000) {
                        // Released after 3s+ but before 10s: VCOM discharge
                        Serial.println("[Button] Released after 3s+ — VCOM discharge");
                        doVcomDischarge();
                        Serial.println("[Button] Safe to power off now");
                    } else {
                        Serial.println("[Button] Short press — ignored");
                    }
                }
                buttonWasPressed = false;
                resetWarningShown = false;
            }
            delay(1000);
            break;
        }

        // ==== ERROR ====
        case STATE_ERROR: {
            // Skip showErrorScreen - crashes on ESP32-C3
            LOG_ERROR("Connection failed, retrying in 30s...");
            delay(30000);
            consecutiveErrors = 0;
            currentState = STATE_WIFI_CONNECT;
            break;
        }
    }
}

// ============================================================================
// BLE FUNCTIONS
// ============================================================================

void initBLE() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char deviceName[32];
    snprintf(deviceName, sizeof(deviceName), "CommuteCompute-%02X%02X", mac[4], mac[5]);

    BLEDevice::init(deviceName);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService* pService = pServer->createService(BLE_SERVICE_UUID);

    // BLE provides WiFi credentials + webhook URL from Setup Wizard
    BLECharacteristic* pCharSSID = pService->createCharacteristic(BLE_CHAR_SSID_UUID, BLECharacteristic::PROPERTY_WRITE);
    pCharSSID->setCallbacks(new CredentialCallbacks());

    BLECharacteristic* pCharPass = pService->createCharacteristic(BLE_CHAR_PASSWORD_UUID, BLECharacteristic::PROPERTY_WRITE);
    pCharPass->setCallbacks(new CredentialCallbacks());

    BLECharacteristic* pCharURL = pService->createCharacteristic(BLE_CHAR_URL_UUID, BLECharacteristic::PROPERTY_WRITE);
    pCharURL->setCallbacks(new CredentialCallbacks());

    pCharStatus = pService->createCharacteristic(BLE_CHAR_STATUS_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
    pCharStatus->addDescriptor(new BLE2902());
    pCharStatus->setValue("waiting");

    pCharWiFiList = pService->createCharacteristic(BLE_CHAR_WIFI_LIST_UUID, BLECharacteristic::PROPERTY_READ);
    pCharWiFiList->setValue("");

    pService->start();

    BLEAdvertising* pAdv = BLEDevice::getAdvertising();
    pAdv->addServiceUUID(BLE_SERVICE_UUID);
    pAdv->setScanResponse(true);
    BLEDevice::startAdvertising();

    Serial.printf("[BLE] Advertising: %s\n", deviceName);
}

void stopBLE() {
    if (pServer) {
        BLEDevice::stopAdvertising();
        BLEDevice::deinit(true);
        pServer = nullptr;
    }
}

// ============================================================================
// WIFI
// ============================================================================

bool connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSSID, wifiPassword);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    Serial.println();

    return WiFi.status() == WL_CONNECTED;
}

// ============================================================================
// PAIRING
// ============================================================================

void generatePairingCode() {
    const char* chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    int len = strlen(chars);
    for (int i = 0; i < 6; i++) {
        pairingCode[i] = chars[random(0, len)];
    }
    pairingCode[6] = '\0';
    Serial.printf("[PAIR] Code: %s\n", pairingCode);
}

bool pollPairingServer() {
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;

    // Extract base server URL from webhookUrl (strip /api/screen suffix)
    String baseUrl = String(webhookUrl);
    int apiIdx = baseUrl.indexOf("/api/");
    if (apiIdx > 0) baseUrl = baseUrl.substring(0, apiIdx);
    String url = baseUrl + "/api/pair/" + String(pairingCode);
    Serial.printf("[PAIR] Polling: %s\n", url.c_str());

    http.setTimeout(10000);
    if (!http.begin(client, url)) return false;

    int code = http.GET();
    if (code != 200) {
        http.end();
        return false;
    }

    String payload = http.getString();
    http.end();

    String status = jsonGetString(payload, "status");
    if (status == "paired") {
        String webhook = jsonGetString(payload, "webhookUrl");
        if (webhook.length() > 0) {
            strncpy(webhookUrl, webhook.c_str(), sizeof(webhookUrl) - 1);
            Serial.printf("[PAIR] Success! URL: %s\n", webhookUrl);
            return true;
        }
    }

    return false;
}

// ============================================================================
// DISPLAY
// ============================================================================

void initDisplay() {
    bbep->initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN, EPD_MOSI_PIN, EPD_SCK_PIN, 0);
    bbep->setPanelType(PANEL_TYPE);
    bbep->setRotation(0);

    // DO NOT call allocBuffer() - breaks ESP32-C3! (see DEVELOPMENT-RULES.md 5.4)

    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    Serial.printf("[Display] Ready. Free heap: %d\n", ESP.getFreeHeap());
}

void showBootScreen() {
    bbep->fillScreen(BBEP_WHITE);
    int bootX = (SCREEN_W - LOGO_BOOT_W) / 2;
    int bootY = (SCREEN_H - LOGO_BOOT_H) / 2;
    bbep->loadBMP(LOGO_BOOT, bootX, bootY, BBEP_BLACK, BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    lastFullRefresh = millis();
}

void showSetupScreen() {
    Serial.println("[Setup] Rendering setup screen...");

    // All rendering uses BMP-based text (see text_renderer.h)
    // bb_epaper's built-in text functions crash on ESP32-C3 in bufferless mode
    bbep->fillScreen(BBEP_WHITE);

    // Center logo at top
    int logoX = (SCREEN_W - LOGO_SMALL_W) / 2;
    bbep->loadBMP(LOGO_SMALL, logoX, 20, BBEP_BLACK, BBEP_WHITE);

    Serial.println("[Setup] Logo loaded, adding text...");

    // Get MAC for device name
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char deviceName[32];
    snprintf(deviceName, sizeof(deviceName), "CommuteCompute-%02X%02X", mac[4], mac[5]);

    // Title
    drawTextCentered(bbep, "=== WIFI SETUP ===", SCREEN_W, 160);

    // Instructions
    drawTextCentered(bbep, "1. Open your Setup Wizard in Chrome/Edge", SCREEN_W, 195);
    drawTextCentered(bbep, "   (your-server/setup-wizard.html)", SCREEN_W, 215);

    drawTextCentered(bbep, "2. Click 'Connect via Bluetooth'", SCREEN_W, 250);
    drawTextCentered(bbep, "3. Select this device:", SCREEN_W, 285);

    // Device name - centered with brackets for emphasis (no drawRect in bufferless mode)
    char deviceNameBracketed[48];
    snprintf(deviceNameBracketed, sizeof(deviceNameBracketed), "[ %s ]", deviceName);
    drawTextCentered(bbep, deviceNameBracketed, SCREEN_W, 315);

    drawTextCentered(bbep, "4. Enter your WiFi credentials", SCREEN_W, 355);

    // Status message
    drawTextCentered(bbep, ">>> Device will auto-connect <<<", SCREEN_W, 400);

    // Footer - version and copyright
    char verStr[32];
    snprintf(verStr, sizeof(verStr), "CCFirm v%s", FIRMWARE_VERSION);
    drawTextCentered(bbep, verStr, SCREEN_W, 450);
    drawTextCentered(bbep, "(c) 2026 Angus Bergman - AGPL-3.0", SCREEN_W, 463);

    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[Setup] Setup screen complete");
}

void showConnectingScreen() {
    Serial.println("[Display] Rendering connecting screen...");

    // Sequential rendering for ESP32-C3 stability (see DEVELOPMENT-RULES.md 5.4)
    // Uses BMP text renderer — bb_epaper text crashes in bufferless mode
    bbep->fillScreen(BBEP_WHITE);
    int smallX = (SCREEN_W - LOGO_SMALL_W) / 2;
    bbep->loadBMP(LOGO_SMALL, smallX, 100, BBEP_BLACK, BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[Display] Logo loaded");
    delay(300);

    drawTextCentered(bbep, "CONNECTING TO WIFI...", SCREEN_W, 280);

    // Build "Network: <ssid>" string
    char netLine[80];
    snprintf(netLine, sizeof(netLine), "Network: %s", wifiSSID);
    drawTextCentered(bbep, netLine, SCREEN_W, 320);

    // Footer
    drawTextCentered(bbep, "v" FIRMWARE_VERSION, SCREEN_W, 455);

    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[Display] Connecting screen complete");
}

// showPairingScreen removed - unified into showSetupScreen()

void showPairedScreen() {
    Serial.println("[Display] Rendering paired screen...");

    // Sequential rendering for ESP32-C3 stability
    // Uses BMP text renderer — bb_epaper text crashes in bufferless mode
    bbep->fillScreen(BBEP_WHITE);
    int smallX = (SCREEN_W - LOGO_SMALL_W) / 2;
    bbep->loadBMP(LOGO_SMALL, smallX, 80, BBEP_BLACK, BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    delay(300);

    drawTextCentered(bbep, "PAIRED!", SCREEN_W, 260);
    drawTextCentered(bbep, "Loading your dashboard...", SCREEN_W, 300);

    // Footer
    drawTextCentered(bbep, "(c) 2026 Angus Bergman - AGPL-3.0", SCREEN_W, 455);
    drawTextCentered(bbep, "v" FIRMWARE_VERSION, SCREEN_W, 470);

    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[Display] Paired screen complete");
}

void showErrorScreen(const char* msg) {
    Serial.println("[Display] Rendering error screen...");

    // Sequential rendering for ESP32-C3 stability
    // Uses BMP text renderer — bb_epaper text crashes in bufferless mode
    bbep->fillScreen(BBEP_WHITE);
    int smallX = (SCREEN_W - LOGO_SMALL_W) / 2;
    bbep->loadBMP(LOGO_SMALL, smallX, 80, BBEP_BLACK, BBEP_WHITE);
    bbep->refresh(REFRESH_FULL, true);
    delay(300);

    drawTextCentered(bbep, "ERROR", SCREEN_W, 240);
    drawTextCentered(bbep, msg, SCREEN_W, 280);
    drawTextCentered(bbep, "Retrying in 30 seconds...", SCREEN_W, 340);

    // Footer
    drawTextCentered(bbep, "v" FIRMWARE_VERSION, SCREEN_W, 455);

    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[Display] Error screen complete");
}

// ============================================================================
// SETTINGS
// ============================================================================

void loadSettings() {
    preferences.begin("cc-device", true);

    String ssid = preferences.getString("wifi_ssid", "");
    String pass = preferences.getString("wifi_pass", "");
    String url = preferences.getString("webhookUrl", "");
    devicePaired = preferences.getBool("paired", false);

    strncpy(wifiSSID, ssid.c_str(), sizeof(wifiSSID) - 1);
    strncpy(wifiPassword, pass.c_str(), sizeof(wifiPassword) - 1);
    strncpy(webhookUrl, url.c_str(), sizeof(webhookUrl) - 1);

    preferences.end();

    Serial.printf("[Settings] SSID: %s, Paired: %s\n",
                  strlen(wifiSSID) > 0 ? wifiSSID : "(none)",
                  devicePaired ? "yes" : "no");
}

void saveSettings() {
    preferences.begin("cc-device", false);
    preferences.putString("wifi_ssid", wifiSSID);
    preferences.putString("wifi_pass", wifiPassword);
    preferences.putString("webhookUrl", webhookUrl);
    preferences.putBool("paired", devicePaired);
    preferences.end();
    Serial.println("[Settings] Saved");
}

// ============================================================================
// DASHBOARD FETCHING
// ============================================================================

// Full-screen BMP buffer (800x480 1-bit = ~48KB)
#define FULLSCREEN_BMP_SIZE 50000

bool fetchFullScreenBMP() {
    if (strlen(webhookUrl) == 0) return false;

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;

    // Fetch full-screen BMP from device endpoint
    String url = String(webhookUrl) + "?format=bmp";
    Serial.printf("[Fetch] Full screen: %s\n", url.c_str());

    http.setTimeout(20000);
    if (!http.begin(client, url)) {
        Serial.println("[Fetch] Failed to begin HTTP");
        return false;
    }

    int code = http.GET();
    if (code != 200) {
        Serial.printf("[Fetch] HTTP %d\n", code);
        http.end();

        // If 400 Bad Request, token is invalid/truncated - clear pairing
        if (code == 400) {
            Serial.println("[Fetch] Invalid token - clearing pairing");
            webhookUrl[0] = '\0';
            devicePaired = false;
            saveSettings();
        }
        return false;
    }

    int len = http.getSize();
    Serial.printf("[Fetch] Size: %d bytes\n", len);

    if (len <= 0 || len > FULLSCREEN_BMP_SIZE) {
        Serial.printf("[Fetch] Bad size: %d\n", len);
        http.end();
        return false;
    }

    // Use existing buffer (it's big enough)
    WiFiClient* stream = http.getStreamPtr();
    int read = stream->readBytes(zoneBmpBuffer, len);
    http.end();

    if (read != len) {
        Serial.printf("[Fetch] Read mismatch: %d vs %d\n", read, len);
        return false;
    }

    if (zoneBmpBuffer[0] != 'B' || zoneBmpBuffer[1] != 'M') {
        Serial.printf("[Fetch] Not BMP: 0x%02X 0x%02X\n", zoneBmpBuffer[0], zoneBmpBuffer[1]);
        return false;
    }

    Serial.println("[Fetch] Loading BMP to display...");
    int result = bbep->loadBMP(zoneBmpBuffer, 0, 0, BBEP_BLACK, BBEP_WHITE);

    if (result == BBEP_SUCCESS) {
        Serial.println("[Fetch] BMP loaded successfully");
        return true;
    } else {
        Serial.printf("[Fetch] loadBMP failed: %d\n", result);
        return false;
    }
}

bool fetchZoneUpdates(bool forceAll) {
    return fetchFullScreenBMP();
}

void doFullRefresh() {
    bbep->refresh(REFRESH_FULL, true);
}
