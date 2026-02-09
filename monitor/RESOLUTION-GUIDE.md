<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute System™ - Endpoint Monitor Resolution Guide

Comprehensive troubleshooting guide for all monitored endpoints, pages, and data flows.

---

## Quick Reference: Common Failures

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| All endpoints 5xx | Vercel deployment failed | Redeploy: `vercel --prod` |
| Screen/zones returning 400 | Missing config token | Add `?token=` parameter |
| Canvas errors in logs | @napi-rs/canvas failed | Check memory limits, redeploy |
| Transit data stale | GTFS-RT API down | Check API key, fallback kicks in |
| Weather shows "N/A" | BOM API unavailable | Usually transient, wait |
| Address search fails | All geocoding services down | Check Nominatim (last resort) |

---

## API Endpoints

### `/api/health` - System Health Check

**Expected behavior:** Returns 200 with JSON `{ status: "ok" }`

**Failure symptoms:**
- 500 Internal Server Error
- Timeout
- Connection refused

**Resolution steps:**

1. **Check Vercel deployment status**
   ```bash
   vercel ls
   vercel logs <deployment-url>
   ```

2. **Verify function exists**
   ```bash
   ls -la api/health.js
   ```

3. **Check for syntax errors**
   ```bash
   node -c api/health.js
   ```

4. **Redeploy if needed**
   ```bash
   vercel --prod
   ```

5. **Check Vercel function logs** at https://vercel.com/dashboard → Project → Logs

---

### `/api/screen` - Full Dashboard PNG Render

**Expected behavior:** Returns 200 with `image/png` content type, 800×480 PNG image

**Critical endpoint** - This is what TRMNL devices fetch

**Failure symptoms:**
- 400 Bad Request (no token)
- 500 with canvas errors
- Timeout (>30s)
- Corrupted/empty image

**Resolution steps:**

1. **Missing token (400)**
   - Ensure URL includes `?token=<config_token>`
   - Validate token format: Base64URL encoded JSON
   - Decode and check: `echo <token> | base64 -d`

2. **Canvas initialization failure (500)**
   ```
   Check Vercel logs for:
   - "Canvas not initialized"
   - "Failed to register font"
   - Memory allocation errors
   ```

   **Fix:** Increase function memory in `vercel.json`:
   ```json
   {
     "functions": {
       "api/screen.js": {
         "memory": 1024
       }
     }
   }
   ```

3. **Font loading issues**
   - Verify fonts exist in `public/fonts/`
   - Check font paths in `ccdash-renderer-v13.js`
   - Ensure fonts are included in deployment

4. **Transit data timeout**
   - GTFS-RT API may be slow
   - System should fallback to timetables
   - Check `src/services/opendata-client.js`

5. **Test locally:**
   ```bash
   cd /path/to/commute-compute
   node src/server.js
   curl "http://localhost:3000/api/screen?token=<token>" > test.png
   open test.png
   ```

---

### `/api/zones` - Zone-Based Partial Refresh

**Expected behavior:** Returns JSON with zone metadata and 1-bit BMP data

**Failure symptoms:**
- Zone boundaries incorrect
- BMP encoding errors
- Changed zones not detected

**Resolution steps:**

1. **Verify CCDashDesignV15.0 spec compliance**
   - Zone boundaries are LOCKED per `DEVELOPMENT-RULES.md`
   - Check `specs/CCDashDesignV15.md` (V15.0) for exact coordinates

2. **BMP encoding issues**
   - 1-bit BMP only (no grayscale)
   - Check `src/services/zone-renderer.js`
   - Verify BMP header generation

3. **Change detection failing**
   - Review zone diff logic in `src/journey-display/diff.js`
   - Check caching behavior

---

### `/api/address-search` - Geocoding Service

**Expected behavior:** Returns geocoded addresses with coordinates

**Uses cascading fallbacks:** Google → Mapbox → HERE → Foursquare → LocationIQ → Nominatim

**Failure symptoms:**
- All services returning errors
- Rate limiting
- Empty results

**Resolution steps:**

1. **Check cascade order in `src/services/geocoding-service.js`**

2. **Test Nominatim directly (always free):**
   ```bash
   curl "https://nominatim.openstreetmap.org/search?q=Melbourne&format=json&limit=1"
   ```

3. **Rate limiting:**
   - Nominatim: 1 request/second
   - Google: Quota limits apply
   - Add backoff logic if needed

4. **If all services fail:**
   - Check network connectivity
   - Verify API keys if using premium services
   - Check each service's status page

---

## HTML Pages

### `/admin.html` - Admin Panel (319KB)

**Failure symptoms:**
- Page loads but JS errors
- Blank white screen
- Slow loading

**Resolution steps:**

1. **Check browser console for errors**
   - F12 → Console tab
   - Look for JavaScript errors

2. **Large file considerations:**
   - May timeout on slow connections
   - Consider code splitting for optimization

3. **Test locally:**
   ```bash
   cd public && python3 -m http.server 8000
   # Open http://localhost:8000/admin.html
   ```

---

### `/preview.html` - Dashboard Preview

**Failure symptoms:**
- Preview not rendering
- "Failed to fetch" errors
- Canvas errors

**Resolution steps:**

1. **Check `/api/screen` endpoint first** - preview depends on it

2. **CORS issues:**
   - Verify CORS headers in API responses
   - Check `vercel.json` for header configuration

3. **Browser canvas support:**
   - Test in different browser
   - Check for canvas security restrictions

---

## External APIs

### Transport Victoria GTFS-RT

**Endpoints:**
- `api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates`
- `/tram/trip-updates`
- `/bus/trip-updates`

