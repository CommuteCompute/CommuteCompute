<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Google Places API Setup Guide

**Purpose**: Enhance address autocomplete with Google Places API for better cafe and business search results

**Date**: 2026-02-06
**System Version:** v4.2.0 (CCDashDesignV15.0)
**Optional**: Yes (system works without it, but with limited cafe search)

---

## Why Use Google Places API?

### Current Behaviour (Without Google API Key)

**Uses**: OpenStreetMap Nominatim API (free, no key needed)

**Good For**:
- [OK] Street addresses (e.g., "123 Main St")
- [OK] Suburbs and locations
- [OK] General geocoding

**Limited For**:
- [Limited] Cafe and business names (e.g., "Your Favourite Cafe")
- [Limited] POI (Points of Interest) search
- [Limited] Current/popular businesses

### Enhanced Behaviour (With Google API Key)

**Uses**: Google Places Autocomplete API (paid, requires key, free tier available)

**Excellent For**:
- [OK] Cafe and business names (e.g., "Your Favourite Cafe")
- [OK] Street addresses with numbers
- [OK] POI search (parks, stations, landmarks)
- [OK] Current business listings
- [OK] Multiple locations of same business
- [OK] Autocomplete suggestions as you type

### Comparison Example

**Search Query**: "market lane"

| Without Google | With Google |
|----------------|-------------|
| [OSM] Market St, Your City | [Google] Your Favourite Cafe |
| [OSM] Market Lane, Your Suburb | [Google] Your Favourite Cafe, Central Ave |
| [OSM] (Generic streets only) | [Google] Your Favourite Cafe, Side St |
|  | [Google] Your Favourite Cafe, multiple locations |

---

## Setup Instructions (5 minutes)

### Step 1: Create Google Cloud Project

1. **Go to Google Cloud Console**:
   - Visit: https://console.cloud.google.com/

2. **Create New Project** (or select existing):
   - Click "Select a project" → "New Project"
   - Project name: `Commute Compute™` (or your choice)
   - Click "Create"

### Step 2: Enable Places API (New)

1. **Navigate to APIs & Services**:
   - Go to: https://console.cloud.google.com/apis/library

2. **Search for "Places API (New)"**:
   - Search: `Places API`
   - Click on **Places API (New)** — NOT the legacy "Places API"

3. **Enable the API**:
   - Click "Enable"
   - Wait for activation (~30 seconds)

> **Important**: Use "Places API (New)", not the legacy version. The legacy API is being deprecated by Google.

### Step 3: Create API Key

1. **Go to Credentials**:
   - Navigate to: https://console.cloud.google.com/apis/credentials

2. **Create Credentials**:
   - Click "+ CREATE CREDENTIALS"
   - Select "API key"

3. **Copy Your API Key**:
   ```
   Example: AIzaSyBK2Xj9x_xxxxxxxxxxxxxxxxxxxxxxx
   ```
   - Click "Copy" to clipboard
   - **Keep this secure!**

### Step 4: Restrict API Key (Recommended)

1. **Click "Edit API key"** (or the key name)

2. **API Restrictions**:
   - Select "Restrict key"
   - Check only:
     - [OK] Places API
     - [OK] Geocoding API (optional, for fallback)

3. **Application Restrictions** (Optional but Recommended):
   - Select "IP addresses"
   - Add your server IP (Render provides this in dashboard)
   - Or select "HTTP referrers" and add your domain

4. **Save**

### Step 5: Add Your API Key

**Recommended: Setup Wizard / Admin Panel (Zero-Config)**

The preferred method is to enter your Google Places API key through the Setup Wizard or Admin Panel. This stores the key securely in Redis -- no environment files required.

1. Open your Admin Panel: `https://your-project.vercel.app/admin`
2. Navigate to **API Settings** tab
3. Enter your Google Places API key in the **Google Places** field
4. Click **Save**

The key is stored in Redis and takes effect immediately -- no redeployment needed.

