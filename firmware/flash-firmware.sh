#!/bin/bash

# TRMNL BYOS Firmware Flash Script

echo "========================================="
echo "TRMNL BYOS Firmware Flash"
echo "========================================="
echo ""
echo "Put your TRMNL in bootloader mode:"
echo "1. Turn OFF the device (toggle switch DOWN)"
echo "2. Hold the BUTTON (next to USB-C port)"
echo "3. Turn ON the device (toggle switch UP) while holding BUTTON"
echo "4. Hold for 3-5 seconds, then release"
echo ""
echo "Waiting for device..."

# Wait for device to appear
DEVICE_FOUND=0
for i in {1..30}; do
    if ls /dev/cu.usbmodem* >/dev/null 2>&1; then
        DEVICE_PORT=$(ls /dev/cu.usbmodem* | head -1)
        echo "✓ Device found: $DEVICE_PORT"
        DEVICE_FOUND=1
        break
    fi
    sleep 1
done

if [ $DEVICE_FOUND -eq 0 ]; then
    echo "✗ Device not found. Please check bootloader mode and try again."
    exit 1
fi

# Flash firmware
echo ""
echo "Flashing BYOS firmware..."
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
cd ~/commute-compute/firmware
pio run --target upload --environment trmnl --upload-port $DEVICE_PORT

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Firmware flashed successfully!"
    echo "✓ Device will restart automatically"
    echo ""
    echo "What happens next:"
    echo "1. Device will create WiFi network: Commute Compute System-Setup"
    echo "2. Connect to it and configure your WiFi"
    echo "3. Device will register with: https://your-deployment.vercel.app"
    echo "4. Display will show PTV transit data!"
else
    echo ""
    echo "✗ Flash failed. Try again."
fi
