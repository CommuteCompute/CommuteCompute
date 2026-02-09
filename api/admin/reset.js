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

import { kv } from '@vercel/kv';
import { Redis } from '@upstash/redis';
import { requireAuth } from '../../src/utils/auth-middleware.js';

// All KV keys used by the system
const ALL_KEYS = [
  'cc:api:transit_key',
  'cc:api:google_key', 
  'cc:preferences',
  'cc:state',
  'cc-profiles'
];

/**
 * Get Upstash client if available
 */
function getUpstashClient() {
  // Try direct Upstash env vars first
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  
  // Try to parse REST URL from REDIS_URL (Upstash format: rediss://default:TOKEN@HOST:PORT)
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      // Upstash REDIS_URL format: rediss://default:TOKEN@region.upstash.io:PORT
      const restUrl = `https://${url.hostname}`;
      const token = url.password;
      if (token && url.hostname.includes('upstash')) {
        return new Redis({ url: restUrl, token });
      }
    } catch (e) {
    }
  }
  
  return null;
}

/**
 * Get active KV client
 */
function getClient() {
  // Check Vercel KV standard vars first
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return kv;
  }
  // Fall back to Upstash
  return getUpstashClient();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CC_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
  }

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
    const client = getClient();
    const deleted = [];
    const errors = [];

    if (!client) {
      return res.status(500).json({
        success: false,
        error: 'No KV storage configured',
        message: 'Cannot reset - no Vercel KV or Upstash connection available'
      });
    }

    // Delete each key
    for (const key of ALL_KEYS) {
      try {
        if (key.includes('*')) {
          // Handle wildcard patterns - scan and delete
          // For now just log - Vercel KV doesn't support SCAN easily
          continue;
        }
        
        await client.del(key);
        deleted.push(key);
      } catch (e) {
        errors.push({ key, error: e.message });
      }
    }

    // Also try to delete any device-specific keys
    // These follow pattern cc:device:TOKEN
    try {
      // Try to list and delete device keys if we have scan capability
      const scanResult = await client.keys?.('cc:device:*');
      if (scanResult && Array.isArray(scanResult)) {
        for (const deviceKey of scanResult) {
          await client.del(deviceKey);
          deleted.push(deviceKey);
        }
      }
    } catch (e) {
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
