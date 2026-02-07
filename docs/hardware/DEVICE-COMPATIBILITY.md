<p align="center">
  <img src="../../assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# Device Compatibility Guide
**Supported E-ink Displays for Commute Compute™**

Last Updated: 2026-01-29

---

## Overview

Commute Compute supports multiple e-ink display devices. This guide helps you:
1. Choose the right device for your needs
2. Verify compatibility with your hardware
3. Configure the server for your specific device
4. Flash/setup your device correctly

---

## Supported Devices

### Primary Devices (Fully Supported)

| Device | Screen Size | Resolution | Status | Price Range |
|--------|-------------|------------|--------|-------------|
| **TRMNL OG** | 7.5" | 800×480 | Official | $150-200 USD |
| **TRMNL Mini** | 4.2" | 400×300 | Official | $99-120 USD |
| **Kindle Paperwhite 3/4** | 6" | 758×1024 | Supported | $50-80 USD (used) |
| **Kindle Paperwhite 5** | 6.8" | 1236×1648 | Supported | $90-120 USD (used) |
| **Kindle 4/Basic** | 6" | 600×800 | Supported | $20-40 USD (used) |

### Experimental (Community Tested)

| Device | Screen Size | Resolution | Status | Notes |
|--------|-------------|------------|--------|-------|
| **Inkplate 6** | 6" | 800×600 | Experimental | ESP32-based, open hardware |
| **Inkplate 10** | 9.7" | 1200×825 | Experimental | Larger display, ESP32-based |
| **Kobo Clara HD** | 6" | 758×1024 | Experimental | Requires custom firmware |
| **reMarkable 2** | 10.3" | 1404×1872 | Experimental | High resolution, premium |

---

## Device Comparison

### TRMNL BYOS (Official Platform)

**Pros**:
- **Plug and play**: No jailbreaking required
- **Purpose-built**: Designed for custom displays
- **WiFi built-in**: Easy webhook integration
- **Reliable**: Professional quality hardware
- **Support**: Official TRMNL community

**Cons**:
- **Higher cost**: $150-200 USD new
- **Availability**: May have wait times

**Best For**: Users who want hassle-free setup and don't mind paying for quality.

**Setup Time**: 15 minutes

### Jailbroken Amazon Kindle

**Pros**:
- **Budget-friendly**: $20-120 USD used
- **Easy to find**: Abundant on eBay, Facebook Marketplace
- **Great battery**: 2-4 weeks on single charge
- **Repurpose old device**: Give new life to unused Kindle

**Cons**:
- **Requires jailbreak**: More technical setup
- **Warranty void**: Jailbreaking voids Amazon warranty
- **More setup steps**: Needs custom software installation
- **Smaller screen**: 6" vs 7.5" for TRMNL

**Best For**: Tech-savvy users, budget-conscious buyers, or those with old Kindles lying around.

**Setup Time**: 1-2 hours (including jailbreak)

---

## Device Specifications

### TRMNL BYOS

**Hardware**:
- **Display**: 7.5" Waveshare e-paper
- **Resolution**: 800×480 pixels (landscape)
- **Refresh Rate**: Configurable (5-60 min recommended)
- **Connectivity**: WiFi (2.4 GHz)
- **Power**: USB-C, wall adapter included
- **Platform**: BYOS (Bring Your Own Screen)

**Server Configuration**:
```javascript
const TRMNL_BYOS = {
  width: 800,
  height: 480,
  orientation: 'landscape',
  format: 'PNG',
  colors: 'monochrome', // Black and white only
  refreshMethod: 'webhook',
  webhookFormat: 'JSON',
  maxRefreshRate: 300 // 5 minutes minimum (e-ink wear protection)
};
```

**Webhook Endpoint**: `/api/screen`

**Response Format**:
```json
{
  "image": "base64_encoded_png_image",
  "orientation": "landscape",
  "refresh_rate": 900
}
```

### TRMNL Mini

