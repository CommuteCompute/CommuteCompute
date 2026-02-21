/**
 * CommuteCompute™ Engine (Consolidated v2.0)
 * Part of the Commute Compute System™
 *
 * Unified intelligent commute planning for Australian public transport.
 * Auto-detects state from user's home address and configures appropriate
 * transit APIs and weather services.
 *
 * Five Interconnected Intelligence Engines:
 *   CommuteCompute™ — Core journey orchestration (trademarked)
 *   DepartureConfidence — Real-time departure reliability scoring
 *   LifestyleContext — User lifestyle pattern analysis and preference learning
 *   SleepOptimiser — Optimal departure time based on sleep patterns
 *   AltTransit — Alternative transport route discovery and recommendation
 *
 * Per DEVELOPMENT-RULES.md Section 24: Single source of truth for journey calculations.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Supports all Australian states/territories:
 * - VIC: Transport Victoria (via OpenData API)
 * - NSW: Transport for NSW
 * - QLD: TransLink Queensland
 * - SA: Adelaide Metro
 * - WA: Transperth
 * - TAS: Metro Tasmania
 * - NT: Public Transport Darwin
 * - ACT: Transport Canberra
 */

import SmartRouteRecommender from '../services/smart-route-recommender.js';
import * as transitApi from '../services/opendata-client.js';
import CoffeeDecision from '../core/coffee-decision.js';
import fs from 'fs/promises';
import path from 'path';
import { getTransitApiKey, getGoogleApiKey } from '../data/kv-preferences.js';
import { getStopNameById, detectStopIdsFromAddress } from '../data/gtfs-stop-names.js';

// =============================================================================
// STATE CONFIGURATION
// =============================================================================

/**
 * Australian state/territory configuration
 * Each state has its own transit API, weather zone, and timezone
 */
export const STATE_CONFIG = {
  VIC: {
    name: 'Victoria',
    timezone: 'Australia/Melbourne',
    transitAuthority: 'Transport Victoria',
    transitApiBase: 'https://api.opendata.transport.vic.gov.au',
    gtfsRealtimeBase: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs',
    weatherZone: 'VIC',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDV10753.xml',  // Melbourne
    modes: { train: 0, tram: 1, bus: 2, vline: 3 },
    fallbackTimetable: 'vic-metro.json'
  },
  NSW: {
    name: 'New South Wales',
    timezone: 'Australia/Sydney',
    transitAuthority: 'TfNSW',
    transitApiBase: 'https://api.transport.nsw.gov.au/v1',
    gtfsRealtimeBase: 'https://api.transport.nsw.gov.au/v1/gtfs',
    weatherZone: 'NSW',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDN10064.xml',  // Sydney
    modes: { train: 0, metro: 1, bus: 2, ferry: 4, lightrail: 5 },
    fallbackTimetable: 'nsw-metro.json'
  },
  QLD: {
    name: 'Queensland',
    timezone: 'Australia/Brisbane',
    transitAuthority: 'TransLink',
    transitApiBase: 'https://gtfsrt.api.translink.com.au',
    gtfsRealtimeBase: 'https://gtfsrt.api.translink.com.au',
    weatherZone: 'QLD',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDQ10095.xml',  // Brisbane
    modes: { train: 0, bus: 2, ferry: 4 },
    fallbackTimetable: 'qld-seqld.json'
  },
  SA: {
    name: 'South Australia',
    timezone: 'Australia/Adelaide',
    transitAuthority: 'AdelaideMetro',
    transitApiBase: 'https://api.adelaidemetro.com.au',
    gtfsRealtimeBase: null,  // GTFS static only
    weatherZone: 'SA',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDS10044.xml',  // Adelaide
    modes: { train: 0, tram: 1, bus: 2 },
    fallbackTimetable: 'sa-adelaide.json'
  },
  WA: {
    name: 'Western Australia',
    timezone: 'Australia/Perth',
    transitAuthority: 'Transperth',
    transitApiBase: 'https://api.transperth.wa.gov.au',
    gtfsRealtimeBase: null,
    weatherZone: 'WA',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDW14199.xml',  // Perth
    modes: { train: 0, bus: 2, ferry: 4 },
    fallbackTimetable: 'wa-perth.json'
  },
  TAS: {
    name: 'Tasmania',
    timezone: 'Australia/Hobart',
    transitAuthority: 'MetroTas',
    transitApiBase: null,
    gtfsRealtimeBase: null,
    weatherZone: 'TAS',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDT13600.xml',  // Hobart
    modes: { bus: 2, ferry: 4 },
    fallbackTimetable: 'tas-hobart.json'
  },
  NT: {
    name: 'Northern Territory',
    timezone: 'Australia/Darwin',
    transitAuthority: 'DarwinBus',
    transitApiBase: null,
    gtfsRealtimeBase: null,
    weatherZone: 'NT',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDD10150.xml',  // Darwin
    modes: { bus: 2 },
    fallbackTimetable: 'nt-darwin.json'
  },
  ACT: {
    name: 'Australian Capital Territory',
    timezone: 'Australia/Sydney',
    transitAuthority: 'TransportCanberra',
    transitApiBase: 'https://api.transport.act.gov.au',
    gtfsRealtimeBase: null,
    weatherZone: 'ACT',
    bomForecastUrl: 'https://www.bom.gov.au/fwo/IDN10035.xml',  // Canberra
    modes: { lightrail: 5, bus: 2 },
    fallbackTimetable: 'act-canberra.json'
  }
};

/**
 * Postcode to state mapping (first digit)
 */
const POSTCODE_STATE_MAP = {
  '0': 'NT',
  '2': 'NSW',  // Also ACT (2600-2618, 2900-2920)
  '3': 'VIC',
  '4': 'QLD',
  '5': 'SA',
  '6': 'WA',
  '7': 'TAS'
};

/**
 * ACT postcode ranges
 */
const ACT_POSTCODES = [
  [2600, 2618],
  [2900, 2920]
];

// =============================================================================
// MELBOURNE METRO TUNNEL CONFIGURATION (Big Build - February 2026)
// =============================================================================

/**
 * Metro Tunnel stations (new underground stations)
 * These stations are ONLY served by Metro Tunnel lines
 */
export const METRO_TUNNEL_STATIONS = {
  arden: { name: 'Arden', zone: 1, interchange: ['tram'], precinct: 'North Melbourne' },
  parkville: { name: 'Parkville', zone: 1, interchange: ['tram'], precinct: 'Hospital/University' },
  stateLibrary: { name: 'State Library', zone: 1, interchange: ['tram', 'bus'], precinct: 'CBD' },
  townHall: { name: 'Town Hall', zone: 1, interchange: ['tram'], precinct: 'CBD' },
  anzac: { name: 'Anzac', zone: 1, interchange: ['tram', 'bus'], precinct: 'Domain/St Kilda Rd' }
};

/**
 * Lines that use Metro Tunnel (NO LONGER use City Loop)
 * These lines now run: Western suburbs ↔ Metro Tunnel ↔ South-Eastern suburbs
 */
export const METRO_TUNNEL_LINES = [
  'sunbury',      // Sunbury ↔ Cranbourne/Pakenham via Metro Tunnel
  'craigieburn',  // Craigieburn ↔ Pakenham via Metro Tunnel
  'upfield',      // Upfield ↔ Pakenham/Cranbourne via Metro Tunnel
  'pakenham',     // Pakenham ↔ Sunbury/Craigieburn/Upfield via Metro Tunnel
  'cranbourne'    // Cranbourne ↔ Sunbury/Craigieburn/Upfield via Metro Tunnel
];

/**
 * Lines that STILL use City Loop
 * These continue to run through Flinders St → Southern Cross → Flagstaff → 
 * Melbourne Central → Parliament → Flinders St (or reverse)
 */
export const CITY_LOOP_LINES = [
  // Burnley Group
  'belgrave',
  'lilydale', 
  'alamein',
  'glenWaverley',
  // Caulfield Group (partial - some terminate Flinders)
  'frankston',
  'sandringham',
  // Northern Group (partial)
  'hurstbridge',
  'mernda',
  // Cross-city
  'werribee',
  'williamstown'
];

/**
 * City Loop stations (underground CBD stations - NOT Metro Tunnel)
 */
export const CITY_LOOP_STATIONS = [
  'flindersStreet',   // Hub station (above ground)
  'southernCross',    // Spencer St
  'flagstaff',        // Underground
  'melbourneCentral', // Underground
  'parliament'        // Underground
];

// =============================================================================
// METRO TUNNEL IMPACT - DISCONTINUED SERVICES (Effective 2026-02-01)
// =============================================================================

/**
 * Stations that LOST direct services when Metro Tunnel opened
 * 
 * These City Loop stations NO LONGER receive Sunbury/Craigieburn/Upfield/
 * Pakenham/Cranbourne line services. Passengers must transfer to access
 * these lines.
 * 
 * CRITICAL: Display warnings when users expect these connections
 */
