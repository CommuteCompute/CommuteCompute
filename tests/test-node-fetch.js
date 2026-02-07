/**
 * Test node-fetch with KeyId header to verify it works the same as curl
 *
 * Usage: ODATA_API_KEY=your-key node tests/test-node-fetch.js
 * (Zero-Config: No .env files - pass API key inline)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';

const API_KEY = process.env.ODATA_API_KEY;
const URL = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates';

if (!API_KEY) {
  console.error('[FAIL] ODATA_API_KEY not provided');
  console.error('Usage: ODATA_API_KEY=your-key node tests/test-node-fetch.js');
  process.exit(1);
}

console.log('Testing node-fetch with KeyId header...');
console.log(`API Key: ${API_KEY ? 'configured' : 'NOT SET'}`);
console.log(`URL: ${URL}\n`);

try {
  const response = await fetch(URL, {
    headers: {
      'KeyId': API_KEY,
      'Accept': '*/*'
    }
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);

  if (response.ok) {
    const buffer = await response.arrayBuffer();
    console.log(`[OK] SUCCESS! Received ${buffer.byteLength} bytes of data`);
  } else {
    const text = await response.text();
    console.log(`[FAIL] Error: ${text.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`[FAIL] Exception: ${error.message}`);
}
