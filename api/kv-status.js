/**
 * /api/kv-status - Debug endpoint for Redis storage status
 *
 * Returns Redis connection status and stored keys (masked).
 * Per DEVELOPMENT-RULES Section 3.6.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getStorageStatus, getTransitApiKey, getKvEnvStatus } from '../src/data/kv-preferences.js';

export default async function handler(req, res) {
  try {
    const status = await getStorageStatus();
    const transitKey = await getTransitApiKey();
    const envStatus = getKvEnvStatus();
    
    res.json({
      kv: {
        available: status.kvAvailable,
        envVars: envStatus
      },
      storage: {
        hasTransitKey: status.hasTransitKey,
        transitKeyConfigured: !!transitKey,
        hasGoogleKey: status.hasGoogleKey,
        state: status.state
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      kv: {
        available: false,
        envVars: {
          KV_REST_API_URL: process.env.KV_REST_API_URL ? 'set' : 'missing',
          KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'set' : 'missing',
          UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? 'set' : 'missing',
          UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? 'set' : 'missing'
        }
      }
    });
  }
}
