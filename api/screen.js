/**
 * /api/screen - Full Dashboard PNG for TRMNL Webhook
 *
 * Renders the complete V15.0 dashboard as an 800×480 PNG image.
 *
 * Data Flow (per DEVELOPMENT-RULES.md v3):
 * User Config → Data Sources → Engines → Data Model → Renderer
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getDepartures, getDisruptions, getWeather } from '../src/services/opendata-client.js';
import CommuteCompute from '../src/engines/commute-compute.js';
import { getTransitApiKey, getPreferences, getUserState, setDeviceStatus } from '../src/data/kv-preferences.js';
import { renderFullDashboard, renderFullScreenBMP } from '../src/services/ccdash-renderer.js';
import { getScenario, getScenarioNames } from '../src/services/journey-scenarios.js';
import DepartureConfidence from '../src/engines/departure-confidence.js';
import LifestyleContext from '../src/engines/lifestyle-context.js';
import SleepOptimizer from '../src/engines/sleep-optimizer.js';
import AltTransit from '../src/engines/alt-transit.js';

// Engine cache - re-initialized when preferences change
let journeyEngine = null;
let lastPrefsHash = null;

/**
 * Get Melbourne local time
 * V13.6 FIX: Return actual Date object with correct timestamp
 * The timestamp (getTime()) must be accurate for timing calculations
 * Only use timezone conversion for display (hours, minutes)
 */
function getMelbourneTime() {
  // Return the actual current time - the timestamp is always UTC-correct
  // For display purposes, we extract hours/minutes with timezone consideration
  return new Date();
}

/**
 * Get Melbourne hours and minutes from a Date object
 * Use this for display, not for timestamp calculations
 */
function getMelbourneDisplayTime(date) {
  const melb = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23'  // V13.6 FIX: Use 0-23 hour format (not h24 which shows "24" for midnight)
  }).formatToParts(date);

  let hour = parseInt(melb.find(p => p.type === 'hour')?.value || '0');
  // V13.6 FIX: Handle edge case where hour might still be 24
  if (hour === 24) hour = 0;
  const minute = parseInt(melb.find(p => p.type === 'minute')?.value || '0');
  return { hour, minute };
}

/**
 * Format time as H:MM (12-hour format, Melbourne timezone)
 * Per Section 12: Business Logic - use 12-hour time format
 */
function formatTime(date) {
  const melb = getMelbourneDisplayTime(date);
  const hour12 = melb.hour % 12 || 12;  // Convert 0 to 12, 13-23 to 1-11
  return `${hour12}:${melb.minute.toString().padStart(2, '0')}`;
}

/**
 * V13.6: GTFS Stop ID to actual stop NAME mapping
 * Per DEVELOPMENT-RULES Section 23.1.1 - Actual stop names for display
 * These are official Transport Victoria stop names
 */
const GTFS_STOP_NAMES = {
  // Metro Train Stations
  '12179': 'South Yarra Station', '14289': 'Prahran Station', '14297': 'Windsor Station',
  '14233': 'Balaclava Station', '14247': 'Elsternwick Station', '14241': 'Brighton Beach Station',
  '14271': 'Sandringham Station', '12173': 'Richmond Station', '14243': 'Burnley Station',
  '14257': 'Hawthorn Station', '14246': 'Camberwell Station', '14253': 'Glen Iris Station',
  '14261': 'Malvern Station', '14245': 'Caulfield Station', '14244': 'Carnegie Station',
  '14267': 'Murrumbeena Station', '14259': 'Hughesdale Station', '14273': 'Oakleigh Station',
  '14249': 'Clifton Hill Station', '14251': 'Collingwood Station', '14269': 'Northcote Station',
  '14255': 'Footscray Station', '14283': 'Seddon Station', '14303': 'Yarraville Station',
  '14268': 'Newport Station', '14287': 'Spotswood Station', '14242': 'Brunswick Station',
  '14250': 'Coburg Station', '14252': 'Fawkner Station', '14256': 'Glenroy Station',
  '14240': 'Broadmeadows Station', '12204': 'Flinders Street Station', '12205': 'Flinders Street',
  '26001': 'Parliament Station', '26002': 'Melbourne Central Station',
  '26003': 'Flagstaff Station', '26004': 'Southern Cross Station',
  // Tram Stops (common ones)
  '2505': 'Toorak Rd/Chapel St', '2509': 'High St/Chapel St', '2513': 'Dandenong Rd/Chapel St',
  '2201': 'Church St/Swan St', '3001': 'Glenferrie Rd/Burwood Rd', '3010': 'Burke Rd/Riversdale Rd',
  '2101': 'Queens Pde/Hoddle St', '2103': 'Johnston St/Smith St', '1201': 'Sydney Rd/Brunswick',
  '2001': 'Flinders St/Swanston St', '3101': 'Fitzroy St/Acland St', '3201': 'Bay St/Port Melbourne',
  '3301': 'Clarendon St/South Melbourne'
};

/**
 * V13.6: Look up actual stop name by GTFS stop ID
 */
function getStopNameById(stopId) {
  if (!stopId) return null;
  return GTFS_STOP_NAMES[String(stopId)] || null;
}

/**
 * V13.6: Melbourne suburb to GTFS stop ID mapping
 * Per DEVELOPMENT-RULES Section 23.1.1 - Auto-detect stop IDs from address
 * These are CITYBOUND platform IDs for common Melbourne suburbs
 */
const MELBOURNE_STOP_IDS = {
  // Inner suburbs - Sandringham line
  'south yarra': { train: '12179', tram: '2505', line: 'Sandringham/Pakenham/Cranbourne' },
  'prahran': { train: '14289', tram: '2509', line: 'Sandringham' },
  'windsor': { train: '14297', tram: '2513', line: 'Sandringham' },
  'balaclava': { train: '14233', tram: '2519', line: 'Sandringham' },
  'ripponlea': { train: '14297', tram: null, line: 'Sandringham' },
  'elsternwick': { train: '14247', tram: null, line: 'Sandringham' },
  'brighton beach': { train: '14241', tram: null, line: 'Sandringham' },
  'sandringham': { train: '14271', tram: null, line: 'Sandringham' },

  // Inner east - Glen Waverley/Alamein
  'richmond': { train: '12173', tram: '2201', line: 'All lines' },
  'burnley': { train: '14243', tram: null, line: 'Glen Waverley/Alamein' },
  'hawthorn': { train: '14257', tram: '3001', line: 'Glen Waverley/Alamein' },
  'camberwell': { train: '14246', tram: '3010', line: 'Glen Waverley/Alamein' },
  'glen iris': { train: '14253', tram: null, line: 'Glen Waverley/Alamein' },

  // South east - Frankston/Pakenham/Cranbourne
  'malvern': { train: '14261', tram: '3008', line: 'Pakenham/Cranbourne/Frankston' },
  'caulfield': { train: '14245', tram: '3012', line: 'Pakenham/Cranbourne/Frankston' },
  'carnegie': { train: '14244', tram: null, line: 'Pakenham/Cranbourne' },
  'murrumbeena': { train: '14267', tram: null, line: 'Pakenham/Cranbourne' },
  'hughesdale': { train: '14259', tram: null, line: 'Pakenham/Cranbourne' },
  'oakleigh': { train: '14273', tram: null, line: 'Pakenham/Cranbourne' },

  // North - Hurstbridge/Mernda
  'clifton hill': { train: '14249', tram: '2101', line: 'Hurstbridge/Mernda' },
  'collingwood': { train: '14251', tram: '2103', line: 'Hurstbridge/Mernda' },
  'fitzroy north': { train: null, tram: '2107', line: 'Tram' },
  'northcote': { train: '14269', tram: '2115', line: 'Hurstbridge/Mernda' },
  'fairfield': { train: '14251', tram: null, line: 'Hurstbridge/Mernda' },
  'alphington': { train: '14231', tram: null, line: 'Hurstbridge/Mernda' },
  'ivanhoe': { train: '14261', tram: null, line: 'Hurstbridge' },

  // West - Werribee/Williamstown
  'footscray': { train: '14255', tram: null, line: 'Werribee/Williamstown/Sunbury' },
  'seddon': { train: '14283', tram: null, line: 'Werribee/Williamstown' },
  'yarraville': { train: '14303', tram: null, line: 'Werribee/Williamstown' },
  'newport': { train: '14268', tram: null, line: 'Werribee/Williamstown' },
  'spotswood': { train: '14287', tram: null, line: 'Williamstown' },

  // North west - Craigieburn/Sunbury/Upfield
  'brunswick': { train: '14242', tram: '1201', line: 'Upfield' },
  'coburg': { train: '14250', tram: null, line: 'Upfield' },
  'fawkner': { train: '14252', tram: null, line: 'Upfield' },
  'glenroy': { train: '14256', tram: null, line: 'Craigieburn' },
  'broadmeadows': { train: '14240', tram: null, line: 'Craigieburn' },

  // CBD/Inner
  'melbourne': { train: '12204', tram: '2001', line: 'All lines' },
  'cbd': { train: '12204', tram: '2001', line: 'All lines' },
  'carlton': { train: null, tram: '1105', line: 'Tram' },
  'fitzroy': { train: null, tram: '2105', line: 'Tram' },
  'st kilda': { train: null, tram: '3101', line: 'Tram' },
  'port melbourne': { train: null, tram: '3201', line: 'Tram' },
  'south melbourne': { train: null, tram: '3301', line: 'Tram' },
};

/**
 * V13.6: Auto-detect stop IDs from home address
 * Per DEVELOPMENT-RULES Section 23.1.1 - detectTrainStopId() fallback
 */
