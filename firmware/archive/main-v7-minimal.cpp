/**
 * Commute Compute System™ Firmware
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */


/**
 * CCFirm™ v7.1.0 — Minimal Diagnostic Build
 * Part of the Commute Compute System™
 * 
 * MINIMAL TEST: NO display operations, just WiFi + serial.
 * Purpose: Verify ESP32-C3 stability without bb_epaper.
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
#include <WiFiManager.h>
#include "soc/rtc_cntl_reg.h"

#define FIRMWARE_VERSION "7.1.0-minimal"
#define DEFAULT_SERVER_URL "https://your-deployment.vercel.app"

Preferences preferences;
WiFiManager wifiManager;

char serverUrl[128] = "";
int loopCount = 0;

void setup() {
    // Disable brownout detector
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
    
    Serial.begin(115200);
    delay(300);
    Serial.println();
    Serial.println("========================================");
    Serial.printf("CCFirmTRMNL v%s\n", FIRMWARE_VERSION);
    Serial.println("MINIMAL TEST - NO DISPLAY OPERATIONS");
    Serial.println("========================================");
    
    // Load settings
    Serial.println("→ Loading settings...");
    if (!preferences.begin("ccfirm", false)) {
        Serial.println("→ Creating preferences namespace...");
    }
    String url = preferences.getString("serverUrl", "");
    if (url.length() > 0) {
        strncpy(serverUrl, url.c_str(), sizeof(serverUrl) - 1);
    } else {
        strncpy(serverUrl, DEFAULT_SERVER_URL, sizeof(serverUrl) - 1);
    }
    preferences.end();
    Serial.printf("✓ Server URL: %s\n", serverUrl);
    
    Serial.println("✓ Setup complete - entering loop()");
    Serial.println();
}

void loop() {
    loopCount++;
    Serial.printf("\n=== Loop %d ===\n", loopCount);
    
    // Connect WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("→ Connecting WiFi...");
        wifiManager.setConfigPortalTimeout(60);
        if (wifiManager.autoConnect("CommuteCompute-Setup", "transport123")) {
            Serial.println("✓ WiFi connected");
            Serial.printf("  IP: %s\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.println("✗ WiFi failed");
            delay(5000);
            return;
        }
    }
    
    // Test HTTP
    Serial.println("→ Testing HTTP...");
    WiFiClientSecure* client = new WiFiClientSecure();
    client->setInsecure();
    
    HTTPClient http;
    String url = String(serverUrl) + "/api/status";
    
    if (http.begin(*client, url)) {
        int code = http.GET();
        Serial.printf("  HTTP %d\n", code);
        if (code == 200) {
            Serial.printf("  Response: %s\n", http.getString().substring(0, 100).c_str());
        }
        http.end();
    }
    delete client;
    
    Serial.printf("✓ Loop %d complete - waiting 10s\n", loopCount);
    delay(10000);
}
