<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="220">
</p>

<h1 align="center">Commute Compute&#8482; System</h1>

<p align="center">
  <strong>Real-Time Commuter Intelligence for E-Ink Displays</strong>
</p>

<p align="center">
  <em>Other apps show delays. CommuteCompute&#8482; reacts to them. Live data flows into every decision- coffee, timing, connections. 1 glance. No app switching. Open Source.</em>
</p>

<br>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0_Dual_License-blue.svg?style=for-the-badge" alt="License: AGPL-3.0 Dual License"></a>
  &nbsp;
  <img src="https://img.shields.io/badge/Spec-CCDash%20V15.0-purple.svg?style=for-the-badge" alt="Spec: CCDash V15.0">
  &nbsp;
  <img src="https://img.shields.io/badge/Firmware-CC--FW--7.6.0-green.svg?style=for-the-badge" alt="Firmware: CC-FW-7.6.0">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-CC%20E--Ink%20%7C%20Kindle%20%7C%20Inkplate-orange.svg?style=flat-square" alt="Platform: CC E-Ink | Kindle | Inkplate">
  &nbsp;
  <img src="https://img.shields.io/badge/VIC%20(Live%20GTFS--RT)%20%7C%207%20States%20(Timetable)-yellow.svg?style=flat-square" alt="VIC (Live) | 7 States (Timetable)">
  &nbsp;
  <img src="https://img.shields.io/badge/Melbourne_Metro_Tunnel-Fully_Supported-0072CE.svg?style=flat-square" alt="Melbourne Metro Tunnel Supported">
</p>

<br>

---

<br>

## What Makes This Different

Commute Compute&#8482; is not another transit app. It is an open-source commuter intelligence system that renders a complete decision surface onto an 800x480 1-bit e-ink display. Everything a commuter needs is visible in a single glance from 1-2 meters away. No phone. No app switching. No scrolling.

Here is what no other commuter tool provides:

- **Single-glance intelligence on e-ink.** The entire commute -- departure countdowns, weather preparation, coffee feasibility, journey confidence, sleep optimization, and alternative transport costs -- rendered as one image. Readable from across a room.

- **Five interconnected intelligence engines.** CommuteCompute&#8482;, DepartureConfidence, LifestyleContext, SleepOptimizer, and AltTransit work together. A weather change affects clothing suggestions, walking speed estimates, coffee feasibility, and confidence scoring simultaneously. They do not operate in isolation.

- **Sleep optimization for next-day commute readiness.** No other transit tool calculates your optimal bedtime and alarm time based on tomorrow's journey duration, your wake routine, and desired sleep hours.

- **Alternative transport cost estimation.** When public transit is cancelled, the system instantly calculates rideshare, e-scooter, and bike share costs with peak surge detection. You see what it costs to get to work before you even leave the house.

- **Commute stress scoring and lifestyle preparation.** The system calculates apparent temperature, recommends umbrella/jacket/sunscreen, and provides a commute stress score. It tells you to bring layers before you step outside.

- **Melbourne Metro Tunnel compliance.** Full support for Melbourne's once-in-a-generation infrastructure change: 5 new underground stations, rerouted Pakenham/Cranbourne/Sunbury lines, and discontinued City Loop services. First-to-market for this routing change.

- **Zero-config setup via BLE provisioning.** No environment variables. No config files. Pair via Bluetooth, run the Setup Wizard, and you are live in under 5 minutes.

- **Graceful offline degradation.** When APIs are unreachable, the system falls back to cached data and static timetables. The display always shows something useful.

- **Fully open source under AGPL-3.0 (dual-licensed).** The complete system -- engines, renderer, firmware, setup wizard -- is available for inspection, modification, and self-hosting. A commercial license is also available for proprietary use.

<br>

---

<br>

## How It Works

You set your home address, work address, and target arrival time. The system does the rest.

Every 60 seconds, the system pulls live data from three sources, runs it through five intelligence engines, and renders a fresh dashboard image to your e-ink display.

Status timing follows user-intent logic: when departure is still far away (>120 minutes), the dashboard shows "if left now" context rather than judging on-time/late against the target arrival; target-arrival judgment activates in the actionable departure window.

