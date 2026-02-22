<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Kindle Firmware

**Version:** 2.0.0  
**Firmware Compatibility:** TRMNL v6.0  
**Requires:** WinterBreak Jailbreak + KUAL

---

## Features (Ported from TRMNL v6.0)

| Feature | Description |
|---------|-------------|
| State Machine | Robust state management matching TRMNL firmware |
| Exponential Backoff | Smart error recovery with increasing delays |
| Setup Detection | Automatic setup required screen when not configured |
| BYOS Support | Full TRMNL BYOS webhook URL compatibility |
| Zone Rendering | Compatible with server-side zone-based updates |
| Partial/Full Refresh | Battery-optimised refresh strategy |
| Legacy Support | Backwards compatible with old config variables |

---

## Supported Kindle Devices

| Device | Resolution | PPI | Directory |
|--------|------------|-----|-----------|
| Kindle Paperwhite 3 (7th gen) | 1072×1448 | 300 | `kindle-pw3/` |
| Kindle Paperwhite 4 (10th gen) | 1072×1448 | 300 | `kindle-pw4/` |
| Kindle Paperwhite 5 (11th gen) | 1236×1648 | 300 | `kindle-pw5/` |
| Kindle Basic (10th gen) | 600×800 | 167 | `kindle-basic-10/` |
| Kindle (11th gen) | 1072×1448 | 300 | `kindle-11/` |

---

## Prerequisites

### 1. Jailbreak Your Kindle (WinterBreak)

**Requirements:**
- Kindle firmware 5.18.0 or earlier
- USB cable for file transfer

**Process:**
1. Enable Airplane Mode on your Kindle
2. Restart the Kindle
3. Download WinterBreak files from MobileRead forums
4. Connect Kindle to computer via USB
5. Extract WinterBreak files to Kindle root directory
6. Safely eject and restart Kindle
7. Open Kindle Store and search for `;installHtml`
8. Follow on-screen jailbreak instructions
9. Install the hotfix update (prevents jailbreak removal)

### 2. Install KUAL (Kindle Unified Application Launcher)

1. Download KUAL from MobileRead
2. Extract to `/mnt/us/extensions/` on your Kindle
3. KUAL will appear as a book in your library

### 3. Install MRPI (MobileRead Package Installer)

1. Download MRPI from MobileRead
2. Install via KUAL or extract to extensions folder

---

## Installation

### Quick Install

1. Connect your Kindle via USB
2. Navigate to `/mnt/us/extensions/`
3. Create folder: `commute-compute`
4. Copy the appropriate files for your device:

**For Kindle Paperwhite 5:**
```bash
cp common/* /mnt/us/extensions/commute-compute/
cp kindle-pw5/device-config.sh /mnt/us/extensions/commute-compute/
chmod +x /mnt/us/extensions/commute-compute/*.sh
```

**For other devices, replace `kindle-pw5` with your device folder.**

5. Safely eject Kindle
6. Open KUAL on your Kindle
7. Select "Commute Compute" > "Configure" to set up
8. Select "Commute Compute" > "Start Dashboard"

### Using Package Script

```bash
# Build package for Kindle Paperwhite 5
./package-firmware.sh kindle-pw5

# Output: commute-compute-kindle-pw5.tar.gz
# Extract this to /mnt/us/extensions/ on your Kindle
```

---

## Configuration

### Method 1: BYOS Webhook URL (Recommended)

1. Complete setup at: https://your-project.vercel.app/setup-wizard.html
2. Copy your personal webhook URL from the completion screen
3. Edit `/mnt/us/extensions/commute-compute/config.sh`:

```bash
#!/bin/sh
# Your personal webhook URL from setup wizard
export CC_WEBHOOK_URL="https://your-project.vercel.app/api/device/eyJ..."
export CC_REFRESH=60
```

### Method 2: Direct Server (Requires Server Config)

```bash
#!/bin/sh
export CC_SERVER="https://your-server.vercel.app"
export CC_REFRESH=60
```

### Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_SERVER` | `https://your-project.vercel.app` | Server base URL |
| `CC_WEBHOOK_URL` | (none) | BYOS webhook URL (overrides server) |
| `CC_REFRESH` | `60` | Refresh interval in seconds |
| `CC_FULL_REFRESH_INTERVAL` | `15` | Full refresh every N updates |
| `CC_HTTP_TIMEOUT` | `30` | HTTP request timeout |
| `CC_DEBUG` | `0` | Enable verbose logging (1=on) |

---

## Usage

### From KUAL Menu

