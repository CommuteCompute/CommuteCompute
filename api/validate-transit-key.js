/**
 * /api/validate-transit-key - Validate Transport Victoria OpenData API Key
 * 
 * Tests the provided API key against the Transport Victoria OpenData API.
 * Per DEVELOPMENT-RULES.md Section 11.1:
 * - Base URL: https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1
 * - Auth: KeyId header (case-sensitive) with UUID format API key
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

const API_BASE = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, key, state = 'VIC' } = req.body || {};
  const testKey = (apiKey || key || '').trim();

  if (!testKey) {
    return res.status(400).json({ 
      valid: false, 
      error: 'API key is required' 
    });
  }

  // Basic format validation - should be UUID format
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(testKey)) {
    return res.json({
      valid: false,
      error: 'Invalid key format',
      hint: 'Transport Victoria OpenData API key should be UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
      keyLength: testKey.length
    });
  }

  // Actually test the API key by making a request
  try {
    
    // Test with metro service-alerts (lightweight endpoint)
    const testUrl = `${API_BASE}/metro/service-alerts`;
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'KeyId': testKey,  // Case-sensitive as per dev rules
        'Accept': 'application/x-protobuf'
      }
    });


    if (response.status === 200) {
      // Key works!
      const buffer = await response.arrayBuffer();
      return res.json({
        valid: true,
        message: 'API key validated successfully',
        state,
        responseSize: buffer.byteLength,
        endpoint: 'metro/service-alerts'
      });
    } else if (response.status === 401 || response.status === 403) {
      // Auth failed
      const errorText = await response.text().catch(() => '');
      return res.json({
        valid: false,
        error: 'API key rejected by Transport Victoria',
        status: response.status,
        hint: 'Check that your key is correct and has not expired',
        details: errorText.substring(0, 200)
      });
    } else {
      // Other error
      const errorText = await response.text().catch(() => '');
      return res.json({
        valid: false,
        error: `API returned status ${response.status}`,
        hint: 'The API may be temporarily unavailable',
        details: errorText.substring(0, 200)
      });
    }

  } catch (error) {
    return res.status(500).json({
      valid: false,
      error: 'Validation request failed',
      message: error.message,
      hint: 'Network error - check your connection'
    });
  }
}
