/**
 * Preferences API - Serverless Version
 * Returns user preferences from KV storage, config token, or defaults.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getPreferences, setPreferences, getUserState, setUserState, getTransitApiKey, getGoogleApiKey, setStationOverrides, setPreferredTramRoute, setPreferredTramStop, setPreferredTrainLine, setPreferredTrainStation } from '../../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';
import crypto from 'node:crypto';

// v5.9.9 (EE1): address hash helper duplicated from api/commutecompute.js's
// private `_addressHash` — same algorithm (SHA1 of the lowercased, trimmed,
// whitespace-normalised address, first 12 hex chars). The duplication is
// intentional: importing a private helper from a sibling hot-path serverless
// handler would couple the admin endpoint to commute compute loader internals.
// When the inline helper in api/commutecompute.js is modified in a future
// cycle, this duplicate MUST be updated in lock-step. See DEVELOPMENT-RULES.md
// §23.16 for the full invariant and the rationale behind the direct-entry
// escape hatch that relies on this shared hash format.
function _canonicaliseAddressForHash(address) {
  if (!address || typeof address !== 'string') return '';
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}
function _addressHashForCanonical(address) {
  const canonical = _canonicaliseAddressForHash(address);
  if (!canonical) return '';
  return crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

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
      apiMode: minified.m || 'live',
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
          apiMode: kvPrefs?.apiMode || 'live',
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
        apiMode: 'live',
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
    // v5.9.9 (EE1): also accept optional direct-entry lat/lon on the POST
    // body. When both are valid finite numbers in range, the handler skips
    // the server-side geocoder entirely and writes the caller-supplied
    // coord verbatim. This is the escape hatch for environments where the
    // geocoder cascade is non-operative (e.g. the Vercel serverless IP
    // range being blocked or rate-limited by the free-tier providers —
    // see DEVELOPMENT-RULES.md §23.16).
    const { field, value, lat, lon } = body;

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
      // Address change — either geocode to get coordinates OR use the
      // caller-supplied direct coord when the request body includes
      // valid lat/lon numbers (v5.9.9 EE1 escape hatch).
      updated.addresses[field] = value || '';
      if (value) {
        const numericLat = Number(lat);
        const numericLon = Number(lon);
        const hasDirectCoord =
          lat != null && lon != null &&
          Number.isFinite(numericLat) && Number.isFinite(numericLon) &&
          Math.abs(numericLat) <= 90 && Math.abs(numericLon) <= 180;
        if (hasDirectCoord) {
          // v5.9.9 (EE1): direct-entry escape hatch. Caller provided a
          // pre-computed coord (typically pasted from a mapping service
          // via the admin panel lat/lon inputs added in EE2). Skip the
          // geocoder entirely and pre-compute the v5.9.8 address hash
          // so the DD1 fast path triggers immediately on subsequent
          // reads — no runtime geocoder dependency at all.
          updated.locations[field] = {
            address: value,
            name: value.split(',')[0],
            lat: numericLat,
            lon: numericLon,
            suburb: null,
            source: 'direct-entry',
            _addressHash: _addressHashForCanonical(value)
          };
        } else {
          const location = await geocodeAddress(value, googleKey);
          if (location) {
            // v5.9.9 (EE1): also write the v5.9.8 address hash on the
            // geocoder path so DD1's fast-path cache hit works for
            // successful geocodes too. Without this, DD1 would re-run
            // the (potentially broken) geocoder on every subsequent
            // request even after a successful write.
            updated.locations[field] = { ...location, _addressHash: _addressHashForCanonical(value) };
          }
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
      updated.apiMode = (value === 'live' || value === 'cached') ? value : 'live';
    } else {
      return res.status(400).json({ success: false, error: `Unknown field: ${field}` });
    }

    await setPreferences(updated);

    // v5.8.2 (C4-clear) + v5.9.0 (T6): Clear stale station overrides and stability
    // locks when Home or Work changes. Overrides and locks are keyed by leg index
    // or paired with a stop ID — without this clear they persist forever and
    // silently override auto-detected stops even when the user has moved.
    // Cafe changes do NOT trigger the clear (cafe doesn't affect stop/line locks).
    if (field === 'home' || field === 'work') {
      try {
        await Promise.all([
          setStationOverrides({}),
          setPreferredTramRoute(null),
          setPreferredTramStop(null),
          setPreferredTrainLine(null),
          setPreferredTrainStation(null)
        ]);
      } catch (clearErr) {
        console.warn('[preferences] Failed to clear station overrides on ' + field + ' change: ' + clearErr.message);
      }
    }

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
