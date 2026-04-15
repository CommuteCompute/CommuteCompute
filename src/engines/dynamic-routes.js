/**
 * Dynamic Route Computation Engine
 *
 * Replaces the hardcoded-timings fallback in commute-compute.js::getHardcodedRoutes
 * with a per-user dynamic computation. Every leg timing is derived from real data:
 * haversine distance for walk legs, GTFS static stop_times when available, and
 * per-mode average speeds when static timing is absent.
 *
 * ZERO hardcoded location-dependent minute literals. Only two documented
 * universal constants are permitted in this module:
 *   1. WALKING_SPEED_M_PER_MIN — Victorian DoT planning default (80 m/min)
 *   2. MODE_AVERAGE_SPEEDS_KMH — per-mode fallback speeds (tram 15, train 45, bus 20)
 *      sourced from Victorian PTV service standards — these are mode characteristics,
 *      not location constants, and are documented in DEVELOPMENT-RULES.md §23.8.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { haversine } from '../utils/haversine.js';

// ============================================================================
// ACCEPTABLE CONSTANTS (DEVELOPMENT-RULES.md §23.8 allowlist)
// ============================================================================

/**
 * Coffee duration — user's stated time at cafe. Not a commute literal;
 * it is the experience duration the user has asked for via preferences.
 * Overridable per-user via locations.cafe.dwellMinutes.
 */
export const COFFEE_DURATION_MINUTES = 5;

/**
 * Default walking speed used to convert haversine metres → minutes.
 * Source: Victorian Department of Transport planning default of 80 m/min
 * (1.33 m/s, ~4.8 km/h). Applied universally regardless of user location
 * because walking speed is a physical property of the user, not the place.
 * Overridable per-user via locations.home.walkingSpeedMpm.
 */
export const WALKING_SPEED_M_PER_MIN = 80;

/**
 * Per-mode average operating speeds (km/h) used ONLY when GTFS static
 * timing is unavailable for the specific route/stop pair. These are
 * Victorian PTV service-standard averages for metropolitan operation.
 * They are mode characteristics — not route-, line-, or location-specific.
 */
export const MODE_AVERAGE_SPEEDS_KMH = Object.freeze({
  tram: 15,   // surface-level, traffic-shared
  train: 45,  // metropolitan rail (stopping pattern averaged)
  bus: 20     // suburban operation
});

// ============================================================================
// LEG TIMING COMPUTATION
// ============================================================================

/**
 * Compute walk minutes between two coordinate pairs using haversine.
 * Returns `null` when either coordinate is missing — caller decides
 * whether to drop the leg or fall back to a non-walk path.
 *
 * @param {{lat, lon}} from
 * @param {{lat, lon}} to
 * @param {number} [speedMpm] - Override walking speed in m/min
 * @returns {number|null} Minutes, rounded up
 */
export function computeWalkMinutes(from, to, speedMpm = WALKING_SPEED_M_PER_MIN) {
  if (!from?.lat || !from?.lon || !to?.lat || !to?.lon) return null;
  const metres = haversine(from.lat, from.lon, to.lat, to.lon);
  if (!Number.isFinite(metres) || metres <= 0) return null;
  return Math.ceil(metres / speedMpm);
}

/**
 * Compute transit minutes for a leg between two stops.
 * Priority order:
 *   1. GTFS static stop_times — if gtfsStatic helper is supplied and returns a value
 *   2. Geodesic fallback — haversine distance ÷ mode average speed
 *   3. null — when neither coordinates nor static data exist
 *
 * Returns raw (unrounded) minutes as a number so callers can aggregate
 * without compounding rounding error. A final Math.ceil is applied only
 * at the route-total boundary (T14 — round once).
 *
 * @param {Object} args
 * @param {'tram'|'train'|'bus'} args.mode
 * @param {{lat, lon, id}} args.originStop
 * @param {{lat, lon, id}} args.destinationStop
 * @param {string} [args.routeNumber]
 * @param {Function} [args.gtfsStatic] - Optional sync (mode, routeNumber, originId, destId) → minutes
 * @returns {number|null}
 */
