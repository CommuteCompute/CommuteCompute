<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# End-to-End Testing Checklist

**Version**: 2.0.0  
**Last Updated**: 2026-02-03  
**System**: Commute Compute System v3.1.0  
**Spec**: CCDashDesignV15.0 (LOCKED)
**Firmware**: CC-FW-7.7.0 (UNLOCKED)
**Architecture**: Zero-Config Serverless (Vercel + KV)

---

## [CRITICAL] Pre-Testing Requirements

### Mandatory Documentation Review

Before ANY testing, read and understand:

- [ ] `DEVELOPMENT-RULES.md` v1.22 — All applicable sections
- [ ] `specs/CCDashDesignV15.md` — Dashboard specification V15.0 (LOCKED)
- [ ] This checklist — Follow exactly, no improvisation

### Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Setup Wizard   │────▶│  Redis  │────▶│  Device Webhook │
│  (Browser)      │     │  (API Keys)     │     │  (/api/screen)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Config Token   │     │ CommuteCompute™ │     │  CCDash™ V15.0  │
│  (Base64URL)    │     │  Engine         │     │  Renderer       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Key Principles**:
- [YES] Zero-Config: Users NEVER edit .env files or server environment variables
- [YES] Self-Hosted: NO usetrmnl.com or TRMNL cloud services
- [YES] KV Storage: API keys stored in Redis (encrypted at rest)
- [YES] Config Tokens: User preferences embedded in webhook URL

---

## Phase 1: Environment Setup

### 1.1 Vercel Project Setup

**Prerequisites**:
- [ ] Vercel account (free tier sufficient)
- [ ] GitLab repository forked/cloned
- [ ] Node.js 20.x installed locally

**Vercel Configuration**:
- [ ] Import project from GitLab
- [ ] Framework preset: Other
- [ ] Build command: (leave empty or `npm run build`)
- [ ] Output directory: `public`
- [ ] Install command: `npm install`

**Redis Setup** (MANDATORY):
- [ ] Navigate to: Vercel Dashboard → **Integrations** → **Browse Marketplace**
- [ ] Search for **Redis** → Select Upstash provider → Click **Install**
- [ ] Create Redis database — Region: **Sydney, Australia**
- [ ] Plan: **Free** (256MB, 500K commands/month)
- [ ] Name: `commute-compute-redis`
- [ ] Connect to your Commute Compute project
- [ ] Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` auto-injected

**Deployment Verification**:
- [ ] Push to GitLab triggers Vercel deploy (if enabled)
- [ ] OR manually deploy via Vercel dashboard
- [ ] Build completes without errors
- [ ] Deployment URL accessible

**Success Criteria**:
```
[DONE] Vercel project created
[DONE] KV database connected
[DONE] Deployment successful
[DONE] URL format: https://your-project.vercel.app
```

---

### 1.2 Local Development Setup

**Environment**:
- [ ] Clone repository: `git clone <your-fork>`
- [ ] Install dependencies: `npm install`
- [ ] Start local server: `npm start` or `vercel dev`

**Expected Console Output**:
```
[DONE] Commute Compute server starting...
[DONE] KV storage: connected (or: using fallback)
[DONE] Ready on http://localhost:3000
```

**Verify Endpoints**:
- [ ] `http://localhost:3000/` → Redirects to Setup Wizard
- [ ] `http://localhost:3000/admin` → Admin Panel
- [ ] `http://localhost:3000/api/health` → Health check JSON

---

## Phase 2: Setup Wizard Testing

### 2.1 Fresh User Flow (Zero-Config)

**Navigate to**: `https://your-project.vercel.app/setup-wizard.html`

**Step 1 — Welcome Screen**:
- [ ] CC logo displayed
- [ ] "Get Started" button visible
- [ ] No errors in browser console

**Step 2 — Location Setup**:
- [ ] Enter home address (Australian address)
  - [ ] Autocomplete suggestions appear (OSM Nominatim)
  - [ ] Can select from dropdown
