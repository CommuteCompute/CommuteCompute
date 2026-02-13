/**
 * CommuteCompute™ OpenData Client
 * Part of the Commute Compute System™
 * 
 * Uses Transport Victoria OpenData API with GTFS-RT format.
 * Per DEVELOPMENT-RULES Section 1.3 and 11.1:
 * - Base URL: https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1
 * - Auth: KeyId header (case-sensitive) with UUID format API key
 * - Format: GTFS Realtime (Protobuf)
 * 
 * Uses Open-Meteo for weather (free, no API key required).
 * 
 * THIRD-PARTY DATA ATTRIBUTION:
 * - Transit data: Transport Victoria OpenData (CC BY 4.0)
 * - Weather data: Open-Meteo API (free tier)
 * 
 * Copyright (c) 2025-2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getTransitApiKey } from '../data/kv-preferences.js';

// Transport Victoria OpenData API Configuration
// Per Development Rules Section 1.1 & 11.1 - GTFS-RT via OpenData
const API_BASE = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1';

// Melbourne coordinates (default)
const MELBOURNE_LAT = -37.8136;
const MELBOURNE_LON = 144.9631;

// Melbourne Metro line names (GTFS route ID suffix → line name)
const METRO_LINE_NAMES = {
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
const CITY_LOOP_STOP_IDS = new Set([
  '26001', '26002', '26003', '26004', // Parliament, Melbourne Central, Flagstaff, Southern Cross
  '12204', '12205'                     // Flinders Street platforms
]);

// Metro Tunnel station stop IDs (per api/admin/resolve-stops.js)
const METRO_TUNNEL_STOP_IDS = new Set([
  '26010',                              // Arden
  '26011',                              // Parkville
  '26012',                              // State Library
  '26013',                              // Town Hall
  '26014'                               // Anzac
]);

const INNER_CITY_STOP_IDS = new Set([
  ...CITY_LOOP_STOP_IDS,
  ...METRO_TUNNEL_STOP_IDS,
  '12173'                               // Richmond — gateway to city for SE lines
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
 * Fetch GTFS-RT feed from Transport Victoria OpenData API
 * @param {string} mode - 'metro', 'tram', or 'bus'
 * @param {string} feed - 'trip-updates', 'vehicle-positions', or 'service-alerts'
 * @param {Object} options - { apiKey }
 * @returns {Object} - Decoded GTFS-RT FeedMessage or null
 */