export function computeTransitMinutes({
  mode,
  originStop,
  destinationStop,
  routeNumber = null,
  gtfsStatic = null
}) {
  // Priority 1: GTFS static lookup (synchronous injection — caller resolves)
  if (gtfsStatic && originStop?.id && destinationStop?.id) {
    try {
      const staticMinutes = gtfsStatic(mode, routeNumber, originStop.id, destinationStop.id);
      if (Number.isFinite(staticMinutes) && staticMinutes > 0) {
        return staticMinutes;
      }
    } catch {
      // Fall through to geodesic
    }
  }

  // Priority 2: Geodesic fallback
  if (originStop?.lat && originStop?.lon && destinationStop?.lat && destinationStop?.lon) {
    const metres = haversine(
      originStop.lat,
      originStop.lon,
      destinationStop.lat,
      destinationStop.lon
    );
    if (!Number.isFinite(metres) || metres <= 0) return null;
    const speedKmh = MODE_AVERAGE_SPEEDS_KMH[mode] || MODE_AVERAGE_SPEEDS_KMH.bus;
    const metresPerMinute = (speedKmh * 1000) / 60;
    return metres / metresPerMinute; // raw (unrounded)
  }

  return null;
}

// ============================================================================
// ROUTE TEMPLATE SHAPES (no timing literals)
// ============================================================================

/**
 * Route template definitions — LEG SEQUENCES only. Every `minutes` field
 * is populated dynamically by computeDynamicRoute. Templates describe
 * which legs a route has, not how long they take.
 *
 * id: stable identifier (matches v5.8.2 IDs for backward compatibility)
 * legs: sequence of leg-type tokens resolved at compute time
 *
 * requires: which resolved stops must be present for the template to apply.
 * This preserves the v5.8.2 N14 mode-availability guard.
 */
export const ROUTE_TEMPLATE_SHAPES = Object.freeze([
  {
    id: 'coffee-tram-train',
    name: 'Coffee + Tram + Train',
    type: 'preferred',
    requires: ['includeCoffee', 'nearestTramStop', 'nearestTrainStation', 'workStation'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'cafe' },
      { kind: 'coffee' },
      { kind: 'walk', from: 'cafe', to: 'tramStop' },
      { kind: 'tram', from: 'tramStop', to: 'trainStation' },
      { kind: 'walk', from: 'tramStop', to: 'trainStation' },
      { kind: 'train', from: 'trainStation', to: 'workStation' },
      { kind: 'walk', from: 'workStation', to: 'work' }
    ]
  },
  {
    id: 'coffee-train',
    name: 'Coffee + Train',
    type: 'standard',
    requires: ['includeCoffee', 'nearestTrainStation', 'workStation'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'cafe' },
      { kind: 'coffee' },
      { kind: 'walk', from: 'cafe', to: 'trainStation' },
      { kind: 'train', from: 'trainStation', to: 'workStation' },
      { kind: 'walk', from: 'workStation', to: 'work' }
    ]
  },
  {
    id: 'train-direct',
    name: 'Train Direct',
    type: 'direct',
    requires: ['nearestTrainStation', 'workStation'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'trainStation' },
      { kind: 'train', from: 'trainStation', to: 'workStation' },
      { kind: 'walk', from: 'workStation', to: 'work' }
    ]
  },
  {
    id: 'tram-train',
    name: 'Tram + Train',
    type: 'transfer',
    requires: ['nearestTramStop', 'nearestTrainStation', 'workStation'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'tramStop' },
      { kind: 'tram', from: 'tramStop', to: 'trainStation' },
      { kind: 'walk', from: 'tramStop', to: 'trainStation' },
      { kind: 'train', from: 'trainStation', to: 'workStation' },
      { kind: 'walk', from: 'workStation', to: 'work' }
    ]
  },
  {
    id: 'tram-direct',
    name: 'Tram Direct',
    type: 'direct',
    requires: ['nearestTramStop'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'tramStop' },
      { kind: 'tram', from: 'tramStop', to: 'workArea' },
      { kind: 'walk', from: 'workArea', to: 'work' }
    ]
  },
  {
    id: 'bus-direct',
    name: 'Bus Direct',
    type: 'alternative',
    requires: ['busRouteNumber', 'nearestBusStop'],
    legSequence: [
      { kind: 'walk', from: 'home', to: 'busStop' },
      { kind: 'bus', from: 'busStop', to: 'workArea' },
      { kind: 'walk', from: 'workArea', to: 'work' }
    ]
  }
]);

// ============================================================================
// RESOLVED LOCATION LOOKUP
// ============================================================================

/**
 * Resolve a location-token ('home', 'cafe', 'tramStop', 'trainStation',
 * 'workStation', 'workArea', 'work', 'busStop') to a {lat, lon, name, id}
 * object using the supplied resolved stops and locations.
 *
 * @param {string} token
 * @param {Object} resolved - { locations, homeStops, workStops, cafeCoords }
 * @returns {{lat, lon, name, id}|null}
 */