- [ ] Enter work address
  - [ ] Autocomplete works
  - [ ] Different from home
- [ ] Enter cafe address (optional)
  - [ ] Can skip if coffee disabled
- [ ] State auto-detected from addresses

**Step 3 — Journey Preferences**:
- [ ] Arrival time selector (12-hour format, e.g., "9:00 AM")
- [ ] Coffee stop checkbox
- [ ] Walk times configurable

**Step 4 — API Keys (Optional)**:
- [ ] Transit API key field (Victoria: UUID format)
- [ ] Google Places API key field (optional)
- [ ] Skip button available (Zero-Config compliant)
- [ ] Keys saved to Redis on submit

**Step 5 — Device Pairing**:
- [ ] 6-character pairing code displayed
- [ ] QR code shown (links to webhook URL)
- [ ] "Waiting for device..." status
- [ ] Code refreshes if expired (10 min TTL)

**Success Criteria**:
```
[DONE] All steps complete without errors
[DONE] Config saved to localStorage + KV
[DONE] Pairing code generated
[DONE] Redirected to Admin Panel on completion
```

---

### 2.2 API Key Validation

**Transit API Key (Victoria)**:
- [ ] Enter valid UUID format key
- [ ] Click "Test Connection"
- [ ] Should show "[DONE] Connection successful"
- [ ] Invalid key shows clear error message

**Google Places API Key** (optional):
- [ ] Enter API key
- [ ] Click "Test"
- [ ] Autocomplete upgrades to Google Places
- [ ] Skip if not provided (uses OSM fallback)

**Zero-Config Verification**:
- [ ] NO .env file created
- [ ] NO manual environment variable setup
- [ ] All keys stored in Redis
- [ ] Keys retrievable via `/api/admin/preferences`

---

## Phase 3: Admin Panel Testing

### 3.1 Dashboard Tab

**Navigate to**: `/admin.html` → Dashboard tab

**Header Display** (per CCDashDesignV15.0):
- [ ] Location name (home address, truncated)
- [ ] Current time (12-hour format, e.g., "7:24")
- [ ] AM/PM indicator (separate element)
- [ ] Day of week (title case, e.g., "Monday")
- [ ] Date (full month, no year, e.g., "3 February")
- [ ] Temperature (°C, integer)
- [ ] Weather condition
- [ ] Umbrella icon (if rain predicted)

**Summary Bar**:
- [ ] Status indicator (NORMAL / DELAYED / DISRUPTION)
- [ ] "Leave in X min" or departure time
- [ ] Arrival time (e.g., "Arrive 9:00am")
- [ ] Total journey duration

**Journey Legs** (5 max visible):
- [ ] Walk leg: icon, destination, duration
- [ ] Coffee leg: cafe name, decision text, duration
- [ ] Transit legs: mode icon, route, platform, departures
- [ ] Each leg shows state (active/upcoming/delayed/skip)
- [ ] Times in 12-hour format

**Footer**:
- [ ] Destination address
- [ ] Arrival time

---

### 3.2 Live Preview Tab

**Navigate to**: Admin Panel → Live Preview

**Device Selector**:
- [ ] TRMNL OG (800×480) — default
- [ ] Kindle PW3 (758×1024)
- [ ] Kindle PW5 (1236×1648)
- [ ] Other supported devices

**Preview Display**:
- [ ] Renders at selected device resolution
- [ ] 1-bit black/white only (no grayscale)
- [ ] Matches CCDashDesignV15.0 spec exactly
- [ ] Updates on data change

**Scenario Testing**:
- [ ] `?demo=normal` — Standard journey
- [ ] `?demo=delayed` — Train delayed
- [ ] `?demo=disruption` — Service disruption
- [ ] `?demo=skip-coffee` — No time for coffee
- [ ] `?demo=friday-treat` — Friday coffee treat

---

### 3.3 API Settings Tab

