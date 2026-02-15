<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Quick Start Guide

## Your Device is Ready!

Your CC E-Ink device has been flashed with custom firmware and is ready to connect to your Commute Compute(TM) admin panel.

---

## Step 1: First Power-On

1. **Disconnect USB** (if connected)
2. **Power on device** (battery or USB)
3. Device will boot and start BLE (Bluetooth) advertising

---

## Step 2: WiFi Setup (via BLE)

1. **On your computer**, open Chrome or Edge (not Safari/Firefox)
2. **Navigate to** your Commute Compute admin panel or Setup Wizard
3. **Click "Pair Device"** — your browser will scan for BLE devices
4. **Select** your device (appears as `CC-XXXXXX`)
5. **Enter your WiFi** network name and password when prompted
6. Device will **reboot** and connect to your WiFi network

---

## Step 3: Configure in Admin Panel

1. Open your admin panel at: `https://your-server-name.vercel.app`
2. Go to **Settings** or **Device Configuration**
3. Enter your **home** and **work** addresses
4. Device will automatically fetch and display:
   - Next trams to work
   - Next trains to work
   - When to leave (based on current time)
   - Coffee decision (based on available time)

---

## What You Should See

### On First Boot:
- Device starts BLE advertising as `CC-XXXXXX`
- Display shows BLE pairing instructions

### After WiFi Setup:
- Device connects to your WiFi
- Fetches data from admin panel
- Displays your personalized Commute Compute(TM) dashboard

### Normal Operation:
- **Partial refresh** every 1 minute (departure times update)
- **Full refresh** every 5 minutes (complete screen redraw)
- **Light sleep** between updates (battery saving)

---

## Monitoring Serial Output

> **WARNING:** Do NOT use `pio device monitor` — it causes system crash/freeze on ESP32-C3 hardware. Use a standalone serial terminal instead.

**On macOS:**
```bash
screen /dev/cu.usbmodem* 115200
```

**On Windows:**
Use PuTTY or similar serial terminal at 115200 baud.

You should see output like:
```
=== Commute Compute BOOT ===
Reset reason: POWER ON
Free heap: 280000 bytes
Display initialized
Connecting to WiFi...
WiFi connected!
IP: 192.168.1.123
Fetching dashboard data...
Dashboard updated successfully
```

---

## Testing the Admin Panel

### What to Test:

1. **Address Configuration**
   - Enter your home address
   - Enter your work address
   - Verify they're saved

2. **Calculations**
   - Device fetches current time
   - Server calculates:
     - Travel time to work
     - When you need to leave
     - Next 2 trams
     - Next 2 trains
     - Whether you have time for coffee

3. **Display Update**
   - Dashboard should show all calculated info
   - Updates every 1 minute (partial)
   - Full refresh every 5 minutes

---

## Troubleshooting

### Display Not Updating
```bash
# Check serial output (do NOT use pio device monitor)
screen /dev/cu.usbmodem* 115200  # macOS

# Look for errors like:
# - "WiFi connection failed"
# - "HTTP request failed"
# - "JSON parse error"
```

### WiFi Won't Connect
```bash
# Reset WiFi credentials by holding button for 5 seconds
# Or reflash firmware to reset WiFi credentials
```

### Admin Panel Not Responding
```bash
# Check server status
curl https://your-server-name.vercel.app/api/health

# Should return: {"status":"ok"}
```

### No Serial Output
- **Don't worry!** USB CDC is now enabled
- Use a standalone serial terminal at 115200 baud (do NOT use `pio device monitor`)
- Try unplugging and replugging USB

---

## Device Specifications

```
Chip:        ESP32-C3 (revision v0.4)
Flash:       4MB
RAM:         320KB
Display:     7.5" e-ink (800x480)
WiFi:        2.4GHz 802.11 b/g/n
Update Rate: 1 min (partial), 5 min (full)
Battery:     ~2-3 days (with 1-min updates)
```

---

## Important Notes

### USB CDC Configuration
Your device has been configured with:
- `ARDUINO_USB_MODE=1` - USB enabled
- `ARDUINO_USB_CDC_ON_BOOT=1` - Serial on boot

This is **required** for ESP32-C3. Do not change these settings.

### Battery Life
- **1-minute updates:** 2-3 days
- **2-minute updates:** 4-5 days
- Adjust in `config.h` if needed

### Server URL
Your device connects to:
```
https://your-server-name.vercel.app
```

To change, edit `include/config.h` and reflash.

---

## Need More Help?

- **Detailed flashing guide:** `docs/FLASHING.md`
- **Diagnostic report:** `docs/DIAGNOSTIC_FINDINGS.md`
- **Full README:** `README.md`
- **Serial debugging:** Use a standalone serial terminal at 115200 baud (not `pio device monitor`)

---

## Current Status

[DONE] Firmware flashed (CC-FW-7.6.0)
[DONE] USB CDC enabled
[DONE] Configuration corrected
[DONE] Documentation complete
[PENDING] Ready for your testing!

---

**Enjoy your personalized Commute Compute(TM) dashboard!**

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
