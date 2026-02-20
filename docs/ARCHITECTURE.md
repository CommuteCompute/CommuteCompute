<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute System(TM) Architecture

**Version:** 7.0
**Last Updated:** 2026-02-13
**Status:** Active
**Specification:** CCDash(TM) V15.0 (UNLOCKED)
**Development Rules:** v1.28
**Metro Tunnel Compliance:** Effective 2026-02-01
**Copyright:** (c) 2026 Angus Bergman -- AGPL-3.0 Dual Licence

---

## Intellectual Property Notice

All trademarks and associated copyrights are owned by **Angus Bergman**:

| Trademark | Copyright |
|-----------|-----------|
| Commute Compute(TM) | (c) 2026 Angus Bergman |
| Commute Compute System(TM) | (c) 2026 Angus Bergman |
| CommuteCompute(TM) | (c) 2026 Angus Bergman |
| CCDash(TM) | (c) 2026 Angus Bergman |
| CC LiveDash(TM) | (c) 2026 Angus Bergman |
| CCFirm(TM) | (c) 2026 Angus Bergman |

See **LEGAL.md** for complete IP documentation.

---

## Trademark Family File Registry

Complete mapping of each trademark to its constituent files in the codebase.

### CommuteCompute(TM) -- Intelligent Route Engine

| File | Type | Purpose |
|------|------|---------|
| `src/engines/commute-compute.js` | Core | Main journey recommendation engine |
| `api/commutecompute.js` | API | REST endpoint for CommuteCompute |
| `src/services/smart-journey-integration.js` | Service | Integration layer |
| `src/services/smart-route-recommender.js` | Service | Route scoring and selection |
| `tests/test-commute-compute.js` | Test | Unit tests |

#### Sub-Engines (under CommuteCompute(TM))

| File | Engine | Purpose |
|------|--------|---------|
| `src/engines/departure-confidence.js` | DepartureConfidence | Departure probability scoring |
| `src/engines/lifestyle-context.js` | LifestyleContext | Time-of-day and routine awareness |
| `src/engines/sleep-optimizer.js` | SleepOptimizer | Evening mode and wake time logic |
| `src/engines/alt-transit.js` | AltTransit | Alternate route cost comparison |

### CCDash(TM) -- Primary Dashboard Renderer

| File | Type | Purpose |
|------|------|---------|
| `src/services/ccdash-renderer.js` | Core | Consolidated renderer (v2.1) -- single source of truth |
| `api/zones.js` | API | Zone-based partial refresh endpoint |
| `api/zones-tiered.js` | API | Tiered refresh intervals (1/2/5 min) |
| `api/zone/[id].js` | API | Individual zone BMP endpoint |
| `api/zonedata.js` | API | All zones with metadata |
| `api/screen.js` | API | Full 800x480 PNG endpoint |
| `api/fullscreen.js` | API | Fullscreen render endpoint |
| `specs/CCDashDesignV15.md` | Spec | Dashboard specification V15.0 (UNLOCKED) |

### CC LiveDash(TM) -- Multi-Device Preview Renderer

| File | Type | Purpose |
|------|------|---------|
| `src/services/livedash.js` | Core | Multi-device renderer service |
| `api/livedash.js` | API | Device-aware render endpoint |

### CCFirm(TM) -- Custom Firmware Family

| File | Type | Purpose |
|------|------|---------|
| `firmware/src/main.cpp` | Core | Primary CCFirmTRMNL firmware (CC-FW-7.7.0) |
| `firmware/kindle/` | Variant | CCFirmKindle for jailbroken Kindles |
| `firmware/include/config.h` | Config | Build configuration |
| `firmware/include/prerendered-screens.h` | Asset | Prerendered screens (boot, error) |
| `firmware/platformio.ini` | Build | PlatformIO build config |

### CoffeeDecision Engine (Component of CommuteCompute(TM))

| File | Type | Purpose |
|------|------|---------|
| `src/core/coffee-decision.js` | Core | Coffee insertion decision logic |
| `src/core/decision-logger.js` | Core | Decision audit logging |
| `src/services/cafe-busy-detector.js` | Service | Cafe busyness estimation |

### Journey Display Module (Component of CCDash(TM))

| File | Type | Purpose |
|------|------|---------|
| `src/journey-display/index.js` | Core | Module exports |
| `src/journey-display/api.js` | API | HTTP API handlers |
| `src/journey-display/engine.js` | Core | Journey calculation |
| `src/journey-display/renderer.js` | Core | Canvas rendering |
| `src/journey-display/diff.js` | Core | Zone change detection |
| `src/journey-display/models.js` | Core | Data models and types |

### Supporting Services

| File | Trademark | Purpose |
|------|-----------|---------|
| `src/services/opendata.js` | CommuteCompute(TM) | Transport Victoria GTFS-RT client |
| `src/services/weather-bom.js` | CCDash(TM) | BOM weather integration |
| `src/services/geocoding-service.js` | CommuteCompute(TM) | Address resolution |
| `src/services/journey-planner.js` | CommuteCompute(TM) | Journey calculation |
| `src/services/journey-scenarios.js` | CommuteCompute(TM) | Scenario handling |
| `src/services/dashboard-service.js` | CCDash(TM) | Dashboard data aggregation |
| `src/services/health-monitor.js` | System | System health checks |
| `src/utils/config-token.js` | System | Token encode/decode |

---

## Simplified System Architecture

The Commute Compute System(TM) is composed of four core trademark families working together:

```
                           EXTERNAL DATA SOURCES
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ Transport VIC   │  │ Bureau of       │  │ Google Places   │
    │ OpenData (GTFS) │  │ Meteorology     │  │ (Optional)      │
    │                 │  │                 │  │                 │
    │ - GTFS-RT feeds │  │ - Weather XML   │  │ - Geocoding API │
    │ - Vehicle pos.  │  │ - Alert feeds   │  │ - Setup only    │
    │ - Trip updates  │  │ - 5m cache TTL  │  │ - inf cache TTL │
    │ - 30s cache TTL │  │                 │  │                 │
    └─────────┬───────┘  └─────────┬───────┘  └─────────┬───────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                                   v
┌───────────────────────────────────────────────────────────────────────────┐
│                       CommuteCompute(TM) ENGINE                          │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ GTFS-RT Client  │  │ Route Planner   │  │ CoffeeDecision  │          │
│  │ (opendata.js)   │  │ & Recommender   │  │ Engine          │          │
│  │                 │  │                 │  │                 │          │
│  │ .fetchRealtime()│  │ .findStops()    │  │ .evaluate()     │          │
│  │ .parseGTFS()    │  │ .calcWalkTime() │  │ .selectPattern()│          │
│  │ .cacheData()    │  │ .findInterchange│  │ .checkFit()     │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ DepartureConf.  │  │ LifestyleCtx    │  │ SleepOptimizer  │          │
│  │                 │  │                 │  │                 │          │
│  │ .calcConfidence │  │ .inferHabits()  │  │ .maximizeRest() │          │
│  │ .assessReliab() │  │ .getWorkSched() │  │ .alignCircadian │          │
│  │ .triggerAlts()  │  │ .applyFilters() │  │ .adjustDepart() │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                          │
│  ┌─────────────────┐                                                    │
│  │ AltTransit      │  DATA FLOW PIPELINE:                               │
│  │                 │  user_token -> StateDetector -> RoutePlanner ->     │
│  │ .scoreAlts()    │  GTFSRTClient -> DecisionEngine -> output          │
│  │ .showWhenLow()  │                                                    │
│  │ .findBackups()  │                                                    │
│  └─────────────────┘                                                    │
└─────────────────────────────────────────┬────────────────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              v                       v
                ┌─────────────────────────┐  ┌─────────────────────────┐
                │    CCDash(TM) RENDERER  │  │ CC LiveDash(TM) RENDER  │
                │                         │  │                         │
                │ -- ccdash-renderer.js   │  │ -- livedash.js          │
                │ -- Zone-based BMP output│  │ -- Multi-device PNG/BMP │
                │ -- V15.0 Dashboard Spec │  │ -- Device-scaled layouts│
                │ -- Partial refresh      │  │                         │
                │ -- 60-second cycle      │  │ APIs:                   │
                │                         │  │ -- /api/livedash        │
                │ APIs:                   │  │ -- /api/livedash?dev=X  │
                │ -- /api/zones           │  │                         │
                │ -- /api/screen          │  │                         │
                │ -- /api/zone/[id]       │  │                         │
                └─────────┬───────────────┘  └─────────┬───────────────┘
                          └───────────┬────────────────┘
                                      │
                                      v
┌───────────────────────────────────────────────────────────────────────────┐
│                           CCFirm(TM) FIRMWARE                            │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ CCFirmTRMNL     │  │ CCFirmKindle    │  │ CCFirmESP32     │          │
│  │ (TRMNL OG)      │  │ (Jailbroken)    │  │ (Generic)       │          │
│  │                 │  │                 │  │                 │          │
│  │ .fetchZones()   │  │ .fetchZones()   │  │ .fetchZones()   │          │
│  │ .renderEInk()   │  │ .renderEInk()   │  │ .renderEInk()   │          │
│  │ .waitPoll()     │  │ .waitPoll()     │  │ .waitPoll()     │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                          │
│  BOOT STATE MACHINE:                                                    │
│  INIT -> CHECK_CREDS -> WIFI_CONNECT -> CHECK_URL ->                    │
│  FETCH_ZONES -> RENDER -> IDLE/POLL (60s)                               │
│                                                                          │
│  DEVICE PAIRING (2-phase):                                              │
│  Phase 1: BLE -> phone sends SSID + password only (no URL)             │
│  Phase 2: CODE -> device shows 6-char code -> user enters in wizard    │
│           -> receives full config                                       │
│                                                                          │
│  ANTI-BRICK PROTECTION:                                                 │
│  -- No network blocking in setup()     -- No deepSleep() in setup()    │
│  -- No allocBuffer() in setup()        -- FONT_8x8 only fallback      │
│  -- 40KB zone buffer limit             -- Watchdog timer protection    │
└─────────────────────────────────────────┬────────────────────────────────┘
                                          │
                                          v
                           ┌─────────────────────────┐
                           │     E-INK DISPLAYS      │
                           │                         │
                           │ TRMNL Device   800x480  │
                           │ TRMNL Mini     400x300  │
                           │ Kindle (various) varied │
                           │ Inkplate 6/10   varied  │
                           │ Web Browser  responsive │
                           └─────────────────────────┘
```

