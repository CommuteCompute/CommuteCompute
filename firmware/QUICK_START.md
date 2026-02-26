<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Quick Start Guide

## Your Device is Ready!

Your TRMNL display has been flashed with CCFirm™ firmware and is ready to connect to your Commute Compute™ admin panel.

> **Note:** If you have not yet flashed your device, see the Browser Flasher guide first at `https://your-project-name.vercel.app/flasher/` (Chrome or Edge required). This Quick Start guide assumes flashing is already complete.

---

## What You Will Need

Before starting, gather these items:

| Item | Description |
|------|-------------|
| TRMNL display | Flashed with CCFirm™ firmware |
| WiFi network details | Network name (SSID) and password -- must be 2.4 GHz |
| Computer | Desktop or laptop with Chrome or Edge browser (for BLE WiFi provisioning) |
| Setup Wizard | Your Vercel deployment URL (e.g., `your-project.vercel.app/setup-wizard.html`) |

[IMPORTANT] Safari and Firefox do not support Web Bluetooth. You must use Chrome or Edge for BLE WiFi provisioning.

[NOTE] iPhone does not support Web Bluetooth. Use a desktop/laptop computer with Chrome or Edge.

---

## Step 1: First Power-On

[TIME] Approximately 30-60 seconds.

1. **Disconnect USB** (if connected)
2. **Power on the display** via USB-C
3. The display will boot and start BLE (Bluetooth Low Energy) advertising

**What you should see:** The display shows BLE pairing instructions with device name `CC-XXXXXX`.

---

## Step 2: WiFi and Server Setup (via BLE)

[TIME] Approximately 2-3 minutes.

[NOTE] Your WiFi network must be 2.4 GHz. The ESP32-C3 chipset does not support 5 GHz networks.

During BLE provisioning, the Setup Wizard sends three values to your device over Bluetooth: your WiFi network name (SSID), your WiFi password, and your server URL (webhook endpoint). The server URL is automatically derived from the Setup Wizard's own address -- no manual configuration is needed.

1. **On your computer**, open Chrome or Edge (Safari/Firefox not supported for Web Bluetooth)
2. **Navigate to** your Setup Wizard at: `https://your-server-name.vercel.app/setup-wizard.html`
3. **Click "Connect to Device"** -- your browser will scan for nearby BLE devices
4. **Select** your display from the list (appears as `CC-XXXXXX`)
5. **Enter your WiFi credentials** when prompted:
   - **Network name (SSID):** e.g., "HomeWiFi"
   - **Password:** Your network password (case-sensitive)
6. **Click Submit** -- the Setup Wizard sends WiFi credentials **and** server URL to the device via BLE
7. The display will **connect to WiFi** and **immediately begin fetching your dashboard** (takes 30-60 seconds)

[TIP] If WiFi scanning does not show your network, ensure your router's 2.4 GHz band is enabled. Some dual-band routers disable 2.4 GHz when only 5 GHz is active.

[TIP] If selecting a scanned network does not populate the SSID field, try typing the network name manually instead.

**What you should see:** The display shows "Connecting to WiFi..." followed by a success message, then begins fetching your dashboard.

---

## Step 3: Pairing Code (Optional Fallback)

[TIME] Most devices skip this step. If needed, approximately 1-2 minutes.

If your device shows a 6-character pairing code after WiFi setup, enter it in the Setup Wizard or Admin Panel. Most devices receive their server URL via BLE during Step 2 and proceed directly to displaying the dashboard without requiring a pairing code.

**If a pairing code is displayed:**

1. Open your Admin Panel at: `https://your-server-name.vercel.app/admin.html`
2. Find the "Device Pairing" or "Enter Pairing Code" section
3. Enter the 6-character pairing code shown on your display
4. Click **Pair Device**

**If no pairing code is displayed** (the device went straight to fetching the dashboard), this step is complete -- no action needed.

**What happens next:** The display will automatically fetch and show:
- Next trams/trains to work
- When to leave (based on current time)
- CoffeeDecision™ recommendation (based on available time)
- Weather and service status

[IMPORTANT] Allow 2-3 minutes after WiFi provisioning (or pairing, if required) for the display to fetch its first dashboard image. The first load takes longer than subsequent refreshes. Do not power off or reset during this time.

---

## What You Should See

### On First Boot:
- Display shows BLE advertising screen
- Device name appears as `CC-XXXXXX`
- Screen shows pairing instructions

### After WiFi and Server Setup (BLE):
- Display shows "Connecting to WiFi..."
- Display shows "WiFi connected!" with IP address
- Display begins fetching dashboard data immediately (server URL was delivered via BLE)

### After First Dashboard Load:
- Display fetches initial dashboard (takes 2-3 minutes on first load)
- Shows your personalised Commute Compute™ dashboard
- Updates begin automatically
- If BLE URL delivery did not succeed, the device may display a 6-character pairing code instead -- enter it in the Setup Wizard or Admin Panel