export const METRO_TUNNEL_DISCONTINUED_SERVICES = {
  // Stations that lost Metro Tunnel line services
  southernCross: {
    stopId: '22180',
    lostLines: ['sunbury', 'craigieburn', 'upfield', 'pakenham', 'cranbourne'],
    stillServedBy: ['werribee', 'williamstown', 'vline'],
    alternativeFor: {
      pakenham: 'Walk to Flinders St or use City Loop to transfer',
      sunbury: 'Walk to Flinders St or use City Loop to transfer',
      cranbourne: 'Walk to Flinders St or use City Loop to transfer',
      craigieburn: 'Walk to Flinders St or use City Loop to transfer',
      upfield: 'Walk to Flinders St or use City Loop to transfer'
    },
    nearestMetroTunnel: 'arden',
    walkMinutes: 12  // Walk to Arden station
  },
  flagstaff: {
    stopId: '22186',
    lostLines: ['sunbury', 'craigieburn', 'upfield', 'pakenham', 'cranbourne'],
    stillServedBy: ['belgrave', 'lilydale', 'alamein', 'glenWaverley', 'hurstbridge', 'mernda', 'frankston', 'sandringham', 'werribee', 'williamstown'],
    alternativeFor: {
      pakenham: 'Use City Loop to Flinders St, change to Metro Tunnel',
      sunbury: 'Walk to State Library (5 min)',
      cranbourne: 'Use City Loop to Flinders St, change to Metro Tunnel',
      craigieburn: 'Walk to State Library (5 min)',
      upfield: 'Walk to State Library (5 min)'
    },
    nearestMetroTunnel: 'stateLibrary',
    walkMinutes: 5
  },
  melbourneCentral: {
    stopId: '22182',
    lostLines: ['sunbury', 'craigieburn', 'upfield', 'pakenham', 'cranbourne'],
    stillServedBy: ['belgrave', 'lilydale', 'alamein', 'glenWaverley', 'hurstbridge', 'mernda', 'frankston', 'sandringham', 'werribee', 'williamstown'],
    alternativeFor: {
      pakenham: 'Walk to State Library (3 min) - same area, different entrance',
      sunbury: 'Walk to State Library (3 min) - same area, different entrance',
      cranbourne: 'Walk to State Library (3 min) - same area, different entrance',
      craigieburn: 'Walk to State Library (3 min)',
      upfield: 'Walk to State Library (3 min)'
    },
    nearestMetroTunnel: 'stateLibrary',
    walkMinutes: 3  // Very close - State Library is essentially Melbourne Central's replacement
  },
  parliament: {
    stopId: '22181',
    lostLines: ['sunbury', 'craigieburn', 'upfield', 'pakenham', 'cranbourne'],
    stillServedBy: ['belgrave', 'lilydale', 'alamein', 'glenWaverley', 'hurstbridge', 'mernda', 'frankston', 'sandringham', 'werribee', 'williamstown'],
    alternativeFor: {
      pakenham: 'Walk to Town Hall (8 min) or Flinders St (5 min)',
      sunbury: 'Walk to Town Hall (8 min) or State Library (10 min)',
      cranbourne: 'Walk to Town Hall (8 min) or Flinders St (5 min)',
      craigieburn: 'Walk to State Library (10 min)',
      upfield: 'Walk to State Library (10 min)'
    },
    nearestMetroTunnel: 'townHall',
    walkMinutes: 8
  }
};

/**
 * Suburban stations that lost DIRECT city access via their previous routes
 * These stations previously had trains running through the City Loop,
 * now their lines run through Metro Tunnel instead
 */
export const SUBURBAN_ROUTING_CHANGES = {
  // South-Eastern corridor - now via Metro Tunnel
  pakenhamLine: {
    affectedStations: ['Pakenham', 'Cardinia Road', 'Officer', 'Beaconsfield', 'Berwick', 
                       'Narre Warren', 'Hallam', 'Dandenong', 'Yarraman', 'Noble Park',
                       'Sandown Park', 'Springvale', 'Westall', 'Clayton', 'Huntingdale',
                       'Oakleigh', 'Hughesdale', 'Murrumbeena', 'Carnegie', 'Caulfield'],
    previousRoute: 'City Loop (Parliament → Melbourne Central → Flagstaff → Southern Cross → Flinders St)',
    newRoute: 'Metro Tunnel (Anzac → Town Hall → State Library → Parkville → Arden)',
    lostStations: ['Parliament', 'Melbourne Central', 'Flagstaff', 'Southern Cross'],
    gainedStations: ['Anzac', 'Town Hall', 'State Library', 'Parkville', 'Arden'],
    keyChange: 'No longer stops at Southern Cross - use Arden for Docklands access'
  },
  cranbourneLine: {
    affectedStations: ['Cranbourne', 'Merinda Park', 'Lynbrook', 'Dandenong', 'Yarraman', 
                       'Noble Park', 'Sandown Park', 'Springvale', 'Westall', 'Clayton',
                       'Huntingdale', 'Oakleigh', 'Hughesdale', 'Murrumbeena', 'Carnegie', 'Caulfield'],
    previousRoute: 'City Loop (Parliament → Melbourne Central → Flagstaff → Southern Cross → Flinders St)',
    newRoute: 'Metro Tunnel (Anzac → Town Hall → State Library → Parkville → Arden)',
    lostStations: ['Parliament', 'Melbourne Central', 'Flagstaff', 'Southern Cross'],
    gainedStations: ['Anzac', 'Town Hall', 'State Library', 'Parkville', 'Arden'],
    keyChange: 'No longer stops at Southern Cross - use Arden for Docklands access'
  },
  sunburyLine: {
    affectedStations: ['Sunbury', 'Diggers Rest', 'Watergardens', 'Keilor Plains', 'St Albans',
                       'Ginifer', 'Albion', 'Sunshine', 'Tottenham', 'West Footscray',
                       'Middle Footscray', 'Footscray', 'South Kensington', 'North Melbourne'],
    previousRoute: 'City Loop (Flinders St → Southern Cross → Flagstaff → Melbourne Central → Parliament)',
    newRoute: 'Metro Tunnel (Arden → Parkville → State Library → Town Hall → Anzac)',
    lostStations: ['Southern Cross', 'Flagstaff', 'Melbourne Central', 'Parliament'],
    gainedStations: ['Arden', 'Parkville', 'State Library', 'Town Hall', 'Anzac'],
    keyChange: 'North Melbourne is the last shared station - change here for City Loop lines'
  },
  craigieburnLine: {
    affectedStations: ['Craigieburn', 'Roxburgh Park', 'Coolaroo', 'Broadmeadows', 'Jacana',
                       'Glenroy', 'Oak Park', 'Pascoe Vale', 'Strathmore', 'Glenbervie',
                       'Essendon', 'Moonee Ponds', 'Ascot Vale', 'Newmarket', 'Kensington',
                       'North Melbourne'],
    previousRoute: 'City Loop (Flinders St → Southern Cross → Flagstaff → Melbourne Central → Parliament)',
    newRoute: 'Metro Tunnel (Arden → Parkville → State Library → Town Hall → Anzac)',
    lostStations: ['Southern Cross', 'Flagstaff', 'Melbourne Central', 'Parliament'],
    gainedStations: ['Arden', 'Parkville', 'State Library', 'Town Hall', 'Anzac'],
    keyChange: 'North Melbourne is the last shared station - change here for City Loop lines'
  },
  upfieldLine: {
    affectedStations: ['Upfield', 'Gowrie', 'Fawkner', 'Merlynston', 'Batman', 'Coburg',
                       'Moreland', 'Anstey', 'Brunswick', 'Jewell', 'Royal Park', 'Flemington Bridge'],
    previousRoute: 'City Loop (Flinders St → Southern Cross → Flagstaff → Melbourne Central → Parliament)',
    newRoute: 'Metro Tunnel (Arden → Parkville → State Library → Town Hall → Anzac)',
    lostStations: ['Southern Cross', 'Flagstaff', 'Melbourne Central', 'Parliament'],
    gainedStations: ['Arden', 'Parkville', 'State Library', 'Town Hall', 'Anzac'],
    keyChange: 'Connects to Parkville - direct access to hospitals and university'
  }
};

/**
 * Check if a station lost services from a specific line
 * @param {string} stationName - Station name (e.g., 'Southern Cross')
 * @param {string} lineName - Line name (e.g., 'pakenham')
 * @returns {object|null} - Discontinued service info or null if still served
 */
export function getDiscontinuedServiceInfo(stationName, lineName) {
  if (!stationName || !lineName) return null;
  
  const normalized = stationName.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedLine = lineName.toLowerCase().replace(/[^a-z]/g, '');
  
  for (const [key, info] of Object.entries(METRO_TUNNEL_DISCONTINUED_SERVICES)) {
    const stationNormalized = key.toLowerCase();
    if (normalized.includes(stationNormalized) || stationNormalized.includes(normalized)) {
      if (info.lostLines.some(l => normalizedLine.includes(l))) {
        return {
          station: key,
          line: lineName,
          discontinued: true,
          alternative: info.alternativeFor[normalizedLine] || info.alternativeFor.pakenham,
          nearestMetroTunnel: info.nearestMetroTunnel,
          walkMinutes: info.walkMinutes,
          stillServedBy: info.stillServedBy
        };
      }
    }
  }
  
  return null;
}

/**
 * Get routing change info for a suburban station
 * @param {string} stationName - Station name
 * @returns {object|null} - Routing change info or null if no change
 */
export function getRoutingChangeInfo(stationName) {
  if (!stationName) return null;
  
  const normalized = stationName.toLowerCase().replace(/[^a-z]/g, '');
  
  for (const [lineKey, info] of Object.entries(SUBURBAN_ROUTING_CHANGES)) {
    for (const station of info.affectedStations) {
      if (normalized === station.toLowerCase().replace(/[^a-z]/g, '')) {
        return {
          station: station,
          line: lineKey.replace('Line', ''),
          previousRoute: info.previousRoute,
          newRoute: info.newRoute,
          lostStations: info.lostStations,
          gainedStations: info.gainedStations,
          keyChange: info.keyChange
        };
      }
    }
  }
  
  return null;
}

/**
 * Check if a line uses Metro Tunnel
 */
export function isMetroTunnelLine(lineName) {
  if (!lineName) return false;
  const normalized = lineName.toLowerCase().replace(/[^a-z]/g, '');
  return METRO_TUNNEL_LINES.some(l => normalized.includes(l.toLowerCase()));
}

/**
 * Check if a station is a Metro Tunnel station
 */
export function isMetroTunnelStation(stationName) {
  if (!stationName) return false;
  const normalized = stationName.toLowerCase().replace(/[^a-z]/g, '');
  return Object.values(METRO_TUNNEL_STATIONS).some(s => 
    normalized.includes(s.name.toLowerCase().replace(/[^a-z]/g, ''))
  );
}

/**
 * Get recommended CBD station for a line
 * Metro Tunnel lines → State Library or Town Hall
 * City Loop lines → Flinders Street or Melbourne Central
 */
export function getRecommendedCBDStation(lineName, destination = 'cbd') {
  if (isMetroTunnelLine(lineName)) {
    // Metro Tunnel lines stop at State Library and Town Hall in CBD
    return destination === 'south' ? 'anzac' : 'stateLibrary';
  } else {
    // City Loop lines still use traditional stations
    return 'flindersStreet';
  }
}

/**
 * Check if two stations are connected via Metro Tunnel
 * Returns true if journey should use Metro Tunnel routing
 */
export function shouldUseMetroTunnel(originLine, destinationStation) {
  // If origin is on a Metro Tunnel line and destination is a Metro Tunnel station
  if (isMetroTunnelLine(originLine) && isMetroTunnelStation(destinationStation)) {
    return true;
  }
  // If destination is CBD and line is Metro Tunnel line
  if (isMetroTunnelLine(originLine)) {
    const cbdKeywords = ['cbd', 'city', 'collins', 'bourke', 'swanston', 'flinders'];
    const destNorm = (destinationStation || '').toLowerCase();
    if (cbdKeywords.some(k => destNorm.includes(k))) {
      return true;
    }
  }
  return false;
}