### Decision Tree Integration

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Input Layer     │--->│ Processing      │--->│ Decision        │--->│ Output Layer    │
│                 │    │ Engines         │    │ Modules         │    │                 │
│ - user_token    │    │ - StateDetector │    │ - RouteScoring  │    │ - display_zones │
│ - location_data │    │ - RoutePlanner  │    │ - CoffeeLogic   │    │ - firmware_cfg  │
│ - preferences   │    │ - GTFSRTClient  │    │ - SleepOptim    │    │ - api_responses │
│ - weather_data  │    │ - ContextEngine │    │ - AltTransit    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core System Logic

```
decode_token() -> detect_state() -> find_stops(800m_radius) -> query_gtfs_rt() ->
score_routes() -> apply_coffee_decision() -> apply_sleep_optimisation() ->
return_journey() -> IF confidence < 40% THEN show_alt_transit()
```

### Infrastructure Stack

```
Vercel Serverless (free tier) -> Redis (storage) -> GitLab CI/CD -> Multi-device deployment
```

### Trademark Family Relationships

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                        Commute Compute System(TM)                         │
│                              (Parent Brand)                               │
│                                                                           │
│    ┌─────────────────┬──────────────────┬─────────────────────────────┐  │
│    │                 │                  │                             │  │
│    v                 v                  v                             v  │
│ ┌──────────┐   ┌──────────┐      ┌──────────┐                ┌──────────┐
│ │Commute-  │   │ CCDash   │      │CC Live-  │                │ CCFirm   │
│ │Compute   │   │  (TM)    │      │  Dash    │                │  (TM)    │
│ │  (TM)    │   │          │      │  (TM)    │                │          │
│ └────┬─────┘   └────┬─────┘      └────┬─────┘                └────┬─────┘
│      │              │                 │                             │    │
│ Journey         Zone-based        Multi-device               Custom     │
│ Intelligence    Rendering         Preview                    Firmware   │
│                                                                         │
│ Contains:       Contains:         Contains:                  Contains:  │
│ -- Route        -- V15.0 Spec     -- Device configs          -- CCFirm │
│    Planner      -- Zone APIs      -- Scaled layouts             TRMNL  │
│ -- Coffee       -- BMP render     -- HTML preview            -- CCFirm │
│    Decision     -- Partial                                      Kindle │
│ -- GTFS-RT        refresh                                    -- CCFirm │
│ -- Departure                                                    ESP32  │
│    Confidence                                                          │
│ -- Lifestyle                                                           │
│    Context                                                             │
│ -- Sleep                                                               │
│    Optimizer                                                           │
│ -- AltTransit                                                          │
│                                                                         │
└───────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
External APIs -> CommuteCompute(TM) -> CCDash(TM)/CC LiveDash(TM) -> CCFirm(TM) -> E-ink Display
    (input)        (processing)            (rendering)               (device)       (output)
