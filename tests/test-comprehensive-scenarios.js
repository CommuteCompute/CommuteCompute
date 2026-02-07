/**
 * Comprehensive CCDash V15.0 + CommuteCompute Test Suite
 * 
 * Generates varied real-world scenarios for final review before spec lockdown.
 * Tests full pipeline: CommuteCompute → CoffeeDecision → CCDash Renderer
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { renderFullDashboard } from '../src/services/ccdash-renderer.js';
import {
  isMetroTunnelLine,
  getDiscontinuedServiceInfo,
  METRO_TUNNEL_STATIONS
} from '../src/engines/commute-compute.js';
import fs from 'fs';
import path from 'path';

const outputDir = path.join(process.cwd(), 'tests/output/comprehensive');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('═'.repeat(70));
console.log('  COMPREHENSIVE CCDASH V11 + COMMUTECOMPUTE TEST SUITE');
console.log('  Final Review Before Spec Lockdown');
console.log('═'.repeat(70));
console.log();

// Helper to format time
function formatTime(hour, min) {
  const h12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
  const ampm = hour >= 12 ? 'pm' : 'am';
  return `${h12}:${String(min).padStart(2, '0')}${ampm}`;
}

// Helper to add minutes to time
function addMinutes(hour, min, addMins) {
  const totalMins = hour * 60 + min + addMins;
  return {
    hour: Math.floor(totalMins / 60) % 24,
    min: totalMins % 60
  };
}

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ============================================================================
// SCENARIO DEFINITIONS
// ============================================================================

const scenarios = [
  // -------------------------------------------------------------------------
  // MORNING COMMUTE VARIATIONS
  // -------------------------------------------------------------------------
  {
    name: '01-morning-rush-coffee',
    category: 'Morning Commute',
    description: 'Typical morning with coffee, tram + train',
    time: { hour: 7, min: 15 },
    date: { day: 1, month: 1, weekday: 3 }, // Wednesday
    weather: { temp: 18, condition: 'Partly Cloudy', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'SOUTH YARRA',
    destination: 'COLLINS ST',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • Example Cafe', minutes: 4 },
      { type: 'coffee', title: 'Example Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 8 },
      { type: 'walk', title: 'Walk to tram', subtitle: 'tram stop', minutes: 2 },
      { type: 'tram', title: 'Tram 8 to Station', routeNumber: '8', subtitle: 'Next: 4, 12 min', minutes: 12, departTime: '7:29am' },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Sandringham Line • Next: 6, 14 min', minutes: 8, departTime: '7:45am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'Collins St', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '02-morning-skip-coffee',
    category: 'Morning Commute',
    description: 'Running late, skip coffee',
    time: { hour: 8, min: 25 },
    date: { day: 1, month: 1, weekday: 3 },
    weather: { temp: 22, condition: 'Sunny', umbrella: false },
    coffee: { enabled: true, decision: 'SKIP' },
    location: 'RICHMOND',
    destination: 'MELBOURNE CBD',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Richmond Station', minutes: 5 },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Glen Waverley Line • Next: 3, 11 min', minutes: 6, departTime: '8:33am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 4 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '03-early-bird-6am',
    category: 'Morning Commute',
    description: 'Very early start, plenty of time',
    time: { hour: 6, min: 0 },
    date: { day: 1, month: 1, weekday: 1 }, // Monday
    weather: { temp: 12, condition: 'Cool', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'BRUNSWICK',
    destination: 'DOCKLANDS',
    arriveBy: '08:00',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • cafe', minutes: 3 },
      { type: 'coffee', title: 'Local Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 10 },
      { type: 'walk', title: 'Walk to tram', subtitle: 'Sydney Rd', minutes: 2 },
      { type: 'tram', title: 'Tram 19 to City', routeNumber: '19', subtitle: 'Next: 8, 16 min', minutes: 25, departTime: '6:15am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'Docklands', minutes: 8 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },

  // -------------------------------------------------------------------------
  // METRO TUNNEL SCENARIOS (Effective 2026-02-01)
  // -------------------------------------------------------------------------
  {
    name: '04-metro-tunnel-pakenham',
    category: 'Metro Tunnel',
    description: 'Pakenham Line via Metro Tunnel to State Library',
    time: { hour: 7, min: 45 },
    date: { day: 1, month: 1, weekday: 6 }, // Saturday
    weather: { temp: 24, condition: 'Warm', umbrella: false },
    coffee: { enabled: false },
    location: 'DANDENONG',
    destination: 'STATE LIBRARY',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Dandenong Station', minutes: 6 },
      { type: 'train', title: 'Train to State Library', subtitle: 'Pakenham Line • via Metro Tunnel • Next: 5, 15 min', minutes: 38, departTime: '7:56am' },
      { type: 'walk', title: 'Walk to destination', subtitle: 'State Library', minutes: 2 }
    ],
    services: { ok: true },
    dataSource: 'live',
    metroTunnel: true
  },
  {
    name: '05-metro-tunnel-sunbury-parkville',
    category: 'Metro Tunnel',
    description: 'Sunbury Line to Parkville (Hospital)',
    time: { hour: 8, min: 0 },
    date: { day: 1, month: 1, weekday: 2 }, // Tuesday
    weather: { temp: 16, condition: 'Overcast', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'SUNSHINE',
    destination: 'ROYAL MELBOURNE HOSPITAL',
    arriveBy: '09:30',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • Hampshire Rd cafe', minutes: 4 },
      { type: 'coffee', title: 'Sunshine Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 7 },
      { type: 'walk', title: 'Walk to station', subtitle: 'Sunshine Station', minutes: 3 },
      { type: 'train', title: 'Train to Parkville', subtitle: 'Sunbury Line • via Metro Tunnel • Next: 6, 14 min', minutes: 18, departTime: '8:21am' },
      { type: 'walk', title: 'Walk to Hospital', subtitle: 'Royal Melbourne Hospital', minutes: 3 }
    ],
    services: { ok: true },
    dataSource: 'live',
    metroTunnel: true
  },
  {
    name: '06-metro-tunnel-interchange',
    category: 'Metro Tunnel',
    description: 'Transfer at North Melbourne (Metro Tunnel ↔ City Loop)',
    time: { hour: 7, min: 30 },
    date: { day: 1, month: 1, weekday: 4 }, // Thursday
    weather: { temp: 19, condition: 'Fine', umbrella: false },
    coffee: { enabled: false },
    location: 'FOOTSCRAY',
    destination: 'PARLIAMENT',
    arriveBy: '08:30',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Footscray Station', minutes: 5 },
      { type: 'train', title: 'Train to North Melbourne', subtitle: 'Sunbury Line • Metro Tunnel • Next: 4, 12 min', minutes: 8, departTime: '7:40am' },
      { type: 'walk', title: 'Transfer', subtitle: 'Platform 3 → Platform 5', minutes: 4 },
      { type: 'train', title: 'Train to Parliament', subtitle: 'Hurstbridge Line • City Loop • Next: 3, 10 min', minutes: 6, departTime: '7:56am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'Spring St', minutes: 3 }
    ],
    services: { ok: true },
    dataSource: 'live',
    metroTunnel: true
  },

  // -------------------------------------------------------------------------
  // WEATHER VARIATIONS
  // -------------------------------------------------------------------------
  {
    name: '07-heavy-rain-umbrella',
    category: 'Weather',
    description: 'Heavy rain - bring umbrella',
    time: { hour: 7, min: 45 },
    date: { day: 15, month: 6, weekday: 3 }, // Winter Wednesday
    weather: { temp: 11, condition: 'Heavy Rain', umbrella: true },
    coffee: { enabled: true, decision: 'YES' },
    location: 'HAWTHORN',
    destination: 'MELBOURNE CBD',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • Lido cafe', minutes: 3 },
      { type: 'coffee', title: 'Lido Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 6 },
      { type: 'walk', title: 'Walk to station', subtitle: 'Hawthorn Station', minutes: 4 },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Belgrave Line • Next: 5, 13 min', minutes: 12, departTime: '8:05am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '08-extreme-heat-40c',
    category: 'Weather',
    description: 'Extreme heat warning 40°C',
    time: { hour: 8, min: 10 },
    date: { day: 15, month: 0, weekday: 5 }, // Summer Friday
    weather: { temp: 40, condition: 'Extreme Heat', umbrella: false },
    coffee: { enabled: false },
    location: 'CAULFIELD',
    destination: 'FLINDERS ST',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Caulfield Station', minutes: 4 },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Frankston Line • Next: 4, 12 min', minutes: 15, departTime: '8:18am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 3 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '09-freezing-morning',
    category: 'Weather',
    description: 'Freezing cold 2°C morning',
    time: { hour: 6, min: 30 },
    date: { day: 10, month: 6, weekday: 1 }, // Winter Monday
    weather: { temp: 2, condition: 'Frost', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'ESSENDON',
    destination: 'CBD',
    arriveBy: '08:00',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • cafe', minutes: 2 },
      { type: 'coffee', title: 'Warm Up Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 8 },
      { type: 'walk', title: 'Walk to station', subtitle: 'Essendon Station', minutes: 4 },
      { type: 'train', title: 'Train to Arden', subtitle: 'Craigieburn Line • via Metro Tunnel • Next: 7, 15 min', minutes: 14, departTime: '6:51am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live',
    metroTunnel: true
  },

  // -------------------------------------------------------------------------
  // DELAYS AND DISRUPTIONS
  // -------------------------------------------------------------------------
  {
    name: '10-minor-delay-5min',
    category: 'Delays',
    description: 'Minor 5 minute delay',
    time: { hour: 8, min: 0 },
    date: { day: 1, month: 1, weekday: 2 },
    weather: { temp: 20, condition: 'Clear', umbrella: false },
    coffee: { enabled: false },
    location: 'FOOTSCRAY',
    destination: 'SOUTHERN CROSS',
    arriveBy: '09:00',
    delay: { minutes: 5, leg: 1 },
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Footscray Station', minutes: 5 },
      { type: 'train', title: 'Train to Southern Cross', subtitle: 'Werribee Line • +5 MIN • Next: 8, 16 min', minutes: 15, departTime: '8:13am', isDelayed: true, delayMinutes: 5 },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 4 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '11-major-delay-20min',
    category: 'Delays',
    description: 'Major 20 minute delay',
    time: { hour: 7, min: 50 },
    date: { day: 1, month: 1, weekday: 4 },
    weather: { temp: 17, condition: 'Cloudy', umbrella: false },
    coffee: { enabled: false },
    location: 'BOX HILL',
    destination: 'CITY',
    arriveBy: '09:00',
    delay: { minutes: 20, leg: 1 },
    totalDelay: 20,
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Box Hill Station', minutes: 6 },
      { type: 'train', title: 'Train to Parliament', subtitle: 'Belgrave Line • +20 MIN • Next: 25, 33 min', minutes: 28, departTime: '8:21am', isDelayed: true, delayMinutes: 20 },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 5 }
    ],
    services: { ok: false, message: 'Delays on Belgrave Line' },
    dataSource: 'live'
  },
  {
    name: '12-buses-replacing-trains',
    category: 'Disruptions',
    description: 'Buses replacing trains - major disruption',
    time: { hour: 8, min: 15 },
    date: { day: 5, month: 1, weekday: 0 }, // Sunday
    weather: { temp: 15, condition: 'Overcast', umbrella: false },
    coffee: { enabled: false },
    location: 'GLEN WAVERLEY',
    destination: 'FLINDERS ST',
    arriveBy: '10:00',
    disruption: true,
    legs: [
      { type: 'walk', title: 'Walk to bus stop', subtitle: 'From home • bus stop', minutes: 4 },
      { type: 'bus', title: 'Bus RAIL to Burnley', subtitle: 'Buses replacing trains • Next: 10, 25 min', minutes: 35, departTime: '8:24am', isDisruption: true },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Resume normal service • Next: 5, 13 min', minutes: 8, departTime: '9:04am' },
      { type: 'walk', title: 'Walk to destination', subtitle: 'Flinders St', minutes: 3 }
    ],
    services: { ok: false, message: 'Buses replacing trains' },
    dataSource: 'live'
  },

  // -------------------------------------------------------------------------
  // DIFFERENT MODES
  // -------------------------------------------------------------------------
  {
    name: '13-tram-only',
    category: 'Modes',
    description: 'Tram only journey',
    time: { hour: 9, min: 0 },
    date: { day: 1, month: 1, weekday: 6 }, // Saturday
    weather: { temp: 22, condition: 'Sunny', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'ST KILDA',
    destination: 'MELBOURNE CBD',
    arriveBy: '10:30',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • Fitzroy St cafe', minutes: 3 },
      { type: 'coffee', title: 'Beach Cafe', subtitle: '[OK] SATURDAY TREAT', minutes: 12 },
      { type: 'walk', title: 'Walk to tram', subtitle: 'Fitzroy St stop', minutes: 2 },
      { type: 'tram', title: 'Tram 16 to City', routeNumber: '16', subtitle: 'via St Kilda Rd • Next: 4, 10 min', minutes: 22, departTime: '9:29am' },
      { type: 'walk', title: 'Walk to destination', subtitle: 'Bourke St', minutes: 4 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '14-bus-only',
    category: 'Modes',
    description: 'Bus only journey',
    time: { hour: 10, min: 30 },
    date: { day: 1, month: 1, weekday: 0 }, // Sunday
    weather: { temp: 25, condition: 'Warm', umbrella: false },
    coffee: { enabled: false },
    location: 'DONCASTER',
    destination: 'CITY',
    arriveBy: '11:30',
    legs: [
      { type: 'walk', title: 'Walk to bus stop', subtitle: 'From home • Doncaster Rd', minutes: 5 },
      { type: 'bus', title: 'Bus 907 to City', routeNumber: '907', subtitle: 'SmartBus • Next: 8, 18 min', minutes: 35, departTime: '10:43am' },
      { type: 'walk', title: 'Walk to destination', subtitle: 'Lonsdale St', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '15-train-tram-bus',
    category: 'Modes',
    description: 'All modes: train + tram + bus',
    time: { hour: 7, min: 0 },
    date: { day: 1, month: 1, weekday: 1 }, // Monday
    weather: { temp: 16, condition: 'Mild', umbrella: false },
    coffee: { enabled: false },
    location: 'WERRIBEE',
    destination: 'MONASH UNI',
    arriveBy: '09:30',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Werribee Station', minutes: 8 },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'Werribee Line • Next: 6, 18 min', minutes: 38, departTime: '7:16am' },
      { type: 'walk', title: 'Walk to tram', subtitle: 'Flinders St tram stop', minutes: 3 },
      { type: 'tram', title: 'Tram 70 to Gardiner', routeNumber: '70', subtitle: 'Next: 4, 12 min', minutes: 25, departTime: '8:05am' },
      { type: 'bus', title: 'Bus 630 to Monash', routeNumber: '630', subtitle: 'Next: 10, 25 min', minutes: 18, departTime: '8:38am' },
      { type: 'walk', title: 'Walk to campus', subtitle: 'Monash University', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },

  // -------------------------------------------------------------------------
  // FRIDAY SPECIALS
  // -------------------------------------------------------------------------
  {
    name: '16-friday-treat',
    category: 'Special',
    description: 'Friday coffee treat',
    time: { hour: 8, min: 30 },
    date: { day: 3, month: 1, weekday: 5 }, // Friday
    weather: { temp: 21, condition: 'Perfect', umbrella: false },
    coffee: { enabled: true, decision: 'FRIDAY' },
    location: 'CARLTON',
    destination: 'CITY',
    arriveBy: '09:30',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • Lygon St', minutes: 2 },
      { type: 'coffee', title: 'Seven Seeds', subtitle: '[OK] FRIDAY TREAT', minutes: 10 },
      { type: 'walk', title: 'Walk to tram', subtitle: 'Lygon St stop', minutes: 1 },
      { type: 'tram', title: 'Tram 1 to City', routeNumber: '1', subtitle: 'Next: 3, 9 min', minutes: 8, departTime: '8:51am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 4 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },

  // -------------------------------------------------------------------------
  // TIMETABLE FALLBACK
  // -------------------------------------------------------------------------
  {
    name: '17-timetable-fallback',
    category: 'Data Source',
    description: 'Timetable fallback (no live data)',
    time: { hour: 7, min: 30 },
    date: { day: 1, month: 1, weekday: 2 },
    weather: { temp: 18, condition: 'Clear', umbrella: false },
    coffee: { enabled: false },
    location: 'COBURG',
    destination: 'CITY',
    arriveBy: '08:30',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Coburg Station', minutes: 4 },
      { type: 'train', title: 'Train to Parkville', subtitle: 'Upfield Line • via Metro Tunnel', minutes: 12, departTime: '7:42am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'timetable',
    metroTunnel: true
  },

  // -------------------------------------------------------------------------
  // AFTERNOON/EVENING
  // -------------------------------------------------------------------------
  {
    name: '18-afternoon-meeting',
    category: 'Time of Day',
    description: 'Afternoon meeting - 2pm arrival',
    time: { hour: 13, min: 0 },
    date: { day: 1, month: 1, weekday: 3 },
    weather: { temp: 26, condition: 'Warm', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'SOUTH MELBOURNE',
    destination: 'SOUTHBANK',
    arriveBy: '14:00',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • cafe', minutes: 3 },
      { type: 'coffee', title: 'Afternoon Coffee', subtitle: '[OK] TIME FOR COFFEE', minutes: 8 },
      { type: 'walk', title: 'Walk to tram', subtitle: 'Clarendon St', minutes: 2 },
      { type: 'tram', title: 'Tram 96 to Southbank', routeNumber: '96', subtitle: 'Next: 5, 11 min', minutes: 10, departTime: '1:23pm' },
      { type: 'walk', title: 'Walk to meeting', subtitle: 'Southbank', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '19-evening-commute',
    category: 'Time of Day',
    description: 'Evening commute home - 6pm',
    time: { hour: 17, min: 45 },
    date: { day: 1, month: 1, weekday: 4 },
    weather: { temp: 23, condition: 'Evening', umbrella: false },
    coffee: { enabled: false },
    location: 'COLLINS ST',
    destination: 'GLEN IRIS',
    arriveBy: '18:30',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From work • Flinders St Station', minutes: 5 },
      { type: 'train', title: 'Train to Glen Iris', subtitle: 'Glen Waverley Line • Next: 4, 12 min', minutes: 18, departTime: '5:58pm' },
      { type: 'walk', title: 'Walk home', subtitle: 'home', minutes: 6 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },

  // -------------------------------------------------------------------------
  // EDGE CASES
  // -------------------------------------------------------------------------
  {
    name: '20-minimal-journey',
    category: 'Edge Cases',
    description: 'Minimal 10 minute journey',
    time: { hour: 8, min: 50 },
    date: { day: 1, month: 1, weekday: 1 },
    weather: { temp: 20, condition: 'Fine', umbrella: false },
    coffee: { enabled: false },
    location: 'PARLIAMENT',
    destination: 'FLINDERS ST',
    arriveBy: '09:00',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Parliament Station', minutes: 2 },
      { type: 'train', title: 'Train to Flinders St', subtitle: 'City Loop • Next: 2, 8 min', minutes: 3, departTime: '8:54am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 3 }
    ],
    services: { ok: true },
    dataSource: 'live'
  },
  {
    name: '21-long-journey-90min',
    category: 'Edge Cases',
    description: 'Long 90 minute journey',
    time: { hour: 6, min: 30 },
    date: { day: 1, month: 1, weekday: 1 },
    weather: { temp: 14, condition: 'Cool', umbrella: false },
    coffee: { enabled: true, decision: 'YES' },
    location: 'PAKENHAM',
    destination: 'NORTH MELBOURNE',
    arriveBy: '08:30',
    legs: [
      { type: 'walk', title: 'Walk to Cafe', subtitle: 'From home • cafe', minutes: 5 },
      { type: 'coffee', title: 'Early Bird Cafe', subtitle: '[OK] TIME FOR COFFEE', minutes: 8 },
      { type: 'walk', title: 'Walk to station', subtitle: 'Pakenham Station', minutes: 6 },
      { type: 'train', title: 'Train to Arden', subtitle: 'Pakenham Line • via Metro Tunnel • Next: 10, 20 min', minutes: 55, departTime: '7:04am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'North Melbourne', minutes: 8 }
    ],
    services: { ok: true },
    dataSource: 'live',
    metroTunnel: true
  },
  {
    name: '22-vline-regional',
    category: 'Modes',
    description: 'V/Line regional train',
    time: { hour: 6, min: 0 },
    date: { day: 1, month: 1, weekday: 1 },
    weather: { temp: 10, condition: 'Cold', umbrella: false },
    coffee: { enabled: false },
    location: 'GEELONG',
    destination: 'SOUTHERN CROSS',
    arriveBy: '07:30',
    legs: [
      { type: 'walk', title: 'Walk to station', subtitle: 'From home • Geelong Station', minutes: 8 },
      { type: 'vline', title: 'V/Line to Southern Cross', subtitle: 'Geelong Line • Next: 15, 45 min', minutes: 55, departTime: '6:23am' },
      { type: 'walk', title: 'Walk to Office', subtitle: 'work', minutes: 5 }
    ],
    services: { ok: true },
    dataSource: 'live'
  }
];

// Add departure times to transit legs (from leave-now test)
function addDepartTimes(data, currentTime) {
  if (!data.journey_legs) return data;
  
  let cumulative = 0;
  const [timeStr, ampm] = currentTime.split(/(am|pm)/i);
  const [hours, mins] = timeStr.split(':').map(Number);
  let baseHour = hours + (ampm?.toLowerCase() === 'pm' && hours !== 12 ? 12 : 0);
  if (ampm?.toLowerCase() === 'am' && hours === 12) baseHour = 0;
  
  data.journey_legs = data.journey_legs.map(leg => {
    if (['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type)) {
      if (!leg.departTime) {
        const totalMins = baseHour * 60 + mins + cumulative;
        const h = Math.floor(totalMins / 60) % 24;
        const m = totalMins % 60;
        const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        leg.departTime = `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
      }
      // Add next 2 departures
      if (!leg.nextDepartures) {
        const freq1 = 4 + Math.floor(Math.random() * 6);
        const freq2 = freq1 + 6 + Math.floor(Math.random() * 6);
        leg.nextDepartures = [freq1, freq2];
      }
    }
    cumulative += leg.minutes || 0;
    return leg;
  });
  
  return data;
}

// ============================================================================
// RENDER FUNCTION
// ============================================================================

async function renderScenario(scenario) {
  const { time, date, weather, coffee, legs, services, dataSource } = scenario;
  
  // Calculate total journey time
  const totalMinutes = legs.reduce((sum, leg) => sum + (leg.minutes || 0), 0);
  
  // Build current time string
  const h12 = time.hour > 12 ? time.hour - 12 : (time.hour === 0 ? 12 : time.hour);
  const currentTime = `${h12}:${String(time.min).padStart(2, '0')}${time.hour >= 12 ? 'pm' : 'am'}`;
  
  // Convert legs to the format the renderer expects
  const journey_legs = legs.map(leg => {
    const baseLeg = {
      type: leg.type,
      minutes: leg.minutes
    };
    
    if (leg.type === 'walk') {
      baseLeg.to = leg.title.replace('Walk to ', '');
      if (leg.subtitle?.includes('From home')) baseLeg.fromHome = true;
      if (leg.subtitle?.includes('From work')) baseLeg.fromWork = true;
    } else if (leg.type === 'coffee') {
      baseLeg.location = leg.title;
      if (leg.subtitle?.includes('FRIDAY')) baseLeg.isFriday = true;
    } else if (['train', 'tram', 'bus', 'vline'].includes(leg.type)) {
      baseLeg.routeNumber = leg.routeNumber || '';
      baseLeg.origin = { name: leg.subtitle?.split(' • ')[0] || '' };
      baseLeg.destination = { name: leg.title.replace(/^(Train|Tram|Bus|V\/Line) to /, '') };
      baseLeg.lineName = leg.subtitle?.split(' • ')[0] || '';
      baseLeg.departTime = leg.departTime;
      if (leg.isDelayed) {
        baseLeg.isDelayed = true;
        baseLeg.delayMinutes = leg.delayMinutes;
      }
      if (leg.isDisruption) {
        baseLeg.isDisruption = true;
        baseLeg.disruptionType = 'buses-replacing';
      }
      // Parse Next: X, Y min from subtitle
      const nextMatch = leg.subtitle?.match(/Next: (\d+), (\d+)/);
      if (nextMatch) {
        baseLeg.nextDepartures = [parseInt(nextMatch[1]), parseInt(nextMatch[2])];
      }
    }
    
    return baseLeg;
  });
  
  // Build data in the format that works (from leave-now tests)
  const dashboardData = {
    current_time: currentTime,
    arrive_by: scenario.arriveBy,
    total_minutes: totalMinutes,
    temp: weather.temp,
    condition: weather.condition,
    umbrella: weather.umbrella,
    location: scenario.location,
    destination: scenario.destination,
    services_ok: services.ok,
    data_live: dataSource === 'live',
    coffee_enabled: coffee.enabled,
    delay: scenario.totalDelay || 0,
    journey_legs: journey_legs
  };
  
  // Add departure times
  addDepartTimes(dashboardData, currentTime);
  
  try {
    const buffer = await renderFullDashboard(dashboardData);
    const filepath = path.join(outputDir, `${scenario.name}.png`);
    fs.writeFileSync(filepath, buffer);
    
    console.log(`   [OK] ${scenario.name}`);
    console.log(`      ${scenario.category}: ${scenario.description}`);
    console.log(`      ${totalMinutes} min | ${legs.length} legs | ${dataSource} data`);
    if (scenario.metroTunnel) console.log(`      [Train] Metro Tunnel Route`);
    
    return { success: true, path: filepath };
  } catch (error) {
    console.log(`   [FAIL] ${scenario.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`Rendering ${scenarios.length} comprehensive scenarios...\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    const result = await renderScenario(scenario);
    if (result.success) passed++;
    else failed++;
    console.log();
  }
  
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log();
  console.log(`   Total:  ${scenarios.length} scenarios`);
  console.log(`   Passed: ${passed} [OK]`);
  console.log(`   Failed: ${failed} [FAIL]`);
  console.log();
  console.log(`   Output: ${outputDir}/`);
  console.log();
  
  if (failed === 0) {
    console.log('   ALL SCENARIOS RENDERED SUCCESSFULLY');
    console.log('   Ready for final review before spec lockdown.');
  }
  
  console.log('═'.repeat(70));
}

main().catch(console.error);
