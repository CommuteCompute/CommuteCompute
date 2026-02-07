/**
 * Test Metro Tunnel Compliance
 * 
 * Verifies CommuteCompute™ correctly handles Melbourne Metro Tunnel routing
 * effective 1 February 2026.
 * 
 * Per DEVELOPMENT-RULES.md Section 14 (Testing Requirements)
 * Per ARCHITECTURE.md Section 11.5 (Metro Tunnel Compliance)
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import {
  isMetroTunnelLine,
  isMetroTunnelStation,
  getDiscontinuedServiceInfo,
  getRoutingChangeInfo,
  getRecommendedCBDStation,
  METRO_TUNNEL_LINES,
  METRO_TUNNEL_STATIONS,
  METRO_TUNNEL_DISCONTINUED_SERVICES,
  SUBURBAN_ROUTING_CHANGES,
  CITY_LOOP_LINES,
  CITY_LOOP_STATIONS
} from '../src/engines/commute-compute.js';

import { renderFullDashboard } from '../src/services/ccdash-renderer.js';
import fs from 'fs';
import path from 'path';

console.log('═'.repeat(70));
console.log('  METRO TUNNEL COMPLIANCE TEST SUITE');
console.log('  Effective Date: 1 February 2026');
console.log('═'.repeat(70));
console.log();

const outputDir = path.join(process.cwd(), 'tests/output/metro-tunnel');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`   [OK] ${name}`);
    passed++;
  } else {
    console.log(`   [FAIL] ${name} ${details ? `— ${details}` : ''}`);
    failed++;
  }
}

// =============================================================================
// TEST 1: Metro Tunnel Line Detection
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 1: Metro Tunnel Line Detection                                  │');
console.log('└' + '─'.repeat(68) + '┘');

const metroTunnelLineTests = [
  { line: 'Sunbury', expected: true },
  { line: 'sunbury', expected: true },
  { line: 'Craigieburn', expected: true },
  { line: 'Upfield', expected: true },
  { line: 'Pakenham', expected: true },
  { line: 'Cranbourne', expected: true },
  { line: 'Belgrave', expected: false },  // City Loop
  { line: 'Lilydale', expected: false },  // City Loop
  { line: 'Frankston', expected: false }, // City Loop
  { line: 'Sandringham', expected: false }, // City Loop
  { line: 'Werribee', expected: false },  // City Loop
  { line: 'Hurstbridge', expected: false }, // City Loop
  { line: 'Mernda', expected: false },    // City Loop
  { line: 'Glen Waverley', expected: false }, // City Loop
];

for (const { line, expected } of metroTunnelLineTests) {
  const result = isMetroTunnelLine(line);
  test(`${line} → ${expected ? 'Metro Tunnel' : 'City Loop'}`, result === expected, 
       result !== expected ? `got ${result ? 'Metro Tunnel' : 'City Loop'}` : '');
}
console.log();

// =============================================================================
// TEST 2: Metro Tunnel Station Detection
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 2: Metro Tunnel Station Detection                               │');
console.log('└' + '─'.repeat(68) + '┘');

const stationTests = [
  { station: 'Arden', expected: true },
  { station: 'Parkville', expected: true },
  { station: 'State Library', expected: true },
  { station: 'Town Hall', expected: true },
  { station: 'Anzac', expected: true },
  { station: 'Flinders Street', expected: false },
  { station: 'Southern Cross', expected: false },
  { station: 'Melbourne Central', expected: false },
  { station: 'Parliament', expected: false },
  { station: 'Flagstaff', expected: false },
];

for (const { station, expected } of stationTests) {
  const result = isMetroTunnelStation(station);
  test(`${station} → ${expected ? 'Metro Tunnel Station' : 'NOT Metro Tunnel'}`, 
       result === expected);
}
console.log();

// =============================================================================
// TEST 3: Discontinued Services Detection
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 3: Discontinued Services Detection                              │');
console.log('└' + '─'.repeat(68) + '┘');

const discontinuedTests = [
  // These should be DISCONTINUED
  { station: 'Southern Cross', line: 'Pakenham', discontinued: true },
  { station: 'Southern Cross', line: 'Sunbury', discontinued: true },
  { station: 'Southern Cross', line: 'Cranbourne', discontinued: true },
  { station: 'Melbourne Central', line: 'Pakenham', discontinued: true },
  { station: 'Melbourne Central', line: 'Upfield', discontinued: true },
  { station: 'Flagstaff', line: 'Craigieburn', discontinued: true },
  { station: 'Parliament', line: 'Sunbury', discontinued: true },
  
  // These should STILL be served
  { station: 'Southern Cross', line: 'Werribee', discontinued: false },
  { station: 'Southern Cross', line: 'Williamstown', discontinued: false },
  { station: 'Melbourne Central', line: 'Belgrave', discontinued: false },
  { station: 'Melbourne Central', line: 'Lilydale', discontinued: false },
  { station: 'Flagstaff', line: 'Frankston', discontinued: false },
  { station: 'Parliament', line: 'Sandringham', discontinued: false },
  { station: 'Flinders Street', line: 'Pakenham', discontinued: false }, // Still served
];

for (const { station, line, discontinued } of discontinuedTests) {
  const info = getDiscontinuedServiceInfo(station, line);
  const isDiscontinued = info !== null;
  test(`${station} + ${line} → ${discontinued ? 'DISCONTINUED' : 'Still served'}`,
       isDiscontinued === discontinued,
       isDiscontinued !== discontinued ? `got ${isDiscontinued ? 'DISCONTINUED' : 'Still served'}` : '');
  
  if (info && discontinued) {
    console.log(`      └─ Alternative: ${info.alternative}`);
    console.log(`      └─ Nearest Metro Tunnel: ${info.nearestMetroTunnel} (${info.walkMinutes} min walk)`);
  }
}
console.log();

// =============================================================================
// TEST 4: Suburban Routing Changes
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 4: Suburban Routing Changes                                     │');
console.log('└' + '─'.repeat(68) + '┘');

const routingChangeTests = [
  // Pakenham Line stations
  { station: 'Dandenong', hasChange: true, lostStations: ['Parliament', 'Melbourne Central', 'Flagstaff', 'Southern Cross'] },
  { station: 'Caulfield', hasChange: true },
  { station: 'Clayton', hasChange: true },
  { station: 'Pakenham', hasChange: true },
  
  // Sunbury Line stations
  { station: 'Sunshine', hasChange: true, lostStations: ['Southern Cross', 'Flagstaff', 'Melbourne Central', 'Parliament'] },
  { station: 'Footscray', hasChange: true },
  { station: 'Sunbury', hasChange: true },
  
  // Craigieburn Line stations
  { station: 'Broadmeadows', hasChange: true },
  { station: 'Essendon', hasChange: true },
  
  // Upfield Line stations
  { station: 'Coburg', hasChange: true },
  { station: 'Brunswick', hasChange: true },
  
  // City Loop stations (no change - not suburban)
  { station: 'Richmond', hasChange: false },
  { station: 'Camberwell', hasChange: false },  // Belgrave/Lilydale line
  { station: 'Glen Waverley', hasChange: false },
];

for (const { station, hasChange, lostStations } of routingChangeTests) {
  const info = getRoutingChangeInfo(station);
  const hasInfo = info !== null;
  test(`${station} routing change → ${hasChange ? 'YES' : 'NO'}`,
       hasInfo === hasChange);
  
  if (info && hasChange) {
    console.log(`      └─ Lost: ${info.lostStations.join(', ')}`);
    console.log(`      └─ Gained: ${info.gainedStations.join(', ')}`);
    
    // Verify lost stations match expected
    if (lostStations) {
      const matchesExpected = lostStations.every(s => info.lostStations.includes(s));
      test(`   ${station} lost stations match expected`, matchesExpected);
    }
  }
}
console.log();

// =============================================================================
// TEST 5: Recommended CBD Stations
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 5: Recommended CBD Stations by Line                             │');
console.log('└' + '─'.repeat(68) + '┘');

const cbdRecommendationTests = [
  { line: 'Pakenham', expected: 'stateLibrary' },
  { line: 'Cranbourne', expected: 'stateLibrary' },
  { line: 'Sunbury', expected: 'stateLibrary' },
  { line: 'Craigieburn', expected: 'stateLibrary' },
  { line: 'Upfield', expected: 'stateLibrary' },
  { line: 'Belgrave', expected: 'flindersStreet' },
  { line: 'Lilydale', expected: 'flindersStreet' },
  { line: 'Frankston', expected: 'flindersStreet' },
  { line: 'Sandringham', expected: 'flindersStreet' },
];

for (const { line, expected } of cbdRecommendationTests) {
  const result = getRecommendedCBDStation(line);
  test(`${line} → ${expected}`, result === expected, 
       result !== expected ? `got ${result}` : '');
}
console.log();

// =============================================================================
// TEST 6: Data Completeness
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 6: Data Completeness                                            │');
console.log('└' + '─'.repeat(68) + '┘');

test('METRO_TUNNEL_LINES has 5 lines', METRO_TUNNEL_LINES.length === 5);
test('METRO_TUNNEL_STATIONS has 5 stations', Object.keys(METRO_TUNNEL_STATIONS).length === 5);
test('DISCONTINUED_SERVICES has 4 stations', Object.keys(METRO_TUNNEL_DISCONTINUED_SERVICES).length === 4);
test('SUBURBAN_ROUTING_CHANGES has 5 lines', Object.keys(SUBURBAN_ROUTING_CHANGES).length === 5);
test('CITY_LOOP_LINES has entries', CITY_LOOP_LINES.length > 0);
test('CITY_LOOP_STATIONS has entries', CITY_LOOP_STATIONS.length > 0);

// Verify all Metro Tunnel stations have required fields
for (const [key, station] of Object.entries(METRO_TUNNEL_STATIONS)) {
  test(`${key} has name`, !!station.name);
  test(`${key} has zone`, station.zone !== undefined);
  test(`${key} has interchange`, Array.isArray(station.interchange));
  test(`${key} has precinct`, !!station.precinct);
}
console.log();

// =============================================================================
// TEST 7: Dashboard Render Scenarios
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 7: Dashboard Render Scenarios                                   │');
console.log('└' + '─'.repeat(68) + '┘');

const renderScenarios = [
  {
    name: 'pakenham-to-cbd',
    description: 'Pakenham Line to CBD via Metro Tunnel',
    journey: {
      origin: 'Dandenong',
      destination: 'State Library',
      line: 'Pakenham',
      legs: [
        { type: 'walk', from: 'Home', to: 'Dandenong Station', duration: 5 },
        { type: 'train', from: 'Dandenong', to: 'Town Hall', line: 'Pakenham', duration: 35, via: 'Metro Tunnel' },
        { type: 'walk', from: 'Town Hall', to: 'Work', duration: 3 }
      ],
      totalDuration: 43,
      usesMetroTunnel: true
    }
  },
  {
    name: 'sunbury-to-parkville',
    description: 'Sunbury Line to Parkville (Hospital precinct)',
    journey: {
      origin: 'Sunshine',
      destination: 'Parkville',
      line: 'Sunbury',
      legs: [
        { type: 'walk', from: 'Home', to: 'Sunshine Station', duration: 8 },
        { type: 'train', from: 'Sunshine', to: 'Parkville', line: 'Sunbury', duration: 18, via: 'Metro Tunnel' },
        { type: 'walk', from: 'Parkville', to: 'Royal Melbourne Hospital', duration: 2 }
      ],
      totalDuration: 28,
      usesMetroTunnel: true
    }
  },
  {
    name: 'cranbourne-with-coffee',
    description: 'Cranbourne Line with coffee stop at Anzac',
    journey: {
      origin: 'Narre Warren',
      destination: 'Domain',
      line: 'Cranbourne',
      legs: [
        { type: 'walk', from: 'Home', to: 'Narre Warren Station', duration: 6 },
        { type: 'train', from: 'Narre Warren', to: 'Anzac', line: 'Cranbourne', duration: 42, via: 'Metro Tunnel' },
        { type: 'coffee', from: 'Anzac Station', to: 'Domain Cafe', duration: 8 },
        { type: 'walk', from: 'Domain Cafe', to: 'Work', duration: 5 }
      ],
      totalDuration: 61,
      usesMetroTunnel: true,
      hasCoffee: true
    }
  },
  {
    name: 'belgrave-city-loop',
    description: 'Belgrave Line via City Loop (unchanged)',
    journey: {
      origin: 'Box Hill',
      destination: 'Melbourne Central',
      line: 'Belgrave',
      legs: [
        { type: 'walk', from: 'Home', to: 'Box Hill Station', duration: 4 },
        { type: 'train', from: 'Box Hill', to: 'Melbourne Central', line: 'Belgrave', duration: 28, via: 'City Loop' },
        { type: 'walk', from: 'Melbourne Central', to: 'Work', duration: 3 }
      ],
      totalDuration: 35,
      usesMetroTunnel: false
    }
  },
  {
    name: 'upfield-to-university',
    description: 'Upfield Line to Melbourne University (via Parkville)',
    journey: {
      origin: 'Coburg',
      destination: 'Melbourne University',
      line: 'Upfield',
      legs: [
        { type: 'walk', from: 'Home', to: 'Coburg Station', duration: 3 },
        { type: 'train', from: 'Coburg', to: 'Parkville', line: 'Upfield', duration: 12, via: 'Metro Tunnel' },
        { type: 'walk', from: 'Parkville', to: 'University', duration: 4 }
      ],
      totalDuration: 19,
      usesMetroTunnel: true
    }
  },
  {
    name: 'interchange-scenario',
    description: 'Transfer at North Melbourne (Metro Tunnel ↔ City Loop)',
    journey: {
      origin: 'Footscray',
      destination: 'Parliament',
      line: 'Sunbury → Hurstbridge',
      legs: [
        { type: 'walk', from: 'Home', to: 'Footscray Station', duration: 5 },
        { type: 'train', from: 'Footscray', to: 'North Melbourne', line: 'Sunbury', duration: 8, via: 'Metro Tunnel (partial)' },
        { type: 'transfer', from: 'Platform 3', to: 'Platform 5', duration: 4 },
        { type: 'train', from: 'North Melbourne', to: 'Parliament', line: 'Hurstbridge', duration: 6, via: 'City Loop' },
        { type: 'walk', from: 'Parliament', to: 'Work', duration: 2 }
      ],
      totalDuration: 25,
      usesMetroTunnel: true,
      hasInterchange: true
    }
  }
];

async function renderScenario(scenario) {
  // Build mock journey data for renderer
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + scenario.journey.totalDuration * 60000);
  
  // Format times as 12h
  const nowHours = now.getHours();
  const nowMins = now.getMinutes();
  const now12h = nowHours > 12 ? nowHours - 12 : (nowHours === 0 ? 12 : nowHours);
  const timeStr = `${now12h}:${nowMins.toString().padStart(2, '0')}`;
  const ampm = nowHours >= 12 ? 'PM' : 'AM';
  
  const arrivalHours = arrivalTime.getHours();
  const arrivalMins = arrivalTime.getMinutes();
  const arrival12h = arrivalHours > 12 ? arrivalHours - 12 : (arrivalHours === 0 ? 12 : arrivalHours);
  const arrivalTimeStr = `${arrival12h}:${arrivalMins.toString().padStart(2, '0')}${arrivalHours >= 12 ? 'pm' : 'am'}`;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Build legs in the format the renderer expects
  const legs = scenario.journey.legs.map((leg, idx) => {
    const modeIcons = { walk: 'WALK', train: '[Train]', coffee: '[Coffee]', transfer: '[Refresh]', tram: '[Tram]', bus: '[Bus]' };
    const modeMap = { walk: 'walk', train: 'train', coffee: 'coffee', transfer: 'walk', tram: 'tram', bus: 'bus' };
    return {
      step_number: idx + 1,
      mode: modeMap[leg.type] || 'walk',
      icon: modeIcons[leg.type] || 'WALK',
      line_number: leg.line || '',
      direction: leg.to,
      from_stop: leg.from,
      to_stop: leg.to,
      duration_mins: leg.duration,
      is_coffee: leg.type === 'coffee',
      via: leg.via || null,
      subtitle: leg.via ? `via ${leg.via}` : ''
    };
  });

  // Match the format from test-admin-simulation.js
  const dashboardData = {
    // Header
    time: timeStr,
    ampm: ampm,
    day: days[now.getDay()],
    date: `${now.getDate()} ${months[now.getMonth()]}`,
    location: scenario.journey.origin.toUpperCase(),
    
    // Weather
    temp: 18,
    condition: 'Partly Cloudy',
    umbrella: false,
    
    // Summary bar  
    leave_in_minutes: 0,
    arrive_by: arrivalTimeStr,
    total_minutes: scenario.journey.totalDuration,
    status_type: 'normal',
    delay: 0,
    
    // Journey legs
    journey_legs: legs,
    legs: legs,
    
    // Footer
    destination: scenario.journey.destination.toUpperCase(),
    work: scenario.journey.destination.toUpperCase(),
    
    // Coffee decision
    coffee_decision: scenario.journey.hasCoffee ? 'YES' : 'SKIP',
    coffeeDecision: scenario.journey.hasCoffee 
      ? { canGetCoffee: true, reason: 'Time for coffee' }
      : { canGetCoffee: false, reason: 'No time' },
    
    // Service status
    services_ok: true,
    data_live: true,
    
    // Extra context for Metro Tunnel
    route_type: scenario.journey.usesMetroTunnel ? 'metro-tunnel' : 'city-loop',
    pattern: scenario.journey.usesMetroTunnel ? 'metro-tunnel-route' : 'city-loop-route'
  };

  try {
    // Render full screen
    const buffer = await renderFullDashboard(dashboardData);
    
    const filename = `metro-tunnel-${scenario.name}.png`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, buffer);
    
    console.log(`   [OK] Rendered: ${scenario.name}`);
    console.log(`      └─ ${scenario.description}`);
    console.log(`      └─ Metro Tunnel: ${scenario.journey.usesMetroTunnel ? 'YES' : 'NO'}`);
    console.log(`      └─ Legs: ${scenario.journey.legs.length}`);
    console.log(`      └─ Output: ${filepath}`);
    passed++;
    return true;
  } catch (error) {
    console.log(`   [FAIL] Render failed: ${scenario.name}`);
    console.log(`      └─ Error: ${error.message}`);
    if (error.stack) {
      console.log(`      └─ Stack: ${error.stack.split('\n')[1]}`);
    }
    failed++;
    return false;
  }
}

async function runRenderTests() {
  console.log(`\n   Rendering ${renderScenarios.length} Metro Tunnel scenarios...`);
  console.log();
  
  for (const scenario of renderScenarios) {
    await renderScenario(scenario);
    console.log();
  }
}

// =============================================================================
// TEST 8: Edge Cases
// =============================================================================

console.log('┌' + '─'.repeat(68) + '┐');
console.log('│ TEST 8: Edge Cases                                                   │');
console.log('└' + '─'.repeat(68) + '┘');

// Test null/undefined handling
test('isMetroTunnelLine(null) returns false', isMetroTunnelLine(null) === false);
test('isMetroTunnelLine(undefined) returns false', isMetroTunnelLine(undefined) === false);
test('isMetroTunnelLine("") returns false', isMetroTunnelLine('') === false);

test('isMetroTunnelStation(null) returns false', isMetroTunnelStation(null) === false);
test('isMetroTunnelStation(undefined) returns false', isMetroTunnelStation(undefined) === false);

test('getDiscontinuedServiceInfo(null, null) returns null', getDiscontinuedServiceInfo(null, null) === null);
test('getRoutingChangeInfo(null) returns null', getRoutingChangeInfo(null) === null);

// Test case insensitivity
test('isMetroTunnelLine("PAKENHAM") works', isMetroTunnelLine('PAKENHAM') === true);
test('isMetroTunnelLine("PaKeNhAm") works', isMetroTunnelLine('PaKeNhAm') === true);
test('isMetroTunnelStation("STATE LIBRARY") works', isMetroTunnelStation('STATE LIBRARY') === true);
test('isMetroTunnelStation("state library") works', isMetroTunnelStation('state library') === true);

console.log();

// =============================================================================
// RUN RENDER TESTS
// =============================================================================

await runRenderTests();

// =============================================================================
// SUMMARY
// =============================================================================

console.log('═'.repeat(70));
console.log('  TEST SUMMARY');
console.log('═'.repeat(70));
console.log();
console.log(`   Total:  ${passed + failed} tests`);
console.log(`   Passed: ${passed} [OK]`);
console.log(`   Failed: ${failed} [FAIL]`);
console.log();

if (failed === 0) {
  console.log('   ALL TESTS PASSED -- Metro Tunnel compliance verified!');
} else {
  console.log(`   [!] ${failed} test(s) failed -- review above for details`);
}

console.log();
console.log('   Render outputs saved to: tests/output/metro-tunnel/');
console.log('═'.repeat(70));

process.exit(failed > 0 ? 1 : 0);