```
 YOU CONFIGURE                    DATA SOURCES                    INTELLIGENCE ENGINES
+------------------+       +------------------------+       +---------------------------+
|                  |       |                        |       |                           |
|  Home Address    |       |  GTFS-RT Live Transit  |       |  1. CommuteCompute™       |
|  Work Address    | ----> |  BOM Weather API       | ----> |  2. DepartureConfidence   |
|  Arrival Time    |       |  Google Places API     |       |  3. LifestyleContext      |
|  Preferences     |       |                        |       |  4. SleepOptimizer        |
|                  |       +------------------------+       |  5. AltTransit            |
+------------------+               (live, cached)           +---------------------------+
                                                                        |
      STORAGE                       OUTPUT                              |
+------------------+       +------------------------+                   |
|                  |       |                        |                   |
|  Redis       | <---> |  800 x 480 1-bit BMP  | <-----------------+
|  (config, cache) |       |  Rendered by CCDash™   |
|                  |       |                        |
+------------------+       +------------------------+
                                      |
                            +------------------------+
                            |                        |
                            |  CC E-Ink (ESP32-C3)   |
                            |  Kindle E-Reader       |
                            |  Inkplate 6/10         |
                            |  Web Browser           |
                            |                        |
                            +------------------------+
```

The pipeline runs entirely serverless on Vercel. The device fetches a pre-rendered image -- no computation happens on the e-ink hardware.

<br>

---

<br>

## The Five Intelligence Engines

All five engines operate under the CommuteCompute&#8482; umbrella. They share data, influence each other, and produce a unified commute intelligence model.

### 1. CommuteCompute&#8482; Engine (v3.0)

Core journey orchestration with real-time multi-modal planning and Melbourne Metro Tunnel compliance.

| | |
|---|---|
| **Inputs** | Home/work addresses, transit API data, live GTFS-RT departures, stop IDs, cafe location, current time |
| **Outputs** | Optimized journey legs with live departure countdowns, total duration, arrival estimate, coffee decision |

**Example Scenario:**

```
INPUT:  Home: Richmond, Work: 80 Collins St, Target: 9:00am, Current: 8:22am
        Live GTFS-RT: Tram 70 next at 8:28, 8:36 | Train next at 8:41, 8:53
        Cafe: 3 min walk, avg 6 min wait

OUTPUT: LEAVE IN 6 MIN | ARRIVE 8:58am | 36 MIN TOTAL
        Leg 1: Walk to Cornerstone Cafe (3 min)
        Leg 2: Coffee stop (6 min) -- LEAVE 8:31am
        Leg 3: Walk to Swan St / Church St (2 min)
        Leg 4: Tram 70 to Flinders St -- DEPART 8:36am (next: 4, 12 min)
        Leg 5: Train to Flagstaff -- DEPART 8:41am (next: 5, 17 min)
        Leg 6: Walk to Office (5 min)

DISPLAY: [C] GET COFFEE | LEAVE IN 6 MIN | ARRIVE 8:58am
```

---

### 2. DepartureConfidence Engine

Journey success probability scoring from 0 to 100%.

| | |
|---|---|
| **Inputs** | Leg states, transit delay data, weather conditions, coffee decision, buffer time between legs |
| **Outputs** | Confidence score (0-100%), status label, resilience rating |

**Example Scenario:**

```
INPUT:  5 journey legs, Tram 70 running 3 min late, light rain, coffee included,
        8 min buffer at train connection

OUTPUT: Confidence: 74%
        Label: AT RISK
        Resilience: MODERATE (can absorb 1 missed connection)
        Factors: -12 tram delay, -8 weather, -6 coffee risk, +10 buffer

DISPLAY: CONFIDENCE 74% | AT RISK | "Buffer tight at Flinders connection"
```

---

### 3. LifestyleContext Engine

Weather-aware lifestyle suggestions and commute stress scoring.

| | |
|---|---|
| **Inputs** | Temperature, weather condition, wind speed, UV index, humidity, time of day, state |
| **Outputs** | Prioritized suggestions, mindset metrics (commute stress, walk steps, apparent temperature) |

**Example Scenario:**

