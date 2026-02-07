<p align="center">
  <img src="../assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Quick Start Guide

## Your Device is Ready!

Your TRMNL device has been flashed with custom firmware and is ready to connect to your Commute Compute(TM) admin panel.

---

## Step 1: First Power-On

1. **Disconnect USB** (if connected)
2. **Power on device** (battery or USB)
3. Device will boot and create a WiFi hotspot

---

## Step 2: WiFi Setup

1. **Look for WiFi network:** `Commute Compute-Setup`
2. **Connect** using password: `transport123`
3. **Browser opens automatically** (or go to `192.168.4.1`)
4. **Select your WiFi** network from the list
5. **Enter password** and submit
6. Device will **reboot** and connect to your network

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
- Device creates `Commute Compute-Setup` WiFi hotspot
- Display shows setup instructions

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

To see what the device is doing:

```bash
cd /path/to/commute-compute/firmware
pio device monitor --baud 115200
```

You should see:
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
# Check serial output
pio device monitor --baud 115200

# Look for errors like:
# - "WiFi connection failed"
# - "HTTP request failed"
# - "JSON parse error"
```

### WiFi Won't Connect
```bash
# Reset WiFi credentials by holding button for 5 seconds
# Or via serial:
pio device monitor
# Then press any key and type: wifi reset
```

### Admin Panel Not Responding
```bash
# Check server status
curl https://your-server-name.vercel.app/api/health

# Should return: {"status":"ok"}
```

### No Serial Output
- **Don't worry!** USB CDC is now enabled
- Make sure you're using: `pio device monitor --baud 115200`
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
- **Serial debugging:** `pio device monitor --baud 115200`

---

## Current Status

[DONE] Firmware flashed (CC-FW-7.4.3, 1.13MB)
[DONE] USB CDC enabled
[DONE] Configuration corrected
[DONE] Documentation complete
[PENDING] Ready for your testing!

---

**Enjoy your personalized Commute Compute(TM) dashboard!**

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
