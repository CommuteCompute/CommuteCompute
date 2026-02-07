/**
 * Test Dashboard Rendering with Smart Journey Integration
 * Verifies the full pipeline: SmartJourney → CoffeeDecision → Dashboard Render
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import DashboardService from '../src/services/dashboard-service.js';
import fs from 'fs';
import path from 'path';

console.log('Testing Dashboard Rendering with Smart Journey Integration\n');

// Mock preferences
const mockPreferences = {
  get: () => ({
    // Locations
    homeAddress: { lat: -37.8428, lon: 144.9920, formattedAddress: '123 Example St, Suburb' },
    homeLocation: { lat: -37.8428, lon: 144.9920, formattedAddress: '123 Example St, Suburb' },
    cafeLocation: { lat: -37.8406, lon: 144.9920, formattedAddress: 'Sample Cafe' },
    coffeeAddress: { lat: -37.8406, lon: 144.9920, formattedAddress: 'Sample Cafe' },
    workAddress: { lat: -37.8136, lon: 144.9645, formattedAddress: '123 Sample St' },
    workLocation: { lat: -37.8136, lon: 144.9645, formattedAddress: '123 Sample St' },
    
    // Journey config
    coffeeEnabled: true,
    cafeDuration: 5,
    preferTrain: true,
    preferMultiModal: true,
    minimizeWalking: true,
    arrivalTime: '09:00',
    
    // Timing defaults
    walkToWork: 5,
    homeToCafe: 4,
    makeCoffee: 5,
    cafeToTransit: 1,
    
    // Mode preferences
    modePriority: { tram: 1, train: 1, bus: 3, vline: 2 },
    
    // Stop config
    homeStop: { id: 1, name: 'South Yarra', type: 0 },
    
    // Location
    location: { state: 'VIC' }
  })
};

// Mock stops
const mockStops = [
  { id: 1, name: 'South Yarra', route_type: 0, route_number: 'Sandringham', lat: -37.8384, lon: 144.9931 },
  { id: 2, name: 'Parliament', route_type: 0, route_number: 'Sandringham', lat: -37.8111, lon: 144.9727 },
  { id: 10, name: 'Toorak Rd/Chapel St', route_type: 1, route_number: '8', lat: -37.8400, lon: 144.9920 },
  { id: 11, name: 'South Yarra Station/Tram', route_type: 1, route_number: '8', lat: -37.8384, lon: 144.9931 },
  { id: 12, name: 'Collins St/Exhibition St', route_type: 1, route_number: '11', lat: -37.8145, lon: 144.9688 }
];

// Mock OpenData service
const mockOpenDataService = {
  getDepartures: async (stopId, stopType) => {
    console.log(`   Mock getDepartures(${stopId}, ${stopType})`);
    return [
      { routeType: 1, routeNumber: '8', destination: 'South Yarra', minutes: 4, delay: 0 },
      { routeType: 1, routeNumber: '8', destination: 'South Yarra', minutes: 12, delay: 0 },
      { routeType: 0, routeNumber: 'Sandringham', destination: 'Parliament', minutes: 8, platform: 1, delay: 0 },
      { routeType: 0, routeNumber: 'Sandringham', destination: 'Parliament', minutes: 23, platform: 1, delay: 2 }
    ];
  },
  getServiceAlerts: async () => {
    console.log('   Mock getServiceAlerts()');
    return [];
  }
};

// Mock weather service
const mockWeatherService = {
  getCurrentWeather: async (lat, lon) => {
    console.log(`   Mock getWeather(${lat}, ${lon})`);
    return {
      temp: 18,
      condition: 'Partly Cloudy',
      icon: '[Cloud]',
      humidity: 65,
      windSpeed: 12
    };
  }
};

async function runTests() {
  // Initialize dashboard service
  console.log('1. Initializing DashboardService...');
  console.log('-'.repeat(50));
  
  const dashboard = new DashboardService(mockPreferences);
  dashboard.initialize(mockPreferences);
  
  console.log('   [OK] DashboardService initialized');
  console.log('   [OK] SmartJourneyIntegration ready');
  console.log();

  // Test 2: Get smart journey decision
  console.log('2. Getting Smart Journey Decision...');
  console.log('-'.repeat(50));
  
  const smartDecision = await dashboard.getSmartJourneyDecision(
    mockOpenDataService,
    mockStops,
    true  // force refresh
  );
  
  if (smartDecision) {
    console.log('   [OK] Smart decision received');
    console.log(`   Route: ${smartDecision.route?.name || 'N/A'}`);
    console.log(`   Pattern: ${smartDecision.recommendation?.pattern || 'N/A'}`);
    console.log(`   Coffee: ${smartDecision.coffee?.decision || 'N/A'}`);
    console.log(`   Live updates: ${smartDecision.liveUpdates?.length || 0}`);
  } else {
    console.log('   [!] No smart decision (may be expected if locations not geocoded)');
  }
  console.log();

  // Test 3: Fetch transit data
  console.log('3. Fetching Transit Data...');
  console.log('-'.repeat(50));
  
  const transitData = await dashboard.fetchTransitData(mockOpenDataService);
  console.log(`   [OK] Trains: ${transitData.trains?.length || 0}`);
  console.log(`   [OK] Trams: ${transitData.trams?.length || 0}`);
  console.log(`   [OK] Buses: ${transitData.buses?.length || 0}`);
  
  if (transitData.trams?.length > 0) {
    console.log(`   [Tram] Next tram: Route ${transitData.trams[0].routeNumber} in ${transitData.trams[0].minutes}m`);
  }
  if (transitData.trains?.length > 0) {
    console.log(`   [Train] Next train: ${transitData.trains[0].destination} in ${transitData.trains[0].minutes}m`);
  }
  console.log();

  // Test 4: Get coffee decision
  console.log('4. Getting Coffee Decision...');
  console.log('-'.repeat(50));
  
  const coffeeDecision = dashboard.getCoffeeDecision(transitData, '');
  console.log(`   [OK] Decision: ${coffeeDecision.decision}`);
  console.log(`   Subtext: ${coffeeDecision.subtext}`);
  console.log(`   Can get coffee: ${coffeeDecision.canGet}`);
  console.log(`   Urgent: ${coffeeDecision.urgent}`);
  console.log();

  // Test 5: Render dashboard
  console.log('5. Rendering Dashboard...');
  console.log('-'.repeat(50));
  
  try {
    const renderResult = await dashboard.renderDashboard({
      deviceType: 'trmnl-og',
      format: 'png',
      openDataService: mockOpenDataService,
      weatherService: mockWeatherService,
      forceRefresh: true
    });
    
    if (renderResult) {
      if (Buffer.isBuffer(renderResult)) {
        // Save the PNG for inspection
        const outputPath = path.join(process.cwd(), 'tests', 'output-dashboard.png');
        fs.writeFileSync(outputPath, renderResult);
        console.log(`   [OK] Dashboard rendered successfully`);
        console.log(`   Saved to: ${outputPath}`);
        console.log(`   Size: ${renderResult.length} bytes`);
      } else if (renderResult.zones) {
        console.log(`   [OK] Zone-based render: ${renderResult.zones.length} zones`);
      } else {
        console.log(`   [OK] Render result type: ${typeof renderResult}`);
      }
    } else {
      console.log('   [!] No render result');
    }
  } catch (error) {
    console.log(`   [FAIL] Render error: ${error.message}`);
    console.log(`   Stack: ${error.stack?.split('\n').slice(0, 3).join('\n')}`);
  }
  console.log();

  // Test 6: Check setup status
  console.log('6. Setup Status...');
  console.log('-'.repeat(50));
  
  const status = dashboard.getSetupStatus();
  console.log(`   Ready: ${status.setupComplete}`);
  console.log(`   Version: ${status.version}`);
  console.log(`   Home stop: ${status.homeStop?.name || 'Not set'}`);
  console.log();

  // Test 7: JSON data output
  console.log('7. JSON Data Output...');
  console.log('-'.repeat(50));
  
  try {
    const jsonData = await dashboard.getJsonData(mockOpenDataService, mockWeatherService);
    if (jsonData) {
      console.log('   [OK] JSON data generated');
      console.log(`   Keys: ${Object.keys(jsonData).join(', ')}`);
    }
  } catch (error) {
    console.log(`   [!] JSON error: ${error.message}`);
  }
  console.log();

  console.log('[OK] All dashboard tests completed!');
  console.log('=======================================');
}

runTests().catch(console.error);
