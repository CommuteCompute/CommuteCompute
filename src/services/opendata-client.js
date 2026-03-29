// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system

/**
 * CommuteCompute™ OpenData Client
 * Part of the Commute Compute System™
 *
 * State-aware GTFS-RT client supporting multiple Australian transit authorities.
 * VIC: Transport Victoria OpenData API (GTFS-RT Protobuf)
 * NSW: Transport for NSW Open Data (GTFS-RT Protobuf)
 * QLD: TransLink Queensland (GTFS-RT Protobuf)
 * SA/WA/TAS/NT/ACT: No GTFS-RT available — graceful degradation to timetable only.
 *
 * Per DEVELOPMENT-RULES Section 1.3 and 11.1:
 * - VIC Base URL: https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1
 * - VIC Auth: KeyId + Ocp-Apim-Subscription-Key headers with UUID format API key
 * - Format: GTFS Realtime (Protobuf) — standard across all supported states
 *
 * Uses Open-Meteo for weather (free, no API key required).
 *
 * THIRD-PARTY DATA ATTRIBUTION:
 * - Transit data: State transit authority open data (see STATE_API_CONFIG)
 * - Weather data: Open-Meteo API (free tier)
 * 
 * Copyright (c) 2025-2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getTransitApiKey } from '../data/kv-preferences.js';
import { VIC_METRO_STATIONS, getPlatformIds, VIC_TRAM_STOPS_WITH_COORDS } from '../data/vic/gtfs-reference.js';
import { haversine } from '../utils/haversine.js';

// State-aware transit API configuration
// Each state with GTFS-RT support defines: baseUrl, auth headers, and mode mapping.
// States absent from this map (SA, WA, TAS, NT, ACT) have no GTFS-RT — graceful degradation.
const STATE_API_CONFIG = {
  VIC: {
    baseUrl: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1',
    makeHeaders: (apiKey) => ({
      'Ocp-Apim-Subscription-Key': apiKey,  // Azure APIM standard
      'KeyId': apiKey,                       // Portal-documented header — dual for robustness
      'Accept': 'application/x-protobuf'
    }),
    modeMap: { 0: 'metro', 1: 'tram', 2: 'bus', 3: 'vline' }
  },
  NSW: {
    baseUrl: 'https://api.transport.nsw.gov.au/v1/gtfs/realtime',
    makeHeaders: (apiKey) => ({
      'Authorization': `apikey ${apiKey}`,
      'Accept': 'application/x-protobuf'
    }),
    // Mode 1 (tram) → lightrail for Sydney Light Rail; mode 3 (vline) → sydneytrains
    modeMap: { 0: 'sydneytrains', 1: 'lightrail', 2: 'buses', 3: 'sydneytrains', 4: 'ferries', 5: 'lightrail' }
  },
  QLD: {
    baseUrl: 'https://gtfsrt.api.translink.com.au/api/realtime/SEQ',
    makeHeaders: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/x-protobuf'
    }),
    // SEQ is a unified feed — all modes route to same endpoint
    modeMap: { 0: 'SEQ', 1: 'SEQ', 2: 'SEQ', 3: 'SEQ', 4: 'SEQ' }
  }
};

// VIC base URL retained as default fallback
const API_BASE = STATE_API_CONFIG.VIC.baseUrl;

// Melbourne coordinates (default)
const MELBOURNE_LAT = -37.8136;
const MELBOURNE_LON = 144.9631;

// Melbourne Metro line names (GTFS route ID suffix → line name)
// Exported for train line code passthrough in api/screen.js
export const METRO_LINE_NAMES = {
  'SHM': 'Sandringham', 'SAM': 'Sandringham', 'FKN': 'Frankston', 'PKM': 'Pakenham',
  'CBE': 'Cranbourne', 'BEG': 'Belgrave', 'LIL': 'Lilydale', 'GWY': 'Glen Waverley',
  'ALM': 'Alamein', 'HBE': 'Hurstbridge', 'SUY': 'Sunbury', 'CGB': 'Craigieburn',
  'UFD': 'Upfield', 'WER': 'Werribee', 'WIL': 'Williamstown', 'MDD': 'Mernda'
};

// V/Line regional line names (GTFS route ID suffix → line name)
const VLINE_LINE_NAMES = {
  'GEL': 'Geelong', 'BAL': 'Ballarat', 'BEN': 'Bendigo', 'GIP': 'Gippsland',
  'SEY': 'Seymour', 'ART': 'Ararat', 'MBR': 'Maryborough', 'SWH': 'Swan Hill',
  'ECH': 'Echuca', 'ALB': 'Albury', 'WAR': 'Warrnambool', 'TRA': 'Traralgon',
  'BAW': 'Bairnsdale', 'EPC': 'Epsom', 'SHE': 'Shepparton'
};

/**
 * Inner-city station stop IDs for direction detection.
 * Includes City Loop, Flinders Street, Richmond, and Metro Tunnel stations.
 * Metro Tunnel (opened 2025): Pakenham/Cranbourne/Sunbury/Craigieburn/Upfield
 * lines now run through Arden, Parkville, State Library, Town Hall, Anzac —
 * no longer via City Loop.
 * Richmond is included as the gateway between suburban and inner-city stops.
 */
// City Loop: Parliament (PAR), Melbourne Central (MCE), Flagstaff (FGS),
// Southern Cross (SSS), Flinders Street (FSS) — all platform IDs from verified GTFS
const CITY_LOOP_STOP_IDS = getPlatformIds('PAR', 'MCE', 'FGS', 'SSS', 'FSS');

// Metro Tunnel: Arden (ARN), Parkville (PKV), State Library (STL),
// Town Hall (THL), Anzac (AZC) — all platform IDs from verified GTFS
const METRO_TUNNEL_STOP_IDS = getPlatformIds('ARN', 'PKV', 'STL', 'THL', 'AZC');

// Richmond (RMD) — gateway to city for SE lines
const INNER_CITY_STOP_IDS = new Set([
  ...CITY_LOOP_STOP_IDS, ...METRO_TUNNEL_STOP_IDS,
  ...VIC_METRO_STATIONS.RMD.platforms
]);

/**
 * Metro Tunnel line codes (GTFS route ID suffixes).
 * These lines run through Metro Tunnel, NOT City Loop.
 * Per ARCHITECTURE.md Section 12.2 and specs/CCDashDesignV15.md Section 8.2.
 */
const METRO_TUNNEL_LINE_CODES = new Set([
  'PKM',  // Pakenham
  'CBE',  // Cranbourne
  'SUY',  // Sunbury
  'CGB',  // Craigieburn
  'UFD'   // Upfield
]);

function isCityLoopStop(stopId) {
  if (!stopId) return false;
  return CITY_LOOP_STOP_IDS.has(String(stopId));
}

/**
 * Determine if a train is citybound relative to the user's stop position.
 * Checks if any inner-city stop appears AFTER the user's stop in the trip sequence.
 * Handles both City Loop and Metro Tunnel through-running services.
 *
 * @param {Array} stops - Trip's stopTimeUpdate array (ordered by sequence)
 * @param {number} userStopIndex - Index of user's stop in the sequence
 * @returns {boolean} - True if train is heading towards the city
 */
function isTrainCitybound(stops, userStopIndex) {
  if (userStopIndex < 0 || !stops?.length) {
    // Fallback: check final stop against City Loop
    const finalStop = stops?.[stops.length - 1]?.stopId || '';
    return isCityLoopStop(finalStop);
  }
  // City stop appears after user's stop = train is heading towards the city
  for (let i = userStopIndex + 1; i < stops.length; i++) {
    if (INNER_CITY_STOP_IDS.has(String(stops[i].stopId))) return true;
  }
  return false;
}

/**
 * Extract human-readable line name from GTFS route ID
 * e.g., "aus:vic:vic-02-SHM:" → "Sandringham"
 */