function detectStopIdsFromAddress(address) {
  if (!address) return { trainStopId: null, tramStopId: null };

  const addressLower = address.toLowerCase();

  // Search for matching suburb in the mapping
  for (const [suburb, ids] of Object.entries(MELBOURNE_STOP_IDS)) {
    if (addressLower.includes(suburb)) {
      return {
        trainStopId: ids.train,
        tramStopId: ids.tram,
        detectedSuburb: suburb,
        line: ids.line
      };
    }
  }

  // Per DEVELOPMENT-RULES Section 23.1.1: No hardcoded defaults
  // If no suburb match, return null → system uses scheduled/fallback timetable
  return {
    trainStopId: null,
    tramStopId: null,
    detectedSuburb: null,
    line: null
  };
}

/**
 * Format date parts for display
 */
function formatDateParts(date) {
  // V13.6 FIX: Use Melbourne timezone for date display
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  return {
    day: weekday,
    date: `${day} ${month}`
  };
}

/**
 * Initialize the Smart Journey Engine with KV preferences
 * Per Zero-Config: preferences come from Vercel KV (synced from Setup Wizard)
 */
async function getEngine() {
  // Load preferences from KV storage
  const kvPrefs = await getPreferences();
  const state = await getUserState();
  const transitKey = await getTransitApiKey();

  // Build preferences object for CommuteCompute
  const preferences = {
    ...kvPrefs,
    state,
    homeAddress: kvPrefs.addresses?.home || kvPrefs.locations?.home?.address || '',
    workAddress: kvPrefs.addresses?.work || kvPrefs.locations?.work?.address || '',
    cafeAddress: kvPrefs.addresses?.cafe || kvPrefs.locations?.cafe?.address || '',
    coffeeAddress: kvPrefs.addresses?.cafe || kvPrefs.locations?.cafe?.address || '',
    homeLocation: kvPrefs.locations?.home,
    workLocation: kvPrefs.locations?.work,
    cafeLocation: kvPrefs.locations?.cafe,
    arrivalTime: kvPrefs.journey?.arrivalTime || '09:00',
    coffeeEnabled: kvPrefs.journey?.coffeeEnabled !== false,
    api: { key: transitKey },
    transitApiKey: transitKey
  };

  // Create hash to detect preference changes
  const prefsHash = JSON.stringify({ state, home: preferences.homeAddress, work: preferences.workAddress });

  // Re-initialize engine if preferences changed or no engine exists
  if (!journeyEngine || prefsHash !== lastPrefsHash) {

    journeyEngine = new CommuteCompute();
    await journeyEngine.initialize(preferences);
    lastPrefsHash = prefsHash;
  }

  return journeyEngine;
}

/**
 * Build journey legs from engine route with live transit data
 * Now includes cumulative timing and DEPART times (v1.18)
 * V13.6: Added stopIds for actual stop name lookup
 */
