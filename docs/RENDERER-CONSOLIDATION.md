<p align="center">
  <img src="../assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# CCDash™ Renderer Consolidation Proposal

**Date:** 2026-01-31  
**Status:** Proposed  
**Author:** Development Team

---

## Current State: 8 Files, 4,394 Lines

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| `ccdash-renderer-v13.js` | 718 | Full CCDash V15.0 rendering | `fullscreen.js`, `server.js` |
| `zone-renderer.js` | 979 | Zone-based partial refresh | `zones.js`, `zone/[id].js`, tests |
| `zone-renderer-v12.js` | 108 | Granular sub-zone updates | `server.js` |
| `zone-renderer-tiered.js` | 850 | Tiered refresh intervals | `zones-tiered.js` |
| `v11-dashboard-renderer.js` | 766 | Multi-device dashboard | `dashboard-service.js` |
| `v11-journey-renderer.js` | 738 | Journey-focused render | `journey-scenarios.js` |
| `image-renderer.js` | 110 | Low-level BMP creation | `server.js` |
| `journey-display/renderer.js` | 125 | Journey display module | `journey-display/` |

**Problem:** 8 renderers with overlapping functionality, confusing which to use.

---

## Overlap Analysis

| Functionality | ccdash-v13 | zone-renderer | v11-dash | v11-journey |
|--------------|:----------:|:-------------:|:--------:|:-----------:|
| Full screen render | [YES] | [YES] | [YES] | [YES] |
| Zone-based render | [YES] | [YES] | [NO] | [NO] |
| BMP output | [YES] | [YES] | [YES] | [YES] |
| Multi-device | [NO] | [NO] | [YES] | [NO] |
| CCDash V15.0 spec | [YES] | [YES] | [NO] | [NO] |
| Leg rendering | [YES] | [YES] | [YES] | [YES] |
| Weather icons | [YES] | [YES] | [YES] | [NO] |
| Coffee decision | [YES] | [YES] | [YES] | [NO] |

---

## Proposed Architecture

### Target: 2 Primary + 1 Utility = 3 Files

```
BEFORE (8 files, 4,394 lines)          AFTER (3 files, ~2,000 lines)
─────────────────────────────          ──────────────────────────────

┌─────────────────────────┐            ┌─────────────────────────────┐
│ ccdash-renderer-v13     │            │ ccdash-renderer.js (~1,200) │
│ (718 lines)             │     ┌─────▶│ - Full screen rendering     │
└─────────────────────────┘     │      │ - Zone-based partial        │
                                │      │ - Multi-device support      │
┌─────────────────────────┐     │      │ - CCDash V15.0 compliant     │
│ zone-renderer.js        │─────┤      │ - Tiered refresh logic      │
│ (979 lines) - MERGE     │     │      └─────────────────────────────┘
└─────────────────────────┘     │
                                │
┌─────────────────────────┐     │      ┌─────────────────────────────┐
│ zone-renderer-v12.js    │─────┤      │ livedash-renderer.js (~600) │
│ (108 lines) - DELETE    │     │      │ - Multi-device formats      │
└─────────────────────────┘     │      │ - Kindle, TRMNL, Inkplate   │
                                │      │ - Portrait/landscape        │
┌─────────────────────────┐     │      │ - Device-specific scaling   │
│ zone-renderer-tiered.js │─────┘      └─────────────────────────────┘
│ (850 lines) - MERGE     │
└─────────────────────────┘            ┌─────────────────────────────┐
                                       │ bmp-utils.js (~200)          │
┌─────────────────────────┐            │ - 1-bit BMP creation        │
│ v11-dashboard-renderer  │─────┐      │ - Canvas to BMP conversion  │
│ (766 lines) - DELETE    │     │      │ - Dithering (if needed)     │
└─────────────────────────┘     │      └─────────────────────────────┘
                                │
┌─────────────────────────┐     │
│ v11-journey-renderer    │─────┤
│ (738 lines) - DELETE    │     │
└─────────────────────────┘     │
                                │
┌─────────────────────────┐     │
│ image-renderer.js       │─────┘
│ (110 lines) - MERGE     │
└─────────────────────────┘

┌─────────────────────────┐
│ journey-display/renderer│─────────▶ DELETE (functionality in ccdash-renderer)
│ (125 lines)             │
└─────────────────────────┘
```

---

## Consolidated File Structure

### 1. `ccdash-renderer.js` (Primary Renderer)

