#!/bin/bash

# Auto-flash script for TRMNL device
# This will monitor for the device and flash automatically

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Locate esptool: try PATH first, then PlatformIO default location
ESPTOOL="$(command -v esptool.py 2>/dev/null || echo "$HOME/.platformio/packages/tool-esptoolpy/esptool.py")"

echo "=========================================="
echo "TRMNL Auto-Flash Script"
echo "=========================================="
echo ""
echo "Waiting for TRMNL device to be connected in bootloader mode..."
echo ""
echo "To enter bootloader mode on OG TRMNL:"
echo "1. Turn OFF the device (power switch)"
echo "2. Hold the BUTTON down"
echo "3. While holding BUTTON, turn ON the power switch"
echo "4. Keep holding BUTTON for 3 seconds"
echo "5. Release the button"
echo ""
echo "Monitoring for device..."

# Function to attempt flash
flash_device() {
    local PORT=$1
    echo ""
    echo ">>> Device detected at $PORT!"
    echo ">>> Attempting to flash firmware..."
    echo ""

    # Try flashing with esptool directly
    python3 "$ESPTOOL" \
        --chip esp32c3 \
        --port "$PORT" \
        --baud 460800 \
        --before no_reset \
        --after hard_reset \
        write_flash -z \
        --flash_mode dio \
        --flash_freq 80m \
        --flash_size 4MB \
        0x0 .pio/build/trmnl/bootloader.bin \
        0x8000 .pio/build/trmnl/partitions.bin \
        0x10000 .pio/build/trmnl/firmware.bin

    if [ $? -eq 0 ]; then
        echo ""
        echo "=========================================="
        echo "FLASH SUCCESSFUL!"
        echo "=========================================="
        echo ""
        echo "Your TRMNL device has been flashed!"
        echo ""
        echo "Next steps:"
        echo "1. The device will reboot"
        echo "2. It will create a WiFi hotspot: Commute Compute System-Setup"
        echo "3. Connect to it with password: your-wifi-password"
        echo "4. Configure your WiFi network"
        echo "5. Enjoy your transit display!"
        echo ""
        return 0
    else
        echo ""
        echo "Flash failed. Retrying with different settings..."
        echo ""

        # Try again with slower baud and default reset
        python3 "$ESPTOOL" \
            --chip esp32c3 \
            --port "$PORT" \
            --baud 115200 \
            --before default_reset \
            --after hard_reset \
            write_flash -z \
            --flash_mode dio \
            --flash_freq 80m \
            --flash_size 4MB \
            0x0 .pio/build/trmnl/bootloader.bin \
            0x8000 .pio/build/trmnl/partitions.bin \
            0x10000 .pio/build/trmnl/firmware.bin

        if [ $? -eq 0 ]; then
            echo ""
            echo "=========================================="
            echo "FLASH SUCCESSFUL (2nd attempt)!"
            echo "=========================================="
            return 0
        else
            echo ""
            echo "Flash failed. Please try again."
            return 1
        fi
    fi
}

# Monitor for device connection
LAST_DEVICES=""
while true; do
    # Get current USB serial devices (excluding Bluetooth)
    CURRENT_DEVICES=$(ls /dev/cu.* 2>/dev/null | grep -v Bluetooth | grep -E "(cu\.usb|cu\.URT|cu\.wchusbserial)" || echo "")

    # Check if a new device appeared
    if [ ! -z "$CURRENT_DEVICES" ]; then
        if [ "$CURRENT_DEVICES" != "$LAST_DEVICES" ]; then
            # New device detected
            for DEVICE in $CURRENT_DEVICES; do
                if ! echo "$LAST_DEVICES" | grep -q "$DEVICE"; then
                    # This is a newly connected device
                    sleep 1  # Give it a moment to settle
                    flash_device "$DEVICE"

                    if [ $? -eq 0 ]; then
                        exit 0
                    fi
                fi
            done
            LAST_DEVICES="$CURRENT_DEVICES"
        fi
    else
        # Check if URT0 is available (might already be connected)
        if [ -e "/dev/cu.URT0" ]; then
            echo "Found existing device at /dev/cu.URT0"
            flash_device "/dev/cu.URT0"
            if [ $? -eq 0 ]; then
                exit 0
            fi
        fi
        LAST_DEVICES=""
    fi

    # Print a dot every second to show we're still monitoring
    echo -n "."
    sleep 1
done