### Normal Operation:
- **Partial refresh** every 60 seconds (departure times update)
- **Full refresh** every 5 minutes (complete screen redraw to prevent ghosting)
- **USB-C power** required for continuous operation

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
   - The display fetches current time
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

**Expected behaviour:** After flashing or pairing, the display requires 2-3 minutes to complete initial connection and data fetch.

**Timeline:**
1. Boot and hardware initialisation: 30 seconds
2. WiFi connection: 30-60 seconds
3. Server pairing: 10-30 seconds
4. First dashboard fetch: 60-90 seconds

**Total expected wait time:** 2-3 minutes from power-on to first dashboard image.

**If display remains blank after 5 minutes:**

1. Check serial output for error messages (see "Monitoring Serial Output" section above):

```bash
# Check serial output (do NOT use pio device monitor -- causes crash)
screen /dev/cu.usbmodem* 115200  # macOS
# Or use PuTTY on Windows at 115200 baud

# Look for errors like:
# - "WiFi connection failed"
# - "HTTP request failed"
# - "JSON parse error"
# - "Pairing code expired"
```

2. Verify server is responding:
```bash
curl https://your-server-name.vercel.app/api/status
# Should return: {"status":"ok",...}
```

3. Try power cycling the device (disconnect power, wait 5 seconds, reconnect)

[IMPORTANT] Do not power off or reset during the initial 3-minute connection period. Let the device complete its full boot sequence.

### WiFi Won't Connect

**Network requirements:**
- The ESP32-C3 chipset only supports **2.4 GHz** WiFi networks
- 5 GHz networks are not supported and will not appear in scans

**Troubleshooting steps:**

1. **Enable 2.4 GHz band:** If WiFi scanning does not show your network, ensure your router's 2.4 GHz band is enabled. Some dual-band routers disable 2.4 GHz when only 5 GHz is active.

2. **Manual SSID entry:** If selecting a scanned network does not populate the SSID field in the pairing interface, try typing the network name manually instead of selecting from scan results.

3. **Check credentials:** Verify WiFi password is correct. Passwords are case-sensitive.

4. **Signal strength:** Move the display closer to your WiFi router to ensure strong signal.

5. **Reset WiFi credentials:** Hold the device button for 10 seconds to factory reset, then re-provision via BLE from the Setup Wizard.

### Admin Panel Not Responding

[TIME] This check takes less than 30 seconds.

```bash
# Check server status
curl https://your-server-name.vercel.app/api/status

# Expected response: {"status":"ok",...}
```

**If server is not responding:**
1. Verify Vercel deployment completed successfully
2. Check Vercel dashboard for deployment errors
3. Ensure Redis integration is connected (see SETUP_GUIDE.md Step 2.5)

### No Serial Output When Monitoring

**This is normal in some configurations.**

- USB CDC (serial over USB) is enabled in your firmware build
- Use a standalone serial terminal at 115200 baud
- **Do NOT use `pio device monitor`** -- it causes system crash/freeze on ESP32-C3
- Try unplugging and replugging USB cable
- On some systems, serial output may not appear until after first WiFi connection

---

## Device Specifications

```
Chip:        ESP32-C3 (revision v0.4)
Flash:       4MB
RAM:         320KB
Display:     7.5" e-ink (800x480)
WiFi:        2.4GHz 802.11 b/g/n
Update Rate: 1 min (partial), 5 min (full)
Power:       USB-C recommended; battery supported (several days)
```

---

## Important Notes

### USB CDC Configuration
Your TRMNL display has been configured with:
- `ARDUINO_USB_MODE=1` - USB enabled
- `ARDUINO_USB_CDC_ON_BOOT=1` - Serial on boot

This is **required** for ESP32-C3. Do not change these settings.

### Power Requirements
- **USB-C power recommended** for continuous, always-on operation
- Battery operation provides several days of cable-free use — ideal for testing placement or portable scenarios. Deep sleep and configurable refresh intervals are planned enhancements to further extend battery duration
- For wall-mounted use, connect to USB-C power for uninterrupted operation

### Server URL
Your device's server URL is automatically configured during BLE WiFi setup. The Setup Wizard sends your deployment URL alongside WiFi credentials -- no manual firmware configuration needed.

If you need to change the server URL, factory reset the device (hold button 10 seconds) and re-provision via BLE from the Setup Wizard on your new deployment.

---

## Need More Help?

- **Detailed flashing guide:** `docs/FLASHING.md`
- **Diagnostic report:** `docs/DIAGNOSTIC_FINDINGS.md`
- **Full README:** `README.md`
- **Serial debugging:** Use a standalone serial terminal at 115200 baud (not `pio device monitor`)

---

## Current Status

[DONE] Firmware flashed (CCFirm v8.0.0)
[DONE] USB CDC enabled
[DONE] Configuration corrected
[DONE] Documentation complete
[PENDING] Ready for your testing!

---

**Enjoy your personalised Commute Compute™ dashboard!**

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual Licence
