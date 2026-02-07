/**
 * Test CommuteCompute Engine
 * Verifies state detection, fallback mode, and multi-state support
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import CommuteCompute, { STATE_CONFIG } from '../src/engines/commute-compute.js';

console.log('Testing CommuteCompute Engine\n');

// Test addresses for different states
const testAddresses = {
  VIC: { formattedAddress: '1 Example Street, Suburb VIC 3000', state: 'VIC' },
  NSW: { formattedAddress: '1 George Street, Sydney NSW 2000', state: 'NSW' },
  QLD: { formattedAddress: '1 Queen Street, Brisbane QLD 4000', state: 'QLD' },
  SA: { formattedAddress: '1 North Terrace, Adelaide SA 5000', state: 'SA' },
  WA: { formattedAddress: '1 St Georges Terrace, Perth WA 6000', state: 'WA' },
  TAS: { formattedAddress: '1 Murray Street, Hobart TAS 7000', state: 'TAS' },
  ACT: { formattedAddress: '1 Commonwealth Avenue, Canberra ACT 2600', state: 'ACT' },
  NT: { formattedAddress: '1 Mitchell Street, Darwin NT 0800', state: 'NT' }
};

// Test 1: State Detection from Address
console.log('Test 1: State Detection from Address');
console.log('-'.repeat(50));

async function testStateDetection() {
  const engine = new CommuteCompute();
  
  for (const [expectedState, address] of Object.entries(testAddresses)) {
    const detected = await engine.detectState(address);
    const match = detected === expectedState;
    console.log(`   ${match ? '[OK]' : '[FAIL]'} ${address.formattedAddress.substring(0, 30)}... -> ${detected} ${match ? '' : `(expected ${expectedState})`}`);
  }
  console.log();
}

// Test 2: State Detection from Postcode
console.log('Test 2: State Detection from Postcode');
console.log('-'.repeat(50));

async function testPostcodeDetection() {
  const engine = new CommuteCompute();
  
  const postcodeTests = [
    { postcode: 3141, expected: 'VIC' },
    { postcode: 2000, expected: 'NSW' },
    { postcode: 2600, expected: 'ACT' },  // Special ACT range
    { postcode: 4000, expected: 'QLD' },
    { postcode: 5000, expected: 'SA' },
    { postcode: 6000, expected: 'WA' },
    { postcode: 7000, expected: 'TAS' },
    { postcode: 800, expected: 'NT' }
  ];
  
  for (const { postcode, expected } of postcodeTests) {
    const detected = engine.stateFromPostcode(postcode);
    const match = detected === expected;
    console.log(`   ${match ? '[OK]' : '[FAIL]'} Postcode ${postcode} -> ${detected} ${match ? '' : `(expected ${expected})`}`);
  }
  console.log();
}

// Test 3: State Configuration
console.log('Test 3: State Configuration');
console.log('-'.repeat(50));

function testStateConfig() {
  for (const [state, config] of Object.entries(STATE_CONFIG)) {
    console.log(`   ${state}: ${config.name}`);
    console.log(`      Transit: ${config.transitAuthority}`);
    console.log(`      Timezone: ${config.timezone}`);
    console.log(`      Modes: ${Object.keys(config.modes).join(', ')}`);
  }
  console.log();
}

// Test 4: Initialize with VIC (with API keys)
console.log('Test 4: Initialize for Victoria (no API keys - fallback mode)');
console.log('-'.repeat(50));

async function testVicInit() {
  const preferences = {
    get: () => ({
      homeAddress: testAddresses.VIC,
      workAddress: { formattedAddress: '123 Sample St, Melbourne VIC 3000' },
      cafeLocation: { formattedAddress: 'Sample Cafe, South Yarra VIC' },
      arrivalTime: '09:00',
      coffeeEnabled: true
    })
  };
  
  const engine = new CommuteCompute(preferences);
  await engine.initialize();
  
  const status = engine.getStatus();
  console.log(`   State: ${status.state} (${status.stateName})`);
  console.log(`   Transit: ${status.transitAuthority}`);
  console.log(`   Fallback mode: ${status.fallbackMode}`);
  console.log(`   Has API keys: ${status.hasApiKeys}`);
  console.log();
  
  return engine;
}

// Test 5: Get Journey Recommendation
console.log('Test 5: Journey Recommendation (fallback mode)');
console.log('-'.repeat(50));

async function testJourneyRecommendation(engine) {
  const result = await engine.getJourneyRecommendation();
  
  console.log(`   Success: ${result.success}`);
  console.log(`   State: ${result.state} (${result.stateConfig?.name})`);
  console.log(`   Fallback mode: ${result.fallbackMode}`);
  console.log(`   Pattern: ${result.pattern?.type || 'N/A'}`);
  console.log(`   Route: ${result.route?.name || 'N/A'}`);
  console.log(`   Coffee: ${result.coffee?.decision || 'N/A'}`);
  console.log(`   Transit source: ${result.transit?.source || 'N/A'}`);
  console.log(`   Weather: ${result.weather?.temp || '--'}° ${result.weather?.condition || ''}`);
  console.log();
}

// Test 6: Test NSW initialization
console.log('Test 6: Initialize for New South Wales');
console.log('-'.repeat(50));

async function testNswInit() {
  const preferences = {
    get: () => ({
      homeAddress: testAddresses.NSW,
      workAddress: { formattedAddress: 'Martin Place, Sydney NSW 2000' },
      arrivalTime: '09:00'
    })
  };
  
  const engine = new CommuteCompute(preferences);
  await engine.initialize();
  
  const status = engine.getStatus();
  console.log(`   State: ${status.state} (${status.stateName})`);
  console.log(`   Transit: ${status.transitAuthority}`);
  console.log(`   Timezone: ${status.timezone}`);
  console.log(`   Default modes: ${Object.keys(STATE_CONFIG.NSW.modes).join(', ')}`);
  console.log();
}

// Test 7: Test QLD initialization
console.log('Test 7: Initialize for Queensland');
console.log('-'.repeat(50));

async function testQldInit() {
  const preferences = {
    get: () => ({
      homeAddress: testAddresses.QLD,
      workAddress: { formattedAddress: 'CBD, Brisbane QLD 4000' },
      arrivalTime: '08:30'
    })
  };
  
  const engine = new CommuteCompute(preferences);
  await engine.initialize();
  
  const status = engine.getStatus();
  console.log(`   State: ${status.state} (${status.stateName})`);
  console.log(`   Transit: ${status.transitAuthority}`);
  console.log(`   Timezone: ${status.timezone}`);
  console.log();
}

// Run all tests
async function runTests() {
  testStateConfig();
  await testStateDetection();
  await testPostcodeDetection();
  const engine = await testVicInit();
  await testJourneyRecommendation(engine);
  await testNswInit();
  await testQldInit();
  
  console.log('[OK] All CommuteCompute tests completed!');
  console.log('=======================================');
}

runTests().catch(console.error);
