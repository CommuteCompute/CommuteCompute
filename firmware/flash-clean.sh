#!/bin/bash

export PATH="$HOME/Library/Python/3.9/bin:$PATH"
FIRMWARE_DIR="$HOME/commute-compute/firmware"
cd "$FIRMWARE_DIR"

echo "Waiting for device in bootloader mode..."
sleep 3

# Try usbmodem port first
if [ -e "/dev/cu.usbmodem14201" ]; then
    PORT="/dev/cu.usbmodem14201"
elif [ -e "/dev/cu.URT0" ]; then
    PORT="/dev/cu.URT0"
else
    echo "Error: Device not found"
    exit 1
fi

echo "Found device at $PORT"
echo ""
echo "Step 1: Erasing flash..."
python3 ~/.platformio/packages/tool-esptoolpy/esptool.py --chip esp32c3 --port "$PORT" erase_flash

echo ""
echo "Step 2: Flashing firmware..."
python3 ~/.platformio/packages/tool-esptoolpy/esptool.py \
    --chip esp32c3 \
    --port "$PORT" \
    --baud 460800 \
    --before default_reset \
    --after hard_reset \
    write_flash -z \
    --flash_mode dio \
    --flash_freq 80m \
    --flash_size 4MB \
    0x0 .pio/build/trmnl/bootloader.bin \
    0x8000 .pio/build/trmnl/partitions.bin \
    0x10000 .pio/build/trmnl/firmware.bin

echo ""
echo "Done! Device will reboot and create WiFi hotspot: Commute Compute System-Setup"