function getLineName(routeId) {
  if (!routeId) return 'City';
  // Extract line code (e.g., SHM from aus:vic:vic-02-SHM:)
  const match = routeId.match(/-([A-Z]{3}):?$/);
  if (match) {
    if (METRO_LINE_NAMES[match[1]]) return METRO_LINE_NAMES[match[1]];
    if (VLINE_LINE_NAMES[match[1]]) return VLINE_LINE_NAMES[match[1]];
  }
  // For trams/buses, extract route number
  const tramMatch = routeId.match(/-(\d+):?$/);
  if (tramMatch) {
    return `Route ${tramMatch[1]}`;
  }
  return 'City';
}

/**
 * V15.0: Extract numeric route number from GTFS route ID.
 * Used for tram/bus route matching (e.g., "aus:vic:tram-58:" → "58")
 * @param {string} routeId - GTFS route ID
 * @returns {string|null} - Numeric route number or null
 */
function getRouteNumber(routeId) {
  if (!routeId) return null;
  // Match trailing number before optional colon (e.g., "-58:" or "-58")
  const match = routeId.match(/-(\d+):?$/);
  return match ? match[1] : null;
}

/**
 * Normalise route number for comparison — strips leading zeros.
 * GTFS route IDs may produce "058" while engine legs use "58".
 * @param {string|number|null} rn - Route number
 * @returns {string|null} - Normalised route number without leading zeros
 */
function normalizeRouteNumber(rn) {
  if (!rn) return null;
  const n = parseInt(String(rn), 10);
  return isNaN(n) ? String(rn) : String(n);
}

/**
 * Extract 3-letter line code from GTFS route ID.
 * Used for train route-level fallback (e.g., "aus:vic:vic-02-SHM:" → "SHM")
 * @param {string} routeId - GTFS route ID
 * @returns {string|null} - 3-letter line code or null
 */
function getLineCode(routeId) {
  if (!routeId) return null;
  const match = routeId.match(/-([A-Z]{3}):?$/);
  return match ? match[1] : null;
}

// Runtime API key storage (from user config token - Zero-Config compliant)
let runtimeApiKey = null;

/**
 * Set API key at runtime (from user config token)
 * Per Development Rules Section 3: Zero-Config - users never edit env files
 */
export function setApiKey(apiKey) {
  runtimeApiKey = apiKey;
}

/**
 * Get current API key
 * Per Section 3.4: API keys from KV storage only, not process.env
 * Per Section 17.5: No environment file references
 */
async function getApiKey() {
  // Check runtime first (set via setApiKey), then KV storage
  if (runtimeApiKey) return runtimeApiKey;
  return await getTransitApiKey();
}

/**
 * Get current time in UTC milliseconds
 * Note: GTFS-RT timestamps are Unix seconds (UTC), so we use Date.now() directly.
 * For display formatting, use toLocaleString with timeZone option separately.
 */
function getNowMs() {
  return Date.now();
}

/**
 * Decode GTFS-RT Protobuf data
 * @param {ArrayBuffer} buffer - Raw protobuf data
 * @returns {Object} - Decoded FeedMessage
 */
function decodeGtfsRt(buffer) {
  try {
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );
    return feed;
  } catch (error) {
    console.error('[OpenData] Protobuf decode failed:', error.message);
    return null;
  }
}

/**
 * Fetch GTFS-RT feed from the appropriate state transit authority API
 * @param {string} mode - Mode string (state-specific, e.g. 'metro', 'sydneytrains', 'SEQ')
 * @param {string} feed - 'trip-updates', 'vehicle-positions', or 'service-alerts'
 * @param {Object} options - { apiKey }
 * @param {string} state - Australian state code (e.g. 'VIC', 'NSW', 'QLD'). Defaults to 'VIC'.
 * @returns {Object} - Decoded GTFS-RT FeedMessage or null
 */
// V5.5.0: In-memory GTFS-RT feed cache (75-second TTL, reduced from 2 min in v5.5.4).
// Prevents live→scheduled alternation when the Transport Victoria API is
// intermittently unreachable. Departure countdowns are recalculated dynamically
// from cached feed's absolute timestamps on each request — times stay accurate.
// On fetch failure, returns stale cached data (better than no data).
const feedCache = new Map();
const FEED_CACHE_TTL_MS = 75000; // 75 seconds — balances freshness with API rate limits