```
INPUT:  Temp: 14C, Condition: Showers, Wind: 25km/h NW, UV: 3, Humidity: 82%,
        Time: 7:45am, State: VIC

OUTPUT: Suggestions: [UMBRELLA, JACKET, LAYERS]
        Apparent Temp: 10C (feels colder due to wind)
        Commute Stress: 6/10 (rain + wind + cold)
        Walk Steps: ~2,400 (across all walking legs)

DISPLAY: 14 Showers | UMBRELLA + JACKET | Feels 10C
```

---

### 4. SleepOptimizer Engine

Evening bedtime and alarm calculation for next-day commute readiness.

| | |
|---|---|
| **Inputs** | Target arrival time, journey duration, current time, wake routine duration, desired sleep hours |
| **Outputs** | Optimal bedtime, alarm time, sleep adequacy rating |

**Example Scenario:**

```
INPUT:  Target arrival: 9:00am, Journey: 45 min, Current time: 9:30pm,
        Wake routine: 30 min, Desired sleep: 8 hrs

OUTPUT: Bedtime: 11:45PM
        Alarm: 7:45AM
        Adequacy: OPTIMAL (8.0 hrs available, 8.0 hrs desired)

DISPLAY: BED BY 11:45PM | ALARM 7:45AM | SLEEP: OPTIMAL
```

```
INPUT:  Target arrival: 8:00am, Journey: 55 min, Current time: 11:45pm,
        Wake routine: 30 min, Desired sleep: 8 hrs

OUTPUT: Bedtime: NOW
        Alarm: 6:35AM
        Adequacy: INSUFFICIENT (6.8 hrs available, 8.0 hrs desired)

DISPLAY: GO TO BED NOW | ALARM 6:35AM | SLEEP: INSUFFICIENT
```

---

### 5. AltTransit Engine

Alternative transport cost estimation when public transit is cancelled or disrupted.

| | |
|---|---|
| **Inputs** | Walk distance to destination, current time, transit disruption notice |
| **Outputs** | Rideshare estimate ($), e-scooter estimate ($), bike share estimate ($), peak surge detection |

**Example Scenario:**

```
INPUT:  Distance: 6.2 km, Time: 8:15am (peak), Disruption: "Tram 70 suspended
        between Stop 14 and Flinders St due to emergency works"

OUTPUT: Rideshare: $18-24 (1.4x surge, peak morning)
        E-Scooter: $8.50 (unlock $1 + 22 min @ $0.34/min)
        Bike Share: $3.50 (30 min ride)
        Walk: 74 min (not recommended -- rain)

DISPLAY: ALT TRANSIT | Uber ~$21 | Scooter ~$9 | Bike $3.50
```

<br>

---

<br>

## Melbourne Metro Tunnel Compliance

The Melbourne Metro Tunnel is the city's largest public transport infrastructure project, opening progressively from 2025 into 2026. It introduces five new underground stations and fundamentally changes how train lines route through the CBD.

### What Changed

| Change | Detail |
|:-------|:-------|
| **5 new stations** | Arden, Parkville, State Library, Town Hall, Anzac |
| **Pakenham / Cranbourne lines** | Now routed through the Metro Tunnel instead of the City Loop |
| **Sunbury line** | Rerouted through the Metro Tunnel |
| **City Loop changes** | Several lines no longer loop through Flinders Street - Parliament - Melbourne Central - Flagstaff |
| **New interchange patterns** | Passengers transferring between lines must use new stations |

### How Commute Compute&#8482; Handles It

The CommuteCompute&#8482; Engine includes full Metro Tunnel compliance:

- **Updated stop IDs.** All five Metro Tunnel station GTFS stop IDs are registered and mapped.
- **Line routing awareness.** The engine knows which lines now use the tunnel and which still use the City Loop, preventing invalid route suggestions.
- **Citybound detection.** Updated CBD boundary detection accounts for the new underground stations when determining travel direction.
- **Real-time departures.** Live GTFS-RT data from Transport Victoria OpenData API includes Metro Tunnel services from day one.

This makes Commute Compute&#8482; one of the first commuter tools to fully support the new network topology -- a meaningful advantage for Melbourne commuters during the transition period.

<br>

---

<br>

## Architecture

