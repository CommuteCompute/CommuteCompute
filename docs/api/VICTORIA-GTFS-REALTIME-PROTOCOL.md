<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Victorian Transport - GTFS Realtime API Protocol
**For Commute Compute Users in Victoria**
**Date**: 2026-02-06
**System Version:** v5.0.0 (CCDashDesignV16.0)
**Status**: OFFICIAL PROTOCOL FOR VICTORIAN USERS

---

## Overview

This protocol provides complete instructions for Victorian users to access **real-time metro train data** from Transport Victoria's official OpenData portal.

**Important**: This is a **NEW API endpoint** separate from the Transport Victoria Timetable API documented in OPENDATA-VIC-API-GUIDE.md.

---

## API Specifications

### Base Information
- **Provider**: Transport Victoria / OpenData Portal
- **API Name**: GTFS Realtime Metro Train Trip Updates
- **Protocol**: GTFS Realtime (Protocol Buffers)
- **Coverage**: Melbourne Metro Trains Only
- **Update Frequency**: Real-time (30-second cache)

### Endpoints

**Base URL**:
```
https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro
```

**Available Endpoint**:
```
GET /trip-updates
```

**Full URL**:
```
https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates
```

---

## Authentication

### VERIFIED WORKING METHOD

#### HTTP Header Authentication (ONLY METHOD THAT WORKS)
```http
GET /trip-updates HTTP/1.1
Host: api.opendata.transport.vic.gov.au
KeyId: YOUR_API_KEY_HERE
Accept: */*
```

**Critical Details**:
- Header name: `KeyId` (case-sensitive - must use exact capitalization)
- Value: Your UUID format API Key (36 characters with dashes)
- Accept header: `*/*` or `application/octet-stream`

### How to Get Your API Key