**Stored Keys Display**:
- [ ] Transit API key: masked (shows first 8 chars + "...")
- [ ] Google Places key: masked
- [ ] Last validated timestamp
- [ ] Validation status indicator

**Key Management**:
- [ ] Update key → saves to KV
- [ ] Delete key → removes from KV
- [ ] Test button → validates against API

---

## Phase 4: Device Integration Testing

### 4.1 Hybrid Provisioning Flow (BLE + Pairing Code)

**[CAUTION] MANDATORY ARCHITECTURE** — Per Section 21.7, device uses two-phase hybrid provisioning.
WiFiManager/captive portal is FORBIDDEN (causes ESP32-C3 crash 0xbaad5678).

---

#### Phase 1: BLE WiFi Provisioning

**On Device**:
- [ ] Device boots, shows BLE setup screen
- [ ] Device advertises as "CC-XXXXXX" (BLE)
- [ ] CC logo + "Connect via Bluetooth" displayed

**On Phone (Setup Wizard or BLE app)**:
- [ ] Connect to device via Bluetooth
- [ ] Scan available WiFi networks (via BLE characteristic)
- [ ] Select WiFi network
- [ ] Enter WiFi password
- [ ] Send SSID + password via BLE (NO server URL in Phase 1)

**Phase 1 Completion**:
- [ ] Device receives WiFi credentials
- [ ] Device disconnects BLE
- [ ] Device connects to WiFi network
- [ ] Transitions to Phase 2

---

#### Phase 2: Pairing Code Configuration

**On Device**:
- [ ] Device displays 6-character pairing code
- [ ] Device displays server entry prompt
- [ ] Device shows: "Enter code at your-server.vercel.app/setup"

**On Setup Wizard (Browser)**:
- [ ] User completes address setup (home, work, cafe)
- [ ] User sees "Pair Device" step
- [ ] User enters 6-character pairing code
- [ ] Wizard posts config to `/api/pair/{code}`
- [ ] Code stored in Redis with 10-minute TTL

**On Device (Polling)**:
- [ ] Device polls `/api/pair/{code}` every 5 seconds
- [ ] Device receives webhook URL with config token
- [ ] Device stores webhook URL in NVS preferences

**Pairing Completion**:
- [ ] Setup Wizard shows "[DONE] Device paired!"
- [ ] Device immediately fetches first dashboard screen
- [ ] Device displays personalized journey

**Success Criteria**:
```
[DONE] BLE provisioning completes (Phase 1)
[DONE] Pairing code displayed after WiFi connect
[DONE] Pairing completes in < 60 seconds (Phase 2)
[DONE] Webhook URL contains config token
[DONE] Device displays dashboard after pairing
```

---

### 4.2 Re-Configuration Scenarios

| Scenario | Action Required |
|----------|-----------------|
| Change WiFi network | Factory reset → Re-provision via BLE (Phase 1+2) |
| Change server/preferences | New pairing code only (Phase 2 only, no BLE needed) |
| Change API keys | Update in Admin Panel → Device auto-refreshes |

---

### 4.3 Webhook Endpoint Testing

**Endpoint**: `GET /api/screen`

**Without Token** (demo mode):
```bash
curl https://your-project.vercel.app/api/screen
```
- [ ] Returns valid PNG image
- [ ] Content-Type: `image/png`
- [ ] Dimensions: 800×480
- [ ] Shows demo/random journey

**With Config Token**:
```bash
curl "https://your-project.vercel.app/api/screen?token=BASE64_CONFIG_TOKEN"
```
- [ ] Returns personalized dashboard
- [ ] Uses addresses from token
- [ ] Fetches live transit data (if API key in KV)

**Response Verification**:
- [ ] Response time < 3 seconds (cold) / < 1 second (warm)
- [ ] Image is pure 1-bit (black/white only)
- [ ] No anti-aliasing artifacts
- [ ] Text readable at e-ink resolution

---

