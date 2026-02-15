<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™: Complete Beginner's Guide

**A step-by-step guide for first-time users with no technical background.**

**Version:** 3.0
**Last Updated:** 2026-02-06
**System Version:** v4.2.0 (CCDashDesignV15.0)
**License:** AGPL-3.0 Dual License

---

## What You'll Build

By the end of this guide, you'll have a smart e-ink display showing:

- When to leave home
- Your complete journey (walk, transit, walk)
- Whether you have time for coffee
- Current weather
- Any delays or disruptions

The display updates automatically every 60 seconds with real-time information.

---

## What You'll Need

### Required

| Item | Description | Cost |
|------|-------------|------|
| **CC E-Ink Display** | E-ink display device | ~$150 AUD |
| **Computer** | For initial setup | — |
| **WiFi Network** | 2.4GHz (not 5GHz) | — |
| **Vercel Account** | Free hosting service | Free |

### Optional (Recommended)

| Item | Description | Benefit |
|------|-------------|---------|
| **Transport Victoria API Key** | Real-time data | Live departures |
| **Google Places API Key** | Address autocomplete | Easier setup |

---

## Part 1: Create Your Server (10 minutes)

Your Commute Compute server runs in the cloud for free on Vercel.

### Step 1.1: Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up**
3. Choose **Continue with GitLab** (recommended)
4. If you don't have GitLab, create one at [gitlab.com](https://gitlab.com)

### Step 1.2: Deploy Commute Compute

1. Go to the Commute Compute repository
2. Click the **Deploy to Vercel** button
3. Click **Create** when prompted
4. Wait 2-3 minutes for deployment

**Success!** You'll see a green checkmark and a URL like `your-project.vercel.app`

### Step 1.3: Create Database

Your server needs a database to remember your settings.

1. In Vercel, click your project name
2. Click the **Integrations** tab
3. Click **Browse Marketplace**
4. Search for **Redis** and select the Upstash provider
5. Click **Install** and select the **Free** plan
6. Name: `commute-compute-redis`, Region: **Sydney, Australia**
7. Click **Create**

### Step 1.4: Verify Database Connection

Redis installed via the Marketplace is automatically connected to your project.

1. Go to your project **Settings** → **Environment Variables**
2. Confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are listed
3. Go to **Deployments** tab
4. Click the **⋮** menu → **Redeploy** to pick up the new environment variables

---

## Part 2: Configure Your Journey (5 minutes)

Now tell the system about your commute.

### Step 2.1: Open Setup Wizard

1. Open your browser
2. Go to: `https://YOUR-PROJECT.vercel.app/setup-wizard.html`
   - Replace `YOUR-PROJECT` with your actual Vercel project name

### Step 2.2: Enter Your Home Address

1. Type your home address in the search box
2. Include suburb and state (e.g., "123 Example St, Brunswick VIC 3056")
3. Click on the correct suggestion
4. Verify the pin on the map
5. Click **Next**

### Step 2.3: Enter Your Work Address

1. Type your work/destination address
2. Select from suggestions
3. Verify on map
4. Click **Next**

### Step 2.4: Add a Cafe (Optional)

If you want coffee recommendations:

1. Type your favorite cafe name and address
2. Select from suggestions
3. Click **Next**

Or click **Skip** to continue without coffee stops.

### Step 2.5: API Keys (Optional)

**Transport Victoria API Key:**

If you have one, enter it here for live departure data.

Don't have one? That's OK! Click **Skip** — the system will use timetable data.

**Google Places Key:**

If you entered one earlier, address search will be easier.

Click **Next** to continue.

### Step 2.6: Select Your Device

Choose **CC E-Ink OG** for the standard CC E-Ink display.

Click **Complete Setup**

### Step 2.7: Note Your Pairing Code

The wizard shows a **6-character code** (like `ABC123`).

**Write this down!** You'll need it for your device.

---

## Part 3: Set Up Your Device (10 minutes)

### Step 3.1: Unbox Your CC E-Ink Display

1. Remove display from packaging
2. Connect USB-C cable to computer
3. Device screen may be blank — that's normal

### Step 3.2: Install Firmware Software

You need PlatformIO to install the firmware.

**On Mac:**
```bash
pip3 install platformio
```

