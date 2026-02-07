#!/bin/bash
# Auto-Recovery System for CCFirm
# Monitors device, detects crashes/freezes, and auto-reflashes

FIRMWARE_DIR="${HOME}/commute-compute/firmware"
SERIAL_PORT="/dev/cu.usbmodem14101"
LOG_FILE="/tmp/ptv-recovery.log"
CRASH_LOG="/tmp/ptv-crashes.log"
TIMEOUT_SECONDS=60  # If no serial output for 60s, consider frozen

echo "========================================" | tee -a "$LOG_FILE"
echo "CCFirm Auto-Recovery System" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

cd "$FIRMWARE_DIR"

# Counter for crashes
CRASH_COUNT=0
LAST_OUTPUT_TIME=$(date +%s)

# Function to flash device
flash_device() {
    echo "" | tee -a "$LOG_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
    echo "⚡ REFLASHING DEVICE (Crash #$CRASH_COUNT)" | tee -a "$LOG_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
    echo "$(date): Crash #$CRASH_COUNT detected" >> "$CRASH_LOG"

    # Kill any existing serial monitors
    pkill -f "screen.*usbmodem" 2>/dev/null
    sleep 2

    # Build and flash
    echo "🔨 Building firmware..." | tee -a "$LOG_FILE"
    pio run -e trmnl >> "$LOG_FILE" 2>&1

    if [ $? -eq 0 ]; then
        echo "✅ Build successful" | tee -a "$LOG_FILE"
        echo "📲 Flashing..." | tee -a "$LOG_FILE"
        pio run -t upload -e trmnl >> "$LOG_FILE" 2>&1

        if [ $? -eq 0 ]; then
            echo "✅ Flash complete - Device rebooting" | tee -a "$LOG_FILE"
            echo "⏳ Waiting 10 seconds for device to boot..." | tee -a "$LOG_FILE"
            sleep 10
            LAST_OUTPUT_TIME=$(date +%s)
        else
            echo "❌ Flash failed!" | tee -a "$LOG_FILE"
        fi
    else
        echo "❌ Build failed!" | tee -a "$LOG_FILE"
    fi

    echo "" | tee -a "$LOG_FILE"
}

# Function to check if device is frozen
check_frozen() {
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - LAST_OUTPUT_TIME))

    if [ $ELAPSED -gt $TIMEOUT_SECONDS ]; then
        echo "⚠️  No output for ${ELAPSED}s - Device appears frozen!" | tee -a "$LOG_FILE"
        CRASH_COUNT=$((CRASH_COUNT + 1))
        flash_device
    fi
}

# Function to detect crash patterns in serial output
detect_crash() {
    local line="$1"

    # Panic patterns
    if echo "$line" | grep -iE "panic|abort|exception|guru meditation|stack smashing|wdt reset|brownout|core dump" >/dev/null; then
        echo "🔴 CRASH DETECTED: $line" | tee -a "$LOG_FILE"
        CRASH_COUNT=$((CRASH_COUNT + 1))
        flash_device
        return 0
    fi

    # Freeze indicators
    if echo "$line" | grep -iE "freeze|stuck|hang|watchdog timeout" >/dev/null; then
        echo "🟡 FREEZE DETECTED: $line" | tee -a "$LOG_FILE"
        CRASH_COUNT=$((CRASH_COUNT + 1))
        flash_device
        return 0
    fi

    # Boot loop detection
    if echo "$line" | grep -iE "rst:0x|ets.*boot" >/dev/null; then
        # If we see boot messages too frequently, it's a boot loop
        echo "🟠 Boot detected: $line" | tee -a "$LOG_FILE"
    fi

    return 1
}

# Initial flash
echo "🚀 Initial flash to ensure clean state..." | tee -a "$LOG_FILE"
CRASH_COUNT=0
flash_device

echo "" | tee -a "$LOG_FILE"
echo "👀 Monitoring device for crashes/freezes..." | tee -a "$LOG_FILE"
echo "   Timeout: ${TIMEOUT_SECONDS}s of no output" | tee -a "$LOG_FILE"
echo "   Press Ctrl+C to stop" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Monitor serial output
# Using stdbuf to disable buffering
stdbuf -oL python3 -c "
import serial
import sys
import time

ser = serial.Serial('$SERIAL_PORT', 115200, timeout=1)
print('Connected to serial port', file=sys.stderr)

while True:
    try:
        if ser.in_waiting > 0:
            line = ser.readline()
            try:
                decoded = line.decode('utf-8', errors='ignore').strip()
                if decoded:
                    print(decoded, flush=True)
            except:
                pass
        else:
            time.sleep(0.1)
    except KeyboardInterrupt:
        break
    except Exception as e:
        print(f'Serial error: {e}', file=sys.stderr)
        time.sleep(1)

ser.close()
" 2>&1 | while IFS= read -r line; do
    echo "$(date +%H:%M:%S) | $line" | tee -a "$LOG_FILE"

    # Update last output time
    LAST_OUTPUT_TIME=$(date +%s)

    # Check for crash patterns
    detect_crash "$line"

    # Check for freezes every 10 lines
    if [ $((RANDOM % 10)) -eq 0 ]; then
        check_frozen
    fi
done

echo "" | tee -a "$LOG_FILE"
echo "Auto-recovery stopped" | tee -a "$LOG_FILE"
echo "Total crashes detected: $CRASH_COUNT" | tee -a "$LOG_FILE"