1. Open KUAL (appears as a book in your library)
2. Navigate to "Commute Compute"
3. Select an option:
   - **Start Dashboard**: Begin automatic updates
   - **Stop Dashboard**: Stop the background service
   - **Refresh Now**: Manually fetch latest data
   - **Status**: View current status and logs
   - **Configure**: Show setup instructions

### Command Line (SSH)

```bash
# Start dashboard
/mnt/us/extensions/commute-compute/commute-compute-launcher.sh start

# Stop dashboard
/mnt/us/extensions/commute-compute/commute-compute-launcher.sh stop

# Manual refresh
/mnt/us/extensions/commute-compute/commute-compute-launcher.sh once

# Check status
/mnt/us/extensions/commute-compute/commute-compute-launcher.sh status

# Show configuration help
/mnt/us/extensions/commute-compute/commute-compute-launcher.sh configure
```

---

## State Machine (v2.0)

The Kindle firmware now uses a state machine architecture matching TRMNL v6:

```
┌─────────────────────────────────────────────────────────────┐
│                    STATE MACHINE                             │
│                                                              │
│   INIT → WIFI_CONNECT → FETCH → RENDER → IDLE              │
│              │             │                │                │
│              └── ERROR ←───┴────────────────┘                │
│              │                                               │
│              └── SETUP_REQUIRED                              │
└─────────────────────────────────────────────────────────────┘
```

| State | Description |
|-------|-------------|
| `init` | Initial startup |
| `wifi_connect` | Connecting to WiFi |
| `fetch` | Fetching dashboard from server |
| `render` | Displaying on e-ink screen |
| `idle` | Sleeping between updates |
| `error` | Error recovery with backoff |
| `setup_required` | Setup wizard needed |

---

## Troubleshooting

### Dashboard Shows "Setup Required"

1. Complete the setup wizard at your server URL
2. Copy the webhook URL to your config.sh
3. Restart the dashboard

### Connection Errors with Exponential Backoff

The firmware automatically retries with increasing delays:
- 1st error: 30s delay
- 2nd error: 60s delay
- 3rd error: 120s delay
- 4th error: 240s delay
- 5th+ error: 30min delay (max backoff)

Check `/var/tmp/commute-compute/commute-compute.log` for details.

### Screen Ghosting

E-ink displays can show ghosting. The launcher performs periodic full refreshes.
Adjust in config.sh:
```bash
export CC_FULL_REFRESH_INTERVAL=10  # More frequent (default: 15)
```

### Battery Drain

WiFi is automatically disabled between updates. To reduce drain further:
```bash
export CC_REFRESH=300  # 5 minutes instead of 60 seconds
```

---

## API Integration

### BYOS Webhook (Recommended)

```
GET /api/device/{token}

Response: PNG image optimised for device resolution
Headers:
  X-Device-Mac: MAC address
  X-Device-Model: Device model
  X-Device-Resolution: Display resolution
  X-Firmware-Version: 2.0.0
```

### LiveDash Endpoint

```
GET /api/livedash?device={model}&resolution={res}&mac={mac}

Response: PNG image
Supported devices: kindle-pw3, kindle-pw4, kindle-pw5, kindle-basic-10, kindle-11
```

---

## File Structure

```
/mnt/us/extensions/commute-compute/
├── commute-compute-launcher.sh   # Main launcher (v2.0)
├── menu.json                     # KUAL menu
├── configure.sh                  # Config helper
├── device-config.sh              # Device-specific settings
└── config.sh                     # User config (create this)

/var/tmp/commute-compute/
├── state.json                    # State machine state
├── daemon.pid                    # PID file
├── commute-compute.log           # Log file
└── dashboard.png                 # Current dashboard image
```

---

## TRMNL BYOS Compatibility

This firmware is fully compatible with TRMNL's BYOS (Bring Your Own Server) system:

- [YES] Webhook URL with embedded config token
- [YES] Same API endpoints (`/api/device/{token}`)
- [YES] Same header format
- [YES] Setup required detection
- [YES] Error handling patterns

---

## Resources

- **MobileRead Forums**: https://www.mobileread.com/forums/
- **WinterBreak Jailbreak**: Search MobileRead for latest version
- **KUAL**: https://www.mobileread.com/forums/showthread.php?t=203326
- **Commute Compute**: https://gitlab.com/angusbergman/commute-compute-system

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01-30 | State machine architecture, BYOS support, exponential backoff |
| 1.0.0 | 2026-01-27 | Initial release |

---

## Licence

Copyright (c) 2026 Angus Bergman
AGPL-3.0 Dual Licence
See LICENCE file for full terms.