async function fetchGtfsRt(mode, feed, options = {}) {
  if (options.apiKey) {
    setApiKey(options.apiKey);
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    console.warn('[OpenData] No API key available for GTFS-RT fetch');
    return null;
  }

  const url = `${API_BASE}/${mode}/${feed}`;

  try {
    console.log(`[OpenData] Fetching GTFS-RT: ${mode}/${feed}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      headers: {
        'KeyId': apiKey  // Case-sensitive as per dev rules Section 11.1
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'no body');
      console.error(`[OpenData] GTFS-RT fetch failed: HTTP ${response.status} for ${mode}/${feed}: ${errorText.substring(0, 200)}`);
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
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
 * @param {Object} options - { apiKey, routeNumber }
 * @returns {Array} - Array of departure objects
 */
export async function getDepartures(stopId, routeType, options = {}) {
  // V13.6 FIX: Per Section 23.6 - return empty array if no valid stop ID (not mock data)
  if (!stopId || stopId === 'null' || stopId === 'undefined') {
    console.warn(`[OpenData] getDepartures called with invalid stopId: ${stopId}`);
    return [];
  }

  // Map route type to GTFS-RT mode
  // 0=metro train, 1=tram, 2=bus, 3=vline (regional train)
  const modeMap = { 0: 'metro', 1: 'tram', 2: 'bus', 3: 'vline' };
  const mode = modeMap[routeType] || 'metro';

  try {
    const feed = await fetchGtfsRt(mode, 'trip-updates', options);

    if (!feed) {
      console.warn(`[OpenData] No feed returned for ${mode} (stopId=${stopId})`);
      return [];
    }

    // Process GTFS-RT TripUpdates - try stop-level match first
    const departures = processGtfsRtDepartures(feed, stopId, routeType);

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

    // V15.0: Route-level fallback for trams/buses when stop-level match fails.
    // When the GTFS-RT feed has entities but none match the stop ID, search by
    // route number. Tram feeds may use different stop ID schemes than the static GTFS.
    // If we find trips on the matching route, extract departure estimates from any
    // stop time update on that trip.
    if (departures.length === 0 && feedEntityCount > 0 && options.routeNumber) {
      const routeFallbackDepartures = processRouteLevelDepartures(
        feed, stopId, options.routeNumber, routeType
      );
      if (routeFallbackDepartures.length > 0) {
        console.log(`[OpenData] Route-level fallback found ${routeFallbackDepartures.length} departures for route ${options.routeNumber} (stopId=${stopId} not matched directly)`);
        // Copy results to departures array (preserving array identity for _feedInfo)
        routeFallbackDepartures.forEach(d => departures.push(d));
      }
    }

    // V15.0: Broad tram fallback — GTFS-RT tram stop IDs differ from static GTFS.
    // When stop-level AND route-level both fail for trams and no route number is
    // configured, collect approximate timing from all routes in the feed.
    // This ensures tram legs are preserved in the display with live timing.
    if (departures.length === 0 && feedEntityCount > 0 && routeType === 1 && !options.routeNumber) {
      const broadDepartures = processAnyRouteDepartures(feed);
      if (broadDepartures.length > 0) {
        console.log(`[OpenData] Tram broad fallback: ${broadDepartures.length} departures from mixed routes (stopId=${stopId}, no route number configured)`);
        broadDepartures.forEach(d => departures.push(d));
      }
    }

    departures._feedInfo = {
      entityCount: feedEntityCount,
      sampleStopIds: [...sampleIds],
      sampleRouteIds: [...routeIds].slice(0, 10),
      queriedStopId: String(stopId),
      queriedRouteNumber: options.routeNumber || null,
      mode,
      matchMethod: departures.length > 0 && departures[0]?.source === 'gtfs-rt-route'
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
    return [];
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

  if (gtfsStr === stopIdStr) return true;
  if (gtfsStr.endsWith(`:${stopIdStr}`)) return true;
  if (gtfsStr.endsWith(`-${stopIdStr}`)) return true;
  if (gtfsStr.endsWith(`_${stopIdStr}`)) return true;
  if (gtfsStr.endsWith(`/${stopIdStr}`)) return true;

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
 * @param {string} routeNumber - Expected route number (e.g., "58" for tram)
 * @param {number} routeType - 0=metro, 1=tram, 2=bus
 * @returns {Array} - Departure objects from route-level matching
 */
function processRouteLevelDepartures(feed, stopId, routeNumber, routeType) {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity || !routeNumber) return departures;

  const targetRoute = String(routeNumber);
  const stopIdStr = String(stopId);

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    const routeId = tripUpdate.trip?.routeId;
    const extractedRoute = getRouteNumber(routeId);

    // Match by route number
    if (extractedRoute !== targetRoute) continue;

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
      const lineName = getLineName(routeId);
      const finalStop = stus[stus.length - 1]?.stopId || '';

      departures.push({
        minutes: Math.max(0, minutes),
        departureTimeMs: depMs,
        destination: lineName,
        lineName,
        routeNumber: extractedRoute,
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
  return deduped.slice(0, 5);
}

/**
 * V15.0: Broad tram fallback — extract departures from ALL routes in the feed.
 * Used when stop-level matching fails AND no specific route number is available.
 * GTFS-RT tram stop IDs differ from static GTFS, so this provides approximate
 * live timing data from any tram route in the feed (midpoint of each trip).
 * This is a last resort to ensure tram legs are preserved in the display.
 *
 * @param {Object} feed - Decoded GTFS-RT FeedMessage
 * @returns {Array} - Departure objects from mixed routes
 */
function processAnyRouteDepartures(feed) {
  const nowMs = getNowMs();
  const departures = [];
  if (!feed?.entity) return departures;

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate?.length) continue;

    const routeId = tripUpdate.trip?.routeId;
    const extractedRoute = getRouteNumber(routeId);
    const lineName = getLineName(routeId);
    const stus = tripUpdate.stopTimeUpdate;

    // Use future departure heuristic (same as route-level matching)
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
    // Use median of future stops — best estimate for a mid-route stop
    const pickIdx = Math.floor(futureDeps.length / 2);
    const picked = futureDeps[pickIdx];

    departures.push({
      minutes: Math.max(0, picked.minutes),
      departureTimeMs: picked.depMs,
      destination: lineName,
      lineName,
      routeNumber: extractedRoute,
      routeId,
      tripId: tripUpdate.trip?.tripId,
      isCitybound: false,
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
  return dedupedBroad.slice(0, 5);
}

/**
 * Process GTFS-RT trip updates into departure format
 * @param {Object} feed - Decoded FeedMessage
 * @param {number|string} stopId - Stop ID to filter
 * @param {number} routeType - 0=metro, 1=tram, 2=bus (for flexible matching)
 * @returns {Array} - Departure objects
 */
function processGtfsRtDepartures(feed, stopId, routeType = 0) {
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

        // Determine destination and direction — handles both City Loop and Metro Tunnel
        const stops = tripUpdate.stopTimeUpdate;
        const finalStop = stops[stops.length - 1]?.stopId || '';
        const userStopIndex = stops.findIndex(s => matchesStopId(s.stopId, stopIdStr));
        const isCitybound = isTrainCitybound(stops, userStopIndex);
        const routeId = tripUpdate.trip?.routeId;
        const lineName = getLineName(routeId);
        const destination = isCitybound ? 'City' : lineName;

        // Detect Metro Tunnel vs City Loop line from route ID
        const lineCode = routeId?.match(/-([A-Z]{3}):?$/)?.[1] || '';
        const isMetroTunnel = METRO_TUNNEL_LINE_CODES.has(lineCode);

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

  // Sort by departure time and limit to 5
  departures.sort((a, b) => a.minutes - b.minutes);
  return departures.slice(0, 5);
}

// V13.6: getMockDepartures removed per Section 23.6 — no mock data fallbacks.
// All code paths return [] when no live departures available.

/**
 * Get service disruptions
 * @param {number} routeType - 0=train, 1=tram, 2=bus
 * @param {Object} options - { apiKey }
 */
export async function getDisruptions(routeType, options = {}) {
  const modeMap = { 0: 'metro', 1: 'tram', 2: 'bus', 3: 'vline' };
  const mode = modeMap[routeType] || 'metro';
  
  try {
    const feed = await fetchGtfsRt(mode, 'service-alerts', options);
    
    if (!feed?.entity) {
      return [];
    }
    
    // Process GTFS-RT service alerts
    // V13.6: Include mode and affected routes for proper filtering
    return feed.entity.map(entity => {
      const alert = entity.alert;
      const title = alert?.headerText?.translation?.[0]?.text || 'Alert';
      const description = alert?.descriptionText?.translation?.[0]?.text || '';

      // Extract affected routes from informed entities
      const affectedRoutes = [];
      if (alert?.informedEntity) {
        for (const ie of alert.informedEntity) {
          if (ie.routeId) affectedRoutes.push(ie.routeId);
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
        type: 'disruption'
      };
    });
    
  } catch (error) {
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
export async function getWeather(lat = MELBOURNE_LAT, lon = MELBOURNE_LON) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation&hourly=weather_code,precipitation,temperature_2m,apparent_temperature&forecast_days=1&timezone=Australia%2FMelbourne`;
    const res = await fetch(url);

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
    const nowHour = new Date().getHours();

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
          isRainy: rainyConditions.includes(hCondition) || (hourlyPrecip[i] || 0) > 0
        });
      }
    }

    return {
      temp: Math.round(data.current?.temperature_2m ?? 20),
      condition,
      umbrella,
      precipitation,
      weatherCode,
      dayForecast,
      source: 'open-meteo'
    };

  } catch (e) {
    return {
      temp: 20,
      condition: 'Unknown',
      umbrella: false,
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

export default { getDepartures, getDisruptions, getWeather, getDashboardData, setApiKey };
