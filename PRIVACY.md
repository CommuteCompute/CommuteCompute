<p align="center">
  <img src="assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ — Privacy Policy & Data Collection Disclosure

**Effective Date:** 15 February 2026
**Last Updated:** 16 February 2026
**System Version:** v4.2.0

---

## Key Points Summary

**What you need to know:**

- **Your data stays in YOUR database** — Commute Compute™ is self-hosted on your own Vercel account. Each deployment is completely isolated. The project maintainer has no access to your preferences, addresses, or commute patterns.
- **You control what data is stored and can delete it at any time** — Use the admin panel to view, update, or delete all your stored data. You can export everything as JSON or reset the entire system with one click.
- **Some services (Vercel, Google) may process data outside Australia** — While your database can be hosted in Sydney, services like Vercel's hosting infrastructure may process data in the United States. See Section 4 for details.
- **No analytics, tracking, or telemetry** — Zero phone-home code. No Google Analytics, no usage tracking, no behavioural profiling. The source code is fully open and auditable.
- **If you set this up for someone else, you must inform them** — You become responsible for privacy compliance on that deployment. Make sure they know what data is collected and how to delete it.
- **This is free, open-source software** — No payment required. The entire system runs on free-tier services (Vercel, Transport Victoria OpenData, Bureau of Meteorology, OpenStreetMap).

---

## 1. Introduction

Commute Compute™ is a self-hosted, open-source commute intelligence system licensed under [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) (an open-source software licence that allows free use but requires sharing modifications) — dual licence available, see [LEGAL.md](LEGAL.md).

This policy describes what data the system collects, how it is stored, what third-party services receive data, and how you can delete your data.

**Key principle:** Commute Compute™ is designed with a privacy-first, self-hosted architecture. Each deployment runs on the user's own Vercel instance. There is no central server collecting or aggregating data across users.

---

## 2. Data We Collect

The following data is collected when you configure and use Commute Compute™:

| Category | Data | Purpose | Storage |
|:---------|:-----|:--------|:--------|
| **Addresses** | Home, work, and cafe addresses (text) | Journey calculation, geocoding to coordinates | Redis (the database where your preferences and settings are stored) — `cc:preferences` |
| **Coordinates** | Latitude and longitude (from geocoding) | Distance and walking time calculations | Redis (`cc:preferences`) |
| **API Keys** | Transport Victoria OpenData key, Google Places key (a unique code that identifies your application when requesting data from a service) | Authenticate with transit and geocoding providers | Redis (`cc:api:transit_key`, `cc:api:google_key`) |
| **Preferences** | Target arrival time, coffee preference, transit mode preferences, walking time estimates, Australian state/territory | Dashboard personalisation and journey calculation | Redis (`cc:preferences`) |
| **Device Status** | Battery percentage, battery voltage, device ID, last-seen timestamp | Device health monitoring in admin panel | Redis (`cc:device:status`) |
| **Journey Profiles** | Named route configurations (addresses, arrival time, preferences) | Quick switching between saved commute routes | Redis (`cc-profiles`) |

All data listed above is stored exclusively in your own Redis instance, encrypted at rest by Upstash (AES-256 — a widely-used encryption standard that scrambles data so it cannot be read without the correct key).

---

## 3. Data We Do NOT Collect

Commute Compute™ explicitly does **not** collect, store, or transmit:

