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
import { GTFS_STOP_NAMES, getStopNameById, getStopCoordsById, cleanStopName, MELBOURNE_STOP_IDS, detectStopIdsFromAddress, findNearestStops, findNearestStopsMultiple, lookupMetroStationCoords, findNearestTramStopNearCoords } from '../src/data/gtfs-stop-names.js';
import { VIC_METRO_STATIONS, VIC_TRAM_STOPS_WITH_COORDS } from '../src/data/vic/gtfs-reference.js';
import { haversine } from '../src/utils/haversine.js';
import { getTransitApiKey, getPreferences, setPreferences, getUserState, setDeviceStatus, getClient, getStationOverrides, setStationOverrides, getPreferredTramRoute, setPreferredTramRoute, getPreferredTramStop, setPreferredTramStop, getPreferredTrainLine, setPreferredTrainLine, getPreferredTrainStation, setPreferredTrainStation, getV591MigrationDone, setV591MigrationDone, getV594MigrationDone, setV594MigrationDone, getV596MigrationDone, setV596MigrationDone, getV598HomeCoordMigrationDone, setV598HomeCoordMigrationDone } from '../src/data/kv-preferences.js';
import { renderFullDashboard, renderFullScreenBMP, DISPLAY_DIMENSIONS } from '../src/services/ccdash-renderer.js';
import { formatLegTitle } from '../src/services/leg-title-formatter.js';
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

// Lines that terminate at Flinders Street WITHOUT entering City Loop.
// Used as fallback when GTFS-RT trip-scan data is unavailable.
// These lines must be excluded from City Loop filtering to prevent showing
// "Sandringham to Parliament" when Sandringham doesn't serve Parliament.
const FLINDERS_ONLY_LINE_CODES = new Set([
  'SHM',  // Sandringham
  'ALM',  // Alamein
  'GWY',  // Glen Waverley
]);

/**
 * v5.10.2: File-scope GTFS disruption label sanitiser. Converts raw GTFS-RT
 * cause/effect enum values to user-friendly language. Used by both
 * buildJourneyLegs (inner scope) and response assembly (outer scope).
 */
function sanitiseDisruptionLabel(text) {
  if (!text) return text;
  return text
    .replace(/PlannedOccupation/gi, 'Planned Works')
    .replace(/UnplannedOccupation/gi, 'Service Disruption')
    .replace(/PartCancellation/gi, 'Partial Cancellation')
    .replace(/ReducedService/gi, 'Reduced Service')
    .replace(/SignificantDelays/gi, 'Significant Delays')
    .replace(/StopNotServiced/gi, 'Stop Not Serviced')
    .replace(/ServiceInformation/gi, 'Service Update')
    .replace(/GeneralNotice/gi, 'Notice')
    .replace(/RouteVariation/gi, 'Route Change')
    .replace(/TrainReplacement/gi, 'Replacement Bus');
}

/**
 * v5.8.2 (H8-corrective): file-scope helper. Returns true if two location
 * strings refer to the same place, with tolerance for "Station"/"Stop"/
 * "Platform" suffixes, trailing punctuation, and whitespace variance. Used
 * to suppress the redundant walk-to-work leg when the transit terminus IS
 * the workplace. Mirrors src/engines/commute-compute.js:58-78 — keep in sync.
 */