function buildJourneyLegs(route, transitData, coffeeDecision, currentTime, locations = {}, stopIds = {}) {
  if (!route?.legs) return [];

  const legs = [];
  let legNumber = 1;
  let cumulativeMinutes = 0;  // Minutes from journey start

  // V13.6: Extract suburb/location name from address for stop names
  // e.g., "42 Chapel St, South Yarra VIC 3141" → "South Yarra"
  const extractSuburb = (address) => {
    if (!address) return null;
    // Try to extract suburb from Australian address format
    const parts = address.split(',');
    if (parts.length >= 2) {
      // Second part usually contains suburb + state + postcode
      const suburbia = parts[1].trim();
      // Extract suburb before VIC/NSW etc
      const match = suburbia.match(/^([A-Za-z\s]+?)(?:\s+(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)|\d{4})/);
      if (match) return match[1].trim();
      // Fallback: just use first word of second part
      return suburbia.split(/\s+/)[0];
    }
    return null;
  };

  // V13.6: Extract location names for both home AND cafe
  // Per CommuteCompute pattern: link stops to nearest origin location
  const homeSuburb = extractSuburb(locations.home?.address) || 'Home';
  const cafeSuburb = extractSuburb(locations.cafe?.address) ||
                     locations.cafe?.name?.split(',')[0] ||
                     locations.cafe?.name || null;

  // V13.6: Track current origin location as we iterate through legs
  // This determines which location's name to use for transit stops
  let currentOrigin = 'home'; // Start from home

  // Parse current time for DEPART calculation
  // V13.6 FIX: Use actual Date for timestamp, Melbourne display time for hours/minutes
  const now = currentTime || new Date();
  const melbTime = getMelbourneDisplayTime(now);
  const nowMins = melbTime.hour * 60 + melbTime.minute;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const prevLeg = i > 0 ? route.legs[i - 1] : null;

    // V13.6: Add 2 minute buffer to walking legs for realistic timing
    const isWalkLeg = leg.type === 'walk';
    const rawDuration = leg.minutes || leg.durationMinutes || 0;
    const legDuration = isWalkLeg ? rawDuration + 2 : rawDuration;

    // V13.6: Track origin transitions based on walk leg destinations
    // Walk TO cafe means we're now at cafe; walk FROM cafe to transit means use cafe suburb
    if (isWalkLeg) {
      if (leg.to === 'cafe' || leg.from === 'home' && leg.to === 'cafe') {
        currentOrigin = 'cafe';
      } else if (leg.from === 'cafe') {
        currentOrigin = 'cafe'; // Coming from cafe
      } else if (leg.from === 'home' || i === 0) {
        currentOrigin = 'home'; // First leg or explicitly from home
      }
    }

    // V13.6: Determine which location to derive stop names from
    // Per CommuteCompute pattern: link to nearest origin (home or cafe)
    const originSuburb = currentOrigin === 'cafe' && cafeSuburb ? cafeSuburb : homeSuburb;
    const derivedTramStop = `${originSuburb} Tram Stop`;
    const derivedStation = `${originSuburb} Station`;

    // V13.6: Walk leg destinations - show where we're walking TO
    // Priority: 1) GTFS lookup by stopId, 2) suburb-derived fallback
    if (leg.to === 'tram stop') {
      leg.stopName = getStopNameById(stopIds.tramStopId) || derivedTramStop;
    }
    if (leg.to === 'train platform' || leg.to === 'station') {
      leg.stationName = getStopNameById(stopIds.trainStopId) || derivedStation;
    }

    // V13.6: Transit leg origins - use ACTUAL stop name from GTFS mapping
    // Priority: GTFS lookup FIRST (most reliable), then CommuteCompute if not generic
    if (leg.type === 'tram') {
      // Check if previous leg was walk from cafe (for fallback derivation)
      const fromCafe = prevLeg?.type === 'walk' && (prevLeg?.from === 'cafe' || currentOrigin === 'cafe');
      const stopSuburb = fromCafe && cafeSuburb ? cafeSuburb : homeSuburb;

      // V13.6 FIX: Priority hierarchy - GTFS lookup FIRST (most reliable)
      const genericNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'tram'];
      const isGeneric = (name) => !name || genericNames.includes(name.toLowerCase().trim());

      const gtfsName = getStopNameById(stopIds.tramStopId);        // 1) GTFS lookup (most reliable)
      const commuteComputeName = leg.origin?.name;                    // 2) CommuteCompute provided
      const suburbName = stopSuburb ? `${stopSuburb} Tram Stop` : null; // 3) Suburb-derived

      // Use first non-generic name, or first available if all generic
      const actualName = gtfsName ||
                         (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
                         suburbName ||
                         commuteComputeName ||  // Use even if generic as last resort
                         null;

      leg.originStop = actualName;
    }
    if (leg.type === 'train') {
      // Check if previous leg was walk from cafe (for fallback derivation)
      const fromCafe = prevLeg?.type === 'walk' && (prevLeg?.from === 'cafe' || currentOrigin === 'cafe');
      const stopSuburb = fromCafe && cafeSuburb ? cafeSuburb : homeSuburb;

      // V13.6 FIX: Priority hierarchy - GTFS lookup FIRST (most reliable)
      // Generic names like "Station" from CommuteCompute should not override GTFS actual names
      const genericNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'train'];
      const isGeneric = (name) => !name || genericNames.includes(name.toLowerCase().trim());

      const gtfsName = getStopNameById(stopIds.trainStopId);       // 1) GTFS lookup (most reliable)
      const commuteComputeName = leg.origin?.name;                    // 2) CommuteCompute provided
      const suburbName = stopSuburb ? `${stopSuburb} Station` : null; // 3) Suburb-derived

      // Use first non-generic name, or first available if all generic
      const actualName = gtfsName ||
                         (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
                         suburbName ||
                         commuteComputeName ||  // Use even if generic as last resort
                         null;

      leg.originStation = actualName;
    }

    // Update origin after coffee leg (we're now leaving from cafe location)
    if (leg.type === 'coffee') {
      currentOrigin = 'cafe';
    }

    // Calculate when user arrives at this leg's starting point
    const arriveAtLegMins = nowMins + cumulativeMinutes;
    const arriveAtLegH = Math.floor(arriveAtLegMins / 60) % 24;
    const arriveAtLegM = arriveAtLegMins % 60;

    // Format as 12-hour time
    const arriveH12 = arriveAtLegH % 12 || 12;
    const arriveAmPm = arriveAtLegH >= 12 ? 'pm' : 'am';
    const arriveTime = `${arriveH12}:${arriveAtLegM.toString().padStart(2, '0')}${arriveAmPm}`;

    // V13.6: Calculate departure time and minutes for transit legs
    // MINUTES BOX = minutes from NOW to departure
    // DEPART COLUMN = clock time of that departure
    let departTime = arriveTime; // Default to arrival time
    let minutesToDeparture = legDuration; // Default to leg duration
    let actualDepartureMs = null;
    let nextDepartureTimesMs = null;
    const isTransitLeg = ['train', 'tram', 'bus'].includes(leg.type);
    const nowMs = now.getTime();
    const liveData = isTransitLeg ? findMatchingDeparture(leg, transitData, nowMs) : null;
    const arrivalAtStopMs = nowMs + (cumulativeMinutes * 60000);

    // For transit legs, find first live departure AFTER user arrives at stop
    if (isTransitLeg && liveData) {
      const hasDepTimes = liveData.allDepartureTimesMs?.length > 0;

      if (hasDepTimes) {
        // Filter to departures after user arrives at stop
        const catchableDepartures = liveData.allDepartureTimesMs.filter(depMs => depMs >= arrivalAtStopMs);
        if (catchableDepartures.length > 0) {
          actualDepartureMs = catchableDepartures[0];
          nextDepartureTimesMs = catchableDepartures.slice(0, 5);
        }
      } else if (liveData.departureTimeMs && liveData.departureTimeMs >= arrivalAtStopMs) {
        actualDepartureMs = liveData.departureTimeMs;
        nextDepartureTimesMs = [actualDepartureMs];
      }

      if (actualDepartureMs) {
        // Minutes from NOW to that departure (for the minutes box)
        let rawMinutes = Math.round((actualDepartureMs - nowMs) / 60000);

        // V13.6 SANITY CHECK: If minutes > 60, timestamp is likely wrong (timezone issue)
        // Fall back to leg duration or mock value
        if (rawMinutes > 60 || rawMinutes < 0) {
          rawMinutes = cumulativeMinutes + (legDuration || 5);
        }
        minutesToDeparture = rawMinutes;

        // V13.6 FIX: Format departure as Melbourne clock time
        const departDate = new Date(nowMs + minutesToDeparture * 60000);  // Use corrected minutes
        const departMelb = getMelbourneDisplayTime(departDate);
        const departH12 = departMelb.hour % 12 || 12;
        const departAmPm = departMelb.hour >= 12 ? 'pm' : 'am';
        departTime = `${departH12}:${departMelb.minute.toString().padStart(2, '0')}${departAmPm}`;

      } else if (liveData.minutes !== undefined) {
        // Fallback: use minutes from live data (already from now)
        minutesToDeparture = liveData.minutes;
        const departMs = nowMs + (liveData.minutes * 60000);
        // V13.6 FIX: Format departure as Melbourne clock time
        const departDate = new Date(departMs);
        const departMelb = getMelbourneDisplayTime(departDate);
        const departH12 = departMelb.hour % 12 || 12;
        const departAmPm = departMelb.hour >= 12 ? 'pm' : 'am';
        departTime = `${departH12}:${departMelb.minute.toString().padStart(2, '0')}${departAmPm}`;
        nextDepartureTimesMs = [departMs];

      }
    }

    // V13.6: Calculate the actual journey contribution for this leg
    // For display: show minutes from NOW to departure
    // For journey calc: use wait time + transit duration (not double-counting)
    let journeyContribution = legDuration;
    if (isTransitLeg && actualDepartureMs) {
      // Wait time at stop = departure time - arrival at stop time
      const waitTimeMs = actualDepartureMs - arrivalAtStopMs;
      const waitMinutes = Math.max(0, Math.round(waitTimeMs / 60000));
      // Journey contribution = wait time + original transit duration from route
      const transitDuration = leg.minutes || leg.durationMinutes || 5;
      journeyContribution = waitMinutes + transitDuration;
    }

    const baseLeg = {
      number: legNumber++,
      type: leg.type,
      title: buildLegTitle(leg),
      subtitle: buildLegSubtitle(leg, transitData),
      minutes: minutesToDeparture, // V13.6: Minutes from NOW to departure (for time box display)
      journeyContribution,         // V13.6: Actual contribution to journey time (for arrival calc)
      state: 'normal',
      // Timing fields
      cumulativeMinutes,           // Minutes from journey start to reach this leg
      catchInMinutes: cumulativeMinutes, // Same as cumulative for clarity
      arriveTime,                  // When user arrives at this leg's start point
      departTime,                  // V13.6: Actual departure clock time
      nextDepartureTimesMs,        // V13.6: Catchable departures in ms (for Next: x,y,z)
      actualDepartureMs,           // V13.6: Actual departure timestamp for stable arrival calc
      // V13.6: Stop/station names for renderer display
      originStop: leg.originStop,
      originStation: leg.originStation,
      stopName: leg.stopName,
      stationName: leg.stationName,
      lineName: leg.lineName || liveData?.lineName,
      routeNumber: leg.routeNumber || liveData?.routeNumber
    };

    // Handle coffee leg state based on coffee decision
    // V13 Spec Section 5.5: Coffee subtitle must be "[OK] TIME FOR COFFEE" or "[X] SKIP - Running late"
    if (leg.type === 'coffee') {
      baseLeg.canGet = coffeeDecision.canGet;  // Pass to renderer for styling
      if (!coffeeDecision.canGet) {
        baseLeg.state = 'skip';
        baseLeg.status = 'skipped';  // Also set status for renderer
        baseLeg.cafeClosed = coffeeDecision.cafeClosed;
        baseLeg.skipReason = coffeeDecision.skipReason;
        // Show different message if cafe is closed vs running late
        baseLeg.subtitle = coffeeDecision.cafeClosed ? '[X] CLOSED -- Cafe not open' : '[X] SKIP -- Running late';
        legNumber--; // Don't increment for skipped leg
      } else {
        baseLeg.subtitle = '[OK] TIME FOR COFFEE';
      }
    }

    // V13.6: Process transit leg delays and calculate "Next: x,y,z" from NOW
    if (isTransitLeg && liveData) {
      // Handle delays
      if (liveData.isDelayed) {
        baseLeg.state = 'delayed';
        baseLeg.status = 'delayed';
        baseLeg.delayMinutes = liveData.delayMinutes || liveData.delay;
        baseLeg.subtitle = `+${baseLeg.delayMinutes} MIN • ${baseLeg.subtitle}`;
      }

      // V13.6: Calculate "Next: x, y, z" as minutes from NOW
      if (baseLeg.nextDepartureTimesMs?.length > 0) {
        baseLeg.nextDepartures = baseLeg.nextDepartureTimesMs.map(depMs =>
          Math.round((depMs - nowMs) / 60000)
        );
      } else if (liveData.nextDepartures) {
        baseLeg.nextDepartures = liveData.nextDepartures;
      }

      // V13.6: Apply disruption alerts ONLY if they EXPLICITLY affect this leg
      // Must have verifiable route match - planned works elsewhere are NOT shown
      if (transitData.disruptions && transitData.disruptions.length > 0) {
        const matchingDisruption = transitData.disruptions.find(d => {
          // Check if disruption affects this route type
          const routeTypeMatch =
            (leg.type === 'train' && (d.mode === 'metro' || d.mode === 'train')) ||
            (leg.type === 'tram' && d.mode === 'tram') ||
            (leg.type === 'bus' && d.mode === 'bus');
          if (!routeTypeMatch) return false;

          // V13.6 STRICT: ONLY match if disruption explicitly lists this leg's route
          // If no affectedRoutes, DO NOT match (can't verify it affects this leg)
          if (!d.affectedRoutes || d.affectedRoutes.length === 0) {
            // No specific routes listed = cannot verify this leg is affected
            // Even "severe" alerts may only affect one line, not this user's route
            return false;
          }

          // V13.6 STRICT: Only match on GTFS line codes, not partial strings
          // GTFS route IDs: "aus:vic:vic-02-WER:" (Werribee), "aus:vic:vic-02-SHM:" (Sandringham)
          const legRoute = leg.routeNumber?.toString() || '';
          const legLine = leg.lineName?.toLowerCase() || '';

          // Line name to GTFS code mapping
          const lineCodes = {
            'sandringham': 'shm', 'frankston': 'fkn', 'pakenham': 'pkm',
            'cranbourne': 'cbe', 'glen waverley': 'glw', 'alamein': 'alm',
            'belgrave': 'bel', 'lilydale': 'lil', 'hurstbridge': 'hbe',
            'mernda': 'mer', 'craigieburn': 'crb', 'sunbury': 'sun',
            'upfield': 'upf', 'werribee': 'wer', 'williamstown': 'wil'
          };

          return d.affectedRoutes.some(route => {
            const routeUpper = route.toUpperCase();

            // Match tram by exact route number
            if (legRoute && leg.type === 'tram') {
              return routeUpper.includes(`-${legRoute}:`) || routeUpper.includes(`-${legRoute}-`);
            }

            // Match train by GTFS line code ONLY
            if (leg.type === 'train' && legLine) {
              const legCode = (lineCodes[legLine] || '').toUpperCase();
              if (legCode) {
                // Must match the line code in GTFS format: "-XXX:" or "-XXX-"
                return routeUpper.includes(`-${legCode}:`) || routeUpper.includes(`-${legCode}-`);
              }
            }

            // No match - be conservative and don't show unverifiable alerts
            return false;
          });
        });

        if (matchingDisruption) {
          baseLeg.hasAlert = true;
          baseLeg.serviceAlert = matchingDisruption.headerText || matchingDisruption.description;
          baseLeg.alertText = matchingDisruption.description || matchingDisruption.headerText;
          // V13.6: Format as "TRAM 58 +5 MIN" or "TRAIN DELAYED"
          const routeLabel = leg.routeNumber ? `${leg.type.toUpperCase()} ${leg.routeNumber}` : leg.type.toUpperCase();
          if (baseLeg.delayMinutes) {
            baseLeg.alertText = `${routeLabel} +${baseLeg.delayMinutes} MIN`;
          } else if (matchingDisruption.type === 'suspension' || matchingDisruption.type === 'cancelled') {
            baseLeg.status = 'suspended';
            baseLeg.state = 'suspended';
            baseLeg.alertText = `${routeLabel} SUSPENDED`;
          } else {
            baseLeg.alertText = matchingDisruption.headerText || `${routeLabel} DISRUPTED`;
          }
        }
      }
    }

    legs.push(baseLeg);

    // V13.6: Accumulate journey time using actual contribution (including wait times)
    if (baseLeg.state !== 'skip') {
      cumulativeMinutes += journeyContribution;
    }
  }

  return legs;
}

/**
 * Build leg title with actual location names (v1.18 fix)
 */
