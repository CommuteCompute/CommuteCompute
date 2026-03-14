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
  for (const stop of VIC_TRAM_STOPS_WITH_COORDS) {
    const dist = haversine(lat, lon, stop.lat, stop.lon);
    if (dist <= radius && (!result.tram || dist < result.tram.distance)) {
      result.tram = { id: stop.id, name: cleanStopName(stop.name), distance: dist };
    }
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
 * @returns {Object} Stop IDs and detected suburb info
 */
export function detectStopIdsFromAddress(address, coords = null) {
  // PRIMARY: coordinate-based detection
  if (coords?.lat && coords?.lon) {
    const nearest = findNearestStops(coords.lat, coords.lon);
    return {
      trainStopId: nearest.train?.id || null,
      tramStopId: nearest.tram?.id || null,
      tramRouteNumber: null,
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
