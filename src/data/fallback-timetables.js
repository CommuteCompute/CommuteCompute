/**
 * Fallback Timetable Data for All Australian States
 * Provides default stop/station data when live APIs are unavailable
 * Used for journey planning when real-time data cannot be fetched
 *
 * DATA ATTRIBUTION:
 * Stop IDs, names, and coordinates compiled from publicly available transit information:
 * - VIC: Transport Victoria - Public transit data (via OpenData API)
 * - NSW: Transport for NSW - Public transit data
 * - QLD: TransLink Queensland - Public transit data
 * - SA: Adelaide Metro - Public transit data
 * - WA: Transperth - Public transit data
 * - TAS: Metro Tasmania - Public transit data
 * - ACT: Transport Canberra - Public transit data
 * - NT: Transport NT - Public transit data
 *
 * This compilation and code structure:
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * The underlying transit data remains property of respective transit authorities.
 */

/**
 * Major transit stops and stations for each Australian state/territory
 * Organized by state code and transit mode
 */
const FALLBACK_STOPS = {
  // ========== VICTORIA (VIC) ==========
  VIC: {
    name: 'Victoria',
    authority: 'Transport Victoria',
    modes: {
      train: [
        { id: '1071', name: 'Flinders Street Station', lat: -37.8183, lon: 144.9671 },
        { id: '1155', name: 'Southern Cross Station', lat: -37.8183, lon: 144.9529 },
        { id: '1181', name: 'Melbourne Central', lat: -37.8102, lon: 144.9628 },
        { id: '1120', name: 'Parliament', lat: -37.8110, lon: 144.9730 },
        { id: '1068', name: 'Flagstaff', lat: -37.8122, lon: 144.9560 },
        { id: '1104', name: 'Richmond', lat: -37.8210, lon: 145.0037 },
        { id: '1159', name: 'South Yarra', lat: -37.8397, lon: 144.9933 },
        { id: '1012', name: 'Caulfield', lat: -37.8770, lon: 145.0250 },
        { id: '1230', name: 'Hawksburn', lat: -37.8530, lon: 145.0122 },
        { id: '1229', name: 'Toorak', lat: -37.8480, lon: 145.0080 },
        { id: '1043', name: 'Footscray', lat: -37.8018, lon: 144.9012 },
        { id: '1026', name: 'Dandenong', lat: -37.9872, lon: 145.2135 },
        { id: '1190', name: 'Box Hill', lat: -37.8190, lon: 145.1240 }
      ],
      tram: [
        { id: '2171', name: 'Federation Square', lat: -37.8180, lon: 144.9690 },
        { id: '2500', name: 'St Kilda Junction', lat: -37.8560, lon: 144.9800 },
        { id: '2172', name: 'Collins St/Elizabeth St', lat: -37.8140, lon: 144.9650 },
        { id: '2173', name: 'Bourke St/Swanston St', lat: -37.8140, lon: 144.9680 },
        { id: '2590', name: 'Melbourne University', lat: -37.7980, lon: 144.9610 },
        { id: '2801', name: 'Chapel St/Tivoli Rd', lat: -37.8420, lon: 144.9970 },
        { id: '2802', name: 'Chapel St/High St', lat: -37.8450, lon: 144.9965 },
        { id: '2803', name: 'Toorak Rd/Chapel St', lat: -37.8400, lon: 144.9980 },
        { id: '2804', name: 'Domain Interchange', lat: -37.8250, lon: 144.9800 },
        { id: '2805', name: 'Collins St/Spring St', lat: -37.8155, lon: 144.9735 }
      ],
      bus: [
        { id: '10005', name: 'Melbourne CBD', lat: -37.8136, lon: 144.9631 },
        { id: '10120', name: 'Monash University', lat: -37.9105, lon: 145.1340 }
      ]
    }
  },

  // ========== NEW SOUTH WALES (NSW) ==========
  NSW: {
    name: 'New South Wales',
    authority: 'Transport for NSW (TfNSW)',
    modes: {
      train: [
        { id: '10101100', name: 'Central Station', lat: -33.8831, lon: 151.2068 },
        { id: '10101120', name: 'Town Hall', lat: -33.8731, lon: 151.2068 },
        { id: '10101123', name: 'Wynyard', lat: -33.8656, lon: 151.2060 },
        { id: '10101124', name: 'Circular Quay', lat: -33.8614, lon: 151.2109 },
        { id: '10101126', name: 'Martin Place', lat: -33.8679, lon: 151.2105 },
        { id: '10101320', name: 'Parramatta', lat: -33.8170, lon: 151.0040 },
        { id: '10101211', name: 'Strathfield', lat: -33.8719, lon: 151.0844 },
        { id: '10101610', name: 'Bondi Junction', lat: -33.8915, lon: 151.2477 }
      ],
      lightrail: [
        { id: '2000107', name: 'Central Chalmers St', lat: -33.8833, lon: 151.2078 },
        { id: '2000108', name: 'Capitol Square', lat: -33.8800, lon: 151.2074 },
        { id: '2000110', name: 'Paddy\'s Markets', lat: -33.8779, lon: 151.2051 }
      ],
      bus: [
        { id: '209310', name: 'QVB', lat: -33.8717, lon: 151.2063 },
        { id: '209311', name: 'Circular Quay', lat: -33.8617, lon: 151.2109 }
      ]
    }
  },

  // ========== QUEENSLAND (QLD) ==========
  QLD: {
    name: 'Queensland',
    authority: 'TransLink',
    modes: {
      train: [
        { id: '600015', name: 'Roma Street', lat: -27.4651, lon: 153.0176 },
        { id: '600014', name: 'Central', lat: -27.4654, lon: 153.0273 },
        { id: '600016', name: 'Fortitude Valley', lat: -27.4577, lon: 153.0319 },
        { id: '600030', name: 'South Bank', lat: -27.4758, lon: 153.0194 },
        { id: '600012', name: 'Bowen Hills', lat: -27.4467, lon: 153.0392 },
        { id: '600236', name: 'Toowong', lat: -27.4843, lon: 152.9900 }
      ],
      bus: [
        { id: '001040', name: 'King George Square', lat: -27.4698, lon: 153.0237 },
        { id: '001610', name: 'Queen Street', lat: -27.4705, lon: 153.0246 }
      ],
      ferry: [
        { id: '319425', name: 'North Quay', lat: -27.4689, lon: 153.0180 },
        { id: '319427', name: 'South Bank', lat: -27.4752, lon: 153.0170 }
      ]
    }
  },

  // ========== SOUTH AUSTRALIA (SA) ==========
  SA: {
    name: 'South Australia',
    authority: 'Adelaide Metro',
    modes: {
      train: [
        { id: '9100001', name: 'Adelaide', lat: -34.9209, lon: 138.6006 },
        { id: '9100009', name: 'North Adelaide', lat: -34.9080, lon: 138.5941 },
        { id: '9100012', name: 'Prospect', lat: -34.8830, lon: 138.5940 },
        { id: '9100300', name: 'Glenelg', lat: -34.9803, lon: 138.5131 }
      ],
      tram: [
        { id: '9200001', name: 'Adelaide Railway Station', lat: -34.9209, lon: 138.6008 },
        { id: '9200015', name: 'Victoria Square', lat: -34.9282, lon: 138.6004 },
        { id: '9200025', name: 'South Terrace', lat: -34.9358, lon: 138.6002 }
      ],
      bus: [
        { id: '9300001', name: 'Currie St/King William St', lat: -34.9250, lon: 138.5997 },
        { id: '9300050', name: 'Rundle Mall', lat: -34.9215, lon: 138.6007 }
      ]
    }
  },

  // ========== WESTERN AUSTRALIA (WA) ==========
  WA: {
    name: 'Western Australia',
    authority: 'Transperth',
    modes: {
      train: [
        { id: '99T2001', name: 'Perth Station', lat: -31.9505, lon: 115.8605 },
        { id: '99T2002', name: 'Elizabeth Quay', lat: -31.9558, lon: 115.8668 },
        { id: '99T2003', name: 'Esplanade', lat: -31.9537, lon: 115.8632 },
        { id: '99T2072', name: 'Joondalup', lat: -31.7450, lon: 115.7653 },
        { id: '99T2140', name: 'Fremantle', lat: -32.0569, lon: 115.7470 }
      ],
      bus: [
        { id: '10001', name: 'Perth Busport', lat: -31.9490, lon: 115.8607 },
        { id: '10050', name: 'Murray St/Barrack St', lat: -31.9520, lon: 115.8570 }
      ]
    }
  },

  // ========== TASMANIA (TAS) ==========
  TAS: {
    name: 'Tasmania',
    authority: 'Metro Tasmania',
    modes: {
      bus: [
        { id: '20001', name: 'Hobart CBD', lat: -42.8821, lon: 147.3272 },
        { id: '20002', name: 'Elizabeth St Mall', lat: -42.8826, lon: 147.3291 },
        { id: '20003', name: 'Liverpool St', lat: -42.8805, lon: 147.3285 },
        { id: '21001', name: 'Launceston CBD', lat: -41.4340, lon: 147.1380 },
        { id: '21002', name: 'St John St', lat: -41.4360, lon: 147.1370 }
      ]
    }
  },

  // ========== AUSTRALIAN CAPITAL TERRITORY (ACT) ==========
  ACT: {
    name: 'Australian Capital Territory',
    authority: 'Transport Canberra',
    modes: {
      lightrail: [
        { id: '3000001', name: 'Alinga Street', lat: -35.2781, lon: 149.1309 },
        { id: '3000002', name: 'City West', lat: -35.2792, lon: 149.1275 },
        { id: '3000015', name: 'Gungahlin Place', lat: -35.1836, lon: 149.1329 }
      ],
      bus: [
        { id: '3100001', name: 'City Bus Station', lat: -35.2789, lon: 149.1303 },
        { id: '3100002', name: 'Civic', lat: -35.2780, lon: 149.1300 },
        { id: '3100050', name: 'Woden Bus Station', lat: -35.3439, lon: 149.0866 }
      ]
    }
  },

  // ========== NORTHERN TERRITORY (NT) ==========
  NT: {
    name: 'Northern Territory',
    authority: 'NT Public Transport',
    modes: {
      bus: [
        { id: '4000001', name: 'Darwin City', lat: -12.4634, lon: 130.8456 },
        { id: '4000002', name: 'Mitchell St', lat: -12.4625, lon: 130.8412 },
        { id: '4000003', name: 'Smith St Mall', lat: -12.4636, lon: 130.8419 },
        { id: '4100001', name: 'Alice Springs', lat: -23.6980, lon: 133.8807 }
      ]
    }
  }
};

