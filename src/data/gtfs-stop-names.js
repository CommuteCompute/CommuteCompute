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

import { VIC_METRO_STATIONS, VIC_TRAM_STOPS, VIC_BUS_STOPS } from './vic/gtfs-reference.js';

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
 * trainStation: 3-letter GTFS station code (resolved to platform IDs at runtime)
 * tram: primary tram stop ID for the suburb (verified against GTFS)
 * tramRoute: tram route number for GTFS-RT route-level fallback
 * bus: bus stop ID (null where not applicable)
 * line: train line name(s) serving the station
 */
export const MELBOURNE_STOP_IDS = {
  // Inner suburbs - Sandringham line
  'south yarra': { trainStation: 'SYR', tram: '18606', tramRoute: '78', bus: null, line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { trainStation: 'PRA', tram: '18611', tramRoute: '78', bus: null, line: 'Sandringham' },
  'windsor': { trainStation: 'WIN', tram: '18614', tramRoute: '78', bus: null, line: 'Sandringham' },
  'balaclava': { trainStation: 'BCV', tram: '18632', tramRoute: '67', bus: null, line: 'Sandringham' },
  'ripponlea': { trainStation: 'RIP', tram: null, tramRoute: null, bus: null, line: 'Sandringham' },
  'elsternwick': { trainStation: 'ELS', tram: null, tramRoute: null, bus: null, line: 'Sandringham' },
  'brighton beach': { trainStation: 'BBH', tram: null, tramRoute: null, bus: null, line: 'Sandringham' },
  'sandringham': { trainStation: 'SHM', tram: null, tramRoute: null, bus: null, line: 'Sandringham' },

  // Inner east - Glen Waverley/Alamein
  'richmond': { trainStation: 'RMD', tram: '19278', tramRoute: '70', bus: null, line: 'All lines' },
  'burnley': { trainStation: 'BLY', tram: null, tramRoute: null, bus: null, line: 'Glen Waverley/Alamein' },
  'hawthorn': { trainStation: 'HAW', tram: '20566', tramRoute: '16', bus: null, line: 'Glen Waverley/Alamein' },
  'camberwell': { trainStation: 'CAM', tram: '18964', tramRoute: '72', bus: null, line: 'Glen Waverley/Alamein' },
  'glen iris': { trainStation: 'GIR', tram: null, tramRoute: null, bus: null, line: 'Glen Waverley/Alamein' },

  // South east - Frankston/Pakenham/Cranbourne
  'malvern': { trainStation: 'MAL', tram: '18946', tramRoute: '5', bus: null, line: 'Pakenham/Cranbourne/Frankston' },
  'caulfield': { trainStation: 'CFD', tram: '18457', tramRoute: '67', bus: null, line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { trainStation: 'CNE', tram: null, tramRoute: null, bus: null, line: 'Pakenham/Cranbourne' },
  'murrumbeena': { trainStation: 'MRB', tram: null, tramRoute: null, bus: null, line: 'Pakenham/Cranbourne' },
  'hughesdale': { trainStation: 'HUG', tram: null, tramRoute: null, bus: null, line: 'Pakenham/Cranbourne' },
  'oakleigh': { trainStation: 'OAK', tram: null, tramRoute: null, bus: null, line: 'Pakenham/Cranbourne' },

  // North - Hurstbridge/Mernda
  'clifton hill': { trainStation: 'CHL', tram: '6046', tramRoute: '86', bus: null, line: 'Hurstbridge/Mernda' },
  'collingwood': { trainStation: 'CWD', tram: '6052', tramRoute: '86', bus: null, line: 'Hurstbridge/Mernda' },
  'fitzroy north': { trainStation: null, tram: '6142', tramRoute: '96', bus: null, line: 'Tram' },
  'northcote': { trainStation: 'NCE', tram: '6040', tramRoute: '86', bus: null, line: 'Hurstbridge/Mernda' },
  'fairfield': { trainStation: 'FFD', tram: null, tramRoute: null, bus: null, line: 'Hurstbridge/Mernda' },
  'alphington': { trainStation: 'ALP', tram: null, tramRoute: null, bus: null, line: 'Hurstbridge/Mernda' },
  'ivanhoe': { trainStation: 'IVA', tram: null, tramRoute: null, bus: null, line: 'Hurstbridge' },

  // West - Werribee/Williamstown
  'footscray': { trainStation: 'FSY', tram: null, tramRoute: null, bus: null, line: 'Werribee/Williamstown/Sunbury' },
  'seddon': { trainStation: 'SEN', tram: null, tramRoute: null, bus: null, line: 'Werribee/Williamstown' },
  'yarraville': { trainStation: 'YVE', tram: null, tramRoute: null, bus: null, line: 'Werribee/Williamstown' },
  'newport': { trainStation: 'NPT', tram: null, tramRoute: null, bus: null, line: 'Werribee/Williamstown' },
  'spotswood': { trainStation: 'SPT', tram: null, tramRoute: null, bus: null, line: 'Williamstown' },

  // North west - Craigieburn/Sunbury/Upfield
  'brunswick': { trainStation: 'BWK', tram: '16719', tramRoute: '19', bus: null, line: 'Upfield' },
  'coburg': { trainStation: 'COB', tram: null, tramRoute: null, bus: null, line: 'Upfield' },
  'fawkner': { trainStation: 'FAK', tram: null, tramRoute: null, bus: null, line: 'Upfield' },
  'glenroy': { trainStation: 'GRY', tram: null, tramRoute: null, bus: null, line: 'Craigieburn' },
  'broadmeadows': { trainStation: 'BMS', tram: null, tramRoute: null, bus: null, line: 'Craigieburn' },

  // CBD/Inner
  'melbourne': { trainStation: 'FSS', tram: '18090', tramRoute: null, bus: null, line: 'All lines' },
  'cbd': { trainStation: 'FSS', tram: '18090', tramRoute: null, bus: null, line: 'All lines' },
  'carlton': { trainStation: null, tram: '18789', tramRoute: '1', bus: null, line: 'Tram' },
  'fitzroy': { trainStation: null, tram: '6056', tramRoute: '86', bus: null, line: 'Tram' },
  'st kilda': { trainStation: null, tram: '20506', tramRoute: '96', bus: null, line: 'Tram' },
  'port melbourne': { trainStation: null, tram: '20496', tramRoute: '109', bus: null, line: 'Tram' },
  'south melbourne': { trainStation: null, tram: '18483', tramRoute: '1', bus: null, line: 'Tram' },
};

/**
 * Auto-detect stop IDs from home address
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId() fallback
 *
 * Returns station codes for trains (resolved to platform IDs by opendata-client.js)
 * and direct stop IDs for trams/buses.
 *
 * @param {string} address - Home address string
 * @returns {Object} Stop IDs and detected suburb info
 */
export function detectStopIdsFromAddress(address) {
  if (!address) return { trainStopId: null, tramStopId: null, busStopId: null };

  const addressLower = address.toLowerCase();

  for (const [suburb, ids] of Object.entries(MELBOURNE_STOP_IDS)) {
    if (addressLower.includes(suburb)) {
      return {
        trainStopId: ids.trainStation,  // 3-letter station code (or null)
        tramStopId: ids.tram,
        tramRouteNumber: ids.tramRoute || null,
        busStopId: ids.bus || null,
        detectedSuburb: suburb,
        line: ids.line
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
    line: null
  };
}
