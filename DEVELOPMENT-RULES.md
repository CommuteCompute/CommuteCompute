<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Development Rules

**MANDATORY COMPLIANCE DOCUMENT**
**Version:** 1.28
**Last Updated:** 2026-02-07
**Copyright (c) 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual Licence**

These rules govern all development on Commute Compute. Compliance is mandatory.

---

## [NAMING] Section 0: Naming Conventions

### 0.1 Official Names

| Component | Full Name | Short Name | Usage |
|-----------|-----------|------------|-------|
| **System** | Commute Compute System | Commute Compute / CC | General references |
| **Repository** | CommuteCompute | — | GitLab repo |
| **Dashboard Design** | CCDashDesignV15.0 | CCDash | Dashboard specification (UNLOCKED) |
| **Dashboard Renderer** | CCDash Renderer v2.1 | CCDash | Renders CCDashDesignV15.0 to PNG/BMP |
| **Multi-Device Renderer** | CC LiveDash | LiveDash | LiveDash endpoint/service |
| **Journey Engine** | CommuteCompute | CommuteCompute | Journey + coffee calculations |

### 0.2 Code Naming

| Context | Pattern | Example |
|---------|---------|---------|
| CSS classes | `cc-*` | `cc-header`, `cc-journey-leg` |
| HTML IDs | `cc-*` | `cc-config-panel` |
| localStorage keys | `cc-*` | `cc-config`, `cc-onboarding-completed` |
| Variables | `cc*` or descriptive | `ccConfig`, `dashboardState` |

### 0.3 Legacy References

The system was previously known as "Commute Compute". Update any remaining references:

| Old | New |
|-----|-----|
| Commute Compute | Commute Compute |
| commute-compute | commute-compute |
| commutecompute | commutecompute |
| commute-compute-config | cc-config |
| V10 Dashboard | CCDashDesignV15.0 |
| V10 spec | CCDashDesignV15.0 spec |
| v13 renderer | CCDash Renderer v2.1 |
| zone-renderer-v13.js | ccdash-renderer.js |
| LiveDash (standalone) | CC LiveDash |

**Note:** "CommuteCompute" is the journey calculation engine name (renamed from SmartCommute, 2026-02-07).

---

## Document Index

### Main Sections