/**
 * Get fallback stops for a specific state
 * @param {string} stateCode - State code (VIC, NSW, QLD, etc.)
 * @returns {object} State transit data with stops
 */
export function getFallbackStops(stateCode) {
  return FALLBACK_STOPS[stateCode.toUpperCase()] || null;
}

/**
 * Get all stops for a specific mode in a state
 * @param {string} stateCode - State code
 * @param {string} mode - Transport mode (train, tram, bus, etc.)
 * @returns {array} Array of stop objects
 */
export function getStopsByMode(stateCode, mode) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData || !stateData.modes[mode]) {
    return [];
  }
  return stateData.modes[mode];
}

/**
 * Search for stops by name across all modes
 * @param {string} stateCode - State code
 * @param {string} query - Search query
 * @returns {array} Matching stops with mode information
 */
export function searchStops(stateCode, query) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData) {
    return [];
  }

  const results = [];
  const queryLower = query.toLowerCase();

  for (const [mode, stops] of Object.entries(stateData.modes)) {
    for (const stop of stops) {
      if (stop.name.toLowerCase().includes(queryLower)) {
        results.push({
          ...stop,
          mode: mode,
          modeLabel: mode.charAt(0).toUpperCase() + mode.slice(1)
        });
      }
    }
  }

  return results;
}