```
+--------------------------------------------------------------------------+
|                          PRESENTATION LAYER                               |
|  Setup Wizard | Admin Panel | Simulator | Preview | Help                  |
+--------------------------------------------------------------------------+
|                            API LAYER                                      |
|  /api/screen | /api/zones | /api/livedash | /api/admin/* | /api/health   |
+--------------------------------------------------------------------------+
|                          SERVICE LAYER                                    |
|  CommuteCompute(TM) | CCDash(TM) | CC LiveDash(TM) | Weather (BOM)      |
+--------------------------------------------------------------------------+
|                        INTELLIGENCE LAYER                                 |
|  DepartureConfidence | LifestyleContext | SleepOptimizer | AltTransit    |
+--------------------------------------------------------------------------+
|                           DATA LAYER                                      |
|  OpenData Client (GTFS-RT) | BOM API | Google Places | Redis         |
+--------------------------------------------------------------------------+
```

### Data Flow

1. **User Configuration** is stored in Redis via the Setup Wizard (addresses, preferences, API keys).
2. **Data Sources** are polled on each request: GTFS-RT for live transit (30s cache), BOM for weather (5min cache), Google Places for cafe status.
3. **Five Intelligence Engines** process the combined data into a unified journey model.
4. **CCDash&#8482; Renderer** converts the data model into an 800x480 1-bit BMP image optimized for e-ink.
5. **The device** (CC E-Ink, Kindle, Inkplate, or browser) fetches the rendered image over HTTPS on a 60-second refresh cycle.

### Caching Strategy

| Data Source | Cache TTL | Reason |
|:------------|:----------|:-------|
| GTFS-RT Trip Updates | 30 seconds | Real-time accuracy for departure countdowns |
| GTFS-RT Service Alerts | 5 minutes | Disruption notices change infrequently |
| Static GTFS Timetables | 24 hours | Schedule data for fallback |
| Weather (BOM) | 5 minutes | Adequate freshness for preparation advice |
| Geocoding Results | Permanent | Resolved once at setup time |

<br>

---

<br>

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://gitlab.com/angusbergman/commute-compute-system)

### 2. Add Redis

Vercel Dashboard > Integrations > Browse Marketplace > **Redis** (Upstash) > Install > **Free** plan > Sydney region > Connect to project.

### 3. Run Setup Wizard

Open `https://your-project.vercel.app/setup-wizard.html` and follow the guided configuration (home, work, arrival time, API keys).

### 4. Flash Device (CC E-Ink)

**Option A: Browser Flasher (Recommended)**

Use the hosted browser flasher at `https://your-project.vercel.app/flasher/` (Chrome/Edge desktop required):

- CC E-Ink / ESP32-C3 firmware flashing via Web Serial
- Kindle package install (jailbroken + KUAL) to `extensions/commute-compute`

**Option B: PlatformIO CLI**

```bash
cd firmware && pio run -e trmnl -t upload
```

Embed snippet for docs pages that support iframes:

```html
<iframe
  src="https://your-project.vercel.app/flasher/"
  title="Commute Compute Device Flasher"
  width="100%"
  height="900"
  style="border:1px solid #d7e0eb;border-radius:12px;"
></iframe>
```


### 5. Pair and Go

The device connects via BLE, receives your server URL, and begins displaying your commute dashboard.

See **[SETUP_GUIDE.md](SETUP_GUIDE.md)** for detailed step-by-step instructions including API key setup, device pairing, and troubleshooting.

<br>

---

<br>

## Technology Stack

| Layer | Technology |
|:------|:-----------|
| **Runtime** | Node.js on Vercel Serverless Functions |
| **Rendering** | @napi-rs/canvas -- 800x480, 1-bit BMP generation |
| **Font** | Inter |
| **Transit Data** | Transport Victoria OpenData API (GTFS-RT) |
| **Weather Data** | Bureau of Meteorology (BOM) API |
| **Place Data** | Google Places API (cafe status, busyness -- optional) |
| **Storage** | Redis (via Vercel Marketplace, encrypted at rest) |
| **Firmware** | ESP32-C3 via PlatformIO / Arduino framework |
| **Frontend** | Vanilla HTML / CSS / JS -- zero framework dependency |
| **Provisioning** | Web Bluetooth (BLE) for zero-config device setup |

