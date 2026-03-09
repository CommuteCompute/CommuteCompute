<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (c) 2026 Angus Bergman
Licensed under AGPL-3.0
-->

<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ — Security Policy

**Effective Date:** 16 February 2026
**Last Updated:** 16 February 2026
**System Version:** v5.0.0

---

## 1. Responsible Disclosure Policy

We take the security of Commute Compute™ seriously. If you discover a security vulnerability, we ask that you disclose it responsibly.

### How to Report

- **Email:** commutecompute.licensing@gmail.com
- **Subject line:** `[SECURITY] Brief description of the vulnerability`

### Disclosure Timeline

- We will acknowledge receipt of your report within **5 business days**.
- We aim to provide an initial assessment within **14 days**.
- We follow a **90-day coordinated disclosure timeline** — we ask that you do not publicly disclose the vulnerability until 90 days after your initial report, or until a fix has been released, whichever comes first.
- If we are unable to address the issue within 90 days, we will communicate our progress and negotiate an extended timeline if necessary.

### Recognition

We do not currently operate a bug bounty programme. However, we are happy to credit responsible reporters in our release notes and CHANGELOG (with your permission).

---

## 2. Security Contact

For all security-related matters:

- **Email:** commutecompute.licensing@gmail.com
- **GitLab confidential issues:** For urgent security matters, issues can also be reported via the [GitLab repository's confidential issue feature](https://gitlab.com/angusbergman/commute-compute-system/-/issues/new?issue[confidential]=true)
- **Licensing and legal:** See [LEGAL.md](LEGAL.md)
- **Privacy policy:** See [PRIVACY.md](PRIVACY.md)

---

## 3. Scope

### In-Scope

The following are in-scope for security reports:

- **API endpoints** (`/api/screen`, `/api/admin/*`, `/api/pair/*`, `/api/profiles`)
- **Authentication and authorisation** (admin token handling, API key storage and retrieval)
- **Data handling** (Redis storage, preference encoding/decoding, config token generation)
- **Firmware** (CCFirm™ device firmware, OTA update mechanism, device pairing)
- **Client-side security** (XSS, CSRF, injection vulnerabilities in admin panel, setup wizard, and flasher)
- **Dependency vulnerabilities** (third-party npm packages with known CVEs)

### Out-of-Scope

The following are out-of-scope:

- Social engineering or phishing attacks against maintainers or users
- Denial-of-service (DoS/DDoS) attacks against Vercel infrastructure
- Vulnerabilities in third-party services (Vercel, Upstash, Transport Victoria OpenData API, Google Places API, Bureau of Meteorology)
- Physical attacks against hardware devices
- Issues requiring physical access to a user's device or server
- Automated scanning results without a demonstrated proof of concept

---

## 4. Notifiable Data Breaches (NDB) Response Plan

In accordance with Part IIIC of the *Privacy Act 1988* (Cth), Commute Compute™ maintains the following response plan for eligible data breaches.

### Step 1: Containment and Assessment (within 24 hours)

- Identify the nature and scope of the breach
- Contain the breach (revoke compromised credentials, rotate API keys, disable affected endpoints)
- Assess whether personal information is likely to have been accessed or disclosed
- Determine whether the breach is likely to result in serious harm to affected individuals

### Step 2: Notification to the OAIC (within 72 hours if eligible data breach)

If the assessment determines the breach is an eligible data breach (likely to result in serious harm):

- Prepare and submit a Notifiable Data Breach statement to the Office of the Australian Information Commissioner (OAIC) via [oaic.gov.au](https://www.oaic.gov.au)
- Include: description of the breach, the kinds of information involved, and recommended steps for affected individuals

### Step 3: Notification to Affected Individuals (as soon as practicable)

- Notify affected individuals directly (via email where contact details are available)
- Include: what happened, what information was involved, what steps we have taken, what steps they should take, and how to lodge a complaint with the OAIC

### Step 4: Post-Breach Review and Remediation

- Conduct a root-cause analysis
- Implement technical and procedural remediation measures
- Update this security policy and relevant documentation as necessary
- Publish a post-incident summary in the repository (without disclosing details that could enable further exploitation)

---

## 5. Data Classification

Commute Compute™ stores the following categories of data in each user's own Redis instance:

| Classification | Data | Storage Key | Sensitivity |
|:---------------|:-----|:------------|:------------|
| **Credentials** | Transport Victoria OpenData API key, Google Places API key | `cc:api:transit_key`, `cc:api:google_key` | High — encrypted at rest in Redis (AES-256) |
| **Personal addresses** | Home address, work address, cafe address | `cc:preferences` | High — location data constituting personal information |
| **Coordinates** | Latitude and longitude (derived from geocoding) | `cc:preferences` | High — precise geolocation data |
| **Preferences** | Arrival time, coffee preference, transit mode, walking estimates, state/territory | `cc:preferences` | Low — non-identifying configuration |
| **Device identifiers** | Device ID, battery status, last-seen timestamp | `cc:device:status` | Medium — device-level identifiers |
| **Journey profiles** | Named route configurations | `cc-profiles` | High — contains addresses and preferences |

**Note:** All data is stored exclusively in the user's own Redis instance. The project maintainer has no access to any user's data.

---

## 6. Security Architecture

### Encryption

- **At rest:** All Redis data is encrypted at rest by Upstash using AES-256 encryption
- **In transit:** All external API communication uses HTTPS/TLS. BOM, Transport Victoria OpenData, Google Places, and Vercel endpoints are all accessed exclusively over HTTPS

### Authentication

- **Admin panel:** Protected by bearer token authentication (`CC_ADMIN_TOKEN`) using timing-safe comparison to prevent timing attacks
- **Device pairing:** One-time pairing codes with expiry, stored in Redis
- **API keys:** Validated before storage, never logged or displayed in full

### Input Sanitisation

- All user input displayed in HTML is sanitised using a dedicated `sanitize()` function to prevent cross-site scripting (XSS)
- Path traversal protections are applied to all file-serving endpoints
- Content Security Policy (CSP) headers restrict script execution sources

### Zero-Config Security

- No `.env` files are used — all secrets are stored in Redis via the Setup Wizard
- No hardcoded API keys, personal addresses, or credentials exist in source code
- The source code is fully auditable under AGPL-3.0
- Compliance is verified by 240+ automated audit checks (see [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md))

### Logging

- No personal information is written to logs
- API keys are never logged or displayed in full
- Server-side logs contain only operational data (error messages, response codes)

---

## 7. Dependency Management

- Dependencies are reviewed for known vulnerabilities using `npm audit`
- The project maintains a minimal dependency footprint to reduce supply-chain risk
- Dependency updates are tracked in [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

## 8. Related Documents

- [PRIVACY.md](PRIVACY.md) — Privacy Policy and Data Collection Disclosure
- [LEGAL.md](LEGAL.md) — Licensing, Liability, and Legal Framework
- [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) — Development Standards and Compliance Rules
- [ATTRIBUTION.md](ATTRIBUTION.md) — Third-Party Data Source Attributions

---

<p align="center">

Commute Compute™, CommuteCompute™, CCDash™, CC LiveDash™, CCFirm™, CoffeeDecision™, DepartureConfidence™, LifestyleContext™, SleepOptimiser™, and AltTransit™ are trade marks of Angus Bergman.

Copyright &copy; 2026 Angus Bergman &bull; Licensed under [AGPL-3.0 (Dual Licence)](https://www.gnu.org/licenses/agpl-3.0.html)

</p>
