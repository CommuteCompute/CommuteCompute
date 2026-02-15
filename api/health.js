/**
 * Health Check API
 * Part of the Commute Compute System™
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 * 
 * Per Section 17.5: No environment file references
 * Per Section 3.4: API keys from KV storage only
 */

import { getTransitApiKey, getClient } from '../src/data/kv-preferences.js';

// Health check using KV storage per Zero-Config (Section 3.1)
export default async function handler(req, res) {
  const transitKey = await getTransitApiKey();

  // Test actual Redis connectivity
  let redisConnected = false;
  try {
    const client = await getClient();
    if (client) {
      // Attempt a lightweight read to verify the connection is live
      await client.get('cc:health:ping');
      redisConnected = true;
    }
  } catch {
    redisConnected = false;
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    node: process.version,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production'
    },
    kv: {
      transitKey: transitKey ? 'configured' : 'not configured'
    },
    redis: {
      connected: redisConnected
    }
  });
}
