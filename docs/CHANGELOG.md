<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Changelog

All notable changes to this project are documented here.

**Format:** [Semantic Versioning](https://semver.org/)  
**Copyright (c) 2025-2026 Angus Bergman — AGPL-3.0 Dual License**

---

## [2026-02-13] -- System v4.2.0

### Added
- **Suburb extraction** -- home/work display suburb from Google Places API `addressComponents` (locality/sublocality) or Nominatim fallback
- **Transit-to-walk conversion** -- removed transit legs become estimated walks using speed ratios (train 4x, tram 2.5x, bus 3x)
- **Lifestyle obligation styling** -- black-filled box only for positive obligations (BRING UMBRELLA, JACKET), plain text for passive notices (NO UMBRELLA)
- **Admin KV persistence** -- address edits geocoded via Places API and saved to Vercel KV through POST `/api/admin/preferences`
- **Address autocomplete** -- admin panel and address search use KV-stored Google Places API key
- **Ghost train fix** -- inline Metro Tunnel destination detection in `filterUnavailableTransitLegs()`

### Changed
- System version upgraded from v4.1.0 to **v4.2.0**
- CCDashDesignV15 spec upgraded to match all real implementation changes (UNLOCKED)
- `extractSuburb()` now detects municipalities via "City of [candidate]" matching
- Consecutive walk merging handles chains of adjacent walks with last segment title
- **Status intent logic (V15.1 semantics)** -- target-arrival late/on-time evaluation now applies only in actionable window (`<=120 min`). For far-future departures, status shows immediate "if left now" context.

### Security
- Auth deny-by-default on all admin endpoints
- CORS restriction to configured origins
- KV-first config loading (no fallback to local preferences on Vercel)

---

## [2026-02-12] -- System v4.1.0

### Added
- **Metro Tunnel citybound detection** via trip sequence analysis (Town Hall, State Library, Parkville, Arden, Anzac)
- **Direction-based train filtering** for citybound trains
- **Route-aware transit filtering** by specific route number
- **V/Line support** as 4th transit mode with named lines
- **Ferry canvas-drawn icon** for water transit legs
- **All-mode disruptions** fetched in parallel (metro + tram + bus)
- **Catchable departures only** in "Next:" subtitles
- **Strictly live GTFS-RT** data -- no timetable fallbacks

### Changed
- CommuteCompute(TM) Engine upgraded from v2.4 to **v3.1** (Metro Tunnel compliant)
- CCDash(TM) Renderer upgraded from v1.81 to **v2.1** (V15.0 spec-compliant)
- All document versions UNLOCKED for active development

---

## [2026-02-09] -- System v3.5.0

### Added
- **Admin Analytics Integration** -- DepartureConfidence and LifestyleContext engines now power admin dashboard analytics via `/api/commutecompute`
- **Sidebar Navigation** -- Admin panel redesigned with branded sidebar matching privacy/help design system

### Changed
- System version upgraded from v3.4.0 to **v3.5.0**
- CommuteCompute(TM) Engine upgraded from v2.3 to **v2.4**
- CCDash(TM) Renderer upgraded from v1.80 to **v1.81**
- Admin Panel upgraded from v3.2 to **v4.0** (full redesign)
- Firmware unchanged at **CC-FW-7.5.0**

### Fixed
- **E-ink suburb display** -- home/work locations now show suburb names instead of full geocoded addresses
- **AltTransit false activation** -- alternative transit panel only appears when ALL public transit is cancelled, not when a single mode is unavailable

---

## [2026-02-06] -- V15.0 Release (System v3.4.0)

### Added
- **Sleep Optimizer Engine** (`src/engines/sleep-optimizer.js`) -- bedtime recommendations and alarm integration for optimal commute departure
- **Alt Transit Engine** (`src/engines/alt-transit.js`) -- Uber, bike, and scooter cost/time comparisons alongside public transit options
- **Lifestyle Mindset** (`calculateMindset` in `src/engines/lifestyle-context.js`) -- stress level, step count, and feels-like temperature factored into journey decisions
- **Enhanced Glanceability** -- larger fonts in CCDash(TM) Renderer v1.80 for improved at-a-glance readability on e-ink displays

### Changed
- System version upgraded from v3.3.0 to **v3.4.0**
- CommuteCompute(TM) Engine upgraded from v2.2 to **v2.3**
- CCDash(TM) Renderer upgraded from v1.70 to **v1.80**
- Dashboard specification upgraded from CCDashDesignV14.0 to **CCDashDesignV15.0**
- Firmware unchanged at **CC-FW-7.5.0**

### Documentation
- All documentation files reviewed and updated for V15.0 accuracy
- Stale version references updated across documentation
- KNOWN-ISSUES.md updated with V15.0 notes

---

## [Unreleased]

### Planned
- Partial refresh optimization (zone-based updates working on hardware)
- Additional Australian state support (NSW, QLD in testing)

---

## [2026-02-01] -- Firmware v6.1 Logo Fix

### Fixed
- **BMP Logo Rendering Artifacts** — Eliminated black vertical bars on boot/setup screens
- Root cause: BMP row padding. 1-bit BMPs pad rows to 32-bit boundaries; bb_epaper rendered padding bits as black lines
- Solution: All logo widths must be multiples of 32

### Changed
- Boot logo: 256×380 (full "COMMUTE COMPUTE" branding, properly centered)
- Small logo: 128×130 (for connecting/setup screens)
- Source logos auto-trimmed from original 1056×992 master

### Firmware
- **v6.1-60s** — LOCKED, tagged as `v6.1-logos-fixed`
- Clean boot sequence: CC logo → Connecting → Setup/Dashboard

### Documentation
- ARCHITECTURE.md Section 11 — Added BMP rendering requirements
- Development Rules — BMP width alignment documented

---

## [2026-02-01] — Device Pairing with Vercel KV

### Added
- **Device Pairing System** — 6-character code pairing (like Chromecast/Roku)
- **Vercel KV Integration** for pairing — persistent storage across serverless invocations
- **Visual Logic Audit** — 10-point V11 compliance checking (`npm run monitor:visual`)
- **Security Audit** — XSS vulnerability scanning, API key validation
- **Firmware Audit** — 12-point anti-brick compliance checking

### Changed
- Dashboard spec updated from V10 to **CCDash V15.0** (LOCKED 2026-01-31)
- Architecture updated to v5.3
- Development Rules updated to v1.19
- Setup Wizard redirect message: "Directing you to your dashboard now..."

### Fixed
- Pairing API now uses Vercel KV — in-memory stores failed across serverless cold starts
- Device polling now correctly receives webhookUrl from persistent storage

### Documentation
- DEVELOPMENT-RULES.md Section 21.6 — Device Pairing System
- docs/ARCHITECTURE.md Section 18 — Updated with Vercel KV flow
- README.md — Updated badges and architecture diagram

---

## [2026-01-29] — UI/UX Redesign + CommuteCompute

### Added
- **CommuteCompute Engine** — Auto-detects optimal multi-modal routes across Australia
- **LiveDash Multi-Device Renderer** — Single endpoint serves TRMNL, Kindle, and web preview
- **Coffee-at-Interchange Pattern** — Get coffee at transfer points, not just origin
- **Mobile Navigation Menu** — Responsive hamburger menu on all pages
- **Unified Footer** — Consistent branding across all public pages
- `/api/livedash` endpoint for multi-device dashboard rendering

### Changed
- UI/UX redesign across landing, admin, simulator, and help pages
- Improved attribution section on all pages
- Better error states with visual feedback
- Archived deprecated pages (preview.html → livedash)

### Fixed
- Console.log forbidden term compliance (Section 1.1)
- 12-hour time format consistency
- File naming consistency across codebase

### Documentation
- DEVELOPMENT-RULES.md updated to v1.4
- ARCHITECTURE.md updated to v2.1
- Added CommuteCompute and LiveDash documentation

---

## [2026-01-28] — CCDashDesignV15.0 Dashboard Specification Lock

### Added
- CCDashDesignV15.0 — Complete locked specification
- Multi-device documentation
- Zone-based rendering specification

### Changed
- CCDashDesignV15.0 spec now **LOCKED** — changes require explicit approval
- Zone boundaries formalized (header, summary, legs, footer)

### Firmware
- v5.10 released — 100% anti-brick compliant
- Watchdog timer implementation (30s timeout)
- Memory management improvements

---

## [2026-01-27] — Firmware Stability

### Firmware
- v5.5 — HTTPS with extreme memory management (stable)
- Fixed Guru Meditation crashes from SSL/TLS memory overhead
- Isolated scopes for HTTP/JSON/Display operations

### Known Issues Resolved
- Address `0xbaad5678` crashes eliminated
- Memory leaks in WiFiClientSecure fixed

---

## [2026-01-26] — Initial Public Release

### Added
- Complete self-hosted architecture
- Transport Victoria OpenData API integration
- CoffeeDecision engine
- BOM weather integration
- Setup Wizard (zero-config)
- Device simulator

### Supported Devices
- TRMNL OG (800×480, primary)
- TRMNL Mini (600×448)
- Kindle Paperwhite 3/4/5
- Kindle Voyage
- Kindle Touch

### Documentation
- DEVELOPMENT-RULES.md v1.0
- ARCHITECTURE.md v1.0
- Complete setup guides

---

## Migration Notes

### Upgrading from Pre-2026-01-29

1. **Firmware**: Upgrade to v5.10 for anti-brick compliance
2. **API**: New `/api/livedash` endpoint available
3. **Config**: No breaking changes to config token format

### Breaking Changes

None in this release cycle.

---

**Maintained by:** Angus Bergman  
**Repository:** [commute-compute](https://gitlab.com/angusbergman/commute-compute-system)
