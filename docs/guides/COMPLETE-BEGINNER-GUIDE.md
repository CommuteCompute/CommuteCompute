<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™: Complete Beginner's Guide

**A step-by-step guide for first-time users with no technical background.**

**Version:** 3.1
**Last Updated:** 2026-02-16
**System Version:** v4.2.0 (CCDashDesignV15.0)
**Licence:** AGPL-3.0 Dual Licence

> For detailed technical setup, see [SETUP_GUIDE.md](../../SETUP_GUIDE.md).

---

> **Key Terms:** Before we start, here are a few terms you will see throughout this guide:
> - **TRMNL display** — The third-party e-ink display hardware that sits on your desk or wall (manufactured by TRMNL; Commute Compute runs custom firmware on it)
> - **Redis** — The database that stores your settings (set up automatically via Vercel)
> - **GTFS-RT** — The live departure data feed from Transport Victoria that powers real-time countdown timers
> - **Vercel** — The free cloud platform that hosts your Commute Compute server
> - **Setup Wizard** — The web page where you configure your addresses and preferences
> - **CCFirm™** — The custom firmware (device software) that runs on your TRMNL display
> - **BLE** — Bluetooth Low Energy, used to send WiFi credentials and your server URL to your display during initial setup
>
> A full glossary is available at the end of this guide.

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

## Compatible Display Hardware

Commute Compute™ is compatible with the following e-ink displays:

