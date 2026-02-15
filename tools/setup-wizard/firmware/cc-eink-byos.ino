/**
 * TRMNL BYOS Firmware for CCFirm
 * ESP32-based firmware for TRMNL OG devices
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * IMPORTANT: This firmware is for TRMNL OG ONLY (ESP32 chip)
 * DO NOT flash to TRMNL X (incompatible hardware)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration - Set these during setup
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "https://your-project.vercel.app";

// Device configuration
const int DISPLAY_WIDTH = 800;
const int DISPLAY_HEIGHT = 480;
const char* DEVICE_TYPE = "trmnl-og";

// Refresh settings (loaded from server)
unsigned long refreshInterval = 900000;  // 15 minutes default (milliseconds)
unsigned long lastRefresh = 0;
unsigned long lastFullRefresh = 0;

// Partial refresh settings
bool partialRefreshEnabled = false;
unsigned long partialRefreshInterval = 20000;  // 20 seconds
struct RefreshZone {
  String id;
  int x, y, width, height;
  unsigned long refreshInterval;
  unsigned long lastRefresh;
};
RefreshZone zones[4];  // header, transitInfo, coffeeDecision, footer
int zoneCount = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== TRMNL BYOS for CCFirm ===");
  Serial.println("Copyright (c) 2026 Angus Bergman\n");

  // Initialize display
  // TODO: Add your e-ink display initialization here
  Serial.println("Initializing display...");

  // Connect to WiFi
  connectWiFi();

  // Get device configuration from server
  getDeviceConfig();

  // Perform initial full refresh
  fullRefresh();
}

void loop() {
  unsigned long now = millis();

  if (partialRefreshEnabled) {
    // Check if any zones need refreshing
    if (now - lastRefresh >= partialRefreshInterval) {
      checkAndRefreshZones();
      lastRefresh = now;
    }

    // Force full refresh periodically
    if (now - lastFullRefresh >= refreshInterval) {
      fullRefresh();
      lastFullRefresh = now;
    }
  } else {
    // Standard full refresh mode
    if (now - lastRefresh >= refreshInterval) {
      fullRefresh();
      lastRefresh = now;
    }
  }

  delay(1000);  // Check every second
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed");
  }
}

void getDeviceConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(serverUrl) + "/api/device-config";

  Serial.println("Getting device configuration...");
  http.begin(url);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, payload);

    refreshInterval = doc["refreshInterval"] | 900000;
    Serial.print("Refresh interval: ");
    Serial.print(refreshInterval / 1000);
    Serial.println(" seconds");

    // Parse partial refresh settings
    if (doc.containsKey("partialRefresh") && !doc["partialRefresh"].isNull()) {
      partialRefreshEnabled = doc["partialRefresh"]["enabled"];
      partialRefreshInterval = doc["partialRefresh"]["interval"] | 20000;

      Serial.print("Partial refresh: ");
      Serial.println(partialRefreshEnabled ? "enabled" : "disabled");

      if (partialRefreshEnabled) {
        // Load zones
        JsonArray zonesArray = doc["partialRefresh"]["zones"];
        zoneCount = zonesArray.size();

        for (int i = 0; i < zoneCount && i < 4; i++) {
          JsonObject zone = zonesArray[i];
          zones[i].id = zone["id"].as<String>();
          zones[i].refreshInterval = zone["refreshInterval"];
          zones[i].lastRefresh = 0;

          // TODO: Parse coordinates (may be percentage-based)
          Serial.print("Zone ");
          Serial.print(i);
          Serial.print(": ");
          Serial.println(zones[i].id);
        }
      }
    }
  } else {
    Serial.print("HTTP error: ");
    Serial.println(httpCode);
  }

  http.end();
}

void fullRefresh() {
  Serial.println("Performing full refresh...");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return;
  }

  HTTPClient http;
  String url = String(serverUrl) + "/api/screen";

  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(8192);
    deserializeJson(doc, payload);

    // Get screen markup or image
    String screenText = doc["merge_variables"]["screen_text"];

    // TODO: Render to e-ink display
    Serial.println("=== Display Content ===");
    Serial.println(screenText);
    Serial.println("======================");

    // Update all zone refresh times
    for (int i = 0; i < zoneCount; i++) {
      zones[i].lastRefresh = millis();
    }

    Serial.println("Full refresh complete");
  } else {
    Serial.print("HTTP error: ");
    Serial.println(httpCode);
  }

  http.end();
}

void checkAndRefreshZones() {
  // Build query with last refresh times
  String query = "{";
  for (int i = 0; i < zoneCount; i++) {
    if (i > 0) query += ",";
    query += "\"" + zones[i].id + "\":" + String(zones[i].lastRefresh);
  }
  query += ",\"fullRefresh\":" + String(lastFullRefresh) + "}";

  HTTPClient http;
  String url = String(serverUrl) + "/api/refresh-zones?lastRefreshTimes=" + urlEncode(query);

  http.begin(url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, payload);

    bool refreshAll = doc["refreshAll"] | false;

    if (refreshAll) {
      // Server recommends full refresh
      fullRefresh();
      return;
    }

    // Partial refresh specified zones
    JsonArray zonesToRefresh = doc["zones"];
    for (JsonObject zone : zonesToRefresh) {
      String zoneId = zone["id"];
      Serial.print("Refreshing zone: ");
      Serial.println(zoneId);

      // TODO: Fetch zone content and update display region
      // partialRefreshZone(zoneId, zone["coordinates"]);

      // Update last refresh time
      for (int i = 0; i < zoneCount; i++) {
        if (zones[i].id == zoneId) {
          zones[i].lastRefresh = millis();
          break;
        }
      }
    }
  }

  http.end();
}

String urlEncode(String str) {
  String encoded = "";
  char c;
  for (int i = 0; i < str.length(); i++) {
    c = str.charAt(i);
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      encoded += '%';
      encoded += String(c, HEX);
    }
  }
  return encoded;
}

// TODO: Implement actual e-ink display functions
// - Initialize display
// - Full screen refresh
// - Partial zone refresh
// - Draw text/graphics
// - Handle orientation

/**
 * IMPLEMENTATION NOTES:
 *
 * This is a template firmware file. You need to add your specific e-ink
 * display library and functions.
 *
 * For TRMNL OG devices with specific e-ink displays:
 * 1. Add your display library (e.g., GxEPD2, Adafruit_GFX)
 * 2. Implement display initialization
 * 3. Implement full refresh rendering
 * 4. Implement partial refresh zones
 * 5. Add text rendering functions
 * 6. Test on actual hardware
 *
 * Refer to your e-ink display's datasheet for:
 * - SPI pin connections
 * - Initialization sequences
 * - Refresh commands
 * - Partial update support
 */
