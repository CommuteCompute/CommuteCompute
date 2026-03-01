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

import { VIC_METRO_STATIONS, VIC_TRAM_STOPS, VIC_BUS_STOPS, VIC_SUBURB_STOPS } from './vic/gtfs-reference.js';

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
 * Look up actual stop name by GTFS stop ID
 * @param {string} stopId - GTFS stop ID
 * @returns {string|null} Official stop name or null
 */
export function getStopNameById(stopId) {
  if (!stopId) return null;
  const id = String(stopId);
  if (GTFS_STOP_NAMES[id]) return GTFS_STOP_NAMES[id];
  // Station code lookup (3-letter codes like 'SYR' → 'South Yarra Station')
  if (VIC_METRO_STATIONS[id]) return VIC_METRO_STATIONS[id].name;
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
 * Auto-detect stop IDs from home address
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId() fallback
 *
 * Searches ALL 226 GTFS-derived suburb entries (auto-generated from .txt stop files).
 * Returns station codes for trains (resolved to platform IDs by opendata-client.js)
 * and direct stop IDs for trams/buses.
 *
 * @param {string} address - Home address string
 * @returns {Object} Stop IDs and detected suburb info
 */
export function detectStopIdsFromAddress(address) {
  if (!address) return { trainStopId: null, tramStopId: null, busStopId: null };

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
        line: null
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
    line: null
  };
}
