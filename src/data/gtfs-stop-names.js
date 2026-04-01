/**
 * GTFS Stop Names — Shared Module
 *
 * Central mapping of GTFS stop IDs to official Transport Victoria stop names.
 * Used by api/screen.js (e-ink renderer) and api/commutecompute.js (admin API).
 *
 * Per DEVELOPMENT-RULES Section 23.1.1 - Actual stop names for display.
 *
 * V15.0: All stop IDs are now GTFS-verified via src/data/vic/gtfs-reference.js
 * (auto-generated from Transport Victoria static GTFS). Previous stop IDs were
 * fabricated and did not match GTFS-RT feeds.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { VIC_METRO_STATIONS, VIC_TRAM_STOPS, VIC_BUS_STOPS, VIC_SUBURB_STOPS, VIC_TRAM_STOPS_WITH_COORDS, VIC_BUS_STOPS_WITH_COORDS } from './vic/gtfs-reference.js';
import { haversine } from '../utils/haversine.js';
import { findNearestStop } from './fallback-timetables.js';

/**
 * GTFS Stop ID to actual stop NAME mapping
 * Auto-generated from verified GTFS reference data:
 * - Metro: every platform ID maps to its station name
 * - Tram: direct stop ID to stop name
 * - Bus: direct stop ID to stop name
 */
export const GTFS_STOP_NAMES = (() => {
  const names = {};
  // Metro: every platform ID maps to its station name
  for (const station of Object.values(VIC_METRO_STATIONS)) {
    for (const pid of station.platforms) {
      names[pid] = station.name;
    }
  }
  // Tram: direct stop ID to name
  for (const [sid, name] of Object.entries(VIC_TRAM_STOPS)) {
    names[sid] = name;
  }
  // Bus: direct stop ID to name
  for (const [sid, name] of Object.entries(VIC_BUS_STOPS)) {
    names[sid] = name;
  }
  return names;
})();

/**
 * Strip route number suffix from GTFS stop names (e.g. "Tivoli Rd/Toorak Rd #129" → "Tivoli Rd/Toorak Rd")
 * Route numbers are GTFS metadata, not part of the official stop name.
 */
