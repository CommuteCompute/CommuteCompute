/**
 * Test Smart Journey Integration
 * Verifies the connection between SmartRouteRecommender, CoffeeDecision, and live updates
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import SmartJourneyIntegration from '../src/services/smart-journey-integration.js';

console.log('Testing Smart Journey Integration\n');

// Mock locations - sample commute route
const mockLocations = {
  home: { lat: -37.8428, lon: 144.9920, name: '123 Example St, Suburb' },
  cafe: { lat: -37.8406, lon: 144.9920, name: 'Sample Cafe' },
  work: { lat: -37.8136, lon: 144.9645, name: '123 Sample St' }
};

// Mock stops for multi-modal route
const mockStops = [
  { id: 1, name: 'South Yarra', route_type: 0, route_number: 'Sandringham', lat: -37.8384, lon: 144.9931 },
  { id: 2, name: 'Parliament', route_type: 0, route_number: 'Sandringham', lat: -37.8111, lon: 144.9727 },
  { id: 10, name: 'Toorak Rd/Chapel St', route_type: 1, route_number: '8', lat: -37.8400, lon: 144.9920 },
  { id: 11, name: 'South Yarra Station/Tram', route_type: 1, route_number: '8', lat: -37.8384, lon: 144.9931 },
  { id: 12, name: 'Collins St/Exhibition St', route_type: 1, route_number: '11', lat: -37.8145, lon: 144.9688 }
];

// Mock live transit data
const mockLiveTransit = {
  trains: [
    { minutes: 8, routeNumber: 'Sandringham', destination: 'Parliament', platform: 1, delay: 0 },
    { minutes: 23, routeNumber: 'Sandringham', destination: 'Parliament', platform: 1, delay: 2 }
  ],
  trams: [
    { minutes: 3, routeNumber: '8', destination: 'South Yarra', delay: 0 },
    { minutes: 12, routeNumber: '8', destination: 'South Yarra', delay: 1 }
  ],
  buses: []
};

// Mock live transit with delays
const mockLiveTransitDelayed = {
  trains: [
    { minutes: 15, routeNumber: 'Sandringham', destination: 'Parliament', platform: 1, delay: 5 }
  ],
  trams: [
    { minutes: 6, routeNumber: '8', destination: 'South Yarra', delay: 3 }
  ],
  buses: []
};

// Mock preferences
const mockPreferences = {
  get: () => ({
    coffeeEnabled: true,
    cafeDuration: 5,
    preferTrain: true,
    preferMultiModal: true,
    minimizeWalking: true,
    arrivalTime: '09:00',
    walkToWork: 5,
    homeToCafe: 4,
    makeCoffee: 5,
    cafeToTransit: 1,
    modePriority: { tram: 1, train: 1, bus: 3, vline: 2 }
  })
};

// Create integration
const integration = new SmartJourneyIntegration(mockPreferences);
integration.initialize(mockPreferences);

async function runTests() {
  // Test 1: Basic journey decision
  console.log('Test 1: Smart Journey Decision (normal conditions)');
  console.log('-'.repeat(50));
  
  const decision1 = await integration.getSmartJourneyDecision({
    locations: mockLocations,
    allStops: mockStops,
    liveTransit: mockLiveTransit,
    alertText: ''
  });
  
  console.log('[OK] Success:', decision1.success);
  console.log('   Route:', decision1.route?.name || 'None');
  console.log('   Pattern:', decision1.recommendation?.pattern || 'N/A');
  console.log('   Coffee decision:', decision1.coffee?.decision);
  console.log('   Coffee subtext:', decision1.coffee?.subtext);
  console.log('   Can get coffee:', decision1.coffee?.canGet);
  console.log('   Live updates:', decision1.liveUpdates?.length || 0);
  console.log();

  // Test 2: With delays
  console.log('Test 2: Journey Decision with Delays');
  console.log('-'.repeat(50));
  
  integration.clearCache();
  const decision2 = await integration.getSmartJourneyDecision({
    locations: mockLocations,
    allStops: mockStops,
    liveTransit: mockLiveTransitDelayed,
    alertText: ''
  });
  
  console.log('[OK] Success:', decision2.success);
  console.log('   Route has delays:', decision2.route?.hasDelays || false);
  if (decision2.route?.liveDelays?.length > 0) {
    decision2.route.liveDelays.forEach(d => {
      console.log(`   [!] ${d.mode} delayed +${d.delay}m`);
    });
  }
  console.log('   Adjusted total time:', decision2.route?.totalMinutes, 'min');
  console.log('   Coffee decision:', decision2.coffee?.decision);
  console.log();

  // Test 3: With service alert
  console.log('Test 3: Journey Decision with Service Alert');
  console.log('-'.repeat(50));
  
  integration.clearCache();
  const decision3 = await integration.getSmartJourneyDecision({
    locations: mockLocations,
    allStops: mockStops,
    liveTransit: mockLiveTransit,
    alertText: 'Major Delays on Sandringham line due to signal fault'
  });
  
  console.log('[OK] Success:', decision3.success);
  console.log('   Coffee decision:', decision3.coffee?.decision);
  console.log('   Subtext:', decision3.coffee?.subtext);
  console.log('   Urgent:', decision3.coffee?.urgent);
  console.log();

  // Test 4: Live updates extraction
  console.log('Test 4: Live Updates');
  console.log('-'.repeat(50));
  
  if (decision1.liveUpdates?.length > 0) {
    decision1.liveUpdates.forEach(update => {
      console.log(`   ${update.icon} ${update.text}`);
      if (update.delay > 0) console.log(`      Delay: +${update.delay}m`);
    });
  }
  console.log();

  // Test 5: Coffee timings from route
  console.log('Test 5: Coffee Timings Synced from Route');
  console.log('-'.repeat(50));
  
  if (decision1.route?.coffeeSegments) {
    const cs = decision1.route.coffeeSegments;
    console.log('   Walk to cafe:', cs.walkToCafe, 'min');
    console.log('   Coffee time:', cs.coffeeTime, 'min');
    console.log('   Walk to station:', cs.walkToStation, 'min');
    console.log('   Total coffee segment:', cs.totalCoffeeTime, 'min');
  }
  console.log();

  console.log('[OK] All integration tests completed!');
  console.log('=======================================');
}

runTests().catch(console.error);
