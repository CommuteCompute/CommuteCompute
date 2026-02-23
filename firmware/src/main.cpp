/**
 * CCFirm™ v8.0.0 — Battery Deep Sleep + BLE Provisioning Firmware
 * Part of the Commute Compute System™
 *
 * v8.0.0 ADDITIONS:
 *   Battery monitoring via GPIO 3 ADC (8-sample avg, 2x divider)
 *   Deep sleep on battery: 60s intervals matching USB refresh cycle
 *   Auto-shutdown at 5% to protect LiPo cell
 *   Low battery warning at 15% on e-ink display
 *   Battery telemetry sent to server (voltage, percent, power source)
 *   Button wake from deep sleep (GPIO 2 LOW)
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
#include <BLESecurity.h>
#include <nvs_flash.h>
#include <bb_epaper.h>
#include "base64.hpp"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_sleep.h"
#include "driver/rtc_io.h"
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

// ==========================================================================
// TLS CERTIFICATE PINNING
// Let's Encrypt ISRG Root X1 — expires 2035-06-04
// Used by Vercel deployments
// ==========================================================================
const char* ISRG_ROOT_X1 = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n" \
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n" \
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n" \
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n" \
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n" \
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n" \
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n" \
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n" \
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n" \
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n" \
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n" \
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n" \
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n" \
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n" \
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n" \
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n" \
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n" \
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n" \
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n" \
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n" \
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n" \
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n" \
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n" \
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n" \
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n" \
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n" \
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n" \
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n" \
"-----END CERTIFICATE-----\n";

// ============================================================================
// LOGGING SYSTEM (v7.4.3)
// ============================================================================
// Log levels: 0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG
// Set LOG_LEVEL to control verbosity. Production recommended: 2 (WARN)
#define LOG_LEVEL 2  // 0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG

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
// DEEP SLEEP / BATTERY (v8.0.0)
// ============================================================================
// RTC memory persists across deep sleep cycles
RTC_DATA_ATTR int rtcBootCount = 0;
RTC_DATA_ATTR int rtcVcomCycles = 0;
RTC_DATA_ATTR bool rtcWasDeepSleep = false;

bool wokeFromDeepSleep = false;
bool lowBatteryWarningShown = false;
int batteryVoltageMv = 0;
int batteryPercent = 0;
bool onBatteryPower = false;

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void initDisplay();
void showBootScreen();
void showSetupScreen();
void showConnectingScreen();
void showPairedScreen();
void showErrorScreen(const char* msg);
void displayBLEPasskey(const char* passkey);
void loadSettings();
void saveSettings();
void initBLE();
void stopBLE();
String scanWiFiNetworks();
bool connectWiFi(int maxAttempts = 30);
void generatePairingCode();
bool pollPairingServer();
bool fetchZoneUpdates(bool forceAll);
int fetchAndRenderZone(const char* baseUrl, const ZoneDef& def, bool forceAll);
void doFullRefresh();
void doVcomDischarge();
void doFactoryReset();
void doVcomMaintenance();
// Battery + deep sleep (v8.0.0)
int readBatteryVoltage();
int calculateBatteryPercent(int voltageMv);
bool isOnBatteryPower(int voltageMv);
bool isDeepSleepWake();
void enterDeepSleep(int sleepSeconds);
void showLowBatteryWarning(int percent);
void doAutoShutdown();

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
// BLE SECURITY CALLBACKS (MITM-protected bonding)
// ============================================================================

class CCBLESecurityCallbacks : public BLESecurityCallbacks {
    uint32_t onPassKeyRequest() { return 0; }
    void onPassKeyNotify(uint32_t pass_key) {
        // Display passkey on e-ink screen for user verification
        char passStr[7];
        snprintf(passStr, sizeof(passStr), "%06d", pass_key);
        Serial.printf("[BLE] Passkey: %s\n", passStr);
        displayBLEPasskey(passStr);
    }
    bool onConfirmPIN(uint32_t pin) { return true; }
    bool onSecurityRequest() { return true; }
    void onAuthenticationComplete(esp_ble_auth_cmpl_t auth_cmpl) {
        if (auth_cmpl.success) {
            Serial.println("[BLE] Authentication complete");
        } else {
            Serial.println("[BLE] Authentication failed");
        }
    }
};

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
                Serial.println("[BLE] Webhook URL received");
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

    // ===== DEEP SLEEP WAKE CHECK (v8.0.0) =====
    wokeFromDeepSleep = isDeepSleepWake();

    // Reduced serial stabilisation delay on deep sleep wake (100ms vs 500ms)
    delay(wokeFromDeepSleep ? 100 : 500);
    if (wokeFromDeepSleep) {
        Serial.printf("\n=== Commute Compute v" FIRMWARE_VERSION " (deep sleep wake #%d) ===\n", rtcBootCount);
    } else {
        Serial.println("\n=== Commute Compute v" FIRMWARE_VERSION " (cold boot) ===");
    }

    // ===== BATTERY READ (fast ADC, <10ms, safe in setup) =====
    pinMode(PIN_BATTERY, INPUT);
    batteryVoltageMv = readBatteryVoltage();
    batteryPercent = calculateBatteryPercent(batteryVoltageMv);
    onBatteryPower = isOnBatteryPower(batteryVoltageMv);
    Serial.printf("[BATTERY] %dmV (%d%%) — %s\n", batteryVoltageMv, batteryPercent,
                  onBatteryPower ? "BATTERY" : "USB");

    // ===== FACTORY RESET CHECK (skip if woke from deep sleep — prevents button-wake triggering reset) =====
    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    delay(50);  // Debounce
    if (!wokeFromDeepSleep && digitalRead(PIN_INTERRUPT) == LOW) {
        Serial.println("[BOOT] Button held at startup!");
        Serial.println("[BOOT] Keep holding for 5 seconds to factory reset...");

        int countdown = 5;
        while (digitalRead(PIN_INTERRUPT) == LOW && countdown > 0) {
            Serial.printf("[BOOT] Factory reset in %d...\n", countdown);
            delay(1000);
            countdown--;
        }

        if (digitalRead(PIN_INTERRUPT) == LOW) {
            Serial.println("[BOOT] FACTORY RESET TRIGGERED!");
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

    Serial.println("BLE Provisioning + Battery Deep Sleep Firmware");

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

    // Deep sleep wake: skip boot screen, go straight to WiFi connect
    if (wokeFromDeepSleep && devicePaired && strlen(webhookUrl) > 0) {
        Serial.println("[BOOT] Deep sleep wake — skipping boot screen, going to WiFi connect");
        currentState = STATE_WIFI_CONNECT;
    } else {
        currentState = STATE_BOOT;
    }
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

// ============================================================================
// BATTERY MONITORING (v8.0.0)
// ============================================================================

/**
 * Read battery voltage from GPIO 3 ADC.
 * 8-sample average with 2x voltage divider compensation.
 * Returns voltage in millivolts.
 */
