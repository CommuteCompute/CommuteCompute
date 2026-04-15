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
  const cacheKey = `${state}-${mode}-${feed}`;
  const cached = feedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < FEED_CACHE_TTL_MS)) {
    // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
    return cached.data;
  }

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
    // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
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
    // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
    // Decode Protobuf
    const decoded = decodeGtfsRt(buffer);

    if (!decoded) {
      console.error(`[OpenData] Protobuf decode returned null for ${mode}/${feed} (${buffer.byteLength} bytes)`);
    } else {
      const entityCount = decoded.entity?.length || 0;
      // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
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
    // Return stale cached data on failure — better than no data
    if (cached?.data) {
      // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
      return cached.data;
    }
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
    // v5.9.5 (AA2): capture T1's exact-match count BEFORE any later tier
    // pushes additional departures. The stop-level cascade entry must
    // report ONLY T1's count, not the conflated T1+T2 total (which the
    // v5.9.3/v5.9.4 unshift at line ~588 was doing). See
    // DEVELOPMENT-RULES.md §23.15 (v5.9.5 update) for the rationale and
    // tests/test-tram-cascade-selection.js for the accounting invariant.
    const t1ExactMatchCount = departures.length;

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
        // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
      }
      cascadeAttempts.push({ tier: 'alt-stop-id', tried: true, altsTried: options.altStopIds.length, matched: altMatches.length > 0 ? altMatches : null, found: departures.length });
    }

    // v5.9.2 (X2): Identity-first cascade reorganisation.
    // The old cascade ran coord-proximity (300 m fuzzy) before all-trips-scan,
    // short-circuiting on 3+ results. That produced hits from parallel routes
    // because coord-proximity returns ANY tram within 300 m regardless of route.
    //
    // New order for trams:
    //   T1: exact stop-id match (processGtfsRtDepartures) — already above
    //   T2: alt stop IDs (processGtfsRtDepartures via altStopIds) — already above
    //   T3: all-trips lenient-numeric scan (processAllTripsStopSearch) — moved HERE
    //   T4: coord-identity match (processCoordIdentityMatch, 15 m) — NEW
    //   T5: route-level fallback (processRouteLevelDepartures) — when routeNumber known
    //   T6: coord-proximity 300 m — LAST RESORT, only when T1-T5 all empty
    //
    // Source hierarchy (high → low confidence):
    //   gtfs-rt               (exact stop-id match)
    //   gtfs-rt-scan          (lenient trailing-numeric)
    //   gtfs-rt-coord-identity (NEW — static coords within 15 m of target)
    //   gtfs-rt-route         (route-level median heuristic)
    //   gtfs-rt-coord         (300 m proximity, LOW confidence)

    // T3: All-trips scan with lenient trailing-numeric matching.
    // Runs for ALL modes (not just trams). Produces stop-level accuracy.
    if (departures.length === 0 && feedEntityCount > 0) {
      const scanDepartures = processAllTripsStopSearch(feed, stopId, routeType, state);
      cascadeAttempts.push({ tier: 'all-trips-scan', tried: true, found: scanDepartures.length });
      if (scanDepartures.length > 0) {
        scanDepartures.forEach(d => departures.push(d));
      }
    }

    // T4: Coord-identity match (trams only, named-constant radius).
    // Bridges the feed/static stop-id namespace gap by comparing static
    // coordinates. A feed stop whose static coords are within the identity
    // radius of the target IS the target stop, just with a different ID — so
    // its tripUpdates are authoritative matches. This resolves cases where
    // the feed uses IDs that don't match the static dataset entries.
    //
    // Radius rationale (v5.9.3 — measured on VIC_TRAM_STOPS_WITH_COORDS):
    //   - Paired inbound/outbound platforms of the same physical stop can sit
    //     up to ~25 m apart across the Melbourne tram network (wide-road
    //     crossings). The previous v5.9.2 value of 15 m was too tight and
    //     the tier was inert whenever the feed used the outbound platform ID.
    //   - Same-route adjacent stops on the same street are always >150 m apart.
    //   - Parallel-street neighbours (the closest false-match class) are
    //     always >200 m away (measured at 258 m for the tightest case).
    //   - TRAM_COORD_IDENTITY_RADIUS_METRES = 40 m therefore catches the
    //     paired-platform case (25 m + 15 m margin) while rejecting any
    //     neighbour (210 m+ safety margin).
    //
    // Runs regardless of previous tiers' findings because coord-identity is
    // COMPLEMENTARY to T1/T3 — different feeds may use different ID formats
    // and we want to catch trips that slipped through both. Dedup by trip ID
    // so the same tram is never counted twice.
    if (feedEntityCount > 0 && mode === 'tram') {
      const coordsForStop = options.lat && options.lon
        ? { lat: options.lat, lon: options.lon }
        : lookupTramStop(String(stopId));
      if (coordsForStop?.lat && coordsForStop?.lon) {
        // v5.9.5 (AA3): collect the tripIds that T1 and/or T2 already
        // matched, and pass them to coord-identity as knownMatchedTripIds.
        // This lets T4 record a cross-tier divergence report: for each
        // trip T1/T2 matched, T4 notes whether it also matched AND (if
        // not) the rejection reason. §23.15 requires this symmetry —
        // the coord-identity tier should find the same trips stop-level
        // found, and any divergence is a flag worth surfacing.
        const knownMatchedTripIds = new Set(
          departures.map(d => d.tripId).filter(Boolean)
        );
        const identityResult = processCoordIdentityMatch(
          feed,
          coordsForStop.lat,
          coordsForStop.lon,
          routeType,
          {
            identityRadiusMetres: options.identityRadiusMetres ?? TRAM_COORD_IDENTITY_RADIUS_METRES,
            targetRouteNumber: options.routeNumber || null,
            knownMatchedTripIds
          }
        );
        cascadeAttempts.push({
          tier: 'coord-identity',
          tried: true,
          found: identityResult.departures.length,
          feedStopIdsResolved: identityResult.feedStopIdsResolved,
          matchedTripCount: identityResult.matchedTripCount,
          radiusMetres: options.identityRadiusMetres ?? TRAM_COORD_IDENTITY_RADIUS_METRES,
          // v5.9.4 (Z4): diagnostic fields for post-deploy investigation
          sampleLookups: identityResult.sampleLookups,
          totalUniqueFeedStopIds: identityResult.totalUniqueFeedStopIds,
          // v5.9.5 (AA3): divergence report (null when no knownMatchedTripIds)
          divergenceReport: identityResult.divergenceReport
        });
        // Merge into departures with trip-id dedup (identity results may
        // overlap with T1/T3 matches from the same tram).
        const seenTripIds = new Set(departures.map(d => d.tripId).filter(Boolean));
        for (const d of identityResult.departures) {
          if (d.tripId && seenTripIds.has(d.tripId)) continue;
          if (d.tripId) seenTripIds.add(d.tripId);
          departures.push(d);
        }
      }
    }

    // T5: Route-level fallback when stop-level / scan / identity all failed.
    // When the GTFS-RT feed has entities but none match the stop ID, search by
    // route number or line code. Works for all modes (tram, bus, train).
    if (departures.length === 0 && feedEntityCount > 0 && (options.routeNumber || options.lineCode)) {
      const routeFallbackDepartures = processRouteLevelDepartures(
        feed, stopId, options.routeNumber, routeType, options.lineCode, state
      );
      cascadeAttempts.push({ tier: 'route-level', tried: true, found: routeFallbackDepartures.length });
      if (routeFallbackDepartures.length > 0) {
        routeFallbackDepartures.forEach(d => departures.push(d));
      }
    }

    // T6: Coord-proximity 300 m — LAST RESORT.
    // Only fires when every identity-based tier (T1-T5) returned nothing.
    // This means either the configured stop is unknown to the static dataset
    // or the feed uses completely non-resolvable ID formats. The 300 m radius
    // may pull in routes from parallel streets — a warning is surfaced in
    // _liveDataDiag.tramRouteSelectionConfidence when this tier is the source.
    if (departures.length === 0 && feedEntityCount > 0 && mode === 'tram') {
      const coordDepartures = processCoordinateProximitySearch(
        feed, stopId, routeType, state,
        options.routeNumber || null,
        options.lat || null, options.lon || null,
        options.destLat || null, options.destLon || null
      );
      cascadeAttempts.push({ tier: 'coord-proximity', tried: true, found: coordDepartures.length });
      if (coordDepartures.length > 0) {
        coordDepartures.forEach(d => departures.push(d));
      }
    }

    // Broad fallback for trains — last resort when all previous tiers found nothing.
    // Direction-based matching (isCitybound) in findMatchingDeparture still filters correctly.
    if (departures.length === 0 && feedEntityCount > 0 && mode === 'metro') {
      const broadDepartures = processAnyRouteDepartures(feed, stopId);
      cascadeAttempts.push({ tier: 'broad-fallback', tried: true, found: broadDepartures.length });
      if (broadDepartures.length > 0) {
        broadDepartures.forEach(d => departures.push(d));
      }
    }

    // Record stop-level attempt (always the first tier tried).
    // v5.9.5 (AA2): report ONLY T1's exact-match count. v5.9.3/v5.9.4
    // reported `departures.length` when the first element was
    // `source === 'gtfs-rt'` — but T2 alt-stop-id also produces items
    // with that same source, so the stop-level entry silently
    // conflated T1 and T2 results. T2 has its own `alt-stop-id` cascade
    // entry; one tier = one count. See DEVELOPMENT-RULES.md §23.15
    // (v5.9.5 update) and tests/test-tram-cascade-selection.js for the
    // accounting invariant.
    if (feedEntityCount > 0) {
      cascadeAttempts.unshift({ tier: 'stop-level', tried: true, found: t1ExactMatchCount });
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
      matchMethod: departures.length === 0
        ? 'none'
        : departures[0]?.source === 'gtfs-rt-coord-identity' ? 'coord-identity'
        : departures[0]?.source === 'gtfs-rt-coord' ? 'coord-proximity'
        : departures[0]?.source === 'gtfs-rt-scan' ? 'all-trips-scan'
        : departures[0]?.source === 'gtfs-rt-route' ? 'route-level'
        : departures[0]?.source === 'gtfs-rt-broad' ? 'broad-fallback'
        : 'stop-level'
    };

    if (departures.length === 0) {
      // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
      // V13.6 FIX: Per Section 23.6 - return empty array, not mock data
      return departures;
    }

    // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
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

    // Train GTFS-RT uses scheduled time + delay offset; tram/bus use predicted times.
    // Only add delay for trains (routeType 0) to avoid double-counting for trams.
    const delay = pickedStu.departure?.delay || pickedStu.arrival?.delay || 0;
    const isTrainMode = routeType === 0 || routeType === '0';
    const depMs = ((depTime.low || depTime) * 1000) + (isTrainMode ? delay * 1000 : 0);
    const minutes = Math.round((depMs - nowMs) / 60000);

    // v5.8.1: Drop past departures at source. The previous `>= -2` tolerance
    // allowed ghosts (minutes: -1/-2) to reach raw.transit.trains. Users can't
    // board past services.
    if (minutes > 0 && minutes <= 120) {
      const isDelayed = delay > 60;
      const isVIC = (state === 'VIC');
      const lineName = isVIC ? getLineName(routeId) : (tripUpdate.trip?.tripHeadsign || '');
      const finalStop = stus[stus.length - 1]?.stopId || '';
      // v5.9.0 (T4 + T10 / B4): Mode-specific destination ordering.
      //   Trains — line name is the semantically meaningful identifier
      //            (the line code). Fall back to headsign.
      //   Trams/buses — tripHeadsign carries the actual directional end
      //                 (a suburb terminus name). Fall back to lineName.
      // The old `lineName || headsign || ''` order produced a route number as
      // the tram destination for every tram, hiding the real direction.
      // Applied to ALL states (VIC path first, other states fall through
      // since their lineName was already a headsign at line 728).
      const tripHeadsign = tripUpdate.trip?.tripHeadsign || '';
      const destination = isTrainMode
        ? (lineName || tripHeadsign || '')
        : (tripHeadsign || lineName || '');

      departures.push({
        minutes: Math.max(0, minutes),
        departureTimeMs: depMs,
        destination,
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

      // Train GTFS-RT uses scheduled time + delay offset; tram/bus use predicted times
      const delay = stu.departure?.delay || stu.arrival?.delay || 0;
      const scanIsTrainMode = routeType === 0 || routeType === '0';
      const depMs = ((depTime.low || depTime) * 1000) + (scanIsTrainMode ? delay * 1000 : 0);
      const minutes = Math.round((depMs - nowMs) / 60000);

      // v5.8.1: Drop past departures at source (see note in route-level matching path).
      if (minutes > 0 && minutes <= 120) {
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

        // v5.9.0 (T4 + T10 / B4): mode-specific destination ordering.
        // Trains use line name; trams/buses use tripHeadsign.
        const scanIsTrainMode = routeType === 0 || routeType === '0';
        const scanTripHeadsign = tripUpdate.trip?.tripHeadsign || '';
        const scanDestination = scanIsCitybound
          ? 'City'
          : (scanIsTrainMode
              ? (lineName || scanTripHeadsign || '')
              : (scanTripHeadsign || lineName || ''));
        departures.push({
          minutes: Math.max(0, minutes),
          departureTimeMs: depMs,
          destination: scanDestination,
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
// v5.9.2 (X1): Module-level tram stop lookup extracted from
// processCoordinateProximitySearch so it can be shared with the new
// processCoordIdentityMatch function. Memoised once per module load.
// GTFS-RT tram feeds use prefixed IDs (e.g. "aus:vic:tram-1567") while
// VIC_TRAM_STOPS_WITH_COORDS uses bare numerics ("1567"). Exact === match
// always fails. Map by both exact ID and trailing numeric for prefix tolerance.
const _tramStopByIdCache = (() => {
  const map = {};
  for (const s of VIC_TRAM_STOPS_WITH_COORDS) {
    map[s.id] = s;
  }
  return map;
})();

function lookupTramStop(idStr) {
  if (_tramStopByIdCache[idStr]) return _tramStopByIdCache[idStr];
  const numeric = String(idStr).match(/(\d+)$/)?.[1];
  if (numeric && _tramStopByIdCache[numeric]) return _tramStopByIdCache[numeric];
  return null;
}

/**
 * v5.9.3 (Y1): Melbourne tram coord-identity radius — universal constant.
 *
 * This is the radius used by processCoordIdentityMatch when resolving feed
 * stop IDs back to a user's configured tram stop via haversine against the
 * static VIC_TRAM_STOPS_WITH_COORDS coordinates.
 *
 * Value: 40 metres. Measured rationale (not heuristic):
 *
 *   - Inbound/outbound directional pairs of the same physical tram stop on
 *     wide-road crossings sit up to ~25 m apart in the static GTFS dataset.
 *     Measured directly across the VIC_TRAM_STOPS_WITH_COORDS dataset.
 *     The v5.9.2 assumption of 5-15 m was wrong for any two-direction stop
 *     on a wide road — the coord-identity tier was silently inert for such
 *     stops, forcing the cascade to fall through to 300 m coord-proximity.
 *
 *   - Adjacent stops on parallel streets (the closest false-match class)
 *     are always more than 200 m away. Same-route adjacent stops on the
 *     same street are at least 150 m apart. 40 m therefore has a ~110 m
 *     safety margin before any false match.
 *
 *   - 40 m catches the paired-platform case with a ~15 m safety margin
 *     (25 m worst case + 15 m buffer = 40 m).
 *
 * This is a universal physical property of the Melbourne tram network —
 * NOT a per-user value, NOT a hardcoded stop ID, NOT assumed for a
 * specific route. Any user at any VIC tram stop benefits from the widened
 * threshold because the measurement holds network-wide.
 *
 * Per DEVELOPMENT-RULES.md §13.3 (No Magic Numbers), this is declared as a
 * named module-level constant with documented rationale. Per §23.15, this
 * constant is the canonical identity threshold for the tram cascade.
 */
export const TRAM_COORD_IDENTITY_RADIUS_METRES = 40;

/**
 * v5.9.2 (X1) + v5.9.3 (Y1) + v5.9.4 (Z1/Z4) + v5.9.5 (AA1/AA3):
 * processCoordIdentityMatch — architectural bridge for the feed/static
 * stop-id namespace mismatch.
 *
 * This function answers the question "which tripUpdates in the current feed
 * actually touch the user's physical stop" WITHOUT relying on exact stop-id
 * equality. It does so by looking up each feed stop id's STATIC coordinates
 * and comparing them against the target stop's coordinates with a tight
 * identity radius (default TRAM_COORD_IDENTITY_RADIUS_METRES = 40 m).
 *
 * Why coordinate identity works: when the feed uses a different stop ID
 * than the static dataset for the same physical platform, the two entries
 * resolve to within ~25 m of each other (the paired-platform distance on
 * Melbourne trams). So a haversine match within the identity radius means
 * "same physical platform, just a different ID format in the feed".
 *
 * This replaces the coord-proximity 300 m fuzzy search as the primary
 * identity-resolution mechanism. The 300 m search remains as a last-resort
 * tier for genuinely unknown stops outside the static dataset.
 *
 * v5.9.4 (Z1) — NO ROUTE PRE-FILTER: the function MUST scan every feed
 * trip entity regardless of any pre-guessed route number. The purpose of
 * the identity tier is to DISCOVER which route is physically at the user's
 * stop from the live feed — pre-filtering by a caller-supplied route
 * defeats the entire tier. v5.9.3 had an `if (targetRouteNumber) continue`
 * pre-filter that caused the tier to return zero matches whenever the
 * engine's upstream route guess was wrong or when a previously-poisoned
 * KV value contributed an incorrect route preference. A caller-supplied
 * `targetRouteNumber` is now used ONLY as a distance tie-break preference
 * — never as an exclusion.
 *
 * v5.9.4 (Z4) — DIAGNOSTIC TELEMETRY: the function collects the first 20
 * unique feed stop IDs it encounters across all trips and records, for
 * each, whether the lookup resolved and at what distance. Pure observable
 * data surfaced via `_liveDataDiag`.
 *
 * v5.9.5 (AA1) — NEAREST-WINS depTIME VALIDATION: the inner stu loop
 * validates `stu.departure.time || stu.arrival.time` AND the 120-minute
 * forward window BEFORE running the nearest-wins comparison. Previously
 * the loop picked `matchedStu` on distance alone and then bailed on the
 * whole trip if `matchedStu` had no/past/too-far depTime — silently
 * losing any other valid stus within the same trip that were within the
 * radius. `processGtfsRtDepartures` uses per-stu validation (see its
 * inner loop), so the two tiers are now aligned on identical semantics
 * and produce consistent results on the same feed. This closes the
 * divergence class surfaced by v5.9.4 live verification where T2
 * alt-stop-id matched a feed stop but T4 coord-identity returned zero.
 *
 * v5.9.5 (AA3) — CROSS-TIER DIVERGENCE TELEMETRY: when the caller
 * supplies `knownMatchedTripIds` (a Set of trip IDs already matched by
 * T1/T2), the function records a `divergenceReport.byTrip[]` entry for
 * each such trip noting whether T4 also matched it and, if not, the
 * rejection reason (`not-seen`, `lookup-failed`, `out-of-radius`,
 * `no-dep-time`, `past-time`, `beyond-window`). This lets
 * `/cc-deploy-verify` and the admin panel diagnose any residual
 * divergence in a single deploy cycle. Rejection reasons
 * `no-dep-time` and `past-time` are legitimate stu-level edge cases;
 * `lookup-failed` and `out-of-radius` are BLOCKING regressions per
 * DEVELOPMENT-RULES.md §23.15 (v5.9.5 update).
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @param {number} targetLat - User's configured tram stop latitude
 * @param {number} targetLon - User's configured tram stop longitude
 * @param {number} routeType - 1 for tram (other modes not yet supported)
 * @param {Object} options - { identityRadiusMetres=40, targetRouteNumber=null, knownMatchedTripIds=null }
 * @returns {{ departures: Array, feedStopIdsResolved: Array<string>, matchedTripCount: number, sampleLookups: Array, totalUniqueFeedStopIds: number, divergenceReport: Object|null }}
 */
export function processCoordIdentityMatch(feed, targetLat, targetLon, routeType = 1, options = {}) {
  const nowMs = getNowMs();
  const result = {
    departures: [],
    feedStopIdsResolved: [],
    matchedTripCount: 0,
    // v5.9.4 (Z4): diagnostic fields
    sampleLookups: [],
    totalUniqueFeedStopIds: 0,
    // v5.9.5 (AA3): cross-tier divergence report (null when caller didn't supply knownMatchedTripIds)
    divergenceReport: null
  };
  if (!feed?.entity || routeType !== 1) return result;
  if (targetLat == null || targetLon == null) return result;

  const radiusMetres = options.identityRadiusMetres ?? TRAM_COORD_IDENTITY_RADIUS_METRES;
  // v5.9.4 (Z1): targetRouteNumber is a TIE-BREAK preference only, NEVER
  // a filter. See function JSDoc for rationale.
  const tieBreakRouteNumber = options.targetRouteNumber || null;
  const feedStopIdsResolvedSet = new Set();

  // v5.9.4 (Z4): diagnostic sample-lookups accumulator. Deduplicated by
  // feedStopId so a stop appearing on many trips only contributes once.
  const SAMPLE_LOOKUP_CAP = 20;
  const seenFeedStopIds = new Set();
  const sampleLookupsArr = [];

  // v5.9.5 (AA3): track which known-matched trip IDs T4 observed and
  // whether it matched them. `divergenceByTripId` maps tripId → rejection
  // reason array (or ['matched'] on success). Only populated when the
  // caller supplies knownMatchedTripIds.
  const knownMatchedTripIds = options.knownMatchedTripIds instanceof Set
    ? options.knownMatchedTripIds
    : null;
  const divergenceByTripId = knownMatchedTripIds ? new Map() : null;
  if (divergenceByTripId) {
    for (const tid of knownMatchedTripIds) {
      divergenceByTripId.set(tid, { reasons: ['not-seen'], nearestStu: null });
    }
  }

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    // v5.9.4 (Z1): NO route pre-filter. Every trip entity is scanned.
    const tripRoute = getRouteNumber(tripUpdate.trip?.routeId) || null;
    const tripMatchesTieBreak = tieBreakRouteNumber && tripRoute &&
      normalizeRouteNumber(tripRoute) === normalizeRouteNumber(tieBreakRouteNumber);

    const currentTripId = tripUpdate.trip?.tripId || null;
    // v5.9.5 (AA3): if this is a known-matched trip, track its rejection
    // reasons as we iterate. Start with an empty reasons array.
    const trackDivergence = divergenceByTripId && currentTripId && divergenceByTripId.has(currentTripId);
    const divergenceReasonsForTrip = trackDivergence ? new Set() : null;
    let nearestStuForTrip = trackDivergence ? { feedStopId: null, dist: Infinity } : null;

    // Scan the trip's stop sequence for a stop whose static coordinates
    // are within the tight identity radius of the target AND whose departure
    // time is valid (present, future, within 120 min). Nearest qualifying
    // within radius wins; on distance tie, prefer the route-number tie-break.
    //
    // v5.9.5 (AA1): depTime validation happens BEFORE nearest-wins selection
    // so an invalid stu cannot block later valid stus in the same trip.
    let matchedStu = null;
    let matchedFeedStopId = null;
    let matchedDist = Infinity;
    let matchedIsTieBreak = false;
    let matchedDepMs = null;
    let matchedMins = null;
    for (const stu of tripUpdate.stopTimeUpdate) {
      const feedStopId = String(stu.stopId || '');
      if (!feedStopId) continue;
      const coords = lookupTramStop(feedStopId);

      // v5.9.4 (Z4): record sample lookup diagnostics for the first
      // SAMPLE_LOOKUP_CAP unique feed stop IDs, whether or not they
      // produced a match. The lookup result is captured verbatim.
      if (!seenFeedStopIds.has(feedStopId)) {
        seenFeedStopIds.add(feedStopId);
        if (sampleLookupsArr.length < SAMPLE_LOOKUP_CAP) {
          const sResolvedExact = coords ? !!_tramStopByIdCache[feedStopId] : false;
          const sResolvedViaNumeric = coords ? !sResolvedExact : false;
          const sDistanceToTargetM = coords?.lat && coords?.lon
            ? Math.round(haversine(targetLat, targetLon, coords.lat, coords.lon) * 10) / 10
            : null;
          sampleLookupsArr.push({
            feedStopId,
            resolvedExact: sResolvedExact,
            resolvedViaNumeric: sResolvedViaNumeric,
            lookupLat: coords?.lat ?? null,
            lookupLon: coords?.lon ?? null,
            distanceToTargetM: sDistanceToTargetM
          });
        }
      }

      if (!coords?.lat || !coords?.lon) {
        if (trackDivergence) divergenceReasonsForTrip.add('lookup-failed');
        continue;
      }
      const dist = haversine(targetLat, targetLon, coords.lat, coords.lon);

      // v5.9.5 (AA3): track nearest stu overall for divergence reporting,
      // even if outside radius.
      if (trackDivergence && dist < nearestStuForTrip.dist) {
        nearestStuForTrip = { feedStopId, dist: Math.round(dist * 10) / 10 };
      }

      if (dist > radiusMetres) {
        if (trackDivergence) divergenceReasonsForTrip.add('out-of-radius');
        continue;
      }

      // v5.9.5 (AA1): validate depTime and time window BEFORE the nearest-
      // wins comparison. A stu with missing/past/too-far depTime MUST NOT
      // block later valid stus in the same trip. This aligns the function
      // with processGtfsRtDepartures's per-stu validation semantics.
      const depTime = stu.departure?.time || stu.arrival?.time;
      if (!depTime) {
        if (trackDivergence) divergenceReasonsForTrip.add('no-dep-time');
        continue;
      }
      const depMs = (depTime.low || depTime) * 1000;
      const mins = Math.round((depMs - nowMs) / 60000);
      if (mins <= 0) {
        if (trackDivergence) divergenceReasonsForTrip.add('past-time');
        continue;
      }
      if (mins > 120) {
        if (trackDivergence) divergenceReasonsForTrip.add('beyond-window');
        continue;
      }

      // Nearer always wins; on exact tie, tie-break by route preference
      if (dist < matchedDist || (dist === matchedDist && tripMatchesTieBreak && !matchedIsTieBreak)) {
        matchedStu = stu;
        matchedFeedStopId = feedStopId;
        matchedDist = dist;
        matchedIsTieBreak = tripMatchesTieBreak;
        matchedDepMs = depMs;
        matchedMins = mins;
      }
    }

    // v5.9.5 (AA3): finalise divergence report for this trip if tracked
    if (trackDivergence) {
      const reasonsArr = matchedStu ? ['matched'] : Array.from(divergenceReasonsForTrip);
      divergenceByTripId.set(currentTripId, {
        reasons: reasonsArr.length > 0 ? reasonsArr : ['not-seen'],
        nearestStu: nearestStuForTrip.feedStopId
          ? { feedStopId: nearestStuForTrip.feedStopId, distance: nearestStuForTrip.dist }
          : null
      });
    }

    if (!matchedStu) continue;

    // v5.9.5 (AA1): depTime / mins already validated inside the inner loop —
    // use the cached matchedDepMs and matchedMins directly. No re-computation.
    feedStopIdsResolvedSet.add(matchedFeedStopId);
    result.matchedTripCount++;

    const routeId = tripUpdate.trip?.routeId;
    const tripHeadsign = tripUpdate.trip?.tripHeadsign || '';
    const delay = matchedStu.departure?.delay || matchedStu.arrival?.delay || 0;

    result.departures.push({
      minutes: Math.max(0, matchedMins),
      departureTimeMs: matchedDepMs,
      destination: tripHeadsign || '', // v5.9.1 U8: empty when no headsign — formatter falls back to 'City'
      headsign: tripHeadsign || null,
      lineName: getLineName(routeId),
      routeNumber: getRouteNumber(routeId) || null,
      routeId,
      tripId: tripUpdate.trip?.tripId,
      isCitybound: false,
      delay: Math.round(delay / 60),
      isDelayed: delay > 60,
      isLive: true,
      source: 'gtfs-rt-coord-identity', // v5.9.2 (X1): new high-confidence source
      stopIdResolved: matchedFeedStopId,
      _identityDistM: Math.round(matchedDist * 10) / 10
    });
  }

  // Sort by soonest departure
  result.departures.sort((a, b) => a.minutes - b.minutes);
  result.feedStopIdsResolved = Array.from(feedStopIdsResolvedSet);
  // v5.9.4 (Z4): expose the diagnostic fields on the result
  result.sampleLookups = sampleLookupsArr;
  result.totalUniqueFeedStopIds = seenFeedStopIds.size;

  // v5.9.5 (AA3): assemble divergence report when caller supplied known
  // matched trip IDs. The report has shape:
  //   { knownTripsCount, byTrip: [{ tripId, matched, rejectionReasons, nearestStu }] }
  if (divergenceByTripId) {
    const byTrip = [];
    for (const [tripId, info] of divergenceByTripId.entries()) {
      const matched = info.reasons.length === 1 && info.reasons[0] === 'matched';
      byTrip.push({
        tripId,
        matched,
        rejectionReasons: matched ? [] : info.reasons,
        nearestStu: info.nearestStu
      });
    }
    result.divergenceReport = {
      knownTripsCount: knownMatchedTripIds.size,
      byTrip
    };
  }

  // Cap at 10 (same as other tiers)
  result.departures = result.departures.slice(0, 10);
  return result;
}

function processCoordinateProximitySearch(feed, stopId, routeType, state = 'VIC', targetRouteNumber = null, fallbackLat = null, fallbackLon = null, destLat = null, destLon = null) {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity || state !== 'VIC' || routeType !== 1) return departures;

  // v5.9.2 (X1): lookupTramStop is now module-level (see above).

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
      // Only filter when both route numbers are known — include if route is unknown
      // (coordinate-based tram matching often lacks routeId in GTFS-RT trips)
      if (tripRoute && normalizeRouteNumber(tripRoute) !== normalizeRouteNumber(targetRouteNumber)) continue;
    }

    const stus = tripUpdate.stopTimeUpdate;

    // v5.9.0 (T3 / B3): Cap the search radius regardless of targetRouteNumber.
    // The v5.4.8 widening to 500 m for route-filtered searches allowed departures
    // from nearby-but-wrong physical stops (e.g. a parallel-street stop served
    // by the same route number) to leak into the result set. The 500 m was a
    // heuristic for fallback-coords usage and should never exceed baseRadius.
    // V5.5.2: 600m when using fallback coordinates (home, not stop) to compensate
    // for the offset between home and the actual boarding location.
    // V5.4.8: 300m stop-centred — wide enough for intersection stops, narrow
    // enough to avoid parallel-road false matches.
    const searchRadius = usingFallbackCoords ? 600 : 300;
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
        // Tram GTFS-RT uses predicted times (delay already included) — no offset needed
        const depMs = (depTime.low || depTime) * 1000;
        const mins = Math.round((depMs - nowMs) / 60000);
        // v5.9.0 (T9 / B14): Plug the 5th past-departure path. v5.8.1 C3 fixed
        // 4 predicates but missed this coord-proximity loop. Align to `> 0`.
        if (mins > 0 && mins <= 120) {
          // T3: preserve the physical stop ID so downstream code can audit
          // which stop each tram came from (closes B11).
          candidates.push({ stu: stus[i], dist, depMs, mins, stopIdResolved: feedStopId });
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
      // No stops in this trip had coordinates in VIC_TRAM_STOPS_WITH_COORDS.
      // Accept the trip using earliest future stop_time_update as approximation.
      // The 600m search radius from actual stop (or home fallback) coordinates
      // already constrains matching — no additional route guard needed.
      let earliestFutureMs = null;
      for (const stu of stus) {
        const depTime = stu.departure?.time || stu.arrival?.time;
        if (!depTime) continue;
        // Tram-specific: predicted times, no delay offset needed
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
        // v5.9.1 (U8): When the GTFS-RT feed omits tripHeadsign for a tram
        // trip, the prior fallback to getLineName(routeId) returned "Route N"
        // as the destination — which caused the rendered leg title to read
        // "Route N to Route N" (tautological). Drop destination to empty so
        // the shared formatter falls back to its default ("City") instead.
        // Keep lineName populated below for internal uses.
        departures.push({
          minutes: mins,
          departureTimeMs: earliestFutureMs,
          destination: noCoordHeadsign || '',
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
          stopIdResolved: null, // no matched stop with coords in this branch
          _matchDist: searchRadius
        });
      }
      continue;
    }

    // Bracketing interpolation: instead of picking the nearest reported stop's time,
    // find the two stops that bracket the target geographically and interpolate.
    // This produces times within ~1 minute of actual for non-reporting stops.
    let best = null;
    let interpolatedSource = false;

    // Resolve all STUs in this trip with coordinates for interpolation
    const resolvedStus = stus
      .map(stu => {
        const feedStopId = String(stu.stopId);
        const coords = coordCache[feedStopId] || (() => {
          const s = lookupTramStop(feedStopId);
          coordCache[feedStopId] = s ? { lat: s.lat, lon: s.lon } : null;
          return coordCache[feedStopId];
        })();
        const depTime = stu.departure?.time || stu.arrival?.time;
        if (!coords || !depTime) return null;
        const depMs = (depTime.low || depTime) * 1000;
        return { lat: coords.lat, lon: coords.lon, depMs };
      })
      .filter(Boolean)
      .sort((a, b) => a.depMs - b.depMs);

    if (resolvedStus.length >= 2) {
      // Build cumulative distance along the route
      let cumDist = 0;
      const segments = [{ ...resolvedStus[0], cumDist: 0 }];
      for (let i = 1; i < resolvedStus.length; i++) {
        cumDist += haversine(resolvedStus[i-1].lat, resolvedStus[i-1].lon, resolvedStus[i].lat, resolvedStus[i].lon);
        segments.push({ ...resolvedStus[i], cumDist });
      }

      // Project target stop onto the route's cumulative distance
      let targetCumDist = 0;
      let minPerpDist = Infinity;
      for (let i = 0; i < segments.length - 1; i++) {
        const segLen = segments[i+1].cumDist - segments[i].cumDist;
        if (segLen < 1) continue;
        const distFromA = haversine(segments[i].lat, segments[i].lon, searchLat, searchLon);
        const distFromB = haversine(segments[i+1].lat, segments[i+1].lon, searchLat, searchLon);
        const projDist = (distFromA * distFromA - distFromB * distFromB + segLen * segLen) / (2 * segLen);
        const perpDist = Math.sqrt(Math.max(0, distFromA * distFromA - projDist * projDist));
        if (perpDist < minPerpDist && projDist >= -50 && projDist <= segLen + 50) {
          minPerpDist = perpDist;
          targetCumDist = segments[i].cumDist + Math.max(0, Math.min(segLen, projDist));
        }
      }

      // Interpolate if target projects onto route within 500m perpendicular distance
      if (minPerpDist < 500) {
        let before = segments[0], after = segments[segments.length - 1];
        for (let i = 0; i < segments.length - 1; i++) {
          if (segments[i].cumDist <= targetCumDist && segments[i+1].cumDist >= targetCumDist) {
            before = segments[i];
            after = segments[i+1];
            break;
          }
        }
        const segLen = after.cumDist - before.cumDist;
        const ratio = segLen > 0 ? (targetCumDist - before.cumDist) / segLen : 0;
        const interpMs = before.depMs + (after.depMs - before.depMs) * ratio;
        const interpMins = Math.round((interpMs - nowMs) / 60000);
        if (interpMins >= -2 && interpMins <= 120) {
          best = { depMs: interpMs, mins: interpMins, dist: minPerpDist, stu: candidates[0]?.stu || stus[0] };
          interpolatedSource = true;
        }
      }
    }

    // Fall back to nearest-stop selection when interpolation fails
    if (!best) {
      const futureCandidates = candidates.filter(c => c.mins >= 0);
      best = futureCandidates.length > 0
        ? futureCandidates.sort((a, b) => a.mins - b.mins || a.dist - b.dist)[0]
        : candidates.sort((a, b) => a.dist - b.dist)[0];
    }
    if (!best) continue;

    const delay = best.stu?.departure?.delay || best.stu?.arrival?.delay || 0;
    const routeId = tripUpdate.trip?.routeId;
    // Prefer headsign for destination — shows actual tram terminus direction
    // rather than line name which is less informative for tram route display.
    // v5.9.1 (U8): When headsign is absent, drop destination to empty rather
    // than falling back to getLineName (which returns "Route N" for trams and
    // produces tautological "Route N to Route N" titles in the renderer).
    const tripHeadsign = tripUpdate.trip?.tripHeadsign || '';
    departures.push({
      minutes: Math.max(0, best.mins),
      departureTimeMs: best.depMs,
      destination: tripHeadsign || '',
      headsign: tripHeadsign || null,
      lineName: getLineName(routeId),
      routeNumber: getRouteNumber(routeId) || null,
      routeId,
      tripId: tripUpdate.trip?.tripId,
      isCitybound: false,
      delay: Math.round(delay / 60),
      isDelayed: delay > 60,
      isLive: true,
      source: interpolatedSource ? 'gtfs-rt-interpolated' : 'gtfs-rt-coord',
      stopIdResolved: best.stu?.stopId ? String(best.stu.stopId) : null,
      _matchDist: best.dist  // Used for closest-route preference below
    });
  }

  // V5.5.0: Removed closest-route filter. When multiple routes serve the same
  // intersection, ALL routes' departures are returned — provides richer "Next:"
  // display with departures across alternating routes. The direction filter and
  // 300m search radius already constrain results adequately. findMatchingDeparture
  // in commutecompute.js handles route preference when the leg has a route number.

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
          // v5.8.1: Drop past departures at source (see route-level matching path).
          if (minutes > 0 && minutes <= 120) {
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
  // v5.9.1 (U9 / Section 1.1): diagnostic console.log removed
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

      // Train GTFS-RT uses scheduled time + delay offset; tram/bus use predicted times.
      // Only add delay for trains (routeType 0) to avoid double-counting.
      const delay = stu.departure?.delay || stu.arrival?.delay || 0;
      const exactIsTrainMode = routeType === 0 || routeType === '0';
      const depMs = ((depTime.low || depTime) * 1000) + (exactIsTrainMode ? delay * 1000 : 0);
      const minutes = Math.round((depMs - nowMs) / 60000);

      // V15.0: Include upcoming departures (next 120 min) — wider window for low-frequency services.
      // v5.8.1: Past departures (minutes <= 0) dropped at source — the main processor
      // writes raw `minutes` at line 1355 without defensive clamping, so negative values
      // were reaching data.raw.transit.trains and surfacing as "-1 min" in the UI.
      if (minutes > 0 && minutes <= 120) {
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

    // Weather code mapping (WMO 4677 codes emitted by Open-Meteo)
    // v5.8.1: Expanded to cover freezing drizzle (56/57), freezing rain (66/67),
    // snow grains (77), and snow showers (85/86) — previously these unmapped codes
    // fell through to the 'Unknown' fallback and leaked the literal string to the UI.
    const codes = {
      0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy',
      45: 'Foggy', 48: 'Foggy',
      51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
      56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
      61: 'Rain', 63: 'Rain', 65: 'Heavy Rain',
      66: 'Freezing Rain', 67: 'Freezing Rain',
      71: 'Snow', 73: 'Snow', 75: 'Heavy Snow',
      77: 'Snow Grains',
      80: 'Showers', 81: 'Showers', 82: 'Heavy Showers',
      85: 'Snow Showers', 86: 'Snow Showers',
      95: 'Storm', 96: 'Storm', 99: 'Storm'
    };

    const weatherCode = data.current?.weather_code;
    // v5.8.1: Fallback changed from 'Unknown' to 'Overcast' — a user-neutral cloudy
    // label that doesn't match `rainyConditions`, so an unmapped code never triggers
    // a false umbrella flag and never leaks the debug string 'Unknown' to the UI.
    const condition = codes[weatherCode] || 'Overcast';
    const precipitation = data.current?.precipitation || 0;
    const humidity = data.current?.relative_humidity_2m ?? null;
    const windSpeed = data.current?.wind_speed_10m ?? null;
    const uvIndex = data.current?.uv_index ?? null;

    // Determine if umbrella needed (current conditions).
    // v5.8.1: Freezing rain and freezing drizzle added so the umbrella flag fires
    // correctly for the newly-mapped WMO codes (66/67 and 56/57). Snow labels remain
    // excluded — umbrella is for rain, not snow.
    const rainyConditions = [
      'Rain', 'Heavy Rain', 'Drizzle', 'Showers', 'Heavy Showers',
      'Freezing Rain', 'Freezing Drizzle', 'Storm'
    ];
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
        // v5.8.1: Match the current-condition fallback (line 1488) — 'Overcast' not 'Unknown'.
        const hCondition = codes[hourlyWeatherCodes[i]] || 'Overcast';
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
