/**
 * Comprehensive LEAVE NOW Visual Testing Suite
 * Tests the "always LEAVE NOW" design decision across all scenarios
 * 
 * Dashboard should only ever show LEAVE NOW timing
 * v1.40: Added departure times to transit legs, fixed stripe legibility
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { renderFullDashboard } from '../src/services/ccdash-renderer.js';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'output', 'leave-now-tests');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('Comprehensive LEAVE NOW Visual Testing Suite v1.40');
console.log('=' .repeat(60));
console.log('Testing: All screens must display "LEAVE NOW" status');
console.log('Testing: Departure times must show on transit legs');
console.log('Testing: Diverted/suspended leg text must be legible');
console.log('Output:', OUTPUT_DIR);
console.log();

// Helper to calculate departure time from current time + cumulative minutes
function calcDepartTime(currentTime, cumulativeMinutes) {
  const match = currentTime.match(/(\d+):(\d+)\s*(am|pm)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1]);
  let mins = parseInt(match[2]);
  const isPM = match[3]?.toLowerCase() === 'pm';
  
  if (isPM && hours < 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  
  const totalMins = hours * 60 + mins + cumulativeMinutes;
  const newHours = Math.floor(totalMins / 60) % 24;
  const newMins = totalMins % 60;
  const newHours12 = newHours % 12 || 12;
  const newAmPm = newHours >= 12 ? 'pm' : 'am';
  
  return `${newHours12}:${String(newMins).padStart(2, '0')}${newAmPm}`;
}

// Add departure times and next departures to transit legs
function addDepartTimes(data) {
  if (!data.journey_legs) return data;
  
  let cumulative = 0;
  data.journey_legs = data.journey_legs.map(leg => {
    if (['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type)) {
      if (!leg.departTime) {
        leg.departTime = calcDepartTime(data.current_time, cumulative);
      }
      // Add next 2 departures (typical 8-15 min frequency)
      if (!leg.nextDepartures) {
        const freq1 = 6 + Math.floor(Math.random() * 6); // 6-11 min
        const freq2 = freq1 + 5 + Math.floor(Math.random() * 8); // +5-12 min
        leg.nextDepartures = [freq1, freq2];
      }
    }
    cumulative += leg.minutes || 0;
    return leg;
  });
  
  return data;
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const scenarios = [
  // -------------------------------------------------------------------------
  // TIMING EDGE CASES - These previously showed "LEAVE IN X MIN"
  // -------------------------------------------------------------------------
  {
    name: '01-early-morning-6am',
    description: 'Very early start - would have shown "LEAVE IN 45 MIN" before',
    data: {
      current_time: '6:15am',
      arrive_by: '09:00',
      total_minutes: 35,
      temp: 12,
      condition: 'Cool',
      journey_legs: [
        { type: 'walk', to: 'cafe', minutes: 3 },
        { type: 'coffee', location: 'Cafe', minutes: 5 },
        { type: 'walk', to: 'tram stop', minutes: 2 },
        { type: 'tram', routeNumber: '58', origin: { name: 'Stop A' }, destination: { name: 'Station' }, minutes: 8 },
        { type: 'train', origin: { name: 'Station' }, destination: { name: 'City' }, minutes: 12 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '02-buffer-30min',
    description: '30 minute buffer - would have shown "LEAVE IN 30 MIN"',
    data: {
      current_time: '8:00am',
      arrive_by: '09:00',
      total_minutes: 30,
      temp: 18,
      condition: 'Sunny',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 5 },
        { type: 'train', origin: { name: 'Home Station' }, destination: { name: 'Work Station' }, minutes: 20 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '03-buffer-15min',
    description: '15 minute buffer - edge case',
    data: {
      current_time: '8:20am',
      arrive_by: '09:00',
      total_minutes: 25,
      temp: 22,
      condition: 'Clear',
      journey_legs: [
        { type: 'walk', to: 'tram', minutes: 3 },
        { type: 'tram', routeNumber: '86', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 18 },
        { type: 'walk', to: 'work', minutes: 4 }
      ]
    }
  },
  {
    name: '04-buffer-10min',
    description: '10 minute buffer - just outside threshold',
    data: {
      current_time: '8:30am',
      arrive_by: '09:00',
      total_minutes: 20,
      temp: 20,
      condition: 'Partly Cloudy',
      journey_legs: [
        { type: 'walk', to: 'bus', minutes: 2 },
        { type: 'bus', routeNumber: '200', origin: { name: 'Home' }, destination: { name: 'Station' }, minutes: 10 },
        { type: 'train', origin: { name: 'Station' }, destination: { name: 'City' }, minutes: 5 },
        { type: 'walk', to: 'work', minutes: 3 }
      ]
    }
  },
  {
    name: '05-exact-timing',
    description: 'Exact timing - no buffer',
    data: {
      current_time: '8:35am',
      arrive_by: '09:00',
      total_minutes: 25,
      temp: 19,
      condition: 'Overcast',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 7 },
        { type: 'train', origin: { name: 'Suburb' }, destination: { name: 'CBD' }, minutes: 15 },
        { type: 'walk', to: 'work', minutes: 3 }
      ]
    }
  },
  
  // -------------------------------------------------------------------------
  // DELAY SCENARIOS - Should show DELAY, not LEAVE IN
  // -------------------------------------------------------------------------
  {
    name: '06-single-delay-5min',
    description: 'Single 5 minute delay on train',
    data: {
      current_time: '8:25am',
      arrive_by: '09:00',
      total_minutes: 35,
      status_type: 'delay',
      delay_minutes: 5,
      temp: 17,
      condition: 'Cloudy',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 5 },
        { type: 'train', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 22, delayMinutes: 5, status: 'delayed' },
        { type: 'walk', to: 'work', minutes: 3 }
      ]
    }
  },
  {
    name: '07-multiple-delays',
    description: 'Multiple delays on different legs',
    data: {
      current_time: '8:20am',
      arrive_by: '09:00',
      total_minutes: 42,
      status_type: 'delay',
      delay_minutes: 12,
      temp: 15,
      condition: 'Drizzle',
      rain_expected: true,
      journey_legs: [
        { type: 'walk', to: 'tram', minutes: 3 },
        { type: 'tram', routeNumber: '72', origin: { name: 'Home' }, destination: { name: 'Station' }, minutes: 10, delayMinutes: 4, status: 'delayed' },
        { type: 'walk', to: 'platform', minutes: 2 },
        { type: 'train', origin: { name: 'Station' }, destination: { name: 'City' }, minutes: 18, delayMinutes: 8, status: 'delayed' },
        { type: 'walk', to: 'work', minutes: 4 }
      ]
    }
  },
  {
    name: '08-severe-delay-20min',
    description: 'Severe 20+ minute delay',
    data: {
      current_time: '8:15am',
      arrive_by: '09:00',
      total_minutes: 55,
      status_type: 'delay',
      delay_minutes: 25,
      temp: 14,
      condition: 'Rain',
      rain_expected: true,
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 8 },
        { type: 'train', origin: { name: 'Suburb' }, destination: { name: 'Central' }, minutes: 35, delayMinutes: 25, status: 'delayed' },
        { type: 'walk', to: 'work', minutes: 7 }
      ]
    }
  },

  // -------------------------------------------------------------------------
  // DISRUPTION SCENARIOS - v1.40: legible text on striped backgrounds
  // -------------------------------------------------------------------------
  {
    name: '09-disruption-buses-replace',
    description: 'Buses replacing trains disruption',
    data: {
      current_time: '8:10am',
      arrive_by: '09:00',
      total_minutes: 65,
      status_type: 'disruption',
      disruption: true,
      delay_minutes: 30,
      temp: 16,
      condition: 'Cloudy',
      journey_legs: [
        { type: 'walk', to: 'bus stop', minutes: 5 },
        { type: 'bus', routeNumber: 'RAIL', origin: { name: 'Station A' }, destination: { name: 'Station B' }, minutes: 45, status: 'diverted', divertedStop: 'Buses replacing trains' },
        { type: 'train', origin: { name: 'Station B' }, destination: { name: 'City' }, minutes: 10 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '10-tram-diversion',
    description: 'Tram route diversion',
    data: {
      current_time: '8:30am',
      arrive_by: '09:00',
      total_minutes: 38,
      status_type: 'diversion',
      isDiverted: true,
      delay_minutes: 8,
      temp: 21,
      condition: 'Sunny',
      journey_legs: [
        { type: 'walk', to: 'tram', minutes: 4 },
        { type: 'tram', routeNumber: '96', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 25, status: 'diverted', delayMinutes: 8, divertedStop: 'Via St Kilda Rd' },
        { type: 'walk', to: 'work', minutes: 4 }
      ]
    }
  },

  // -------------------------------------------------------------------------
  // WEATHER SCENARIOS
  // -------------------------------------------------------------------------
  {
    name: '11-heavy-rain',
    description: 'Heavy rain - bring umbrella',
    data: {
      current_time: '8:25am',
      arrive_by: '09:00',
      total_minutes: 32,
      temp: 14,
      condition: 'Heavy Rain',
      rain_expected: true,
      precipitation: 85,
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 6 },
        { type: 'train', origin: { name: 'Suburb' }, destination: { name: 'City' }, minutes: 20 },
        { type: 'walk', to: 'work', minutes: 6 }
      ]
    }
  },
  {
    name: '12-extreme-heat',
    description: 'Extreme heat warning 40°C',
    data: {
      current_time: '8:20am',
      arrive_by: '09:00',
      total_minutes: 28,
      temp: 40,
      condition: 'Extreme Heat',
      journey_legs: [
        { type: 'walk', to: 'tram', minutes: 3 },
        { type: 'tram', routeNumber: '109', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 20 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '13-freezing-cold',
    description: 'Freezing cold morning 2°C',
    data: {
      current_time: '7:45am',
      arrive_by: '09:00',
      total_minutes: 40,
      temp: 2,
      condition: 'Frost',
      journey_legs: [
        { type: 'walk', to: 'cafe', minutes: 4 },
        { type: 'coffee', location: 'Warm Cafe', minutes: 6 },
        { type: 'walk', to: 'station', minutes: 5 },
        { type: 'train', origin: { name: 'Suburb' }, destination: { name: 'City' }, minutes: 18 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '14-storm-warning',
    description: 'Storm warning conditions',
    data: {
      current_time: '8:15am',
      arrive_by: '09:00',
      total_minutes: 35,
      temp: 18,
      condition: 'Thunderstorm',
      rain_expected: true,
      precipitation: 95,
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 8 },
        { type: 'train', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 20 },
        { type: 'walk', to: 'work', minutes: 7 }
      ]
    }
  },

  // -------------------------------------------------------------------------
  // JOURNEY COMPLEXITY SCENARIOS
  // -------------------------------------------------------------------------
  {
    name: '15-simple-train-only',
    description: 'Simple direct train journey',
    data: {
      current_time: '8:30am',
      arrive_by: '09:00',
      total_minutes: 25,
      temp: 20,
      condition: 'Clear',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 5 },
        { type: 'train', origin: { name: 'Home Station' }, destination: { name: 'Work Station' }, minutes: 15 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '16-simple-tram-only',
    description: 'Simple direct tram journey',
    data: {
      current_time: '8:35am',
      arrive_by: '09:00',
      total_minutes: 22,
      temp: 19,
      condition: 'Sunny',
      journey_legs: [
        { type: 'walk', to: 'tram stop', minutes: 2 },
        { type: 'tram', routeNumber: '86', origin: { name: 'Home' }, destination: { name: 'CBD' }, minutes: 16 },
        { type: 'walk', to: 'work', minutes: 4 }
      ]
    }
  },
  {
    name: '17-coffee-tram-train',
    description: 'Full multi-modal with coffee',
    data: {
      current_time: '8:10am',
      arrive_by: '09:00',
      total_minutes: 42,
      temp: 17,
      condition: 'Mild',
      journey_legs: [
        { type: 'walk', to: 'cafe', minutes: 3 },
        { type: 'coffee', location: 'Local Cafe', minutes: 5 },
        { type: 'walk', to: 'tram', minutes: 2 },
        { type: 'tram', routeNumber: '58', origin: { name: 'Chapel St' }, destination: { name: 'Station' }, minutes: 8 },
        { type: 'walk', to: 'platform', minutes: 2 },
        { type: 'train', origin: { name: 'South Yarra' }, destination: { name: 'Parliament' }, minutes: 10 },
        { type: 'walk', to: 'work', minutes: 7 }
      ]
    }
  },
  {
    name: '18-bus-train-walk',
    description: 'Bus to train connection',
    data: {
      current_time: '8:20am',
      arrive_by: '09:00',
      total_minutes: 38,
      temp: 16,
      condition: 'Overcast',
      journey_legs: [
        { type: 'walk', to: 'bus stop', minutes: 3 },
        { type: 'bus', routeNumber: '246', origin: { name: 'Home' }, destination: { name: 'Station' }, minutes: 12 },
        { type: 'walk', to: 'platform', minutes: 3 },
        { type: 'train', origin: { name: 'Interchange' }, destination: { name: 'City' }, minutes: 15 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  },
  {
    name: '19-max-legs-6',
    description: 'Maximum 6 journey legs',
    data: {
      current_time: '7:50am',
      arrive_by: '09:00',
      total_minutes: 55,
      temp: 15,
      condition: 'Cool',
      journey_legs: [
        { type: 'walk', to: 'cafe', minutes: 4 },
        { type: 'coffee', location: 'Coffee Shop', minutes: 5 },
        { type: 'walk', to: 'tram', minutes: 3 },
        { type: 'tram', routeNumber: '72', origin: { name: 'Home Area' }, destination: { name: 'Hub' }, minutes: 12 },
        { type: 'train', origin: { name: 'Hub Station' }, destination: { name: 'Central' }, minutes: 20 },
        { type: 'walk', to: 'work', minutes: 8 }
      ]
    }
  },

  // -------------------------------------------------------------------------
  // TIME OF DAY SCENARIOS
  // -------------------------------------------------------------------------
  {
    name: '20-late-start-11am',
    description: 'Late start - 11am arrival',
    data: {
      current_time: '10:20am',
      arrive_by: '11:00',
      total_minutes: 35,
      temp: 24,
      condition: 'Warm',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 7 },
        { type: 'train', origin: { name: 'Suburb' }, destination: { name: 'City' }, minutes: 22 },
        { type: 'walk', to: 'work', minutes: 6 }
      ]
    }
  },
  {
    name: '21-afternoon-meeting',
    description: 'Afternoon meeting - 2pm arrival',
    data: {
      current_time: '1:25pm',
      arrive_by: '14:00',
      total_minutes: 30,
      temp: 26,
      condition: 'Hot',
      journey_legs: [
        { type: 'walk', to: 'tram', minutes: 4 },
        { type: 'tram', routeNumber: '109', origin: { name: 'Home' }, destination: { name: 'Meeting Point' }, minutes: 22 },
        { type: 'walk', to: 'destination', minutes: 4 }
      ]
    }
  },
  {
    name: '22-evening-6pm',
    description: 'Evening commute - 6pm arrival',
    data: {
      current_time: '5:20pm',
      arrive_by: '18:00',
      total_minutes: 35,
      temp: 18,
      condition: 'Dusk',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 6 },
        { type: 'train', origin: { name: 'Work' }, destination: { name: 'Home Station' }, minutes: 20 },
        { type: 'walk', to: 'home', minutes: 9 }
      ]
    }
  },

  // -------------------------------------------------------------------------
  // EDGE CASE SCENARIOS
  // -------------------------------------------------------------------------
  {
    name: '23-minimal-journey',
    description: 'Minimal 10 minute journey',
    data: {
      current_time: '8:50am',
      arrive_by: '09:00',
      total_minutes: 10,
      temp: 20,
      condition: 'Nice',
      journey_legs: [
        { type: 'walk', to: 'work', minutes: 10 }
      ]
    }
  },
  {
    name: '24-long-journey-90min',
    description: 'Long 90 minute journey',
    data: {
      current_time: '7:00am',
      arrive_by: '09:00',
      total_minutes: 90,
      temp: 13,
      condition: 'Morning Fog',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 10 },
        { type: 'train', origin: { name: 'Outer Suburb' }, destination: { name: 'Interchange' }, minutes: 35 },
        { type: 'walk', to: 'platform', minutes: 5 },
        { type: 'train', origin: { name: 'Interchange' }, destination: { name: 'City' }, minutes: 30 },
        { type: 'walk', to: 'work', minutes: 10 }
      ]
    }
  },
  {
    name: '25-running-late',
    description: 'Already running late scenario',
    data: {
      current_time: '8:50am',
      arrive_by: '09:00',
      total_minutes: 25,
      temp: 21,
      condition: 'Clear',
      journey_legs: [
        { type: 'walk', to: 'station', minutes: 5 },
        { type: 'train', origin: { name: 'Home' }, destination: { name: 'City' }, minutes: 15 },
        { type: 'walk', to: 'work', minutes: 5 }
      ]
    }
  }
];

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests() {
  const results = [];
  
  console.log(`Running ${scenarios.length} test scenarios...\n`);
  
  for (const scenario of scenarios) {
    console.log(`${scenario.name}`);
    console.log(`   ${scenario.description}`);
    
    try {
      // Add departure times to transit legs
      const dataWithDepart = addDepartTimes(scenario.data);
      
      // Render the full dashboard
      const png = await renderFullDashboard(dataWithDepart);
      
      // Save to file
      const outputPath = path.join(OUTPUT_DIR, `${scenario.name}.png`);
      fs.writeFileSync(outputPath, png);
      
      console.log(`   [OK] Saved: ${outputPath}`);
      console.log(`   Size: ${png.length} bytes`);
      
      results.push({
        name: scenario.name,
        description: scenario.description,
        path: outputPath,
        size: png.length,
        success: true
      });
    } catch (error) {
      console.log(`   [FAIL] Error: ${error.message}`);
      results.push({
        name: scenario.name,
        description: scenario.description,
        error: error.message,
        success: false
      });
    }
    console.log();
  }
  
  // Summary
  console.log('=' .repeat(60));
  console.log('TEST SUMMARY');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`[OK] Passed: ${passed}/${scenarios.length}`);
  console.log(`[FAIL] Failed: ${failed}/${scenarios.length}`);
  console.log();
  
  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  // Write results JSON
  const resultsPath = path.join(OUTPUT_DIR, 'test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
  
  return results;
}

// Run tests
runTests().catch(console.error);
