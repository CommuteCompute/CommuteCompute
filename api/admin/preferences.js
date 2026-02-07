/**
 * Preferences API - Serverless Version
 * Returns user preferences from KV storage, config token, or defaults.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getPreferences, getUserState, getTransitApiKey, getGoogleApiKey } from '../../src/data/kv-preferences.js';
import { requireAuth } from '../../src/utils/auth-middleware.js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CC_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
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
