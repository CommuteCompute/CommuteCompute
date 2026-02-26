# Privacy Impact Assessment

**Commute Compute System™ -- Privacy Impact Assessment**

**Version:** 1.0
**Date:** 2026-02-27
**Review Cycle:** Annual (next review: 2027-02-27)
**ABN:** 59 402 869 395 (Sole Trader)

---

## 1. Overview

The Commute Compute System is a personalised transit dashboard that renders 1-bit BMP images for display on e-ink hardware (TRMNL Display). It processes real-time and scheduled transit data via the Transport Victoria OpenData API to generate departure boards tailored to a user's configured routes and addresses.

The system stores user preferences in Redis (via Vercel Marketplace, powered by Upstash), renders dashboard images server-side through the CCDash™ renderer, and serves those images to the TRMNL Display hardware over HTTPS. The CommuteCompute™ engine calculates optimal transit routes, incorporating features such as DepartureConfidence™ scoring, LifestyleContext™ suggestions, CoffeeDecision™ indicators, SleepOptimiser™ adjustments, and AltTransit™ alternatives. CC LiveDash™ provides real-time departure updates, while CCFirm™ manages the device firmware.

This Privacy Impact Assessment (PIA) evaluates the system's data handling practices against the Australian Privacy Principles (APPs) under the Privacy Act 1988 (Cth) and identifies risks, mitigations, and ongoing review obligations.

---

## 2. Data Inventory

### 2.1 Data Collected

| Data Type | Source | Storage | Retention | Personal? |
|-----------|--------|---------|-----------|-----------|
| Transport Victoria OpenData API key | User input (Setup Wizard) | Redis (encrypted at rest) | Until user deletion | No (API credential) |
| Google Places API key (optional) | User input (Setup Wizard) | Redis (encrypted at rest) | Until user deletion | No (API credential) |
| Home/work addresses | User input (Setup Wizard) | Redis (encrypted at rest) | Until user deletion | Potentially (location data) |
| Transit route preferences | User input (Setup Wizard/Admin Panel) | Redis (encrypted at rest) | Until user deletion | No |
| Device token | TRMNL hardware | Redis (encrypted at rest) | Until user deletion | No (device identifier) |
| Admin authentication token | Generated on setup | Redis (encrypted at rest) | Until user deletion | No |

### 2.2 Data NOT Collected

- No names, email addresses, or contact details
- No payment information
- No analytics or tracking data
- No cookies (the system renders server-side BMP images)
- No browsing history
- No IP address logging (beyond standard Vercel infrastructure logs)
- No third-party advertising or marketing data
- No government-issued identifiers
- No biometric data
- No health information

---

## 3. Data Flows

The following describes the end-to-end data flow within the Commute Compute System:

1. **Configuration** -- The user opens the Setup Wizard in a browser and enters their Transport Victoria OpenData API key, optional Google Places API key, home/work addresses, and transit route preferences.
2. **Storage** -- All preferences are written to Redis (Upstash, via Vercel Marketplace). Redis encrypts data at rest. No `.env` files are used; all secrets are stored exclusively in Redis.
3. **Request** -- The TRMNL Display hardware periodically requests a dashboard image from `api/screen.js` over HTTPS, authenticating via its device token.
4. **Transit Data Fetch** -- The server-side endpoint calls the Transport Victoria OpenData API using the user's stored API key, retrieving real-time GTFS-RT and scheduled GTFS data for the configured routes.
5. **Route Processing** -- The CommuteCompute engine processes the transit data, calculating departure times, walking estimates, and contextual information.
6. **Rendering** -- The CCDash renderer generates a 1-bit BMP image (optimised for e-ink display) containing the processed transit information.
7. **Delivery** -- The BMP image is returned to the TRMNL Display over HTTPS. No data is stored client-side.

### Data Flow Diagram

```
+-------------------+        HTTPS         +-------------------+
|                   | --------------------> |                   |
|   Setup Wizard    |   User preferences   |   Redis (Upstash) |
|   (Browser)       | --------------------> |   Encrypted at    |
|                   |                       |   rest            |
+-------------------+                       +--------+----------+
                                                     |
                                                     | Read preferences
                                                     v
+-------------------+        HTTPS         +-------------------+
|                   | <------------------- |                   |
|   TRMNL Display   |   1-bit BMP image    |   api/screen.js   |
|   (Hardware)      | <------------------- |   (Vercel)        |
|                   |                       |                   |
+-------------------+                       +--------+----------+
                                                     |
                                                     | HTTPS (API key in header)
                                                     v
                                            +-------------------+
                                            |  Transport Vic    |
                                            |  OpenData API     |
                                            |  (GTFS / GTFS-RT) |
                                            +-------------------+
```

