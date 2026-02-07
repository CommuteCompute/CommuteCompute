/**
 * Test Smart Route Recommender
 * Verifies route auto-discovery and recommendation logic
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import SmartRouteRecommender, { RoutePatterns, ModePreference } from '../src/services/smart-route-recommender.js';

console.log('Testing Smart Route Recommender\n');

// Test data - sample route simulation
// Layout: Home → Cafe → South Yarra Station should form a nearly straight line
// Home is at Example St (-37.8425), cafe is midway (-37.8405), station is at -37.8384
const testLocations = {
  home: { lat: -37.8428, lon: 144.9920, name: '123 Example St, Suburb' },
  cafe: { lat: -37.8406, lon: 144.9920, name: 'Sample Cafe' },  // Directly between home and station
  work: { lat: -37.8136, lon: 144.9645, name: '123 Sample St' }
};

// Mock stops - Multi-modal route: Home → Cafe → Tram → Train → Work
// Tram stop is near home/cafe, train station is at interchange point
const testStops = [
  // Train stations - Parliament is near work, South Yarra is an interchange
  { id: 1, name: 'South Yarra', route_type: 0, route_number: 'Sandringham', lat: -37.8384, lon: 144.9931 },
  { id: 2, name: 'Parliament', route_type: 0, route_number: 'Sandringham', lat: -37.8111, lon: 144.9727 },
  { id: 3, name: 'Flinders Street', route_type: 0, route_number: 'Sandringham', lat: -37.8183, lon: 144.9671 },
  // Tram stops - Route 8 runs near home, connects to South Yarra Station
  { id: 10, name: 'Toorak Rd/Chapel St', route_type: 1, route_number: '8', lat: -37.8400, lon: 144.9920 },  // Near cafe
  { id: 11, name: 'South Yarra Station/Tram', route_type: 1, route_number: '8', lat: -37.8384, lon: 144.9931 },  // At train station
  { id: 12, name: 'Collins St/Exhibition St', route_type: 1, route_number: '11', lat: -37.8145, lon: 144.9688 },  // Near work
  // Bus stops - further away
  { id: 20, name: 'South Yarra Station/Toorak Rd', route_type: 2, route_number: '246', lat: -37.8410, lon: 145.0000 }
];

// Test preferences - sample: Home → Coffee → Tram → Train → Work
const preferences = {
  coffeeEnabled: true,
  cafeDuration: 5,
  preferTrain: true,
  preferMultiModal: true,  // Enable multi-modal pattern detection
  minimizeWalking: true,
  modePriority: { tram: 1, train: 1, bus: 3, vline: 2 }  // Tram and train equally preferred
};

// Create recommender
const recommender = new SmartRouteRecommender();

// Test 1: Analyze locations
console.log('Test 1: Location Analysis');
console.log('-'.repeat(40));
const analysis = recommender.analyzeLocations(testLocations, testStops);
console.log('[OK] Distances:');
console.log(`   Home → Cafe: ${Math.round(analysis.distances.homeToCafe)}m`);
console.log(`   Home → Nearest Stop: ${Math.round(analysis.distances.homeToNearestStop)}m`);
console.log(`   Cafe → Nearest Stop: ${Math.round(analysis.distances.cafeToNearestStop)}m`);
console.log(`   Cafe on way to transit: ${analysis.cafeOnWayToTransit}`);
console.log(`   Has train near home: ${analysis.hasTrainNearHome}`);
console.log(`   Has train near work: ${analysis.hasTrainNearWork}`);

// Debug cafe-on-way calculation
const nearestStop = analysis.stops.home[0];
const homeToCafe = analysis.distances.homeToCafe;
const cafeToStation = recommender.distance(testLocations.cafe, nearestStop);
const homeToStation = recommender.distance(testLocations.home, nearestStop);
const detour = (homeToCafe + cafeToStation) - homeToStation;
const detourRatio = detour / homeToStation;
console.log(`   DEBUG: homeToStation=${Math.round(homeToStation)}m cafeToStation=${Math.round(cafeToStation)}m`);
console.log(`   DEBUG: detour=${Math.round(detour)}m ratio=${(detourRatio*100).toFixed(1)}%`);
console.log(`   DEBUG: cafeCloserToHome=${homeToCafe < homeToStation} cafeCloserThanStation=${homeToCafe < cafeToStation * 2}`);
console.log();

// Test 2: Pattern detection
console.log('Test 2: Pattern Detection');
console.log('-'.repeat(40));
const pattern = recommender.detectPattern(analysis, preferences);
console.log(`[OK] Detected pattern: ${pattern.type}`);
console.log(`   Reason: ${pattern.reason}`);
console.log(`   Confidence: ${Math.round(pattern.confidence * 100)}%`);
console.log();

// Test 3: Full recommendation
console.log('Test 3: Full Recommendation');
console.log('-'.repeat(40));
const result = recommender.analyzeAndRecommend(testLocations, testStops, preferences);
console.log(`[OK] Recommended: ${result.recommended?.name || 'None'}`);
console.log(`   Total time: ${result.recommended?.totalMinutes || 0} minutes`);
console.log(`   Walking: ${Math.round(result.recommended?.totalWalking || 0)}m`);
console.log(`   Has coffee segments: ${!!result.recommended?.coffeeSegments}`);
if (result.recommended?.coffeeSegments) {
  const cs = result.recommended.coffeeSegments;
  console.log(`   Coffee position: ${cs.position}`);
  console.log(`   Walk to cafe: ${cs.walkToCafe} min`);
  console.log(`   Coffee time: ${cs.coffeeTime} min`);
  console.log(`   Walk to station: ${cs.walkToStation} min`);
}
console.log();

// Test 4: Alternatives
console.log('Test 4: Route Alternatives');
console.log('-'.repeat(40));
console.log(`[OK] Found ${result.routes.length} alternatives:`);
result.routes.slice(0, 5).forEach((route, i) => {
  console.log(`   ${i + 1}. ${route.name} (score: ${route.score?.toFixed(1) || 'N/A'})`);
  console.log(`      Type: ${route.type}, Modes: ${route.modes.length}`);
});
console.log();

// Test 5: Reasoning
console.log('Test 5: Recommendation Reasoning');
console.log('-'.repeat(40));
console.log(result.reasoning);
console.log();

// Test 6: Preference variations
console.log('Test 6: Preference Variations');
console.log('-'.repeat(40));

// No coffee preference
const noCoffeeResult = recommender.analyzeAndRecommend(testLocations, testStops, {
  ...preferences,
  coffeeEnabled: false
});
console.log(`[OK] Without coffee: ${noCoffeeResult.pattern.type}`);

// Tram preferred
const tramResult = recommender.analyzeAndRecommend(testLocations, testStops, {
  ...preferences,
  preferTrain: false,
  modePriority: ModePreference.TRAM_PREFERRED
});
console.log(`[OK] Tram preferred: ${tramResult.routes[0]?.name || 'N/A'}`);

console.log();
console.log('[OK] All tests completed!');
console.log('=======================================');