| # | Section | Priority | Description |
|---|---------|----------|-------------|
| 0 | [Naming Conventions](#-section-0-naming-conventions) | [CRITICAL] | Official names, code patterns, legacy references |
| 1 | [Absolute Prohibitions — PTV API](#-section-1-absolute-prohibitions--ptv-api-naming--exclusions) | [CRITICAL] | Forbidden terms, legacy API prohibition, anti-brick rules |
| 2 | [TRMNL/usetrmnl Prohibition](#-section-2-trmluseusetrmnl-prohibition) | [CRITICAL] | Express prohibition on third-party TRMNL dependencies |
| 3 | [Zero-Config Serverless Architecture](#-section-3-zero-config-serverless-architecture) | [CRITICAL] | Config token system, no .env files |
| 4 | [System Architecture Rules](#-section-4-system-architecture-rules) | [CRITICAL] | Distribution model, boundaries, data flow, endpoints |
| 5 | [Custom Firmware Requirement](#-section-5-custom-firmware-requirement) | [CRITICAL] | TRMNL hardware specs, firmware requirements, flashing |
| 6 | [Compatible Kindle Devices](#-section-6-compatible-kindle-devices) | [HIGH] | Supported models, jailbreak, kindle-dash setup |
| 7 | [Spec Integrity](#-section-7-spec-integrity) | [CRITICAL] | Spec immutability, zone boundaries |
| 8 | [Design Specification (LOCKED)](#-section-8-design-specification-locked) | [CRITICAL] | Display dimensions, layout, colours, icons, states |
| 9 | [E-ink Constraints](#-section-9-e-ink-constraints) | [HIGH] | 1-bit depth, partial refresh, no anti-aliasing |
| 10 | [BMP Rendering Rules](#-section-10-bmp-rendering-rules) | [HIGH] | Output format, memory constraints, zone refresh |
| 11 | [API & Data Rules](#-section-11-api--data-rules) | [HIGH] | GTFS-RT, caching, weather, Google Places |
| 12 | [Business Logic](#-section-12-business-logic) | [HIGH] | CoffeeDecision, 12h time, journey math |
| 13 | [Code Quality](#-section-13-code-quality) | [MEDIUM] | Dependencies, error states, magic numbers |
| 14 | [Testing Requirements](#-section-14-testing-requirements) | [HIGH] | Pre-commit checklist, firmware/server testing |
| 15 | [Deployment Rules](#-section-15-deployment-rules) | [HIGH] | Vercel, version tagging, firmware releases |
| 16 | [Documentation Standards](#-section-16-documentation-standards) | [MEDIUM] | File naming, required sections |
| 17 | [Security](#-section-17-security) | [CRITICAL] | XSS, secrets, supply chain, CSP, rate limiting, input validation, encryption |
| 18 | [Change Management](#-section-18-change-management) | [HIGH] | Locked elements, modification process |
| 19 | [Refresh Timing](#-section-19-refresh-timing) | [CRITICAL] | 60s partial, 5min full refresh (v1.8) |
| 20 | [Licensing](#-section-20-licensing) | [CRITICAL] | AGPL-3.0 Dual Licence requirement |
| 21 | [Device Setup Flow](#-section-21-device-setup-flow-mandatory) | [CRITICAL] | Setup wizard, admin panel, device config |
| 22 | [Admin Panel UI/UX Branding](#-section-22-admin-panel-uiux-branding-mandatory) | [CRITICAL] | Colours, typography, icons (no emojis), cards, readability |

### Appendices

| # | Appendix | Description |
|---|----------|-------------|
| A | [Quick Commands](#-appendix-a-quick-commands) | Development, firmware, deployment, git commands |
| B | [Troubleshooting](#-appendix-b-troubleshooting) | Common issues and solutions |
| C | [Reference Documents](#-appendix-c-reference-documents) | Links to related documentation |

### Subsection Index

<details>
<summary><strong>Section 1: Absolute Prohibitions</strong></summary>

- 1.1 Forbidden Terms & Patterns
- 1.2 Legacy PTV API Prohibition
- 1.3 Correct API References
- 1.4 Firmware Anti-Brick Rules
</details>

<details>
<summary><strong>Section 2: TRMNL/usetrmnl Prohibition</strong></summary>

- 2.1 Express Prohibition on TRMNL Services
- 2.2 Required Independence
- 2.3 Firmware Independence
</details>

<details>
<summary><strong>Section 3: Zero-Config Serverless Architecture</strong></summary>

- 3.1 Absolute Requirement
- 3.2 How It Works
- 3.3 Config Token Structure
- 3.4 Implementation
- 3.5 Benefits
- 3.6 Redis Setup (Required)
- 3.7 Admin Panel localStorage Architecture (v1.9)
</details>

<details>
<summary><strong>Section 4: System Architecture Rules</strong></summary>

- 4.1 Distribution Model
- 4.2 Architecture Boundaries
- 4.3 Data Flow
- 4.4 Required Environment Variables
- 4.5 Required Endpoints
</details>

<details>
<summary><strong>Section 5: Custom Firmware Requirement</strong></summary>

- 5.1 TRMNL Hardware Specifications
- 5.2 Custom Firmware Requirements
- 5.3 Flashing Procedure
- 5.4 Critical bb_epaper ESP32-C3 Findings (2026-01-29)
- 5.5 ESP32-C3 Troubleshooting Guide (2026-01-30)
- 5.6 **Production Firmware: CC-FW-7.7.0** [UNLOCKED]
</details>

<details>
<summary><strong>Section 6: Compatible Kindle Devices</strong></summary>

- 6.1 Supported Kindle Models
- 6.2 Kindle Jailbreak Requirement
- 6.3 Kindle Dashboard Setup
- 6.4 Kindle Display Considerations
</details>

<details>
<summary><strong>Section 7: Spec Integrity</strong></summary>

- 7.1 Spec is Immutable (V15.0)
- 7.2 Zone Boundaries are Sacred
- 7.3 Zone Dimensions are Fixed
- 7.4 Spec-Renderer Parity (MANDATORY) [CRITICAL]
  - 7.4.1 Required Parity Elements
  - 7.4.2 Verification Checklist
  - 7.4.3 Prohibited: Partial Implementation
  - 7.4.4 Spec-Renderer Sync Process
</details>

<details>
<summary><strong>Section 8: Design Specification (LOCKED)</strong></summary>

- 8.1 Display Dimensions
- 8.2 Layout Structure
- 8.3 Colour Palette (LOCKED)
- 8.4 Mode Icons (LOCKED)
- 8.5 Leg States (LOCKED)
- 8.6 Status Bar Variants (LOCKED)
</details>

<details>
<summary><strong>Section 9: E-ink Constraints</strong></summary>

- 9.1 1-bit Depth Only
- 9.2 Design for Partial Refresh
- 9.3 No Anti-aliasing
- 9.4 Test Visual Hierarchy
</details>

<details>
<summary><strong>Section 10: BMP Rendering Rules</strong></summary>

- 10.1 Output Format
- 10.2 Memory Constraints (ESP32-C3)
- 10.3 Zone-Based Partial Refresh
- 10.4 Font Loading in Vercel Serverless (v1.15)
</details>

<details>
<summary><strong>Section 11: API & Data Rules</strong></summary>

- 11.1 Transport Victoria OpenData (GTFS-RT)
- 11.2 Weather (BOM)
- 11.3 Google Places
- 11.4 Lightweight Endpoints
- 11.5 Rate Limit Awareness
- 11.6 LiveDash Multi-Device Endpoint
- 11.7 API Key Passing Requirements (v1.8)
- 11.8 Zero-Config Gap: Direct Endpoint API Keys (v1.8)
</details>

<details>
<summary><strong>Section 12: Business Logic</strong></summary>

- 12.1 CoffeeDecision™ is Sacred
- 12.2 12-hour Time Format (User-Facing Only)
- 12.3 Walking Time Buffer
- 12.4 Journey Math is Critical
</details>

<details>
<summary><strong>Section 13: Code Quality</strong></summary>

- 13.1 Minimal Dependencies
- 13.2 Error States Must Render
- 13.3 No Magic Numbers
- 13.4 Code Comments
- 13.5 File Naming Consistency
- 13.6 Admin Panel JavaScript Patterns (v1.15)
</details>

<details>
<summary><strong>Section 14: Testing Requirements</strong></summary>

- 14.1 Pre-Commit Checklist
  - 14.1.1 Forbidden Terms Verification
- 14.2 Firmware Testing
- 14.3 Server Testing
- 14.4 UI Consistency Testing (MANDATORY for UI Changes)
</details>

<details>
<summary><strong>Section 15: Deployment Rules</strong></summary>

- 15.1 Vercel Deployment
- 15.2 Vercel-first Design
- 15.3 Test Before Push
- 15.4 Git Hygiene
- 15.5 Version Tagging
- 15.6 Firmware Releases
</details>

<details>
<summary><strong>Section 16: Documentation Standards</strong></summary>

- 16.1 File Naming
- 16.2 Required Sections
</details>

<details>
<summary><strong>Section 17: Security</strong></summary>

- 17.1 XSS Input Sanitization (MANDATORY)
- 17.2 API Key Validation (MANDATORY)
- 17.3 Free-Tier Architecture (MANDATORY)
- 17.4 No Hardcoded Personal Information (MANDATORY)
- 17.5 No Environment Files in Repository (MANDATORY)
- 17.6 Path Traversal Prevention (MANDATORY)
- 17.7 Supply Chain Security (MANDATORY)
- 17.8 Content Security Policy (CSP) Headers (RECOMMENDED)
- 17.9 Security Pre-Commit Checklist (MANDATORY)
- 17.10 DDoS and Rate Limiting (INFORMATIONAL)
- 17.11 API Rate Limiting (MANDATORY)
- 17.12 HTTPS Enforcement (MANDATORY)
- 17.13 Input Validation (MANDATORY)
- 17.14 Data Minimisation (MANDATORY)
- 17.15 Dependency Update Schedule (MANDATORY)
- 17.16 Secret Rotation (RECOMMENDED)
- 17.17 Encryption Standards (INFORMATIONAL)
- 17.18 Software Bill of Materials (SBOM) (RECOMMENDED)
- 17.19 Multi-Layer Code Review (MANDATORY)
- 17.20 Code Signing (RECOMMENDED)
</details>

<details>
<summary><strong>Section 18: Change Management</strong></summary>

- 18.1 Locked Elements
- 18.2 Modification Process
- 18.3 Cross-System Change Propagation
</details>

<details>
<summary><strong>Section 19: Refresh Timing</strong></summary>

- (Single section — timing values and rationale)
</details>

<details>
<summary><strong>Section 20: Licensing</strong></summary>

- Licence Header (Required in all files)
</details>

<details>
<summary><strong>Section 21: Device Setup Flow</strong></summary>

- 21.1 Boot Sequence
- 21.2 Boot Screen (Stage 1)
- 21.3 WiFi Setup Screen (Stage 2)
- 21.4 Post-Setup (Stage 3)
- 21.5 Hosting Platform
- 21.6 Device Pairing System (v1.19) **NEW**
</details>

<details>
<summary><strong>Section 22: Admin Panel UI/UX Branding</strong></summary>

- 22.1 Colour Palette
- 22.2 Typography
- 22.3 Icons & Imagery (NO EMOJIS)
- 22.4 Card & Container Styles
- 22.5 Spacing & Layout
- 22.6 Interactive Elements
- 22.7 Readability Requirements
- 22.8 Consistency Checklist
- 22.9 Global System Footer (MANDATORY) [CRITICAL]
  - 22.9.1 Footer Requirements
  - 22.9.2 Dynamic Attribution Logic
  - 22.9.3 Footer Styling
  - 22.9.4 Version Display Format
  - 22.9.5 Prohibited
</details>

<details>
<summary><strong>Section 23: CommuteCompute Data Flow Requirements</strong></summary>

- 23.1 GTFS-RT Stop ID Architecture
- 23.2 Departure Data Flow
- 23.3 Citybound Detection Logic
- 23.4 Departure Output Schema
- 23.5 Line Name Extraction
- 23.6 Fallback Data Requirements
- 23.7 Multi-Modal Journey Leg Construction (v1.18)
- 23.8 Pre-Deployment Verification
- 23.9 Alternative Route Detection (v1.18)
</details>

<details>
<summary><strong>Section 24: System Architecture Principles</strong></summary>

- 24.1 Core Principles
- 24.2 Distribution Model
- 24.3 Layer Architecture
- 24.4 Data Flow Requirements
- 24.5 Caching Strategy
- 24.6 Redis Storage Architecture
- 24.7 Security Model
- 24.8 Free-Tier Architecture
- 24.9 Multi-Device Support (CC LiveDash™)
- 24.10 Required API Endpoints
- 24.11 Technology Stack (LOCKED)
</details>

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.29 | 2026-02-09 | Angus Bergman | **BLE PROVISIONING ARCHITECTURE (CC-FW-7.5.0)**: Updated Section 5.6 — CC-FW-7.5.0 locked. BLE now sends WiFi credentials AND webhook URL (3 characteristics: SSID CC000002, Password CC000003, URL CC000004 re-added). No hardcoded server URLs; `DEFAULT_SERVER` is placeholder only. Rewrote Section 21.7 — single-phase BLE provisioning replaces hybrid BLE + pairing code as primary flow. Updated state machine: `STATE_BLE_SETUP` -> `STATE_WIFI_CONNECT` -> `STATE_FETCH_DASHBOARD`. Rewrote Section 21.7.9 — no DEFAULT_SERVER auto-pairing; firmware returns to BLE setup if no webhook URL in NVS. Added Section 17.4.3.1 — firmware webhook URL rule (URLs provisioned via BLE from Setup Wizard's `window.location.origin`). |
| 1.28 | 2026-02-07 | Angus Bergman | **V15.0 COMPLIANCE UPDATE**: Updated all stale V10/V13 spec references to V15.0. Naming table, legacy references, data flow diagram, spec integrity section, layout structure, renderer references, footer version example all updated to match VERSION.json (System v3.4.0, CommuteCompute v2.3, CCDash Renderer v1.80, CCDashDesignV15.0). Fixed duplicated Section 22 TOC entries. Updated SmartCommute to CommuteCompute in v1.24 tagline. |
| 1.27 | 2026-02-06 | Angus Bergman | **FIRMWARE LOGGING SYSTEM**: Updated Section 5.6 — CC-FW-7.4.3 adds structured logging with LOG_LEVEL (0-4), LOG_ERROR/WARN/INFO/DEBUG macros, state transition logging. Production recommended: LOG_LEVEL 2 (WARN). |
| 1.26 | 2026-02-06 | Angus Bergman | **TIME FORMAT CLARIFICATION**: Updated Section 12.2 — 24-hour time permissible in internal code (calculations, logging, API internals). 12-hour format required only for user-facing content: dashboard displays, e-ink screens, admin panel UI, firmware displays. Reduces false positives in compliance audits. |
| 1.25 | 2026-02-05 | Angus Bergman | **ZERO-CONFIG AUTO-PAIRING**: Added Section 21.7.9 — Firmware v7.4.0+ auto-pairs with DEFAULT_SERVER when no custom URL configured. Eliminates manual pairing code requirement for default server. After WiFi connects, firmware automatically sets webhookUrl to `{DEFAULT_SERVER}/api/screen` and proceeds to dashboard. Enables true zero-config: BLE WiFi credentials only, no pairing code needed. Custom servers still supported via Setup Wizard pairing flow. |
| 1.24 | 2026-02-04 | Angus Bergman | **OFFICIAL TAGLINE**: Added Section 22.10 — Canonical tagline from @Commute_Compute Twitter bio. "Other apps show delays. CommuteCompute(TM) reacts to them. Live data flows into every decision- coffee, timing, connections. 1 glance. No app switching. Open Source." Replaces all previous taglines. |
| 1.20 | 2026-02-01 | Angus Bergman | **HYBRID BLE + PAIRING PROVISIONING**: Added Section 21.7 — Mandatory hybrid provisioning architecture. Phase 1: BLE sends WiFi credentials only (SSID + password). Phase 2: Device connects to WiFi, displays pairing code, polls `/api/pair/[code]` for server config. Documents: why WiFiManager/captive portal crashes ESP32-C3 (0xbaad5678), two-phase flow diagram, firmware state machine, BLE characteristics (URL removed), pairing screen display, setup wizard flow, re-configuration scenarios, factory reset behaviour. |
| 1.19 | 2026-02-01 | Angus Bergman | **DEVICE PAIRING WITH VERCEL KV**: Added Section 21.6 — Device pairing system with mandatory Vercel KV persistence. Documents 6-character pairing code flow, KV storage patterns (`pair:{CODE}` with 10min TTL), device polling behaviour, setup wizard integration. Fixes serverless stateless issue where in-memory stores fail across invocations. Updated version refs to CCDash V12, Architecture v5.3. |
| 1.18 | 2026-01-31 | Angus Bergman | **MULTI-MODAL JOURNEY SUPPORT + CCDASH V10.2-V10.3**: (1) Rewrote Section 23.7 — Multi-modal journey leg construction supporting N transit legs with interchange walks (Tram→Train, Bus→Train, etc.). (2) Added Section 23.9 — Alternative route detection (MANDATORY). Route discovery, scoring weights, multi-modal selection triggers. (3) Added delay accumulation across multiple transit legs. (4) Prohibition on hardcoded routes reinforced. Engine-only adaptation per Section 17.4. **CCDash Spec Amendments:** v10.2 DEPART time column (Section 5.6.2), actual location names (Section 5.5.1); v10.3 cafe closed detection (Section 7.2.1), FRIDAY TREAT status. |
| 1.15 | 2026-01-31 | Angus Bergman | **SERVERLESS RENDERING & ADMIN PANEL FIXES**: (1) Added Section 10.4 — Font loading in Vercel serverless (try multiple paths: process.cwd, __dirname, /var/task). (2) Added Section 13.6 — Admin Panel JavaScript patterns (Image preload pattern to avoid onerror on empty src; KV sync before server requests). (3) Screen API now reads journey config from KV storage with random fallback when unconfigured. |
| 1.14 | 2026-01-31 | Angus Bergman | **SYSTEM ARCHITECTURE PRINCIPLES**: Added Section 24 — complete architecture principles from ARCHITECTURE.md v4.0. Core principles (self-hosted, zero-config, no TRMNL cloud, server-side rendering, privacy-first, multi-state, free-tier). Distribution model, layer architecture, data flow, Vercel KV storage architecture, security model, free-tier architecture, multi-device support (CC LiveDash™), required endpoints, locked technology stack. |
| 1.13 | 2026-01-31 | Angus Bergman | **COMMUTECOMPUTE DATA FLOW**: Added Section 23 — mandatory data flow requirements for CommuteCompute engine. GTFS-RT stop ID architecture (direction-specific IDs), citybound detection logic (isCityLoopStop), departure output schema, line name extraction, journey leg construction, fallback data requirements, pre-deployment verification tests. Added Section 17.4 (No Hardcoded Personal Information) for turnkey compliance. |
| 1.12 | 2026-01-31 | Angus Bergman | **ADMIN PANEL UI/UX BRANDING**: Added Section 22 — mandatory branding rules for admin panel. Colour palette, typography (Inter font), NO EMOJIS (use SVG icons), card styles, spacing, buttons, form inputs, readability requirements. Includes consistency checklist. |
| 1.11 | 2026-01-31 | Angus Bergman | **FIRMWARE REQUIREMENTS**: Added to Section 5.2 — (1) Power cycle reboot support (device boots correctly when power disconnected/reconnected). (2) Firmware version must be displayed on screen for visual troubleshooting. |
| 1.10 | 2026-01-31 | Angus Bergman | **UI CONSISTENCY TESTING**: Added Section 14.4 — mandatory testing checklist for UI changes. Covers: Setup Wizard steps, Admin Panel tabs, internal links, Quick Links, terminology consistency, localStorage key consistency, endpoint consistency, systematic testing order. |
| 1.9 | 2026-01-31 | Angus Bergman | **ADMIN PANEL LOCALSTORAGE ARCHITECTURE**: (1) Admin panel tabs rebuilt to read from localStorage (Setup Wizard saves here). (2) Device naming: Use "TRMNL Display (OG)" not "CC E-Ink Display". (3) Firmware disclaimer required for all device references. (4) API Settings auto-populates from wizard data. (5) Added Section 3.7 (Admin Panel localStorage Keys). |
| 1.8 | 2026-01-31 | Angus Bergman | **FIRMWARE UPDATE + ZERO-CONFIG KV STORAGE**: (1) Updated locked firmware to CC-FW-6.1-60s (commit 7336929) — 60s refresh. (2) Implemented Vercel KV storage for API keys (Section 11.8) — direct endpoints now Zero-Config compliant, no env vars required. (3) Added `src/data/kv-preferences.js` for persistent KV storage. |
| 1.7 | 2026-01-31 | Angus Bergman | **LOCKED FIRMWARE**: Added Section 5.6 — CC-FW-6.0-STABLE locked production firmware. Hardware-verified working on TRMNL OG (commit 2f8d6cf). Documents exact flashing procedure, ESP32-C3 workarounds, modification policy. |
| 1.6 | 2026-01-30 | Angus Bergman | **REBRAND**: Commute Compute → Commute Compute System. Added Section 0 (Naming Conventions). Updated all references: CCDashDesignV15, CC LiveDash. SmartCommute engine name retained. |
| 1.5 | 2026-01-29 | Angus Bergman | Added: API Key Validation requirements (17.2) — mandatory validation for all API keys entered via admin panel including format checks, live testing, and user feedback requirements |
| 1.4 | 2026-01-29 | Angus Bergman | Added: console.log forbidden term (1.1), 12-hour time code pattern (12.2), file naming consistency (13.5), forbidden terms grep verification (14.1.1) |
| 1.3 | 2025-01-29 | Angus Bergman | Added full document index with version control |
| 1.2 | 2025-01-29 | Angus Bergman | Complete incorporation of all v3.0 items (17 gaps filled): Anti-brick rules, zero-config architecture, system architecture, BMP rendering, testing requirements, TRMNL Mini dimensions, Tram Diversion status, expanded API/deployment/timing details, documentation standards, appendices A/B/C |
| 1.1 | 2025-01-29 | Angus Bergman | Added TRMNL/usetrmnl prohibition (Section 2), custom firmware requirements (Section 3), Kindle device compatibility (Section 4), hardware specifications |
| 1.0 | 2025-01-29 | Angus Bergman | Initial version for commute-compute repo. 12 sections covering PTV API exclusions, design spec, e-ink constraints, API design, business logic, code quality, deployment, security, change management, refresh timing, licensing |

### Migration Notes

This document consolidates and supersedes legacy versions. As of v1.6, the system is rebranded from "Commute Compute" to "Commute Compute System".

All rules from previous versions have been incorporated. The canonical source is now:
- **Repository:** `commute-compute`
- **Path:** `DEVELOPMENT-RULES.md`

---

## Quick Reference

| Rule Category | Priority | Violation Impact |
|--------------|----------|------------------|
| TRMNL/usetrmnl Prohibition | [CRITICAL] | System dependency violation |
| Firmware Anti-Brick Rules | [CRITICAL] | Device becomes unusable |
| Zero-Config Architecture | [CRITICAL] | User configuration burden |
| Custom Firmware Requirement | [CRITICAL] | Device incompatibility |
| PTV API Naming & Exclusions | [CRITICAL] | API compliance violation |
| V15.0 Design Spec | [CRITICAL] | UI inconsistency |
| BMP Rendering Rules | [HIGH] | Display artifacts, memory issues |
| E-ink Constraints | [HIGH] | Display artifacts |
| API Design | [HIGH] | Performance issues |
| Testing Requirements | [HIGH] | Quality assurance |
| Code Quality | [MEDIUM] | Maintenance burden |
| Documentation Standards | [MEDIUM] | Knowledge loss |

---

## [WARNING] Section 1: Absolute Prohibitions — PTV API Naming & Exclusions

### 1.1 Forbidden Terms & Patterns

**[CRITICAL] MANDATORY: NEVER use these in code or documentation:**

| Forbidden | Reason | Use Instead |
|-----------|--------|-------------|
| `PTV API` | Misleading — we use OpenData | `Transport Victoria OpenData API` |
| `PTV Timetable API v3` | Legacy, deprecated | `GTFS-RT via OpenData` |
| `PTV Developer ID` | Legacy auth method | `ODATA_API_KEY` |
| `PTV API Token` | Legacy auth method | `KeyId` header |
| `PTV_USER_ID` | Forbidden env var | Remove entirely |
| `PTV_API_KEY` | Forbidden env var | `ODATA_API_KEY` |
| `PTV_DEV_ID` | Forbidden env var | Remove entirely |
| `HMAC-SHA1 signing` | Legacy auth | Simple KeyId header |
| `Metro API` | Doesn't exist | `GTFS-RT via OpenData` |
| `Real-time API` | Ambiguous | `GTFS-RT Trip Updates` |
| Hardcoded API keys | Security risk | Config token in URL |
| `deepSleep()` in setup() | Causes brick | State machine in loop() |
| `esp_task_wdt_*` | Causes freezes | Remove watchdog entirely |
| `FONT_12x16` | Rotation bug | `FONT_8x8` only |
| `while(true)` blocking | Causes freeze | State machine pattern |
| `console.log('PTV API...')` | Forbidden in logs | Use `Transport API` or similar |

### 1.2 Legacy PTV API Prohibition

**[WARNING] ABSOLUTE PROHIBITION**: Never reference legacy PTV APIs.

```javascript
// [NO] FORBIDDEN:
const ptvKey = process.env.PTV_API_KEY;
const ptvUrl = 'https://timetableapi.ptv.vic.gov.au/...';

// [YES] CORRECT:
const apiKey = process.env.ODATA_API_KEY;
const url = 'https://api.opendata.transport.vic.gov.au/...';
```

**WHY**: Legacy PTV Timetable API v3 is deprecated. The system uses Transport Victoria GTFS Realtime exclusively.

### 1.3 Correct API References

| Component | Correct Name |
|-----------|-------------|
| Data Source | Transport Victoria OpenData API |
| Base URL | `https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1` |
| Protocol | GTFS Realtime (GTFS-RT) — Protobuf format |
| Auth Header | `KeyId` (case-sensitive) with UUID format API key |
| Real-time Data | GTFS-RT Trip Updates |
| Alerts | GTFS-RT Service Alerts |

### 1.4 Firmware Anti-Brick Rules

**[WARNING] CRITICAL — Violation causes device brick:**

```cpp
// [NO] NEVER DO THIS
void setup() {
    deepSleep(1000000);      // BRICK - can't reflash
    delay(30000);            // BRICK - too long
    WiFi.begin();            // BRICK - blocking in setup
    http.GET();              // BRICK - network in setup
    esp_task_wdt_init();     // FREEZE - watchdog enabled
}

// [YES] ALWAYS DO THIS
void setup() {
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  // Disable brownout
    Serial.begin(115200);
    initDisplay();           // Quick, non-blocking
    state = STATE_WIFI_CONNECT;  // Defer to loop()
}

void loop() {
    switch(state) {
        case STATE_WIFI_CONNECT: /* ... */ break;
        case STATE_FETCH_DATA:   /* ... */ break;
        case STATE_RENDER:       /* ... */ break;
    }
}
```

**Mandatory Firmware Checklist:**
- [ ] `setup()` completes in < 5 seconds
- [ ] NO network operations in `setup()`
- [ ] NO `deepSleep()` in `setup()`
- [ ] NO delays > 2 seconds anywhere
- [ ] NO watchdog timer
- [ ] Brownout detection DISABLED
- [ ] State machine architecture used
- [ ] `FONT_8x8` only (TRMNL OG)

---

## [PROHIBITED] Section 2: TRMNL/usetrmnl Prohibition

### 2.1 Express Prohibition on TRMNL Services

**[WARNING] ABSOLUTE PROHIBITION**: No part of the Commute Compute system may point to, use, depend on, or communicate with TRMNL or usetrmnl's servers, firmware, systems, or services.

**Forbidden:**
| Prohibited | Reason |
|------------|--------|
| `usetrmnl.com` | Third-party server dependency |
| `trmnl.com` | Third-party server dependency |
| TRMNL cloud API | Creates external dependency |
| TRMNL stock firmware | Designed for their servers |
| TRMNL plugin system | Tied to their ecosystem |
| Any `api.usetrmnl.com` endpoints | Third-party infrastructure |

**WHY**: Commute Compute is a fully self-hosted, independent system. Users must own their complete stack with no external dependencies on commercial services.

### 2.2 Required Independence

```javascript
// [NO] FORBIDDEN - References TRMNL servers:
const API_URL = 'https://usetrmnl.com/api/...';
const FIRMWARE_URL = 'https://trmnl.com/firmware/...';

// [YES] CORRECT - Self-hosted only:
const API_URL = process.env.VERCEL_URL || 'https://your-deployment.vercel.app';
```

### 2.3 Firmware Independence

The TRMNL hardware device **MUST** run custom Commute Compute firmware that:
- [YES] Connects ONLY to the user's self-hosted Vercel deployment
- [YES] Uses the Commute Compute API endpoints (`/api/zones`, `/api/screen`)
- [NO] Never contacts usetrmnl.com or any TRMNL cloud services
- [NO] Never uses TRMNL's OTA update mechanism

---

## Section 3: Zero-Config Serverless Architecture

### 3.1 Absolute Requirement

**[WARNING] CRITICAL**: Users must NEVER need to manually configure server-side environment variables.

**Users must NEVER need to:**
- [NO] Edit .env files or configuration files
- [NO] Use command-line tools to set API keys
- [NO] Manually enter API keys in Vercel/Render environment settings
- [NO] Configure server-side secrets for the system to function
- [NO] Touch deployment configuration after initial setup

**ALL API KEYS MUST BE CONFIGURED EXCLUSIVELY THROUGH THE SETUP WIZARD/ADMIN PANEL.**

### 3.2 How It Works

```
┌─────────────────┐     ┌─────────────────────────────────────────────────┐
│   SETUP WIZARD  │────▶│   Personalized URL with embedded config token   │
│   (Admin Panel) │     │   /api/device/eyJhIjp7ImhvbWUiOiIxMjMgRXhhbXBsZS4uLiJ9│
└─────────────────┘     └─────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────┐     ┌─────────────────────────────────────────────────┐
│   DEVICE        │────▶│   Server extracts API keys FROM REQUEST URL     │
│   (Firmware)    │     │   NOT from environment variables                │
└─────────────────┘     └─────────────────────────────────────────────────┘
```

### 3.3 Config Token Structure

```javascript
{
  "a": { /* addresses */ },
  "j": { /* journey config */ },
  "k": "api-key-here",        // Transport Victoria API key
  "g": "google-places-key",   // Google Places API key (optional)
  "s": "VIC"                  // State
}
```

### 3.4 Implementation

```javascript
// [YES] CORRECT - Keys from request URL:
const config = decodeConfigToken(req.params.token);
const apiKey = config.api?.key || '';  // From URL token

// [NO] PROHIBITED - Keys from server env:
const apiKey = process.env.ODATA_API_KEY;  // User must configure server
```

### 3.5 Benefits

- Zero-config deployment (no environment variables needed)
- Self-contained devices (config travels with request)
- Privacy (API keys stay with device owner)

### 3.6 Redis Setup (Required)

**Redis (via Vercel Marketplace) provides persistent storage for API keys.**

**Zero-Config Compliance:** Redis is compliant because:
- [YES] User installs Redis via Vercel Marketplace and connects to project
- [YES] Vercel **auto-injects** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- [YES] User never types, copies, or sees these credentials
- [YES] Similar to how Vercel auto-injects `VERCEL_URL`, `VERCEL_ENV`, etc.

**This is NOT the same as:**
- [NO] User manually adding `ODATA_API_KEY=xxx` to env vars
- [NO] User editing `.env` files
- [NO] User running CLI commands to set secrets

The Marketplace installation is a **UI-guided action**, not manual env var configuration.

**Note:** Legacy Vercel KV env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are also supported for backward compatibility with existing installations.

#### 3.6.1 Setup Steps

1. **Install Redis Integration:**
   - Vercel Dashboard → **Integrations** tab → **Browse Marketplace**
   - Search for **Redis** → Select Upstash provider → Click **Install**

2. **Create Redis Database:**
   - Select the **Redis** product
   - Region: **Sydney, Australia** (recommended for AU latency)
   - Plan: **Free** (256MB storage, 500K commands/month)
   - Name: `commute-compute-redis`

3. **Connect to Project:**
   - Go to **Projects** tab → **Connect Project**
   - Select your Commute Compute project
   - Vercel auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   - After connecting, the integration appears as **Redis** in the Integrations tab

4. **Redeploy:**
   - Deployments → ⋮ → **Redeploy**
   - Or push any commit to trigger rebuild

#### 3.6.2 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Panel   │────▶│   /api/save-    │────▶│  Redis  │
│   Enter API Key │     │   transit-key   │     │   (Persistent)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   /api/zones    │────▶│ getTransitApi   │────▶│  Load from Redis│
│   (Direct call) │     │ Key()           │     │   (No env vars) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

#### 3.6.3 Storage Keys

| Key | Description |
|-----|-------------|
| `cc:api:transit_key` | Transport Victoria OpenData API key |
| `cc:api:google_key` | Google Places API key |
| `cc:state` | User's state (VIC, NSW, QLD) |
| `cc:preferences` | Full preferences object |

#### 3.6.4 Data Sync Flow

**Per Zero-Config principle: Users enter data ONCE in Setup Wizard.**

```
Setup Wizard
    │
    ├─► Step 4: Transit API Key
    │       └─► /api/save-transit-key → KV (validated + saved)
    │
    └─► Complete Setup
            ├─► localStorage (browser backup)
            └─► /api/sync-config → KV (ensures server has data)
                    │
                    ▼
            Admin Panel reads /api/status
                    │
                    └─► Shows "configured" status from KV
```

**Endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `/api/save-transit-key` | Save + validate Transit API key to KV |
| `/api/save-google-key` | Save + validate Google API key to KV |
| `/api/sync-config` | Sync full config to KV after setup |
| `/api/status` | Read config status from KV |
| `/api/kv-status` | Debug: verify KV connection |

#### 3.6.5 Fallback Behaviour

| Scenario | Behaviour |
|----------|----------|
| KV connected, key saved | [YES] Live Transport Victoria data |
| KV connected, no key | [CAUTION] Fallback to timetable data |
| KV not connected | [CAUTION] In-memory only (lost on next request) |

**[CAUTION] CRITICAL:** If KV env vars are missing after connecting database:
1. Go to Vercel Dashboard → Storage → CCKV
2. Verify "Linked Projects" shows commute-compute
3. Redeploy project (Deployments → ⋮ → Redeploy)
4. Check `/api/kv-status` — should show `KV_REST_API_URL: "set"`

### 3.7 Admin Panel localStorage Architecture (v1.9)

**The Admin Panel reads configuration from browser localStorage, populated by the Setup Wizard.**

This ensures zero-config compliance: users complete the wizard ONCE, and all admin tabs auto-populate.

#### 3.7.1 localStorage Keys

| Key | Description | Set By |
|-----|-------------|--------|
| `cc-config` | Full configuration object (JSON) | Setup Wizard |
| `cc-configured` | "true" when setup complete | Setup Wizard |
| `cc-transit-api-key` | Transport Victoria API key | Setup Wizard Step 4 |
| `cc-transit-api-validated` | "true" if key validated | Setup Wizard / API Settings |
| `cc-google-places-key` | Google Places API key | Setup Wizard Step 1 |
| `cc-google-places-validated` | "true" if key validated | Setup Wizard / API Settings |
| `cc-device` | Selected device (trmnl-og, kindle-pw3, etc.) | Setup Wizard Step 5 |
| `cc-webhook-url` | Generated webhook URL for device | Setup Wizard |
| `cc-api-mode` | "cached" or "live" | Setup Wizard / API Settings |

#### 3.7.2 Admin Tab Data Flow

```
Setup Wizard
    │
    └─► localStorage.setItem('cc-config', fullConfig)
    └─► localStorage.setItem('cc-configured', 'true')
    └─► localStorage.setItem('cc-transit-api-key', key)
            │
            ▼
Admin Panel Load
    │
    ├─► loadSavedPreferences() reads localStorage
    │       │
    │       ├─► updateConfigSummary() → Live Data banner
    │       ├─► updateSetupTabSummary() → Setup & Journey tab
    │       └─► updateApiSettingsTab() → API Settings tab
    │
    └─► All tabs show data from wizard (no re-entry required)
```

#### 3.7.3 Device Naming Convention

**Use actual device names, not firmware names:**

| [YES] Correct | [NO] Incorrect |
|-----------|-------------|
| TRMNL Display (OG) | CC E-Ink Display OG |
| TRMNL Display (Mini) | CC E-Ink Display Mini |
| Kindle Paperwhite 3 | Kindle PW3 Firmware |

**Firmware Disclaimer Required:** When displaying device information, always include:
> [CAUTION] Custom Firmware Required: Your device must be flashed with Commute Compute firmware to connect to this dashboard. Stock firmware will not work.

#### 3.7.4 Tab Responsibilities

| Tab | Data Source | Purpose |
|-----|-------------|---------|
| Setup & Journey | `cc-config`, `cc-device`, `cc-webhook-url` | Summary view + edit link to wizard |
| API Settings | `cc-transit-api-key`, `cc-google-places-key`, `cc-api-mode` | Status display + key editing |
| Live Data | `cc-config` for config banner; server for departures | Real-time transit display |
| Configuration | `cc-config` | Journey profiles, advanced settings |

---

## Section 4: System Architecture Rules

### 4.1 Distribution Model

```
┌─────────────────────────────────────────────────────────────┐
│                    SELF-HOSTED MODEL                         │
│                                                              │
│   Official Repo ──Fork──▶ User's Repo ──Deploy──▶ Vercel    │
│                                                   │          │
│                                          User's Device ◀────┘│
│                                                              │
│   [YES] Complete data isolation between users                │
│   [YES] User owns their API keys                             │
│   [YES] No central server dependency                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Architecture Boundaries

| Layer | Responsibility | DO NOT |
|-------|---------------|--------|
| Firmware | Display rendering, zone refresh | Process journey logic |
| Server API | Journey calculation, data fetch | Store user data centrally |
| Renderers | BMP generation, zone diffing | Make API calls |
| Services | OpenData, Weather, Places | Cache beyond specified TTL |

### 4.3 Data Flow

```
OpenData API ──30s cache──▶ opendata.js
                               │
Weather API ──5min cache──▶ weather-bom.js
                               │
                               ▼
                     dashboard-service.js
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      ccdash-          ccdash-           ccdash-
      renderer.js      renderer.js       renderer.js
              │                │                │
              ▼                ▼                ▼
         1-bit BMP        Full PNG         Zone JSON
         (firmware)       (preview)        (partial)
```

### 4.4 Required Environment Variables

```bash
# Mandatory (for development only - production uses config tokens)
ODATA_API_KEY=           # Transport Victoria OpenData key
GOOGLE_PLACES_API_KEY=   # Google Places (for address autocomplete)

# Optional
NODE_ENV=production
TZ=Australia/Melbourne
```

### 4.5 Required Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/zones` | Zone data for TRMNL (1-bit BMP, partial refresh) |
| `/api/screen` | Full 800×480 PNG for TRMNL webhook |
| `/api/kindle/image` | Kindle-optimised PNG (portrait, 8-bit) |
| `/api/livedash` | LiveDash multi-device renderer (TRMNL, Kindle, web) |
| `/api/status` | Server health check |
| `/api/setup-status` | Setup completion check |

---

## Section 5: Custom Firmware Requirement

### 5.1 TRMNL Hardware Specifications

Commute Compute is designed for TRMNL e-ink display hardware with custom firmware.

**TRMNL OG Hardware:**
| Component | Specification |
|-----------|--------------|
| Microcontroller | ESP32-C3 (RISC-V, single-core, 160MHz) |
| Display | 7.5" E-ink, 800×480 pixels, 1-bit depth |
| Connectivity | WiFi 802.11 b/g/n (2.4GHz) |
| Memory | 400KB SRAM, 4MB Flash |
| Power | USB-C recommended; battery supported (several days) |
| Refresh | Partial refresh supported |

### 5.2 Custom Firmware Requirements

**[CRITICAL] MANDATORY**: TRMNL devices MUST be flashed with custom Commute Compute firmware.

**Firmware Must:**
- [ ] Connect to user's self-hosted server URL (configured via setup portal)
- [ ] Fetch images from `/api/zones` or `/api/screen` endpoints
- [ ] Support 60-second partial refresh cycle
- [ ] Implement zone-based partial updates
- [ ] Use state machine architecture (no blocking in `setup()`)
- [ ] Disable brownout detection
- [ ] Use `FONT_8x8` only (avoids rotation bugs)
- [ ] **Support clean power cycle reboot** — device must boot correctly when power is disconnected and reconnected (no stuck states, no manual reset required)
- [ ] **Display firmware version on screen** — current firmware version must be visible on the display for visual troubleshooting (e.g., in footer zone or startup splash screen)

**Firmware Must NOT:**
- [ ] Contact usetrmnl.com or trmnl.com
- [ ] Use TRMNL's API key/friendly ID system
- [ ] Rely on TRMNL's OTA update servers
- [ ] Include any TRMNL cloud integration code

### 5.3 Flashing Procedure

```bash
# Build custom firmware
cd firmware
pio run -e trmnl

# Flash via USB (device in bootloader mode)
pio run -e trmnl -t upload

# Monitor serial output
# WARNING: Do NOT use `pio device monitor` -- causes crash/freeze on ESP32-C3.
screen /dev/cu.usbmodem* 115200          # macOS
# On Windows, use PuTTY (Serial mode, 115200 baud)
```

**Bootloader Mode:** Hold BOOT button while pressing RESET, then release.

### 5.4 Critical bb_epaper ESP32-C3 Findings (2026-01-29)

**[CRITICAL] DISCOVERY**: Display shows static/garbage if `allocBuffer()` is called!

**Tested on:** TRMNL OG (ESP32-C3 RISC-V, 7.5" E-ink 800×480)

**Root Cause:** bb_epaper library has ESP32-C3 (RISC-V) incompatibility with `allocBuffer()`. The library's buffer allocation code skips DMA-compatible memory handling for RISC-V architectures, causing the display to show uninitialized memory.

**WORKING Initialization Pattern:**
```cpp
// Declare with panel type in constructor
BBEPAPER bbep(EP75_800x480);

void setup() {
    // Initialize pins - CORRECT ORDER
    bbep.initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN,
                EPD_MOSI_PIN, EPD_SCK_PIN, 8000000);
    bbep.setPanelType(EP75_800x480);
    bbep.setRotation(0);
    pinMode(PIN_INTERRUPT, INPUT_PULLUP);
    
    // [CAUTION] DO NOT CALL allocBuffer()!
    // Just start drawing directly:
    bbep.fillScreen(BBEP_WHITE);
    bbep.setFont(FONT_8x8);  // NOT FONT_12x16!
    // ... draw content ...
    bbep.refresh(REFRESH_FULL, true);
}
```

**BROKEN Pattern (causes static):**
```cpp
// [NO] These cause garbage/static display:
bbep.allocBuffer(true);   // BROKEN
bbep.allocBuffer(false);  // BROKEN
bbep.setBuffer(customBuf); // BROKEN
```

**Correct Pin Configuration (TRMNL OG):**
| Signal | GPIO | Note |
|--------|------|------|
| SCK | 7 | SPI Clock |
| MOSI | 8 | SPI Data |
| CS | 6 | Chip Select |
| DC | 5 | Data/Command |
| RST | 10 | Reset |
| BUSY | 4 | Busy signal |
| INT | 2 | Button interrupt |

**Font Rotation Bug:**
- `FONT_12x16` renders text rotated 90° counter-clockwise
- **Fix:** Use `FONT_8x8` only for TRMNL OG hardware

**Testing Summary (2026-01-29):**
| Test | Result |
|------|--------|
| GxEPD2 library | [NO] Static (wrong library for TRMNL) |
| bb_epaper + allocBuffer() | [NO] Static |
| bb_epaper + setBuffer() | [NO] Static |
| bb_epaper + NO allocBuffer | [YES] WORKING |
| FONT_12x16 | [NO] Rotated 90° |
| FONT_8x8 | [YES] Correct orientation |

### 5.5 ESP32-C3 Troubleshooting Guide (2026-01-30)

**Additional critical findings for TRMNL OG (ESP32-C3) firmware development.**

#### 5.5.1 SPI Hardware Initialization Error

**[CRITICAL] ERROR:** `spiAttachMISO(): SPI Does not have default pins on ESP32C3!`

**Cause:** ESP32-C3 doesn't have default MISO pins. The bb_epaper library calls `SPI.begin(SCK, -1, MOSI, -1)` which fails because ESP32-C3 rejects -1 for MISO.

**Solution:** Use **bit-bang mode** (speed=0) to bypass hardware SPI:
```cpp
// [YES] WORKING - bit-bang mode
bbep->initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN, EPD_MOSI_PIN, EPD_SCK_PIN, 0);

// [NO] BROKEN - hardware SPI crashes on ESP32-C3
bbep->initIO(EPD_DC_PIN, EPD_RST_PIN, EPD_BUSY_PIN, EPD_CS_PIN, EPD_MOSI_PIN, EPD_SCK_PIN, 8000000);
```

#### 5.5.2 Static Initialization Crash (Guru Meditation Error)

**[CRITICAL] ERROR:** App hangs silently or shows "Guru Meditation Error: Core 0 panic'ed (Instruction access fault)"

**Cause:** Global BBEPAPER object's constructor crashes before setup() runs.

**Solution:** Use pointer and initialize in setup():
```cpp
// [YES] WORKING - pointer initialized in setup()
BBEPAPER* bbep = nullptr;

void setup() {
    bbep = new BBEPAPER(EP75_800x480);
    // ...
}

// [NO] BROKEN - static init crashes
BBEPAPER bbep(EP75_800x480);  // Constructor runs before setup()!
```

#### 5.5.3 USB CDC Serial Output Missing

**[CRITICAL] ERROR:** No serial output on ESP32-C3 even when firmware appears to run.

**Cause:** Missing USB CDC build flags in platformio.ini.

**Solution:** Add these flags to ALL ESP32-C3 environments:
```ini
build_flags =
    -D ARDUINO_USB_MODE=1
    -D ARDUINO_USB_CDC_ON_BOOT=1
```

#### 5.5.4 NVS/Preferences Corruption

**[CRITICAL] ERROR:** `getString(): nvs_get_str len fail: serverUrl NOT_FOUND` + crash

**Cause:** WiFiManager reads from NVS in its static constructor before setup() runs. Corrupted NVS causes crash.

**Solution:** Either full chip erase OR explicit NVS init:
```cpp
#include <nvs_flash.h>

void setup() {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }
    // ... rest of setup
}
```

**Full chip erase via PlatformIO:**
```bash
pio run -e trmnl -t erase && pio run -e trmnl -t upload
```

#### 5.5.5 Text Rendering Crash in Bufferless Mode (2026-02-07)

**[CRITICAL] ERROR:** `Guru Meditation Error: Core 0 panic'ed (Load access fault)` when calling `bbep->print()`, `bbep->setCursor()`, `bbep->drawLine()`, or `bbep->drawRect()` in bufferless mode (no `allocBuffer()`).

**MCAUSE:** 0x00000005 (Load access fault), **MTVAL:** 0x0000abec

**Cause:** In bufferless mode, bb_epaper's text rendering path (`bbepWriteString`) and drawing functions (`drawPixel`, `drawLine`, `drawRect`) attempt to access the NULL `ucScreen` framebuffer, causing a crash on ESP32-C3 RISC-V.

**Discovery:** Documented in `firmware/archive/main-v7.cpp`: "SKIP boot screen - bb_epaper text drawing crashes on ESP32-C3". Only affects setup/error screens shown on fresh-flash devices with no stored WiFi credentials.

**Functions that WORK in bufferless mode:**
- `fillScreen()` -- uses direct SPI writes
- `loadBMP()` -- uses direct SPI writes via `bbepSetAddrWindow`
- `refresh()` -- triggers e-ink refresh cycle

**Functions that CRASH in bufferless mode:**
- `print()`, `setCursor()`, `setFont()`, `setTextColor()`
- `drawPixel()`, `drawLine()`, `drawRect()`
- Any function that reads/writes `ucScreen` buffer

**Solution:** BMP-based text renderer (`firmware/include/text_renderer.h`):
```cpp
#include "../include/text_renderer.h"

// Renders text as 1-bit BMP images, displayed via loadBMP()
drawTextBmp(bbep, "Hello World", x, y);       // Left-aligned
drawTextCentered(bbep, "Centered", SCREEN_W, y); // Centered
```

The renderer creates a minimal 1-bit BMP in RAM (62-byte header + pixel data), renders 8x8 font glyphs into it, then calls `loadBMP()` which works in bufferless mode. Max 60 characters per call. Font data copied from bb_epaper's internal `ucFont` (not externally accessible).

#### 5.5.6 ESP32-C3 Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| No serial output | Missing USB CDC flags | Add `-D ARDUINO_USB_MODE=1 -D ARDUINO_USB_CDC_ON_BOOT=1` |
| `SPI Does not have default pins` | Hardware SPI fails on C3 | Use bit-bang mode (speed=0) |
| Silent hang before setup() | Static init crash | Use pointers, init in setup() |
| `nvs_get_str len fail` | NVS corruption | Full chip erase |
| Guru Meditation Error (text) | print/drawLine in bufferless mode | Use BMP text renderer (text_renderer.h) |
| Guru Meditation Error (init) | Static init or allocBuffer | Use pointers, remove allocBuffer() |
| Display shows garbage | allocBuffer() called | Remove allocBuffer() calls |
| Text rotated 90° | FONT_12x16 bug | Use FONT_8x8 only |

### 5.6 Production Firmware: CC-FW-7.7.0 (2026-02-16)

**[UNLOCKED] — Production Release**

**Official Name:** `CC-FW-7.7.0`
**Version:** 7.7.0
**Commit:** (pending)
**Previous:** `CC-FW-7.6.0`
**Verified On:** TRMNL OG hardware
**Status:** [UNLOCKED] (2026-02-20) — Production Release

**Changes from 7.6.0:**
- **Version Alignment:** Canonical firmware version declared by founder directive

**Changes from 7.5.0 (inherited via 7.6.0):**
- **Runtime Factory Reset:** 10-second button hold during normal operation triggers full factory reset (NVS erase, WiFi clear, preferences wipe, BLE re-pair). No unplugging or power cycling required.
- **Visual Reset Warning:** At 5-second hold, e-ink display shows "KEEP HOLDING FOR FACTORY RESET" with "Release now for safe power-off" option.
- **VCOM Discharge on Release:** Releasing button after 3-10 seconds triggers VCOM discharge (safe power-off). Only continuous 10s+ hold triggers reset.
- **Dual Reset Paths:** Boot-time reset (hold button during power-on) retained as secondary method. Runtime reset is now primary.

**Changes from 7.4.3 (inherited via 7.5.0):**
- **BLE Provisioning with Webhook URL:** BLE now sends WiFi credentials AND webhook URL (3 characteristics: SSID CC000002, Password CC000003, URL CC000004)
- **No Hardcoded Server URLs:** `DEFAULT_SERVER` in source is a placeholder only — never used for auto-pairing. Actual webhook URL sent from Setup Wizard's `window.location.origin + '/api/screen'`
- **CC000004 Re-Added:** Webhook URL characteristic restored for BLE provisioning
- **Device Status:** Notifies "configured" when all 3 values (SSID, password, URL) received
- **No Pairing Code Required:** Primary flow is fully BLE-based; pairing code retained as secondary/optional path

**Changes from 7.4.2 (inherited):**
- **Structured Logging System:** LOG_LEVEL config (0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG)
- **Log Macros:** LOG_ERROR, LOG_WARN, LOG_INFO, LOG_DEBUG for consistent output
- **State Transition Logging:** stateName() helper for readable state machine logs
- **Production Mode:** LOG_LEVEL 3 (INFO) - set to 2 (WARN) for quieter production

**Changes from 7.2.1 (inherited):**
- **Full Turnkey Compliance:** All hardcoded URLs removed; DEFAULT_SERVER uses placeholder `https://your-project.vercel.app`
- **Dynamic Setup Screen:** URL displayed on setup screen dynamically extracted from DEFAULT_SERVER constant
- **Improved Setup Screen:** FONT_8x8 only (fixes rotation bug), centered text, boxed device name, simplified BLE instructions
- **VCOM Post-Discharge Delay:** Added 100ms stabilization delay after every sleep() call

**Changes from 7.1.0 (inherited):**
- **VCOM Stabilization:** `setLightSleep(true)` after EVERY refresh (partial and full)
- **E-ink Protection:** Display always in safe state for sudden power-off/unplug
- **MAX_PARTIAL_BEFORE_FULL:** Reduced 30→10 (more frequent full refreshes)
- **Button Handler:** 3s hold+release = VCOM discharge; 10s hold = factory reset

#### 5.6.1 Key Characteristics

| Attribute | Value |
|-----------|-------|
| WiFi Mode | BLE Provisioning with Webhook URL (SSID + Password + URL via BLE) |
| Server URL | Provisioned via BLE from Setup Wizard (`window.location.origin + '/api/screen'`) |
| Refresh Interval | 60 seconds (HARDCODED per Section 19) |
| BMP Rendering | Direct render via bb_epaper (no allocBuffer) |
| Refresh Strategy | Full screen BMP fetch → Full/Partial refresh → VCOM stabilize |
| SPI Mode | Bit-bang (speed=0) for ESP32-C3 compatibility |
| VCOM Protection | `setLightSleep(true)` after every refresh cycle |

#### 5.6.2 Button Actions (Runtime)

| Hold Duration | Action | Visual Feedback |
|---------------|--------|-----------------|
| < 3 seconds | Ignored (debounce) | None |
| 3-10 seconds + release | VCOM discharge (safe power-off) | Serial log only |
| 5 seconds (still holding) | Warning displayed | E-ink shows "KEEP HOLDING FOR FACTORY RESET" |
| 10+ seconds | **Factory reset** | E-ink shows "FACTORY RESET" → device restarts in BLE setup mode |

**VCOM Discharge Sequence** (triggered on release after 3s+):

1. Clear display to WHITE (full refresh)
2. Flash to BLACK briefly (100ms)
3. Return to WHITE (full refresh)
4. Enter idle mode (battery operation supported; lasts several days)
5. Serial output: `[VCOM] Discharge complete - safe to power off`

**Factory Reset Sequence** (triggered on 10s continuous hold):

1. E-ink displays "FACTORY RESET / Clearing all data..."
2. WiFi credentials cleared (`WiFi.disconnect(true, true)`)
3. NVS preferences cleared (`preferences.clear()`)
4. Full NVS partition erased (`nvs_flash_erase()`)
5. E-ink displays "RESET COMPLETE / Restarting device..."
6. Device restarts → boots into BLE setup screen

#### 5.6.3 Why WiFiManager/ArduinoJson Disabled

| Library | Issue | Solution |
|---------|-------|----------|
| WiFiManager | Causes ESP32-C3 crash (0xbaad5678) due to static NVS init | BLE provisioning (SSID + Password + Webhook URL) |
| ArduinoJson | Causes stack corruption on ESP32-C3 | Manual JSON string parsing |

#### 5.6.4 Exact Flashing Procedure (Verified Working)

```bash
# 1. Navigate to firmware directory
cd ~/commute-compute/firmware

# 2. Verify on correct commit
git log --oneline -1
# Should show: 22f92ac fix: VCOM stabilization after EVERY refresh (v7.2.1)

# 3. Build and flash (single command)
pio run -e trmnl -t upload --upload-port /dev/cu.usbmodem*

# 4. Monitor serial output (115200 baud via USB CDC)
# WARNING: Do NOT use `pio device monitor` -- causes crash/freeze on ESP32-C3.
screen /dev/cu.usbmodem* 115200          # macOS
# On Windows, use PuTTY (Serial mode, 115200 baud)

# Expected output:
# === Commute Compute v7.2.1 ===
# BLE Provisioning Firmware
# [Display] Full refresh complete
# [VCOM] Display in light sleep - safe for power-off
```


---

## Section 6: Compatible Kindle Devices

### 6.1 Supported Kindle Models

Commute Compute supports jailbroken Kindle devices as alternative display hardware.

**Compatible Models:**
| Model | Codename | Resolution | Status |
|-------|----------|------------|--------|
| Kindle 4 NT | K4 | 600×800 | [YES] Fully tested |
| Kindle Paperwhite 2 | PW2 | 758×1024 | [YES] Compatible |
| Kindle Paperwhite 3 | PW3 | 1072×1448 | [YES] Compatible |
| Kindle Paperwhite 4 | PW4 | 1072×1448 | [YES] Compatible |
| Kindle Paperwhite 5 | PW5 | 1236×1648 | [YES] Compatible |
| Kindle Touch | KT | 600×800 | [YES] Compatible |
| Kindle Voyage | KV | 1072×1448 | [YES] Compatible |

### 6.2 Kindle Jailbreak Requirement

**All Kindle devices MUST be jailbroken before use.**

**Jailbreak Methods:**
| Firmware Version | Method | Reference |
|-----------------|--------|-----------|
| ≤ 5.14.2 | WatchThis | MobileRead forums, CVE-2022-23224 |
| 4.x, 3.x, 2.x | Legacy JB | MobileRead wiki |

**Jailbreak Procedure (WatchThis for FW ≤ 5.14.2):**
1. Factory reset device, select `en_GB` locale
2. Enter demo mode: type `;enter_demo` in search bar
3. Skip WiFi setup, enter dummy store registration
4. Select "standard" demo type
5. Use secret gesture (double-tap bottom-right, swipe left)
6. Enter demo config: type `;demo` in search bar
7. Select "Sideload Content"
8. Connect to PC, create `.demo/` folder with jailbreak files
9. Follow device-specific instructions from MobileRead

### 6.3 Kindle Dashboard Setup

After jailbreaking, install the kindle-dash package:

1. **Install USBNetwork** — Enables SSH access
2. **Install KUAL** — Kindle Unified Application Launcher
3. **Deploy kindle-dash** — Fetches and displays dashboard images

**Kindle Dashboard Configuration:**
```bash
# On Kindle via SSH (YOUR_KINDLE_IP)
mkdir -p /mnt/us/dashboard
cd /mnt/us/dashboard

# Configure to fetch from your Commute Compute server
# Edit local/fetch-dashboard.sh:
IMAGE_URL="https://your-deployment.vercel.app/api/kindle/image"
```

### 6.4 Kindle Display Considerations

| Aspect | Kindle | TRMNL |
|--------|--------|-------|
| Orientation | Portrait (native) | Landscape |
| Bit Depth | 8-bit greyscale | 1-bit BMP |
| Output Format | PNG | BMP |
| API Endpoint | `/api/kindle/image` | `/api/zones` |
| Refresh | Full only | Partial supported |

---

## Section 7: Spec Integrity

### 7.1 Spec is Immutable (V15.0)
The specification `CCDashDesignV15.0` (file: `specs/CCDashDesignV15.md`) cannot be modified without explicit approval from the project owner. Any changes require a new version number and formal review.

### 7.2 Zone Boundaries are Sacred
Zone pixel coordinates defined in the spec are fixed. Never modify the x, y, width, or height of any zone. The entire system depends on these boundaries for partial refresh.

### 7.3 Zone Dimensions are Fixed
Each zone has exact dimensions per the specification. Content must fit within these bounds—no overflow, no dynamic resizing.

### 7.4 Spec-Renderer Parity (MANDATORY) [CRITICAL]

**CRITICAL RULE: The CCDashRenderer MUST implement ALL elements defined in CCDashDesignV15.0.**

Every visual element, state, icon, or behaviour specified in `specs/CCDashDesignV15.md` (V15.0) MUST have a corresponding implementation in the renderer (`src/services/ccdash-renderer.js`). No exceptions.

#### 7.4.1 Required Parity Elements

| Spec Section | Element | Renderer Must Include |
|--------------|---------|----------------------|
| 2.6 | Weather Box | Temperature, condition text |
| 2.7 | Umbrella Indicator | Rain/no-rain state with correct styling |
| 4.1 | Summary Bar Left | All status variants (LEAVE NOW, DELAY, DISRUPTION, etc.) |
| 4.2 | Summary Bar Right | Total journey time in minutes |
| 5.2 | Leg Numbers | Sequential numbered circles (1, 2, 3...) |
| 5.3 | Mode Icons | Canvas-drawn icons for walk, train, tram, bus, coffee |
| 5.4 | Leg Titles | Status prefixes (DELAY, WARNING, RETURN, COFFEE) |
| 5.5 | Leg Subtitles | "Next: X, Y min" for transit, coffee status text |
| 5.6 | Duration Boxes | All states (normal, delayed, skip, cancelled) |

#### 7.4.2 Verification Checklist

Before any renderer PR is merged, verify:

- [ ] All spec sections have corresponding render functions
- [ ] All icons from spec Section 5.3 are implemented
- [ ] All leg states from spec Section 5.1 are styled correctly
- [ ] All status bar variants from spec Section 4.1 are supported
- [ ] Status bar applies Section 12.5 timing window (`<=120 min` target logic, `>120 min` leave-now context)
- [ ] Umbrella indicator renders for both rain/no-rain states
- [ ] Leg numbers appear on every leg
- [ ] Transit subtitles include real-time departure info when available

#### 7.4.3 Prohibited: Partial Implementation

**NEVER** implement only a subset of spec elements. If the spec defines it, the renderer MUST support it. Placeholder text, missing icons, or unimplemented states are **not acceptable** in production code.

#### 7.4.4 Spec-Renderer Sync Process

When the spec is updated (with approval):
1. Document ALL new/changed elements
2. Update renderer to implement ALL changes
3. Verify parity with visual comparison test
4. Both spec update and renderer update MUST be in the same PR or sequential PRs

### 7.5 V13.6 Journey Display Rules (2026-02-05)

The following rules govern how journey legs are displayed:

| Rule | Description | Implementation |
|------|-------------|----------------|
| **Closed Cafe Removal** | If cafe is CLOSED (not just "no time"), completely remove cafe legs from journey display | Filter out coffee leg AND walk-to-cafe leg |
| **No Consecutive Walk Legs** | Never display two walk legs adjacent to each other | Merge consecutive walks after filtering |
| **Live Departure Times** | Transit time boxes show: time to reach stop + live departure time from that point | Calculate from cumulative + nextDepartureTimesMs |
| **Actual Disruption Text** | Status bar shows actual disruption info, not generic "DISRUPTION" | Extract alertText/reason from disrupted leg |
| **Transit Box Size** | Transit time boxes minimum 72px width, 32px number size | Increased for e-ink visibility |

#### 7.5.1 Cafe Status vs Skip

| Cafe State | Display Behaviour |
|------------|------------------|
| OPEN + Time Available | Show coffee leg normally |
| OPEN + No Time | Show coffee leg with dashed border, "SKIPPED" text |
| CLOSED | **Completely remove** from journey, merge adjacent walks |

#### 7.5.2 Variable Initialization Order

**CRITICAL:** When adding new boolean checks in the leg rendering loop, declare all variables BEFORE using them in conditional logic. JavaScript `const/let` have temporal dead zones - using a variable before its declaration causes runtime errors.

**Wrong:**
```javascript
if (isWalkLeg) { /* ... */ }  // ERROR: Cannot access 'isWalkLeg' before initialization
const isWalkLeg = leg.type === 'walk';
```

**Correct:**
```javascript
const isWalkLeg = leg.type === 'walk';
if (isWalkLeg) { /* ... */ }  // Works
```

#### 7.5.3 No Consecutive Walk Legs — Enforcement (MANDATORY)

Two adjacent walk legs MUST NEVER appear in journey leg arrays or dashboard display, under any circumstances. This applies to ALL output paths:

- `api/screen.js` `buildJourneyLegs()` output
- `api/commutecompute.js` `buildCCDashLegs()` output
- `src/services/ccdash-renderer.js` rendering input

**Enforcement:** After ALL filtering operations (cafe removal, transit unavailability, arrival window exclusion, coffee skip), a final `mergeConsecutiveWalkLegs()` pass MUST run.

**Merge rule:**
- Combined duration = leg1.minutes + leg2.minutes
- Destination = leg2.to (further along route)
- Stop/station name = whichever leg has one
- Title = "Walk to [leg2.to]"

```javascript
function mergeConsecutiveWalkLegs(legs) {
  const merged = [];
  for (let i = 0; i < legs.length; i++) {
    const current = { ...legs[i] };
    if (current.type === 'walk' && i + 1 < legs.length && legs[i + 1].type === 'walk') {
      const next = legs[i + 1];
      current.minutes = (current.minutes || 0) + (next.minutes || 0);
      current.durationMinutes = (current.durationMinutes || 0) + (next.durationMinutes || 0);
      current.to = next.to || current.to;
      current.stopName = next.stopName || current.stopName;
      current.stationName = next.stationName || current.stationName;
      current.title = `Walk to ${next.to || current.to || 'destination'}`;
      i++;
    }
    merged.push(current);
  }
  return merged;
}
```

---

## Section 8: Design Specification (LOCKED)

**Status: [LOCKED] FROZEN — Do not modify without explicit approval**

### 8.1 Display Dimensions

| Device | Resolution | Orientation | Bit Depth |
|--------|-----------|-------------|-----------|
| TRMNL OG | 800×480 | Landscape | 1-bit BMP |
| TRMNL Mini | 600×448 | Landscape | 1-bit BMP |
| Kindle PW5 | 1236×1648 | Portrait | 8-bit PNG |

### 8.2 Layout Structure

```
┌────────────────────────────────────────────────────────────┐
│ HEADER (0-94px)                                            │
│ [Location] [Time 64px] [AM/PM] [Day] [Weather]             │
├────────────────────────────────────────────────────────────┤
│ SUMMARY BAR (96-124px)                                     │
│ LEAVE NOW → Arrive 7:25                              65min │
├────────────────────────────────────────────────────────────┤
│ JOURNEY LEGS (132-440px)                                   │
│ (1) [WALK] Walk to stop                               5 MIN │
│                         v                                  │
│ (2) [COFFEE] Coffee at Example Cafe                     8 MIN │
│                         v                                  │
│ (3) [TRAIN] Train to Flinders                        12 MIN │
├────────────────────────────────────────────────────────────┤
│ FOOTER (448-480px)                                         │
│ 80 COLLINS ST, MELBOURNE                    ARRIVE 8:32    │
└────────────────────────────────────────────────────────────┘
```

### 8.3 Colour Palette (LOCKED)

| Name | Hex | Usage |
|------|-----|-------|
| E-ink Background | `#f5f5f0` | Display background |
| Black | `#1a1a1a` | Text, borders, fills |
| Grey | `#888888` | Muted text, dashed borders |
| Light Grey | `#cccccc` | Cancelled stripe pattern |

### 8.4 Mode Icons (LOCKED)

| Mode | Icon | Unicode |
|------|------|---------|
| Walk | (walk icon) | U+1F6B6 |
| Train | (train icon) | U+1F683 |
| Tram | (tram icon) | U+1F68A |
| Bus | (bus icon) | U+1F68C |
| Coffee | (coffee icon) | U+2615 |

### 8.5 Leg States (LOCKED)

| State | Border | Background | Time Box |
|-------|--------|------------|----------|
| Normal | 2px solid black | White | Filled black |
| Delayed | 2px dashed grey | White | Filled black + "+X MIN" |
| Skip | 2px dashed grey | White (greyed) | None |
| Cancelled | 2px grey | Diagonal stripes 135° | "CANCELLED" text |
| Diverted | 2px grey | Vertical stripes 90° | Filled black |

### 8.6 Status Bar Variants (LOCKED)

| Status | Icon | Format |
|--------|------|--------|
| Normal | (none) | `LEAVE NOW → Arrive X:XX` |
| Leave Soon | (none) | `LEAVE IN X MIN → Arrive X:XX` |
| Delay | (timer icon) | `DELAY -> Arrive X:XX (+X min)` |
| Delays | (timer icon) | `DELAYS -> Arrive X:XX (+X min)` |
| Disruption | (warning icon) | `DISRUPTION -> Arrive X:XX (+X min)` |
| Tram Diversion | (warning icon) | `TRAM DIVERSION -> Arrive X:XX (+X min)` |

---

## Section 9: E-ink Constraints

### 9.1 1-bit Depth Only
All BMP output must be pure black and white (1-bit colour depth). No greyscale, no dithering unless explicitly specified. E-ink displays cannot render intermediate tones reliably.

### 9.2 Design for Partial Refresh
Any zone may refresh independently of others. Never assume zones refresh together. Each zone must be self-contained and render correctly in isolation.

### 9.3 No Anti-aliasing
Fonts and graphics must be pixel-perfect at 1-bit depth. Anti-aliased edges become ugly artifacts on e-ink. Use bitmap fonts or ensure vector fonts render cleanly at target sizes.

### 9.4 Test Visual Hierarchy
Content must be readable at arm's length on an 800×480 display. Test contrast, spacing, and font sizes. When in doubt, make it bigger and bolder.

---

## Section 10: BMP Rendering Rules

### 10.1 Output Format

```javascript
// ccdash-renderer.js output
{
  format: 'bmp',
  width: 800,
  height: 480,
  bitDepth: 1,        // 1-bit monochrome
  compression: 'none',
  colorTable: [
    [245, 245, 240],  // Index 0: e-ink white
    [26, 26, 26]      // Index 1: black
  ]
}
```

### 10.2 Memory Constraints (ESP32-C3)

| Resource | Limit | Strategy |
|----------|-------|----------|
| Free heap | ~100KB | Zone batching (6 zones/request) |
| PSRAM | None | Use streaming, no full-frame buffer |
| HTTP response | ~50KB | Batch API with `?batch=N` parameter |

### 10.3 Zone-Based Partial Refresh

```javascript
// Zone structure
{
  id: 0,           // Zone index (0-15)
  x: 0, y: 0,      // Top-left corner
  w: 800, h: 100,  // Dimensions
  changed: true,   // Diff from previous
  bmp: Buffer      // 1-bit BMP data
}
```

**Refresh Strategy:**
1. Server renders full frame
2. Server diffs against previous frame
3. Server returns only changed zones
4. Firmware fetches zones in batches (6 max)
5. Firmware applies partial refresh per zone

### 10.4 Font Loading in Vercel Serverless (v1.15)

**[CRITICAL]:** Fonts must be loaded before rendering text in serverless functions.

In Vercel's serverless environment, font files may be located at different paths depending on the deployment. Always try multiple paths:

```javascript
// [YES] CORRECT - Try multiple paths for font loading
const possiblePaths = [
  path.join(process.cwd(), 'fonts'),           // Vercel serverless standard
  path.join(__dirname, '../../fonts'),          // Relative to src/services
  '/var/task/fonts'                              // Vercel absolute path
];

for (const fontsDir of possiblePaths) {
  if (fs.existsSync(path.join(fontsDir, 'Inter-Bold.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Bold.ttf'), 'Inter Bold');
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.ttf'), 'Inter');
    break;
  }
}

// [NO] WRONG - Single path assumption
const fontsDir = path.join(__dirname, '../../fonts');  // May fail in serverless
```

**Font Family Fallbacks:**
```javascript
// [YES] CORRECT - Always include fallback
ctx.font = 'bold 16px Inter, sans-serif';

// [NO] WRONG - No fallback (silent failure if font missing)
ctx.font = 'bold 16px Inter';
```

**Vercel Configuration:** Ensure `vercel.json` includes fonts in `includeFiles`:
```json
{
  "functions": {
    "api/screen.js": {
      "includeFiles": "src/**,fonts/**"
    }
  }
}
```

---

## Section 11: API & Data Rules

### 11.1 Transport Victoria OpenData (GTFS-RT)

**Base URL:** `https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1`

**Auth Header:** `KeyId` (case-sensitive) with UUID format API key

**Available Feeds:**
| Mode | Trip Updates | Vehicle Positions | Service Alerts |
|------|--------------|-------------------|----------------|
| Metro | `/metro/trip-updates` | `/metro/vehicle-positions` | `/metro/service-alerts` |
| Tram | `/tram/trip-updates` | `/tram/vehicle-positions` | `/tram/service-alerts` |
| Bus | `/bus/trip-updates` | `/bus/vehicle-positions` | `/bus/service-alerts` |

> [CAUTION] **Note**: Old endpoint `data.ptv.vic.gov.au` is deprecated as of 2026-01-27

**Caching Rules:**
| Feed | Cache TTL | Reason |
|------|-----------|--------|
| TripUpdates | 30 seconds | Real-time accuracy |
| VehiclePositions | 30 seconds | Real-time accuracy |
| ServiceAlerts | 5 minutes | Changes infrequently |
| Static GTFS | 24 hours | Schedule data |

**Rate Limits:**
- No official limit, but respect fair use
- Batch requests where possible
- Cache aggressively

### 11.2 Weather (BOM)

**Source:** Bureau of Meteorology  
**Cache TTL:** 5 minutes  
**Required Fields:** `temp`, `condition`, `rainChance`

### 11.3 Google Places API (New)

**[WARNING] MANDATORY**: Use **Places API (New)**, NOT the legacy "Places API"

**API Endpoint:** `https://places.googleapis.com/v1/places:autocomplete`  
**Auth Method:** `X-Goog-Api-Key` header  
**Used For:** Address autocomplete in setup wizard  
**Cache TTL:** Session only (no persistent cache)  
**Billing:** User's own API key

```javascript
// [YES] CORRECT - Places API (New)
const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey
    },
    body: JSON.stringify({
        input: query,
        includedRegionCodes: ['au']
    })
});

// [NO] WRONG - Legacy Places API (deprecated)
const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${query}&key=${apiKey}`;
```

**Why Places API (New)?**
- Legacy Places API is being deprecated by Google
- New API has better features and pricing
- Admin panel instructs users to enable "Places API (New)"

### 11.4 Lightweight Endpoints

TRMNL devices have limited processing power and bandwidth. Keep API responses minimal. Return only what's needed, in the most efficient format.

### 11.5 Rate Limit Awareness

Never hammer the Transport Victoria OpenData API. Batch requests where possible. Implement appropriate delays between calls. Respect all API terms of service and rate limits.

### 11.6 LiveDash Multi-Device Endpoint

**Endpoint:** `/api/livedash`

LiveDash provides unified dashboard rendering for multiple device types from a single endpoint.

**Parameters:**
| Parameter | Required | Values | Default |
|-----------|----------|--------|---------|
| `device` | Yes | `trmnl`, `trmnl-mini`, `kindle-pw5`, `kindle-pw3`, `web` | - |
| `token` | Yes | Config token (base64) | - |
| `state` | No | `VIC`, `NSW`, `QLD` | `VIC` |

**Response Format by Device:**
| Device | Resolution | Format | Orientation |
|--------|-----------|--------|-------------|
| `trmnl` | 800×480 | 1-bit BMP | Landscape |
| `trmnl-mini` | 600×448 | 1-bit BMP | Landscape |
| `kindle-pw5` | 1236×1648 | 8-bit PNG | Portrait |
| `kindle-pw3` | 1072×1448 | 8-bit PNG | Portrait |
| `web` | 800×480 | PNG | Landscape |

**Example:**
```bash
curl "https://your-server.vercel.app/api/livedash?device=trmnl&token=eyJ..."
```

### 11.7 API Key Passing Requirements (Added v1.8)

**[CRITICAL]**: All API endpoints that call `getDepartures()` or `getDisruptions()` MUST pass the API key.

**Correct Pattern:**
```javascript
// Per Section 3.4 (Zero-Config): API key from environment (Vercel)
const ODATA_API_KEY = process.env.ODATA_API_KEY || null;

// Per Section 11.1: Pass API key to Transport Victoria OpenData client
const apiOptions = ODATA_API_KEY ? { apiKey: ODATA_API_KEY } : {};

const [trains, trams] = await Promise.all([
  getDepartures(trainStopId, 0, apiOptions),  // [YES] CORRECT
  getDepartures(tramStopId, 1, apiOptions),   // [YES] CORRECT
]);
```

**Wrong Pattern (causes fallback to mock data):**
```javascript
// [NO] WRONG - No API key passed!
const [trains, trams] = await Promise.all([
  getDepartures(trainStopId, 0),   // Falls back to mock data
  getDepartures(tramStopId, 1),    // Falls back to mock data
]);
```

**Affected Endpoints:**
| Endpoint | Fixed in v1.8 |
|----------|---------------|
| `/api/zones` | [YES] |
| `/api/zonedata` | [YES] |
| `/api/screen` | [YES] |
| `/api/zones-tiered` | [YES] |

**Why This Matters:**
Without the API key, `opendata-client.js` returns `getMockDepartures()` — static fake data instead of live Transport Victoria GTFS-RT feeds.

### 11.8 Zero-Config: Redis Storage for API Keys

**[YES] RESOLVED in v1.8** — Direct endpoints now use Redis for persistent API key storage.

**Implementation:**
```javascript
// [YES] CORRECT - Zero-Config compliant (v1.8+)
import { getTransitApiKey } from '../src/data/kv-preferences.js';

const transitApiKey = await getTransitApiKey();
const apiOptions = transitApiKey ? { apiKey: transitApiKey } : {};
```

**How It Works:**
1. User enters API key in Admin Panel / Setup Wizard
2. `/api/save-transit-key` validates and saves to Redis
3. Direct endpoints (`/api/zones`, `/api/zonedata`, `/api/screen`) load key from Redis
4. No environment variable configuration required

**Storage Module:** `src/data/kv-preferences.js`

| Function | Description |
|----------|-------------|
| `getTransitApiKey()` | Load Transport Victoria API key from Redis |
| `setTransitApiKey(key)` | Save API key to Redis (called by save endpoint) |
| `getClient()` | Get active Redis client for direct operations |
| `getStorageStatus()` | Debug: check Redis availability and stored keys |

**Redis Setup Required:**
1. Vercel Dashboard → Integrations → Browse Marketplace → Search **Redis** → Install Upstash → Create database
2. Connect to project (auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)
3. Keys saved via Admin Panel will persist across deployments

**Fallback Behaviour:**
- If KV not configured: falls back to in-memory storage (dev mode)
- If no API key saved: returns mock/fallback departure data

---

## Section 12: Business Logic

### 12.1 CoffeeDecision™ is Sacred
The CoffeeDecision engine logic is specified exactly in the CCDashDesignV15.0 spec. Implement it precisely as documented. No "improvements" or "optimisations" that alter the decision logic.

### 12.2 12-hour Time Format (User-Facing Only)
**User-facing content and firmware displays** must use 12-hour format with am/pm. This is a deliberate UX decision for readability.

**Internal code** (calculations, logging, API responses consumed by code) may use 24-hour time for simplicity.

**Scope:**
- [YES] 24-hour OK: Internal logic, `getHours()` for calculations, server logs, debug output
- [NO] 12-hour REQUIRED: Dashboard displays, e-ink screens, admin panel UI, firmware, any text shown to users

**Required Conversion Pattern (for user-facing output):**
```javascript
// [NO] WRONG - 24-hour in user-facing display
element.textContent = `${date.getHours()}:${date.getMinutes()}`;

// [YES] CORRECT - 12-hour format for user-facing content
const hours24 = date.getHours();
const hours12 = hours24 % 12 || 12;  // 12 instead of 0
const minutes = date.getMinutes().toString().padStart(2, '0');
const ampm = hours24 >= 12 ? 'pm' : 'am';
const timeStr = `${hours12}:${minutes}${ampm}`;

// [YES] OK - 24-hour for internal calculations
const currentMinutes = now.getHours() * 60 + now.getMinutes();
```

### 12.3 Walking Time Buffer
Journey calculations must always account for realistic walking time from the display location to the stop. This is core to the product's usefulness.

### 12.4 Journey Math is Critical
Test all edge cases in journey calculations:
- Midnight rollover
- No services available
- Services starting/ending for the day
- Delays and cancellations
- Multi-leg journeys

### 12.5 User Intent Timing Window (Status Bar)
The status bar MUST prioritise immediate "walk out the door" context when departure is far away.

**Rule:**
- If `leave_in_minutes > 120`, do NOT evaluate or display late/on-time against target arrival.
- In that far-future state, show context as-if leaving now (`LEAVE NOW -> Arrive X`) so users can quickly assess trip conditions.
- Only apply target-arrival judgments (`LATE`, on-time window logic, leave-in guidance) inside the actionable departure window (`<= 120 minutes`).

**Implementation requirement:**
```javascript
const ACTIONABLE_DEPARTURE_WINDOW_MINS = 120;
const farFromDeparture = leaveInMinutes > ACTIONABLE_DEPARTURE_WINDOW_MINS;

if (farFromDeparture) {
  // User intent: immediate context if leaving now
  statusText = `LEAVE NOW -> Arrive ${calculatedArrival}`;
} else {
  // Target-arrival semantics apply in actionable window
  evaluateLateOnTimeAgainstTarget();
}
```

---

## Section 13: Code Quality

### 13.1 Minimal Dependencies
Every npm package must justify its existence. Unnecessary dependencies increase bundle size, cold start times, and security surface. Prefer native solutions.

### 13.2 Error States Must Render
Every failure mode needs a displayable e-ink state. Users must never see a blank or broken display. Design error screens that are informative and on-brand.

### 13.3 No Magic Numbers
All zone coordinates, timing thresholds, pixel dimensions, and configuration values must come from named constants or configuration files. No hardcoded numbers scattered through the code.

### 13.4 Code Comments
```javascript
// [YES] Good: Explains WHY
// Cache for 30s to reduce API load while maintaining real-time accuracy
const CACHE_TTL = 30000;

// [NO] Bad: Explains WHAT (obvious from code)
// Set cache TTL to 30000
const CACHE_TTL = 30000;
```

### 13.5 File Naming Consistency
Files should use consistent terminology aligned with the correct API naming (Section 1.1).

**Preferred naming for service files:**
| Legacy Name | Preferred Name |
|-------------|----------------|
| `ptv-api.js` | `opendata-client.js` or `transport-api.js` |
| `ptv-service.js` | `opendata-service.js` |

**Note:** Filenames containing "ptv" are acceptable when referring to PTV stop IDs or route types (Transport Victoria's internal naming), but API client/service files should use neutral terminology.

### 13.6 Admin Panel JavaScript Patterns (v1.15)

**Image Loading - Never Set Empty src:**
```javascript
// [NO] WRONG - Triggers onerror callback immediately
previewImage.src = '';  // <-- This fires onerror!
setTimeout(() => {
    previewImage.src = actualUrl;  // Too late, error state already shown
}, 50);

// [YES] CORRECT - Use Image() preload pattern
const newImage = new Image();
newImage.onload = function() {
    previewImage.src = actualUrl;
    handleImageLoad();
};
newImage.onerror = function() {
    handleImageError();
};
newImage.src = actualUrl;  // Start loading
```

**KV Sync Before Server Requests:**
When the admin panel needs server-rendered content (like CCDash preview), sync localStorage to KV first:
```javascript
// [YES] CORRECT - Sync before loading preview
async function loadEinkPreview() {
    await syncConfigToKV();  // Ensure server has latest config
    const imageUrl = `${BASE_URL}/api/screen?t=${Date.now()}`;
    // ... load image
}

async function syncConfigToKV() {
    const config = JSON.parse(localStorage.getItem('cc-config') || '{}');
    await fetch('/api/sync-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            transitKey: localStorage.getItem('cc-transit-api-key'),
            preferences: config
        })
    });
}
```

---

## Section 14: Testing Requirements

### 14.1 Pre-Commit Checklist

- [ ] `npm run lint` passes
- [ ] `npm run test` passes (if tests exist)
- [ ] Firmware compiles: `pio run -e trmnl`
- [ ] No hardcoded API keys
- [ ] No forbidden terms (Section 1.1)
- [ ] Documentation updated if API changed

#### 14.1.1 Forbidden Terms Verification (MANDATORY)

Run this grep check before every commit to catch Section 1.1 violations:

```bash
grep -r "PTV_API_KEY\|PTV_DEV_ID\|PTV_USER_ID\|usetrmnl\.com\|trmnl\.com" \
  --include="*.js" src/ api/ && echo "[FAIL] FORBIDDEN TERMS FOUND - FIX BEFORE COMMIT" \
  || echo "[PASS] No forbidden terms"
```

This catches the most common violations. For complete verification, also check:
```bash
grep -rn "PTV API" --include="*.js" src/ api/  # Should return 0 results
grep -rn "console.*PTV" --include="*.js" src/ api/  # Check log messages
```

#### 14.1.2 CommuteCompute & LiveDash Testing

Test the CommuteCompute engine and LiveDash renderer before deploying:

```bash
# Test CommuteCompute route detection
npm run test:commutecompute

# Test LiveDash multi-device rendering
curl "http://localhost:3000/api/livedash?device=trmnl" -o test-trmnl.bmp
curl "http://localhost:3000/api/livedash?device=kindle-pw5" -o test-kindle.png
curl "http://localhost:3000/api/livedash?device=web" -o test-web.png

# Verify device-specific output:
# - TRMNL: 800×480, 1-bit BMP
# - Kindle PW5: 1236×1648, 8-bit PNG (portrait)
# - Web: 800×480, PNG

# Test CommuteCompute with different states
curl "http://localhost:3000/api/livedash?device=web&state=VIC"
curl "http://localhost:3000/api/livedash?device=web&state=NSW"
```

### 14.2 Firmware Testing

```bash
# Compile without flash
cd firmware && pio run -e trmnl

# Flash and monitor
# WARNING: Do NOT use `pio device monitor` -- causes crash/freeze on ESP32-C3.
pio run -e trmnl -t upload && screen /dev/cu.usbmodem* 115200

# Check for:
# - setup() < 5 seconds
# - No panics or resets
# - Zone refresh working
# - Memory stable over time
```

### 14.3 Server Testing

```bash
# Local development
npm run dev

# Test endpoints
curl http://localhost:3000/api/zones?ver=1
curl http://localhost:3000/api/dashboard
curl http://localhost:3000/api/health
```

### 14.4 UI Consistency Testing (MANDATORY for UI Changes)

**[WARNING] CRITICAL:** Any UI change must be tested systematically across ALL related components. Changes must flow correctly and link properly.

#### 14.4.1 Change Propagation Checklist

When changing terminology, endpoints, or UI elements, verify ALL of the following:

**Setup Wizard Steps:**
- [ ] Step 1: Google Places API Key
- [ ] Step 2: Addresses (Home, Work, Cafe)
- [ ] Step 3: Transit Authority selection
- [ ] Step 4: Transit API Key (optional)
- [ ] Step 5: Journey Preferences + Device Selection
- [ ] Completion screen + redirect to Admin

**Admin Panel Tabs:**
- [ ] Setup & Journey tab (summary view)
- [ ] API Settings tab (key status + editing)
- [ ] Live Data tab (departures, weather, coffee)
- [ ] Configuration tab (profiles, settings)
- [ ] Architecture tab (system diagrams)
- [ ] System & Support tab (help, status)

**Links Within Each Tab:**
- [ ] All internal links point to correct tabs/pages
- [ ] All external links open correctly (target="_blank")
- [ ] "Edit" buttons link to setup wizard
- [ ] "Go to X" buttons switch to correct tab

**Quick Links (footer of admin panel):**
- [ ] Live Display → `/api/livedash?device=trmnl-og&format=html`
- [ ] E-Ink Preview → `/preview.html`
- [ ] CC Dashboard → `/admin.html`
- [ ] Journey Visualizer → `/journey-display.html`
- [ ] API Status → `/api/status`

**Quick Link Target Pages:**
- [ ] Each linked page loads without errors
- [ ] Page uses consistent terminology
- [ ] Page reads from correct localStorage keys
- [ ] Back/navigation links work correctly

#### 14.4.2 Terminology Consistency

When renaming or changing terminology:

```bash
# Search for old terminology across all UI files
grep -rn "OLD_TERM" public/*.html --include="*.html"
grep -rn "OLD_TERM" public/*.js --include="*.js"

# Verify new terminology is consistent
grep -rn "NEW_TERM" public/*.html | wc -l  # Count occurrences
```

**Common areas to check:**
- Page titles and headers
- Button labels
- Form labels and placeholders
- Status messages and alerts
- Error messages
- Help text and tooltips

#### 14.4.3 localStorage Key Consistency

When changing localStorage keys, update ALL references:

| File | What to check |
|------|---------------|
| `setup-wizard.html` | Where keys are SET |
| `admin.html` | Where keys are READ |
| `preview.html` | If it reads config |
| `journey-display.html` | If it reads config |

```bash
# Find all localStorage references
grep -rn "localStorage" public/*.html | grep -E "getItem|setItem"
```

#### 14.4.4 Endpoint Consistency

When changing API endpoints:

- [ ] Update all `fetch()` calls in UI files
- [ ] Update Quick Links if endpoint URL changed
- [ ] Update API documentation
- [ ] Test endpoint returns expected format

```bash
# Find all fetch calls
grep -rn "fetch.*api" public/*.html
```

#### 14.4.5 Systematic Testing Order

Test changes in this order:

1. **Setup Wizard Flow:** Complete Steps 1-5, verify data saved to localStorage
2. **Admin Panel Load:** Verify all tabs populate from localStorage
3. **Tab Navigation:** Click each tab, verify content loads
4. **Internal Links:** Click every button/link within each tab
5. **Quick Links:** Click each Quick Link, verify target page loads
6. **Edit Flow:** Click Edit, make change, verify update propagates
7. **Reset Flow:** Reset config, verify wizard required again

---

## Section 15: Deployment Rules

### 15.1 Vercel Deployment

```bash
# Deploy via Vercel CLI
vercel --prod

# Or via deploy hook
curl -X POST $VERCEL_DEPLOY_HOOK
```

**Required Settings:**
- Node.js 20.x
- Build command: (none - serverless functions)
- Output directory: (default)
- Environment variables configured

### 15.2 Vercel-first Design

All code must work in Vercel's serverless environment. Account for cold starts, execution time limits, and stateless functions. Test locally with `vercel dev`.

### 15.3 Test Before Push

The main branch deploys automatically to production via Vercel. Never push untested code to main. Use feature branches for development.

### 15.4 Git Hygiene

Write meaningful commit messages that explain *what* and *why*. No commits titled "fix", "update", or "changes". Future you (and collaborators) will thank you.

### 15.5 Version Tagging

```bash
# Semantic versioning
git tag -a v3.0.0 -m "CCDashDesignV15.0 dashboard with BMP rendering"
git push origin v3.0.0
```

**Version Format:** `vMAJOR.MINOR.PATCH`
- MAJOR: Breaking changes, architecture shifts
- MINOR: New features, non-breaking
- PATCH: Bug fixes, minor improvements

### 15.6 Firmware Releases

1. Update version in `firmware/include/config.h`
2. Update `FIRMWARE-VERSION-HISTORY.md`
3. Compile and test on physical device
4. Tag release: `git tag -a fw-v1.2.0 -m "..."`
5. Push: `git push origin fw-v1.2.0`

---

## Section 16: Documentation Standards

### 16.1 File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature doc | `FEATURE-NAME.md` | `DISRUPTION-HANDLING.md` |
| API doc | `API-NAME.md` | `ZONES-API.md` |
| Audit | `AUDIT-NNN-YYYYMMDD.md` | `AUDIT-001-20260128.md` |
| Session log | `SESSION-YYYY-MM-DD.md` | `SESSION-2026-01-28.md` |

### 16.2 Required Sections

Every technical document must include:
- **Header:** Title, version, date, author
- **Overview:** What and why
- **Details:** How it works
- **Examples:** Code samples or diagrams
- **References:** Links to related docs

### 16.3 Logo Header Requirement (MANDATORY)

**All `.md` documentation files MUST include a centered logo header.**

#### 16.3.1 Standard Logo Header

```markdown
<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>
```

**Adjust the `src` path based on file location:**
- Root files: `assets/brand/cc-logo-apple-touch.png`
- docs/ files: `../assets/brand/cc-logo-apple-touch.png`
- firmware/ files: `../assets/brand/cc-logo-apple-touch.png`
- specs/ files: `../assets/brand/cc-logo-apple-touch.png`

#### 16.3.2 Logo Assets

All logo assets include the TM mark baked directly into the image file.
Wordmark variants show "TM" as white superscript after "COMPUTE".
Mark-only variants show "TM" near the top-right of the CC icon.

| Asset | Path | Usage |
|-------|------|-------|
| Source Logo | `assets/brand/cc-logo-square.png` | Official 900x900 source (all variants derived from this) |
| Logo Header | `assets/brand/cc-logo-apple-touch.png` | Standard markdown header (full logo with wordmark + TM) |
| Logo 512px | `assets/brand/cc-logo-512.png` | Setup wizard, high-res branding |
| Logo 256px | `assets/brand/cc-logo-256.png` | Medium displays |
| Logo 128px | `assets/brand/cc-logo-128.png` | HTML page footers |
| Logo 64px | `assets/brand/cc-logo-64.png` | Small displays |

#### 16.3.3 Exceptions

Logo headers are **NOT required** for:
- `LICENSE` files
- Auto-generated files (e.g., `package-lock.json`)
- Third-party files (e.g., OpenAPI specs in `specs/`)
- Archived/historical documents in `*/archive/` folders

---

## Section 17: Security

### 17.1 XSS Input Sanitization (MANDATORY)

**ALL user-entered data displayed in HTML MUST be sanitized:**

```javascript
// MANDATORY in all admin/setup HTML files
function sanitize(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'};
    return str.replace(/[&<>"'`=/]/g, c => map[c]);
}

// [NO] WRONG: ${stop.name}
// [YES] CORRECT: ${sanitize(stop.name)}
```

### 17.2 API Key Validation (MANDATORY)

**ALL API keys entered via admin panel or setup wizard MUST be validated before saving:**

#### 17.2.1 Validation Requirements

| API Type | Format Check | Live Test | On Failure |
|----------|--------------|-----------|------------|
| Transit Authority (VIC) | UUID format | Test against GTFS-RT endpoint | Save with "unverified" status |
| Transit Authority (NSW) | Min 20 chars | Test against TfNSW endpoint | Save with "unverified" status |
| Transit Authority (QLD) | Non-empty | Test against TransLink endpoint | Save with "unverified" status |
| Google Places | Non-empty | Test autocomplete request | Report error, allow retry |
| Mapbox | Non-empty | Test geocoding endpoint | Report error, allow retry |

#### 17.2.2 Implementation Pattern

```javascript
// [YES] CORRECT - Validate and test API keys before saving
async function saveApiKey(apiKey, type) {
    // Step 1: Format validation (fail fast)
    const formatResult = validateFormat(apiKey, type);
    if (!formatResult.valid) {
        return { success: false, message: formatResult.message };
    }
    
    // Step 2: Live API test (soft fail - save anyway but report)
    const testResult = await testApiKey(apiKey, type);
    
    // Step 3: Save with validation status
    await saveToPreferences(apiKey, {
        validated: testResult.success,
        lastValidated: testResult.success ? new Date().toISOString() : null,
        status: testResult.success ? 'valid' : 'unverified'
    });
    
    return {
        success: true,
        testResult,
        message: testResult.success 
            ? 'API key saved and validated'
            : 'API key saved (validation failed: ' + testResult.message + ')'
    };
}

// [NO] WRONG - Save without validation
async function saveApiKey(apiKey) {
    prefs.api.key = apiKey;  // No validation!
    await prefs.save();
}
```

#### 17.2.3 API Endpoints

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/api/save-transit-key` | Save and validate Transit Authority API key | POST |
| `/api/save-google-key` | Save and validate Google Places API key | POST |

#### 17.2.4 User Feedback Requirements

- [YES] Show validation status ((checkmark) Valid, (warning) Unverified, (x) Invalid)
- [YES] Display meaningful error messages (not technical codes)
- [YES] Allow saving unverified keys (network may be down)
- [YES] Show masked key preview (first 8 chars + "...")
- [YES] Indicate when last validated

```javascript
// UI feedback example
{
    success: true,
    testResult: {
        success: true,
        message: 'API key validated successfully',
        validated: true
    },
    keyMasked: 'a1b2c3d4...',
    state: 'VIC'
}
```

### 17.3 Free-Tier Architecture (MANDATORY)

**Principle:** The entire system MUST be usable for free by any user. No required paid APIs.

#### 17.3.1 API Cost Classification

| Service | Status | Cost | Notes |
|---------|--------|------|-------|
| Vercel Hosting | [YES] Required | FREE | Free tier sufficient for personal use |
| Transport Victoria OpenData | [YES] Required | FREE | Requires free registration |
| BOM Weather | [YES] Required | FREE | Public data, no API key |
| OpenStreetMap Nominatim | [YES] Fallback | FREE | Address geocoding fallback |
| Google Places API | [CAUTION] Optional | PAID | Must be skippable, OSM fallback required |

#### 17.3.2 Setup-Time Caching Strategy

**All location data MUST be cached during setup, not fetched at runtime.**

```
SETUP (one-time API calls)          RUNTIME (zero API calls in Free Mode)
──────────────────────────          ─────────────────────────────────────
1. User enters addresses     →      Webhook URL contains ALL cached data:
2. Geocode via OSM/Google    →      • Home/work/cafe lat/lon  
3. Cache cafe business hours →      • Cafe business hours
4. Encode in webhook URL     →      • User preferences
                                    • API mode flag
                             
                                    Dashboard reads from URL token only.
                                    NO external API calls required.
```

#### 17.3.3 API Mode Toggle

Users MUST be able to choose between:

| Mode | Runtime API Calls | Cost | Use Case |
|------|-------------------|------|----------|
| **Free Mode** (default) | None | $0 | Standard users |
| **Live Mode** (optional) | Google Places | $$ | Users wanting real-time cafe busy-ness |

#### 17.3.4 Implementation Requirements

1. **Geocoding:**
   - Primary: Google Places (if user provides key)
   - Fallback: OpenStreetMap Nominatim (always available, free)
   - Cache result in webhook URL token during setup

2. **Cafe Business Hours:**
   - Fetch ONCE during setup
   - Cache in webhook URL token
   - Fallback to default Melbourne cafe hours if no API

3. **Webhook URL Token:**
   - Must contain ALL data needed for dashboard rendering
   - Encoded as base64url for URL safety
   - No server-side storage required (Vercel serverless compatible)

4. **UI Clarity:**
   - Never claim paid APIs are "free"
   - Always show "Skip" option for optional APIs
   - Explain free alternatives clearly

#### 17.3.5 Config Token Structure

```javascript
{
  a: {},      // addresses (display text)
  l: {},      // locations (lat/lon - CACHED)
  s: 'VIC',   // state
  t: '09:00', // arrival time
  c: true,    // coffee enabled
  k: '',      // transit API key (free)
  cf: {},     // cafe data (CACHED: name, hours, placeId)
  m: 'cached' // API mode: 'cached' | 'live'
}
```

#### 17.3.6 Prohibited Patterns

- [NO] Runtime geocoding calls
- [NO] Required paid API keys
- [NO] Server-side storage dependencies (breaks Vercel serverless)
- [NO] Misleading "free" claims for paid services
- [NO] Features that silently fail without paid APIs

### 17.4 No Hardcoded Personal Information (MANDATORY)

**[CRITICAL]**: The codebase MUST be completely turnkey. No personal information may be hardcoded in any source file.

#### 17.4.1 Absolute Prohibition

**NEVER hardcode in source files:**

| Prohibited | Reason | Correct Approach |
|------------|--------|------------------|
| Home/work/cafe addresses | Personal location data | User enters via Setup Wizard → config token |
| API keys | Security risk + personal account | User enters via Setup Wizard → KV storage |
| WiFi credentials | Device-specific, security risk | WiFiManager captive portal or user config |
| Stop IDs for specific locations | Location-specific | Auto-detect from user's configured addresses |
| Lat/lon coordinates | Personal location data | Geocode from user-entered addresses |
| Personal names or identifiers | Privacy | Never store; use generic labels |
| Webhook URLs with personal tokens | Security + personal | Generated dynamically per device |
| Server/webhook URLs in firmware | Couples firmware to specific deployment | Provisioned via BLE from Setup Wizard (CC000004) |

#### 17.4.2 Turnkey Requirement

**Definition:** The repository must be immediately usable by ANY user who forks/clones it, without:
- Removing someone else's personal data
- Editing source files to change addresses
- Searching for hardcoded values to replace

**Verification Command:**
```bash
# Check for potential hardcoded addresses (Australian patterns)
grep -rn "[0-9]\+ [A-Z][a-z]* St\|Street\|Rd\|Road\|Ave" src/ api/ --include="*.js" | grep -v "example\|sample\|test"

# Check for hardcoded coordinates (Melbourne area)
grep -rn "\-37\.[0-9]\|144\.[0-9]" src/ api/ --include="*.js" | grep -v "DEFAULT\|MELBOURNE"

# Check for hardcoded WiFi credentials
grep -rn "SSID\|PASS\|password\|Optus\|Telstra" firmware/ --include="*.cpp" --include="*.h"
```

#### 17.4.3 Allowed Defaults

**These ARE permitted as sensible defaults:**

| Allowed | Example | Reason |
|---------|---------|--------|
| City centre coordinates | Melbourne CBD: -37.8136, 144.9631 | Generic fallback, not personal |
| Example addresses in comments | "e.g., 1 Example St, Melbourne" | Documentation only |
| Default API endpoints | `api.opendata.transport.vic.gov.au` | Public infrastructure |
| Stop ID ranges | "12xxx = Pakenham line citybound" | Technical documentation |
| Sample journey in test files | `tests/sample-journey.json` | Clearly marked test data |
| `DEFAULT_SERVER` placeholder in firmware | `https://your-project.vercel.app` | Documentation/turnkey display only — never used for auto-pairing |

#### 17.4.3.1 Firmware Webhook URL Rule (MANDATORY)

Server/webhook URLs MUST NOT be hardcoded in firmware source. The `DEFAULT_SERVER` constant is a placeholder for documentation/turnkey display only. Actual webhook URLs are provisioned via BLE from the user's Setup Wizard instance.

- Setup Wizard constructs the URL: `window.location.origin + '/api/screen'`
- URL is sent via BLE characteristic CC000004
- Firmware stores URL in NVS exactly as received
- If no URL in NVS, firmware returns to BLE setup — it does NOT fall back to `DEFAULT_SERVER`

#### 17.4.4 Configuration Flow

```
USER SETUP (personal data)          SOURCE CODE (no personal data)
──────────────────────────          ────────────────────────────────
1. Setup Wizard                     ✓ Generic code, no addresses
2. User enters addresses     →      ✓ Geocoding service (runtime)
3. User enters API keys      →      ✓ KV storage (not in code)
4. Config token generated    →      ✓ Encoded in device webhook URL
5. Device fetches dashboard  →      ✓ Server reads token, not hardcoded
```

#### 17.4.5 Pre-Commit Check

Before ANY commit, verify no personal data:

```bash
# Run from repo root
./scripts/check-no-personal-data.sh

# Or manually:
echo "Checking for personal data patterns..."
! grep -rn "PERSONAL_ADDRESS_PATTERN\|PERSONAL_CAFE_PATTERN" src/ api/ --include="*.js" \
  | grep -v "test\|example\|sample\|mock" && echo "[PASS] No personal data found" \
  || echo "[FAIL] PERSONAL DATA DETECTED - Remove before commit"

# Note: Replace PERSONAL_ADDRESS_PATTERN and PERSONAL_CAFE_PATTERN with actual
# patterns from your private security config (NOT stored in repo)
```

#### 17.4.6 Generic Placeholder Signifiers (MANDATORY)

**All examples in documentation and code MUST use these generic placeholders:**

| Data Type | Placeholder Pattern | Example |
|-----------|--------------------| --------|
| **Home address** | `123 Example Street, Suburb VIC 3000` | `123 Example Street, Melbourne VIC 3000` |
| **Work address** | `456 Sample Road, City VIC 3000` | `456 Sample Road, Melbourne VIC 3000` |
| **Cafe name** | `Example Cafe` or `Sample Coffee` | `Example Cafe` |
| **API keys** | `YOUR_API_KEY_HERE` or `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | `YOUR_API_KEY_HERE` |
| **Device ID** | `XXXXXX` or `000000` | `XXXXXX` |
| **MAC address** | `XX:XX:XX:XX:XX:XX` or `00:00:00:00:00:00` | `00:00:00:00:00:00` |
| **Webhook token** | `your-token-here` or `BASE64_CONFIG_TOKEN` | `BASE64_CONFIG_TOKEN` |
| **Email** | `user@example.com` | `user@example.com` |
| **Coordinates** | Melbourne CBD default: `-37.8136, 144.9631` | Generic city centre only |
| **Stop IDs** | Use official PTV names, not personal stops | `Flinders Street Station` |
| **Person names** | `User`, `Example User` | Never use real names |

**Signifier Keywords (must appear in placeholder context):**
- `example`, `Example`, `EXAMPLE`
- `sample`, `Sample`, `SAMPLE`
- `your`, `Your`, `YOUR`
- `placeholder`
- `xxx`, `XXX`, `xxxxxx`
- `test`, `Test`, `TEST` (in test files only)

**[NO] FORBIDDEN -- Real Personal Data:**
```javascript
// [NO] NEVER hardcode real addresses, cafes, or API keys
// (Examples intentionally omitted - do not document real patterns)
```

**[YES] CORRECT -- Generic Placeholders:**
```javascript
// [YES] ALWAYS:
const home = "123 Example Street, Melbourne VIC 3000";
const cafe = "Example Cafe";
const apiKey = "YOUR_API_KEY_HERE";
```

### 17.5 No Environment Files in Repository (MANDATORY)

**[WARNING] CRITICAL SECURITY RULE**: The repository MUST NOT contain any environment configuration files.

#### 17.5.1 Absolute Prohibition

The following files are **STRICTLY FORBIDDEN** in the repository:

| File | Status | Reason |
|------|--------|--------|
| `.env` | [NO] FORBIDDEN | Contains/implies secrets |
| `.env.example` | [NO] FORBIDDEN | Violates Zero-Config (Section 3.1) |
| `.env.local` | [NO] FORBIDDEN | Contains local secrets |
| `.env.production` | [NO] FORBIDDEN | Contains production secrets |
| `.env.*` | [NO] FORBIDDEN | Any env file variant |
| `.gitignore` | [YES] MINIMAL ONLY | Safety net to prevent accidental secret commits |

#### 17.5.2 Rationale

1. **Zero-Config Compliance (Section 3.1):** Users must NEVER configure environment variables
2. **Security:** Even example env files imply the system uses env vars, inviting security risks
3. **Clean Repository:** No infrastructure files that leak architecture assumptions

#### 17.5.3 Minimal .gitignore (Allowed)

A minimal `.gitignore` is permitted as a **safety net** to prevent accidental commits of:
- `.env*` files (if accidentally created)
- Secret files (`*.pem`, `*.key`)
- Build artifacts (`node_modules/`, `.pio/`)
- IDE settings (`.vscode/`, `.idea/`)

This does NOT violate Zero-Config because `.gitignore` protects against human error, not runtime configuration.

#### 17.5.4 Pre-Commit Verification

```bash
# MANDATORY: Run before ANY commit
echo "Checking for forbidden environment files..."
FORBIDDEN=$(find . -maxdepth 3 -name ".env*" 2>/dev/null | grep -v node_modules)
if [ -n "$FORBIDDEN" ]; then
    echo "[FAIL] FORBIDDEN .env FILES DETECTED:"
    echo "$FORBIDDEN"
    echo "Remove these files before committing!"
    exit 1
else
    echo "[PASS] No forbidden environment files"
fi
```

#### 17.5.5 Enforcement

- CI/CD pipelines MUST reject commits containing forbidden files
- Code review MUST verify no env files are introduced
- Automated scans MUST run on every pull request

### 17.6 Path Traversal Prevention (MANDATORY)

**[WARNING] CRITICAL**: Prevent attackers from accessing files outside intended directories.

#### 17.6.1 Forbidden Patterns

```javascript
// [NO] NEVER use user input directly in file paths
const file = req.query.file;
fs.readFile(`./data/${file}`);  // VULNERABLE: ../../../etc/passwd

// [YES] CORRECT - Validate and sanitize
const ALLOWED_FILES = ['config.json', 'data.json'];
const file = req.query.file;
if (!ALLOWED_FILES.includes(file)) {
  return res.status(403).json({ error: 'Invalid file' });
}
fs.readFile(path.join(__dirname, 'data', path.basename(file)));
```

#### 17.6.2 Rules

| Rule | Implementation |
|------|----------------|
| Whitelist allowed files | Use explicit allowlist, never blocklist |
| Use `path.basename()` | Strip directory components from user input |
| Use `path.join()` | Construct paths safely |
| Validate extensions | Only allow expected file types |
| Check resolved path | Ensure final path is within allowed directory |

#### 17.6.3 Verification

```javascript
// Safe path resolver
function safePath(userInput, baseDir) {
  const resolved = path.resolve(baseDir, path.basename(userInput));
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal attempt detected');
  }
  return resolved;
}
```

### 17.7 Supply Chain Security (MANDATORY)

**Risk**: 85-95% of apps use open-source dependencies — compromised packages can inject malicious code.

#### 17.7.1 Dependency Management Rules

| Rule | Implementation | Frequency |
|------|----------------|-----------|
| **Lock dependencies** | Always commit `package-lock.json` | Every install |
| **Audit regularly** | Run `npm audit` | Before every deploy |
| **Review updates** | Check changelogs before updating | Each update |
| **Minimise deps** | Remove unused dependencies | Monthly |
| **Pin versions** | Use exact versions for critical deps | As needed |

#### 17.7.2 Pre-Deploy Audit

```bash
# MANDATORY before any deployment
echo "Checking for vulnerable dependencies..."
npm audit --audit-level=high
if [ $? -ne 0 ]; then
    echo "[FAIL] HIGH/CRITICAL vulnerabilities found!"
    echo "Run 'npm audit fix' or review manually."
    exit 1
fi
echo "[PASS] No high/critical vulnerabilities"
```

#### 17.7.3 Prohibited Patterns

- [NO] `npm install` without reviewing new dependencies
- [NO] Using `*` or `latest` for version ranges
- [NO] Installing packages from unknown publishers
- [NO] Ignoring `npm audit` warnings for high/critical issues
- [NO] Deleting `package-lock.json` to "fix" issues

#### 17.7.4 Trusted Sources

| Package Type | Verification |
|--------------|--------------|
| Core (express, etc.) | Official npm, >1M weekly downloads |
| Canvas/Image | @napi-rs/canvas (verified publisher) |
| Crypto | Node.js built-in only (no third-party) |
| Auth | Only if needed: established providers |

### 17.8 Content Security Policy (CSP) Headers (RECOMMENDED)

**Purpose**: Prevent XSS by controlling which resources browsers can load.

#### 17.8.1 Vercel Configuration

Add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.opendata.transport.vic.gov.au https://maps.googleapis.com; frame-ancestors 'none'"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

#### 17.8.2 CSP Directives Explained

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Only load resources from same origin |
| `script-src` | `'self' 'unsafe-inline'` | Scripts from self + inline (needed for admin panel) |
| `style-src` | `'self' 'unsafe-inline'` | Styles from self + inline |
| `img-src` | `'self' data: blob:` | Images from self + data URLs + blobs |
| `connect-src` | Whitelist | Allowed API endpoints |
| `frame-ancestors` | `'none'` | Prevent clickjacking |

#### 17.8.3 Additional Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent framing (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |

### 17.9 Security Pre-Commit Checklist (MANDATORY)

**Run this checklist before EVERY commit:**

```bash
#!/bin/bash
# scripts/security-check.sh

echo "[LOCKED] SECURITY PRE-COMMIT CHECKLIST"
echo "================================"

FAILED=0

# 1. Check for .env files
echo -n "1. Checking for .env files... "
if find . -maxdepth 3 -name ".env*" 2>/dev/null | grep -v node_modules | grep -q .; then
    echo "[FAIL] FAIL"
    FAILED=1
else
    echo "[PASS] PASS"
fi

# 2. Check for hardcoded secrets
echo -n "2. Checking for hardcoded secrets... "
if grep -rn "API_KEY\s*=\s*['\"][a-zA-Z0-9]" --include="*.js" src/ api/ 2>/dev/null | grep -v "process.env" | grep -q .; then
    echo "[FAIL] FAIL - Potential hardcoded API key"
    FAILED=1
else
    echo "[PASS] PASS"
fi

# 3. Check for personal data patterns
echo -n "3. Checking for personal data... "
if grep -rn "[0-9]\+\s\+[A-Z][a-z]*\s\+\(St\|Street\|Rd\|Road\|Ave\)" --include="*.js" src/ api/ 2>/dev/null | grep -v "example\|sample\|test\|comment" | grep -q .; then
    echo "[FAIL] FAIL - Potential hardcoded address"
    FAILED=1
else
    echo "[PASS] PASS"
fi

# 4. Check for console.log with sensitive data
echo -n "4. Checking for sensitive logging... "
if grep -rn "console.log.*\(apiKey\|password\|secret\|token\)" --include="*.js" src/ api/ 2>/dev/null | grep -q .; then
    echo "[CAUTION] WARN - Review logging statements"
else
    echo "[PASS] PASS"
fi

# 5. Dependency audit
echo -n "5. Running npm audit... "
if npm audit --audit-level=high 2>/dev/null | grep -q "found 0 vulnerabilities"; then
    echo "[PASS] PASS"
else
    echo "[CAUTION] WARN - Run 'npm audit' for details"
fi

# 6. Check for unsanitized user input in HTML
echo -n "6. Checking for XSS vulnerabilities... "
if grep -rn '\${[^}]*}' --include="*.html" public/ 2>/dev/null | grep -v "sanitize\|escape" | grep -q .; then
    echo "[CAUTION] WARN - Review template literals in HTML"
else
    echo "[PASS] PASS"
fi

echo "================================"
if [ $FAILED -eq 1 ]; then
    echo "[FAIL] SECURITY CHECK FAILED - Fix issues before commit"
    exit 1
else
    echo "[PASS] SECURITY CHECK PASSED"
fi
```

#### 17.9.1 Quick Reference

| Check | Command | Must Pass? |
|-------|---------|------------|
| No .env files | `find . -name ".env*"` | [YES] Yes |
| No hardcoded secrets | `grep -rn "API_KEY\s*="` | [YES] Yes |
| No personal data | `grep -rn "address pattern"` | [YES] Yes |
| No sensitive logging | `grep -rn "console.log.*apiKey"` | [CAUTION] Review |
| Dependency audit | `npm audit --audit-level=high` | [CAUTION] Review |
| XSS check | Review template literals | [CAUTION] Review |

### 17.10 DDoS and Rate Limiting (INFORMATIONAL)

**Note**: Vercel provides built-in DDoS protection. Additional considerations:

| Protection | Provider | Status |
|------------|----------|--------|
| DDoS mitigation | Vercel Edge Network | [YES] Automatic |
| Rate limiting | Vercel (100 req/10s default) | [YES] Automatic |
| WAF | Vercel Firewall (Pro plan) | [CAUTION] Optional |
| CDN caching | Vercel Edge | [YES] Automatic |

**For additional protection** (optional):
- Cloudflare in front of Vercel
- Custom rate limiting in API routes

### 17.11 API Rate Limiting (MANDATORY)

**Purpose**: Prevent abuse, bot attacks, and cost overruns.

#### 17.11.1 Rate Limit Configuration

| Endpoint Type | Limit | Window | Action on Exceed |
|---------------|-------|--------|------------------|
| Public API (`/api/screen`, `/api/zones`) | 100 req | 1 hour | 429 Too Many Requests |
| Admin API (`/api/admin/*`) | 20 req | 1 minute | 429 + temporary block |
| Pairing (`/api/pair/*`) | 10 req | 1 minute | 429 + 5 min cooldown |
| Device webhook | 60 req | 1 hour | 429 (allows 1/min refresh) |

#### 17.11.2 Implementation Pattern

```javascript
// Simple in-memory rate limiter for Vercel serverless
const rateLimits = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;

function rateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }
  
  record.count++;
  rateLimits.set(ip, record);
  
  if (record.count > MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}
```

#### 17.11.3 Response Headers

```javascript
res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
res.setHeader('X-RateLimit-Remaining', remaining);
res.setHeader('X-RateLimit-Reset', resetAt);
```

### 17.12 HTTPS Enforcement (MANDATORY)

**Rule**: ALL endpoints MUST use HTTPS. HTTP requests MUST redirect.

#### 17.12.1 Vercel Configuration

Add to `vercel.json`:
```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "header", "key": "x-forwarded-proto", "value": "http" }],
      "destination": "https://:host/:path*",
      "permanent": true
    }
  ]
}
```

#### 17.12.2 Firmware Requirement

```cpp
// [NO] FORBIDDEN - HTTP
const char* apiUrl = "http://example.com/api/screen";

// [YES] REQUIRED - HTTPS only
const char* apiUrl = "https://example.com/api/screen";
```

**Note**: Vercel automatically provides HTTPS. This rule ensures no code bypasses it.

### 17.13 Input Validation (MANDATORY)

**Rule**: Validate ALL input on BOTH frontend AND backend. Trust nothing.

#### 17.13.1 Validation Layers

| Layer | Purpose | Examples |
|-------|---------|----------|
| Frontend | UX feedback | Format hints, required fields |
| Backend | Security enforcement | Type checking, bounds, sanitization |

#### 17.13.2 Required Validations

| Input Type | Frontend | Backend |
|------------|----------|---------|
| API keys | Format check (UUID) | Length, charset, live test |
| Addresses | Non-empty | Max length (500 chars), no scripts |
| Stop IDs | Numeric | Integer, valid range (0-99999) |
| Coordinates | Format | Range (-90 to 90, -180 to 180) |
| Device codes | 6 chars | Alphanumeric only, uppercase |
| URLs | Format | Protocol whitelist (https only) |

#### 17.13.3 Backend Validation Pattern

```javascript
// [YES] CORRECT - Validate everything
function validateAddress(input) {
  if (typeof input !== 'string') return { valid: false, error: 'Must be string' };
  if (input.length > 500) return { valid: false, error: 'Too long' };
  if (/<script|javascript:/i.test(input)) return { valid: false, error: 'Invalid characters' };
  return { valid: true, value: input.trim() };
}

// [NO] WRONG - Trust user input
const address = req.body.address; // No validation!
```

#### 17.13.4 URL Parameter Validation

```javascript
// [NO] WRONG - Direct use
const stopId = req.query.stopId;

// [YES] CORRECT - Validate and coerce
const stopId = parseInt(req.query.stopId, 10);
if (isNaN(stopId) || stopId < 0 || stopId > 99999) {
  return res.status(400).json({ error: 'Invalid stop ID' });
}
```

### 17.14 Data Minimisation (MANDATORY)

**Principle**: Only collect and store data you actually need.

#### 17.14.1 Allowed Data Collection

| Data | Stored? | Purpose | Retention |
|------|---------|---------|-----------|
| API keys | [YES] KV | Transit data access | Until user deletes |
| Addresses (display) | [YES] Token | Dashboard display | In token only |
| Coordinates | [YES] Token | Weather/transit lookup | In token only |
| Device pairing code | [YES] KV | One-time pairing | 10 min TTL |
| Preferences | [YES] KV | User settings | Until user deletes |

#### 17.14.2 Forbidden Data Collection

| Data | Why Forbidden |
|------|---------------|
| IP addresses (logged) | Privacy, not needed |
| User agents (stored) | Privacy, not needed |
| Request history | Privacy, storage cost |
| Personal names | Not needed for function |
| Email addresses | No accounts, not needed |

#### 17.14.3 Implementation

```javascript
// [NO] WRONG - Collecting unnecessary data
const logEntry = {
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: Date.now(),
  path: req.path
};
await saveLog(logEntry);

// [YES] CORRECT - Minimal logging
console.log(`[${req.method}] ${req.path} - ${res.statusCode}`);
// No persistent storage of request details
```

### 17.15 Dependency Update Schedule (MANDATORY)

**Rule**: Dependencies MUST be updated regularly. Security patches MUST be applied immediately.

#### 17.15.1 Update Schedule

| Type | Frequency | Action |
|------|-----------|--------|
| Security patches (critical) | Same day | `npm audit fix`, test, deploy |
| Security patches (high) | Within 48 hours | `npm audit fix`, test, deploy |
| Regular updates | Monthly | Review changelogs, test, deploy |
| Major versions | Quarterly review | Evaluate breaking changes |

#### 17.15.2 Pre-Update Checklist

```bash
# 1. Check for vulnerabilities
npm audit

# 2. Check for outdated packages
npm outdated

# 3. Update (non-breaking)
npm update

# 4. Run tests
npm test

# 5. Check for breaking changes in major updates
npm outdated --long
```

#### 17.15.3 Automated Alerts (Recommended)

- Enable GitLab Dependabot or Renovate
- Configure for security updates only (auto-merge patch versions)
- Review major updates manually

### 17.16 Secret Rotation (RECOMMENDED)

**Best Practice**: Rotate API keys periodically to limit exposure from potential leaks.

#### 17.16.1 Rotation Schedule

| Secret Type | Rotation Period | How |
|-------------|-----------------|-----|
| Transit API key | 90 days | Regenerate on OpenData portal |
| Google Places key | 90 days | Regenerate in Google Cloud Console |
| KV connection | Managed by Vercel | Automatic |

#### 17.16.2 Rotation Process

1. Generate new key in provider console
2. Update key in KV via Admin Panel
3. Verify new key works (test API call)
4. Revoke old key in provider console (after 24h grace period)

### 17.17 Encryption Standards (INFORMATIONAL)

**Current encryption status:**

| Layer | Encryption | Provider |
|-------|------------|----------|
| In transit | TLS 1.3 | Vercel Edge |
| At rest (Redis) | AES-256 | Redis |
| Config tokens | Base64URL | Not encrypted (public data only) |

**Note**: Config tokens are NOT encrypted because they contain no secrets — only display addresses and preferences. API keys are stored separately in KV (encrypted at rest).

### 17.18 Software Bill of Materials (SBOM) (RECOMMENDED)

**Purpose**: Track all dependencies for supply chain security and enterprise compliance.

#### 17.18.1 SBOM Generation

```bash
# Generate SBOM using Syft
npx @anchore/syft . -o cyclonedx-json > sbom.json

# Or using npm
npm sbom --sbom-format cyclonedx > sbom.json
```

#### 17.18.2 Vulnerability Scanning Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| **Grype** | Vulnerability scanner | `grype sbom:./sbom.json` |
| **Syft** | SBOM generator | `syft . -o cyclonedx-json` |
| **DependencyTrack** | SBOM management platform | Upload sbom.json to dashboard |
| **npm audit** | Built-in vulnerability check | `npm audit --audit-level=high` |

#### 17.18.3 When to Generate SBOM

- Before every production deployment
- When adding new dependencies
- Monthly for compliance reporting

### 17.19 Multi-Layer Code Review (MANDATORY)

**Principle**: Don't let the same AI that wrote code be the only reviewer.

#### 17.19.1 Review Layers

| Layer | Reviewer | Purpose |
|-------|----------|---------|
| 1 | AI (writer) | Initial implementation |
| 2 | Different AI/Tool | Security audit, catch blind spots |
| 3 | Human (Angus) | Final approval, business logic |

#### 17.19.2 Recommended Review Tools

| Tool | Strength | Use Case |
|------|----------|----------|
| **CodeRabbit** | Catches SQL injection, exposed credentials, broken auth | PR reviews |
| **Secondary AI review** | Data flow analysis, logic review | Security audit |
| **npm audit** | Dependency vulnerabilities | Pre-commit |
| **ESLint security plugins** | Static analysis | CI/CD |

#### 17.19.3 Why Multi-Tool Review?

> "Never trust a single tool to review its own output." — Common wisdom

**The risk**: Automated tools have blind spots for patterns they generate. A second tool catches issues the first missed.

#### 17.19.4 Implementation

```bash
# Pre-commit checklist (Section 17.9)
1. npm audit                    # Dependency vulnerabilities
2. npm run lint                 # ESLint with security rules
3. ./scripts/security-check.sh  # Custom security checks
4. (Optional) CodeRabbit PR review  # AI security audit

# Human review (Angus)
5. Manual QC on GitLab MR
6. Merge only after approval
```

### 17.20 Code Signing (RECOMMENDED)

**Purpose**: Ensure all commits are authentic and traceable.

#### 17.20.1 GPG Commit Signing

```bash
# Configure git to sign commits
git config --global commit.gpgsign true
git config --global user.signingkey YOUR_GPG_KEY_ID

# Verify signed commits
git log --show-signature
```

#### 17.20.2 Benefits

- Proves commit authenticity
- Prevents commit spoofing
- Required for some enterprise deployments
- GitLab shows "Verified" badge

#### 17.20.3 Current Status

| Signing | Status | Notes |
|---------|--------|-------|
| GPG commit signing | [CAUTION] Optional | Recommended for releases |
| npm package signing | N/A | Not publishing to npm |
| Docker image signing | N/A | No Docker (serverless) |

---

## Section 18: Change Management

### 18.1 Locked Elements

The following require **explicit approval** before modification:

| Element | Document | Reason |
|---------|----------|--------|
| Zone layout positions | CCDashDesignV15.0 | UI consistency |
| Status bar variants | CCDashDesignV15.0 | User expectations |
| Leg states | CCDashDesignV15.0 | Visual language |
| Colour palette | CCDashDesignV15.0 | E-ink optimisation |
| Mode icons | CCDashDesignV15.0 | Brand consistency |
| CoffeeDecision logic | CCDashDesignV15.0 | Core feature |
| Anti-brick rules | This document | Device safety |

### 18.2 Modification Process

1. **Propose:** Create issue describing change
2. **Review:** Get approval from maintainer
3. **Document:** Update relevant specs FIRST
4. **Implement:** Code changes match updated spec
5. **Test:** Verify on physical device
6. **Merge:** PR with all artifacts

### 18.3 Cross-System Change Propagation

**CRITICAL RULE**: When ANY change is made to ANY part of the system, ALL dependent software, programs, documentation, and configurations MUST be updated accordingly.

**Examples:**
1. **Schema Changes** → Update: route-planner, admin UI, docs, validation, rendering
2. **API Changes** → Update: all calling services, docs, error handling, tests
3. **Config Changes** → Update: setup wizard, preferences, rendering, device firmware

**Verification:**
```bash
grep -r "oldValue" src/       # Find code references
grep -r "oldValue" docs/      # Find doc references  
grep -r "oldValue" public/    # Find UI references
```

---

## Section 19: Refresh Timing

**CRITICAL — DO NOT CHANGE WITHOUT EXPLICIT APPROVAL**

| Setting | Value | Location |
|---------|-------|----------|
| Partial Refresh | 60,000 ms (1 min) | firmware/src/main.cpp `REFRESH_INTERVAL` |
| Full Refresh | 300,000 ms (5 min) | firmware/src/main.cpp `FULL_REFRESH_INTERVAL` |

**v1.8 Update (2026-01-31):** Refresh interval changed from 20s to 60s.

**Rationale:**
- 60s balances real-time feel with reduced API load and battery usage
- Transit departures typically don't change dramatically within 60 seconds
- Reduces e-ink wear (fewer partial refreshes per hour)

---

## Section 20: Licensing & Intellectual Property

**[CRITICAL — MANDATORY]**: The Commute Compute System™ is dual-licensed under **AGPL-3.0** (open source) and a separate **commercial licence**. This dual licensing structure is MANDATORY and must be maintained across all original source files, documentation, and distribution.

**Governing Law:** This project and all licensing terms are governed by the **laws of the State of Victoria, Australia**. Intellectual property rights are established under the *Copyright Act 1968* (Cth).

### 20.1 Intellectual Property

All intellectual property rights are owned by **Angus Bergman**.

#### AGPL-3.0 Obligations (Open Source Users)

The AGPL-3.0 licence imposes the following mandatory obligations on anyone who uses, modifies, or distributes this software:

1. **Network Copyleft (Section 13):** If you modify the Program and make it available to users over a network, you MUST provide those users access to the corresponding source code of your modified version
2. **Source Disclosure:** All modifications and derivative works MUST be released under AGPL-3.0
3. **Copyright Preservation:** All copyright notices, SPDX identifiers, and licence headers MUST be preserved in all copies and derivative works
4. **Attribution:** The dual licence notice, trade mark attributions, and third-party data attributions MUST remain intact

Non-compliance with these obligations constitutes copyright infringement under the *Copyright Act 1968* (Cth) and applicable international copyright treaties.

### 20.2 Trade Marks

The following are **trade mark applications (™, registration pending)** owned by **Angus Bergman**, with all associated copyrights:

| Mark | Description | Copyright Owner |
|------|-------------|-----------------|
| **Commute Compute™** | Primary brand name | © 2026 Angus Bergman |
| **Commute Compute System™** | Full system name | © 2026 Angus Bergman |
| **CommuteCompute™** | Journey calculation engine (parent of 5 intelligence engines) | © 2026 Angus Bergman |
| **CCDash™** | Dashboard rendering system | © 2026 Angus Bergman |
| **CC LiveDash™** | Live display output system | © 2026 Angus Bergman |
| **CCFirm™** | Custom firmware family | © 2026 Angus Bergman |
| **CC Logo** | Arrow-integrated CC letterform | © 2026 Angus Bergman |

**Ownership:** All trade marks and associated intellectual property are exclusively owned by Angus Bergman.

**Licence Disclaimer:** Use of the Commute Compute System™ and all associated trade marks and intellectual property is granted solely pursuant to the **AGPL-3.0 (Dual Licence)**. No ownership rights are transferred. Commercial use prohibited without written permission. See **LEGAL.md** for full terms.

**Third-Party Exclusion:** Copyright claims apply to original work only. Third-party content (Transport Victoria, BoM, OpenStreetMap, npm dependencies) remains property of respective owners under their original licences. See **LEGAL.md** Section "Third-Party Content Exclusion".

#### CommuteCompute™ Intelligence Engines

CommuteCompute™ comprises **five interconnected intelligence engines** that work together. All engine names are common law trade marks of Angus Bergman:

| Engine | Role | Trade Marked | Copyright |
|--------|------|-------------|-----------|
| **CommuteCompute™** | Core journey orchestration | Yes (™) | © 2026 Angus Bergman |
| **CoffeeDecision™** | Café stop feasibility analysis | Yes (™) | © 2026 Angus Bergman |
| **DepartureConfidence™** | Real-time departure reliability scoring and prediction | Yes (™) | © 2026 Angus Bergman |
| **LifestyleContext™** | User lifestyle pattern analysis and preference learning | Yes (™) | © 2026 Angus Bergman |
| **SleepOptimiser™** | Optimal departure time calculation based on sleep patterns | Yes (™) | © 2026 Angus Bergman |
| **AltTransit™** | Alternative transport route discovery and recommendation | Yes (™) | © 2026 Angus Bergman |

### 20.3 Firmware Naming Convention

All custom firmware MUST use the **CCFirm** prefix:

| Firmware | Target Device |
|----------|---------------|
| CCFirmTRMNL | TRMNL e-ink display |
| CCFirmKindle | Jailbroken Kindle devices |
| CCFirmWaveshare | Waveshare e-ink displays |
| CCFirmESP32 | Generic ESP32 e-ink setups |

### 20.4 Licence Header (Required in all files)

```
Copyright (c) 2026 Angus Bergman
Licensed under AGPL-3.0 (Dual Licence)
https://www.gnu.org/licenses/agpl-3.0.html
```

### 20.5 Prohibited Licences

**Prohibited licences for original work:**
- [NO] MIT, Apache, GPL/LGPL, BSD
- [YES] Third-party libraries retain their original licences

### 20.6 Full Legal Documentation

See **LEGAL.md** for complete intellectual property documentation, including governing law, commercial licence framework, and limitation of liability.

### 20.7 Governing Law & Jurisdiction

All licensing terms, intellectual property rights, and disputes arising from use of the Commute Compute System™ are governed by the **laws of the State of Victoria, Australia**. The parties submit to the exclusive jurisdiction of the **courts of Victoria, Australia**.

Intellectual property rights in the Commute Compute System™ are established and enforceable under the *Copyright Act 1968* (Cth). Moral rights are asserted under Part IX of the *Copyright Act 1968* (Cth).

### 20.8 Commercial Licence Framework

A commercial licence is available for use cases incompatible with AGPL-3.0 (closed-source products, proprietary SaaS, embedded systems without source disclosure).

**Key terms:**
- Commercial licence terms are **bespoke** and negotiated on a **per-licensee basis** at the **sole and absolute discretion** of Angus Bergman
- No standard commercial licence template or published pricing exists — all terms are confirmed individually
- A commercial licence is only effective when confirmed in a **written agreement signed by Angus Bergman**
- Contact: **commutecompute.licensing@gmail.com**

See **LEGAL.md** for the full commercial licence framework.

### 20.9 Audit Enforcement

All licensing checks in the compliance audit (`./scripts/comprehensive-compliance-audit.sh`) are **blocking violations** (FAIL, not WARN). A commit MUST NOT proceed if any licensing check fails.

Required checks (all must pass):
- LICENSE file references AGPL-3.0 and dual licensing / commercial terms
- All source files have `SPDX-License-Identifier: AGPL-3.0-or-later` headers
- All source files reference dual licensing in headers
- All copyright headers use correct year (2026)
- LEGAL.md exists with AGPL-3.0 reference, third-party content exclusion, governing law clause, commercial licence framework, and Copyright Act 1968 reference

---

## Section 21: Device Setup Flow (MANDATORY)

**[CRITICAL]**: All devices MUST follow this exact setup sequence.

### 21.1 Boot Sequence

| Stage | Screen | Duration | Exit Condition |
|-------|--------|----------|----------------|
| 1. Boot | Large CC logo centered | 2-3 seconds | Initialization complete |
| 2. WiFi Setup | Smaller CC logo + instructions + copyright | Until configured | Setup wizard complete |
| 3. Dashboard | Live journey display | Continuous | Device reset |

### 21.2 Boot Screen (Stage 1)

- **Large CC logo** centered on screen
- Display while device initializes WiFi stack
- No text, just branding
- Duration: 2-3 seconds

### 21.3 WiFi Setup Screen (Stage 2)

**Layout:**
- Smaller CC logo at top
- Setup instructions in middle
- Copyright stamp at bottom

**[WARNING] CRITICAL**: Device MUST remain on this screen until setup wizard is complete. No skipping to dashboard without full configuration.

**User Instructions to Display:**
1. Fork the git repo
2. Set up free server at Render.com with custom server name
3. Connect e-ink device to WiFi network
4. Set server URL as `[your-name].onrender.app`
5. Complete setup wizard on web

### 21.4 Post-Setup (Stage 3)

After setup wizard is complete:
1. Device transitions to live dashboard
2. User accesses admin page on computer/phone for configuration changes
3. Dashboard refreshes every 20 seconds (partial) / 10 minutes (full)

### 21.5 Hosting Platform

**Options** (both free tier):
1. **Vercel** - URL format: `https://[custom-name].vercel.app`
2. **Render** - URL format: `https://[custom-name].onrender.app`

Both support zero-config deployment from forked repo. Free tier sufficient for personal use.

### 21.6 Device Pairing System (v1.19)

**[CRITICAL]**: Device pairing MUST use Redis for persistent storage. In-memory stores do NOT work across serverless invocations.

#### 21.6.1 Pairing Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Device boots   │───▶│  Generates 6-   │───▶│  Displays code  │
│  (CCFirm™)      │    │  char code      │    │  on e-ink       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Device polls   │◀───│  Redis  │◀───│  User enters    │
│  GET /api/pair  │    │  (persistent)   │    │  code in wizard │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### 21.6.2 Pairing Code Format

| Property | Value |
|----------|-------|
| Length | 6 characters |
| Character set | A-Z (excluding I, L, O) and 2-9 — 30 characters (ambiguous characters removed for readability) |
| Example | `A3B7K9` |
| Combinations | 30^6 = 729 million |
| TTL | 10 minutes (auto-expires) |

#### 21.6.3 Redis Storage (MANDATORY)

```javascript
import { getClient } from '../src/data/kv-preferences.js';

const client = await getClient();

// Store pairing data with 10-minute TTL
await client.set(`cc:pair:${code}`, { webhookUrl, createdAt }, { ex: 600 });

// Retrieve pairing data (device polling)
const data = await client.get(`cc:pair:${code}`);

// Delete after successful retrieval
await client.del(`cc:pair:${code}`);
```

**Why Redis is Required:**
- Vercel serverless functions are stateless
- Each invocation may run on a different instance
- In-memory stores (Map, global variables) do NOT persist
- Device polls and wizard POST may hit different instances

**Fallback:** In-memory store ONLY for local development testing.

#### 21.6.4 Device Polling Behaviour

| Parameter | Value |
|-----------|-------|
| Poll interval | 5 seconds |
| Timeout | 10 minutes |
| Endpoint | `GET /api/pair/{CODE}` |
| Success response | `{ success: true, status: "paired", webhookUrl: "..." }` |
| Waiting response | `{ success: true, status: "waiting" }` |

#### 21.6.5 Setup Wizard Integration

The Setup Wizard MUST:
1. Accept 6-character pairing code from user
2. POST configuration to `/api/pair/{CODE}`
3. Include generated `webhookUrl` in POST body
4. Display "Directing you to your dashboard now..." on completion

### 21.7 BLE Provisioning Flow: WiFi + Webhook URL (v7.5.0)

**[CRITICAL]**: This is the MANDATORY provisioning architecture. BLE sends WiFi credentials AND webhook URL in a single phase. Pairing code is retained as a secondary/optional path only.

#### 21.7.1 Why BLE Provisioning?

| Approach | Problem |
|----------|---------|
| WiFiManager / Captive Portal | **CRASHES** ESP32-C3 with 0xbaad5678 Guru Meditation |
| BLE WiFi only + Pairing Code | Works, but requires two-phase setup with polling |
| **BLE sends WiFi + Webhook URL** | **[YES]** Single-phase, no crashes, no hardcoded URLs, no polling |

**Benefits:**
- **No captive portal** — avoids crash
- **Single-phase provisioning** — SSID + password + webhook URL all via BLE
- **No hardcoded server URLs** — webhook URL comes from Setup Wizard's `window.location.origin`
- **No pairing code needed** — device proceeds directly to dashboard after WiFi connects
- **Re-configurable** — factory reset returns to BLE setup for reprovisioning

#### 21.7.2 BLE Provisioning Flow (Primary)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  BLE Provisioning: WiFi + Webhook URL (Single Phase)                    │
│                                                                         │
│  ┌─────────────┐         BLE          ┌─────────────┐                  │
│  │   Phone     │ ───────────────────► │   Device    │                  │
│  │   Browser   │   SSID (CC000002)    │   ESP32     │                  │
│  │  (Chrome)   │   Password (CC0003)  │  (CCFirm)   │                  │
│  │             │   URL (CC000004)     │             │                  │
│  └─────────────┘                      └─────────────┘                  │
│        │                                     │                          │
│        │ Setup Wizard constructs URL:        ▼                          │
│        │ window.location.origin         Saves all 3 to NVS             │
│        │   + '/api/screen'              Status → "configured"          │
│        │                                     │                          │
│        │                                     ▼                          │
│        │                               Connects to WiFi                 │
│        │                                     │                          │
│        │                                     ▼                          │
│        │                              ┌─────────────┐                   │
│        │                              │   Device    │                   │
│        │                              │  Fetches    │                   │
│        │                              │  Dashboard  │                   │
│        │                              └─────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Note:** Pairing code flow (Section 21.6) is retained as a secondary/optional path for advanced re-configuration without factory reset.

#### 21.7.3 Firmware State Machine (BLE Provisioning)

```
STATE_INIT
    │
    ▼
STATE_CHECK_CREDENTIALS ──── Has WiFi + URL? ──── Yes ───► STATE_WIFI_CONNECT
    │                                                            │
    No (missing any of: SSID, password, URL)                     │
    ▼                                                            │
STATE_BLE_SETUP                                                  │
    │                                                            │
    │ Receives SSID + Password + Webhook URL via BLE             │
    │ (CC000002, CC000003, CC000004)                             │
    │ Saves all 3 to NVS                                         │
    │ Status notifies "configured"                               │
    ▼                                                            │
STATE_WIFI_CONNECT ◄─────────────────────────────────────────────┘
    │
    │ Connected to WiFi
    ▼
STATE_FETCH_DASHBOARD
    │
    ▼
STATE_RENDER ◄──► STATE_IDLE
```

**Primary flow:** `STATE_BLE_SETUP` -> (receives SSID + Password + URL) -> `STATE_WIFI_CONNECT` -> `STATE_FETCH_DASHBOARD`

No `STATE_PAIRING_MODE` needed for the primary flow. If no webhook URL exists in NVS, device returns to `STATE_BLE_SETUP`.

#### 21.7.4 BLE Characteristics

| UUID | Name | Direction | Purpose |
|------|------|-----------|---------|
| `CC000001-...` | Service | — | Service UUID |
| `CC000002-...` | SSID | Write | WiFi network name |
| `CC000003-...` | Password | Write | WiFi password |
| `CC000004-...` | Webhook URL | Write | **RE-ADDED in v7.5.0** — Server webhook URL |
| `CC000005-...` | Status | Read/Notify | Connection status (notifies "configured" when all 3 received) |
| `CC000006-...` | WiFiList | Read | Available networks |

**[RE-ADDED in v7.5.0]**: `CC000004` (Webhook URL) — Setup Wizard sends `window.location.origin + '/api/screen'` via this characteristic. This is the primary mechanism for server URL provisioning; no hardcoded server URLs are used.

#### 21.7.5 Pairing Screen Display (Secondary/Optional)

**Note:** This screen is only shown if using the optional pairing code flow. The primary BLE provisioning flow (v7.5.0+) does not require a pairing code — the device proceeds directly to dashboard after BLE provisioning.

When device enters `STATE_PAIRING_MODE` (secondary flow only), display:

```
┌─────────────────────────────────────────┐
│                                         │
│         COMMUTE COMPUTE                 │
│                                         │
│   WiFi Connected: ✓                     │
│                                         │
│   Enter this code in Setup Wizard:      │
│                                         │
│         ┌─────────────┐                 │
│         │   A7X9K2    │                 │
│         └─────────────┘                 │
│                                         │
│   [your-url].vercel.app/setup           │
│                                         │
│   Waiting for configuration...          │
│                                         │
│   © 2026 Angus Bergman                  │
└─────────────────────────────────────────┘
```

#### 21.7.6 Setup Wizard Flow (BLE Provisioning)

**Single-Phase BLE Provisioning (Primary):**
1. User clicks "Connect Device" in Setup Wizard
2. Browser requests Bluetooth permission
3. User selects "CommuteCompute-XXXX" device
4. Wizard scans for WiFi networks via BLE characteristic (CC000006)
5. User selects network and enters password
6. User completes journey configuration (addresses, preferences)
7. Wizard sends via BLE: SSID (CC000002) + Password (CC000003) + Webhook URL (CC000004)
8. Webhook URL constructed as: `window.location.origin + '/api/screen'`
9. Device stores all 3 in NVS, connects to WiFi, proceeds to dashboard

**Secondary Flow (Pairing Code — Optional):**
1. If device already has WiFi but needs server re-configuration
2. Device can enter `STATE_PAIRING_MODE` to display pairing code
3. User enters code in Setup Wizard, which POSTs config to `/api/pair/{CODE}`
4. Device polls and receives updated webhookUrl

#### 21.7.7 Re-Configuration Scenarios

| Scenario | Action |
|----------|--------|
| Change WiFi network | Factory reset → Re-provision via BLE (sends WiFi + URL) |
| Change server/preferences | Factory reset → Re-provision via BLE, or use optional pairing code flow |
| Move to new home | Factory reset → Full re-provision via BLE |

#### 21.7.8 Factory Reset Behaviour

Factory reset clears:
- WiFi SSID
- WiFi password
- Webhook URL
- All preferences

Device returns to `STATE_BLE_SETUP` and displays BLE setup screen for reprovisioning.

#### 21.7.9 BLE Webhook URL Provisioning (v7.5.0+)

**[CRITICAL] MANDATORY**: Firmware MUST receive webhook URL via BLE from Setup Wizard. No hardcoded server URLs. If no webhook URL in NVS, device returns to BLE setup.

When WiFi connects successfully and a `webhookUrl` is stored in NVS (received via BLE characteristic CC000004), the firmware SHALL:
1. Use the webhook URL exactly as received from Setup Wizard
2. Set `devicePaired = true`
3. Proceed directly to `STATE_FETCH_DASHBOARD`

If no `webhookUrl` is stored in NVS, the firmware SHALL:
1. Return to `STATE_BLE_SETUP`
2. Display BLE setup screen
3. Wait for reprovisioning via Setup Wizard

**No DEFAULT_SERVER auto-pairing.** The `DEFAULT_SERVER` constant in source is a placeholder for documentation/turnkey display only. It is NEVER used to construct a webhook URL automatically.

```cpp
// v7.5.0: Webhook URL MUST come from BLE, not DEFAULT_SERVER
if (strlen(webhookUrl) == 0) {
    // No webhook URL — return to BLE setup for reprovisioning
    currentState = STATE_BLE_SETUP;
    return;
}
// URL was provisioned via BLE from Setup Wizard
devicePaired = true;
```

| Scenario | Behaviour |
|----------|-----------|
| Fresh device + BLE WiFi | Receives webhook URL via BLE → Dashboard |
| Factory reset | Clears all NVS → Returns to BLE setup for reprovisioning |
| No webhook URL in NVS | Returns to `STATE_BLE_SETUP` (no DEFAULT_SERVER auto-pair) |

---

## Section 22: Admin Panel UI/UX Branding (MANDATORY)

**[WARNING] CRITICAL:** All Admin Panel and Setup Wizard UI must adhere to Commute Compute branding guidelines. Consistency is mandatory across all pages, tabs, and components.

### 22.1 Colour Palette

| Name | Hex | Usage |
|------|-----|-------|
| **CC Green** | `#4fb28e` | Primary actions, success states, active indicators |
| **CC Purple** | `#667eea` | Secondary accents, gradients, info states |
| **CC Dark** | `#0f172a` | Background base |
| **CC Surface** | `#1e293b` | Card backgrounds, elevated surfaces |
| **White** | `#f1f5f9` | Primary text |
| **Muted** | `#94a3b8` | Secondary text, hints |
| **Warning** | `#fbbf24` | Warning states, pending validation |
| **Error** | `#ef4444` | Error states, critical alerts |

### 22.2 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page titles | Inter | 700 (Bold) | 24px |
| Section headers | Inter | 600 (Semi) | 18px |
| Card titles | Inter | 600 (Semi) | 16px |
| Body text | Inter | 400 (Regular) | 14px |
| Labels | Inter | 500 (Medium) | 13px |
| Small/hints | Inter | 400 (Regular) | 12px |
| Monospace | JetBrains Mono | 400 | 12px |

**Font Stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### 22.3 Icons & Imagery

**[PROHIBITED] NO EMOJIS in production UI.** Use proper SVG or icon font icons instead.

| [NO] Don't | [YES] Do |
|----------|-------|
| Train emoji | `<svg>` train icon or icon font |
| Coffee emoji | `<svg>` coffee cup icon |
| [CAUTION] Warning emoji | `<svg>` alert triangle icon |
| [YES] Checkmark emoji | `<svg>` check icon or CSS-styled checkmark |

**Icon Guidelines:**
- Use consistent icon set (recommend: Lucide, Heroicons, or Feather)
- Icons should be 16px, 20px, or 24px (consistent within context)
- Icon colour should match text colour or be CC Green for actions
- Maintain 4px minimum padding around icons

### 22.4 Card & Container Styles

**Card Properties:**
```css
.card {
  background: rgba(30, 41, 59, 0.8);  /* CC Surface with transparency */
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #4fb28e;     /* CC Green accent */
}
```

**Status Badges:**
```css
.badge {
  padding: 6px 14px;
  border-radius: 20px;               /* Pill shape */
  font-size: 12px;
  font-weight: 600;
}
.badge-success { background: rgba(34, 197, 94, 0.9); }
.badge-warning { background: rgba(251, 191, 36, 0.9); }
.badge-error { background: rgba(239, 68, 68, 0.7); }
```

**Gradients (for emphasis areas):**
```css
/* Primary gradient */
background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);

/* Success gradient */
background: linear-gradient(135deg, rgba(79, 178, 142, 0.1) 0%, rgba(34, 197, 94, 0.1) 100%);
```

### 22.5 Spacing & Layout

| Spacing | Value | Usage |
|---------|-------|-------|
| xs | 4px | Icon padding, inline gaps |
| sm | 8px | Between related elements |
| md | 12px | Card internal padding |
| lg | 20px | Section separation |
| xl | 30px | Major section breaks |

**Grid:** Use CSS Grid with `gap: 20px` for card layouts.

### 22.6 Interactive Elements

**Buttons:**
```css
.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.2s;
}
.btn-primary { background: #4fb28e; color: white; }
.btn-secondary { background: rgba(255,255,255,0.1); color: #f1f5f9; }
```

**Form Inputs:**
```css
.form-input {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 12px;
  color: #f1f5f9;
}
.form-input:focus {
  border-color: #4fb28e;
  outline: none;
}
```

### 22.7 Readability Requirements

- **Minimum contrast ratio:** 4.5:1 for body text, 3:1 for large text
- **Line height:** 1.5 for body text, 1.3 for headings
- **Maximum line length:** 75 characters for readability
- **No justified text** — use left-aligned
- **Adequate whitespace** — don't crowd elements

### 22.8 Consistency Checklist

Before deploying UI changes, verify:

- [ ] Colours match Section 22.1 palette
- [ ] Typography follows Section 22.2 specs
- [ ] **No emojis** — replaced with proper icons
- [ ] Cards use consistent border-radius (12px) and accent borders
- [ ] Buttons use standard styles (primary/secondary)
- [ ] Form inputs are styled consistently
- [ ] Spacing is consistent (use defined values)
- [ ] Interactive elements have hover/focus states
- [ ] Text is readable (contrast, line-height, spacing)
- [ ] **Global System Footer is visible** (Section 22.9)

### 22.9 Global System Footer (MANDATORY) [CRITICAL]

**CRITICAL:** A persistent footer MUST appear on ALL tabs of the Admin Panel, displaying live version info and dynamic attributions.

#### 22.9.1 Footer Requirements

| Element | Requirement |
|---------|-------------|
| **Position** | Fixed at bottom of viewport, visible on ALL tabs |
| **CommuteCompute Version** | Live from `/api/version` → `components.commutecompute.version` |
| **CCDash Renderer Version** | Live from `/api/version` → `components.renderer.version` |
| **System Version** | Live from `/api/version` → `system.version` |
| **Build Date** | Live from `/api/version` → `date` |
| **Attribution** | Dynamic based on user's configured data sources |
| **Auto-refresh** | Update every 5 minutes |

#### 22.9.2 Dynamic Attribution Logic

The footer MUST display attributions based on what the user has configured in `localStorage cc-config`:

| Data Source | When to Show | Attribution Text |
|-------------|--------------|------------------|
| **Always** | Always | `© 2026 Angus Bergman • AGPL-3.0 Dual Licence` |
| **Transit API** | When `cc-transit-api-key` exists or addresses configured | `Transit data: Transport Victoria OpenData API (CC BY 4.0)` |
| **Weather** | When addresses configured | `Weather: Bureau of Meteorology (CC BY 3.0 AU)` |
| **Google Places** | When `cc-places-api-key` exists | `Places: Powered by Google` |
| **OpenStreetMap** | When maps enabled or OSM geocoding used | `Maps: © OpenStreetMap contributors` |

#### 22.9.3 Footer Styling

```css
.cc-system-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(180deg, rgba(26, 39, 68, 0.95) 0%, rgba(18, 28, 51, 0.98) 100%);
    border-top: 1px solid #3d5278;
    padding: 10px 20px;
    z-index: 1000;
    backdrop-filter: blur(10px);
}
```

#### 22.9.4 Version Display Format

```
[●] CommuteCompute v3.1  |  CCDash Renderer v2.1  |  System v4.2.0  |  Build 2026-02-07
```

- Green pulsing dot indicates live/connected status
- Version values pulled from `/api/version` endpoint
- Monospace font for version numbers (`JetBrains Mono`)

#### 22.9.5 Prohibited

- [NO] Hiding the footer on any tab
- [NO] Removing attribution to Angus Bergman
- [NO] Hardcoding version numbers (must be dynamic from API)
- [NO] Omitting required data source attributions

### 22.10 Official Tagline (MANDATORY) [CRITICAL]

**The official Commute Compute tagline MUST be used in all marketing, README, and public-facing materials:**

> **"Other apps show delays. CommuteCompute™ reacts to them. Live data flows into every decision- coffee, timing, connections. 1 glance. No app switching. Open Source."**

**Source:** @Commute_Compute Twitter/X bio (canonical)

**Usage Rules:**
- [YES] Use verbatim in README hero section
- [YES] Use in social media bios and descriptions
- [YES] Use in press/marketing materials
- [NO] Do NOT paraphrase or modify
- [NO] Do NOT use old taglines ("travel planner that factors in lifestyle", etc.)

---

## Section 23: CommuteCompute Data Flow Requirements (MANDATORY)

**[CRITICAL]**: CommuteCompute™ is the core journey calculation engine comprising five interconnected intelligence engines: CommuteCompute™ (orchestration), DepartureConfidence™ (reliability scoring), LifestyleContext™ (pattern analysis), SleepOptimiser™ (departure timing), and AltTransit™ (alternative routes). All data flow must follow these exact patterns.

### 23.1 GTFS-RT Stop ID Architecture

**Principle:** GTFS-RT uses direction-specific stop IDs. Each platform at a station has a unique ID.

#### 23.1.1 Stop ID Selection Rules

| Scenario | Stop ID Source | Fallback |
|----------|---------------|----------|
| User configured | `preferences.trainStopId` | — |
| Auto-detected | `detectTrainStopId()` | null → fallback data |
| Not configured | null | Use scheduled/fallback timetable |

#### 23.1.2 Melbourne Metro Stop ID Patterns

```
Station Platform Types:
├── Citybound platforms → Trains TO City Loop (Parliament, Melbourne Central, etc.)
├── Outbound platforms  → Trains FROM City (to suburbs)
└── Terminus platforms  → End-of-line stations

City Loop Terminus Stop IDs:
├── 26xxx  → City Loop stations (Parliament, Melbourne Central, Flagstaff, Southern Cross)
├── 12204  → Flinders Street (certain platforms)
└── 12205  → Flinders Street (certain platforms)
```

#### 23.1.3 Example: South Yarra Station

| Stop ID | Platform | Direction | Destination |
|---------|----------|-----------|-------------|
| `12179` | PKM/CBE citybound | → City | Parliament via City Loop |
| `14295` | FKN citybound | → City | Flinders Street |
| `14271` | SHM outbound | → Suburbs | Sandringham |

**[CAUTION] CRITICAL:** Using wrong stop ID = wrong direction = useless journey data.

### 23.2 Departure Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMMUTECOMPUTE DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │ User Config  │────▶│ Stop ID      │────▶│ GTFS-RT API  │                │
│  │ (Setup Wiz)  │     │ Resolution   │     │ TripUpdates  │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │ trainStopId  │     │ detectTrain  │     │ StopTime     │                │
│  │ tramStopId   │     │ StopId()     │     │ Updates[]    │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│                              │                    │                         │
│                              ▼                    ▼                         │
│                       ┌──────────────┐     ┌──────────────┐                │
│                       │ null?        │────▶│ processGtfs  │                │
│                       │ Use fallback │     │ RtDepartures │                │
│                       └──────────────┘     └──────────────┘                │
│                                                   │                         │
│                                                   ▼                         │
│                                            ┌──────────────┐                │
│                                            │ Departure[]  │                │
│                                            │ with:        │                │
│                                            │ - minutes    │                │
│                                            │ - destination│                │
│                                            │ - isCitybound│                │
│                                            │ - routeId    │                │
│                                            │ - finalStop  │                │
│                                            └──────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 23.3 Citybound Detection Logic

**Implementation Pattern (MANDATORY):**

```javascript
/**
 * Check if a stop ID is in the Melbourne City Loop area
 * City Loop stations: Parliament, Melbourne Central, Flagstaff, Southern Cross
 */
function isCityLoopStop(stopId) {
  if (!stopId) return false;
  // City Loop terminus stops: 26xxx = City Loop, 12204/12205 = Flinders St
  return stopId.startsWith('26') || stopId === '12204' || stopId === '12205';
}

/**
 * Process GTFS-RT departures with citybound detection
 */
function processGtfsRtDepartures(feed, stopId) {
  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    const stops = tripUpdate.stopTimeUpdate;
    
    // Get FINAL stop of trip (actual terminus)
    const finalStop = stops[stops.length - 1]?.stopId;
    
    // Determine if citybound based on terminus
    const isCitybound = isCityLoopStop(finalStop);
    
    // Set destination: "City Loop" for citybound, line name for outbound
    const destination = isCitybound ? 'City Loop' : getLineName(routeId);
    
    departures.push({
      minutes,
      destination,      // "City Loop" or "Sandringham", "Frankston", etc.
      isCitybound,      // true/false flag
      finalStop,        // Actual terminus stop ID
      routeId,          // Line identifier (e.g., "aus:vic:vic-02-PKM:")
      // ... other fields
    });
  }
}
```

### 23.4 Departure Output Schema

**Required Fields (all departures MUST include):**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `minutes` | number | Minutes until departure | `5` |
| `destination` | string | Display destination | `"City Loop"` or `"Sandringham"` |
| `isCitybound` | boolean | Direction flag | `true` |
| `finalStop` | string | Terminus stop ID | `"26506"` |
| `routeId` | string | GTFS route identifier | `"aus:vic:vic-02-PKM:"` |
| `isLive` | boolean | Live vs scheduled data | `true` |
| `delay` | number | Delay in minutes | `0` |
| `isDelayed` | boolean | Delay flag (>1 min) | `false` |
| `source` | string | Data source identifier | `"gtfs-rt"` |

**Optional Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `headsign` | string | Trip headsign from GTFS |
| `platform` | string | Platform number |
| `tripId` | string | GTFS trip identifier |

### 23.5 Line Name Extraction

**Pattern for extracting line name from GTFS route ID:**

```javascript
function getLineName(routeId) {
  if (!routeId) return 'Unknown';
  
  // GTFS route ID format: "aus:vic:vic-02-XXX:"
  // Extract the line code (XXX)
  const match = routeId.match(/vic-\d+-([A-Z]+)/i);
  if (!match) return routeId;
  
  const lineCode = match[1].toUpperCase();
  
  // Map line codes to display names
  const lineNames = {
    'PKM': 'Pakenham',
    'CBE': 'Cranbourne', 
    'FKN': 'Frankston',
    'SHM': 'Sandringham',
    'GLW': 'Glen Waverley',
    'ALM': 'Alamein',
    'BEL': 'Belgrave',
    'LIL': 'Lilydale',
    'HBE': 'Hurstbridge',
    'MER': 'Mernda',
    'CRB': 'Craigieburn',
    'SUN': 'Sunbury',
    'UPF': 'Upfield',
    'WER': 'Werribee',
    'WIL': 'Williamstown',
    'STY': 'Stony Point'
  };
  
  return lineNames[lineCode] || lineCode;
}
```

### 23.6 Fallback Data Requirements

When live GTFS-RT data unavailable, fallback to scheduled timetables:

| Condition | Action |
|-----------|--------|
| No API key | Use `fallback-timetables.js` |
| Stop ID null | Log warning, return empty array |
| API error | Return scheduled data with `isLive: false` |
| No departures | Return empty array (not mock data) |

**Fallback Data Schema:**

```javascript
// Fallback departures MUST match live schema
{
  minutes: 10,
  destination: 'City Loop',  // Must use same naming
  isCitybound: true,
  isLive: false,             // Mark as scheduled
  source: 'fallback',        // Identify data source
  delay: 0,
  isDelayed: false
}
```

### 23.7 Multi-Modal Journey Leg Construction (v1.18)

**CommuteCompute builds journey legs supporting N transit modes with interchange walks.**

**[CRITICAL]:** Journey structure must support multi-modal routes (e.g., Tram → Train, Bus → Train).

```
┌─────────────────────────────────────────────────────────────────┐
│              MULTI-MODAL JOURNEY LEG STRUCTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Leg 1: WALK (origin → first waypoint)                          │
│  ├── type: 'walk'                                               │
│  ├── from: 'home' | 'work' | current_location                   │
│  ├── to: cafe_name | first_stop_name                            │
│  └── minutes: calculated from distance                          │
│                                                                 │
│  Leg 2: COFFEE (optional, position: 'origin')                   │
│  ├── type: 'coffee'                                             │
│  ├── location: cafe_name                                        │
│  ├── minutes: user_configured (default: 5)                      │
│  ├── canGet: CoffeeDecision result                              │
│  └── reason: 'TIME FOR COFFEE' | 'EXTRA TIME — Disruption'      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ REPEATING PATTERN: Walk + Transit (1 to N times)            ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │                                                             ││
│  │  Leg N: WALK (to transit stop)                              ││
│  │  ├── type: 'walk'                                           ││
│  │  ├── from: previous_location | 'cafe' | previous_stop       ││
│  │  ├── to: stop_name                                          ││
│  │  └── minutes: interchange_walk_time                         ││
│  │                                                             ││
│  │  Leg N+1: TRANSIT                                           ││
│  │  ├── type: 'train' | 'tram' | 'bus' | 'ferry' | 'vline'     ││
│  │  ├── routeNumber: line_name | route_number                  ││
│  │  ├── origin: { name, stopId }                               ││
│  │  ├── destination: { name, stopId }                          ││
│  │  ├── minutes: from GTFS-RT                                  ││
│  │  ├── nextDepartures: [5, 12, 20]                            ││
│  │  ├── delay: delay_minutes | 0                               ││
│  │  ├── isDelayed: boolean                                     ││
│  │  ├── isSuspended: boolean                                   ││
│  │  ├── isDiverted: boolean                                    ││
│  │  ├── isExpress: boolean                                     ││
│  │  └── replacement: { type: 'bus', details } | null           ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Final Leg: WALK (last stop → destination)                      │
│  ├── type: 'walk'                                               │
│  ├── from: last_stop_name                                       │
│  ├── to: 'work' | 'home' | destination_name                     │
│  └── minutes: calculated from distance                          │
│                                                                 │
│  Optional Final: COFFEE (position: 'destination')               │
│  ├── type: 'coffee'                                             │
│  ├── location: cafe_name                                        │
│  └── reason: 'FRIDAY TREAT' | 'TIME FOR COFFEE'                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 23.7.1 Example: Multi-Modal Journey (Tram → Train)

```javascript
// Home → Coffee → Tram → Train → Work (7 legs)
const journey = {
  legs: [
    { type: 'walk', from: 'home', to: 'Example Cafe', minutes: 4 },
    { type: 'coffee', location: 'Example Cafe', minutes: 5, canGet: true, reason: 'TIME FOR COFFEE' },
    { type: 'walk', from: 'Example Cafe', to: 'Toorak Rd/Chapel St', minutes: 3 },
    { type: 'tram', routeNumber: '58', origin: { name: 'Toorak Rd/Chapel St', stopId: '2505' }, 
      destination: { name: 'South Yarra Stn', stopId: '2510' }, minutes: 6, nextDepartures: [3, 11, 19] },
    { type: 'walk', from: 'South Yarra Stn tram stop', to: 'South Yarra Stn Platform 1', minutes: 2 },
    { type: 'train', routeNumber: 'Sandringham', origin: { name: 'South Yarra', stopId: '12179' },
      destination: { name: 'Parliament', stopId: '26506' }, minutes: 5, nextDepartures: [4, 12, 20] },
    { type: 'walk', from: 'Parliament Station', to: 'work', minutes: 8 }
  ],
  totalMinutes: 33,
  transitLegs: 2,  // Tram + Train
  interchanges: 1
};
```

#### 23.7.2 Delay Accumulation Across Transit Legs

When multiple transit legs have delays, accumulate for status bar:

```javascript
const transitLegs = journey.legs.filter(l => ['train', 'tram', 'bus'].includes(l.type));
const totalDelay = transitLegs.reduce((sum, leg) => sum + (leg.delay || 0), 0);

// Status bar shows cumulative delay
if (totalDelay > 0 && transitLegs.filter(l => l.isDelayed).length > 1) {
  statusBar = `DELAYS → Arrive ${arrivalTime} (+${totalDelay} min)`;  // Plural
} else if (totalDelay > 0) {
  statusBar = `DELAY → Arrive ${arrivalTime} (+${totalDelay} min)`;   // Singular
}
```

### 23.8 Pre-Deployment Verification

**Test these scenarios before ANY CommuteCompute deployment:**

```bash
# 1. Verify citybound detection
node -e "
import('./src/services/opendata-client.js').then(async m => {
  const deps = await m.getDepartures(12179, 0, {apiKey: 'YOUR_KEY'});
  console.log('Citybound test:', deps[0]?.destination, deps[0]?.isCitybound);
  // Expected: 'City Loop', true
});
"

# 2. Verify outbound detection  
node -e "
import('./src/services/opendata-client.js').then(async m => {
  const deps = await m.getDepartures(14271, 0, {apiKey: 'YOUR_KEY'});
  console.log('Outbound test:', deps[0]?.destination, deps[0]?.isCitybound);
  // Expected: 'Sandringham', false
});
"

# 3. Verify null stop handling
node -e "
import('./src/services/opendata-client.js').then(async m => {
  const deps = await m.getDepartures(null, 0, {});
  console.log('Null stop test:', deps.length);
  // Expected: 0 (empty array, no crash)
});
"

# 4. Verify multi-modal journey construction
node -e "
import('./src/services/journey-planner.js').then(async m => {
  const journey = await m.planJourney({ 
    origin: { lat: -37.8389, lng: 144.9931 },  // South Yarra
    destination: { lat: -37.8136, lng: 144.9631 }  // CBD
  });
  console.log('Transit legs:', journey.transitLegs);
  // Should support 1, 2, or more transit legs
});
"
```

### 23.9 Alternative Route Detection (MANDATORY)

**[CRITICAL]:** CommuteCompute MUST calculate multiple route alternatives and select the optimal one. Routes are engine-calculated, NEVER hardcoded.

#### 23.9.1 Route Discovery Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ALTERNATIVE ROUTE DISCOVERY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. STOP DISCOVERY                                                          │
│     ├── Find all transit stops within maxWalkDistance of ORIGIN             │
│     ├── Find all transit stops within maxWalkDistance of DESTINATION        │
│     └── Include: train stations, tram stops, bus stops                      │
│                                                                             │
│  2. ROUTE ENUMERATION                                                       │
│     ├── Query GTFS for direct routes (single transit mode)                  │
│     ├── Query GTFS for multi-modal routes (tram→train, bus→train, etc.)     │
│     └── Include interchange options at major hubs                           │
│                                                                             │
│  3. ROUTE SCORING                                                           │
│     ├── Calculate total time for each alternative                           │
│     ├── Apply weights: time (40%), transfers (25%), walking (20%), rel (15%)│
│     └── Adjust scores based on current conditions (delays, suspensions)     │
│                                                                             │
│  4. SELECTION                                                               │
│     └── Return lowest-score route as primary, others as alternatives        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 23.9.2 Route Scoring Weights

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Total time | 40% | Sum of all leg durations (minutes) |
| Transfers | 25% | +5 points per interchange |
| Walking | 20% | Total walking minutes |
| Reliability | 15% | Based on current delay/disruption status |

#### 23.9.3 Multi-Modal Selection Triggers

CommuteCompute selects multi-modal route (e.g., Tram → Train) when:

| Condition | Action |
|-----------|--------|
| Direct route suspended | Promote alternative with different modes |
| Direct route delayed >10 min | Re-score alternatives with current delays |
| Multi-modal faster than direct | Select multi-modal as primary |
| User prefers specific modes | Weight those modes higher |
| Interchange walk < maxWalkDistance | Include in alternatives |

#### 23.9.4 Example: Engine-Calculated Alternatives

```javascript
// User config: Home (South Yarra) → Work (Collins St CBD)
// Engine discovers these alternatives (NOT hardcoded):

const alternatives = calculateAlternatives(origin, destination, preferences);

// Result:
[
  { 
    route: ['walk', 'train', 'walk'], 
    modes: ['Sandringham'], 
    score: 35, 
    time: 32,
    status: 'delayed +8 min'  // Current conditions
  },
  { 
    route: ['walk', 'coffee', 'walk', 'train', 'walk'], 
    modes: ['Sandringham'], 
    score: 38, 
    time: 47,
    status: 'delayed +8 min'
  },
  { 
    route: ['walk', 'coffee', 'walk', 'tram', 'walk', 'train', 'walk'], 
    modes: ['Tram 58', 'Sandringham'], 
    score: 36,  // Lower score due to avoiding delayed train segment
    time: 44,
    status: 'on time'
  },
  { 
    route: ['walk', 'tram', 'walk'], 
    modes: ['Tram 8'], 
    score: 48, 
    time: 38,
    status: 'on time'
  }
]

// Engine selects: Tram → Train (score 36) because Sandringham delay increases direct route score
```

#### 23.9.5 Prohibition: No Hardcoded Routes

**[CRITICAL] FORBIDDEN:**
```javascript
// [NO] NEVER hardcode specific user routes
if (userAddress.includes('South Yarra')) {
  return predefinedSouthYarraRoute;
}

// [NO] NEVER hardcode specific route patterns
const angusRoute = ['walk', 'coffee', 'tram', 'train', 'walk'];
```

**[YES] CORRECT:**
```javascript
// [YES] Engine calculates all alternatives dynamically
const alternatives = await discoverRoutes(origin, destination, {
  maxWalkDistance: preferences.maxWalkDistance || 800,
  preferredModes: preferences.preferredModes || ['train', 'tram', 'bus'],
  includeMultiModal: true,
  maxTransfers: 2
});

// [YES] Selection based on current conditions
const optimal = selectOptimalRoute(alternatives, {
  currentTime: Date.now(),
  delays: await fetchCurrentDelays(),
  suspensions: await fetchSuspensions()
});
```

#### 23.9.6 Coffee Integration with Alternatives

When coffee is enabled, engine evaluates coffee insertion for EACH alternative:

```javascript
for (const route of alternatives) {
  const withCoffeeAtOrigin = insertCoffee(route, 'origin');
  const withCoffeeAtDest = insertCoffee(route, 'destination');
  
  // Only include if arrival time still meets target
  if (withCoffeeAtOrigin.arrivalTime <= targetArrival) {
    alternatives.push(withCoffeeAtOrigin);
  }
  if (withCoffeeAtDest.arrivalTime <= targetArrival) {
    alternatives.push(withCoffeeAtDest);
  }
}
```

---

## Section 24: System Architecture Principles (MANDATORY)

**[CRITICAL]**: These principles govern the entire Commute Compute System architecture. All development MUST comply.

### 24.1 Core Principles

| Principle | Implementation | Violation = Reject PR |
|-----------|----------------|----------------------|
| **Self-Hosted** | User owns server, device, and API keys | [NO] No central servers |
| **Zero-Config** | No environment variables — config via Setup Wizard + Redis | [NO] No `.env` files |
| **No TRMNL Cloud** | Custom firmware only — never contacts usetrmnl.com | [NO] No stock firmware |
| **Server-Side Rendering** | All computation on server — device receives images | [NO] No client-side logic |
| **Privacy-First** | Commute data stays on user's server | [NO] No analytics/tracking |
| **Multi-State** | Supports all Australian states/territories | [NO] No VIC-only code |
| **Free-Tier** | Entire system usable for free | [NO] No required paid APIs |

### 24.2 Distribution Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SELF-HOSTED DISTRIBUTION MODEL                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Official Repo  ──Fork──▶  User's Repo  ──Deploy──▶  User's Vercel    │
│                                                              │           │
│                                                              ▼           │
│   ┌───────────────────────────────────────────────────────────────────┐ │
│   │                     USER'S SERVER                                  │ │
│   │  CommuteCompute™ ──▶ CC LiveDash™ ──▶ Config Token (API keys)       │ │
│   └───────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│   ┌───────────────────────────────────────────────────────────────────┐ │
│   │                     USER'S DEVICE (CCFirm™)                        │ │
│   │  - Fetches from user's Vercel URL ONLY                            │ │
│   │  - Receives 1-bit BMP zones                                        │ │
│   │  - 60-second partial refresh cycle                                 │ │
│   └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│   [YES] Complete data isolation -- no shared infrastructure              │
│   [YES] User owns API keys -- stored in Redis                   │
│   [YES] No central server -- each deployment is independent              │
│   [NO] NO usetrmnl.com dependency -- custom firmware required            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 24.3 Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER                             │
│  Setup Wizard │ Admin Panel │ Simulator │ Preview │ Help                │
├─────────────────────────────────────────────────────────────────────────┤
│                             API LAYER                                    │
│  /api/zones │ /api/livedash │ /api/screen │ /api/admin/* │ /api/health │
├─────────────────────────────────────────────────────────────────────────┤
│                           SERVICE LAYER                                  │
│  CommuteCompute™ │ CC LiveDash™ │ Zone Renderer │ Weather (BOM)          │
├─────────────────────────────────────────────────────────────────────────┤
│                            CORE LAYER                                    │
│  CoffeeDecision │ Route Planner │ Journey Engine │ Decision Logger      │
├─────────────────────────────────────────────────────────────────────────┤
│                            DATA LAYER                                    │
│  OpenData Client │ GTFS Static │ Redis     │ Fallback Timetables        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 24.4 Data Flow Requirements

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                     │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Transport Victoria ──(30s cache)──▶ opendata-client.js                  │
│  OpenData API                              │                              │
│  (GTFS-RT)                    ┌───────────┼───────────┐                  │
│                               │           │           │                   │
│                               ▼           ▼           ▼                   │
│                        weather-bom  commute-compute  coffee-decision        │
│                        (5min cache)      .js           .js                │
│                               │           │           │                   │
│                               └───────────┼───────────┘                  │
│                                           │                               │
│                                           ▼                               │
│                                  Dashboard Service                        │
│                                  (data aggregation)                       │
│                                           │                               │
│                     ┌─────────────────────┼─────────────────────┐        │
│                     │                     │                     │         │
│                     ▼                     ▼                     ▼         │
│              zone-renderer          livedash           journey-display   │
│              (1-bit BMP)         (multi-device)          (web view)      │
│                     │                     │                     │         │
│                     ▼                     ▼                     ▼         │
│               /api/zones           /api/livedash         /api/screen     │
│              (TRMNL BMP)          (All devices)         (Full PNG)       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### 24.5 Caching Strategy (MANDATORY)

| Data Source | Cache TTL | Reason |
|-------------|-----------|--------|
| GTFS-RT Trip Updates | 30 seconds | Real-time accuracy |
| GTFS-RT Service Alerts | 5 minutes | Changes infrequently |
| Static GTFS | 24 hours | Schedule data |
| Weather (BOM) | 5 minutes | Adequate freshness |
| Geocoding results | Permanent (in KV) | Cached at setup time |
| Cafe business hours | Permanent (in KV) | Cached at setup time |

### 24.6 Redis Storage Architecture

**[CRITICAL]**: All persistent data MUST use Redis storage. No environment variables for API keys.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VERCEL KV STORAGE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐     ┌──────────────────────┐                  │
│  │  Setup Wizard        │────▶│  POST /api/save-     │                  │
│  │  (enters API keys)   │     │  transit-key         │                  │
│  └──────────────────────┘     └──────────┬───────────┘                  │
│                                          │                               │
│                                          ▼                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      VERCEL KV STORE                              │   │
│  │                                                                   │   │
│  │  transit-api-key: "YOUR_API_KEY_HERE..."                  │   │
│  │  google-api-key:  "AIzaSy..."                                     │   │
│  │  preferences:     { addresses: {...}, journey: {...} }            │   │
│  │  device-config:   { webhookUrl: "...", deviceId: "..." }          │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                          │                               │
│                                          ▼                               │
│  ┌──────────────────────┐     ┌──────────────────────┐                  │
│  │  /api/zones          │────▶│  getTransitApiKey()  │                  │
│  │  (runtime request)   │     │  reads from KV       │                  │
│  └──────────────────────┘     └──────────────────────┘                  │
│                                                                          │
│  [YES] Zero-Config: No environment variables needed                      │
│  [YES] Secure: Keys stored in Vercel's encrypted KV                     │
│  [YES] Portable: Config moves with Vercel project                        │
│  [YES] Serverless: No persistent storage required                        │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 24.6.1 KV Key Naming Convention

| Key | Type | Purpose |
|-----|------|---------|
| `transit-api-key` | string | Transport Victoria OpenData API key |
| `google-api-key` | string | Google Places API key (optional) |
| `preferences` | JSON | User preferences from Setup Wizard |
| `device-config` | JSON | Device configuration |
| `last-validated` | timestamp | Last API key validation time |

#### 24.6.2 Redis Access Pattern

```javascript
// CORRECT: Read API key from Redis via kv-preferences
import { getTransitApiKey } from '../src/data/kv-preferences.js';

const apiKey = await getTransitApiKey();

// WRONG: Environment variables
// [NO] const apiKey = process.env.TRANSIT_API_KEY;

// WRONG: Direct @vercel/kv import (deprecated)
// [NO] import { kv } from '@vercel/kv';
```

### 24.7 Security Model

#### 24.7.1 Zero-Config Security

| Principle | Implementation |
|-----------|----------------|
| No server-side secrets | API keys in Redis (user's project) |
| Token in URL | Device webhook URL contains config token |
| User owns keys | Keys never stored on central server |
| Self-contained | Each deployment is fully isolated |

#### 24.7.2 XSS Protection (MANDATORY)

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

### 24.8 Free-Tier Architecture

**Principle:** The entire system MUST be usable for free by any user.

| Service | Status | Cost | Fallback |
|---------|--------|------|----------|
| Vercel Hosting | [YES] Required | FREE | — |
| Transport Victoria OpenData | [YES] Required | FREE | Fallback timetables |
| BOM Weather | [YES] Required | FREE | — |
| OpenStreetMap Nominatim | [YES] Fallback | FREE | Primary for geocoding |
| Google Places | [CAUTION] Optional | PAID | OSM fallback required |

#### 24.8.1 Setup-Time Caching

```
SETUP (one-time API calls)          RUNTIME (zero API calls in Free Mode)
──────────────────────────          ─────────────────────────────────────
1. User enters addresses     →      Redis contains:
2. Geocode via OSM/Google    →      • Home/work/cafe lat/lon (cached)
3. Cache cafe business hours →      • Cafe business hours (cached)
4. Store in Redis    →      • All user preferences

                                    Dashboard reads from Redis only.
                                    NO external geocoding at runtime.
```

### 24.9 Multi-Device Support (CC LiveDash™)

| Device | Resolution | Format | Orientation |
|--------|-----------|--------|-------------|
| `trmnl-og` | 800×480 | 1-bit BMP | Landscape |
| `trmnl-mini` | 400×300 | 1-bit BMP | Landscape |
| `kindle-pw3` | 1072×1448 | 8-bit PNG | Portrait |
| `kindle-pw5` | 1236×1648 | 8-bit PNG | Portrait |
| `kindle-basic` | 600×800 | 8-bit PNG | Portrait |
| `inkplate-6` | 800×600 | 1-bit BMP | Landscape |
| `inkplate-10` | 1200×825 | 1-bit BMP | Landscape |
| `web` | 800×480 | PNG | Landscape |

### 24.10 Required API Endpoints

| Endpoint | Purpose | Required |
|----------|---------|----------|
| `/api/zones` | Zone data for TRMNL | [YES] MANDATORY |
| `/api/screen` | PNG for webhook/preview | [YES] MANDATORY |
| `/api/livedash` | Multi-device renderer | [YES] MANDATORY |
| `/api/health` | Health check | [YES] MANDATORY |
| `/api/status` | Server status | [YES] MANDATORY |
| `/api/admin/*` | Setup endpoints | [YES] MANDATORY |
| `/api/save-transit-key` | API key validation | [YES] MANDATORY |
| `/api/save-google-key` | Google key validation | [CAUTION] Optional |

### 24.11 Technology Stack (LOCKED)

| Layer | Technology | Alternatives Prohibited |
|-------|------------|------------------------|
| **Server** | Node.js 20.x, Express, Vercel Serverless | [NO] No Deno, Bun |
| **Rendering** | @napi-rs/canvas, 1-bit BMP | [NO] No node-canvas |
| **Data** | Transport Victoria OpenData (GTFS-RT) | [NO] No scraping |
| **Storage** | Redis | [NO] No environment variables |
| **Firmware** | ESP32-C3, PlatformIO, C++ | [NO] No Arduino IDE |
| **Fonts** | Inter (bundled TTF) | [NO] No system fonts |

---

## Appendix A: Quick Commands

```bash
# Development
npm run dev                    # Start local server
npm run lint                   # Check code style
npm run test                   # Run tests

# Firmware
cd firmware
pio run -e trmnl              # Compile
pio run -e trmnl -t upload    # Flash
# Serial monitor (do NOT use pio device monitor -- causes crash/freeze)
screen /dev/cu.usbmodem* 115200          # macOS

# Deployment
vercel --prod                 # Deploy to Vercel
curl -X POST $DEPLOY_HOOK     # Trigger deploy hook

# Git
git tag -a v3.0.0 -m "msg"    # Tag release
git push origin v3.0.0        # Push tag
```

---

## Appendix B: Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Device won't boot | Brick - bad firmware | USB reflash with known-good |
| Display shows stripes | Wrong BMP format | Check 1-bit depth, no compression |
| Zones not updating | `changed` not boolean | Force `changed === true` |
| Text rotated 90° | Wrong font | Use `FONT_8x8` only |
| Boot loop | Brownout trigger | Disable brownout detection |
| Freeze after wifi | Watchdog trigger | Remove watchdog entirely |
| Stale data | Cache not expiring | Check TTL configuration |

---

## Appendix C: Reference Documents

| Topic | Document |
|-------|----------|
| Dashboard Specification | `specs/CCDashDesignV15.md` |
| System Architecture | `docs/SYSTEM-ARCHITECTURE.md` |
| Distribution Guide | `DISTRIBUTION.md` |
| Firmware Anti-Brick | `firmware/ANTI-BRICK-REQUIREMENTS.md` |
| Firmware History | `firmware/FIRMWARE-VERSION-HISTORY.md` |

---

## Appendix D: TRMNL OG Custom Firmware -- Critical Bugs and Fixes

**Added:** 2026-01-29 (from multi-week debugging session)

This appendix documents critical bugs discovered during TRMNL OG custom firmware development and their solutions. **MANDATORY READING** before any firmware or zone-renderer work.

### D.1 Zone Name Alignment (CRITICAL)

**Bug:** Firmware zone definitions MUST match API zone names exactly.

| [NO] WRONG (Firmware) | [YES] CORRECT (API) |
|---------------------|------------------|
| `leg0`, `leg1`, `leg2`, `leg3` | `legs` (single zone) |
| `status` | `summary` |

**Symptom:** Device hangs at "Fetching transit data..." with 404 errors in serial log.

**Fix:** Firmware ZONES array must be:
```cpp
static const ZoneDef ZONES[] = {
    {"header",  0,   0,   800, 94},
    {"divider", 0,   94,  800, 2},
    {"summary", 0,   96,  800, 28},
    {"legs",    0,   132, 800, 316},
    {"footer",  0,   448, 800, 32},
};
```

**Rule:** Always verify firmware zone names match `/api/zones` response before flashing.

---

### D.2 BMP Format for bb_epaper (CRITICAL)

**Bug:** bb_epaper library requires **bottom-up DIB format**, not top-down.

| Property | [NO] WRONG | [YES] CORRECT |
|----------|----------|------------|
| DIB Height | Negative (-480) | Positive (480) |
| Pixel Order | Top-to-bottom | Bottom-to-top |

**Symptom:** Display shows garbage, inverted, or nothing.

**Fix in zone-renderer.js:**
```javascript
// DIB header - use POSITIVE height for bottom-up
dib.writeInt32LE(h, 8);  // Positive = bottom-up

// Write pixels bottom-to-top
for (let y = h - 1; y >= 0; y--) {
    // ... pixel data
}
```

**Rule:** NEVER use negative height in BMP DIB headers for bb_epaper.

---

### D.3 Vercel Serverless Font Registration (CRITICAL)

**Bug:** Vercel serverless functions have **NO system fonts**. `fillText()` silently fails.

**Symptom:** Zone BMPs render icons and layout but **NO TEXT** appears.

**Fix:** Bundle fonts and register with GlobalFonts:

```javascript
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';

// Register fonts BEFORE any canvas operations
const fontsDir = path.join(__dirname, '../../fonts');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Bold.ttf'), 'Inter');
GlobalFonts.registerFromPath(path.join(fontsDir, 'Inter-Regular.ttf'), 'Inter');

// Use registered font name
ctx.font = '800 17px Inter';  // NOT 'sans-serif'
```

**Required files:**
- `fonts/Inter-Bold.ttf`
- `fonts/Inter-Regular.ttf`

**Rule:** ALWAYS bundle TTF fonts and call `GlobalFonts.registerFromPath()` before rendering.

---

### D.4 Zone Buffer Size

**Bug:** Default 20KB buffer too small for `legs` zone (31KB).

**Symptom:** Partial render, memory corruption, or crash.

**Fix in firmware:**
```cpp
#define ZONE_BUFFER_SIZE 40960  // 40KB minimum
```

**Zone sizes for reference:**
| Zone | Size |
|------|------|
| header | ~9.5 KB |
| divider | ~0.3 KB |
| summary | ~2.9 KB |
| legs | ~31.7 KB |
| footer | ~3.3 KB |

**Rule:** Buffer must be >= largest zone size + padding.

---

### D.5 Gateway Timeout Workaround

**Bug:** Development gateway has 10-second timeout. PlatformIO flash takes 15-20s.

**Symptom:** Flash commands timeout, leaving zombie esptool processes.

**Fix:** Use `nohup` for background execution:
```bash
nohup ~/.platformio/penv/bin/pio run -e trmnl -t upload > /tmp/pio-flash.log 2>&1 &
# Check result after ~20 seconds
tail -20 /tmp/pio-flash.log
```

**Rule:** Long-running commands (>10s) MUST use nohup or background execution.

---

### D.6 Zombie esptool Processes

**Bug:** Failed/timed-out flash attempts leave esptool in uninterruptible sleep (U state).

**Symptom:** Serial port locked, subsequent flashes fail, `kill -9` doesn't work.

**Fix:** Physical USB disconnect required.
1. Unplug TRMNL USB cable
2. Wait 3 seconds
3. Replug
4. Verify with `ls /dev/cu.usb*`

**Rule:** If serial port is locked and processes can't be killed, USB disconnect is the only solution.

---

### D.7 Pre-Flash Checklist

Before ANY firmware flash:

- [ ] Verify zone names match API (`/api/zones?format=json`)
- [ ] Confirm buffer size >= 40KB
- [ ] Kill any existing esptool processes
- [ ] Verify USB device present (`ls /dev/cu.usbmodem*`)
- [ ] Use nohup for remote flashing

---

### D.8 Pre-Deploy Checklist (Zone Renderer)

Before ANY zone-renderer.js deployment:

- [ ] Fonts bundled in `fonts/` directory
- [ ] `GlobalFonts.registerFromPath()` called before rendering
- [ ] All `ctx.font` uses registered font name (not `sans-serif`)
- [ ] BMP uses positive height (bottom-up format)
- [ ] Test with `/api/screen?demo=normal` before device test

---

## Appendix E: Setup Wizard Troubleshooting

### E.1 Common Errors

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Error at [parsing response JSON]` | Endpoint returned HTML not JSON | Endpoint doesn't exist on Vercel — use `/api/` paths |
| `Error at [fetching setup/complete]` | Network/CORS error | Check endpoint URL, verify Vercel deployment |
| `The string did not match expected pattern` | iOS Safari form validation | Add `inputmode="text"` to inputs |
| `Page not found` on API call | Express routes on Vercel | Use `/api/admin/*` not `/admin/*` |
| Setup works desktop, fails mobile | Relative URL issues | Use `window.location.origin + path` |

### E.2 Vercel Serverless Path Mapping

Express routes do NOT work on Vercel. Files in `/api/` folder become endpoints:

| File Path | Endpoint |
|-----------|----------|
| `/api/admin/setup-complete.js` | `POST /api/admin/setup-complete` |
| `/api/admin/generate-webhook.js` | `POST /api/admin/generate-webhook` |
| `/api/cafe-details.js` | `POST /api/cafe-details` |
| `/api/address-search.js` | `GET /api/address-search` |

### E.3 iOS Safari Required Fixes

```html
<!-- All text inputs need these attributes -->
<input type="text" autocomplete="off" inputmode="text">

<!-- Buttons need formnovalidate -->
<button type="button" formnovalidate>Complete Setup</button>

<!-- Forms need novalidate -->
<form novalidate onsubmit="return false;">
```

### E.4 Debug Commands

```bash
# Test setup-complete endpoint
curl -X POST https://yoursite.vercel.app/api/admin/setup-complete \
  -H "Content-Type: application/json" \
  -d '{"addresses":{},"authority":"VIC","arrivalTime":"09:00"}'

# Test generate-webhook endpoint  
curl -X POST https://yoursite.vercel.app/api/admin/generate-webhook \
  -H "Content-Type: application/json" \
  -d '{"config":{"state":"VIC","apiMode":"cached"}}'

# Verify response is JSON (not HTML)
curl -s ... | head -c 1  # Should be "{" not "<"
```

### E.5 Reference Documentation

| Topic | Document |
|-------|----------|
| Full setup architecture | `docs/setup/SETUP-WIZARD-ARCHITECTURE.md` |
| Free-tier rules | DEVELOPMENT-RULES.md Section 17.3 |
| API endpoint details | `docs/api/` |

---

## Section 25: Melbourne Metro Tunnel Compliance (MANDATORY)

### 25.1 Overview
The Melbourne Metro Tunnel opened in 2025, fundamentally changing how train lines route through the CBD. Five new underground stations (Arden, Parkville, State Library, Town Hall, Anzac) replaced City Loop routing for certain lines. ALL Commute Compute code that handles train routing, departure matching, or direction detection MUST account for this change.

### 25.2 Metro Tunnel Lines (NO LONGER use City Loop)
These five lines now run through the Metro Tunnel instead of the City Loop:

| Line | GTFS Code | Old Route | New Route |
|------|-----------|-----------|-----------|
| Pakenham | PKM | City Loop | Metro Tunnel (Anzac, Town Hall, State Library, Parkville, Arden) |
| Cranbourne | CBE | City Loop | Metro Tunnel |
| Sunbury | SUY | City Loop | Metro Tunnel (Arden, Parkville, State Library, Town Hall, Anzac) |
| Craigieburn | CGB | City Loop | Metro Tunnel |
| Upfield | UFD | City Loop | Metro Tunnel |

### 25.3 City Loop Lines (unchanged)
All other lines continue to use the City Loop: Sandringham, Frankston, Glen Waverley, Alamein, Belgrave, Lilydale, Hurstbridge, Mernda, Werribee, Williamstown.

### 25.4 Station Groups (CRITICAL)
**City Loop stations** (served by City Loop lines ONLY):
Flinders Street, Parliament, Melbourne Central, Flagstaff, Southern Cross

**Metro Tunnel stations** (served by Metro Tunnel lines ONLY):
Arden (26010), Parkville (26011), State Library (26012), Town Hall (26013), Anzac (26014)

### 25.5 GTFS-RT Departure Filtering Rules
When matching live GTFS-RT train departures to a journey leg:
1. Each departure MUST include `isMetroTunnel` flag based on the line's GTFS code
2. If the destination station is a **City Loop station** (e.g., Flinders Street), Metro Tunnel line departures MUST be excluded
3. If the destination station is a **Metro Tunnel station** (e.g., Town Hall), City Loop line departures MUST be excluded
4. If the destination is generic "city", either tunnel/loop trains are acceptable

### 25.6 Required Constants
The following constants MUST exist in `opendata-client.js`:
- `METRO_TUNNEL_LINE_CODES`: Set containing PKM, CBE, SUY, CGB, UFD
- `METRO_TUNNEL_STOP_IDS`: Set containing 26010, 26011, 26012, 26013, 26014

The following MUST exist in `commute-compute.js`:
- `METRO_TUNNEL_LINES`: Array of line names
- `METRO_TUNNEL_STATIONS`: Object mapping station names to metadata

### 25.7 Never Assume All Citybound Trains Are Equivalent
"Citybound" does NOT mean "goes to any city station". A Pakenham train is citybound but does NOT stop at Flinders Street. Direction-based filtering MUST be combined with tunnel/loop classification.

---

## Section 26: API Authentication & CORS Security (MANDATORY)

### 26.1 Auth on All Admin Endpoints

All admin and state-mutating endpoints MUST require authentication for **every HTTP method** (including GET), not just non-GET methods. Endpoints returning personal configuration data (addresses, coordinates, API key status) MUST check auth before returning any data.

```javascript
// CORRECT — auth checked before any data returned
const authError = requireAuth(req);
if (authError) return res.status(401).json(authError);

// WRONG — skips auth for GET, exposing personal data
if (req.method !== 'GET') {
  const authError = requireAuth(req);
  ...
}
```

### 26.2 Deny by Default

`requireAuth()` MUST deny access when `CC_ADMIN_TOKEN` is not configured. Silent pass-through when the token is unset is a critical vulnerability.

```javascript
// CORRECT — deny when token not set
if (!adminToken) {
  return { error: 'Authentication not configured', message: 'CC_ADMIN_TOKEN must be set' };
}

// WRONG — silent pass when token missing
if (!adminToken) return null;
```

### 26.3 First-Time Setup Exception

Setup-flow endpoints (`save-transit-key`, `save-google-key`, `setup-complete`, `sync-config`, `generate-webhook`) may allow unauthenticated access ONLY during first-time setup (when no transit API key exists in KV). Once the system is configured, these endpoints MUST require auth.

```javascript
if (!(await isFirstTimeSetup())) {
  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);
}
```

### 26.4 No Wildcard CORS on State-Mutating Endpoints

State-mutating and admin endpoints MUST NOT use `Access-Control-Allow-Origin: *`. Use `setAdminCorsHeaders()` which only sets CORS when `CC_ALLOWED_ORIGIN` env var is configured.

```javascript
// CORRECT — same-origin only (or configured origin)
setAdminCorsHeaders(res);

// WRONG — allows any origin to read admin data
res.setHeader('Access-Control-Allow-Origin', process.env.CC_ALLOWED_ORIGIN || '*');
```

Device-facing read-only endpoints (`/api/screen`, `/api/zones`, `/api/status`, `/api/health`, `/api/livedash`) may use wildcard CORS for firmware compatibility.

### 26.5 KV-First Configuration Check

Endpoints that check whether the system is configured MUST use KV storage (via `getTransitApiKey()`) as the source of truth, not `PreferencesManager.isConfigured()` which reads from local files.

```javascript
// CORRECT — KV-first, consistent with screen.js
const transitApiKey = await getTransitApiKey();
if (!transitApiKey) { /* setup_required */ }

// WRONG — checks local file, not KV
const prefs = new PreferencesManager();
if (!prefs.isConfigured()) { /* setup_required */ }
```

### 26.6 ESM Compatibility

All API endpoint files use ES Modules. Never use `__dirname` or `__filename` directly — these are not defined in ESM. Use:

```javascript
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

---

**Document Version:** 1.14
**Maintained By:** Angus Bergman
**Last Updated:** 2026-02-13

---

*This document is the single source of truth for Commute Compute development. All contributors must read and comply with these rules.*