**Hardware**:
- **Display**: 4.2" Waveshare e-paper
- **Resolution**: 400×300 pixels (landscape)
- **Refresh Rate**: Configurable (5-60 min recommended)
- **Connectivity**: WiFi (2.4 GHz)
- **Power**: USB-C
- **Platform**: TRMNL Mini

**Server Configuration**:
```javascript
const TRMNL_MINI = {
  width: 400,
  height: 300,
  orientation: 'landscape',
  format: 'PNG',
  colors: 'monochrome',
  refreshMethod: 'webhook',
  webhookFormat: 'JSON',
  maxRefreshRate: 300
};
```

**LiveDash Endpoint**: `/api/livedash?device=trmnl-mini`

**Scaling Notes**:
- V13 dashboard is proportionally scaled down
- Header height: 60px (vs 94px on OG)
- Maximum journey legs: 4 (vs 5 on OG)
- Font sizes reduced proportionally

### Kindle Paperwhite 3 (7th Gen)

**Hardware**:
- **Display**: 6" Carta e-ink
- **Resolution**: 758×1024 pixels (portrait native)
- **PPI**: 300
- **Year**: 2015
- **Model Numbers**: DP75SDI, 90G54L, 90G54M

**Server Configuration**:
```javascript
const KINDLE_PW3 = {
  width: 758,
  height: 1024,
  orientation: 'portrait', // Can rotate to landscape: 1024×758
  format: 'PNG',
  colors: 'monochrome',
  refreshMethod: 'kiosk_mode',
  maxRefreshRate: 600 // 10 minutes recommended
};
```

**Display Modes**:
- **Portrait**: 758×1024 (native)
- **Landscape**: 1024×758 (rotated)

### Kindle Paperwhite 4 (10th Gen)

**Hardware**:
- **Display**: 6" Carta e-ink
- **Resolution**: 758×1024 pixels
- **PPI**: 300
- **Year**: 2018
- **Model Numbers**: PQ94WIF

**Same configuration as Paperwhite 3**

### Kindle Paperwhite 5 (11th Gen)

**Hardware**:
- **Display**: 6.8" Carta 1200 e-ink
- **Resolution**: 1236×1648 pixels
- **PPI**: 300
- **Year**: 2021
- **Model Numbers**: 1VD29R, K13, R5S

**Server Configuration**:
```javascript
const KINDLE_PW5 = {
  width: 1236,
  height: 1648,
  orientation: 'portrait',
  format: 'PNG',
  colors: 'monochrome',
  refreshMethod: 'kiosk_mode',
  maxRefreshRate: 600
};
```

**Higher Resolution**: Best quality for detailed transit info.

### Kindle 4 (Non-Touch)

**Hardware**:
- **Display**: 6" Pearl e-ink
- **Resolution**: 600×800 pixels
- **PPI**: 167
- **Year**: 2011
- **Model Numbers**: B008

**Server Configuration**:
```javascript
const KINDLE_4 = {
  width: 600,
  height: 800,
  orientation: 'portrait',
  format: 'PNG',
  colors: 'monochrome',
  refreshMethod: 'kiosk_mode',
  maxRefreshRate: 900 // Older display, slower refresh
};
```

**Note**: Lower resolution requires larger fonts.

### Inkplate 6 (Experimental)

**Hardware**:
- **Display**: 6" recycled Kindle e-ink panel
- **Resolution**: 800×600 pixels (landscape native)
- **Microcontroller**: ESP32
- **Connectivity**: WiFi, Bluetooth
- **Power**: USB-C, LiPo battery support
- **Manufacturer**: Soldered (e-radionica.com)

**Server Configuration**:
```javascript
const INKPLATE_6 = {
  width: 800,
  height: 600,
  orientation: 'landscape',
  format: 'PNG',
  colors: '3-bit grayscale', // Supports grayscale but we use 1-bit
  refreshMethod: 'http_fetch',
  partialRefresh: true,
  maxRefreshRate: 60 // 1 minute minimum (fast partial refresh)
};
```

**LiveDash Endpoint**: `/api/livedash?device=inkplate-6`

