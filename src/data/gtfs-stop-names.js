/**
 * GTFS Stop Names — Shared Module
 *
 * Central mapping of GTFS stop IDs to official Transport Victoria stop names.
 * Used by api/screen.js (e-ink renderer) and api/commutecompute.js (admin API).
 *
 * Per DEVELOPMENT-RULES Section 23.1.1 - Actual stop names for display.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/**
 * GTFS Stop ID to actual stop NAME mapping
 * Official Transport Victoria stop names
 */
export const GTFS_STOP_NAMES = {
  // Metro Train Stations
  '12179': 'South Yarra Station', '14289': 'Prahran Station', '14297': 'Windsor Station',
  '14233': 'Balaclava Station', '14247': 'Elsternwick Station', '14241': 'Brighton Beach Station',
  '14271': 'Sandringham Station', '12173': 'Richmond Station', '14243': 'Burnley Station',
  '14257': 'Hawthorn Station', '14246': 'Camberwell Station', '14253': 'Glen Iris Station',
  '14261': 'Malvern Station', '14245': 'Caulfield Station', '14244': 'Carnegie Station',
  '14267': 'Murrumbeena Station', '14259': 'Hughesdale Station', '14273': 'Oakleigh Station',
  '14249': 'Clifton Hill Station', '14251': 'Collingwood Station', '14269': 'Northcote Station',
  '14255': 'Footscray Station', '14283': 'Seddon Station', '14303': 'Yarraville Station',
  '14268': 'Newport Station', '14287': 'Spotswood Station', '14242': 'Brunswick Station',
  '14250': 'Coburg Station', '14252': 'Fawkner Station', '14256': 'Glenroy Station',
  '14240': 'Broadmeadows Station', '12204': 'Flinders Street Station', '12205': 'Flinders Street',
  '26001': 'Parliament Station', '26002': 'Melbourne Central Station',
  '26003': 'Flagstaff Station', '26004': 'Southern Cross Station',
  // Tram Stops (common ones)
  '2505': 'Toorak Rd/Chapel St', '2509': 'High St/Chapel St', '2513': 'Dandenong Rd/Chapel St',
  '2201': 'Church St/Swan St', '3001': 'Glenferrie Rd/Burwood Rd', '3010': 'Burke Rd/Riversdale Rd',
  '2101': 'Queens Pde/Hoddle St', '2103': 'Johnston St/Smith St', '1201': 'Sydney Rd/Brunswick',
  '2001': 'Flinders St/Swanston St', '3101': 'Fitzroy St/Acland St', '3201': 'Bay St/Port Melbourne',
  '3301': 'Clarendon St/South Melbourne'
};

/**
 * Look up actual stop name by GTFS stop ID
 * @param {string} stopId - GTFS stop ID
 * @returns {string|null} Official stop name or null
 */
export function getStopNameById(stopId) {
  if (!stopId) return null;
  return GTFS_STOP_NAMES[String(stopId)] || null;
}

/**
 * Melbourne suburb to GTFS stop ID mapping
 * Per DEVELOPMENT-RULES Section 23.1.1 - Auto-detect stop IDs from address
 * These are CITYBOUND platform IDs for common Melbourne suburbs
 */
