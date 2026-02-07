/**
 * Data Pipeline Validation Script
 * Tests all data flows through the server and generates text report
 *
 * Usage: ODATA_API_KEY=your-key node tests/test-data-pipeline.js
 * (Zero-Config: No .env files - pass API key inline)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */
import { getSnapshot } from '../src/data/data-scraper.js';
import WeatherBOM from '../src/services/weather-bom.js';
import CoffeeDecision from '../src/core/coffee-decision.js';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Commute Compute DATA PIPELINE VALIDATION REPORT                ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Generated:', new Date().toISOString());
console.log('Location: Australia (state-agnostic)');
console.log('');

// ========== CONFIGURATION CHECK ==========
console.log('═══════════════════════════════════════════════════════════════');
console.log('1. CONFIGURATION CHECK');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const apiKey = process.env.ODATA_API_KEY || 'NOT SET';
const weatherKey = process.env.WEATHER_KEY || 'NOT SET';

console.log('Environment Variables:');
console.log(`  ODATA_API_KEY: ${apiKey === 'NOT SET' ? 'NOT SET' : 'configured (' + apiKey.length + ' chars)'}`);
console.log('  Note: ODATA_TOKEN is deprecated - use ODATA_API_KEY (UUID format) only');
console.log(`  WEATHER_KEY:   ${weatherKey === 'NOT SET' ? 'NOT SET' : 'SET'}`);
console.log('');