int readBatteryVoltage() {
    analogSetAttenuation(ADC_11db);
    long sum = 0;
    for (int i = 0; i < BATTERY_ADC_SAMPLES; i++) {
        sum += analogReadMilliVolts(PIN_BATTERY);
        delayMicroseconds(100);
    }
    int rawMv = (int)(sum / BATTERY_ADC_SAMPLES);
    // Compensate for voltage divider on battery pin
    return rawMv * BATTERY_VOLTAGE_DIVIDER;
}

/**
 * Linear battery percentage: (voltage - 3.0V) / 1.2V * 100
 * Clamped to 0-100 range.
 */
int calculateBatteryPercent(int voltageMv) {
    if (voltageMv <= BATTERY_EMPTY_MV) return 0;
    if (voltageMv >= BATTERY_FULL_MV) return 100;
    return (int)(((float)(voltageMv - BATTERY_EMPTY_MV) / (float)(BATTERY_FULL_MV - BATTERY_EMPTY_MV)) * 100.0f);
}

/**
 * Detect power source: battery vs USB.
 * Returns true if running on battery (voltage between 3.0V and 4.2V).
 * Returns false if USB powered (>4.25V) or no battery (<1.0V).
 */
bool isOnBatteryPower(int voltageMv) {
    if (voltageMv > BATTERY_USB_THRESH_MV) return false;   // USB powered
    if (voltageMv < BATTERY_ABSENT_MV) return false;        // No battery
    return true;                                             // Battery powered
}

// ============================================================================
// DEEP SLEEP (v8.0.0)
// ============================================================================

/**
 * Check if this boot was a deep sleep wakeup.
 */
bool isDeepSleepWake() {
    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    return (cause == ESP_SLEEP_WAKEUP_TIMER || cause == ESP_SLEEP_WAKEUP_GPIO);
}

/**
 * Enter deep sleep for specified duration.
 * Properly disconnects WiFi, discharges VCOM, frees memory.
 * Button press on GPIO 2 (LOW) will also wake the device.
 */