```

---

## Table of Contents

0. [Simplified System Architecture](#simplified-system-architecture)
1. [Overview](#1-overview)
2. [Distribution Model](#2-distribution-model)
3. [System Components](#3-system-components)
4. [Data Flow](#4-data-flow)
5. [Hardware Specifications](#5-hardware-specifications)
6. [API Architecture](#6-api-architecture)
7. [Rendering Pipeline](#7-rendering-pipeline)
8. [Zone-Based Partial Refresh](#8-zone-based-partial-refresh)
9. [Security Model](#9-security-model)
10. [Deployment Architecture](#10-deployment-architecture)
11. [CommuteCompute(TM) Engine](#11-commutecomputetm-engine)
12. [Melbourne Metro Tunnel Compliance](#12-melbourne-metro-tunnel-compliance)
13. [CC LiveDash(TM) Multi-Device Renderer](#13-cc-livedashtm-multi-device-renderer)
14. [CoffeeDecision Patterns](#14-coffeedecision-patterns)
15. [Setup Wizard & Free-Tier Architecture](#15-setup-wizard--free-tier-architecture)
16. [Journey Display Module](#16-journey-display-module)
17. [Data Layer Architecture](#17-data-layer-architecture)
18. [Multi-State Transit Support](#18-multi-state-transit-support)
19. [Device Pairing System](#19-device-pairing-system)
20. [Health Monitoring](#20-health-monitoring)
21. [Firmware Architecture (CCFirm(TM))](#21-firmware-architecture-ccfirmtm)
22. [Redis Storage](#22-upstash-redis-storage)
23. [GTFS-RT Data Flow](#23-gtfs-rt-data-flow)
24. [Turnkey Compliance](#24-turnkey-compliance)

---

## 1. Overview

Commute Compute is a **fully self-hosted smart transit display system** for Australian public transport. Each user deploys their own complete stack with zero external dependencies.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Self-Hosted** | User owns server, device, and API keys |
| **Zero-Config** | No environment variables -- config via Setup Wizard |
| **No TRMNL Cloud** | Custom firmware only -- never contacts usetrmnl.com |
| **Server-Side Rendering** | All computation on server -- device receives images |
| **Privacy-First** | Commute data stays on user's server |
| **Multi-State** | Supports all Australian states/territories |

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Server** | Node.js 18+, Express, Vercel Serverless |
| **Rendering** | @napi-rs/canvas, 1-bit BMP generation |
| **Data** | Transport Victoria OpenData API (GTFS-RT), multi-state APIs |
| **Firmware** | ESP32-C3, PlatformIO, C++ (CCFirm(TM)) |
| **Display** | E-ink (800x480 TRMNL, 600x448 TRMNL Mini, various Kindle) |
| **Fonts** | Inter (bundled TTF for serverless) |

---

## 2. Distribution Model

### Self-Hosted Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SELF-HOSTED DISTRIBUTION MODEL                       │
│                                                                         │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐        │
│   │  Official   │  Fork  │   User's    │ Deploy │   User's    │        │
│   │    Repo     │ ----->>│    Repo     │ ----->>│   Vercel    │        │
│   │  (GitLab)   │        │  (GitLab)   │        │  Instance   │        │
│   └─────────────┘        └─────────────┘        └──────┬──────┘        │
│                                                         │               │
│                                                         v               │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     USER'S VERCEL INSTANCE                      │  │
│   │  ┌───────────────┐  ┌─────────────┐  ┌───────────────────────┐ │  │
│   │  │CommuteCompute │  │  CCDash     │  │  CC LiveDash          │ │  │
│   │  │  (TM) Engine  │--│  (TM)      │--│  (TM) Multi-Device    │ │  │
│   │  └───────────────┘  └─────────────┘  └───────────────────────┘ │  │
│   └────────────────────────────┬───────────────────────────────────┘   │
│                                │                                        │
│                                v                                        │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     USER'S DEVICE                               │  │
│   │  ┌─────────────────────────────────────────────────────────┐   │  │
│   │  │  CCFirm(TM) Custom Firmware (NOT usetrmnl firmware)     │   │  │
│   │  │  - Fetches CCDash(TM) zones from user's Vercel URL      │   │  │
│   │  │  - Receives 1-bit BMP zones                              │   │  │
│   │  │  - 60-second partial refresh cycle                       │   │  │
│   │  └─────────────────────────────────────────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   [+] Complete data isolation -- no shared infrastructure               │
│   [+] User owns API keys -- embedded in config token                   │
│   [+] No central server -- each deployment is independent              │
│   [-] NO usetrmnl.com dependency -- CCFirm(TM) required               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Isolation

Each user deployment is completely isolated:
- Own Vercel instance
- Own API keys (in config token)
- Own device configuration
- No shared state between users

---

## 3. System Components

### 3.1 Directory Structure

```
commute-compute/
├── api/                          # Vercel serverless functions
│   ├── admin/                    # Admin/setup endpoints
│   │   ├── generate-webhook.js   # Generate config token URL
│   │   ├── preferences.js        # User preferences
│   │   └── setup-complete.js     # Setup validation
│   ├── device/
│   │   └── [token].js            # Device-specific endpoint
│   ├── pair/
│   │   └── [code].js             # Device pairing
│   ├── zone/
│   │   └── [id].js               # Individual zone fetch
│   ├── address-search.js         # Geocoding (Google/OSM)
│   ├── cafe-details.js           # Cafe data fetch
│   ├── commutecompute.js         # CommuteCompute(TM) REST endpoint
│   ├── health.js                 # Health check
│   ├── livedash.js               # Multi-device renderer
│   ├── fullscreen.js             # Fullscreen render endpoint
│   ├── save-google-key.js        # Google API key validation
│   ├── save-transit-key.js       # Transit API key validation
│   ├── screen.js                 # Full screen PNG
│   ├── status.js                 # Server status
│   ├── zonedata.js               # All zones with data
│   ├── zones.js                  # Zone-based refresh
│   └── zones-tiered.js           # Tiered refresh intervals
├── src/
│   ├── core/                     # Core business logic
│   │   ├── coffee-decision.js    # CoffeeDecision engine
│   │   ├── decision-logger.js    # Decision audit logging
│   │   ├── route-planner.js      # Route calculation
│   │   └── smart-journey-engine.js
│   ├── data/                     # Data layer
│   │   ├── data-scraper.js       # External data fetching
│   │   ├── data-validator.js     # Input validation
│   │   ├── fallback-timetables.js
│   │   ├── gtfs-static.js        # GTFS static data
│   │   └── preferences-manager.js
│   ├── engines/                  # CommuteCompute(TM) sub-engines
│   │   ├── commute-compute.js    # Core engine
│   │   ├── departure-confidence.js  # DepartureConfidence
│   │   ├── lifestyle-context.js  # LifestyleContext
│   │   ├── sleep-optimizer.js    # SleepOptimizer
│   │   └── alt-transit.js        # AltTransit
│   ├── journey-display/          # Journey display module
│   │   ├── api.js                # Display API layer
│   │   ├── diff.js               # Zone diffing
│   │   ├── engine.js             # Display engine
│   │   ├── index.js              # Module exports
│   │   ├── models.js             # Data models
│   │   └── renderer.js           # Display rendering
│   ├── services/                 # Service layer
│   │   ├── cafe-busy-detector.js # Cafe busy status
│   │   ├── ccdash-renderer.js    # CCDash(TM) consolidated renderer v2.0
│   │   ├── dashboard-service.js  # Dashboard aggregation
│   │   ├── geocoding-service.js  # Address resolution
│   │   ├── health-monitor.js     # System health
│   │   ├── image-renderer.js     # Image generation
│   │   ├── journey-planner.js    # Journey calculation
│   │   ├── journey-scenarios.js  # Scenario handling
│   │   ├── livedash.js           # CC LiveDash(TM) service
│   │   ├── opendata.js           # Transport Victoria client
│   │   ├── ptv-api.js            # PTV-specific adapter
│   │   ├── smart-journey-integration.js
│   │   ├── smart-route-recommender.js
│   │   └── weather-bom.js        # BOM weather
│   ├── utils/                    # Utilities
│   │   ├── australian-cities.js  # City data
│   │   ├── config.js             # App config
│   │   ├── config-token.js       # Token encode/decode
│   │   ├── deployment-safeguards.js
│   │   ├── device-state-manager.js
│   │   ├── fetch-with-timeout.js
│   │   ├── sanitize-html.js      # XSS protection
│   │   └── transit-authorities.js
│   └── server.js                 # Express entry point
├── firmware/                     # CCFirm(TM) custom firmware
│   ├── src/
│   │   ├── main.cpp              # Primary firmware
│   │   ├── main-tiered.cpp       # Tiered refresh
│   │   ├── main-minimal.cpp      # Minimal variant
│   │   └── main-ble.cpp          # BLE provisioning
│   ├── include/
│   │   └── config.h              # Configuration
│   ├── kindle/                   # Kindle-specific firmware
│   ├── platformio.ini            # Build config
│   └── docs/                     # Firmware documentation
├── public/                       # Static assets
│   ├── admin.html                # Setup Wizard
│   ├── setup-wizard.html         # New Setup Wizard
│   ├── device-simulator.html     # Device simulator
│   ├── journey-display.html      # Journey display page
│   ├── preview.html              # Dashboard preview
│   ├── help.html                 # Help documentation
│   ├── attribution.html          # Third-party credits
│   └── index.html                # Landing page
├── fonts/                        # Bundled fonts (serverless)
│   ├── Inter-Bold.ttf
│   └── Inter-Regular.ttf
├── specs/
│   └── CCDashDesignV15.md        # Dashboard spec V15.0 (UNLOCKED)
├── docs/                         # Documentation
└── DEVELOPMENT-RULES.md          # Development rules (v1.28)
```

### 3.2 Layer Architecture (by Trademark Family)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Setup Wizard│  │  Simulator  │  │CC LiveDash  │  │    Help     │   │
│  │ (admin.html)│  │             │  │ (TM) Preview│  │             │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                    API LAYER (CCDash(TM) / CC LiveDash(TM))             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  CCDash(TM) │  │CC LiveDash  │  │  CCDash(TM) │  │ /api/admin/*│   │
│  │ /api/zones  │  │(TM)        │  │ /api/screen │  │             │   │
│  │             │  │/api/livedash│  │             │  │             │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                        SERVICE LAYER (Renderers)                        │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │           CCDash(TM)            │  │      CC LiveDash(TM)        │  │
│  │  -- ccdash-renderer.js          │  │  -- livedash.js             │  │
│  │  -- Zone-based BMP output       │  │  -- Multi-device PNG/BMP    │  │
│  └─────────────────────────────────┘  └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                    CORE LAYER (CommuteCompute(TM))                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │CommuteComp- │  │ Coffee      │  │   Route     │  │  GTFS-RT    │   │
│  │ ute(TM)     │  │ Decision    │  │  Planner    │  │   Client    │   │
│  │   Engine    │  │             │  │             │  │             │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Departure   │  │ Lifestyle   │  │   Sleep     │  │  AltTransit │   │
│  │ Confidence  │  │ Context     │  │  Optimizer  │  │             │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                            DATA LAYER                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Transport  │  │    GTFS     │  │ Preferences │  │  Fallback   │   │
│  │  VIC API    │  │   Static    │  │   Manager   │  │ Timetables  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                        DEVICE LAYER (CCFirm(TM))                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ CCFirmTRMNL │  │CCFirmKindle │  │ CCFirmESP32 │  │(Future      │   │
│  │  (TRMNL OG) │  │(Jailbroken) │  │  (Generic)  │  │ Variants)   │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow

### 4.1 Complete Data Flow (by Trademark Family)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW -- TRADEMARK FAMILIES                      │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  Transport Victoria │
                    │  OpenData API       │
                    │  (GTFS-RT)          │
                    └──────────┬──────────┘
                               │
                               v 30s cache
┌──────────────────────────────────────────────────────────────────────────┐
│                      CommuteCompute(TM) ENGINE                          │
│                                                                          │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│   │  GTFS-RT Client │  │  Route Planner  │  │ CoffeeDecision  │         │
│   │  (opendata.js)  │  │  & Recommender  │  │     Engine      │         │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
│            │                    │                    │                   │
│   ┌────────┴────────┐  ┌───────┴────────┐  ┌───────┴─────────┐         │
│   │ DepartureConf.  │  │ LifestyleCtx   │  │ SleepOptimizer  │         │
│   │ AltTransit      │  │                │  │                 │         │
│   └────────┬────────┘  └───────┬────────┘  └───────┬─────────┘         │
│            └────────────────────┴────────────────────┘                   │
│                                 │                                        │
│                          Journey Data Model                              │
└─────────────────────────────────┬────────────────────────────────────────┘
                                  │
               ┌──────────────────┴──────────────────┐
               │                                      │
               v                                      v
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     CCDash(TM) RENDERER       │   │  CC LiveDash(TM) RENDERER     │
│                               │   │                               │
│  -- ccdash-renderer.js        │   │  -- livedash.js               │
│  -- Zone-based 1-bit BMP      │   │  -- Multi-device PNG/BMP      │
│  -- V15.0 Dashboard Spec      │   │  -- Device-scaled layouts     │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                    │
                v                                    v
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  CCDash(TM) APIs:             │   │  CC LiveDash(TM) APIs:        │
│  -- /api/zones (BMP zones)    │   │  -- /api/livedash (all devs)  │
│  -- /api/screen (full PNG)    │   │  -- /api/livedash?device=X    │
│  -- /api/zone/[id]            │   │                               │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                    │
                └──────────────────┬─────────────────┘
                                   │
                                   v
┌─────────────────────────────────────────────────────────────────────────┐
│                        CCFirm(TM) DEVICE                                │
│                                                                         │
│   Fetches CCDash(TM) zones -> Renders to e-ink -> Polls (60s)          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Request Flow (CCFirm(TM) -> CCDash(TM))

```
┌─────────────┐    ┌──────────────────────────────────────────────────────┐
│  CCFirm(TM) │    │                 VERCEL INSTANCE                      │
│   Device    │    │                                                      │
└──────┬──────┘    │  ┌────────────┐    ┌────────────┐    ┌───────────┐  │
       │           │  │ Decode     │    │Commute-    │    │ CCDash    │  │
       │ GET /api/zones?token=xxx  │    │ Compute    │    │ (TM)     │  │
       │----------->>  │ Config     │--->>  (TM)      │--->> Renderer │  │
       │           │  │ Token      │    │ Engine     │    │ (BMP)    │  │
       │<<-----------  └────────────┘    └────────────┘    └───────────┘  │
       │  JSON + BMP zones (base64)                                      │