function isSameLocation(stopName, workName) {
  if (!stopName || !workName) return false;
  const norm = (s) => String(s)
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/\b(station|stn|stop|platform)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const a = norm(stopName);
  const b = norm(workName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Check if a train departure likely serves City Loop stations.
 * Uses trip-level passesCityLoop flag when available, falls back to line code mapping.
 * @param {Object} departure - Train departure object from GTFS-RT
 * @returns {boolean}
 */
function isLikelyCityLoopTrain(departure) {
  if (departure.isMetroTunnel) return false;
  if (departure.passesCityLoop === true) return true;
  // Extract line code for Flinders-only check
  const lineCode = departure.routeId?.match(/vic-02-([A-Z]+)/)?.[1];
  // Only trust passesCityLoop:false for KNOWN Flinders-only lines.
  // For other lines (Frankston, Cranbourne etc.), the flag is often false because
  // GTFS-RT stop_time_updates only include upcoming stops — City Loop platforms
  // haven't been reported yet even though the train WILL serve them.
  if (departure.passesCityLoop === false && lineCode && FLINDERS_ONLY_LINE_CODES.has(lineCode)) return false;
  // Flinders-only line without passesCityLoop flag — still exclude
  if (lineCode && FLINDERS_ONLY_LINE_CODES.has(lineCode)) return false;
  // All other lines (including Frankston with passesCityLoop:false) — assume City Loop
  return true;
}

// Base headway defaults (minutes) per transit mode — Australian metro service patterns.
// Used for timetable fallback when GTFS-RT headway cannot be observed.
const DEFAULT_HEADWAYS = { tram: 8, train: 10, bus: 15, vline: 30, ferry: 30 };
const OFFPEAK_MULTIPLIER = 1.5;  // 9am-4pm, 8pm-10pm
const NIGHT_MULTIPLIER = 3;       // 10pm-6am

/**
 * Time-aware timetable headway defaults.
 * Peak (6-9, 16-20): base headway. Off-peak (9-16, 20-22): 1.5x. Night (22-6): 3x.
 * @param {string} legType - 'tram', 'train', 'bus', 'vline', 'ferry'
 * @param {number} hourOfDay - Hour in local time (0-23)
 * @returns {number} Headway in minutes
 */
function getDefaultHeadway(legType, hourOfDay) {
  const base = DEFAULT_HEADWAYS[legType] || DEFAULT_HEADWAYS.bus;
  // No train/tram services between 1-5 AM in Australian metro networks
  if (hourOfDay >= 1 && hourOfDay < 5 && (legType === 'train' || legType === 'tram')) return null;
  if (hourOfDay >= 22 || hourOfDay < 6) return Math.round(base * NIGHT_MULTIPLIER);
  if (hourOfDay >= 20 || (hourOfDay >= 9 && hourOfDay < 16)) return Math.round(base * OFFPEAK_MULTIPLIER);
  return base;
}

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

// v5.9.8 (DD1 / DD4): Home coordinate freshness invariant.
//
// Every downstream consumer of the stored home coordinate — the nearest-stop
// finder, the tram cascade target-coord resolver, the dynamic-route engine's
// walk-leg computation, and every diagnostic helper — reads
// `kvPrefs.locations.home.lat/lon` directly. The pre-v5.9.8 write path (Setup
// Wizard, admin panel edits, manual pin drags) could persist a coord that did
// not match the stored `home.address`. Any drift silently poisoned downstream
// logic: the nearest-stop finder picks the wrong boarding station, and the
// cascade compares feed stops against the wrong target coord (outside the
// identity-tier radius).
//
// The v5.9.8 DD1 + DD4 fix stores a short hash of the canonicalised address
// alongside the coord. On each request:
//   - If the hash is missing (pre-v5.9.8 legacy state, or first request after
//     an address change), re-geocode `home.address` and overwrite the stored
//     lat/lon with the fresh value. This is the one-off DD4 migration wipe.
//   - If the hash matches the current address, trust the stored coord (free
//     fast path; no network call).
//   - If the hash mismatches, re-geocode (DD1 defensive path for future
//     address changes that bypass Setup Wizard re-geocoding).
//
// Sanity guards:
//   - If the geocoder times out, errors, or returns an empty result, fall
//     back to the stored coord and emit a skip reason in telemetry. The
//     request never aborts on a geocoding failure.
//   - If the fresh geocoder result is more than HOME_COORD_REJECT_THRESHOLD_M
//     from the stored coord, the fresh result is treated as a vendor
//     misresolve and the stored coord is kept. This guards against a
//     free-tier geocoder confusing the address with a same-named suburb in
//     another city.
//   - If the fresh geocoder result is within HOME_COORD_DRIFT_THRESHOLD_M of
//     the stored coord, the stored coord is preserved (avoiding lat/lon
//     churn from vendor jitter); only the address hash is refreshed.
//
// Telemetry:
//   - `_liveDataDiag.homeCoordFreshness` surfaces the source ('cached',
//     'geocode-fresh', 'geocode-drift-corrected', 'geocode-rejected',
//     'geocode-failed', 'no-address', 'geocode-empty'), drift distance when
//     applicable, and which coord was ultimately used. This field is the
//     primary evidence a deployment verification pass reads to confirm DD1
//     executed.

const HOME_COORD_DRIFT_THRESHOLD_M = 75;   // below this: trust stored, refresh hash only
const HOME_COORD_REJECT_THRESHOLD_M = 2000; // above this: reject fresh as vendor misresolve
const HOME_COORD_GEOCODE_TIMEOUT_MS = 5000;

// In-memory cache for the per-serverless-instance warm path. Key is the
// canonicalised address; value is { coord, hash, timestamp } for successful
// geocodes or { failed: true, timestamp } for failure memoisation (v5.9.9
// EE3). This avoids re-hitting the free-tier geocoder when the same address
// is resolved twice within a short window across cold-start reuses, and
// prevents thrashing the geocoder endpoint on a known-broken environment
// where every attempt adds ~5 s of latency and every failed request
// compounds rate-limiting against Nominatim's free OSM infrastructure.
const _freshHomeCoordMemoryCache = new Map();
const _freshHomeCoordMemoryTtlMs = 10 * 60 * 1000; // 10 min for success entries
const _freshHomeCoordFailureTtlMs = 60 * 1000;      // 60 s for failure entries — v5.9.9 (EE3)

// v5.9.9 (EE3): diagnostic counter — number of NEW failures recorded since
// the serverless instance warmed up. Does NOT increment when the cache
// serves an already-recorded failure; only increments on the transition
// from "attempted the geocoder" to "stored the failure verdict". Diagnostic
// only; surfaced on _liveDataDiag.homeCoordFreshnessFailureCount so
// operators can see whether the broken-environment cache is actively
// suppressing geocoder thrashing.
let _freshHomeCoordFailureCount = 0;

function _canonicaliseAddress(address) {
  if (!address || typeof address !== 'string') return '';
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}

function _addressHash(address) {
  const canonical = _canonicaliseAddress(address);
  if (!canonical) return '';
  return crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

async function _runGeocodeWithTimeout(address, timeoutMs) {
  // Serverless-safe lazy import so the geocoding service module is only
  // loaded when the migration or drift path actually needs to run. Keeps
  // cold-start import cost down on the warm fast path.
  const { default: GeocodingService } = await import('../src/services/geocoding-service.js');
  const service = new GeocodingService({});
  return await Promise.race([
    service.geocode(address, { country: 'AU' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('geocode-timeout')), timeoutMs))
  ]);
}

/**
 * v5.9.8 (DD1 + DD4): Return a fresh-verified home coord object given the
 * KV preferences. May mutate KV (via setPreferences) when the stored coord
 * is stale or missing an address hash. Always returns SOMETHING sensible
 * so the caller can proceed — the request never aborts on geocoding failure.
 *
 * @param {Object} kvPrefs - raw preferences object from getPreferences()
 * @param {Object} diag - optional telemetry object; freshness source is
 *   written to `diag.homeCoordFreshness` if provided
 * @returns {Promise<{kvPrefs: Object, home: {address, lat, lon, _addressHash}|null}>}
 */
async function ensureFreshHomeCoords(kvPrefs, diag) {
  const diagOut = diag || {};
  const home = kvPrefs?.locations?.home;
  const address = home?.address || kvPrefs?.addresses?.home || null;

  // Guard 1: no address at all — nothing to verify against
  if (!address) {
    diagOut.homeCoordFreshness = { source: 'no-address' };
    return { kvPrefs, home: home || null };
  }

  const storedLat = home?.lat != null ? Number(home.lat) : null;
  const storedLon = home?.lon != null ? Number(home.lon) : null;
  const storedCoord = (storedLat != null && storedLon != null) ? { lat: storedLat, lon: storedLon } : null;
  const freshHash = _addressHash(address);
  const storedHash = home?._addressHash || null;

  // Fast path: hash matches and a coord is stored → trust it
  if (storedHash && storedHash === freshHash && storedCoord) {
    diagOut.homeCoordFreshness = { source: 'cached-hash-match' };
    return {
      kvPrefs,
      home: { ...home, lat: storedCoord.lat, lon: storedCoord.lon, _addressHash: storedHash }
    };
  }

  // Memory cache check — avoid hitting the free-tier geocoder on repeat
  // requests within the same serverless instance warm window. Two distinct
  // entry shapes:
  //   { coord, hash, timestamp }        — successful fresh geocode (10 min TTL)
  //   { failed: true, timestamp }       — v5.9.9 (EE3) failure memoisation
  //                                       (60 s TTL) used to suppress repeat
  //                                       geocoder calls against a known-
  //                                       broken environment.
  const canonical = _canonicaliseAddress(address);
  const memoryEntry = _freshHomeCoordMemoryCache.get(canonical);
  if (memoryEntry) {
    // v5.9.9 (EE3): failure memoisation short-circuit
    if (memoryEntry.failed === true && (Date.now() - memoryEntry.timestamp) < _freshHomeCoordFailureTtlMs) {
      diagOut.homeCoordFreshness = {
        source: 'memory-cache-failed',
        reason: memoryEntry.reason || 'unknown'
      };
      return { kvPrefs, home: home || null };
    }
    // Success entry short-circuit
    if (memoryEntry.coord && (Date.now() - memoryEntry.timestamp) < _freshHomeCoordMemoryTtlMs) {
      diagOut.homeCoordFreshness = { source: 'memory-cache' };
      const mergedHome = { ...home, lat: memoryEntry.coord.lat, lon: memoryEntry.coord.lon, _addressHash: memoryEntry.hash };
      // Persist to KV if the stored value differs from the cached fresh value
      if (!storedHash || storedHash !== memoryEntry.hash) {
        const updated = { ...kvPrefs, locations: { ...(kvPrefs.locations || {}), home: mergedHome } };
        setPreferences(updated).catch(() => {});
        return { kvPrefs: updated, home: mergedHome };
      }
      return { kvPrefs, home: mergedHome };
    }
  }

  // Slow path: run the geocoder
  let fresh = null;
  try {
    fresh = await _runGeocodeWithTimeout(address, HOME_COORD_GEOCODE_TIMEOUT_MS);
  } catch (err) {
    const errMsg = (err && err.message) || 'unknown';
    diagOut.homeCoordFreshness = { source: 'geocode-failed', error: errMsg };
    // v5.9.9 (EE3): record the failure so subsequent requests within the
    // 60 s TTL short-circuit to the memory-cache-failed branch above.
    _freshHomeCoordMemoryCache.set(canonical, {
      failed: true,
      reason: errMsg,
      timestamp: Date.now()
    });
    _freshHomeCoordFailureCount += 1;
    return { kvPrefs, home: home || null };
  }

  if (!fresh || fresh.lat == null || fresh.lon == null) {
    diagOut.homeCoordFreshness = { source: 'geocode-empty' };
    // v5.9.9 (EE3): also memoise empty responses — they indicate the
    // geocoder ran but resolved nothing for this address, which is just
    // as wasteful to repeat as an outright error.
    _freshHomeCoordMemoryCache.set(canonical, {
      failed: true,
      reason: 'geocode-empty',
      timestamp: Date.now()
    });
    _freshHomeCoordFailureCount += 1;
    return { kvPrefs, home: home || null };
  }

  // Sanity guard: reject fresh if it's absurdly far from stored
  if (storedCoord) {
    const drift = haversine(storedCoord.lat, storedCoord.lon, fresh.lat, fresh.lon);
    if (drift > HOME_COORD_REJECT_THRESHOLD_M) {
      diagOut.homeCoordFreshness = {
        source: 'geocode-rejected-too-far',
        driftMetres: Math.round(drift)
      };
      return { kvPrefs, home: home || null };
    }
    if (drift <= HOME_COORD_DRIFT_THRESHOLD_M) {
      // Vendor jitter — keep stored coord but refresh the hash and memory cache
      diagOut.homeCoordFreshness = {
        source: 'cached-drift-ok',
        driftMetres: Math.round(drift)
      };
      _freshHomeCoordMemoryCache.set(canonical, {
        coord: storedCoord,
        hash: freshHash,
        timestamp: Date.now()
      });
      const updatedHome = { ...home, lat: storedCoord.lat, lon: storedCoord.lon, _addressHash: freshHash };
      const updated = { ...kvPrefs, locations: { ...(kvPrefs.locations || {}), home: updatedHome } };
      setPreferences(updated).catch(() => {});
      return { kvPrefs: updated, home: updatedHome };
    }
    // Drift exceeds jitter threshold — corrective overwrite
    diagOut.homeCoordFreshness = {
      source: 'geocode-drift-corrected',
      driftMetres: Math.round(drift)
    };
  } else {
    diagOut.homeCoordFreshness = { source: 'geocode-first' };
  }

  const freshCoord = { lat: Number(fresh.lat), lon: Number(fresh.lon) };
  _freshHomeCoordMemoryCache.set(canonical, {
    coord: freshCoord,
    hash: freshHash,
    timestamp: Date.now()
  });
  const updatedHome = { ...(home || {}), address, lat: freshCoord.lat, lon: freshCoord.lon, _addressHash: freshHash };
  const updated = { ...kvPrefs, locations: { ...(kvPrefs.locations || {}), home: updatedHome } };
  setPreferences(updated).catch(() => {});
  return { kvPrefs: updated, home: updatedHome };
}

/**
 * Initialize the Smart Journey Engine with KV preferences
 * Per Zero-Config: preferences come from Redis (synced from Setup Wizard)
 */
async function getEngine(freshnessDiag) {
  // Load preferences from KV storage
  let kvPrefs = await getPreferences();
  // v5.9.8 (DD1 + DD4): verify the stored home coord still matches the
  // stored address via a freshness check keyed by an address hash. See the
  // block comment near ensureFreshHomeCoords for the full rationale.
  try {
    const result = await ensureFreshHomeCoords(kvPrefs, freshnessDiag);
    kvPrefs = result.kvPrefs;
  } catch (_e) {
    // Non-fatal — proceed with whatever kvPrefs we have
  }
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

    // Restore user's selected route from KV preferences.
    // Route ID is stable regardless of coffee toggle; numeric index shifts when
    // coffee routes are added/removed and must be treated as a fallback only.
    if (kvPrefs.selectedRouteId !== undefined) {
      journeyEngine.selectRoute(kvPrefs.selectedRouteId);
    } else if (kvPrefs.selectedRouteIndex !== undefined) {
      journeyEngine.selectRoute(parseInt(kvPrefs.selectedRouteIndex));
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
    let legDuration = isWalkLeg ? Math.min(rawDuration + 2, 30) : rawDuration;

    // v5.8.2 (H8-corrective): suppress the redundant walk-to-work leg when the
    // preceding transit terminus IS the workplace. Applied at the public-leg
    // transformation layer so it catches every route producer (findDirectRoutes,
    // findMultiModalRoutes, getHardcodedRoutes, and any future callers). The
    // v5.8.1 version was scoped to the engine's findDirect/findMultiModal
    // branches only and did not cover getHardcodedRoutes, so station-as-work
    // configurations still showed a phantom walk leg.
    if (isWalkLeg && leg.to === 'work') {
      for (let j = i - 1; j >= 0; j--) {
        const prev = route.legs[j];
        if (!prev) break;
        if (prev.type === 'walk') continue;
        if (prev.type === 'train' || prev.type === 'tram' || prev.type === 'bus' || prev.type === 'vline') {
          const prevDestName = prev.destination?.name || prev.destinationName || null;
          const workName = leg.workName ||
                           locations?.work?.name ||
                           locations?.work?.address?.split(',')[0]?.trim() ||
                           null;
          if (isSameLocation(prevDestName, workName)) {
            legDuration = 0;
          }
        }
        break;
      }
    }

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
    // v5.8.2 (N2-guard): suburb-derived fabrication removed. Stop names now
    // return null when GTFS and CommuteCompute lookups both fail, instead of
    // placeholder strings like "South Yarra Tram Stop" or "Craigieburn Station"
    // that don't refer to any real stop. Downstream consumers handle null by
    // leaving the stop name unset rather than rendering a fabrication.
    const derivedTramStop = null;
    const derivedStation = null;

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
      // v5.8.2 (N2-guard): suburb-derived fabrication removed.
      const suburbName = null;                                       // 3) no fabrication

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
      // v5.8.2 (N2-guard): suburb-derived fabrication removed.
      const suburbName = null;                                       // 3) no fabrication

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
      // v5.8.2 (N2-guard): suburb-derived fabrication removed.
      const suburbName = null;
      const actualName = gtfsName ||
        (!isGeneric(commuteComputeName) ? commuteComputeName : null) ||
        suburbName || commuteComputeName || null;
      leg.originStop = actualName;
    }

    // Resolve destination names via GTFS when engine provides generic ones.
    // In multi-modal (tram+train) routes, the tram alights at the transfer area
    // near the train station — use the home-side train stop as the area name.
    // In direct tram routes, the tram goes to the work area — use work suburb only.
    // This keeps per-journey-type preferences independent (Bug 5 fix).
    if (leg.type === 'tram' && leg.destination) {
      const genericDestNames = ['station', 'tram stop', 'bus stop', 'platform', 'stop', 'city'];
      const isDestGeneric = (name) => !name || genericDestNames.includes(name.toLowerCase().trim());
      if (isDestGeneric(leg.destination.name)) {
        const workSuburb = extractSuburb(locations.work?.address);
        const hasTrainLeg = route.legs.some(l => l.type === 'train' || l.type === 'vline');
        if (hasTrainLeg) {
          // Multi-modal: tram takes user to the train transfer area.
          // V5.4.0: Abbreviate "Station" to "Stn" (not the full station name).
          const gtfsDest = getStopNameById(stopIds.trainStopId);
          const areaName = gtfsDest ? gtfsDest.replace(/\s+Station$/i, ' Stn') : null;
          leg.destination.name = areaName || workSuburb || leg.destination.name;
        } else {
          // Direct tram: destination is the work area, not the train station.
          leg.destination.name = workSuburb || leg.destination.name;
        }
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
      // V5.6.9: Re-check requiresCityLoop / requiresMetroTunnel after destination
      // name resolution. The initial check at line 416 uses the engine's raw
      // destination which is typically generic ("City", "Station"). After GTFS/suburb
      // resolution above, the name is specific (e.g., "Parliament Station") and can
      // be correctly matched against City Loop / Metro Tunnel station lists.
      if (!leg.requiresCityLoop && !leg.requiresMetroTunnel) {
        const resolvedDest = (leg.destination?.name || '').toLowerCase();
        const cityLoopResolved = ['flinders', 'parliament', 'melbourne central', 'flagstaff', 'southern cross'];
        const metroTunnelResolved = ['town hall', 'state library', 'parkville', 'arden', 'anzac'];
        if (cityLoopResolved.some(s => resolvedDest.includes(s))) {
          leg.requiresCityLoop = true;
        } else if (metroTunnelResolved.some(s => resolvedDest.includes(s))) {
          leg.requiresMetroTunnel = true;
        }
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

    // V5.4.4: Clear stale isTimetableEstimate when findMatchingDeparture returns live data.
    // filterUnavailableTransitLegs uses strict route matching which may miss departures
    // that findMatchingDeparture finds via its any-route fallback. When live data IS found,
    // the timetable flag must be cleared so isLive and Next: subtitle render correctly.
    if (liveData?.isLive && leg.isTimetableEstimate) {
      leg.isTimetableEstimate = false;
    }

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

    // V5.6.1: Propagate City Loop disruption override from raw departure to leg.
    // When Fix 1 (v5.6.0) overrides a departure's destination to "Flinders Street Station",
    // that override must reach the journey leg title. This handles LIVE departures.
    if (leg.type === 'train' && liveData?._cityLoopOverride) {
      leg.destinationName = liveData.destination;
      if (leg.destination) leg.destination.name = liveData.destination;
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
        // V5.5.1: Pad with raw feed departures for frequency context — all transit modes.
        // When route/direction filtering reduces allDepartureTimesMs to 1-2 entries,
        // the raw feed has all matched departures for richer "Next:" display.
        if (nextDepartureTimesMs && nextDepartureTimesMs.length < 5) {
          const feedForMode = leg.type === 'tram' ? transitData.trams :
                              leg.type === 'bus' ? transitData.buses :
                              transitData.trains;
          let rawDirDeps = feedForMode?.filter(d =>
            d.isLive && d.departureTimeMs > nowMs &&
            (leg.isCitybound === undefined || d.isCitybound === leg.isCitybound) &&
            // Trains: filter by direction only (not route number) — multiple lines serve same direction
            // Trams/buses: filter by numeric route prefix (58a matches 58)
            (leg.type === 'train' || leg.type === 'vline' || !leg.routeNumber || !d.routeNumber || parseInt(String(d.routeNumber), 10) === parseInt(String(leg.routeNumber), 10))
          ) || [];
          // For trains requiring City Loop: exclude Metro Tunnel trains from padding
          if ((leg.type === 'train' || leg.type === 'vline') && leg.requiresCityLoop && rawDirDeps.length > 0) {
            const loopFiltered = rawDirDeps.filter(d => isLikelyCityLoopTrain(d));
            if (loopFiltered.length > 0) rawDirDeps = loopFiltered;
          }
          for (const d of rawDirDeps) {
            if (nextDepartureTimesMs.length >= 10) break;
            if (!nextDepartureTimesMs.includes(d.departureTimeMs)) {
              nextDepartureTimesMs.push(d.departureTimeMs);
            }
          }
          nextDepartureTimesMs.sort((a, b) => a - b);
        }
        // V5.6.9: Sort unconditionally — when allDepartureTimesMs has >= 5 entries
        // the padding branch above is skipped, leaving feed-order timestamps unsorted.
        if (nextDepartureTimesMs && nextDepartureTimesMs.length >= 5) {
          nextDepartureTimesMs.sort((a, b) => a - b);
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
          // v5.9.6 (BB2): No catchable departure in the GTFS-RT feed — every
          // known live departure is BEFORE the user's arrival at this stop.
          // The pre-v5.9.6 branch extrapolated a projected departure using
          // observed-or-default headway and marked the leg as isLive. That
          // fabricated a value that did not match the transport authority's
          // own departure boards and violated §23.6 "isLive: true only from
          // GTFS-RT matches". v5.9.6 removes the projection entirely: if no
          // catchable departure exists in the current cache window, we do
          // NOT manufacture one. The leg carries no actualDepartureMs from
          // this branch and falls through to the existing timetable-
          // fallback path (search for isTimetableEstimate below), which
          // correctly labels the subtitle "Scheduled ~Xmin" instead of the
          // over-inclusive "Next: N min LIVE" display.
          //
          // This implements DEVELOPMENT-RULES.md §23.6 "nextDepartures
          // truthfulness invariant" (v5.9.6 BB2 update). The parallel
          // timetable-fallback path downstream will still produce a
          // displayable leg — just with honest labelling.
          //
          // No behaviour change for the common case where at least one
          // catchable departure exists — that branch returns actualDepartureMs
          // from the first catchable entry without touching this block.
          nextDepartureTimesMs = nextDepartureTimesMs
            ? nextDepartureTimesMs.filter(ms => ms >= arrivalAtStopMs)
            : [];
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
        // Ensure departTime is always catchable — never show a departure the user can't reach
        if (actualDepartureMs < arrivalAtStopMs && nextDepartureTimesMs?.length > 0) {
          const catchable = nextDepartureTimesMs.filter(ms => ms >= arrivalAtStopMs);
          if (catchable.length > 0) actualDepartureMs = catchable[0];
        }
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
        // Fallback: use minutes from live data (already from now).
        //
        // v5.9.7 (CC1): prefer the raw feed's `departureTimeMs` when it is
        // present on the live-data object. The pre-v5.9.7 reconstruction
        // `nowMs + (liveData.minutes * 60000)` loses sub-minute precision
        // because `liveData.minutes` was computed earlier via
        // `Math.round((depMs - nowMs) / 60000)`, so the round-trip back
        // through the fallback produces a value up to ~30 s away from the
        // real feed millisecond. On the common live-data path the raw
        // timestamp is always populated; the nowMs-plus-minutes path only
        // runs when the raw timestamp is genuinely absent (non-live
        // timetable edge case). v5.9.6 swarm Agent C identified this
        // artefact as a cosmetic non-blocking follow-up — see
        // DEVELOPMENT-RULES.md §23.6 (v5.9.7 CC1 update).
        minutesToDeparture = liveData.minutes;
        const departMs = liveData.departureTimeMs != null
          ? liveData.departureTimeMs
          : (nowMs + (liveData.minutes * 60000));
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
        let dirFiltered = feedLiveDeps.filter(d => d.isCitybound === leg.isCitybound);
        if (leg.requiresCityLoop) {
          dirFiltered = dirFiltered.filter(d => isLikelyCityLoopTrain(d));
        }
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
        // V5.6.1: Apply City Loop disruption override to timetable fallback legs.
        // When live data is unavailable but City Loop is closed, the timetable
        // destination must reflect actual routing, not scheduled routing.
        if (leg.type === 'train' && options.cityLoopClosed && leg.requiresCityLoop) {
          leg.destinationName = 'Flinders Street Station';
          if (leg.destination) leg.destination.name = 'Flinders Street Station';
        }
        const estWaitMins = 2;
        const estDepartMins = nowMins + cumulativeMinutes + estWaitMins;
        const estH = Math.floor(estDepartMins / 60) % 24;
        const estM = estDepartMins % 60;
        const estH12 = estH % 12 || 12;
        const estAmPm = estH >= 12 ? 'pm' : 'am';
        departTime = `~${estH12}:${estM.toString().padStart(2, '0')}${estAmPm}`;
        minutesToDeparture = Math.min(cumulativeMinutes + estWaitMins, 180);

        // V5.4.6: Always generate headway-based departure estimates for timetable mode.
        // Previously gated on !feedHadEntities — when GTFS-RT feed had entities but
        // direction/route filtering removed all matches, the subtitle showed transit
        // duration ("Scheduled ~6min") instead of departure countdown.
        const estDepartMs = nowMs + (minutesToDeparture * 60000);
        const headway = getDefaultHeadway(leg.type, melbTime.hour);
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
      // For walk legs, calculate arrival at walk endpoint (start + duration)
      endTime: leg.type === 'walk' ? (() => {
        const endMins = nowMins + cumulativeMinutes + legDuration;
        const endH = Math.floor(endMins / 60) % 24;
        const endM = endMins % 60;
        const endH12 = endH % 12 || 12;
        const endAmPm = endH >= 12 ? 'pm' : 'am';
        return `${endH12}:${String(endM).padStart(2, '0')}${endAmPm}`;
      })() : null,
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

    // Multi-service display: when multiple distinct lines/routes serve the same stop pair,
    // show combined title with abbreviations for concise e-ink display
    if (isTransitLeg && liveData?.allDepartures?.length > 0) {
      const destName = leg.destination?.name || 'City';
      if (leg.type === 'train' || leg.type === 'vline') {
        // Filter allDepartures to only trains that can reach the destination
        const reachableDeps = leg.requiresCityLoop
          ? liveData.allDepartures.filter(d => isLikelyCityLoopTrain(d))
          : liveData.allDepartures;
        // Trains: use line code abbreviations (FKN/CRB/PKM)
        const distinctLines = [...new Set(reachableDeps.map(d => d.lineName).filter(Boolean))];
        if (distinctLines.length >= 2) {
          const abbreviations = [...new Set(
            reachableDeps.map(d => d.routeId?.match(/vic-02-([A-Z]+)/)?.[1]).filter(Boolean)
          )];
          const abbrevStr = abbreviations.length > 0 ? abbreviations.join('/') : distinctLines.join('/');
          baseLeg.title = `${abbrevStr} to ${destName}`;
          baseLeg.lineName = abbrevStr;
        }
      } else if (leg.type === 'tram' || leg.type === 'bus') {
        // Trams/buses: use route numbers (58/59 or Bus 200/201)
        const distinctRoutes = [...new Set(liveData.allDepartures.map(d => d.routeNumber).filter(Boolean))];
        if (distinctRoutes.length >= 2) {
          const prefix = leg.type === 'tram' ? 'Route' : 'Bus';
          baseLeg.title = `${prefix} ${distinctRoutes.join('/')} to ${destName}`;
          baseLeg.routeNumber = distinctRoutes.join('/');
        }
      }
    }

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

      // V5.4.0 + v5.9.7 (CC2): Calculate "Next: x, y, z" from CATCHABLE
      // departures only. A "catchable" entry is a departure whose time
      // is at or after the user's arrival-at-stop, allowing a 2-minute
      // buffer for GTFS-RT timing estimation error and walking-speed
      // variation. This filter is applied at the array construction
      // site, not just the subtitle — so downstream consumers that read
      // `leg.nextDepartures` directly (renderer, firmware, telemetry,
      // admin diagnostics) see the same catchable-filtered list as the
      // subtitle renders.
      //
      // v5.9.7 (CC2): the pre-v5.9.7 code padded `catchable` with
      // "from now" entries (filtered only by `depMs > nowMs`, NOT by
      // arrival-at-stop) when fewer than 3 catchable entries existed.
      // That exposed uncatchable entries on `leg.nextDepartures` even
      // though the subtitle constructor downstream re-filtered them out.
      // The v5.9.6 swarm Agent D surfaced the resulting inconsistency
      // on a train leg. v5.9.7 CC2 removes the padding: if fewer than
      // 3 catchable entries exist, fewer are shown — consistent with
      // the BB2 "nextDepartures truthfulness" invariant. The additive
      // `allNextDeparturesMs` field below preserves the full forward-
      // window list for telemetry consumers only; rendered output MUST
      // read `nextDepartures`, not `allNextDeparturesMs`. See
      // DEVELOPMENT-RULES.md §23.6 "catchability filter invariant"
      // (v5.9.7 CC2 update).
      if (baseLeg.nextDepartureTimesMs?.length > 0) {
        const catchabilityBuffer = 2 * 60000;
        const catchable = baseLeg.nextDepartureTimesMs
          .filter(depMs => depMs >= arrivalAtStopMs - catchabilityBuffer)
          .map(depMs => Math.round((depMs - nowMs) / 60000));
        // V5.6.9: Sort unconditionally — the subtitle builder sorts
        // before display, but the raw API `nextDepartures` field was
        // returned unsorted in earlier cycles when the catchable list
        // came through un-padded.
        baseLeg.nextDepartures = catchable.sort((a, b) => a - b);
        // v5.9.7 (CC2): additive telemetry field — full forward-window
        // list (catchable + uncatchable) for diagnostic consumers that
        // need visibility into what the raw feed looked like. Not used
        // for display.
        baseLeg.allNextDeparturesMs = [...baseLeg.nextDepartureTimesMs].sort((a, b) => a - b);
      }

      // v5.9.7 (CC2): Supplement from the direction/route-filtered raw
      // GTFS-RT feed when fewer than 4 catchable entries exist. The
      // supplement entries MUST pass the same arrival-at-stop
      // catchability filter that the primary array construction uses
      // (see the `catchabilityBuffer` above). Pre-v5.9.7 this block
      // mapped `d.departureTimeMs - nowMs` directly without the
      // catchability filter, so it could push uncatchables into
      // `nextDepartures`. v5.9.7 CC2 adds the missing filter so the
      // supplement is consistent with the main construction above.
      //
      // v5.9.6 (BB2) remains in force: no headway extrapolation —
      // all supplement entries come from real feed entries only.
      if (baseLeg.nextDepartures && baseLeg.nextDepartures.length < 4 && baseLeg.isLive) {
        const catchabilityBuffer = 2 * 60000;
        const feedForMode = leg.type === 'tram' ? transitData.trams :
                            leg.type === 'bus' ? transitData.buses :
                            transitData.trains;
        const padDeps = (feedForMode || [])
          .filter(d => d.isLive && d.departureTimeMs > nowMs &&
            // v5.9.7 (CC2): apply catchability filter to the supplement
            // source entries so uncatchables can't leak into the array.
            d.departureTimeMs >= arrivalAtStopMs - catchabilityBuffer &&
            (leg.isCitybound === undefined || d.isCitybound === leg.isCitybound) &&
            (leg.type !== 'train' || !leg.requiresCityLoop || isLikelyCityLoopTrain(d)) &&
            (leg.type === 'train' || leg.type === 'vline' || !leg.routeNumber || !d.routeNumber ||
             parseInt(String(d.routeNumber), 10) === parseInt(String(leg.routeNumber), 10)))
          .map(d => Math.round((d.departureTimeMs - nowMs) / 60000))
          .filter(m => m >= 0 && m <= 120)
          .sort((a, b) => a - b);
        for (const m of padDeps) {
          if (baseLeg.nextDepartures.length >= 4) break;
          if (!baseLeg.nextDepartures.includes(m)) baseLeg.nextDepartures.push(m);
        }
        // v5.9.6 (BB2): headway extrapolation REMOVED.
        //
        // Pre-v5.9.6 behaviour: a loop ran "while nextDepartures.length < 4"
        // that projected a future departure by adding the observed headway
        // to the last known entry, pushed it into both `nextDepartures` and
        // `nextDepartureTimesMs`, and allowed the leg's `isLive` flag to
        // keep propagating the "LIVE" label to the subtitle. Live v5.9.5
        // verification confirmed this produced subtitles like
        // "Next: 24, 44, 64 min LIVE" where only 24 min was a real GTFS-RT
        // match — 44 and 64 were projected (1,188,819 ms deltas from the
        // last real feed entry, clearly computed not observed).
        //
        // This violated DEVELOPMENT-RULES.md §23.6 "`isLive: true` only
        // from GTFS-RT matches". v5.9.6 BB2 removes the projection entirely
        // and adds the rule formally to §23.6 as "nextDepartures
        // truthfulness invariant". If the live feed has fewer than four
        // catchable departures, the subtitle shows fewer entries — we do
        // NOT fabricate additional ones. A leg with zero catchable live
        // entries falls through to the timetable-fallback path elsewhere,
        // which correctly labels the subtitle "Scheduled ~Xmin" rather
        // than "LIVE".
        baseLeg.nextDepartures.sort((a, b) => a - b);
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
          .replace(/StopNotServiced/gi, 'Stop Not Serviced')
          .replace(/ServiceInformation/gi, 'Service Update')
          .replace(/GeneralNotice/gi, 'Notice')
          .replace(/RouteVariation/gi, 'Route Change')
          .replace(/TrainReplacement/gi, 'Replacement Bus');
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
            'REDUCED_SERVICE', 'DETOUR', 'UNKNOWN_EFFECT', 'STOP_CLOSURE',
            'MINOR_DELAY', 'OTHER_EFFECT'
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

          // Route matching: prefer explicit affectedRoutes, but allow mode-wide
          // severe alerts (no routes listed) to match any leg of that mode.
          // Severe effects without routes = network-wide disruption affecting all services.
          const SEVERE_EFFECTS = ['NO_SERVICE', 'SIGNIFICANT_DELAYS', 'REDUCED_SERVICE', 'MODIFIED_SERVICE'];
          const hasRoutes = d.affectedRoutes && d.affectedRoutes.length > 0;

          if (hasRoutes) {
            // STRICT: Only match on GTFS line codes, not partial strings
            // GTFS route IDs: "aus:vic:vic-02-WER:" (Werribee), "aus:vic:vic-02-SHM:" (Sandringham)
            const legRoute = leg.routeNumber?.toString() || '';
            const legLine = leg.lineName?.toLowerCase() || '';

            const lineCodes = {
              'sandringham': 'shm', 'frankston': 'fkn', 'pakenham': 'pkm',
              'cranbourne': 'cbe', 'glen waverley': 'glw', 'alamein': 'alm',
              'belgrave': 'bel', 'lilydale': 'lil', 'hurstbridge': 'hbe',
              'mernda': 'mer', 'craigieburn': 'crb', 'sunbury': 'sun',
              'upfield': 'upf', 'werribee': 'wer', 'williamstown': 'wil',
              'stony point': 'spt', 'flemington racecourse': 'fle'
            };

            const routeMatch = d.affectedRoutes.some(route => {
              const routeUpper = route.toUpperCase();

              if (legRoute && leg.type === 'tram') {
                return routeUpper.includes(`-${legRoute}:`) || routeUpper.includes(`-${legRoute}-`);
              }

              if (legRoute && leg.type === 'bus') {
                return routeUpper.includes(`-${legRoute}:`) || routeUpper.includes(`-${legRoute}-`) || routeUpper.endsWith(`-${legRoute}`);
              }

              if (leg.type === 'train' && legLine) {
                const legCode = (lineCodes[legLine] || '').toUpperCase();
                if (legCode) {
                  return routeUpper.includes(`-${legCode}:`) || routeUpper.includes(`-${legCode}-`);
                }
              }

              return false;
            });
            // Strict route match failed — try text-based line name as fallback.
            // Some alerts have affectedRoutes in unexpected ID formats that don't
            // match our line code patterns but DO mention the line name in text.
            // v5.11.0: Also match City Loop/Flinders Street keywords for train legs —
            // network disruptions (e.g. "trains run direct to Flinders Street, not via
            // the City Loop") affect all citybound train lines but don't name each line.
            if (!routeMatch) {
              const legLineFallback = leg.lineName?.toLowerCase() || '';
              if (legLineFallback && leg.type === 'train') {
                const alertText = ((d.headerText || '') + ' ' + (d.description || '')).toLowerCase();
                const mentionsLine = alertText.includes(legLineFallback);
                const cityLoopKeywords = ['city loop', 'not via the city', 'direct to flinders', 'direct to and from flinders'];
                const mentionsCityLoop = cityLoopKeywords.some(kw => alertText.includes(kw));
                if (!mentionsLine && !mentionsCityLoop) return false;
                // Text mentions this line or a City Loop disruption — proceed
              } else {
                return false;
              }
            }
          } else {
            // No explicit routes — text-based line name matching, City Loop keyword, or severe effect.
            const legLine = leg.lineName?.toLowerCase() || '';
            if (legLine && leg.type === 'train') {
              const alertFullText = ((d.headerText || '') + ' ' + (d.description || '')).toLowerCase();
              const lineNameMatch = alertFullText.includes(legLine);
              const cityLoopKws = ['city loop', 'not via the city', 'direct to flinders', 'direct to and from flinders'];
              const cityLoopMatch = cityLoopKws.some(kw => alertFullText.includes(kw));
              if (!lineNameMatch && !cityLoopMatch && !SEVERE_EFFECTS.includes(d.effect)) return false;
            } else if (!SEVERE_EFFECTS.includes(d.effect)) {
              return false;
            }
          }

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
          const routeLabel = leg.routeNumber ? `${leg.type.toUpperCase()} ${leg.routeNumber}` : leg.type.toUpperCase();

          // Extract delay minutes from alert text (e.g., "Delays up to 15 minutes")
          if (!baseLeg.delayMinutes) {
            const delayMatch = (matchingDisruption.description || matchingDisruption.headerText || '')
              .match(/(?:up\s+to|of)\s+(\d+)\s*min/i);
            if (delayMatch) {
              baseLeg.delayMinutes = parseInt(delayMatch[1], 10);
            }
          }

          // Set leg state based on disruption effect
          const delayEffects = ['MINOR_DELAY', 'SIGNIFICANT_DELAYS'];
          if (matchingDisruption.type === 'suspension' || matchingDisruption.type === 'cancelled'
              || matchingDisruption.effect === 'NO_SERVICE') {
            baseLeg.status = 'suspended';
            baseLeg.state = 'suspended';
            baseLeg.alertText = `${routeLabel} SUSPENDED`;
          } else if (baseLeg.delayMinutes || delayEffects.includes(matchingDisruption.effect)) {
            baseLeg.status = 'delayed';
            baseLeg.state = 'delayed';
            baseLeg.alertText = baseLeg.delayMinutes
              ? `${routeLabel} +${baseLeg.delayMinutes} MIN`
              : `${routeLabel} DELAYED`;
          } else {
            baseLeg.alertText = sanitiseDisruptionText(matchingDisruption.headerText) || `${routeLabel} DISRUPTED`;
          }
        }
      }
    }

    // V5.6.1: Disruption-aware rerouting — when a train leg is suspended,
    // attempt to find an alternate citybound train from a different line.
    if (baseLeg.type === 'train' && baseLeg.state === 'suspended' && transitData.trains?.length > 0) {
      const suspendedLine = baseLeg.lineName || '';
      const altTrains = transitData.trains.filter(t =>
        t.isLive && t.isCitybound && t.lineName !== suspendedLine &&
        t.departureTimeMs && t.departureTimeMs >= arrivalAtStopMs &&
        (!leg.requiresCityLoop || isLikelyCityLoopTrain(t))
      ).sort((a, b) => a.departureTimeMs - b.departureTimeMs);
      if (altTrains.length > 0) {
        const alt = altTrains[0];
        baseLeg.state = 'diverted';
        baseLeg.status = 'diverted';
        baseLeg.lineName = alt.lineName;
        baseLeg.isLive = true;
        baseLeg.isTimetableEstimate = false;
        baseLeg.alertText = `${suspendedLine.toUpperCase()} SUSPENDED → ${alt.lineName}`;
        const altDestName = alt._cityLoopOverride ? alt.destination : (alt.destination || baseLeg.destinationName);
        baseLeg.destinationName = altDestName;
        if (baseLeg.destination) baseLeg.destination.name = altDestName;
        actualDepartureMs = alt.departureTimeMs;
        minutesToDeparture = Math.round((alt.departureTimeMs - nowMs) / 60000);
        baseLeg.nextDepartures = altTrains.slice(0, 3).map(t => Math.round((t.departureTimeMs - nowMs) / 60000));
        baseLeg.nextDepartureTimesMs = altTrains.slice(0, 3).map(t => t.departureTimeMs);
      }
    }

    // Convert timetable nextDepartureTimesMs to nextDepartures (minutes from now)
    // when live data matching didn't run (timetable fallback path)
    if (isTransitLeg && !baseLeg.nextDepartures && baseLeg.nextDepartureTimesMs?.length > 0) {
      // V5.6.7: Sort after mapping — nextDepartureTimesMs may be unsorted when
      // allFutureDeps.length >= 5 bypasses the padding-sort at line 574.
      baseLeg.nextDepartures = baseLeg.nextDepartureTimesMs
        .map(depMs => Math.round((depMs - nowMs) / 60000))
        .sort((a, b) => a - b);
    }

    // Subtitle for transit legs: live GTFS-RT departures take priority over timetable.
    // If isLive is true, show "Next: x, y, z min LIVE" regardless of isTimetableEstimate
    // (which may have been set by timestamp clamping even when live data exists).
    if (isTransitLeg && baseLeg.isLive && baseLeg.nextDepartures?.length > 0) {
      // V5.6.7: Filter to catchable departures only (>= cumulative minutes to stop),
      // then sort ascending before slicing — fixes out-of-order "Next:" display.
      const times = baseLeg.nextDepartures
        .filter(m => m >= (baseLeg.catchInMinutes || 0) && m <= 120)
        .sort((a, b) => a - b)
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
          .filter(m => m >= (baseLeg.catchInMinutes || 0) && m <= 120)
          .sort((a, b) => a - b)
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

  // v5.9.0 (T13 / N16): Tomorrow-commute disambiguation on rendered times.
  // When the current cycle is showing tomorrow's commute (the user has
  // already missed today's target arrival), every departTime in the leg
  // list refers to a time tomorrow — NOT today. Append a +1 marker so
  // the rendered AM/PM time is unambiguous ("7:45am+1" reads as
  // "7:45am tomorrow"). The affix is stripped by the renderer if the
  // v5.10.1: Removed "+1" tomorrow suffix from departure times.
  // The user glances at the panel for live departure times — "tomorrow"
  // context is not relevant. Forward-looking info is limited to disruption
  // alerts (e.g. scheduled works after 6pm affecting the route).

  // v5.9.0: Leg interdependency chain validation.
  // Each transit leg's boarding location must connect to the previous leg's
  // alighting location, and its alighting location must connect to the next
  // leg's boarding location. Walk legs bridge the gaps; transit legs must
  // have stops that match what the adjacent walk legs reference.
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1];
    const curr = legs[i];
    // Validate walk → transit connections: the walk leg's destination
    // should reference the same stop as the transit leg's boarding point
    if (prev.type === 'walk' && (curr.type === 'tram' || curr.type === 'train' || curr.type === 'bus')) {
      const walkDest = prev.stopName || prev.stationName || prev.destinationName || '';
      const transitOrigin = curr.stopName || curr.origin?.name || '';
      if (walkDest && transitOrigin && walkDest !== transitOrigin) {
        // Align walk destination to match the transit leg's actual boarding point
        prev.stopName = transitOrigin;
        prev.stationName = transitOrigin;
        prev.destinationName = transitOrigin;
        if (prev.title) prev.title = `Walk to ${transitOrigin}`;
      }
    }
    // Validate transit → walk connections: the transit leg's alighting point
    // should be referenced by the subsequent walk leg's origin
    if ((prev.type === 'tram' || prev.type === 'train' || prev.type === 'bus') && curr.type === 'walk') {
      const transitDest = prev.destination?.name || prev.destinationName || '';
      const walkOrigin = curr.stationName || curr.stopName || '';
      if (transitDest && walkOrigin && transitDest !== walkOrigin) {
        // Align walk origin to match where the transit leg actually drops off
        curr.stationName = transitDest;
        curr.stopName = transitDest;
      }
    }
  }

  return legs;
}

/**
 * Build leg title with actual location names.
 *
 * v5.9.0 (T11): Thin wrapper around the shared formatLegTitle module.
 * See src/services/leg-title-formatter.js for the canonical implementation.
 * Kept as a function here so existing call sites at line 920 etc. don't
 * change.
 */
function buildLegTitle(leg) {
  return formatLegTitle(leg);
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
    // V5.6.3: When City Loop is closed and departure has been overridden to
    // Flinders Street, accept it — it's the best available option. Without this,
    // the passesCityLoop:false override from Fix 1 causes this filter to reject
    // ALL citybound trains, forcing timetable fallback with wrong destination.
    if (d._cityLoopOverride) return true;
    // V5.4.9: Use trip-scan flag as primary — scans ALL stops in the trip for
    // City Loop platforms. More reliable than finalStop which may be the outbound
    // terminus (past City Loop) for trains that PASS THROUGH the Loop.
    if (d.passesCityLoop !== undefined) return d.passesCityLoop;
    // V5.5.3: Default to false when no trip scan and no finalStop data.
    // The previous !isMetroTunnel default incorrectly classified ALL non-Tunnel
    // trains as City Loop, including evening direct-to-Flinders services.
    // Conservative: without evidence, don't assume Loop traversal. When no trains
    // pass the Loop filter, findMatchingDeparture's fallback (line 1239) returns
    // all citybound trains — user sees all available services.
    if (!d.finalStop) return false;
    for (const pid of CITY_LOOP_PLATFORM_IDS) {
      if (d.finalStop === pid || d.finalStop.endsWith(`:${pid}`) || d.finalStop.endsWith(`-${pid}`)) {
        return true;
      }
    }
    return false;
  });

  // V5.5.2: Time-gated soft-preference for City Loop filtering.
  // Strict filtering is correct when Loop services are frequent — a non-Loop
  // train genuinely cannot reach Parliament/Melbourne Central/Flagstaff.
  // But when the nearest Loop train is >30 min later than the nearest direct
  // train (common evenings/weekends when services bypass the Loop), forcing
  // the user to wait 80+ min is worse than catching a direct train to Flinders
  // Street and walking ~7 min to the City Loop station.
  if (cityLoopTrains.length > 0) {
    const nonLoopNonTunnel = dirMatches.filter(d =>
      !cityLoopTrains.includes(d) && !d.isMetroTunnel && isLikelyCityLoopTrain(d)
    );
    if (nonLoopNonTunnel.length > 0) {
      const nearestLoopMs = Math.min(...cityLoopTrains.map(d => d.departureTimeMs || Infinity));
      const nearestDirectMs = Math.min(...nonLoopNonTunnel.map(d => d.departureTimeMs || Infinity));
      if (nearestDirectMs < Infinity && (nearestLoopMs - nearestDirectMs) > 30 * 60000) {
        // Direct service is >30 min sooner — include likely City Loop trains.
        return dirMatches.filter(d => isLikelyCityLoopTrain(d));
      }
    }
    // Include ALL City Loop trains (multiple lines serve City Loop stations).
    // Also include non-Metro-Tunnel trains departing within 10 min of nearest
    // City Loop train — ensures interleaved services from different lines appear.
    const nearestLoopMs = Math.min(...cityLoopTrains.map(d => d.departureTimeMs || Infinity));
    const nearbyDirect = dirMatches.filter(d =>
      !cityLoopTrains.includes(d) && !d.isMetroTunnel &&
      isLikelyCityLoopTrain(d) &&
      d.departureTimeMs && (d.departureTimeMs - nearestLoopMs) < 10 * 60000
    );
    return [...cityLoopTrains, ...nearbyDirect].sort((a, b) => (a.departureTimeMs || 0) - (b.departureTimeMs || 0));
  }

  // No trains with confirmed passesCityLoop in the feed. This usually means the
  // GTFS-RT feed's stop_time_updates don't include City Loop platform IDs (feed only
  // has upcoming stops, not the full trip). Fall back to non-Metro-Tunnel citybound
  // trains — these are almost certainly City Loop trains (Metro Tunnel lines are the
  // only citybound trains that DON'T serve City Loop, and they have isMetroTunnel: true).
  const likelyCityLoop = dirMatches.filter(d => isLikelyCityLoopTrain(d));
  if (likelyCityLoop.length > 0) {
    return likelyCityLoop;
  }
  // Last resort: prefer non-Flinders-only, non-Metro-Tunnel trains.
  // When GTFS-RT data is sparse, showing likely City Loop options is better than
  // forcing timetable fallback which may show wrong destination.
  const lastResort = dirMatches.filter(d => !d.isMetroTunnel && isLikelyCityLoopTrain(d));
  if (lastResort.length > 0) return lastResort;
  // Absolute fallback: any non-Metro-Tunnel train (downstream allDepartures re-filter catches leaks)
  return dirMatches.filter(d => !d.isMetroTunnel);
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
        // v5.9.0 (T12 / N15): Terminus-station direction semantics.
        // The previous fallback re-applied the same direction filter,
        // which was a no-op — if the primary filter returned 0 it always
        // returned 0 the second time. The real problem: leg.isCitybound
        // is derived from the destName heuristic (matches a city-station
        // token or not). When home station is a terminus, ALL trains at
        // that station travel in one direction regardless of destName,
        // and the heuristic can produce a direction that disagrees with
        // the live feed.
        // Correct fallback: invert the direction and retry. If the
        // inverted direction matches live data, trust the live feed
        // over the destName heuristic. If neither direction produces a
        // match, return null as before.
        const allDir = departures.filter(d => d.isCitybound === leg.isCitybound);
        if (allDir.length > 0) {
          matchedDepartures = allDir;
        } else {
          const invertedDir = departures.filter(d => d.isCitybound === !leg.isCitybound);
          if (invertedDir.length > 0) {
            matchedDepartures = invertedDir;
            // Also correct the leg flag so the filter downstream is consistent
            leg.isCitybound = !leg.isCitybound;
          } else {
            return null;
          }
        }
      }
    }
    // No route number filtering for trains — any line in the right direction
  } else if (leg.routeNumber) {
    // For trams/buses: PREFER matching route but fall back to most-frequent route.
    const legRoute = parseInt(String(leg.routeNumber), 10);
    if (!isNaN(legRoute)) {
      const routeMatches = departures.filter(d => {
        if (!d.routeNumber) return false;
        return parseInt(String(d.routeNumber), 10) === legRoute;
      });
      if (routeMatches.length > 0) {
        matchedDepartures = routeMatches;
      }
    }
    // If route is NaN or no matches, matchedDepartures stays as ALL departures
  } else if (leg.type === 'tram' || leg.type === 'bus') {
    // No route number on leg — pick the most frequent route from departures.
    // Prevents wrong route selection when coord-proximity returns multiple routes
    // at intersections (the nearest stop may be from a different route).
    const routeCounts = {};
    for (const d of departures) {
      if (d.routeNumber) {
        routeCounts[d.routeNumber] = (routeCounts[d.routeNumber] || 0) + 1;
      }
    }
    const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0];
    if (topRoute) {
      const topRouteNum = topRoute[0];
      matchedDepartures = departures.filter(d => d.routeNumber?.toString() === topRouteNum);
      // Populate the leg route for display
      if (!leg.routeNumber) leg.routeNumber = topRouteNum;
    }
  }

  // Ensure at least 3 departures for "Next: X, Y, Z min" display.
  // When route filtering reduces to fewer than 3, supplement from the same-direction
  // departures (different routes at the same stop still indicate service frequency).
  if (matchedDepartures.length < 3 && matchedDepartures.length > 0 && departures.length >= 3) {
    const existingMs = new Set(matchedDepartures.map(d => d.departureTimeMs));
    const supplements = departures
      .filter(d => d.departureTimeMs && !existingMs.has(d.departureTimeMs) &&
        (leg.isCitybound === undefined || d.isCitybound === leg.isCitybound) &&
        // Exclude Flinders-only lines when City Loop is required — prevents
        // Sandringham/Alamein/Glen Waverley from leaking back through padding
        (!leg.requiresCityLoop || isLikelyCityLoopTrain(d)))
      .sort((a, b) => (a.departureTimeMs || 0) - (b.departureTimeMs || 0));
    for (const s of supplements) {
      if (matchedDepartures.length >= 3) break;
      matchedDepartures.push(s);
    }
    matchedDepartures.sort((a, b) => (a.departureTimeMs || 0) - (b.departureTimeMs || 0));
  }

  // Clone primary to avoid mutating shared transitData objects
  const primary = { ...matchedDepartures[0] };
  if (primary) {
    // Collect ALL departure times from matched departures AND supplement from full
    // direction-filtered feed. Ensures trains that passed City Loop filtering but
    // were missed by findMatchingDeparture's initial selection still appear.
    const depTimes = new Set();
    for (const d of matchedDepartures) {
      if (d.departureTimeMs) {
        depTimes.add(d.departureTimeMs);
      } else if (typeof d.minutes === 'number') {
        depTimes.add(nowMs + (d.minutes * 60000));
      }
    }
    // Supplement from all direction-matching departures in the raw feed
    for (const d of departures) {
      if (!d.departureTimeMs || !d.isLive) continue;
      if (leg.isCitybound !== undefined && d.isCitybound !== leg.isCitybound) continue;
      if (leg.requiresCityLoop && !isLikelyCityLoopTrain(d)) continue;
      if (leg.requiresMetroTunnel && !d.isMetroTunnel) continue;
      depTimes.add(d.departureTimeMs);
    }
    primary.allDepartureTimesMs = [...depTimes].sort((a, b) => a - b);
    // Store all departure objects for route lookup — when catchability selects a
    // departure from a different route (multi-route tram), we need to find its
    // routeNumber and lineName to update the leg title dynamically.
    // Filter allDepartures to only trains that can reach the destination.
    // This is the single-point exclusion that prevents Flinders-only lines (Sandringham,
    // Alamein, Glen Waverley) from reaching ANY downstream consumer: multi-service title,
    // lineName assignment, nextDepartures padding, and future code.
    primary.allDepartures = leg.requiresCityLoop
      ? matchedDepartures.filter(d => isLikelyCityLoopTrain(d))
      : leg.requiresMetroTunnel
        ? matchedDepartures.filter(d => d.isMetroTunnel)
        : matchedDepartures;
    // Display-facing nextDepartures from filtered departures only
    primary.nextDepartures = primary.allDepartures.slice(0, 5).map(d => d.minutes).filter(m => m !== undefined).sort((a, b) => a - b);
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
          // No route-specific matches but feed has live data for this mode.
          // Keep all departures (consistent with train path fallback) — let
          // findMatchingDeparture handle precise filtering downstream.
          // Prevents premature isTimetableEstimate when feed IS active.
          routeDepartures = departures;
        }
      }

      const hasDepartures = routeDepartures && routeDepartures.length > 0;
      const isLastService = routeDepartures && routeDepartures.length === 1;

      if (!hasDepartures) {
        // V5.6.2: Check if raw feed has GTFS-RT data for this mode.
        // If so, populate nextDepartures from the preferred route's feed departures
        // so the subtitle shows "Next: X min LIVE" instead of "Scheduled ~X min".
        const rawFeed = leg.type === 'tram' ? transitData.trams :
                       leg.type === 'bus' ? transitData.buses :
                       leg.type === 'train' ? transitData.trains : [];
        const feedHasLive = rawFeed?.some(d => d.isLive && d.source?.startsWith('gtfs-rt'));
        if (feedHasLive) {
          leg.dataSource = 'live-no-route-match';
          leg.isLive = true;
          leg.isTimetableEstimate = false;
          leg.hasLiveData = true;
          // Populate nextDepartures from preferred route in the raw feed
          const nowMs = Date.now();
          const prefRoute = leg.routeNumber;
          const liveDeps = rawFeed.filter(d =>
            d.isLive && d.departureTimeMs && d.departureTimeMs > nowMs &&
            (!prefRoute || !d.routeNumber || d.routeNumber.toString() === prefRoute.toString())
          ).sort((a, b) => a.departureTimeMs - b.departureTimeMs);
          if (liveDeps.length > 0) {
            leg.nextDepartures = liveDeps.slice(0, 3).map(d => Math.round((d.departureTimeMs - nowMs) / 60000));
            leg.nextDepartureTimesMs = liveDeps.slice(0, 3).map(d => d.departureTimeMs);
          }
        } else {
          leg.dataSource = 'timetable';
          leg.isLive = false;
          leg.isTimetableEstimate = true;
          removedTypes.push(leg.type);
        }
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

    // Check format — return JSON if requested, otherwise render PNG
    const format = req.query?.format;
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).json({ success: true, random: true, ...dashboardData });
    }

    // Render using V13 renderer
    const pngBuffer = await renderFullDashboard(dashboardData);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (options.setupPending) res.setHeader('X-Setup-Pending', 'true');
    res.send(pngBuffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

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
      status: req.query?.status,  // normal, delayed, disruption, suspended, diversion
      weather: req.query?.weather  // auto, sunny, cloudy, rain, storm
    };
    const hasSimOverrides = Object.values(simOverrides).some(v => v);

    // Initialize engine and get route (need state before time formatting)
    // Issue 1: Wrap engine invocation in try/catch to prevent crash on tight constraints
    // v5.9.8 (DD1 + DD4): pass a freshness diagnostic object into getEngine
    // so the home coord drift-check source is captured and later surfaced
    // on `_liveDataDiag.homeCoordFreshness`.
    let engine, route, locations, config;
    const homeCoordFreshnessDiag = {};
    try {
      engine = await getEngine(homeCoordFreshnessDiag);
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
    const now = getMelbourneTime();
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
    let detectedTramRoutes = [];
    let stopDetectionSource = null;

    if (homeCoords || homeAddress) {
      const detected = detectStopIdsFromAddress(homeAddress, homeCoords, userState);
      stopDetectionSource = detected?.source || null;
      trainStopId = detected.trainStopId || null;
      tramStopId = detected.tramStopId || null;
      busStopId = detected.busStopId || null;
      ferryStopId = detected.ferryStopId || null;
      detectedTramRoute = detected.tramRouteNumber || null;
      // All tram routes with stops near user (for intersection disambiguation)
      detectedTramRoutes = detected.tramRoutes || [];
    }

    // Journey-context tram route filtering: at intersections, multiple routes have
    // stops nearby. Filter to routes that ALSO serve the destination station area.
    // A route that only passes through the home intersection but doesn't go near
    // the station is not the user's commute route. Uses 1km radius around station
    // to account for the walk between tram stop and station.
    if (detectedTramRoutes.length > 1 && trainStopId && homeCoords) {
      const station = VIC_METRO_STATIONS[trainStopId];
      if (station?.lat && station?.lon) {
        const stationNearby = findNearestStops(station.lat, station.lon, { radiusMeters: 1000 });
        const stationRouteSet = new Set(
          (stationNearby.tramRoutes || []).map(t => t.routeNumber).filter(Boolean)
        );
        if (stationRouteSet.size > 0) {
          const journeyRoutes = detectedTramRoutes.filter(r => stationRouteSet.has(r));
          if (journeyRoutes.length > 0) {
            detectedTramRoutes = journeyRoutes;
            detectedTramRoute = journeyRoutes[0];
          }
        }
      }
    }

    // Honour explicit user-configured stop IDs from Transit Stop IDs section.
    // Coordinate detection picks the physically closest stop, but user may
    // deliberately choose a different station when the distance difference
    // is marginal. User intent takes priority over auto-detection.
    if (kvPrefs?.trainStopId && kvPrefs.trainStopId !== trainStopId) {
      trainStopId = kvPrefs.trainStopId;
      stopDetectionSource = 'user-configured';
    } else if (!trainStopId) {
      trainStopId = kvPrefs?.trainStopId || null;
    }
    if (kvPrefs?.tramStopId && kvPrefs.tramStopId !== tramStopId) {
      tramStopId = kvPrefs.tramStopId;
      if (!stopDetectionSource) stopDetectionSource = 'user-configured';
    } else if (!tramStopId) {
      tramStopId = kvPrefs?.tramStopId || null;
    }
    if (!busStopId) busStopId = kvPrefs?.busStopId || null;
    if (!ferryStopId) ferryStopId = kvPrefs?.ferryStopId || null;
    if (!stopDetectionSource && (trainStopId || tramStopId)) stopDetectionSource = 'stored';

    // Apply user station overrides from admin panel (persistent Redis preferences)
    // Admin saves overrides keyed by transit-leg index (e.g. train_1, tram_0),
    // so we search all entries by type rather than assuming a fixed key.
    let stationOverrides = {};
    try { stationOverrides = await getStationOverrides() || {}; } catch (e) {}
    const findOverride = (type) => Object.values(stationOverrides).find(o => o?.type === type);

    // v5.8.2 (C4-gate): Distance gate. An override whose resolved stop is more
    // than 5 km from the current home coordinates is almost certainly stale
    // from a previous address. Ignore it and fall through to auto-detection.
    // This is defence-in-depth against C4 override trap even when the KV clear
    // in api/admin/preferences.js hasn't propagated yet. Unknown stop IDs pass
    // through the gate (default-allow) to avoid blocking legitimate overrides
    // that use stop IDs outside our 6014-stop dataset.
    const OVERRIDE_MAX_KM = 5;
    const homeLatForGate = locations?.home?.lat;
    const homeLonForGate = locations?.home?.lon;
    const overrideIsNearHome = (override) => {
      if (!override?.id) return false;
      if (homeLatForGate == null || homeLonForGate == null) return true;
      const stopInfo = getStopCoordsById(override.id);
      if (!stopInfo?.lat || !stopInfo?.lon) return true;
      const km = haversine(homeLatForGate, homeLonForGate, stopInfo.lat, stopInfo.lon) / 1000;
      return km <= OVERRIDE_MAX_KM;
    };

    const rawTrainOverride = findOverride('train');
    const rawTramOverride = findOverride('tram');
    const rawBusOverride = findOverride('bus');
    const trainOverride = overrideIsNearHome(rawTrainOverride) ? rawTrainOverride : null;
    const tramOverride = overrideIsNearHome(rawTramOverride) ? rawTramOverride : null;
    const busOverride = overrideIsNearHome(rawBusOverride) ? rawBusOverride : null;
    const tramRouteOverride = tramOverride?.routeNumber ? String(tramOverride.routeNumber) : null;

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

    // v5.9.6 (BB1): Resolve the train override's representative coordinates
    // and the closest tram stop to those coordinates. These values cascade
    // through the leg-patch block below so that walk-leg durations, walk-leg
    // titles, and the tram alighting stop all honour the override consistently.
    // Pre-v5.9.6 behaviour patched only the name fields, leaving walk
    // durations computed against the stale home-nearest train station
    // coordinates. See DEVELOPMENT-RULES.md §23.15 "Station override cascade
    // invariant" for the full rule. Turnkey across every VIC metro station
    // present in VIC_METRO_STATIONS — no hardcoded codes or names.
    const trainOverrideCoords = trainOverride?.id
      ? lookupMetroStationCoords(trainOverride.id)
      : null;
    const nearestTramStopToOverride = trainOverrideCoords
      ? findNearestTramStopNearCoords(trainOverrideCoords.lat, trainOverrideCoords.lon, { maxRadiusMetres: 800 })
      : null;

    // Apply station override names to route template legs for correct display
    // Route templates use coordinate-based nearest stations, but user may have
    // explicitly selected a different station via Station Preferences
    if (route?.legs && (trainOverride?.id || tramOverride?.id)) {
      const overrideTrainName = trainOverride?.name || getStopNameById(trainStopId);
      const overrideTramName = tramOverride?.name || getStopNameById(tramStopId);
      // v5.9.6 (BB1): walking speed constant per DEVELOPMENT-RULES §23.13
      // allowlist — Victorian DoT default, used only for re-computing walk
      // legs after an override coordinate cascade. No route-specific tuning.
      const WALK_SPEED_M_PER_MIN = 80;

      // Deep-copy legs to avoid mutating engine's cached route objects
      const patchedLegs = route.legs.map(leg => {
        const l = { ...leg };
        if (l.origin) l.origin = { ...l.origin };
        if (l.destination) l.destination = { ...l.destination };

        if (l.type === 'train' && overrideTrainName) {
          if (l.origin) l.origin.name = overrideTrainName;
          l.originStation = overrideTrainName;
          // v5.9.6 (BB1): honour override coordinates on the train leg's
          // origin so downstream walk-leg recomputation uses the correct
          // target. Preserve existing origin shape when coords absent.
          if (trainOverrideCoords && l.origin) {
            l.origin.lat = trainOverrideCoords.lat;
            l.origin.lon = trainOverrideCoords.lon;
          }
        }
        if (l.type === 'tram') {
          if (overrideTramName && l.origin) l.origin.name = overrideTramName;
          // Tram destination in multi-modal routes: show transfer AREA, not train station name.
          // v5.9.6 (BB1): when a train-side override is active, re-select the
          // tram alighting stop to the closest tram stop to the override's
          // coordinates. The original "show train station area" label stays
          // consistent — the tram destination name is the stripped station
          // name — but the underlying alighting coordinates and stop ID are
          // updated so the subsequent walk leg is measured accurately.
          if (overrideTrainName && l.destination) {
            l.destination.name = overrideTrainName.replace(/\s+Station$/i, '');
          }
          if (nearestTramStopToOverride && l.destination) {
            l.destination.id = nearestTramStopToOverride.id;
            l.destination.lat = nearestTramStopToOverride.lat;
            l.destination.lon = nearestTramStopToOverride.lon;
          }
        }
        if (l.type === 'walk') {
          if (l.to === 'tram stop' && overrideTramName) l.stopName = overrideTramName;
          if ((l.to === 'train platform' || l.to === 'station') && overrideTrainName) {
            l.stationName = overrideTrainName;
          }
        }
        return l;
      });

      // v5.9.6 (BB1): second pass — now that leg origins/destinations have
      // been patched with override coordinates, re-compute walk-leg
      // durations and titles where the walk borders a train-override'd
      // transit leg. This fixes:
      //   - Bug A: walk-leg title stale after override (walks between tram
      //     and train still showed the old station name)
      //   - Bug B: walk-leg duration not recalculated from the override
      //     coordinates (user saw "10 min walk to auto-detected station"
      //     instead of the real distance to the overridden station)
      // The recomputation uses the named walking-speed constant per §23.13.
      if (trainOverrideCoords) {
        for (let i = 0; i < patchedLegs.length; i++) {
          const leg = patchedLegs[i];
          if (leg.type !== 'walk') continue;
          const nextLeg = patchedLegs[i + 1];
          const prevLeg = patchedLegs[i - 1];

          // Walk leg immediately preceding a train leg: terminates at the
          // train station. Recompute from walk-origin to train override.
          if (nextLeg?.type === 'train') {
            // Effective walk origin: if the walk follows a tram leg and the
            // tram's alighting coordinates have been updated to the
            // nearest-to-override stop, use those coordinates. Otherwise
            // fall back to the walk leg's stored origin.
            let originLat = leg.origin?.lat;
            let originLon = leg.origin?.lon;
            if (prevLeg?.type === 'tram' && nearestTramStopToOverride) {
              originLat = nearestTramStopToOverride.lat;
              originLon = nearestTramStopToOverride.lon;
            }
            if (originLat != null && originLon != null) {
              const metres = haversine(originLat, originLon, trainOverrideCoords.lat, trainOverrideCoords.lon);
              const mins = Math.max(1, Math.ceil(metres / WALK_SPEED_M_PER_MIN));
              leg.minutes = mins;
              leg.durationMinutes = mins;
              leg.subtitle = `${mins} min walk`;
            }
            // Update title to the override's station name unconditionally
            if (overrideTrainName) {
              leg.title = `Walk to ${overrideTrainName}`;
              leg.stationName = overrideTrainName;
              leg.destinationName = overrideTrainName;
              if (leg.destination) {
                leg.destination = {
                  ...leg.destination,
                  name: overrideTrainName,
                  lat: trainOverrideCoords.lat,
                  lon: trainOverrideCoords.lon
                };
              }
            }
          }

          // Walk leg immediately following a train leg: originates at the
          // train station. Recompute from train override to walk destination.
          if (prevLeg?.type === 'train') {
            const destLat = leg.destination?.lat;
            const destLon = leg.destination?.lon;
            if (destLat != null && destLon != null) {
              const metres = haversine(trainOverrideCoords.lat, trainOverrideCoords.lon, destLat, destLon);
              const mins = Math.max(1, Math.ceil(metres / WALK_SPEED_M_PER_MIN));
              leg.minutes = mins;
              leg.durationMinutes = mins;
              leg.subtitle = `${mins} min walk`;
            }
          }
        }
      }

      route = { ...route, legs: patchedLegs };
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

    // v5.9.1 (U4): One-off stale-preference wipe migration.
    // v5.9.0's T2 live-gated invalidation was not sufficient to clear the
    // stale preferredTramRoute values that accumulated during testing: the
    // coord-proximity search at 300m returned live departures for the stale
    // route (at some nearby parallel-street stop), so `hasLiveForRoute`
    // passed and the stale value survived. This one-shot wipe clears every
    // preference key the first time a v5.9.1+ request runs, then sets a
    // marker so subsequent requests skip the block. Users observe a single
    // re-detection on their next dashboard load.
    try {
      const migrationDone = await getV591MigrationDone().catch(() => false);
      if (!migrationDone) {
        await Promise.all([
          setPreferredTramRoute(null),
          setPreferredTramStop(null),
          setPreferredTrainLine(null),
          setPreferredTrainStation(null)
        ]);
        await setV591MigrationDone();
      }
    } catch (migrationErr) {
      // Non-fatal — if the migration write fails, subsequent requests will
      // retry. Do not block the API request on a migration failure.
    }

    // v5.9.4 (Z3): One-off tram-preference wipe migration.
    // v5.9.3 shipped a naive KV write-once guard that only checked whether
    // the stored preference was empty. On a cold-start request where the
    // feed had no stop-level match for the user's tram stop (e.g. the first
    // request immediately after a deploy), the cascade fell through to the
    // route-level heuristic tier, the frequency-detection branch picked a
    // non-stop-level winner, and the guard persisted that value to an
    // empty KV. Any value already stored by a v5.9.3 deploy is therefore
    // suspect and must be cleared once. The v5.9.4 corrective guard
    // (Z2) prevents recurrence by also gating on stop-level confidence.
    // Only the tram keys are wiped — train preferences were not affected
    // and user-controlled station overrides are preserved.
    try {
      const v594MigrationDone = await getV594MigrationDone().catch(() => false);
      if (!v594MigrationDone) {
        await Promise.all([
          setPreferredTramRoute(null),
          setPreferredTramStop(null)
        ]);
        await setV594MigrationDone();
      }
    } catch (v594MigrationErr) {
      // Non-fatal — if the migration write fails, subsequent requests will
      // retry. Do not block the API request on a migration failure.
    }

    // v5.9.6 (BB4): One-off train-preference wipe migration. Symmetric
    // with v5.9.4 Z3 but for train keys. The v5.9.0-through-v5.9.5 train
    // cascade wrote `cc:preferred_train_line` / `cc:preferred_train_station`
    // whenever a dominant-line count existed in the live feed, with no
    // stop-level source gate. Any previously-stored train preference is
    // therefore suspect — it may have been persisted from a broad-fallback
    // (`gtfs-rt-broad`) or route-level dominant-line count that does not
    // reflect a true stop-level match. Live v5.9.5 station-override verification
    // confirmed the stored `preferredTrainLine` diverged from the displayed
    // line, indicating KV drift. On first v5.9.6+ request, wipe the two
    // train keys and set the v596 migration flag. The v5.9.6 BB3 stop-level
    // gate in the train cascade prevents recurrence. Only train keys are
    // wiped; tram keys are already guarded by v5.9.4 Z2 and station
    // overrides are preserved.
    try {
      const v596MigrationDone = await getV596MigrationDone().catch(() => false);
      if (!v596MigrationDone) {
        await Promise.all([
          setPreferredTrainLine(null),
          setPreferredTrainStation(null)
        ]);
        await setV596MigrationDone();
      }
    } catch (v596MigrationErr) {
      // Non-fatal — subsequent requests retry. Do not block the API request.
    }

    // Load preferred tram route for consistent display (pinned by user)
    let preferredTramRoute = null;
    try { preferredTramRoute = await getPreferredTramRoute(); } catch (e) {}
    // v5.9.0 (T2 / B2): Strengthened invalidation. A preferredTramRoute is
    // only meaningful when paired with a preferredTramStop at the SAME stop
    // the engine is currently using. Any of the following make it stale:
    //   (a) no storedTramStop paired with the route (e.g. set by a legacy
    //       path that never paired the stop)
    //   (b) storedTramStop differs from the current engine tramStopId
    //   (c) storedTramStop present but current tramStopId is null
    // In any of these cases, drop the preference AND wipe the KV entry so
    // the next API call runs a clean detection pass.
    const storedTramStop = await getPreferredTramStop().catch(() => null);
    const prefRouteIsStale = preferredTramRoute && (
      !storedTramStop ||
      !tramStopId ||
      String(storedTramStop) !== String(tramStopId)
    );
    if (prefRouteIsStale) {
      preferredTramRoute = null;
      setPreferredTramRoute(null).catch(() => {});
      setPreferredTramStop(null).catch(() => {});
    }

    // v5.9.0 (T6 / B8): Preferred train line stability lock.
    // Mirrors the tram lock. The train leg title flipped between the detected line name
    // and a generic "Train" label on consecutive renders because there was no
    // equivalent train-line cache. The lock stores { line, station } in KV
    // and is invalidated using the same staleness rules as the tram lock.
    let preferredTrainLine = null;
    try { preferredTrainLine = await getPreferredTrainLine(); } catch (e) {}
    const storedTrainStation = await getPreferredTrainStation().catch(() => null);
    const prefLineIsStale = preferredTrainLine && (
      !storedTrainStation ||
      !trainStopId ||
      String(storedTrainStation) !== String(trainStopId)
    );
    if (prefLineIsStale) {
      preferredTrainLine = null;
      setPreferredTrainLine(null).catch(() => {});
      setPreferredTrainStation(null).catch(() => {});
    }

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

    // v5.9.1 (U9 / Section 1.1): Removed console.log diagnostic lines.
    // The previous line that logged `apiKeyStr.substring(0, 8)` was a
    // partial API key leak to Vercel request logs — SECURITY VIOLATION.
    // Equivalent diagnostics are now written to the structured KV log
    // via setDeviceStatus where they stay scoped to the operator's own
    // KV namespace instead of the Vercel log stream.
    try {
      if (typeof setDeviceStatus === 'function') {
        setDeviceStatus({
          apiKeyPresent: !!apiKeyStr,
          cafeMode,
          isTomorrowCommute: earlyIsTomorrowCommute,
          skipLiveData
        }).catch(() => {});
      }
    } catch (e) { /* non-fatal */ }

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
    // V5.6.6: Direction filtering targets the next journey leg's transit stop (train boarding
    // station), not the final work destination. Using the station coordinates is geometrically
    // tighter (the tram must reach THAT station, not Collins St) and semantically correct per
    // journey leg. Falls back to work coords when no metro station coordinates are available.
    const nextLegStopCoords = VIC_METRO_STATIONS?.[trainStopId] || null;
    if (nextLegStopCoords?.lat) {
      tramApiOptions.destLat = nextLegStopCoords.lat;
      tramApiOptions.destLon = nextLegStopCoords.lon;
    } else if (locations.work?.lat) {
      tramApiOptions.destLat = locations.work.lat;
      tramApiOptions.destLon = locations.work.lon;
    }
    // V5.4.8: Route number for coord-proximity 500m radius + route filter.
    // Only use route engine or user preference — auto-detected route from nearest stop
    // is unreliable at intersections (picks wrong route, e.g. 129 instead of 58).
    // Live detection runs first — preferredTramRoute is fallback ONLY when live finds nothing.
    // Previous approach used preferredTramRoute immediately, blocking live route correction.
    const tramRouteNum = tramLeg?.routeNumber || null;
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
        tramStopId = matchingEntry[0];
      }
    }

    // V5.5.2 + v5.9.8 (DD2): Use the locked tram stop's actual coordinates
    // for the cascade target-coord comparison. The stored home coord may be
    // 100+ m from the boarding stop when the user walks to a tram stop that
    // is not the nearest-by-absolute-distance, so the identity-tier 40 m
    // radius misses every feed stop if the cascade target is left at
    // homeCoords. The stop's own coordinates from the static dataset are
    // accurate. The v5.9.8 DD2 hardening adds:
    //   1. Structured telemetry on every path so the admin panel and
    //      post-deploy verification can distinguish "lookup succeeded" from
    //      "lookup silently failed and we kept homeCoords".
    //   2. A nearest-stop-helper fallback (v5.9.6 BB1's
    //      findNearestTramStopNearCoords) when the exact-id dataset lookup
    //      fails — the target then becomes the coord of the nearest tram
    //      stop to the fresh-corrected home coord, which is a better
    //      approximation than homeCoords for the cascade comparison.
    //   3. A last-resort fallback that preserves existing behaviour (use
    //      homeCoords) while emitting a distinct telemetry reason so the
    //      difference between "we tried" and "we didn't try" is visible.
    const tramStopCoordOverrideDiag = {
      attempted: false,
      tramStopId: tramStopId ? String(tramStopId) : null,
      resolved: false,
      fallbackUsed: null,
      resolvedLat: null,
      resolvedLon: null
    };
    if (tramStopId && VIC_TRAM_STOPS_WITH_COORDS) {
      tramStopCoordOverrideDiag.attempted = true;
      const tid = String(tramStopId);
      const tramStopRef = VIC_TRAM_STOPS_WITH_COORDS.find(s => {
        const sid = String(s.id);
        return sid === tid || sid === (tid.match(/(\d+)$/)?.[1]);
      });
      if (tramStopRef) {
        tramApiOptions.lat = tramStopRef.lat;
        tramApiOptions.lon = tramStopRef.lon;
        tramStopCoordOverrideDiag.resolved = true;
        tramStopCoordOverrideDiag.resolvedLat = Number(tramStopRef.lat.toFixed(6));
        tramStopCoordOverrideDiag.resolvedLon = Number(tramStopRef.lon.toFixed(6));
      } else if (homeCoords?.lat && homeCoords?.lon) {
        // Exact-id lookup failed. Fall back to nearest-tram-stop-by-coord
        // from the (fresh-corrected) home coord so the cascade target is at
        // least on a real tram stop rather than an arbitrary residential
        // coordinate.
        try {
          const nearby = findNearestTramStopNearCoords(homeCoords.lat, homeCoords.lon, { radiusMeters: 1000 });
          if (nearby?.lat && nearby?.lon) {
            tramApiOptions.lat = nearby.lat;
            tramApiOptions.lon = nearby.lon;
            tramStopCoordOverrideDiag.fallbackUsed = 'nearest-stop-helper';
            tramStopCoordOverrideDiag.resolvedLat = Number(nearby.lat.toFixed(6));
            tramStopCoordOverrideDiag.resolvedLon = Number(nearby.lon.toFixed(6));
          } else {
            tramStopCoordOverrideDiag.fallbackUsed = 'home-coords-last-resort';
            tramStopCoordOverrideDiag.resolvedLat = Number(homeCoords.lat.toFixed(6));
            tramStopCoordOverrideDiag.resolvedLon = Number(homeCoords.lon.toFixed(6));
          }
        } catch (_e) {
          tramStopCoordOverrideDiag.fallbackUsed = 'home-coords-last-resort';
        }
      } else {
        tramStopCoordOverrideDiag.fallbackUsed = 'no-home-coords-available';
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

    // V5.6.9: Removed redundant requiresCityLoop/requiresMetroTunnel check here.
    // This ran AFTER buildJourneyLegs() and could not influence findMatchingDeparture().
    // The check now lives inside buildJourneyLegs() after destination name resolution,
    // BEFORE findMatchingDeparture() runs — see V5.6.9 block near line 462.

    // V5.6.5: Admin-configured route override takes absolute priority over KV auto-detection.
    // KV auto-detection can lock to the wrong route when coord-proximity finds routes from
    // nearby parallel streets. Admin override allows user to explicitly pin the correct service.
    // When no admin override is set, falls back to KV auto-detected route (Fix 18 behaviour).
    const effectiveTramRoute = tramRouteOverride || preferredTramRoute;
    if (effectiveTramRoute) {
      tramApiOptions.routeNumber = effectiveTramRoute;
    }
    // Sync KV to admin override when set — prevents stale auto-detected KV from conflicting
    if (tramRouteOverride && tramRouteOverride !== preferredTramRoute) {
      setPreferredTramRoute(tramRouteOverride).catch(() => {});
      setPreferredTramStop(tramStopId).catch(() => {});
      preferredTramRoute = tramRouteOverride;
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

    // v5.9.0 (T6 / B8): Train-line stability lock — apply after train fetch.
    // Priority cascade (mirrors the tram lock at lines ~3260+ but simpler
    // because trains don't have the multi-route-at-intersection problem):
    //   P1: live-detected dominant line at the current trainStopId
    //   P2: preferredTrainLine from KV (only if live data contains at least
    //       one matching departure on that line at the current station)
    //   P3: trainLeg.lineName as it was set by the route engine
    //   P4: null (buildLegTitle falls back to generic "Train")
    //
    // v5.9.6 (BB3): TRAIN CASCADE STOP-LEVEL GATE. Mirror the v5.9.4 Z2
    // tram gate for train KV writes. A dominant-line winner is only
    // persisted to KV when at least one of its departures has a source
    // in the stop-level set. Broad-fallback (`gtfs-rt-broad`) and route-
    // level (`gtfs-rt-route`) matches MAY drive the current request's
    // displayed line but MUST NOT touch KV — otherwise a cold-start
    // cycle where the exact-stop feed has no entries can poison
    // `cc:preferred_train_line` with a line that isn't actually at the
    // user's station. This closes Bug E from the v5.9.5 station-override
    // verification and mirrors the v5.9.4 Z2 tram gate semantics.
    // See DEVELOPMENT-RULES.md §23.15 "Train cascade stop-level gate".
    const TRAIN_STOP_LEVEL_SOURCES = new Set([
      'gtfs-rt',              // exact stop-id match via matchesStopId
      'gtfs-rt-scan',         // lenient trailing-numeric scan
      'gtfs-rt-coord-identity' // coord-identity bridge (tram-side, kept for symmetry)
    ]);
    if (trainStopId && trains && trains.length > 0) {
      const liveLineCounts = {};
      for (const t of trains) {
        const ln = t.lineName || t.destination;
        if (ln && t.isLive) liveLineCounts[ln] = (liveLineCounts[ln] || 0) + 1;
      }
      const liveEntries = Object.entries(liveLineCounts).sort((a, b) => b[1] - a[1]);
      const dominantLiveLine = liveEntries[0]?.[0] || null;

      // v5.9.6 (BB3): check whether the dominant live line is backed by a
      // stop-level source before permitting the KV write. Equivalent to
      // the tram Z2 `bestIsStopLevel` computation.
      let dominantLineIsStopLevel = false;
      if (dominantLiveLine) {
        dominantLineIsStopLevel = trains.some(t =>
          t.isLive &&
          (t.lineName === dominantLiveLine || t.destination === dominantLiveLine) &&
          TRAIN_STOP_LEVEL_SOURCES.has(t.source)
        );
      }

      let selectedTrainLine = null;
      if (dominantLiveLine) {
        selectedTrainLine = dominantLiveLine;
        // v5.9.6 (BB3): only persist when backed by a stop-level source
        // AND the KV was empty entering this request. Symmetric with
        // v5.9.4 Z2 tram write-once gate.
        if (!preferredTrainLine && dominantLineIsStopLevel) {
          setPreferredTrainLine(dominantLiveLine).catch(() => {});
          setPreferredTrainStation(trainStopId).catch(() => {});
          preferredTrainLine = dominantLiveLine;
        }
      } else if (preferredTrainLine) {
        // Only trust the stored lock if it still appears in live data
        const lockHasData = trains.some(t => t.isLive && (t.lineName === preferredTrainLine || t.destination === preferredTrainLine));
        if (lockHasData) selectedTrainLine = preferredTrainLine;
      }
      if (selectedTrainLine && trainLeg) {
        // v5.9.0: Line-station validation. When the route engine set a line
        // name that doesn't match ANY live departure at the detected station,
        // override it with the actual dominant line. This prevents mismatches
        // when the station changes (e.g. address change detects a station on
        // a different line group) but the engine still holds a stale line.
        if (trainLeg.lineName && trainLeg.lineName !== selectedTrainLine) {
          const engineLineHasDepartures = trains.some(t =>
            t.isLive && (t.lineName === trainLeg.lineName || t.destination === trainLeg.lineName)
          );
          if (!engineLineHasDepartures) {
            trainLeg.lineName = selectedTrainLine;
          }
        } else if (!trainLeg.lineName) {
          trainLeg.lineName = selectedTrainLine;
        }
      }
      // v5.10.1: Destination reachability validation. The selected train line
      // must serve the WORK-SIDE station (alighting point), not just the
      // boarding station. Lines in FLINDERS_ONLY_LINE_CODES terminate before
      // the City Loop and cannot reach City Loop stations.
      const CITY_LOOP_STATION_CODES = new Set(['PAR', 'MCE', 'FGS']);
      const workRequiresCityLoop = CITY_LOOP_STATION_CODES.has(workTrainStopId);
      if (workRequiresCityLoop && selectedTrainLine && trainLeg) {
        const selCode = Object.entries(METRO_LINE_NAMES)
          .find(([, name]) => name === selectedTrainLine)?.[0];
        if (selCode && FLINDERS_ONLY_LINE_CODES.has(selCode)) {
          const reachableDeps = trains.filter(t => {
            if (!t.isLive) return false;
            const dc = Object.entries(METRO_LINE_NAMES)
              .find(([, n]) => n === t.lineName || n === t.destination)?.[0];
            return dc && !FLINDERS_ONLY_LINE_CODES.has(dc);
          });
          if (reachableDeps.length > 0) {
            const counts = {};
            for (const t of reachableDeps) {
              const ln = t.lineName || t.destination;
              if (ln) counts[ln] = (counts[ln] || 0) + 1;
            }
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            selectedTrainLine = best[0]?.[0] || selectedTrainLine;
            trainLeg.lineName = selectedTrainLine;
          } else {
            // No departures reach City Loop — use the shared terminus
            const fallback = getStopNameById('FSS') || VIC_METRO_STATIONS.FSS?.name || 'City';
            const dest = fallback.replace(/\s+Station$/i, '');
            if (trainLeg.destination) trainLeg.destination.name = dest;
            trainLeg.destinationName = dest;
          }
        }
      }
    } else if (trainLeg && !trainLeg.lineName && preferredTrainLine) {
      trainLeg.lineName = preferredTrainLine;
    }

    // V5.5.18: Detect City Loop disruption from service alerts.
    // V5.6.1: Hoisted to outer scope so buildJourneyLegs can use it for timetable fallback.
    const cityLoopClosed = userState === 'VIC' && disruptions.length > 0 && disruptions.some(d => {
      const desc = (d.description || '').toLowerCase();
      const header = (d.headerText || d.title || '').toLowerCase();
      const text = desc + ' ' + header;
      return (text.includes('not via the city loop') ||
              text.includes('direct to flinders') ||
              text.includes('not via city loop'));
    });
    // Apply City Loop disruption overrides to live train departures.
    if (cityLoopClosed && trains.length > 0) {
      for (const dep of trains) {
        if (dep.isCitybound && dep.passesCityLoop && !dep.isMetroTunnel) {
          dep.passesCityLoop = false;
          dep.destination = 'Flinders Street Station';
          dep._cityLoopOverride = true;
        }
      }
    }

    // V5.5.0: Extract tram route number from live departures when not already known.
    // Prevents title flipping between "Route 58" (live) and "Tram" (scheduled fallback).
    // With feed caching, scheduled fallback is rare — but this ensures route name
    // persists even when the cached feed expires and a fresh fetch temporarily fails.
    // Tram route selection: frequency-based from detected routes.
    // At intersections, multiple routes have stops within metres — nearest-stop is
    // unreliable (flips between routes on every refresh). Instead, count live departures
    // per route from ALL routes detected near the user's coordinates. The route with
    // the most departures is the user's primary service. This is stable because departure
    // count is a service characteristic, not a distance measurement.
    if (trams.length > 0) {
      let selectedRoute = null;
      let selectionBranch = null;
      // v5.9.0 (T2 / B1) + v5.9.1 (U7 / CR-4): Priority cascade for tram route
      // selection with stop-level preference.
      //
      // The v5.8.2 authority short-circuit (`tramRouteOverride || preferredTramRoute`)
      // trusted stored state WITHOUT verifying the stored route had live departures
      // at the CURRENT stop. v5.9.0 added a live-departure gate — necessary but not
      // sufficient, because the coord-proximity fallback search returns departures
      // for routes that only pass NEAR the stop (via parallel streets) but do not
      // actually serve it per the GTFS static data.
      //
      // v5.9.1 tightens the gate: routes with at least one STOP-LEVEL match
      // (source is 'gtfs-rt' or 'gtfs-rt-route' — the exact stop_id appeared
      // in the trip's stop_time_update list) are always preferred over routes
      // that only appear via 'gtfs-rt-coord'. A stop-level match is direct
      // evidence from the live feed that the route actually serves the stop;
      // a coord-proximity-only match is circumstantial. When BOTH kinds exist,
      // the stop-level routes win. When NEITHER kind is available (stop-level
      // feed data absent for the user's stop), we fall back to the v5.9.0
      // behaviour and note the low-confidence state in _liveDataDiag.
      //
      // Cascade:
      //   P1: tramRouteOverride (admin) — wins only if live data has a
      //       stop-level match, OR if no stop-level matches exist for any
      //       route at this stop (cannot be stricter than the data allows).
      //   P2: preferredTramRoute (KV) — same rule as P1.
      //   P3: Frequency-detected among routes with stop-level matches.
      //   P4: Frequency-detected among detectedTramRoutes (any source).
      //   P5: Engine-planned route if live data present.
      //   P6: Feed-majority last resort.
      // v5.9.2 (X4): coord-identity is a high-confidence stop-level source
      // because a coordinate match within the named identity radius is
      // deterministic "same physical stop, different feed ID". Added to the
      // stop-level set alongside the exact-id and lenient-scan sources.
      // Coord-proximity (300 m) remains EXCLUDED because its 300 m radius
      // catches parallel-street routes.
      //
      // v5.9.3 (Y2): 'gtfs-rt-route' REMOVED from the stop-level set.
      // processRouteLevelDepartures is a median-stop heuristic used when the
      // exact stop ID is absent from a trip's sequence — its timing error is
      // 10–20 min (see opendata-client.js comments at processRouteLevelDepartures).
      // Treating it as stop-level evidence caused frequency detection in v5.9.2
      // to misidentify heuristic matches as confirmed identity, which in turn
      // let transient cascade failures overwrite a previously-correct KV entry.
      // Route-level is now correctly classified as coord-tier confidence.
      const STOP_LEVEL_SOURCES = new Set(['gtfs-rt', 'gtfs-rt-scan', 'gtfs-rt-broad', 'gtfs-rt-coord-identity']);
      const hasLiveForRoute = (rn) => trams.some(t => t.isLive && t.routeNumber?.toString() === rn.toString());
      const hasStopLevelForRoute = (rn) => trams.some(t =>
        t.isLive &&
        t.routeNumber?.toString() === rn.toString() &&
        STOP_LEVEL_SOURCES.has(t.source)
      );
      const anyStopLevelInFeed = trams.some(t => t.isLive && STOP_LEVEL_SOURCES.has(t.source));
      // When no stop-level matches exist at all, the whole feed is coord-
      // proximity-based, which means we cannot enforce the stronger gate.
      // In that case preferStopLevel is false and the cascade falls back to
      // the v5.9.0 behaviour.
      const preferStopLevel = anyStopLevelInFeed;
      const passesGate = (rn) => preferStopLevel ? hasStopLevelForRoute(rn) : hasLiveForRoute(rn);

      if (tramRouteOverride && passesGate(tramRouteOverride)) {
        selectedRoute = tramRouteOverride;
        selectionBranch = preferStopLevel ? 'admin-override-stop-level' : 'admin-override-coord';
      }
      if (!selectedRoute && preferredTramRoute && passesGate(preferredTramRoute)) {
        selectedRoute = preferredTramRoute;
        selectionBranch = preferStopLevel ? 'kv-preferred-stop-level' : 'kv-preferred-coord';
      }
      if (!selectedRoute && detectedTramRoutes.length > 0) {
        // U7: frequency detection across detectedTramRoutes, prioritising
        // routes with stop-level matches when available.
        let bestRoute = null;
        let bestCount = 0;
        let bestIsStopLevel = false;
        for (const route of detectedTramRoutes) {
          const stopLevelCount = trams.filter(t =>
            t.isLive &&
            t.routeNumber?.toString() === route.toString() &&
            STOP_LEVEL_SOURCES.has(t.source)
          ).length;
          const totalCount = trams.filter(t => t.isLive && t.routeNumber?.toString() === route.toString()).length;
          // Prefer stop-level matches outright when they exist
          if (stopLevelCount > 0 && !bestIsStopLevel) {
            bestRoute = route;
            bestCount = stopLevelCount;
            bestIsStopLevel = true;
          } else if (stopLevelCount > 0 && stopLevelCount > bestCount) {
            bestRoute = route;
            bestCount = stopLevelCount;
            bestIsStopLevel = true;
          } else if (!bestIsStopLevel && totalCount > bestCount) {
            bestRoute = route;
            bestCount = totalCount;
          }
        }
        if (bestRoute) {
          selectedRoute = bestRoute;
          selectionBranch = bestIsStopLevel ? 'frequency-detected-stop-level' : 'frequency-detected-coord';
          // v5.9.3 (Y3): KV WRITE-ONCE GUARD.
          // Only persist the frequency-detected route to KV when the KV was
          // empty entering this request. Once populated, the stored preference
          // MUST NOT be overwritten by subsequent frequency-detection runs —
          // a transient single-cycle cascade failure (e.g. identity tier
          // temporarily failing because the feed refreshed between stops)
          // must not permanently corrupt the stored state.
          //
          // The stored KV value legitimately changes only via:
          //   - v5.8.2 C4-clear in api/admin/preferences.js on address change
          //   - v5.9.1 U4 one-off migration wipe (consumed)
          //   - Explicit admin override via setStationOverrides
          //
          // Cross-reference: the v5.9.2 X4 cascade still runs passesGate on
          // every request. If the gate fails for the stored route in a given
          // cycle, the cascade falls through without overwriting KV — the
          // existing preference is preserved for the next cycle (30 s cache
          // TTL per §11.1), giving the coord-identity tier another chance.
          //
          // The in-memory preferredTramRoute variable is still updated so
          // the current-request logic can use it; only the KV persist is
          // gated.
          //
          // v5.9.4 (Z2): KV write gated on BOTH "KV empty" AND "stop-level
          // confident" (bestIsStopLevel === true). A cold-start request
          // where the feed has no stop-level match at all (e.g. the first
          // request immediately after a deploy, before the feed cache warms)
          // can see the cascade fall all the way through to route-level
          // heuristic, select a route via P3 frequency-detect, and — in
          // v5.9.3 — poison the empty KV with that coord-tier result. Only
          // stop-level-confident results may be persisted. Coord-tier and
          // route-level wins may drive the current request's selectedRoute
          // but must not touch KV. See DEVELOPMENT-RULES.md §23.15.
          if (!preferredTramRoute && bestIsStopLevel) {
            setPreferredTramRoute(bestRoute).catch(() => {});
            setPreferredTramStop(tramStopId).catch(() => {});
          }
          preferredTramRoute = bestRoute;
        }
      }
      if (!selectedRoute && tramRouteNum && passesGate(tramRouteNum)) {
        selectedRoute = tramRouteNum;
        selectionBranch = preferStopLevel ? 'engine-planned-stop-level' : 'engine-planned-coord';
      }
      if (!selectedRoute) {
        const routeCounts = {};
        for (const t of trams) {
          if (t.routeNumber && t.isLive) routeCounts[t.routeNumber] = (routeCounts[t.routeNumber] || 0) + 1;
        }
        const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0];
        selectedRoute = topRoute ? topRoute[0] : trams.find(t => t.routeNumber && t.isLive)?.routeNumber;
        if (selectedRoute) selectionBranch = 'feed-majority';
      }
      // v5.9.1 (U7) + v5.9.0 (T2 audit line): expose selection branch AND
      // stop-level vs coord-proximity confidence in the structured KV log.
      // setDeviceStatus is the structured-logging path — never console.log
      // per Section 1.1.
      try {
        if (selectionBranch && typeof setDeviceStatus === 'function') {
          setDeviceStatus({
            tramRouteSelectionBranch: selectionBranch,
            tramRouteSelected: selectedRoute,
            tramRouteSelectionConfidence: preferStopLevel ? 'stop-level' : 'coord-proximity-only'
          }).catch(() => {});
        }
      } catch (e) { /* non-fatal */ }
      if (selectedRoute) {
        tramApiOptions.routeNumber = selectedRoute;
        if (tramLeg) tramLeg.routeNumber = selectedRoute;
        // v5.9.4 (Z2): mirror the frequency-detect write-once guard.
        // Only persist to KV when the selectedRoute is backed by at least
        // one stop-level-confident tram entry. Derived inline from the
        // live trams array since bestIsStopLevel is out of scope here.
        // Coord-tier / route-level wins drive the current request only.
        // See DEVELOPMENT-RULES.md §23.15 (v5.9.4 update).
        const selectedIsStopLevel = trams.some(t =>
          t.isLive &&
          t.routeNumber?.toString() === selectedRoute.toString() &&
          STOP_LEVEL_SOURCES.has(t.source)
        );
        if (!preferredTramRoute && selectedIsStopLevel) {
          setPreferredTramRoute(selectedRoute).catch(() => {});
          setPreferredTramStop(tramStopId).catch(() => {});
          preferredTramRoute = selectedRoute;
        }
        // V5.6.1: Filter trams array to only the selected route's departures.
        // Coord-proximity returns departures from many routes at the same intersection.
        // Without filtering, findMatchingDepartures() may pick a different route's
        // first departure on each API call, causing route flipping on the display.
        const routeFiltered = trams.filter(t =>
          t.routeNumber && t.routeNumber.toString() === selectedRoute.toString()
        );
        if (routeFiltered.length > 0) {
          // Preserve _feedInfo metadata before replacing array contents
          const feedInfo = trams._feedInfo;
          trams.length = 0;
          routeFiltered.forEach(t => trams.push(t));
          if (feedInfo) trams._feedInfo = feedInfo;
        }
      }
    }
    // Fallback: if nothing found in feed, use saved preference
    if (!tramLeg?.routeNumber && preferredTramRoute) {
      if (tramLeg) tramLeg.routeNumber = preferredTramRoute;
      tramApiOptions.routeNumber = preferredTramRoute;
    }

    // Determine if we actually have live transit data (from GTFS-RT, not fallback)
    // Per Section 23.6: "LIVE" indicators must reflect actual data source
    const hasLiveTrainData = trains.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasLiveTramData = trams.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasLiveBusData = buses.some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasLiveFerryData = (ferries || []).some(t => (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad' || t.source === 'gtfs-rt-scan' || t.source === 'gtfs-rt-coord') && t.isLive === true);
    const hasAnyLiveData = hasLiveTrainData || hasLiveTramData || hasLiveBusData || hasLiveFerryData;

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
    // Build alert text string from disruptions for coffee decision disruption detection
    const alertTextForCoffee = (transitData.disruptions || [])
      .map(d => d.headerText || d.title || '')
      .filter(Boolean)
      .join(' | ');
    let coffeeDecision = engine.calculateCoffeeDecision(transitData, alertTextForCoffee);
    
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
    const rawJourneyLegs = buildJourneyLegs(effectiveRoute, transitData, coffeeDecision, now, locations, { trainStopId, tramStopId, busStopId, workTrainStopId }, userState, preferredTramRoute, { isTomorrowCommute: earlyIsTomorrowCommute, cityLoopClosed });
    // Section 7.5.1: Merge consecutive walk legs after ALL filtering
    const journeyLegs = mergeConsecutiveWalkLegs(rawJourneyLegs);

    // v5.8.2 (C1-corrective): Filter raw transit arrays to the user's commute
    // direction so downstream consumers of `raw.transit` never see opposite-
    // direction services. The v5.8.1 version relied on `leg.isCitybound` being
    // present on the merged leg, but that field is set on the internal leg
    // (line 463) and NOT copied to the public leg object at line 899 (only
    // `destinationName` is copied). The v5.8.1 filter was a silent no-op.
    // This version derives `isCitybound` from `leg.destinationName` using the
    // same city-stations list that populates the flag upstream. Also filters
    // `departureTimeMs > now` as belt-and-braces against C3 regression.
    const nowMsRawFilter = now.getTime();
    const trainDirLeg = journeyLegs.find(l => l.type === 'train' || l.type === 'vline');
    const tramDirLeg  = journeyLegs.find(l => l.type === 'tram');
    const busDirLeg   = journeyLegs.find(l => l.type === 'bus');
    // Mirrors api/commutecompute.js:460-462 — keep in sync.
    const cityStationsForFilter = ['flinders', 'parliament', 'melbourne central', 'flagstaff',
      'southern cross', 'town hall', 'state library', 'parkville', 'arden', 'anzac', 'city'];
    const deriveCitybound = (leg) => {
      if (!leg) return undefined;
      const destName = (leg.destinationName || leg.destination?.name || '').toLowerCase();
      if (!destName) return undefined;
      return cityStationsForFilter.some(s => destName.includes(s));
    };
    const applyDirFilter = (arr, leg) => {
      if (!Array.isArray(arr) || arr.length === 0) return arr;
      const legCitybound = deriveCitybound(leg);
      if (legCitybound === undefined) return arr;
      return arr.filter(d =>
        d.departureTimeMs > nowMsRawFilter &&
        (d.isCitybound === undefined || d.isCitybound === legCitybound)
      );
    };
    transitData.trains = applyDirFilter(transitData.trains, trainDirLeg);
    transitData.trams  = applyDirFilter(transitData.trams,  tramDirLeg);
    transitData.buses  = applyDirFilter(transitData.buses,  busDirLeg);

    const totalMinutes = calculateTotalMinutes(journeyLegs);
    let statusType = getStatusType(journeyLegs, transitData.disruptions);

    // Fix 3: Detect public holiday from SpecialEvent disruptions in the feed.
    // These entries announce timetable changes (e.g., "trams run to a Saturday timetable")
    // so the next-commute display must warn the user rather than showing a normal time.
    const publicHolidayDisruption = (transitData.disruptions || []).find(d => {
      const isSpecialEvent =
        d.type === 'SpecialEvent' ||
        d.disruptionType === 'Special Event' ||
        (d.type || '').toLowerCase().includes('special');
      const text = `${d.title || ''} ${d.headerText || ''} ${d.description || ''}`.toLowerCase();
      return isSpecialEvent && text.includes('public holiday');
    });

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
      hasLiveData: hasAnyLiveData,
      isTomorrowCommute
    });
    // V5.5.18: Confidence is always calculated when live data is present.
    // Journey legs always show live GTFS-RT data regardless of commute window.
    // The commute window only gates the CoffeeDecision engine.
    // V14.0: Calculate Lifestyle Context Suggestions
    const lifestyleEngine = new LifestyleContext();
    const lifestyle = lifestyleEngine.calculate({
      weather: weatherData,
      currentTime: now,
      state: userState,
      localHour: melbourneTime.hour,
      localMinute: melbourneTime.minute
    });
    // V15.0: Sleep Optimiser — evening mode bedtime/alarm calculation
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
      confidenceScore: confidence.label !== 'N/A' ? confidence.score : null,
      maxDelayMinutes,
      hasLiveData: hasAnyLiveData
    });
    // v5.10.2: Compute route-filtered disruptions BEFORE response object so the
    // disruption boolean flag, confidence score, and services badge all react.
    const userStopIds = new Set([
      ...(trainStopId ? (VIC_METRO_STATIONS[trainStopId]?.platforms || []) : []),
      ...(tramStopId ? [tramStopId] : []),
      ...(busStopId ? [busStopId] : [])
    ]);
    // v5.11.0: Also match disruptions by route ID, line name text, and City Loop keywords.
    // Previously only matched by affectedStops — Frankston line City Loop disruptions were
    // dropped because they don't list individual platform stop IDs.
    const userLineName = preferredTrainLine?.toLowerCase() || '';
    const userTramRoute = effectiveTramRoute || detectedTramRoute || '';
    const userLineCode = userLineName ? ({
      'sandringham': 'SHM', 'frankston': 'FKN', 'pakenham': 'PKM',
      'cranbourne': 'CBE', 'glen waverley': 'GLW', 'alamein': 'ALM',
      'belgrave': 'BEL', 'lilydale': 'LIL', 'hurstbridge': 'HBE',
      'mernda': 'MER', 'craigieburn': 'CRB', 'sunbury': 'SUN',
      'upfield': 'UPF', 'werribee': 'WER', 'williamstown': 'WIL',
      'stony point': 'SPT', 'flemington racecourse': 'FLE'
    }[userLineName] || '') : '';
    const cityLoopKeywords = ['city loop', 'not via the city', 'direct to flinders', 'direct to and from flinders'];

    const routeFilteredDisruptions = (disruptions || [])
      .filter(d => {
        if (!d.affectedRoutes?.length && !d.affectedStops?.length) return true;
        if (d.affectedStops?.some(s => userStopIds.has(s))) return true;
        // v5.11.0: Match by route ID against user's configured line/route
        if (d.affectedRoutes?.length > 0) {
          const routeHit = d.affectedRoutes.some(r => {
            const ru = r.toUpperCase();
            if (userLineCode && (ru.includes(`-${userLineCode}:`) || ru.includes(`-${userLineCode}-`))) return true;
            if (userTramRoute && (ru.includes(`-${userTramRoute}:`) || ru.includes(`-${userTramRoute}-`))) return true;
            return false;
          });
          if (routeHit) return true;
        }
        // v5.11.0: Match by text — line name or City Loop keywords
        const alertText = ((d.headerText || '') + ' ' + (d.description || '') + ' ' + (d.title || '')).toLowerCase();
        if (userLineName && alertText.includes(userLineName)) return true;
        if (cityLoopKeywords.some(kw => alertText.includes(kw))) return true;
        return false;
      })
      .map(d => ({
        title: sanitiseDisruptionLabel(d.title || d.headerText || 'Alert'),
        description: sanitiseDisruptionLabel((d.description || '').substring(0, 300)),
        effect: d.effect,
        mode: d.mode
      }));
    const hasActiveDisruptions = routeFilteredDisruptions.length > 0;

    const dashboardData = {
      location: displayHome,
      current_time: `${currentTime}${amPm}`,
      am_pm: amPm,  // V13.6: Explicit AM/PM from Melbourne time
      timezone: STATE_TIMEZONES[userState] || 'Australia/Melbourne',
      day,
      date,
      temp: weatherData?.temp ?? '--',
      condition: weatherData?.condition || 'N/A',
      umbrella: lifestyle?.suggestions?.some(s => s.item === 'umbrella' && s.active) || weatherData?.umbrella || false,
      status_type: statusType,
      delay_minutes: delayMinutes,
      // v5.10.2: disruption flag reflects BOTH journey-level status AND active
      // route-filtered disruptions. The header services badge reads this flag.
      disruption: statusType === 'disruption' || statusType === 'delay' || hasActiveDisruptions,
      disruption_text,
      arrive_by: displayArrival,
      _calculatedArrival: calculatedArrival,  // V13.6: Stable arrival time from journey calculation
      total_minutes: totalMinutes,
      // Pure travel duration (walk + ride + walk) without current departure wait inflation.
      // Used by renderer for tomorrow's leave-by calculation — off-peak waits shouldn't
      // push tomorrow's departure time earlier than necessary.
      _journeyDurationMins: journeyLegs.filter(l => l.state !== 'skip').reduce((sum, l) => sum + (l.journeyContribution || 0), 0),
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
        // Prefer user's configured cafe address (their chosen name) over geocoded result.
        // Google Places geocoding may resolve to a different nearby venue.
        const userCafe = kvPrefs?.addresses?.cafe;
        if (userCafe) return userCafe.split(',')[0].trim();
        const name = kvPrefs?.locations?.cafe?.name || kvPrefs?.cafe?.name || null;
        if (!name) return null;
        return name.split(',')[0].trim();
      })(),
      cafe_is_open: kvPrefs?.addresses?.cafe ? cafeIsOpen : null,
      cafe_wait_time: coffeeDecision?.canGet ? (coffeeDecision?.commute?.makeCoffee || 3) : null,
      cafe_busyness: cafeIsOpen ? (coffeeDecision?.busyLevel || 'quiet') : null,
      // V15.0: Transit availability notice (e.g., "TRAM USING TIMETABLE DATA")
      transit_notice: transitNotice || (hasAnyLiveData && removedTypes.length > 0 ? `Some services using scheduled data (${removedTypes.join(', ')})` : null),
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
        (!journeyLegs.some(l => l.type === 'bus') || hasLiveBusData) &&
        (!journeyLegs.some(l => l.type === 'ferry') || hasLiveFerryData)
      ),
      // dataSource: reflects actual GTFS-RT feed state, not gated by time of day.
      // isTomorrowCommute is a separate flag for journey display context.
      dataSource: hasAnyLiveData
        ? ((!journeyLegs.some(l => l.type === 'train') || hasLiveTrainData) &&
           (!journeyLegs.some(l => l.type === 'tram') || hasLiveTramData) &&
           (!journeyLegs.some(l => l.type === 'bus') || hasLiveBusData) &&
           (!journeyLegs.some(l => l.type === 'ferry') || hasLiveFerryData)
            ? 'gtfs-rt' : 'partial-live')
        : (transitApiKey
            ? (isTomorrowCommute ? 'tomorrow'
               : journeyLegs.some(l => l.isTimetableEstimate) ? 'timetable' : 'no-data')
            : 'no-key'),
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
        busError: buses?._feedInfo?.error || null,
        // v5.9.0 (T7 / B9): Expose the raw home coords and top-3 candidate
        // stations (with computed distances) so drift between what the
        // nearest-stop comparison actually returns and what an independent
        // reviewer would expect is immediately visible from the admin
        // panel diagnostics. This field has previously exposed cases where
        // a closer station was picked over an inner suburban alternative
        // for a configured home address, making the cause reproducible and
        // independently verifiable without re-running the engine.
        homeCoords: (locations?.home?.lat && locations?.home?.lon)
          ? { lat: Number(locations.home.lat.toFixed(6)), lon: Number(locations.home.lon.toFixed(6)) }
          : null,
        // v5.9.8 (DD1 + DD4): home coordinate freshness verdict. See
        // ensureFreshHomeCoords() for the full semantics of the possible
        // `source` values. This field is the primary evidence a deployment
        // verification pass reads to confirm DD1 ran on the request and
        // which code path (cache hit, drift-corrected overwrite, vendor
        // misresolve rejection, timeout fallback) was taken.
        homeCoordFreshness: homeCoordFreshnessDiag.homeCoordFreshness || { source: 'not-run' },
        // v5.9.9 (EE3): running count of NEW geocoder failures recorded
        // by the memory-cache failure memoisation path since this
        // serverless instance warmed up. Increments only on the
        // transition from "attempted" to "stored failure verdict";
        // repeated cache-hits of a previously-stored failure do NOT
        // increment. A non-zero value here combined with a
        // homeCoordFreshness.source === 'memory-cache-failed' verdict
        // indicates the failure cache is actively suppressing
        // geocoder thrashing against a broken environment — this is
        // expected and healthy, not a regression.
        homeCoordFreshnessFailureCount: _freshHomeCoordFailureCount,
        // v5.9.8 (DD2): tram stop coord override result. See the hardening
        // block near the cascade call site. The `resolved` flag is true
        // only when the exact dataset lookup succeeded; `fallbackUsed`
        // distinguishes between nearest-stop-helper, home-coord last-resort,
        // and no-home-coords cases so any future 0-match cascade failure
        // is immediately diagnosable from the admin panel.
        tramStopCoordOverride: (typeof tramStopCoordOverrideDiag !== 'undefined') ? tramStopCoordOverrideDiag : { attempted: false },
        nearestTrainCandidates: (locations?.home?.lat && locations?.home?.lon)
          ? (findNearestStopsMultiple(locations.home.lat, locations.home.lon, { count: 3 }).train || [])
              .map(s => ({ id: s.id, name: s.name, distanceM: s.distance }))
          : null,
        nearestTramCandidates: (locations?.home?.lat && locations?.home?.lon)
          ? (findNearestStopsMultiple(locations.home.lat, locations.home.lon, { count: 3 }).tram || [])
              .map(s => ({ id: s.id, name: s.name, distanceM: s.distance }))
          : null,
        preferredTrainLine: preferredTrainLine || null,
        tramSelectionBranch: null, // populated by T2 audit line via setDeviceStatus
        // v5.9.2 (X5): derive tramRouteSelectionConfidence from the actual
        // match tier that returned the selected route's departures, read
        // directly from the live trams array. This replaces the v5.9.1
        // placeholder that was populated via setDeviceStatus.
        //
        // Confidence ladder (high → low):
        //   exact-stop-id   — source 'gtfs-rt'
        //   lenient-scan    — source 'gtfs-rt-scan'
        //   coord-identity  — source 'gtfs-rt-coord-identity' (v5.9.2 NEW)
        //   route-level     — source 'gtfs-rt-route'
        //   coord-proximity-only — source 'gtfs-rt-coord' (LOW confidence,
        //                         300 m radius may pick wrong route)
        //
        // When there are no live trams, confidence is null.
        tramRouteSelectionConfidence: (() => {
          const liveTrams = (trams || []).filter(t => t.isLive);
          if (liveTrams.length === 0) return null;
          const sources = new Set(liveTrams.map(t => t.source));
          if (sources.has('gtfs-rt')) return 'exact-stop-id';
          if (sources.has('gtfs-rt-scan')) return 'lenient-scan';
          if (sources.has('gtfs-rt-coord-identity')) return 'coord-identity';
          if (sources.has('gtfs-rt-route')) return 'route-level';
          if (sources.has('gtfs-rt-coord')) return 'coord-proximity-only';
          return null;
        })(),
        // v5.9.2 (X5): Which cascade tier the tram feed actually used.
        // Reads directly from the _feedInfo.matchMethod emitted by
        // getDepartures. Never null when tram data is present.
        tramMatchTier: trams?._feedInfo?.matchMethod || null,
        // v5.9.2 (X5): Empirical list of feed stop IDs that resolved to
        // static coordinates within the identity radius. Proves which feed
        // IDs actually reference the user's physical stop — observable data,
        // not a hardcoded mapping. Useful for diagnosis and cross-reference
        // against TramTracker.
        tramFeedStopIdsResolved: (() => {
          const cascade = trams?._feedInfo?.cascadeAttempts || [];
          const identity = cascade.find(a => a.tier === 'coord-identity');
          return identity?.feedStopIdsResolved || [];
        })(),
        // v5.9.3 (Y4): Reads from the live cascade attempt; propagates the
        // v5.9.3 widened radius (TRAM_COORD_IDENTITY_RADIUS_METRES = 40)
        // automatically because the call site in opendata-client.js attaches
        // the actual radiusMetres used into the cascadeAttempts entry.
        tramIdentityRadiusMetresUsed: (() => {
          const cascade = trams?._feedInfo?.cascadeAttempts || [];
          const identity = cascade.find(a => a.tier === 'coord-identity');
          return identity?.radiusMetres ?? null;
        })(),
        // v5.9.4 (Z4): Coord-identity diagnostic telemetry. Exposes the
        // sample-lookup table the tier collected for the first N unique
        // feed stop IDs, the total number of unique feed stop IDs seen,
        // and the matched trip count. Use this to diagnose why the tier
        // returned empty in a given cycle — e.g. "the feed uses a stop ID
        // namespace that lookupTramStop doesn't resolve" (all sampleLookups
        // have distanceToTargetM=null) vs "the lookups succeed but none
        // are within the radius" (distances populated but all > radius).
        // Pure observable data — no hardcoded identifiers.
        tramCoordIdentityDebug: (() => {
          const cascade = trams?._feedInfo?.cascadeAttempts || [];
          const identity = cascade.find(a => a.tier === 'coord-identity');
          if (!identity) return null;
          return {
            totalUniqueFeedStopIds: identity.totalUniqueFeedStopIds ?? null,
            matchedCount: identity.matchedTripCount ?? 0,
            radiusMetres: identity.radiusMetres ?? null,
            sampleLookups: identity.sampleLookups || [],
            // v5.9.5 (AA3): Cross-tier divergence report. When populated,
            // byTrip[] contains one entry per trip that T1/T2 matched; if
            // any entry has matched === false with rejectionReasons
            // containing 'lookup-failed' or 'out-of-radius', that's a
            // BLOCKING regression per §23.15 (v5.9.5 update). Reasons
            // 'no-dep-time' and 'past-time' are legitimate stu-level
            // edge cases. null when no knownMatchedTripIds were supplied.
            divergenceReport: identity.divergenceReport ?? null
          };
        })(),
        // v5.9.3 (Y4): Full cascade tier breakdown for diagnostics and the
        // admin panel Resolved Inputs display. Pure observable data read
        // from the v5.9.2 X2 cascadeAttempts — no hardcoded stops, routes,
        // or station names. Each entry has shape
        //   { tier, tried, found, ...tier-specific-extras }
        // where tier is one of: exact-id | alt-ids | lenient-scan |
        // coord-identity | route-level | coord-proximity. This lets the
        // admin panel surface which tier actually produced the selected
        // tram departures for the current cycle, and lets /cc-deploy-verify
        // Agent A assert that the coord-identity tier is returning live
        // matches across consecutive cache refreshes.
        tramCascadeAttempts: trams?._feedInfo?.cascadeAttempts || [],
        // Feed staleness: seconds since GTFS-RT data was fetched
        feed_age_seconds: Math.round((now.getTime() - (trains?._feedInfo?.fetchTime || trams?._feedInfo?.fetchTime || now.getTime())) / 1000)
      },
      // V13.6: Device battery status (from TRMNL device request)
      battery_percent: batteryPercent,
      battery_voltage: batteryVoltage,
      device_id: deviceId,
      // Service status combines disruption state and minor delay signal for consistent badge display.
      // 'MINOR DELAYS' is set when mindset stress is MEDIUM (real delays detected from GTFS-RT)
      // but no full suspension/cancellation — prevents badge saying "SERVICES OK" alongside
      // the confidence strip saying "MINOR DELAYS" (Bug 2 fix).
      service_status: statusType === 'disruption' ? 'DISRUPTIONS'
        : statusType === 'delay' ? 'DELAYS'
        : (isCommuteDay && mindset?.stressLevel === 'MEDIUM') ? 'MINOR DELAYS'
        : 'OK',
      // Fix 3: public holiday flag from SpecialEvent disruptions in the feed
      public_holiday: !!publicHolidayDisruption,
      public_holiday_text: publicHolidayDisruption
        ? (publicHolidayDisruption.title || publicHolidayDisruption.headerText || 'Public Holiday')
        : null,
      // V14.0: Departure Confidence Score
      // Null on non-commute days to suppress "UNLIKELY (0%)" when label is N/A (Bug 1 fix).
      confidence_score: confidence.label !== 'N/A' ? confidence.score : null,
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
      // V15.0: Sleep Optimiser (evening mode)
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
      // V5.5.18: Mindset always shown — commute window only gates CoffeeDecision
      mindset_stress: mindset.stressLevel,
      mindset_display: mindset.stressDisplay,
      mindset_steps: mindset.stepsDisplay,
      mindset_feels_like: mindset.feelsLikeDisplay,
      mindset_resilience: mindset.resilienceDisplay,
      mindset_resilience_level: mindset.resilienceLevel,
    };

    // v5.9.1 (U9 / Section 1.1): Removed console.log of _liveDataDiag —
    // the diagnostic is already present in the JSON response under
    // `_liveDataDiag` and is consumed by the admin panel's Resolved Inputs
    // panel. Logging it to Vercel request logs duplicates data that was
    // never needed outside the response itself.

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

        // Journey summary (admin panel expects this shape).
        // v5.9.1 (U3 / NEW-N19): Add a leading 'no-commute' branch so non-
        // commute days (Saturdays, public holidays, and any configured
        // non-commute state) do not return status: 'late' based on a
        // meaningless arrivalDiff against the 9am target. onTime and
        // diffMinutes are null in that branch because there is no meaningful
        // comparison to make. The renderer already reads isCommuteDay
        // independently for the "NO COMMUTE TODAY" overlay, so no renderer
        // change is required.
        summary: {
          leaveNow: currentTime + amPm,
          arriveAt: arriveAtJson,
          totalMinutes,
          onTime: !isCommuteDay ? null : (isTomorrowCommute ? null : arrivalDiff <= 5),
          diffMinutes: !isCommuteDay ? null : (isTomorrowCommute ? null : arrivalDiff),
          status: !isCommuteDay
            ? 'no-commute'
            : isTomorrowCommute
              ? 'tomorrow'
              : arrivalDiff > 5
                ? 'late'
                : arrivalDiff < -10
                  ? 'early'
                  : 'on-time',
          statusContext: !isCommuteDay
            ? 'No commute today — services shown are live'
            : (isTomorrowCommute ? 'Tomorrow — services shown are live' : null)
        },

        // Weather (admin panel expects this shape)
        weather: weatherData ? {
          temp: weatherData.temp,
          condition: weatherData.condition,
          icon: weatherData.icon,
          umbrella: weatherData.umbrella
        } : null,

        // v5.10.2: Use pre-computed route-filtered disruptions with sanitised labels
        disruptions: routeFilteredDisruptions,
        disruption_count: disruptions?.length || 0,

        // v5.9.0: Route-filtered transit data consistent with journey legs.
        // Admin departure cards should read this instead of raw.transit to
        // avoid showing departures from a different route than the journey uses.
        _processedTransit: {
          trains: trains?.filter(t => t.isLive) || [],
          trams: (() => {
            const effectiveRoute = effectiveTramRoute || detectedTramRoute;
            if (!effectiveRoute || !trams?.length) return trams?.filter(t => t.isLive) || [];
            const matched = trams.filter(t => t.isLive && String(t.routeNumber) === String(effectiveRoute));
            return matched.length > 0 ? matched : trams.filter(t => t.isLive);
          })(),
          buses: buses?.filter(t => t.isLive) || []
        },

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
          arriveTime: leg.arriveTime,
          departTime: leg.departTime,
          nextDepartures: leg.nextDepartures,
          nextDepartureTimes: leg.nextDepartureTimes,
          isLive: leg.isLive,
          isTimetableEstimate: leg.isTimetableEstimate || false
        }))
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).json(jsonResponse);
    }

    // Resolve device display dimensions from KV preferences
    const deviceModel = kvPrefs?.deviceModel || 'trmnl-og';
    const displayDims = DISPLAY_DIMENSIONS[deviceModel] || DISPLAY_DIMENSIONS['trmnl-og'];

    if (format && format !== 'bmp' && format !== 'json' && format !== 'png') {
      return res.status(400).json({ error: `Unsupported format: ${format}`, supported: ['json', 'bmp', 'png'] });
    }

    if (format === 'bmp') {
      // BMP format for e-ink devices (V13.6: await async render)
      const bmp = await renderFullScreenBMP(dashboardData, {}, displayDims);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
    res.setHeader('X-Image-Description', `Commute dashboard: ${journeyLegs.length} legs, ${dashboardData.total_minutes || 0} min journey, ${dashboardData.confidence_label || ''} (${dashboardData.confidence_score || 0}%)`);
    res.setHeader('Content-Length', png.length);

    return res.status(200).send(png);

  } catch (error) {
    // Sanitise error response — never expose internal error.message to client
    console.error('Render error:', error.message);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ success: false, error: 'Dashboard rendering failed', code: 'RENDER_ERROR' });
  }
}