**Failure symptoms:**
- 401 Unauthorized
- 429 Rate Limited
- 500/503 Server Error

**Resolution steps:**

1. **API key issues (401):**
   - Verify key at https://data.vic.gov.au
   - Key format: UUID (e.g., `12345678-1234-1234-1234-123456789abc`)
   - Header: `KeyId: <your-key>`

2. **Rate limiting (429):**
   - Default: 100 requests/minute
   - Implement caching (system caches for 5 minutes)

3. **Server errors (5xx):**
   - Usually transient
   - System falls back to static timetables
   - Check PTV Twitter for service announcements

4. **Fallback behavior:**
   - When API unavailable, `fallback-timetables.js` provides static data
   - Dashboard shows "Scheduled" instead of "Live"

---

### Bureau of Meteorology (BOM)

**Endpoint:** `http://www.bom.gov.au/fwo/IDV60901/IDV60901.94868.json`

**Failure symptoms:**
- 404 Not Found
- Timeout
- Invalid JSON

**Resolution steps:**

1. **Station ID changed:**
   - Verify current station IDs at bom.gov.au
   - Update in `src/services/weather-bom.js`

2. **Timeout:**
   - BOM servers can be slow
   - Increase timeout in weather service
   - Add retry logic

3. **Fallback:**
   - Dashboard shows "Weather unavailable"
   - Non-critical - doesn't block rendering

---

### OpenStreetMap Nominatim

**Endpoint:** `https://nominatim.openstreetmap.org/search`

**This is the last-resort geocoding fallback**

**Failure symptoms:**
- 429 Rate Limited
- Timeout
- Empty results

**Resolution steps:**

1. **Rate limiting:**
   - Strict 1 request/second limit
   - Add User-Agent header (required)
   - Implement proper delays

2. **Timeout:**
   - Public servers can be slow
   - Consider self-hosting Nominatim for production

3. **Empty results:**
   - Try more specific queries
   - Check query encoding

---

## Data Flow Issues

### Transit Data → Dashboard Render

**Flow:** GTFS-RT API → opendata-client.js → SmartJourneyEngine → ccdash-renderer-v13.js

**Symptoms:**
- Dashboard shows stale data
- "No departures" when service running
- Wrong train/tram times

**Debugging:**

1. **Check raw API response:**
   ```bash
   curl -H "KeyId: <api-key>" \
     "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates"
   ```

2. **Verify protobuf parsing:**
   - Check `src/services/opendata-client.js`
   - Ensure `gtfs-realtime-bindings` is installed

3. **Journey engine:**
   - Check `src/core/smart-journey-engine.js`
   - Verify route discovery logic

4. **Renderer:**
   - Check `src/services/ccdash-renderer-v13.js`
   - Verify data passed to render functions

---

### Config Token Flow

**Flow:** Setup Wizard → generate-webhook → token encoded → all endpoints decode

**Symptoms:**
- All token endpoints returning 400
- "Invalid token" errors
- Missing data on dashboard

**Debugging:**

1. **Decode token manually:**
   ```bash
   echo "<token>" | base64 -d | jq .
   ```

2. **Expected structure:**
   ```json
   {
     "a": { "home": "...", "work": "...", "cafe": "..." },
     "l": { "home": {...}, "work": {...}, "cafe": {...} },
     "t": "09:00",
     "c": true,
     "s": "VIC",
     "k": "api-key-uuid"
   }
   ```

3. **Check encoder/decoder:**
   - `src/utils/config-token.js`
   - Ensure Base64URL encoding (not standard Base64)

---

## Vercel-Specific Issues

### Cold Start Timeouts

**Symptoms:**
- First request after idle takes >10s
- Intermittent 504 timeouts

**Resolution:**
- Vercel free tier has cold starts
- Consider Pro plan for always-on
- Implement warm-up pings

### Memory Limits

**Symptoms:**
- "Runtime exited with error: signal: killed"
- "Out of memory" in logs

**Resolution:**
1. Check function memory in `vercel.json`
2. Increase to 1024MB or 3008MB (max)
3. Optimize canvas operations
4. Add memory profiling

### Build Failures

**Symptoms:**
- Deployment fails
- "Build exceeded time limit"

**Resolution:**
1. Check build logs in Vercel dashboard
2. Simplify build process
3. Pre-compile heavy dependencies

---

## Emergency Recovery

### Complete System Failure

If all endpoints are down:

1. **Check Vercel status:** https://www.vercel-status.com
2. **Redeploy:**
   ```bash
   git push origin main  # Triggers redeploy
   # or
   vercel --prod
   ```
3. **Check GitLab repo for recent changes**
4. **Rollback if needed:**
   ```bash
   vercel rollback
   ```

### Data Source Blackout

If all external APIs fail:

1. **Dashboard will use fallback timetables**
2. **Weather shows "unavailable"**
3. **System remains functional but with static data**
4. **Monitor external service status pages:**
   - PTV: Check Twitter @ptaborig
   - BOM: http://www.bom.gov.au
   - OSM: https://status.openstreetmap.org

---

## Monitoring Best Practices

1. **Run monitor continuously:**
   ```bash
   node monitor/monitor.js --continuous
   ```

2. **Watch mode for terminal dashboard:**
   ```bash
   node monitor/dashboard-monitor.js
   ```

3. **Generate reports for analysis:**
   ```bash
   node monitor/monitor.js --report
   ```

4. **Set up alerts:**
   - Consider integrating with Slack/Discord webhooks
   - Use external monitoring (UptimeRobot, Better Uptime)

5. **Regular health checks:**
   - Run full check daily
   - Review response times weekly
   - Test data flows after deployments

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
