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
 * Licensed under AGPL-3.0
 */

// Melbourne suburb to GTFS stop ID mapping (citybound platform IDs)
// Source: GTFS static data + DEVELOPMENT-RULES Section 23.1.2-23.1.3
const MELBOURNE_STOP_IDS = {
  // Inner suburbs - Sandringham line
  'south yarra': { train: '12179', tram: '2505', stationName: 'South Yarra Station', tramStop: 'Toorak Rd/Chapel St', line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { train: '14289', tram: '2509', stationName: 'Prahran Station', tramStop: 'High St/Chapel St', line: 'Sandringham' },
  'windsor': { train: '14297', tram: '2513', stationName: 'Windsor Station', tramStop: 'Dandenong Rd/Chapel St', line: 'Sandringham' },
  'balaclava': { train: '14233', tram: '2519', stationName: 'Balaclava Station', tramStop: 'Balaclava Rd', line: 'Sandringham' },
  'ripponlea': { train: '14297', tram: null, stationName: 'Ripponlea Station', tramStop: null, line: 'Sandringham' },
  'elsternwick': { train: '14247', tram: null, stationName: 'Elsternwick Station', tramStop: null, line: 'Sandringham' },
  'brighton beach': { train: '14241', tram: null, stationName: 'Brighton Beach Station', tramStop: null, line: 'Sandringham' },
  'sandringham': { train: '14271', tram: null, stationName: 'Sandringham Station', tramStop: null, line: 'Sandringham' },

  // Inner east - Glen Waverley/Alamein
  'richmond': { train: '12173', tram: '2201', stationName: 'Richmond Station', tramStop: 'Church St/Swan St', line: 'All lines' },
  'burnley': { train: '14243', tram: null, stationName: 'Burnley Station', tramStop: null, line: 'Glen Waverley/Alamein' },
  'hawthorn': { train: '14257', tram: '3001', stationName: 'Hawthorn Station', tramStop: 'Glenferrie Rd/Burwood Rd', line: 'Glen Waverley/Alamein' },
  'camberwell': { train: '14246', tram: '3010', stationName: 'Camberwell Station', tramStop: 'Burke Rd/Riversdale Rd', line: 'Glen Waverley/Alamein' },
  'glen iris': { train: '14253', tram: null, stationName: 'Glen Iris Station', tramStop: null, line: 'Glen Waverley/Alamein' },

  // South east - Frankston/Pakenham/Cranbourne
  'malvern': { train: '14261', tram: '3008', stationName: 'Malvern Station', tramStop: 'Glenferrie Rd/High St', line: 'Pakenham/Cranbourne/Frankston' },
  'caulfield': { train: '14245', tram: '3012', stationName: 'Caulfield Station', tramStop: 'Balaclava Rd/Hawthorn Rd', line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { train: '14244', tram: null, stationName: 'Carnegie Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'murrumbeena': { train: '14267', tram: null, stationName: 'Murrumbeena Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'hughesdale': { train: '14259', tram: null, stationName: 'Hughesdale Station', tramStop: null, line: 'Pakenham/Cranbourne' },
  'oakleigh': { train: '14273', tram: null, stationName: 'Oakleigh Station', tramStop: null, line: 'Pakenham/Cranbourne' },

  // North - Hurstbridge/Mernda
  'clifton hill': { train: '14249', tram: '2101', stationName: 'Clifton Hill Station', tramStop: 'Queens Pde/Hoddle St', line: 'Hurstbridge/Mernda' },
  'collingwood': { train: '14251', tram: '2103', stationName: 'Collingwood Station', tramStop: 'Johnston St/Smith St', line: 'Hurstbridge/Mernda' },
  'fitzroy north': { train: null, tram: '2107', stationName: null, tramStop: 'Fitzroy North', line: 'Tram' },
  'northcote': { train: '14269', tram: '2115', stationName: 'Northcote Station', tramStop: 'Northcote', line: 'Hurstbridge/Mernda' },
  'fairfield': { train: '14251', tram: null, stationName: 'Fairfield Station', tramStop: null, line: 'Hurstbridge/Mernda' },
  'alphington': { train: '14231', tram: null, stationName: 'Alphington Station', tramStop: null, line: 'Hurstbridge/Mernda' },
  'ivanhoe': { train: '14261', tram: null, stationName: 'Ivanhoe Station', tramStop: null, line: 'Hurstbridge' },

  // West - Werribee/Williamstown
  'footscray': { train: '14255', tram: null, stationName: 'Footscray Station', tramStop: null, line: 'Werribee/Williamstown/Sunbury' },
  'seddon': { train: '14283', tram: null, stationName: 'Seddon Station', tramStop: null, line: 'Werribee/Williamstown' },
  'yarraville': { train: '14303', tram: null, stationName: 'Yarraville Station', tramStop: null, line: 'Werribee/Williamstown' },
  'newport': { train: '14268', tram: null, stationName: 'Newport Station', tramStop: null, line: 'Werribee/Williamstown' },
  'spotswood': { train: '14287', tram: null, stationName: 'Spotswood Station', tramStop: null, line: 'Williamstown' },

  // North west - Craigieburn/Sunbury/Upfield
  'brunswick': { train: '14242', tram: '1201', stationName: 'Brunswick Station', tramStop: 'Sydney Rd/Brunswick', line: 'Upfield' },
  'coburg': { train: '14250', tram: null, stationName: 'Coburg Station', tramStop: null, line: 'Upfield' },
  'fawkner': { train: '14252', tram: null, stationName: 'Fawkner Station', tramStop: null, line: 'Upfield' },
  'glenroy': { train: '14256', tram: null, stationName: 'Glenroy Station', tramStop: null, line: 'Craigieburn' },
  'broadmeadows': { train: '14240', tram: null, stationName: 'Broadmeadows Station', tramStop: null, line: 'Craigieburn' },

  // CBD/Inner
  'melbourne': { train: '12204', tram: '2001', stationName: 'Flinders Street Station', tramStop: 'Flinders St/Swanston St', line: 'All lines' },
  'cbd': { train: '12204', tram: '2001', stationName: 'Flinders Street Station', tramStop: 'Flinders St/Swanston St', line: 'All lines' },
  'carlton': { train: null, tram: '1105', stationName: null, tramStop: 'Carlton', line: 'Tram' },
  'fitzroy': { train: null, tram: '2105', stationName: null, tramStop: 'Fitzroy', line: 'Tram' },
  'st kilda': { train: null, tram: '3101', stationName: null, tramStop: 'Fitzroy St/Acland St', line: 'Tram' },
  'port melbourne': { train: null, tram: '3201', stationName: null, tramStop: 'Bay St/Port Melbourne', line: 'Tram' },
  'south melbourne': { train: null, tram: '3301', stationName: null, tramStop: 'Clarendon St/South Melbourne', line: 'Tram' },

  // Metro Tunnel stations
  'arden': { train: '26010', tram: null, stationName: 'Arden Station', tramStop: null, line: 'Metro Tunnel' },
  'parkville': { train: '26011', tram: null, stationName: 'Parkville Station', tramStop: null, line: 'Metro Tunnel' },
  'state library': { train: '26012', tram: null, stationName: 'State Library Station', tramStop: null, line: 'Metro Tunnel' },
  'town hall': { train: '26013', tram: null, stationName: 'Town Hall Station', tramStop: null, line: 'Metro Tunnel' },
  'anzac': { train: '26014', tram: null, stationName: 'Anzac Station', tramStop: null, line: 'Metro Tunnel' },
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