export function cleanStopName(name) {
  if (!name) return name;
  return name.replace(/\s+#\d+$/, '');
}

/**
 * Look up actual stop name by GTFS stop ID
 * @param {string} stopId - GTFS stop ID
 * @returns {string|null} Official stop name or null
 */
export function getStopNameById(stopId) {
  if (!stopId) return null;
  const id = String(stopId);
  if (GTFS_STOP_NAMES[id]) return cleanStopName(GTFS_STOP_NAMES[id]);
  // Station code lookup (3-letter codes like 'SYR' → 'South Yarra Station')
  if (VIC_METRO_STATIONS[id]) return cleanStopName(VIC_METRO_STATIONS[id].name);
  return null;
}

/**
 * Melbourne suburb to station/stop mapping
 * Per DEVELOPMENT-RULES Section 23.1.1 - Auto-detect stop IDs from address
 *
 * AUTO-GENERATED from GTFS .txt stop files via generate-gtfs-reference.js.
 * Covers ALL 226 metro stations + nearest tram/bus stops by coordinates.
 * No hardcoding — regenerate with: node scripts/generate-gtfs-reference.js
 *
 * trainStation: 3-letter GTFS station code (resolved to platform IDs at runtime)
 * tram: nearest tram stop ID within 1km (by haversine distance)
 * bus: nearest bus stop ID within 500m (by haversine distance)
 */
export const MELBOURNE_STOP_IDS = VIC_SUBURB_STOPS;

/**
 * State-specific suburb-to-stop mappings for non-VIC capital cities.
 * Used as fallback when coordinate detection returns null.
 * Format matches MELBOURNE_STOP_IDS: suburb name (lowercase) → { trainStation, tram/lightrail, bus, stationName }
 */
const STATE_SUBURB_STOPS = {
  NSW: {
    'sydney': { trainStation: '10101100', busStop: '209310', stationName: 'Central Station' },
    'circular quay': { trainStation: '10101124', stationName: 'Circular Quay' },
    'town hall': { trainStation: '10101120', stationName: 'Town Hall' },
    'wynyard': { trainStation: '10101123', stationName: 'Wynyard' },
    'martin place': { trainStation: '10101126', stationName: 'Martin Place' },
    'kings cross': { trainStation: '10101128', stationName: 'Kings Cross' },
    'redfern': { trainStation: '10101130', stationName: 'Redfern' },
    'north sydney': { trainStation: '10101132', stationName: 'North Sydney' },
    'chatswood': { trainStation: '10101210', stationName: 'Chatswood' },
    'parramatta': { trainStation: '10101320', busStop: '209314', stationName: 'Parramatta' },
    'strathfield': { trainStation: '10101211', stationName: 'Strathfield' },
    'bondi junction': { trainStation: '10101610', busStop: '209313', stationName: 'Bondi Junction' },
    'epping': { trainStation: '10101214', stationName: 'Epping' },
    'hornsby': { trainStation: '10101216', stationName: 'Hornsby' },
    'hurstville': { trainStation: '10101612', stationName: 'Hurstville' },
    'blacktown': { trainStation: '10101324', stationName: 'Blacktown' },
    'penrith': { trainStation: '10101326', stationName: 'Penrith' },
    'liverpool': { trainStation: '10101328', stationName: 'Liverpool' },
    'campbelltown': { trainStation: '10101616', stationName: 'Campbelltown' },
    'macquarie park': { trainStation: '10101222', stationName: 'Macquarie Park' },
    'olympic park': { trainStation: '10101322', stationName: 'Olympic Park' },
    'newcastle': { trainStation: '10102100', stationName: 'Newcastle Interchange' },
    'wollongong': { trainStation: '10103100', stationName: 'Wollongong' },
  },
  QLD: {
    'brisbane': { trainStation: '600014', busStop: '001040', stationName: 'Central' },
    'roma street': { trainStation: '600015', stationName: 'Roma Street' },
    'fortitude valley': { trainStation: '600016', stationName: 'Fortitude Valley' },
    'south bank': { trainStation: '600030', stationName: 'South Bank' },
    'south brisbane': { trainStation: '600031', stationName: 'South Brisbane' },
    'toowong': { trainStation: '600236', stationName: 'Toowong' },
    'indooroopilly': { trainStation: '600237', stationName: 'Indooroopilly' },
    'bowen hills': { trainStation: '600012', stationName: 'Bowen Hills' },
    'milton': { trainStation: '600235', stationName: 'Milton' },
    'caboolture': { trainStation: '600050', stationName: 'Caboolture' },
    'helensvale': { trainStation: '600080', stationName: 'Helensvale' },
    'robina': { trainStation: '600082', stationName: 'Robina' },
    'gold coast': { trainStation: '600080', stationName: 'Helensvale' },
    'surfers paradise': { busStop: '001700', stationName: 'Surfers Paradise' },
  },
  SA: {
    'adelaide': { trainStation: '9100001', tram: '9200001', busStop: '9300050', stationName: 'Adelaide' },
    'glenelg': { trainStation: '9100300', tram: '9200030', stationName: 'Glenelg' },
    'north adelaide': { trainStation: '9100009', stationName: 'North Adelaide' },
    'goodwood': { trainStation: '9100010', stationName: 'Goodwood' },
    'mitcham': { trainStation: '9100013', stationName: 'Mitcham' },
    'blackwood': { trainStation: '9100014', stationName: 'Blackwood' },
    'gawler': { trainStation: '9100020', stationName: 'Gawler Central' },
    'seaford': { trainStation: '9100021', stationName: 'Seaford' },
    'noarlunga': { trainStation: '9100022', stationName: 'Noarlunga Centre' },
    'elizabeth': { trainStation: '9100023', stationName: 'Elizabeth' },
    'salisbury': { trainStation: '9100024', stationName: 'Salisbury' },
  },
  WA: {
    'perth': { trainStation: '99T2001', busStop: '10001', stationName: 'Perth Station' },
    'fremantle': { trainStation: '99T2140', busStop: '10051', stationName: 'Fremantle' },
    'joondalup': { trainStation: '99T2072', busStop: '10052', stationName: 'Joondalup' },
    'subiaco': { trainStation: '99T2010', stationName: 'Subiaco' },
    'leederville': { trainStation: '99T2011', stationName: 'Leederville' },
    'stirling': { trainStation: '99T2012', stationName: 'Stirling' },
    'midland': { trainStation: '99T2021', stationName: 'Midland' },
    'armadale': { trainStation: '99T2031', stationName: 'Armadale' },
    'mandurah': { trainStation: '99T2034', stationName: 'Mandurah' },
    'rockingham': { trainStation: '99T2035', stationName: 'Rockingham' },
    'cockburn': { trainStation: '99T2032', stationName: 'Cockburn Central' },
  },
  TAS: {
    'hobart': { busStop: '20001', stationName: 'Hobart CBD' },
    'sandy bay': { busStop: '20004', stationName: 'Sandy Bay' },
    'glenorchy': { busStop: '20005', stationName: 'Glenorchy' },
    'kingston': { busStop: '20007', stationName: 'Kingston' },
    'launceston': { busStop: '21001', stationName: 'Launceston CBD' },
    'burnie': { busStop: '22001', stationName: 'Burnie CBD' },
    'devonport': { busStop: '23001', stationName: 'Devonport' },
  },
  ACT: {
    'canberra': { lightrail: '3000001', busStop: '3100001', stationName: 'Alinga Street' },
    'civic': { lightrail: '3000001', busStop: '3100002', stationName: 'Civic' },
    'gungahlin': { lightrail: '3000015', busStop: '3100055', stationName: 'Gungahlin Place' },
    'woden': { lightrail: '3000021', busStop: '3100050', stationName: 'Woden' },
    'belconnen': { busStop: '3100051', stationName: 'Belconnen' },
    'tuggeranong': { busStop: '3100052', stationName: 'Tuggeranong' },
    'dickson': { lightrail: '3000008', busStop: '3100053', stationName: 'Dickson' },
    'barton': { busStop: '3100056', stationName: 'Barton' },
  },
  NT: {
    'darwin': { busStop: '4000001', stationName: 'Darwin City' },
    'casuarina': { busStop: '4000004', stationName: 'Casuarina' },
    'palmerston': { busStop: '4000005', stationName: 'Palmerston' },
    'alice springs': { busStop: '4100001', stationName: 'Alice Springs' },
  }
};

/**
 * Find nearest stops by coordinates from GTFS reference data
 * Searches VIC_METRO_STATIONS (with coords), VIC_TRAM_STOPS_WITH_COORDS,
 * and VIC_BUS_STOPS_WITH_COORDS for the closest stop of each mode.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Object} options - { radiusMeters: 1500 }
 * @returns {Object} { train: { id, name, distance, platforms }, tram: { id, name, distance }, bus: { id, name, distance } }
 */
export function findNearestStops(lat, lon, options = {}) {
  const radius = options.radiusMeters || 1500;
  const result = {};

  // Train: search VIC_METRO_STATIONS (now with coords)
  for (const [code, station] of Object.entries(VIC_METRO_STATIONS)) {
    if (!station.lat || !station.lon) continue;
    const dist = haversine(lat, lon, station.lat, station.lon);
    if (dist <= radius && (!result.train || dist < result.train.distance)) {
      result.train = { id: code, name: cleanStopName(station.name), distance: dist, platforms: station.platforms };
    }
  }

  // Tram: search VIC_TRAM_STOPS_WITH_COORDS
  // V5.5.5: Collect nearest stop PER ROUTE at intersections where multiple routes
  // have nearby stops. Prevents wrong-route selection when one route's stop is
  // 1m closer than another's. The primary result uses most-frequent or preferred route.
  const tramByRoute = {};
  for (const stop of VIC_TRAM_STOPS_WITH_COORDS) {
    const dist = haversine(lat, lon, stop.lat, stop.lon);
    if (dist <= radius) {
      const routeMatch = stop.name?.match(/#(\d+)/);
      const routeNum = routeMatch?.[1] || 'unknown';
      if (!tramByRoute[routeNum] || dist < tramByRoute[routeNum].distance) {
        tramByRoute[routeNum] = { id: stop.id, name: cleanStopName(stop.name), distance: dist, routeNumber: routeNum === 'unknown' ? null : routeNum };
      }
    }
  }
  // Pick the nearest overall as primary result (backward compat)
  const tramEntries = Object.values(tramByRoute).sort((a, b) => a.distance - b.distance);
  if (tramEntries.length > 0) {
    result.tram = tramEntries[0];
    // Expose all routes at this location for better route selection
    result.tramRoutes = tramEntries;
  }

  // Bus: search VIC_BUS_STOPS_WITH_COORDS
  for (const stop of VIC_BUS_STOPS_WITH_COORDS) {
    const dist = haversine(lat, lon, stop.lat, stop.lon);
    if (dist <= radius && (!result.bus || dist < result.bus.distance)) {
      result.bus = { id: stop.id, name: cleanStopName(stop.name), distance: dist };
    }
  }

  return result;
}

/**
 * Find multiple nearest stops by coordinates from GTFS reference data
 * Returns top N stops per mode sorted by distance — used for station
 * preference dropdowns so users can select from nearby alternatives.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Object} options - { radiusMeters: 1500, count: 3 }
 * @returns {Object} { train: [{ id, name, distance, platforms }], tram: [{ id, name, distance }], bus: [{ id, name, distance }] }
 */
export function findNearestStopsMultiple(lat, lon, options = {}) {
  const radius = options.radiusMeters || 1500;
  const count = options.count || 3;
  const trains = [];
  const trams = [];
  const buses = [];

  // Train: search VIC_METRO_STATIONS
  for (const [code, station] of Object.entries(VIC_METRO_STATIONS)) {
    if (!station.lat || !station.lon) continue;
    const dist = haversine(lat, lon, station.lat, station.lon);
    if (dist <= radius) {
      trains.push({ id: code, name: cleanStopName(station.name), distance: Math.round(dist), platforms: station.platforms });
    }
  }

  // Tram: search VIC_TRAM_STOPS_WITH_COORDS
  for (const stop of VIC_TRAM_STOPS_WITH_COORDS) {
    const dist = haversine(lat, lon, stop.lat, stop.lon);
    if (dist <= radius) {
      trams.push({ id: stop.id, name: cleanStopName(stop.name), distance: Math.round(dist) });
    }
  }

  // Bus: search VIC_BUS_STOPS_WITH_COORDS
  for (const stop of VIC_BUS_STOPS_WITH_COORDS) {
    const dist = haversine(lat, lon, stop.lat, stop.lon);
    if (dist <= radius) {
      buses.push({ id: stop.id, name: cleanStopName(stop.name), distance: Math.round(dist) });
    }
  }

  // Sort by distance and take top N
  trains.sort((a, b) => a.distance - b.distance);
  trams.sort((a, b) => a.distance - b.distance);
  buses.sort((a, b) => a.distance - b.distance);

  return {
    train: trains.slice(0, count),
    tram: trams.slice(0, count),
    bus: buses.slice(0, count)
  };
}

/**
 * Auto-detect stop IDs from home address (or coordinates)
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId() fallback
 *
 * PRIMARY: If coords are provided, uses coordinate-based nearest-stop detection
 * from GTFS reference data (all 226 stations + 1637 tram + 4151 bus stops).
 *
 * FALLBACK: Searches ALL 226 GTFS-derived suburb entries (auto-generated from .txt stop files).
 * Returns station codes for trains (resolved to platform IDs by opendata-client.js)
 * and direct stop IDs for trams/buses.
 *
 * @param {string} address - Home address string
 * @param {Object|null} coords - Optional { lat, lon } for coordinate-based detection
 * @param {string} state - Australian state code (e.g. 'VIC', 'NSW'). Defaults to 'VIC'.
 * @returns {Object} Stop IDs and detected suburb info
 */
export function detectStopIdsFromAddress(address, coords = null, state = 'VIC') {
  // Non-VIC states: coordinate-based detection from fallback data, then suburb name matching
  if (state !== 'VIC') {
    // Try coordinates first (preferred — more accurate)
    if (coords?.lat && coords?.lon) {
      const nearestTrain = findNearestStop(state, coords.lat, coords.lon, 'train') || findNearestStop(state, coords.lat, coords.lon, 'metro');
      const nearestTram = findNearestStop(state, coords.lat, coords.lon, 'tram') || findNearestStop(state, coords.lat, coords.lon, 'lightrail');
      const nearestBus = findNearestStop(state, coords.lat, coords.lon, 'bus');
      const nearestFerry = findNearestStop(state, coords.lat, coords.lon, 'ferry');
      return {
        trainStopId: nearestTrain?.id || null,
        tramStopId: nearestTram?.id || null,
        tramRouteNumber: null,
        busStopId: nearestBus?.id || null,
        ferryStopId: nearestFerry?.id || null,
        detectedSuburb: null,
        stationName: nearestTrain?.name || nearestTram?.name || null,
        line: null,
        source: 'coordinates-fallback'
      };
    }

    // Suburb name matching for non-VIC states
    const stateSuburbs = STATE_SUBURB_STOPS[state];
    if (stateSuburbs && address) {
      const addrLower = address.toLowerCase();
      const suburbKeys = Object.keys(stateSuburbs).sort((a, b) => b.length - a.length);
      for (const suburb of suburbKeys) {
        if (addrLower.includes(suburb)) {
          const ids = stateSuburbs[suburb];
          return {
            trainStopId: ids.trainStation || null,
            tramStopId: ids.tram || ids.lightrail || null,
            tramRouteNumber: null,
            busStopId: ids.busStop || null,
            detectedSuburb: suburb,
            stationName: ids.stationName || null,
            line: null,
            source: 'suburb-state'
          };
        }
      }
    }

    return { trainStopId: null, tramStopId: null, tramRouteNumber: null, busStopId: null, detectedSuburb: null, stationName: null, line: null, source: null };
  }

  // VIC PRIMARY: coordinate-based detection from full GTFS reference data
  if (coords?.lat && coords?.lon) {
    const nearest = findNearestStops(coords.lat, coords.lon);
    return {
      trainStopId: nearest.train?.id || null,
      tramStopId: nearest.tram?.id || null,
      tramRouteNumber: nearest.tram?.routeNumber || null,
      tramRoutes: nearest.tramRoutes?.map(t => t.routeNumber).filter(Boolean) || [],
      busStopId: nearest.bus?.id || null,
      detectedSuburb: null,
      stationName: nearest.train?.name || null,
      line: null,
      source: 'coordinates'
    };
  }

  // FALLBACK: existing suburb name matching
  if (!address) return { trainStopId: null, tramStopId: null, tramRouteNumber: null, busStopId: null, detectedSuburb: null, stationName: null, line: null, source: null };

  const addressLower = address.toLowerCase();

  // Search auto-generated VIC_SUBURB_STOPS (226 suburbs from GTFS)
  // Longest suburb name match first to prevent partial matches
  const suburbs = Object.keys(MELBOURNE_STOP_IDS).sort((a, b) => b.length - a.length);

  for (const suburb of suburbs) {
    if (addressLower.includes(suburb)) {
      const ids = MELBOURNE_STOP_IDS[suburb];
      return {
        trainStopId: ids.trainStation || null,
        tramStopId: ids.tram || null,
        tramRouteNumber: null,
        busStopId: ids.bus || null,
        detectedSuburb: suburb,
        stationName: ids.stationName || null,
        line: null,
        source: 'suburb'
      };
    }
  }

  // Per DEVELOPMENT-RULES Section 23.1.1: No hardcoded defaults
  return {
    trainStopId: null,
    tramStopId: null,
    tramRouteNumber: null,
    busStopId: null,
    detectedSuburb: null,
    stationName: null,
    line: null,
    source: null
  };
}
