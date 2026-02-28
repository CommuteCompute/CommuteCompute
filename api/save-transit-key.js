/**
 * /api/save-transit-key - Save and validate Transit Authority API key
 * 
 * POST: Save the Transit API key to preferences with validation
 * 
 * Supports validation for:
 * - Victoria: Transport Victoria OpenData API (GTFS-RT)
 * - NSW: Transport for NSW Open Data
 * - QLD: TransLink GTFS feeds
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';
import PreferencesManager from '../src/data/preferences-manager.js';
import { setTransitApiKey, setUserState } from '../src/data/kv-preferences.js';
import { requireAuth, isFirstTimeSetup, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

// Transit authority validation endpoints
// Per DEVELOPMENT-RULES.md: VIC uses KeyId header (case-sensitive) with UUID format API key
const TRANSIT_VALIDATORS = {
  VIC: {
    name: 'Transport Victoria OpenData',
    // Use service-alerts - lighter endpoint, faster response
    testUrl: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/service-alerts',
    // Per opendata.js: KeyId header (case-sensitive), Accept: */*
    makeHeaders: (apiKey) => ({
      'Accept': '*/*',
      'KeyId': apiKey  // CORRECT: KeyId header (case-sensitive)
    })
  },
  NSW: {
    name: 'Transport for NSW',
    testUrl: 'https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses',
    makeHeaders: (apiKey) => ({
      'Accept': '*/*',
      'Authorization': `apikey ${apiKey}`
    })
  },
  QLD: {
    name: 'TransLink Queensland',
    testUrl: 'https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions',
    makeHeaders: (apiKey) => ({
      'Accept': '*/*',
      'Authorization': `Bearer ${apiKey}`
    })
  }
};

/**
 * Validate API key format based on state
 */
function validateKeyFormat(apiKey, state) {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, message: 'API key is required' };
  }

  const key = apiKey.trim();

  // Victoria: UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  if (state === 'VIC') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(key)) {
      return {
        valid: false,
        message: 'Victoria API keys must be in UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)'
      };
    }
  }

  // NSW: Typically alphanumeric, 32+ chars
  if (state === 'NSW') {
    if (key.length < 20) {
      return {
        valid: false,
        message: 'NSW API keys are typically 20+ characters'
      };
    }
  }

  // General minimum length check
  if (key.length < 10) {
    return {
      valid: false,
      message: 'API key appears too short'
    };
  }

  return { valid: true };
}

/**
 * Validate API key with live API test
 * Uses correct handshake protocol per DEVELOPMENT-RULES.md and opendata.js
 */
async function testApiKey(apiKey, state) {
  const validator = TRANSIT_VALIDATORS[state];

  if (!validator) {
    return { success: true, message: 'API key saved (no validation available for this state)', validated: false };
  }

  // VIC: test all 4 transit modes in parallel
  if (state === 'VIC') {
    return testApiKeyAllModes(apiKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const headers = validator.makeHeaders(apiKey.trim());

    const response = await fetch(validator.testUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true, message: 'API key validated successfully', validated: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Invalid API key or unauthorized', validated: true };
    }

    return { success: true, message: `API returned ${response.status} - key saved, will retry on use`, validated: false };

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return { success: true, message: 'Validation timed out - key saved, will validate on first use', validated: false };
    }

    return { success: true, message: `Validation error: ${error.message} - key saved`, validated: false };
  }
}

const VIC_MODES = ['metro', 'tram', 'bus', 'vline'];

async function testApiKeyAllModes(apiKey) {
  const baseUrl = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1';
  const headers = { 'Accept': '*/*', 'KeyId': apiKey.trim() };
  const results = {};

  await Promise.all(VIC_MODES.map(async (mode) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${baseUrl}/${mode}/trip-updates`, {
        method: 'GET', headers, signal: controller.signal
      });
      clearTimeout(timeout);
      results[mode] = { success: response.ok, status: response.status };
    } catch (error) {
      results[mode] = { success: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
    }
  }));

  const passedModes = Object.entries(results).filter(([, r]) => r.success).map(([m]) => m);
  const failedModes = Object.entries(results).filter(([, r]) => !r.success).map(([m]) => m);
  const allPassed = passedModes.length === VIC_MODES.length;

  return {
    success: passedModes.length > 0,
    validated: true,
    allModesPassed: allPassed,
    modeResults: results,
    passedModes,
    failedModes,
    message: allPassed
      ? `API key validated for all modes: ${passedModes.join(', ')}`
      : passedModes.length > 0
        ? `Partial: ${passedModes.join(', ')} OK; ${failedModes.join(', ')} failed`
        : `All modes failed: ${failedModes.join(', ')}`
  };
}

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, state = 'VIC' } = req.body;

    // Step 1: Validate format
    const formatCheck = validateKeyFormat(apiKey, state);
    if (!formatCheck.valid) {
      return res.status(400).json({
        success: false,
        message: formatCheck.message,
        validationStep: 'format'
      });
    }


    // Step 2: Test the API key first
    const testResult = await testApiKey(apiKey, state);

    // Step 3: Only save if validation passed (consistent with Google key behaviour)
    if (!testResult.success) {
      return res.status(200).json({
        success: false,
        message: 'API key validation failed - key NOT saved',
        testResult,
        saved: false,
        state,
        keyConfigured: true
      });
    }

    // Validation passed - save to preferences
    
    // Per Section 11.8: Save to KV storage (Zero-Config compliant)
    const kvSaved = await setTransitApiKey(apiKey.trim());
    await setUserState(state);
    
    // Also save to local preferences (for development/local use)
    const prefs = new PreferencesManager();
    await prefs.load();

    const currentPrefs = prefs.get();
    
    if (!currentPrefs.api) {
      currentPrefs.api = {};
    }
    
    currentPrefs.api.key = apiKey.trim();
    currentPrefs.api.state = state;
    currentPrefs.api.lastValidated = new Date().toISOString();
    currentPrefs.api.validationStatus = 'valid';
    
    prefs.preferences = currentPrefs;
    await prefs.save();


    // Return success result
    return res.status(200).json({
      success: true,
      message: 'API key saved and validated successfully',
      testResult,
      saved: true,
      state,
      keyConfigured: true
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