- **TRMNL OG** (800x480, 7.5" e-ink) — A purpose-built e-ink display available from the [TRMNL Shop](https://shop.trmnl.com). The hardware is manufactured by TRMNL; Commute Compute™ runs custom CCFirm™ firmware on it. Commute Compute is not affiliated with or endorsed by TRMNL.
- **Jailbroken Kindle** — Various Kindle models (Paperwhite 3/4/5, Kindle 4) can be repurposed as Commute Compute displays. Requires jailbreaking the device.

For detailed specifications, setup instructions, and a full list of supported devices, see the [Device Compatibility Guide](../hardware/DEVICE-COMPATIBILITY.md).

---

## What You'll Need

Before starting, gather these items and information:

### Required Hardware

| Item | Description | Cost |
|------|-------------|------|
| **TRMNL display** | E-ink display device (e.g. TRMNL OG from the [TRMNL Shop](https://shop.trmnl.com)) | ~$150 AUD |
| **Computer** | Desktop or laptop for initial setup (not iPhone/iPad) | — |
| **USB Cable** | USB-C cable for connecting display to computer | Usually included |
| **WiFi Network** | 2.4 GHz network (5 GHz not supported) | — |

### Required Online Accounts

| Item | Description | Cost |
|------|-------------|------|
| **Vercel Account** | Free cloud hosting service for your server | Free |
| **GitLab Account** | Code repository account (connects to Vercel) | Free |

### Required for Live Departure Data

| Item | Description | Benefit | Approval Time |
|------|-------------|---------|---------------|
| **Transport Victoria API Key** | Required for live departure data | Powers the core feature -- live departure countdowns | Up to 48 hours |

[IMPORTANT] Register for your Transport Victoria API key first at [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/). Approval can take up to 48 hours, so apply early.

### Optional (Recommended)

| Item | Description | Benefit |
|------|-------------|---------|
| **Google Places API Key** | Address autocomplete in Setup Wizard | Makes address entry much easier |

### Information You'll Need

Before starting setup, have these details ready:
- **WiFi network name (SSID)** -- must be 2.4 GHz
- **WiFi password** -- case-sensitive
- **Home address** -- full street address including suburb and postcode
- **Work address** -- full street address including suburb and postcode
- **Target arrival time** -- when you need to arrive at work (e.g., 9:00 AM)

---

**Total time:** Approximately 60-90 minutes for first-time setup:
- Active work: 15-20 minutes
- Waiting for deployments: 10-15 minutes
- First device connection: 2-3 minutes
- API key approval wait time: Up to 48 hours (if not already registered)

---

## Part 1: Create Your Server

[TIME] This entire part takes approximately 10-15 minutes.

Your Commute Compute server runs in the cloud for free on Vercel. "The cloud" simply means the server runs on someone else's computer (Vercel's) instead of yours.

### Step 1.1: Create Vercel Account

[TIME] Approximately 2-3 minutes.

[NOTE] Vercel is a free cloud hosting platform. You will not need to enter payment information for the free tier.

1. Go to [vercel.com](https://vercel.com) in your web browser
2. Click **Sign Up** (top-right corner)
3. Choose **Continue with GitLab** (recommended)
4. If you don't have a GitLab account, click "Create one" and follow the registration steps at [gitlab.com](https://gitlab.com)

**What is GitLab?** GitLab is a code hosting platform. Vercel needs to connect to it to access the Commute Compute code.

### Step 1.2: Deploy Commute Compute

[TIME] Approximately 3-5 minutes (mostly automated waiting).

[NOTE] "Deploy" means to copy the Commute Compute code to Vercel's servers and start it running.

1. Go to the Commute Compute repository on GitLab
2. Click the **Deploy to Vercel** button in the README
3. Click **Create** when prompted by Vercel
4. Wait while Vercel builds and deploys your server (takes 2-3 minutes)

**Success!** You'll see a green checkmark and a deployment URL like `your-project-name.vercel.app`

[IMPORTANT] Write down this URL -- you'll use it throughout setup. This is your personal Commute Compute server address.

### Step 1.3: Create Database

[TIME] Approximately 4-6 minutes.

Your server needs a database to store your settings (addresses, API keys, preferences). We'll use Redis, a free database service.

**What is Redis?** Redis is a storage system that remembers your configuration even when the server restarts.

1. In Vercel dashboard, click your project name (e.g., "commute-compute")
2. Click the **Integrations** tab in the navigation menu
3. Click **Browse Marketplace** button
4. In the search box, type **Redis** and press Enter
5. Select the **Upstash** provider (the official Redis provider for Vercel)
6. Click **Install** button
7. Select the **Free** plan (256 MB storage -- more than sufficient)
8. Configure the database:
   - **Name:** `commute-compute-redis`
   - **Region:** Select **Sydney, Australia** (closest to Victoria for best speed)
9. Click **Create** and wait for provisioning (takes 30-60 seconds)

### Step 1.4: Connect Database to Your Project

[TIME] Approximately 2-3 minutes.

Redis installed via the Marketplace needs to be linked to your Commute Compute project.

1. After database creation, you'll see a **Projects** tab
2. Click **Connect Project**
3. Select your Commute Compute project from the list
4. Click **Connect**

**What just happened?** Vercel automatically added two "environment variables" (configuration settings) to your project so it knows how to access the database.

### Step 1.5: Restart Your Server

[TIME] Approximately 2 minutes.

Your server needs to restart to recognise the new database connection.

1. Go to your project **Deployments** tab
2. Find the most recent deployment (top of the list)
3. Click the **...** menu (three dots) on the right side
4. Click **Redeploy**
5. Confirm by clicking **Redeploy** again
6. Wait for deployment to complete (shows green checkmark when done)

### Step 1.6: Verify Database Connection

[TIME] Less than 1 minute.

Let's confirm everything is working correctly.

1. Open a new browser tab
2. Go to: `https://YOUR-PROJECT-NAME.vercel.app/api/kv-status`
   (Replace `YOUR-PROJECT-NAME` with your actual project name)
3. You should see text that includes `"connected": true`

**Success!** Your server and database are now connected and running.

---

## Part 2: Configure Your Journey

[TIME] This part takes approximately 10-15 minutes (plus API key registration if needed).

Now you'll tell the system about your commute: where you live, where you work, and when you need to arrive.

### Step 2.1: Open Setup Wizard

[TIME] Less than 1 minute.

1. Open your web browser (any browser works: Chrome, Firefox, Safari, Edge)
2. Go to: `https://YOUR-PROJECT-NAME.vercel.app/setup-wizard.html`
   - Replace `YOUR-PROJECT-NAME` with your actual Vercel project name
   - Example: `https://my-commute.vercel.app/setup-wizard.html`

**What is the Setup Wizard?** It's a web form that walks you through configuring your journey settings step-by-step.

[IMPORTANT] Your admin authentication token will be shown once during setup. Write it down or save it securely -- you'll need it to access the Admin Panel later.

### Step 2.2: Enter Your Home Address

[TIME] Approximately 1-2 minutes.

1. In the "Home Address" field, type your complete home address
2. Include street number, street name, suburb, state, and postcode
3. **Example:** "123 Example Street, Brunswick VIC 3056"
4. If you added a Google Places API key earlier, suggestions will appear as you type -- click the correct one
5. Verify the red pin on the map shows your correct location
6. Click **Next** to continue

[TIP] Be as specific as possible. "123 Smith St" is better than just "Smith St".

### Step 2.3: Enter Your Work Address

[TIME] Approximately 1-2 minutes.

1. In the "Work Address" field, type your destination address
2. Include full details: street number, street name, suburb, state, postcode
3. Select from autocomplete suggestions (if Google Places API enabled)
4. Verify the location on the map
5. Click **Next** to continue

### Step 2.4: Add a Cafe (Optional)

[TIME] Approximately 1 minute, or skip entirely.

If you want CoffeeDecision recommendations (whether you have time for coffee before work):

1. Type your favourite cafe's name and address
2. Select from autocomplete suggestions
3. Verify location on map
4. Click **Next**

**Or skip this step:** Click **Skip** if you don't want coffee recommendations. You can always add this later via the Admin Panel.

### Step 2.5: API Keys

[TIME] 2-3 minutes if you already have keys; up to 48 hours if registering for Transport Victoria key.

**Transport Victoria API Key (Required for live departure data):**

This key powers the live real-time departure countdowns, which is the core feature of Commute Compute™. Without this key, transit legs (trams, trains, buses) will not appear on your dashboard.

**If you already have a key:**
1. Paste the key into the "Transport Victoria API Key" field
2. Click **Next**

**If you don't have a key yet:**
1. Click the link to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Create an account and request an API key
3. Wait for approval (can take up to 48 hours)
4. Come back to this step or add the key later via Admin Panel
5. Click **Skip** for now to continue setup

[NOTE] You can complete setup without this key, but your dashboard won't show live departure times until you add it.

**Google Places Key (Optional):**

This makes address entry easier with autocomplete suggestions.

**If you have a key:**
1. Paste it into the "Google Places API Key" field
2. You should have already noticed autocomplete working in previous address steps

**If you don't have a key:**
- Click **Skip** -- you can add it later if needed

### Step 2.6: Journey Preferences

[TIME] Less than 1 minute.

1. **Target arrival time:** Enter the time you need to arrive at work (e.g., 9:00 AM)
   - The system uses this to calculate when you should leave home
2. **CoffeeDecision:** Enable if you want coffee stop recommendations
   - The system will tell you if you have time for coffee before work

Click **Next** to continue.

### Step 2.7: Select Your Device

[TIME] Less than 1 minute.

Choose your display device type:
- **TRMNL OG** -- Select this for the standard 800x480 TRMNL display
- **TRMNL Mini** -- For smaller 400x300 displays
- **Kindle** -- For jailbroken Kindle devices

Click **Complete Setup** to finish configuration.

### Step 2.8: Save Your Admin Token

[TIME] Less than 1 minute.

The wizard now shows your admin authentication token:

1. **Admin Token:** A longer authentication code
   - Save this securely -- you'll need it to access the Admin Panel later
   - This token does not expire

[IMPORTANT] Write this down before closing the page. The admin token is shown only once.

**Next:** Proceed to Part 3 to set up your physical display device.

---

## Part 3: Set Up Your Device

[TIME] This part takes approximately 15-20 minutes total.

### Step 3.1: Unbox Your TRMNL Display

[TIME] Approximately 1 minute.

1. Remove the display from packaging
2. Connect USB-C cable between display and computer
3. The device screen may be blank or show shipping/test content -- this is normal

[NOTE] Keep the USB cable connected throughout the flashing process (Step 3.2).

### Step 3.2: Flash Firmware to Your Device

[TIME] Approximately 5-7 minutes including connection time.

You have two options to flash CCFirm™ firmware to your TRMNL display. The browser flasher is the easiest method and requires no software installation.

**What is flashing?** "Flashing" means installing the Commute Compute firmware (device software) onto your display's memory chip. This is a one-time process.

### Option A: Browser Flasher (Recommended -- No Software Install Required)

[TIME] Approximately 5 minutes.

The easiest way to flash your TRMNL display is using the built-in browser flasher.

**Requirements:**
- Chrome or Edge desktop browser (Safari/Firefox not supported for Web Serial)
- USB connection from display to computer
- Desktop or laptop computer (not iPhone/iPad -- they don't support Web Serial)

**Steps:**

1. Ensure display is connected via USB to your computer
2. Open Chrome or Edge browser
3. Go to: `https://YOUR-PROJECT-NAME.vercel.app/flasher/`
   - Replace `YOUR-PROJECT-NAME` with your actual Vercel project name
4. Click **Connect** button
5. A pop-up appears showing available USB devices -- select your TRMNL display
6. Click **Flash** button
7. Wait for completion (takes approximately 2 minutes)
8. You'll see "Flash Complete!" when done

[IMPORTANT] Do not disconnect USB cable during flashing. Wait for "Flash Complete!" message.

[NOTE] If you see "No compatible devices found", try a different USB cable or USB port. Some cables are charge-only and don't support data transfer.

### Option B: PlatformIO CLI (Advanced -- For Technical Users)

[TIME] Approximately 10-15 minutes including software installation.

If you prefer command-line tools or the browser flasher doesn't work, you can use PlatformIO.

**Step 1: Install PlatformIO**

**On macOS:**
```bash
# Open Terminal (Applications > Utilities > Terminal)
pip3 install platformio
```

**On Windows:**
1. Download and install [Python](https://python.org) if not already installed
2. Open Command Prompt (search "cmd" in Start menu)
3. Run: `pip install platformio`

**Step 2: Download Firmware Code**

1. Go to the Commute Compute GitLab repository in your browser
2. Click **Code** dropdown button > **Download ZIP**
3. Extract the ZIP file to your Downloads folder
4. Open Terminal (macOS) or Command Prompt (Windows)
5. Navigate to the firmware folder:
   ```bash
   cd Downloads/commute-compute-main/firmware
   ```

**Step 3: Flash Firmware to Device**

**On macOS:**
```bash
~/.platformio/penv/bin/pio run -e trmnl -t upload
```

**On Windows:**
```bash
pio run -e trmnl -t upload
```

Wait for "SUCCESS" message (takes approximately 30-60 seconds).

### Step 3.3: Connect Device to WiFi and Server

[TIME] Approximately 2-3 minutes.

[NOTE] Have your WiFi network name (SSID) and password ready. Your network must be 2.4 GHz -- the display does not support 5 GHz networks.

**What you'll see:** After flashing completes, your TRMNL display reboots and shows a Bluetooth setup screen with device name `CC-XXXXXX`.

**What is BLE provisioning?** During this step, the Setup Wizard sends three things to your device over Bluetooth: your WiFi network name, your WiFi password, and your server URL (so the device knows where to fetch dashboard data). This means no manual server configuration is needed.

**Steps:**

1. Your TRMNL display shows "Ready for WiFi setup via Bluetooth" or similar message
2. On your computer, open **Chrome or Edge** browser (Safari and Firefox do not support Web Bluetooth; iPhone does not support Web Bluetooth -- use a desktop or laptop computer)
3. Go to your Setup Wizard at `https://YOUR-PROJECT-NAME.vercel.app/setup-wizard.html`
4. Click **Connect to Device** or **WiFi Setup**
5. Browser will scan for nearby Bluetooth devices
6. Select device named `CC-XXXXXX` from the list
7. When prompted, enter your WiFi credentials:
   - **Network name (SSID):** Your WiFi network name (e.g., "HomeWiFi")
   - **Password:** Your WiFi password (case-sensitive)
8. Click **Submit** -- the Setup Wizard automatically sends your WiFi credentials **and** your server URL to the device via Bluetooth
9. Display connects to WiFi and immediately begins fetching your dashboard (takes 30-60 seconds)

The Setup Wizard automatically works out your server URL from its own web address (e.g., `https://your-project-name.vercel.app/api/screen`). You do not need to enter or configure it manually.

[TIP] If WiFi scanning does not show your network, ensure your router's 2.4 GHz band is enabled. Some dual-band routers disable 2.4 GHz when only 5 GHz is active.

[TIP] If selecting a scanned network does not populate the SSID field in the browser, try typing your network name manually instead.

**What you'll see next:** Display shows "Connecting to WiFi..." followed by "WiFi connected!" and then begins fetching your dashboard.

### Step 3.4: Pairing Code (Optional -- Most Devices Skip This)

[TIME] Most devices skip this step entirely and go straight to showing the dashboard. If needed, approximately 1-2 minutes.

Your device may display a 6-character pairing code. If it does, enter it in the Setup Wizard. If the device goes straight to showing your commute dashboard, the pairing code was not needed.

**What is the pairing code?** It is a fallback mechanism that activates only if the server URL could not be delivered via Bluetooth during the WiFi setup step. Most devices receive the server URL successfully via BLE and skip this step entirely.

**If your device displays a pairing code:**

1. Note the 6-character code shown on your display (like `ABC123`)
2. In your browser, go to the Setup Wizard or Admin Panel
3. Find the "Device Pairing" or "Enter Pairing Code" section
4. Type the 6-character code shown on your display
5. Click **Pair Device** button

[NOTE] Pairing codes expire after 10 minutes. If your code expires, the display will generate a new one automatically.

### Step 3.5: Wait for First Dashboard Load

[TIME] Approximately 2-3 minutes.

After WiFi provisioning succeeds (or after entering a pairing code, if one was displayed):

1. Display begins fetching dashboard data from your server
2. Screen may appear blank during initial fetch -- this is normal
3. First dashboard image appears after 2-3 minutes

[IMPORTANT] Do not power off or reset the display during initial connection. The first load takes longer than subsequent refreshes.

**Success!** Your device will show your personalised Commute Compute™ dashboard with:
- Current time and date
- When to leave home
- Journey legs (walk, tram/train, walk)
- Live departure countdowns (if Transport Victoria API key configured)
- Weather and service status
- CoffeeDecision recommendation (if enabled)

---

## Part 4: Using Your Dashboard

### What You'll See

```
+------------------------------------------------------------------+
|  8:47am                                 GET A COFFEE     18C      |
|  Monday, Feb 3                          SERVICES OK      Cloudy   |
+------------------------------------------------------------------+
|  LEAVE IN 12 MIN                     ARRIVE 9:15am  28 MIN TOTAL |
+------------------------------------------------------------------+
|  1  [Walk] Walk to tram stop                              4 MIN  |
|  2  [Tram] Tram Route 8 to Station                        6 MIN  |
|  3  [Train] Train to City                                12 MIN  |
|  4  [Walk] Walk to destination                            5 MIN  |
+------------------------------------------------------------------+
|  DESTINATION: YOUR WORK ADDRESS                    ARRIVE 9:15am |
+------------------------------------------------------------------+
```

### Understanding the Display

| Element | Meaning |
|---------|---------|
| **LEAVE IN X MIN** | When to walk out your door |
| **ARRIVE X:XX** | Expected arrival time |
| **X MIN TOTAL** | Total journey duration |
| **GET A COFFEE** | You have time for coffee! |
| **[WARNING] NO TIME** | Skip the coffee today |
| **LIVE DATA** | Real-time departures (requires Transport Victoria API key) |

### Display Updates

- **Every 60 seconds:** New departure times
- **Every 5 minutes:** Full screen refresh (clears ghosting)

---

## Part 5: Getting API Keys

### Transport Victoria API Key

For live real-time departure data (powered by GTFS-RT, the live departure data feed):

1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Click **Sign Up**
3. Create your account
4. Go to **My Account** > **API Keys**
5. Click **Request API Key**
6. Copy the key (looks like: `12345678-abcd-1234-abcd-123456789012`)
7. Enter in Setup Wizard or Admin Panel

### Google Places API Key

For better address autocomplete:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create a Google Cloud account (free)
3. Create a new project
4. Go to **APIs & Services** > **Library**
5. Search for "Places API (New)"
6. Click **Enable**
7. Go to **Credentials** > **Create Credentials** > **API Key**
8. Copy the key
9. Enter in Setup Wizard

---

## Troubleshooting

### "Display is blank after flashing"

- This is normal. After flashing, allow 2–3 minutes for the display to connect to WiFi and fetch its first dashboard image.
- The first load may take longer than subsequent refreshes. Do not power off or reset during this time.

### "Display won't connect to WiFi"

- Ensure your router broadcasts on 2.4 GHz. The ESP32-C3 chip in the TRMNL display does not support 5 GHz networks.
- If WiFi scanning does not show your network, check that your router's 2.4 GHz band is enabled (some routers disable it when a 5 GHz band is active).
- If selecting a scanned network does not populate the SSID field, try typing the network name manually.
- Check the password is correct.
- Move the display closer to your router during initial setup.

### "Pairing code expired"

[NOTE] The pairing code is an optional fallback. Most devices receive their server URL via BLE during WiFi setup and do not display a pairing code at all.

- Codes expire after 10 minutes
- Open Setup Wizard and generate a new code

### "Display shows wrong data"

- Wait 60 seconds for next refresh
- Check addresses in Admin Panel
- Verify server is working: visit `/api/status`

### "No departure times showing"

- A Transport Victoria API key is required for live departure data — without it, transit legs are not displayed
- Add your key via the Admin Panel at `/admin.html`
- Check your home address is near transit stops

### "Display won't flash"

- Hold BOOT button while pressing RESET
- Then run flash command again
- Ensure USB cable supports data (not charge-only)

---

## Getting Help

If you're stuck:

1. **Check the logs:** Open `/api/status` on your server
2. **Admin Panel:** Go to `/admin.html` to check settings
3. **Community:** Open an issue on GitLab for help
4. **Support:** See [SUPPORT.md](../../SUPPORT.md)

---

## What's Next?

- **Customise:** Edit addresses in Admin Panel
- **Add API keys:** For live departure data
- **Explore:** Check `/preview.html` for web preview
- **Technical details:** Read the [Setup Guide](../../SETUP_GUIDE.md) for advanced configuration options

---

## Glossary

| Term | Meaning |
|------|---------|
| **TRMNL display** | The third-party e-ink display hardware — the physical screen that shows your dashboard |
| **CCFirm™** | The custom firmware (device software) that runs on your TRMNL display |
| **Vercel** | Free cloud hosting service that runs your Commute Compute server |
| **Redis** | Database for your settings, installed via the Vercel Marketplace (powered by Upstash) |
| **PlatformIO** | Software tool used to program (flash) firmware onto devices |
| **Firmware** | Software that runs directly on your TRMNL display hardware |
| **GTFS-RT** | Real-time transit data feed (General Transit Feed Specification — Realtime) from Transport Victoria |
| **BLE** | Bluetooth Low Energy — the wireless protocol used to send WiFi credentials and server URL to your display during initial setup |
| **Setup Wizard** | The web page where you configure your addresses, API keys, and preferences |
| **Admin Panel** | The web page where you can view and change your settings after initial setup |

---

Copyright (c) 2026 Commute Compute™ System by Angus Bergman — AGPL-3.0 Dual Licence
