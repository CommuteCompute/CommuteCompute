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

/**
 * Check if a stop ID is in the Melbourne City Loop area
 * City Loop stations: Parliament, Melbourne Central, Flagstaff, Southern Cross, Flinders Street
 * These stops are typically 26xxx or 12204 (Flinders Street)
 */
function isCityLoopStop(stopId) {
  if (!stopId) return false;
  // City Loop terminus stops on metro lines
  // 26xxx = City Loop stations (Parliament, Melbourne Central, Flagstaff, Southern Cross)
  // 12204, 12205 = Flinders Street area
  return stopId.startsWith('26') || stopId === '12204' || stopId === '12205';
}

/**
 * Extract human-readable line name from GTFS route ID
 * e.g., "aus:vic:vic-02-SHM:" → "Sandringham"
 */
function getLineName(routeId) {
  if (!routeId) return 'City';
  // Extract line code (e.g., SHM from aus:vic:vic-02-SHM:)
  const match = routeId.match(/-([A-Z]{3}):?$/);
  if (match && METRO_LINE_NAMES[match[1]]) {
    return METRO_LINE_NAMES[match[1]];
  }
  // For trams, extract route number
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
    const response = await fetch(url, {
      headers: {
        'KeyId': apiKey  // Case-sensitive as per dev rules Section 11.1
      }
    });

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
 * @param {Object} options - { apiKey }
 * @returns {Array} - Array of departure objects
 */
export async function getDepartures(stopId, routeType, options = {}) {
  // V13.6 FIX: Per Section 23.6 - return empty array if no valid stop ID (not mock data)
  if (!stopId || stopId === 'null' || stopId === 'undefined') {
    console.warn(`[OpenData] getDepartures called with invalid stopId: ${stopId}`);
    return [];
  }

  // Map route type to GTFS-RT mode
  const modeMap = { 0: 'metro', 1: 'tram', 2: 'bus' };
  const mode = modeMap[routeType] || 'metro';

  try {
    const feed = await fetchGtfsRt(mode, 'trip-updates', options);

    if (!feed) {
      console.warn(`[OpenData] No feed returned for ${mode} (stopId=${stopId})`);
      return [];
    }

    // Process GTFS-RT TripUpdates
    const departures = processGtfsRtDepartures(feed, stopId, routeType);

    // V15.0: Attach diagnostic info for debugging GTFS-RT feed coverage
    const feedEntityCount = feed.entity?.length || 0;
    const sampleIds = new Set();
    if (departures.length === 0 && feedEntityCount > 0) {
      for (const entity of feed.entity) {
        if (sampleIds.size >= 10) break;
        const stus = entity.tripUpdate?.stopTimeUpdate;
        if (stus) {
          for (const stu of stus) {
            if (stu.stopId) sampleIds.add(String(stu.stopId));
            if (sampleIds.size >= 10) break;
          }
        }
      }
    }
    departures._feedInfo = {
      entityCount: feedEntityCount,
      sampleStopIds: [...sampleIds],
      queriedStopId: String(stopId),
      mode
    };

    if (departures.length === 0) {
      console.log(`[OpenData] No matching departures for stopId=${stopId} in ${mode} feed (${feedEntityCount} entities searched). Sample IDs: [${[...sampleIds].slice(0, 5).join(', ')}]`);
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

  // Stop ID matching - flexible for all modes to handle GTFS-RT ID formats
  // GTFS-RT may use bare IDs ("12179") or prefixed IDs ("aus:vic:metro:12179")
  // V15.0: Enhanced matching for tram feeds which may use different ID schemes
  const matchesStopId = (gtfsStopId) => {
    if (!gtfsStopId) return false;
    const gtfsStr = String(gtfsStopId);

    // Exact match - works for all modes
    if (gtfsStr === stopIdStr) return true;

    // Delimited suffix match - handles prefixed GTFS-RT stop IDs
    // e.g., "aus:vic:metro:12179" matches "12179", "tram-2505" matches "2505"
    if (gtfsStr.endsWith(`:${stopIdStr}`)) return true;
    if (gtfsStr.endsWith(`-${stopIdStr}`)) return true;
    if (gtfsStr.endsWith(`_${stopIdStr}`)) return true;
    if (gtfsStr.endsWith(`/${stopIdStr}`)) return true;

    // Numeric trailing match - handles non-delimited prefixes like "tram2505" or "stop2505"
    // Only if our stop ID is fully numeric and the feed ID ends with our exact digits
    if (/^\d+$/.test(stopIdStr)) {
      const numMatch = gtfsStr.match(/(\d+)$/);
      if (numMatch && numMatch[1] === stopIdStr) return true;
    }

    return false;
  };

  for (const entity of feed.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate?.stopTimeUpdate) continue;

    for (const stu of tripUpdate.stopTimeUpdate) {
      // Match stop ID (GTFS uses string IDs) - V13.6: Flexible matching
      if (!matchesStopId(stu.stopId)) continue;
      
      // Get departure or arrival time
      const depTime = stu.departure?.time || stu.arrival?.time;
      if (!depTime) continue;

      // Convert to milliseconds (GTFS-RT uses Unix seconds)
      const depMs = (depTime.low || depTime) * 1000;
      const minutes = Math.round((depMs - nowMs) / 60000);

      // V15.0: Include upcoming departures (next 120 min) — wider window for low-frequency services
      if (minutes >= 0 && minutes <= 120) {
        // Get delay info
        const delay = stu.departure?.delay || stu.arrival?.delay || 0;
        const isDelayed = delay > 60; // More than 1 minute delay

        // Determine destination - mode-aware logic
        const stops = tripUpdate.stopTimeUpdate;
        const finalStop = stops[stops.length - 1]?.stopId || '';
        const isCitybound = isCityLoopStop(finalStop);
        const routeId = tripUpdate.trip?.routeId;
        const lineName = getLineName(routeId);
        const destination = isCitybound ? 'City Loop' : lineName;

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
  const modeMap = { 0: 'metro', 1: 'tram', 2: 'bus' };
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation&timezone=Australia%2FMelbourne`;
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
    
    // Determine if umbrella needed
    const rainyConditions = ['Rain', 'Heavy Rain', 'Drizzle', 'Showers', 'Heavy Showers', 'Storm'];
    const umbrella = rainyConditions.includes(condition) || precipitation > 0;
    
    return {
      temp: Math.round(data.current?.temperature_2m ?? 20),
      condition,
      umbrella,
      precipitation,
      weatherCode,
      source: 'open-meteo'
    };
    
  } catch (e) {
    return {
      temp: 20,
      condition: 'Unknown',
      umbrella: false,
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
  const lat = config.lat || MELBOURNE_LAT;
  const lon = config.lon || MELBOURNE_LON;
  const options = { apiKey: config.apiKey };
  
  const [trains, trams, weather, disruptions] = await Promise.all([
    trainStopId ? getDepartures(trainStopId, 0, options) : Promise.resolve([]),
    tramStopId ? getDepartures(tramStopId, 1, options) : Promise.resolve([]),
    getWeather(lat, lon),
    getDisruptions(0, options).catch(() => [])
  ]);
  
  return {
    trains,
    trams,
    weather,
    disruptions,
    timestamp: new Date().toISOString()
  };
}

export default { getDepartures, getDisruptions, getWeather, getDashboardData, setApiKey };
