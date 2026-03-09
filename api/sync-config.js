/**
 * /api/sync-config - Sync configuration to KV storage
 * 
 * Per DEVELOPMENT-RULES Section 3.6 & 11.8:
 * Ensures Setup Wizard data is persisted to Redis.
 * Called after setup completion to guarantee data is saved.
 * 
 * POST: Saves provided config to KV
 * GET: Returns current KV config status
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import {
  setTransitApiKey,
  setGoogleApiKey,
  setUserState,
  setPreferences,
  getTransitApiKey,
  getGoogleApiKey,
  getStorageStatus,
  getSetupComplete,
  setSetupComplete
} from '../src/data/kv-preferences.js';
import { requireAuth, isFirstTimeSetup, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET returns non-sensitive status info — allow unauthenticated so wizard can detect re-setup
  // POST requires auth unless first-time setup (Section 26.3)
  if (req.method !== 'GET' && !(await isFirstTimeSetup())) {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
  }

  try {
    // GET: Return current KV status
    if (req.method === 'GET') {
      const status = await getStorageStatus();
      const transitKey = await getTransitApiKey();
      const googleKey = await getGoogleApiKey();

      // Auto-migrate: if transit key exists but setup_complete flag missing
      const setupComplete = await getSetupComplete();
      if (!setupComplete && transitKey) {
        await setSetupComplete({ timestamp: new Date().toISOString(), source: 'sync-config-migration' });
      }

      return res.json({
        success: true,
        kv: {
          available: status.kvAvailable,
          configured: status.hasTransitKey
        },
        setupComplete: !!setupComplete,
        keys: {
          transit: transitKey ? 'configured' : null,
          google: googleKey ? 'configured' : null
        },
        state: status.state
      });
    }

    // POST: Sync config from Setup Wizard to KV
    if (req.method === 'POST') {
      const { transitKey, googleKey, state, preferences, markSetupComplete } = req.body;
      
      const results = {
        transit: false,
        google: false,
        state: false,
        preferences: false
      };
      
      // Save Transit API key if provided
      if (transitKey) {
        results.transit = await setTransitApiKey(transitKey);
      }
      
      // Save Google API key if provided
      if (googleKey) {
        results.google = await setGoogleApiKey(googleKey);
      }
      
      // Save user state if provided
      if (state) {
        results.state = await setUserState(state);
      }
      
      // Save full preferences if provided
      if (preferences) {
        results.preferences = await setPreferences(preferences);
      }
      
      // Only mark setup complete when explicitly requested (prevents premature auth lock during wizard)
      if (markSetupComplete) {
        await setSetupComplete({ timestamp: new Date().toISOString(), source: 'setup-wizard' });
      }

      const status = await getStorageStatus();

      return res.json({
        success: true,
        saved: results,
        kv: {
          available: status.kvAvailable,
          configured: status.hasTransitKey
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
