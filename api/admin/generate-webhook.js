/**
 * Generate Webhook URL API - Serverless Version
 * Saves config to KV storage and returns webhook URL pointing to /api/screen
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { setPreferences, setTransitApiKey, setUserState } from '../../src/data/kv-preferences.js';
import { requireAuth, isFirstTimeSetup, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow unauthenticated access during first-time setup only (Section 26.3)
  if (!(await isFirstTimeSetup())) {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ success: false, error: 'No config provided' });
    }

    // Get base URL from request headers
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;


    // Save config to KV storage so /api/screen can read it
    const kvPrefs = {
      addresses: config.addresses || {},
      locations: config.locations || {},
      journey: {
        transitRoute: config.journey?.transitRoute || {},
        arrivalTime: config.journey?.arrivalTime || '09:00',
        coffeeEnabled: config.journey?.coffeeEnabled !== false
      },
      cafe: config.cafe || null,
      apiMode: config.apiMode || 'cached',
      // GTFS stop IDs for live departure data (Section 23.1.1)
      trainStopId: config.trainStopId || null,
      tramStopId: config.tramStopId || null
    };

    await setPreferences(kvPrefs);

    // Save API key and state separately
    if (config.api?.key) {
      await setTransitApiKey(config.api.key);
    }
    if (config.state) {
      await setUserState(config.state);
    }


    // Webhook URL points to /api/screen which reads from KV
    // This ensures device output matches the PNG preview exactly
    const webhookUrl = `${baseUrl}/api/screen?format=bmp`;

    res.json({
      success: true,
      webhookUrl,
      savedToKv: true,
      instructions: [
        '1. Your device will fetch from /api/screen',
        '2. Config is stored in Vercel KV',
        '3. Device output will match the PNG preview exactly'
      ]
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