/**
 * Get Metro Tunnel journey info
 * Returns routing advice for Metro Tunnel journeys
 */
export function getMetroTunnelRouting(fromStation, toStation, lineName) {
  const usesTunnel = isMetroTunnelLine(lineName);
  
  if (!usesTunnel) {
    return {
      useMetroTunnel: false,
      route: 'city-loop',
      note: `${lineName} line uses City Loop (Flinders St, Southern Cross, Flagstaff, Melbourne Central, Parliament)`
    };
  }
  
  return {
    useMetroTunnel: true,
    route: 'metro-tunnel',
    stations: ['Arden', 'Parkville', 'State Library', 'Town Hall', 'Anzac'],
    note: `${lineName} line uses Metro Tunnel (faster CBD access via underground stations)`,
    connections: {
      arden: 'Trams to Docklands, North Melbourne',
      parkville: 'Royal Melbourne Hospital, Melbourne University, trams',
      stateLibrary: 'RMIT, State Library, trams on Swanston St',
      townHall: 'Collins St, Bourke St Mall, City Square',
      anzac: 'St Kilda Rd, Domain, Shrine, trams 3/5/6/16/64/67/72'
    }
  };
}

// =============================================================================
// COMMUTECOMPUTE ENGINE
// =============================================================================

export class CommuteCompute {
  constructor(preferences = null) {
    this.preferences = preferences;
    this.state = null;
    this.stateConfig = null;
    this.routeRecommender = null;
    this.coffeeDecision = null;
    this.fallbackMode = false;
    this.apiKeys = {};
    
    // Route discovery state (merged from smart-journey-engine)
    this.discoveredRoutes = [];
    this.selectedRouteIndex = 0;
    
    // Cache
    this.cache = {
      routes: null,
      routesCacheTime: null,
      transitData: null,
      transitCacheTime: null,
      weather: null,
      weatherCacheTime: null
    };
    
    this.ROUTES_CACHE_MS = 5 * 60 * 1000;    // 5 minutes
    this.TRANSIT_CACHE_MS = 30 * 1000;        // 30 seconds
    this.WEATHER_CACHE_MS = 15 * 60 * 1000;   // 15 minutes
  }

  /**
   * Initialize CommuteCompute with user preferences
   * Auto-detects state from home address
   */
  async initialize(preferences = null) {
    if (preferences) {
      this.preferences = preferences;
    }
    
    const prefs = this.getPrefs();
    
    // 1. Detect state from home address
    this.state = await this.detectState(prefs.homeAddress);
    this.stateConfig = STATE_CONFIG[this.state] || STATE_CONFIG.VIC;
    
    // 2. Check for API keys (from KV per Section 3.4)
    this.apiKeys = await this.detectApiKeys(prefs);
    this.fallbackMode = !this.hasRequiredApiKeys();
    
    if (!this.fallbackMode) {
      // Per Dev Rules Section 3: Zero-Config - pass API key to opendata-client module
      if (this.state === 'VIC' && this.apiKeys.transitKey) {
        transitApi.setApiKey(this.apiKeys.transitKey);
      }
    }
    
    // 3. Initialize route recommender
    this.routeRecommender = new SmartRouteRecommender({
      walkingSpeed: prefs.walkingSpeed || 80,
      maxWalkingDistance: prefs.maxWalkingDistance || 600
    });
    
    // 4. Initialize coffee decision engine
    this.coffeeDecision = new CoffeeDecision({
      walkToWork: prefs.walkToWork || 5,
      homeToCafe: prefs.homeToCafe || 5,
      makeCoffee: prefs.makeCoffee || prefs.cafeDuration || 5,
      cafeToTransit: prefs.cafeToTransit || 2
    }, this.preferences);
    
    // Set target arrival
    if (prefs.arrivalTime) {
      const [h, m] = prefs.arrivalTime.split(':').map(Number);
      this.coffeeDecision.setTargetArrival(h, m);
    }
    
    // 5. Load fallback timetables if needed
    if (this.fallbackMode) {
      await this.loadFallbackTimetables();
    }
    
    return this;
  }

  /**
   * Detect state from home address
   */
  async detectState(homeAddress) {
    if (!homeAddress) {
      return 'VIC';
    }
    
    // If address is an object with state property
    if (typeof homeAddress === 'object' && homeAddress.state) {
      return homeAddress.state.toUpperCase();
    }
    
    // If address has postcode
    const addressStr = typeof homeAddress === 'string' ? homeAddress : homeAddress.formattedAddress || '';
    const postcodeMatch = addressStr.match(/\b(\d{4})\b/);
    
    if (postcodeMatch) {
      const postcode = parseInt(postcodeMatch[1]);
      return this.stateFromPostcode(postcode);
    }
    
    // Try to extract state from address string
    const statePatterns = [
      { pattern: /\bVIC\b|\bVictoria\b/i, state: 'VIC' },
      { pattern: /\bNSW\b|\bNew South Wales\b/i, state: 'NSW' },
      { pattern: /\bQLD\b|\bQueensland\b/i, state: 'QLD' },
      { pattern: /\bSA\b|\bSouth Australia\b/i, state: 'SA' },
      { pattern: /\bWA\b|\bWestern Australia\b/i, state: 'WA' },
      { pattern: /\bTAS\b|\bTasmania\b/i, state: 'TAS' },
      { pattern: /\bNT\b|\bNorthern Territory\b/i, state: 'NT' },
      { pattern: /\bACT\b|\bCanberra\b/i, state: 'ACT' }
    ];
    
    for (const { pattern, state } of statePatterns) {
      if (pattern.test(addressStr)) {
        return state;
      }
    }
    
    // Default to VIC
    return 'VIC';
  }

  /**
   * Get state from postcode
   */
  stateFromPostcode(postcode) {
    // Check ACT first (special case)
    for (const [min, max] of ACT_POSTCODES) {
      if (postcode >= min && postcode <= max) {
        return 'ACT';
      }
    }
    
    // NT postcodes are 0800-0899 (3 or 4 digit representation)
    if (postcode >= 800 && postcode <= 899) {
      return 'NT';
    }
    
    // Use first digit for 4-digit postcodes
    const firstDigit = postcode.toString().padStart(4, '0')[0];
    return POSTCODE_STATE_MAP[firstDigit] || 'VIC';
  }

  /**
   * Detect available API keys from preferences/environment
   */
  /**
   * Detect API keys from preferences or KV storage
   * Per Section 3.4: API keys from KV storage only, not process.env
   * Per Section 17.5: No environment file references
   */
  async detectApiKeys(prefs) {
    const keys = {};
    
    // Get keys from KV storage (Zero-Config compliant)
    const kvTransitKey = await getTransitApiKey();
    const kvGoogleKey = await getGoogleApiKey();

    // Transit API keys - prefer prefs (from request), then KV storage
    keys.transitKey = prefs.api?.key || prefs.transitApiKey || kvTransitKey;
    keys.transitToken = prefs.api?.token || prefs.transitApiToken;
    
    // Weather (BOM is free, no API key needed)
    keys.bomKey = prefs.bomApiKey;
    
    // Google Places (for geocoding) - prefer prefs, then KV
    keys.googlePlaces = prefs.googleApiKey || kvGoogleKey;
    
    return keys;
  }

  /**
   * Check if we have required API keys for live data
   */
  hasRequiredApiKeys() {
    // For live transit data, we need at least the transit key
    return !!(this.apiKeys.transitKey || this.apiKeys.transitToken);
  }

  /**
   * Load fallback timetables for the detected state
   */
  async loadFallbackTimetables() {
    try {
      const timetablePath = `../../data/timetables/${this.stateConfig.fallbackTimetable}`;
      // Dynamic import would go here - for now, use global fallback if available
      if (global.fallbackTimetables) {
        this.fallbackData = global.fallbackTimetables.getStopsForState(this.state);
      } else {
        this.fallbackData = this.getHardcodedFallback();
      }
    } catch (error) {
      this.fallbackData = this.getHardcodedFallback();
    }
  }

  /**
   * Get fallback data when no timetables available
   * Per DEVELOPMENT-RULES Section 23.6: NO mock data fallbacks.
   * Returns empty arrays — the system must show "No live data available"
   * rather than fake departure times.
   */
  getHardcodedFallback() {
    return {
      trains: [],
      trams: [],
      buses: []
    };
  }