function buildLegTitle(leg) {
  // Capitalize first letter helper
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  // Extract short name from address (e.g., "Norman South Yarra, Toorak Road" → "Norman")
  const extractName = (location) => {
    if (!location) return null;
    // If it has a name field, use it
    if (location.name) return location.name;
    // If it's a string address, extract first part before comma
    if (typeof location === 'string') {
      const parts = location.split(',');
      return parts[0]?.trim() || location;
    }
    // If it has address field, extract name from it
    if (location.address) {
      const parts = location.address.split(',');
      return parts[0]?.trim() || location.address;
    }
    return null;
  };

  switch (leg.type) {
    case 'walk': {
      const dest = leg.to || leg.destination?.name;
      // Use actual destination name if available
      if (leg.destinationName) return `Walk to ${leg.destinationName}`;
      if (dest === 'cafe' && leg.cafeName) return `Walk to ${leg.cafeName}`;
      if (dest === 'cafe') return 'Walk to Cafe';
      if (dest === 'work') return 'Walk to Office';
      if (dest === 'tram stop' && leg.stopName) return `Walk to ${leg.stopName}`;
      if (dest === 'train platform' && leg.stationName) return `Walk to ${leg.stationName}`;
      if (dest === 'tram stop') return 'Walk to Tram Stop';
      if (dest === 'train platform') return 'Walk to Platform';
      return `Walk to ${cap(dest) || 'Station'}`;
    }
    case 'coffee': {
      // Extract cafe name from location data
      const cafeName = extractName(leg.location) ||
                       leg.cafeName ||
                       leg.name ||
                       'Cafe';
      return `Coffee at ${cafeName}`;
    }
    case 'train': {
      // Include line name if available (e.g., "Sandringham Line to Parliament")
      const lineName = leg.lineName || leg.routeNumber || '';
      const destName = leg.destination?.name || 'City';
      if (lineName) {
        return `${lineName} to ${destName}`;
      }
      return `Train to ${destName}`;
    }
    case 'tram': {
      const num = leg.routeNumber ? `Tram ${leg.routeNumber}` : 'Tram';
      const destName = leg.destination?.name || 'City';
      return `${num} to ${destName}`;
    }
    case 'bus': {
      const num = leg.routeNumber ? `Bus ${leg.routeNumber}` : 'Bus';
      const destName = leg.destination?.name || 'City';
      return `${num} to ${destName}`;
    }
    default:
      return leg.title || 'Continue';
  }
}

/**
 * Build leg subtitle with live data and origin/stop names (v1.18 fix)
 */
function buildLegSubtitle(leg, transitData) {
  // V13.6: Helper to get explicit stop/station name from leg config
  // Priority: our derived names FIRST, then route data, filtering out generic fallbacks
  const isGenericName = (name) => {
    if (!name) return true;
    const generic = ['station', 'tram stop', 'bus stop', 'platform', 'stop'];
    return generic.includes(name.toLowerCase().trim());
  };

  const getStopName = () => {
    // V13.6: Check our derived names FIRST (originStation/originStop)
    // These are set from suburb extraction and should be specific
    if (leg.originStation && !isGenericName(leg.originStation)) return leg.originStation;
    if (leg.originStop && !isGenericName(leg.originStop)) return leg.originStop;
    if (leg.stopName && !isGenericName(leg.stopName)) return leg.stopName;
    if (leg.stationName && !isGenericName(leg.stationName)) return leg.stationName;
    // Then check route-provided names
    if (leg.origin?.name && !isGenericName(leg.origin?.name)) return leg.origin.name;
    if (leg.from?.name && !isGenericName(leg.from?.name)) return leg.from.name;
    if (leg.fromStop && !isGenericName(leg.fromStop)) return leg.fromStop;
    // Return first non-null even if generic (better than nothing)
    return leg.originStation || leg.originStop || leg.stopName ||
           leg.stationName || leg.origin?.name || null;
  };

  switch (leg.type) {
    case 'walk': {
      // V13.6: Duration already includes +2 buffer from buildJourneyLegs
      const mins = leg.minutes || leg.durationMinutes || 0;
      // V13.6: Show walk destination details with explicit names
      if (leg.to === 'work') return `${mins} min walk`;
      if (leg.to === 'cafe') return 'From home';
      // V13.6: Show specific origin/destination if available
      const originName = getStopName();
      if (originName) return `From ${originName}`;
      if (leg.fromStation) return `From ${leg.fromStation}`;
      return `${mins} min walk`;
    }
    case 'coffee':
      return 'TIME FOR COFFEE';
    case 'train': {
      // V13.6: Show line name + origin STATION NAME + next departures
      // e.g., "Sandringham • South Yarra Station • Next: 5, 12 min LIVE"
      const parts = [];
      const lineName = leg.lineName || leg.routeNumber || '';
      // V13.6: Prioritize explicit station name from config
      const originName = getStopName() || 'Station';

      if (lineName) parts.push(lineName);
      parts.push(originName);  // V13.6: Always show station name

      const departures = findDeparturesForLeg(leg, transitData);
      if (departures.length > 0) {
        const times = departures.slice(0, 3).map(d => d.minutes).join(', ');
        // V13.6: Show LIVE tag if data is live
        const liveTag = departures[0]?.isLive ? ' LIVE' : '';
        parts.push(`Next: ${times} min${liveTag}`);
      }

      return parts.join(' • ');
    }
    case 'tram': {
      // V13.6: Show route + origin STOP NAME + next departures
      // e.g., "Toorak Rd/Chapel St • Next: 4, 12 min LIVE"
      const parts = [];
      // V13.6: Prioritize explicit stop name from config
      const originName = getStopName() || 'Tram Stop';

      parts.push(originName);  // V13.6: Always show stop name

      const departures = findDeparturesForLeg(leg, transitData);
      if (departures.length > 0) {
        const times = departures.slice(0, 3).map(d => d.minutes).join(', ');
        // V13.6: Show LIVE tag if data is live
        const liveTag = departures[0]?.isLive ? ' LIVE' : '';
        parts.push(`Next: ${times} min${liveTag}`);
      }

      return parts.join(' • ');
    }
    case 'bus': {
      const parts = [];
      // V13.6: Prioritize explicit stop name from config
      const originName = getStopName() || 'Bus Stop';

      parts.push(originName);  // V13.6: Always show stop name

      const departures = findDeparturesForLeg(leg, transitData);
      if (departures.length > 0) {
        const times = departures.slice(0, 3).map(d => d.minutes).join(', ');
        // V13.6: Show LIVE tag if data is live
        const liveTag = departures[0]?.isLive ? ' LIVE' : '';
        parts.push(`Next: ${times} min${liveTag}`);
      }

      return parts.join(' • ');
    }
    default:
      return leg.subtitle || '';
  }
}

/**
 * Find matching departure from live data
 * V13.6: Enhanced to return all upcoming departure times for live countdown
 * @param {Object} leg - The journey leg
 * @param {Object} transitData - Live transit data
 * @param {number} nowMs - Current time in milliseconds (for consistent timing)
 */
function findMatchingDeparture(leg, transitData, nowMs = Date.now()) {
  if (!transitData) return null;

  const departures = leg.type === 'train' ? transitData.trains :
                     leg.type === 'tram' ? transitData.trams :
                     leg.type === 'bus' ? transitData.buses : [];

  if (!departures?.length) return null;

  // Find by route number if available
  let matchedDepartures = departures;
  if (leg.routeNumber) {
    const routeMatches = departures.filter(d =>
      d.routeNumber?.toString() === leg.routeNumber.toString()
    );
    if (routeMatches.length > 0) {
      matchedDepartures = routeMatches;
    }
  }

  // Get first departure as primary, but include all departure times
  const primary = matchedDepartures[0];
  if (primary) {
    // V13.6: Collect all departure times in milliseconds for live countdown
    // If departureTimeMs exists, use it; otherwise calculate from minutes
    const depTimes = [];
    for (const d of matchedDepartures.slice(0, 5)) {
      if (d.departureTimeMs) {
        depTimes.push(d.departureTimeMs);
      } else if (typeof d.minutes === 'number') {
        depTimes.push(nowMs + (d.minutes * 60000));
      }
    }
    primary.allDepartureTimesMs = depTimes;
    primary.nextDepartures = matchedDepartures.slice(0, 5).map(d => d.minutes).filter(m => m !== undefined);
  }

  return primary;
}

/**
 * Find all departures for a leg type
 */
function findDeparturesForLeg(leg, transitData) {
  if (!transitData) return [];

  return leg.type === 'train' ? (transitData.trains || []) :
         leg.type === 'tram' ? (transitData.trams || []) :
         leg.type === 'bus' ? (transitData.buses || []) : [];
}

/**
 * Calculate total journey time
 * V13.6: Use journeyContribution (not minutes) to avoid double-counting
 * - minutes = minutes from NOW to departure (for display)
 * - journeyContribution = actual time this leg adds to journey (wait + transit)
 */
function calculateTotalMinutes(legs) {
  return legs
    .filter(l => l.state !== 'skip')
    .reduce((total, leg) => total + (leg.journeyContribution || leg.minutes || 0), 0);
}

/**
 * Determine status type from journey state
 * V13.6: Only show alerts that affect user's actual route legs
 * Planned works or general notices that don't affect commute are NOT alerts
 */
function getStatusType(legs, disruptions) {
  // Check for suspended services on route legs
  if (legs.some(l => l.state === 'suspended' || l.state === 'cancelled')) {
    return 'disruption';
  }

  // Check for delays on route legs
  if (legs.some(l => l.state === 'delayed')) {
    return 'delay';
  }

  // V13.6: Check for alerts that specifically affect route legs (hasAlert flag)
  // This is set when a disruption matches the leg's route type and number
  if (legs.some(l => l.hasAlert)) {
    return 'disruption';
  }

  // V13.6: DO NOT show generic disruption status if no leg is affected
  // Planned works or notices that don't affect this specific commute are ignored
  return 'normal';
}

/**
 * Calculate arrival time
 */
function calculateArrivalTime(now, totalMinutes) {
  const arrival = new Date(now.getTime() + totalMinutes * 60000);
  return formatTime(arrival);
}