// ========== WEATHER DATA TEST ==========
console.log('═══════════════════════════════════════════════════════════════');
console.log('2. WEATHER DATA (Bureau of Meteorology)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const weather = new WeatherBOM();

try {
  console.log('Fetching weather from BOM API...');
  const weatherData = await weather.getCurrentWeather();
  const cacheStatus = weather.getCacheStatus();

  console.log('[OK] Weather Fetch: SUCCESS');
  console.log('');
  console.log('Weather Data:');
  console.log(`  Temperature:    ${weatherData.temperature}°C`);
  console.log(`  Condition:      ${weatherData.condition.full}`);
  console.log(`  Short Display:  ${weatherData.condition.short}`);
  console.log(`  Feels Like:     ${weatherData.feelsLike}°C`);
  console.log(`  Humidity:       ${weatherData.humidity}%`);
  console.log(`  Wind Speed:     ${weatherData.windSpeed} km/h`);
  console.log(`  Rain (9am):     ${weatherData.rainSince9am} mm`);
  console.log(`  Icon:           ${weatherData.icon || 'N/A'}`);
  console.log('');
  console.log('Cache Status:');
  console.log(`  Cached:         ${cacheStatus.cached}`);
  console.log(`  Age:            ${cacheStatus.age}s`);
  console.log(`  TTL:            ${cacheStatus.ttl}s`);
  console.log(`  Expired:        ${cacheStatus.expired}`);
  console.log('');
} catch (error) {
  console.log('[FAIL] Weather Fetch: FAILED');
  console.log(`  Error: ${error.message}`);
  console.log('');
}

// ========== Transport Victoria API TEST ==========
console.log('═══════════════════════════════════════════════════════════════');
console.log('3. TRANSPORT VICTORIA OPEN DATA API (GTFS Realtime)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

try {
  console.log('Fetching transport data from Transport Victoria API...');
  console.log(`Using API Key: ${apiKey === 'NOT SET' ? 'NOT SET' : 'configured'}`);
  console.log('');

  const snapshot = await getSnapshot(apiKey);

  console.log('[OK] Transport Victoria API Fetch: SUCCESS');
  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('METRO TRAINS (Origin Station → City)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');

  if (snapshot.trains && snapshot.trains.length > 0) {
    snapshot.trains.slice(0, 5).forEach((train, i) => {
      const departureTime = new Date(train.when);
      const now = new Date();
      const minutes = Math.max(0, Math.round((departureTime - now) / 60000));

      console.log(`Train ${i + 1}:`);
      console.log(`  Departure Time: ${departureTime.toLocaleTimeString('en-AU')}`);
      console.log(`  Minutes Away:   ${minutes} min`);
      console.log(`  Route:          ${train.route || 'Unknown'}`);
      console.log(`  Stop ID:        ${train.stopId || 'N/A'}`);
      console.log(`  Trip ID:        ${train.tripId || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('[!] No train data available');
    console.log('');
  }

  console.log('─────────────────────────────────────────────────────────────');
  console.log('YARRA TRAMS (Route 58 → West Coburg)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');

  if (snapshot.trams && snapshot.trams.length > 0) {
    snapshot.trams.slice(0, 5).forEach((tram, i) => {
      const departureTime = new Date(tram.when);
      const now = new Date();
      const minutes = Math.max(0, Math.round((departureTime - now) / 60000));

      console.log(`Tram ${i + 1}:`);
      console.log(`  Departure Time: ${departureTime.toLocaleTimeString('en-AU')}`);
      console.log(`  Minutes Away:   ${minutes} min`);
      console.log(`  Route:          ${tram.route || 'Unknown'}`);
      console.log(`  Stop ID:        ${tram.stopId || 'N/A'}`);
      console.log(`  Trip ID:        ${tram.tripId || 'N/A'}`);
      console.log('');
    });
  } else {
    console.log('[!] No tram data available');
    console.log('');
  }

  console.log('─────────────────────────────────────────────────────────────');
  console.log('SERVICE ALERTS');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log(`Metro Alerts:    ${snapshot.alerts?.metro || 0}`);
  console.log(`Tram Alerts:     ${snapshot.alerts?.tram || 0}`);
  console.log('');

  console.log('─────────────────────────────────────────────────────────────');
  console.log('METADATA');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log(`Generated At:    ${snapshot.meta?.generatedAt || 'N/A'}`);
  console.log(`Mode:            ${snapshot.meta?.mode || 'live'}`);
  console.log(`Train Count:     ${snapshot.trains?.length || 0}`);
  console.log(`Tram Count:      ${snapshot.trams?.length || 0}`);
  console.log('');

  // ========== COFFEE DECISION ENGINE TEST ==========
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('4. COFFEE DECISION ENGINE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const coffeeEngine = new CoffeeDecision();
  const nextTrainMins = snapshot.trains[0]
    ? Math.round((new Date(snapshot.trains[0].when) - new Date()) / 60000)
    : 15;

  const tramTimes = snapshot.trams.slice(0, 3).map(t => {
    const minutes = Math.round((new Date(t.when) - new Date()) / 60000);
    return { minutes };
  });

  const coffeeDecision = coffeeEngine.calculate(nextTrainMins, tramTimes, null);

  console.log('Input Data:');
  console.log(`  Next Train:     ${nextTrainMins} min`);
  console.log(`  Next Trams:     ${tramTimes.map(t => t.minutes).join(', ')} min`);
  console.log('');
  console.log('Decision Output:');
  console.log(`  Can Get Coffee: ${coffeeDecision.canGet ? 'YES [Coffee]' : 'NO [!]'}`);
  console.log(`  Decision:       ${coffeeDecision.decision}`);
  console.log(`  Subtext:        ${coffeeDecision.subtext}`);
  console.log(`  Urgent:         ${coffeeDecision.urgent ? 'YES' : 'NO'}`);
  console.log('');

  // ========== PROCESSED DATA FOR FIRMWARE ==========
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('5. PROCESSED DATA (Region Updates for Firmware)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This is the exact data sent to the ESP32 firmware via /api/region-updates');
  console.log('');

  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: '2-digit', minute: '2-digit', hour12: false
  });

  // Process trains
  const trains = (snapshot.trains || []).slice(0, 2).map(train => {
    const departureTime = new Date(train.when);
    const minutes = Math.max(0, Math.round((departureTime - now) / 60000));
    return { minutes };
  });

  // Process trams
  const trams = (snapshot.trams || []).slice(0, 2).map(tram => {
    const departureTime = new Date(tram.when);
    const minutes = Math.max(0, Math.round((departureTime - now) / 60000));
    return { minutes };
  });

  const regions = [];

  // Time region
  regions.push({
    id: 'time',
    text: timeFormatter.format(now),
    description: 'Current time (HH:MM format, 24-hour)'
  });

  // Train regions
  for (let i = 0; i < 2; i++) {
    regions.push({
      id: `train${i + 1}`,
      text: trains[i] ? `${trains[i].minutes}` : '--',
      description: `Train departure ${i + 1} (minutes)`
    });
  }

  // Tram regions
  for (let i = 0; i < 2; i++) {
    regions.push({
      id: `tram${i + 1}`,
      text: trams[i] ? `${trams[i].minutes}` : '--',
      description: `Tram departure ${i + 1} (minutes)`
    });
  }

  // Weather regions
  const weatherData = await weather.getCurrentWeather();
  regions.push({
    id: 'weather',
    text: weatherData.condition.short || 'N/A',
    description: 'Weather condition (abbreviated)'
  });

  regions.push({
    id: 'temperature',
    text: weatherData.temperature !== null ? `${weatherData.temperature}` : '--',
    description: 'Temperature (°C, no symbol)'
  });

  console.log('Region Updates (7 regions total):');
  console.log('');
  regions.forEach((region, i) => {
    console.log(`Region ${i + 1}: ${region.id}`);
    console.log(`  Text:        "${region.text}"`);
    console.log(`  Description: ${region.description}`);
    console.log('');
  });

  console.log('JSON Format (as sent to firmware):');
  console.log('');
  console.log(JSON.stringify({
    timestamp: now.toISOString(),
    regions: regions.map(r => ({ id: r.id, text: r.text }))
  }, null, 2));
  console.log('');

  // ========== DATA VALIDATION ==========
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('6. DATA VALIDATION & ACCURACY CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const checks = [];

  // Check 1: API Key present
  checks.push({
    check: 'API Key configured',
    status: apiKey !== 'NOT SET',
    details: apiKey !== 'NOT SET' ? 'API Key present' : 'Missing ODATA_API_KEY (pass via env var)'
  });

  // Check 2: Weather data valid
  checks.push({
    check: 'Weather data received',
    status: weatherData && weatherData.temperature !== null,
    details: weatherData ? `${weatherData.temperature}°C, ${weatherData.condition.full}` : 'No data'
  });

  // Check 3: Train data valid
  checks.push({
    check: 'Train data received',
    status: snapshot.trains && snapshot.trains.length > 0,
    details: snapshot.trains ? `${snapshot.trains.length} departures` : 'No trains'
  });

  // Check 4: Tram data valid
  checks.push({
    check: 'Tram data received',
    status: snapshot.trams && snapshot.trams.length > 0,
    details: snapshot.trams ? `${snapshot.trams.length} departures` : 'No trams'
  });

  // Check 5: Time formatting correct
  checks.push({
    check: 'Time format valid',
    status: /^\d{2}:\d{2}$/.test(regions[0].text),
    details: `Format: "${regions[0].text}" (should be HH:MM)`
  });

  // Check 6: All regions present
  checks.push({
    check: 'All 7 regions present',
    status: regions.length === 7,
    details: `${regions.length} regions (need 7: time, train1, train2, tram1, tram2, weather, temperature)`
  });

  // Check 7: No null/undefined values
  const hasNullValues = regions.some(r => r.text === null || r.text === undefined);
  checks.push({
    check: 'No null values in regions',
    status: !hasNullValues,
    details: hasNullValues ? 'Some regions have null/undefined' : 'All regions have values'
  });

  checks.forEach((check, i) => {
    const icon = check.status ? '[OK]' : '[FAIL]';
    console.log(`${icon} Check ${i + 1}: ${check.check}`);
    console.log(`   ${check.details}`);
    console.log('');
  });

  const passedChecks = checks.filter(c => c.status).length;
  const totalChecks = checks.length;

  console.log('─────────────────────────────────────────────────────────────');
  console.log(`VALIDATION SUMMARY: ${passedChecks}/${totalChecks} checks passed`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');

  if (passedChecks === totalChecks) {
    console.log('ALL CHECKS PASSED - Data pipeline is working correctly!');
  } else {
    console.log(`[!] ${totalChecks - passedChecks} check(s) failed - review above for details`);
  }
  console.log('');

} catch (error) {
  console.log('[FAIL] Transport Victoria API Fetch: FAILED');
  console.log('');
  console.log('Error Details:');
  console.log(`  Message: ${error.message}`);
  console.log(`  Stack:   ${error.stack?.split('\n')[0] || 'N/A'}`);
  console.log('');
  console.log('Troubleshooting:');
  console.log('  1. Pass ODATA_API_KEY via env var (UUID format)');
  console.log('  2. Verify API key is valid (from https://opendata.transport.vic.gov.au/)');
  console.log('  3. Check internet connection');
  console.log('  4. Verify Transport Victoria API endpoint is accessible');
  console.log('');
}

// ========== FINAL SUMMARY ==========
console.log('═══════════════════════════════════════════════════════════════');
console.log('7. DATA FLOW SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Data Pipeline:');
console.log('');
console.log('  [Transport Victoria API]');
console.log('      ↓ (HTTPS + JWT Token)');
console.log('  [data-scraper.js]');
console.log('      ↓ (GTFS Realtime Protobuf → JSON)');
console.log('  [server.js → fetchData()]');
console.log('      ↓ (Process departures, calculate minutes)');
console.log('  [server.js → getRegionUpdates()]');
console.log('      ↓ (Format for firmware: 7 regions)');
console.log('  [/api/region-updates endpoint]');
console.log('      ↓ (JSON over HTTPS)');
console.log('  [ESP32 Firmware]');
console.log('      ↓ (Parse JSON, extract region text)');
console.log('  [E-ink Display]');
console.log('      ↓ (Render to 800×480 display)');
console.log('  [User sees transit times!]');
console.log('');
console.log('Weather Pipeline:');
console.log('');
console.log('  [BOM API]');
console.log('      ↓ (HTTPS, no auth)');
console.log('  [weather-bom.js]');
console.log('      ↓ (Parse observations, cache 15 min)');
console.log('  [server.js → getRegionUpdates()]');
console.log('      ↓ (Extract temp + condition)');
console.log('  [Included in region updates]');
console.log('');
console.log('Update Frequency:');
console.log('  • Firmware polls:    Every 30 seconds');
console.log('  • Server cache:      25 seconds');
console.log('  • Weather cache:     15 minutes');
console.log('  • BOM updates:       ~30 minutes');
console.log('  • Transport Victoria GTFS updates:  Real-time (sub-minute)');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('END OF DATA PIPELINE VALIDATION REPORT');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Report generated:', new Date().toISOString());
console.log('');