### 4.4 Zone-Based Refresh Testing

**Endpoint**: `GET /api/zones`

**Response Format**:
```json
{
  "changed": ["header", "summary", "leg0"],
  "zones": {
    "header": { "x": 0, "y": 0, "w": 800, "h": 94, "bmp": "Qk..." },
    "summary": { "x": 0, "y": 96, "w": 800, "h": 28, "bmp": "Qk..." }
  }
}
```

**Verification**:
- [ ] Only changed zones returned
- [ ] BMP format: 1-bit, bottom-up
- [ ] Zone dimensions match CCDashDesignV15.0 spec
- [ ] Hash-based change detection working

---

## Phase 5: Firmware Testing

### 5.1 Firmware Verification (CC-FW-7.7.0)

**Firmware is UNLOCKED** for development and updates.

**Boot Sequence**:
- [ ] CC logo displayed on boot (2-3 seconds)
- [ ] WiFi connection initiated
- [ ] Server URL loaded from preferences
- [ ] First screen fetch attempted

**Display Cycle**:
- [ ] Partial refresh every 60 seconds
- [ ] Full refresh every 5 minutes
- [ ] `setLightSleep(true)` called after each refresh
- [ ] No visible ghosting after 10+ cycles

**Error Handling**:
- [ ] Network timeout → retry with backoff
- [ ] Invalid response → show error screen
- [ ] Never enters unrecoverable state

---

### 5.2 Anti-Brick Verification

Per DEVELOPMENT-RULES.md Section 1.4:

- [ ] `setup()` completes in < 5 seconds
- [ ] NO network operations in `setup()`
- [ ] NO `deepSleep()` in `setup()`
- [ ] State machine architecture in `loop()`
- [ ] Device recoverable via USB reflash

---

## Phase 6: Security Testing

### 6.1 XSS Prevention

**Test Input Sanitization**:
- [ ] Enter `<script>alert('XSS')</script>` in address field
- [ ] Verify script NOT executed in admin panel
- [ ] Verify script NOT rendered in dashboard image
- [ ] Check `sanitize()` function called on all user input

---

### 6.2 API Key Security

**Verification**:
- [ ] Keys never logged to console (check server logs)
- [ ] Keys stored in Redis (encrypted at rest)
- [ ] Keys masked in admin UI (first 8 chars only)
- [ ] Keys not visible in browser network tab (except on save)
- [ ] NO .env files in repository

---

### 6.3 Input Validation

**Address Fields**:
- [ ] Max length enforced (500 chars)
- [ ] Script tags rejected
- [ ] SQL-like patterns harmless (no SQL database)

**API Key Fields**:
- [ ] UUID format validated (for Transit API)
- [ ] Length checks applied
- [ ] Invalid format shows clear error

---

### 6.4 Rate Limiting

