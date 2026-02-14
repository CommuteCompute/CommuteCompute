/**
 * /api/admin/reset - Factory Reset API
 *
 * Wipes all configuration and preferences to test setup flow.
 * Requires confirmation parameter for safety.
 *
 * POST /api/admin/reset?confirm=yes
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getClient } from '../../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';

// All Redis keys used by the system
const ALL_KEYS = [
  'cc:api:transit_key',
  'cc:api:google_key',
  'cc:preferences',
  'cc:state',
  'cc-profiles'
];

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Factory reset always requires auth — no first-setup exception (Section 26.1)
  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST with ?confirm=yes'
    });
  }

  // Safety check - require explicit confirmation
  const confirm = req.query?.confirm || req.body?.confirm;
  if (confirm !== 'yes') {
    return res.status(400).json({
      success: false,
      error: 'Safety check failed. Add ?confirm=yes to confirm factory reset.',
      warning: 'This will delete ALL configuration, API keys, and device pairings.'
    });
  }

  try {
    const client = await getClient();
    const deleted = [];
    const errors = [];

    if (!client) {
      return res.status(500).json({
        success: false,
        error: 'No Redis storage configured',
        message: 'Cannot reset - no Redis connection available'
      });
    }

    // Delete each key
    for (const key of ALL_KEYS) {
      try {
        await client.del(key);
        deleted.push(key);
      } catch (e) {
        errors.push({ key, error: e.message });
      }
    }

    // Also try to delete any device-specific keys
    try {
      const scanResult = await client.keys('cc:device:*');
      if (scanResult && Array.isArray(scanResult)) {
        for (const deviceKey of scanResult) {
          await client.del(deviceKey);
          deleted.push(deviceKey);
        }
      }
    } catch (e) {
      // keys() may not be supported on all backends
    }

    return res.json({
      success: true,
      message: 'Factory reset complete. All configuration wiped.',
      deleted,
      errors: errors.length > 0 ? errors : undefined,
      nextSteps: [
        'Visit /setup-wizard.html to reconfigure',
        'Re-pair your CC E-Ink device',
        'Re-enter your Transit API key'
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Factory reset failed',
      message: error.message
    });
  }
}
