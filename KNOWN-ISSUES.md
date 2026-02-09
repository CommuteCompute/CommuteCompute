<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Known Issues & Hardware Quirks

**System Version:** v3.4.0 (CCDashDesignV15.0)
**Last Updated:** 2026-02-06

---

## Critical: FONT_12x16 Rotation Bug

**Date Discovered:** 2026-01-28
**Severity:** High (breaks display)
**Status:** Workaround applied

### Problem
When using `bbep.begin(EPD_TRMNL_OG)` preset with `FONT_12x16`, all text renders rotated 90 degrees counter-clockwise, making the display unreadable.

### Affected Configuration
- Hardware: TRMNL OG (ESP32-C3 + 7.5" Waveshare e-ink)
- Library: bb_epaper v2.0.3+
- Preset: `EPD_TRMNL_OG`
- Font: `FONT_12x16` (and possibly other larger fonts)

### Working Configuration
- Font: `FONT_8x8` renders correctly
- Test pattern with grid and labels confirmed coordinate system is correct
- Issue is isolated to font rendering, not display orientation

### Diagnosis Method
1. Flash test pattern with grid lines and coordinate labels using FONT_8x8
2. Observe: All text horizontal, TL/TR/BL/BR corners correct
3. Flash dashboard with FONT_12x16 headers
4. Observe: FONT_12x16 text rotated 90 degrees CCW, FONT_8x8 text correct

### Fix Applied
```cpp
// In initDisplay():
bbep.begin(EPD_TRMNL_OG);  // Use TRMNL preset
bbep.setRotation(0);        // Native orientation

// Throughout code:
bbep.setFont(FONT_8x8);     // ONLY use 8x8 font
// DO NOT use FONT_12x16 - it will rotate!
```

### Golden Rule Addition
**Rule:** On TRMNL hardware, use ONLY `FONT_8x8`. Larger fonts have rendering bugs that cause 90 degree rotation.

---

## V15.0: Enhanced Glanceability Font Sizes

**Date:** 2026-02-06
**Severity:** Low (cosmetic)
**Status:** Monitoring

### Note
V15.0 introduces larger fonts for improved glanceability in the CCDash(TM) Renderer (v1.80). The enhanced font sizes are rendered server-side in the 1-bit BMP output, so they are not affected by the FONT_12x16 firmware rotation bug above. The firmware continues to use server-rendered images. No firmware font changes are required.

---

## Design Decisions (Not Bugs)

### `/api/geocode` Not Exposed

**Status:** Intentional (Security by Design)

The `/api/geocode` endpoint returns 404 by design. Geocoding functionality is:
- Handled server-side only via `/admin/geocode` POST endpoint
- Protected to prevent API key abuse from public access
- Used internally by the admin panel forms

**Workaround:** Use the admin panel UI for address lookups, which calls the protected endpoint with proper authentication context.

---

## Other Notes

### Display Coordinate System
- Origin (0,0) at top-left
- X: 0-800 (left to right)
- Y: 0-480 (top to bottom)
- Standard landscape orientation when using `EPD_TRMNL_OG` + `setRotation(0)`

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
