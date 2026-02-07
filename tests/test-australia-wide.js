/**
 * Australia-Wide CommuteCompute Test
 * Tests random journeys from different states with various conditions
 * Renders dashboard screenshots for each scenario
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import CommuteCompute from '../src/engines/commute-compute.js';
import { renderFullDashboard } from '../src/services/ccdash-renderer.js';
import fs from 'fs';
import path from 'path';

console.log('Australia-Wide CommuteCompute Test\n');
console.log('Testing journeys across all states with various conditions\n');

// =============================================================================
// TEST SCENARIOS
// =============================================================================

const scenarios = [
  // Victoria - Normal morning commute with coffee
  {
    name: 'Melbourne Morning Coffee Run',
    state: 'VIC',
    home: { formattedAddress: '123 Example Street, Suburb VIC 3000', lat: -37.8445, lon: 144.9905 },
    work: { formattedAddress: '123 Sample Street, Melbourne VIC 3000', lat: -37.8136, lon: 144.9689 },
    cafe: { formattedAddress: 'Example Cafe, South Yarra VIC', lat: -37.8398, lon: 144.9915 },
    arrivalTime: '09:00',
    coffeeEnabled: true,
    conditions: 'normal',
    transit: {
      trains: [{ minutes: 8, destination: 'Flinders Street', platform: 1, routeName: 'Sandringham', delay: 0 }],
      trams: [{ minutes: 4, routeNumber: '8', destination: 'South Yarra Stn' }]
    },
    weather: { temp: 18, condition: 'Partly Cloudy', icon: '[Cloud]', umbrella: false }
  },
  
  // NSW - Sydney with delays
  {
    name: 'Sydney CBD Rush Hour (Delays)',
    state: 'NSW',
    home: { formattedAddress: '100 George Street, The Rocks NSW 2000', lat: -33.8568, lon: 151.2093 },
    work: { formattedAddress: 'Martin Place, Sydney NSW 2000', lat: -33.8678, lon: 151.2107 },
    cafe: null,  // No coffee
    arrivalTime: '08:30',
    coffeeEnabled: false,
    conditions: 'delays',
    transit: {
      trains: [{ minutes: 12, destination: 'Central', platform: 3, routeName: 'T1 North Shore', delay: 5, isDelayed: true }],
      trams: [],
      buses: [{ minutes: 6, routeNumber: '333', destination: 'City' }]
    },
    weather: { temp: 24, condition: 'Sunny', icon: '[Sun]', umbrella: false }
  },
  
  // QLD - Brisbane with rain
  {
    name: 'Brisbane Rainy Commute',
    state: 'QLD',
    home: { formattedAddress: '50 Adelaide Street, Brisbane QLD 4000', lat: -27.4698, lon: 153.0251 },
    work: { formattedAddress: 'Queen Street Mall, Brisbane QLD 4000', lat: -27.4705, lon: 153.0260 },
    cafe: { formattedAddress: 'Brew Cafe, Brisbane QLD', lat: -27.4700, lon: 153.0255 },
    arrivalTime: '08:00',
    coffeeEnabled: true,
    conditions: 'rain',
    transit: {
      trains: [{ minutes: 15, destination: 'Central', platform: 2, routeName: 'Ferny Grove', delay: 0 }],
      buses: [{ minutes: 3, routeNumber: '412', destination: 'City' }]
    },
    weather: { temp: 28, condition: 'Thunderstorms', icon: '[Storm]', umbrella: true }
  },
  
  // SA - Adelaide tram commute
  {
    name: 'Adelaide Tram to City',
    state: 'SA',
    home: { formattedAddress: 'Glenelg, SA 5045', lat: -34.9800, lon: 138.5147 },
    work: { formattedAddress: 'Rundle Mall, Adelaide SA 5000', lat: -34.9230, lon: 138.6010 },
    cafe: { formattedAddress: 'Cafe on the beach, Glenelg SA', lat: -34.9805, lon: 138.5150 },
    arrivalTime: '09:00',
    coffeeEnabled: true,
    conditions: 'normal',
    transit: {
      trams: [{ minutes: 5, routeNumber: 'Glenelg', destination: 'City' }, { minutes: 20, routeNumber: 'Glenelg', destination: 'City' }],
      trains: []
    },
    weather: { temp: 22, condition: 'Clear', icon: '[Sun]', umbrella: false }
  },
  
  // WA - Perth with disruption
  {
    name: 'Perth Train Disruption',
    state: 'WA',
    home: { formattedAddress: 'Fremantle WA 6160', lat: -32.0569, lon: 115.7439 },
    work: { formattedAddress: 'Perth CBD WA 6000', lat: -31.9505, lon: 115.8605 },
    cafe: null,
    arrivalTime: '08:30',
    coffeeEnabled: false,
    conditions: 'disruption',
    transit: {
      trains: [{ minutes: 0, destination: 'Perth', routeName: 'Fremantle', cancelled: true }],
      buses: [{ minutes: 8, routeNumber: '103', destination: 'Perth (Replacement)' }]
    },
    weather: { temp: 20, condition: 'Windy', icon: '[Wind]', umbrella: false },
    alert: 'Fremantle Line: Buses replace trains Fremantle to Perth due to track works'
  },
  
  // TAS - Hobart bus commute
  {
    name: 'Hobart Morning Bus',
    state: 'TAS',
    home: { formattedAddress: 'Sandy Bay TAS 7005', lat: -42.9000, lon: 147.3200 },
    work: { formattedAddress: 'Hobart CBD TAS 7000', lat: -42.8821, lon: 147.3272 },
    cafe: { formattedAddress: 'Salamanca Cafe, Hobart TAS', lat: -42.8870, lon: 147.3310 },
    arrivalTime: '09:00',
    coffeeEnabled: true,
    conditions: 'cold',
    transit: {
      buses: [{ minutes: 10, routeNumber: '401', destination: 'City' }, { minutes: 25, routeNumber: '401', destination: 'City' }]
    },
    weather: { temp: 8, condition: 'Cold & Foggy', icon: '[Fog]', umbrella: false }
  },
  
  // ACT - Canberra light rail
  {
    name: 'Canberra Light Rail',
    state: 'ACT',
    home: { formattedAddress: 'Gungahlin ACT 2912', lat: -35.1867, lon: 149.1327 },
    work: { formattedAddress: 'City Centre, Canberra ACT 2601', lat: -35.2809, lon: 149.1300 },
    cafe: null,
    arrivalTime: '08:45',
    coffeeEnabled: false,
    conditions: 'normal',
    transit: {
      lightrail: [{ minutes: 6, routeNumber: 'L1', destination: 'City' }],
      buses: [{ minutes: 12, routeNumber: 'R4', destination: 'City' }]
    },
    weather: { temp: 12, condition: 'Overcast', icon: '[Cloud]', umbrella: false }
  },
  
  // NT - Darwin bus in heat
  {
    name: 'Darwin Tropical Commute',
    state: 'NT',
    home: { formattedAddress: 'Nightcliff NT 0810', lat: -12.3833, lon: 130.8500 },
    work: { formattedAddress: 'Darwin CBD NT 0800', lat: -12.4634, lon: 130.8456 },
    cafe: null,
    arrivalTime: '08:00',
    coffeeEnabled: false,
    conditions: 'hot',
    transit: {
      buses: [{ minutes: 15, routeNumber: '4', destination: 'City' }]
    },
    weather: { temp: 34, condition: 'Hot & Humid', icon: '[Hot]', umbrella: false }
  }
];

// =============================================================================
// RENDER HELPER
// =============================================================================

async function renderScenario(scenario, index) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario ${index + 1}: ${scenario.name}`);
  console.log(`State: ${scenario.state} | Conditions: ${scenario.conditions}`);
  console.log('='.repeat(60));
  
  // Initialize CommuteCompute
  const preferences = {
    get: () => ({
      homeAddress: scenario.home,
      homeLocation: scenario.home,
      workAddress: scenario.work,
      workLocation: scenario.work,
      cafeLocation: scenario.cafe,
      coffeeAddress: scenario.cafe,
      arrivalTime: scenario.arrivalTime,
      coffeeEnabled: scenario.coffeeEnabled,
      preferMultiModal: true
    })
  };
  
  const commute = new CommuteCompute(preferences);
  await commute.initialize();
  
  console.log(`[OK] CommuteCompute initialized for ${commute.stateConfig.name}`);
  
  // Build journey legs based on transit data
  const journeyLegs = buildJourneyLegs(scenario);
  
  // Calculate leave time
  const totalMins = journeyLegs.reduce((sum, leg) => sum + (leg.minutes || 0), 0);
  const [arrH, arrM] = scenario.arrivalTime.split(':').map(Number);
  const leaveMins = (arrH * 60 + arrM) - totalMins;
  const leaveH = Math.floor(leaveMins / 60);
  const leaveM = leaveMins % 60;
  
  // Get local time for state
  const localTime = commute.getLocalTime();
  const nowMins = localTime.getHours() * 60 + localTime.getMinutes();
  const leaveInMins = Math.max(0, leaveMins - nowMins);
  
  // Build dashboard data
  const dashboardData = {
    // Header
    time: `${localTime.getHours()}:${localTime.getMinutes().toString().padStart(2, '0')}`,
    ampm: localTime.getHours() >= 12 ? 'PM' : 'AM',
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][localTime.getDay()],
    date: `${localTime.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][localTime.getMonth()]}`,
    
    // Weather
    temp: scenario.weather.temp,
    condition: scenario.weather.condition,
    umbrella: scenario.weather.umbrella,
    
    // Summary
    leave_in_minutes: leaveInMins,
    arrive_by: scenario.arrivalTime,
    total_minutes: totalMins,
    status_type: scenario.conditions === 'disruption' ? 'disruption' : 
                 scenario.conditions === 'delays' ? 'delay' : 'normal',
    delay_minutes: scenario.conditions === 'delays' ? 5 : 0,
    
    // Journey legs
    journey_legs: journeyLegs,
    
    // Footer
    destination: 'WORK',
    
    // Alerts
    alert_text: scenario.alert || ''
  };
  
  console.log(`Journey: ${journeyLegs.length} legs, ${totalMins} min total`);
  console.log(`Leave by: ${leaveH}:${leaveM.toString().padStart(2, '0')}`);
  console.log(`Weather: ${scenario.weather.temp} deg ${scenario.weather.condition}`);
  
  // Render dashboard
  try {
    const pngBuffer = renderFullDashboard(dashboardData);
    const filename = `dashboard-${scenario.state.toLowerCase()}-${scenario.conditions}.png`;
    const outputPath = path.join(process.cwd(), 'tests', 'output', filename);
    
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), 'tests', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`[OK] Dashboard rendered: ${filename} (${pngBuffer.length} bytes)`);
    
    return { success: true, filename, path: outputPath };
  } catch (error) {
    console.log(`[FAIL] Render failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function buildJourneyLegs(scenario) {
  const legs = [];
  let legNum = 1;
  
  // Walk to coffee or transit
  if (scenario.coffeeEnabled && scenario.cafe) {
    legs.push({
      type: 'walk',
      title: `Walk to ${scenario.cafe.formattedAddress.split(',')[0]}`,
      subtitle: '3 min walk',
      minutes: 3,
      state: 'normal'
    });
    
    // Coffee leg
    const coffeeState = scenario.conditions === 'delays' ? 'skip' : 'normal';
    legs.push({
      type: 'coffee',
      title: 'COFFEE',
      subtitle: coffeeState === 'skip' ? 'SKIP -- Running late' : '[Coffee] TIME FOR COFFEE',
      minutes: 4,
      state: coffeeState
    });
    
    // Walk to transit
    legs.push({
      type: 'walk',
      title: 'Walk to Station',
      subtitle: '2 min walk',
      minutes: 2,
      state: 'normal'
    });
  } else {
    legs.push({
      type: 'walk',
      title: 'Walk to Station',
      subtitle: '5 min walk',
      minutes: 5,
      state: 'normal'
    });
  }
  
  // Transit legs
  const transit = scenario.transit;
  
  // Trams
  if (transit.trams?.length > 0) {
    const tram = transit.trams[0];
    legs.push({
      type: 'tram',
      title: `Tram ${tram.routeNumber}`,
      subtitle: `${tram.routeNumber} → ${tram.destination}`,
      minutes: tram.minutes,
      state: 'normal'
    });
  }
  
  // Light rail
  if (transit.lightrail?.length > 0) {
    const lr = transit.lightrail[0];
    legs.push({
      type: 'tram',  // Use tram icon for light rail
      title: `Light Rail ${lr.routeNumber}`,
      subtitle: `${lr.routeNumber} → ${lr.destination}`,
      minutes: lr.minutes,
      state: 'normal'
    });
  }
  
  // Trains
  if (transit.trains?.length > 0) {
    const train = transit.trains[0];
    const state = train.cancelled ? 'cancelled' : 
                  train.isDelayed ? 'delayed' : 'normal';
    legs.push({
      type: 'train',
      title: train.routeName || 'Train',
      subtitle: `${train.routeName || 'Train'} → ${train.destination}`,
      minutes: train.minutes || 15,
      platform: train.platform,
      state: state
    });
  }
  
  // Buses
  if (transit.buses?.length > 0 && (!transit.trains?.length || transit.trains[0]?.cancelled)) {
    const bus = transit.buses[0];
    legs.push({
      type: 'bus',
      title: `Bus ${bus.routeNumber}`,
      subtitle: `Route ${bus.routeNumber} → ${bus.destination}`,
      minutes: bus.minutes,
      state: 'normal'
    });
  }
  
  // Final walk
  legs.push({
    type: 'walk',
    title: 'Walk to Work',
    subtitle: '5 min walk',
    minutes: 5,
    state: 'normal'
  });
  
  return legs;
}

// =============================================================================
// MAIN
// =============================================================================

async function runAllScenarios() {
  const results = [];
  
  for (let i = 0; i < scenarios.length; i++) {
    const result = await renderScenario(scenarios[i], i);
    results.push({ scenario: scenarios[i].name, ...result });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach((r, i) => {
    const status = r.success ? '[OK]' : '[FAIL]';
    console.log(`${status} ${i + 1}. ${r.scenario}`);
    if (r.success) {
      console.log(`      ${r.filename}`);
    }
  });
  
  console.log('\nAustralia-wide testing complete!');
  console.log(`Output saved to: tests/output/`);
}

runAllScenarios().catch(console.error);