**Alternative: Vercel Environment Variables**

If you prefer environment variables (e.g., for Render or Docker deployments):

1. Go to your hosting dashboard (Vercel, Render, etc.)
2. Navigate to **Environment Variables**
3. Add:
   ```
   Key:   GOOGLE_PLACES_API_KEY
   Value: AIzaSyBK2Xj9x_xxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Redeploy your service

**Important:** The correct variable name is `GOOGLE_PLACES_API_KEY` (not `GOOGLE_PLACES_KEY` or `GOOGLE_API_KEY`).

---

## Pricing (Free Tier Available)

### Google Places API Costs

**Free Tier** (per month):
- First **$200 credit** free (covers ~28,000 autocomplete requests)
- Renews monthly

**Autocomplete Pricing** (after free tier):
- Autocomplete (per session): $2.83 per 1000 requests
- Place Details: $17 per 1000 requests

**Typical Usage** for Commute Compute™:
- ~10 address searches per day = 300/month
- ~600 API calls/month (autocomplete + details)
- **Cost**: $0/month (well within free tier)

### Cost Calculator

Monthly address searches × 2 (autocomplete + details) = API calls

| Searches/Month | API Calls | Cost |
|----------------|-----------|------|
| 100 | 200 | $0 (free tier) |
| 500 | 1,000 | $0 (free tier) |
| 1,000 | 2,000 | $0 (free tier) |
| 5,000 | 10,000 | $0 (free tier) |
| 14,000 | 28,000 | $0 (free tier) |
| 15,000 | 30,000 | ~$6 |

**Note**: You'll likely never exceed the free tier for personal use.

---

## Verify It's Working

### Test 1: Check Server Logs

After adding the API key and redeploying:

```bash
# In Render dashboard → Logs, you should see:
Address search: "market lane"
  Using Google Places Autocomplete API
  Found 5 Google Places results
```

If no API key:
```bash
Address search: "market lane"
  No Google API key, using Nominatim
  Using OpenStreetMap Nominatim API
  Found 3 Nominatim results
```

### Test 2: Admin Panel Search

1. Open admin panel:
   ```
   https://your-server-name.vercel.app/admin
   ```

2. Click in "Preferred Cafe" field

3. Type: `market lane`

4. Check dropdown header:
   - **With Google**: `[Google] Powered by Google Places`
   - **Without Google**: `[OSM] Powered by OpenStreetMap` + tip message

### Test 3: API Endpoint

```bash
# Test endpoint directly
curl "https://your-server-name.vercel.app/admin/address/search?query=market+lane+coffee"
```

**With Google API Key**:
```json
{
  "success": true,
  "results": [
    {
      "display_name": "Your Favourite Cafe",
      "address": "Your Favourite Cafe",
      "full_address": "Shop 14/436 Main St, Your City, Australia",
      "lat": -37.8136,
      "lon": 144.9631,
      "type": "cafe",
      "importance": 1.0,
      "source": "google"
    }
  ],
  "count": 1,
  "source": "google"
}
```

**Without Google API Key**:
```json
{
  "success": true,
  "results": [
    {
      "display_name": "Market Lane, Your Suburb VIC, Australia",
      "address": "Market Lane",
      "full_address": "Market Lane, Your Suburb VIC 3205, Australia",
      "lat": -37.8299,
      "lon": 144.9559,
      "type": "road",
      "importance": 0.521,
      "source": "nominatim"
    }
  ],
  "count": 1,
  "source": "nominatim"
}
```

---

## Security Best Practices

### 1. Restrict Your API Key

**Never leave API key unrestricted!**

Restrict by:
- [OK] **API restrictions**: Only enable Places API
- [OK] **Application restrictions**: Add your server IP or domain
- [OK] **Usage quotas**: Set daily limits (e.g., 1000 requests/day)

### 2. Monitor Usage

Check usage regularly:
- Go to: https://console.cloud.google.com/apis/dashboard
- View "Metrics" tab
- Set up billing alerts (optional)

### 3. Rotate Keys Periodically

Every 6-12 months:
1. Create new API key
2. Update environment variable
3. Delete old key

---

## Troubleshooting

### API Key Not Working

**Symptoms**: Still seeing OpenStreetMap results

**Checks**:
1. Verify environment variable is set:
   ```bash
   # In Render dashboard → Environment
   # Should see: GOOGLE_PLACES_API_KEY = AIzaSy...
   ```

2. Check server logs for errors:
   ```bash
   # Should see:
   Using Google Places Autocomplete API

   # If error:
   [ERROR] Google Places error: API key not valid
   ```

3. Verify API is enabled:
   - Go to: https://console.cloud.google.com/apis/library
   - Search "Places API"
   - Should show "API enabled" in green

4. Check API key restrictions:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click your API key
   - Ensure "Places API" is checked under restrictions

### Getting "INVALID_REQUEST" Error

**Cause**: API key restrictions too strict

**Fix**:
1. Check IP restrictions match your server IP
2. Or use "HTTP referrers" restriction with your domain
3. Or temporarily remove restrictions for testing

### Getting "OVER_QUERY_LIMIT" Error

**Cause**: Exceeded free tier

**Fix**:
1. Check usage: https://console.cloud.google.com/apis/dashboard
2. Enable billing (optional)
3. Or reduce usage

### Billing Alerts Setup (Optional)

1. Go to: https://console.cloud.google.com/billing
2. Select your billing account
3. Click "Budgets & alerts"
4. Create budget:
   - Amount: $1/month
   - Alert threshold: 50%, 90%, 100%

---

## Fallback Behaviour

**System is designed to work without Google API key!**

```
1. User types in address field
   ↓