/**
 * V13.6: Filter transit legs when walking is faster or no transit available
 * Per user requirement: If walk_time + 5 < wait_time + transit_duration, exclude transit
 * Also excludes transit legs when no departures are available (e.g., nighttime)
 *
 * @param {Object} route - Route with legs array
 * @param {Object} transitData - Live transit data (trains, trams, buses)
 * @param {number} walkSpeedKmPerHour - Average walking speed (default 4.5 km/h)
 * @returns {Object} - { route: filtered route, transitNotice: string|null }
 */
function filterUnavailableTransitLegs(route, transitData, walkSpeedKmPerHour = 4.5) {
  if (!route?.legs) return { route, transitNotice: null };

  const filteredLegs = [];
  let skipNextWalk = false;
  let transitNotice = null;
  let removedTransitTypes = [];

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const nextLeg = route.legs[i + 1];
    const prevLeg = i > 0 ? route.legs[i - 1] : null;

    // Check if this is a transit leg
    const isTransitLeg = ['train', 'tram', 'bus'].includes(leg.type);

    if (isTransitLeg) {
      // Get departures for this transit type
      const departures = leg.type === 'train' ? transitData.trains :
                         leg.type === 'tram' ? transitData.trams :
                         leg.type === 'bus' ? transitData.buses : [];

      // V13.6: Check if any departures are available
      const hasDepartures = departures && departures.length > 0;
      const isLastService = departures && departures.length === 1;

      // Check if prior walk leg is longer than transit wait time
      const priorWalkTime = prevLeg?.type === 'walk' ? (prevLeg.minutes || prevLeg.durationMinutes || 0) : 0;
      const firstDepMinutes = departures?.[0]?.minutes || 0;
      const walkLongerThanWait = priorWalkTime > firstDepMinutes;

      if (!hasDepartures) {
        // No transit available - skip this leg
        removedTransitTypes.push(leg.type);

        // V13.6: Set notice for no transit options with walk time calculation
        // Calculate total walk time by summing all walk legs and estimating transit distances
        const transitWalkEquivalent = (leg.minutes || leg.durationMinutes || 10) * 2.5; // Transit ~= 2.5x walk time
        transitNotice = 'NO PUBLIC TRANSIT OPTIONS AVAILABLE';

        // If previous leg was walk to this transit, we need to merge or skip it
        skipNextWalk = false;  // Reset - we're removing the transit

        // If next leg is a walk FROM this transit, merge it with the walk TO
        if (nextLeg?.type === 'walk' && prevLeg?.type === 'walk') {
          // Merge the two walk legs plus transit walking equivalent
          const mergedWalk = {
            ...prevLeg,
            minutes: (prevLeg.minutes || 0) + Math.round(transitWalkEquivalent) + (nextLeg.minutes || 0),
            durationMinutes: (prevLeg.durationMinutes || 0) + Math.round(transitWalkEquivalent) + (nextLeg.durationMinutes || 0),
            to: nextLeg.to,
            title: `Walk to ${nextLeg.to || 'destination'}`,
            isFullWalk: true  // V13.6: Flag that this replaces transit
          };
          // Remove the last walk we added and add merged
          if (filteredLegs.length > 0 && filteredLegs[filteredLegs.length - 1].type === 'walk') {
            filteredLegs.pop();
          }
          filteredLegs.push(mergedWalk);
          i++; // Skip the next walk leg
        }
        continue; // Skip adding this transit leg
      }

      // V13.6: Check if walk time > transit wait AND it's the last service
      if (walkLongerThanWait && isLastService) {
        transitNotice = 'NO OTHER PUBLIC TRANSIT OPTIONS AVAILABLE';
        // Still include the leg but mark it
        leg.isLastService = true;
        leg.noOtherOptions = true;
      }

      // V13.6: Check if walking would be faster
      // Calculate: walk_time + 5 < wait_time + transit_duration
      const firstDep = departures[0];
      if (firstDep) {
        const waitMinutes = firstDep.minutes || 0;
        const transitDuration = leg.minutes || leg.durationMinutes || 10;
        const totalTransitTime = waitMinutes + transitDuration;

        // Estimate walk time for same distance (rough: transit distance ~= 2x walk time)
        // This is a heuristic - actual walk distance should come from route
        const estimatedWalkTime = leg.walkDistanceMinutes || (transitDuration * 2.5);

        if (estimatedWalkTime + 5 < totalTransitTime) {
          // Similar merge logic as above
          continue;
        }
      }
    }

    // Add leg if not filtered out
    if (!(skipNextWalk && leg.type === 'walk')) {
      filteredLegs.push(leg);
    }
    skipNextWalk = false;
  }

  // V13.6: Calculate total walk time if all transit was removed
  let totalWalkTime = null;
  if (removedTransitTypes.length > 0 && transitNotice) {
    totalWalkTime = filteredLegs
      .filter(l => l.type === 'walk')
      .reduce((sum, l) => sum + (l.minutes || l.durationMinutes || 0), 0);

    // Update notice to include walk time
    if (totalWalkTime > 0) {
      transitNotice = `NO PUBLIC TRANSIT • WALK ${totalWalkTime} MIN`;
    }
  }

  // V13.6: Return filtered route with transit availability notice
  return {
    route: { ...route, legs: filteredLegs },
    transitNotice,
    removedTransitTypes,
    totalWalkTime
  };
}

/**
 * Random Melbourne locations for dynamic journey generation
 */
const RANDOM_LOCATIONS = {
  homes: [
    { address: '42 Brunswick St, Fitzroy', lat: -37.8025, lon: 144.9780, suburb: 'Fitzroy' },
    { address: '15 Chapel St, Windsor', lat: -37.8556, lon: 144.9936, suburb: 'Windsor' },
    { address: '88 Smith St, Collingwood', lat: -37.8010, lon: 144.9875, suburb: 'Collingwood' },
    { address: '120 Acland St, St Kilda', lat: -37.8678, lon: 144.9803, suburb: 'St Kilda' },
    { address: '7 Lygon St, Carlton', lat: -37.7995, lon: 144.9663, suburb: 'Carlton' },
    { address: '33 Swan St, Richmond', lat: -37.8247, lon: 144.9995, suburb: 'Richmond' },
    { address: '56 High St, Northcote', lat: -37.7695, lon: 144.9998, suburb: 'Northcote' },
    { address: '21 Glenferrie Rd, Hawthorn', lat: -37.8220, lon: 145.0365, suburb: 'Hawthorn' }
  ],
  works: [
    { address: '200 Bourke St, Melbourne', lat: -37.8136, lon: 144.9631, name: 'Bourke St Office' },
    { address: '123 Work Street, Melbourne', lat: -37.8141, lon: 144.9707, name: 'Collins St Office' },
    { address: '525 Collins St, Melbourne', lat: -37.8184, lon: 144.9558, name: 'Southern Cross' },
    { address: '101 Collins St, Melbourne', lat: -37.8138, lon: 144.9724, name: 'Collins Place' },
    { address: '1 Nicholson St, East Melbourne', lat: -37.8075, lon: 144.9779, name: 'Treasury' }
  ],
  cafes: [
    { name: 'Example Cafe', address: '3/62 Rose St, Fitzroy', suburb: 'Fitzroy' },
    { name: 'Proud Mary', address: '172 Oxford St, Collingwood', suburb: 'Collingwood' },
    { name: 'Seven Seeds', address: '114 Berkeley St, Carlton', suburb: 'Carlton' },
    { name: 'Patricia Coffee', address: 'Little William St, Melbourne', suburb: 'CBD' },
    { name: 'Market Lane', address: 'Collins St, Melbourne', suburb: 'CBD' },
    { name: 'St Ali', address: '12-18 Yarra Place, South Melbourne', suburb: 'South Melbourne' },
    { name: 'Axil Coffee', address: '322 Burwood Rd, Hawthorn', suburb: 'Hawthorn' }
  ],
  transit: {
    trams: ['86', '96', '11', '12', '109', '70', '75', '19', '48', '57'],
    trains: ['Sandringham', 'Frankston', 'Craigieburn', 'South Morang', 'Werribee', 'Belgrave', 'Glen Waverley', 'Lilydale'],
    buses: ['200', '220', '246', '302', '401', '506', '703', '905']
  }
};

/**
 * Generate random journey using SmartJourney patterns
 * @param {number|null} targetLegs - Target number of legs (3-7), or null for random
 */