<br>

---

<br>

## Supported Devices

| Device | Resolution | Status |
|:-------|:-----------|:-------|
| CC E-Ink OG (ESP32-C3) | 800 x 480 | Primary target -- requires CCFirm&#8482; firmware |
| CC E-Ink Mini | 400 x 300 | Supported |
| Kindle Paperwhite 3/4/5 | 1072 x 1448 | Supported -- requires jailbreak |
| Kindle Basic 10/11 | 600 x 800 | Supported -- requires jailbreak |
| Inkplate 6 | 800 x 600 | Supported |
| Inkplate 10 | 1200 x 825 | Supported |
| Web Browser | Any | Full dashboard via `/api/screen` endpoint |

<br>

---

<br>

## Project Scale

| Metric | Value |
|:-------|:------|
| Source Files | 271 |
| Lines of Code | 112,000+ |
| Intelligence Engines | 5 |
| Development Rules Sections | 24 |
| Automated Compliance Checks | 214 |
| Australian Coverage | VIC (Live GTFS-RT), 7 States/Territories (timetable) |

<br>

---

<br>

## Documentation

| Document | Description |
|:---------|:------------|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Complete setup and installation guide |
| [SUPPORT.md](SUPPORT.md) | Support channels and troubleshooting |
| [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | Current known issues and workarounds |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history and release notes |
| [LEGAL.md](LEGAL.md) | Trademarks, intellectual property, and licensing |
| [PRIVACY.md](PRIVACY.md) | Privacy policy and data collection practices |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |

<br>

---

<br>

## Data Attribution

| Source | License | Usage |
|:-------|:--------|:------|
| Transport Victoria OpenData | CC BY 4.0 | Real-time and static transit data |
| Bureau of Meteorology | CC BY 3.0 AU | Weather observations and forecasts |
| OpenStreetMap | ODbL | Geocoding and mapping |

<br>

---

<br>

## Support the Project

Commute Compute&#8482; is developed and maintained by **Angus Bergman** as an open-source project.

<p align="center">
  <a href="https://buymeacoffee.com/angusbergman">
    <img src="https://img.shields.io/badge/Support_This_Project-Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
  </a>
</p>

| Type | How |
|:-----|:----|
| **Financial** | [buymeacoffee.com/angusbergman](https://buymeacoffee.com/angusbergman) |
| **Star the Repo** | Helps visibility and encourages continued development |
| **Report Issues** | [Open an issue](https://gitlab.com/angusbergman/commute-compute-system/-/issues) |
| **Contribute** | See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines |

<br>

---

<br>

## License

**AGPL-3.0 Dual License** -- [GNU Affero General Public License v3.0](LICENSE)

Copyright (c) 2026 Angus Bergman. All rights reserved.

This project is dual-licensed:

| License | Terms |
|:--------|:------|
| **Open Source (AGPL-3.0)** | Free to use, modify, and distribute. All modifications and network-accessible deployments must release source code under AGPL-3.0. |
| **Commercial License** | For proprietary/closed-source use without AGPL obligations. Contact for terms. |

For commercial licensing inquiries: **commutecompute.licensing@gmail.com**

<br>

---

<br>

## Trademarks

The following are unregistered trademarks owned by Angus Bergman:

**Commute Compute&#8482;** | **Commute Compute System&#8482;** | **CommuteCompute&#8482;** | **CCDash&#8482;** | **CC LiveDash&#8482;** | **CCFirm&#8482;**

See [LEGAL.md](LEGAL.md) for complete trademark and intellectual property details.

<br>

---

<br>

<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="80">
</p>

<p align="center">
  <strong>Commute Compute&#8482; System v4.2.0</strong><br>
  V15.0 Complete Journey Intelligence<br>
  CommuteCompute&#8482; Engine v3.1 | CCDash&#8482; Renderer v2.1 | CC LiveDash&#8482; v3.0 | Admin Panel v5.0 | CCFirm&#8482; CC-FW-7.6.0<br>
  <br>
  Copyright (c) 2026 Angus Bergman. All rights reserved.<br>
  <em>Built in Melbourne, Australia.</em>
</p>
