<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Setup Guide

**Complete setup instructions for your Commute Compute smart transit display.**

**Version:** 3.0
**Last Updated:** 2026-02-06
**System Version:** v3.5.0 (CCDashDesignV15.0)
**License:** AGPL-3.0 Dual License (see [LICENSE](LICENSE))

---

## Overview

Setting up Commute Compute involves four steps:

1. **Deploy** — Host the server on Vercel
2. **Configure** — Set up your addresses and preferences
3. **Connect** — Create Vercel KV database
4. **Pair** — Flash and pair your device

**Time required:** ~15 minutes

---

## Prerequisites

| Requirement | Description |
|-------------|-------------|
| Vercel account | Free tier works perfectly |
| TRMNL device | Or jailbroken Kindle |
| Transport Victoria API key | Optional — system works without it |
| Google Places API key | Optional — for address autocomplete |

---

## Step 1: Deploy to Vercel

### Option A: One-Click Deploy (Recommended)

1. Click the deploy button in the repository
2. Connect your GitLab account
3. Click **Deploy**
4. Wait for deployment to complete (~2 minutes)

### 2. Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Or manually:
1. Go to [render.com/dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitLab account
4. Select your forked `commute-compute` repository
5. Configure:
   - **Name**: `commute-compute` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `npm install --no-audit --no-fund`
   - **Start Command**: `node src/server.js`
   - **Plan**: Free
6. Click "Create Web Service" (no environment variables needed for Zero-Config)

**Wait 3-5 minutes for deployment to complete.**

Your server URL will be: `https://your-server-name.vercel.app`

### 3. Flash Device

#### Option A: Pre-Built Firmware (Easiest)

```bash
# Download the latest firmware
curl -L https://gitlab.com/YOUR-USERNAME/commute-compute/releases/latest/download/firmware.bin -o firmware.bin

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Option B: Build From Source

```bash
# Install PlatformIO
pip install platformio

# Clone your fork
git clone https://gitlab.com/YOUR-USERNAME/commute-compute.git
cd commute-compute/firmware

# Update server URL in include/config.h
# Change SERVER_URL to your Render URL

# Build and upload
pio run --target upload
```

### 4. Configure Your Device

1. **Power on your TRMNL device**
2. **Connect to WiFi hotspot**: `Commute Compute-Setup` (password: `transport123`)
3. **Browser opens automatically** (or go to `192.168.4.1`)
4. **Select your WiFi network** and enter password
5. **Device reboots** and connects to your network

### 5. Set Up Your Dashboard

1. Open your Render URL in a browser: `https://your-server-name.vercel.app/admin`
2. Enter your **home address** (e.g., "123 Example Street, Melbourne VIC 3000")
3. Enter your **work address**
4. Set your **arrival time** at work (e.g., "9:00 AM")
5. Enable **coffee decision** if you want coffee recommendations
6. Click **"Build Smart Journey"**

**Done!** Your dashboard should now display your personalized transit information.

---

## Step 2: Create Vercel KV Database

Vercel KV provides persistent storage for your configuration.

### 2.1 Open Storage Tab

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click **Storage** tab

### 2.2 Create Database

1. Click **Create Database**
2. Select **KV** (Redis-compatible)
3. Configure:
   - **Name:** `commute-compute-kv`
   - **Region:** Sydney, Australia (syd1)
   - **Plan:** Hobby (free)
4. Click **Create**

### 2.3 Connect to Project

1. In the KV database view, click **Connect to Project**
2. Select your Commute Compute project
3. Click **Connect**

### 2.4 Redeploy

The KV connection requires a redeploy:

1. Go to **Deployments** tab
2. Click the **⋮** menu on the latest deployment
3. Click **Redeploy**

**Verification:** Open `https://your-project.vercel.app/api/kv-status` — should show `"connected": true`

---

## Step 3: Run Setup Wizard

### 3.1 Open Setup Wizard

Navigate to: `https://your-project.vercel.app/setup-wizard.html`

### 3.2 Step 1: Home Address

Enter your home address:
- Type the full address including suburb and state
- Select from the autocomplete suggestions
- The map will show your location

**Example:** `123 Example Street, Suburb VIC 3000`

### 3.3 Step 2: Work Address

Enter your work/destination address using the same process.

### 3.4 Step 3: Cafe (Optional)

Add a cafe stop if you want coffee recommendations:
- Enter cafe name and address
- Or skip this step

### 3.5 Step 4: API Keys (Optional)

**Transport Victoria API Key:**
1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Create an account
3. Request an API key
4. Enter the key in the wizard

*Note: The system works without an API key using timetable fallback data.*

**Google Places API Key (Optional):**
- Enables address autocomplete
- Get a key from [Google Cloud Console](https://console.cloud.google.com/)
- Enable "Places API (New)"

### 3.6 Step 5: Select Device

Choose your display device:
- **TRMNL OG** — 800×480 e-ink
- **TRMNL Mini** — 400×300 e-ink
- **Kindle** — Various models

### 3.7 Step 6: Complete Setup

1. Review your configuration
2. Click **Complete Setup**
3. Note your pairing code (6 characters)

---

## Step 4: Device Setup

### For TRMNL Devices

#### 4.1 Flash Firmware

**Requirements:**
- PlatformIO installed
- USB cable
- TRMNL device

```bash
# Navigate to firmware directory
cd firmware

# Build and flash
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*
```

**Windows:** Use `COM3` or similar instead of `/dev/cu.usbmodem*`

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

### Check Server Status

Open: `https://your-project.vercel.app/api/status`

Expected response:
```json
{
  "status": "ok",
  "dataMode": "Live",
  "version": "3.5.0"
}
```

### Check Dashboard Preview

Open: `https://your-project.vercel.app/preview.html`

You should see your personalized dashboard.

### Check Device

Your device should display:
- Current time
- Journey information
- Weather
- Coffee recommendation

---

## Configuration Options

### Admin Panel

Access the admin panel at: `https://your-project.vercel.app/admin.html`

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

### Device not connecting

1. Ensure WiFi credentials are correct
2. Check device is within WiFi range
3. Verify Vercel deployment is successful
4. Check `/api/status` endpoint

### No departure data

1. Verify API key is entered correctly
2. Check `/api/kv-status` shows connected
3. System falls back to timetable data if API unavailable

### Pairing code not working

1. Codes expire after 10 minutes
2. Generate a new code from Setup Wizard
3. Ensure device and server are on same network

### Display shows error

1. Check serial monitor for firmware errors
2. Verify server URL is correct
3. Check network connectivity

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
4. Device auto-refreshes

---

## Support

| Resource | Link |
|----------|------|
| Documentation | [docs/](docs/) |
| Issues | GitLab Issues |
| Development Rules | [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) |

---

## Next Steps

- [INSTALL.md](INSTALL.md) — Detailed installation guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture
- [firmware/README.md](firmware/README.md) — Firmware documentation

---

© 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual License