void enterDeepSleep(int sleepSeconds) {
    Serial.printf("[SLEEP] Entering deep sleep for %d seconds (boot #%d)\n", sleepSeconds, rtcBootCount);

    // Disconnect WiFi to save power
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(10);

    // VCOM discharge — display already refreshed, just power off panel
    if (bbep) {
        bbep->sleep(0);
    }

    // Free buffer to reduce RTC memory usage
    if (zoneBmpBuffer) {
        free(zoneBmpBuffer);
        zoneBmpBuffer = nullptr;
    }

    // Mark that next boot is deep sleep wake
    rtcWasDeepSleep = true;
    rtcBootCount++;

    // Configure timer wakeup
    if (sleepSeconds > 0) {
        esp_sleep_enable_timer_wakeup((uint64_t)sleepSeconds * SLEEP_US_TO_S_FACTOR);
    }

    // Configure GPIO 2 (button) as wake source — LOW to wake
    esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_INTERRUPT, ESP_GPIO_WAKEUP_GPIO_LOW);

    Serial.println("[SLEEP] Goodnight.");
    Serial.flush();

    esp_deep_sleep_start();
    // Device resets here — execution never reaches past this line
}

/**
 * Display low battery warning on e-ink screen.
 */
void showLowBatteryWarning(int percent) {
    Serial.printf("[BATTERY] Low battery warning: %d%%\n", percent);
    bbep->fillScreen(BBEP_WHITE);
    drawTextCentered(bbep, "LOW BATTERY", SCREEN_W, 200);
    char pctLine[32];
    snprintf(pctLine, sizeof(pctLine), "%d%% remaining", percent);
    drawTextCentered(bbep, pctLine, SCREEN_W, 240);
    drawTextCentered(bbep, "Please charge via USB", SCREEN_W, 280);
    bbep->refresh(REFRESH_FULL, true);
    delay(500);
}

/**
 * Auto-shutdown at critical battery level.
 * VCOM discharge + indefinite deep sleep (GPIO-only wake, no timer).
 */
void doAutoShutdown() {
    Serial.println("[BATTERY] CRITICAL — auto shutdown to protect battery");
    bbep->fillScreen(BBEP_WHITE);
    drawTextCentered(bbep, "BATTERY CRITICAL", SCREEN_W, 200);
    drawTextCentered(bbep, "Shutting down to protect battery", SCREEN_W, 240);
    drawTextCentered(bbep, "Connect USB to wake", SCREEN_W, 280);
    bbep->refresh(REFRESH_FULL, true);
    delay(1000);
    doVcomDischarge();

    // Indefinite deep sleep — only GPIO wake (button press), no timer
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    rtcWasDeepSleep = true;
    esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_INTERRUPT, ESP_GPIO_WAKEUP_GPIO_LOW);
    Serial.println("[BATTERY] Indefinite deep sleep — press button or connect USB to wake");
    Serial.flush();
    esp_deep_sleep_start();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

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

            // Battery mode: reduced WiFi timeout (7.5s) to conserve power
            int wifiAttempts = onBatteryPower ? 15 : 30;
            if (connectWiFi(wifiAttempts)) {
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

                // Battery mode: deep sleep immediately on WiFi failure — retry next cycle
                if (onBatteryPower) {
                    Serial.println("[BATTERY] WiFi failed — deep sleep and retry next cycle");
                    enterDeepSleep(SLEEP_INTERVAL_BATTERY_SEC);
                    // Never returns
                }

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
                    // Battery mode: deep sleep immediately on failure — retry next cycle
                    // Far more power-efficient than burning active time with retries
                    if (onBatteryPower) {
                        Serial.println("[BATTERY] Fetch failed — deep sleep and retry next cycle");
                        enterDeepSleep(SLEEP_INTERVAL_BATTERY_SEC);
                        // Never returns
                    }
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
        // v8.0.0: Battery-aware idle with deep sleep
        // USB mode: 60s poll loop with button handling (unchanged from v7.x)
        // Battery mode: deep sleep for 60s between fetches (matches refresh interval)
        // Button handling (USB only):
        //   3s hold + release → VCOM discharge (safe power-off)
        //   10s continuous hold → Factory reset + BLE config wipe
        static unsigned long buttonPressStart = 0;
        static bool buttonWasPressed = false;
        static bool resetWarningShown = false;
        case STATE_IDLE: {
            // Read battery voltage on each idle entry
            batteryVoltageMv = readBatteryVoltage();
            batteryPercent = calculateBatteryPercent(batteryVoltageMv);
            onBatteryPower = isOnBatteryPower(batteryVoltageMv);

            // Battery critical (<=5%): auto shutdown to protect cell
            if (onBatteryPower && batteryVoltageMv <= BATTERY_SHUTDOWN_MV) {
                doAutoShutdown();
                // Never returns — device enters indefinite deep sleep
            }

            // Battery low (<=15%): show warning once
            if (onBatteryPower && batteryVoltageMv <= BATTERY_LOW_WARN_MV && !lowBatteryWarningShown) {
                showLowBatteryWarning(batteryPercent);
                lowBatteryWarningShown = true;
            }

            // === BATTERY MODE: deep sleep for 60s ===
            if (onBatteryPower) {
                // VCOM maintenance every N deep sleep cycles
                rtcVcomCycles++;
                if (rtcVcomCycles >= VCOM_MAINTENANCE_INTERVAL) {
                    doVcomMaintenance();
                    rtcVcomCycles = 0;
                }
                // Enter deep sleep — device will reset and run setup() on wake
                enterDeepSleep(SLEEP_INTERVAL_BATTERY_SEC);
                // Never returns
            }

            // === USB MODE: existing 60-second poll behaviour ===
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
                        Serial.println("[Button] 10s hold — FACTORY RESET triggered");
                        doFactoryReset();
                    } else if (held >= 5000 && !resetWarningShown) {
                        Serial.println("[Button] 5s hold — keep holding for FACTORY RESET (10s total)");
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

    // BLE Security — passkey displayed on e-ink screen
    BLEDevice::setSecurityCallbacks(new CCBLESecurityCallbacks());
    BLESecurity *pSecurity = new BLESecurity();
    pSecurity->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_MITM_BOND);
    pSecurity->setCapability(ESP_IO_CAP_OUT);  // Display only (e-ink shows passkey)
    pSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

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

bool connectWiFi(int maxAttempts) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiSSID, wifiPassword);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
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
    // Ensure hardware RNG is active (requires WiFi radio)
    WiFi.mode(WIFI_STA);

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
    client.setCACert(ISRG_ROOT_X1);
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

