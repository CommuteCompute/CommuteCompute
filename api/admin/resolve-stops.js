/**
 * /api/admin/resolve-stops - Auto-detect GTFS stop IDs from address
 *
 * Per DEVELOPMENT-RULES Section 23.1.1 & 23.9.1:
 * Resolves transit stop IDs from a home address using the Melbourne
 * suburb-to-stop mapping. Returns matched station names, stop IDs,
 * and line information for setup wizard auto-detection.
 *
 * POST: { address: "123 Example St, South Yarra VIC 3141" }
 * Returns: { success, stops: { trainStopId, tramStopId, stationName, line, ... } }
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// Melbourne suburb to GTFS stop ID mapping (citybound platform IDs)
// Source: GTFS static data + DEVELOPMENT-RULES Section 23.1.2-23.1.3
const MELBOURNE_STOP_IDS = {
  // Inner suburbs - Sandringham line
  'south yarra': { train: 'SYR', tram: '18606', stationName: 'South Yarra Station', tramStop: 'Toorak Rd/Chapel St', line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { train: 'PRA', tram: '18611', stationName: 'Prahran Station', tramStop: 'High St/Chapel St', line: 'Sandringham' },
  'windsor': { train: 'WIN', tram: '18614', stationName: 'Windsor Station', tramStop: 'Dandenong Rd/Chapel St', line: 'Sandringham' },
  'balaclava': { train: 'BCV', tram: '18632', stationName: 'Balaclava Station', tramStop: 'Balaclava Rd', line: 'Sandringham' },
  'ripponlea': { train: 'RIP', tram: null, stationName: 'Ripponlea Station', tramStop: null, line: 'Sandringham' },
  'elsternwick': { train: 'ELS', tram: null, stationName: 'Elsternwick Station', tramStop: null, line: 'Sandringham' },
  'brighton beach': { train: 'BBH', tram: null, stationName: 'Brighton Beach Station', tramStop: null, line: 'Sandringham' },
  'sandringham': { train: 'SHM', tram: null, stationName: 'Sandringham Station', tramStop: null, line: 'Sandringham' },

  // Inner east - Glen Waverley/Alamein
  'richmond': { train: 'RMD', tram: '19278', stationName: 'Richmond Station', tramStop: 'Church St/Swan St', line: 'All lines' },
  'burnley': { train: 'BLY', tram: null, stationName: 'Burnley Station', tramStop: null, line: 'Glen Waverley/Alamein' },
  'hawthorn': { train: 'HAW', tram: '20566', stationName: 'Hawthorn Station', tramStop: 'Glenferrie Rd/Burwood Rd', line: 'Glen Waverley/Alamein' },
  'camberwell': { train: 'CAM', tram: '18964', stationName: 'Camberwell Station', tramStop: 'Burke Rd/Riversdale Rd', line: 'Glen Waverley/Alamein' },
  'glen iris': { train: 'GIR', tram: null, stationName: 'Glen Iris Station', tramStop: null, line: 'Glen Waverley/Alamein' },

  // South east - Frankston/Pakenham/Cranbourne
  'malvern': { train: 'MAL', tram: '18946', stationName: 'Malvern Station', tramStop: 'Glenferrie Rd/High St', line: 'Pakenham/Cranbourne/Frankston' },
  'caulfield': { train: 'CFD', tram: '18457', stationName: 'Caulfield Station', tramStop: 'Balaclava Rd/Hawthorn Rd', line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { train: 'CNE', tram: null, stationName: 'Carnegie Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'murrumbeena': { train: 'MRB', tram: null, stationName: 'Murrumbeena Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'hughesdale': { train: 'HUG', tram: null, stationName: 'Hughesdale Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'oakleigh': { train: 'OAK', tram: null, stationName: 'Oakleigh Station', tramStop: null, line: 'Pakenham/Cranbourne' },

  // North - Hurstbridge/Mernda
  'clifton hill': { train: 'CHL', tram: '6046', stationName: 'Clifton Hill Station', tramStop: 'Queens Pde/Hoddle St', line: 'Hurstbridge/Mernda' },
  'collingwood': { train: 'CWD', tram: '6052', stationName: 'Collingwood Station', tramStop: 'Johnston St/Smith St', line: 'Hurstbridge/Mernda' },
  'fitzroy north': { train: null, tram: '6142', stationName: null, tramStop: 'Fitzroy North', line: 'Tram' },
  'northcote': { train: 'NCE', tram: '6040', stationName: 'Northcote Station', tramStop: 'Northcote', line: 'Hurstbridge/Mernda' },
  'fairfield': { train: 'FFD', tram: null, stationName: 'Fairfield Station', tramStop: null, line: 'Hurstbridge/Mernda' },
  'alphington': { train: 'ALP', tram: null, stationName: 'Alphington Station', tramStop: null, line: 'Hurstbridge/Mernda' },
  'ivanhoe': { train: 'IVA', tram: null, stationName: 'Ivanhoe Station', tramStop: null, line: 'Hurstbridge' },

  // West - Werribee/Williamstown
  'footscray': { train: 'FSY', tram: null, stationName: 'Footscray Station', tramStop: null, line: 'Werribee/Williamstown/Sunbury' },
  'seddon': { train: 'SEN', tram: null, stationName: 'Seddon Station', tramStop: null, line: 'Werribee/Williamstown' },
  'yarraville': { train: 'YVE', tram: null, stationName: 'Yarraville Station', tramStop: null, line: 'Werribee/Williamstown' },
  'newport': { train: 'NPT', tram: null, stationName: 'Newport Station', tramStop: null, line: 'Werribee/Williamstown' },
  'spotswood': { train: 'SPT', tram: null, stationName: 'Spotswood Station', tramStop: null, line: 'Williamstown' },

  // North west - Craigieburn/Sunbury/Upfield
  'brunswick': { train: 'BWK', tram: '16719', stationName: 'Brunswick Station', tramStop: 'Sydney Rd/Brunswick', line: 'Upfield' },
  'coburg': { train: 'COB', tram: null, stationName: 'Coburg Station', tramStop: null, line: 'Upfield' },
  'fawkner': { train: 'FAK', tram: null, stationName: 'Fawkner Station', tramStop: null, line: 'Upfield' },
  'glenroy': { train: 'GRY', tram: null, stationName: 'Glenroy Station', tramStop: null, line: 'Craigieburn' },
  'broadmeadows': { train: 'BMS', tram: null, stationName: 'Broadmeadows Station', tramStop: null, line: 'Craigieburn' },

  // CBD/Inner
  'melbourne': { train: 'FSS', tram: '18090', stationName: 'Flinders Street Station', tramStop: 'Flinders St/Swanston St', line: 'All lines' },
  'cbd': { train: 'FSS', tram: '18090', stationName: 'Flinders Street Station', tramStop: 'Flinders St/Swanston St', line: 'All lines' },
  'carlton': { train: null, tram: '18789', stationName: null, tramStop: 'Carlton', line: 'Tram' },
  'fitzroy': { train: null, tram: '6056', stationName: null, tramStop: 'Fitzroy', line: 'Tram' },
  'st kilda': { train: null, tram: '20506', stationName: null, tramStop: 'Fitzroy St/Acland St', line: 'Tram' },
  'port melbourne': { train: null, tram: '20496', stationName: null, tramStop: 'Bay St/Port Melbourne', line: 'Tram' },
  'south melbourne': { train: null, tram: '18483', stationName: null, tramStop: 'Clarendon St/South Melbourne', line: 'Tram' },

  // Metro Tunnel stations
  'arden': { train: 'ARN', tram: null, stationName: 'Arden Station', tramStop: null, line: 'Metro Tunnel' },
  'parkville': { train: 'PKV', tram: null, stationName: 'Parkville Station', tramStop: null, line: 'Metro Tunnel' },
  'state library': { train: 'STL', tram: null, stationName: 'State Library Station', tramStop: null, line: 'Metro Tunnel' },
  'town hall': { train: 'THL', tram: null, stationName: 'Town Hall Station', tramStop: null, line: 'Metro Tunnel' },
  'anzac': { train: 'AZC', tram: null, stationName: 'Anzac Station', tramStop: null, line: 'Metro Tunnel' },
};

/**
 * Detect stop IDs from address string
 * Per Section 23.1.1: detectTrainStopId() pattern
 */
function detectStopIdsFromAddress(address) {
  if (!address) return null;

  const addressLower = address.toLowerCase();

  for (const [suburb, data] of Object.entries(MELBOURNE_STOP_IDS)) {
    if (addressLower.includes(suburb)) {
      return {
        suburb,
        trainStopId: data.train,
        tramStopId: data.tram,
        stationName: data.stationName,
        tramStop: data.tramStop,
        line: data.line
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { address } = req.body || {};

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ success: false, error: 'Address is required' });
    }

    const detected = detectStopIdsFromAddress(address);

    if (detected) {
      console.log(`[resolve-stops] Detected stops for "${address.substring(0, 40)}": ${detected.stationName || detected.tramStop}`);
      return res.json({
        success: true,
        detected: true,
        stops: detected
      });
    }

    // Per Section 23.1.1: No match → null → system uses fallback timetable
    console.log(`[resolve-stops] No suburb match for "${address.substring(0, 40)}" - fallback mode`);
    return res.json({
      success: true,
      detected: false,
      stops: null,
      message: 'No matching suburb found. Your dashboard will use timetable data.'
    });

  } catch (error) {
    console.error('[resolve-stops] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