**Notes**:
- ESP32-based, can run custom firmware or fetch images via HTTP
- Supports partial refresh (~1 second)
- Open-source hardware with Arduino/PlatformIO support
- Firmware available in `/firmware` directory (experimental)

### Inkplate 10 (Experimental)

**Hardware**:
- **Display**: 9.7" recycled Kindle DX e-ink panel
- **Resolution**: 1200×825 pixels (landscape native)
- **Microcontroller**: ESP32
- **Connectivity**: WiFi, Bluetooth
- **Power**: USB-C, LiPo battery support
- **Manufacturer**: Soldered (e-radionica.com)

**Server Configuration**:
```javascript
const INKPLATE_10 = {
  width: 1200,
  height: 825,
  orientation: 'landscape',
  format: 'PNG',
  colors: '3-bit grayscale',
  refreshMethod: 'http_fetch',
  partialRefresh: true,
  maxRefreshRate: 60
};
```

**LiveDash Endpoint**: `/api/livedash?device=inkplate-10`

**Notes**:
- Largest supported display (9.7")
- Higher resolution allows for more detailed journey information
- Scaled-up V15.0 layout with larger fonts
- Best for wall-mounted installations

---

## Server-Side Device Detection

Commute Compute automatically adapts to different devices.

### Auto-Detection System

```javascript
// Detect device from User-Agent or explicit device parameter
function detectDevice(req) {
  const userAgent = req.headers['user-agent'] || '';
  const deviceParam = req.query.device;

  // Explicit device selection (highest priority)
  if (deviceParam) {
    return getDeviceConfig(deviceParam);
  }

  // Auto-detect from User-Agent
  if (userAgent.includes('Kindle')) {
    // Parse Kindle model from User-Agent
    return detectKindleModel(userAgent);
  }

  // Default to TRMNL BYOS
  return getDeviceConfig('trmnl-byos');
}
```

### Device Configuration

Add to your Render environment variables:

```bash
# Device Type (optional - auto-detects if not set)
DEVICE_TYPE=trmnl-byos          # Options: trmnl-byos, kindle-pw3, kindle-pw4, kindle-pw5, kindle-4

# Device Orientation (optional)
DEVICE_ORIENTATION=landscape    # Options: landscape, portrait

# Custom Resolution (optional - overrides device defaults)
DEVICE_WIDTH=800
DEVICE_HEIGHT=480
```

---

## Setup Guide: TRMNL BYOS

### 1. Hardware Setup

1. Unbox your TRMNL device
2. Connect USB-C power cable
3. Wait for boot screen (~30 seconds)
4. Connect to WiFi network (follow on-screen prompts)

### 2. Configure TRMNL Dashboard

1. Go to [Self-hosted - use your Vercel deployment]
2. Log in to your account
3. Click **Add Device**
4. Enter device setup code (shown on screen)
5. Device registers automatically

### 3. Add Commute Compute Plugin

1. In TRMNL dashboard, navigate to **Plugins**
2. Click **Custom API**
3. Enter your webhook URL:
   ```
   https://your-server-name.vercel.app/api/screen
   ```
4. Set **Refresh Rate**: 15 minutes (900 seconds)
5. Click **Save**

### 4. Test Display

1. Click **Refresh Now** in TRMNL dashboard
2. Wait ~30 seconds
3. Display shows your transit dashboard

**Done!** Device will auto-refresh every 15 minutes.

---

## Setup Guide: Jailbroken Kindle

### Prerequisites

- Amazon Kindle device (see supported models above)
- USB cable (Kindle to computer)
- Computer (Windows, Mac, or Linux)
- WiFi network
- 1-2 hours of time

### Step 1: Jailbreak Your Kindle

**WARNING**: Jailbreaking voids your Amazon warranty.

**For Kindle Paperwhite 3/4/5**:
1. Follow TRMNL's official guide: [See Commute Compute Kindle setup guide]
2. Download jailbreak tools from MobileRead forums
3. Install via USB connection
4. Verify jailbreak successful

**Resources**:
- MobileRead Wiki: https://wiki.mobileread.com/wiki/Kindle_Hacks_Information
- TRMNL Kindle Guide: [See Commute Compute Kindle setup guide]

### Step 2: Install Kiosk Mode

1. Download KOReader or FBInk
2. Transfer to Kindle via USB
3. Enable kiosk mode in settings
4. Configure display timeout (none)

### Step 3: Install Web Browser

**Option A - KOReader** (Recommended):
1. Install KOReader from MobileRead
2. Enable WiFi in settings
3. Set homepage to your dashboard URL

**Option B - Simple Browser**:
1. Install lightweight browser for Kindle
2. Lock to kiosk mode
3. Navigate to dashboard URL

### Step 4: Configure Dashboard URL

**For Portrait Mode (native)**:
```
https://your-server-name.vercel.app/api/dashboard?device=kindle-pw3&orientation=portrait
```

**For Landscape Mode (rotated)**:
```
https://your-server-name.vercel.app/api/dashboard?device=kindle-pw3&orientation=landscape
```

### Step 5: Set Auto-Refresh

1. Install auto-refresh extension/script
2. Set interval: 10-15 minutes
3. Test refresh works correctly

### Step 6: Power Optimization

1. Disable Amazon Special Offers (if present)
2. Disable WiFi auto-sleep
3. Keep plugged in via USB power
4. Adjust screen timeout settings

**Done!** Your Kindle now displays transit dashboard.

---

## Server Endpoints for Different Devices

### TRMNL BYOS Webhook

**Endpoint**: `GET /api/screen`

**Response** (JSON):
```json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAA...",  // Base64 PNG (800×480)
  "orientation": "landscape",
  "refresh_rate": 900  // 15 minutes
}
```

### Kindle HTML Dashboard

**Endpoint**: `GET /api/dashboard`

**Query Parameters**:
- `device=kindle-pw3` - Kindle Paperwhite 3
- `device=kindle-pw4` - Kindle Paperwhite 4
- `device=kindle-pw5` - Kindle Paperwhite 5
- `device=kindle-4` - Kindle 4 (non-touch)
- `orientation=portrait` or `landscape`

**Response**: Optimized HTML for e-ink display

**Example URLs**:
```
https://your-server-name.vercel.app/api/dashboard?device=kindle-pw5&orientation=portrait
https://your-server-name.vercel.app/api/dashboard?device=kindle-4&orientation=landscape
```

### Universal Preview

**Endpoint**: `GET /preview`

**Query Parameters**:
- `device=trmnl-byos` (default)
- `device=kindle-pw3`
- etc.

**Use Case**: Preview how dashboard looks on different devices.

### LiveDash Multi-Device Renderer

**Endpoint**: `GET /api/livedash`

The LiveDash endpoint provides a unified multi-device rendering API that automatically scales the V13 dashboard specification to different screen sizes.

**Query Parameters**:
| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `device` | See below | `trmnl-og` | Target device ID |
| `format` | `png`, `json`, `html` | `png` | Output format |
| `refresh` | `true`, `false` | `false` | Force data refresh |

**Supported Devices**:
| Device ID | Resolution | Orientation | Notes |
|-----------|------------|-------------|-------|
| `trmnl-og` | 800×480 | Landscape | TRMNL Original (default) |
| `trmnl-mini` | 400×300 | Landscape | TRMNL Mini (scaled down) |
| `kindle-pw3` | 758×1024 | Portrait | Kindle Paperwhite 3/4 |
| `kindle-pw5` | 1236×1648 | Portrait | Kindle Paperwhite 5 |
| `kindle-basic` | 600×800 | Portrait | Kindle 4/Basic |
| `inkplate-6` | 800×600 | Landscape | Inkplate 6 |
| `inkplate-10` | 1200×825 | Landscape | Inkplate 10 |

**Special Requests**:
```bash
# List all available devices
GET /api/livedash?device=list

# Get PNG for TRMNL Mini
GET /api/livedash?device=trmnl-mini&format=png

# Get JSON data for Inkplate 10
GET /api/livedash?device=inkplate-10&format=json

# Interactive HTML preview for Kindle PW5
GET /api/livedash?device=kindle-pw5&format=html
```

**Response Headers** (PNG format):
```
Content-Type: image/png
Cache-Control: public, max-age=30
X-Device: trmnl-og
X-Dimensions: 800x480
```

**JSON Response** (format=json):
```json
{
  "status": "ok",
  "device": {
    "id": "trmnl-og",
    "name": "TRMNL Original",
    "width": 800,
    "height": 480,
    "orientation": "landscape"
  },
  "data": { /* journey data */ },
  "timestamp": "2026-01-29T08:00:00.000Z"
}
```

---

## Optimization for E-ink Displays

### Design Principles

All outputs follow e-ink best practices:

1. **High Contrast**: Black on white only (no grays)
2. **Large Text**: Minimum 14px font size
3. **Minimal Updates**: Reduce refresh frequency
4. **Simple Graphics**: No gradients or complex images
5. **Clear Layout**: Well-spaced elements

### Device-Specific Optimizations

**TRMNL BYOS (800×480)**:
- Font sizes: 24-48px
- 4-6 data cards per screen
- Landscape orientation
- Refresh: 15 min

**Kindle Paperwhite (758×1024 portrait)**:
- Font sizes: 18-36px
- Vertical layout
- 5-7 data rows
- Refresh: 10 min

**Kindle 4 (600×800)**:
- Font sizes: 16-28px
- Fewer data points
- Simpler layout
- Refresh: 15 min

### Testing Your Device

**Preview Page** `/preview` allows testing different devices:

1. Go to `/preview?device=kindle-pw5`
2. Check layout, font sizes, contrast
3. Verify all data is readable
4. Test different orientations

---

## Troubleshooting

### TRMNL BYOS Issues

**Device not refreshing**:
- Check webhook URL is correct
- Verify Render service not sleeping
- Test webhook directly in browser
- Check TRMNL dashboard for errors

**Image not displaying**:
- Verify image is 800×480 pixels exactly
- Check PNG format (not JPEG)
- Ensure base64 encoding is valid
- Test `/api/screen` endpoint

**Slow refresh**:
- Normal: 15-30 seconds per refresh
- Check WiFi signal strength
- Verify refresh rate setting
- E-ink displays are inherently slow

### Kindle Issues

**Jailbreak failed**:
- Verify correct jailbreak for your model
- Check firmware version compatibility
- Try different jailbreak method
- Consult MobileRead forums

**Browser won't load page**:
- Check WiFi connection
- Verify URL is correct
- Try simpler URL (no query params)
- Check Render service is awake

**Display not auto-refreshing**:
- Verify auto-refresh script installed
- Check browser supports JavaScript
- Manually refresh to test
- Consider using screensaver mode

**Text too small**:
- Add `?device=kindle-4` to URL
- System will use larger fonts
- Or customize CSS for your needs

**Battery draining quickly**:
- Keep Kindle plugged in
- Disable WiFi when not needed
- Increase refresh interval
- Check for runaway scripts

---

## Advanced: Custom Device Support

Want to add support for a new device?

### 1. Define Device Config

Edit `src/config/devices.js`:

```javascript
export const devices = {
  'custom-display': {
    width: 1200,
    height: 825,
    orientation: 'landscape',
    format: 'PNG',
    colors: 'monochrome',
    refreshMethod: 'webhook',
    fonts: {
      small: 16,
      medium: 24,
      large: 36
    }
  }
};
```

### 2. Update Dashboard Endpoint

Modify `/api/dashboard` to detect new device:

```javascript
if (device === 'custom-display') {
  return renderCustomDisplay(data);
}
```

### 3. Create Custom Template

Add template in `views/custom-display.html`:

```html
<!-- Optimized for your device specs -->
<div style="width: 1200px; height: 825px;">
  <!-- Your custom layout -->
</div>
```

### 4. Test Thoroughly

1. Preview: `/preview?device=custom-display`
2. Check all data displays correctly
3. Test refresh mechanism
4. Verify performance

---

## Device Selection Decision Tree

```
Start Here
│
├─ Do you already own a Kindle?
│  ├─ YES → Jailbreak it! ($0 cost)
│  └─ NO  → Continue
│
├─ What's your budget?
│  ├─ Under $50   → Buy used Kindle 4 ($20-40)
│  ├─ $50-$100    → Buy used Kindle Paperwhite 3/4 ($50-80)
│  ├─ $100-$150   → Buy used Kindle Paperwhite 5 ($90-120)
│  └─ $150-$200   → Buy TRMNL BYOS ($150-200)
│
├─ How technical are you?
│  ├─ Not technical → TRMNL BYOS (plug & play)
│  ├─ Somewhat tech-savvy → Kindle Paperwhite (moderate jailbreak)
│  └─ Very technical → Any device (you can handle it)
│
└─ How much time do you have?
   ├─ 15-30 minutes → TRMNL BYOS (quick setup)
   └─ 1-2 hours     → Jailbroken Kindle (more setup steps)
```

---

## Recommended Device by Use Case

| Use Case | Recommended Device | Why |
|----------|-------------------|-----|
| **Budget Build** | Used Kindle 4 ($20-40) | Cheapest option, still very functional |
| **Best Value** | Used Kindle PW3/4 ($50-80) | Great screen, affordable |
| **Best Quality** | Kindle PW5 ($90-120) | Highest resolution, newer hardware |
| **Easiest Setup** | TRMNL BYOS ($150-200) | No jailbreaking, official support |
| **Repurpose Old Device** | Your existing Kindle | Free if you already own one |
| **Future-Proof** | TRMNL BYOS | Purpose-built, will get updates |

---

## FAQ

**Q: Will jailbreaking brick my Kindle?**
A: Very unlikely if you follow guides carefully. Thousands of successful jailbreaks. Always follow MobileRead Wiki instructions.

**Q: Can I still read books on a jailbroken Kindle?**
A: Yes! Jailbreak doesn't remove Amazon functionality. You can switch between transit dashboard and reading books.

**Q: Which Kindle should I buy used?**
A: Kindle Paperwhite 3 or 4 ($50-80 used) offers best value. Avoid Kindle Fire (it's a tablet, not e-ink).

**Q: Does Commute Compute work with Kobo devices?**
A: Experimentally. Kobo uses different software. Community members have had success but it requires custom work.

**Q: Can I use an old e-reader I found?**
A: Maybe! Check if it has WiFi and can run custom software. Post specs in GitLab Issues for help.

**Q: How long does battery last?**
A: Kindle: 2-4 weeks (refreshing every 15 min, WiFi on)
TRMNL: Designed for always-plugged operation

**Q: Can I rotate the display?**
A: Yes! Use `?orientation=landscape` or `portrait` parameter.

**Q: What if my device isn't listed?**
A: Open a GitLab Issue with your device specs. Community may have already tested it.

---

## Resources

### Official Guides
- **TRMNL Kindle Guide**: [See Commute Compute Kindle setup guide]
- **TRMNL BYOS**: [Commute Compute is self-hosted]
- **TRMNL Discord**: https://discord.gg/trmnl

### Jailbreaking Resources
- **MobileRead Wiki**: https://wiki.mobileread.com/wiki/Kindle_Hacks_Information
- **KOReader**: https://koreader.rocks/
- **Kindle Development**: https://www.mobileread.com/forums/forumdisplay.php?f=150

### Where to Buy
- **TRMNL BYOS**: [Commute Compute is self-hosted] (new)
- **Used Kindles**: eBay, Facebook Marketplace, Craigslist
- **Amazon Renewed**: Refurbished Kindles with warranty

---

## Contributing Device Support

Have a device working? Help others!

1. Test your device thoroughly
2. Document setup steps
3. Create pull request with:
   - Device specs
   - Configuration code
   - Setup guide
   - Photos/screenshots

**Contribute**: https://gitlab.com/angusbergman/commute-compute-system

---

**Last Updated**: 2026-01-26
**Maintained By**: Angus Bergman & Community Contributors
**License**: AGPL-3.0 Dual License
