/**
 * /api/save-google-key - Save and validate Google Places API key
 * 
 * POST: Test the key first, only save if validated
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import PreferencesManager from '../src/data/preferences-manager.js';
import { setGoogleApiKey } from '../src/data/kv-preferences.js';
import { requireAuth, isFirstTimeSetup, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

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

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey } = req.body;

    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'API key is required'
      });
    }

    const testKey = apiKey.trim();

    // Test the key with the NEW Google Places API (not legacy)
    let testResult = { success: false, message: 'Not tested' };
    
    try {
      const testUrl = 'https://places.googleapis.com/v1/places:autocomplete';
      const testResponse = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': testKey
        },
        body: JSON.stringify({
          input: 'Sydney Opera House',
          locationBias: {
            circle: {
              center: { latitude: -33.8688, longitude: 151.2093 },
              radius: 50000.0
            }
          }
        })
      });
      
      const testData = await testResponse.json();
      
      if (testResponse.ok && testData.suggestions) {
        testResult = {
          success: true,
          message: 'API key validated successfully',
          predictions: testData.suggestions?.length || 0
        };
      } else if (testData.error) {
        const errorMsg = testData.error.message || testData.error.status || 'Unknown error';
        testResult = {
          success: false,
          message: `Google API error: ${errorMsg}`
        };
      } else {
        testResult = {
          success: false,
          message: `Google API returned status ${testResponse.status}`
        };
      }
    } catch (testError) {
      testResult = { success: false, message: testError.message };
    }

    // Only save if validation passed
    if (!testResult.success) {
      return res.status(200).json({
        success: false,
        message: 'API key validation failed - key NOT saved',
        testResult,
        saved: false
      });
    }

    // Validation passed - save with validated status

    // Save to KV storage (Zero-Config compliant - persists across serverless invocations)
    const kvSaved = await setGoogleApiKey(testKey);

    // Also save to local preferences (for development/local use)
    const prefs = new PreferencesManager();
    await prefs.load();
    const currentPrefs = prefs.get();

    if (!currentPrefs.additionalAPIs) {
      currentPrefs.additionalAPIs = {};
    }

    // Save key with validation status
    currentPrefs.additionalAPIs.google_places = testKey;
    currentPrefs.additionalAPIs.google_places_validated = true;
    currentPrefs.additionalAPIs.google_places_validated_at = new Date().toISOString();

    prefs.preferences = currentPrefs;
    await prefs.save();


    return res.status(200).json({
      success: true,
      message: 'API key saved and validated',
      testResult,
      saved: true,
      availableServices: ['google_places']
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
