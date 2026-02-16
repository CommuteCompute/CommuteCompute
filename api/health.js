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
  const now = Date.now();
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

  const mem = process.memoryUsage();

  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(now).toISOString(),
    version: '4.2.0',
    node: process.version,
    uptime: process.uptime(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap: Math.round(mem.heapUsed / 1024 / 1024)
    },
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production'
    },
    storage: redisConnected ? 'connected' : 'unavailable',
    kv: {
      transitKey: transitKey ? 'configured' : 'not configured'
    },
    redis: {
      connected: redisConnected
    }
  });
}
