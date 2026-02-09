<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Firmware Flashing Guide

Complete guide for flashing custom firmware to TRMNL ESP32-C3 devices.

## Table of Contents
- [Supported Hardware Platforms](#supported-hardware-platforms)
- [Hardware Information](#hardware-information)
- [Prerequisites](#prerequisites)
- [Flashing Process](#flashing-process)
- [USB CDC Configuration](#usb-cdc-configuration)
- [Diagnostic Findings](#diagnostic-findings)
- [Troubleshooting](#troubleshooting)

---

## Supported Hardware Platforms

### Fully Supported (Custom Firmware)

| Device | MCU | Display | Firmware Status |
|--------|-----|---------|-----------------|
| **TRMNL OG** | ESP32-C3 | 7.5" 800×480 | Full support |
| **TRMNL Mini** | ESP32-C3 | 4.2" 400×300 | Full support |

### Server-Rendered Only (No Custom Firmware)

These devices fetch pre-rendered images from the server via HTTP. No custom firmware flashing required.

| Device | Method | Notes |
|--------|--------|-------|
| **Kindle devices** | Jailbreak + kiosk browser | Fetches PNG from `/api/kindle/image` |
| **Inkplate 6** | Stock Inkplate firmware | Can fetch PNG from `/api/livedash?device=inkplate-6` |
| **Inkplate 10** | Stock Inkplate firmware | Can fetch PNG from `/api/livedash?device=inkplate-10` |

### Inkplate Support Notes

Inkplate devices (6" and 10") use ESP32 microcontrollers and can either:

1. **Use stock Inkplate firmware** with HTTP image fetch
   - Configure Inkplate to periodically fetch PNG from your server
   - Use Arduino Inkplate examples for HTTP client
   - Endpoint: `/api/livedash?device=inkplate-6` or `inkplate-10`

2. **Develop custom Commute Compute firmware** (experimental/community)
   - Inkplate has different pinouts than TRMNL hardware
   - Requires adapting `firmware/` code to Inkplate platform
   - Community contributions welcome

**For Inkplate setup with stock firmware**, see the [Inkplate documentation](https://inkplate.readthedocs.io/).

---

## Hardware Information

### Device Specifications
- **Chip:** ESP32-C3 (QFN32) revision v0.4
- **Flash:** 4MB (XMC manufacturer)
- **Features:** WiFi, BLE, Embedded Flash
- **Crystal:** 40MHz
- **USB Mode:** USB-Serial/JTAG (built-in)
- **RAM:** 320KB
- **Flash Speed:** 1100+ kbit/s effective

### USB Device Information
```
Product: USB JTAG/serial debug unit
Vendor: Espressif (VID: 0x303a)
Product ID: 0x1001
Interface: USB-Serial/JTAG combined interface
Power Required: 500mA
```

### Pin Configuration (OG TRMNL Hardware)
```
E-ink Display (SPI):
  SCK:  GPIO 7
  MOSI: GPIO 8
  CS:   GPIO 6
  RST:  GPIO 10
  DC:   GPIO 5
  BUSY: GPIO 4

Other:
  Button:  GPIO 2 (INPUT_PULLUP)
  Battery: GPIO 3 (ADC)
```

---

## Prerequisites

### Software Requirements
```bash
# Install PlatformIO
pip install platformio

# Install esptool (for diagnostics)
pip install esptool

# Verify installation
pio --version
esptool.py version
```

### System Requirements
- macOS, Linux, or Windows
- USB-C cable (data-capable)
- Terminal/command line access

---

## Flashing Process

### Step 1: Connect Device

1. **Connect via USB-C**
   - Device should enumerate as `/dev/cu.usbmodem14101` (macOS)
   - Or `/dev/ttyACM0` (Linux)
   - Or `COMx` (Windows)

2. **Verify Connection**
   ```bash
   # macOS
   ls -la /dev/cu.usbmodem*

   # Check device info
   pio device list
   ```

### Step 2: Prepare for Flashing

**IMPORTANT:** ESP32-C3 with USB-JTAG does NOT require manual bootloader mode!
- The USB-JTAG interface allows automatic flashing
- No need to hold BOOT button
- esptool handles reset automatically

### Step 3: Build and Upload

```bash
cd /path/to/commute-compute/firmware

# Clean build (recommended for first flash)
pio run --target clean

# Build and upload
pio run --target upload

# Or specify port explicitly
pio run --target upload --upload-port /dev/cu.usbmodem14101
```

### Step 4: Verify Upload

Expected output:
```
Configuring flash size...
Flash will be erased from 0x00000000 to 0x00003fff...
Flash will be erased from 0x00008000 to 0x00008fff...
Flash will be erased from 0x0000e000 to 0x0000ffff...
Flash will be erased from 0x00010000 to 0x0004ffff...

Writing at 0x00010000... (11 %)
...
Writing at 0x0004a248... (100 %)
Wrote 258768 bytes (143857 compressed) in 1.8 seconds
Hash of data verified.

Leaving...
Hard resetting via RTS pin...
```

---

## USB CDC Configuration

### Critical Configuration for ESP32-C3

The ESP32-C3 uses a built-in USB-JTAG interface. For Serial output to work, USB CDC **MUST** be enabled in `platformio.ini`:

#### Correct Configuration
```ini
build_flags =
    -D BOARD_TRMNL
    -D CORE_DEBUG_LEVEL=5
    -D ARDUINO_USB_MODE=1              # ENABLE USB
    -D ARDUINO_USB_CDC_ON_BOOT=1       # ENABLE CDC ON BOOT
    -D CONFIG_ARDUINO_USB_CDC_ON_BOOT=1
```

#### [NO] Incorrect Configuration (Will Cause Issues)
```ini
build_flags =
    -D ARDUINO_USB_MODE=0              # DISABLES USB
    -D ARDUINO_USB_CDC_ON_BOOT=0       # NO SERIAL OUTPUT
```

### What is USB CDC?

USB CDC (Communications Device Class) enables the ESP32-C3 to act as a serial port over USB:
- Required for `Serial.println()` output
- Required for `pio device monitor`
- Works with built-in USB-JTAG interface
- No external USB-UART chip needed

### Serial Object Behavior

```cpp
void setup() {
    Serial.begin(115200);          // Initialize USB CDC serial
    Serial.setTxTimeoutMs(0);      // Disable timeout

    // Wait for USB CDC to be ready (optional for debugging)
    while(!Serial) {
        delay(10);
    }

    Serial.println("Hello from ESP32-C3!");
}
```

---

## Diagnostic Findings

### 2026-01-26 Boot Loop Investigation

#### Symptoms
- Device appeared to be in black/white flash loop
- No serial output visible
- Device would flash but not communicate

#### Root Cause
**USB CDC was disabled in platformio.ini**

Initial configuration had:
```ini
-D ARDUINO_USB_MODE=0
-D ARDUINO_USB_CDC_ON_BOOT=0
```

This prevented Serial output from working on ESP32-C3's USB-JTAG interface.

#### Resolution
Changed to:
```ini
-D ARDUINO_USB_MODE=1
-D ARDUINO_USB_CDC_ON_BOOT=1
```

#### Device Status After Fix
- Flash: Successful (258KB firmware)
- USB Enumeration: Correct (USB JTAG/serial debug unit)
- Power Draw: 500mA (normal)
- esptool Communication: Working perfectly
- Serial Output: Configuration corrected

### USB Device Verification

```bash
# Check USB enumeration (macOS)
system_profiler SPUSBDataType | grep -A 15 "ESP32"

# Output should show:
USB JTAG/serial debug unit:
  Product ID: 0x1001
  Vendor ID: 0x303a
  Serial Number: XX:XX:XX:XX:XX:XX
  Manufacturer: Espressif
  Current Required (mA): 500
```

### Flash Memory Analysis

```bash
# Read partition table
esptool.py --port /dev/cu.usbmodem14101 read_flash 0x8000 0xC00 partition.bin

# Partition layout found:
# 0x9000  - NVS (8KB)  - WiFi credentials, preferences
# 0xE000  - OTA data
# 0x10000 - App (firmware)
```

### NVS (Non-Volatile Storage) Status
- Size: 8KB at 0x9000
- Usage: <1% (35 bytes used)
- Contains: Minimal data (likely just namespace header)
- Key stored: "trmnl" namespace detected

---

## Troubleshooting

### Issue: No Serial Output

**Symptoms:**
- esptool works fine
- Upload successful
- No output from `pio device monitor`

**Solutions:**

1. **Check USB CDC Configuration**
   ```bash
   # Verify platformio.ini has:
   grep "ARDUINO_USB" platformio.ini

   # Should show:
   -D ARDUINO_USB_MODE=1
   -D ARDUINO_USB_CDC_ON_BOOT=1
   ```

2. **Verify USB Device**
   ```bash
   # macOS
   ls -la /dev/cu.usbmodem* /dev/tty.usbmodem*

   # Should show both cu and tty devices
   ```

3. **Try Different Serial Device**
   ```bash
   # Try tty instead of cu (macOS)
   pio device monitor --port /dev/tty.usbmodem14101
   ```

4. **Check Code for Serial Usage**
   ```cpp
   // Make sure Serial is initialized
   Serial.begin(115200);
   delay(2000);  // Give USB CDC time to enumerate

   while(!Serial) {
       delay(10);  // Wait for serial ready
   }
   ```

### Issue: Device Not Detected

**Solutions:**

1. **Check USB Cable**
   - Must be data-capable (not charge-only)
   - Try different cable

2. **Check USB Port**
   - Try different USB port on computer
   - Avoid USB hubs if possible

3. **Verify Device Power**
   - Check if device LED is on
   - Measure voltage if possible

4. **Reset Device**
   ```bash
   # Trigger hard reset via esptool
   esptool.py --port /dev/cu.usbmodem14101 --no-stub run
   ```

### Issue: Upload Fails

**Error: "Failed to connect to ESP32"**

```bash
# Solution 1: Specify port explicitly
pio run --target upload --upload-port /dev/cu.usbmodem14101

# Solution 2: Lower baud rate
pio run --target upload --upload-port /dev/cu.usbmodem14101 --upload-speed 115200

# Solution 3: Clean and rebuild
pio run --target clean
pio run --target upload
```

**Error: "Hash of data not verified"**

```bash
# Flash corruption - erase first
esptool.py --port /dev/cu.usbmodem14101 erase_flash

# Then upload again
pio run --target upload
```

### Issue: Boot Loop After Flash

**Symptoms:**
- Device resets repeatedly
- Serial shows crash/reset messages

**Diagnostic Steps:**

1. **Check Reset Reason**
   ```cpp
   #include <esp_system.h>

   void setup() {
       Serial.begin(115200);
       esp_reset_reason_t reason = esp_reset_reason();
       Serial.print("Reset reason: ");
       Serial.println(reason);
   }
   ```

   Reset reasons:
   - `ESP_RST_POWERON` (1) - Power on (normal)
   - `ESP_RST_SW` (3) - Software reset
   - `ESP_RST_PANIC` (4) - Exception/crash
   - `ESP_RST_INT_WDT` (5) - Interrupt watchdog
   - `ESP_RST_TASK_WDT` (6) - Task watchdog
   - `ESP_RST_WDT` (7) - Other watchdog
   - `ESP_RST_BROWNOUT` (10) - Power brownout

2. **Check Free Heap**
   ```cpp
   Serial.print("Free heap: ");
   Serial.println(ESP.getFreeHeap());
   ```

3. **Watchdog Timeout**
   - Add `delay()` in long operations
   - Use `yield()` in loops
   - Consider task watchdog configuration

### Issue: WiFi Won't Connect

**Clear Stored Credentials:**

1. **Via Serial Monitor:**
   ```cpp
   // In code, call:
   preferences.begin("trmnl", false);
   preferences.clear();
   preferences.end();
   ```

2. **Via Button (if implemented):**
   - Hold button for 5+ seconds
   - Device will clear NVS and reboot

3. **Via Flash Erase:**
   ```bash
   # Nuclear option - erases everything
   esptool.py --port /dev/cu.usbmodem14101 erase_flash
   pio run --target upload
   ```

---

## Advanced Operations

### Reading Flash Contents

```bash
# Read entire flash (4MB)
esptool.py --port /dev/cu.usbmodem14101 read_flash 0x0 0x400000 backup.bin

# Read specific regions
esptool.py --port /dev/cu.usbmodem14101 read_flash 0x9000 0x2000 nvs.bin
esptool.py --port /dev/cu.usbmodem14101 read_flash 0x10000 0x100000 app.bin
```

### Complete Flash Erase

```bash
# Erases everything including NVS, WiFi credentials, etc.
esptool.py --port /dev/cu.usbmodem14101 erase_flash

# Takes ~14 seconds
# Device will be completely blank after this
```

### Chip Information

```bash
# Get detailed chip info
esptool.py --port /dev/cu.usbmodem14101 chip_id
esptool.py --port /dev/cu.usbmodem14101 flash_id
esptool.py --port /dev/cu.usbmodem14101 read_mac
```

### Monitor Options

```bash
# Basic monitoring
pio device monitor

# With filter
pio device monitor --filter esp32_exception_decoder

# Different baud rate
pio device monitor --baud 921600

# Raw mode (no processing)
pio device monitor --raw
```

---

## Build Flags Reference

### Common Build Flags

```ini
# Debug levels (0-5, higher = more verbose)
-D CORE_DEBUG_LEVEL=5          # Maximum debug output
-D CORE_DEBUG_LEVEL=3          # Medium debug
-D CORE_DEBUG_LEVEL=0          # No debug

# USB Configuration (ESP32-C3)
-D ARDUINO_USB_MODE=1          # Enable USB
-D ARDUINO_USB_CDC_ON_BOOT=1   # CDC available immediately
-D CONFIG_ARDUINO_USB_CDC_ON_BOOT=1  # Alternative flag

# Custom defines
-D BOARD_TRMNL                 # Board identification
-D DEBUG_MODE=1                # Enable debug features
```

### platformio.ini Full Example

```ini
[env:trmnl]
platform = espressif32@6.12.0
board = esp32-c3-devkitc-02
framework = arduino
monitor_speed = 115200
upload_speed = 460800

lib_deps =
    bitbank2/bb_epaper@^2.0.1
    bitbank2/PNGdec@^1.1.6
    bblanchon/ArduinoJson@^7.0.0
    tzapu/WiFiManager@^2.0.17
    arduino-libraries/NTPClient@^3.2.1
    ricmoo/QRCode@^0.0.1

build_flags =
    -D BOARD_TRMNL
    -D CORE_DEBUG_LEVEL=5
    -D ARDUINO_USB_MODE=1
    -D ARDUINO_USB_CDC_ON_BOOT=1
    -D CONFIG_ARDUINO_USB_CDC_ON_BOOT=1

board_build.partitions = min_spiffs.csv
```

---

## Partition Scheme

### min_spiffs.csv Layout

```csv
# Name,   Type, SubType, Offset,  Size
nvs,      data, nvs,     0x9000,  0x5000
otadata,  data, ota,     0xe000,  0x2000
app0,     app,  ota_0,   0x10000, 0x1E0000
app1,     app,  ota_1,   0x1F0000,0x1E0000
spiffs,   data, spiffs,  0x3D0000,0x30000
```

**Sizes:**
- NVS: 20KB (WiFi credentials, preferences)
- OTA data: 8KB (OTA update metadata)
- App0: 1920KB (primary firmware)
- App1: 1920KB (OTA update firmware)
- SPIFFS: 192KB (file system)

---

## Health Check Checklist

Before deploying custom firmware:

- [ ] USB CDC enabled in platformio.ini
- [ ] Serial output working in test code
- [ ] WiFi credentials stored in Preferences
- [ ] E-paper pins match hardware
- [ ] Battery monitoring configured
- [ ] Watchdog timeouts handled
- [ ] OTA update tested (if implemented)
- [ ] Sleep mode working correctly
- [ ] Memory usage acceptable (<50% heap)
- [ ] No memory leaks detected

---

## References

- [ESP32-C3 Datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf)
- [Arduino-ESP32 Documentation](https://docs.espressif.com/projects/arduino-esp32/)
- [PlatformIO ESP32 Platform](https://docs.platformio.org/en/latest/platforms/espressif32.html)
- [esptool Documentation](https://docs.espressif.com/projects/esptool/)

---

## Change Log

### 2026-01-26
- **Fixed:** USB CDC configuration in platformio.ini
- **Added:** Comprehensive diagnostic findings
- **Verified:** Flash upload working at 1100+ kbit/s
- **Documented:** ESP32-C3 USB-JTAG behavior
- **Updated:** Serial configuration requirements

---

**Document Version:** 1.0
**Last Updated:** 2026-01-26
**Tested On:** ESP32-C3 (revision v0.4), macOS, PlatformIO 6.12.0

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
