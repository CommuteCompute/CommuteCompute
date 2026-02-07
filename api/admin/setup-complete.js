/**
 * Setup Complete API - Serverless Version
 * For Vercel deployment where there's no persistent file storage.
 *
 * This endpoint:
 * 1. Receives setup data from the wizard
 * 2. Geocodes addresses to get coordinates
 * 3. Returns location data for the frontend to save to KV
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getGoogleApiKey } from '../../src/data/kv-preferences.js';
import { requireAuth } from '../../src/utils/auth-middleware.js';

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
          'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress'
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
        return {
          address: place.formattedAddress || address,
          name: place.displayName?.text || address.split(',')[0],
          lat: place.location.latitude,
          lon: place.location.longitude,
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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.CC_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    // Return success with geocoded locations
    res.json({
      success: true,
      message: 'Setup data processed. Locations geocoded.',
      locations,
      transitRoute: {}
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