void displayBLEPasskey(const char* passkey) {
    // Render BLE passkey on e-ink screen for pairing verification
    // Uses BMP text renderer — bb_epaper text crashes in bufferless mode (ESP32-C3)
    bbep->fillScreen(BBEP_WHITE);

    // Logo at top
    int logoX = (SCREEN_W - LOGO_SMALL_W) / 2;
    bbep->loadBMP(LOGO_SMALL, logoX, 20, BBEP_BLACK, BBEP_WHITE);

    // Title
    drawTextCentered(bbep, "=== BLE PAIRING ===", SCREEN_W, 170);

    // Instructions
    drawTextCentered(bbep, "Enter this code in your browser:", SCREEN_W, 210);

    // Passkey — display as large centred text
    // BMP text renderer uses 8x8 font; render the passkey
    char passLine[32];
    snprintf(passLine, sizeof(passLine), "[ %s ]", passkey);
    drawTextCentered(bbep, passLine, SCREEN_W, 270);

    // Subtitle
    drawTextCentered(bbep, "Code expires when setup completes", SCREEN_W, 330);

    // Footer
    char verStr[32];
    snprintf(verStr, sizeof(verStr), "CCFirm v%s", FIRMWARE_VERSION);
    drawTextCentered(bbep, verStr, SCREEN_W, 450);
    drawTextCentered(bbep, "(c) 2026 Angus Bergman - AGPL-3.0", SCREEN_W, 463);

    bbep->refresh(REFRESH_FULL, true);
    Serial.println("[BLE] Passkey displayed on e-ink");
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
    client.setCACert(ISRG_ROOT_X1);
    HTTPClient http;

    // Fetch full-screen BMP from device endpoint
    // v8.0.0: Append battery telemetry as query params
    char batParams[64] = "";
    if (batteryVoltageMv > 0) {
        snprintf(batParams, sizeof(batParams), "&bat_v=%.2f&bat_pct=%d",
                 batteryVoltageMv / 1000.0f, batteryPercent);
    }
    String url = String(webhookUrl) + "?format=bmp" + String(batParams);
    Serial.printf("[Fetch] Full screen: %s\n", url.c_str());

    // Battery mode: reduced HTTP timeout (10s) to conserve power
    int httpTimeout = onBatteryPower ? 10000 : 20000;
    http.setTimeout(httpTimeout);
    if (!http.begin(client, url)) {
        Serial.println("[Fetch] Failed to begin HTTP");
        return false;
    }

    // v8.0.0: Battery telemetry HTTP headers
    if (batteryVoltageMv > 0) {
        char volStr[8], pctStr[4];
        snprintf(volStr, sizeof(volStr), "%.2f", batteryVoltageMv / 1000.0f);
        snprintf(pctStr, sizeof(pctStr), "%d", batteryPercent);
        http.addHeader("X-Battery-Voltage", volStr);
        http.addHeader("X-Battery-Percent", pctStr);
        http.addHeader("X-Power-Source", onBatteryPower ? "battery" : "usb");
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