export const MELBOURNE_STOP_IDS = {
  // Inner suburbs - Sandringham line
  'south yarra': { train: '12179', tram: '2505', bus: null, line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { train: '14289', tram: '2509', bus: null, line: 'Sandringham' },
  'windsor': { train: '14297', tram: '2513', bus: null, line: 'Sandringham' },
  'balaclava': { train: '14233', tram: '2519', bus: null, line: 'Sandringham' },
  'ripponlea': { train: null, tram: null, bus: null, line: 'Sandringham' },  // Was 14297 (Windsor duplicate)
  'elsternwick': { train: '14247', tram: null, bus: null, line: 'Sandringham' },
  'brighton beach': { train: '14241', tram: null, bus: null, line: 'Sandringham' },
  'sandringham': { train: '14271', tram: null, bus: null, line: 'Sandringham' },

  // Inner east - Glen Waverley/Alamein
  'richmond': { train: '12173', tram: '2201', bus: null, line: 'All lines' },
  'burnley': { train: '14243', tram: null, bus: null, line: 'Glen Waverley/Alamein' },
  'hawthorn': { train: '14257', tram: '3001', bus: null, line: 'Glen Waverley/Alamein' },
  'camberwell': { train: '14246', tram: '3010', bus: null, line: 'Glen Waverley/Alamein' },
  'glen iris': { train: '14253', tram: null, bus: null, line: 'Glen Waverley/Alamein' },

  // South east - Frankston/Pakenham/Cranbourne
  'malvern': { train: '14261', tram: '3008', bus: null, line: 'Pakenham/Cranbourne/Frankston' },
  'caulfield': { train: '14245', tram: '3012', bus: null, line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { train: '14244', tram: null, bus: null, line: 'Pakenham/Cranbourne' },
  'murrumbeena': { train: '14267', tram: null, bus: null, line: 'Pakenham/Cranbourne' },
  'hughesdale': { train: '14259', tram: null, bus: null, line: 'Pakenham/Cranbourne' },
  'oakleigh': { train: '14273', tram: null, bus: null, line: 'Pakenham/Cranbourne' },

  // North - Hurstbridge/Mernda
  'clifton hill': { train: '14249', tram: '2101', bus: null, line: 'Hurstbridge/Mernda' },
  'collingwood': { train: '14251', tram: '2103', bus: null, line: 'Hurstbridge/Mernda' },
  'fitzroy north': { train: null, tram: '2107', bus: null, line: 'Tram' },
  'northcote': { train: '14269', tram: '2115', bus: null, line: 'Hurstbridge/Mernda' },
  'fairfield': { train: null, tram: null, bus: null, line: 'Hurstbridge/Mernda' },  // Was 14251 (Collingwood duplicate)
  'alphington': { train: '14231', tram: null, bus: null, line: 'Hurstbridge/Mernda' },
  'ivanhoe': { train: null, tram: null, bus: null, line: 'Hurstbridge' },  // Was 14261 (Malvern duplicate)

  // West - Werribee/Williamstown
  'footscray': { train: '14255', tram: null, bus: null, line: 'Werribee/Williamstown/Sunbury' },
  'seddon': { train: '14283', tram: null, bus: null, line: 'Werribee/Williamstown' },
  'yarraville': { train: '14303', tram: null, bus: null, line: 'Werribee/Williamstown' },
  'newport': { train: '14268', tram: null, bus: null, line: 'Werribee/Williamstown' },
  'spotswood': { train: '14287', tram: null, bus: null, line: 'Williamstown' },

  // North west - Craigieburn/Sunbury/Upfield
  'brunswick': { train: '14242', tram: '1201', bus: null, line: 'Upfield' },
  'coburg': { train: '14250', tram: null, bus: null, line: 'Upfield' },
  'fawkner': { train: '14252', tram: null, bus: null, line: 'Upfield' },
  'glenroy': { train: '14256', tram: null, bus: null, line: 'Craigieburn' },
  'broadmeadows': { train: '14240', tram: null, bus: null, line: 'Craigieburn' },

  // CBD/Inner
  'melbourne': { train: '12204', tram: '2001', bus: null, line: 'All lines' },
  'cbd': { train: '12204', tram: '2001', bus: null, line: 'All lines' },
  'carlton': { train: null, tram: '1105', bus: null, line: 'Tram' },
  'fitzroy': { train: null, tram: '2105', bus: null, line: 'Tram' },
  'st kilda': { train: null, tram: '3101', bus: null, line: 'Tram' },
  'port melbourne': { train: null, tram: '3201', bus: null, line: 'Tram' },
  'south melbourne': { train: null, tram: '3301', bus: null, line: 'Tram' },
};

/**
 * Auto-detect stop IDs from home address
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId() fallback
 * @param {string} address - Home address string
 * @returns {Object} Stop IDs and detected suburb info
 */
export function detectStopIdsFromAddress(address) {
  if (!address) return { trainStopId: null, tramStopId: null, busStopId: null };

  const addressLower = address.toLowerCase();

  for (const [suburb, ids] of Object.entries(MELBOURNE_STOP_IDS)) {
    if (addressLower.includes(suburb)) {
      return {
        trainStopId: ids.train,
        tramStopId: ids.tram,
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
    busStopId: null,
    detectedSuburb: null,
    line: null
  };
}
