<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Known Issues & Hardware Quirks

**System Version:** v5.0.0 (CCDashDesignV16.0)
**Last Updated:** 2026-02-16

---

## Critical: FONT_12x16 Rotation Bug

**Date Discovered:** 2026-01-28
**Severity:** High (breaks display)
**Status:** Workaround applied

### Problem

When using the `bbep.begin(EPD_TRMNL_OG)` preset with the `FONT_12x16` font size, all text renders rotated 90 degrees counter-clockwise, making the e-ink display unreadable.

**What this means for you:** If you are building or modifying the firmware yourself, using a larger font size on your TRMNL display can cause all the text to appear sideways. The standard firmware already avoids this problem — you only need to worry about it if you are customising the firmware code.

### Affected Configuration

- Hardware: TRMNL Display (OG) (ESP32-C3 chip + 7.5" Waveshare e-ink panel)
- Library: bb_epaper v2.0.3+
- Preset: `EPD_TRMNL_OG`
- Font: `FONT_12x16` (and possibly other larger fonts)

### Working Configuration

- Font: `FONT_8x8` renders correctly
- Test pattern with grid and labels confirmed the coordinate system is correct
- The issue is isolated to font rendering, not display orientation

### Diagnosis Method

1. Flash a test pattern with grid lines and coordinate labels using `FONT_8x8`
2. Observe: all text is horizontal, TL/TR/BL/BR corners are correct
3. Flash the dashboard with `FONT_12x16` headers
4. Observe: `FONT_12x16` text is rotated 90 degrees counter-clockwise, while `FONT_8x8` text remains correct

### Fix Applied

```cpp
// In initDisplay():
bbep.begin(EPD_TRMNL_OG);  // Use TRMNL preset
bbep.setRotation(0);        // Native orientation

// Throughout code:
bbep.setFont(FONT_8x8);     // ONLY use 8x8 font
// DO NOT use FONT_12x16 - it will rotate!
```

### Golden Rule

**Rule:** On TRMNL Display (OG) hardware, use ONLY `FONT_8x8`. Larger fonts have rendering bugs that cause 90-degree rotation.

**What this means for you:** The standard CCFirm™ firmware already uses the correct font. If you ever modify the firmware code, stick to `FONT_8x8` — do not switch to larger font sizes, or text will appear rotated on screen.

---

## V15.0: Enhanced Glanceability Font Sizes

**Date:** 2026-02-06
**Severity:** Low (cosmetic)
**Status:** Monitoring

### Note

V15.0 introduces larger fonts for improved readability in the CCDash™ Renderer (v2.1). These enhanced font sizes are rendered on the server (in the cloud) and sent to your display as a pre-built image. Because of this, they are **not** affected by the FONT_12x16 firmware rotation bug described above. The firmware continues to display server-rendered images. No firmware font changes are required.

**What this means for you:** Your dashboard text is now larger and easier to read from across the room. This change happens automatically on the server — you do not need to update your device or firmware to benefit from it.

---

## Resolved: leaveIn Calculation HTTP 500 on Overnight Journeys

**Date Discovered:** 2026-02-16
**Severity:** High (dashboard crash)
**Status:** Resolved (v4.2.0)

### Problem

When the `leaveIn` countdown (minutes until departure) was calculated during overnight periods where the next departure was the following day, the subtraction could produce a negative intermediate value. Passing this to `Math.floor()` in certain edge cases triggered an unhandled exception in the dashboard renderer, causing an HTTP 500 response from `/api/screen`.

### Fix Applied

Added a guard clause to normalise `leaveIn` values: if the raw difference is negative (i.e., the departure is past midnight relative to the current time), the calculation wraps by adding 1440 (minutes in a day). This ensures `leaveIn` is always a non-negative integer before rendering.

**What this means for you:** If your dashboard previously showed a blank screen or error during late-night/early-morning hours, this has been fixed. No action is required on your part.

---

## Design Decisions (Not Bugs)

### `/api/geocode` Not Exposed

**Status:** Intentional (Security by Design)

The `/api/geocode` endpoint (the address lookup service) returns a "404 not found" response by design. Geocoding functionality — the process of converting a street address into map coordinates — is:

- Handled on the server only, via the `/admin/geocode` POST endpoint
- Protected to prevent API key abuse from public access
- Used internally by the admin panel forms

**Workaround:** Use the admin panel interface for address lookups. The admin panel calls the protected endpoint with proper authentication.

**What this means for you:** If you try to access `/api/geocode` directly in your browser, you will see a "not found" error. This is expected behaviour. All address lookups work correctly through the Setup Wizard and Admin Panel — there is nothing for you to fix.

---

## Hardware Considerations

### WiFi Must Be 2.4GHz

The TRMNL display hardware (ESP32-C3 chipset) only supports 2.4GHz WiFi networks. 5GHz networks are not supported and will not appear in WiFi scans during setup.

If your router broadcasts a combined 2.4/5GHz network (common with modern routers), the device may fail to connect or the network may not appear in scans. **Fix:** Check your router settings and ensure a dedicated 2.4GHz network is available, or that your combined network supports 2.4GHz clients. Some dual-band routers disable the 2.4GHz band when only 5GHz is active -- ensure it is enabled.

**What this means for you:** Before setting up your TRMNL display, verify that your WiFi router is broadcasting on 2.4GHz. If you only see 5GHz networks in your router settings, enable the 2.4GHz band. Most modern routers broadcast both by default.

### Battery Operation — Several Days Cable-Free

**Date Documented:** 2026-02-20
**Severity:** Informational
**Status:** Fully Operational (CCFirm v8.1.0)

Battery operation is a core feature of the TRMNL display. With CCFirm™ v8.1.0 hardware deep sleep (60-second refresh interval), the display operates for several days on battery — ideal for flexible placement anywhere in the home, trying different locations, or portable use without cable management. Battery percentage and voltage are monitored via the Admin Panel.

USB-C power is available for continuous wall-mounted use. The display transitions seamlessly between battery and USB-C — connect the cable when preferred, remove it when you want the freedom of cable-free placement. The system also provides power outage resilience: if mains power is interrupted, the display continues operating on battery.

**What this means for you:** Your TRMNL display works on battery for several days out of the box. Place it anywhere — kitchen bench, bedside table, hallway shelf — without worrying about cables. For permanent wall-mounted use, connect USB-C. Battery level is visible in the Admin Panel.

---

## Other Notes

### Display Coordinate System

These details are relevant for firmware developers only:

- Origin (0,0) is at the top-left corner
- X axis: 0–800 pixels (left to right)
- Y axis: 0–480 pixels (top to bottom)
- Standard landscape orientation when using `EPD_TRMNL_OG` + `setRotation(0)`

**What this means for you:** The display is oriented in landscape mode (wider than it is tall). If your dashboard appears upside down or sideways, there may be a firmware configuration issue — refer to the firmware documentation or raise a support request.

---

## Setup Wizard: Device Cycling Back to Pairing Screen After Reboot

**Date Discovered:** 2026-04-05
**Severity:** Medium (prevents first-time setup completion)
**Status:** Fixed in CCFirm v8.1.0 firmware binary update (2026-04-05) + workaround documented

### Symptoms

After completing Bluetooth pairing and Wi-Fi configuration through the setup wizard, one or more of the following may occur:

- The TRMNL display cycles back to the setup / pairing screen after rebooting.
- The device appears stuck on the "Commute Compute™" logo boot screen and does not progress.
- The browser-based firmware flasher completes but the display shows a static or blank screen.

### Root Causes (Investigated 2026-04-05)

**Root Cause 1 — Stale web flasher binary (primary cause of static screen + setup cycling)**

The web flasher at `/flasher/` previously contained a pre-built binary from the old PTV-TRMNL v5.3 era (February 2026). That binary:
- Predates BLE provisioning (introduced in CCFirm v7.0.0)
- Used the WiFiManager captive portal, which crashes the ESP32-C3 with `0xbaad5678`
- Reported itself as `PTV-TRMNL/5.30` — incompatible branding and architecture

**Fix applied:** The web flasher now ships the current CCFirm v8.1.0 binary compiled from `firmware/.pio/build/trmnl/`. After updating, the web flasher and VS Code flash path are equivalent.

**Root Cause 2 — Pairing server poll with empty webhook URL**

If `webhookUrl` was not yet provisioned (e.g., BLE URL delivery failed), `pollPairingServer()` constructed a URL with no host (e.g., `/api/pair/ABCDEF`) which silently failed on every poll cycle, keeping the device in the pairing screen indefinitely.

**Fix applied:** `pollPairingServer()` now falls back to `DEFAULT_SERVER` when `webhookUrl` is empty, allowing the pairing code path to function even if BLE URL delivery was incomplete.

**Root Cause 3 — Boot screen hang on stuck display BUSY pin**

After flashing older firmware (e.g., v5.3), the e-ink VCOM rail may not be properly discharged. On the next boot, `showBootScreen()` calls `refresh(REFRESH_FULL, true)` which blocks indefinitely waiting for BUSY to deassert.

**Fix applied:** `showBootScreen()` now checks the BUSY pin state before issuing the full refresh, with a 15-second timeout. If BUSY is stuck HIGH after 15 seconds, the device performs a clean restart to clear the display state.

**Root Cause 4 — Setup wizard run from localhost (unreachable URL sent to device)**

The Bluetooth step sends `window.location.origin + '/api/screen'` as the webhook URL. If the wizard is opened from a local development server (e.g., `http://localhost:3000`), the device saves an unreachable URL and cycles to setup on every WiFi connect.

**Mitigation:** The setup wizard now shows a troubleshooting note when a TRMNL device is selected, explaining that the wizard must be opened from the live Vercel deployment URL.

### Resolving an Affected Device

**Step 1 — Re-flash with current firmware**

Open the [web flasher](/flasher/) and flash. The flasher now contains the correct v8.1.0 binary. Alternatively, compile and flash from source:
```bash
cd firmware
pio run -e trmnl --target upload
```

**Step 2 — Factory reset before re-running setup**

Hold the button on the TRMNL device for 5 seconds at the boot logo. The display confirms "FACTORY RESET" and restarts. This clears NVS (WiFi credentials + webhook URL + pairing state).

**Step 3 — Run setup wizard from Vercel URL**

Open the setup wizard from your live Vercel deployment:
```
https://your-app.vercel.app/setup-wizard.html
```
Do **not** run it from `localhost`. The URL shown in your browser becomes the server URL sent to the device via Bluetooth.

**Step 4 — Complete the Bluetooth step fully**

In Step 1 of the wizard, after clicking "Find Device" and connecting via Bluetooth, wait for the status to confirm "Device configured!" before clicking Next. The device must receive all three credentials (SSID, password, server URL) over BLE before proceeding.

**Step 5 — If device still hangs on logo after all of the above**

Power the device off completely. Leave it unplugged for 60 seconds to allow the e-ink VCOM rail to discharge. Re-flash, then retry from Step 2.

---

(c) 2026 Commute Compute™ System by Angus Bergman -- AGPL-3.0 Dual Licence