```javascript
/**
 * CCDash™ Renderer (Consolidated)
 * Primary renderer for Commute Compute System dashboards.
 * Implements CCDashDesignV15.0 specification.
 * 
 * Features:
 * - Full screen rendering (800×480)
 * - Zone-based partial refresh
 * - Tiered refresh support (1/2/5 min intervals)
 * - 1-bit BMP output for e-ink
 * - SVG mode icons (walk, train, tram, coffee)
 */

// Zone definitions (from ccdash-v13 + zone-renderer)
export const ZONES = { ... };

// Tiered refresh config (from zone-renderer-tiered)
export const TIER_CONFIG = {
  1: ['header.time', 'status', 'leg1.time', ...],  // 1 min
  2: ['header.weather', 'legs', ...],               // 2 min
  3: ['header.location'],                           // 5 min
};

// Main exports
export function renderFullScreen(data, prefs = {}) { ... }
export function renderZones(data, options = {}) { ... }
export function renderSingleZone(zoneId, data, prefs = {}) { ... }
export function getChangedZones(data, forceAll = false) { ... }
export function getZonesForTier(tier) { ... }
export function clearCache() { ... }
```

### 2. `livedash-renderer.js` (Multi-Device)

```javascript
/**
 * CC LiveDash™ Multi-Device Renderer
 * Renders dashboards for various e-ink devices.
 * 
 * Supported devices:
 * - TRMNL OG (800×480, landscape, 1-bit)
 * - TRMNL Mini (400×300, landscape, 1-bit)
 * - Kindle Paperwhite 3-5 (various, portrait, 8-bit)
 * - Inkplate 6/10 (various, landscape, 1-bit)
 */

export const DEVICE_CONFIGS = { ... };

export function renderForDevice(deviceType, data, prefs = {}) { ... }
export function getDeviceConfig(deviceType) { ... }
export function getSupportedDevices() { ... }
```

### 3. `bmp-utils.js` (Utility)

```javascript
/**
 * BMP Utilities
 * Low-level 1-bit BMP creation for e-ink displays.
 */

export function canvasToBMP(canvas) { ... }
export function createBMPHeader(width, height) { ... }
export function packPixels(imageData) { ... }
```

---

## Migration Plan

### Phase 1: Create Consolidated Renderer

1. Create `ccdash-renderer.js` with all functionality
2. Merge zone definitions from all files
3. Add tiered refresh logic
4. Add multi-device scaling

### Phase 2: Update Imports

| Endpoint | Current Import | New Import |
|----------|----------------|------------|
| `api/zones.js` | zone-renderer | ccdash-renderer |
| `api/fullscreen.js` | ccdash-renderer-v13 | ccdash-renderer |
| `api/zones-tiered.js` | zone-renderer-tiered | ccdash-renderer |
| `api/zone/[id].js` | zone-renderer | ccdash-renderer |
| `api/livedash.js` | v11-dashboard-renderer | livedash-renderer |

### Phase 3: Deprecate & Delete

1. Add deprecation warnings to old files
2. Test all endpoints
3. Delete deprecated files:
   - `zone-renderer-v12.js`
   - `zone-renderer-tiered.js`
   - `v11-dashboard-renderer.js`
   - `v11-journey-renderer.js`
   - `journey-display/renderer.js`

---

## API Changes

**None.** All endpoints continue to work identically.

| Endpoint | Change |
|----------|--------|
| `/api/zones` | Internal only |
| `/api/fullscreen` | Internal only |
| `/api/livedash` | Internal only |
| `/api/zone/[id]` | Internal only |

---

## Testing Checklist

- [ ] `/api/zones` returns correct zone BMPs
- [ ] `/api/fullscreen` renders full 800×480 screen
- [ ] `/api/livedash?device=trmnl-og` works
- [ ] `/api/livedash?device=kindle-pw5` works
- [ ] Zone caching works correctly
- [ ] Tiered refresh respects intervals
- [ ] All 5 leg types render correctly
- [ ] Weather icons display properly
- [ ] Coffee decision banner works

---

## Line Count Comparison

| Before | After | Reduction |
|--------|-------|-----------|
| 4,394 lines | ~2,000 lines | **~55% reduction** |
| 8 files | 3 files | **63% fewer files** |

---

## Estimated Effort

| Phase | Time |
|-------|------|
| Phase 1: Consolidate code | 3-4 hours |
| Phase 2: Update imports | 1 hour |
| Phase 3: Testing | 2 hours |
| Phase 4: Cleanup | 30 min |
| **Total** | **~7 hours** |

---

## Approval

- [ ] Approved by Angus Bergman
- [ ] Current tests passing
- [ ] Backup created

---

**Recommendation:** Approve consolidation to simplify rendering architecture. Single CCDash renderer as source of truth, LiveDash for multi-device, BMP utils for low-level operations.
