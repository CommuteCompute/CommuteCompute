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
import { VIC_METRO_STATIONS, VIC_TRAM_STOPS_WITH_COORDS } from '../src/data/vic/gtfs-reference.js';
import { haversine } from '../src/utils/haversine.js';
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
    let mergeCount = 0;
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
      mergeCount++;
      i++;
    }
    // Deduct extra walk buffers: each component walk had +2 min buffer applied
    // independently in buildJourneyLegs. Merged walk should have only ONE buffer.
    if (mergeCount > 0) {
      const bufferDeduction = mergeCount * 2;
      current.minutes = Math.max((current.minutes || 0) - bufferDeduction, 1);
      current.durationMinutes = Math.max((current.durationMinutes || 0) - bufferDeduction, 1);
      current.journeyContribution = Math.max((current.journeyContribution || 0) - bufferDeduction, 1);
    }
    if (current.type === 'walk' && mergeCount > 0) {
      current.subtitle = `${current.minutes} min walk`;
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
    // Deep-copy each leg to avoid mutating engine's cached route objects.
    // Without this, walk buffer (+2 min) accumulates on each request until capped at 30.
    const leg = { ...route.legs[i] };
    if (leg.origin) leg.origin = { ...leg.origin };
    if (leg.destination) leg.destination = { ...leg.destination };
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
    // For tram destinations in multi-modal routes: show transfer AREA, not train station name.
    // "Alight at South Yarra" is correct; "Alight at South Yarra Station" is misleading.
    if (leg.type === 'tram' && leg.destination) {
      const genericDestNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'city'];
      const isDestGeneric = (name) => !name || genericDestNames.includes(name.toLowerCase().trim());
      if (isDestGeneric(leg.destination.name)) {
        const gtfsDest = getStopNameById(stopIds.trainStopId);
        const workSuburb = extractSuburb(locations.work?.address);
        // V5.4.0: Abbreviate "Station" to "Stn" rather than stripping entirely.
        // Distinguishes the station area from the suburb name (avoids confusion
        // when user is already in the same suburb as the alighting station).
        const areaName = gtfsDest ? gtfsDest.replace(/\s+Station$/i, ' Stn') : null;
        leg.destination.name = areaName || workSuburb || leg.destination.name;
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

    // V5.4.2: When soft-preference accepts a non-City-Loop train (late evening),
    // correct the destination to the train's actual terminus from GTFS-RT headsign.
    // Uses headsign (actual terminus) NOT destination (hardcoded "City" for citybound).
    if (leg.type === 'train' && leg.requiresCityLoop && liveData?.finalStop) {
      const CITY_LOOP_PLATFORM_IDS = new Set([
        ...(VIC_METRO_STATIONS?.PAR?.platforms || []),
        ...(VIC_METRO_STATIONS?.MCE?.platforms || []),
        ...(VIC_METRO_STATIONS?.FGS?.platforms || []),
        ...(VIC_METRO_STATIONS?.SSS?.platforms || []),
      ]);
      let reachesLoop = false;
      for (const pid of CITY_LOOP_PLATFORM_IDS) {
        if (liveData.finalStop === pid || liveData.finalStop.endsWith(`:${pid}`) || liveData.finalStop.endsWith(`-${pid}`)) {
          reachesLoop = true;
          break;
        }
      }
      if (!reachesLoop && leg.destination && liveData.headsign) {
        const actualDest = liveData.headsign;
        const destName = actualDest.includes('Station') ? actualDest : `${actualDest} Station`;
        leg.destination.name = destName;
      }
    }

    // For transit legs, find first live departure AFTER user arrives at stop
    if (isTransitLeg && liveData) {
      const hasDepTimes = liveData.allDepartureTimesMs?.length > 0;

      if (hasDepTimes) {
        // Filter to departures after user arrives at stop.
        // Route-level and coordinate-proximity produce ESTIMATED departure times
        // (from nearby/mid-route stops, not the exact user stop). Allow a 3-min
        // buffer so that departures slightly before estimated arrival still count
        // as catchable — the estimation error is typically 1-3 min.
        const estimationBuffer = (liveData.source === 'gtfs-rt-route' || liveData.source === 'gtfs-rt-coord') ? 3 * 60000 : 0;
        const catchableDepartures = liveData.allDepartureTimesMs.filter(depMs => depMs >= arrivalAtStopMs - estimationBuffer);
        // Show ALL future live departures for subtitle (Next: X, Y, Z min LIVE)
        const allFutureDeps = liveData.allDepartureTimesMs.filter(ms => ms > nowMs);
        if (allFutureDeps.length > 0) {
          nextDepartureTimesMs = allFutureDeps.slice(0, 10);
        }
        // Use first CATCHABLE departure for timing (minutes box, depart time, journey contribution)
        if (catchableDepartures.length > 0) {
          actualDepartureMs = catchableDepartures[0];
          // Update leg route/line from actual catchable departure.
          // Multiple routes/lines may serve the same stop — the first catchable
          // departure may be a different route than the engine planned.
          if (liveData.allDepartures?.length > 0) {
            const catchableDep = liveData.allDepartures.find(d => d.departureTimeMs === actualDepartureMs);
            if (catchableDep?.routeNumber) leg.routeNumber = catchableDep.routeNumber;
            if (catchableDep?.lineName) leg.lineName = catchableDep.lineName;
          }
        } else if (liveData.allDepartureTimesMs.length > 0) {
          // V16.0 FIX: No catchable departure in GTFS-RT feed — all returned
          // departures are before user's arrival at this stop. Project next
          // departure from observed headway rather than falling back to the
          // nearest uncatchable departure (which shows stale 0 MIN data).
          const sorted = [...new Set(liveData.allDepartureTimesMs)].sort((a, b) => a - b);
          let headwayMs;
          if (sorted.length >= 2) {
            const rawHeadway = (sorted[sorted.length - 1] - sorted[0]) / (sorted.length - 1);
            // Clamp headway to 3-30 min range to avoid bunching/sparse artefacts
            headwayMs = Math.max(3 * 60000, Math.min(30 * 60000, rawHeadway));
          } else {
            // Single departure — use mode-specific default headway
            headwayMs = (leg.type === 'tram' ? 8 : leg.type === 'train' ? 10 : 15) * 60000;
          }
          let projected = sorted[sorted.length - 1];
          while (projected < arrivalAtStopMs) {
            projected += headwayMs;
          }
          actualDepartureMs = projected;
          // Include projected departure in nextDepartureTimesMs for renderer
          const combined = [...(nextDepartureTimesMs || []), projected];
          nextDepartureTimesMs = combined.sort((a, b) => a - b).slice(0, 10);
        }
      } else if (liveData.departureTimeMs && liveData.departureTimeMs >= arrivalAtStopMs) {
        actualDepartureMs = liveData.departureTimeMs;
        nextDepartureTimesMs = [actualDepartureMs];
      }
      // When live data exists, mark the leg — even if no catchable departure was found
      if (!actualDepartureMs && nextDepartureTimesMs?.length > 0) {
        leg.hasLiveData = true;
      }

      if (actualDepartureMs) {
        // Minutes from NOW to that departure (for the minutes box)
        let rawMinutes = Math.round((actualDepartureMs - nowMs) / 60000);

        // V15.0: Only reject clearly invalid timestamps (negative or absurdly far future)
        // Valid departures up to 120+ min away are kept — supports low-frequency services
        if (rawMinutes < 0 || rawMinutes > 180) {
          rawMinutes = cumulativeMinutes + (legDuration || 5);
          // Clamped minutes — use estimate for display, but keep isLive flag.
          // GTFS-RT DID respond; isLive reflects feed availability, not minute validity.
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

    // Timetable fallback. Only when GTFS-RT has NO live data at all for this mode.
    // When live data exists (liveData non-null OR raw feed has live departures),
    // show live departure times — never fall back to "Scheduled".
    if (isTransitLeg && !actualDepartureMs && !liveData) {
      const feedForMode = leg.type === 'tram' ? transitData.trams : (leg.type === 'train' ? transitData.trains : transitData.buses);
      const feedLiveDeps = feedForMode?.filter(d => d.isLive === true && d.departureTimeMs) || [];

      // For trains: filter raw feed by direction — outbound trains should never
      // show as going to a citybound destination (e.g. Parliament Station).
      if (leg.type === 'train' && leg.isCitybound !== undefined) {
        const dirFiltered = feedLiveDeps.filter(d => d.isCitybound === leg.isCitybound);
        feedLiveDeps.length = 0;
        dirFiltered.forEach(d => feedLiveDeps.push(d));
      }
      if (feedLiveDeps.length > 0) {
        // findMatchingDeparture returned null (direction/route mismatch) but
        // the raw feed HAS live departures for this mode. Show them rather than
        // falling back to timetable — the user should see live data when it exists.
        const rawDepTimes = feedLiveDeps.map(d => d.departureTimeMs).sort((a, b) => a - b);
        // Show ALL future departures for subtitle (Next: X, Y, Z min LIVE)
        const futureDeps = rawDepTimes.filter(ms => ms > nowMs);
        if (futureDeps.length > 0) {
          nextDepartureTimesMs = futureDeps.slice(0, 10);
        }
        // Use first CATCHABLE departure for timing — must be after user arrives at stop
        const catchableFuture = futureDeps.filter(ms => ms >= arrivalAtStopMs);
        if (catchableFuture.length > 0) {
          actualDepartureMs = catchableFuture[0];
          let rawMinutes = Math.round((actualDepartureMs - nowMs) / 60000);
          if (rawMinutes > 180) rawMinutes = cumulativeMinutes + (legDuration || 5);
          minutesToDeparture = rawMinutes;
          const departDate = new Date(actualDepartureMs);
          const departMelb = getMelbourneDisplayTime(departDate, state);
          const departH12 = departMelb.hour % 12 || 12;
          const departAmPm = departMelb.hour >= 12 ? 'pm' : 'am';
          departTime = `${departH12}:${departMelb.minute.toString().padStart(2, '0')}${departAmPm}`;
        }
        // Mark as having live data even without catchable departure
        leg.hasLiveData = true;
        // Don't set isTimetableEstimate — live data exists in the feed
      } else {
        // Genuinely no live data — timetable estimate
        leg.isTimetableEstimate = true;
        const estWaitMins = 2;
        const estDepartMins = nowMins + cumulativeMinutes + estWaitMins;
        const estH = Math.floor(estDepartMins / 60) % 24;
        const estM = estDepartMins % 60;
        const estH12 = estH % 12 || 12;
        const estAmPm = estH >= 12 ? 'pm' : 'am';
        departTime = `~${estH12}:${estM.toString().padStart(2, '0')}${estAmPm}`;
        minutesToDeparture = Math.min(cumulativeMinutes + estWaitMins, 180);

        const feedHadEntities = feedForMode?._feedInfo?.entityCount > 0;
        if (!feedHadEntities) {
          const estDepartMs = nowMs + (minutesToDeparture * 60000);
          const headway = leg.type === 'tram' ? 8 : (leg.type === 'train' ? 10 : 15);
          nextDepartureTimesMs = [
            estDepartMs,
            estDepartMs + (headway * 60000),
            estDepartMs + (headway * 2 * 60000)
          ];
        }
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

    // V16.0 FIX: Live GTFS-RT departure data is always displayed regardless of
    // tomorrow mode. The isTomorrowCommute flag controls journey bar header and
    // leave-by timing, but does NOT suppress departure data — users at a stop
    // at 6:30pm still need to see when the next tram/train departs.

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
      // V15.0: Live data flags — isLive and isTimetableEstimate are mutually exclusive.
      // Per Pattern 7: isLive: true = GTFS-RT match ONLY. If timetable estimate is used,
      // isLive reflects whether GTFS-RT data exists for this mode — true when matched
      // departure has isLive, OR when raw feed had live data (hasLiveData flag).
      isLive: isTransitLeg && (liveData?.isLive === true || leg.hasLiveData === true) && !leg.isTimetableEstimate,
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
    // V16.0: Coffee subtitle — renderer draws coffee icon, no [OK] text prefix
    if (leg.type === 'coffee') {
      baseLeg.canGet = coffeeDecision.canGet;  // Pass to renderer for styling
      baseLeg.minutes = null;  // V16.0: Coffee legs have no duration time box
      if (!coffeeDecision.canGet) {
        baseLeg.state = 'skip';
        baseLeg.status = 'skipped';  // Also set status for renderer
        baseLeg.cafeClosed = coffeeDecision.cafeClosed;
        baseLeg.skipReason = coffeeDecision.skipReason;
        // Show different message if cafe is closed vs running late
        baseLeg.subtitle = coffeeDecision.cafeClosed ? '[X] CLOSED -- Cafe not open' : '[X] SKIP -- Running late';
        legNumber--; // Don't increment for skipped leg
      } else {
        baseLeg.subtitle = 'TIME FOR COFFEE';
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

      // V5.4.0: Calculate "Next: x, y, z" from CATCHABLE departures only.
      // Calculate "Next: x, y, z" from catchable departures, padded to 3.
      // Primary: departures after user arrives at stop (catchable).
      // Padding: future departures fill remaining slots up to 3 for service
      // frequency context — the DEPART time box shows the actual catchable departure.
      if (baseLeg.nextDepartureTimesMs?.length > 0) {
        const catchable = baseLeg.nextDepartureTimesMs
          .filter(depMs => depMs >= arrivalAtStopMs)
          .map(depMs => Math.round((depMs - nowMs) / 60000));
        // Pad with future departures (from now) if fewer than 3 catchable
        if (catchable.length < 3) {
          const allFuture = baseLeg.nextDepartureTimesMs
            .filter(depMs => depMs > nowMs)
            .map(depMs => Math.round((depMs - nowMs) / 60000));
          for (const m of allFuture) {
            if (catchable.length >= 3) break;
            if (!catchable.includes(m)) catchable.push(m);
          }
          catchable.sort((a, b) => a - b);
        }
        baseLeg.nextDepartures = catchable;
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

          // Only show disruptions that materially affect service timing/availability
          const MATERIAL_EFFECTS = [
            'NO_SERVICE', 'SIGNIFICANT_DELAYS', 'MODIFIED_SERVICE',
            'REDUCED_SERVICE', 'DETOUR'
          ];
          if (d.effect && !MATERIAL_EFFECTS.includes(d.effect)) {
            return false;
          }

          // Filter out facility/infrastructure alerts that don't affect service
          const NON_MATERIAL_KEYWORDS = /\b(car\s*park|parking|escalator|elevator|lift|myki|station\s*access|entrance|toilet|amenity|construction|upgrade)\b/i;
          const alertDesc = (d.headerText || '') + ' ' + (d.description || '');
          if (NON_MATERIAL_KEYWORDS.test(alertDesc)) {
            return false;
          }

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

          const routeMatch = d.affectedRoutes.some(route => {
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
          if (!routeMatch) return false;

          // Stop-level filtering: if disruption specifies affected stops,
          // verify user's leg stops overlap (filters distant station alerts)
          if (d.affectedStops && d.affectedStops.length > 0) {
            const legStops = [leg.originStopId, leg.destinationStopId].filter(Boolean);
            const hasStopOverlap = legStops.some(s => d.affectedStops.includes(s));
            if (!hasStopOverlap) return false;
          }

          return true;
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

    // Subtitle for transit legs: live GTFS-RT departures take priority over timetable.
    // If isLive is true, show "Next: x, y, z min LIVE" regardless of isTimetableEstimate
    // (which may have been set by timestamp clamping even when live data exists).
    if (isTransitLeg && baseLeg.isLive && baseLeg.nextDepartures?.length > 0) {
      const times = baseLeg.nextDepartures
        .filter(m => m >= 0 && m <= 120)
        .slice(0, 3)
        .join(', ');
      if (times) {
        baseLeg.subtitle = `Next: ${times} min LIVE`;
      }
    } else if (isTransitLeg && baseLeg.isTimetableEstimate) {
      // V16.0: Show 3 timetable-estimated departures instead of just "Scheduled ~Xmin"
      // nextDepartureTimesMs was populated with headway-based estimates at timetable fallback
      if (baseLeg.nextDepartures?.length > 0) {
        const times = baseLeg.nextDepartures
          .filter(m => m >= 0 && m <= 120)
          .slice(0, 3)
          .join(', ');
        if (times) {
          baseLeg.subtitle = `Scheduled ~${times} min`;
        } else {
          // Show transit DURATION (how long the ride takes), not departure countdown.
          // The time box already shows departure countdown. legDuration is stable
          // across renders — matches user expectation ("~7min" = ride takes ~7 min).
          const transitDuration = Math.max(1, legDuration || baseLeg.minutes || 0);
          baseLeg.subtitle = `Scheduled ~${transitDuration}min`;
        }
      } else {
        // Show transit DURATION, not departure countdown (stable across renders)
        const transitDuration = Math.max(1, legDuration || baseLeg.minutes || 0);
        baseLeg.subtitle = `Scheduled ~${transitDuration}min`;
      }
    } else if (isTransitLeg && baseLeg.nextDepartures?.length > 0) {
      const times = baseLeg.nextDepartures
        .filter(m => m >= 0 && m <= 120)
        .slice(0, 3)
        .join(', ');
      if (times) {
        baseLeg.subtitle = `Next: ${times} min`;
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
      const line = leg.lineName || '';
      return line ? `${line} to ${destName}` : `Train to ${destName}`;
    }
    case 'tram': {
      const num = leg.routeNumber ? `Route ${leg.routeNumber}` : (leg.lineName || 'Tram');
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
      // Inter-transit walks: show duration (station name is on the adjacent transit leg)
      // Per Pattern 5: buildLegSubtitle() = stop name ONLY — no "From" prefix
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
 * V16.0: Shared City Loop filtering with soft-preference.
 * Used by both findMatchingDeparture() and filterUnavailableTransitLegs()
 * to ensure consistent train selection.
 *
 * When City Loop services are infrequent (e.g. Sunday/evening), the nearest
 * Loop train may be 30-50 min away while a direct train to Flinders Street
 * departs in 5 min. The soft-preference accepts direct trains when the gap
 * exceeds 20 min — the user can alight at Flinders Street and walk ~5-7 min
 * to nearby City Loop stations.
 *
 * @param {Array} dirMatches - Direction-filtered departures
 * @returns {Array} - Filtered departures (City Loop preferred, direct fallback)
 */
function filterCityLoopPreference(dirMatches) {
  const CITY_LOOP_PLATFORM_IDS = new Set([
    ...(VIC_METRO_STATIONS?.PAR?.platforms || []),
    ...(VIC_METRO_STATIONS?.MCE?.platforms || []),
    ...(VIC_METRO_STATIONS?.FGS?.platforms || []),
    ...(VIC_METRO_STATIONS?.SSS?.platforms || []),
  ]);

  const cityLoopTrains = dirMatches.filter(d => {
    if (!d.finalStop) return !d.isMetroTunnel; // Fallback when no trip data
    for (const pid of CITY_LOOP_PLATFORM_IDS) {
      if (d.finalStop === pid || d.finalStop.endsWith(`:${pid}`) || d.finalStop.endsWith(`-${pid}`)) {
        return true;
      }
    }
    return false;
  });

  if (cityLoopTrains.length > 0) {
    // Soft preference: if nearest City Loop train is >20 min further away
    // than nearest direct train, accept all direction-matched trains.
    // On weekdays Loop trains run every 5-10 min (gap small, filter strict).
    // On Sundays/evenings Loop services 30-50 min apart (gap large, direct accepted).
    const nearestLoopMin = Math.min(...cityLoopTrains.map(d => d.minutes ?? Infinity));
    const nearestDirectMin = Math.min(...dirMatches.map(d => d.minutes ?? Infinity));
    if (nearestLoopMin - nearestDirectMin > 20) {
      return dirMatches; // Direct service is far superior — accept all
    }
    return cityLoopTrains;
  }

  return dirMatches; // No Loop trains found — keep all direction-matched
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
      // V16.0: City Loop vs Metro Tunnel — filter by whether the departure's trip
      // actually reaches the destination station. Uses trip stop sequence when available,
      // falls back to excluding Metro Tunnel lines for City Loop destinations.
      if (leg.requiresCityLoop) {
        // V16.0: Shared City Loop filtering with soft-preference.
        // When Loop services are infrequent, accepts direct trains to Flinders St.
        dirMatches = filterCityLoopPreference(dirMatches);
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
    // For trams: PREFER matching route but fall back to any-route if none.
    // Prevents wrong route (e.g. Route 78) overriding configured route (Route 58)
    // when coord-proximity or all-trips-scan picks up trips from nearby intersections.
    // For buses: strict filter — different routes go different places.
    const legRoute = parseInt(String(leg.routeNumber), 10);
    const routeMatches = departures.filter(d => {
      if (!d.routeNumber) return false;
      return parseInt(String(d.routeNumber), 10) === legRoute;
    });
    if (routeMatches.length > 0) {
      matchedDepartures = routeMatches;
    }
    // Trams: if no matching route, matchedDepartures stays as ALL departures
    // Buses: if no matching route, also stays as ALL (same fallback behaviour)
  }

  // Clone primary to avoid mutating shared transitData objects
  const primary = { ...matchedDepartures[0] };
  if (primary) {
    // V16.0: Collect ALL departure times — the catchability filter in buildJourneyLegs
    // selects the ones the user can actually catch. Previously limited to first 5, which
    // caused timetable fallback when all 5 nearest trains departed before user arrival.
    const depTimes = [];
    for (const d of matchedDepartures) {
      if (d.departureTimeMs) {
        depTimes.push(d.departureTimeMs);
      } else if (typeof d.minutes === 'number') {
        depTimes.push(nowMs + (d.minutes * 60000));
      }
    }
    primary.allDepartureTimesMs = depTimes;
    // Store all departure objects for route lookup — when catchability selects a
    // departure from a different route (multi-route tram), we need to find its
    // routeNumber and lineName to update the leg title dynamically.
    primary.allDepartures = matchedDepartures;
    // Display-facing nextDepartures stays limited to 5 (for "Next: x, y, z min" subtitle)
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
          // V16.0: Use shared City Loop filter — consistent with findMatchingDeparture().
          // Includes soft-preference: accepts direct trains when Loop services infrequent.
          if (requiresCityLoop) {
            dirMatches = filterCityLoopPreference(dirMatches);
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
        state: step.status?.toLowerCase() || 'normal',
        // Delay/diversion/coffee fields — required for correct rendering of demo scenarios
        delayMinutes: step.delayMinutes || null,
        reason: step.cancelReason || step.reason || null,
        cancelReason: step.cancelReason || null,
        canGet: step.canGet,
        extraTime: step.extraTime || (step.extendReason ? true : false),
        departTime: step.departTime || null,
        busyness: step.busyness || null,
        divertedStop: step.divertedStop || null,
        skippedForTiming: step.status === 'SKIPPED' || step.skippedForTiming || false,
        skipReason: step.skipReason || null,
        expressBadge: step.expressBadge || false,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    let ferryStopId = null;
    let detectedTramRoute = null;
    let stopDetectionSource = null;

    if (homeCoords || homeAddress) {
      const detected = detectStopIdsFromAddress(homeAddress, homeCoords, userState);
      stopDetectionSource = detected?.source || null;
      trainStopId = detected.trainStopId || null;
      tramStopId = detected.tramStopId || null;
      busStopId = detected.busStopId || null;
      ferryStopId = detected.ferryStopId || null;
      detectedTramRoute = detected.tramRouteNumber || null;
    }

    // Fallback to stored Redis IDs only when coordinate detection returns nothing
    if (!trainStopId) trainStopId = kvPrefs?.trainStopId || null;
    if (!tramStopId) tramStopId = kvPrefs?.tramStopId || null;
    if (!busStopId) busStopId = kvPrefs?.busStopId || null;
    if (!ferryStopId) ferryStopId = kvPrefs?.ferryStopId || null;
    if (!stopDetectionSource && (trainStopId || tramStopId)) stopDetectionSource = 'stored';

    // Apply user station overrides from admin panel (persistent Redis preferences)
    // Admin saves overrides keyed by transit-leg index (e.g. train_1, tram_0),
    // so we search all entries by type rather than assuming a fixed key.
    let stationOverrides = {};
    try { stationOverrides = await getStationOverrides() || {}; } catch (e) {}
    const findOverride = (type) => Object.values(stationOverrides).find(o => o?.type === type);
    const trainOverride = findOverride('train');
    const tramOverride = findOverride('tram');
    const busOverride = findOverride('bus');
    if (trainOverride?.id) {
      trainStopId = trainOverride.id;
      stopDetectionSource = 'user-override';
    }
    if (tramOverride?.id) {
      tramStopId = tramOverride.id;
    }
    if (busOverride?.id) {
      busStopId = busOverride.id;
    }

    // Apply station override names to route template legs for correct display
    // Route templates use coordinate-based nearest stations, but user may have
    // explicitly selected a different station via Station Preferences
    if (route?.legs && (trainOverride?.id || tramOverride?.id)) {
      const overrideTrainName = trainOverride?.name || getStopNameById(trainStopId);
      const overrideTramName = tramOverride?.name || getStopNameById(tramStopId);

      // Deep-copy legs to avoid mutating engine's cached route objects
      route = { ...route, legs: route.legs.map(leg => {
        const l = { ...leg };
        if (l.origin) l.origin = { ...l.origin };
        if (l.destination) l.destination = { ...l.destination };

        if (l.type === 'train' && overrideTrainName) {
          if (l.origin) l.origin.name = overrideTrainName;
          l.originStation = overrideTrainName;
        }
        if (l.type === 'tram') {
          if (overrideTramName && l.origin) l.origin.name = overrideTramName;
          // Tram destination in multi-modal routes: show transfer AREA, not train station name.
          // "Tram to South Yarra" (area) is correct; "Tram to South Yarra Station" is misleading
          // because the tram doesn't go to the train station — user alights at a tram stop nearby.
          if (overrideTrainName && l.destination) {
            l.destination.name = overrideTrainName.replace(/\s+Station$/i, '');
          }
        }
        if (l.type === 'walk') {
          if (l.to === 'tram stop' && overrideTramName) l.stopName = overrideTramName;
          if ((l.to === 'train platform' || l.to === 'station') && overrideTrainName) {
            l.stationName = overrideTrainName;
          }
        }
        return l;
      })};
    }

    // Always rebuild route description using detected stop IDs.
    // The engine-generated description uses coordinate-nearest stations (e.g. Hawksburn)
    // which may differ from the stop detection result (e.g. South Yarra). Detected stop
    // IDs reflect overrides when present, and coordinate-first detection otherwise.
    if (route?.legs && route.description) {
      const resolvedTrainName = getStopNameById(trainStopId);
      const resolvedTramName = getStopNameById(tramStopId);
      const resolvedTrainArea = resolvedTrainName ? resolvedTrainName.replace(/\s+Station$/i, '') : null;
      route.description = route.legs.map(l => {
        if (l.type === 'walk') return 'Walk';
        if (l.type === 'coffee') return 'Coffee';
        const rn = l.routeNumber ? ' ' + l.routeNumber : '';
        let origin, dest;
        if (l.type === 'train') {
          origin = resolvedTrainName || l.origin?.name || l.originStation || l.originStop || '';
          dest = l.destination?.name || '';
        } else if (l.type === 'tram') {
          origin = resolvedTramName || l.origin?.name || l.originStop || '';
          dest = resolvedTrainArea || l.destination?.name || '';
        } else {
          origin = l.origin?.name || l.originStation || l.originStop || '';
          dest = l.destination?.name || '';
        }
        return `${l.type.charAt(0).toUpperCase() + l.type.slice(1)}${rn} (${origin} → ${dest})`;
      }).join(' → ');
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
      const workDetected = detectStopIdsFromAddress(workAddress, workCoords, userState);
      workTrainStopId = workDetected?.trainStopId || null;
    }

    // Per Section 11.8: Zero-Config compliant - load API key from KV storage
    // getTransitApiKey() returns a string from Redis (the raw API key)
    // Defensive: also handles legacy { devId, apiKey } object format if stored
    const transitApiKey = await getTransitApiKey();
    const apiKeyStr = typeof transitApiKey === 'string' ? transitApiKey : (transitApiKey?.apiKey || null);
    const apiOptions = apiKeyStr ? { apiKey: apiKeyStr, state: userState } : { state: userState };

    // Cafe busyness mode: 'cached' (free — historical averages) or 'live' (Google Places API)
    // This controls ONLY cafe busyness data, NOT transit GTFS-RT fetching
    const cafeMode = kvPrefs?.apiMode || 'live';

    // Early isTomorrowCommute detection — skip live data when past target arrival
    // Prevents showing tonight's departures when user should see tomorrow's commute
    const earlyTimezone = STATE_TIMEZONES[userState] || 'Australia/Melbourne';
    const earlyLocalDateStr = now.toLocaleDateString('en-AU', { timeZone: earlyTimezone, weekday: 'short' });
    const earlyDayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const earlyDayOfWeek = earlyDayMap[earlyLocalDateStr.slice(0, 3)] ?? now.getDay();
    const earlyCommuteDays = kvPrefs?.journey?.commuteDays || [1, 2, 3, 4, 5];
    const earlyIsCommuteDay = earlyCommuteDays.includes(earlyDayOfWeek);
    const earlyMelbTime = getMelbourneDisplayTime(now, userState);
    const earlyNowMins = earlyMelbTime.hour * 60 + earlyMelbTime.minute;
    const earlyArrival = kvPrefs?.journey?.arrivalTime || '09:00';
    const [eArrH, eArrM] = earlyArrival.split(':').map(Number);
    const earlyTargetMins = eArrH * 60 + eArrM;
    const earlyIsTomorrowCommute = earlyIsCommuteDay && earlyNowMins > earlyTargetMins + 180;

    const isNonCommuteDayPreview = !earlyIsCommuteDay;
    // Always fetch live GTFS-RT data when API key present.
    // Tomorrow mode controls journey DISPLAY (departure times, leave-by calculation)
    // but live departures must still be fetched for admin panel departure cards
    // and to verify the API connection is working.
    const skipLiveData = !apiKeyStr;

    if (apiKeyStr) {
      console.log(`[CommuteCompute] API key present (${apiKeyStr.substring(0, 8)}...), cafeMode=${cafeMode}, isTomorrow=${earlyIsTomorrowCommute}`);
    }

    if (skipLiveData) {
      console.warn('[CommuteCompute] Live data skipped — no transit API key in Redis');
    }

    if (earlyIsTomorrowCommute) {
      console.log('[CommuteCompute] Tomorrow commute mode — journey display uses timetable estimates');
    }

    // V15.0: Extract tram/bus route numbers from journey legs for GTFS-RT route-level matching
    // When stop-level matching fails (common for trams), route-level matching can find live data
    // Fallback chain: engine route leg → auto-detected from address suburb
    const tramLeg = route?.legs?.find(l => l.type === 'tram');
    const busLeg = route?.legs?.find(l => l.type === 'bus');
    const tramApiOptions = { ...apiOptions };
    // V16.0: Pass home coordinates for coord-proximity fallback.
    // When the detected tram stop ID isn't in VIC_TRAM_STOPS_WITH_COORDS
    // (common — GTFS static IDs differ from coordinate DB IDs), the coord-proximity
    // search uses these coordinates directly instead of failing silently.
    if (homeCoords) {
      tramApiOptions.lat = homeCoords.lat;
      tramApiOptions.lon = homeCoords.lon;
    }
    // Don't filter tram API by route number — multiple lines serve the same stop
    // and user wants to see whichever line is coming next
    const tramRouteNum = tramLeg?.routeNumber || detectedTramRoute;
    if (tramRouteNum) tramApiOptions.routeNumber = tramRouteNum;
    // Ensure tram leg has route number for consistent display ("Route 58" not "Tram").
    // Without this, route number only gets populated from GTFS-RT live data, causing
    // display to flip between "Route 58 to X" and "Tram to X" between refreshes.
    if (tramLeg && tramRouteNum && !tramLeg.routeNumber) {
      tramLeg.routeNumber = tramRouteNum;
    }
    // Find alternative stop IDs for the tram stop — same physical stop (name alias)
    // AND nearby stops on the same road (within 350m). The GTFS-RT feed may not
    // include the user's exact stop ID in trip data, but neighboring stops on the
    // same road provide departure times within 1-2 min of accuracy.
    if (tramStopId && GTFS_STOP_NAMES) {
      const tramStopName = GTFS_STOP_NAMES[String(tramStopId)];
      if (tramStopName) {
        // Same name, different GTFS ID
        const sameNameIds = Object.entries(GTFS_STOP_NAMES)
          .filter(([id, name]) => id !== String(tramStopId) && name === tramStopName)
          .map(([id]) => id);
        // Nearby stops on the same road (within 350m)
        let nearbyRoadIds = [];
        const userStop = VIC_TRAM_STOPS_WITH_COORDS.find(s => s.id === String(tramStopId));
        if (userStop) {
          const roadParts = tramStopName.replace(/#\d+.*$/, '').trim().toLowerCase()
            .split(/[\/,&]/).map(p => p.trim()).filter(p => p.length > 3);
          if (roadParts.length > 0) {
            nearbyRoadIds = VIC_TRAM_STOPS_WITH_COORDS
              .filter(s => {
                if (s.id === String(tramStopId) || sameNameIds.includes(s.id)) return false;
                if (haversine(userStop.lat, userStop.lon, s.lat, s.lon) > 350) return false;
                const sName = s.name.toLowerCase();
                return roadParts.some(p => sName.includes(p));
              })
              .sort((a, b) => haversine(userStop.lat, userStop.lon, a.lat, a.lon) - haversine(userStop.lat, userStop.lon, b.lat, b.lon))
              .map(s => s.id);
          }
        }
        const altIds = [...sameNameIds, ...nearbyRoadIds];
        if (altIds.length > 0) tramApiOptions.altStopIds = altIds;
      }
    }
    const busApiOptions = { ...apiOptions };
    if (busLeg?.routeNumber) busApiOptions.routeNumber = busLeg.routeNumber;

    // V16.0: Re-detect tram stop from route leg origin — the route's tram stop may differ
    // from the home-detected stop (user walks HOME → CAFE → TRAM STOP, so tram stop is
    // near the cafe, not near home). Search GTFS_STOP_NAMES by origin name to find correct ID.
    if (tramLeg?.origin?.name && tramStopId) {
      const tramOriginName = tramLeg.origin.name.toLowerCase();
      // Strict match: stop name must contain ALL parts of the origin name (order-independent)
      // Prevents partial matches on common road names shared across multiple stops
      const originParts = tramOriginName.split(/[\/,]/).map(p => p.trim()).filter(p => p.length > 2);
      const matchingEntry = Object.entries(GTFS_STOP_NAMES).find(([, name]) => {
        const nameLower = name.toLowerCase();
        return originParts.length > 0 && originParts.every(part => nameLower.includes(part));
      });
      if (matchingEntry && matchingEntry[0] !== tramStopId) {
        console.log(`[CommuteCompute] Tram stop re-detected from route leg: ${tramStopId} → ${matchingEntry[0]} (${matchingEntry[1]})`);
        tramStopId = matchingEntry[0];
      }
    }

    // V15.0: Extract train line code for route-level fallback
    const trainLeg = route?.legs?.find(l => l.type === 'train' || l.type === 'vline');
    const trainApiOptions = { ...apiOptions };
    if (trainLeg?.lineName) {
      const lineEntry = Object.entries(METRO_LINE_NAMES).find(
        ([, name]) => name.toLowerCase() === trainLeg.lineName.toLowerCase()
      );
      if (lineEntry) trainApiOptions.lineCode = lineEntry[0];
    }

    // Build alt stop IDs for metro — same pattern as trams. GTFS-RT metro feed may use
    // different stop IDs than static GTFS data. Same-name station platforms provide
    // accurate stop-level departure times through alt-stop matching.
    if (trainStopId && GTFS_STOP_NAMES) {
      const trainStopName = GTFS_STOP_NAMES[String(trainStopId)];
      if (trainStopName) {
        const sameNameIds = Object.entries(GTFS_STOP_NAMES)
          .filter(([id, name]) => id !== String(trainStopId) && name === trainStopName)
          .map(([id]) => id);
        if (sameNameIds.length > 0) trainApiOptions.altStopIds = sameNameIds;
      }
    }

    // V16.0: Set requiresCityLoop / requiresMetroTunnel on train leg based on destination
    // Sandringham line terminates at Flinders Street — doesn't serve City Loop stations.
    // Frankston/Cranbourne/Pakenham go through City Loop (Parliament, Melbourne Central, etc.)
    const CITY_LOOP_STATIONS = ['parliament', 'melbourne central', 'flagstaff', 'southern cross'];
    const METRO_TUNNEL_STATIONS = ['town hall', 'state library', 'parkville', 'arden', 'anzac'];
    if (trainLeg?.destination?.name) {
      const destLower = trainLeg.destination.name.toLowerCase();
      if (CITY_LOOP_STATIONS.some(s => destLower.includes(s))) {
        trainLeg.requiresCityLoop = true;
      } else if (METRO_TUNNEL_STATIONS.some(s => destLower.includes(s))) {
        trainLeg.requiresMetroTunnel = true;
      }
    }

    const [trains, trams, buses, ferries, weather, metroDisruptions, tramDisruptions, busDisruptions, ferryDisruptions] = await Promise.all([
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(trainStopId, 0, trainApiOptions), 'screen-train'),
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(tramStopId, 1, tramApiOptions), 'screen-tram'),
      skipLiveData ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(busStopId, 2, busApiOptions), 'screen-bus'),
      (skipLiveData || !ferryStopId) ? Promise.resolve([]) : fetchWithRetry(() => getDepartures(ferryStopId, 4, apiOptions), 'screen-ferry'),
      getWeather(locations.home?.lat, locations.home?.lon, STATE_TIMEZONES[userState] || 'Australia/Melbourne'),
      skipLiveData ? Promise.resolve([]) : getDisruptions(0, apiOptions).catch(() => []),
      skipLiveData ? Promise.resolve([]) : getDisruptions(1, apiOptions).catch(() => []),
      skipLiveData ? Promise.resolve([]) : getDisruptions(2, apiOptions).catch(() => []),
      (skipLiveData || !ferryStopId) ? Promise.resolve([]) : getDisruptions(4, apiOptions).catch(() => [])
    ]);
    const disruptions = [...metroDisruptions, ...tramDisruptions, ...busDisruptions, ...ferryDisruptions];

    const transitData = { trains, trams, buses, ferries, disruptions };

    // Determine if we actually have live transit data (from GTFS-RT, not fallback)
    // Per Section 23.6: "LIVE" indicators must reflect actual data source
    const hasLiveTrainData = trains.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasLiveTramData = trams.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasLiveBusData = buses.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
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
    const commuteDays = kvPrefs?.journey?.commuteDays || [1, 2, 3, 4, 5]; // Mon-Fri default
    const isCommuteDay = commuteDays.includes(dayOfWeek);

    // Parse cafe hours from Google Places data stored during setup.
    // kvPrefs.cafe.hours contains strings like "Thursday: 6:30 AM – 4:00 PM"
    let cafeOpenHour = 6;  // Fallback defaults (only used when no Google Places data)
    let cafeCloseHour = 17;
    let cafeOpenToday = true;
    try {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = dayNames[dayOfWeek];
      const cafeHoursStrings = kvPrefs?.cafe?.hours;
      if (cafeHoursStrings && Array.isArray(cafeHoursStrings)) {
        const todayHours = cafeHoursStrings.find(h => typeof h === 'string' && h.startsWith(todayName));
        if (todayHours) {
          if (todayHours.toLowerCase().includes('closed')) {
            cafeOpenToday = false;
          } else {
            // Parse "Thursday: 6:30 AM – 4:00 PM" format (handles en-dash and hyphen)
            const timeMatch = todayHours.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*[\u2013\-]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
            if (timeMatch && timeMatch[3] && timeMatch[6]) {
              let openH = parseInt(timeMatch[1], 10);
              const openAmPm = timeMatch[3].toUpperCase();
              if (openAmPm === 'PM' && openH !== 12) openH += 12;
              if (openAmPm === 'AM' && openH === 12) openH = 0;
              if (!isNaN(openH)) cafeOpenHour = openH;

              let closeH = parseInt(timeMatch[4], 10);
              const closeAmPm = timeMatch[6].toUpperCase();
              if (closeAmPm === 'PM' && closeH !== 12) closeH += 12;
              if (closeAmPm === 'AM' && closeH === 12) closeH = 0;
              if (!isNaN(closeH)) cafeCloseHour = closeH;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[CommuteCompute] Cafe hours parsing failed, using defaults:', e.message);
    }
    const cafeIsOpen = cafeOpenToday && hour >= cafeOpenHour && hour < cafeCloseHour;

    if (!cafeIsOpen && kvPrefs?.addresses?.cafe) {
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

    // Adjust coffee duration based on estimated busyness at current day/hour.
    // Busyness data is generated during setup from cafe hours patterns and stored
    // in kvPrefs.cafe.busyness as { dayIndex: { hour: { level, waitMinutes } } }.
    if (coffeeDecision.canGet && kvPrefs?.cafe?.busyness) {
      const busyData = kvPrefs.cafe.busyness[dayOfWeek]?.[hour];
      if (busyData && busyData.waitMinutes > 0) {
        coffeeDecision.busyLevel = busyData.level;
        coffeeDecision.busyWaitMinutes = busyData.waitMinutes;
        if (busyData.level === 'busy' || busyData.level === 'very_busy') {
          coffeeDecision.subtext = (coffeeDecision.subtext || '') + (coffeeDecision.subtext ? ' | ' : '') + 'Cafe ' + busyData.level.replace('_', ' ') + ' (~' + busyData.waitMinutes + 'min wait)';
        }
      }
    }

    // Issue 3: When cafe is closed/skipped OR outside commute window, REMOVE the coffee
    // leg entirely from journey and merge surrounding walk legs into a direct bypass walk.
    // This prevents coffee from inflating journey timing on non-commute days.
    // Cafe status still shows in header bar regardless (CoffeeDecision card).
    let effectiveRoute = route;
    const shouldBypassCoffee = coffeeDecision.cafeClosed || !coffeeDecision.canGet || isNonCommuteDayPreview || earlyIsTomorrowCommute;
    if (shouldBypassCoffee) {
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
    const displayArrival = simOverrides.arrivalTime || kvPrefs?.journey?.arrivalTime || '09:00';

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

    // V16.0 FIX: Always compute arrival from current time + journey duration.
    // The journey bar header indicates TOMORROW context separately. Footer arrival
    // should match the computed "if you leave now" scenario (e.g. 7:06pm at 6:30pm).
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
      currentMins: nowMinsForLeave,
      isCommuteDay,
      hasLiveData: hasAnyLiveData
    });
    // Confidence is not meaningful for tomorrow's commute — suppress
    if (isTomorrowCommute) {
      confidence.score = null;
      confidence.label = null;
      confidence.context = null;
      confidence.statusText = null;
      confidence.resilience = null;
      confidence.resilienceDetail = null;
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
    // V16.0: Alternative Transit - cost estimates when transit is disrupted or will make user late
    // Activate when: no transit legs exist, all transit legs cancelled/suspended, or user will arrive late
    const hasActiveTransit = journeyLegs.some(l => ['train', 'tram', 'bus', 'vline'].includes(l.type));
    const allTransitCancelled = journeyLegs
      .filter(l => ['train', 'tram', 'bus', 'vline'].includes(l.type))
      .every(l => ['cancelled', 'suspended'].includes(l.state));
    // V16.0: Also show alternatives when transit will make user late in commute window
    const willBeLate = isCommuteDay && !isTomorrowCommute && delayMinutes > 0 &&
      leaveInMinutes !== null && leaveInMinutes < 0;
    const showAltTransit = !hasActiveTransit || (hasActiveTransit && allTransitCancelled) || willBeLate;
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
      hasExplicitArrivalTarget: !!(kvPrefs?.journey?.arrivalTime),
      journey_legs: journeyLegs,
      destination: displayWork,
      destination_address: kvPrefs?.addresses?.work || locations.work?.address || '',
      home_address: kvPrefs?.addresses?.home || locations.home?.address || '',
      // Coffee decision gated by ±2hr arrival window (matches renderer logic)
      // Outside the window, coffee decisions are not actionable
      coffee_decision: (() => {
        const coffeeWindowMins = Math.abs(nowMinsForLeave - targetMins);
        const inCoffeeWindow = isCommuteDay && coffeeWindowMins <= 120;
        if (!inCoffeeWindow) return null;
        if (coffeeDecision.cafeClosed) return 'CAFE CLOSED';
        if (coffeeDecision.canGet) return 'TIME FOR COFFEE';
        return 'NO TIME FOR COFFEE';
      })(),
      coffee_subtext: (() => {
        const coffeeWindowMins = Math.abs(nowMinsForLeave - targetMins);
        const inCoffeeWindow = isCommuteDay && coffeeWindowMins <= 120;
        if (!inCoffeeWindow) return null;
        if (coffeeDecision.cafeClosed) return 'Outside opening hours';
        return coffeeDecision.subtext || null;
      })(),
      // Cafe status — independent of commute window. Shows open/closed and cafe name.
      cafe_name: (() => {
        const name = kvPrefs?.locations?.cafe?.name || kvPrefs?.cafe?.name || null;
        if (!name) return null;
        // Extract short name (first part before comma)
        return name.split(',')[0].trim();
      })(),
      cafe_is_open: kvPrefs?.addresses?.cafe ? cafeIsOpen : null,
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
      // Live data flags: reflect actual GTFS-RT data availability at ALL times when API key is set.
      // Badges show data source truth regardless of time of day or tomorrow mode.
      // Journey leg display may use timetable estimates (tomorrow mode), but badges reflect the feed.
      isLive: hasAnyLiveData,
      isPartialLive: hasAnyLiveData && !(
        (!journeyLegs.some(l => l.type === 'train') || hasLiveTrainData) &&
        (!journeyLegs.some(l => l.type === 'tram') || hasLiveTramData) &&
        (!journeyLegs.some(l => l.type === 'bus') || hasLiveBusData)
      ),
      // dataSource: reflects actual GTFS-RT feed state, not gated by time of day.
      // isTomorrowCommute is a separate flag for journey display context.
      dataSource: hasAnyLiveData
        ? ((!journeyLegs.some(l => l.type === 'train') || hasLiveTrainData) &&
           (!journeyLegs.some(l => l.type === 'tram') || hasLiveTramData) &&
           (!journeyLegs.some(l => l.type === 'bus') || hasLiveBusData)
            ? 'gtfs-rt' : 'partial-live')
        : (transitApiKey ? (isTomorrowCommute ? 'tomorrow' : 'no-data') : 'no-key'),
      // Diagnostic: surface feed info for admin panel troubleshooting
      _liveDataDiag: {
        hasApiKey: !!transitApiKey,
        cafeMode: kvPrefs?.apiMode || 'live',
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
      // V15.0: Lifestyle Mindset — suppress in tomorrow mode (today's assessment is not meaningful)
      mindset_stress: isTomorrowCommute ? null : mindset.stressLevel,
      mindset_display: isTomorrowCommute ? null : mindset.stressDisplay,
      mindset_steps: isTomorrowCommute ? null : mindset.stepsDisplay,
      mindset_feels_like: isTomorrowCommute ? null : mindset.feelsLikeDisplay,
      mindset_resilience: isTomorrowCommute ? null : mindset.resilienceDisplay,
      mindset_resilience_level: isTomorrowCommute ? null : mindset.resilienceLevel,
    };

    console.log('[CommuteCompute] _liveDataDiag:', JSON.stringify(dashboardData._liveDataDiag));

    // Format: explicit ?format= wins, POST defaults to json (admin), GET defaults to png (device)
    const format = req.query?.format || (req.method === 'POST' ? 'json' : 'png');

    // Unified JSON response — serves admin panel (backward-compat) AND debug data
    if (format === 'json') {
      // Calculate arrival time for summary
      // Always calculate arrival from now — journey summary shows "if you left now"
      // Tomorrow's target is already shown in the status bar
      const arrivalMinsJson = nowMinsForLeave + totalMinutes;
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

        // Coffee decision gated by ±2hr arrival window (matches renderer and coffee_decision field)
        coffee: (() => {
          const coffeeWindowMins = Math.abs(nowMinsForLeave - targetMins);
          const inCoffeeWindow = isCommuteDay && coffeeWindowMins <= 120;
          if (!inCoffeeWindow) {
            return { canGet: false, cafeClosed: false, decision: null, subtext: '', urgent: false, skipReason: '' };
          }
          return {
            canGet: coffeeDecision.canGet ?? false,
            cafeClosed: coffeeDecision.cafeClosed || false,
            decision: coffeeDecision.decision || (coffeeDecision.canGet ? 'OK' : 'SKIP'),
            subtext: coffeeDecision.subtext || '',
            urgent: coffeeDecision.urgent ?? false,
            skipReason: coffeeDecision.skipReason || ''
          };
        })(),

        // Journey summary (admin panel expects this shape)
        summary: {
          leaveNow: currentTime + amPm,
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
          transit: transitData,
          // Feed diagnostics — shows entity counts, queried stop IDs, match methods
          // for each mode. Helps diagnose why a mode has no live data.
          _feedDiag: {
            train: trains?._feedInfo || null,
            tram: trams?._feedInfo || null,
            bus: buses?._feedInfo || null
          }
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
