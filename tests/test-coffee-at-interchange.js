/**
 * Test Coffee At Interchange Pattern
 * Home → Tram → Coffee (at South Yarra interchange) → Train → Work
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import SmartRouteRecommender, { RoutePatterns } from '../src/services/smart-route-recommender.js';

console.log('Testing Coffee At Interchange Pattern\n');
console.log('Pattern: Home -> [Tram] Tram -> [Coffee] at interchange -> [Train] Train -> Work\n');

// Test locations - cafe is near South Yarra Station (interchange)
const testLocations = {
  home: { lat: -37.8450, lon: 144.9900, name: 'Example St, Suburb' },
  cafe: { lat: -37.8386, lon: 144.9928, name: 'Cafe at South Yarra Station' },  // Near the station
  work: { lat: -37.8136, lon: 144.9645, name: '123 Sample St' }
};

// Mock stops - Tram stop near home, train station is the interchange
const testStops = [
  // Tram stops near home
  { id: 10, name: 'Chapel St/Toorak Rd', route_type: 1, route_number: '78', lat: -37.8445, lon: 144.9905 },
  // South Yarra Station - interchange (both tram and train)
  { id: 1, name: 'South Yarra Station', route_type: 0, route_number: 'Sandringham', lat: -37.8384, lon: 144.9931 },
  { id: 11, name: 'South Yarra Station/Tram', route_type: 1, route_number: '78', lat: -37.8384, lon: 144.9931 },
  // Parliament near work
  { id: 2, name: 'Parliament', route_type: 0, route_number: 'Sandringham', lat: -37.8111, lon: 144.9727 },
  // Collins St tram near work
  { id: 12, name: 'Collins St/Exhibition St', route_type: 1, route_number: '11', lat: -37.8145, lon: 144.9688 }
];

// Preferences - coffee at interchange
const preferences = {
  coffeeEnabled: true,
  cafeDuration: 5,
  coffeePosition: 'interchange',  // Explicitly prefer coffee at interchange
  preferTrain: true,
  preferMultiModal: true,
  minimizeWalking: true,
  modePriority: { tram: 1, train: 1, bus: 3, vline: 2 }
};

// Create recommender
const recommender = new SmartRouteRecommender();

// Test 1: Location Analysis
console.log('Test 1: Location Analysis');
console.log('-'.repeat(50));
const analysis = recommender.analyzeLocations(testLocations, testStops);
console.log('[OK] Distances:');
console.log(`   Home → Cafe: ${Math.round(analysis.distances.homeToCafe)}m`);
console.log(`   Home → Nearest Stop: ${Math.round(analysis.distances.homeToNearestStop)}m`);
console.log(`   Cafe on way to transit: ${analysis.cafeOnWayToTransit}`);
console.log(`   Cafe near interchange: ${!!analysis.cafeNearInterchange}`);
if (analysis.cafeNearInterchange) {
  console.log(`     Station: ${analysis.cafeNearInterchange.station.name}`);
  console.log(`     Distance: ${Math.round(analysis.cafeNearInterchange.distance)}m`);
  console.log(`     Walking: ${analysis.cafeNearInterchange.walkingMinutes} min`);
}
console.log(`   Interchange stations found: ${analysis.interchangeStations?.length || 0}`);
console.log();

// Test 2: Pattern Detection
console.log('Test 2: Pattern Detection');
console.log('-'.repeat(50));
const pattern = recommender.detectPattern(analysis, preferences);
console.log(`[OK] Detected pattern: ${pattern.type}`);
console.log(`   Reason: ${pattern.reason}`);
console.log(`   Confidence: ${Math.round(pattern.confidence * 100)}%`);
console.log(`   Expected: ${RoutePatterns.COFFEE_AT_INTERCHANGE}`);
console.log(`   Match: ${pattern.type === RoutePatterns.COFFEE_AT_INTERCHANGE ? '[OK]' : '[FAIL]'}`);
console.log();

// Test 3: Full Recommendation
console.log('Test 3: Full Recommendation');
console.log('-'.repeat(50));
const result = recommender.analyzeAndRecommend(testLocations, testStops, preferences);

if (result.recommended) {
  console.log(`[OK] Recommended: ${result.recommended.name}`);
  console.log(`   Type: ${result.recommended.type}`);
  console.log(`   Total time: ${result.recommended.totalMinutes} min`);
  console.log(`   Walking: ${Math.round(result.recommended.totalWalking)}m`);
  
  if (result.recommended.coffeeSegments) {
    const cs = result.recommended.coffeeSegments;
    console.log(`   Coffee position: ${cs.position}`);
    if (cs.position === 'at-interchange') {
      console.log(`   Interchange: ${cs.interchangeStation}`);
      console.log(`   Walk to cafe: ${cs.walkToCafe} min`);
      console.log(`   Coffee time: ${cs.coffeeTime} min`);
      console.log(`   Walk back: ${cs.walkToStation} min`);
    }
  }
} else {
  console.log('[!] No recommendation generated');
}
console.log();

// Test 4: Route Alternatives
console.log('Test 4: Route Alternatives');
console.log('-'.repeat(50));
console.log(`Found ${result.routes?.length || 0} alternatives:`);
result.routes?.slice(0, 5).forEach((route, i) => {
  console.log(`   ${i + 1}. ${route.name}`);
  console.log(`      Type: ${route.type}, Score: ${route.score?.toFixed(1) || 'N/A'}`);
  if (route.coffeeSegments) {
    console.log(`      Coffee: ${route.coffeeSegments.position}`);
  }
});
console.log();

// Test 5: Reasoning
console.log('Test 5: Recommendation Reasoning');
console.log('-'.repeat(50));
console.log(result.reasoning);
console.log();

// Test 6: Compare with coffee-before pattern
console.log('Test 6: Compare with Coffee-Before Pattern');
console.log('-'.repeat(50));

const beforePrefs = { ...preferences, coffeePosition: 'before' };
const beforeResult = recommender.analyzeAndRecommend(testLocations, testStops, beforePrefs);
console.log(`Coffee BEFORE pattern:`);
console.log(`   Pattern: ${beforeResult.pattern?.type || 'N/A'}`);
console.log(`   Recommended: ${beforeResult.recommended?.name || 'N/A'}`);
console.log();

console.log('[OK] All tests completed!');
console.log('=======================================');