**Key observations:**
- All network communications use HTTPS.
- Address data leaves the system only when transmitted to the Transport Victoria OpenData API for journey planning.
- No personal data is embedded in the rendered BMP image.
- The TRMNL Display receives only a bitmap; no user preferences are transmitted to the hardware.

---

## 4. Australian Privacy Principles (APP) Alignment

Assessment against the 13 Australian Privacy Principles under the Privacy Act 1988 (Cth):

### APP 1 -- Open and Transparent Management of Personal Information

The Commute Compute System publishes this PIA, a LEGAL.md document, and maintains open-source code that enables public inspection of all data handling practices. There is no hidden data collection. The system's data practices are documented and accessible.

**Assessment:** Compliant.

### APP 2 -- Anonymity and Pseudonymity

Users are not required to identify themselves to use the system. No names, email addresses, or personal identifiers are collected. The system uses device tokens (tied to hardware, not individuals) and API keys (tied to developer accounts with the Transport Victoria OpenData API, not to individuals within the Commute Compute System).

**Assessment:** Compliant. Users operate under effective anonymity within the system.

### APP 3 -- Collection of Solicited Personal Information

The only data that may constitute personal information is home/work address data, which is reasonably necessary for the system's core function of calculating transit routes. Collection is limited to what is required for the service to operate. The system does not collect sensitive information as defined under the Privacy Act.

**Assessment:** Compliant. Collection is minimal and purpose-limited.

### APP 4 -- Dealing with Unsolicited Personal Information

The Commute Compute System does not receive unsolicited personal information. All data is explicitly entered by the user through the Setup Wizard or Admin Panel.

**Assessment:** Not applicable.

### APP 5 -- Notification of the Collection of Personal Information

The Setup Wizard clearly indicates what data is being collected (addresses, API keys, route preferences) and why (to generate personalised transit dashboards). Users make an informed decision to provide this data.

**Assessment:** Compliant.

### APP 6 -- Use or Disclosure of Personal Information

Address data is used solely for transit route calculation. It is transmitted to the Transport Victoria OpenData API for journey planning purposes. It is not disclosed to any other third party, not used for marketing, and not shared with advertisers or data brokers.

**Assessment:** Compliant. Use is strictly limited to the primary purpose of collection.

### APP 7 -- Direct Marketing

The Commute Compute System does not engage in direct marketing of any kind. A standing founder directive prohibits the collection of email addresses or personal contact information. No electronic messages are sent to users.

**Assessment:** Compliant. Direct marketing is structurally impossible given the system's design.

### APP 8 -- Cross-Border Disclosure of Personal Information

Data is processed on Vercel's serverless infrastructure, which may utilise data centres outside Australia. Redis storage is managed by Upstash, which may also process data outside Australian borders. While the data involved is limited (primarily addresses and API keys), users should be aware that serverless infrastructure inherently involves cross-border data processing.

**Mitigations:**
- The only potentially personal data involved is address information.
- All data is encrypted at rest and in transit.
- Vercel and Upstash maintain their own security and privacy compliance programmes.

**Assessment:** Partial. Cross-border processing is inherent to the serverless architecture. The risk is mitigated by the minimal nature of the personal information involved.

### APP 9 -- Adoption, Use or Disclosure of Government Related Identifiers

The Commute Compute System does not collect, store, or use government-related identifiers (such as Medicare numbers, tax file numbers, or driver licence numbers).

**Assessment:** Not applicable.

### APP 10 -- Quality of Personal Information

Users can update their address data and preferences at any time through the Admin Panel or Setup Wizard. The system uses the most recently provided data for all calculations, ensuring information quality is maintained by the user.

**Assessment:** Compliant.

### APP 11 -- Security of Personal Information

Security measures include:
- Redis storage encrypted at rest (Upstash, via Vercel Marketplace)
- All API communications over HTTPS (TLS)
- No `.env` files -- all secrets stored exclusively in Redis
- Admin authentication token required for sensitive operations
- Server-side rendering -- no client-side data exposure
- No cookies or browser-based storage
- Open-source codebase enabling public security review
- No logging of API keys or personal data

**Assessment:** Compliant. Security measures are appropriate to the nature and volume of data held.

### APP 12 -- Access to Personal Information

