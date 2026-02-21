<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute System™ - Endpoint Monitor

Comprehensive monitoring system for the commute-compute that cycles through and continuously monitors all endpoints, pages, hyperlinks, and data flows.

## Quick Start

```bash
# Run a single check
npm run monitor

# Continuous monitoring (full output every 60s)
npm run monitor:continuous

# Watch mode (compact single-line status)
npm run monitor:watch

# Generate detailed JSON report
npm run monitor:report
```

## What Gets Monitored

### API Endpoints (12 endpoints)
| Endpoint | Priority | Description |
|----------|----------|-------------|
| `/api/health` | Critical | System health check |
| `/api/screen` | Critical | Full 800x480 PNG dashboard |
| `/api/zones` | Critical | Zone-based partial refresh |
| `/api/zones-tiered` | Standard | Tiered refresh strategy |
| `/api/zonedata` | Standard | Zone metadata |
| `/api/fullscreen` | Standard | Full-screen PNG variant |
| `/api/livedash` | Standard | Multi-device renderer |
| `/api/address-search` | Standard | Geocoding service |
| `/api/cafe-details` | Standard | Cafe busyness data |
| `/api/status` | Standard | Server status |
| `/api/system-status` | Standard | Detailed system info |
| `/api/version` | Standard | Version information |

### HTML Pages (9 pages)
| Page | Description |
|------|-------------|
| `/` | Landing page |
| `/setup-wizard.html` | Interactive setup wizard |
| `/admin.html` | Full admin panel |
| `/preview.html` | Dashboard preview |
| `/simulator.html` | TRMNL device simulator |
| `/device-simulator.html` | Multi-device simulator |
| `/journey-display.html` | Journey visualization |
| `/help.html` | Documentation |
| `/attribution.html` | Data source credits |

### External APIs (5 services)
| Service | Requires Key | Description |
|---------|--------------|-------------|
| Transport Victoria Metro GTFS-RT | Yes | Metro train real-time data |
| Transport Victoria Tram GTFS-RT | Yes | Tram real-time data |
| Transport Victoria Bus GTFS-RT | Yes | Bus real-time data |
| BOM Weather | No | Bureau of Meteorology |
| Nominatim | No | OpenStreetMap geocoding |

### Hyperlinks (12 links)
All navigation links and action buttons across pages.

### Data Flows (4 flows)
| Flow | Description |
|------|-------------|
| Transit → Render | GTFS-RT to dashboard rendering |
| Weather → Render | BOM to header rendering |
| Config Token | Token decoding across endpoints |
| Zone Refresh | Partial refresh pipeline |

## Command Line Options

```
node monitor/monitor.mjs [options]

Options:
  --continuous, -c    Run continuously with full output
  --watch, -w         Watch mode (compact single-line status)
  --report, -r        Generate full JSON report
  --help, -h          Show help
```

## Environment Variables

```bash
# Override target URL (default: https://your-project.vercel.app)
MONITOR_BASE_URL=https://your-deployment.vercel.app

# Config token for testing authenticated endpoints
SAMPLE_CONFIG_TOKEN=your_base64_token
```

## Output Modes

### Single Check (default)
Runs all checks once with full details and resolution guides.

```
═══════════════════════════════════════════════════════════════
COMMUTE COMPUTE SYSTEM™ - ENDPOINT MONITOR
Target: https://your-project.vercel.app
═══════════════════════════════════════════════════════════════

━━━ API ENDPOINTS ━━━

✓ [API] health
  URL: https://your-project.vercel.app/api/health
  Status: 200 | Time: 245ms

✗ [API] screen
  URL: https://your-project.vercel.app/api/screen
  Status: 400 | Time: 123ms
  Error: Unexpected status: 400

═══ RESOLUTION GUIDE ═══
FAILURE: /api/screen not rendering
CAUSES:
1. Missing config token
...
```

### Continuous Mode
Full output every 60 seconds with iteration tracking.

### Watch Mode
Compact single-line status that updates in place:

```
14:32:45 | ✓ HEALTHY | API: 12/12 | Pages: 9/9 | Links: 12/12 | Flows: 4/4
```

### Report Mode
Generates a JSON file in `monitor/reports/` with complete results and failure analysis.

## Resolution Guides

Each monitored item includes a detailed resolution guide that explains:
- Common failure causes
- Step-by-step resolution procedures
- Fallback behaviours
- Debugging commands

See `RESOLUTION-GUIDE.md` for the complete troubleshooting reference.

## Failure Detection

The monitor tracks:
- HTTP status codes
- Response times (warns if > 10s)
- Expected content types
- Expected page elements
- Data flow sequences

### Alert Thresholds
- **Consecutive failures**: 3 (tracked across iterations)
- **Slow response**: > 10,000ms

## Files

```
monitor/
├── README.md           # This file
├── RESOLUTION-GUIDE.md # Complete troubleshooting reference
├── config.mjs          # Endpoint configuration
├── monitor.mjs         # Main monitoring script
└── reports/            # Generated JSON reports
```

## Integration Ideas

### Cron Job (Hourly Report)
```bash
0 * * * * cd /path/to/commute-compute && npm run monitor:report
```

### Systemd Service (Continuous)
```ini
[Unit]
Description=CCDash™ Endpoint Monitor
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/commute-compute
ExecStart=/usr/bin/node monitor/monitor.mjs --continuous
Restart=always

[Install]
WantedBy=multi-user.target
```

### External Alerting
The JSON reports can be parsed by external systems (Slack, Discord, PagerDuty, etc.) for alerting.

## Licence

AGPL-3.0 Dual Licence - Part of the Commute Compute System™
