<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Transport Victoria OpenData API Guide

**How to obtain and use the Transport Victoria OpenData API for real-time transit data.**

**Version:** 3.0
**Last Updated:** 2026-02-06
**System Version:** v3.5.0 (CCDashDesignV15.0)
**License:** AGPL-3.0 Dual License

---

## Overview

Commute Compute uses the **Transport Victoria OpenData API** (GTFS-RT) for real-time departure information. This guide explains how to obtain an API key and how the system uses it.

**Note:** An API key is **optional**. Without one, Commute Compute falls back to timetable data, which is still useful but won't show real-time delays.

---

## API Key Benefits

| With API Key | Without API Key |
|--------------|-----------------|
| Real-time departures | Scheduled timetable times |
| Live delay information | No delay data |
| Service disruption alerts | No alerts |
| Vehicle positions | No tracking |

---

## Getting an API Key

### Step 1: Create Account

1. Go to [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/)
2. Click **Sign Up** or **Register**
3. Fill in your details:
   - Name
   - Email address
   - Password
4. Verify your email address

### Step 2: Request API Key

1. Log in to your account
2. Navigate to **My Account** or **API Keys**
3. Click **Request New API Key**
4. Enter a description (e.g., "Commute Compute")
5. Accept the terms of use
6. Click **Submit**

### Step 3: Get Your Key

Your API key will be displayed or emailed to you.

**Key Format:** UUID (e.g., `12345678-abcd-1234-abcd-123456789012`)

**Important:** Keep your API key private. Don't share it publicly.

---

## Using Your API Key

### Option 1: Setup Wizard

1. Open the Setup Wizard: `/setup-wizard.html`
2. Navigate to Step 4 (API Keys)
3. Paste your API key
4. Click **Validate** to test
5. Continue with setup

### Option 2: Admin Panel

1. Open the Admin Panel: `/admin.html`
2. Go to **API Settings** tab
3. Paste your API key in the Transport Victoria field
4. Click **Save**

---

## API Technical Details

### Endpoint Structure

Commute Compute uses the GTFS Realtime API:

```
Base URL: https://api.opendata.transport.vic.gov.au
Path:     /opendata/public-transport/gtfs/realtime/v1
```

### Authentication

```
Header: KeyId
Value:  your-api-key-here
```

**Note:** The header is `KeyId` (case-sensitive), not `Authorization` or `API-Key`.

### Available Feeds

| Feed | Description | Update Frequency |
|------|-------------|------------------|
| Trip Updates | Departures & delays | ~30 seconds |
| Service Alerts | Disruptions | ~1 minute |
| Vehicle Positions | Location tracking | ~15 seconds |

### Supported Modes

| Mode | Feed Prefix |
|------|-------------|
| Metro Train | `gtfsr_metro_train_*` |
| Tram | `gtfsr_yarra_trams_*` |
| Bus | `gtfsr_metro_bus_*` |
| V/Line | `gtfsr_vline_*` |

---

## Rate Limits

### Official Limits

| Tier | Requests/Second | Requests/Day |
|------|-----------------|--------------|
| Free | 10 | 10,000 |

### Commute Compute Usage

The system is designed to stay well within limits:

| Action | Frequency | Requests/Hour |
|--------|-----------|---------------|
| Device refresh | Every 60s | 60 |
| Cache refresh | Every 30s | 120 |

**Total:** ~180 requests/hour per device (well under limits)

---

## Data Format

### GTFS Realtime

The API returns data in **Protocol Buffer (protobuf)** format, which Commute Compute automatically decodes.

### Trip Update Structure

```javascript
{
  tripUpdate: {
    trip: {
      tripId: "123456",
      routeId: "1-SDM",
      directionId: 0
    },
    stopTimeUpdate: [
      {
        stopId: "19970",
        departure: {
          delay: 120,  // seconds late
          time: 1706849400
        }
      }
    ]
  }
}
```

### Delay Interpretation

| Delay Value | Meaning |
|-------------|---------|
| 0 | On time |
| > 0 | Late (seconds) |
| < 0 | Early (seconds) |
| null | No real-time data |

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid API key | Check key is correct |
| 403 Forbidden | Key not activated | Wait or contact support |
| 429 Too Many Requests | Rate limit exceeded | Reduce request frequency |
| 500 Server Error | API issue | Fallback to timetable |

### Fallback Behavior

When the API is unavailable, Commute Compute automatically:

1. Uses cached data (if available)
2. Falls back to static timetable data
3. Displays "TIMETABLE" indicator on dashboard

---

## Caching Strategy

Commute Compute caches API responses to:

- Reduce API calls
- Improve response times
- Handle temporary outages

| Data Type | Cache Duration |
|-----------|----------------|
| Trip Updates | 30 seconds |
| Service Alerts | 5 minutes |
| Static Data | 24 hours |

---

## Terms of Use

By using the Transport Victoria OpenData API, you agree to:

- Use data for non-commercial purposes (or obtain commercial license)
- Attribute data source appropriately
- Not redistribute raw data
- Comply with all applicable laws

See: [opendata.transport.vic.gov.au/terms](https://opendata.transport.vic.gov.au/)

---

## Attribution

Commute Compute displays the following attribution for transit data:

> Data provided by Transport Victoria OpenData  
> Licensed under CC BY 4.0

---

## Other States (Coming Soon)

Commute Compute is designed to support multiple Australian states:

| State | Authority | Status |
|-------|-----------|--------|
| Victoria | Transport Victoria | Supported |
| NSW | Transport for NSW | Planned |
| Queensland | TransLink | Planned |
| South Australia | Adelaide Metro | Planned |
| Western Australia | Transperth | Planned |

---

## Troubleshooting

### "API key not working"

1. Verify key is correct (no extra spaces)
2. Check key is active in your OpenData account
3. Test with curl:
   ```bash
   curl -H "KeyId: YOUR_KEY" \
     "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/gtfsr_metro_train_trip_updates"
   ```

### "No real-time data"

1. Verify API key is entered in Admin Panel
2. Check `/api/status` shows `dataMode: "Live"`
3. Ensure you're near transit stops with GTFS-RT coverage

### "Data seems stale"

1. Real-time updates every 30-60 seconds
2. Some routes may have limited real-time coverage
3. Check system time is correct

---

## Resources

| Resource | Link |
|----------|------|
| OpenData Portal | [opendata.transport.vic.gov.au](https://opendata.transport.vic.gov.au/) |
| GTFS-RT Spec | [gtfs.org/realtime](https://gtfs.org/realtime/) |
| API Documentation | Available after login |

---

© 2026 Commute Compute System by Angus Bergman — AGPL-3.0 Dual License
