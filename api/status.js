/**
 * /api/status - System Status Endpoint
 * Returns current system status for dashboard display.
 * 
 * Per DEVELOPMENT-RULES Section 3.6 & 11.8:
 * Checks Redis for API key configuration status.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getTransitApiKey, getGoogleApiKey, getStorageStatus, getClient } from '../src/data/kv-preferences.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const now = new Date();
    
    // Check KV for API key status
    const transitKey = await getTransitApiKey();
    const googleKey = await getGoogleApiKey();
    const kvStatus = await getStorageStatus();

    // Test actual Redis connectivity
    let redisConnected = false;
    try {
      const client = await getClient();
      if (client) {
        await client.get('cc:health:ping');
        redisConnected = true;
      }
    } catch {
      redisConnected = false;
    }
    
    // Determine if system is configured (has transit API key)
    const isConfigured = !!transitKey;
    const transitStatus = transitKey 
      ? { status: 'live', message: 'Transport Victoria OpenData connected' }
      : { status: 'fallback', message: 'Using timetable data' };
    
    res.json({
      status: 'ok',
      configured: isConfigured,
      timestamp: now.toISOString(),
      services: {
        transit: transitStatus,
        weather: { status: 'ok' },
        geocoding: { 
          status: googleKey ? 'google' : 'ok', 
          provider: googleKey ? 'google-places' : 'nominatim' 
        }
      },
      journey: {
        arrivalTime: '09:00',
        coffeeEnabled: true
      },
      kv: {
        available: kvStatus.kvAvailable,
        hasTransitKey: kvStatus.hasTransitKey,
        hasGoogleKey: kvStatus.hasGoogleKey
      },
      redis: {
        connected: redisConnected
      },
      environment: 'vercel-serverless'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
}
