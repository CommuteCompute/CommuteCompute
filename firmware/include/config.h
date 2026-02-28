#ifndef CONFIG_H
#define CONFIG_H

/**
 * CCFirm™ Firmware Configuration
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// =============================================================================
// VERSION
// =============================================================================

#define FIRMWARE_VERSION "8.1.0"

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

// Default server URL (zero-config fallback)
// Device will connect here if no custom URL configured
// TURNKEY: Replace with your Vercel deployment URL before building
// Example: "https://your-project.vercel.app"
#define SERVER_URL "https://your-project.vercel.app"

// API Endpoints
#define API_ZONES_ENDPOINT "/api/zones"
#define API_ZONEDATA_ENDPOINT "/api/zonedata"
#define API_STATUS_ENDPOINT "/api/status"

// =============================================================================
// WIFI CONFIGURATION
// =============================================================================
// NOTE: WiFiManager/Captive Portal DISABLED (causes ESP32-C3 crash 0xbaad5678)
// WiFi credentials now provisioned via BLE (Hybrid Phase 1)
// See DEVELOPMENT-RULES.md Section 21.7

// Legacy AP settings (NOT USED in v7.1+)
#define WIFI_AP_NAME "CommuteCompute-Setup"
#define WIFI_AP_PASSWORD ""  // Open network if AP mode ever used

// =============================================================================
// TIMING (milliseconds) - TIERED REFRESH SYSTEM
// =============================================================================

// Legacy: Partial refresh every 20 seconds (for non-tiered firmware)
#define DEFAULT_REFRESH_INTERVAL 20000

// Tiered refresh intervals (for tiered firmware)
#define TIER1_REFRESH_INTERVAL 60000     // 1 minute - time-critical (clock, durations)
#define TIER2_REFRESH_INTERVAL 120000    // 2 minutes - content (weather, legs) - only if changed
#define TIER3_REFRESH_INTERVAL 300000    // 5 minutes - static (location bar)

// Full refresh every 10 minutes (prevents ghosting)
#define DEFAULT_FULL_REFRESH 600000

// Timeouts
#define WIFI_TIMEOUT 30000
#define HTTP_TIMEOUT 30000
#define CONFIG_FETCH_TIMEOUT 10000

// =============================================================================
// DISPLAY CONFIGURATION
// =============================================================================

// TRMNL OG: 7.5" Waveshare (800x480)
#ifndef SCREEN_W
#define SCREEN_W 800
#endif

#ifndef SCREEN_H
#define SCREEN_H 480
#endif

// =============================================================================
// E-INK SPI PINS (TRMNL OG - ESP32-C3)
// =============================================================================

#define EPD_SCK_PIN  7
#define EPD_MOSI_PIN 8
#define EPD_CS_PIN   6
#define EPD_RST_PIN  10
#define EPD_DC_PIN   5
#define EPD_BUSY_PIN 4

// =============================================================================
// BUTTON AND BATTERY PINS
// =============================================================================

#define PIN_INTERRUPT 2
#define PIN_BATTERY 3

// =============================================================================
// BATTERY MONITORING (v8.0.0)
// =============================================================================

#define BATTERY_ADC_SAMPLES 8          // Averaged ADC reads for stable voltage
#define BATTERY_VOLTAGE_DIVIDER 2      // 2x voltage divider on battery pin
#define BATTERY_FULL_MV 4200           // Fully charged LiPo
#define BATTERY_USB_THRESH_MV 4250     // Above this = USB powered (not battery)
#define BATTERY_EMPTY_MV 3000          // Fully discharged
#define BATTERY_LOW_WARN_MV 3700       // ~15% — show warning on e-ink
#define BATTERY_SHUTDOWN_MV 3500       // ~5% — auto shutdown to protect cell
#define BATTERY_ABSENT_MV 1000         // Below this = no battery connected

// =============================================================================
// DEEP SLEEP (v8.0.0)
// =============================================================================

#define SLEEP_INTERVAL_BATTERY_SEC 60          // 60s deep sleep (matches USB refresh)
#define SLEEP_US_TO_S_FACTOR 1000000ULL        // Microsecond-to-second conversion
#define VCOM_MAINTENANCE_INTERVAL 5            // VCOM cycle every N deep sleep wakes

// =============================================================================
// BATTERY OPTIMISATION (v8.1.0)
// =============================================================================

#define WIFI_FAST_RECONNECT_ATTEMPTS 3         // Fast reconnect tries before full scan fallback
#define NTP_RESYNC_INTERVAL 30                 // Force NTP resync every N deep sleep cycles
#define RTC_SETTINGS_MAGIC 0xCC55AA01          // Magic number for NVS cache validation
#define RTC_WEBHOOK_BUF_SIZE 256               // RTC buffer size for cached webhook URL

// =============================================================================
// ZONE LAYOUT (V10 Dashboard)
// =============================================================================

// Header zone (time, weather)
#define HEADER_Y 0
#define HEADER_H 94

// Summary bar
#define SUMMARY_Y 96
#define SUMMARY_H 28

// Journey legs area
#define LEGS_Y 132
#define LEGS_H 308

// Footer
#define FOOTER_Y 448
#define FOOTER_H 32

// =============================================================================
// WATCHDOG
// =============================================================================

#define WDT_TIMEOUT_SEC 45

// =============================================================================
// MEMORY
// =============================================================================

// Maximum size for a single zone BMP
#define ZONE_BUFFER_SIZE 20000

// Maximum partial refreshes before forcing full refresh
#define MAX_PARTIAL_BEFORE_FULL 10  // Reduced from 30 to prevent VCOM buildup and e-ink fading

#endif // CONFIG_H
