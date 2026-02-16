<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Multi-Device Rendering Guide

**How the V13 Dashboard Specification Adapts to Different Screens**

Last Updated: 2026-01-29  
Copyright (c) 2025-2026 Angus Bergman — AGPL-3.0 Dual Licence

---

## Overview

The V15.0 Dashboard Specification (`specs/CCDashDesignV15.md`) defines the canonical layout for 800×480 TRMNL OG displays. The **LiveDash** renderer (`src/services/livedash.js`) adapts this specification to different screen sizes and resolutions while maintaining visual consistency.

This document explains:
1. How zone scaling works
2. Device-specific configurations
3. When to use which API endpoint
4. How to add new device support

---

## The Scaling System

### Base Reference: TRMNL OG (800×480)

The CCDashDesignV15.0 spec defines exact pixel positions for 800×480:

| Zone | Y Start | Y End | Height |
|------|---------|-------|--------|
| Header | 0 | 94 | 94px |
| Divider | 94 | 96 | 2px |
| Summary Bar | 96 | 124 | 28px |
| Gap | 124 | 132 | 8px |
| Journey Legs | 132 | 440 | 308px |
| Footer | 448 | 480 | 32px |

### Proportional Scaling

For different devices, zones scale proportionally based on display dimensions:

```javascript
// Example: TRMNL Mini (400×300) = 50% of OG
const scaleFactor = 400 / 800; // 0.5

header.height = Math.round(94 * scaleFactor); // 47px → rounded to 60px
summary.height = Math.round(28 * scaleFactor); // 14px → rounded to 20px
```

**Note**: Scaling isn't purely mathematical—font sizes and heights are tuned for readability.

---

## Device Scale Configurations

### TRMNL OG (800×480) — Reference

```javascript
scale: {
  header: { height: 94, timeSize: 64, dateSize: 18 },
  summary: { height: 28, fontSize: 14 },
  legs: { height: 316, titleSize: 17, subtitleSize: 13, durationSize: 30 },
  footer: { height: 32, fontSize: 16 }
}
```

### TRMNL Mini (400×300)

```javascript
scale: {
  header: { height: 60, timeSize: 40, dateSize: 12 },
  summary: { height: 20, fontSize: 10 },
  legs: { height: 180, titleSize: 12, subtitleSize: 9, durationSize: 20, maxLegs: 4 },
  footer: { height: 24, fontSize: 11 }
}
```

**Key Differences**:
- Maximum 4 journey legs (vs 5 on OG)
- Smaller fonts throughout
- Reduced padding/margins

### Kindle Paperwhite 3/4 (758×1024)

```javascript
scale: {
  header: { height: 140, timeSize: 80, dateSize: 24 },
  summary: { height: 40, fontSize: 18 },
  legs: { height: 680, titleSize: 24, subtitleSize: 16, durationSize: 40, maxLegs: 7 },
  footer: { height: 48, fontSize: 20 }
}
```

**Key Differences**:
- Portrait orientation (taller than wide)
- Up to 7 journey legs
- Larger fonts (300 PPI display)

### Kindle Paperwhite 5 (1236×1648)

```javascript
scale: {
  header: { height: 200, timeSize: 120, dateSize: 36 },
  summary: { height: 60, fontSize: 26 },
  legs: { height: 1100, titleSize: 36, subtitleSize: 24, durationSize: 56, maxLegs: 8 },
  footer: { height: 72, fontSize: 28 }
}
```

**Key Differences**:
- Highest resolution display
- Up to 8 journey legs
- Largest fonts

### Kindle Basic (600×800)

```javascript
scale: {
  header: { height: 100, timeSize: 56, dateSize: 18 },
  summary: { height: 32, fontSize: 14 },
  legs: { height: 520, titleSize: 18, subtitleSize: 12, durationSize: 32, maxLegs: 6 },
  footer: { height: 40, fontSize: 16 }
}
```

### Inkplate 6 (800×600)

```javascript
scale: {
  header: { height: 100, timeSize: 64, dateSize: 20 },
  summary: { height: 32, fontSize: 16 },
  legs: { height: 400, titleSize: 20, subtitleSize: 14, durationSize: 36 },
  footer: { height: 40, fontSize: 18 }
}
```

**Key Differences**:
- Landscape like TRMNL but taller (600 vs 480)
- More vertical space for legs

### Inkplate 10 (1200×825)

```javascript
scale: {
  header: { height: 130, timeSize: 80, dateSize: 24 },
  summary: { height: 40, fontSize: 20 },
  legs: { height: 560, titleSize: 26, subtitleSize: 18, durationSize: 44 },
  footer: { height: 52, fontSize: 22 }
}
```

**Key Differences**:
- Largest landscape display
- Premium wall-mount option

---

## API Endpoint Selection

### When to Use Each Endpoint

| Endpoint | Use Case | Output |
|----------|----------|--------|
| `/api/screen` | TRMNL webhook integration | Base64 PNG in JSON |
| `/api/zones` | TRMNL firmware (partial refresh) | Zone BMPs |
| `/api/dashboard` | Kindle browser kiosk | HTML page |
| `/api/livedash` | Universal multi-device | PNG, JSON, or HTML |
| `/api/kindle/image` | Kindle image fetch | Raw PNG |

### LiveDash vs Legacy Endpoints