async function fetchGtfsRt(mode, feed, options = {}, state = 'VIC') {
  if (options.apiKey) {
    // Defensive: handle both string and { devId, apiKey } object formats
    // Clear stale runtimeApiKey to prevent warm-invocation key caching (FIX-4)
    runtimeApiKey = null;
    const keyStr = typeof options.apiKey === 'object' ? options.apiKey.apiKey : options.apiKey;
    setApiKey(keyStr);
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    console.warn('[OpenData] No API key available for GTFS-RT fetch');
    return null;
  }

  // Type guard: ensure apiKey is a string before use as HTTP header
  const keyStr = typeof apiKey === 'object' ? apiKey.apiKey : String(apiKey);

  // State-aware URL and header construction
  const stateConfig = STATE_API_CONFIG[state];
  if (!stateConfig) {
    console.warn(`[OpenData] No GTFS-RT support for state: ${state}. Live data unavailable.`);
    return null;
  }
  const url = `${stateConfig.baseUrl}/${mode}/${feed}`;

  try {
    console.log(`[OpenData] Fetching GTFS-RT: ${state}/${mode}/${feed}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      headers: stateConfig.makeHeaders(keyStr),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'no body');
      console.error(`[OpenData] GTFS-RT fetch failed: HTTP ${response.status} for ${mode}/${feed}: ${errorText.substring(0, 200)}`);
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
    }

    // Guard: check Content-Type is not HTML (error page) before protobuf decode
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.error(`[OpenData] Received HTML instead of protobuf for ${mode}/${feed} — likely an error page`);
      throw new Error(`Received HTML response instead of protobuf for ${mode}/${feed}`);
    }

    // Get response as ArrayBuffer for Protobuf decoding
    const buffer = await response.arrayBuffer();
    console.log(`[OpenData] Received ${buffer.byteLength} bytes for ${mode}/${feed}`);

    // Decode Protobuf
    const decoded = decodeGtfsRt(buffer);

    if (!decoded) {
      console.error(`[OpenData] Protobuf decode returned null for ${mode}/${feed} (${buffer.byteLength} bytes)`);
    } else {
      const entityCount = decoded.entity?.length || 0;
      console.log(`[OpenData] Decoded ${entityCount} entities from ${mode}/${feed}`);
    }

    // Only cache feeds with actual trip data. Empty feeds (0 entities) from
    // transient API responses poison the cache, causing all subsequent requests
    // to return zero departures → timetable fallback for the entire TTL window.
    const cacheEntityCount = decoded?.entity?.length || 0;
    if (decoded && cacheEntityCount > 0) {
      feedCache.set(cacheKey, { data: decoded, timestamp: Date.now() });
    }
    return decoded;

  } catch (error) {
    console.error(`[OpenData] GTFS-RT error for ${mode}/${feed}: ${error.message}`);
    throw error;
  }
}

/**
 * Get departures for a stop
 * @param {number} stopId - Stop ID
 * @param {number} routeType - 0=train/metro, 1=tram, 2=bus
 * @param {Object} options - { apiKey, routeNumber, state }
 * @returns {Array} - Array of departure objects
 */
export async function getDepartures(stopId, routeType, options = {}) {
  const state = options.state || 'VIC';

  // V13.6 FIX: Per Section 23.6 - return empty array if no valid stop ID (not mock data)
  if (!stopId || stopId === 'null' || stopId === 'undefined') {
    const modeNames = { 0: 'metro', 1: 'tram', 2: 'bus', 3: 'vline' };
    const mode = modeNames[routeType] || 'unknown';
    console.warn(`[OpenData] getDepartures skipped for ${mode}: no stop ID detected. Verify address has geocoded coordinates.`);
    const result = [];
    result._feedInfo = { entityCount: 0, mode, matchMethod: 'skipped-no-stop-id', queriedStopId: null, state };
    return result;
  }

  // State-aware mode mapping — each state has different GTFS-RT mode identifiers
  const stateConfig = STATE_API_CONFIG[state];
  if (!stateConfig) {
    console.warn(`[OpenData] No GTFS-RT available for state: ${state}. Returning empty.`);
    const noRtResult = [];
    noRtResult._feedInfo = { entityCount: 0, mode: 'unknown', matchMethod: 'no-gtfs-rt', queriedStopId: String(stopId), state };
    return noRtResult;
  }
  const mode = stateConfig.modeMap[routeType] || Object.values(stateConfig.modeMap)[0];

  try {
    const feed = await fetchGtfsRt(mode, 'trip-updates', options, state);

    if (!feed) {
      console.warn(`[OpenData] No feed returned for ${mode} (stopId=${stopId}, state=${state})`);
      const noFeedResult = [];
      noFeedResult._feedInfo = { entityCount: 0, mode, matchMethod: 'no-feed', queriedStopId: String(stopId), state };
      return noFeedResult;
    }

    // Process GTFS-RT TripUpdates - try stop-level match first
    const departures = processGtfsRtDepartures(feed, stopId, routeType, state);

    // V15.0: Attach diagnostic info for debugging GTFS-RT feed coverage
    const feedEntityCount = feed.entity?.length || 0;
    const sampleIds = new Set();
    const routeIds = new Set();
    if (departures.length === 0 && feedEntityCount > 0) {
      for (const entity of feed.entity) {
        const stus = entity.tripUpdate?.stopTimeUpdate;
        const routeId = entity.tripUpdate?.trip?.routeId;
        if (routeId) routeIds.add(String(routeId));
        if (stus && sampleIds.size < 10) {
          for (const stu of stus) {
            if (stu.stopId) sampleIds.add(String(stu.stopId));
            if (sampleIds.size >= 10) break;
          }
        }
      }
    }

    // V16.0: Cascade attempt tracking — records which tiers were tried and results.
    // Enables diagnosis when GTFS-RT data exists but cascade fails to match.
    const cascadeAttempts = [];

    // V16.0: Alternative stop ID matching — same physical stop with different GTFS ID.
    // GTFS-RT feeds may use a different stop ID namespace than GTFS static data.
    // Produces EXACT stop-level matches with accurate departure times (unlike
    // coord-proximity approximations). Runs before coord-proximity for priority.
    if (departures.length === 0 && feedEntityCount > 0 && options.altStopIds?.length > 0) {
      // Aggregate across ALL alt IDs — different trips may visit different stops
      // along the same road. Dedup by trip ID to avoid counting the same tram twice.
      const seenTrips = new Set();
      const altMatches = [];
      for (const altId of options.altStopIds) {
        const altDeps = processGtfsRtDepartures(feed, altId, routeType, state);
        for (const d of altDeps) {
          if (d.tripId && seenTrips.has(d.tripId)) continue;
          if (d.tripId) seenTrips.add(d.tripId);
          departures.push(d);
          if (!altMatches.includes(altId)) altMatches.push(altId);
        }
      }
      if (departures.length > 0) {
        console.log(`[OpenData] Alt stop IDs matched ${departures.length} departures from ${altMatches.length} stops for stopId=${stopId} in ${mode} feed`);
      }
      cascadeAttempts.push({ tier: 'alt-stop-id', tried: true, altsTried: options.altStopIds.length, matched: altMatches.length > 0 ? altMatches : null, found: departures.length });
    }

    // V16.0: For trams, coordinate-proximity runs BEFORE route-level.
    // VIC tram GTFS-RT feeds use different stop IDs than static GTFS (known issue).
    // Route-level's median-stop heuristic estimates departure at a mid-route stop,
    // producing times 10-20 min off (e.g. 25 min when actual is 7 min). Coordinate-
    // proximity uses actual stop coordinates for accurate departure times and must
    // run first so the inaccurate median heuristic doesn't block it.
    // V16.0: For trams, coordinate-proximity runs BEFORE route-level.
    // VIC tram GTFS-RT feeds use different stop IDs than static GTFS (known issue).
    // Route-level's median-stop heuristic estimates departure at a mid-route stop,
    // producing times 10-20 min off (e.g. 25 min when actual is 7 min). Coordinate-
    // proximity uses actual stop coordinates for accurate departure times and must
    // run first so the inaccurate median heuristic doesn't block it.
    if (departures.length === 0 && feedEntityCount > 0 && mode === 'tram') {
      const coordDepartures = processCoordinateProximitySearch(feed, stopId, routeType, state, options.routeNumber || null, options.lat || null, options.lon || null, options.destLat || null, options.destLon || null);
      cascadeAttempts.push({ tier: 'coord-proximity', tried: true, found: coordDepartures.length });
      if (coordDepartures.length > 0) {
        console.log(`[OpenData] Coordinate-proximity search found ${coordDepartures.length} departures for stopId=${stopId} in ${mode} feed`);
        coordDepartures.forEach(d => departures.push(d));
      }
    }

    // V15.0: Route-level fallback when stop-level match fails.
    // When the GTFS-RT feed has entities but none match the stop ID, search by
    // route number or line code. Works for all modes (tram, bus, train).
    // For trams, this only runs if coordinate-proximity (above) found nothing.
    if (departures.length === 0 && feedEntityCount > 0 && (options.routeNumber || options.lineCode)) {
      const routeFallbackDepartures = processRouteLevelDepartures(
        feed, stopId, options.routeNumber, routeType, options.lineCode, state
      );
      cascadeAttempts.push({ tier: 'route-level', tried: true, found: routeFallbackDepartures.length });
      if (routeFallbackDepartures.length > 0) {
        console.log(`[OpenData] Route-level fallback found ${routeFallbackDepartures.length} departures for ${options.routeNumber || options.lineCode} (stopId=${stopId} not matched directly)`);
        // Copy results to departures array (preserving array identity for _feedInfo)
        routeFallbackDepartures.forEach(d => departures.push(d));
      }
    }

    // All-trips scan — searches ALL trips for the exact stop ID with lenient matching.
    // Produces accurate stop-level departure times (unlike broad fallback's heuristic).
    // Now runs for ALL modes including metro — previously excluded metro, causing trains
    // to fall through to broad fallback's inaccurate heuristic.
    if (departures.length === 0 && feedEntityCount > 0) {
      const scanDepartures = processAllTripsStopSearch(feed, stopId, routeType, state);
      cascadeAttempts.push({ tier: 'all-trips-scan', tried: true, found: scanDepartures.length });
      if (scanDepartures.length > 0) {
        console.log(`[OpenData] All-trips stop search found ${scanDepartures.length} departures for stopId=${stopId} in ${mode} feed`);
        scanDepartures.forEach(d => departures.push(d));
      }
    }

    // Broad fallback for trains — last resort when all previous tiers found nothing.
    // Direction-based matching (isCitybound) in findMatchingDeparture still filters correctly.
    if (departures.length === 0 && feedEntityCount > 0 && mode === 'metro') {
      const broadDepartures = processAnyRouteDepartures(feed, stopId);
      cascadeAttempts.push({ tier: 'broad-fallback', tried: true, found: broadDepartures.length });
      if (broadDepartures.length > 0) {
        console.log(`[OpenData] Broad fallback: ${broadDepartures.length} departures from mixed routes in ${mode} feed (stopId=${stopId})`);
        broadDepartures.forEach(d => departures.push(d));
      }
    }

    // Record stop-level attempt (always the first tier tried)
    if (feedEntityCount > 0) {
      cascadeAttempts.unshift({ tier: 'stop-level', tried: true, found: departures.length > 0 && departures[0]?.source === 'gtfs-rt' ? departures.length : 0 });
    }

    departures._feedInfo = {
      entityCount: feedEntityCount,
      sampleStopIds: [...sampleIds],
      sampleRouteIds: [...routeIds].slice(0, 10),
      queriedStopId: String(stopId),
      queriedRouteNumber: options.routeNumber || null,
      queriedLineCode: options.lineCode || null,
      mode,
      state,
      cascadeAttempts,
      matchMethod: departures.length > 0 && departures[0]?.source === 'gtfs-rt-coord'
        ? 'coord-proximity' : departures.length > 0 && departures[0]?.source === 'gtfs-rt-scan'
        ? 'all-trips-scan' : departures.length > 0 && departures[0]?.source === 'gtfs-rt-route'
        ? 'route-level' : departures.length > 0 && departures[0]?.source === 'gtfs-rt-broad'
        ? 'broad-fallback' : departures.length > 0 ? 'stop-level' : 'none'
    };

    if (departures.length === 0) {
      console.log(`[OpenData] No matching departures for stopId=${stopId} in ${mode} feed (${feedEntityCount} entities, ${routeIds.size} routes). Sample IDs: [${[...sampleIds].slice(0, 5).join(', ')}]. Routes: [${[...routeIds].slice(0, 5).join(', ')}]`);
      // V13.6 FIX: Per Section 23.6 - return empty array, not mock data
      return departures;
    }

    console.log(`[OpenData] Found ${departures.length} departures for stopId=${stopId} (${mode})`);
    return departures;

  } catch (error) {
    console.error(`[OpenData] getDepartures error for ${mode} stopId=${stopId}: ${error.message}`);
    // V13.6 FIX: Per Section 23.6 - return empty array on error
    // Attach diagnostic _feedInfo so dashboard can show WHY there's no live data
    const errorResult = [];
    errorResult._feedInfo = {
      entityCount: 0,
      queriedStopId: String(stopId),
      mode,
      state,
      matchMethod: 'none',
      error: error.message
    };
    return errorResult;
  }
}

/**
 * Flexible stop ID matching for GTFS-RT feeds.
 * Handles different ID formats: bare ("12179"), prefixed ("aus:vic:metro:12179"),
 * delimited ("tram-2505"), or numeric trailing ("stop2505").
 *
 * @param {string} gtfsStopId - Stop ID from the GTFS-RT feed
 * @param {string} queriedStopId - The stop ID we're looking for
 * @returns {boolean} - Whether the IDs match
 */
function matchesStopId(gtfsStopId, queriedStopId) {
  if (!gtfsStopId || !queriedStopId) return false;
  const gtfsStr = String(gtfsStopId);
  const stopIdStr = String(queriedStopId);

  // Direct match
  if (gtfsStr === stopIdStr) return true;

  // Station code match — resolve to all platform IDs via GTFS reference
  // Supports both exact and prefixed ID formats (e.g. "14293" or "aus:vic:metro:14293")
  if (VIC_METRO_STATIONS[stopIdStr]) {
    for (const pid of VIC_METRO_STATIONS[stopIdStr].platforms) {
      if (gtfsStr === pid) return true;
      if (gtfsStr.endsWith(`:${pid}`)) return true;
      if (gtfsStr.endsWith(`-${pid}`)) return true;
    }
    // Also match parent station code in prefixed form
    if (gtfsStr.endsWith(`:${stopIdStr}`)) return true;
    if (gtfsStr.endsWith(`-${stopIdStr}`)) return true;
    return false;
  }

  // Suffix matching for flexibility (tram/bus stop IDs)
  if (gtfsStr.endsWith(`:${stopIdStr}`)) return true;
  if (gtfsStr.endsWith(`-${stopIdStr}`)) return true;

  // Trailing numeric match
  if (/^\d+$/.test(stopIdStr)) {
    const numMatch = gtfsStr.match(/(\d+)$/);
    if (numMatch && numMatch[1] === stopIdStr) return true;
  }

  return false;
}

/**
 * V15.0: Route-level departure extraction when stop-level matching fails.
 * Searches the GTFS-RT feed for trips matching a route number and extracts
 * departure times. First tries to find the queried stop within the trip's
 * stop sequence. If not found, estimates departure using future stop times.
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @param {string|number} stopId - Original stop ID (for stop matching within trips)
 * @param {string} routeNumber - Expected route number (e.g., "58" for tram) or null
 * @param {number} routeType - 0=metro, 1=tram, 2=bus
 * @param {string} lineCode - Expected 3-letter line code (e.g., "SHM" for train) or null
 * @returns {Array} - Departure objects from route-level matching
 */
function processRouteLevelDepartures(feed, stopId, routeNumber, routeType, lineCode, state = 'VIC') {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity || (!routeNumber && !lineCode)) return departures;

  const targetRoute = routeNumber ? String(routeNumber) : null;
  const stopIdStr = String(stopId);

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    const routeId = tripUpdate.trip?.routeId;

    // Match by route number (tram/bus) or line code (train)
    let extractedRoute = null;
    if (targetRoute) {
      extractedRoute = getRouteNumber(routeId);
      if (normalizeRouteNumber(extractedRoute) !== normalizeRouteNumber(targetRoute)) continue;
    } else if (lineCode) {
      const extractedCode = getLineCode(routeId);
      if (extractedCode !== lineCode) continue;
    }

    const stus = tripUpdate.stopTimeUpdate;

    // Strategy 1: Try to find queried stop ID within the trip's stop sequence
    let pickedStu = null;
    for (const stu of stus) {
      if (matchesStopId(stu.stopId, stopIdStr)) {
        pickedStu = stu;
        break;
      }
    }

    // Strategy 2: Estimate from future departure times using median.
    // The queried stop is typically mid-route (not near the start or end).
    // Using the median of future stops gives a better estimate than 1/3.
    if (!pickedStu) {
      const futureDeps = [];
      for (const stu of stus) {
        const depTime = stu.departure?.time || stu.arrival?.time;
        if (!depTime) continue;
        const depMs = (depTime.low || depTime) * 1000;
        const minutes = Math.round((depMs - nowMs) / 60000);
        if (minutes >= 2 && minutes <= 120) {
          futureDeps.push({ stu, depMs, minutes });
        }
      }
      if (futureDeps.length > 0) {
        futureDeps.sort((a, b) => a.depMs - b.depMs);
        // Use median of future stops — best estimate for a mid-route stop
        const pickIdx = Math.floor(futureDeps.length / 2);
        pickedStu = futureDeps[pickIdx].stu;
      }
    }

    if (!pickedStu) continue;

    const depTime = pickedStu.departure?.time || pickedStu.arrival?.time;
    if (!depTime) continue;

    const depMs = (depTime.low || depTime) * 1000;
    const minutes = Math.round((depMs - nowMs) / 60000);

    if (minutes >= -2 && minutes <= 120) {
      const delay = pickedStu.departure?.delay || pickedStu.arrival?.delay || 0;
      const isDelayed = delay > 60;
      const isVIC = (state === 'VIC');
      const lineName = isVIC ? getLineName(routeId) : (tripUpdate.trip?.tripHeadsign || '');
      const finalStop = stus[stus.length - 1]?.stopId || '';

      departures.push({
        minutes: Math.max(0, minutes),
        departureTimeMs: depMs,
        destination: lineName || tripUpdate.trip?.tripHeadsign || '',
        lineName,
        routeNumber: extractedRoute || getRouteNumber(routeId) || null,
        routeId,
        tripId: tripUpdate.trip?.tripId,
        finalStop,
        isCitybound: false,
        delay: Math.round(delay / 60),
        isDelayed,
        isLive: true,
        source: 'gtfs-rt-route'
      });
    }
  }

  // V15.0 FIX: Deduplicate by departureTimeMs — route-level matching produces
  // duplicates when multiple GTFS-RT trip entities estimate similar departure times
  // (median-stop heuristic for two trips on the same route can produce times within
  // seconds of each other). Use 60s window to collapse near-identical departures.
  departures.sort((a, b) => a.departureTimeMs - b.departureTimeMs);
  const deduped = [];
  for (const d of departures) {
    if (deduped.length === 0 || d.departureTimeMs - deduped[deduped.length - 1].departureTimeMs > 60000) {
      deduped.push(d);
    }
  }
  return deduped.slice(0, 10);
}

/**
 * V16.0: All-trips stop search — scan every trip in the feed for stop-level matches.
 * Used for tram/bus when stop-level matching fails and no route number is available.
 * GTFS-RT tram feeds often use different stop ID formats than static GTFS, but
 * matchesStopId() handles multiple formats (bare, prefixed, delimited, trailing numeric).
 * This function iterates ALL entities and all their stopTimeUpdates to find matches
 * that processGtfsRtDepartures may have missed due to ID format differences.
 *
 * Additionally uses lenient numeric matching: extracts the trailing 3-5 digits from
 * both the queried stop ID and feed stop IDs for comparison when exact matching fails.
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @param {string|number} stopId - Stop ID to search for
 * @param {number} routeType - 0=metro, 1=tram, 2=bus
 * @returns {Array} - Departure objects from matching trips
 */
function processAllTripsStopSearch(feed, stopId, routeType, state = 'VIC') {
  const nowMs = getNowMs();
  const departures = [];
  const stopIdStr = String(stopId);
  if (!feed?.entity) return departures;

  // Extract trailing numeric portion for lenient matching
  const stopNumeric = stopIdStr.match(/(\d+)$/)?.[1] || '';

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    const stus = tripUpdate.stopTimeUpdate;

    // Search all stop time updates for a match (Strategy 1: exact stop in trip)
    for (const stu of stus) {
      // Standard matching first
      let matched = matchesStopId(stu.stopId, stopIdStr);

      // Lenient matching: compare trailing numeric portions (3+ digits)
      // Handles cases where GTFS-RT uses e.g. "2505" and static uses "18705"
      // by matching the last 4 digits when both IDs are numeric-tailed
      if (!matched && stopNumeric.length >= 3) {
        const feedNumeric = String(stu.stopId).match(/(\d+)$/)?.[1] || '';
        if (feedNumeric.length >= 3) {
          // Match trailing 3-4 digits (tram stops often share trailing digits)
          const matchLen = Math.min(4, stopNumeric.length, feedNumeric.length);
          if (stopNumeric.slice(-matchLen) === feedNumeric.slice(-matchLen)) {
            matched = true;
          }
        }
      }

      if (!matched) continue;

      const depTime = stu.departure?.time || stu.arrival?.time;
      if (!depTime) continue;

      const depMs = (depTime.low || depTime) * 1000;
      const minutes = Math.round((depMs - nowMs) / 60000);

      if (minutes >= -2 && minutes <= 120) {
        const delay = stu.departure?.delay || stu.arrival?.delay || 0;
        const isDelayed = delay > 60;
        const routeId = tripUpdate.trip?.routeId;
        const isVIC = (state === 'VIC');
        const lineName = isVIC ? getLineName(routeId) : (tripUpdate.trip?.tripHeadsign || '');

        // Detect direction and Metro Tunnel status for metro filtering
        const matchedIdx = stus.indexOf(stu);
        const scanIsCitybound = isVIC ? isTrainCitybound(stus, matchedIdx) : false;
        const scanLineCode = routeId?.match(/-([A-Z]{3}):?$/)?.[1] || '';
        const scanIsMetroTunnel = isVIC ? METRO_TUNNEL_LINE_CODES.has(scanLineCode) : false;
        const scanFinalStop = stus[stus.length - 1]?.stopId || '';

        // V5.4.9: Scan trip for City Loop traversal
        const scanCityLoopPlatforms = [
          ...(VIC_METRO_STATIONS?.PAR?.platforms || []),
          ...(VIC_METRO_STATIONS?.MCE?.platforms || []),
          ...(VIC_METRO_STATIONS?.FGS?.platforms || []),
          ...(VIC_METRO_STATIONS?.SSS?.platforms || []),
        ];
        const scanPassesCityLoop = isVIC ? stus.some(s => {
          const sid = String(s.stopId);
          return scanCityLoopPlatforms.some(pid =>
            sid === pid || sid.endsWith(':' + pid) || sid.endsWith('-' + pid)
          );
        }) : false;

        departures.push({
          minutes: Math.max(0, minutes),
          departureTimeMs: depMs,
          destination: scanIsCitybound ? 'City' : (lineName || tripUpdate.trip?.tripHeadsign || ''),
          lineName,
          routeNumber: getRouteNumber(routeId) || null,
          routeId,
          tripId: tripUpdate.trip?.tripId,
          finalStop: scanFinalStop,
          passesCityLoop: scanPassesCityLoop,
          isCitybound: scanIsCitybound,
          isMetroTunnel: scanIsMetroTunnel,
          delay: Math.round(delay / 60),
          isDelayed,
          isLive: true,
          source: 'gtfs-rt-scan'
        });
        break; // One match per trip is sufficient
      }
    }
  }

  // Deduplicate and sort
  departures.sort((a, b) => a.departureTimeMs - b.departureTimeMs);
  const deduped = [];
  for (const d of departures) {
    if (deduped.length === 0 || d.departureTimeMs - deduped[deduped.length - 1].departureTimeMs > 60000) {
      deduped.push(d);
    }
  }
  return deduped.slice(0, 10);
}

/**
 * V16.0: Coordinate-proximity tram matching — finds trips whose stop sequences
 * include stops within a radius of the user's tram stop coordinates.
 * Used when the GTFS-RT feed's stop IDs don't match our static GTFS stop IDs
 * (known issue with VIC tram feeds). Looks up each feed stop ID in the static
 * VIC_TRAM_STOPS_WITH_COORDS data to get coordinates, then checks proximity.
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @param {string|number} stopId - Queried stop ID (used to find target coordinates)
 * @param {number} routeType - 0=metro, 1=tram, 2=bus
 * @param {string} state - State code
 * @param {string|null} targetRouteNumber - If set, only match trips on this route
 * @returns {Array} - Departure objects from coordinate-matched trips
 */
function processCoordinateProximitySearch(feed, stopId, routeType, state = 'VIC', targetRouteNumber = null, fallbackLat = null, fallbackLon = null, destLat = null, destLon = null) {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity || state !== 'VIC' || routeType !== 1) return departures;

  // V5.4.9: Pre-compute lookup map for flexible stop ID matching.
  // GTFS-RT tram feeds use prefixed IDs (e.g. "aus:vic:tram-1567") while
  // VIC_TRAM_STOPS_WITH_COORDS uses bare numerics ("1567"). Exact === match
  // always fails. Map by both exact ID and trailing numeric for prefix tolerance.
  const tramStopById = {};
  for (const s of VIC_TRAM_STOPS_WITH_COORDS) {
    tramStopById[s.id] = s;
  }
  function lookupTramStop(idStr) {
    if (tramStopById[idStr]) return tramStopById[idStr];
    const numeric = idStr.match(/(\d+)$/)?.[1];
    if (numeric && tramStopById[numeric]) return tramStopById[numeric];
    return null;
  }

  // Find target stop coordinates from static GTFS data
  const stopIdStr = String(stopId);
  const targetStop = lookupTramStop(stopIdStr);
  const searchLat = targetStop?.lat ?? fallbackLat;
  const searchLon = targetStop?.lon ?? fallbackLon;
  if (!searchLat || !searchLon) return departures;
  // V5.5.2: When using fallback coordinates (stop not in VIC_TRAM_STOPS_WITH_COORDS),
  // the search centre is the user's home — typically 300-600m from the actual tram stop.
  // Widen radius to 600m to compensate for the offset.
  const usingFallbackCoords = !targetStop;

  // Build a lookup map of feed stop IDs → coordinates from static GTFS data
  const coordCache = {};

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    // V16.0: Filter by route number to avoid matching stops on different tram lines
    // that happen to pass near the same intersection
    if (targetRouteNumber) {
      const tripRoute = getRouteNumber(tripUpdate.trip?.routeId);
      if (tripRoute && normalizeRouteNumber(tripRoute) !== normalizeRouteNumber(targetRouteNumber)) continue;
    }

    const stus = tripUpdate.stopTimeUpdate;

    // Find ALL stops within radius that have valid departure times.
    // When a route number is specified, use 500m (same route, wider search).
    // V5.4.8: 300m without route filter — wide enough for intersection stops,
    // narrow enough to avoid parallel-road false matches (~300m+ away).
    // Closest-route logic at end of function disambiguates multiple routes.
    // V5.5.2: 600m when using fallback coordinates (home, not stop) to compensate
    // for the offset between home and the actual boarding location.
    const baseRadius = usingFallbackCoords ? 600 : 300;
    const searchRadius = targetRouteNumber ? 500 : baseRadius;
    const candidates = [];
    for (let i = 0; i < stus.length; i++) {
      const feedStopId = String(stus[i].stopId);
      if (!(feedStopId in coordCache)) {
        const staticStop = lookupTramStop(feedStopId);
        coordCache[feedStopId] = staticStop ? { lat: staticStop.lat, lon: staticStop.lon } : null;
      }
      const coords = coordCache[feedStopId];
      if (!coords) continue;

      const dist = haversine(searchLat, searchLon, coords.lat, coords.lon);
      if (dist < searchRadius) {
        const depTime = stus[i].departure?.time || stus[i].arrival?.time;
        if (!depTime) continue;
        const depMs = (depTime.low || depTime) * 1000;
        const mins = Math.round((depMs - nowMs) / 60000);
        if (mins >= -2 && mins <= 120) {
          candidates.push({ stu: stus[i], dist, depMs, mins });
        }
      }
    }

    // V5.4.6: Confidence-gated direction filter using trip endpoint coordinates.
    // VIC tram GTFS-RT uses different stop IDs than static GTFS — most stops lack
    // coordinates in coordCache. Only apply direction filter when we have enough
    // data to determine direction reliably (>= 3 coord stops, >= 500m span).
    // Without this gate, sparse coordCache causes incorrect rejection of valid trips.
    if (destLat && destLon && candidates.length > 0) {
      let firstCoordStop = null, lastCoordStop = null;
      let coordStopCount = 0;
      for (let i = 0; i < stus.length; i++) {
        const sc = coordCache[String(stus[i].stopId)];
        if (sc) {
          if (!firstCoordStop) firstCoordStop = sc;
          lastCoordStop = sc;
          coordStopCount++;
        }
      }
      if (firstCoordStop && lastCoordStop && firstCoordStop !== lastCoordStop && coordStopCount >= 3) {
        const span = haversine(firstCoordStop.lat, firstCoordStop.lon, lastCoordStop.lat, lastCoordStop.lon);
        if (span >= 500) {
          const firstDist = haversine(firstCoordStop.lat, firstCoordStop.lon, destLat, destLon);
          const lastDist = haversine(lastCoordStop.lat, lastCoordStop.lon, destLat, destLon);
          if (lastDist > firstDist + 200) continue; // High-confidence: heading away
        }
      }
    }

    if (candidates.length === 0) {
      // Route filter passed (this IS the correct line) but no stops in this trip
      // had coordinates in VIC_TRAM_STOPS_WITH_COORDS. Accept the trip using earliest
      // future stop_time_update as approximation. Only when route is confirmed —
      // without a route filter, this would match trams on parallel roads.
      if (targetRouteNumber) {
        let earliestFutureMs = null;
        for (const stu of stus) {
          const depTime = stu.departure?.time || stu.arrival?.time;
          if (!depTime) continue;
          const depMs = (depTime.low || depTime) * 1000;
          const mins = Math.round((depMs - nowMs) / 60000);
          if (mins >= 0 && mins <= 120 && (!earliestFutureMs || depMs < earliestFutureMs)) {
            earliestFutureMs = depMs;
          }
        }
        if (earliestFutureMs) {
          const mins = Math.round((earliestFutureMs - nowMs) / 60000);
          const routeId = tripUpdate.trip?.routeId;
          const noCoordHeadsign = tripUpdate.trip?.tripHeadsign || '';
          departures.push({
            minutes: mins,
            departureTimeMs: earliestFutureMs,
            destination: noCoordHeadsign || getLineName(routeId) || '',
            headsign: noCoordHeadsign || null,
            lineName: getLineName(routeId),
            routeNumber: getRouteNumber(routeId) || null,
            routeId,
            tripId: tripUpdate.trip?.tripId,
            isCitybound: false,
            delay: 0,
            isDelayed: false,
            isLive: true,
            source: 'gtfs-rt-coord',
            _matchDist: searchRadius
          });
        }
      }
      continue;
    }

    // Pick the candidate with the earliest future departure (>= 0 min).
    // For approaching trams, the closest stop may be one already passed (past time),
    // but the next stop in the sequence has a future time — that's the one we want.
    // Fall back to closest-by-distance if all candidates are slightly past.
    const futureCandidates = candidates.filter(c => c.mins >= 0);
    const best = futureCandidates.length > 0
      ? futureCandidates.sort((a, b) => a.mins - b.mins || a.dist - b.dist)[0]
      : candidates.sort((a, b) => a.dist - b.dist)[0];

    const delay = best.stu.departure?.delay || best.stu.arrival?.delay || 0;
    const routeId = tripUpdate.trip?.routeId;
    // Prefer headsign for destination — shows actual tram terminus direction
    // rather than line name which is less informative for tram route display
    const tripHeadsign = tripUpdate.trip?.tripHeadsign || '';
    departures.push({
      minutes: Math.max(0, best.mins),
      departureTimeMs: best.depMs,
      destination: tripHeadsign || getLineName(routeId) || '',
      headsign: tripHeadsign || null,
      lineName: getLineName(routeId),
      routeNumber: getRouteNumber(routeId) || null,
      routeId,
      tripId: tripUpdate.trip?.tripId,
      isCitybound: false,
      delay: Math.round(delay / 60),
      isDelayed: delay > 60,
      isLive: true,
      source: 'gtfs-rt-coord',
      _matchDist: best.dist  // Used for closest-route preference below
    });
  }

  // When no route filter specified, prefer the route with the closest matched stop.
  // At intersections where multiple tram routes have nearby stops on different
  // roads, only the closest route's departures are kept — prevents matching a
  // different route whose stops happen to be within the 500m search radius.
  if (!targetRouteNumber && departures.length > 0) {
    const routeDistances = {};
    for (const d of departures) {
      const rn = d.routeNumber || d.routeId || 'unknown';
      if (!(rn in routeDistances) || d._matchDist < routeDistances[rn]) {
        routeDistances[rn] = d._matchDist;
      }
    }
    const closestRoute = Object.entries(routeDistances).sort((a, b) => a[1] - b[1])[0][0];
    const filtered = departures.filter(d => (d.routeNumber || d.routeId || 'unknown') === closestRoute);
    departures.length = 0;
    filtered.forEach(d => departures.push(d));
  }

  // Clean up internal field before returning
  for (const d of departures) { delete d._matchDist; }

  departures.sort((a, b) => a.departureTimeMs - b.departureTimeMs);
  const deduped = [];
  for (const d of departures) {
    if (deduped.length === 0 || d.departureTimeMs - deduped[deduped.length - 1].departureTimeMs > 60000) {
      deduped.push(d);
    }
  }
  return deduped.slice(0, 10);
}

/**
 * V15.0: Broad fallback — extract departures from ALL routes in the feed.
 * Used for trains when all previous matching strategies fail.
 * Direction-based matching (isCitybound) in findMatchingDeparture still filters correctly.
 *
 * V5.4.6: Accepts targetStopId — tries matching the user's specific station within
 * each trip before falling back to earliest-future heuristic. Without this, the
 * heuristic picks mid-route stops producing wrong departure times.
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @param {string|number|null} targetStopId - User's station stop ID (optional)
 * @returns {Array} - Departure objects from mixed routes
 */
function processAnyRouteDepartures(feed, targetStopId = null) {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity) return departures;

  const targetStr = targetStopId ? String(targetStopId) : null;

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    const routeId = tripUpdate.trip?.routeId;
    const extractedRoute = getRouteNumber(routeId);
    const lineName = getLineName(routeId);
    const stus = tripUpdate.stopTimeUpdate;

    // V5.4.6: Try matching the user's specific stop first (accurate departure time)
    let picked = null;
    if (targetStr) {
      for (const stu of stus) {
        if (matchesStopId(stu.stopId, targetStr)) {
          const depTime = stu.departure?.time || stu.arrival?.time;
          if (!depTime) continue;
          const depMs = (depTime.low || depTime) * 1000;
          const minutes = Math.round((depMs - nowMs) / 60000);
          if (minutes >= -2 && minutes <= 120) {
            picked = { stu, depMs, minutes };
            break;
          }
        }
      }
    }

    // Fall back to earliest future departure heuristic
    if (!picked) {
      const futureDeps = [];
      for (const stu of stus) {
        const depTime = stu.departure?.time || stu.arrival?.time;
        if (!depTime) continue;
        const depMs = (depTime.low || depTime) * 1000;
        const minutes = Math.round((depMs - nowMs) / 60000);
        if (minutes >= 2 && minutes <= 120) {
          futureDeps.push({ stu, depMs, minutes });
        }
      }

      if (futureDeps.length === 0) continue;
      futureDeps.sort((a, b) => a.depMs - b.depMs);
      picked = futureDeps[0];
    }

    // V16.0: Detect direction from trip's stop sequence for proper filtering
    const finalStopId = stus[stus.length - 1]?.stopId || '';
    const lineCode = routeId?.match(/-([A-Z]{3}):?$/)?.[1] || '';
    const isMetroTunnel = METRO_TUNNEL_LINE_CODES.has(lineCode);
    // Use median stop index to detect if train is heading towards city
    const medianIdx = Math.floor(stus.length / 2);
    const isCitybound = isTrainCitybound(stus, medianIdx);

    departures.push({
      minutes: Math.max(0, picked.minutes),
      departureTimeMs: picked.depMs,
      destination: isCitybound ? 'City' : (lineName || ''),
      lineName,
      routeNumber: extractedRoute,
      routeId,
      tripId: tripUpdate.trip?.tripId,
      finalStop: finalStopId, // Enables City Loop filtering — without this,
                              // Sandringham trains (terminating at Flinders St)
                              // incorrectly pass the filter for Parliament-bound journeys
      isCitybound,
      isMetroTunnel,
      isLive: true,
      source: 'gtfs-rt-broad'
    });
  }

  departures.sort((a, b) => a.departureTimeMs - b.departureTimeMs);
  const dedupedBroad = [];
  for (const d of departures) {
    if (dedupedBroad.length === 0 || d.departureTimeMs - dedupedBroad[dedupedBroad.length - 1].departureTimeMs > 60000) {
      dedupedBroad.push(d);
    }
  }
  return dedupedBroad.slice(0, 10);
}

/**
 * Process GTFS-RT trip updates into departure format
 * @param {Object} feed - Decoded FeedMessage
 * @param {number|string} stopId - Stop ID to filter
 * @param {number} routeType - 0=metro, 1=tram, 2=bus (for flexible matching)
 * @returns {Array} - Departure objects
 */
function processGtfsRtDepartures(feed, stopId, routeType = 0, state = 'VIC') {
  const nowMs = getNowMs();
  const departures = [];
  const stopIdStr = String(stopId);

  if (!feed?.entity) {
    console.warn(`[OpenData] processGtfsRtDepartures: feed has no entities for stopId=${stopIdStr}`);
    return departures;
  }

  // Log a sample of stop IDs in the feed for diagnostic purposes (first 5 unique)
  const sampleStopIds = new Set();
  for (const entity of feed.entity) {
    if (sampleStopIds.size >= 5) break;
    const stus = entity.tripUpdate?.stopTimeUpdate;
    if (stus) {
      for (const stu of stus) {
        if (stu.stopId) sampleStopIds.add(String(stu.stopId));
        if (sampleStopIds.size >= 5) break;
      }
    }
  }
  console.log(`[OpenData] Looking for stopId=${stopIdStr} (routeType=${routeType}). Sample stop IDs in feed: [${[...sampleStopIds].join(', ')}]`);

  // V15.0: Uses shared matchesStopId() for flexible stop ID matching across all modes

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate) continue;

    for (const stu of tripUpdate.stopTimeUpdate) {
      // Match stop ID (GTFS uses string IDs) - V13.6: Flexible matching
      if (!matchesStopId(stu.stopId, stopIdStr)) continue;
      
      // Get departure or arrival time
      const depTime = stu.departure?.time || stu.arrival?.time;
      if (!depTime) continue;

      // Convert to milliseconds (GTFS-RT uses Unix seconds)
      const depMs = (depTime.low || depTime) * 1000;
      const minutes = Math.round((depMs - nowMs) / 60000);

      // V15.0: Include upcoming departures (next 120 min) — wider window for low-frequency services
      // Allow -2 min for just-departed services (consistent with route-level matching)
      if (minutes >= -2 && minutes <= 120) {
        // Get delay info
        const delay = stu.departure?.delay || stu.arrival?.delay || 0;
        const isDelayed = delay > 60; // More than 1 minute delay

        // Determine destination and direction
        const stops = tripUpdate.stopTimeUpdate;
        const finalStop = stops[stops.length - 1]?.stopId || '';
        const userStopIndex = stops.findIndex(s => matchesStopId(s.stopId, stopIdStr));
        const routeId = tripUpdate.trip?.routeId;
        const lineName = getLineName(routeId);

        // VIC-specific: City Loop and Metro Tunnel direction detection
        // Non-VIC: skip direction detection (not applicable outside Melbourne)
        const isVIC = (state === 'VIC');
        const isCitybound = isVIC ? isTrainCitybound(stops, userStopIndex) : false;
        const destination = isCitybound ? 'City' : (tripUpdate.trip?.tripHeadsign || lineName);
        const lineCode = routeId?.match(/-([A-Z]{3}):?$/)?.[1] || '';
        const isMetroTunnel = isVIC ? METRO_TUNNEL_LINE_CODES.has(lineCode) : false;

        // V5.4.9: Scan trip's full stop sequence for City Loop traversal.
        // finalStop check alone fails when citybound trains terminate past City Loop.
        const cityLoopPlatforms = [
          ...(VIC_METRO_STATIONS?.PAR?.platforms || []),
          ...(VIC_METRO_STATIONS?.MCE?.platforms || []),
          ...(VIC_METRO_STATIONS?.FGS?.platforms || []),
          ...(VIC_METRO_STATIONS?.SSS?.platforms || []),
        ];
        const passesCityLoop = isVIC ? stops.some(s => {
          const sid = String(s.stopId);
          return cityLoopPlatforms.some(pid =>
            sid === pid || sid.endsWith(':' + pid) || sid.endsWith('-' + pid)
          );
        }) : false;

        departures.push({
          minutes,
          departureTimeMs: depMs, // Absolute departure time for live countdown
          destination,
          lineName,              // V13.6: Explicit line name for display
          routeNumber: getRouteNumber(routeId), // V15.0: Numeric route number for matching
          headsign: tripUpdate.trip?.tripHeadsign || null,
          routeId,
          tripId: tripUpdate.trip?.tripId,
          finalStop,
          passesCityLoop,
          isCitybound,
          isMetroTunnel,         // true = Metro Tunnel line, false = City Loop line
          delay: Math.round(delay / 60), // Convert to minutes
          isDelayed,
          isLive: true,
          source: 'gtfs-rt'
        });
      }
    }
  }

  // Sort by departure time — return up to 10 to support inter-leg catchability
  // (user may not reach the stop for 30+ min due to earlier transit legs)
  departures.sort((a, b) => a.minutes - b.minutes);
  return departures.slice(0, 10);
}

// V13.6: getMockDepartures removed per Section 23.6 — no mock data fallbacks.
// All code paths return [] when no live departures available.

/**
 * Get service disruptions
 * @param {number} routeType - 0=train, 1=tram, 2=bus
 * @param {Object} options - { apiKey, state }
 */
export async function getDisruptions(routeType, options = {}) {
  const state = options.state || 'VIC';

  // State-aware mode mapping
  const stateConfig = STATE_API_CONFIG[state];
  if (!stateConfig) {
    // No GTFS-RT for this state — no disruption data available
    return [];
  }
  const mode = stateConfig.modeMap[routeType] || Object.values(stateConfig.modeMap)[0];

  try {
    const feed = await fetchGtfsRt(mode, 'service-alerts', options, state);
    
    if (!feed?.entity) {
      return [];
    }
    
    // Process GTFS-RT service alerts
    // V13.6: Include mode and affected routes for proper filtering
    return feed.entity.map(entity => {
      const alert = entity.alert;
      const title = alert?.headerText?.translation?.[0]?.text || 'Alert';
      const description = alert?.descriptionText?.translation?.[0]?.text || '';

      // Extract affected routes and stops from informed entities
      const affectedRoutes = [];
      const affectedStops = [];
      if (alert?.informedEntity) {
        for (const ie of alert.informedEntity) {
          if (ie.routeId) affectedRoutes.push(ie.routeId);
          if (ie.stopId) affectedStops.push(ie.stopId);
        }
      }

      return {
        id: entity.id,
        title,
        headerText: title,  // V13.6: Alias for compatibility
        description,
        cause: alert?.cause,
        effect: alert?.effect,
        mode,  // V13.6: Include mode for route type filtering
        affectedRoutes,  // V13.6: Specific routes affected
        affectedStops,   // Specific stops affected (for stop-level filtering)
        type: 'disruption'
      };
    });
    
  } catch (error) {
    console.error(`[OpenData] getDisruptions error for ${mode}: ${error.message}`);
    return [];
  }
}

/**
 * Get current weather for Melbourne (or configured location)
 * Uses Open-Meteo API (free, no key required)
 * @param {number} lat - Latitude (default Melbourne)
 * @param {number} lon - Longitude (default Melbourne)
 * @returns {Object} - Weather object with temp, condition, umbrella
 */
export async function getWeather(lat = MELBOURNE_LAT, lon = MELBOURNE_LON, timezone = 'Australia/Melbourne') {
  try {
    const tz = encodeURIComponent(timezone);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,uv_index&hourly=weather_code,precipitation,temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,uv_index&forecast_days=1&timezone=${tz}`;
    const weatherController = new AbortController();
    const weatherTimeoutId = setTimeout(() => weatherController.abort(), 8000);
    const res = await fetch(url, { signal: weatherController.signal });
    clearTimeout(weatherTimeoutId);

    if (!res.ok) throw new Error('Weather API error');
    const data = await res.json();

    // Weather code mapping
    const codes = {
      0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy',
      45: 'Foggy', 48: 'Foggy',
      51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
      61: 'Rain', 63: 'Rain', 65: 'Heavy Rain',
      71: 'Snow', 73: 'Snow', 75: 'Heavy Snow',
      80: 'Showers', 81: 'Showers', 82: 'Heavy Showers',
      95: 'Storm', 96: 'Storm', 99: 'Storm'
    };

    const weatherCode = data.current?.weather_code;
    const condition = codes[weatherCode] || 'Unknown';
    const precipitation = data.current?.precipitation || 0;
    const humidity = data.current?.relative_humidity_2m ?? null;
    const windSpeed = data.current?.wind_speed_10m ?? null;
    const uvIndex = data.current?.uv_index ?? null;

    // Determine if umbrella needed (current conditions)
    const rainyConditions = ['Rain', 'Heavy Rain', 'Drizzle', 'Showers', 'Heavy Showers', 'Storm'];
    const umbrella = rainyConditions.includes(condition) || precipitation > 0;

    // Build hourly forecast for the rest of the day (equipment planning)
    const dayForecast = [];
    const hourlyTimes = data.hourly?.time || [];
    const hourlyWeatherCodes = data.hourly?.weather_code || [];
    const hourlyPrecip = data.hourly?.precipitation || [];
    const hourlyTemp = data.hourly?.temperature_2m || [];
    const hourlyApparent = data.hourly?.apparent_temperature || [];
    const hourlyHumidity = data.hourly?.relative_humidity_2m || [];
    const hourlyWindSpeed = data.hourly?.wind_speed_10m || [];
    const hourlyUvIndex = data.hourly?.uv_index || [];
    // Use Melbourne timezone (Vercel runs UTC)
    const now = new Date();
    const melbourneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
    const nowHour = melbourneTime.getHours();

    for (let i = 0; i < hourlyTimes.length; i++) {
      const forecastHour = new Date(hourlyTimes[i]).getHours();
      if (forecastHour >= nowHour) {
        const hCondition = codes[hourlyWeatherCodes[i]] || 'Unknown';
        dayForecast.push({
          hour: forecastHour,
          temp: Math.round(hourlyTemp[i] ?? 0),
          apparentTemp: Math.round(hourlyApparent[i] ?? hourlyTemp[i] ?? 0),
          condition: hCondition,
          precipitation: hourlyPrecip[i] || 0,
          humidity: hourlyHumidity[i] ?? null,
          windSpeed: hourlyWindSpeed[i] ?? null,
          uvIndex: hourlyUvIndex[i] ?? null,
          isRainy: rainyConditions.includes(hCondition) || (hourlyPrecip[i] || 0) > 0
        });
      }
    }

    return {
      temp: Math.round(data.current?.temperature_2m ?? 20),
      condition,
      umbrella,
      precipitation,
      humidity,
      windSpeed,
      uvIndex,
      weatherCode,
      dayForecast,
      source: 'open-meteo'
    };

  } catch (e) {
    console.error(`[OpenData] Weather API error: ${e.message}`);
    return {
      temp: 20,
      condition: 'Unknown',
      humidity: null,
      windSpeed: null,
      uvIndex: null,
      umbrella: false,
      precipitation: 0,
      dayForecast: [],
      source: 'fallback',
      error: true
    };
  }
}

/**
 * Get all data needed for dashboard in one call
 * @param {Object} config - Configuration with stopIds and apiKey
 * @returns {Object} - Combined data for dashboard
 */
export async function getDashboardData(config = {}) {
  // Per DEVELOPMENT-RULES Section 23.1.1 - NO hardcoded default stop IDs
  // Stop IDs must come from: 1) user config, 2) CommuteCompute auto-detect, 3) null → fallback
  const trainStopId = config.trainStopId || null;
  const tramStopId = config.tramStopId || null;
  const busStopId = config.busStopId || null;
  const lat = config.lat || MELBOURNE_LAT;
  const lon = config.lon || MELBOURNE_LON;
  const options = { apiKey: config.apiKey };

  const [trains, trams, buses, weather, disruptions] = await Promise.all([
    trainStopId ? getDepartures(trainStopId, 0, options) : Promise.resolve([]),
    tramStopId ? getDepartures(tramStopId, 1, options) : Promise.resolve([]),
    busStopId ? getDepartures(busStopId, 2, options) : Promise.resolve([]),
    getWeather(lat, lon),
    getDisruptions(0, options).catch(() => [])
  ]);

  return {
    trains,
    trams,
    buses,
    weather,
    disruptions,
    timestamp: new Date().toISOString()
  };
}

export default { getDepartures, getDisruptions, getWeather, getDashboardData, setApiKey, METRO_LINE_NAMES };