1. Visit: https://opendata.transport.vic.gov.au/
2. Create an account or sign in
3. Navigate to your profile/API keys section
4. Copy your **API Key** (UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

**IMPORTANT**:
- The portal shows **TWO** credentials: "API Key" and "API Token"
- **ONLY the API Key (UUID format) is used**
- The API Token (JWT format) is NOT used for GTFS Realtime feeds
- Do NOT use `Ocp-Apim-Subscription-Key` header (returns 401 error)
- Do NOT use query parameters (returns 401 error)

---

## Response Format

### Protocol Buffers (Not JSON)

The API returns data in **Protocol Buffer format** (binary), not human-readable JSON.

**What this means**:
- You need a GTFS Realtime protobuf library to parse responses
- Raw response looks like binary gibberish
- Must decode using `.proto` schema files

### Data Structure (After Decoding)

```protobuf
FeedMessage {
  header {
    gtfs_realtime_version: "2.0"
    timestamp: 1706198400
  }
  entity [
    {
      id: "trip_12345"
      trip_update {
        trip {
          trip_id: "12345.CITY.1-CFY-mjp-1.1.H"
          route_id: "1-CFY"
          start_date: "20260125"
        }
        stop_time_update [
          {
            stop_sequence: 1
            stop_id: "19854"
            arrival {
              delay: 120  // seconds
              time: 1706198520
            }
            departure {
              delay: 120
              time: 1706198540
            }
          }
        ]
      }
    }
  ]
}
```

### What Data You Get

**Included**:
- [OK] Real-time arrival times
- [OK] Real-time departure times
- [OK] Delay information (in seconds)
- [OK] Trip IDs and route IDs
- [OK] Stop sequences
- [OK] Cancellation status

**NOT Included**:
- [N/A] Train replacement buses
- [N/A] Platform numbers
- [N/A] Route changes/deviations
- [N/A] Skipped stops (use Service Alerts feed instead)

---

## Rate Limits & Performance

### Rate Limiting
- **Limit**: 20-27 calls per minute (varies by response size)
- **Exceeded Limit**: HTTP 429 (Too Many Requests)
- **Reset**: 1 minute window

### Caching
- **Server-side Cache**: 30 seconds
- **Recommendation**: Don't poll faster than every 30 seconds
- **Optimal Polling**: Every 1-2 minutes for real-time updates

### Performance Tips
```javascript
// Good: Poll every 60 seconds
setInterval(fetchTripUpdates, 60000);

// Bad: Poll every 5 seconds (will hit rate limit)
setInterval(fetchTripUpdates, 5000); // DO NOT DO THIS
```

---

## Implementation Guide

### Step 1: Install GTFS Realtime Library

**For Node.js**:
```bash
npm install gtfs-realtime-bindings
```

**For Python**:
```bash
pip install gtfs-realtime-bindings
```

### Step 2: Fetch and Decode Data

**Node.js Example**:
```javascript
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import fetch from 'node-fetch';

async function fetchVictorianTripUpdates(apiKey) {
  const url = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates';

  try {
    const response = await fetch(url, {
      headers: {
        'KeyId': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get binary data
    const buffer = await response.arrayBuffer();

    // Decode Protocol Buffer
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    console.log(`Received ${feed.entity.length} trip updates`);
    console.log(`Feed timestamp: ${new Date(feed.header.timestamp * 1000)}`);

    // Process each trip update
    feed.entity.forEach(entity => {
      if (entity.tripUpdate) {
        const trip = entity.tripUpdate.trip;
        console.log(`Trip ${trip.tripId} on route ${trip.routeId}`);

        entity.tripUpdate.stopTimeUpdate.forEach(stopUpdate => {
          console.log(`  Stop ${stopUpdate.stopId}: ${stopUpdate.arrival.delay}s delay`);
        });
      }
    });

    return feed;
  } catch (error) {
    console.error('Error fetching GTFS Realtime data:', error);
    throw error;
  }
}

// Usage
const API_KEY = 'your-subscription-key-here';
fetchVictorianTripUpdates(API_KEY);
```

**Python Example**:
```python
from google.transit import gtfs_realtime_pb2
import requests

def fetch_victorian_trip_updates(api_key):
    url = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates'

    headers = {
        'KeyId': api_key
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    # Parse Protocol Buffer
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(response.content)

    print(f"Received {len(feed.entity)} trip updates")
    print(f"Feed timestamp: {feed.header.timestamp}")

    for entity in feed.entity:
        if entity.HasField('trip_update'):
            trip = entity.trip_update.trip
            print(f"Trip {trip.trip_id} on route {trip.route_id}")

            for stop_update in entity.trip_update.stop_time_update:
                delay = stop_update.arrival.delay
                print(f"  Stop {stop_update.stop_id}: {delay}s delay")

    return feed

# Usage
API_KEY = 'your-subscription-key-here'
fetch_victorian_trip_updates(API_KEY)
```

### Step 3: Extract Useful Information

**Calculate Actual Arrival Time**:
```javascript
function getActualArrivalTime(stopUpdate) {
  // Method 1: Use provided time
  if (stopUpdate.arrival && stopUpdate.arrival.time) {
    return new Date(stopUpdate.arrival.time * 1000);
  }

  // Method 2: Calculate from scheduled time + delay
  if (stopUpdate.arrival && stopUpdate.arrival.delay) {
    const scheduledTime = getScheduledTime(stopUpdate.stopId); // From GTFS static data
    return new Date(scheduledTime.getTime() + (stopUpdate.arrival.delay * 1000));
  }

  return null;
}
```

**Check if Trip is Cancelled**:
```javascript
function isTripCancelled(tripUpdate) {
  return tripUpdate.trip &&
         tripUpdate.trip.scheduleRelationship ===
         GtfsRealtimeBindings.transit_realtime.TripDescriptor.ScheduleRelationship.CANCELED;
}
```

---

## Integration with Commute Compute(TM)

### Current Setup
Commute Compute currently uses:
- **Transport Victoria Timetable API** for scheduled departures
- **HMAC-SHA1 authentication** with Developer ID + API Key

### Adding GTFS Realtime
This new endpoint provides:
- **Real-time delays** (not available in Timetable API)
- **Trip cancellations**
- **More accurate arrival predictions**

### Recommended Architecture

```
┌─────────────────────────────────────────────┐
│         Commute Compute System                    │
├─────────────────────────────────────────────┤
│                                             │
│  1. Transport Victoria Timetable API (HMAC)            │
│     → Scheduled departures                  │
│     → Route information                     │
│     → Stop locations                        │
│                                             │
│  2. GTFS Realtime API (New)                │
│     → Real-time delays                      │
│     → Trip cancellations                    │
│     → Accurate predictions                  │
│                                             │
│  3. Combine Both Sources                    │
│     → Display scheduled time (from API v3)  │
│     → Show delay/actual time (from GTFS RT) │
│     → Mark cancelled trips (from GTFS RT)   │
│                                             │
└─────────────────────────────────────────────┘
```

### Configuration in Commute Compute

**New environment variable needed**:
```env
# In .env file
VICTORIA_GTFS_REALTIME_KEY=your-subscription-key-here
```

**Where to add in admin.html**:
- Configuration tab → Victorian users only
- New section: "GTFS Realtime Integration"
- Input field for subscription key
- Test button to verify connection

---

## Data Viewer Integration

### Embedded Viewer for Victorian Users

Add this iframe to admin page when user's state is Victoria:

```html
<div id="victoria-gtfs-viewer" style="display: none;">
  <div class="card" style="margin-top: 20px;">
    <div class="card-header">
      <span class="card-icon">[Train]</span>
      <h2>Live GTFS Realtime Data Viewer (Victoria)</h2>
    </div>
    <p style="margin-bottom: 15px; opacity: 0.9; font-size: 14px;">
      Real-time trip updates from Transport Victoria's OpenData portal
    </p>
    <iframe
      title="Data viewer"
      width="100%"
      height="400"
      src="https://opendata.transport.vic.gov.au/dataset/gtfs-realtime/resource/0010d606-47bf-4abb-a04f-63add63a4d23/view/07d75c4f-db6f-444d-97d8-22082ab0a0ca"
      frameBorder="0"
      style="border-radius: 8px; background: white;">
    </iframe>
    <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">
      <strong>Data Source:</strong>
      <a href="https://opendata.transport.vic.gov.au/dataset/gtfs-realtime" target="_blank" style="color: #667eea;">
        Transport Victoria OpenData Portal
      </a>
    </p>
  </div>
</div>

<script>
// Show viewer only for Victorian users
function updateVictorianDataViewer(userState) {
  const viewer = document.getElementById('victoria-gtfs-viewer');
  if (viewer && userState === 'VIC') {
    viewer.style.display = 'block';
  } else if (viewer) {
    viewer.style.display = 'none';
  }
}

// Call when state is detected
updateVictorianDataViewer(preferences.location.state);
</script>
```

---

## Comparison: Legacy Timetable API vs GTFS Realtime

| Feature | Transport Victoria Timetable API | GTFS Realtime |
|---------|---------------------|---------------|
| **Authentication** | HMAC-SHA1 signature | Simple API key |
| **Response Format** | JSON | Protocol Buffers |
| **Data Type** | Scheduled timetables | Real-time updates |
| **Delay Information** | [N/A] No | [OK] Yes (seconds) |
| **Cancellations** | Limited | [OK] Full support |
| **Complexity** | High (HMAC signing) | Low (simple key) |
| **Update Frequency** | Static schedules | Real-time (30s cache) |
| **Rate Limit** | Generous | 20-27 calls/min |
| **Coverage** | All PT modes | Metro trains only |
| **Platform Numbers** | [OK] Yes | [N/A] No |
| **Stop Search** | [OK] Yes | [N/A] No |

**Recommendation**: Use **both APIs together** for best results.

---

## Common Issues & Solutions

### Issue 1: Binary Response (Unreadable)
**Problem**: Response looks like gibberish
```
\x1a\x02...\x0a\x12...
```

**Solution**: Must decode with protobuf library
```javascript
// Don't do this:
const data = await response.json(); // WRONG - Will fail

// Do this:
const buffer = await response.arrayBuffer(); // CORRECT
const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
  new Uint8Array(buffer)
);
```

### Issue 2: Rate Limit Exceeded
**Error**: HTTP 429 Too Many Requests

**Solution**: Implement rate limiting and caching
```javascript
let lastFetch = 0;
const CACHE_DURATION = 60000; // 1 minute
let cachedData = null;

async function fetchWithCache(apiKey) {
  const now = Date.now();

  if (cachedData && (now - lastFetch) < CACHE_DURATION) {
    return cachedData; // Return cached data
  }

  cachedData = await fetchVictorianTripUpdates(apiKey);
  lastFetch = now;
  return cachedData;
}
```

### Issue 3: No Data for My Trip
**Problem**: Feed doesn't include the trip I'm looking for

**Reason**: GTFS Realtime only includes trips with updates (delays/cancellations)

**Solution**: Fall back to scheduled data from Legacy Timetable API
```javascript
function getCombinedTripInfo(tripId, apiKey) {
  // Try GTFS Realtime first
  const realtimeData = await fetchGTFSRealtime(apiKey);
  const realtimeTrip = realtimeData.entity.find(e =>
    e.tripUpdate && e.tripUpdate.trip.tripId === tripId
  );

  if (realtimeTrip) {
    return realtimeTrip; // Has real-time updates
  }

  // Fall back to scheduled data
  return await fetchScheduledData(tripId);
}
```

---

## Checklist for Victorian Users

### Initial Setup
- [ ] Create account on https://opendata.transport.vic.gov.au/
- [ ] Generate subscription key (API key)
- [ ] Install `gtfs-realtime-bindings` package
- [ ] Test connection with sample code
- [ ] Verify response decoding works

### Integration with Commute Compute
- [ ] Add `VICTORIA_GTFS_REALTIME_KEY` to .env
- [ ] Update admin page to show GTFS viewer (Victorian users only)
- [ ] Implement real-time delay display
- [ ] Add cancellation indicators
- [ ] Set up caching (60-second intervals)
- [ ] Test rate limit handling

### Ongoing Maintenance
- [ ] Monitor rate limit usage
- [ ] Check for API updates quarterly
- [ ] Validate data accuracy monthly
- [ ] Review error logs weekly

---

## Additional Resources

### Official Documentation
- **OpenData Portal**: https://opendata.transport.vic.gov.au/
- **GTFS Realtime Dataset**: https://opendata.transport.vic.gov.au/dataset/gtfs-realtime
- **OpenAPI Specification**: https://opendata.transport.vic.gov.au/dataset/2d9a7228-5b81-40d3-8075-ae7a3da42198/resource/0010d606-47bf-4abb-a04f-63add63a4d23/download/gtfsr_metro_train_trip_updates.openapi.json

### GTFS Realtime Reference
- **Official Specification**: https://developers.google.com/transit/gtfs-realtime
- **Protocol Buffer Guide**: https://developers.google.com/protocol-buffers
- **Trip Updates Reference**: https://developers.google.com/transit/gtfs-realtime/reference#message-tripupdate

### Code Libraries
- **Node.js**: https://www.npmjs.com/package/gtfs-realtime-bindings
- **Python**: https://pypi.org/project/gtfs-realtime-bindings/
- **Java**: https://github.com/google/gtfs-realtime-bindings/tree/master/java

---

## Security Best Practices

### API Key Storage
```javascript
// CORRECT: Environment variable
const GTFS_KEY = process.env.VICTORIA_GTFS_REALTIME_KEY;

// WRONG: Hardcoded in code
const GTFS_KEY = 'abc123def456...'; // WRONG - NEVER DO THIS
```

### Client-Side Protection
```javascript
// CORRECT: Proxy through your server
app.get('/api/victoria/realtime', async (req, res) => {
  const key = process.env.VICTORIA_GTFS_REALTIME_KEY;
  const data = await fetchVictorianTripUpdates(key);
  res.send(data);
});

// WRONG: Expose key to client
<script>
  const GTFS_KEY = '<?= $api_key ?>'; // Visible in browser
</script>
```

### Key Rotation
- Regenerate keys every 90 days
- Store old keys for 7 days (transition period)
- Update all environments simultaneously

---

## Support & Contact

### Technical Issues
- **OpenData Support**: Via portal contact form
- **GTFS Specification**: Google GTFS Realtime community
- **Commute Compute Issues**: GitLab repository

### Related Documents
- **Transport Victoria Timetable API**: See `OPENDATA-VIC-API-GUIDE.md`
- **System Architecture**: See `SYSTEM-ARCHITECTURE.md`
- **Deployment Guide**: See `docs/deployment/DEPLOYMENT-v2.5.0-COMPLETE.md`

---

**Protocol Version**: 1.1
**Last Updated**: 2026-02-06
**Applies To**: Commute Compute(TM) v5.0.0+ (CCDashDesignV16.0)
**Region**: Victoria, Australia Only

**Status**: VERIFIED & PRODUCTION READY

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual Licence