- IP addresses (not logged by the application)
- Personal names (email addresses are only processed if voluntarily submitted via the feedback form -- see Section 4)
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
| [Transport Victoria OpenData API](https://opendata.transport.vic.gov.au) | API key (a unique code that identifies your application when requesting data from a service) in request header only — **no personal data** | Real-time train and tram departures, service alerts | Yes (VIC users) | [Transport Victoria Privacy](https://www.ptv.vic.gov.au/footer/legal-and-policies/privacy-policy/) |
| [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service) | Address search queries, Melbourne location bias | Geocoding and place autocomplete | Optional — free OpenStreetMap fallback available | [Google Privacy Policy](https://policies.google.com/privacy) |
| [Bureau of Meteorology](https://www.bom.gov.au) | None (unauthenticated public GET request) | Weather observations (temperature, conditions, wind) | Yes | [BOM Privacy](https://www.bom.gov.au/other/privacy.shtml) |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | Address search queries | Geocoding fallback when Google Places is not configured | Fallback only | [OSM Privacy Policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy) |
| [Vercel](https://vercel.com) | All stored data (hosting and Redis storage) | Application hosting, serverless functions, Redis database | Yes | [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) |

### Feedback Email (Optional)

Commute Compute™ includes an optional feedback form (`/api/feedback`) that allows users to submit feedback to the deployment operator. If the deployment operator has configured SMTP environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FEEDBACK_EMAIL`), submitted feedback -- including the user-provided name, email address, feedback type, and message -- is sent via email using the nodemailer library. If SMTP is not configured, feedback is logged server-side only and no email is sent. No email addresses are stored persistently in Redis. Users are never required to provide an email address to use Commute Compute™.

**Important:** Your home, work, and cafe addresses are **not** sent to transit authorities. Only public GTFS stop IDs (GTFS — General Transit Feed Specification — is a standard data format used worldwide for transit schedules and real-time updates; e.g., stop ID `"12179"` for South Yarra Station) are used to query real-time departure data.

### Cross-Border Data Flows (APP 8)

Commute Compute qualifies for the small business exemption under s 6D of the Privacy Act 1988 but voluntarily complies with APP 8.

**Cross-border data flows:** Some third-party services process data outside Australia (Vercel and Upstash infrastructure is located in the United States). We take reasonable steps to protect your personal information when disclosed to overseas recipients by: (1) selecting providers with SOC 2 Type II certification (an independent audit standard that verifies a service organisation's security controls are effective over a sustained period) or equivalent, (2) using encryption in transit (HTTPS/TLS 1.3 — secure communication protocols that encrypt data sent between your browser and servers, indicated by the padlock icon in your browser) and at rest (AES-256), and (3) reviewing third-party privacy policies for compliance with international privacy standards. For Upstash security practices and certifications, see the [Upstash Security Page](https://upstash.com/docs/common/security). We recommend selecting the Sydney (Australia) region when creating your Redis database to minimise cross-border data transfers.

**Vercel serverless function execution:** Vercel may execute serverless functions in regions outside Australia (including the United States) depending on deployment configuration and request routing. During function execution, data read from Redis (including your addresses and preferences) is processed in memory on the function instance. This data is not persisted outside Redis and is discarded when the function completes. To minimise cross-border data processing, configure your Vercel project's function region to Sydney (syd1) if available on your plan.

---

## 5. Data Storage and Security

### Storage

- All persistent data is stored in your Redis instance
- Redis data is encrypted at rest (AES-256) by Upstash
- No data is written to the filesystem — Vercel serverless functions are stateless
- In-memory caches (transit data, weather) are discarded when the serverless function completes

### Security Measures

- All external API communication uses HTTPS/TLS (secure communication protocols that encrypt data sent between your browser and servers — indicated by the padlock icon in your browser)
- Zero-config architecture: no `.env` files, no hardcoded secrets in source code
- All user input is sanitised before display to prevent cross-site scripting (XSS)
- Admin endpoints are protected by bearer token authentication (a bearer token is an authentication credential that grants access to API resources — similar to a password that proves you are authorised) (`CC_ADMIN_TOKEN`)
- API keys are validated before storage and are never logged or displayed in full
- No personal information is hardcoded in the source code

For our full security policy, responsible disclosure process, and data breach response plan, see [SECURITY.md](SECURITY.md).

### BLE Provisioning Security

During initial device setup (Step 4 of the Setup Guide), your TRMNL display uses Bluetooth Low Energy (BLE) to receive WiFi credentials and the server URL from your browser.

**BLE Security Note:** During initial device setup, Bluetooth Low Energy (BLE) communication between your browser and device does not use link-layer encryption. WiFi credentials and the server URL are transmitted in plaintext over the BLE air interface. This is standard for BLE provisioning on IoT devices and is mitigated by:

- BLE range is physically limited to approximately 10-30 metres
- The Web Bluetooth API requires you to manually select your device in a browser permission dialog
- BLE provisioning is only active during initial setup — once configured, the device communicates exclusively over your WiFi network via HTTPS
- We recommend performing initial device setup in a private environment (your home or office)

After provisioning completes, all subsequent communication between the device and your server occurs over your WiFi network using HTTPS. BLE is not used again unless you factory reset the device.

### Config Token Security

Dashboard device URLs contain Base64URL-encoded configuration tokens (a method of encoding data into text characters — similar to how a barcode represents a product number). These tokens include your minified preferences (addresses, API keys, coordinates). Tokens are **encoded, not encrypted**.

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

**To export all stored data as JSON:** Call `/api/admin/export` with your admin token. This returns all preferences, API keys (masked), device status, and journey profiles.

### How to Delete Your Data

You have several options for deleting your data:

1. **Clear all stored data via the Admin Panel:** Navigate to your Admin Panel (`/admin`), authenticate with your admin token, and use the "Reset All Data" function. This immediately deletes all preferences, API keys, device status, and journey profiles from your Redis database. Alternatively, call the `/api/admin/reset` endpoint directly with your admin token.

2. **Delete your Vercel deployment:** If you delete your Vercel project entirely, all associated Redis data is permanently removed along with the deployment. No residual personal data remains in the Commute Compute™ application after the project is deleted. Vercel's own data retention policies apply to infrastructure-level backups — see the [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy) for details.

3. **Request deletion by email:** If you are unable to delete your data using the methods above, or if you have any questions about data deletion, contact us at commutecompute.licensing@gmail.com and we will assist you within 30 days.

---

## 7. Self-Hosted Architecture

Commute Compute™ is architected so that each user deploys and controls their own instance:

- Each Vercel deployment is fully isolated — no data is shared between users
- Each deployment operator is the data controller for their own instance — the project maintainer has no access to any user's Redis data, preferences, or commute patterns
- By deploying Commute Compute™, you create your own independent Vercel instance and Redis database. You assume responsibility for the security and privacy compliance of your own deployment, including your obligations under applicable privacy laws
- If you configure Commute Compute™ for another person, you are responsible for ensuring they are informed about data collection and their right to request deletion
- There is no central Commute Compute™ server collecting or aggregating data
- There is no user profiling, behavioural analytics, or telemetry
- The full source code is available and auditable under AGPL-3.0
- Compliance is verified by 240+ automated audit checks (see [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md))

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

- Licensed under AGPL-3.0 (an open-source software licence that allows free use but requires sharing modifications) — dual licence available, see [LEGAL.md](LEGAL.md)
- All data flows are visible and auditable in the source code
- No hidden telemetry, phone-home, or data exfiltration code
- Repository includes automated compliance auditing with 240+ checks across 25 rule sections
- All third-party data source attributions listed in [ATTRIBUTION.md](ATTRIBUTION.md)

---

## 10. Children's Privacy

Commute Compute™ is not directed at children under the age of 18. The system does not collect age information, does not require account creation, does not enable social interaction, and does not engage in behavioural profiling or targeted content delivery. We do not knowingly collect personal information from children. If you believe a child has provided personal data through this system, please contact us to have it removed. This position will be reviewed against the OAIC Children's Online Privacy Code upon its registration (expected by 10 December 2026).

---

## 11. Australian Privacy Principles

Commute Compute™ is designed with the Australian Privacy Principles (APPs) under the *Privacy Act 1988* (Cth) in mind:

- **Data minimisation:** Only data necessary for commute calculations is collected
- **Purpose limitation:** Data is used solely for rendering your personal commute dashboard
- **User control:** You control your own data lifecycle — configure, update, and delete at any time
- **Transparency:** This policy and the open-source code provide full visibility into data handling
- **Security:** Encryption at rest, HTTPS in transit, input sanitisation, and token-based authentication

### Privacy and Other Legislation Amendment Act 2024

The *Privacy Act 1988* (Cth), as amended by the *Privacy and Other Legislation Amendment Act 2024* (Royal Assent 10 December 2024; statutory tort effective 10 June 2025), introduces a statutory tort for serious invasions of privacy and expands the definition of "personal information" to include device identifiers and technical data. Commute Compute™'s self-hosted, privacy-first architecture is designed so that all personal data remains under your control on your own Vercel deployment. The project maintainer does not collect, access, or store any user data.

---

## 12. Automated Decision-Making (ADM) Transparency

*In accordance with Australian Privacy Principle 1 (APP 1), as amended by the Privacy and Other Legislation Amendment Act 2024, and effective from 10 December 2026, the following disclosure is provided.*

Commute Compute uses automated processing to personalise your dashboard:

- **Departure timing:** The CommuteCompute Engine calculates when you should leave based on your saved addresses, preferred arrival time, and current transit conditions.
- **Route selection:** The engine automatically selects the best route considering live departures, walking pace, and your mode preferences.
- **Coffee recommendations:** The CoffeeDecision™ feature uses your journey timing and coffee preferences to suggest whether you have time for a coffee.
- **Live departures:** CC LiveDash™ automatically selects which transit departures to display based on proximity and route relevance.

**Your rights:** You can view, change, or delete all inputs to these automated decisions at any time via the Admin Panel (`/admin`) or Setup Wizard (`/setup-wizard.html`). To delete all stored data, use the admin reset endpoint (`/api/admin/reset`).

These decisions are made entirely on your own server — no personal data is sent to third parties for decision-making. No automated decisions are made that have legal or similarly significant effects.

### 12.1 CommuteCompute Engine

The CommuteCompute Engine is responsible for the core departure timing and route selection described above.

- **Input:** Home and work addresses (text and geocoded coordinates), preferred arrival time and departure window, transit mode preferences (train, tram, bus, V/Line), walking pace estimate, coffee and cafe preferences, and device identifier (for display targeting).
- **Processing:** Calculates optimal departure time by combining your saved preferences with live transit data (GTFS-RT — General Transit Feed Specification Realtime, a standard format for live transit departure and service alert data) and walking distance estimates. Selects the best available route considering real-time departures, service disruptions, and your mode preferences.
- **Output:** Departure countdown, recommended route, and transit connection details displayed on your dashboard.
- **Impact:** Informational only — provides timing recommendations. No binding decisions, no financial transactions, no legal consequences.
- **Human oversight:** You can view, change, or delete all inputs at any time via the Admin Panel (`/admin`) or Setup Wizard (`/setup-wizard.html`). You may also switch between saved Journey Profiles to override the route selection.

### 12.2 LifestyleContext™ Engine

The LifestyleContext™ Engine provides contextually appropriate lifestyle suggestions alongside your commute data.

- **Input:** Current time of day, day of week, and your commute schedule (derived from your saved preferences).
- **Processing:** Selects lifestyle suggestions based on the current context — for example, coffee recommendations when you are approaching your departure window, or timing advice relevant to your commute pattern.
- **Output:** Text suggestions displayed on the dashboard (e.g., coffee timing, preparation reminders).
- **Impact:** Informational only — no binding decisions, no financial impact, no notifications sent to third parties.
- **Human oversight:** You can disable lifestyle suggestions via Admin Panel preferences. All inputs are derived from preferences you have explicitly configured.

### 12.3 SleepOptimiser™

The SleepOptimiser™ determines when to transition your dashboard between sleep and active display modes.

- **Input:** Current time and your wake-up preferences (if configured via the Admin Panel).
- **Processing:** Determines whether the dashboard should display in sleep mode (minimal, dimmed display) or active mode (full commute dashboard), and calculates pre-commute preparation timing based on your configured schedule.
- **Output:** Dashboard transitions between sleep and active modes at the appropriate times.
- **Impact:** Display mode only — no alarms are triggered, no notifications are sent to third parties, and no data is shared externally.
- **Human oversight:** You configure your sleep schedule and wake-up preferences via the Admin Panel. You may disable sleep mode entirely if preferred.

### Kinds of personal information used in automated decisions

- Home and work addresses (text and geocoded coordinates)
- Preferred arrival time and departure window
- Transit mode preferences (train, tram, bus, V/Line)
- Walking pace estimate
- Coffee and cafe preferences
- Device identifier (for display targeting)
- Time-of-day and day-of-week context (derived from system clock)
- Sleep schedule and wake-up preferences (if configured)

All inputs are provided directly by you via the Setup Wizard or Admin Panel and stored exclusively in your own Redis instance.

---

## 13. Changes to This Policy

- Policy updates are tracked in [docs/CHANGELOG.md](docs/CHANGELOG.md)
- The full revision history of this file is available in the git repository
- Material changes will be communicated via repository release notes

---

## 14. Statutory Tort — Serious Invasion of Privacy

The *Privacy Act 1988* (Cth), as amended by the *Privacy and Other Legislation Amendment Act 2024* (Royal Assent 10 December 2024), provides individuals with a statutory cause of action for serious invasions of privacy (effective 10 June 2025). Commute Compute™ is committed to handling all personal information in accordance with the Australian Privacy Principles to minimise the risk of such invasions.

If you believe your privacy has been seriously invaded through the use of this service, you may:
1. Contact us at commutecompute.licensing@gmail.com
2. Lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at [oaic.gov.au](https://www.oaic.gov.au/)
3. Seek legal advice regarding your rights under the statutory tort provisions

---

## 15. Contact and Complaints

For privacy-related enquiries:

- **Email:** commutecompute.licensing@gmail.com
- **GitLab Issues:** [gitlab.com/angusbergman/commute-compute-system/issues](https://gitlab.com/angusbergman/commute-compute-system/issues)
- **Licensing and legal:** See [LEGAL.md](LEGAL.md)

### Complaint Resolution

If you have a privacy concern or complaint, please contact us first at commutecompute.licensing@gmail.com. We will respond within 30 days.

If you are not satisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at [oaic.gov.au/privacy/privacy-complaints](https://www.oaic.gov.au/privacy/privacy-complaints) or by calling 1300 363 992.

---

<p align="center">

Commute Compute™, CommuteCompute™, CCDash™, CC LiveDash™, CCFirm™, CoffeeDecision™, DepartureConfidence™, LifestyleContext™, SleepOptimiser™, and AltTransit™ are trade marks of Angus Bergman.

Copyright &copy; 2026 Angus Bergman &bull; Licensed under [AGPL-3.0 (Dual Licence)](https://www.gnu.org/licenses/agpl-3.0.html)

</p>