2. Server checks for GOOGLE_PLACES_API_KEY
   ↓
3. If present → Use Google Places Autocomplete
   ↓
4. If not present OR Google fails → Use OpenStreetMap Nominatim
   ↓
5. Return results to user
```

**Benefits**:
- [OK] No hard dependency on Google
- [OK] Graceful degradation
- [OK] System always works
- [OK] User sees helpful message suggesting Google API key

---

## Feature Comparison

| Feature | Without Google | With Google |
|---------|----------------|-------------|
| **Street addresses** | [OK] Good | [OK] Excellent |
| **Cafe/business names** | [Limited] Limited | [OK] Excellent |
| **POI search** | [Limited] Basic | [OK] Excellent |
| **Autocomplete quality** | [OSM] Moderate | [Google] Best-in-class |
| **Results freshness** | Static map data | Current businesses |
| **Setup complexity** | None | 5 minutes |
| **Cost** | Free | Free (with limits) |
| **API key needed** | No | Yes |

---

## Summary

### Quick Decision Guide

**Skip Google Places API if**:
- [OK] You only search street addresses
- [OK] You don't mind limited cafe search
- [OK] You want zero setup

**Use Google Places API if**:
- [OK] You search for cafes by name
- [OK] You want best autocomplete experience
- [OK] You're OK with 5-minute setup
- [OK] You want current business listings

### Recommendation

**For best experience**: Add Google Places API key
**Time**: 5 minutes
**Cost**: $0/month (typical usage)
**Benefit**: Much better cafe and business search

---

## Useful Links

| Resource | URL |
|----------|-----|
| **Google Cloud Console** | https://console.cloud.google.com/ |
| **Places API Documentation** | https://developers.google.com/maps/documentation/places/web-service/autocomplete |
| **API Key Best Practices** | https://cloud.google.com/docs/authentication/api-keys |
| **Pricing Calculator** | https://mapsplatform.google.com/pricing/ |
| **Usage Dashboard** | https://console.cloud.google.com/apis/dashboard |

---

**Last Updated**: 2026-02-06
**Status**: Production Ready
**Optional**: Yes (system works without it)

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual Licence
