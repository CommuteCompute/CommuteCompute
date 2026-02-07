/**
 * Test script for OpenData Transport Victoria API authentication
 * Tests different authentication methods to find what works
 *
 * Usage: ODATA_API_KEY=your-key node tests/test-opendata-auth.js
 * (Zero-Config: No .env files - pass API key inline)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';

const API_KEY = process.env.ODATA_API_KEY;
const API_TOKEN = process.env.ODATA_TOKEN; // Legacy, deprecated
const BASE_URL = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro';
const ENDPOINT = '/trip-updates';

console.log('Testing OpenData Transport Victoria API Authentication\n');
console.log('Credentials:');
console.log(`  ODATA_API_KEY: ${API_KEY ? 'configured' : 'NOT SET'}`);
console.log(`  ODATA_TOKEN: ${API_TOKEN ? 'configured' : 'NOT SET'}`);
console.log('');

async function testAuth(method, url, headers) {
  console.log(`\nTesting: ${method}`);
  console.log(`   URL: ${url}`);
  console.log(`   Headers:`, JSON.stringify(headers, null, 2));

  try {
    const response = await fetch(url, { headers });
    console.log(`   [OK] Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      console.log(`   Content-Type: ${contentType}`);

      if (contentType?.includes('protobuf')) {
        const buffer = await response.arrayBuffer();
        console.log(`   [OK] SUCCESS! Received ${buffer.byteLength} bytes of protobuf data`);
      } else {
        const text = await response.text();
        console.log(`   Response: ${text.substring(0, 200)}`);
      }
    } else {
      const text = await response.text();
      console.log(`   [FAIL] Error response:`, text.substring(0, 500));
    }
  } catch (error) {
    console.log(`   [FAIL] Error: ${error.message}`);
  }
}

// Test 1: API Token in header (current method)
await testAuth(
  'Method 1: JWT Token in Ocp-Apim-Subscription-Key header',
  BASE_URL + ENDPOINT,
  {
    'Ocp-Apim-Subscription-Key': API_TOKEN,
    'Accept': 'application/x-protobuf'
  }
);

// Test 2: API Key (UUID) in header
await testAuth(
  'Method 2: UUID Key in Ocp-Apim-Subscription-Key header',
  BASE_URL + ENDPOINT,
  {
    'Ocp-Apim-Subscription-Key': API_KEY,
    'Accept': 'application/x-protobuf'
  }
);

// Test 3: API Token in query parameter
await testAuth(
  'Method 3: JWT Token in subscription-key query parameter',
  `${BASE_URL}${ENDPOINT}?subscription-key=${encodeURIComponent(API_TOKEN)}`,
  {
    'Accept': 'application/x-protobuf'
  }
);

// Test 4: API Key in query parameter
await testAuth(
  'Method 4: UUID Key in subscription-key query parameter',
  `${BASE_URL}${ENDPOINT}?subscription-key=${encodeURIComponent(API_KEY)}`,
  {
    'Accept': 'application/x-protobuf'
  }
);

// Test 5: Both in headers
await testAuth(
  'Method 5: Both UUID Key and JWT Token in headers',
  BASE_URL + ENDPOINT,
  {
    'Ocp-Apim-Subscription-Key': API_KEY,
    'Authorization': `Bearer ${API_TOKEN}`,
    'Accept': 'application/x-protobuf'
  }
);

// Test 6: API Token as Bearer in Authorization header only
await testAuth(
  'Method 6: JWT Token in Authorization Bearer header',
  BASE_URL + ENDPOINT,
  {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Accept': 'application/x-protobuf'
  }
);

console.log('\n\n[OK] Test complete!');
