<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Setup Guide

**Complete setup instructions for your Commute Compute™ smart transit display.**

**Version:** 4.1
**Last Updated:** 2026-02-16
**System Version:** v4.2.0 (CCDashDesignV15.0)
**Licence:** AGPL-3.0 Dual Licence (see [LICENSE](LICENSE))

> New to Commute Compute™? Start with our [Complete Beginner Guide](docs/guides/COMPLETE-BEGINNER-GUIDE.md) for a friendlier walkthrough with no technical background required.

---

## Overview

Setting up Commute Compute™ involves four steps:

1. **Deploy** -- Host the server on Vercel (one click)
2. **Storage** -- Add Redis via Vercel Marketplace
3. **Configure** -- Run the Setup Wizard (addresses, API keys, preferences)
4. **Connect** -- Flash and connect your TRMNL display

**Time required:** ~60-90 minutes (first-time setup; includes API key registration and approval wait times)

---

## Before You Begin

Before starting setup, gather these items:

| Requirement | Description |
|-------------|-------------|
| Vercel account | Free tier works perfectly -- sign up at [vercel.com](https://vercel.com) |
| TRMNL display | Or jailbroken Kindle |
| USB-C power source | USB-C (wall adapter or USB port) for continuous always-on use. Battery operation provides several days of cable-free use — ideal for testing placement or portable scenarios. |
| WiFi network details | Network name (SSID) and password -- must be 2.4 GHz network (5 GHz not supported) |
| Modern web browser | Chrome or Edge required for device flashing (Web Serial API) and BLE WiFi provisioning (Web Bluetooth API). Admin Panel and Setup Wizard work with Chrome, Firefox, Safari, or Edge. Internet Explorer is not supported. |
| Transport Victoria API key | Required for live departure data -- register at [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/). Approval may take up to 48 hours. |
| Google Places API key | Optional -- for address autocomplete in Setup Wizard |

[IMPORTANT] Your admin authentication token is shown only once during setup. Write it down or save it securely before proceeding.

[NOTE] Keep your WiFi network details handy -- you'll need them during device provisioning (Step 4.2).

---

## Step 1: Deploy to Vercel

[TIME] This step takes approximately 3-5 minutes.

### 1.1 One-Click Deploy (Recommended)

1. Click the **Deploy with Vercel** button in the repository README
2. Connect your GitLab account when prompted
3. Click **Deploy**
4. Wait for deployment to complete (approximately 2 minutes)

Your server URL will be: `https://your-project-name.vercel.app`

[NOTE] Write down your server URL -- you'll need it throughout setup.

### 1.2 Verify Deployment

Open: `https://your-project-name.vercel.app/api/status`

You should see a JSON response confirming the server is running.

**Next:** Proceed to Step 2 to add persistent storage.

---

## Step 2: Add Redis (Persistent Storage)

[TIME] This step takes approximately 5-7 minutes.

Redis provides persistent storage for your configuration, API keys, and device pairing codes. This is required for Commute Compute™ to function across serverless invocations.

### 2.1 Install Redis Integration

1. In your [Vercel dashboard](https://vercel.com/dashboard), click the **Integrations** tab
2. Click **Browse Marketplace**
3. Search for **Redis** and select the Upstash provider
4. Click **Install**
5. Review the products and click **Install**

### 2.2 Create Redis Database

1. Select the **Redis** product
2. Configure:
   - **Name:** `commute-compute-redis`
   - **Region:** Sydney, Australia (for best Australian latency)
   - **Plan:** Free (256MB storage, 500K commands/month -- more than sufficient)
3. Click **Create** (takes approximately 30 seconds)

### 2.3 Connect to Project

1. Go to the **Projects** tab for your new Redis database
2. Click **Connect Project**
3. Select your Commute Compute™ project
4. Click **Connect**

This automatically injects the required environment variables (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) into your Vercel project. After connecting, the integration appears as **Redis** in your Integrations tab with a green status indicator.

### 2.4 Redeploy

[IMPORTANT] After adding Redis, you **must** redeploy your Vercel project for the environment variables to take effect. Your server will not be able to connect to the database until you complete this step.

1. Go to your project's **Deployments** tab
2. Click the **...** menu on the latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

### 2.5 Verify Connection

Open: `https://your-project-name.vercel.app/api/kv-status`

Expected: `"connected": true`

**Next:** Proceed to Step 3 to configure your journey settings.

---

## Step 3: Run Setup Wizard

[TIME] This step takes approximately 10-15 minutes (plus API key approval wait time if you haven't registered yet).

### 3.1 Open Setup Wizard

Navigate to: `https://your-project-name.vercel.app/setup-wizard.html`

[NOTE] The Setup Wizard configuration steps (addresses, API keys, preferences) work in any modern browser -- Chrome, Firefox, Safari, or Edge. However, the BLE WiFi provisioning step later (Step 4.2) requires Chrome or Edge specifically. Safari and Firefox do not support Web Bluetooth.

[IMPORTANT] Your admin authentication token will be shown once during this process. Write it down or save it securely.

### 3.2 Device Selection

Choose your display device:
- **TRMNL Display (OG)** -- 800x480 e-ink (primary)
- **TRMNL Mini** -- 400x300 e-ink
- **Kindle** -- Various models (requires jailbreak)

### 3.3 Google Places API Key (Optional)

If you have a Google Places API key, enter it first for better address autocomplete:
- Get a key from [Google Cloud Console](https://console.cloud.google.com/)
- Enable **Places API (New)**

[NOTE] This is optional but makes address entry much easier in the next step.

### 3.4 Home and Work Addresses

Enter your home and work addresses:
- Type the full address including suburb and state
- Select from the autocomplete suggestions (if you entered a Google Places key)
- Verify the location on the map

**Example:** `123 Example Street, Suburb VIC 3000`

### 3.5 Transport Victoria API Key (Required for live departure data)

This key is essential for live real-time departure countdowns -- the core feature of Commute Compute™:

1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Create an account and request an API key
3. Wait for approval (may take up to 48 hours)
4. Enter the key in the wizard

[NOTE] You can complete setup without this key, but transit legs will not appear on your dashboard until you add it via the Admin Panel.

### 3.6 Journey Settings

- Set your **target arrival time** at work (e.g., 9:00 AM)
- Enable **CoffeeDecision™** if you want coffee stop recommendations

### 3.7 Complete Setup

1. Review your configuration
2. Click **Complete Setup**
3. Save your admin authentication token securely

**Next:** Verify your dashboard is working before proceeding to device setup.

### 3.8 Verify Dashboard Before Flashing

Before proceeding to flash your device, verify your dashboard is working by visiting your Vercel deployment URL in a browser:

1. Open: `https://your-project-name.vercel.app/api/screen`
2. You should see a rendered dashboard image (even without live departure data, the layout should be visible)
3. If you see an error or blank page, check that Redis is connected (`/api/kv-status` shows `"connected": true`) and that your addresses were saved correctly in the Setup Wizard

This confirms your server is correctly configured before you invest time in device flashing. If the dashboard preview works in your browser, it will work on your TRMNL display.

**Next:** Proceed to Step 4 to set up your physical device.

---

## Step 4: Device Setup

[TIME] This step takes approximately 15-20 minutes total (5 minutes flashing, 2-3 minutes WiFi and server provisioning via BLE, 5-10 minutes first dashboard load).

### For TRMNL Displays

#### 4.1 Flash Firmware

[TIME] Approximately 5 minutes including connection time.

**Browser-Based Flasher (Recommended):**

Use the browser-based flasher at `/flasher/` (Chrome or Edge required for Web Serial API):

1. Connect your TRMNL display via USB to your computer
2. Navigate to: `https://your-project-name.vercel.app/flasher/`
3. Click **Connect** and select your device from the pop-up
4. Click **Flash** and wait for completion (approximately 2 minutes)

**Command-Line Flasher (Advanced):**

**Requirements:**
- PlatformIO installed
- USB cable
- TRMNL display

```bash
cd firmware
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*
```

**Windows:** Use `COM3` or similar instead of `/dev/cu.usbmodem*`

#### 4.2 WiFi and Server Provisioning (via BLE)

[TIME] Approximately 2-3 minutes.

[NOTE] Have your WiFi network name (SSID) and password ready. Your network must be 2.4 GHz (5 GHz networks are not supported by the ESP32-C3 chipset).

[NOTE] You must use **Chrome or Edge** for this step. Safari and Firefox do not support Web Bluetooth. iPhone does not support Web Bluetooth -- use a desktop or laptop computer.

1. Device displays BLE setup screen with device name `CC-XXXXXX`
2. Open the **Setup Wizard** in Chrome or Edge on your computer
3. Click **Connect to Device** -- your browser scans for nearby Bluetooth devices
4. Select your TRMNL display from the list
5. Enter your WiFi credentials:
   - **SSID:** Your network name (e.g., "HomeWiFi")
   - **Password:** Your network password
6. Click **Submit** -- the Setup Wizard automatically sends your WiFi credentials **and** your server URL (webhook endpoint) to the device via BLE
7. Device connects to WiFi and immediately begins fetching your dashboard

The Setup Wizard derives your server URL automatically from its own address (e.g., `https://your-project-name.vercel.app/api/screen`). No manual server URL configuration is required.

[TIP] If WiFi scanning does not show your network, ensure your router's 2.4 GHz band is enabled. Some dual-band routers disable 2.4 GHz when 5 GHz is active.

[TIP] If selecting a scanned network does not populate the SSID field, try typing the network name manually instead of selecting from the scan results.

#### 4.3 Pairing Code (Optional Fallback)

[TIME] Most devices skip this step entirely. If needed, approximately 1-2 minutes.

If your device shows a 6-character pairing code after WiFi setup, enter it in the Setup Wizard or Admin Panel. Most devices will skip this step and proceed directly to displaying the dashboard.

The pairing code is a fallback mechanism that activates only if BLE URL delivery did not succeed. If your device goes straight to fetching and displaying the dashboard after WiFi provisioning, the pairing code was not needed.

**If a pairing code is displayed:**

1. Note the 6-character code shown on your device screen
2. In the Setup Wizard (or Admin Panel), enter the code
3. Click **Pair Device**
4. Device receives its server URL and begins fetching dashboard data

[IMPORTANT] After WiFi provisioning (or pairing, if required), allow 2-3 minutes for the device to fetch its first dashboard image. The first load takes longer than subsequent refreshes. Do not power off or reset the device during this time.

[NOTE] The screen will remain blank during initial connection. This is normal. Wait at least 3 minutes before troubleshooting.

### For Kindle Devices

See [firmware/kindle/README.md](firmware/kindle/README.md) for Kindle-specific setup.

---

## Verification

### Check Dashboard Preview

Open: `https://your-project-name.vercel.app/api/screen`

You should see your personalised dashboard image.

### Check Device

Your TRMNL display should show:
- Current time and journey legs
- Live departure countdowns
- Weather and lifestyle suggestions
- CoffeeDecision recommendation

---

## What Data Does My Device Fetch?

Once configured, your TRMNL display periodically fetches a dashboard image from your personal Commute Compute™ server deployment.

**Endpoint:** Your device connects to `/api/screen` on your Vercel deployment (e.g., `https://your-project.vercel.app/api/screen`). This URL was automatically configured during BLE setup.

**What the dashboard contains:**
- Live departure times for your configured transit stops
- Your commute route summary (suburb names, not full street addresses)
- CoffeeDecision suggestions based on your schedule
- Current time and weather context

**Refresh interval:** Every 60 seconds.

**Privacy:** The dashboard image is generated server-side from your Redis-stored preferences. Your device does not send personal data to the server — it only receives the rendered image. Your WiFi credentials never leave the device.

**Security:** Treat your deployment URL as a sensitive credential. Anyone with access to your `/api/screen` URL can view your dashboard image. Use a custom domain or keep your Vercel subdomain private.

---

## Configuration Options

### Admin Panel

Access the admin panel at: `https://your-project-name.vercel.app/admin.html`

| Tab | Purpose |
|-----|---------|
| Setup & Journey | View/edit journey configuration |
| API Settings | Manage API keys |
| Live Data | Real-time departure information |
| Configuration | Advanced settings |

### Refresh Timing

| Type | Interval | Description |
|------|----------|-------------|
| Partial refresh | 60 seconds | Updates changing data |
| Full refresh | 5 minutes | Clears display ghosting |

---

## Troubleshooting

### Display blank after flashing

This is normal behaviour during initial setup:

1. After flashing, the device must complete several steps before showing content:
   - Boot and initialise hardware (30 seconds)
   - Connect to WiFi (30-60 seconds)
   - Pair with server (10-30 seconds)
   - Fetch first dashboard image (60-90 seconds)

2. **Total expected wait time:** 2-3 minutes from power-on to first image

3. If the display remains blank after 5 minutes:
   - Check serial output for error messages (see firmware/QUICK_START.md)
   - Verify WiFi credentials are correct
   - Ensure device is within WiFi range
   - Check `/api/status` endpoint is responding

[IMPORTANT] Do not power off or reset the device during the initial 3-minute connection period.

### Device not connecting to WiFi

1. **Network frequency:** Ensure your router broadcasts on 2.4 GHz (the ESP32-C3 does not support 5 GHz networks)
2. **Network visibility:** If WiFi scanning does not show your network, check that your router's 2.4 GHz band is enabled
3. **Manual entry:** If selecting a scanned network does not populate the SSID field, try typing the network name manually
4. **Credentials:** Verify WiFi password is correct (passwords are case-sensitive)
5. **Signal strength:** Check device is within WiFi range (try moving closer to router)
6. **Server status:** Verify Vercel deployment is successful by checking `/api/status` endpoint

### No departure data

1. Verify your Transport Victoria API key is entered correctly
2. Check `/api/kv-status` shows `"connected": true`
3. Ensure you have selected the correct state in Setup Wizard

### Pairing code not working

[NOTE] The pairing code is an optional fallback. Most devices receive their server URL via BLE during WiFi provisioning and do not require a pairing code.

1. Codes expire after 10 minutes
2. Generate a new code from the Setup Wizard
3. Ensure device and server are on the same network

### Display shows error

1. Verify the server URL was delivered correctly during BLE provisioning (re-run WiFi setup if needed)
2. Check network connectivity
3. Review Vercel function logs for errors

### Server errors

1. **HTTP 500 (Internal Server Error):** Check your Redis connection. Verify that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` environment variables are set in your Vercel project settings. Visit `/api/kv-status` to confirm `"connected": true`.
2. **HTTP 401/403 (Unauthorised):** Verify your API token is correctly configured in the Setup Wizard or Admin Panel. Re-enter the token if necessary.
3. **Blank screen in browser:** Open your browser's developer console (F12) and check for errors. Verify that your Vercel deployment completed successfully (green checkmark in the Deployments tab).
4. **Connection timeout:** Confirm your Vercel project is deployed and the URL is correct. Visit `/api/status` to check the server is responding. If using Render, note that free-tier instances spin down after inactivity and may take 30-60 seconds to wake.

---

## Re-Configuration

### Change WiFi Network

1. Factory reset device (hold button 10 seconds)
2. Re-provision via Bluetooth
3. No re-pairing needed

### Change Server/Preferences

1. Factory reset device (hold button 10 seconds)
2. Re-provision via BLE -- the Setup Wizard sends the new server URL alongside WiFi credentials
3. If the device shows a pairing code, enter it in the Setup Wizard

### Change API Keys

1. Open Admin Panel
2. Go to API Settings
3. Enter new keys
4. Device auto-refreshes on next cycle

---

## Alternative Hosting

While Vercel is the recommended platform (turnkey setup, free tier), Commute Compute™ can also run on:

- **Render.com** -- Free tier with Redis addon
- **Railway** -- With Redis plugin
- **Docker** -- Self-hosted with Redis instance
- **VPS** -- Any Node.js host with Redis

See [INSTALL.md](INSTALL.md) for detailed instructions on alternative hosting options.

---

## Support

| Resource | Link |
|----------|------|
| Documentation | [docs/](docs/) |
| Issues | GitLab Issues |
| Development Rules | [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) |

---

## Next Steps

- [INSTALL.md](INSTALL.md) -- Detailed installation guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) -- System architecture
- [firmware/README.md](firmware/README.md) -- Firmware documentation

---

Copyright (c) 2026 Angus Bergman -- AGPL-3.0 Dual Licence
