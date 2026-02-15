<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Setup Guide

**Complete setup instructions for your Commute Compute smart transit display.**

**Version:** 4.1
**Last Updated:** 2026-02-16
**System Version:** v4.2.0 (CCDashDesignV15.0)
**License:** AGPL-3.0 Dual License (see [LICENSE](LICENSE))

> New to Commute Compute? Start with our [Complete Beginner Guide](docs/guides/COMPLETE-BEGINNER-GUIDE.md) for a friendlier walkthrough with no technical background required.

---

## Overview

Setting up Commute Compute involves four steps:

1. **Deploy** -- Host the server on Vercel (one click)
2. **Storage** -- Add Redis via Vercel Marketplace
3. **Configure** -- Run the Setup Wizard (addresses, API keys, preferences)
4. **Pair** -- Flash and pair your CC E-Ink display

**Time required:** ~60-90 minutes (first-time setup; includes API key registration and approval wait times)

---

## Prerequisites

| Requirement | Description |
|-------------|-------------|
| Vercel account | Free tier works perfectly |
| CC E-Ink display | Or jailbroken Kindle |
| Transport Victoria API key | Required for live departure data -- register at [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/) |
| Google Places API key | Optional -- for address autocomplete |
| Modern web browser | The Admin Panel, Setup Wizard, and browser-based flasher require a modern web browser (Chrome, Firefox, Safari, or Edge). Internet Explorer is not supported. The browser-based flasher requires Chrome or Edge (Web Serial API). |

---

## Step 1: Deploy to Vercel

### 1.1 One-Click Deploy (Recommended)

1. Click the **Deploy with Vercel** button in the repository README
2. Connect your GitLab account when prompted
3. Click **Deploy**
4. Wait for deployment to complete (~2 minutes)

Your server URL will be: `https://your-project-name.vercel.app`

### 1.2 Verify Deployment

Open: `https://your-project-name.vercel.app/api/status`

You should see a JSON response confirming the server is running.

---

## Step 2: Add Redis (Persistent Storage)

Redis provides persistent storage for your configuration, API keys, and device pairing codes. This is required for Commute Compute to function across serverless invocations.

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
3. Click **Create**

### 2.3 Connect to Project

1. Go to the **Projects** tab for your new Redis database
2. Click **Connect Project**
3. Select your Commute Compute project
4. Click **Connect**

This automatically injects the required environment variables (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) into your Vercel project. After connecting, the integration appears as **Redis** in your Integrations tab with a green status indicator.

### 2.4 Redeploy

The Redis connection requires a redeploy to take effect:

1. Go to your project's **Deployments** tab
2. Click the **...** menu on the latest deployment
3. Click **Redeploy**

### 2.5 Verify Connection

Open: `https://your-project-name.vercel.app/api/kv-status`

Expected: `"connected": true`

---

## Step 3: Run Setup Wizard

### 3.1 Open Setup Wizard

Navigate to: `https://your-project-name.vercel.app/setup-wizard.html`

### 3.2 Device Selection

Choose your display device:
- **CC E-Ink OG** -- 800x480 e-ink (primary)
- **CC E-Ink Mini** -- 400x300 e-ink
- **Kindle** -- Various models (requires jailbreak)

### 3.3 Google Places API Key (Optional)

If you have a Google Places API key, enter it first for better address autocomplete:
- Get a key from [Google Cloud Console](https://console.cloud.google.com/)
- Enable **Places API (New)**

### 3.4 Home and Work Addresses

Enter your home and work addresses:
- Type the full address including suburb and state
- Select from the autocomplete suggestions

**Example:** `123 Example Street, Suburb VIC 3000`

### 3.5 Transport Victoria API Key (Required for live departure data)

This key is essential for live real-time departure countdowns -- the core feature of Commute Compute™:
1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Create an account and request an API key
3. Enter the key in the wizard

### 3.6 Journey Settings

- Set your **target arrival time** at work (e.g., 9:00 AM)
- Enable **CoffeeDecision** if you want coffee stop recommendations

### 3.7 Complete Setup

1. Review your configuration
2. Click **Complete Setup**
3. Note your pairing code (6 characters) for device pairing

---

## Step 4: Device Setup

### For CC E-Ink Displays

#### 4.1 Flash Firmware

**Requirements:**
- PlatformIO installed
- USB cable
- CC E-Ink display

```bash
cd firmware
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*
```

**Windows:** Use `COM3` or similar instead of `/dev/cu.usbmodem*`

Or use the browser-based flasher at `/flasher/` (Chrome/Edge, Web Serial).

#### 4.2 WiFi Provisioning (Phase 1)

1. Device displays BLE setup screen
2. Connect to device via Bluetooth:
   - Device name: `CC-XXXXXX`
3. Send WiFi credentials:
   - SSID (network name)
   - Password
4. Device connects to WiFi

#### 4.3 Pairing (Phase 2)

1. Device displays 6-character pairing code
2. In Setup Wizard, enter the code
3. Click **Pair Device**
4. Device receives configuration and displays dashboard

### For Kindle Devices

See [firmware/kindle/README.md](firmware/kindle/README.md) for Kindle-specific setup.

---

## Verification

### Check Dashboard Preview

Open: `https://your-project-name.vercel.app/api/screen`

You should see your personalised dashboard image.

### Check Device

Your CC E-Ink display should show:
- Current time and journey legs
- Live departure countdowns
- Weather and lifestyle suggestions
- CoffeeDecision recommendation

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

- This is normal. After flashing, allow 2--3 minutes for the device to connect to WiFi and fetch its first dashboard image.
- The first load takes longer than subsequent refreshes. Do not power off or reset during this time.

### Device not connecting

1. Ensure your router broadcasts on 2.4 GHz (the ESP32-C3 does not support 5 GHz networks)
2. If WiFi scanning does not show your network, check that your router's 2.4 GHz band is enabled
3. If selecting a scanned network does not populate the SSID field, try typing the network name manually
4. Ensure WiFi credentials are correct
5. Check device is within WiFi range
6. Verify Vercel deployment is successful
7. Check `/api/status` endpoint

### No departure data

1. Verify your Transport Victoria API key is entered correctly
2. Check `/api/kv-status` shows `"connected": true`
3. Ensure you have selected the correct state in Setup Wizard

### Pairing code not working

1. Codes expire after 10 minutes
2. Generate a new code from Setup Wizard
3. Ensure device and server are on the same network

### Display shows error

1. Verify server URL is correct in firmware config
2. Check network connectivity
3. Review Vercel function logs for errors

---

## Re-Configuration

### Change WiFi Network

1. Factory reset device (hold button 10 seconds)
2. Re-provision via Bluetooth
3. No re-pairing needed

### Change Server/Preferences

1. Generate new pairing code in Setup Wizard
2. Enter code on device
3. Device updates configuration

### Change API Keys

1. Open Admin Panel
2. Go to API Settings
3. Enter new keys
4. Device auto-refreshes on next cycle

---

## Alternative Hosting

While Vercel is the recommended platform (turnkey setup, free tier), Commute Compute can also run on:

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

Copyright (c) 2026 Angus Bergman -- AGPL-3.0 Dual License
