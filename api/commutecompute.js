/**
 * CommuteCompute™ Unified Dashboard Endpoint
 *
 * Single source of truth for ALL dashboard output — admin JSON preview,
 * TRMNL display PNG/BMP, and debug/diagnostic data.
 *
 * Merges former api/screen.js (e-ink pipeline) and api/commutecompute.js
 * (admin JSON) into one endpoint. No divergence between admin and e-ink.
 *
 * Data Flow (per DEVELOPMENT-RULES.md v3):
 * User Config → Data Sources → Engines → Data Model → Renderer
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getDepartures, getDisruptions, getWeather, METRO_LINE_NAMES } from '../src/services/opendata-client.js';
import CommuteCompute from '../src/engines/commute-compute.js';
import { GTFS_STOP_NAMES, getStopNameById, cleanStopName, MELBOURNE_STOP_IDS, detectStopIdsFromAddress, findNearestStops } from '../src/data/gtfs-stop-names.js';
import { getTransitApiKey, getPreferences, getUserState, setDeviceStatus, getClient, getStationOverrides, setStationOverrides, getPreferredTramRoute, setPreferredTramRoute } from '../src/data/kv-preferences.js';
import { renderFullDashboard, renderFullScreenBMP, DISPLAY_DIMENSIONS } from '../src/services/ccdash-renderer.js';
import { getScenario, getScenarioNames } from '../src/services/journey-scenarios.js';
import DepartureConfidence from '../src/engines/departure-confidence.js';
import LifestyleContext from '../src/engines/lifestyle-context.js';
import SleepOptimiser from '../src/engines/sleep-optimiser.js';
import AltTransit from '../src/engines/alt-transit.js';
import crypto from 'node:crypto';

// Vercel serverless config: extend max duration beyond default 10s for cold starts
export const config = { maxDuration: 60 };

// Engine cache - re-initialized when preferences change
let journeyEngine = null;
let lastPrefsHash = null;

// State timezone mapping - supports all 8 Australian states/territories
// Fallback: 'Australia/Melbourne' if state is unknown
const STATE_TIMEZONES = {
  'VIC': 'Australia/Melbourne', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney',
  'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth',
  'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin'
};

/**
 * Get local time (as a Date object)
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
 * Get local hours and minutes from a Date object for the given state
 * Use this for display, not for timestamp calculations
 * @param {Date} date - Date object to extract time from
 * @param {string} [state] - Australian state code (e.g. 'VIC', 'NSW'). Defaults to Melbourne timezone.
 */
function getMelbourneDisplayTime(date, state) {
  const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23'  // V13.6 FIX: Use 0-23 hour format (not h24 which shows "24" for midnight)
  }).formatToParts(date);

  let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  // V13.6 FIX: Handle edge case where hour might still be 24
  if (hour === 24) hour = 0;
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  return { hour, minute };
}

/**
 * Format time as H:MM (12-hour format, state-aware timezone)
 * Per Section 12: Business Logic - use 12-hour time format
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
function formatTime(date, state) {
  const melb = getMelbourneDisplayTime(date, state);
  const hour12 = melb.hour % 12 || 12;  // Convert 0 to 12, 13-23 to 1-11
  return `${hour12}:${melb.minute.toString().padStart(2, '0')}`;
}

// GTFS stop names, suburb mappings, and address detection imported from shared module above

/**
 * Format date parts for display
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
function formatDateParts(date, state) {
  const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
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
 * Per Zero-Config: preferences come from Redis (synced from Setup Wizard)
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

  // Create hash to detect preference changes (includes route selection by index and ID)
  const prefsHash = JSON.stringify({ state, home: preferences.homeAddress, work: preferences.workAddress, selectedRouteIndex: kvPrefs.selectedRouteIndex, selectedRouteId: kvPrefs.selectedRouteId });

  // Re-initialize engine if preferences changed or no engine exists
  if (!journeyEngine || prefsHash !== lastPrefsHash) {

    journeyEngine = new CommuteCompute();
    await journeyEngine.initialize(preferences);

    // Discover routes FIRST so selectedRouteIndex maps to the same routes
    // the admin panel sees (admin calls discoverRoutes via /api/routes).
    // Without this, discoveredRoutes is empty and getSelectedRoute() falls
    // back to getHardcodedRoutes() with index 0, ignoring the user's choice.
    await journeyEngine.discoverRoutes();

    // Restore user's selected route from KV preferences
    if (kvPrefs.selectedRouteIndex !== undefined) {
      journeyEngine.selectRoute(parseInt(kvPrefs.selectedRouteIndex));
    } else if (kvPrefs.selectedRouteId !== undefined) {
      journeyEngine.selectRoute(kvPrefs.selectedRouteId);
    }

    lastPrefsHash = prefsHash;
  }

  return journeyEngine;
}

/**
 * Extract suburb/location name from Australian address format
 * e.g., "42 Chapel St, South Yarra VIC 3141" → "South Yarra"
 * Used for e-ink header/footer display and stop name derivation
 */
