/**
 * Australian Cities and Coordinates
 * Used for state-agnostic geocoding bias and weather station selection
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export const AUSTRALIAN_CITIES = {
  // Victoria
  'Melbourne': {
    state: 'VIC',
    stateName: 'Victoria',
    lat: -37.8136,
    lon: 144.9631,
    timezone: 'Australia/Melbourne'
  },
  'Geelong': {
    state: 'VIC',
    stateName: 'Victoria',
    lat: -38.1499,
    lon: 144.3617,
    timezone: 'Australia/Melbourne'
  },
  'Ballarat': {
    state: 'VIC',
    stateName: 'Victoria',
    lat: -37.5622,
    lon: 143.8503,
    timezone: 'Australia/Melbourne'
  },
  'Bendigo': {
    state: 'VIC',
    stateName: 'Victoria',
    lat: -36.7570,
    lon: 144.2794,
    timezone: 'Australia/Melbourne'
  },

  // New South Wales
  'Sydney': {
    state: 'NSW',
    stateName: 'New South Wales',
    lat: -33.8688,
    lon: 151.2093,
    timezone: 'Australia/Sydney'
  },
  'Newcastle': {
    state: 'NSW',
    stateName: 'New South Wales',
    lat: -32.9283,
    lon: 151.7817,
    timezone: 'Australia/Sydney'
  },
  'Wollongong': {
    state: 'NSW',
    stateName: 'New South Wales',
    lat: -34.4278,
    lon: 150.8931,
    timezone: 'Australia/Sydney'
  },
  'Central Coast': {
    state: 'NSW',
    stateName: 'New South Wales',
    lat: -33.3136,
    lon: 151.4392,
    timezone: 'Australia/Sydney'
  },

  // Queensland
  'Brisbane': {
    state: 'QLD',
    stateName: 'Queensland',
    lat: -27.4698,
    lon: 153.0251,
    timezone: 'Australia/Brisbane'
  },
  'Gold Coast': {
    state: 'QLD',
    stateName: 'Queensland',
    lat: -28.0167,
    lon: 153.4000,
    timezone: 'Australia/Brisbane'
  },
  'Sunshine Coast': {
    state: 'QLD',
    stateName: 'Queensland',
    lat: -26.6500,
    lon: 153.0667,
    timezone: 'Australia/Brisbane'
  },
  'Toowoomba': {
    state: 'QLD',
    stateName: 'Queensland',
    lat: -27.5598,
    lon: 151.9507,
    timezone: 'Australia/Brisbane'
  },

  // Western Australia
  'Perth': {
    state: 'WA',
    stateName: 'Western Australia',
    lat: -31.9505,
    lon: 115.8605,
    timezone: 'Australia/Perth'
  },
  'Fremantle': {
    state: 'WA',
    stateName: 'Western Australia',
    lat: -32.0551,
    lon: 115.7439,
    timezone: 'Australia/Perth'
  },
  'Joondalup': {
    state: 'WA',
    stateName: 'Western Australia',
    lat: -31.7453,
    lon: 115.7664,
    timezone: 'Australia/Perth'
  },
  'Mandurah': {
    state: 'WA',
    stateName: 'Western Australia',
    lat: -32.5269,
    lon: 115.7217,
    timezone: 'Australia/Perth'
  },

  // South Australia
  'Adelaide': {
    state: 'SA',
    stateName: 'South Australia',
    lat: -34.9285,
    lon: 138.6007,
    timezone: 'Australia/Adelaide'
  },
  'Glenelg': {
    state: 'SA',
    stateName: 'South Australia',
    lat: -34.9798,
    lon: 138.5117,
    timezone: 'Australia/Adelaide'
  },
  'Port Adelaide': {
    state: 'SA',
    stateName: 'South Australia',
    lat: -34.8472,
    lon: 138.5050,
    timezone: 'Australia/Adelaide'
  },

  // Tasmania
  'Hobart': {
    state: 'TAS',
    stateName: 'Tasmania',
    lat: -42.8821,
    lon: 147.3272,
    timezone: 'Australia/Hobart'
  },
  'Launceston': {
    state: 'TAS',
    stateName: 'Tasmania',
    lat: -41.4332,
    lon: 147.1441,
    timezone: 'Australia/Hobart'
  },
  'Burnie': {
    state: 'TAS',
    stateName: 'Tasmania',
    lat: -41.0520,
    lon: 145.9033,
    timezone: 'Australia/Hobart'
  },

  // Australian Capital Territory
  'Canberra': {
    state: 'ACT',
    stateName: 'Australian Capital Territory',
    lat: -35.2809,
    lon: 149.1300,
    timezone: 'Australia/Sydney'
  },
  'Gungahlin': {
    state: 'ACT',
    stateName: 'Australian Capital Territory',
    lat: -35.1839,
    lon: 149.1324,
    timezone: 'Australia/Sydney'
  },
  'Belconnen': {
    state: 'ACT',
    stateName: 'Australian Capital Territory',
    lat: -35.2386,
    lon: 149.0661,
    timezone: 'Australia/Sydney'
  },

  // Northern Territory
  'Darwin': {
    state: 'NT',
    stateName: 'Northern Territory',
    lat: -12.4634,
    lon: 130.8456,
    timezone: 'Australia/Darwin'
  },
  'Palmerston': {
    state: 'NT',
    stateName: 'Northern Territory',
    lat: -12.4897,
    lon: 130.9829,
    timezone: 'Australia/Darwin'
  }
};

/**
 * Get city data by city name (case-insensitive)
 */
export function getCityData(cityName) {
  if (!cityName) return null;

  // Direct match
  if (AUSTRALIAN_CITIES[cityName]) {
    return { name: cityName, ...AUSTRALIAN_CITIES[cityName] };
  }

  // Case-insensitive search
  const match = Object.entries(AUSTRALIAN_CITIES).find(([key]) =>
    key.toLowerCase() === cityName.toLowerCase()
  );

  if (match) {
    return { name: match[0], ...match[1] };
  }

  return null;
}

/**
 * Get cities by state code
 */
export function getCitiesByState(stateCode) {
  return Object.entries(AUSTRALIAN_CITIES)
    .filter(([_, data]) => data.state === stateCode)
    .map(([name, data]) => ({ name, ...data }));
}

/**
 * Get primary city for a state (capital)
 */
export function getPrimaryCityForState(stateCode) {
  const capitals = {
    'VIC': 'Melbourne',
    'NSW': 'Sydney',
    'QLD': 'Brisbane',
    'WA': 'Perth',
    'SA': 'Adelaide',
    'TAS': 'Hobart',
    'ACT': 'Canberra',
    'NT': 'Darwin'
  };

  const cityName = capitals[stateCode];
  return cityName ? getCityData(cityName) : null;
}

export default {
  AUSTRALIAN_CITIES,
  getCityData,
  getCitiesByState,
  getPrimaryCityForState
};