  /**
   * Get smart journey recommendation
   * Main entry point for route planning
   */
  async getJourneyRecommendation(options = {}) {
    const prefs = this.getPrefs();
    const forceRefresh = options.forceRefresh || false;
    
    // 1. Get locations
    const locations = {
      home: prefs.homeLocation || prefs.homeAddress,
      cafe: prefs.cafeLocation || prefs.coffeeAddress,
      work: prefs.workLocation || prefs.workAddress
    };
    
    // 2. Get available stops (from API or fallback)
    const allStops = await this.getStops(forceRefresh);
    
    // 3. Get route recommendation
    const routePrefs = {
      coffeeEnabled: prefs.coffeeEnabled !== false,
      cafeDuration: prefs.cafeDuration || 5,
      coffeePosition: prefs.coffeePosition || 'auto',
      preferTrain: prefs.preferTrain !== false,
      preferMultiModal: prefs.preferMultiModal === true,
      minimizeWalking: prefs.minimizeWalking !== false,
      modePriority: prefs.modePriority || this.getDefaultModePriority()
    };
    
    const recommendation = this.routeRecommender.analyzeAndRecommend(
      locations,
      allStops,
      routePrefs
    );
    
    // 4. Get live transit data (or fallback)
    const transitData = await this.getTransitData(forceRefresh);
    
    // 5. Update coffee decision from route
    if (recommendation.recommended) {
      this.updateCoffeeFromRoute(recommendation.recommended);
    }
    
    // 6. Calculate coffee decision with live data
    const alertText = await this.getServiceAlerts();
    const coffeeResult = this.calculateCoffeeDecision(transitData, alertText);
    
    // 7. Get weather
    const weather = await this.getWeather(locations.home, forceRefresh);
    
    return {
      success: true,
      state: this.state,
      stateConfig: {
        name: this.stateConfig.name,
        transitAuthority: this.stateConfig.transitAuthority,
        timezone: this.stateConfig.timezone
      },
      fallbackMode: this.fallbackMode,
      route: recommendation.recommended,
      pattern: recommendation.pattern,
      alternatives: recommendation.routes?.slice(0, 5),
      reasoning: recommendation.reasoning,
      coffee: coffeeResult,
      transit: transitData,
      weather,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get stops from API or fallback
   */
  async getStops(forceRefresh = false) {
    if (this.fallbackMode || !this.apiKeys.transitKey) {
      return this.fallbackData?.stops || [];
    }
    
    // Per-state stops lookup
    // v1.42: VIC implemented via Transport Victoria OpenData API
    // Other states return fallback data pending API integration
    switch (this.state) {
      case 'VIC':
        // VIC: Use configured stop IDs or auto-detected stops
        // Stops are typically discovered via nearbyStops in geocoded addresses
        // or configured via Setup Wizard
        const trainStopId = this.preferences.trainStopId || this.detectTrainStopId();
        const tramStopId = this.preferences.tramStopId || this.detectTramStopId();
        
        // Build stops array from configured/detected IDs
        const stops = [];
        if (trainStopId) {
          stops.push({ id: trainStopId, type: 'train', source: 'config' });
        }
        if (tramStopId) {
          stops.push({ id: tramStopId, type: 'tram', source: 'config' });
        }
        
        // Include nearbyStops from location preferences
        const homeNearby = this.preferences.homeLocation?.nearbyStops;
        if (homeNearby) {
          if (homeNearby.train?.stopId) stops.push({ ...homeNearby.train, type: 'train', source: 'nearby' });
          if (homeNearby.tram?.stopId) stops.push({ ...homeNearby.tram, type: 'tram', source: 'nearby' });
        }
        
        return stops.length > 0 ? stops : this.fallbackData?.stops || [];
        
      case 'NSW':
        // NSW: Transport for NSW Open Data (pending integration)
        // API: https://opendata.transport.nsw.gov.au
        return this.fallbackData?.stops || [];
        
      case 'QLD':
        // QLD: TransLink Open Data (pending integration)
        // API: https://www.data.qld.gov.au/dataset/general-transit-feed-specification-gtfs-seq
        return this.fallbackData?.stops || [];
        
      case 'WA':
        // WA: Transperth GTFS (pending integration)
        return this.fallbackData?.stops || [];
        
      case 'SA':
        // SA: Adelaide Metro GTFS (pending integration)
        return this.fallbackData?.stops || [];
        
      default:
        // Unknown state - use fallback
        return this.fallbackData?.stops || [];
    }
  }

  /**
   * Get live transit data or fallback
   */
  async getTransitData(forceRefresh = false) {
    const now = Date.now();
    
    // Check cache
    if (!forceRefresh && this.cache.transitData && 
        this.cache.transitCacheTime && (now - this.cache.transitCacheTime) < this.TRANSIT_CACHE_MS) {
      return this.cache.transitData;
    }
    
    let data;
    
    if (this.fallbackMode) {
      // No API key available - return empty data (per Section 23.6: no mock fallbacks)
      data = this.generateFallbackDepartures();
    } else {
      // Try live API
      try {
        data = await this.fetchLiveTransitData();
      } catch (error) {
        console.error('[CommuteCompute] Live transit fetch failed, returning empty data:', error.message);
        data = this.generateFallbackDepartures();
      }
    }
    
    // Cache result
    this.cache.transitData = data;
    this.cache.transitCacheTime = now;
    
    return data;
  }

  /**
   * Generate departures when live API is unavailable
   * Per DEVELOPMENT-RULES Section 23.6: NO mock data fallbacks.
   * Returns empty arrays so the UI shows "No live data available"
   * instead of fake departure times that mislead users.
   */
  generateFallbackDepartures() {
    return {
      trains: [],
      trams: [],
      buses: [],
      source: 'fallback',
      disclaimer: 'No live transit data available'
    };
  }

  /**
   * Fetch live transit data from state API
   */
  async fetchLiveTransitData() {
    // State-specific API calls
    // v1.42: VIC fully implemented via Transport Victoria OpenData GTFS-RT
    // Other states: pending integration (fallback to scheduled timetables)
    // See: DEVELOPMENT-RULES.md Section 11.1 for API requirements
    if (this.state === 'VIC') {
      // Use Transport Victoria OpenData API client
      try {
        // Get stop IDs from preferences, or auto-detect based on journey destination
        // GTFS-RT uses direction-specific stop IDs (different platforms = different IDs)
        // 
        // Per DEVELOPMENT-RULES.md Section 17.4: No hardcoded personal data
        // Stop IDs should come from user preferences or be auto-detected
        //
        // Melbourne City Loop detection:
        // - If work is in CBD (lat ~-37.81, lon ~144.96), use citybound stops
        // - Otherwise use outbound stops
        const trainStopId = this.preferences.trainStopId || this.detectTrainStopId();
        const tramStopId = this.preferences.tramStopId || this.detectTramStopId();
        
        // Per DEVELOPMENT-RULES.md Section 17.4: No hardcoded stops
        // If stop IDs not configured, log warning and use fallback data
        if (!trainStopId && !tramStopId) {
          throw new Error('Stop IDs not configured - please configure via Setup Wizard');
        }
        
        // Pass API key directly to each call (Zero-Config: no env vars)
        const apiOptions = { apiKey: this.apiKeys.transitKey };
        
        const [trains, trams, buses] = await Promise.all([
          trainStopId ? transitApi.getDepartures(trainStopId, 0, apiOptions) : Promise.resolve([]),
          tramStopId ? transitApi.getDepartures(tramStopId, 1, apiOptions) : Promise.resolve([]),
          Promise.resolve([])  // 2 = bus (skip for now)
        ]);
        
        return {
          trains: trains.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs, // Absolute time for live countdown
            destination: t.destination,
            platform: t.platform,
            isScheduled: !t.isLive,
            isDelayed: t.isDelayed,
            delayMinutes: t.delayMinutes,
            source: t.isLive ? 'live' : 'scheduled'
          })),
          trams: trams.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs, // Absolute time for live countdown
            destination: t.destination,
            isScheduled: !t.isLive,
            source: t.isLive ? 'live' : 'scheduled'
          })),
          buses: buses.map(b => ({
            minutes: b.minutes,
            departureTimeMs: b.departureTimeMs, // Absolute time for live countdown
            destination: b.destination,
            isScheduled: !b.isLive,
            source: b.isLive ? 'live' : 'scheduled'
          })),
          source: 'opendata',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        throw error; // Let caller handle fallback
      }
    }
    
    // Other states - not yet implemented
    throw new Error('Live API not implemented for ' + this.state);
  }

  /**
   * Get service alerts
   * v1.42: Implemented per-state alerts via GTFS-RT service-alerts
   * Returns concatenated alert text for CoffeeDecision disruption check
   */
  async getServiceAlerts() {
    if (this.fallbackMode) {
      return '';
    }
    
    // v1.42: Fetch service alerts from Transport Victoria OpenData API
    if (this.state === 'VIC') {
      try {
        const apiOptions = { apiKey: this.apiKeys.transitKey };
        
        // Fetch alerts for all modes (metro, tram)
        const [metroAlerts, tramAlerts] = await Promise.all([
          transitApi.getDisruptions(0, apiOptions).catch(() => []),
          transitApi.getDisruptions(1, apiOptions).catch(() => [])
        ]);
        
        const allAlerts = [...metroAlerts, ...tramAlerts];
        
        if (allAlerts.length === 0) {
          return '';
        }
        
        // Concatenate alert titles for CoffeeDecision.isDisrupted() check
        // CoffeeDecision looks for: 'Major Delays', 'Suspended', 'Buses replace', 'Cancellation'
        const alertText = allAlerts
          .map(a => a.title || '')
          .filter(t => t.length > 0)
          .join('; ');
        
        return alertText;
        
      } catch (error) {
        return '';
      }
    }
    
    // Other states - not yet implemented
    return '';
  }

  /**
   * Get weather from BOM
   */
  async getWeather(location, forceRefresh = false) {
    const now = Date.now();
    
    // Check cache
    if (!forceRefresh && this.cache.weather &&
        this.cache.weatherCacheTime && (now - this.cache.weatherCacheTime) < this.WEATHER_CACHE_MS) {
      return this.cache.weather;
    }
    
    try {
      const weather = await this.fetchBomWeather(location);
      this.cache.weather = weather;
      this.cache.weatherCacheTime = now;
      return weather;
    } catch (error) {
      return this.getFallbackWeather();
    }
  }

  /**
   * Fetch weather from Open-Meteo API (via opendata-client module)
   */
  async fetchBomWeather(location) {
    // Use Open-Meteo (free, no key) via opendata-client
    try {
      const lat = location?.lat || this.preferences.homeLocation?.lat || -37.8136;
      const lon = location?.lon || this.preferences.homeLocation?.lon || 144.9631;
      
      const weather = await transitApi.getWeather(lat, lon);
      
      // Map weather code to icon
      const iconMap = {
        'Clear': '(sun)', 'Mostly Clear': '(sun)', 'Partly Cloudy': '(cloud)', 'Cloudy': '(cloud)',
        'Foggy': '(fog)', 'Drizzle': '(rain)', 'Rain': '(rain)', 'Heavy Rain': '(rain)',
        'Snow': '(snow)', 'Heavy Snow': '(snow)', 'Showers': '(rain)', 'Heavy Showers': '(rain)',
        'Storm': '(storm)', 'Unknown': '(?)'
      };
      
      return {
        temp: weather.temp,
        condition: weather.condition,
        icon: iconMap[weather.condition] || '(?)',
        umbrella: weather.umbrella,
        source: weather.error ? 'fallback' : 'open-meteo'
      };
    } catch (error) {
      return this.getFallbackWeather();
    }
  }

  /**
   * Get fallback weather data
   */
  getFallbackWeather() {
    return {
      temp: '--',
      condition: 'Unknown',
      icon: '(?)',
      source: 'fallback',
      umbrella: false
    };
  }

  /**
   * Update coffee decision timings from route
   */
  updateCoffeeFromRoute(route) {
    if (!route || !this.coffeeDecision) return;
    
    if (route.coffeeSegments) {
      this.coffeeDecision.commute.homeToCafe = route.coffeeSegments.walkToCafe || 5;
      this.coffeeDecision.commute.makeCoffee = route.coffeeSegments.coffeeTime || 5;
      this.coffeeDecision.commute.cafeToTransit = route.coffeeSegments.walkToStation || 2;
    }
    
    if (route.modes?.length > 0) {
      this.coffeeDecision.commute.transitRide = route.modes[0]?.estimatedDuration || 5;
      if (route.modes.length > 1) {
        this.coffeeDecision.commute.trainRide = route.modes[1]?.estimatedDuration || 15;
      }
    }
    
    if (route.walkingSegments?.stationToWork) {
      this.coffeeDecision.commute.walkToWork = route.walkingSegments.stationToWork;
    }
  }

  /**
   * Calculate coffee decision
   */
  calculateCoffeeDecision(transitData, alertText) {
    if (!this.coffeeDecision) {
      return { decision: 'NO DATA', subtext: 'Not initialized', canGet: false, urgent: false };
    }
    
    const nextDeparture = transitData?.trains?.[0]?.minutes || 
                          transitData?.trams?.[0]?.minutes || 30;
    const tramData = transitData?.trams || [];
    
    return this.coffeeDecision.calculate(nextDeparture, tramData, alertText);
  }

  /**
   * Auto-detect appropriate train stop ID based on journey destination
   * v1.42: Enhanced detection using nearbyStops from preferences
   * Per DEVELOPMENT-RULES.md Section 17.4: No hardcoded personal data
   * Per DEVELOPMENT-RULES.md Section 23.1: GTFS-RT Stop ID Architecture
   * 
   * Detection order:
   * 1. User-configured trainStopId
   * 2. nearbyStops.train.stopId from geocoded home location
   * 3. nearbyStops.train.cityboundStopId if work is in CBD
   * 4. null (triggers fallback timetable data)
   */
  detectTrainStopId() {
    const prefs = this.getPrefs();
    
    // 1. Check explicit user configuration first
    if (prefs.trainStopId) {
      return prefs.trainStopId;
    }
    
    // 2. Check for nearbyStops from geocoded home location
    // These would be populated by the Setup Wizard during address geocoding
    const homeNearby = prefs.homeLocation?.nearbyStops?.train;
    
    if (homeNearby?.stopId) {
      // Determine direction based on work location
      const workLat = prefs.workLocation?.lat;
      const workLon = prefs.workLocation?.lon;
      
      // CBD bounds for Melbourne (City Loop area)
      const isCitybound = workLat && workLon && 
        workLat >= -37.825 && workLat <= -37.805 &&
        workLon >= 144.950 && workLon <= 144.985;
      
      if (isCitybound && homeNearby.cityboundStopId) {
        return homeNearby.cityboundStopId;
      }
      
      if (!isCitybound && homeNearby.outboundStopId) {
        return homeNearby.outboundStopId;
      }
      
      // Default to generic stop ID
      return homeNearby.stopId;
    }
    
    // 3. Check for nearby stations from cafe location (for coffee-first routes)
    const cafeNearby = prefs.cafeLocation?.nearbyStops?.train;
    if (cafeNearby?.stopId) {
      return cafeNearby.stopId;
    }
    
    // 4. No stop ID available - return null to trigger fallback
    return null;
  }

  /**
   * Auto-detect appropriate tram stop ID based on journey
   * v1.42: Enhanced detection using nearbyStops from preferences
   * Per DEVELOPMENT-RULES.md Section 17.4: No hardcoded personal data
   * 
   * Detection order:
   * 1. User-configured tramStopId
   * 2. nearbyStops.tram.stopId from geocoded home location
   * 3. nearbyStops.tram.stopId from geocoded cafe location
   * 4. null (triggers fallback timetable data)
   */
  detectTramStopId() {
    const prefs = this.getPrefs();
    
    // 1. Check explicit user configuration first
    if (prefs.tramStopId) {
      return prefs.tramStopId;
    }
    
    // 2. Check for nearbyStops from geocoded home location
    const homeNearby = prefs.homeLocation?.nearbyStops?.tram;
    if (homeNearby?.stopId) {
      return homeNearby.stopId;
    }
    
    // 3. Check for nearby tram stops from cafe location
    const cafeNearby = prefs.cafeLocation?.nearbyStops?.tram;
    if (cafeNearby?.stopId) {
      return cafeNearby.stopId;
    }
    
    // 4. No stop ID available - return null to trigger fallback
    return null;
  }

  /**
   * Get default mode priority for detected state
   */
  getDefaultModePriority() {
    switch (this.state) {
      case 'VIC':
        return { train: 1, tram: 1, bus: 3, vline: 2 };
      case 'NSW':
        return { train: 1, metro: 1, bus: 2, ferry: 3, lightrail: 2 };
      case 'QLD':
        return { train: 1, bus: 2, ferry: 3 };
      case 'SA':
        return { train: 1, tram: 1, bus: 2 };
      case 'WA':
        return { train: 1, bus: 2, ferry: 3 };
      default:
        return { train: 1, bus: 2 };
    }
  }

  /**
   * Get local time for detected state
   */
  getLocalTime() {
    const timezone = this.stateConfig?.timezone || 'Australia/Melbourne';
    return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  }

  /**
   * Get preferences helper
   */
  getPrefs() {
    if (!this.preferences) return {};
    return typeof this.preferences.get === 'function' 
      ? this.preferences.get() 
      : this.preferences;
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache = {
      routes: null,
      routesCacheTime: null,
      transitData: null,
      transitCacheTime: null,
      weather: null,
      weatherCacheTime: null
    };
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      initialized: !!this.state,
      state: this.state,
      stateName: this.stateConfig?.name,
      transitAuthority: this.stateConfig?.transitAuthority,
      timezone: this.stateConfig?.timezone,
      fallbackMode: this.fallbackMode,
      hasApiKeys: this.hasRequiredApiKeys(),
      cacheStatus: {
        routes: !!this.cache.routes,
        transit: !!this.cache.transitData,
        weather: !!this.cache.weather
      }
    };
  }

  /**
   * Calculate weighted route score per DEVELOPMENT-RULES.md Section 23.9.2
   * v1.42: Weighted scoring for route selection
   * 
   * Weights:
   *   - Total time: 40%
   *   - Transfers: 25% (+5 points per transfer)
   *   - Walking: 20%
   *   - Reliability: 15% (based on delays)
   * 
   * @param {Object} route - Route object with legs array
   * @param {Object} delays - Optional delay data keyed by leg/route
   * @returns {number} - Weighted score (lower is better)
   */
  scoreRoute(route, delays = {}) {
    if (!route || !route.legs) {
      return Infinity;
    }
    
    const legs = route.legs;
    
    // 1. Total time (40% weight)
    const totalTime = route.totalMinutes || 
      legs.reduce((sum, leg) => sum + (leg.minutes || leg.durationMinutes || 0), 0);
    
    // 2. Number of transfers (25% weight, +5 points per transfer)
    const transitLegs = legs.filter(l => 
      ['train', 'tram', 'bus', 'vline', 'ferry', 'transit'].includes(l.type)
    );
    const transfers = Math.max(0, transitLegs.length - 1);
    
    // 3. Total walking time (20% weight)
    const walkingMinutes = legs
      .filter(l => l.type === 'walk')
      .reduce((sum, leg) => sum + (leg.minutes || leg.durationMinutes || 0), 0);
    
    // 4. Reliability penalty (15% weight) - based on current delays
    let reliabilityPenalty = 0;
    for (const leg of transitLegs) {
      const legDelay = leg.delayMinutes || leg.delay || 
        delays[leg.routeNumber] || delays[leg.lineName] || 0;
      reliabilityPenalty += legDelay * 2; // 2 points per minute of delay
    }
    
    // Calculate weighted score (lower is better)
    const score = 
      (totalTime * 0.40) +           // 40% time
      (transfers * 5 * 0.25) +       // 25% transfers (+5 per transfer)
      (walkingMinutes * 0.20) +      // 20% walking
      (reliabilityPenalty * 0.15);   // 15% reliability
    
    // Store score on route for debugging
    route.score = Math.round(score * 100) / 100;
    
    return score;
  }

  // ===========================================================================
  // ROUTE DISCOVERY (Merged from smart-journey-engine.js)
  // ===========================================================================

  /**
   * Get configured locations with coordinates
   */
  getLocations() {
    const prefs = this.getPrefs();
    return {
      home: prefs.homeLocation || { address: prefs.homeAddress, label: 'HOME' },
      work: prefs.workLocation || { address: prefs.workAddress, label: 'WORK' },
      cafe: prefs.cafeLocation || { name: prefs.cafeName, address: prefs.coffeeAddress, label: 'COFFEE' }
    };
  }

  /**
   * Auto-discover all viable routes using fallback timetables
   */
  async discoverRoutes() {
    const locations = this.getLocations();
    const prefs = this.getPrefs();
    const includeCoffee = prefs.coffeeEnabled !== false && locations.cafe;
    
    // Get fallback timetables for stop data
    const fallbackTimetables = global.fallbackTimetables;
    if (!fallbackTimetables) {
      this.discoveredRoutes = this.getHardcodedRoutes(locations, includeCoffee);
      return this.discoveredRoutes;
    }
    
    const allStops = fallbackTimetables.getStopsForState?.(this.state || 'VIC') || [];
    if (allStops.length === 0) {
      this.discoveredRoutes = this.getHardcodedRoutes(locations, includeCoffee);
      return this.discoveredRoutes;
    }
    
    // Find stops near home, cafe, and work
    const homeStops = this.findNearbyStops(locations.home, allStops, 1000);
    const workStops = this.findNearbyStops(locations.work, allStops, 1000);
    
    
    // Build route alternatives
    const routes = [];
    
    // Strategy 1: Direct routes (single mode)
    const directRoutes = this.findDirectRoutes(homeStops, workStops, locations, includeCoffee);
    routes.push(...directRoutes);
    
    // Strategy 2: Multi-modal routes (tram → train, etc.)
    const multiModalRoutes = this.findMultiModalRoutes(homeStops, workStops, allStops, locations, includeCoffee);
    routes.push(...multiModalRoutes);
    
    // v1.42: Sort by weighted score per Dev Rules Section 23.9.2
    // Weights: 40% time, 25% transfers, 20% walking, 15% reliability
    routes.sort((a, b) => this.scoreRoute(a) - this.scoreRoute(b));
    
    // Keep top 5 unique routes
    this.discoveredRoutes = routes.slice(0, 5);
    
    return this.discoveredRoutes;
  }

  /**
   * Find stops near a location
   */
  findNearbyStops(location, allStops, radiusMeters = 1000) {
    if (!location?.lat || !location?.lon) return [];
    
    return allStops
      .map(stop => ({
        ...stop,
        distance: this.haversineDistance(location.lat, location.lon, stop.lat, stop.lon)
      }))
      .filter(stop => stop.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find direct routes (single transit mode)
   */
  findDirectRoutes(homeStops, workStops, locations, includeCoffee) {
    const routes = [];
    const homeByType = this.groupByRouteType(homeStops);
    const workByType = this.groupByRouteType(workStops);
    
    for (const [routeType, homeTypeStops] of Object.entries(homeByType)) {
      if (!workByType[routeType]) continue;
      
      const homeStop = homeTypeStops[0];
      const workStop = workByType[routeType][0];
      
      const modeName = this.getTransitModeName(parseInt(routeType));
      const walkToStop = Math.ceil(homeStop.distance / 80);
      const transitTime = this.estimateTransitTime(homeStop, workStop);
      const walkFromStop = Math.ceil(workStop.distance / 80);
      
      const legs = [];
      let totalMinutes = 0;
      
      if (includeCoffee) {
        // Extract cafe name from location data (v1.18 fix)
        const cafeName = locations.cafe?.name || 
                        locations.cafe?.formattedAddress?.split(',')[0] ||
                        locations.cafe?.address?.split(',')[0] ||
                        'Cafe';
        legs.push({ type: 'walk', to: 'cafe', from: 'home', minutes: 3, cafeName });
        legs.push({ type: 'coffee', location: cafeName, cafeName, minutes: 4 });
        legs.push({ type: 'walk', to: `${modeName} stop`, minutes: walkToStop, stopName: homeStop.name });
        totalMinutes += 7 + walkToStop;
      } else {
        legs.push({ type: 'walk', to: `${modeName} stop`, minutes: walkToStop });
        totalMinutes += walkToStop;
      }
      
      legs.push({
        type: modeName.toLowerCase(),
        routeNumber: homeStop.route_number || '',
        origin: { name: homeStop.name, lat: homeStop.lat, lon: homeStop.lon },
        destination: { name: workStop.name, lat: workStop.lat, lon: workStop.lon },
        minutes: transitTime
      });
      totalMinutes += transitTime;
      
      // v1.19: Include work name for display
      const workName = locations?.work?.name || 
                      locations?.work?.address?.split(',')[0]?.trim() || 
                      'Office';
      legs.push({ type: 'walk', to: 'work', minutes: walkFromStop, workName });
      totalMinutes += walkFromStop;
      
      routes.push({
        id: `direct-${modeName.toLowerCase()}-${homeStop.route_number || 'main'}`,
        name: `${modeName}${homeStop.route_number ? ' ' + homeStop.route_number : ''} Direct`,
        description: includeCoffee ? `Home → Coffee → ${modeName} → Work` : `Home → ${modeName} → Work`,
        type: 'direct',
        totalMinutes,
        legs
      });
    }
    
    return routes;
  }

  /**
   * Find multi-modal routes (e.g., tram → train)
   */
  findMultiModalRoutes(homeStops, workStops, allStops, locations, includeCoffee) {
    const routes = [];
    const trainStations = allStops.filter(s => s.route_type === 0);
    const tramStops = allStops.filter(s => s.route_type === 1);
    const homeTrams = homeStops.filter(s => s.route_type === 1);
    const workTrains = workStops.filter(s => s.route_type === 0);
    
    if (homeTrams.length === 0 || workTrains.length === 0) return routes;
    
    for (const trainStation of trainStations.slice(0, 20)) {
      const nearbyTrams = tramStops.filter(t => 
        this.haversineDistance(trainStation.lat, trainStation.lon, t.lat, t.lon) < 300
      );
      
      if (nearbyTrams.length === 0) continue;
      
      const homeTram = homeTrams[0];
      const workTrain = workTrains[0];
      
      const walkToCafe = includeCoffee ? 3 : 0;
      const coffeeTime = includeCoffee ? 4 : 0;
      const walkToTram = includeCoffee ? 2 : Math.ceil(homeTram.distance / 80);
      const tramTime = this.estimateTransitTime(homeTram, nearbyTrams[0]);
      const walkToTrain = 2;
      const trainTime = this.estimateTransitTime(trainStation, workTrain);
      const walkToWork = Math.ceil(workTrain.distance / 80);
      
      const totalMinutes = walkToCafe + coffeeTime + walkToTram + tramTime + walkToTrain + trainTime + walkToWork;
      
      if (totalMinutes > 45) continue;
      
      const legs = [];
      // Extract cafe name (v1.18 fix)
      const cafeName = locations.cafe?.name || 
                      locations.cafe?.formattedAddress?.split(',')[0] ||
                      locations.cafe?.address?.split(',')[0] ||
                      'Cafe';
      
      if (includeCoffee) {
        legs.push({ type: 'walk', to: 'cafe', minutes: walkToCafe, cafeName });
        legs.push({ type: 'coffee', location: cafeName, cafeName, minutes: coffeeTime });
        legs.push({ type: 'walk', to: 'tram stop', minutes: walkToTram, stopName: homeTram.name });
      } else {
        legs.push({ type: 'walk', to: 'tram stop', minutes: walkToTram, stopName: homeTram.name });
      }
      
      legs.push({ 
        type: 'tram', 
        routeNumber: homeTram.route_number || '',
        origin: { name: homeTram.name }, 
        destination: { name: trainStation.name }, 
        originStop: homeTram.name,
        minutes: tramTime 
      });
      legs.push({ type: 'walk', to: 'train platform', minutes: walkToTrain, stationName: trainStation.name });
      legs.push({ 
        type: 'train', 
        routeNumber: workTrain.route_number || '', 
        lineName: workTrain.line_name || workTrain.route_name || '',
        origin: { name: trainStation.name }, 
        destination: { name: workTrain.name },
        originStation: trainStation.name,
        minutes: trainTime 
      });
      // v1.19: Include work name for display
      const workName = locations?.work?.name || 
                      locations?.work?.address?.split(',')[0]?.trim() || 
                      'Office';
      legs.push({ type: 'walk', to: 'work', minutes: walkToWork, workName });
      
      routes.push({
        id: `multi-tram-train-${trainStation.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: `Tram → ${trainStation.name} → Train`,
        description: includeCoffee ? `Home → Coffee → Tram → Train → Work` : `Home → Tram → Train → Work`,
        type: 'multi-modal',
        via: trainStation.name,
        totalMinutes,
        legs
      });
    }
    
    return routes;
  }

  /**
   * Generate route templates when no real stop data is available
   * Per DEVELOPMENT-RULES.md: NO hardcoded personal data
   * Routes are built from user config (locations) only
   * 
   * Supports patterns:
   * - Home > Coffee > Tram > Train > Office (multi-modal with coffee)
   * - Home > Coffee > Train > Office
   * - Home > Tram > Office
   * - Home > Train > Office
   * - Home > Bus > Office
   */
  getHardcodedRoutes(locations, includeCoffee) {
    const routes = [];
    
    // Extract names from user config (NO hardcoded location names) - v1.19 improved extraction
    const cafeName = locations?.cafe?.name || 
                    locations?.cafe?.formattedAddress?.split(',')[0] ||
                    locations?.cafe?.address?.split(',')[0] || 
                    'Cafe';
    
    // Extract suburb/area from address (e.g., "1 Example St, Suburb" → "South Yarra")
    const homeArea = locations?.home?.suburb ||
                    locations?.home?.address?.split(',')[1]?.trim() || 
                    null;
    const workArea = locations?.work?.suburb ||
                    locations?.work?.address?.split(',')[1]?.trim() || 
                    null;
    
    // Extract work address short name (e.g., "123 Work Street" from full address)
    const workAddressShort = locations?.work?.name ||
                            locations?.work?.address?.split(',')[0]?.trim() ||
                            'Office';
    
    // Resolve actual stop names via GTFS lookup FIRST (most reliable),
    // then config nearbyStops, then suburb-derived names
    const homeDetected = detectStopIdsFromAddress(locations?.home?.address);
    const workDetected = detectStopIdsFromAddress(locations?.work?.address);

    const nearestTramStop = locations?.cafe?.nearbyStops?.tram?.name ||
                           locations?.home?.nearbyStops?.tram?.name ||
                           getStopNameById(homeDetected.tramStopId) ||
                           (homeArea ? `${homeArea} Tram Stop` : 'Tram Stop');
    const nearestTrainStation = locations?.home?.nearbyStops?.train?.name ||
                               getStopNameById(homeDetected.trainStopId) ||
                               (homeArea ? `${homeArea} Station` : 'Station');
    const workStation = locations?.work?.nearbyStops?.train?.name ||
                       getStopNameById(workDetected.trainStopId) ||
                       (workArea ? `${workArea} Station` : 'Flinders Street Station');

    // Resolve tram/bus route numbers from nearby stop data for GTFS-RT matching
    const tramRouteNumber = locations?.cafe?.nearbyStops?.tram?.route_number ||
                            locations?.home?.nearbyStops?.tram?.route_number || null;
    const busRouteNumber = locations?.home?.nearbyStops?.bus?.route_number || null;
    
    // =========================================================================
    // ROUTE 1: Coffee + Tram + Train (PREFERRED multi-modal pattern)
    // Pattern: Home > Coffee > Tram > Train > Walk > Office
    // This is the most common Melbourne commute with transfer
    // =========================================================================
    if (includeCoffee) {
      routes.push({
        id: 'coffee-tram-train',
        name: 'Coffee + Tram + Train',
        description: 'Home → Coffee → Tram → Train → Office',
        type: 'preferred',
        totalMinutes: 35,
        legs: [
          { type: 'walk', to: 'cafe', from: 'home', minutes: 3, fromHome: true, cafeName, destinationName: cafeName },
          { type: 'coffee', location: cafeName, cafeName, minutes: 5, canGet: true },
          { type: 'walk', to: 'tram stop', minutes: 2, stopName: nearestTramStop },
          { type: 'tram', routeNumber: tramRouteNumber || '', origin: { name: nearestTramStop }, destination: { name: nearestTrainStation }, originStop: nearestTramStop, minutes: 6 },
          { type: 'walk', to: 'train platform', minutes: 2, stationName: nearestTrainStation },
          { type: 'train', origin: { name: nearestTrainStation }, destination: { name: workStation }, originStation: nearestTrainStation, minutes: 8 },
          { type: 'walk', to: 'work', minutes: 5, workName: workAddressShort }
        ]
      });
    }
    
    // =========================================================================
    // ROUTE 2: Coffee + Train only
    // Pattern: Home > Walk > Coffee > Walk > Train > Walk > Office
    // =========================================================================
    if (includeCoffee) {
      routes.push({
        id: 'coffee-train',
        name: 'Coffee + Train',
        description: 'Home → Coffee → Train → Office',
        type: 'standard',
        totalMinutes: 30,
        legs: [
          { type: 'walk', to: 'cafe', from: 'home', minutes: 4, fromHome: true, cafeName, destinationName: cafeName },
          { type: 'coffee', location: cafeName, cafeName, minutes: 5, canGet: true },
          { type: 'walk', to: 'train platform', from: cafeName, minutes: 5, stationName: nearestTrainStation },
          { type: 'train', origin: { name: nearestTrainStation }, destination: { name: workStation }, originStation: nearestTrainStation, minutes: 10 },
          { type: 'walk', to: 'work', minutes: 6, workName: workAddressShort }
        ]
      });
    }
    
    // =========================================================================
    // ROUTE 3: Direct train (no coffee)
    // Pattern: Home > Walk > Train > Walk > Office
    // =========================================================================
    routes.push({
      id: 'train-direct',
      name: 'Train Direct',
      description: 'Home → Train → Office',
      type: 'direct',
      totalMinutes: 22,
      legs: [
        { type: 'walk', to: 'station', from: 'home', minutes: 7, fromHome: true, stationName: nearestTrainStation },
        { type: 'train', origin: { name: nearestTrainStation }, destination: { name: workStation }, originStation: nearestTrainStation, minutes: 10 },
        { type: 'walk', to: 'work', minutes: 5, workName: workAddressShort }
      ]
    });

    // =========================================================================
    // ROUTE 4: Tram + Train (no coffee)
    // Pattern: Home > Walk > Tram > Train > Walk > Office
    // =========================================================================
    routes.push({
      id: 'tram-train',
      name: 'Tram + Train',
      description: 'Home → Tram → Train → Office',
      type: 'transfer',
      totalMinutes: 28,
      legs: [
        { type: 'walk', to: 'tram stop', from: 'home', minutes: 4, fromHome: true, stopName: nearestTramStop },
        { type: 'tram', routeNumber: tramRouteNumber || '', origin: { name: nearestTramStop }, destination: { name: nearestTrainStation }, originStop: nearestTramStop, minutes: 10 },
        { type: 'train', origin: { name: nearestTrainStation }, destination: { name: workStation }, originStation: nearestTrainStation, minutes: 10 },
        { type: 'walk', to: 'work', minutes: 4, workName: workAddressShort }
      ]
    });
    
    // =========================================================================
    // ROUTE 5: Direct tram
    // Pattern: Home > Tram > Walk > Office
    // =========================================================================
    routes.push({
      id: 'tram-direct',
      name: 'Tram Direct',
      description: 'Home → Tram → Office',
      type: 'express',
      totalMinutes: 20,
      legs: [
        { type: 'tram', routeNumber: tramRouteNumber || '', origin: { name: nearestTramStop }, destination: { name: workArea || 'CBD' }, originStop: nearestTramStop, minutes: 14, fromHome: true },
        { type: 'walk', to: 'work', minutes: 6, workName: workAddressShort }
      ]
    });
    
    // =========================================================================
    // ROUTE 6: Bus alternative
    // Pattern: Home > Walk > Bus > Walk > Office
    // =========================================================================
    routes.push({
      id: 'bus-direct',
      name: 'Bus Alternative',
      description: 'Home → Bus → Office',
      type: 'alternative',
      totalMinutes: 30,
      legs: [
        { type: 'walk', to: 'bus stop', from: 'home', minutes: 4, fromHome: true },
        { type: 'bus', routeNumber: busRouteNumber || '', origin: { name: homeArea || 'Home' }, destination: { name: workArea || 'CBD' }, originStop: homeArea || 'Home', minutes: 20 },
        { type: 'walk', to: 'work', minutes: 6, workName: workAddressShort }
      ]
    });
    
    return routes;
  }

  /**
   * Get the currently selected route
   */
  getSelectedRoute() {
    if (this.discoveredRoutes?.length > 0) {
      return this.discoveredRoutes[this.selectedRouteIndex || 0];
    }
    const locations = this.getLocations();
    const prefs = this.getPrefs();
    const routes = this.getHardcodedRoutes(locations, prefs.coffeeEnabled !== false);
    return routes[this.selectedRouteIndex || 0] || routes[0];
  }

  /**
   * Get all discovered routes
   */
  getAlternativeRoutes() {
    const routes = this.discoveredRoutes || [];
    // Only show alternate routes when primary route confidence is below 40%
    if (routes.length <= 1) return routes;
    const primary = routes[this.selectedRouteIndex || 0];
    const primaryConfidence = primary?.pattern?.confidence || primary?.preferenceMatch?.confidence || 0.5;
    if (primaryConfidence >= 0.40) {
      // High confidence in primary route - only return the selected route
      return primary ? [primary] : routes.slice(0, 1);
    }
    return routes;
  }

  /**
   * Select a route by index or ID
   */
  selectRoute(indexOrId) {
    if (typeof indexOrId === 'number') {
      this.selectedRouteIndex = Math.max(0, Math.min(indexOrId, (this.discoveredRoutes?.length || 1) - 1));
    } else if (this.discoveredRoutes) {
      const idx = this.discoveredRoutes.findIndex(r => r.id === indexOrId);
      if (idx >= 0) this.selectedRouteIndex = idx;
    }
    return this.getSelectedRoute();
  }

  // ===========================================================================
  // JOURNEY DISPLAY (Merged from smart-journey-engine.js)
  // ===========================================================================

  /**
   * Build journey data for dashboard display
   * V13.3: Enhanced to calculate proper departure times for each leg
   * V13.5: Smart coffee skip - keeps cafe visible but excludes from timing when running late
   * V13.6: Cafe closed = completely remove cafe legs; merge consecutive walk legs
   */
  async buildJourneyForDisplay(transitData = null, weatherData = null) {
    const now = this.getLocalTime();
    const currentTimeMs = now.getTime();
    const locations = this.getLocations();
    const route = this.getSelectedRoute();
    const prefs = this.getPrefs();

    let routeLegs = route?.legs || this.getHardcodedRoutes(locations, true)[0].legs;

    // V13.5: First, calculate coffee decision to determine if we need to skip
    const coffeeDecision = this.calculateCoffeeDecision(transitData, '');
    const shouldSkipCoffee = coffeeDecision && !coffeeDecision.canGet;
    const isCafeClosed = coffeeDecision && coffeeDecision.cafeClosed;

    // V15.0: Unified coffee bypass — both cafe-closed AND running-late
    // Keep coffee leg visible with skipped design, recalculate direct bypass walk
    if (isCafeClosed || shouldSkipCoffee) {
      const coffeeIdx = routeLegs.findIndex(leg => leg.type === 'coffee');

      if (coffeeIdx >= 0) {
        // Find walk-to-cafe (walk leg immediately before coffee)
        const walkToCafeIdx = coffeeIdx > 0 && routeLegs[coffeeIdx - 1].type === 'walk'
          ? coffeeIdx - 1 : -1;

        // Find walk-from-cafe (walk leg immediately after coffee)
        const walkFromCafeIdx = coffeeIdx + 1 < routeLegs.length && routeLegs[coffeeIdx + 1].type === 'walk'
          ? coffeeIdx + 1 : -1;

        // Find the leg AFTER all cafe-related legs (the "post-cafe" destination)
        const postCafeIdx = walkFromCafeIdx >= 0 ? walkFromCafeIdx + 1 : coffeeIdx + 1;
        const postCafeLeg = routeLegs[postCafeIdx];

        // Recalculate the walk-to-cafe leg as a direct bypass walk
        if (walkToCafeIdx >= 0 && postCafeLeg) {
          const bypassLeg = routeLegs[walkToCafeIdx];
          // Sum walk-to-cafe + walk-from-cafe durations as bypass estimate
          const walkFromCafeMins = walkFromCafeIdx >= 0
            ? (routeLegs[walkFromCafeIdx].minutes || routeLegs[walkFromCafeIdx].durationMinutes || 0) : 0;
          const walkToCafeMins = bypassLeg.minutes || bypassLeg.durationMinutes || 0;
          bypassLeg.minutes = walkToCafeMins + walkFromCafeMins;
          bypassLeg.durationMinutes = bypassLeg.minutes;
          // Update destination to the post-cafe leg's location
          bypassLeg.to = postCafeLeg.stopName || postCafeLeg.stationName || postCafeLeg.to || postCafeLeg.origin?.name || 'transit';
          bypassLeg.stopName = postCafeLeg.stopName || bypassLeg.stopName;
          bypassLeg.stationName = postCafeLeg.stationName || bypassLeg.stationName;
          bypassLeg.destinationName = null; // Clear cafe destination name
          bypassLeg.cafeName = null;
          bypassLeg.coffeeBypass = true;  // Flag for renderer subtitle
        }

        // Mark walk-from-cafe for removal (absorbed into bypass walk)
        if (walkFromCafeIdx >= 0) {
          routeLegs[walkFromCafeIdx]._removeForBypass = true;
        }

        // Remove walk-from-cafe (absorbed into bypass), keep everything else
        routeLegs = routeLegs.filter(leg => !leg._removeForBypass);
      }
    }

    // V15.0: Mark cafe leg as skipped (for both closed and running late)
    const cafeRelatedLegTypes = new Set();
    if (isCafeClosed || shouldSkipCoffee) {
      routeLegs.forEach((leg, idx) => {
        if (leg.type === 'coffee') {
          cafeRelatedLegTypes.add(idx);
        }
      });
    }

    // V13.5: Build legs with cumulative timing, excluding skipped cafe legs from timing
    let cumulativeMinutes = 0;
    let legs = routeLegs.map((leg, idx) => {
      const isSkippedCafeLeg = cafeRelatedLegTypes.has(idx);

      // Format the leg for display
      const formattedLeg = this.formatLegForDisplay(leg, transitData, idx, cumulativeMinutes, currentTimeMs);

      // V15.0: Mark cafe leg as skipped (both closed and running late)
      if (isSkippedCafeLeg) {
        formattedLeg.status = 'skipped';
        formattedLeg.state = 'skip';
        formattedLeg.skippedForTiming = true;

        if (leg.type === 'coffee') {
          formattedLeg.canGet = false;
          formattedLeg.cafeClosed = coffeeDecision.cafeClosed || false;
          formattedLeg.skipReason = isCafeClosed ? 'closed' : (coffeeDecision.skipReason || 'late');
          formattedLeg.subtitle = isCafeClosed
            ? '[X] SKIPPED -- Cafe closed'
            : '[X] SKIPPED -- Running late';
        }

        // Don't add skipped leg duration to cumulative time
      } else {
        // Normal leg - add duration to cumulative time
        cumulativeMinutes += formattedLeg.minutes || formattedLeg.durationMinutes || 0;
      }

      return formattedLeg;
    });

    // V13.6: Final check - merge any consecutive walk legs in the formatted output
    legs = this.mergeConsecutiveFormattedWalkLegs(legs);

    // V13.5: Apply coffee decision to coffee leg if NOT already handled above
    if (!shouldSkipCoffee && !isCafeClosed) {
      const coffeeLeg = legs.find(l => l.type === "coffee");
      if (coffeeLeg && coffeeDecision) {
        coffeeLeg.canGet = coffeeDecision.canGet;
        coffeeLeg.cafeClosed = coffeeDecision.cafeClosed || false;
        coffeeLeg.skipReason = coffeeDecision.skipReason || (coffeeDecision.canGet ? null : "late");
      }
    }

    // V13.5: Calculate total journey time (excluding skipped legs)
    const totalMinutes = legs.reduce((sum, leg) => {
      if (leg.skippedForTiming) return sum;  // Exclude skipped cafe legs
      return sum + (leg.minutes || leg.durationMinutes || 0);
    }, 0);

    // Calculate departure time based on active journey time
    const targetArr = prefs.arrivalTime || '09:00';
    const [targetH, targetM] = targetArr.split(':').map(Number);
    const targetMins = targetH * 60 + targetM;
    const departureMins = targetMins - totalMinutes;
    const depH = Math.floor(departureMins / 60);
    const depM = departureMins % 60;
    const departureTime = `${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}`;
    
    const currentTime = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    
    return {
      location: locations.home?.label || 'HOME',
      current_time: currentTime,
      day: now.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase(),
      date: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
      temp: weatherData?.temp ?? weatherData?.temperature ?? null,
      condition: weatherData?.condition ?? weatherData?.description ?? '',
      weather_icon: this.getWeatherIcon(weatherData),
      journey_legs: legs,
      legs: legs,
      coffee_decision: coffeeDecision,
      arrive_by: targetArr,
      departure_time: departureTime,
      total_minutes: totalMinutes,
      destination: locations.work?.label || 'WORK',
      timestamp: now.toISOString(),
      route_name: route?.description || route?.name || 'Auto-discovered route',
      route_type: route?.type || 'auto',
      alternatives_count: this.discoveredRoutes?.length || 0
    };
  }

  /**
   * Format leg for display with timing data
   * V13.3: Enhanced to include departTime, nextDepartures, and nextDepartureTimesMs
   */
  formatLegForDisplay(configLeg, transitData, index, cumulativeMinutes = 0, currentTimeMs = Date.now()) {
    const leg = {
      type: configLeg.type || 'walk',
      minutes: configLeg.durationMinutes || configLeg.minutes || 0,
      durationMinutes: configLeg.durationMinutes || configLeg.minutes || 0
    };

    if (configLeg.from) leg.from = configLeg.from;
    if (configLeg.to) leg.to = configLeg.to;
    if (configLeg.location) leg.location = configLeg.location;
    if (configLeg.cafeName) leg.cafeName = configLeg.cafeName;
    if (configLeg.stopName) leg.stopName = configLeg.stopName;
    if (configLeg.stationName) leg.stationName = configLeg.stationName;
    if (configLeg.workName) leg.workName = configLeg.workName;
    if (configLeg.routeNumber) leg.routeNumber = configLeg.routeNumber;
    if (configLeg.lineName) leg.lineName = configLeg.lineName;
    if (configLeg.origin) leg.origin = configLeg.origin;
    if (configLeg.destination) leg.destination = configLeg.destination;

    // V13.3: Calculate departTime based on cumulative journey time
    // For transit legs, this is when the user should be at the stop
    const departTimeMs = currentTimeMs + (cumulativeMinutes * 60000);
    const departDate = new Date(departTimeMs);
    const hours = departDate.getHours();
    const mins = departDate.getMinutes();
    const hours12 = hours % 12 || 12;
    const ampm = hours >= 12 ? 'pm' : 'am';
    leg.departTime = `${hours12}:${String(mins).padStart(2, '0')}${ampm}`;
    leg.departTimeMs = departTimeMs;

    // Check for live data on transit legs
    if (['tram', 'train', 'bus', 'vline', 'transit'].includes(leg.type) && transitData) {
      // Get the appropriate departures array based on leg type
      const modeData = leg.type === 'train' || leg.type === 'vline' ? transitData.trains :
                       leg.type === 'tram' ? transitData.trams : 
                       leg.type === 'bus' ? transitData.buses : [];
      
      const match = this.findMatchingDeparture(leg, modeData);
      if (match) {
        leg.minutes = match.minutes;
        leg.isLive = true;
        leg.isDelayed = match.isDelayed || false;
        leg.delayMinutes = match.delayMinutes || match.delay || 0;
        
        // v1.42: Calculate departTime in 12-hour format (per Dev Rules Section 12.2)
        if (match.departureTimeMs) {
          const depDate = new Date(match.departureTimeMs);
          const hours = depDate.getHours();
          const mins = depDate.getMinutes().toString().padStart(2, '0');
          const ampm = hours >= 12 ? 'pm' : 'am';
          const h12 = hours % 12 || 12;
          leg.departTime = `${h12}:${mins}${ampm}`;
          leg.departureTimeMs = match.departureTimeMs;
        }
      }
      
      // v1.42: Populate nextDepartures array for "Next: X, Y min" display
      if (modeData && modeData.length >= 2) {
        leg.nextDepartures = modeData.slice(0, 3).map(d => d.minutes);
        leg.nextDepartureTimesMs = modeData.slice(0, 3)
          .filter(d => d.departureTimeMs)
          .map(d => d.departureTimeMs);
      }
      
      // v1.42: Check Metro Tunnel routing
      if (this.state === 'VIC' && leg.lineName) {
        leg.viaMetroTunnel = isMetroTunnelLine(leg.lineName);
      }
    }

    return leg;
  }

  /**
   * Find matching departure from live data (single)
   */
  findMatchingDeparture(leg, departures) {
    const matches = this.findMatchingDepartures(leg, departures);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Find all matching departures from live data (V13.3)
   * Returns array of matching departures sorted by time
   */
  findMatchingDepartures(leg, departures) {
    if (!departures?.length) return [];

    const matches = departures.filter(d => {
      if (leg.routeNumber && d.route_number) {
        return d.route_number.toString() === leg.routeNumber.toString();
      }
      if (leg.type === 'tram' && d.route_type === 1) return true;
      if (leg.type === 'train' && d.route_type === 0) return true;
      if (leg.type === 'bus' && d.route_type === 2) return true;
      if (leg.type === 'vline' && d.route_type === 3) return true;
      return false;
    });

    // Sort by departure time
    return matches.sort((a, b) => (a.minutes || 0) - (b.minutes || 0));
  }

  /**
   * Get weather icon from condition
   */
  getWeatherIcon(weatherData) {
    if (!weatherData) return '(sun)';
    const condition = (weatherData.condition || weatherData.description || '').toLowerCase();
    if (condition.includes('rain') || condition.includes('shower')) return '(rain)';
    if (condition.includes('cloud')) return '(cloud)';
    if (condition.includes('sun') || condition.includes('clear')) return '(sun)';
    if (condition.includes('storm')) return '(storm)';
    if (condition.includes('fog')) return '(fog)';
    return '(sun)';
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Group stops by route type
   */
  groupByRouteType(stops) {
    const grouped = {};
    for (const stop of stops) {
      const type = stop.route_type;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(stop);
    }
    return grouped;
  }

  /**
   * Estimate transit time between stops
   */
  estimateTransitTime(origin, dest) {
    const distance = this.haversineDistance(origin.lat, origin.lon, dest.lat, dest.lon);
    return Math.max(2, Math.ceil(distance / 400)); // ~25 km/h average
  }

  /**
   * Haversine distance in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * V13.6: Merge consecutive walk legs in route config
   * Used when cafe is closed and cafe-related legs are removed
   * @param {Array} legs - Route config legs
   * @returns {Array} - Merged legs with no consecutive walks
   */
  mergeConsecutiveWalkLegs(legs) {
    if (!legs || legs.length < 2) return legs;

    const merged = [];
    let i = 0;

    while (i < legs.length) {
      const current = { ...legs[i] };

      // Check if next leg is also a walk
      if (current.type === 'walk' && i + 1 < legs.length && legs[i + 1].type === 'walk') {
        const next = legs[i + 1];
        // Merge: combine durations, use destination from second leg
        current.minutes = (current.minutes || 0) + (next.minutes || 0);
        current.durationMinutes = current.minutes;
        current.to = next.to || current.to;
        current.stopName = next.stopName || current.stopName;
        current.stationName = next.stationName || current.stationName;
        current.workName = next.workName || current.workName;
        current.destination = next.destination || current.destination;
        // Skip the next leg since we merged it
        i += 2;
      } else {
        i++;
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * V13.6: Merge consecutive walk legs in formatted display legs
   * Ensures no two walk legs appear next to each other in the rendered journey
   * @param {Array} legs - Formatted display legs
   * @returns {Array} - Merged legs with no consecutive walks
   */
  mergeConsecutiveFormattedWalkLegs(legs) {
    if (!legs || legs.length < 2) return legs;

    const merged = [];
    let i = 0;

    while (i < legs.length) {
      const current = { ...legs[i] };

      // Check if next leg is also a walk (and neither is skipped)
      if (current.type === 'walk' && !current.skippedForTiming &&
          i + 1 < legs.length && legs[i + 1].type === 'walk' && !legs[i + 1].skippedForTiming) {
        const next = legs[i + 1];
        // Merge: combine durations, use destination from second leg
        current.minutes = (current.minutes || 0) + (next.minutes || 0);
        current.durationMinutes = current.minutes;
        current.to = next.to || current.to;
        current.stopName = next.stopName || current.stopName;
        current.stationName = next.stationName || current.stationName;
        current.workName = next.workName || current.workName;
        current.destination = next.destination || current.destination;
        // Update title to reflect merged walk
        if (next.to) {
          current.title = `Walk to ${next.workName || next.stationName || next.stopName || next.to}`;
        }
        // Skip the next leg since we merged it
        i += 2;
      } else {
        i++;
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * Get transit mode name from route type
   */
  getTransitModeName(routeType) {
    const modes = { 0: 'Train', 1: 'Tram', 2: 'Bus', 3: 'V/Line' };
    return modes[routeType] || 'Transit';
  }

  /**
   * Alias for backward compatibility
   */
  getPreferredRoute() {
    return this.getSelectedRoute();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CommuteCompute;