function generateRandomJourney(targetLegs = null) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const home = pick(RANDOM_LOCATIONS.homes);
  const work = pick(RANDOM_LOCATIONS.works);
  const cafe = pick(RANDOM_LOCATIONS.cafes);

  // Random transit type with weighted probability
  const rand = Math.random();
  const transitType = rand < 0.4 ? 'train' : rand < 0.8 ? 'tram' : 'bus';

  // v1.23: Support target leg count (3-7)
  // Leg counts:
  // - Base (no coffee): walk + transit + walk = 3 legs
  // - With coffee: walk + coffee + walk + transit + walk = 5 legs
  // - With transfer: adds walk + transit = +2 legs
  // So: 3 (base), 5 (coffee), 7 (coffee+transfer)
  let includeCoffee, includeTransfer;

  if (targetLegs !== null && targetLegs >= 3 && targetLegs <= 7) {
    // 3 legs: no coffee, no transfer
    // 5 legs: coffee, no transfer
    // 7 legs: coffee + transfer
    includeCoffee = targetLegs >= 5;
    includeTransfer = targetLegs >= 7;
  } else {
    // Random (original behavior)
    includeCoffee = Math.random() > 0.25; // 75% chance of coffee
    includeTransfer = Math.random() > 0.6; // 40% chance of transfer
  }

  // Build legs dynamically
  const legs = [];
  let legNum = 1;

  // Leg 1: Walk to cafe or transit
  if (includeCoffee) {
    legs.push({
      number: legNum++,
      type: 'walk',
      title: `Walk to ${cafe.name}`,
      subtitle: `From home • ${cafe.address}`,
      minutes: 3 + Math.floor(Math.random() * 6),
      state: 'normal'
    });

    // Leg 2: Coffee
    const coffeeTime = 4 + Math.floor(Math.random() * 4);
    legs.push({
      number: legNum++,
      type: 'coffee',
      title: `Coffee at ${cafe.name}`,
      subtitle: '[OK] TIME FOR COFFEE',
      minutes: coffeeTime,
      state: 'normal'
    });

    // Leg 3: Walk to transit - V13.6: always use specific suburb/stop names
    const stopName = transitType === 'train'
      ? `${home.suburb} Station`
      : `${home.suburb} ${transitType === 'tram' ? 'Tram Stop' : 'Bus Stop'}`;
    legs.push({
      number: legNum++,
      type: 'walk',
      title: `Walk to ${stopName}`,
      subtitle: stopName,
      stopName: transitType === 'tram' ? stopName : undefined,
      stationName: transitType === 'train' ? stopName : undefined,
      minutes: 3 + Math.floor(Math.random() * 5),
      state: 'normal'
    });
  } else {
    // V13.6: always use specific suburb/stop names
    const stopName = transitType === 'train'
      ? `${home.suburb} Station`
      : `${home.suburb} ${transitType === 'tram' ? 'Tram Stop' : 'Bus Stop'}`;
    legs.push({
      number: legNum++,
      type: 'walk',
      title: `Walk to ${stopName}`,
      subtitle: `From home • ${home.suburb}`,
      stopName: transitType === 'tram' ? stopName : undefined,
      stationName: transitType === 'train' ? stopName : undefined,
      minutes: 5 + Math.floor(Math.random() * 8),
      state: 'normal'
    });
  }

  // Main transit leg
  const transitMins = 8 + Math.floor(Math.random() * 15);
  const nextDep = 2 + Math.floor(Math.random() * 8);
  const nextDep2 = nextDep + 5 + Math.floor(Math.random() * 8);

  // V13.6: Include explicit origin stop/station names for proper display
  const originStopName = `${home.suburb} ${transitType === 'train' ? 'Station' : (transitType === 'tram' ? 'Tram Stop' : 'Bus Stop')}`;

  if (transitType === 'train') {
    const line = pick(RANDOM_LOCATIONS.transit.trains);
    legs.push({
      number: legNum++,
      type: 'train',
      title: `Train to City`,
      subtitle: `${line} • ${originStopName} • Next: ${nextDep}, ${nextDep2} min`,
      lineName: line,
      originStation: originStopName,
      origin: { name: originStopName },
      destination: { name: 'City' },
      minutes: transitMins,
      state: Math.random() > 0.85 ? 'delayed' : 'normal'
    });
  } else if (transitType === 'tram') {
    const route = pick(RANDOM_LOCATIONS.transit.trams);
    legs.push({
      number: legNum++,
      type: 'tram',
      title: `Tram ${route} to City`,
      subtitle: `${originStopName} • Next: ${nextDep}, ${nextDep2} min`,
      routeNumber: route,
      originStop: originStopName,
      origin: { name: originStopName },
      destination: { name: 'City' },
      minutes: transitMins,
      state: Math.random() > 0.85 ? 'delayed' : 'normal'
    });
  } else {
    const route = pick(RANDOM_LOCATIONS.transit.buses);
    legs.push({
      number: legNum++,
      type: 'bus',
      title: `Bus ${route} to City`,
      subtitle: `${originStopName} • Next: ${nextDep} min`,
      routeNumber: route,
      originStop: originStopName,
      origin: { name: originStopName },
      destination: { name: 'City' },
      minutes: transitMins,
      state: 'normal'
    });
  }

  // Optional transfer (for 6+ legs) - v1.26: specific titles
  if (includeTransfer) {
    const transferType = transitType === 'tram' ? 'train' : 'tram';
    const transferTitle = transferType === 'train' 
      ? 'Walk to Flinders St Station' 
      : 'Walk to Tram Stop';
    legs.push({
      number: legNum++,
      type: 'walk',
      title: transferTitle,
      subtitle: transferType === 'train' ? 'Flinders St Station' : 'Collins St Stop',
      minutes: 2 + Math.floor(Math.random() * 3),
      state: 'normal'
    });

    if (transferType === 'train') {
      legs.push({
        number: legNum++,
        type: 'train',
        title: 'Train to Parliament',
        subtitle: 'Flinders St • City Loop • Next: 3, 8 min',
        minutes: 3 + Math.floor(Math.random() * 4),
        state: 'normal'
      });
    } else {
      const route = pick(RANDOM_LOCATIONS.transit.trams);
      legs.push({
        number: legNum++,
        type: 'tram',
        title: `Tram ${route} to Collins St`,
        subtitle: 'Collins St • Next: 2, 6 min',
        minutes: 4 + Math.floor(Math.random() * 5),
        state: 'normal'
      });
    }
  }

  // Final walk to office
  legs.push({
    number: legNum++,
    type: 'walk',
    title: `Walk to Office`,
    subtitle: `${work.name} • ${work.address.split(',')[0]}`,
    minutes: 3 + Math.floor(Math.random() * 8),
    state: 'normal'
  });

  // Calculate totals
  const totalMinutes = legs.reduce((sum, leg) => sum + leg.minutes, 0);

  // Random time
  const hour = 7 + Math.floor(Math.random() * 2);
  const mins = Math.floor(Math.random() * 45);
  const arriveHour = hour + Math.floor((mins + totalMinutes) / 60);
  const arriveMins = (mins + totalMinutes) % 60;

  // v1.24: Calculate DEPART times for each leg based on cumulative journey time
  const startMins = hour * 60 + mins;
  let cumulative = 0;
  for (const leg of legs) {
    // Calculate when user arrives at this leg
    const arriveAtLegMins = startMins + cumulative;
    const aH = Math.floor(arriveAtLegMins / 60) % 24;
    const aM = arriveAtLegMins % 60;
    const aH12 = aH % 12 || 12;
    const ampm = aH >= 12 ? 'pm' : 'am';
    
    // For transit legs, show DEPART time (when service departs)
    if (['train', 'tram', 'bus'].includes(leg.type)) {
      // Assume next departure is arrival time + 1-3 min wait
      const waitMin = 1 + Math.floor(Math.random() * 3);
      const departMins = arriveAtLegMins + waitMin;
      const dH = Math.floor(departMins / 60) % 24;
      const dM = departMins % 60;
      const dH12 = dH % 12 || 12;
      const dAmPm = dH >= 12 ? 'pm' : 'am';
      leg.departTime = `${dH12}:${dM.toString().padStart(2, '0')}${dAmPm}`;
    }
    
    cumulative += leg.minutes;
  }

  return {
    origin: home.address.toUpperCase(),
    destination: work.address.toUpperCase(),
    currentTime: `${hour}:${mins.toString().padStart(2, '0')}`,
    ampm: 'AM',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][Math.floor(Math.random() * 5)],
    date: `${Math.floor(Math.random() * 28) + 1} January`,
    status: legs.some(l => l.state === 'delayed') ? 'DELAY' : 'LEAVE NOW',
    arrivalTime: `${arriveHour}:${arriveMins.toString().padStart(2, '0')}`,
    totalDuration: totalMinutes,
    weather: {
      temp: 18 + Math.floor(Math.random() * 12),
      condition: pick(['Sunny', 'Partly Cloudy', 'Cloudy', 'Clear']),
      umbrella: Math.random() > 0.8
    },
    legs,
    cafe: includeCoffee ? cafe.name : null,
    transitType
  };
}

/**
 * Handle random journey mode - dynamic SmartJourney simulation
 */