function resolveLocationToken(token, resolved) {
  const { locations, homeStops, workStops, cafeCoords } = resolved;
  switch (token) {
    case 'home':
      return locations?.home?.lat
        ? { lat: locations.home.lat, lon: locations.home.lon, name: 'Home', id: null }
        : null;
    case 'cafe':
      return cafeCoords?.lat
        ? { lat: cafeCoords.lat, lon: cafeCoords.lon, name: locations?.cafe?.name || 'Cafe', id: null }
        : null;
    case 'tramStop':
      return homeStops?.tram?.lat
        ? { lat: homeStops.tram.lat, lon: homeStops.tram.lon, name: homeStops.tram.name, id: homeStops.tram.id }
        : null;
    case 'trainStation':
      return homeStops?.train?.lat
        ? { lat: homeStops.train.lat, lon: homeStops.train.lon, name: homeStops.train.name, id: homeStops.train.id }
        : null;
    case 'busStop':
      return homeStops?.bus?.lat
        ? { lat: homeStops.bus.lat, lon: homeStops.bus.lon, name: homeStops.bus.name, id: homeStops.bus.id }
        : null;
    case 'workStation':
      return workStops?.train?.lat
        ? { lat: workStops.train.lat, lon: workStops.train.lon, name: workStops.train.name, id: workStops.train.id }
        : null;
    case 'workArea':
      // For direct tram/bus routes, the engine deliberately does not use the
      // nearest train station as the tram destination (v5.8.2 B5 fix). Use
      // the work location suburb/area instead.
      return locations?.work?.lat
        ? { lat: locations.work.lat, lon: locations.work.lon, name: locations?.work?.suburb || locations?.work?.area || 'City', id: null }
        : null;
    case 'work':
      return locations?.work?.lat
        ? { lat: locations.work.lat, lon: locations.work.lon, name: locations?.work?.name || 'Work', id: null }
        : null;
    default:
      return null;
  }
}

// ============================================================================
// MAIN ENTRY: computeDynamicRoutes
// ============================================================================

/**
 * Compute all applicable routes from the template shapes, populated with
 * dynamic per-user timings. Returns an array of fully-formed route objects
 * matching the legacy shape expected by downstream consumers:
 *   { id, name, description, type, totalMinutes, legs: [...] }
 *
 * @param {Object} args
 * @param {Object} args.locations - User-configured locations (home, work, cafe)
 * @param {Object} args.homeStops - findNearestStops result for home coords
 * @param {Object} args.workStops - findNearestStops result for work coords
 * @param {boolean} args.includeCoffee
 * @param {string} [args.tramRouteNumber]
 * @param {string} [args.busRouteNumber]
 * @param {number} [args.walkingSpeedMpm]
 * @param {Function} [args.gtfsStatic] - Optional sync GTFS static timing lookup
 * @returns {Array}
 */