/**
 * Find nearest stop to coordinates
 * @param {string} stateCode - State code
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} mode - Optional: filter by transport mode
 * @returns {object} Nearest stop with distance
 */
export function findNearestStop(stateCode, lat, lon, mode = null) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData) {
    return null;
  }

  let nearest = null;
  let minDistance = Infinity;

  const modesToSearch = mode ? [mode] : Object.keys(stateData.modes);

  for (const searchMode of modesToSearch) {
    const stops = stateData.modes[searchMode] || [];
    for (const stop of stops) {
      const distance = calculateDistance(lat, lon, stop.lat, stop.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          ...stop,
          mode: searchMode,
          modeLabel: searchMode.charAt(0).toUpperCase() + searchMode.slice(1),
          distance: Math.round(distance)
        };
      }
    }
  }

  return nearest;
}

/**
 * Calculate distance between two points (Haversine formula)
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get all stops for a state (across all modes)
 * @param {string} state State code (e.g., 'VIC')
 * @returns {array} Array of all stops with coordinates and route_type
 */
export function getAllStops(state) {
  const stateData = FALLBACK_STOPS[state?.toUpperCase()];
  if (!stateData) {
    return [];
  }

  const allStops = [];

  // Mode to route_type mapping (GTFS standard)
  const modeToRouteType = {
    'train': 0,
    'tram': 1,
    'bus': 2,
    'vline': 3,
    'ferry': 4,
    'lightrail': 0  // Light rail treated as train for priority
  };

  // Iterate through all modes - data structure is modes: { train: [...], tram: [...], ... }
  for (const [modeKey, stops] of Object.entries(stateData.modes)) {
    // Get route type from mode key
    const routeType = modeToRouteType[modeKey] ?? 2; // Default to bus (2) if unknown

    // Stops are directly in the array, not nested
    if (Array.isArray(stops)) {
      stops.forEach(stop => {
        allStops.push({
          ...stop,
          route_type: routeType,
          mode: modeKey
        });
      });
    }
  }

  return allStops;
}

/**
 * Alias for getAllStops - used by journey planner
 * @param {string} state State code (e.g., 'VIC')
 * @returns {array} Array of all stops with coordinates
 */
export function getStopsForState(state) {
  return getAllStops(state);
}

/**
 * Get all available states with transit data
 * @returns {array} Array of state objects
 */
export function getAllStates() {
  return Object.entries(FALLBACK_STOPS).map(([code, data]) => ({
    code,
    name: data.name,
    authority: data.authority,
    modes: Object.keys(data.modes)
  }));
}

export default {
  getFallbackStops,
  getStopsByMode,
  searchStops,
  findNearestStop,
  getAllStops,
  getStopsForState,
  getAllStates,
  FALLBACK_STOPS
};
