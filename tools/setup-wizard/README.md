<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Setup Wizard

Cross-platform tool for device firmware flashing and deployment setup.

**Copyright © 2026 Angus Bergman**
AGPL-3.0 Dual License

---

## Overview

The Commute Compute Setup Wizard guides you through the complete setup process:
1. [DONE] Device selection (TRMNL OG, Kindle variants)
2. [DONE] GitLab repository fork
3. [DONE] Render deployment
4. [DONE] Environment variable configuration
5. [DONE] Device firmware flashing
6. [DONE] Admin panel setup

## Supported Platforms

- **macOS**: Full support
- **Windows**: Full support (PowerShell/CMD via Node.js)
- **Linux**: Full support

## Supported Devices

| Device | Status | Resolution | Notes |
|--------|--------|------------|-------|
| **TRMNL OG** | [DONE] Fully Compatible | 800×480 | ESP32 chip, requires USB-C cable |
| **TRMNL X** | [CAUTION] Not Yet Compatible | 800×480 | Different hardware architecture |
| **Kindle PW 3/4** | [DONE] Compatible | 758×1024 | Requires jailbreak |
| **Kindle PW 5** | [DONE] Compatible | 1236×1648 | Requires jailbreak |
| **Kindle 4** | [DONE] Compatible | 600×800 | Requires jailbreak |

## Prerequisites

### Required

- **Node.js 18+** - https://nodejs.org/
- **npm** - Comes with Node.js
- **Git** - https://git-scm.com/

### Optional

- **GitLab CLI (glab)** - https://gitlab.com/gitlab-org/cli (simplifies GitLab operations)

## Installation

1. **Clone or download the repository**:
   ```bash
   git clone https://gitlab.com/angusbergman/commute-compute-system.git
   cd commute-compute
   ```

2. **Navigate to the setup wizard**:
   ```bash
   cd tools/setup-wizard
   ```

3. **Install dependencies** (if any):
   ```bash
   npm install
   ```

## Usage

### Run the Wizard

```bash
node setup-wizard.js
```

Or make it executable:

```bash
chmod +x setup-wizard.js
./setup-wizard.js
```

### What the Wizard Does

1. **Prerequisites Check**
   - Verifies Node.js, npm, Git are installed
   - Checks for optional tools (GitLab CLI)

2. **Device Selection**
   - Lists all supported devices
   - Shows compatibility status
   - Displays device specifications
   - Warns about incompatible devices (TRMNL X)

3. **GitLab Setup**
   - Checks if you've forked the repository
   - Provides fork instructions
   - Verifies git remote configuration

4. **Render Deployment**
   - Step-by-step deployment guide
   - Configuration instructions
   - Captures Render URL

5. **Environment Variables**
   - Lists all required and optional variables
   - Explains where to add them in Render
   - Provides API key registration links

6. **Device Firmware**
   - Device-specific flashing instructions
   - For TRMNL OG: ESP32 flashing guide
   - For Kindle: Jailbreak resources and steps
   - Safety warnings and prerequisites

7. **Admin Panel**
   - Opens admin panel in browser
   - Guides through final configuration
   - Setup wizard completion

## Example Run

```bash
$ node setup-wizard.js

╔═══════════════════════════════════════════════╗
║  Commute Compute Setup Wizard v3.0.0                ║
║  Copyright © 2026 Angus Bergman               ║
╚═══════════════════════════════════════════════╝

[INFO] Checking prerequisites...
  [DONE] Node.js: v20.10.0
  [DONE] npm: 10.2.3
  [DONE] Git: git version 2.39.2
  [CAUTION]  GitLab CLI (glab): Not found (optional)

[DEVICE] Select Your Device
═══════════════════════

1. TRMNL OG (Original) - 7.5" E-ink (ESP32)
   [DONE] Compatible

2. TRMNL X (Newer Model) - 7.5" E-ink (Unknown)
   [CAUTION]  Not Compatible
   NOT YET COMPATIBLE. Check back for future updates.

3. Kindle Paperwhite 3/4 - 6" E-ink (Carta) (ARM)
   [DONE] Compatible

... [continues]
```