Per DEVELOPMENT-RULES.md Section 17.11:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/screen` (webhook) | 60 req | 1 hour |
| `/api/admin/*` | 20 req | 1 minute |
| `/api/pair/*` | 10 req | 1 minute |

- [ ] Exceeding limit returns 429
- [ ] `X-RateLimit-Remaining` header present
- [ ] Retry-After header on 429 response

---

## Phase 7: Multi-State Testing

### 7.1 Victoria (VIC)

- [ ] Enter Melbourne address
- [ ] State detected: "VIC"
- [ ] Transit API: Transport Victoria OpenData
- [ ] Modes: Train, Tram, Bus
- [ ] Timezone: Australia/Melbourne

### 7.2 New South Wales (NSW)

- [ ] Enter Sydney address
- [ ] State detected: "NSW"
- [ ] Transit API: TfNSW Open Data
- [ ] Modes: Train, Bus, Ferry
- [ ] Timezone: Australia/Sydney

### 7.3 Queensland (QLD)

- [ ] Enter Brisbane address
- [ ] State detected: "QLD"
- [ ] Transit API: TransLink
- [ ] Modes: Train, Bus, Ferry
- [ ] Timezone: Australia/Brisbane

---

## Phase 8: Performance Testing

### 8.1 Response Times

| Endpoint | Target | Acceptable |
|----------|--------|------------|
| `/api/health` | < 100ms | < 500ms |
| `/api/screen` (cached) | < 500ms | < 1s |
| `/api/screen` (uncached) | < 2s | < 5s |
| `/api/zones` | < 300ms | < 1s |

**Measurement**:
```bash
time curl -o /dev/null -s https://your-project.vercel.app/api/health
```

---

### 8.2 Cold Start Performance

Vercel serverless cold start:
- [ ] First request after idle: < 5 seconds
- [ ] Subsequent requests: < 1 second
- [ ] No timeout errors (504)

---

## Phase 9: Complete User Journey

### 9.1 New User Scenario

**Steps**:
1. [ ] User forks GitLab repository
2. [ ] User imports to Vercel
3. [ ] User creates Redis database
4. [ ] User deploys (auto or manual)
5. [ ] User flashes device with CC-FW-7.7.0 (if not pre-flashed)
6. [ ] **Phase 1 (BLE)**: User provisions device WiFi via Bluetooth
   - [ ] Device shows BLE setup screen
   - [ ] User connects phone to device via BLE
   - [ ] User sends WiFi SSID + password
   - [ ] Device connects to WiFi
7. [ ] **Phase 2 (Pairing)**: Device displays 6-character pairing code
8. [ ] User navigates to `/setup-wizard.html`
9. [ ] User enters home, work, cafe addresses
10. [ ] User optionally adds Transit API key
11. [ ] User enters pairing code from device
12. [ ] Device receives webhook URL and displays dashboard
13. [ ] Dashboard refreshes every 60 seconds

**Success Criteria**:
```
[DONE] Total setup time < 30 minutes
[DONE] Zero crashes or errors
[DONE] $0 monthly cost (free tier)
[DONE] No .env files edited
[DONE] No manual environment variables
```

---

## Test Results Summary

### Pass/Fail Matrix

| Phase | Category | Items | Pass | Fail | Status |
|-------|----------|-------|------|------|--------|
| 1 | Environment Setup | 10 | __ | __ | [ ] |
| 2 | Setup Wizard | 15 | __ | __ | [ ] |
| 3 | Admin Panel | 12 | __ | __ | [ ] |
| 4 | Device Integration | 10 | __ | __ | [ ] |
| 5 | Firmware | 8 | __ | __ | [ ] |
| 6 | Security | 10 | __ | __ | [ ] |
| 7 | Multi-State | 6 | __ | __ | [ ] |
| 8 | Performance | 5 | __ | __ | [ ] |
| 9 | Complete Journey | 13 | __ | __ | [ ] |
| **TOTAL** | | **89** | **__** | **__** | **[ ]** |

---

## Known Limitations

**Expected Behaviour (Not Bugs)**:
- [CAUTION] Vercel serverless cold starts (< 5s)
- [CAUTION] 60-second minimum refresh interval (firmware locked)
- [CAUTION] Redis required for API key storage
- [CAUTION] Device requires reflash with custom firmware

**Architecture Constraints**:
- No usetrmnl.com integration (self-hosted only)
- No real-time push updates (polling only)
- No user accounts (device-based identification)

---

## Testing Sign-Off

**Tester**: _________________  
**Date**: ____ / ____ / 2026  
**Version**: v3.1.0  
**Firmware**: CC-FW-7.7.0
**Spec**: CCDashDesignV15.0

**Overall Result**:
- [ ] [DONE] **PASS** — Ready for production
- [ ] [CAUTION] **PASS with issues** — Document in notes
- [ ] [NO] **FAIL** — Critical issues found

**Notes**:
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

**Document Status**: ACTIVE  
**Compliance**: DEVELOPMENT-RULES.md v1.22  
**Copyright**: © 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual Licence
