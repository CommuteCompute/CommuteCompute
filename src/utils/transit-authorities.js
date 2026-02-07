/**
 * Australian Transit Authorities Configuration
 * Supports all states and territories
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export const TRANSIT_AUTHORITIES = {
  VIC: {
    id: 'vic_transport',
    name: 'Transport Victoria',
    state: 'Victoria',
    stateCode: 'VIC',
    apiName: 'Transport Victoria Open Data API',
    apiType: 'GTFS-RT',
    description: 'Latest GTFS Realtime data for Melbourne metro trains, trams, buses, and regional V/Line services',

    // API Registration - Updated to OpenData platform
    registrationUrl: 'https://opendata.transport.vic.gov.au/',
    documentationUrl: 'https://opendata.transport.vic.gov.au/dataset/gtfs-realtime',
    apiGuideUrl: 'https://gtfs.org/realtime/',

    // Credentials required
    credentials: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your Transport Victoria API Key', required: true }
    ],

    // API Configuration - Correct GTFS-Realtime API endpoints
    // NOTE: These are the actual API endpoints, NOT the web portal resource pages
    // Authentication: KeyId header with UUID API Key (ODATA_API_KEY env var)
    baseUrl: 'https://api.opendata.transport.vic.gov.au',
    gtfsRealtimeEndpoints: {
      metroTrain: {
        tripUpdates: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates',
        vehiclePositions: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions',
        serviceAlerts: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/service-alerts'
      },
      yarraTrams: {
        tripUpdates: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/trip-updates',
        vehiclePositions: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/vehicle-positions',
        serviceAlerts: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/service-alerts'
      },
      metroBus: {
        tripUpdates: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates',
        vehiclePositions: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions',
        serviceAlerts: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/service-alerts'
      },
      regionalBus: {
        tripUpdates: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/trip-updates',
        vehiclePositions: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/vehicle-positions',
        serviceAlerts: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/vline/service-alerts'
      }
    },
    authMethod: 'api-key-header',
    authHeaderName: 'KeyId',
    rateLimit: 27, // calls per minute
    cacheDuration: 30, // seconds

    // Transit modes available
    modes: [
      { id: 0, name: 'Train', icon: '[Train]', color: '#0072ce', gtfsType: 'metroTrain' },
      { id: 1, name: 'Tram', icon: '[Tram]', color: '#78be20', gtfsType: 'yarraTrams' },
      { id: 2, name: 'Bus', icon: '[Bus]', color: '#ff8200', gtfsType: 'metroBus' },
      { id: 3, name: 'V/Line', icon: '[Train]', color: '#8f1a95', gtfsType: 'regionalBus' }
    ],

    // Major cities/regions
    cities: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton'],

    // API Features
    features: {
      tripUpdates: true,
      vehiclePositions: true,
      serviceAlerts: true,
      scheduleRelationships: true,
      routeId: true,
      directionId: true
    }
  },

  NSW: {
    id: 'nsw_transport',
    name: 'Transport for NSW',
    state: 'New South Wales',
    stateCode: 'NSW',
    apiName: 'Transport for NSW Open Data API',
    apiType: 'GTFS-RT',
    description: 'Covers Sydney trains, buses, ferries, light rail, and regional services',

    registrationUrl: 'https://opendata.transport.nsw.gov.au/user/register',
    documentationUrl: 'https://opendata.transport.nsw.gov.au/documentation',

    credentials: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your Transport NSW API Key' }
    ],

    baseUrl: 'https://api.transport.nsw.gov.au',
    authMethod: 'api-key-header',

    modes: [
      { id: 1, name: 'Train', icon: '[Train]', color: '#f4921e' },
      { id: 2, name: 'Bus', icon: '[Bus]', color: '#00aeef' },
      { id: 4, name: 'Ferry', icon: '[Ferry]', color: '#6cbc3c' },
      { id: 5, name: 'Light Rail', icon: '[Tram]', color: '#d11f2a' }
    ],

    cities: ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Blue Mountains']
  },

  QLD: {
    id: 'qld_translink',
    name: 'TransLink Queensland',
    state: 'Queensland',
    stateCode: 'QLD',
    apiName: 'TransLink GTFS Data',
    apiType: 'GTFS',
    description: 'Covers Brisbane, Gold Coast, Sunshine Coast public transport',

    registrationUrl: 'https://www.data.qld.gov.au/',
    documentationUrl: 'https://www.data.qld.gov.au/dataset/general-transit-feed-specification-gtfs-seq',

    credentials: [
      // TransLink primarily uses open GTFS feeds
      { key: 'apiKey', label: 'API Key (if applicable)', type: 'password', placeholder: 'Optional API Key', required: false }
    ],

    baseUrl: 'https://gtfsrt.api.translink.com.au',
    authMethod: 'open',

    modes: [
      { id: 1, name: 'Train', icon: '[Train]', color: '#00558b' },
      { id: 2, name: 'Bus', icon: '[Bus]', color: '#e30613' },
      { id: 3, name: 'Ferry', icon: '[Ferry]', color: '#00a550' },
      { id: 4, name: 'Light Rail', icon: '[Tram]', color: '#f7a800' }
    ],

    cities: ['Brisbane', 'Gold Coast', 'Sunshine Coast', 'Toowoomba']
  },

  WA: {
    id: 'wa_transperth',
    name: 'Transperth',
    state: 'Western Australia',
    stateCode: 'WA',
    apiName: 'Transperth API',
    apiType: 'GTFS',
    description: 'Covers Perth metro trains, buses, and ferries',

    registrationUrl: 'https://www.transperth.wa.gov.au/About/Spatial-Data-Access',
    documentationUrl: 'https://www.transperth.wa.gov.au/About/Spatial-Data-Access',

    credentials: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your Transperth API Key', required: false }
    ],

    baseUrl: 'https://www.transperth.wa.gov.au',
    authMethod: 'api-key',

    modes: [
      { id: 1, name: 'Train', icon: '[Train]', color: '#ee3124' },
      { id: 2, name: 'Bus', icon: '[Bus]', color: '#00a651' },
      { id: 3, name: 'Ferry', icon: '[Ferry]', color: '#0085ca' }
    ],

    cities: ['Perth', 'Fremantle', 'Joondalup', 'Mandurah']
  },

  SA: {
    id: 'sa_adelaidemetro',
    name: 'Adelaide Metro',
    state: 'South Australia',
    stateCode: 'SA',
    apiName: 'Adelaide Metro GTFS',
    apiType: 'GTFS',
    description: 'Covers Adelaide metro trains, trams, and buses',

    registrationUrl: 'https://data.sa.gov.au/',
    documentationUrl: 'https://data.sa.gov.au/data/dataset/adelaide-metro-general-transit-feed',

    credentials: [
      { key: 'apiKey', label: 'API Key (if applicable)', type: 'password', placeholder: 'Optional API Key', required: false }
    ],

    baseUrl: 'https://gtfs.adelaidemetro.com.au',
    authMethod: 'open',

    modes: [
      { id: 1, name: 'Train', icon: '[Train]', color: '#e30613' },
      { id: 2, name: 'Tram', icon: '[Tram]', color: '#00a550' },
      { id: 3, name: 'Bus', icon: '[Bus]', color: '#00558b' }
    ],

    cities: ['Adelaide', 'Glenelg', 'Port Adelaide']
  },

  TAS: {
    id: 'tas_metro',
    name: 'Metro Tasmania',
    state: 'Tasmania',
    stateCode: 'TAS',
    apiName: 'Metro Tasmania Data',
    apiType: 'GTFS',
    description: 'Covers Hobart and Launceston bus services',

    registrationUrl: 'https://www.metrotas.com.au/',
    documentationUrl: 'https://www.metrotas.com.au/',

    credentials: [
      { key: 'apiKey', label: 'API Key (if applicable)', type: 'password', placeholder: 'Optional API Key', required: false }
    ],

    baseUrl: 'https://www.metrotas.com.au',
    authMethod: 'open',

    modes: [
      { id: 1, name: 'Bus', icon: '[Bus]', color: '#00a550' }
    ],

    cities: ['Hobart', 'Launceston', 'Burnie']
  },

  ACT: {
    id: 'act_action',
    name: 'Transport Canberra (ACTION Buses)',
    state: 'Australian Capital Territory',
    stateCode: 'ACT',
    apiName: 'Transport Canberra GTFS',
    apiType: 'GTFS',
    description: 'Covers Canberra light rail and bus services',

    registrationUrl: 'https://www.data.act.gov.au/',
    documentationUrl: 'https://www.data.act.gov.au/Transport/ACTION-Bus-Service-GTFS-Feed/ivq5-r2db',

    credentials: [
      { key: 'apiKey', label: 'API Key (if applicable)', type: 'password', placeholder: 'Optional API Key', required: false }
    ],

    baseUrl: 'https://www.transport.act.gov.au',
    authMethod: 'open',

    modes: [
      { id: 1, name: 'Light Rail', icon: '[Tram]', color: '#00a550' },
      { id: 2, name: 'Bus', icon: '[Bus]', color: '#e30613' }
    ],

    cities: ['Canberra', 'Gungahlin', 'Belconnen']
  },

  NT: {
    id: 'nt_darwinbus',
    name: 'Darwin Bus Service',
    state: 'Northern Territory',
    stateCode: 'NT',
    apiName: 'NT Public Transport',
    apiType: 'Schedule',
    description: 'Covers Darwin and Palmerston bus services',

    registrationUrl: 'https://nt.gov.au/driving/public-transport-cycling',
    documentationUrl: 'https://nt.gov.au/driving/public-transport-cycling',

    credentials: [],

    baseUrl: 'https://nt.gov.au',
    authMethod: 'none',

    modes: [
      { id: 1, name: 'Bus', icon: '[Bus]', color: '#00a550' }
    ],

    cities: ['Darwin', 'Palmerston']
  }
};

/**
 * Detect state/territory from address
 */