## Device-Specific Instructions

### TRMNL OG

**Prerequisites**:
- USB-C cable
- esptool.py (`pip install esptool`)
- TRMNL firmware file

**Flashing**:
```bash
# Install esptool
pip install esptool

# Connect TRMNL OG via USB-C (hold BOOT button)
# Flash firmware
esptool.py --port /dev/ttyUSB0 write_flash 0x0 firmware.bin

# Reset device
```

**Chip Verification**:
- [DONE] TRMNL OG: ESP32 chip (compatible)
- [NO] TRMNL X: Different architecture (not compatible)

### Kindle Devices

**Prerequisites**:
- Kindle jailbreak completed
- KUAL (Kindle Unified Application Launcher) installed
- Python runtime on Kindle

**Resources**:
- MobileRead Forums: https://www.mobileread.com/forums/forumdisplay.php?f=150
- TRMNL Kindle Guide: [See Commute Compute Kindle setup guide]

**[CAUTION] WARNING**: Jailbreaking may void your warranty. Follow instructions carefully.

## Environment Variables

Add these in Render dashboard → Environment tab:

### Required

```bash
NODE_ENV=production
PORT=3000  # Render provides this automatically
DEVICE_TYPE=trmnl-og  # Or kindle-pw3, kindle-pw4, etc.
DEVICE_WIDTH=800  # Device resolution width
DEVICE_HEIGHT=480  # Device resolution height
```

### Optional (Recommended)

```bash
# Transit API (for your state)
ODATA_API_KEY=your-transport-victoria-api-key

# Geocoding (highly recommended for setup)
GOOGLE_PLACES_API_KEY=your-google-places-api-key
MAPBOX_ACCESS_TOKEN=your-mapbox-token  # Fallback geocoding
```

### Where to Get API Keys

- **Transport Victoria**: https://opendata.transport.vic.gov.au/
- **Google Places API (new)**: https://developers.google.com/maps/documentation/places/web-service/cloud-setup
- **Mapbox**: https://www.mapbox.com/

## Troubleshooting

### "Node.js not found"

**Solution**: Install Node.js 18+ from https://nodejs.org/

### "Git not found"

**Solution**: Install Git from https://git-scm.com/downloads

### "Device not compatible"

**Problem**: Selected TRMNL X
**Solution**: Use TRMNL OG instead. TRMNL X support coming soon.

### "Cannot open browser"

**Problem**: Admin panel won't open automatically
**Solution**: Manually visit `https://your-app.vercel.app/admin`

### "Firmware flashing failed"

**For TRMNL OG**:
- Verify USB-C connection
- Hold BOOT button while connecting
- Check device is TRMNL OG (not TRMNL X)
- Verify esptool is installed

**For Kindle**:
- Verify jailbreak completed successfully
- Check KUAL is installed
- Ensure correct firmware version
- Follow MobileRead guide carefully

## Support

- **GitLab Issues**: https://gitlab.com/angusbergman/commute-compute-system/issues
- **Documentation**: Check `docs/` folder in repository
- **Development Rules**: See `docs/development/DEVELOPMENT-RULES.md`

## Files in This Directory

```
/tools/setup-wizard/
├── setup-wizard.js          # Main wizard script
├── README.md                # This file
└── firmware/
    ├── trmnl-byos.ino       # TRMNL OG firmware (ESP32)
    └── kindle-launcher.sh   # Kindle launcher script
```

## Contributing

See `docs/development/CONTRIBUTING.md` for guidelines.

Ensure all changes comply with Development Rules v1.0.17.

## License

AGPL-3.0 Dual License
Copyright © 2026 Angus Bergman
https://www.gnu.org/licenses/agpl-3.0.html

---

**Built for the Australian transit community**