└──────────────────┴──────────────────────────────────────────────────────┘
```

### 4.3 Caching Strategy

| Data Source | Cache TTL | Reason |
|-------------|-----------|--------|
| GTFS-RT Trip Updates | 30 seconds | Real-time accuracy |
| GTFS-RT Service Alerts | 5 minutes | Changes infrequently |
| GTFS-RT Vehicle Positions | 30 seconds | Real-time tracking |
| Static GTFS | 24 hours | Schedule data |
| Weather (BOM) | 5 minutes | Adequate freshness |
| Google Places | Session only | Address autocomplete |
| Geocoding results | Permanent (in token) | Cached at setup time |

---

## 5. Hardware Specifications

### 5.1 TRMNL OG (Primary Device)

| Component | Specification |
|-----------|--------------|
| **Microcontroller** | ESP32-C3 (RISC-V, single-core, 160MHz) |
| **Display** | 7.5" E-ink, 800x480 pixels, 1-bit |
| **Connectivity** | WiFi 802.11 b/g/n (2.4GHz) |
| **Memory** | 400KB SRAM, 4MB Flash |
| **Power** | USB-C required (battery mode under development) |
| **Refresh** | Partial refresh supported (~500ms) |

### 5.2 TRMNL Mini

| Component | Specification |
|-----------|--------------|
| **Display** | 400x300 pixels, 1-bit |
| **Other specs** | Same as TRMNL OG |

### 5.3 Compatible Kindle Models

| Model | Resolution | Orientation |
|-------|------------|-------------|
| Kindle 4 NT | 600x800 | Portrait |
| Kindle Paperwhite 2-5 | 758-1236x1024-1648 | Portrait |
| Kindle Touch | 600x800 | Portrait |
| Kindle Voyage | 1072x1448 | Portrait |
| Kindle Basic | 600x800 | Portrait |

**Requirement:** Jailbreak + kindle-dash package

### 5.4 Additional Supported Devices

| Device | Resolution | Orientation | Format |
|--------|-----------|-------------|--------|
| Inkplate 6 | 800x600 | Landscape | 1-bit BMP |
| Inkplate 10 | 1200x825 | Landscape | 1-bit BMP |
| Waveshare 7.5" | 800x480 | Landscape | 1-bit BMP |

---

## 6. API Architecture

### 6.1 Endpoint Overview

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/zones` | GET | Zone refresh for TRMNL | JSON + BMP data |
| `/api/zones-tiered` | GET | Tiered refresh intervals | JSON + BMP data |
| `/api/zone/[id]` | GET | Single zone BMP | BMP binary |
| `/api/zonedata` | GET | All zones with metadata | JSON |
| `/api/screen` | GET | Full screen PNG | PNG |
| `/api/fullscreen` | GET | Fullscreen render | PNG |
| `/api/livedash` | GET | Multi-device renderer | BMP/PNG |
| `/api/commutecompute` | GET | CommuteCompute(TM) engine | JSON |
| `/api/device/[token]` | GET | Device-specific endpoint | JSON |
| `/api/pair/[code]` | GET/POST | Device pairing | JSON |
| `/api/health` | GET | Health check | JSON |
| `/api/status` | GET | Server status | JSON |
| `/api/address-search` | GET | Geocoding | JSON |
| `/api/cafe-details` | POST | Cafe data | JSON |
| `/api/save-transit-key` | POST | Validate transit API key | JSON |
| `/api/save-google-key` | POST | Validate Google API key | JSON |
| `/api/admin/setup-complete` | POST | Validate setup | JSON |
| `/api/admin/generate-webhook` | POST | Generate config URL | JSON |
| `/api/admin/preferences` | GET/POST | User preferences | JSON |

### 6.2 Zone API Response

```json
{
  "timestamp": "2026-02-07T06:00:00.000Z",
  "zones": [
    {
      "id": "header",
      "changed": true,
      "x": 0, "y": 0,
      "w": 800, "h": 94,
      "bmp": "base64..."
    },
    {
      "id": "status",
      "changed": false,
      "x": 0, "y": 96,
      "w": 800, "h": 28,
      "bmp": null
    }
  ],
  "meta": {
    "totalJourneyTime": 42,
    "coffeeIncluded": true,
    "nextDeparture": "07:41",
    "state": "VIC",
    "confidence": 85
  }
}
```

### 6.3 Config Token Structure

```javascript
// Full decoded token structure
{
  "a": {                          // Addresses (display text)
    "home": "123 Example St, South Yarra VIC",
    "work": "123 Work Street, Melbourne VIC",
    "cafe": "Sample Cafe, South Yarra"
  },
  "l": {                          // Locations (lat/lon - CACHED)
    "home": { "lat": -37.8136, "lng": 144.9631 },
    "work": { "lat": -37.8136, "lng": 144.9631 },
    "cafe": { "lat": -37.8136, "lng": 144.9631 }
  },
  "j": {                          // Journey config
    "arrivalTime": "09:00",
    "coffeeEnabled": true,
    "coffeeDuration": 8,
    "coffeePattern": "auto"
  },
  "k": "transport-victoria-api-key",  // Transit API key
  "g": "google-places-api-key",       // Google API key (optional)
  "s": "VIC",                         // State
  "cf": {                         // Cafe data (CACHED)
    "name": "Sample Cafe",
    "placeId": "ChIJ...",
    "hours": { "mon": "7:00-16:00" }
  },
  "m": "cached"                   // API mode: cached | live
}
```

### 6.4 API Key Validation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Setup Wizard   │----->>  /api/save-     │----->> Transit API    │
│  enters key     │     │ transit-key     │     │  test endpoint  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 v
                        ┌─────────────────┐
                        │ Response:       │
                        │ - valid: bool   │
                        │ - message: str  │
                        │ - testResult    │
                        └─────────────────┘
```

---

## 7. Rendering Pipeline

### 7.1 V15.0 Dashboard Layout

V15.0 adds: Sleep mode (evening), Alt Transit cost panel, Mindset status bar, and enhanced glanceability.

```
┌────────────────────────────────────────────────────────────┐
│ HEADER (y: 0-94)                                           │
│ [Location] [Time 64px] [AM/PM] [Day] [Weather]            │
├────────────────────────────────────────────────────────────┤
│ DIVIDER (y: 94-96)                                         │
├────────────────────────────────────────────────────────────┤
│ STATUS BAR (y: 96-124)                                     │
│ LEAVE NOW -> Arrive 7:25   [Mindset: Focused]       65min │
├────────────────────────────────────────────────────────────┤
│ GAP (y: 124-132)                                           │
├────────────────────────────────────────────────────────────┤
│ JOURNEY LEGS (y: 132-432)                                  │
│ (1) Walk to stop                                     5 MIN │
│                         |                                  │
│                         v                                  │
│ (2) Coffee at cafe                                   8 MIN │
│                         |                                  │
│                         v                                  │
│ (3) Train to Flinders                               12 MIN │
│                         |                                  │
│                         v                                  │
│ (4) [Alt Transit cost panel if confidence < 40%]           │
├────────────────────────────────────────────────────────────┤
│ COFFEE/SLEEP ZONE (y: 432-448)                             │
│ [Sleep mode indicator in evening / Coffee status]          │
├────────────────────────────────────────────────────────────┤
│ FOOTER (y: 448-480)                                        │
│ 80 COLLINS ST, MELBOURNE                    ARRIVE 8:32   │
└────────────────────────────────────────────────────────────┘
```

### 7.2 BMP Output Format

```javascript
{
  format: 'bmp',
  width: 800,
  height: 480,
  bitDepth: 1,        // 1-bit monochrome ONLY
  compression: 'none',
  dibHeight: 480,     // POSITIVE (bottom-up for bb_epaper)
  colorTable: [
    [245, 245, 240],  // Index 0: e-ink white (#f5f5f0)
    [26, 26, 26]      // Index 1: black (#1a1a1a)
  ]
}
```

#### 7.2.1 BMP Width Alignment (CRITICAL for bb_epaper)

**All 1-bit BMP widths MUST be multiples of 32 pixels.**

BMP format pads each row to 32-bit (4-byte) boundaries. If width is not aligned, padding bits are interpreted as image data by bb_epaper, causing vertical black bar artifacts on e-ink displays.

| Asset | Width | Height | Notes |
|-------|-------|--------|-------|
| Boot logo | 256px | 380px | Full "COMMUTE COMPUTE" branding |
| Small logo | 128px | 130px | Connecting/setup screens |
| Zone widths | 800px | varies | Already 32-aligned |

**ImageMagick command for clean BMPs:**
```bash
convert source.png \
  -resize x<height> \
  -gravity center \
  -background white \
  -extent <width_multiple_of_32>x<height> \
  -threshold 50% \
  -type bilevel \
  BMP3:output.bmp
```

### 7.3 Renderer Versions (by Trademark)

| Renderer | Trademark | Purpose | Status |
|----------|-----------|---------|--------|
| `ccdash-renderer.js` | **CCDash(TM)** | Consolidated zone renderer (v2.0) | Primary |
| `livedash.js` | **CC LiveDash(TM)** | Multi-device renderer | Primary |
| `zone-renderer.js` | CCDash(TM) | Legacy zone renderer | Deprecated |
| `zone-renderer-v12.js` | CCDash(TM) | Legacy zone handling | Deprecated |
| `v11-dashboard-renderer.js` | CCDash(TM) | Legacy full dashboard | Deprecated |
| `v11-journey-renderer.js` | CCDash(TM) | Legacy journey-focused | Deprecated |

### 7.4 Font Requirements (Serverless)

```javascript
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';

// MANDATORY: Register fonts before any canvas operations
const fontsDir = path.join(__dirname, '../../fonts');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Bold.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.ttf'), 'Inter');