export function detectStateFromAddress(address) {
  const addressLower = address.toLowerCase();

  // State/city detection
  const stateDetection = [
    { states: ['VIC'], keywords: ['melbourne', 'geelong', 'ballarat', 'bendigo', 'victoria', 'vic'] },
    { states: ['NSW'], keywords: ['sydney', 'newcastle', 'wollongong', 'nsw', 'new south wales'] },
    { states: ['QLD'], keywords: ['brisbane', 'gold coast', 'sunshine coast', 'queensland', 'qld'] },
    { states: ['WA'], keywords: ['perth', 'fremantle', 'western australia', 'wa'] },
    { states: ['SA'], keywords: ['adelaide', 'south australia', 'sa'] },
    { states: ['TAS'], keywords: ['hobart', 'launceston', 'tasmania', 'tas'] },
    { states: ['ACT'], keywords: ['canberra', 'act'] },
    { states: ['NT'], keywords: ['darwin', 'palmerston', 'northern territory', 'nt'] }
  ];

  for (const detection of stateDetection) {
    for (const keyword of detection.keywords) {
      if (addressLower.includes(keyword)) {
        return detection.states[0];
      }
    }
  }

  return null;
}

/**
 * Get authority configuration by state code
 */
export function getAuthorityByState(stateCode) {
  return TRANSIT_AUTHORITIES[stateCode] || null;
}

/**
 * Get all available authorities
 */
export function getAllAuthorities() {
  return Object.values(TRANSIT_AUTHORITIES);
}

/**
 * Validate API credentials for an authority
 */
export function validateCredentials(authorityId, credentials) {
  const authority = Object.values(TRANSIT_AUTHORITIES).find(a => a.id === authorityId);

  if (!authority) {
    return { valid: false, error: 'Invalid authority' };
  }

  // Check required credentials
  for (const cred of authority.credentials) {
    if (cred.required !== false && !credentials[cred.key]) {
      return { valid: false, error: `Missing required credential: ${cred.label}` };
    }
  }

  return { valid: true };
}

export default {
  TRANSIT_AUTHORITIES,
  detectStateFromAddress,
  getAuthorityByState,
  getAllAuthorities,
  validateCredentials
};