**On Windows:**
1. Download [Python](https://python.org)
2. Open Command Prompt
3. Run: `pip install platformio`

### Step 3.3: Download Firmware

1. Download the Commute Compute code:
   - Go to the GitLab repository
   - Click **Code** → **Download ZIP**
   - Extract the ZIP file

2. Open Terminal (Mac) or Command Prompt (Windows)

3. Navigate to the firmware folder:
   ```bash
   cd Downloads/commute-compute-main/firmware
   ```

### Step 3.4: Flash Firmware

**On Mac:**
```bash
~/.platformio/penv/bin/pio run -e trmnl -t upload
```

**On Windows:**
```bash
pio run -e trmnl -t upload
```

Wait for "SUCCESS" message (about 30 seconds).

### Step 3.5: Connect Device to WiFi

1. Your CC E-Ink display shows a Bluetooth setup screen
2. On your phone, open Bluetooth settings
3. Look for device named `CC-XXXXXX`
4. Connect to it
5. When prompted, enter your WiFi:
   - Network name (SSID)
   - Password

### Step 3.6: Enter Pairing Code

1. Device now shows a 6-character pairing code
2. In your browser, open the Setup Wizard
3. Enter the code from your device
4. Click **Pair Device**

**Success!** Your device will show your personalized dashboard within 30 seconds.

---

## Part 4: Using Your Dashboard

### What You'll See

```
┌──────────────────────────────────────────────────────────────────┐
│  8:47am                                 GET A COFFEE     18°C   │
│  Monday, Feb 3                          ✓ SERVICES OK   Cloudy  │
├──────────────────────────────────────────────────────────────────┤
│  LEAVE IN 12 MIN                     ARRIVE 9:15am  28 MIN TOTAL│
├──────────────────────────────────────────────────────────────────┤
│  1  [Walk] Walk to tram stop                              4 MIN │
│  2  [Tram] Tram Route 8 to Station                       6 MIN │
│  3  [Train] Train to City                               12 MIN │
│  4  [Walk] Walk to destination                           5 MIN │
├──────────────────────────────────────────────────────────────────┤
│  DESTINATION: YOUR WORK ADDRESS                    ARRIVE 9:15am│
└──────────────────────────────────────────────────────────────────┘
```

### Understanding the Display

| Element | Meaning |
|---------|---------|
| **LEAVE IN X MIN** | When to walk out your door |
| **ARRIVE X:XX** | Expected arrival time |
| **X MIN TOTAL** | Total journey duration |
| **GET A COFFEE** | You have time for coffee! |
| **[WARNING] NO TIME** | Skip the coffee today |
| **● LIVE DATA** | Real-time departures |
| **○ TIMETABLE** | Using scheduled times |

### Display Updates

- **Every 60 seconds:** New departure times
- **Every 5 minutes:** Full screen refresh (clears ghosting)

---

## Part 5: Getting API Keys (Optional)

### Transport Victoria API Key

For live real-time departure data:

1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Click **Sign Up**
3. Create your account
4. Go to **My Account** → **API Keys**
5. Click **Request API Key**
6. Copy the key (looks like: `12345678-abcd-1234-abcd-123456789012`)
7. Enter in Setup Wizard or Admin Panel

### Google Places API Key

For better address autocomplete:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a Google Cloud account (free)
3. Create a new project
4. Go to **APIs & Services** → **Library**
5. Search for "Places API (New)"
6. Click **Enable**
7. Go to **Credentials** → **Create Credentials** → **API Key**
8. Copy the key
9. Enter in Setup Wizard

---

## Troubleshooting

### "Device won't connect to WiFi"

- Ensure you're using 2.4GHz WiFi (not 5GHz)
- Check password is correct
- Move device closer to router

### "Pairing code expired"

- Codes expire after 10 minutes
- Open Setup Wizard and generate a new code

### "Display shows wrong data"

- Wait 60 seconds for next refresh
- Check addresses in Admin Panel
- Verify server is working: visit `/api/status`

### "No departure times showing"

- Without API key, system uses timetable data
- Add Transport Victoria API key for live data
- Check your home address is near transit stops

### "Device won't flash"

- Hold BOOT button while pressing RESET
- Then run flash command again
- Ensure USB cable supports data (not charge-only)

---

## Getting Help

If you're stuck:

1. **Check the logs:** Open `/api/status` on your server
2. **Admin Panel:** Go to `/admin.html` to check settings
3. **Community:** Open an issue on GitLab for help

---

## What's Next?

- **Customize:** Edit addresses in Admin Panel
- **Add API keys:** For live departure data
- **Explore:** Check `/preview.html` for web preview
- **Learn more:** Read [SETUP_GUIDE.md](../../SETUP_GUIDE.md)

---

## Glossary

| Term | Meaning |
|------|---------|
| **Vercel** | Free cloud hosting service |
| **Redis** | Storage for your settings (via Vercel Marketplace) |
| **PlatformIO** | Software to program devices |
| **Firmware** | Software that runs on your device |
| **GTFS-RT** | Real-time transit data format |
| **BLE** | Bluetooth Low Energy |

---

© 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual License