async function handleRandomJourney(req, res) {
  try {
    // v1.23: Accept legs parameter for target leg count
    const targetLegs = parseInt(req.query?.legs) || null;
    const journey = generateRandomJourney(targetLegs);


    // Build dashboard data
    const dashboardData = {
      location: journey.origin,
      current_time: journey.currentTime,
      ampm: journey.ampm,
      day: journey.dayOfWeek,
      date: journey.date,
      temp: journey.weather.temp,
      condition: journey.weather.condition,  // v1.24: use 'condition' key
      weather: journey.weather.condition,    // Also set weather for compat
      umbrella: journey.weather.umbrella,
      status: journey.status,
      arrive_by: journey.arrivalTime,
      total_minutes: journey.totalDuration,
      legs: journey.legs,
      // V14.0: Demo lifestyle display
      lifestyle_display: journey.weather.umbrella ? 'BRING UMBRELLA' : 'NO UMBRELLA',
      lifestyle_primary: journey.weather.umbrella ? 'BRING UMBRELLA' : null,
      // V14.0: Demo confidence (based on weather and delays)
      confidence_score: journey.legs.some(l => l.state === 'delayed') ? 65 : 88,
      confidence_label: journey.legs.some(l => l.state === 'delayed') ? 'MEDIUM' : 'HIGH',
      confidence_text: journey.legs.some(l => l.state === 'delayed') ? '65%' : '88%'
    };

    // Render using V13 renderer
    const pngBuffer = await renderFullDashboard(dashboardData);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('X-Journey-Origin', journey.origin);
    res.setHeader('X-Journey-Dest', journey.destination);
    res.setHeader('X-Journey-Legs', journey.legs.length.toString());
    res.setHeader('X-Journey-Transit', journey.transitType);
    res.send(pngBuffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Handle demo mode - render scenario data
 */
async function handleDemoMode(req, res, scenarioName) {
  try {
    const scenario = getScenario(scenarioName);
    if (!scenario) {
      const available = getScenarioNames().join(', ');
      res.status(400).json({
        error: `Unknown scenario: ${scenarioName}`,
        available
      });
      return;
    }

    // Build dashboard data from scenario
    const dashboardData = {
      location: scenario.origin || 'HOME',
      current_time: scenario.currentTime || '8:00',
      day: scenario.dayOfWeek?.toUpperCase() || 'MONDAY',
      date: scenario.date?.toUpperCase() || '1 JANUARY',
      temp: scenario.weather?.temp ?? 20,
      condition: scenario.weather?.condition || 'Sunny',
      umbrella: scenario.weather?.umbrella || false,
      status_type: scenario.status || 'normal',
      delay_minutes: scenario.delayMinutes || null,
      arrive_by: scenario.arrivalTime || '09:00',
      total_minutes: scenario.totalDuration || 30,
      leave_in_minutes: null,
      journey_legs: (scenario.steps || []).map((step, i) => ({
        number: i + 1,
        type: step.type?.toLowerCase() || 'walk',
        title: step.title || 'Continue',
        subtitle: step.subtitle || '',
        minutes: step.duration || 5,
        state: step.status?.toLowerCase() || 'normal'
      })),
      destination: scenario.destination || 'WORK'
    };

    // Render to PNG (V13.6: await async render)
    const png = await renderFullDashboard(dashboardData);

    // Send response
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Demo-Scenario', scenarioName);
    res.setHeader('Content-Length', png.length);
    return res.send(png);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Main handler - Vercel serverless function
 */
export default async function handler(req, res) {
  // CORS headers - required for admin panel preview
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Check for random mode - generates dynamic journey using SmartJourney patterns
    if (req.query?.random === '1' || req.query?.random === 'true') {
      return handleRandomJourney(req, res);
    }

    // Check for demo mode
    const demoScenario = req.query?.demo;
    if (demoScenario) {
      return handleDemoMode(req, res, demoScenario);
    }

    // =========================================================================
    // DEVICE INFO - battery status from device request
    // =========================================================================
    // TRMNL devices send battery info via query params or headers
    const batteryPercent = parseInt(req.query?.battery || req.headers?.['x-battery'] || req.headers?.['battery']) || null;
    const batteryVoltage = parseFloat(req.query?.voltage || req.headers?.['x-voltage']) || null;
    const deviceId = req.query?.device_id || req.headers?.['x-device-id'] || null;

    // V13.6: Store device status when battery info is reported (async, non-blocking)
    if (batteryPercent !== null) {
      setDeviceStatus({
        battery_percent: batteryPercent,
        battery_voltage: batteryVoltage,
        device_id: deviceId,
        last_seen: new Date().toISOString()
      }).catch(() => {});
    }

    // SIMULATOR OVERRIDES - for testing CommuteCompute engine
    // =========================================================================
    const simOverrides = {
      home: req.query?.home,
      work: req.query?.work,
      cafe: req.query?.cafe,
      arrivalTime: req.query?.arrivalTime,
      simulatedTime: req.query?.simulatedTime,
      status: req.query?.status,  // normal, delayed, disruption, suspended, diversion
      weather: req.query?.weather  // auto, sunny, cloudy, rain, storm
    };
    const hasSimOverrides = Object.values(simOverrides).some(v => v);

    // Get current time (or simulated time for testing)
    let now = getMelbourneTime();
    if (simOverrides.simulatedTime) {
      const [simH, simM] = simOverrides.simulatedTime.split(':').map(Number);
      now = new Date(now);
      now.setHours(simH, simM, 0, 0);
    }
    const currentTime = formatTime(now);
    const melbourneTime = getMelbourneDisplayTime(now);
    const amPm = melbourneTime.hour >= 12 ? 'PM' : 'AM';
    const { day, date } = formatDateParts(now);

    // Initialize engine and get route
    const engine = await getEngine();
    const route = engine.getSelectedRoute();
    const locations = engine.getLocations();
    const config = engine.journeyConfig;

    // If no journey configured, fall back to random mode for preview
    // This ensures the Live Data tab shows something useful even before full config
    if (!locations.home?.address && !route?.legs?.length) {
      return handleRandomJourney(req, res);
    }

    // Fetch live data from sources
    // Per Section 3.1: Zero-Config - get stop IDs from preferences (KV), no process.env
    // V13.6: Auto-detect stop IDs from home address if not configured
    const kvPrefs = await getPreferences();
    let trainStopId = kvPrefs?.trainStopId || null;
    let tramStopId = kvPrefs?.tramStopId || null;

    // V13.6: Auto-detect stop IDs if not configured (per Section 23.1.1)
    if (!trainStopId || !tramStopId) {
      const homeAddress = locations.home?.address || kvPrefs?.addresses?.home;
      const detected = detectStopIdsFromAddress(homeAddress);
      if (!trainStopId && detected.trainStopId) {
        trainStopId = detected.trainStopId;
      }
      if (!tramStopId && detected.tramStopId) {
        tramStopId = detected.tramStopId;
      }
    }

    // Per Section 11.8: Zero-Config compliant - load API key from KV storage
    const transitApiKey = await getTransitApiKey();
    const apiOptions = transitApiKey ? { apiKey: transitApiKey } : {};

    const [trains, trams, weather, disruptions] = await Promise.all([
      getDepartures(trainStopId, 0, apiOptions),
      getDepartures(tramStopId, 1, apiOptions),
      getWeather(locations.home?.lat, locations.home?.lon),
      getDisruptions(0, apiOptions).catch(() => [])
    ]);

    const transitData = { trains, trams, disruptions };

    // =========================================================================
    // APPLY SIMULATOR OVERRIDES
    // =========================================================================
    let weatherData = weather;
    if (simOverrides.weather && simOverrides.weather !== 'auto') {
      const weatherPresets = {
        sunny: { temp: 28, condition: 'Sunny', umbrella: false },
        cloudy: { temp: 18, condition: 'Cloudy', umbrella: false },
        rain: { temp: 15, condition: 'Rain', umbrella: true },
        storm: { temp: 14, condition: 'Storm', umbrella: true }
      };
      weatherData = weatherPresets[simOverrides.weather] || weather;
    }

    // Apply status override to transit data
    if (simOverrides.status && simOverrides.status !== 'normal') {
      if (simOverrides.status === 'delayed') {
        // Add delay to first transit leg
        if (transitData.trains?.[0]) transitData.trains[0].isDelayed = true;
        if (transitData.trains?.[0]) transitData.trains[0].delayMinutes = 5;
      } else if (simOverrides.status === 'disruption') {
        transitData.disruptions = [{ title: 'Major Disruption', description: 'Simulated disruption for testing' }];
      }
    }

    // Get coffee decision from engine
    let coffeeDecision = engine.calculateCoffeeDecision(transitData, route?.legs || []);
    
    // Check if cafe is open (hours check)
    // V13.6 FIX: Use Melbourne time for business hours check
    const melbDisplayTime = getMelbourneDisplayTime(now);
    const hour = melbDisplayTime.hour;
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const cafeOpenHour = config?.coffee?.openHour || 6;
    const cafeCloseHour = config?.coffee?.closeHour || 17;
    const cafeOpenDays = config?.coffee?.openDays || [1, 2, 3, 4, 5, 6]; // Mon-Sat
    const cafeIsOpen = cafeOpenDays.includes(dayOfWeek) && hour >= cafeOpenHour && hour < cafeCloseHour;
    
    if (!cafeIsOpen && config?.addresses?.cafe) {
      // Cafe is closed - override coffee decision
      coffeeDecision = {
        ...coffeeDecision,
        canGet: false,
        cafeClosed: true,
        skipReason: 'Cafe closed',
        decision: 'CLOSED',
        subtext: 'Cafe not open'
      };
    }

    // V13.6: When cafe is CLOSED, filter out cafe legs from route entirely
    // This recalculates route as if cafe was never there (per Dev Rules Section 7.5.1)
    let effectiveRoute = route;
    if (coffeeDecision.cafeClosed) {
      const filteredLegs = (route?.legs || []).filter((leg, idx, arr) => {
        // Remove coffee leg
        if (leg.type === 'coffee') return false;
        // Remove walk TO cafe (walk leg immediately before coffee)
        if (leg.type === 'walk') {
          const nextLeg = arr[idx + 1];
          if (nextLeg?.type === 'coffee') return false;
        }
        return true;
      });

      // Merge consecutive walk legs that may result
      const mergedLegs = [];
      for (let i = 0; i < filteredLegs.length; i++) {
        const current = { ...filteredLegs[i] };
        if (current.type === 'walk' && i + 1 < filteredLegs.length && filteredLegs[i + 1].type === 'walk') {
          const next = filteredLegs[i + 1];
          current.minutes = (current.minutes || 0) + (next.minutes || 0);
          current.to = next.to || current.to;
          current.stopName = next.stopName || current.stopName;
          current.stationName = next.stationName || current.stationName;
          i++; // Skip next leg since we merged it
        }
        mergedLegs.push(current);
      }

      effectiveRoute = { ...route, legs: mergedLegs };
    }

    // V13.6: Filter out transit legs when no departures available or walking is faster
    // Per user requirement: If walk_time + 5 < wait_time + transit_duration, exclude transit
    const transitFilterResult = filterUnavailableTransitLegs(effectiveRoute, transitData);
    effectiveRoute = transitFilterResult.route;
    const transitNotice = transitFilterResult.transitNotice;
    const removedTransitTypes = transitFilterResult.removedTransitTypes || [];
    // Build journey legs with cumulative timing (Data Model v1.18)
    // V13.6: Pass locations for deriving proper stop/station names
    // V13.6: Pass stopIds for actual stop name lookup via GTFS_STOP_NAMES
    const journeyLegs = buildJourneyLegs(effectiveRoute, transitData, coffeeDecision, now, locations, { trainStopId, tramStopId });
    const totalMinutes = calculateTotalMinutes(journeyLegs);
    let statusType = getStatusType(journeyLegs, transitData.disruptions);

    // Override status type if specified
    if (simOverrides.status && simOverrides.status !== 'normal') {
      statusType = simOverrides.status === 'disruption' ? 'disruption' :
                   simOverrides.status === 'delayed' ? 'delay' : statusType;
    }

    // Build display values (use simulated overrides if provided)
    // Per Section 3.1: Zero-Config - no process.env for user addresses
    const displayHome = simOverrides.home || locations.home?.address || 'Home';
    const displayWork = simOverrides.work || locations.work?.address || 'Work';
    const displayArrival = simOverrides.arrivalTime || config?.journey?.arrivalTime || '09:00';

    // Calculate timing using display arrival (respects simulator override)
    // V13.6 FIX: Use Melbourne time for display calculations
    const [arrH, arrM] = displayArrival.split(':').map(Number);
    const targetMins = arrH * 60 + arrM;
    const melbTimeForLeave = getMelbourneDisplayTime(now);
    const nowMinsForLeave = melbTimeForLeave.hour * 60 + melbTimeForLeave.minute;
    const leaveInMinutes = Math.max(0, targetMins - totalMinutes - nowMinsForLeave);

    // V13.6: Calculate actual arrival time (NOW + journey duration)
    // Uses journeyContribution from each leg for stable timing (doesn't decrease with time)
    const arrivalMins = nowMinsForLeave + totalMinutes;
    const arrivalH = Math.floor(arrivalMins / 60) % 24;
    const arrivalM = arrivalMins % 60;
    const arrivalH12 = arrivalH % 12 || 12;
    const arrivalAmPm = arrivalH >= 12 ? 'pm' : 'am';
    const calculatedArrival = `${arrivalH12}:${arrivalM.toString().padStart(2, '0')}${arrivalAmPm}`;

    // Calculate delay if applicable
    let delayMinutes = null;
    if (statusType === 'delay' || statusType === 'disruption') {
      const delayedLegs = journeyLegs.filter(l => l.state === 'delayed');
      delayMinutes = delayedLegs.reduce((sum, l) => sum + (l.delayMinutes || 0), 0);
    }

    // V13.6: Extract disruption text for status bar badge
    const disruptedLeg = journeyLegs.find(l =>
      l.hasAlert || l.serviceAlert || l.alertText ||
      l.state === 'suspended' || l.state === 'cancelled' || l.state === 'delayed'
    );
    const disruption_text = disruptedLeg?.alertText ||
      (disruptedLeg?.routeNumber ?
        `${disruptedLeg.type?.toUpperCase()} ${disruptedLeg.routeNumber}${disruptedLeg.delayMinutes ? ` +${disruptedLeg.delayMinutes} MIN` : ''}` :
        null);

    // V14.0: Calculate Departure Confidence Score
    const confidenceEngine = new DepartureConfidence();
    const confidence = confidenceEngine.calculate({
      legs: journeyLegs,
      transitData,
      weather: weatherData,
      coffeeDecision,
      totalMinutes,
      targetArrivalMins: targetMins,
      currentMins: nowMinsForLeave
    });
    // V14.0: Calculate Lifestyle Context Suggestions
    const lifestyleEngine = new LifestyleContext();
    const lifestyle = lifestyleEngine.calculate({
      weather: weatherData,
      currentTime: now,
      state: await getUserState() || 'VIC'
    });
    // V15.0: Sleep Optimizer - evening mode bedtime/alarm calculation
    const sleepEngine = new SleepOptimizer();
    const sleepData = sleepEngine.calculate({
      targetArrivalMins: targetMins,
      totalJourneyMins: totalMinutes,
      currentTime: now,
      wakeRoutineMins: kvPrefs?.wakeRoutineMins || 30,
      sleepHours: kvPrefs?.sleepHours || 8,
      localHour: melbourneTime.hour,
      localMinute: melbourneTime.minute
    });
    // V15.0: Alternative Transit - cost estimates when all transit cancelled
    const altTransitEngine = new AltTransit();
    const altTransit = altTransitEngine.calculate({
      totalWalkMins: totalMinutes,
      currentTime: now,
      transitNotice,
      legs: journeyLegs,
      localHour: melbourneTime.hour
    });
    // V15.0: Lifestyle Mindset - stress, steps, apparent temperature
    const mindset = lifestyleEngine.calculateMindset({
      legs: journeyLegs,
      weather: weatherData,
      totalWalkMins: journeyLegs.filter(l => l.type === 'walk').reduce((sum, l) => sum + (l.minutes || 0), 0),
      disruptionCount: journeyLegs.filter(l => l.state === 'suspended' || l.state === 'cancelled' || l.hasAlert).length,
      transferCount: journeyLegs.filter(l => ['train', 'tram', 'bus'].includes(l.type)).length
    });
    const dashboardData = {
      location: displayHome,
      current_time: currentTime,
      am_pm: amPm,  // V13.6: Explicit AM/PM from Melbourne time
      day,
      date,
      temp: weatherData?.temp ?? '--',
      condition: weatherData?.condition || 'N/A',
      umbrella: weatherData?.umbrella || false,
      status_type: statusType,
      delay_minutes: delayMinutes,
      // V13.6: Include disruption text for badge display
      disruption: statusType === 'disruption' || statusType === 'delay',
      disruption_text,
      arrive_by: displayArrival,
      _calculatedArrival: calculatedArrival,  // V13.6: Stable arrival time from journey calculation
      total_minutes: totalMinutes,
      leave_in_minutes: leaveInMinutes > 0 ? leaveInMinutes : null,
      journey_legs: journeyLegs,
      destination: displayWork,
      // V13.6: Coffee decision for header box - shows CAFE CLOSED when applicable
      coffee_decision: coffeeDecision.cafeClosed ? 'CAFE CLOSED' :
                       coffeeDecision.canGet ? 'TIME FOR COFFEE' :
                       'NO TIME FOR COFFEE',
      coffee_subtext: coffeeDecision.cafeClosed ? 'Outside opening hours' :
                      coffeeDecision.subtext || null,
      // V13.6: Transit availability notice (e.g., "NO PUBLIC TRANSIT OPTIONS AVAILABLE")
      transit_notice: transitNotice,
      removed_transit_types: removedTransitTypes.length > 0 ? removedTransitTypes : null,
      // V13.6: Device battery status (from TRMNL device request)
      battery_percent: batteryPercent,
      battery_voltage: batteryVoltage,
      device_id: deviceId,
      // V14.0: Departure Confidence Score
      confidence_score: confidence.score,
      confidence_label: confidence.label,
      confidence_text: confidence.statusText,
      confidence_resilience: confidence.resilience,
      // V14.0: Lifestyle Context Suggestions
      lifestyle_display: lifestyle.displayLine,
      lifestyle_primary: lifestyle.primarySuggestion,
      lifestyle_secondary: lifestyle.secondarySuggestion,
      lifestyle_suggestions: lifestyle.suggestions,
      // V15.0: Sleep Optimizer (evening mode)
      sleep_active: sleepData.active,
      sleep_display: sleepData.displayLine,
      sleep_secondary: sleepData.secondaryLine,
      sleep_bedtime: sleepData.bedtime,
      sleep_alarm: sleepData.alarmTime,
      sleep_adequacy: sleepData.sleepAdequacy,
      // V15.0: Alternative Transit (when public transit cancelled)
      alt_transit_active: altTransit.active,
      alt_transit_display: altTransit.displayLine,
      alt_transit_detail: altTransit.detailLine,
      alt_transit_rideshare: altTransit.rideshare,
      alt_transit_scooter: altTransit.scooter,
      alt_transit_bike: altTransit.bike,
      alt_transit_distance_km: altTransit.distanceKm,
      alt_transit_is_peak: altTransit.isPeak,
      // V15.0: Lifestyle Mindset
      mindset_stress: mindset.stressLevel,
      mindset_display: mindset.stressDisplay,
      mindset_steps: mindset.stepsDisplay,
      mindset_feels_like: mindset.feelsLikeDisplay,
    };

    // Check format - BMP for e-ink devices, JSON for debug, PNG default
    const format = req.query?.format || 'png';

    // V13.6: JSON debug mode - returns full data model for verification
    if (format === 'json') {
      const debugData = {
        _debug: {
          version: 'V15.0',
          timestamp: now.toISOString(),
          melbourneTime: currentTime,
          amPm,
          dataSource: transitApiKey ? 'live' : 'fallback'
        },
        stopIds: {
          trainStopId,
          tramStopId,
          trainStopName: getStopNameById(trainStopId),
          tramStopName: getStopNameById(tramStopId),
          autoDetected: !kvPrefs?.trainStopId || !kvPrefs?.tramStopId
        },
        rawTransitData: {
          trains: transitData.trains?.slice(0, 3)?.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs,
            destination: t.destination,
            lineName: t.lineName,
            isLive: !!t.departureTimeMs
          })),
          trams: transitData.trams?.slice(0, 3)?.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs,
            destination: t.destination,
            routeNumber: t.routeNumber,
            isLive: !!t.departureTimeMs
          }))
        },
        dashboard: dashboardData,
        journeyLegs: journeyLegs.map(leg => ({
          type: leg.type,
          minutes: leg.minutes,
          journeyContribution: leg.journeyContribution,
          originStop: leg.originStop,
          originStation: leg.originStation,
          stopName: leg.stopName,
          stationName: leg.stationName,
          lineName: leg.lineName,
          routeNumber: leg.routeNumber,
          departTime: leg.departTime,
          nextDepartures: leg.nextDepartures,
          nextDepartureTimes: leg.nextDepartureTimes,
          isLive: leg.isLive
        }))
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).json(debugData);
    }

    if (format === 'bmp') {
      // BMP format for e-ink devices (V13.6: await async render)
      const bmp = await renderFullScreenBMP(dashboardData);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=20');
      res.setHeader('X-Dashboard-Timestamp', now.toISOString());
      res.setHeader('Content-Length', bmp.length);
      return res.status(200).send(bmp);
    }

    // Render to PNG (V13.6: await async render)
    const png = await renderFullDashboard(dashboardData);

    // Send response
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Dashboard-Timestamp', now.toISOString());
    res.setHeader('X-Route-Name', (route?.name || 'default').replace(/[^\x20-\x7E]/g, '-'));
    res.setHeader('Content-Length', png.length);

    return res.status(200).send(png);

  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: error.message, code: 'RENDER_ERROR' });
  }
}
