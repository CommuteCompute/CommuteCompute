/**
 * Setup Complete API - Serverless Version
 * For Vercel deployment where there's no persistent file storage.
 *
 * This endpoint:
 * 1. Receives setup data from the wizard
 * 2. Geocodes addresses to get coordinates
 * 3. Auto-detects GTFS stop IDs from home address (Section 23.1.1)
 * 4. Returns location data + detected stops for the frontend to save to KV
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getGoogleApiKey } from '../../src/data/kv-preferences.js';
import { requireAuth, isFirstTimeSetup, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';

/**
 * Melbourne suburb to GTFS stop ID mapping (citybound platform IDs)
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId()
 */
const MELBOURNE_STOP_IDS = {
  'south yarra': { train: '12179', tram: '2505', stationName: 'South Yarra Station', line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { train: '14289', tram: '2509', stationName: 'Prahran Station', line: 'Sandringham' },
  'windsor': { train: '14297', tram: '2513', stationName: 'Windsor Station', line: 'Sandringham' },
  'balaclava': { train: '14233', tram: '2519', stationName: 'Balaclava Station', line: 'Sandringham' },
  'elsternwick': { train: '14247', tram: null, stationName: 'Elsternwick Station', line: 'Sandringham' },
  'sandringham': { train: '14271', tram: null, stationName: 'Sandringham Station', line: 'Sandringham' },
  'richmond': { train: '12173', tram: '2201', stationName: 'Richmond Station', line: 'All lines' },
  'hawthorn': { train: '14257', tram: '3001', stationName: 'Hawthorn Station', line: 'Glen Waverley/Alamein' },
  'camberwell': { train: '14246', tram: '3010', stationName: 'Camberwell Station', line: 'Glen Waverley/Alamein' },
  'caulfield': { train: '14245', tram: '3012', stationName: 'Caulfield Station', line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { train: '14244', tram: null, stationName: 'Carnegie Station', line: 'Pakenham/Cranbourne' },
  'oakleigh': { train: '14273', tram: null, stationName: 'Oakleigh Station', line: 'Pakenham/Cranbourne' },
  'clifton hill': { train: '14249', tram: '2101', stationName: 'Clifton Hill Station', line: 'Hurstbridge/Mernda' },
  'northcote': { train: '14269', tram: '2115', stationName: 'Northcote Station', line: 'Hurstbridge/Mernda' },
  'footscray': { train: '14255', tram: null, stationName: 'Footscray Station', line: 'Werribee/Williamstown/Sunbury' },
  'brunswick': { train: '14242', tram: '1201', stationName: 'Brunswick Station', line: 'Upfield' },
  'coburg': { train: '14250', tram: null, stationName: 'Coburg Station', line: 'Upfield' },
  'broadmeadows': { train: '14240', tram: null, stationName: 'Broadmeadows Station', line: 'Craigieburn' },
  'melbourne': { train: '12204', tram: '2001', stationName: 'Flinders Street Station', line: 'All lines' },
  'cbd': { train: '12204', tram: '2001', stationName: 'Flinders Street Station', line: 'All lines' },
};

/**
 * Auto-detect stop IDs from address (Section 23.1.1)
 */
function detectStopIdsFromAddress(address) {
  if (!address) return null;
  const addressLower = address.toLowerCase();
  for (const [suburb, data] of Object.entries(MELBOURNE_STOP_IDS)) {
    if (addressLower.includes(suburb)) {
      return { suburb, trainStopId: data.train, tramStopId: data.tram, stationName: data.stationName, line: data.line };
    }
  }
  return null;
}

/**
 * Geocode an address using Google Places API (New) or Nominatim fallback
 */
async function geocodeAddress(address, googleKey = null) {
  if (!address) return null;

  // Fallback location object if geocoding fails - still preserves the address
  const fallbackLocation = {
    address: address,
    name: address.split(',')[0],
    lat: null,
    lon: null,
    source: 'input'
  };

  // Try Google Places API (New) first if key available
  if (googleKey) {
    try {
      // Use Text Search to get coordinates
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress,places.addressComponents'
        },
        body: JSON.stringify({
          textQuery: address,
          maxResultCount: 1,
          locationBias: {
            circle: {
              center: { latitude: -37.8136, longitude: 144.9631 }, // Melbourne
              radius: 100000.0
            }
          }
        })
      });

      const data = await response.json();

      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        // Extract suburb from addressComponents (locality or sublocality)
        let suburb = null;
        if (place.addressComponents) {
          const localityComp = place.addressComponents.find(c =>
            c.types?.includes('locality') || c.types?.includes('sublocality_level_1')
          );
          if (localityComp) suburb = localityComp.longText || localityComp.shortText;
        }
        return {
          address: place.formattedAddress || address,
          name: place.displayName?.text || address.split(',')[0],
          lat: place.location.latitude,
          lon: place.location.longitude,
          suburb,
          source: 'google'
        };
      }
    } catch (e) {
    }
  }

  // Fallback to Nominatim
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'Commute Compute/1.0 (Setup Wizard)' }
    });
    const results = await response.json();

    if (results && results.length > 0) {
      return {
        address: results[0].display_name || address,
        name: address.split(',')[0],
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon),
        source: 'nominatim'
      };
    }
  } catch (e) {
  }

  // Return fallback with address preserved (allows dashboard to show even without coordinates)
  return fallbackLocation;
}

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow unauthenticated access during first-time setup only (Section 26.3)
  if (!(await isFirstTimeSetup())) {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const setupData = req.body;

    // Basic validation
    if (!setupData) {
      return res.status(400).json({ success: false, error: 'No setup data provided' });
    }

    const addresses = setupData.addresses || {};

    // Get Google API key from KV if available
    let googleKey = null;
    try {
      googleKey = await getGoogleApiKey();
    } catch (e) {
    }

    // Geocode all addresses in parallel
    const [homeLocation, workLocation, cafeLocation] = await Promise.all([
      geocodeAddress(addresses.home, googleKey),
      geocodeAddress(addresses.work, googleKey),
      addresses.cafe ? geocodeAddress(addresses.cafe, googleKey) : null
    ]);

    const locations = {
      home: homeLocation,
      work: workLocation,
      cafe: cafeLocation
    };

    // Auto-detect stop IDs from home address (Section 23.1.1)
    const detectedStops = detectStopIdsFromAddress(addresses.home);

    // Return success with geocoded locations and detected stops
    res.json({
      success: true,
      message: 'Setup data processed. Locations geocoded.',
      locations,
      detectedStops,
      transitRoute: {}
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