export function computeDynamicRoutes({
  locations,
  homeStops = {},
  workStops = {},
  includeCoffee = true,
  tramRouteNumber = null,
  busRouteNumber = null,
  walkingSpeedMpm = WALKING_SPEED_M_PER_MIN,
  gtfsStatic = null
}) {
  const cafeCoords = locations?.cafe?.lat
    ? { lat: locations.cafe.lat, lon: locations.cafe.lon }
    : null;

  const resolved = { locations, homeStops, workStops, cafeCoords };

  const nearestTramStop = homeStops?.tram?.name || null;
  const nearestTrainStation = homeStops?.train?.name || null;
  const nearestBusStop = homeStops?.bus?.name || null;
  const workStation = workStops?.train?.name || null;

  const templateContext = {
    includeCoffee: !!(includeCoffee && cafeCoords),
    nearestTramStop,
    nearestTrainStation,
    nearestBusStop,
    workStation,
    busRouteNumber
  };

  const routes = [];

  for (const shape of ROUTE_TEMPLATE_SHAPES) {
    // N14 guard: require all declared prerequisites
    const ok = shape.requires.every(req => !!templateContext[req]);
    if (!ok) continue;

    const legs = [];
    let rawTotalMinutes = 0;
    let aborted = false;

    for (const step of shape.legSequence) {
      const fromLoc = resolveLocationToken(step.from, resolved);
      const toLoc = resolveLocationToken(step.to, resolved);

      if (step.kind === 'coffee') {
        const dwell = locations?.cafe?.dwellMinutes || COFFEE_DURATION_MINUTES;
        legs.push({
          type: 'coffee',
          location: locations?.cafe?.name || 'Cafe',
          cafeName: locations?.cafe?.name || 'Cafe',
          minutes: dwell,
          _rawMinutes: dwell, // T14
          canGet: true
        });
        rawTotalMinutes += dwell;
        continue;
      }

      if (step.kind === 'walk') {
        const walkMins = computeWalkMinutes(fromLoc, toLoc, walkingSpeedMpm);
        if (walkMins === null) {
          // Missing coords — skip template entirely to prevent fabricated legs
          aborted = true;
          break;
        }
        legs.push({
          type: 'walk',
          to: toLoc?.name || step.to,
          from: fromLoc?.name || step.from,
          minutes: walkMins,
          _rawMinutes: walkMins, // T14: walk mins are already integer (ceil of metres/speed)
          fromHome: step.from === 'home',
          cafeName: step.to === 'cafe' ? (locations?.cafe?.name || 'Cafe') : undefined,
          stopName: step.to === 'tramStop' ? nearestTramStop : undefined,
          stationName: step.to === 'trainStation' ? nearestTrainStation : undefined,
          workName: step.to === 'work' ? (locations?.work?.name || locations?.work?.address?.split(',')[0]?.trim() || 'Work') : undefined,
          destinationName: toLoc?.name || null
        });
        rawTotalMinutes += walkMins;
        continue;
      }

      if (step.kind === 'tram' || step.kind === 'train' || step.kind === 'bus') {
        const transitMins = computeTransitMinutes({
          mode: step.kind,
          originStop: fromLoc,
          destinationStop: toLoc,
          routeNumber: step.kind === 'tram' ? tramRouteNumber : (step.kind === 'bus' ? busRouteNumber : null),
          gtfsStatic
        });
        if (transitMins === null) {
          aborted = true;
          break;
        }
        // Leg object: preserve v5.8.2 field names expected by downstream
        const legObj = {
          type: step.kind,
          origin: { name: fromLoc?.name || null },
          destination: { name: toLoc?.name || null },
          minutes: Math.ceil(transitMins),
          // T14: raw (unrounded) for downstream aggregate-then-round-once
          _rawMinutes: transitMins
        };
        if (step.kind === 'tram') {
          legObj.routeNumber = tramRouteNumber || '';
          legObj.originStop = fromLoc?.name || null;
        } else if (step.kind === 'train') {
          legObj.isCitybound = true;
          legObj.originStation = fromLoc?.name || null;
        } else {
          legObj.routeNumber = busRouteNumber || '';
          legObj.originStop = fromLoc?.name || null;
        }
        legs.push(legObj);
        rawTotalMinutes += transitMins; // raw (unrounded) for T14
        continue;
      }
    }

    if (aborted) continue;

    // T14: round ONCE at route boundary, not per-leg
    const totalMinutes = Math.ceil(rawTotalMinutes);

    routes.push({
      id: shape.id,
      name: shape.name,
      description: describeRoute(shape, templateContext, tramRouteNumber),
      type: shape.type,
      totalMinutes,
      legs
    });
  }

  return routes;
}

/**
 * Produce a human-readable description of a route template using the
 * resolved stop names. No timing literals, no hardcoded text — only the
 * real resolved place names.
 */
function describeRoute(shape, ctx, tramRouteNumber) {
  const { nearestTramStop, nearestTrainStation, workStation } = ctx;
  switch (shape.id) {
    case 'coffee-tram-train':
      return `Walk → Coffee → Tram${tramRouteNumber ? ' ' + tramRouteNumber : ''} (${nearestTramStop} → ${nearestTrainStation}) → Train (${nearestTrainStation} → ${workStation}) → Walk`;
    case 'coffee-train':
      return `Walk → Coffee → Train (${nearestTrainStation} → ${workStation}) → Walk`;
    case 'train-direct':
      return `Walk → Train (${nearestTrainStation} → ${workStation}) → Walk`;
    case 'tram-train':
      return `Walk → Tram${tramRouteNumber ? ' ' + tramRouteNumber : ''} (${nearestTramStop} → ${nearestTrainStation}) → Train (${nearestTrainStation} → ${workStation}) → Walk`;
    case 'tram-direct':
      return `Walk → Tram${tramRouteNumber ? ' ' + tramRouteNumber : ''} (${nearestTramStop} → area) → Walk`;
    case 'bus-direct':
      return `Walk → Bus (home → area) → Walk`;
    default:
      return shape.name;
  }
}
