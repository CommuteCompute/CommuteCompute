<p align="center">
  <img src="assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Installation Guide

**Detailed technical installation instructions for Commute Compute System.**

**Version:** 2.0  
**Last Updated:** 2026-02-04  
**License:** AGPL-3.0 Dual License (see [LICENSE](LICENSE))

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Server Deployment](#server-deployment)
3. [Vercel KV Setup](#vercel-kv-setup)
4. [Firmware Installation](#firmware-installation)
5. [Device Provisioning](#device-provisioning)
6. [API Key Setup](#api-key-setup)
7. [Advanced Configuration](#advanced-configuration)
8. [Docker Deployment](#docker-deployment)
9. [Self-Hosting Options](#self-hosting-options)

---

## System Requirements

### Server

| Component | Requirement |
|-----------|-------------|
| Node.js | v18+ (v22 recommended) |
| Platform | Vercel (recommended), Docker, or Node.js host |
| Storage | Vercel KV (Redis-compatible) |
| Memory | 512MB minimum |

### TRMNL Device

| Component | Specification |
|-----------|---------------|
| Hardware | TRMNL OG or TRMNL Mini |
| MCU | ESP32-C3 |
| Display | 7.5" e-ink (800×480) or 4.2" (400×300) |
| Firmware | CC-FW-7.4.3 (custom) |

### Development

| Tool | Version |
|------|---------|
| PlatformIO | 6.1+ |
| Git | 2.0+ |
| npm | 10+ |

---

## Server Deployment

### Option 1: Vercel (Recommended)

Vercel provides the simplest deployment with automatic HTTPS and global CDN.

### Recommended (for enhanced features)
- [ ] **Google Places API Key** - **Highly recommended for accurate address finding during setup** (free tier: $200/month credit) - [Get it here](https://console.cloud.google.com/apis/library/places-backend.googleapis.com)
- [ ] **Transit Authority API Credentials** - See [Transit APIs section](#optional-transit-authority-apis)

---

## Step 1: Fork GitLab Repository

### 1.1 Fork the Repository

1. Go to the original repository: https://gitlab.com/angusbergman/commute-compute-system
2. Click the **Fork** button in the top-right corner
3. Select your personal account as the destination
4. Wait for the fork to complete (~30 seconds)

**Result**: You now have your own copy of the code at `https://gitlab.com/YOUR-USERNAME/commute-compute`

### 1.2 Clone Your Fork (Optional - for local development)

```bash
git clone https://gitlab.com/YOUR-USERNAME/commute-compute.git
cd commute-compute
npm install

# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

### Option 2: Local Development

```bash
# Clone repository
git clone https://gitlab.com/user/commute-compute.git
cd commute-compute

# Install dependencies
npm install

# Start development server
npm run dev

# Server runs at http://localhost:3000
```

---

## Vercel KV Setup

Vercel KV is **required** for persistent storage. The system stores:

- API keys
- User preferences
- Device pairing codes

### Create KV Database

1. **Open Vercel Dashboard**
   - Navigate to your project
   - Click **Storage** tab

**Important**: Free tier services sleep after 15 minutes of inactivity.

- **Cold Start**: Takes ~15 seconds to wake up on first request
- **Memory Limit**: 512 MB (Commute Compute uses ~200 MB)
- **Auto-Sleep**: After 15 minutes without requests
- **Best For**: Personal use, hobby projects

**Tip**: Keep the admin panel open in a browser tab to prevent sleep.

---

## Step 3: Deploy to Render

### 3.1 Create New Web Service

1. From your Render dashboard, click **New +**
2. Select **Web Service**
3. Click **Connect a repository**
4. If prompted, authorize Render to access your repositories
5. Find and select your forked repository: `YOUR-USERNAME/commute-compute`
6. Click **Connect**

### 3.2 Configure Build Settings

**Fill in the following**:

| Setting | Value |
|---------|-------|
| **Name** | `commute-compute` (or choose your own) |
| **Region** | Select closest to Australia (e.g., Singapore) |
| **Branch** | `main` |
| **Root Directory** | (leave blank) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

### 3.3 Select Free Tier Plan

1. Scroll down to **Instance Type**
2. Select **Free** ($0/month)
3. Click **Create Web Service**

**Deployment Started**: Render will now:
1. Clone your repository
2. Run `npm install` to install dependencies
3. Start the server with `node server.js`
4. Assign you a URL: `https://your-server-name.vercel.app`

**Wait Time**: ~5-10 minutes for first deploy

### 3.4 Verify Deployment

Once deployment completes:

1. Click the **URL** at the top of the page (looks like `https://your-server-name.vercel.app`)
2. You should see a redirect to `/admin`
3. The admin panel should load (may take 15s on first cold start)

**Success Indicator**: You see the admin panel with tabs: Setup & Journey, API Settings, Live Data, Configuration, System & Support

---

## Step 4: Configure Environment Variables (Recommended)

Environment variables provide **the most secure way** to store API keys on Render. While you can add API keys via the admin panel, **it's recommended to use Render environment variables** for production deployments.

### 4.1 Why Use Environment Variables?

**Best Practice**: Secrets stored server-side, never in code or JSON files
**Secure**: Not accessible via admin panel UI
**Persistent**: Survive redeployments and server restarts
**Priority**: Environment variables take precedence over admin panel settings

### 4.2 How to Add Environment Variables

1. In Render dashboard, go to your service
2. Click **Environment** in the left sidebar
3. Click **Add Environment Variable**
4. Enter the variable name and value
5. Click **Save Changes** (this will redeploy your service)

### 4.3 Required Environment Variables

**Production Mode** (always add this):

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Enables production optimizations |

### 4.4 Recommended: Google Places API (for accurate address finding)

**Why**: Significantly improves address geocoding accuracy during setup and journey planning.

| Variable | Value | How to Get |
|----------|-------|------------|
| `GOOGLE_PLACES_API_KEY` | `AIza...` | [Get free API key](https://console.cloud.google.com/apis/library/places-backend.googleapis.com) |

**Steps to Get Google Places API Key**:
1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable **Places API** and **Geocoding API**
4. Navigate to **Credentials** → **Create Credentials** → **API Key**
5. Copy your API key (starts with `AIza`)
6. **Important**: Enable billing (required even for free tier) - you get $200/month credit

**In Render Environment**:
```
Name:  GOOGLE_PLACES_API_KEY
Value: AIzaSyC_your_actual_api_key_here
```

### 4.5 Optional: Transit Authority APIs (for real-time departure data)

Add these **only if** you have API credentials for your local transit authority.

#### For Victoria (Transport for Victoria)

| Variable | Value | How to Get |
|----------|-------|------------|
| `ODATA_API_KEY` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | [Register here](https://opendata.transport.vic.gov.au/) |

**Format**: UUID format (e.g., `YOUR_API_KEY_HERE`)

**In Render Environment**:
```
Name:  ODATA_API_KEY
Value: YOUR_API_KEY_HERE
```

#### For Other States

**NSW**: `TRANSPORT_NSW_API_KEY`
**QLD**: `TRANSLINK_API_KEY`
**SA**: `ADELAIDE_METRO_API_KEY`
**WA**: `TRANSPERTH_API_KEY`

(Contact your local transit authority for API access)

### 4.6 Optional: Additional Geocoding (Mapbox)

**Why**: Provides additional geocoding fallback if Google Places unavailable.

| Variable | Value | How to Get |
|----------|-------|------------|
| `MAPBOX_ACCESS_TOKEN` | `pk.eyJ1...` | [Get free token](https://account.mapbox.com/) |

**Free Tier**: 100,000 requests/month

**In Render Environment**:
```
Name:  MAPBOX_ACCESS_TOKEN
Value: pk.eyJ1IjoibXl1c2VybmFtZSIsImEiOiJjbGV5...
```

### 4.7 Optional: Email Notifications (Feedback Form)

**Why**: Enables the feedback form in admin panel to send emails.

| Variable | Value | Notes |
|----------|-------|-------|
| `SMTP_HOST` | `smtp.gmail.com` | Your email provider's SMTP server |
| `SMTP_PORT` | `587` | Usually 587 for TLS |
| `SMTP_USER` | `your-email@gmail.com` | Your email address |
| `SMTP_PASS` | `your-app-password` | App-specific password (not your login password) |
| `SMTP_FROM` | `your-email@gmail.com` | From address |
| `SMTP_TO` | `your-email@gmail.com` | Where to send feedback |

**For Gmail**: Use [App Passwords](https://support.google.com/accounts/answer/185833), not your regular password.

### 4.8 Naming Convention Reference

**CRITICAL**: Use the exact variable names below. Incorrect names will not work.

| Service | Correct Variable Name | [NO] Wrong Names (Don't Use) |
|---------|----------------------|---------------------------|
| Google Places | `GOOGLE_PLACES_API_KEY` | ~~GOOGLE_API_KEY~~, ~~GOOGLE_PLACES_KEY~~ |
| Mapbox | `MAPBOX_ACCESS_TOKEN` | ~~MAPBOX_TOKEN~~, ~~MAPBOX_KEY~~ |
| Victoria Transit | `ODATA_API_KEY` | ~~PTV_API_KEY~~, ~~VICTORIA_API_KEY~~ |
| SMTP Host | `SMTP_HOST` | ~~EMAIL_HOST~~, ~~MAIL_HOST~~ |

### 4.9 When to Add API Keys

**Recommended Flow**:

1. **Before Setup**: Add `GOOGLE_PLACES_API_KEY` to Render environment variables
   - Ensures accurate address finding during setup
   - Improves journey planner success rate

2. **After Setup**: Add transit API keys for your state
   - Enables real-time departure data
   - System works with fallback data until then

3. **Anytime**: Add `MAPBOX_ACCESS_TOKEN` and SMTP credentials
   - Additional geocoding fallback
   - Email notifications for feedback

### 4.10 Verifying Environment Variables

After adding environment variables in Render:

1. Click **Save Changes** (service will redeploy)
2. Wait ~2-3 minutes for deployment
3. Go to **Admin Panel** → **API Settings**
4. Check **Data Sources** section
5. You should see: `Google Places API - Active` (if added)

**Example Verification**:
```
Data Sources:
✓ OpenStreetMap Nominatim (Free, always available)
✓ Google Places API (Active - via environment variable)
✓ Bureau of Meteorology Weather (Australia)
```

### 4.11 Environment Variables vs Admin Panel

**Question**: Should I add API keys in Render environment variables OR the admin panel?

**Answer**: **Use Render environment variables for production**

| Method | Security | Persistence | Priority | Recommendation |
|--------|----------|-------------|----------|----------------|
| **Render Environment** | High | Yes | Checked first | **RECOMMENDED** |
| **Admin Panel** | Medium | Yes (in JSON file) | Checked second | Development/Testing |

**Best Practice**:
- **Production**: Add API keys to Render environment variables
- **Local Development**: Use `.env` file
- **Admin Panel**: Use only for testing or temporary changes

**Click Save Changes** to restart with new variables.

**Note**: The system works completely WITHOUT environment variables using fallback data (free geocoding + GTFS timetables).

---

## Step 5: Set Up Your Journey

### 5.1 Open Admin Panel

1. Go to your Render URL: `https://your-server-name.vercel.app/admin`
2. Click on the **Setup & Journey** tab (should be selected by default)

### 5.2 Enter Your Journey Details

**Required Fields**:

| Field | Example | Notes |
|-------|---------|-------|
| **Home Address** | `123 Example St, Melbourne VIC 3000` | Start typing, select from dropdown |
| **Work Address** | `456 Collins St, Melbourne VIC 3000` | Start typing, select from dropdown |
| **Arrival Time** | `09:00` | When you need to arrive at work |

**Optional Fields**:

| Field | Example | Notes |
|-------|---------|-------|
| **Favorite Cafe** | `Seven Seeds Coffee Roasters` | For coffee stop recommendations |
| **Include Coffee Time** | Checked | Adds 5 minutes for coffee |
| **Google Places API Key** | `AIza...` | Enhances address search (optional) |

### 5.3 Start Journey Planning

1. Click **Start Journey Planning**
2. Wait for processing (30-60 seconds)
3. You'll see progress indicators:
   - Validating addresses...
   - Geocoding home address...
   - Finding nearby transit stops...
   - Configuring journey...

**Success**: You'll see a confirmation with:
- Detected state (e.g., VIC, NSW, QLD)
- Home and work stop names
- Transit mode (train/tram/bus)
- Number of stops found

### 5.4 What Happens Next

The system automatically:
1. **Detects your state** from your home address
2. **Finds nearby transit stops** using GTFS data
3. **Selects best transit mode** (train/tram/bus/ferry based on location)
4. **Calculates journey** using fallback timetables
5. **Starts auto-updates** (every 2 minutes)

**Data Source**: Initially uses **fallback timetable data** (works without API keys)

---

## Step 6: Connect TRMNL Device

### 6.1 Get Your Webhook URL

Your TRMNL webhook URL is:

```
https://your-server-name.vercel.app/api/screen
```

Replace `your-service` with your actual Render service name.

**Example**: `https://your-server-name.vercel.app/api/screen`

### 6.2 Flash Custom Firmware

**IMPORTANT**: TRMNL devices require CCFirm™ custom firmware to connect to YOUR server (not the TRMNL cloud).

1. Follow the firmware flashing instructions in `firmware/README.md`
2. Build and flash CCFirm using PlatformIO:
   ```bash
   cd firmware
   pio run -e trmnl -t upload
   ```

3. **Connect to Project**
   - Click **Connect to Project**
   - Select your Commute Compute project

4. **Verify Connection**
   ```bash
   curl https://your-project.vercel.app/api/kv-status
   ```
   
   Expected response:
   ```json
   {
     "KV_REST_API_URL": "set",
     "KV_REST_API_TOKEN": "set",
     "connected": true
   }
   ```

### KV Storage Keys

| Key Pattern | Description | TTL |
|-------------|-------------|-----|
| `cc:api:transit_key` | Transport Victoria API key | Permanent |
| `cc:api:google_key` | Google Places API key | Permanent |
| `cc:preferences` | User preferences | Permanent |
| `pair:{CODE}` | Device pairing code | 10 minutes |

---

## Firmware Installation

### Prerequisites

Install PlatformIO:

```bash
# Install PlatformIO Core
pip install platformio

# Or via installer
curl -fsSL https://platformio.org/get-cli-installer | bash
```

### Build Firmware

```bash
# Navigate to firmware directory
cd firmware

# Build for TRMNL OG
pio run -e trmnl

# Build for TRMNL Mini
pio run -e trmnl-mini
```

### Flash Firmware

#### macOS

```bash
# Find USB port
ls /dev/cu.usb*

# Flash firmware
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem14101
```

#### Linux

```bash
# Find USB port
ls /dev/ttyUSB* /dev/ttyACM*

# Flash firmware
pio run -e trmnl -t upload --upload-port /dev/ttyUSB0
```

#### Windows

```bash
# Find COM port in Device Manager

# Flash firmware
pio run -e trmnl -t upload --upload-port COM3
```

### Verify Flash

```bash
# Monitor serial output
pio device monitor -b 115200

# Expected output:
# === Commute Compute v7.2.1 ===
# BLE Provisioning Firmware
# [Display] Initialization complete
```

---

## Device Provisioning

Commute Compute uses **hybrid provisioning** (BLE + Pairing Code):

### Phase 1: BLE WiFi Provisioning

1. **Device boots** and shows BLE setup screen
2. **Connect via Bluetooth**:
   - Device advertises as `CC-XXXXXX`
   - Use phone Bluetooth settings or companion app
3. **Send WiFi credentials**:
   - SSID (network name)
   - Password
4. **Device connects** to WiFi network

### Phase 2: Pairing Code Configuration

1. **Device displays** 6-character pairing code
2. **Open Setup Wizard**: `https://your-project.vercel.app/setup-wizard.html`
3. **Enter pairing code** in wizard
4. **Device receives** webhook URL with configuration
5. **Dashboard displays** your personalized journey

### Re-Provisioning Scenarios

| Scenario | Action |
|----------|--------|
| Change WiFi | Factory reset → Re-provision (Phase 1+2) |
| Change server | New pairing code only (Phase 2) |
| Change preferences | Update in Admin Panel |

---

## API Key Setup

### Transport Victoria OpenData API

**Status:** Optional (system works without it)

1. **Create Account**
   - Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
   - Register for an account

2. **Request API Key**
   - Navigate to API Keys section
   - Request a new key
   - Key format: UUID (e.g., `12345678-abcd-1234-abcd-123456789012`)

3. **Enter in Setup Wizard**
   - Step 4 of Setup Wizard
   - Or Admin Panel → API Settings

### Google Places API (Optional)

**Purpose:** Address autocomplete in Setup Wizard

1. **Create Project**
   - Go to [console.cloud.google.com](https://console.cloud.google.com/)
   - Create new project

2. **Enable API**
   - Navigate to APIs & Services → Library
   - Enable **Places API (New)**

3. **Create Credentials**
   - APIs & Services → Credentials
   - Create API Key
   - Restrict to Places API

4. **Enter in Setup Wizard**
   - Step 1 of Setup Wizard
   - Enables address autocomplete

---

## Advanced Configuration

### Environment Variables

**Note:** Environment variables are **optional**. The zero-config architecture means all settings can be entered via the Setup Wizard.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `TZ` | Timezone | `Australia/Melbourne` |

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Device webhook | 60 requests/hour |
| API endpoints | 100 requests/minute |

### Refresh Timing

| Type | Interval | Purpose |
|------|----------|---------|
| Partial refresh | 60 seconds | Update journey data |
| Full refresh | 5 minutes | Clear ghosting |

---

## Docker Deployment

### Build Image

```bash
docker build -t commute-compute .
```

### Run Container

```bash
docker run -d \
  -p 3000:3000 \
  --name commute-compute \
  commute-compute
```

### Docker Compose

```yaml
version: '3.8'
services:
  commute-compute:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TZ=Australia/Melbourne
    restart: unless-stopped
```

```bash
docker-compose up -d
```

---

## Self-Hosting Options

### Render.com

1. Create new Web Service
2. Connect GitLab repository
3. Build command: `npm install`
4. Start command: `npm start`
5. Add Redis instance for KV storage

### Railway

1. Create new project
2. Deploy from GitLab
3. Add Redis plugin
4. Configure environment variables

### VPS (Ubuntu)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone https://gitlab.com/user/commute-compute.git
cd commute-compute

# Install dependencies
npm install

# Install PM2 for process management
npm install -g pm2

# Start server
pm2 start npm --name "commute-compute" -- start

# Setup nginx reverse proxy
sudo apt install nginx
# Configure /etc/nginx/sites-available/commute-compute
```

---

## Verification Checklist

After installation, verify each component:

- [ ] Server accessible at your domain
- [ ] `/api/status` returns `"status": "ok"`
- [ ] `/api/kv-status` shows `"connected": true`
- [ ] Setup Wizard loads correctly
- [ ] Firmware flashes successfully
- [ ] Device connects to WiFi
- [ ] Pairing code appears on device
- [ ] Dashboard displays on device

---

## Troubleshooting

### Server Issues

| Issue | Solution |
|-------|----------|
| 500 errors | Check Vercel function logs |
| KV not connected | Verify KV database is linked |
| Slow responses | Check API rate limits |

### Firmware Issues

| Issue | Solution |
|-------|----------|
| Won't flash | Hold BOOT button while pressing RESET |
| No serial output | Add USB CDC flags to platformio.ini |
| Display garbage | Ensure bb_epaper library v2.0.6+ |

### Device Issues

| Issue | Solution |
|-------|----------|
| BLE not advertising | Factory reset device |
| Pairing fails | Generate new code (10-min expiry) |
| No display update | Check server URL in config |

---

## Support Resources

| Resource | Description |
|----------|-------------|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Quick setup guide |
| [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) | Development standards |
| [firmware/README.md](firmware/README.md) | Firmware documentation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |

---

© 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual License
