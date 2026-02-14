<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ — Privacy Policy & Data Collection Disclosure

**Effective Date:** 9 February 2026
**Last Updated:** 9 February 2026
**System Version:** v4.2.0

---

## 1. Introduction

Commute Compute™ is a self-hosted, open-source commute intelligence system licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) (dual license available — see [LEGAL.md](LEGAL.md)).

This policy describes what data the system collects, how it is stored, what third-party services receive data, and how you can delete your data.

**Key principle:** Commute Compute™ is designed with a privacy-first, self-hosted architecture. Each deployment runs on the user's own Vercel instance. There is no central server collecting or aggregating data across users.

---

## 2. Data We Collect

The following data is collected when you configure and use Commute Compute™:

| Category | Data | Purpose | Storage |
|:---------|:-----|:--------|:--------|
| **Addresses** | Home, work, and cafe addresses (text) | Journey calculation, geocoding to coordinates | Redis (`cc:preferences`) |
| **Coordinates** | Latitude and longitude (from geocoding) | Distance and walking time calculations | Redis (`cc:preferences`) |
| **API Keys** | Transport Victoria OpenData key, Google Places key | Authenticate with transit and geocoding providers | Redis (`cc:api:transit_key`, `cc:api:google_key`) |
| **Preferences** | Target arrival time, coffee preference, transit mode preferences, walking time estimates, Australian state/territory | Dashboard personalisation and journey calculation | Redis (`cc:preferences`) |
| **Device Status** | Battery percentage, battery voltage, device ID, last-seen timestamp | Device health monitoring in admin panel | Redis (`cc:device:status`) |
| **Journey Profiles** | Named route configurations (addresses, arrival time, preferences) | Quick switching between saved commute routes | Redis (`cc-profiles`) |

All data listed above is stored exclusively in your own Redis instance, encrypted at rest by Upstash (AES-256).

---

## 3. Data We Do NOT Collect

Commute Compute™ explicitly does **not** collect, store, or transmit:

- IP addresses (not logged by the application)
- Personal names or email addresses
- Browsing history or search history
- Analytics, tracking pixels, or usage telemetry
- Cookies for profiling or advertising
- Location history (only your current configured addresses are stored)
- User behavioural data or app usage metrics
- Health or biometric data

There are no third-party analytics SDKs embedded in the system (no Google Analytics, Sentry, Amplitude, Mixpanel, or similar).

---

## 4. Third-Party Services

Commute Compute™ communicates with the following external services to provide real-time commute data:

| Service | Data Sent to Service | Purpose | Required? | Their Privacy Policy |
|:--------|:--------------------|:--------|:----------|:--------------------|
| [Transport Victoria OpenData API](https://opendata.transport.vic.gov.au) | API key in request header only — **no personal data** | Real-time train and tram departures, service alerts | Yes (VIC users) | [Transport Victoria Privacy](https://www.ptv.vic.gov.au/footer/legal-and-policies/privacy-policy/) |
| [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service) | Address search queries, Melbourne location bias | Geocoding and place autocomplete | Optional — free OpenStreetMap fallback available | [Google Privacy Policy](https://policies.google.com/privacy) |
| [Bureau of Meteorology](https://www.bom.gov.au) | None (unauthenticated public GET request) | Weather observations (temperature, conditions, wind) | Yes | [BOM Privacy](https://www.bom.gov.au/other/privacy.shtml) |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | Address search queries | Geocoding fallback when Google Places is not configured | Fallback only | [OSM Privacy Policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy) |
| [Vercel](https://vercel.com) | All stored data (hosting and KV storage) | Application hosting, serverless functions, KV database | Yes | [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) |

**Important:** Your home, work, and cafe addresses are **not** sent to transit authorities. Only public GTFS stop IDs (e.g., `"12179"` for South Yarra Station) are used to query real-time departure data.

---

## 5. Data Storage and Security

### Storage

- All persistent data is stored in your Redis instance
- Redis data is encrypted at rest (AES-256) by Upstash
- No data is written to the filesystem — Vercel serverless functions are stateless
- In-memory caches (transit data, weather) are discarded when the serverless function completes

### Security Measures

- All external API communication uses HTTPS/TLS
- Zero-config architecture: no `.env` files, no hardcoded secrets in source code
- All user input is sanitised before display to prevent cross-site scripting (XSS)
- Admin endpoints are protected by bearer token authentication (`CC_ADMIN_TOKEN`)
- API keys are validated before storage and are never logged or displayed in full
- No personal information is hardcoded in the source code

### Config Token Security

Dashboard device URLs contain Base64URL-encoded configuration tokens. These tokens include your minified preferences (addresses, API keys, coordinates). Tokens are **encoded, not encrypted**.

**Treat your device webhook URL as sensitive — like a password.** Do not share it publicly.

---

## 6. Data Retention and Deletion

| Data | Retention Period | How to Delete |
|:-----|:----------------|:-------------|
| User preferences and addresses | Until manually deleted | Admin panel or `/api/admin/reset` endpoint |
| API keys | Until manually deleted | Admin panel or `/api/admin/reset` endpoint |
| Real-time transit data | 30-60 second in-memory cache | Automatic (cleared on function completion) |
| Weather data | 10 minute in-memory cache | Automatic (cleared on function completion) |
| Device status | Overwritten on next device report | Admin panel or `/api/admin/reset` endpoint |
| Journey profiles | Until manually deleted | Admin panel |

**To delete all data:** Use the admin reset endpoint (`/api/admin/reset` with your admin token) or delete your Vercel project entirely. Vercel's own data retention policies apply to infrastructure-level backups — see the [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) for details.

---

## 7. Self-Hosted Architecture

Commute Compute™ is architected so that each user deploys and controls their own instance:

- Each Vercel deployment is fully isolated — no data is shared between users
- There is no central Commute Compute™ server collecting or aggregating data
- There is no user profiling, behavioural analytics, or telemetry
- The full source code is available and auditable under AGPL-3.0
- Compliance is verified by 214 automated audit checks (see [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md))

---

## 8. Free-Tier Commitment

Core Commute Compute™ functionality requires zero paid services:

- **Vercel** — Free tier includes hosting; Redis (via Marketplace) for storage
- **Transport Victoria OpenData** — Free registration, no usage fees
- **Bureau of Meteorology** — Public data, no API key required
- **OpenStreetMap Nominatim** — Free geocoding (used as default/fallback)

Google Places API is optional. If not configured, the system uses free OpenStreetMap geocoding instead. Users are never required to provide payment information to use Commute Compute™.

---

## 9. Open Source Transparency

- Licensed under AGPL-3.0 (dual license available — see [LEGAL.md](LEGAL.md))
- All data flows are visible and auditable in the source code
- No hidden telemetry, phone-home, or data exfiltration code
- Repository includes automated compliance auditing with 214 checks across 25 rule sections
- All third-party data source attributions listed in [ATTRIBUTION.md](ATTRIBUTION.md)

---

## 10. Children's Privacy

Commute Compute™ is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided personal data through this system, please contact us to have it removed.

---

## 11. Australian Privacy Principles

Commute Compute™ is designed with the Australian Privacy Principles (APPs) under the *Privacy Act 1988* (Cth) in mind:

- **Data minimisation:** Only data necessary for commute calculations is collected
- **Purpose limitation:** Data is used solely for rendering your personal commute dashboard
- **User control:** You control your own data lifecycle — configure, update, and delete at any time
- **Transparency:** This policy and the open-source code provide full visibility into data handling
- **Security:** Encryption at rest, HTTPS in transit, input sanitisation, and token-based authentication

---

## 12. Changes to This Policy

- Policy updates are tracked in [docs/CHANGELOG.md](docs/CHANGELOG.md)
- The full revision history of this file is available in the git repository
- Material changes will be communicated via repository release notes

---

## 13. Contact

For privacy-related enquiries:

- **Email:** commutecompute.licensing@gmail.com
- **GitLab Issues:** [gitlab.com/angusbergman/commute-compute-system/issues](https://gitlab.com/angusbergman/commute-compute-system/issues)
- **Licensing and legal:** See [LEGAL.md](LEGAL.md)

---

<p align="center">

Commute Compute™, CommuteCompute™, CCDash™, CC LiveDash™, and CCFirm™ are trademarks of Angus Bergman.

Copyright &copy; 2026 Angus Bergman &bull; Licensed under [AGPL-3.0 (Dual Licence)](https://www.gnu.org/licenses/agpl-3.0.html)

</p>
