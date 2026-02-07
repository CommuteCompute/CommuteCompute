/**
 * /api/validate-google-key - Validate Google Places API Key
 * 
 * Tests the provided API key against Google Places API.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

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

  const { apiKey, key } = req.body || {};
  const testKey = apiKey || key;

  if (!testKey) {
    return res.status(400).json({ 
      valid: false, 
      error: 'API key is required' 
    });
  }

  try {
    // Test the key using Places API (New)
    // COMPLIANCE: DEVELOPMENT-RULES.md Section 11.3 - Use Places API (New)
    const testUrl = 'https://places.googleapis.com/v1/places:searchText';

    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': testKey,
        'X-Goog-FieldMask': 'places.id'
      },
      body: JSON.stringify({
        textQuery: 'Melbourne',
        maxResultCount: 1
      })
    });

    const data = await response.json();

    // Places API (New) returns places array on success
    if (response.ok && (data.places || Array.isArray(data.places))) {
      return res.json({
        valid: true,
        message: 'Google Places API key is valid',
        status: 'OK'
      });
    }

    // Check for API key errors
    if (data.error) {
      const errorStatus = data.error.status || 'UNKNOWN';
      if (errorStatus === 'PERMISSION_DENIED' || data.error.code === 403) {
        return res.json({
          valid: false,
          error: 'API key is invalid or Places API (New) is not enabled',
          status: 'REQUEST_DENIED',
          hint: 'Make sure Places API (New) is enabled in your Google Cloud Console'
        });
      }

      return res.json({
        valid: false,
        error: `API returned error: ${data.error.message || errorStatus}`,
        status: errorStatus
      });
    }

    return res.json({
      valid: false,
      error: 'Unexpected API response',
      status: 'UNKNOWN'
    });

  } catch (error) {
    return res.status(500).json({
      valid: false,
      error: 'Validation failed',
      message: error.message
    });
  }
}
