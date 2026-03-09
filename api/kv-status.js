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
      error: 'Internal storage error',
      kv: { available: false }
    });
  }
}
