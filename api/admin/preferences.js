/**
 * Preferences API - Serverless Version
 * Returns user preferences from KV storage, config token, or defaults.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getPreferences, setPreferences, getUserState, setUserState, getTransitApiKey, getGoogleApiKey } from '../../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';

/**
 * Decode config token back to preferences
 */
function decodeConfigToken(token) {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const minified = JSON.parse(json);
    
    return {
      addresses: minified.a || {},
      journey: {
        transitRoute: minified.j || {},
        arrivalTime: minified.t || '09:00',
        coffeeEnabled: minified.c !== false
      },
      locations: minified.l || {},
      state: minified.s || 'VIC',
      api: {
        key: minified.k || ''
      },
      cafe: minified.cf || null,
      apiMode: minified.m || 'cached',
      _fromToken: true,
      _configured: true
    };
  } catch (error) {
    return null;
  }
}

/**
 * Geocode an address using Google Places API (New) or Nominatim fallback.
 * Extracts suburb from Google addressComponents when available.
 */
async function geocodeAddress(address, googleKey = null) {
  if (!address) return null;
  const fallback = { address, name: address.split(',')[0], lat: null, lon: null, suburb: null, source: 'input' };

  if (googleKey) {
    try {
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.location,places.displayName,places.formattedAddress,places.addressComponents'
        },
        body: JSON.stringify({
          textQuery: address,
          maxResultCount: 1,
          locationBias: { circle: { center: { latitude: -37.8136, longitude: 144.9631 }, radius: 100000.0 } }
        })
      });
      const data = await resp.json();
      if (data.places?.length > 0) {
        const place = data.places[0];
        let suburb = null;
        if (place.addressComponents) {
          const comp = place.addressComponents.find(c =>
            c.types?.includes('locality') || c.types?.includes('sublocality_level_1')
          );
          if (comp) suburb = comp.longText || comp.shortText;
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
    } catch { /* fall through to Nominatim */ }
  }

  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: { 'User-Agent': 'Commute Compute/1.0' }
    });
    const results = await resp.json();
    if (results?.length > 0) {
      return {
        address: results[0].display_name || address,
        name: address.split(',')[0],
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon),
        suburb: null,
        source: 'nominatim'
      };
    }
  } catch { /* use fallback */ }

  return fallback;
}

export default async function handler(req, res) {
  setAdminCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Auth required on ALL methods — preferences contain personal addresses (Section 26.1)
  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Check for config token in query parameter
    const { token } = req.query;
    
    if (token) {
      const prefs = decodeConfigToken(token);
      if (prefs) {
        return res.json({
          success: true,
          preferences: prefs,
          source: 'token'
        });
      }
    }

    // Load from KV storage - check API keys (stored separately from preferences)
    const [kvPrefs, state, transitKey, googleKey] = await Promise.all([
      getPreferences(),
      getUserState(),
      getTransitApiKey(),
      getGoogleApiKey()
    ]);
    
    // System is configured if transit API key exists in KV
    const isConfigured = !!transitKey;
    
    if (isConfigured) {
      return res.json({
        success: true,
        preferences: {
          addresses: kvPrefs?.addresses || {},
          journey: kvPrefs?.journey || {
            transitRoute: {},
            arrivalTime: '09:00',
            coffeeEnabled: true
          },
          locations: kvPrefs?.locations || {},
          state: state || kvPrefs?.state || 'VIC',
          api: {
            key: '***configured***',
            hasKey: true
          },
          google: {
            key: googleKey ? '***configured***' : '',
            hasKey: !!googleKey
          },
          cafe: kvPrefs?.cafe || null,
          apiMode: kvPrefs?.apiMode || 'cached',
          // GTFS stop IDs for live departure data (Section 23.1.1)
          trainStopId: kvPrefs?.trainStopId || null,
          tramStopId: kvPrefs?.tramStopId || null,
          _configured: true
        },
        source: 'kv'
      });
    }

    // Return default preferences for unconfigured state
    return res.json({
      success: true,
      preferences: {
        addresses: {},
        journey: {
          transitRoute: {},
          arrivalTime: '09:00',
          coffeeEnabled: true
        },
        locations: {},
        state: state || 'VIC',
        api: { key: '', hasKey: false },
        google: { key: '', hasKey: false },
        cafe: null,
        apiMode: 'cached',
        // GTFS stop IDs for live departure data (Section 23.1.1)
        trainStopId: null,
        tramStopId: null,
        _configured: false
      },
      source: 'default',
      message: 'No configuration found. Complete setup wizard first.'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST handler — save updated addresses, arrival time, or state to KV.
 * Geocodes address changes using the pre-configured Google key from KV.
 */
async function handlePost(req, res) {
  try {
    const body = req.body || {};
    const { field, value } = body;

    if (!field) {
      return res.status(400).json({ success: false, error: 'Missing field parameter' });
    }

    const [kvPrefs, googleKey] = await Promise.all([
      getPreferences(),
      getGoogleApiKey()
    ]);

    const updated = { ...kvPrefs };
    if (!updated.addresses) updated.addresses = {};
    if (!updated.journey) updated.journey = { arrivalTime: '09:00', coffeeEnabled: true };
    if (!updated.locations) updated.locations = {};

    if (['home', 'work', 'cafe'].includes(field)) {
      // Address change — geocode to get coordinates and suburb
      updated.addresses[field] = value || '';
      if (value) {
        const location = await geocodeAddress(value, googleKey);
        if (location) {
          updated.locations[field] = location;
        }
      } else {
        updated.locations[field] = null;
      }
    } else if (field === 'arrival') {
      updated.journey.arrivalTime = value || '09:00';
    } else if (field === 'state') {
      updated.state = value || 'VIC';
      await setUserState(value || 'VIC');
    } else if (field === 'coffeeEnabled') {
      updated.journey.coffeeEnabled = value !== false;
    } else if (field === 'trainStopId') {
      updated.trainStopId = value || null;
    } else if (field === 'tramStopId') {
      updated.tramStopId = value || null;
    } else if (field === 'apiMode') {
      updated.apiMode = (value === 'live' || value === 'cached') ? value : 'cached';
    } else {
      return res.status(400).json({ success: false, error: `Unknown field: ${field}` });
    }

    await setPreferences(updated);

    return res.json({
      success: true,
      field,
      updated: field === 'state' ? value : (updated.locations?.[field] || value),
      suburb: updated.locations?.[field]?.suburb || null
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