function extractSuburb(address) {
  if (!address) return null;
  const parts = address.split(',');
  // Pass 1: Look for "Melbourne VIC 3000" style combined suburb+state parts
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i].trim();
    const match = part.match(/^([A-Za-z\s]+?)(?:\s+(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)|\s+\d{4})/);
    if (match && match[1].trim().length > 1) return match[1].trim();
  }
  // Pass 2: Nominatim-style addresses where suburb and state are separate parts
  // e.g. "..., South Yarra, Melbourne, City of Melbourne, Victoria, 3141, Australia"
  // Municipality names (e.g. "Melbourne") appear closer to state than suburbs (e.g. "South Yarra").
  // Detect municipalities via matching "City of [name]" parts and prefer the suburb.
  const statePattern = /^(VIC|NSW|QLD|SA|WA|TAS|NT|ACT|Victoria|New South Wales|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory)$/i;
  for (let i = 1; i < parts.length; i++) {
    if (statePattern.test(parts[i].trim())) {
      let municipalityFallback = null;
      for (let j = i - 1; j >= 0; j--) {
        const candidate = parts[j].trim();
        if (/^[A-Z][a-z]/.test(candidate) && candidate.length > 2 &&
            !/^(City of|Shire of)/i.test(candidate) &&
            !/\b(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Terrace|Tce|Boulevard|Blvd|Highway|Hwy|Way|Crescent|Cres|Parade|Pde|Close|Circuit|Esplanade|District|House|Tower|Centre|Center|Building|Complex|Plaza|Mall)\b/i.test(candidate)) {
          // Skip municipality-level names — prefer suburb if available
          const isMunicipality = parts.some(p =>
            p.trim().toLowerCase() === `city of ${candidate.toLowerCase()}`
          );
          if (isMunicipality) {
            if (!municipalityFallback) municipalityFallback = candidate;
            continue;
          }
          // Skip broad capital city names — prefer actual suburb (e.g. "South Yarra" over "Melbourne")
          const broadCities = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin', 'canberra'];
          if (broadCities.includes(candidate.toLowerCase())) {
            if (!municipalityFallback) municipalityFallback = candidate;
            continue;
          }
          return candidate;
        }
      }
      if (municipalityFallback) return municipalityFallback;
    }
  }
  // Pass 3: Fallback — try second part, skip leading digits
  if (parts.length >= 2) {
    const suburbia = parts[1].trim();
    const alphaMatch = suburbia.match(/(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (alphaMatch) return alphaMatch[1];
  }
  return null;
}

/**
 * Merge consecutive walk legs into a single leg (Section 7.5.1 MANDATORY)
 * Must be applied after ALL filtering to ensure no back-to-back walks ever appear
 */
function mergeConsecutiveWalkLegs(legs) {
  const merged = [];
  for (let i = 0; i < legs.length; i++) {
    const current = { ...legs[i] };
    // V15.0: Merge chains of consecutive walk legs (not just pairs).
    // When transit legs are removed (no live data), multiple walks may be adjacent.
    while (current.type === 'walk' && i + 1 < legs.length && legs[i + 1].type === 'walk') {
      const next = legs[i + 1];
      current.minutes = (current.minutes || 0) + (next.minutes || 0);
      current.durationMinutes = (current.durationMinutes || 0) + (next.durationMinutes || 0);
      current.journeyContribution = (current.journeyContribution || current.minutes || 0) + (next.journeyContribution || next.minutes || 0);
      current.to = next.to || current.to;
      current.stopName = next.stopName || current.stopName;
      current.stationName = next.stationName || current.stationName;
      current.workName = next.workName || current.workName;
      // Use the last walk's formatted title (from buildLegTitle) when available
      const resolvedDest = next.stopName || next.stationName || current.stopName || current.stationName || next.to || current.to || 'destination';
      current.title = next.title || current.title || `Walk to ${resolvedDest}`;
      // Keep subtitle consistent with merged minutes
      current.subtitle = `${current.minutes} min walk`;
      i++;
    }
    // Sync durationMinutes with accumulated minutes
    if (current.durationMinutes === 0 && current.minutes > 0) {
      current.durationMinutes = current.minutes;
    }
    merged.push(current);
  }
  // Post-merge: ensure walk-before-transit has proper title from the next transit stop
  for (let i = 0; i < merged.length - 1; i++) {
    const walk = merged[i];
    const next = merged[i + 1];
    if (walk.type === 'walk' && ['train', 'tram', 'bus', 'vline'].includes(next.type)) {
      const transitName = next.stationName || next.stopName || next.departure?.stopName;
      if (transitName && (!walk.title || walk.title.includes('destination') || walk.title === 'Walk to Station')) {
        walk.title = `Walk to ${transitName}`;
      }
    }
  }
  return merged;
}

/**
 * Build journey legs from engine route with live transit data
 * Now includes cumulative timing and DEPART times (v1.18)
 * V13.6: Added stopIds for actual stop name lookup
 */
function buildJourneyLegs(route, transitData, coffeeDecision, currentTime, locations = {}, stopIds = {}, state, preferredTramRoute = null, options = {}) {
  if (!route?.legs) return [];

  const legs = [];
  let legNumber = 1;
  let cumulativeMinutes = 0;  // Minutes from journey start

  // V13.6: Extract location names for both home AND cafe
  // Per CommuteCompute pattern: link stops to nearest origin location
  const homeSuburb = extractSuburb(locations.home?.address) || null;
  const cafeSuburb = extractSuburb(locations.cafe?.address) ||
                     locations.cafe?.name?.split(',')[0] ||
                     locations.cafe?.name || null;

  // V13.6: Track current origin location as we iterate through legs
  // This determines which location's name to use for transit stops
  let currentOrigin = 'home'; // Start from home

  // Parse current time for DEPART calculation
  // V13.6 FIX: Use actual Date for timestamp, Melbourne display time for hours/minutes
  const now = currentTime || new Date();
  const melbTime = getMelbourneDisplayTime(now, state);
  const nowMins = melbTime.hour * 60 + melbTime.minute;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const prevLeg = i > 0 ? route.legs[i - 1] : null;

    // V13.6: Add 2 minute buffer to walking legs for realistic timing
    // Cap walk legs at 30 min — engine can return inflated values at certain times
    const isWalkLeg = leg.type === 'walk';
    const rawDuration = leg.minutes || leg.durationMinutes || 0;
    const legDuration = isWalkLeg ? Math.min(rawDuration + 2, 30) : rawDuration;

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
    const derivedTramStop = originSuburb ? `${originSuburb} Tram Stop` : null;
    const derivedStation = originSuburb ? `${originSuburb} Station` : null;

    // V13.6: Walk leg destinations - show where we're walking TO
    // Priority: 1) GTFS lookup by stopId, 2) suburb-derived fallback
    if (leg.to?.toLowerCase() === 'tram stop') {
      leg.stopName = getStopNameById(stopIds.tramStopId) || derivedTramStop;
    }
    if (leg.to?.toLowerCase() === 'train platform' || leg.to?.toLowerCase() === 'station') {
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

      // Use first non-generic name, or null if all generic
      const actualName = gtfsName ||
                         (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
                         suburbName ||
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

      // Use first non-generic name, or null if all generic
      const actualName = gtfsName ||
                         (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
                         suburbName ||
                         null;

      leg.originStation = actualName;

      // Determine direction: citybound if destination is a central Melbourne station
      // This enables correct train filtering (any line going the right direction)
      const destName = (leg.destination?.name || '').toLowerCase();
      const cityStations = ['flinders', 'parliament', 'melbourne central', 'flagstaff',
        'southern cross', 'town hall', 'state library', 'parkville', 'arden', 'anzac', 'city'];
      leg.isCitybound = cityStations.some(s => destName.includes(s));

      // Metro Tunnel vs City Loop destination filtering.
      // City Loop stations: Flinders Street, Parliament, Melbourne Central, Flagstaff, Southern Cross
      // Metro Tunnel stations: Town Hall, State Library, Parkville, Arden, Anzac
      // Trains on Metro Tunnel lines (Pakenham/Cranbourne/Sunbury/Craigieburn/Upfield)
      // do NOT stop at City Loop stations, and vice versa.
      const cityLoopStations = ['flinders', 'parliament', 'melbourne central', 'flagstaff', 'southern cross'];
      const metroTunnelStations = ['town hall', 'state library', 'parkville', 'arden', 'anzac'];
      if (cityLoopStations.some(s => destName.includes(s))) {
        leg.requiresCityLoop = true;
      } else if (metroTunnelStations.some(s => destName.includes(s))) {
        leg.requiresMetroTunnel = true;
      }
      // If destination is generic 'city', accept either — user doesn't care which tunnel/loop
    }
    if (leg.type === 'bus') {
      const fromCafe = prevLeg?.type === 'walk' && (prevLeg?.from === 'cafe' || currentOrigin === 'cafe');
      const stopSuburb = fromCafe && cafeSuburb ? cafeSuburb : homeSuburb;
      const genericNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'bus'];
      const isGeneric = (name) => !name || genericNames.includes(name.toLowerCase().trim());
      const gtfsName = getStopNameById(stopIds.busStopId);
      const commuteComputeName = leg.origin?.name;
      const suburbName = stopSuburb ? `${stopSuburb} Bus Stop` : null;
      const actualName = gtfsName ||
        (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
        suburbName || commuteComputeName || null;
      leg.originStop = actualName;
    }

    // Resolve destination names via GTFS when engine provides generic ones
    if (leg.type === 'tram' && leg.destination) {
      const genericDestNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'city'];
      const isDestGeneric = (name) => !name || genericDestNames.includes(name.toLowerCase().trim());
      if (isDestGeneric(leg.destination.name)) {
        const gtfsDest = getStopNameById(stopIds.trainStopId);
        const workSuburb = extractSuburb(locations.work?.address);
        leg.destination.name = gtfsDest || (workSuburb ? `${workSuburb} Station` : leg.destination.name);
      }
    }
    if (leg.type === 'train' && leg.destination) {
      const genericDestNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'city'];
      const isDestGeneric = (name) => !name || genericDestNames.includes(name.toLowerCase().trim());
      if (isDestGeneric(leg.destination.name)) {
        // Use work-side stop ID for train destination (not home stop ID)
        const gtfsWorkDest = getStopNameById(stopIds.workTrainStopId);
        const workSuburb = extractSuburb(locations.work?.address);
        leg.destination.name = gtfsWorkDest || (workSuburb ? `${workSuburb} Station` : leg.destination.name);
      }
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
    const isTransitLeg = ['train', 'tram', 'bus', 'vline'].includes(leg.type);
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

        // V15.0: Only reject clearly invalid timestamps (negative or absurdly far future)
        // Valid departures up to 120+ min away are kept — supports low-frequency services
        if (rawMinutes < 0 || rawMinutes > 180) {
          rawMinutes = cumulativeMinutes + (legDuration || 5);
          // Clamped sentinel — not real live data
          if (liveData) liveData.isLive = false;
          leg.isTimetableEstimate = true;
        }
        minutesToDeparture = rawMinutes;

        // V13.6 FIX: Format departure as local clock time (state-aware)
        const departDate = new Date(actualDepartureMs);  // Use actual GTFS-RT timestamp for precise clock time
        const departMelb = getMelbourneDisplayTime(departDate, state);
        const departH12 = departMelb.hour % 12 || 12;
        const departAmPm = departMelb.hour >= 12 ? 'pm' : 'am';
        departTime = `${departH12}:${departMelb.minute.toString().padStart(2, '0')}${departAmPm}`;

      } else if (liveData.minutes !== undefined) {
        // Fallback: use minutes from live data (already from now)
        minutesToDeparture = liveData.minutes;
        const departMs = nowMs + (liveData.minutes * 60000);
        // V13.6 FIX: Format departure as local clock time (state-aware)
        const departDate = new Date(departMs);
        const departMelb = getMelbourneDisplayTime(departDate, state);
        const departH12 = departMelb.hour % 12 || 12;
        const departAmPm = departMelb.hour >= 12 ? 'pm' : 'am';
        departTime = `${departH12}:${departMelb.minute.toString().padStart(2, '0')}${departAmPm}`;
        nextDepartureTimesMs = [departMs];

      }
    }

    // V15.0: Timetable fallback. If GTFS-RT has no live data for this transit leg,
    // estimate departure as arrival + 2 min average wait. Per Section 23.6: No mock
    // data. Live GTFS-RT or timetable estimate with "Scheduled ~Xmin" display.
    if (isTransitLeg && !actualDepartureMs) {
      leg.isTimetableEstimate = true;
      if (!options.isTomorrowCommute) {
        // Only calculate departure times for today — tomorrow's times would be tonight's, not morning's
        const estWaitMins = 2;
        const estDepartMins = nowMins + cumulativeMinutes + estWaitMins;
        const estH = Math.floor(estDepartMins / 60) % 24;
        const estM = estDepartMins % 60;
        const estH12 = estH % 12 || 12;
        const estAmPm = estH >= 12 ? 'pm' : 'am';
        departTime = `~${estH12}:${estM.toString().padStart(2, '0')}${estAmPm}`;
        minutesToDeparture = Math.min(cumulativeMinutes + estWaitMins, 180);
        // Provide estimated departure timestamps so renderer can show 3 departures
        const estDepartMs = nowMs + (minutesToDeparture * 60000);
        const headway = leg.type === 'tram' ? 8 : (leg.type === 'train' ? 10 : 15);
        nextDepartureTimesMs = [
          estDepartMs,
          estDepartMs + (headway * 60000),
          estDepartMs + (headway * 2 * 60000)
        ];
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
    } else if (isTransitLeg && !actualDepartureMs) {
      // No live data — add average wait estimate to journey contribution
      journeyContribution = legDuration + 2;
    }

    // V15.0: Populate route/line info from live data BEFORE title/subtitle generation
    // Engine templates may have empty routeNumber (e.g. tram) — fill from GTFS-RT match
    // Preferred tram route already pinned above (before findMatchingDeparture)
    if (isTransitLeg && liveData) {
      if (!leg.routeNumber && liveData.routeNumber) leg.routeNumber = liveData.routeNumber;
      if (!leg.lineName && liveData.lineName) leg.lineName = liveData.lineName;
    }

    // V15.0: Apply walk buffer to leg.minutes before subtitle generation
    // so subtitle shows the same duration as the minutes time box
    if (isWalkLeg) {
      leg.minutes = legDuration;
      leg.durationMinutes = legDuration; // Ensure fallback field also uses capped value
    }

    // V16.0: TOMORROW mode — suppress departure data for ALL legs.
    // Today's departure times are meaningless for tomorrow's commute and create
    // impossible arithmetic (e.g. 5:21pm departure → 9:00am arrival).
    // Walk legs show walk duration; transit legs show transit duration (ride time).
    if (options.isTomorrowCommute) {
      departTime = null;
      minutesToDeparture = legDuration; // Show leg duration (walk or transit) instead of "minutes from NOW"
      nextDepartureTimesMs = null;
      actualDepartureMs = null;
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
      // V15.0: Live data flags — transit legs only exist here when GTFS-RT matched
      isLive: isTransitLeg && liveData?.isLive === true,
      isTimetableEstimate: leg.isTimetableEstimate || false,
      // V13.6: Stop/station names for renderer display
      originStop: leg.originStop,
      originStation: leg.originStation,
      stopName: leg.stopName,
      stationName: leg.stationName,
      lineName: leg.lineName || liveData?.lineName,
      routeNumber: leg.routeNumber || liveData?.routeNumber,
      destinationName: leg.destination?.name || null
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

      // V15.0: Calculate "Next: x, y, z" ONLY from catchable departures.
      // baseLeg.nextDepartureTimesMs is already filtered to departures >= arrivalAtStopMs.
      // Do NOT fall back to liveData.nextDepartures — those include uncatchable departures.
      if (baseLeg.nextDepartureTimesMs?.length > 0) {
        baseLeg.nextDepartures = baseLeg.nextDepartureTimesMs.map(depMs =>
          Math.round((depMs - nowMs) / 60000)
        );
      }

      // Issue 6: Sanitise GTFS disruption jargon before user-facing display
      // Per DEVELOPMENT-RULES Section 23.6: no GTFS jargon in user-facing labels
      const sanitiseDisruptionText = (text) => {
        if (!text) return text;
        return text
          .replace(/PlannedOccupation/gi, 'Planned Works')
          .replace(/UnplannedOccupation/gi, 'Service Disruption')
          .replace(/PartCancellation/gi, 'Partial Cancellation')
          .replace(/ReducedService/gi, 'Reduced Service')
          .replace(/SignificantDelays/gi, 'Significant Delays')
          .replace(/StopNotServiced/gi, 'Stop Not Serviced');
      };

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
          baseLeg.serviceAlert = sanitiseDisruptionText(matchingDisruption.headerText || matchingDisruption.description);
          baseLeg.alertText = sanitiseDisruptionText(matchingDisruption.description || matchingDisruption.headerText);
          // V13.6: Format as "TRAM 58 +5 MIN" or "TRAIN DELAYED"
          const routeLabel = leg.routeNumber ? `${leg.type.toUpperCase()} ${leg.routeNumber}` : leg.type.toUpperCase();
          if (baseLeg.delayMinutes) {
            baseLeg.alertText = `${routeLabel} +${baseLeg.delayMinutes} MIN`;
          } else if (matchingDisruption.type === 'suspension' || matchingDisruption.type === 'cancelled') {
            baseLeg.status = 'suspended';
            baseLeg.state = 'suspended';
            baseLeg.alertText = `${routeLabel} SUSPENDED`;
          } else {
            baseLeg.alertText = sanitiseDisruptionText(matchingDisruption.headerText) || `${routeLabel} DISRUPTED`;
          }
        }
      }
    }

    // Convert timetable nextDepartureTimesMs to nextDepartures (minutes from now)
    // when live data matching didn't run (timetable fallback path)
    if (isTransitLeg && !baseLeg.nextDepartures && baseLeg.nextDepartureTimesMs?.length > 0) {
      baseLeg.nextDepartures = baseLeg.nextDepartureTimesMs.map(depMs =>
        Math.round((depMs - nowMs) / 60000)
      );
    }

    // Subtitle for transit legs: timetable estimate OR "Next:" catchable departures
    // V16.0: TOMORROW mode — always show "Scheduled ~Xmin" (no live data applies tomorrow)
    if (isTransitLeg && options.isTomorrowCommute) {
      const estMins = Math.max(1, leg.minutes || leg.durationMinutes || 0);
      baseLeg.subtitle = `Scheduled ~${estMins}min`;
      baseLeg.isTimetableEstimate = true;
      baseLeg.nextDepartures = [];
      baseLeg.nextDepartureTimesMs = [];
    } else if (isTransitLeg && baseLeg.isTimetableEstimate) {
      const estMins = Math.max(1, baseLeg.minutes || 0);
      baseLeg.subtitle = `Scheduled ~${estMins}min`;
      baseLeg.nextDepartures = [];  // Prevent renderer from appending timetable departures
      baseLeg.nextDepartureTimesMs = [];  // Renderer checks this FIRST — must also clear
    } else if (isTransitLeg && baseLeg.nextDepartures?.length > 0) {
      const times = baseLeg.nextDepartures
        .filter(m => m >= 0 && m <= 120)
        .slice(0, 3)
        .join(', ');
      const liveSuffix = baseLeg.isLive ? ' LIVE' : '';

      if (times) {
        baseLeg.subtitle = `Next: ${times} min${liveSuffix}`;
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
      if (dest === 'work') return `Walk to ${leg.workName || 'Office'}`;
      if (dest?.toLowerCase() === 'tram stop' && leg.stopName) return `Walk to ${leg.stopName}`;
      if ((dest?.toLowerCase() === 'train platform' || dest?.toLowerCase() === 'station') && leg.stationName) return `Walk to ${leg.stationName}`;
      if (dest?.toLowerCase() === 'tram stop') return 'Walk to Tram Stop';
      if (dest?.toLowerCase() === 'train platform' || dest?.toLowerCase() === 'station') return `Walk to ${leg.stationName || 'Station'}`;
      // Use stationName/stopName if available before falling back to generic dest
      if (leg.stationName) return `Walk to ${leg.stationName}`;
      if (leg.stopName) return `Walk to ${cleanStopName(leg.stopName)}`;
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
      const destName = leg.destination?.name || 'City';
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
      // V15.0: Subtitle = line name + origin → destination. "Next:" appended later in
      // buildJourneyLegs() using catchable departures (filtered by user arrival time).
      const parts = [];
      const lineName = leg.lineName || leg.routeNumber || '';
      const originName = getStopName() || 'Station';
      if (lineName) parts.push(lineName);
      const destName = leg.destination?.name;
      if (destName && !isGenericName(destName) && destName !== originName) {
        parts.push(`${originName} → ${destName}`);
      } else {
        parts.push(originName);
      }
      return parts.join(' • ');
    }
    case 'tram': {
      // V15.0: Origin → destination. "Next:" appended later from catchable departures
      const originName = getStopName() || 'Tram Stop';
      const destName = leg.destination?.name;
      if (destName && !isGenericName(destName) && destName !== originName) {
        return `${originName} → ${destName}`;
      }
      return originName;
    }
    case 'bus': {
      // V15.0: Origin → destination. "Next:" appended later from catchable departures
      const originName = getStopName() || 'Bus Stop';
      const destName = leg.destination?.name;
      if (destName && !isGenericName(destName) && destName !== originName) {
        return `${originName} → ${destName}`;
      }
      return originName;
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
                     leg.type === 'bus' ? transitData.buses :
                     leg.type === 'vline' ? transitData.trains : [];

  if (!departures?.length) return null;

  let matchedDepartures = departures;

  if (leg.type === 'train' || leg.type === 'vline') {
    // For trains: filter by DIRECTION, not route number.
    // Multiple lines serve the same station — user catches the next one going their way.
    // isCitybound is set by processGtfsRtDepartures from the trip's final stop.
    if (leg.isCitybound !== undefined) {
      let dirMatches = departures.filter(d => d.isCitybound === leg.isCitybound);
      // Metro Tunnel vs City Loop: prefer matching tunnel/loop trains
      if (leg.requiresCityLoop && dirMatches.some(d => !d.isMetroTunnel)) {
        dirMatches = dirMatches.filter(d => !d.isMetroTunnel);
      } else if (leg.requiresMetroTunnel && dirMatches.some(d => d.isMetroTunnel)) {
        dirMatches = dirMatches.filter(d => d.isMetroTunnel);
      }
      // Fallback: if tunnel/loop filtering removed all, accept any in right direction
      if (dirMatches.length > 0) {
        matchedDepartures = dirMatches;
      } else {
        // Accept any citybound train rather than returning null —
        // trains are running through different tunnel, not "not running"
        const allDir = departures.filter(d => d.isCitybound === leg.isCitybound);
        if (allDir.length > 0) {
          matchedDepartures = allDir;
        } else {
          return null;
        }
      }
    }
    // No route number filtering for trains — any line in the right direction
  } else if (leg.routeNumber) {
    // For trams/buses: filter by route number (specific routes serve specific corridors)
    const routeMatches = departures.filter(d =>
      d.routeNumber?.toString() === leg.routeNumber.toString()
    );
    if (routeMatches.length > 0) {
      matchedDepartures = routeMatches;
    } else {
      return null;
    }
  }

  // Clone primary to avoid mutating shared transitData objects
  const primary = { ...matchedDepartures[0] };
  if (primary) {
    // Collect all departure times in milliseconds for live countdown
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
 * @param {Date} now
 * @param {number} totalMinutes
 * @param {string} [state] - Australian state code
 */
function calculateArrivalTime(now, totalMinutes, state) {
  const arrival = new Date(now.getTime() + totalMinutes * 60000);
  return formatTime(arrival, state);
}

/**
 * V15.0: Filter transit legs — REMOVE legs when GTFS-RT confirms no services running.
 * Only legs with verified live departure data are kept in the route.
 *
 * Behaviour:
 * - No live departures → leg REMOVED (service not running per GTFS-RT)
 * - Walk faster than transit → leg kept, marked walkFasterFlag=true
 * - Last service detected → leg kept, marked isLastService=true
 *
 * Removed transit legs cause surrounding walk legs to become adjacent.
 * mergeConsecutiveWalkLegs() combines them after buildJourneyLegs().
 *
 * @param {Object} route - Route with legs array
 * @param {Object} transitData - Live transit data (trains, trams, buses)
 * @param {number} walkSpeedKmPerHour - Average walking speed (default 4.5 km/h)
 * @returns {Object} - { route: filtered route, transitNotice: string|null }
 */
function filterUnavailableTransitLegs(route, transitData, walkSpeedKmPerHour = 4.5) {
  if (!route?.legs) return { route, transitNotice: null };

  const filteredLegs = [];
  let transitNotice = null;
  let removedTypes = [];  // Transit types falling back to timetable data
  let walkFasterTypes = []; // Transit types where walking may be faster

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const nextLeg = route.legs[i + 1];
    const prevLeg = i > 0 ? route.legs[i - 1] : null;

    // Check if this is a transit leg
    const isTransitLeg = ['train', 'tram', 'bus', 'vline'].includes(leg.type);

    if (isTransitLeg) {
      // Get departures for this transit type
      const departures = leg.type === 'train' ? transitData.trains :
                         leg.type === 'tram' ? transitData.trams :
                         leg.type === 'bus' ? transitData.buses : [];

      // V15.0: Filter departures consistent with findMatchingDeparture().
      let routeDepartures = departures;
      if (leg.type === 'train' || leg.type === 'vline') {
        // Determine direction and Metro Tunnel/City Loop from destination name.
        // These flags may not be set yet (buildJourneyLegs sets them later),
        // so derive them here to ensure correct filtering before leg construction.
        const destName = (leg.destination?.name || '').toLowerCase();
        const cityStations = ['flinders', 'parliament', 'melbourne central', 'flagstaff',
          'southern cross', 'town hall', 'state library', 'parkville', 'arden', 'anzac', 'city'];
        const isCitybound = leg.isCitybound !== undefined ? leg.isCitybound :
          cityStations.some(s => destName.includes(s));
        const cityLoopStations = ['flinders', 'parliament', 'melbourne central', 'flagstaff', 'southern cross'];
        const metroTunnelStations = ['town hall', 'state library', 'parkville', 'arden', 'anzac'];
        const requiresCityLoop = leg.requiresCityLoop || cityLoopStations.some(s => destName.includes(s));
        const requiresMetroTunnel = leg.requiresMetroTunnel || metroTunnelStations.some(s => destName.includes(s));

        // For trains: filter by direction, not route number — any line in the right direction
        if (isCitybound && departures && departures.length > 0) {
          let dirMatches = departures.filter(d => d.isCitybound === isCitybound);
          // Metro Tunnel vs City Loop: prefer matching tunnel/loop trains
          if (requiresCityLoop && dirMatches.some(d => !d.isMetroTunnel)) {
            dirMatches = dirMatches.filter(d => !d.isMetroTunnel);
          } else if (requiresMetroTunnel && dirMatches.some(d => d.isMetroTunnel)) {
            dirMatches = dirMatches.filter(d => d.isMetroTunnel);
          }
          // Fallback: if tunnel/loop filtering removed all trains, accept any citybound.
          // Trains ARE running (just through different tunnel) — not "NOT RUNNING".
          routeDepartures = dirMatches.length > 0 ? dirMatches : departures.filter(d => d.isCitybound === isCitybound);
        }
      } else if (leg.routeNumber && departures && departures.length > 0) {
        // For trams/buses: filter by route number
        const routeMatches = departures.filter(d =>
          d.routeNumber?.toString() === leg.routeNumber.toString()
        );
        if (routeMatches.length > 0) {
          routeDepartures = routeMatches;
        } else {
          routeDepartures = [];
        }
      }

      const hasDepartures = routeDepartures && routeDepartures.length > 0;
      const isLastService = routeDepartures && routeDepartures.length === 1;

      if (!hasDepartures) {
        // V15.0: No live GTFS-RT data — keep transit leg with timetable estimate.
        // The leg retains its original type and duration so journey time remains
        // accurate. The renderer shows "Scheduled ~Xmin" via isTimetableEstimate.
        leg.dataSource = 'timetable';
        leg.isLive = false;
        leg.isTimetableEstimate = true;
        removedTypes.push(leg.type);
      } else {
        // Live data is available - mark the leg accordingly
        leg.dataSource = 'live';
        leg.isLive = true;
        leg.isScheduleOnly = false;
      }

      // Check if prior walk leg is longer than transit wait time
      const priorWalkTime = prevLeg?.type === 'walk' ? (prevLeg.minutes || prevLeg.durationMinutes || 0) : 0;
      const firstDepMinutes = departures?.[0]?.minutes || 0;
      const walkLongerThanWait = priorWalkTime > firstDepMinutes;

      // V13.6: Check if walk time > transit wait AND it's the last service
      if (walkLongerThanWait && isLastService) {
        // Still include the leg but mark it
        leg.isLastService = true;
        leg.noOtherOptions = true;
      }

      // V15.0: Check if walking would be faster
      // Calculate: walk_time + 5 < wait_time + transit_duration
      const firstDep = departures[0];
      if (firstDep) {
        const waitMinutes = firstDep.minutes || 0;
        const transitDuration = leg.minutes || leg.durationMinutes || 10;
        const totalTransitTime = waitMinutes + transitDuration;

        // Estimate walk time for same distance (rough: transit distance ~= 2.5x walk time)
        // This is a heuristic - actual walk distance should come from route
        const estimatedWalkTime = leg.walkDistanceMinutes || (transitDuration * 2.5);

        if (estimatedWalkTime + 5 < totalTransitTime) {
          // V15.0 FIX: Do NOT remove the leg. Mark it so the renderer can decide.
          leg.walkFasterFlag = true;
          walkFasterTypes.push(leg.type);
        }
      }
    }

    // Add leg to filtered output (all legs are preserved)
    filteredLegs.push(leg);
  }

  // V15.0: Set transitNotice when legs were removed due to no live data
  if (removedTypes.length > 0) {
    const uniqueTypes = [...new Set(removedTypes)];
    const typeLabel = uniqueTypes.map(t => t.toUpperCase()).join(' + ');
    transitNotice = `${typeLabel} SCHEDULED`;
  }

  // If walk-faster was detected on any leg, append to notice
  if (walkFasterTypes.length > 0) {
    const uniqueWalkTypes = [...new Set(walkFasterTypes)];
    const walkLabel = uniqueWalkTypes.map(t => t.toUpperCase()).join(' + ');
    const walkNotice = `${walkLabel} MAY BE SLOWER THAN WALKING`;
    transitNotice = transitNotice ? `${transitNotice} • ${walkNotice}` : walkNotice;
  }

  // V15.0: Return route with legs that have verified live data
  return {
    route: { ...route, legs: filteredLegs },
    transitNotice,
    removedTypes,
    walkFasterTypes
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
    // Random (original behaviour)
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
    if (['train', 'tram', 'bus', 'vline'].includes(leg.type)) {
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
async function handleRandomJourney(req, res, options = {}) {
  try {
    // v1.23: Accept legs parameter for target leg count
    const targetLegs = parseInt(req.query?.legs) || null;
    const journey = generateRandomJourney(targetLegs);


    // Build dashboard data
    const dashboardData = {
      location: options.setupPending ? 'Setup Complete' : journey.origin,
      current_time: journey.currentTime,
      ampm: journey.ampm,
      day: journey.dayOfWeek,
      date: journey.date,
      temp: journey.weather.temp,
      condition: journey.weather.condition,  // v1.24: use 'condition' key
      weather: journey.weather.condition,    // Also set weather for compat
      umbrella: journey.weather.umbrella,
      status: options.setupPending ? 'CONFIGURED' : journey.status,
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
    if (options.setupPending) res.setHeader('X-Setup-Pending', 'true');
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
 * Retry wrapper for GTFS-RT fetches — single retry with exponential backoff.
 * Returns [] on exhaustion so Promise.all() never rejects.
 */
async function fetchWithRetry(fetchFn, label, retries = 1, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (e) {
      if (attempt < retries) {
        console.warn(`[${label}] Fetch attempt ${attempt + 1} failed: ${e.message} — retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else {
        console.error(`[${label}] All ${retries + 1} fetch attempts failed: ${e.message}`);
        return [];
      }
    }
  }
}

/**
 * Main handler - Vercel serverless function
 */
export default async function handler(req, res) {
  // CORS headers - required for admin panel preview
  // Configurable origin restriction — defaults to '*' for backwards compatibility
  const allowedOrigin = process.env.CC_ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Device authentication — optional, enabled via Redis preference
    // Backwards-compatible: existing devices without tokens continue to work unless
    // the operator explicitly sets cc:device-auth-required to 'true' in Redis.
    const kvClient = await getClient();
    if (kvClient) {
      const deviceAuthRequired = await kvClient.get('cc:device-auth-required');
      if (deviceAuthRequired === 'true') {
        const deviceToken = req.headers['x-device-token'] || req.query.token;
        if (!deviceToken) {
          return res.status(401).json({ error: 'Device authentication required. Set X-Device-Token header or ?token= parameter.' });
        }
        const storedToken = await kvClient.get('cc:device-token');
        // Timing-safe comparison prevents timing side-channel attacks
        if (!storedToken) {
          return res.status(403).json({ error: 'Invalid device token.' });
        }
        const tokenBuf = Buffer.from(String(deviceToken));
        const storedBuf = Buffer.from(String(storedToken));
        if (tokenBuf.length !== storedBuf.length || !crypto.timingSafeEqual(tokenBuf, storedBuf)) {
          return res.status(403).json({ error: 'Invalid device token.' });
        }
      }
    }

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
    // CCFirm sends battery info via X-Battery-Percent and X-Battery-Voltage headers
    // Node.js/Vercel lowercases all headers, so X-Battery-Percent becomes x-battery-percent
    const batteryPercent = parseInt(req.query?.bat_pct || req.query?.battery || req.headers?.['x-battery-percent'] || req.headers?.['x-battery'] || req.headers?.['battery']) || null;
    const batteryVoltage = parseFloat(req.query?.bat_v || req.query?.voltage || req.headers?.['x-battery-voltage'] || req.headers?.['x-voltage']) || null;
    const powerSource = req.headers?.['x-power-source'] || null;
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

    // Initialize engine and get route (need state before time formatting)
    // Issue 1: Wrap engine invocation in try/catch to prevent crash on tight constraints
    let engine, route, locations, config;
    try {
      engine = await getEngine();
      route = engine.getSelectedRoute();
      locations = engine.getLocations();
      config = engine.journeyConfig;
    } catch (engineErr) {
      console.error('[CommuteCompute] Engine initialization failed:', engineErr.message);
      // Return valid JSON error response instead of crashing to HTML
      if (req.method === 'POST' || req.query?.format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({
          success: false,
          error: 'Engine initialization failed',
          code: 'ENGINE_ERROR',
          journey_legs: [],
          summary: { totalMinutes: 0, status: 'error' },
          coffee: { canGet: false, decision: 'SKIP', subtext: 'Engine unavailable' }
        });
      }
      // For image formats, re-throw to hit outer catch which returns JSON error
      throw engineErr;
    }

    // Get user's state for timezone-aware time calculations
    const userState = await getUserState() || 'VIC';

    // Get current time (or simulated time for testing)
    let now = getMelbourneTime();
    if (simOverrides.simulatedTime) {
      const [simH, simM] = simOverrides.simulatedTime.split(':').map(Number);
      now = new Date(now);
      now.setHours(simH, simM, 0, 0);
    }
    const currentTime = formatTime(now, userState);
    const melbourneTime = getMelbourneDisplayTime(now, userState);
    const amPm = melbourneTime.hour >= 12 ? 'pm' : 'am';
    const { day, date } = formatDateParts(now, userState);

    // If no journey configured, fall back to random mode for preview
    // This ensures the Live Data tab shows something useful even before full config
    if (!locations.home?.address && !route?.legs?.length) {
      return handleRandomJourney(req, res, { setupPending: true });
    }

    // Fetch live data from sources
    // Per Section 3.1: Zero-Config - get stop IDs from preferences (KV), no process.env
    // V13.6: Auto-detect stop IDs from home address if not configured
    const kvPrefs = await getPreferences();

    // Home address and coordinates for stop detection
    const homeAddress = locations.home?.address || kvPrefs?.addresses?.home;
    const homeCoords = (locations.home?.lat && locations.home?.lon)
      ? { lat: locations.home.lat, lon: locations.home.lon }
      : null;

    // Coordinate-based detection is ALWAYS preferred when available
    // Stored Redis IDs have proven unreliable (wrong station 40km away, non-existent stops)
    let trainStopId = null;
    let tramStopId = null;
    let busStopId = null;
    let detectedTramRoute = null;
    let stopDetectionSource = null;

    if (homeCoords || homeAddress) {
      const detected = detectStopIdsFromAddress(homeAddress, homeCoords);
      stopDetectionSource = detected?.source || null;
      trainStopId = detected.trainStopId || null;
      tramStopId = detected.tramStopId || null;
      busStopId = detected.busStopId || null;
      detectedTramRoute = detected.tramRouteNumber || null;
    }

    // Fallback to stored Redis IDs only when coordinate detection returns nothing
    if (!trainStopId) trainStopId = kvPrefs?.trainStopId || null;
    if (!tramStopId) tramStopId = kvPrefs?.tramStopId || null;
    if (!busStopId) busStopId = kvPrefs?.busStopId || null;
    if (!stopDetectionSource && (trainStopId || tramStopId)) stopDetectionSource = 'stored';

    // Apply user station overrides from admin panel (persistent Redis preferences)
    let stationOverrides = {};
    try { stationOverrides = await getStationOverrides() || {}; } catch (e) {}
    if (stationOverrides.train_0?.id) {
      trainStopId = stationOverrides.train_0.id;
      stopDetectionSource = 'user-override';
    }
    if (stationOverrides.tram_0?.id) {
      tramStopId = stationOverrides.tram_0.id;
    }
    if (stationOverrides.bus_0?.id) {
      busStopId = stationOverrides.bus_0.id;
    }

    // Load preferred tram route for consistent display (pinned by user)
    let preferredTramRoute = null;
    try { preferredTramRoute = await getPreferredTramRoute(); } catch (e) {}

    console.log(`[CommuteCompute] Stop detection: train=${trainStopId}, tram=${tramStopId}, bus=${busStopId}, source=${stopDetectionSource}, preferredTram=${preferredTramRoute}`);

    // Auto-detect work-side stop IDs for train destination resolution
    let workTrainStopId = null;
    const workAddress = locations.work?.address || kvPrefs?.addresses?.work;
    if (workAddress) {
      const workCoords = (locations.work?.lat && locations.work?.lon)
        ? { lat: locations.work.lat, lon: locations.work.lon }
        : null;
      const workDetected = detectStopIdsFromAddress(workAddress, workCoords);
      workTrainStopId = workDetected?.trainStopId || null;
    }

    // Per Section 11.8: Zero-Config compliant - load API key from KV storage
    // getTransitApiKey() returns a string from Redis (the raw API key)
    // Defensive: also handles legacy { devId, apiKey } object format if stored
    const transitApiKey = await getTransitApiKey();
    const apiKeyStr = typeof transitApiKey === 'string' ? transitApiKey : (transitApiKey?.apiKey || null);
    const apiOptions = apiKeyStr ? { apiKey: apiKeyStr } : {};

    // Respect Free Mode: skip GTFS-RT when user explicitly selected cached mode
    const apiMode = kvPrefs?.apiMode || 'live';

    // Early isTomorrowCommute detection — skip live data when past target arrival
    // Prevents showing tonight's departures when user should see tomorrow's commute
    const earlyTimezone = STATE_TIMEZONES[userState] || 'Australia/Melbourne';
    const earlyLocalDateStr = now.toLocaleDateString('en-AU', { timeZone: earlyTimezone, weekday: 'short' });
    const earlyDayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const earlyDayOfWeek = earlyDayMap[earlyLocalDateStr.slice(0, 3)] ?? now.getDay();
    const earlyCommuteDays = config?.journey?.commuteDays || [1, 2, 3, 4, 5];
    const earlyIsCommuteDay = earlyCommuteDays.includes(earlyDayOfWeek);
    const earlyMelbTime = getMelbourneDisplayTime(now, userState);
    const earlyNowMins = earlyMelbTime.hour * 60 + earlyMelbTime.minute;
    const earlyArrival = config?.journey?.arrivalTime || '09:00';
    const [eArrH, eArrM] = earlyArrival.split(':').map(Number);
    const earlyTargetMins = eArrH * 60 + eArrM;
    const earlyIsTomorrowCommute = earlyIsCommuteDay && earlyNowMins > earlyTargetMins + 180;

    // Valid API key = user wants live data, regardless of stored apiMode
    // Root cause of 21 failed live data attempts: generate-webhook.js stored apiMode='cached',
    // causing skipLiveData=true even with valid API key — API was NEVER called
    const skipLiveData = ((apiMode === 'cached') && !apiKeyStr) || earlyIsTomorrowCommute;

    if (apiKeyStr) {
      console.log(`[CommuteCompute] API key present (${apiKeyStr.substring(0, 8)}...), apiMode=${apiMode}, skipLiveData=${skipLiveData}`);
    }

    if (skipLiveData) {
      console.warn('[CommuteCompute] Live data skipped — no API key and apiMode is cached');
    }

    if (!apiKeyStr && !skipLiveData) {
      console.warn('[CommuteCompute] No transit API key in Redis — GTFS-RT requests will use fallback getApiKey()');
    }

    // V15.0: Extract tram/bus route numbers from journey legs for GTFS-RT route-level matching
    // When stop-level matching fails (common for trams), route-level matching can find live data
    // Fallback chain: engine route leg → auto-detected from address suburb
    const tramLeg = route?.legs?.find(l => l.type === 'tram');
    const busLeg = route?.legs?.find(l => l.type === 'bus');
    const tramApiOptions = { ...apiOptions };
    // Don't filter tram API by route number — multiple lines serve the same stop
    // and user wants to see whichever line is coming next
    const tramRouteNum = tramLeg?.routeNumber || detectedTramRoute;
    if (tramRouteNum) tramApiOptions.routeNumber = tramRouteNum;
    const busApiOptions = { ...apiOptions };
    if (busLeg?.routeNumber) busApiOptions.routeNumber = busLeg.routeNumber;

    // V15.0: Extract train line code for route-level fallback
    const trainLeg = route?.legs?.find(l => l.type === 'train' || l.type === 'vline');
    const trainApiOptions = { ...apiOptions };
    if (trainLeg?.lineName) {
      const lineEntry = Object.entries(METRO_LINE_NAMES).find(
        ([, name]) => name.toLowerCase() === trainLeg.lineName.toLowerCase()
      );
      if (lineEntry) trainApiOptions.lineCode = lineEntry[0];
    }

    const [trains, trams, buses, weather, metroDisruptions, tramDisruptions, busDisruptions] = await Promise.all([
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(trainStopId, 0, trainApiOptions), 'screen-train'),
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(tramStopId, 1, tramApiOptions), 'screen-tram'),
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(busStopId, 2, busApiOptions), 'screen-bus'),
      getWeather(locations.home?.lat, locations.home?.lon),
      skipLiveData ? Promise.resolve([]) : getDisruptions(0, apiOptions).catch(() => []),
      skipLiveData ? Promise.resolve([]) : getDisruptions(1, apiOptions).catch(() => []),
      skipLiveData ? Promise.resolve([]) : getDisruptions(2, apiOptions).catch(() => [])
    ]);
    const disruptions = [...metroDisruptions, ...tramDisruptions, ...busDisruptions];

    const transitData = { trains, trams, buses, disruptions };

    // Determine if we actually have live transit data (from GTFS-RT, not fallback)
    // Per Section 23.6: "LIVE" indicators must reflect actual data source
    const hasLiveTrainData = trains.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad') && t.isLive === true);
    const hasLiveTramData = trams.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad') && t.isLive === true);
    const hasLiveBusData = buses.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad') && t.isLive === true);
    const hasAnyLiveData = hasLiveTrainData || hasLiveTramData || hasLiveBusData;

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
    // V13.6 FIX: Use local time for business hours check (state-aware)
    const melbDisplayTime = getMelbourneDisplayTime(now, userState);
    const hour = melbDisplayTime.hour;
    // FIX: Use Melbourne-local dayOfWeek (not UTC) — on Vercel, now.getDay() is UTC
    // which can differ from Melbourne day (e.g. Saturday 11pm AEST = Sunday UTC)
    const timezone = STATE_TIMEZONES[userState] || 'Australia/Melbourne';
    const localDateStr = now.toLocaleDateString('en-AU', { timeZone: timezone, weekday: 'short' });
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[localDateStr.slice(0, 3)] ?? now.getDay();

    // Weekend / non-commute day detection
    const commuteDays = config?.journey?.commuteDays || [1, 2, 3, 4, 5]; // Mon-Fri default
    const isCommuteDay = commuteDays.includes(dayOfWeek);
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

    // Issue 3: When cafe is closed/skipped, REMOVE the coffee leg entirely from journey
    // and merge surrounding walk legs into a direct bypass walk. This prevents a
    // closed cafe from allocating 5 min in the journey total.
    let effectiveRoute = route;
    if (coffeeDecision.cafeClosed || !coffeeDecision.canGet) {
      const routeLegs = [...(route?.legs || []).map(l => ({ ...l }))];
      const coffeeIdx = routeLegs.findIndex(leg => leg.type === 'coffee');

      if (coffeeIdx >= 0) {
        // Find walk-to-cafe (walk leg immediately before coffee)
        const walkToCafeIdx = coffeeIdx > 0 && routeLegs[coffeeIdx - 1].type === 'walk'
          ? coffeeIdx - 1 : -1;

        // Find walk-from-cafe (walk leg immediately after coffee)
        const walkFromCafeIdx = coffeeIdx + 1 < routeLegs.length && routeLegs[coffeeIdx + 1].type === 'walk'
          ? coffeeIdx + 1 : -1;

        // Find the leg AFTER all cafe-related legs (the "post-cafe" destination)
        const postCafeIdx = walkFromCafeIdx >= 0 ? walkFromCafeIdx + 1 : coffeeIdx + 1;
        const postCafeLeg = routeLegs[postCafeIdx];

        // Recalculate the walk-to-cafe leg as a direct bypass walk
        if (walkToCafeIdx >= 0 && postCafeLeg) {
          const bypassLeg = routeLegs[walkToCafeIdx];
          const walkFromCafeMins = walkFromCafeIdx >= 0
            ? (routeLegs[walkFromCafeIdx].minutes || routeLegs[walkFromCafeIdx].durationMinutes || 0) : 0;
          const walkToCafeMins = bypassLeg.minutes || bypassLeg.durationMinutes || 0;
          bypassLeg.minutes = walkToCafeMins + walkFromCafeMins;
          bypassLeg.durationMinutes = bypassLeg.minutes;
          const transitStopName = postCafeLeg.stopName || postCafeLeg.stationName || postCafeLeg.to || postCafeLeg.origin?.name || 'transit';
          bypassLeg.to = transitStopName;
          bypassLeg.title = `Walk to ${transitStopName}`;
          bypassLeg.stopName = postCafeLeg.stopName || bypassLeg.stopName;
          bypassLeg.stationName = postCafeLeg.stationName || bypassLeg.stationName;
          bypassLeg.destinationName = null;
          bypassLeg.cafeName = null;
          bypassLeg.coffeeBypass = true;
        }

        // Mark coffee leg AND walk-from-cafe for removal
        routeLegs[coffeeIdx]._removeForBypass = true;
        if (walkFromCafeIdx >= 0) {
          routeLegs[walkFromCafeIdx]._removeForBypass = true;
        }

        // Remove coffee leg and walk-from-cafe (both absorbed into bypass)
        const bypassedLegs = routeLegs.filter(leg => !leg._removeForBypass);
        effectiveRoute = { ...route, legs: bypassedLegs };
      }
    }

    // V15.0: Remove transit legs with no live GTFS-RT data (service not running)
    const transitFilterResult = filterUnavailableTransitLegs(effectiveRoute, transitData);
    effectiveRoute = transitFilterResult.route;
    const transitNotice = transitFilterResult.transitNotice;
    const removedTypes = transitFilterResult.removedTypes || [];
    const walkFasterTypes = transitFilterResult.walkFasterTypes || [];
    // Build journey legs with cumulative timing (Data Model v1.18)
    // V13.6: Pass locations for deriving proper stop/station names
    // V13.6: Pass stopIds for actual stop name lookup via GTFS_STOP_NAMES
    const rawJourneyLegs = buildJourneyLegs(effectiveRoute, transitData, coffeeDecision, now, locations, { trainStopId, tramStopId, busStopId, workTrainStopId }, userState, preferredTramRoute, { isTomorrowCommute: earlyIsTomorrowCommute });
    // Section 7.5.1: Merge consecutive walk legs after ALL filtering
    const journeyLegs = mergeConsecutiveWalkLegs(rawJourneyLegs);
    const totalMinutes = calculateTotalMinutes(journeyLegs);
    let statusType = getStatusType(journeyLegs, transitData.disruptions);

    // Override status type if specified
    if (simOverrides.status && simOverrides.status !== 'normal') {
      statusType = simOverrides.status === 'disruption' ? 'disruption' :
                   simOverrides.status === 'delayed' ? 'delay' : statusType;
    }

    // Build display values (use simulated overrides if provided)
    // Per Section 3.1: Zero-Config - no process.env for user addresses
    // Use stored suburb from Places API first, fall back to extractSuburb()
    // Filter out broad city-level names (e.g. "Melbourne") — prefer actual suburbs
    const isUsefulSuburb = (name) => {
      if (!name) return false;
      const broad = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin', 'canberra'];
      return !broad.includes(name.toLowerCase().trim());
    };
    const rawHomeSuburb = isUsefulSuburb(locations.home?.suburb) ? locations.home.suburb : extractSuburb(locations.home?.address);
    const rawWorkSuburb = isUsefulSuburb(locations.work?.suburb) ? locations.work.suburb : extractSuburb(locations.work?.address);
    // Safety net: extractSuburb may still return broad city names from certain address formats
    const homeSuburb = isUsefulSuburb(rawHomeSuburb) ? rawHomeSuburb : null;
    const workSuburb = isUsefulSuburb(rawWorkSuburb) ? rawWorkSuburb : null;
    const displayHome = simOverrides.home || homeSuburb || 'Home';
    const displayWork = simOverrides.work || workSuburb || 'Work';
    const displayArrival = simOverrides.arrivalTime || config?.journey?.arrivalTime || '09:00';

    // Calculate timing using display arrival (respects simulator override)
    // V13.6 FIX: Use local time for display calculations (state-aware)
    const [arrH, arrM] = displayArrival.split(':').map(Number);
    const targetMins = arrH * 60 + arrM;
    const melbTimeForLeave = getMelbourneDisplayTime(now, userState);
    const nowMinsForLeave = melbTimeForLeave.hour * 60 + melbTimeForLeave.minute;

    // Issue 4: Detect if current time is past today's target arrival.
    // If so, the journey should target tomorrow morning, not "leave now".
    // e.g. at 10:55pm with 9:00am target → show tomorrow's commute.
    const isPastTodaysTarget = isCommuteDay && nowMinsForLeave > targetMins + 60;
    const isTomorrowCommute = isPastTodaysTarget;

    // On non-commute days, leaveInMinutes is meaningless — set null to signal renderer
    let leaveInMinutes;
    if (!isCommuteDay) {
      leaveInMinutes = null;
    } else if (isTomorrowCommute) {
      // Minutes until tomorrow's departure: (minutes remaining today) + (target - journey duration)
      const minsUntilMidnight = 1440 - nowMinsForLeave;
      leaveInMinutes = minsUntilMidnight + Math.max(0, targetMins - totalMinutes);
    } else {
      leaveInMinutes = Math.max(0, targetMins - totalMinutes - nowMinsForLeave);
    }

    // V13.6: Calculate actual arrival time
    // Issue 4: When past today's target, calculate tomorrow's arrival instead
    let arrivalMins;
    if (isTomorrowCommute) {
      // Tomorrow's arrival = target arrival time (the whole point is arriving on time)
      arrivalMins = targetMins;
    } else {
      arrivalMins = nowMinsForLeave + totalMinutes;
    }
    const arrivalH = Math.floor(arrivalMins / 60) % 24;
    const arrivalM = arrivalMins % 60;
    const arrivalH12 = arrivalH % 12 || 12;
    const arrivalAmPm = arrivalH >= 12 ? 'pm' : 'am';
    const calculatedArrival = isTomorrowCommute
      ? `${arrivalH12}:${arrivalM.toString().padStart(2, '0')}${arrivalAmPm}`
      : `${arrivalH12}:${arrivalM.toString().padStart(2, '0')}${arrivalAmPm}`;

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
      currentMins: nowMinsForLeave,
      isCommuteDay,
      hasLiveData: hasAnyLiveData
    });
    // Confidence is not meaningful for tomorrow's commute — suppress
    if (isTomorrowCommute) {
      confidence.score = null;
      confidence.label = null;
      confidence.context = null;
    }
    // V14.0: Calculate Lifestyle Context Suggestions
    const lifestyleEngine = new LifestyleContext();
    const lifestyle = lifestyleEngine.calculate({
      weather: weatherData,
      currentTime: now,
      state: userState,
      localHour: melbourneTime.hour,
      localMinute: melbourneTime.minute
    });
    // V15.0: Sleep Optimizer - evening mode bedtime/alarm calculation
    const sleepEngine = new SleepOptimiser();
    const sleepData = sleepEngine.calculate({
      targetArrivalMins: targetMins,
      totalJourneyMins: totalMinutes,
      currentTime: now,
      wakeRoutineMins: kvPrefs?.wakeRoutineMins || 30,
      sleepHours: kvPrefs?.sleepHours || 8,
      localHour: melbourneTime.hour,
      localMinute: melbourneTime.minute
    });
    // V15.0: Alternative Transit - cost estimates when public transit is disrupted
    // Activate when: no transit legs exist, or all transit legs are cancelled/suspended
    const hasActiveTransit = journeyLegs.some(l => ['train', 'tram', 'bus', 'vline'].includes(l.type));
    const allTransitCancelled = journeyLegs
      .filter(l => ['train', 'tram', 'bus', 'vline'].includes(l.type))
      .every(l => ['cancelled', 'suspended'].includes(l.state));
    const showAltTransit = !hasActiveTransit || (hasActiveTransit && allTransitCancelled);
    const altTransitEngine = new AltTransit();
    const altTransit = altTransitEngine.calculate({
      totalWalkMins: totalMinutes,
      currentTime: now,
      transitNotice: showAltTransit ? (transitNotice || 'TRANSIT DISRUPTED') : null,
      legs: journeyLegs,
      localHour: melbourneTime.hour
    });
    // V15.0: Lifestyle Mindset - stress, steps, apparent temperature
    // Max delay from any transit leg for stress assessment
    const transitLegsWithDelay = journeyLegs.filter(l => typeof l.delayMinutes === 'number' && l.delayMinutes > 0);
    const maxDelayMinutes = transitLegsWithDelay.length > 0
      ? Math.max(...transitLegsWithDelay.map(l => l.delayMinutes))
      : 0;
    const mindset = lifestyleEngine.calculateMindset({
      legs: journeyLegs,
      weather: weatherData,
      totalWalkMins: journeyLegs.filter(l => l.type === 'walk').reduce((sum, l) => sum + (l.minutes || 0), 0),
      disruptionCount: journeyLegs.filter(l => l.state === 'suspended' || l.state === 'cancelled' || l.hasAlert).length,
      transferCount: journeyLegs.filter(l => ['train', 'tram', 'bus', 'vline'].includes(l.type)).length,
      confidenceScore: confidence.score,
      maxDelayMinutes,
      hasLiveData: hasAnyLiveData
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
      leave_in_minutes: leaveInMinutes != null && leaveInMinutes > 0 ? leaveInMinutes : null,
      isCommuteDay,
      hasExplicitArrivalTarget: !!(config?.journey?.arrivalTime),
      journey_legs: journeyLegs,
      destination: displayWork,
      destination_address: kvPrefs?.addresses?.work || locations.work?.address || '',
      home_address: kvPrefs?.addresses?.home || locations.home?.address || '',
      // V13.6: Coffee decision for header box - shows CAFE CLOSED when applicable
      // Non-commute days: suppress coffee messaging entirely
      coffee_decision: isCommuteDay ? (
          coffeeDecision.cafeClosed ? 'CAFE CLOSED' :
          coffeeDecision.canGet ? 'TIME FOR COFFEE' :
          'NO TIME FOR COFFEE'
      ) : null,
      coffee_subtext: isCommuteDay ? (
          coffeeDecision.cafeClosed ? 'Outside opening hours' :
          coffeeDecision.subtext || null
      ) : null,
      // V15.0: Transit availability notice (e.g., "TRAM USING TIMETABLE DATA")
      transit_notice: transitNotice,
      timetable_types: removedTypes.length > 0 ? removedTypes : null,
      walk_faster_types: walkFasterTypes.length > 0 ? walkFasterTypes : null,
      // Walking constraint warning — route exceeds user's max walking distance
      walking_constraint_exceeded: route?.walkingConstraintExceeded || false,
      total_walk_minutes: journeyLegs.filter(l => l.type === 'walk').reduce((sum, l) => sum + (l.minutes || 0), 0),
      // Data source accuracy: only mark as live when GTFS-RT data was actually received
      // Per Section 23.6: LIVE badge must reflect actual data source, not API key existence
      // V16.0: Distinguish partial live (some legs live, some timetable) from full live
      isTomorrowCommute,
      isLive: hasAnyLiveData,
      isPartialLive: hasAnyLiveData && journeyLegs.some(l => l.isTimetableEstimate === true),
      dataSource: isTomorrowCommute ? 'tomorrow' :
        (hasAnyLiveData ? (journeyLegs.some(l => l.isTimetableEstimate === true) ? 'partial-live' : 'gtfs-rt') :
          (journeyLegs.some(l => l.isTimetableEstimate === true) ? 'timetable' :
            (transitApiKey ? 'no-data' : 'no-key'))),
      // Diagnostic: surface feed info for admin panel troubleshooting
      _liveDataDiag: {
        hasApiKey: !!transitApiKey,
        apiMode: kvPrefs?.apiMode || 'live',
        trainFeedEntities: trains?._feedInfo?.entityCount ?? (trains?.length > 0 ? trains.length : 0),
        tramFeedEntities: trams?._feedInfo?.entityCount ?? (trams?.length > 0 ? trams.length : 0),
        busFeedEntities: buses?._feedInfo?.entityCount ?? (buses?.length > 0 ? buses.length : 0),
        trainStopId: trainStopId || null,
        tramStopId: tramStopId || null,
        busStopId: busStopId || null,
        stopDetectionSource: stopDetectionSource || (kvPrefs?.trainStopId ? 'stored' : null),
        trainStopName: trainStopId ? getStopNameById(trainStopId) : null,
        tramStopName: tramStopId ? getStopNameById(tramStopId) : null,
        trainMatches: trains?.filter(t => t.isLive === true).length || 0,
        tramMatches: trams?.filter(t => t.isLive === true).length || 0,
        busMatches: buses?.filter(t => t.isLive === true).length || 0,
        trainError: trains?._feedInfo?.error || null,
        tramError: trams?._feedInfo?.error || null,
        busError: buses?._feedInfo?.error || null
      },
      // V13.6: Device battery status (from TRMNL device request)
      battery_percent: batteryPercent,
      battery_voltage: batteryVoltage,
      device_id: deviceId,
      // V14.0: Departure Confidence Score
      confidence_score: confidence.score,
      confidence_label: confidence.label,
      confidence_text: confidence.statusText,
      confidence_resilience: confidence.resilience,
      confidence_context: confidence.context || '',
      confidence_resilience_detail: confidence.resilienceDetail || '',
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
      mindset_resilience: mindset.resilienceDisplay,
      mindset_resilience_level: mindset.resilienceLevel,
    };

    console.log('[CommuteCompute] _liveDataDiag:', JSON.stringify(dashboardData._liveDataDiag));

    // Format: explicit ?format= wins, POST defaults to json (admin), GET defaults to png (device)
    const format = req.query?.format || (req.method === 'POST' ? 'json' : 'png');

    // Unified JSON response — serves admin panel (backward-compat) AND debug data
    if (format === 'json') {
      // Calculate arrival time for summary
      const arrivalMinsJson = isTomorrowCommute ? targetMins : (nowMinsForLeave + totalMinutes);
      const arrivalHJson = Math.floor(arrivalMinsJson / 60) % 24;
      const arrivalMJson = arrivalMinsJson % 60;
      const arrivalH12Json = arrivalHJson % 12 || 12;
      const arrivalAmPmJson = arrivalHJson >= 12 ? 'pm' : 'am';
      const arriveAtJson = `${arrivalH12Json}:${arrivalMJson.toString().padStart(2, '0')}${arrivalAmPmJson}`;

      // Arrival diff for on-time detection
      const arrivalDiff = arrivalMinsJson - targetMins;

      const jsonResponse = {
        // Admin panel backward-compatible fields
        success: true,
        timestamp: now.toISOString(),
        current_time: currentTime,

        // Journey legs (top-level for admin panel)
        journey_legs: journeyLegs,

        // Coffee decision (admin panel expects this shape)
        coffee: {
          canGet: coffeeDecision.canGet ?? false,
          cafeClosed: coffeeDecision.cafeClosed || false,
          decision: coffeeDecision.decision || (coffeeDecision.canGet ? 'OK' : 'SKIP'),
          subtext: coffeeDecision.subtext || '',
          urgent: coffeeDecision.urgent ?? false,
          skipReason: coffeeDecision.skipReason || ''
        },

        // Journey summary (admin panel expects this shape)
        summary: {
          leaveNow: currentTime,
          arriveAt: arriveAtJson,
          totalMinutes,
          onTime: arrivalDiff <= 5,
          diffMinutes: arrivalDiff,
          status: arrivalDiff > 5 ? 'late' : arrivalDiff < -10 ? 'early' : 'on-time'
        },

        // Weather (admin panel expects this shape)
        weather: weatherData ? {
          temp: weatherData.temp,
          condition: weatherData.condition,
          icon: weatherData.icon,
          umbrella: weatherData.umbrella
        } : null,

        // Raw transit data (admin panel accesses raw.transit.trains etc.)
        raw: {
          transit: transitData
        },

        // Live data diagnostics (admin panel reads this directly)
        _liveDataDiag: dashboardData._liveDataDiag,

        // All dashboardData fields (isLive, dataSource, confidence, etc.)
        ...dashboardData,

        // Fallback mode flag
        fallbackMode: false,

        // Debug data
        _debug: {
          version: 'V16.0',
          timestamp: now.toISOString(),
          melbourneTime: currentTime,
          amPm,
          dataSource: hasAnyLiveData ? 'gtfs-rt' : (transitApiKey ? 'api-key-present-but-no-live-data' : 'no-api-key'),
          transitNotice: transitNotice || null
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
            isCitybound: t.isCitybound,
            isMetroTunnel: t.isMetroTunnel,
            isLive: t.isLive === true
          })),
          trams: transitData.trams?.slice(0, 3)?.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs,
            destination: t.destination,
            routeNumber: t.routeNumber,
            isLive: t.isLive === true,
            source: t.source || null
          })),
          buses: transitData.buses?.slice(0, 3)?.map(t => ({
            minutes: t.minutes,
            departureTimeMs: t.departureTimeMs,
            destination: t.destination,
            routeNumber: t.routeNumber,
            isLive: t.isLive === true,
            source: t.source || null
          })),
          _diagnostics: {
            trainFeed: transitData.trains?._feedInfo || null,
            tramFeed: transitData.trams?._feedInfo || null,
            busFeed: transitData.buses?._feedInfo || null
          }
        },
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
          isLive: leg.isLive,
          isTimetableEstimate: leg.isTimetableEstimate || false
        }))
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).json(jsonResponse);
    }

    // Resolve device display dimensions from KV preferences
    const deviceModel = kvPrefs?.deviceModel || 'trmnl-og';
    const displayDims = DISPLAY_DIMENSIONS[deviceModel] || DISPLAY_DIMENSIONS['trmnl-og'];

    if (format === 'bmp') {
      // BMP format for e-ink devices (V13.6: await async render)
      const bmp = await renderFullScreenBMP(dashboardData, {}, displayDims);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=20');
      res.setHeader('X-Dashboard-Timestamp', now.toISOString());
      res.setHeader('Content-Length', bmp.length);
      return res.status(200).send(bmp);
    }

    // Render to PNG (V13.6: await async render)
    const png = await renderFullDashboard(dashboardData, displayDims);

    // Send response
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Dashboard-Timestamp', now.toISOString());
    res.setHeader('X-Route-Name', (route?.name || 'default').replace(/[^\x20-\x7E]/g, '-'));
    res.setHeader('Content-Length', png.length);

    return res.status(200).send(png);

  } catch (error) {
    // Sanitise error response — never expose internal error.message to client
    console.error('Render error:', error.message);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ success: false, error: 'Dashboard rendering failed', code: 'RENDER_ERROR' });
  }
}
