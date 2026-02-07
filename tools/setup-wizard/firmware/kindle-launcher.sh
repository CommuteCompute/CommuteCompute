#!/bin/sh

###############################################################################
# Commute Compute System Kindle Launcher Script
# Launches Commute Compute System display on jailbroken Kindle devices
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later
# Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
#
# Supported Devices:
# - Kindle Paperwhite 3/4 (758×1024)
# - Kindle Paperwhite 5 (1236×1648)
# - Kindle 4 (600×800)
#
# Prerequisites:
# - Jailbroken Kindle
# - KUAL (Kindle Unified Application Launcher) installed
# - Python runtime on Kindle
# - eips or fbink for display updates
###############################################################################

# Configuration
SERVER_URL="YOUR_RENDER_URL"  # e.g., https://your-project.vercel.app
DEVICE_TYPE="kindle-pw3"      # Or kindle-pw4, kindle-pw5, kindle-4
REFRESH_INTERVAL=300          # 5 minutes (300 seconds) minimum for Kindle

# Paths
LOG_FILE="/mnt/us/extensions/commute-compute/cc.log"
PID_FILE="/var/run/commute-compute.pid"
CACHE_DIR="/mnt/us/extensions/commute-compute/cache"

# Create directories
mkdir -p "$(dirname $LOG_FILE)"
mkdir -p "$CACHE_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        log "Commute Compute System is already running (PID: $PID)"
        exit 0
    else
        log "Removing stale PID file"
        rm -f "$PID_FILE"
    fi
fi

log "=== Commute Compute System Kindle Launcher Starting ==="
log "Device: $DEVICE_TYPE"
log "Server: $SERVER_URL"
log "Refresh Interval: ${REFRESH_INTERVAL}s"

# Save PID
echo $$ > "$PID_FILE"

# Detect Kindle model and resolution
detect_resolution() {
    case "$DEVICE_TYPE" in
        kindle-pw3|kindle-pw4)
            WIDTH=758
            HEIGHT=1024
            ;;
        kindle-pw5)
            WIDTH=1236
            HEIGHT=1648
            ;;
        kindle-4)
            WIDTH=600
            HEIGHT=800
            ;;
        *)
            log "Unknown device type: $DEVICE_TYPE"
            WIDTH=758
            HEIGHT=1024
            ;;
    esac

    log "Resolution: ${WIDTH}×${HEIGHT}"
}

# Function to fetch and display screen
refresh_display() {
    log "Fetching display content from server..."

    # Fetch JSON from server
    RESPONSE=$(wget -q -O - "$SERVER_URL/api/screen" 2>&1)
    if [ $? -ne 0 ]; then
        log "ERROR: Failed to fetch from server"
        return 1
    fi

    # Extract screen text (simplified - actual implementation needs JSON parsing)
    # For production, use jq or Python to parse JSON properly
    SCREEN_TEXT=$(echo "$RESPONSE" | grep -o '"screen_text":"[^"]*"' | cut -d'"' -f4)

    if [ -z "$SCREEN_TEXT" ]; then
        log "ERROR: No screen text received"
        return 1
    fi

    # Save to cache
    echo "$SCREEN_TEXT" > "$CACHE_DIR/latest.txt"

    # Display on Kindle
    display_on_kindle "$SCREEN_TEXT"

    log "Display refreshed successfully"
    return 0
}

# Function to display text on Kindle
display_on_kindle() {
    TEXT="$1"

    # Clear screen
    # Method depends on available tools (eips, fbink, or manual framebuffer)

    if command -v fbink >/dev/null 2>&1; then
        # Use fbink if available (recommended)
        fbink -c  # Clear screen
        echo "$TEXT" | fbink -
    elif command -v eips >/dev/null 2>&1; then
        # Use eips (older method)
        eips -c  # Clear screen
        eips 0 0 "$TEXT"
    else
        # Manual framebuffer method (basic)
        log "WARNING: No display tool found (fbink/eips)"
        log "Display update skipped"
    fi
}

# Function to check WiFi connection
check_wifi() {
    if ! ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
        log "WARNING: No internet connection"
        return 1
    fi
    return 0
}

# Detect resolution
detect_resolution

# Initial refresh
log "Performing initial display refresh..."
if ! check_wifi; then
    log "ERROR: No WiFi connection. Exiting."
    rm -f "$PID_FILE"
    exit 1
fi

if ! refresh_display; then
    log "ERROR: Initial refresh failed. Exiting."
    rm -f "$PID_FILE"
    exit 1
fi

# Main loop
log "Entering refresh loop (interval: ${REFRESH_INTERVAL}s)"
while true; do
    sleep "$REFRESH_INTERVAL"

    # Check WiFi before attempting refresh
    if ! check_wifi; then
        log "WiFi down, skipping refresh"
        continue
    fi

    # Refresh display
    refresh_display

    # Optional: Check battery level and adjust refresh rate
    # BATTERY_LEVEL=$(cat /sys/devices/system/yoshi_battery/yoshi_battery0/battery_capacity 2>/dev/null || echo "100")
    # if [ "$BATTERY_LEVEL" -lt 20 ]; then
    #     log "Low battery ($BATTERY_LEVEL%), slowing refresh"
    #     sleep 600  # Extra 10-minute delay on low battery
    # fi
done

# Cleanup on exit
log "Commute Compute System stopping..."
rm -f "$PID_FILE"
