// Copyright (c) 2026 Angus Bergman
// Licensed under AGPL-3.0

/**
 * /api/admin/export - Data Export API
 *
 * Exports all user preferences and configuration data as JSON.
 * Required for APP 12 (Privacy Act access rights) compliance.
 *
 * GET /api/admin/export
 * Requires: Authorization: Bearer <CC_ADMIN_TOKEN>
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getClient } from '../../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';

// All known preference keys used by the system
const PREFERENCE_KEYS = [
  'cc:api:transit_key',
  'cc:api:google_key',
  'cc:preferences',
  'cc:state',
  'cc:device:status',
  'cc-profiles'
];

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Data export always requires auth (Section 26.1)
  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    const client = await getClient();

    if (!client) {
      return res.status(500).json({
        success: false,
        error: 'No Redis storage configured. Cannot export data.'
      });
    }

    const preferences = {};

    // Retrieve each known preference key
    for (const key of PREFERENCE_KEYS) {
      try {
        const value = await client.get(key);
        if (value !== null && value !== undefined) {
          // Mask sensitive API keys — show presence but not full value
          if (key.includes(':api:') && typeof value === 'string' && value.length > 8) {
            preferences[key] = `${value.substring(0, 4)}...[redacted]`;
          } else {
            preferences[key] = value;
          }
        }
      } catch (e) {
        preferences[key] = { error: 'Failed to retrieve', message: e.message };
      }
    }

    // Also attempt to discover any device-specific keys
    try {
      const deviceKeys = await client.keys('cc:device:*');
      if (deviceKeys && Array.isArray(deviceKeys)) {
        for (const deviceKey of deviceKeys) {
          if (!preferences[deviceKey]) {
            try {
              const value = await client.get(deviceKey);
              if (value !== null && value !== undefined) {
                preferences[deviceKey] = value;
              }
            } catch (e) {
              preferences[deviceKey] = { error: 'Failed to retrieve', message: e.message };
            }
          }
        }
      }
    } catch {
      // keys() may not be supported on all backends — non-critical
    }

    return res.json({
      success: true,
      data: preferences,
      exportedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[KV]', { operation: 'dataExport', error: error.message, timestamp: new Date().toISOString() });
    return res.status(500).json({
      success: false,
      error: 'Data export failed: ' + error.message
    });
  }
}