Users can view all stored preferences (including addresses and API keys) through the Admin Panel at any time. There are no access restrictions beyond the admin authentication token, which the user controls.

**Assessment:** Compliant. Full transparency and access provided.

### APP 13 -- Correction of Personal Information

Users can correct, update, or delete all stored data via the Admin Panel or Setup Wizard at any time. There is no impediment to correction, and changes take effect immediately.

**Assessment:** Compliant.

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API key exposure | Low | Medium | Keys stored in Redis (encrypted at rest), transmitted over HTTPS only, never logged |
| Address data breach via Redis | Low | Medium | Upstash Redis encrypted at rest, access via authenticated REST API only |
| Cross-border data processing | Medium | Low | Standard for serverless platforms; no sensitive PII involved beyond addresses |
| Unauthorised admin access | Low | Medium | Admin authentication token required; configurable via Setup Wizard |
| Transit API data interception | Very Low | Low | All API calls use HTTPS (TLS encryption in transit) |
| Vercel infrastructure compromise | Very Low | Medium | Mitigated by Vercel's own security practices; no sensitive PII at rest on Vercel compute |
| Stale address data used after user moves | Low | Very Low | Users can update addresses at any time; no downstream consequence beyond incorrect routes |

---

## 6. Mitigation Measures

The following measures are in place to minimise privacy risk:

- **Privacy by design** -- No personal information collection beyond what is strictly necessary (no names, emails, accounts, or payment details)
- **Encryption at rest** -- Redis storage encrypted via Upstash Marketplace integration
- **Encryption in transit** -- All API communications over HTTPS
- **No analytics or tracking** -- No third-party analytics, no tracking pixels, no behavioural profiling
- **No third-party data sharing** -- Address data is transmitted only to the Transport Victoria OpenData API for its intended purpose
- **No `.env` files** -- Secrets stored exclusively in Redis, eliminating a common source of credential leakage
- **Authenticated admin access** -- Admin Panel protected by authentication token
- **Server-side rendering** -- Dashboard images rendered on the server; no user data transmitted to or stored on the TRMNL Display
- **No cookies or browser storage** -- No client-side persistence mechanisms used
- **Open-source codebase** -- Public repository enables independent security review
- **No data collection directive** -- A standing founder directive prohibits the collection of email addresses or personal contact information for waitlists, marketing, or any other purpose

---

## 7. Applicable Legislation

The following Australian legislation is relevant to this assessment:

| Legislation | Relevance |
|-------------|-----------|
| **Privacy Act 1988 (Cth)** | Primary privacy legislation; establishes the Australian Privacy Principles. The small business exemption (annual turnover under $3 million) may apply, but this PIA demonstrates voluntary compliance. |
| **Australian Consumer Law** (Schedule 2, Competition and Consumer Act 2010 (Cth)) | Applies to representations made about the system's data handling practices. |
| **Spam Act 2003 (Cth)** | Not applicable -- the system does not send electronic messages. |
| **Surveillance Devices Act 1999 (Vic)** | Not applicable -- the system does not perform surveillance or monitor communications. |
| **Consumer Data Right** (where applicable) | Noted for awareness; transit data is not currently a designated CDR sector. |
| **Telecommunications Act 1997 (Cth)** | Not directly applicable, but relevant to the extent that internet-based services process data through Australian telecommunications networks. |

**Note on the small business exemption:** Under s 6D of the Privacy Act 1988, organisations with annual turnover of less than $3 million are generally exempt from the APPs. The Commute Compute System, as a sole trader operation, likely falls within this exemption. However, this PIA is maintained as a matter of good practice and to demonstrate a commitment to responsible data handling.

---

## 8. Review Schedule

| Review | Date | Scope |
|--------|------|-------|
| Initial assessment | 2026-02-27 | Full PIA covering all data types, flows, and APP alignment |
| Annual review | 2027-02-27 | All sections; legislative changes; new data types or flows |
| Trigger review | As needed | Following any new data collection, data breach, significant system architecture change, or relevant legislative amendment |

**Trigger events requiring immediate review:**
- Introduction of any new category of personal information
- Any data breach or suspected data breach
- Changes to third-party service providers (e.g., migration from Upstash/Vercel)
- Amendments to the Privacy Act 1988 or introduction of new relevant legislation
- Expansion of the Consumer Data Right to transit data
- Any change from sole trader to a different business structure

---

*This Privacy Impact Assessment is maintained as part of the Commute Compute System™ documentation. It reflects the system architecture as of v4.2.0 and is published in the open-source repository for transparency.*