// Use registered font name (NOT 'sans-serif')
ctx.font = '800 17px Inter';
```

---

## 8. Zone-Based Partial Refresh

### 8.1 Zone Layout (V15.0)

| Zone ID | Name | Y Range | Height | Purpose |
|---------|------|---------|--------|---------|
| 0 | header | 0-94 | 94px | Time, weather, location |
| 1 | divider | 94-96 | 2px | Visual separator |
| 2 | status | 96-124 | 28px | Leave time, arrival, mindset |
| 3 | legs | 132-432 | 300px | Journey leg cards |
| 4 | coffee-sleep | 432-448 | 16px | Coffee/sleep zone |
| 5 | footer | 448-480 | 32px | Destination, arrival |

### 8.1.1 Status Intent Window (User-Intent Logic)

The status zone is designed for "walking out the door" decisions, not long-horizon planning.

- **Actionable window:** 120 minutes before departure
- **Outside window (`leave_in_minutes > 120`):**
  - Show immediate context if leaving now (`LEAVE NOW -> Arrive X`)
  - Suppress late/on-time target-arrival judgments in status text
- **Inside window (`leave_in_minutes <= 120`):**
  - Apply target-arrival logic (on-time, late badges, leave-in messaging)

This prevents misleading "late/on-time" framing when the commute is still hours away and keeps the display glanceable for real-world departure decisions.

### 8.2 Zone Size Reference

| Zone | Approximate Size | Notes |
|------|------------------|-------|
| header | ~9.5 KB | Includes weather icon |
| divider | ~0.3 KB | Minimal |
| status | ~2.9 KB | Text with mindset bar |
| legs | ~30.0 KB | Largest zone |
| coffee-sleep | ~1.5 KB | Contextual indicator |
| footer | ~3.3 KB | Text only |

### 8.3 Refresh Strategy

```
1. Server renders full 800x480 frame
2. Server compares with previous frame hash
3. Server identifies changed zones via diffing
4. Server returns only changed zone BMPs
5. Firmware fetches zones endpoint
6. Firmware applies partial refresh per zone
7. Cycle repeats every 60 seconds
```

### 8.4 Memory Constraints (ESP32-C3)

| Resource | Limit | Strategy |
|----------|-------|----------|
| Free heap | ~100KB | Zone batching |
| Zone buffer | 40KB minimum | For legs zone |
| PSRAM | None | Streaming, no full-frame buffer |
| HTTP response | ~50KB | Batch zones |

---

## 9. Security Model

### 9.1 Zero-Config Security

- **No server-side secrets** -- API keys in config token
- **Token in URL** -- Device URL contains encrypted config
- **User owns keys** -- Keys never stored on central server
- **Self-contained** -- Each deployment is isolated

### 9.2 XSS Protection

```javascript
// MANDATORY in all HTML rendering
function sanitize(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };
    return str.replace(/[&<>"'`=/]/g, c => map[c]);
}
```

### 9.3 API Key Validation

All API keys entered via admin panel are validated:
1. Format validation (UUID for VIC, etc.)
2. Live API test against endpoint
3. Save with validation status
4. Display masked preview to user

---

## 10. Deployment Architecture

### 10.1 Vercel Serverless

```
┌─────────────────────────────────────────────────────────────┐
│                     VERCEL DEPLOYMENT                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ api/zones.js │  │api/livedash  │  │ api/screen.js│       │
│  │  (Function)  │  │  .js         │  │  (Function)  │       │
│  │              │  │  (Function)  │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 public/ (Static)                      │   │
│  │  index.html, admin.html, setup-wizard.html, etc.     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 fonts/ (Bundled)                      │   │
│  │  Inter-Bold.ttf, Inter-Regular.ttf                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [+] Free tier: 100K requests/month                         │
│  [+] Auto-scaling                                            │
│  [+] Global CDN                                              │
│  [+] Auto-deploy from GitLab                                 │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Required Endpoints

| Endpoint | Purpose | Required |
|----------|---------|----------|
| `/api/zones` | Zone data for TRMNL | Yes |
| `/api/screen` | PNG for webhook | Yes |
| `/api/livedash` | Multi-device renderer | Yes |
| `/api/health` | Health check | Yes |
| `/api/status` | Server status | Yes |
| `/api/admin/*` | Setup endpoints | Yes |

---

## 11. CommuteCompute(TM) Engine

### 11.1 Overview

CommuteCompute is the intelligent route recommendation engine that auto-detects optimal multi-modal journeys across all Australian states. Renamed from SmartCommute to CommuteCompute on 2026-02-07.

### 11.2 State Support

| State | Transit Authority | Status | Features |
|-------|------------------|--------|----------|
| VIC | PTV | Production | Full GTFS-RT, alerts |
| NSW | TfNSW | Supported | GTFS-RT |
| QLD | TransLink | Supported | GTFS-RT |
| SA | Adelaide Metro | Planned | Fallback timetables |
| WA | Transperth | Planned | Fallback timetables |
| TAS | Metro Tasmania | Planned | Fallback timetables |
| NT | Public Transport Darwin | Planned | Fallback timetables |
| ACT | Transport Canberra | Planned | Fallback timetables |

### 11.3 State Configuration

```javascript
const STATE_CONFIG = {
  VIC: {
    name: 'Victoria',
    timezone: 'Australia/Melbourne',
    transitAuthority: 'PTV',
    gtfsRealtimeBase: 'https://api.opendata.transport.vic.gov.au/...',
    weatherZone: 'VIC',
    modes: { train: 0, tram: 1, bus: 2, vline: 3 }
  },
  NSW: {
    name: 'New South Wales',
    timezone: 'Australia/Sydney',
    transitAuthority: 'TfNSW',
    gtfsRealtimeBase: 'https://api.transport.nsw.gov.au/v1/gtfs',
    weatherZone: 'NSW',
    modes: { train: 0, metro: 1, bus: 2, ferry: 4, lightrail: 5 }
  },
  // ... other states
};
```

### 11.4 Route Selection Logic

```
1. Decode config token to get home/work locations
2. Auto-detect state from home address
3. Find nearby transit stops (within 800m walking)
4. Query GTFS for available routes
5. Score routes by:
   - Total journey time
   - Number of transfers
   - Walking distance
   - Service frequency
   - Current delays
   - DepartureConfidence score
6. Apply CoffeeDecision if enabled
7. Apply SleepOptimizer if evening mode
8. Return optimal journey with alternatives
9. Alternate routes shown ONLY when primary confidence < 40%
```

---

## 12. Melbourne Metro Tunnel Compliance

**Effective Date:** 1 February 2026

CommuteCompute(TM) is fully compliant with the Melbourne Metro Tunnel network restructure. This section documents the network changes and how CommuteCompute handles them.

### 12.1 Metro Tunnel Overview

The Metro Tunnel is a 9km twin-tunnel rail link running through Melbourne's CBD, featuring five new underground stations. It fundamentally changes how certain train lines traverse the city.

**New Stations (Underground):**

| Station | Zone | Precinct | Interchange |
|---------|------|----------|-------------|
| Arden | 1 | North Melbourne | Trams to Docklands, North Melbourne |
| Parkville | 1 | Hospital/University | Royal Melbourne Hospital, Melbourne Uni |
| State Library | 1 | CBD | RMIT, State Library, Swanston St trams |
| Town Hall | 1 | CBD | Collins St, Bourke St Mall, City Square |
| Anzac | 1 | Domain/St Kilda Rd | Shrine, trams 3/5/6/16/64/67/72 |

### 12.2 Lines Using Metro Tunnel

These lines now run through the Metro Tunnel **instead of the City Loop**:

| Line | Direction | Metro Tunnel Route |
|------|-----------|-------------------|
| Sunbury | Citybound | North Melbourne -> Arden -> Parkville -> State Library -> Town Hall -> Anzac |
| Craigieburn | Citybound | North Melbourne -> Arden -> Parkville -> State Library -> Town Hall -> Anzac |
| Upfield | Citybound | Flemington Bridge -> Parkville -> State Library -> Town Hall -> Anzac |
| Pakenham | Citybound | Caulfield -> Anzac -> Town Hall -> State Library -> Parkville -> Arden |
| Cranbourne | Citybound | Caulfield -> Anzac -> Town Hall -> State Library -> Parkville -> Arden |

### 12.3 Discontinued City Loop Services

**CRITICAL:** The following City Loop stations **no longer receive** Sunbury/Craigieburn/Upfield/Pakenham/Cranbourne services:

| Station | Lost Lines | Still Served By | Nearest Metro Tunnel |
|---------|------------|-----------------|---------------------|
| Southern Cross | SUN, CBE, UPF, PKM, CBE | Werribee, Williamstown, V/Line | Arden (12 min walk) |
| Flagstaff | SUN, CBE, UPF, PKM, CBE | All City Loop lines | State Library (5 min walk) |
| Melbourne Central | SUN, CBE, UPF, PKM, CBE | All City Loop lines | State Library (3 min walk) |
| Parliament | SUN, CBE, UPF, PKM, CBE | All City Loop lines | Town Hall (8 min walk) |

### 12.4 Lines Still Using City Loop

These lines continue to run through the traditional City Loop:

| Group | Lines |
|-------|-------|
| Burnley | Belgrave, Lilydale, Alamein, Glen Waverley |
| Caulfield | Frankston, Sandringham |
| Northern | Hurstbridge, Mernda |
| Cross-City | Werribee, Williamstown |

### 12.5 CommuteCompute Implementation

CommuteCompute handles Metro Tunnel compliance through the following data structures:

```javascript
// Lines that use Metro Tunnel (NO LONGER use City Loop)
export const METRO_TUNNEL_LINES = [
  'sunbury', 'craigieburn', 'upfield', 'pakenham', 'cranbourne'
];

// City Loop stations that lost Metro Tunnel line services
export const METRO_TUNNEL_DISCONTINUED_SERVICES = {
  southernCross: { lostLines: [...], nearestMetroTunnel: 'arden', walkMinutes: 12 },
  flagstaff: { lostLines: [...], nearestMetroTunnel: 'stateLibrary', walkMinutes: 5 },
  melbourneCentral: { lostLines: [...], nearestMetroTunnel: 'stateLibrary', walkMinutes: 3 },
  parliament: { lostLines: [...], nearestMetroTunnel: 'townHall', walkMinutes: 8 }
};

// Helper functions
export function isMetroTunnelLine(lineName) { ... }
export function getDiscontinuedServiceInfo(station, line) { ... }
export function getRoutingChangeInfo(stationName) { ... }
```

### 12.6 Automatic Route Adjustment

CommuteCompute automatically:

1. **Detects Metro Tunnel lines** -- Uses `isMetroTunnelLine()` to identify affected services
2. **Routes via Metro Tunnel** -- Directs Sunbury/Craigieburn/Upfield/Pakenham/Cranbourne through new stations
3. **Warns on discontinued services** -- If user expects to catch a Metro Tunnel line at a City Loop station, provides alternatives
4. **Suggests interchange options** -- North Melbourne remains the key interchange between Metro Tunnel and City Loop lines

### 12.7 Data Sources & Attribution

Metro Tunnel network data incorporated in CommuteCompute(TM) is derived from official sources:

| Source | URL | Data Type |
|--------|-----|-----------|
| Big Build Victoria | bigbuild.vic.gov.au/projects/metro-tunnel | Station locations, routes, opening date |
| Transport Victoria | ptv.vic.gov.au | Timetables, service patterns |
| Victorian Government | vic.gov.au/metro-tunnel | Official announcements |
| Transport Victoria OpenData API | data.vic.gov.au | GTFS/GTFS-RT feeds, stop IDs |

*The Metro Tunnel Project is delivered by Rail Projects Victoria, a division of the Major Transport Infrastructure Authority.*

---

## 13. CC LiveDash(TM) Multi-Device Renderer

### 13.1 Overview

CC LiveDash is a unified rendering endpoint that serves dashboard images to multiple device types from a single API.

### 13.2 Supported Devices

| Device | Resolution | Format | Orientation |
|--------|-----------|--------|-------------|
| `trmnl-og` | 800x480 | 1-bit BMP | Landscape |
| `trmnl-mini` | 400x300 | 1-bit BMP | Landscape |
| `kindle-pw3` | 1072x1448 | 8-bit PNG | Portrait |
| `kindle-pw5` | 1236x1648 | 8-bit PNG | Portrait |
| `kindle-basic` | 600x800 | 8-bit PNG | Portrait |
| `inkplate-6` | 800x600 | 1-bit BMP | Landscape |
| `inkplate-10` | 1200x825 | 1-bit BMP | Landscape |
| `web` | 800x480 | PNG | Landscape |

### 13.3 Request Format

```
GET /api/livedash?device=trmnl-og&token=<config_token>
```

### 13.4 Device Config Structure

```javascript
export const DEVICE_CONFIGS = {
  'trmnl-og': {
    name: 'TRMNL Original',
    width: 800,
    height: 480,
    orientation: 'landscape',
    dpi: 117,
    colors: '1-bit',
    refreshRate: '20s partial',
    scale: {
      header: { height: 94, timeSize: 64, dateSize: 18 },
      status: { height: 28, fontSize: 14 },
      legs: { height: 300, titleSize: 17, subtitleSize: 13, durationSize: 30 },
      footer: { height: 32, fontSize: 16 }
    }
  },
  // ... other devices
};
```

---

## 14. CoffeeDecision Patterns

### 14.1 Overview

CoffeeDecision determines if there is time for coffee in the journey, with multiple insertion patterns.

### 14.2 Coffee Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| **origin** | Coffee before leaving home | Home -> Cafe -> Walk -> Train |
| **interchange** | Coffee at transfer point | Home -> Train -> Cafe -> Tram -> Work |
| **destination** | Coffee near work | Home -> Train -> Walk -> Cafe -> Work |
| **auto** | Engine selects best option | Based on timing and cafe location |

### 14.3 Decision Logic

```javascript
// CoffeeDecision checks:
// 1. Is coffee enabled in config?
// 2. Is there a cafe configured?
// 3. Is it FRIDAY TREAT? (Fridays always recommend coffee if enabled + cafe configured)
// 4. Does insertion pattern fit timing?
// 5. Will we still arrive by target time?

if (isFriday && config.coffeeEnabled && hasCafeConfigured) {
    // FRIDAY TREAT: Always recommend coffee on Fridays
    insertCoffee(bestPattern);
} else if (config.coffeeEnabled &&
    hasCafeNearby &&
    fitsInSchedule(coffeeMinutes + walkBuffer) &&
    arrivalTime <= targetArrival) {
    insertCoffee(bestPattern);
}
```

### 14.4 FRIDAY TREAT

On Fridays, coffee is **always** recommended if both conditions are met:
- `coffeeEnabled` is true in user config
- A cafe is configured in the user's setup

This overrides the normal timing checks. The FRIDAY TREAT is a quality-of-life feature that encourages starting the end of the work week with coffee.

### 14.5 Configuration

```json
{
  "j": {
    "coffeeEnabled": true,
    "coffeeDuration": 8,
    "coffeePattern": "auto"
  }
}
```

---

## 15. Setup Wizard & Free-Tier Architecture

### 15.1 Overview

The Setup Wizard enables zero-config deployment by encoding all user preferences into a webhook URL token. No server-side storage required -- works perfectly on Vercel serverless.

### 15.2 Free-Tier Principle

**The entire system MUST be usable for free by any user.**

| Service | Status | Cost |
|---------|--------|------|
| Vercel Hosting | Required | FREE |
| OpenStreetMap Nominatim | Fallback geocoding | FREE |
| Transport Victoria OpenData | Required | FREE (registration) |
| BOM Weather | Required | FREE |
| Google Places | Optional | Paid (skippable) |

### 15.3 Setup-Time Caching

All location data is geocoded ONCE during setup, then cached in the webhook URL:

```
SETUP (one-time)           RUNTIME (zero API calls)
----------------           -----------------------
Geocode addresses    ->    URL token contains:
Fetch cafe hours     ->    -- lat/lon coordinates
Encode in URL token  ->    -- cafe business hours
                           -- all preferences
```

### 15.4 Setup Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. Enter       │--->>  2. Geocode     │--->>  3. Generate    │
│  Addresses      │    │  (OSM/Google)   │    │  Config Token   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         v                                              v
┌─────────────────┐                           ┌─────────────────┐
│  4. Configure   │                           │  5. Flash       │
│  Device URL     │<<-------------------------│  Firmware       │
└─────────────────┘                           └─────────────────┘
```

---

## 16. Journey Display Module

### 16.1 Overview

The journey-display module provides a modular, testable architecture for journey rendering with clear separation of concerns. It is a component of CCDash(TM).

### 16.2 Module Structure

```
src/journey-display/
├── api.js        # HTTP API handlers
├── diff.js       # Zone change detection
├── engine.js     # Journey calculation engine
├── index.js      # Module exports
├── models.js     # Data models and types
└── renderer.js   # Canvas rendering
```

### 16.3 Data Models

```javascript
// Journey model
{
  id: string,
  legs: Leg[],
  totalDuration: number,
  departureTime: Date,
  arrivalTime: Date,
  coffeeIncluded: boolean,
  delays: Delay[],
  alerts: Alert[],
  confidence: number
}

// Leg model
{
  mode: 'walk' | 'train' | 'tram' | 'bus' | 'coffee',
  origin: Stop,
  destination: Stop,
  duration: number,
  distance: number,    // optional
  route: string,       // optional
  platform: string,    // optional
  status: 'normal' | 'delayed' | 'cancelled' | 'diverted'
}
```

### 16.4 Diff Algorithm

```javascript
// Zone diffing for partial refresh
function diffZones(previous, current) {
  const changed = [];
  for (const zone of current.zones) {
    const prevZone = previous.zones.find(z => z.id === zone.id);
    if (!prevZone || hash(zone.content) !== hash(prevZone.content)) {
      changed.push(zone.id);
    }
  }
  return changed;
}
```

---

## 17. Data Layer Architecture

### 17.1 Overview

The data layer provides consistent data access with caching, validation, and fallback support.

### 17.2 Components

| Component | Purpose |
|-----------|---------|
| `gtfs-static.js` | Static GTFS schedule data |
| `preferences-manager.js` | User preferences storage |
| `data-scraper.js` | External data fetching |
| `data-validator.js` | Input validation |
| `fallback-timetables.js` | Offline fallback data |

### 17.3 Preferences Manager

```javascript
// Preferences flow
Token -> Decode -> Validate -> Merge defaults -> Return config

// Supported preferences
{
  addresses: { home, work, cafe },
  locations: { home, work, cafe },  // lat/lng
  journey: { arrivalTime, coffeeEnabled, coffeeDuration },
  apiKeys: { transit, google },
  state: 'VIC',
  apiMode: 'cached' | 'live'
}
```

### 17.4 Fallback Timetables

When API is unavailable, system falls back to cached timetables:

```javascript
// Fallback selection
if (apiUnavailable || !apiKey) {
  return loadFallbackTimetable(state);
  // Returns static schedule-based journey
}
```

---

## 18. Multi-State Transit Support

### 18.1 Overview

Commute Compute supports all Australian states with state-specific transit APIs and configurations.

### 18.2 State Detection

```javascript
// Auto-detect state from home address
function detectState(address) {
  const statePatterns = {
    VIC: /\b(VIC|Victoria|Melbourne|Geelong)\b/i,
    NSW: /\b(NSW|New South Wales|Sydney|Newcastle)\b/i,
    QLD: /\b(QLD|Queensland|Brisbane|Gold Coast)\b/i,
    // ... other states
  };

  for (const [state, pattern] of Object.entries(statePatterns)) {
    if (pattern.test(address)) return state;
  }
  return 'VIC'; // Default
}
```

### 18.3 Transit Authority Integration

| State | API | Auth Method | GTFS-RT |
|-------|-----|-------------|---------|
| VIC | OpenData | KeyId header | Yes |
| NSW | TfNSW | API Key header | Yes |
| QLD | TransLink | API Key | Yes |
| SA | Adelaide Metro | Basic Auth | Planned |
| WA | Transperth | API Key | Planned |

### 18.4 Weather by State

```javascript
const BOM_FORECAST_URLS = {
  VIC: 'https://www.bom.gov.au/fwo/IDV10753.xml',  // Melbourne
  NSW: 'https://www.bom.gov.au/fwo/IDN10064.xml',  // Sydney
  QLD: 'https://www.bom.gov.au/fwo/IDQ10095.xml',  // Brisbane
  SA: 'https://www.bom.gov.au/fwo/IDS10044.xml',   // Adelaide
  WA: 'https://www.bom.gov.au/fwo/IDW14199.xml',   // Perth
  // ... other states
};
```

---

## 19. Device Pairing System

### 19.1 Overview

Device provisioning uses a **hybrid two-phase approach**:
- **Phase 1 (BLE):** WiFi credentials sent via Bluetooth Low Energy
- **Phase 2 (Pairing Code):** Server configuration via 6-character code

This architecture avoids WiFiManager/captive portal which crashes ESP32-C3 with Guru Meditation (0xbaad5678).

### 19.2 Why Hybrid?

| Approach | Problem |
|----------|---------|
| WiFiManager / Captive Portal | **CRASHES** ESP32-C3 with 0xbaad5678 |
| BLE sends everything | Works, but couples WiFi and server config |
| **Hybrid (BLE + Pairing)** | Clean separation, no crashes, re-configurable |

### 19.3 Two-Phase Provisioning Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  PHASE 1: BLE WiFi Provisioning                                        │
│                                                                         │
│  ┌─────────────┐         BLE          ┌─────────────┐                  │
│  │   Phone     │ ────────────────────>>│   Device    │                  │
│  │   Browser   │   SSID + Password    │   ESP32     │                  │
│  │  (Chrome)   │      ONLY            │  (CCFirm)   │                  │
│  └─────────────┘                      └─────────────┘                  │
│                                              │                          │
│                                              v                          │
│                                        Saves WiFi creds                 │
│                                        Connects to WiFi                 │
│                                              │                          │
├──────────────────────────────────────────────┼──────────────────────────┤
│                                              │                          │
│  PHASE 2: Pairing Code Server Config         v                          │
│                                     ┌─────────────────┐                 │
│                                     │  Device shows:  │                 │
│                                     │  Code: A7X9K2   │                 │
│  ┌─────────────┐                    └────────┬────────┘                 │
│  │   Phone     │                             │                          │
│  │   Browser   │                             │ Polls GET /api/pair/CODE │
│  │  (any)      │                             │ every 5 seconds          │
│  └──────┬──────┘                             │                          │
│         │                                    v                          │
│         │ User enters code    ┌─────────────────────────┐               │
│         │ in Setup Wizard     │   Vercel Server         │               │
│         │                     │   (stores config in KV) │               │
│         │ POST config         └─────────────────────────┘               │
│         └─────────────────────────────────>>│                           │
│           to /api/pair/CODE                │                            │
│           (webhookUrl, prefs)              │ Device polls, receives     │
│                                            │ webhookUrl                 │
│                                            v                            │
│                                    ┌─────────────┐                      │
│                                    │   Device    │                      │
│                                    │   Ready!    │                      │
│                                    └─────────────┘                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 19.4 BLE Characteristics (Phase 1)

| UUID | Name | Direction | Purpose |
|------|------|-----------|---------|
| `CC000002-...` | SSID | Write | WiFi network name |
| `CC000003-...` | Password | Write | WiFi password |
| `CC000005-...` | Status | Read/Notify | Connection status |
| `CC000006-...` | WiFiList | Read | Available networks |

**Note:** Server URL is NOT sent via BLE -- it comes via pairing code in Phase 2.

### 19.5 Redis Integration (Phase 2)

**Critical for Serverless:** Vercel serverless functions are stateless. Each invocation may run on a different instance. Pairing data MUST be persisted in Redis to survive across function invocations.

```javascript
import { getClient } from '../src/data/kv-preferences.js';

const client = await getClient();

// Store pairing data with 10-minute TTL
await client.set(`cc:pair:${code}`, { webhookUrl, createdAt }, { ex: 600 });

// Retrieve pairing data (device polling)
const data = await client.get(`cc:pair:${code}`);
```

**Fallback:** In-memory store for local development when Redis is unavailable.

### 19.6 API Endpoints

| Endpoint | Method | Purpose | Storage |
|----------|--------|---------|---------|
| `/api/pair/[code]` | GET | Device polls for config | Read from KV |
| `/api/pair/[code]` | POST | Wizard submits config | Write to KV |

### 19.7 Pairing Code Format

```
XXXXXX (6 alphanumeric characters, uppercase)
Example: A3B7K9
Characters: A-Z, 0-9 (excluding ambiguous: 0, O, 1, I, L)
```

### 19.8 Device Polling Behaviour (Phase 2)

1. Device connects to WiFi (credentials from BLE Phase 1)
2. Device generates random 6-character code
3. Displays: "Code: A3B7K9" on e-ink
4. Polls GET `/api/pair/A3B7K9` every 5 seconds
5. Timeout after 10 minutes (matches KV TTL)
6. On success: receives `webhookUrl`, saves to Preferences
7. Transitions to normal dashboard fetch loop

### 19.9 Setup Wizard Flow

**Step 1: WiFi Provisioning (BLE)**
1. User clicks "Connect Device" in Setup Wizard
2. Browser requests Bluetooth permission (Chrome/Edge)
3. User selects "CommuteCompute-XXXX" device
4. Wizard reads WiFi network list via BLE
5. User selects network and enters password
6. Wizard sends SSID + password via BLE
7. Device saves and connects to WiFi

**Step 2: Server Configuration (Pairing Code)**
1. Device displays pairing code on e-ink screen
2. User enters 6-character code in Setup Wizard
3. User completes journey configuration
4. Wizard POSTs config to `/api/pair/{CODE}`
5. Device polls and receives webhookUrl
6. Device transitions to dashboard mode

### 19.10 Re-Configuration Scenarios

| Scenario | Action |
|----------|--------|
| Change WiFi network | Factory reset -> Re-provision via BLE |
| Change server/preferences | New pairing code (no BLE needed) |
| Move to new home | Factory reset -> Full re-provision |

### 19.11 Security Considerations

| Concern | Mitigation |
|---------|------------|
| Code guessing | 6-char alphanumeric = 2.1 billion combinations |
| Replay attacks | Codes deleted from KV after successful retrieval |
| Timing attacks | 10-minute TTL auto-expires stale codes |
| Network sniffing | HTTPS required for all communication |
| BLE sniffing | WiFi password only, not server config |

---

## 20. Health Monitoring

### 20.1 Overview

Health monitoring provides visibility into system status for debugging and alerting.

### 20.2 Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T06:00:00.000Z",
  "version": "6.0.0",
  "checks": {
    "opendata": { "status": "ok", "latencyMs": 120 },
    "weather": { "status": "ok", "latencyMs": 85 },
    "rendering": { "status": "ok" }
  },
  "uptime": 86400
}
```

### 20.3 Monitored Services

| Service | Check | Interval |
|---------|-------|----------|
| OpenData API | Connectivity | 60s |
| BOM Weather | Connectivity | 300s |
| Canvas Rendering | Test render | 300s |
| Memory | Heap usage | 60s |

---

## 21. Firmware Architecture (CCFirm(TM))

### 21.1 Overview

CCFirm(TM) is the custom firmware family for Commute Compute devices. All devices MUST run CCFirm(TM), not stock TRMNL firmware.

### 21.2 Firmware Variants

| Variant | Target Device | Status |
|---------|---------------|--------|
| CCFirmTRMNL | TRMNL OG, TRMNL Mini | Active |
| CCFirmKindle | Jailbroken Kindle | Active |
| CCFirmWaveshare | Waveshare e-ink | Planned |
| CCFirmESP32 | Generic ESP32 | Planned |

### 21.3 Boot Sequence (Hybrid Provisioning)

```
1. setup() [<5 seconds, NO NETWORK]
   +-- Disable brownout detection
   +-- Initialize serial
   +-- Allocate zone buffer
   +-- Initialize display (bb_epaper)
   +-- Show boot logo
   +-- Load settings from Preferences
   +-- Set initial state based on saved credentials

2. loop() [State machine - Hybrid Provisioning]

   STATE_INIT
       │
       v
   STATE_CHECK_CREDENTIALS ---- Has WiFi? ---- Yes --->> STATE_WIFI_CONNECT
       │                                                      │
       No                                                     │
       v                                                      │
   STATE_BLE_PROVISION                                        │
       │ Display BLE setup screen                             │
       │ Advertise as "CommuteCompute-XXXX"                   │
       │ Wait for SSID + Password via BLE                     │
       │ (NO URL - that comes via pairing code)               │
       v                                                      │
   STATE_WIFI_CONNECT <<──────────────────────────────────────┘
       │ Connect to saved WiFi network
       │
       v
   STATE_CHECK_SERVER_URL ---- Has URL? ---- Yes --->> STATE_FETCH_ZONES
       │
       No (first boot or reset)
       v
   STATE_PAIRING_MODE
       │ Generate 6-character pairing code
       │ Display code on e-ink screen
       │ Poll GET /api/pair/[code] every 5 seconds
       │ Timeout after 10 minutes
       │ On success: save webhookUrl to Preferences
       v
   STATE_FETCH_ZONES
       │ Fetch zone data from server
       v
   STATE_RENDER
       │ Draw zones to display
       v
   STATE_IDLE
       │ Wait for refresh interval (60s partial, 300s full)
       └── (loop back to STATE_FETCH_ZONES)
```

### 21.4 Polling Loop (Current Implementation)

> **Note:** Deep sleep mode is under development. The current firmware uses a polling loop
> with `delay()` rather than hardware deep sleep. USB-C power is required for continuous operation.

```
┌───────────────┐
│  STATE_IDLE   │
│               │
│  Wait 60s     │
│  (partial)    │
│  or 300s      │
│  (full)       │
└───────┬───────┘
        │
        v
┌───────────────┐
│  Polling      │
│  delay()      │
│  (USB-C       │
│   powered)    │
└───────┬───────┘
        │ Timer fires
        v
┌───────────────┐
│  FETCH        │
│  -> RENDER    │
│  -> IDLE      │
└───────────────┘
```

### 21.5 Partial Refresh Cycle

```
1. Firmware polls after delay interval
2. Connects to WiFi (saved credentials)
3. GET /api/zones?token=<token>
4. Parse JSON response
5. For each zone where changed=true:
   a. Decode base64 BMP data
   b. Set partial refresh window (x, y, w, h)
   c. Write BMP to display buffer
   d. Trigger partial refresh
6. Wait 60 seconds before next poll
```

### 21.6 Critical Requirements

| Requirement | Reason |
|-------------|--------|
| NO network in setup() | Prevents brick |
| NO deepSleep() in setup() | Prevents brick |
| NO allocBuffer() | ESP32-C3 incompatibility |
| FONT_8x8 only | Avoids rotation bug |
| 40KB zone buffer | Fits legs zone |
| Bottom-up BMP | bb_epaper requirement |

### 21.7 Pin Configuration (TRMNL OG)

| Signal | GPIO | Note |
|--------|------|------|
| SCK | 7 | SPI Clock |
| MOSI | 8 | SPI Data |
| CS | 6 | Chip Select |
| DC | 5 | Data/Command |
| RST | 10 | Reset |
| BUSY | 4 | Busy signal |
| INT | 2 | Button interrupt |

---

## 22. Redis Storage

### 22.1 Overview

Redis (via Vercel Marketplace) provides persistent, serverless key-value storage for API keys and user preferences. This replaces environment variables for Zero-Config compliance.

### 22.2 What Is Stored

| Key | Type | Purpose |
|-----|------|---------|
| `transit-api-key` | string | Transport Victoria OpenData API key |
| `google-api-key` | string | Google Places API key (optional) |
| `preferences` | JSON | User preferences from Setup Wizard |
| `device-config` | JSON | Device configuration |
| `last-validated` | timestamp | Last API key validation time |
| `pair:<CODE>` | JSON | Temporary pairing data (10 min TTL) |

### 22.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VERCEL KV STORAGE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────┐     ┌──────────────────────┐                 │
│  │  Setup Wizard        │---->>  POST /api/save-     │                 │
│  │  (enters API keys)   │     │  transit-key         │                 │
│  └──────────────────────┘     └──────────┬───────────┘                 │
│                                          │                              │
│                                          v                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      VERCEL KV STORE                             │  │
│  │                                                                   │  │
│  │  transit-api-key: "YOUR_API_KEY_HERE..."                         │  │
│  │  google-api-key:  "AIzaSy..."                                    │  │
│  │  preferences:     { addresses: {...}, journey: {...} }           │  │
│  │  device-config:   { webhookUrl: "...", deviceId: "..." }         │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                          │                              │
│                                          v                              │
│  ┌──────────────────────┐     ┌──────────────────────┐                 │
│  │  /api/zones          │---->>  getTransitApiKey()  │                 │
│  │  (runtime request)   │     │  reads from KV       │                 │
│  └──────────────────────┘     └──────────────────────┘                 │
│                                                                         │
│  [+] Zero-Config: No environment variables needed                      │
│  [+] Secure: Keys stored in Redis (AES-256 encrypted)         │
│  [+] Portable: Config moves with Vercel project                        │
│  [+] Serverless: No persistent storage required                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 22.4 Access Pattern

```javascript
import { getTransitApiKey } from '../src/data/kv-preferences.js';

// Read API key from Redis (Zero-Config compliant)
const apiKey = await getTransitApiKey();

// PROHIBITED: Direct @vercel/kv import (deprecated)
// import { kv } from '@vercel/kv';

// PROHIBITED: Environment variables
// const apiKey = process.env.TRANSIT_API_KEY;
```

---

## 23. GTFS-RT Data Flow

### 23.1 Overview

CommuteCompute(TM) uses GTFS-RT (General Transit Feed Specification - Realtime) for live transit data. Direction-specific stop IDs are critical for correct journey calculation.

### 23.2 Protobuf Parsing

GTFS-RT data arrives as Protocol Buffer (protobuf) encoded messages. CommuteCompute parses these into usable JavaScript objects:

```javascript
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

// Parse protobuf response
const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
  new Uint8Array(buffer)
);

// Extract entities
for (const entity of feed.entity) {
  if (entity.tripUpdate) {
    processTripUpdate(entity.tripUpdate);
  }
  if (entity.alert) {
    processServiceAlert(entity.alert);
  }
}
```

### 23.3 Trip Updates

Trip updates provide real-time departure predictions:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `minutes` | number | Yes | Minutes until departure |
| `destination` | string | Yes | Display destination ("City Loop" or line name) |
| `isCitybound` | boolean | Yes | Direction flag |
| `finalStop` | string | Yes | Terminus stop ID |
| `routeId` | string | Yes | GTFS route identifier |
| `isLive` | boolean | Yes | Live vs scheduled data |
| `delay` | number | Yes | Delay in minutes |
| `source` | string | Yes | Data source ("gtfs-rt" or "fallback") |

### 23.4 Service Alerts

Service alerts are parsed and displayed in the status bar when they affect the user's configured route.

### 23.5 Stop ID Architecture

**GTFS-RT uses direction-specific stop IDs.** Each platform at a station has a unique ID.

| Station | Stop ID | Platform | Direction | Destination |
|---------|---------|----------|-----------|-------------|
| South Yarra | `12179` | PKM/CBE citybound | -> City | Parliament via City Loop |
| South Yarra | `14295` | FKN citybound | -> City | Flinders Street |
| South Yarra | `14271` | SHM outbound | -> Suburbs | Sandringham |

### 23.6 Citybound Detection

```javascript
/**
 * Check if a stop ID is in the Melbourne City Loop area
 * City Loop stations: Parliament, Melbourne Central, Flagstaff, Southern Cross
 */
function isCityLoopStop(stopId) {
  if (!stopId) return false;
  // 26xxx = City Loop, 12204/12205 = Flinders St
  return stopId.startsWith('26') || stopId === '12204' || stopId === '12205';
}

// In processGtfsRtDepartures():
const finalStop = stops[stops.length - 1]?.stopId;
const isCitybound = isCityLoopStop(finalStop);
const destination = isCitybound ? 'City Loop' : getLineName(routeId);
```

### 23.7 Line Name Extraction

```javascript
function getLineName(routeId) {
  // GTFS route ID: "aus:vic:vic-02-XXX:"
  const match = routeId.match(/vic-\d+-([A-Z]+)/i);
  if (!match) return routeId;

  const lineNames = {
    'PKM': 'Pakenham', 'CBE': 'Cranbourne', 'FKN': 'Frankston',
    'SHM': 'Sandringham', 'GLW': 'Glen Waverley', 'ALM': 'Alamein',
    'BEL': 'Belgrave', 'LIL': 'Lilydale', 'HBE': 'Hurstbridge',
    'MER': 'Mernda', 'CRB': 'Craigieburn', 'SUN': 'Sunbury',
    'UPF': 'Upfield', 'WER': 'Werribee', 'WIL': 'Williamstown'
  };

  return lineNames[match[1].toUpperCase()] || match[1];
}
```

---

## 24. Turnkey Compliance

### 24.1 Principle

The repository MUST be completely **turnkey** -- any user can fork/clone and deploy immediately without removing someone else's personal data. This is enforced by DEVELOPMENT-RULES.md v1.26.

### 24.2 Prohibited Hardcoding

| Prohibited | Reason | Correct Approach |
|------------|--------|------------------|
| Home/work/cafe addresses | Personal location data | Setup Wizard -> Redis |
| API keys | Security risk | Setup Wizard -> Redis |
| WiFi credentials | Device-specific | User configures before flash |
| Stop IDs for specific locations | Location-specific | Auto-detect or user preference |
| Lat/lon coordinates | Personal location | Geocode from user addresses |

### 24.3 Allowed Defaults

| Allowed | Example | Reason |
|---------|---------|--------|
| City centre coordinates | Melbourne CBD: -37.8136, 144.9631 | Generic fallback |
| Public infrastructure names | South Yarra, Parliament, Collins St | Official PTV names |
| Example addresses in comments | "e.g., 123 Example St" | Documentation only |
| Sample config template | `config/sample-journey.json` | Clearly marked sample |

### 24.4 Verification

```bash
# Pre-commit check for personal data
grep -rn "Clara\|Toorak\|Norman" src/ api/ --include="*.js" \
  | grep -v "test\|example\|sample" && echo "PERSONAL DATA FOUND" \
  || echo "Turnkey compliant"
```

---

## References

- [DEVELOPMENT-RULES.md](../DEVELOPMENT-RULES.md) -- All development rules (v1.28)
- [specs/CCDashDesignV15.md](../specs/CCDashDesignV15.md) -- Dashboard specification V15.0 (UNLOCKED)
- [firmware/ANTI-BRICK-REQUIREMENTS.md](../firmware/ANTI-BRICK-REQUIREMENTS.md) -- Firmware safety rules
- [firmware/BOOT-SEQUENCE.md](../firmware/BOOT-SEQUENCE.md) -- Boot sequence documentation
- [firmware/PAIRING-SPEC.md](../firmware/PAIRING-SPEC.md) -- Device pairing specification
- [PROJECT-VISION.md](PROJECT-VISION.md) -- Project goals and roadmap
- [CHANGELOG.md](CHANGELOG.md) -- Version history

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 6.0 | 2026-02-07 | **Engine Rename and V15.0 Spec**: Renamed SmartCommute to CommuteCompute throughout. Updated to CCDash V15.0 (UNLOCKED) with new dashboard layout: Sleep mode, Alt Transit cost panel, Mindset status bar, enhanced glanceability. Added sub-engines (DepartureConfidence, LifestyleContext, SleepOptimizer, AltTransit). FRIDAY TREAT for CoffeeDecision. Alternate routes shown only when primary confidence < 40%. Metro Tunnel Compliance promoted to standalone section. All references updated to GitLab. Development Rules v1.26. |
| 5.4 | 2026-02-01 | **Hybrid BLE + Pairing Provisioning**: Major update to Device Pairing and Firmware Architecture. Documents two-phase provisioning: Phase 1 (BLE WiFi only) and Phase 2 (Pairing code for server config). |
| 5.2 | 2026-01-31 | **Simplified System Architecture Diagrams**: Added high-level trademark-based architecture diagram. Updated all diagrams to use trademark family names consistently. |
| 5.1 | 2026-01-31 | **Trademark Family File Registry**: Added comprehensive mapping of all trademarked components to their constituent files. |
| 5.0 | 2026-01-31 | **Alignment with DEVELOPMENT-RULES.md v1.14**: Added Vercel KV Storage, GTFS-RT Data Flow, Turnkey Compliance. |
| 4.0 | 2026-01-30 | Major update: Added Journey Display Module, Data Layer, Multi-State Support, Device Pairing, Health Monitoring, CCFirm Architecture. |
| 3.0 | 2026-01-29 | Added IP notice, Setup Wizard, Free-Tier architecture |
| 2.0 | 2026-01-26 | Zone-based refresh, multi-device support |
| 1.0 | 2026-01-25 | Initial architecture document |

---

**Document Version:** 6.0
**Development Rules:** v1.28
**Copyright (c) 2026 Commute Compute System(TM) by Angus Bergman -- AGPL-3.0 Dual Licence**