**Use `/api/livedash` when:**
- You need multi-format support (png/json/html)
- You want device auto-detection
- You're building a new integration
- You need the interactive HTML preview

**Use `/api/screen` when:**
- TRMNL webhook expects specific JSON format
- Backward compatibility required

**Use `/api/zones` when:**
- TRMNL firmware with partial refresh
- Memory-constrained devices (batched zone fetch)

---

## Output Formats

### PNG Format (default)

```bash
GET /api/livedash?device=trmnl-og&format=png
```

Returns raw PNG image with headers:
```
Content-Type: image/png
Cache-Control: public, max-age=30
X-Device: trmnl-og
X-Dimensions: 800x480
```

### JSON Format

```bash
GET /api/livedash?device=trmnl-og&format=json
```

Returns journey data without rendering:
```json
{
  "status": "ok",
  "device": {
    "id": "trmnl-og",
    "name": "TRMNL Original",
    "width": 800,
    "height": 480,
    "orientation": "landscape",
    "dpi": 117,
    "colors": "1-bit"
  },
  "data": {
    "weather": { "temp": 22, "condition": "Sunny", "umbrella": false },
    "coffee": { "canGet": true, "arrivalTime": "8:45am" },
    "route": { "totalMinutes": 47, "modes": [...] }
  },
  "timestamp": "2026-01-29T08:00:00.000Z"
}
```

### HTML Format

```bash
GET /api/livedash?device=trmnl-og&format=html
```

Returns interactive HTML preview page with:
- Device frame mockup
- Auto-refresh toggle (30 second interval)
- Device selector dropdown
- Manual refresh button
- Last updated timestamp

---

## Adding New Device Support

### Step 1: Define Device Configuration

Add to `DEVICE_CONFIGS` in `src/services/livedash.js`:

```javascript
'new-device': {
  name: 'New Device Name',
  width: 1024,
  height: 768,
  orientation: 'landscape', // or 'portrait'
  dpi: 150,
  colors: '1-bit', // or '3-bit grayscale', '16-grayscale'
  refreshRate: '20s partial',
  scale: {
    header: { height: 120, timeSize: 72, dateSize: 22 },
    summary: { height: 36, fontSize: 16 },
    legs: { 
      height: 500, 
      titleSize: 22, 
      subtitleSize: 15, 
      durationSize: 38,
      maxLegs: 6  // Optional: limit visible legs
    },
    footer: { height: 44, fontSize: 18 }
  }
}
```

### Step 2: Calculate Scale Values

1. **Header**: ~12% of total height
2. **Summary**: ~4% of total height
3. **Legs**: ~65% of total height
4. **Footer**: ~5% of total height
5. **Font sizes**: Scale proportionally, then adjust for DPI

### Step 3: Test Thoroughly

```bash
# Preview in browser
open "https://your-server.vercel.app/api/livedash?device=new-device&format=html"

# Check PNG output
curl -o test.png "https://your-server.vercel.app/api/livedash?device=new-device"

# Verify dimensions
file test.png  # Should show correct width×height
```

### Step 4: Update Documentation

1. Add to `docs/hardware/DEVICE-COMPATIBILITY.md`
2. Add device to `/api/livedash` documentation
3. Update this file with scale configuration

---

## Rendering Pipeline

```
User Request
     │
     ▼
┌─────────────────────────────┐
│  /api/livedash              │
│  - Parse device parameter   │
│  - Load DEVICE_CONFIGS      │
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│  LiveDash.initialize()      │
│  - Create CommuteCompute      │
│  - Load user preferences    │
└─────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│  LiveDash.render()          │
│  - Get journey data         │
│  - Apply device scale       │
│  - Create canvas            │
└─────────────────────────────┘
     │
     ├─── format=json ──▶ Return data object
     │
     ├─── format=html ──▶ Return HTML preview
     │
     └─── format=png ───▶ canvas.toBuffer('image/png')
                              │
                              ▼
                         Return PNG
```

---

## Best Practices

### Font Size Guidelines

| Display Width | Min Font | Body Font | Header Font |
|---------------|----------|-----------|-------------|
| ≤400px | 8px | 10-12px | 36-40px |
| 400-800px | 10px | 13-16px | 56-68px |
| 800-1200px | 12px | 16-20px | 72-80px |
| >1200px | 14px | 20-28px | 100-120px |

### Journey Leg Limits

| Display Height | Max Legs | Rationale |
|----------------|----------|-----------|
| ≤300px | 4 | Minimum readable size |
| 300-600px | 5-6 | Standard TRMNL/Inkplate |
| 600-1000px | 6-7 | Kindle portrait |
| >1000px | 8 | Large Kindle/tablet |

### Testing Checklist

- [ ] All text readable at arm's length
- [ ] No text overflow or clipping
- [ ] Duration boxes aligned properly
- [ ] Arrow connectors centred
- [ ] Footer visible at bottom
- [ ] Weather box proportioned correctly

---

## Related Documentation

- `specs/CCDashDesignV15.md` — Canonical V15.0 layout specification
- `docs/hardware/DEVICE-COMPATIBILITY.md` — Supported devices list
- `DEVELOPMENT-RULES.md` — Section 8 (Design Specification)
- `src/services/livedash.js` — LiveDash implementation

---

**Maintained By**: Angus Bergman  
**Licence**: AGPL-3.0 Dual Licence
