/**
 * /api/debug-api-key - Debug API key storage and retrieval
 * 
 * Returns status of KV storage and whether API key is configured.
 * Use for troubleshooting API key issues.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getTransitApiKey, getKvEnvStatus, getGoogleApiKey, getUserState } from '../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  try {
    // Check KV environment status
    const kvStatus = getKvEnvStatus();
    
    // Try to get the API key
    const transitKey = await getTransitApiKey();
    const googleKey = await getGoogleApiKey();
    const userState = await getUserState();
    
    // Mask keys for security (per Section 17 - no key fragments)
    const maskKey = (key) => {
      if (!key) return null;
      return 'configured (' + key.length + ' chars)';
    };

    // Test if we can make a request with the key
    let apiTestResult = null;
    if (transitKey) {
      try {
        const response = await fetch(
          'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/service-alerts',
          {
            headers: { 'KeyId': transitKey },
            signal: AbortSignal.timeout(5000)
          }
        );
        apiTestResult = {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        };
      } catch (e) {
        apiTestResult = { error: 'API test request failed' };
      }
    }

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      kv: {
        available: Object.values(kvStatus).some(v => v === 'set'),
        envVars: kvStatus
      },
      apiKeys: {
        transit: {
          configured: !!transitKey,
          masked: maskKey(transitKey),
          length: transitKey?.length || 0
        },
        google: {
          configured: !!googleKey,
          masked: maskKey(googleKey)
        }
      },
      state: userState || 'VIC (default)',
      apiTest: apiTestResult
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal diagnostic error'
    });
  }
}
