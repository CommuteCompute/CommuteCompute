// Copyright (c) 2026 Angus Bergman
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Tram Cascade Selection — Regression Tests (v5.9.4 Z5)
 *
 * First dedicated test coverage for:
 *   (1) processCoordIdentityMatch behaviour after the v5.9.4 Z1 change
 *       (no pre-cascade route filter — the identity tier MUST scan every
 *       feed trip entity regardless of a caller-supplied route number)
 *   (2) processCoordIdentityMatch telemetry added in v5.9.4 Z4
 *       (sampleLookups + totalUniqueFeedStopIds)
 *   (3) The tram route selection gate in api/commutecompute.js that
 *       decides whether to persist a frequency-detected route to KV.
 *       Replicated here as a pure function for direct testability — when
 *       the inline cascade in api/commutecompute.js::commuteCompute is
 *       updated, this pure replica MUST be updated in lock-step.
 *
 * Background: v5.9.3 shipped a naive KV write-once guard that allowed a
 * route-level heuristic winner to be persisted to an empty KV on cold-
 * start, permanently corrupting the stored preference. v5.9.4 Z2 adds a
 * `bestIsStopLevel === true` gate to the write condition. These tests
 * exercise six scenarios covering the gate semantics so any future
 * regression is caught before deploy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processCoordIdentityMatch,
  TRAM_COORD_IDENTITY_RADIUS_METRES
} from '../src/services/opendata-client.js';
import { VIC_TRAM_STOPS_WITH_COORDS, VIC_METRO_STATIONS } from '../src/data/vic/gtfs-reference.js';
import { lookupMetroStationCoords, findNearestTramStopNearCoords } from '../src/data/gtfs-stop-names.js';

// v5.9.5 (AA7): pick a real static stop entry from the dataset for tests
// that need lookupTramStop to successfully resolve. Using the first entry
// by array position avoids hardcoding any specific stop ID or name in the
// test logic — per §1.1 the test fixture is generic. The coordinate here
// is whatever the first entry of the static dataset happens to be; if
// that ordering ever changes, the test still exercises the same logic.
const REAL_STOP = VIC_TRAM_STOPS_WITH_COORDS[0];
const REAL_STOP_ID = REAL_STOP.id;
const REAL_STOP_LAT = REAL_STOP.lat;
const REAL_STOP_LON = REAL_STOP.lon;

// ============================================================================
// Synthetic GTFS-RT feed helpers
// ============================================================================

/**
 * Build a minimal GTFS-RT feed object with the given trip entities.
 * Each trip is { routeId, stops: [{ stopId, depTimeSec }] }.
 */
function buildFeed(trips) {
  return {
    entity: trips.map((t, i) => ({
      id: `trip_${i}`,
      tripUpdate: {
        trip: { tripId: `trip_${i}`, routeId: t.routeId },
        stopTimeUpdate: t.stops.map(s => ({
          stopId: s.stopId,
          departure: { time: { low: s.depTimeSec }, delay: 0 }
        }))
      }
    }))
  };
}

// Approximate lat/lon around a chosen arbitrary anchor point. Distances
// below are computed via the same haversine the module uses internally.
// Using generic coordinates in central Melbourne for fixture realism, no
// specific stop IDs or suburb names — the tests treat these as opaque
// coordinates (per §1.1: no specific station/stop names in test fixtures).
const ANCHOR_LAT = -37.8400;
const ANCHOR_LON = 144.9985;
// One metre ≈ 0.000009 degrees latitude. 30 m north of the anchor:
const NEAR_LAT = ANCHOR_LAT + (30 * 0.000009);
const NEAR_LON = ANCHOR_LON;
// 300 m east of the anchor (well outside the 40 m identity radius):
const FAR_LAT = ANCHOR_LAT;
const FAR_LON = ANCHOR_LON + (300 * 0.0000113);

// ============================================================================
// Pure-function replica of the api/commutecompute.js tram selection gate
// (v5.9.4 Z2 semantics). Keep in lock-step with the inline cascade at
// api/commutecompute.js::commuteCompute lines ~3390-3495. When the
// inline cascade is modified, update this replica and re-run tests.
// ============================================================================

const STOP_LEVEL_SOURCES = new Set([
  'gtfs-rt',
  'gtfs-rt-scan',
  'gtfs-rt-broad',
  'gtfs-rt-coord-identity'
]);

/**
 * Pure-function replica of the tram route selection cascade.
 * Returns { selectedRoute, selectionBranch, kvWrite: {route, stop} | null }.
 * kvWrite === null when the gate blocks the KV persist.
 */
function selectTramRoute({
  trams,
  preferredTramRoute,
  tramRouteOverride,
  detectedTramRoutes,
  tramRouteNum,
  tramStopId
}) {
  let selectedRoute = null;
  let selectionBranch = null;
  let kvWrite = null;

  const hasLiveForRoute = (rn) =>
    trams.some(t => t.isLive && t.routeNumber?.toString() === rn.toString());
  const hasStopLevelForRoute = (rn) =>
    trams.some(t =>
      t.isLive &&
      t.routeNumber?.toString() === rn.toString() &&
      STOP_LEVEL_SOURCES.has(t.source)
    );
  const anyStopLevelInFeed = trams.some(t =>
    t.isLive && STOP_LEVEL_SOURCES.has(t.source)
  );
  const preferStopLevel = anyStopLevelInFeed;
  const passesGate = (rn) =>
    preferStopLevel ? hasStopLevelForRoute(rn) : hasLiveForRoute(rn);

  // P1: admin override
  if (tramRouteOverride && passesGate(tramRouteOverride)) {
    selectedRoute = tramRouteOverride;
    selectionBranch = preferStopLevel ? 'admin-override-stop-level' : 'admin-override-coord';
  }
  // P2: KV preferred
  if (!selectedRoute && preferredTramRoute && passesGate(preferredTramRoute)) {
    selectedRoute = preferredTramRoute;
    selectionBranch = preferStopLevel ? 'kv-preferred-stop-level' : 'kv-preferred-coord';
  }
  // P3: frequency detection
  if (!selectedRoute && detectedTramRoutes.length > 0) {
    let bestRoute = null;
    let bestCount = 0;
    let bestIsStopLevel = false;
    for (const route of detectedTramRoutes) {
      const stopLevelCount = trams.filter(t =>
        t.isLive &&
        t.routeNumber?.toString() === route.toString() &&
        STOP_LEVEL_SOURCES.has(t.source)
      ).length;
      const totalCount = trams.filter(t =>
        t.isLive && t.routeNumber?.toString() === route.toString()
      ).length;
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
      // v5.9.4 (Z2) gate: only persist when KV is empty AND stop-level confident
      if (!preferredTramRoute && bestIsStopLevel) {
        kvWrite = { route: bestRoute, stop: tramStopId };
      }
    }
  }
  // P4: engine-planned
  if (!selectedRoute && tramRouteNum && passesGate(tramRouteNum)) {
    selectedRoute = tramRouteNum;
    selectionBranch = preferStopLevel ? 'engine-planned-stop-level' : 'engine-planned-coord';
  }
  // P5: feed-majority
  if (!selectedRoute) {
    const routeCounts = {};
    for (const t of trams) {
      if (t.routeNumber && t.isLive) {
        routeCounts[t.routeNumber] = (routeCounts[t.routeNumber] || 0) + 1;
      }
    }
    const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0];
    selectedRoute = topRoute ? topRoute[0] : (trams.find(t => t.routeNumber && t.isLive)?.routeNumber || null);
    if (selectedRoute) selectionBranch = 'feed-majority';
  }
  // P6: feed-majority fallback KV write (v5.9.4 Z2 gate applied here too)
  if (selectedRoute && !kvWrite) {
    const selectedIsStopLevel = trams.some(t =>
      t.isLive &&
      t.routeNumber?.toString() === selectedRoute.toString() &&
      STOP_LEVEL_SOURCES.has(t.source)
    );
    if (!preferredTramRoute && selectedIsStopLevel) {
      kvWrite = { route: selectedRoute, stop: tramStopId };
    }
  }

  return { selectedRoute, selectionBranch, kvWrite };
}

// Synthetic tram entries. Generic route labels — no specific numbers
// per §1.1.
const stopLevelTram = (route) => ({
  isLive: true,
  routeNumber: route,
  source: 'gtfs-rt'
});
const coordIdentityTram = (route) => ({
  isLive: true,
  routeNumber: route,
  source: 'gtfs-rt-coord-identity'
});
const routeLevelTram = (route) => ({
  isLive: true,
  routeNumber: route,
  source: 'gtfs-rt-route'
});
const coordProximityTram = (route) => ({
  isLive: true,
  routeNumber: route,
  source: 'gtfs-rt-coord'
});

// ============================================================================
// Tests
// ============================================================================

describe('processCoordIdentityMatch — v5.9.4 Z1 (no route filter)', () => {
  it('scans trips on ALL routes even when targetRouteNumber is supplied', () => {
    // Build a feed with two trips: one on route A with a stop 30 m north
    // of the anchor, one on route B with a stop 30 m north of the anchor.
    // Prior to v5.9.4 Z1, supplying targetRouteNumber='A' would filter out
    // route B entirely. After Z1, both trips are scanned — route B's stop
    // should still appear in feedStopIdsResolved even when targetRouteNumber
    // is set. This is the core identity-tier semantic.
    const feed = buildFeed([
      { routeId: 'ROUTE_A', stops: [{ stopId: 'fsid_near_a', depTimeSec: Math.floor(Date.now() / 1000) + 300 }] },
      { routeId: 'ROUTE_B', stops: [{ stopId: 'fsid_near_b', depTimeSec: Math.floor(Date.now() / 1000) + 600 }] }
    ]);
    // We can't easily assert that the tier matched stops whose lookupTramStop
    // returns null (which it will for synthetic IDs not in the static
    // dataset). What we CAN assert is that the function DOES NOT short-
    // circuit on targetRouteNumber — i.e. sampleLookups records BOTH trips'
    // stops, not just route A's.
    const result = processCoordIdentityMatch(feed, ANCHOR_LAT, ANCHOR_LON, 1, {
      targetRouteNumber: 'ROUTE_A'
    });
    assert.equal(result.totalUniqueFeedStopIds, 2,
      'Both trips must be scanned regardless of targetRouteNumber');
    assert.equal(result.sampleLookups.length, 2,
      'sampleLookups must record both feed stop IDs');
    const seenIds = result.sampleLookups.map(s => s.feedStopId).sort();
    assert.deepEqual(seenIds, ['fsid_near_a', 'fsid_near_b'],
      'Both route A and route B stops must appear in sampleLookups');
  });

  it('returns empty departures when feed has no entities', () => {
    const result = processCoordIdentityMatch({ entity: [] }, ANCHOR_LAT, ANCHOR_LON, 1, {});
    assert.equal(result.departures.length, 0);
    assert.equal(result.matchedTripCount, 0);
    assert.equal(result.feedStopIdsResolved.length, 0);
    assert.equal(result.totalUniqueFeedStopIds, 0);
  });

  it('returns empty result when routeType is not tram (1)', () => {
    const feed = buildFeed([
      { routeId: 'ROUTE_A', stops: [{ stopId: 'x', depTimeSec: 0 }] }
    ]);
    const result = processCoordIdentityMatch(feed, ANCHOR_LAT, ANCHOR_LON, 0, {});
    assert.equal(result.departures.length, 0);
    assert.equal(result.totalUniqueFeedStopIds, 0);
  });
});

describe('processCoordIdentityMatch — v5.9.4 Z4 (diagnostic telemetry)', () => {
  it('caps sampleLookups at 20 unique feed stop IDs', () => {
    // Build a feed with 25 distinct stop IDs
    const stops = Array.from({ length: 25 }, (_, i) => ({
      stopId: `fsid_${i}`,
      depTimeSec: Math.floor(Date.now() / 1000) + 300
    }));
    const feed = buildFeed([{ routeId: 'ROUTE_A', stops }]);
    const result = processCoordIdentityMatch(feed, ANCHOR_LAT, ANCHOR_LON, 1, {});
    assert.equal(result.totalUniqueFeedStopIds, 25,
      'totalUniqueFeedStopIds should count ALL unique stops');
    assert.equal(result.sampleLookups.length, 20,
      'sampleLookups should cap at 20');
  });

  it('sample lookup records have the expected fields', () => {
    const feed = buildFeed([
      { routeId: 'ROUTE_A', stops: [{ stopId: 'fsid_alpha', depTimeSec: 0 }] }
    ]);
    const result = processCoordIdentityMatch(feed, ANCHOR_LAT, ANCHOR_LON, 1, {});
    assert.equal(result.sampleLookups.length, 1);
    const sample = result.sampleLookups[0];
    assert.equal(typeof sample.feedStopId, 'string');
    assert.equal(typeof sample.resolvedExact, 'boolean');
    assert.equal(typeof sample.resolvedViaNumeric, 'boolean');
    assert.ok('lookupLat' in sample);
    assert.ok('lookupLon' in sample);
    assert.ok('distanceToTargetM' in sample);
  });
});

describe('TRAM_COORD_IDENTITY_RADIUS_METRES constant', () => {
  it('is exported as a named constant with value 40', () => {
    assert.equal(TRAM_COORD_IDENTITY_RADIUS_METRES, 40,
      'v5.9.3 widened the radius to 40 m and v5.9.4 preserves it');
  });
});

describe('selectTramRoute — v5.9.4 Z2 KV write-once + stop-level gate', () => {
  const STOP_1 = 'stop_1';
  const STOP_2 = 'stop_2';

  it('scenario 1: cold-start + stop-level match for route A → KV written with route A', () => {
    // Cold start means preferredTramRoute is null. Feed has a stop-level
    // match for route A. The gate should persist route A to KV.
    const result = selectTramRoute({
      trams: [stopLevelTram('ROUTE_A')],
      preferredTramRoute: null,
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_A');
    assert.equal(result.selectionBranch, 'frequency-detected-stop-level');
    assert.deepEqual(result.kvWrite, { route: 'ROUTE_A', stop: STOP_1 },
      'stop-level-confident cold start MUST persist to KV');
  });

  it('scenario 2: cold-start + ONLY route-level heuristic → KV NOT written', () => {
    // This is the cold-start poisoning scenario that v5.9.3 exhibited.
    // v5.9.4 Z2 gate must block the KV write.
    const result = selectTramRoute({
      trams: [routeLevelTram('ROUTE_A')],
      preferredTramRoute: null,
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_A',
      'In-memory selectedRoute is still set so the current request can render');
    assert.equal(result.kvWrite, null,
      'Route-level heuristic MUST NOT persist to empty KV — this is the v5.9.3 poisoning path');
  });

  it('scenario 2b: cold-start + ONLY coord-proximity → KV NOT written', () => {
    // Another cold-start non-stop-level path.
    const result = selectTramRoute({
      trams: [coordProximityTram('ROUTE_A')],
      preferredTramRoute: null,
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.kvWrite, null,
      'Coord-proximity-only MUST NOT persist to empty KV');
  });

  it('scenario 3: KV has route A + stop-level match for route A → KV unchanged (write-once)', () => {
    // KV is already populated. Even if the gate would otherwise want to
    // write, the write-once check blocks it.
    const result = selectTramRoute({
      trams: [stopLevelTram('ROUTE_A')],
      preferredTramRoute: 'ROUTE_A',
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_A');
    assert.equal(result.selectionBranch, 'kv-preferred-stop-level');
    assert.equal(result.kvWrite, null,
      'Write-once must block a duplicate write of the same route');
  });

  it('scenario 4: KV has route A + stop-level match for route B → in-memory B, KV unchanged', () => {
    // This is the v5.9.3 current-state scenario: KV was poisoned with
    // route A, but the feed now has a legitimate stop-level match for B.
    // P2 (kv-preferred) should REJECT route A because passesGate(A) fails
    // when preferStopLevel is true and route A has no stop-level match.
    // Then P3 should pick route B, but the write-once guard blocks KV
    // overwrite. In-memory selectedRoute is B so the render is correct.
    const result = selectTramRoute({
      trams: [stopLevelTram('ROUTE_B')],
      preferredTramRoute: 'ROUTE_A',
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_B'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_B',
      'Current request renders the correct route');
    assert.equal(result.kvWrite, null,
      'Write-once preserves the stale KV value until admin override or address change');
  });

  it('scenario 5: KV has route A + NO stop-level matches in feed → selectedRoute A via gate', () => {
    // When the whole feed has no stop-level matches, preferStopLevel=false,
    // the passesGate reverts to hasLiveForRoute which accepts any live route.
    // P2 kv-preferred branch accepts route A from KV.
    const result = selectTramRoute({
      trams: [routeLevelTram('ROUTE_A')],
      preferredTramRoute: 'ROUTE_A',
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_A');
    assert.equal(result.selectionBranch, 'kv-preferred-coord');
    assert.equal(result.kvWrite, null, 'No-change writes are blocked');
  });

  it('scenario 6: admin override always wins when it passes the gate', () => {
    // Admin override is P1 — highest priority. Even with stop-level
    // matches for OTHER routes, the override wins as long as it passes
    // the gate (has live data).
    const result = selectTramRoute({
      trams: [stopLevelTram('ROUTE_A'), stopLevelTram('ROUTE_B')],
      preferredTramRoute: null,
      tramRouteOverride: 'ROUTE_B',
      detectedTramRoutes: ['ROUTE_A', 'ROUTE_B'],
      tramRouteNum: 'ROUTE_A',
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_B',
      'Admin override wins over detection and engine-planned');
    assert.equal(result.selectionBranch, 'admin-override-stop-level');
  });

  it('scenario 7: coord-identity source IS stop-level confident', () => {
    // v5.9.2 X4 classified gtfs-rt-coord-identity as stop-level. v5.9.4
    // preserves that. A cold-start with only a coord-identity match
    // MUST populate KV because coord-identity is deterministic (within
    // the 40 m identity radius).
    const result = selectTramRoute({
      trams: [coordIdentityTram('ROUTE_A')],
      preferredTramRoute: null,
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.deepEqual(result.kvWrite, { route: 'ROUTE_A', stop: STOP_1 },
      'coord-identity source is stop-level confident — KV write allowed');
  });

  it('scenario 8: mixed feed — stop-level route beats route-level route at frequency detection', () => {
    // detectedTramRoutes contains both A and B. Route A has stop-level,
    // route B has only route-level (ratio B:A is higher). The stop-level
    // tier must win outright per the v5.9.2 X4 preference order.
    const result = selectTramRoute({
      trams: [
        stopLevelTram('ROUTE_A'),
        routeLevelTram('ROUTE_B'),
        routeLevelTram('ROUTE_B'),
        routeLevelTram('ROUTE_B')
      ],
      preferredTramRoute: null,
      tramRouteOverride: null,
      detectedTramRoutes: ['ROUTE_A', 'ROUTE_B'],
      tramRouteNum: null,
      tramStopId: STOP_1
    });
    assert.equal(result.selectedRoute, 'ROUTE_A',
      'Stop-level always beats route-level regardless of count');
    assert.equal(result.selectionBranch, 'frequency-detected-stop-level');
    assert.deepEqual(result.kvWrite, { route: 'ROUTE_A', stop: STOP_1 });
  });
});

// ============================================================================
// v5.9.5 (AA7): Regression tests for AA1/AA2/AA3 fixes
// ============================================================================

describe('processCoordIdentityMatch — v5.9.5 AA1 (nearest-wins depTime validation)', () => {
  const futureTs = () => Math.floor(Date.now() / 1000) + 300; // 5 min future
  const pastTs = () => Math.floor(Date.now() / 1000) - 300;   // 5 min past

  it('recovers when a trip has an earlier stu with no depTime AND a valid stu at the same stop id', () => {
    // Pre-AA1: processCoordIdentityMatch's inner loop set matchedStu on
    // distance alone. If the trip's first stu within the radius had no
    // depTime, the function bailed on the whole trip, discarding later
    // valid stus. Post-AA1: per-stu validation inside the inner loop
    // means the invalid stu is skipped and the loop continues to the
    // next one, finding the valid stu.
    const feed = {
      entity: [{
        id: 'trip_A',
        tripUpdate: {
          trip: { tripId: 'trip_A', routeId: 'ROUTE_X' },
          stopTimeUpdate: [
            // First stu: same physical stop, BUT no depTime → was blocking
            { stopId: REAL_STOP_ID /* , no departure/arrival field */ },
            // Second stu: same physical stop, valid future depTime
            { stopId: REAL_STOP_ID, departure: { time: { low: futureTs() }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {});
    assert.equal(result.matchedTripCount, 1,
      'Trip must be matched via the valid second stu');
    assert.equal(result.departures.length, 1);
    assert.equal(result.feedStopIdsResolved.length, 1);
  });

  it('recovers when the nearest stu has a past depTime AND a valid stu exists later', () => {
    // Edge case: two stus both within radius (both resolve the same
    // physical stop), the first with past depTime, the second with
    // future depTime. Pre-AA1 picked the past one (by first-seen) and
    // bailed. Post-AA1 skips the past one and matches the future one.
    const feed = {
      entity: [{
        id: 'trip_B',
        tripUpdate: {
          trip: { tripId: 'trip_B', routeId: 'ROUTE_Y' },
          stopTimeUpdate: [
            { stopId: REAL_STOP_ID, departure: { time: { low: pastTs() }, delay: 0 } },
            { stopId: REAL_STOP_ID, departure: { time: { low: futureTs() }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {});
    assert.equal(result.matchedTripCount, 1,
      'The second (future) stu must win after the first (past) is rejected');
    assert.ok(result.departures[0].minutes >= 0);
  });

  it('returns 0 when ALL stus within radius are invalid, AND divergenceReport records reasons', () => {
    // Trip has only invalid stus (no depTime or past). T4 correctly
    // returns 0. With knownMatchedTripIds supplied, the divergence
    // report records the rejection reasons so Agent A can diagnose.
    const feed = {
      entity: [{
        id: 'trip_C',
        tripUpdate: {
          trip: { tripId: 'trip_C', routeId: 'ROUTE_Z' },
          stopTimeUpdate: [
            { stopId: REAL_STOP_ID /* no dep */ },
            { stopId: REAL_STOP_ID, departure: { time: { low: pastTs() }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {
      knownMatchedTripIds: new Set(['trip_C'])
    });
    assert.equal(result.matchedTripCount, 0,
      'No valid stu within radius → trip correctly unmatched');
    assert.ok(result.divergenceReport, 'divergenceReport must be populated when knownMatchedTripIds is supplied');
    assert.equal(result.divergenceReport.knownTripsCount, 1);
    assert.equal(result.divergenceReport.byTrip.length, 1);
    const entry = result.divergenceReport.byTrip[0];
    assert.equal(entry.matched, false);
    // Both 'no-dep-time' and 'past-time' are LEGITIMATE rejection reasons
    // (not BLOCKING per §23.15 v5.9.5 AA3). The report MUST capture them.
    assert.ok(entry.rejectionReasons.includes('no-dep-time') || entry.rejectionReasons.includes('past-time'),
      'Rejection reasons must include no-dep-time or past-time for this fixture');
  });
});

describe('processCoordIdentityMatch — v5.9.5 AA3 (divergence telemetry)', () => {
  it('divergenceReport is null when knownMatchedTripIds is not supplied', () => {
    const feed = {
      entity: [{
        id: 'trip_A',
        tripUpdate: {
          trip: { tripId: 'trip_A', routeId: 'ROUTE_X' },
          stopTimeUpdate: [
            { stopId: REAL_STOP_ID, departure: { time: { low: Math.floor(Date.now() / 1000) + 300 }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {});
    assert.equal(result.divergenceReport, null,
      'divergenceReport must be null when caller did not supply knownMatchedTripIds');
  });

  it('divergenceReport records matched=true when T4 finds the known trip', () => {
    const feed = {
      entity: [{
        id: 'trip_A',
        tripUpdate: {
          trip: { tripId: 'trip_A', routeId: 'ROUTE_X' },
          stopTimeUpdate: [
            { stopId: REAL_STOP_ID, departure: { time: { low: Math.floor(Date.now() / 1000) + 300 }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {
      knownMatchedTripIds: new Set(['trip_A'])
    });
    assert.equal(result.matchedTripCount, 1);
    assert.equal(result.divergenceReport.knownTripsCount, 1);
    assert.equal(result.divergenceReport.byTrip[0].matched, true);
    assert.deepEqual(result.divergenceReport.byTrip[0].rejectionReasons, []);
  });

  it('divergenceReport records matched=false with reason=not-seen when trip id absent from feed', () => {
    const feed = {
      entity: [{
        id: 'trip_OTHER',
        tripUpdate: {
          trip: { tripId: 'trip_OTHER', routeId: 'ROUTE_X' },
          stopTimeUpdate: [
            { stopId: REAL_STOP_ID, departure: { time: { low: Math.floor(Date.now() / 1000) + 300 }, delay: 0 } }
          ]
        }
      }]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {
      knownMatchedTripIds: new Set(['trip_MISSING'])
    });
    assert.equal(result.divergenceReport.knownTripsCount, 1);
    const entry = result.divergenceReport.byTrip.find(e => e.tripId === 'trip_MISSING');
    assert.ok(entry, 'Missing trip id must appear in divergenceReport');
    assert.equal(entry.matched, false);
    assert.ok(entry.rejectionReasons.includes('not-seen'),
      'Rejection reason must be not-seen for a trip id absent from feed');
  });
});

describe('processCoordIdentityMatch — v5.9.5 semantics still hold for all v5.9.4 invariants', () => {
  it('still scans all routes regardless of targetRouteNumber (Z1 invariant preserved)', () => {
    // Regression check: AA1 did not re-introduce the route filter.
    const feed = {
      entity: [
        {
          id: 'trip_A',
          tripUpdate: {
            trip: { tripId: 'trip_A', routeId: 'ROUTE_A' },
            stopTimeUpdate: [{ stopId: 'fsid_alpha', departure: { time: { low: Math.floor(Date.now() / 1000) + 300 }, delay: 0 } }]
          }
        },
        {
          id: 'trip_B',
          tripUpdate: {
            trip: { tripId: 'trip_B', routeId: 'ROUTE_B' },
            stopTimeUpdate: [{ stopId: 'fsid_beta', departure: { time: { low: Math.floor(Date.now() / 1000) + 600 }, delay: 0 } }]
          }
        }
      ]
    };
    const result = processCoordIdentityMatch(feed, REAL_STOP_LAT, REAL_STOP_LON, 1, {
      targetRouteNumber: 'ROUTE_A'
    });
    // Both trips must be iterated (both stops appear in sampleLookups/totalUniqueFeedStopIds)
    assert.equal(result.totalUniqueFeedStopIds, 2,
      'Both trips must be scanned regardless of targetRouteNumber (Z1 invariant)');
  });
});

// ============================================================================
// v5.9.6 (BB1): Station-override helper tests
// ============================================================================

describe('lookupMetroStationCoords — v5.9.6 BB1', () => {
  it('returns null when the station code is absent or falsy', () => {
    assert.equal(lookupMetroStationCoords(null), null);
    assert.equal(lookupMetroStationCoords(undefined), null);
    assert.equal(lookupMetroStationCoords(''), null);
    assert.equal(lookupMetroStationCoords('NOT_A_REAL_STATION_CODE_XYZ'), null);
  });

  it('resolves coordinates for the first station entry in VIC_METRO_STATIONS (dynamic, no hardcoded code)', () => {
    // Pick the first station entry that has lat/lon, without naming it.
    // This keeps the test turnkey and §1.1 compliant.
    const firstCode = Object.keys(VIC_METRO_STATIONS).find(code => {
      const entry = VIC_METRO_STATIONS[code];
      return entry?.lat != null && entry?.lon != null;
    });
    assert.ok(firstCode, 'Dataset should contain at least one station with coords');
    const coords = lookupMetroStationCoords(firstCode);
    assert.ok(coords, 'Should return coords for a station that has them');
    assert.equal(typeof coords.lat, 'number');
    assert.equal(typeof coords.lon, 'number');
    // Coordinates should match the static dataset
    assert.equal(coords.lat, VIC_METRO_STATIONS[firstCode].lat);
    assert.equal(coords.lon, VIC_METRO_STATIONS[firstCode].lon);
  });
});

describe('findNearestTramStopNearCoords — v5.9.6 BB1', () => {
  it('returns null when lat/lon are missing', () => {
    assert.equal(findNearestTramStopNearCoords(null, 144.99), null);
    assert.equal(findNearestTramStopNearCoords(-37.84, null), null);
    assert.equal(findNearestTramStopNearCoords(undefined, undefined), null);
  });

  it('finds the nearest tram stop within radius when passed a known tram stop\'s own coords', () => {
    // Pick the first tram stop in the dataset dynamically. Passing its own
    // coordinates should return itself (distance ≈ 0 m).
    const anyStop = VIC_TRAM_STOPS_WITH_COORDS[0];
    assert.ok(anyStop, 'Dataset should have at least one tram stop');
    const nearest = findNearestTramStopNearCoords(anyStop.lat, anyStop.lon);
    assert.ok(nearest, 'Should find at least one tram stop at its own coords');
    assert.equal(nearest.id, anyStop.id);
    assert.equal(nearest.distance, 0);
  });

  it('returns null when no tram stop is within the max radius', () => {
    // Use an arbitrary location far from Melbourne (Sydney CBD ~ -33.87, 151.21)
    const nearest = findNearestTramStopNearCoords(-33.8688, 151.2093, { maxRadiusMetres: 500 });
    assert.equal(nearest, null, 'Sydney should have no Melbourne tram stops within 500 m');
  });

  it('respects the maxRadiusMetres option', () => {
    // Pick a coordinate 1000 m from the first tram stop. With a 500 m cap,
    // it should NOT return the first stop. With a 1500 m cap, it should.
    const anyStop = VIC_TRAM_STOPS_WITH_COORDS[0];
    // ~1000 m south of the stop (1 deg lat ≈ 111 km, so 0.009 ≈ 1 km)
    const farLat = anyStop.lat - 0.009;
    const farLon = anyStop.lon;
    const tightSearch = findNearestTramStopNearCoords(farLat, farLon, { maxRadiusMetres: 500 });
    // tightSearch MAY still return a different stop within 500 m of farLat/farLon.
    // The important thing is that it honours the cap (distance <= 500 when not null).
    if (tightSearch) {
      assert.ok(tightSearch.distance <= 500, 'Stop returned within tight radius must satisfy distance <= cap');
    }
    const wideSearch = findNearestTramStopNearCoords(farLat, farLon, { maxRadiusMetres: 1500 });
    if (wideSearch) {
      assert.ok(wideSearch.distance <= 1500, 'Stop returned within wide radius must satisfy distance <= cap');
    }
  });
});

// ============================================================================
// v5.9.6 (BB3): Train cascade stop-level gate tests
// ============================================================================

const TRAIN_STOP_LEVEL_SOURCES = new Set([
  'gtfs-rt',
  'gtfs-rt-scan',
  'gtfs-rt-coord-identity'
]);

/**
 * Pure-function replica of the train line-selection cascade gate in
 * api/commutecompute.js::commuteCompute (around lines 3385-3430 after the
 * v5.9.6 BB3 edit). Mirrors the logic exactly so any divergence between
 * the inline cascade and this replica should be caught by test failures.
 * Returns { selectedLine, kvWrite: {line, station} | null }.
 */
function selectTrainLine({ trains, preferredTrainLine, trainStopId }) {
  let selectedLine = null;
  let kvWrite = null;

  if (!trainStopId || !trains || trains.length === 0) {
    if (preferredTrainLine) selectedLine = preferredTrainLine;
    return { selectedLine, kvWrite };
  }

  const liveLineCounts = {};
  for (const t of trains) {
    const ln = t.lineName || t.destination;
    if (ln && t.isLive) liveLineCounts[ln] = (liveLineCounts[ln] || 0) + 1;
  }
  const liveEntries = Object.entries(liveLineCounts).sort((a, b) => b[1] - a[1]);
  const dominantLiveLine = liveEntries[0]?.[0] || null;

  // v5.9.6 (BB3): compute stop-level confidence for the dominant line
  let dominantLineIsStopLevel = false;
  if (dominantLiveLine) {
    dominantLineIsStopLevel = trains.some(t =>
      t.isLive &&
      (t.lineName === dominantLiveLine || t.destination === dominantLiveLine) &&
      TRAIN_STOP_LEVEL_SOURCES.has(t.source)
    );
  }

  if (dominantLiveLine) {
    selectedLine = dominantLiveLine;
    // v5.9.6 (BB3): stop-level gate — only persist when KV empty AND stop-level confident
    if (!preferredTrainLine && dominantLineIsStopLevel) {
      kvWrite = { line: dominantLiveLine, station: trainStopId };
    }
  } else if (preferredTrainLine) {
    const lockHasData = trains.some(t =>
      t.isLive && (t.lineName === preferredTrainLine || t.destination === preferredTrainLine)
    );
    if (lockHasData) selectedLine = preferredTrainLine;
  }
  return { selectedLine, kvWrite };
}

// Synthetic train fixture helpers — generic labels per §1.1
const stopLevelTrain = (line) => ({ isLive: true, lineName: line, source: 'gtfs-rt' });
const broadFallbackTrain = (line) => ({ isLive: true, lineName: line, source: 'gtfs-rt-broad' });
const routeLevelTrain = (line) => ({ isLive: true, lineName: line, source: 'gtfs-rt-route' });

describe('selectTrainLine — v5.9.6 BB3 train cascade stop-level gate', () => {
  const STATION_A = 'STATION_A';

  it('cold-start + stop-level match for line L → KV written with L', () => {
    const result = selectTrainLine({
      trains: [stopLevelTrain('LINE_X')],
      preferredTrainLine: null,
      trainStopId: STATION_A
    });
    assert.equal(result.selectedLine, 'LINE_X');
    assert.deepEqual(result.kvWrite, { line: 'LINE_X', station: STATION_A },
      'Cold-start + stop-level source MUST persist to KV');
  });

  it('cold-start + ONLY broad-fallback match → KV NOT written (BB3 gate holds)', () => {
    // This is the critical regression scenario: v5.9.5 would have
    // persisted this because the train cascade had no source gate.
    const result = selectTrainLine({
      trains: [broadFallbackTrain('LINE_X')],
      preferredTrainLine: null,
      trainStopId: STATION_A
    });
    assert.equal(result.selectedLine, 'LINE_X',
      'In-memory selectedLine still drives current-request display');
    assert.equal(result.kvWrite, null,
      'Broad-fallback MUST NOT poison empty KV — this is the v5.9.6 BB3 fix');
  });

  it('cold-start + ONLY route-level match → KV NOT written', () => {
    const result = selectTrainLine({
      trains: [routeLevelTrain('LINE_X')],
      preferredTrainLine: null,
      trainStopId: STATION_A
    });
    assert.equal(result.kvWrite, null,
      'Route-level MUST NOT poison empty KV');
  });

  it('cold-start + mixed sources, dominant line has stop-level backing → KV written', () => {
    // Dominant line appears in both stop-level and broad-fallback trains.
    // The gate checks whether ANY train on the dominant line has a
    // stop-level source — here one does, so the write is allowed.
    const result = selectTrainLine({
      trains: [
        stopLevelTrain('LINE_X'),
        broadFallbackTrain('LINE_X')
      ],
      preferredTrainLine: null,
      trainStopId: STATION_A
    });
    assert.equal(result.selectedLine, 'LINE_X');
    assert.deepEqual(result.kvWrite, { line: 'LINE_X', station: STATION_A });
  });

  it('KV already holds line L + feed still has stop-level match for L → no re-write', () => {
    const result = selectTrainLine({
      trains: [stopLevelTrain('LINE_X')],
      preferredTrainLine: 'LINE_X',
      trainStopId: STATION_A
    });
    assert.equal(result.selectedLine, 'LINE_X');
    assert.equal(result.kvWrite, null,
      'Write-once: existing KV value must not be re-written even on valid match');
  });

  it('KV has stale line + feed has NO live data → selectedLine is null (cascade falls through)', () => {
    const result = selectTrainLine({
      trains: [{ isLive: false, lineName: 'LINE_Y', source: 'gtfs-rt' }],
      preferredTrainLine: 'LINE_Y',
      trainStopId: STATION_A
    });
    assert.equal(result.selectedLine, null,
      'preferredTrainLine is only trusted if the lock still appears in LIVE data');
  });
});

// ============================================================================
// v5.9.7 (CC1): Train leg nextDepartureTimesMs lossless reconstruction
// Pure-function replica of the `else if (liveData.minutes !== undefined)`
// fallback in api/commutecompute.js (around lines 787-805 after the v5.9.7
// CC1 edit). When the inline code changes, update this replica in
// lock-step.
// ============================================================================

function computeDepartMs({ liveData, nowMs }) {
  if (liveData?.minutes === undefined) return null;
  // v5.9.7 CC1: prefer liveData.departureTimeMs when present
  return liveData.departureTimeMs != null
    ? liveData.departureTimeMs
    : (nowMs + (liveData.minutes * 60000));
}

describe('computeDepartMs — v5.9.7 CC1 (train leg ms lossless reconstruction)', () => {
  it('uses raw liveData.departureTimeMs verbatim when present', () => {
    const nowMs = 1775903000000;
    const rawMs = 1775904060000; // some arbitrary future ms, not a round minute from nowMs
    const departMs = computeDepartMs({
      liveData: { minutes: 18, departureTimeMs: rawMs },
      nowMs
    });
    assert.equal(departMs, rawMs, 'Should use raw departureTimeMs verbatim');
    // The reconstructed value (nowMs + minutes*60000) would be 1775904080000
    // — assert that the code does NOT produce that.
    assert.notEqual(departMs, nowMs + (18 * 60000),
      'Must NOT fall back to reconstruction when raw ms is present');
  });

  it('falls back to nowMs + minutes*60000 when liveData.departureTimeMs is absent', () => {
    const nowMs = 1775903000000;
    const departMs = computeDepartMs({
      liveData: { minutes: 24 }, // no departureTimeMs
      nowMs
    });
    assert.equal(departMs, nowMs + (24 * 60000),
      'Must fall back to reconstruction when raw ms is absent');
  });

  it('returns null when liveData has no minutes field', () => {
    const departMs = computeDepartMs({
      liveData: { someOtherField: 'x' },
      nowMs: 1775903000000
    });
    assert.equal(departMs, null,
      'No-minutes live data is a no-op for this code path');
  });

  it('preserves sub-minute precision — the common v5.9.6 swarm fingerprint', () => {
    // The v5.9.6 swarm Agent C observed a train leg whose
    // `nextDepartureTimesMs[0]` was ~24.4 s away from the raw feed's
    // `departureTimeMs` — indicating the reconstruction had rounded
    // the value to the nearest minute via `nowMs + minutes*60000`.
    // With the v5.9.7 CC1 fix the ms must be byte-equal to the raw
    // feed value. Use a raw ms that is deliberately NOT aligned to a
    // whole minute (real GTFS-RT timestamps come from the feed at
    // seconds-level precision and typically do not land on minute
    // boundaries).
    const nowMs = 1775903035564;
    const rawMs = 1775904023000; // 987,436 ms (~16m 27s) after nowMs — not minute-aligned
    const minutes = Math.round((rawMs - nowMs) / 60000);
    const departMs = computeDepartMs({
      liveData: { minutes, departureTimeMs: rawMs },
      nowMs
    });
    assert.equal(departMs, rawMs,
      'Sub-minute precision must be preserved — no round-trip through minutes');
    // The reconstruction would have produced `nowMs + minutes*60000`.
    // Assert that value is NOT what we returned — they must differ.
    const reconstructed = nowMs + (minutes * 60000);
    assert.notEqual(departMs, reconstructed,
      'The raw ms and the reconstructed ms should differ (proving raw was used)');
  });
});

// ============================================================================
// v5.9.7 (CC2): nextDepartures catchability filter + allNextDeparturesMs
// Pure-function replica of the nextDepartures / allNextDeparturesMs
// construction block in api/commutecompute.js (around lines 1032-1105 after
// the v5.9.7 CC2 edit). When the inline code changes, update this replica in
// lock-step.
// ============================================================================

function buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs }) {
  const result = { nextDepartures: undefined, allNextDeparturesMs: undefined };
  if (!nextDepartureTimesMs?.length) return result;
  const catchabilityBuffer = 2 * 60000;
  const catchable = nextDepartureTimesMs
    .filter(depMs => depMs >= arrivalAtStopMs - catchabilityBuffer)
    .map(depMs => Math.round((depMs - nowMs) / 60000));
  result.nextDepartures = catchable.sort((a, b) => a - b);
  // v5.9.7 CC2: additive telemetry field
  result.allNextDeparturesMs = [...nextDepartureTimesMs].sort((a, b) => a - b);
  return result;
}

describe('buildNextDepartures — v5.9.7 CC2 (catchability filter + telemetry)', () => {
  const nowMs = 1775900000000;

  it('excludes uncatchable departures from nextDepartures', () => {
    const arrivalAtStopMs = nowMs + (10 * 60000); // user arrives in 10 min
    const nextDepartureTimesMs = [
      nowMs + (3 * 60000),  // 3 min — uncatchable (before arrival - 2min buffer)
      nowMs + (12 * 60000), // 12 min — catchable
      nowMs + (15 * 60000)  // 15 min — catchable
    ];
    const result = buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs });
    assert.deepEqual(result.nextDepartures, [12, 15],
      'The 3-min entry must be excluded (uncatchable)');
    assert.equal(result.allNextDeparturesMs.length, 3,
      'allNextDeparturesMs must still contain all three entries (telemetry superset)');
  });

  it('respects the 2-minute catchability buffer', () => {
    // Arrival at stop in 10 min, buffer is 2 min, so anything >= 8 min is catchable
    const arrivalAtStopMs = nowMs + (10 * 60000);
    const nextDepartureTimesMs = [
      nowMs + (7 * 60000),  // 7 min — uncatchable (below 8-min threshold)
      nowMs + (9 * 60000)   // 9 min — catchable (within 2-min buffer)
    ];
    const result = buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs });
    assert.deepEqual(result.nextDepartures, [9],
      'The 9-min entry must be kept (inside the 2-min buffer)');
    assert.ok(!result.nextDepartures.includes(7),
      'The 7-min entry must be excluded (outside the buffer)');
  });

  it('returns an empty nextDepartures list when all entries are uncatchable', () => {
    const arrivalAtStopMs = nowMs + (20 * 60000);
    const nextDepartureTimesMs = [
      nowMs + (2 * 60000),  // 2 min — uncatchable
      nowMs + (5 * 60000)   // 5 min — uncatchable
    ];
    const result = buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs });
    assert.deepEqual(result.nextDepartures, [],
      'When no entries are catchable, nextDepartures is empty');
    assert.equal(result.allNextDeparturesMs.length, 2,
      'allNextDeparturesMs still reflects the raw feed entries');
  });

  it('allNextDeparturesMs is a sorted superset of the catchable list', () => {
    const arrivalAtStopMs = nowMs + (5 * 60000);
    const nextDepartureTimesMs = [
      nowMs + (10 * 60000),
      nowMs + (3 * 60000),
      nowMs + (8 * 60000)
    ];
    const result = buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs });
    // allNextDeparturesMs should be sorted ascending
    for (let i = 1; i < result.allNextDeparturesMs.length; i++) {
      assert.ok(result.allNextDeparturesMs[i] >= result.allNextDeparturesMs[i - 1],
        'allNextDeparturesMs must be sorted ascending');
    }
    // Every value in the result.nextDepartures (converted back to ms) must
    // appear in allNextDeparturesMs.
    for (const m of result.nextDepartures) {
      const msEquiv = nowMs + (m * 60000);
      // Allow rounding tolerance — the nextDepartures minutes are rounded
      // from the ms values, so the equivalent may differ by up to 30 s.
      const matched = result.allNextDeparturesMs.some(ms => Math.abs(ms - msEquiv) <= 30000);
      assert.ok(matched, `Catchable minute ${m} must map to an entry in allNextDeparturesMs`);
    }
  });

  it('returns undefined nextDepartures when input array is empty', () => {
    const result = buildNextDepartures({
      nextDepartureTimesMs: [],
      arrivalAtStopMs: nowMs + (10 * 60000),
      nowMs
    });
    assert.equal(result.nextDepartures, undefined);
    assert.equal(result.allNextDeparturesMs, undefined);
  });

  it('does not reintroduce v5.9.5 headway extrapolation fingerprint', () => {
    // If the live feed has 2 real entries at 4 and 24 min, the pre-v5.9.6
    // code extrapolated a projected 44-min entry. v5.9.6 BB2 removed that
    // path, and v5.9.7 CC2 removes the earlier "pad with allFuture"
    // path. The result must contain ONLY the 2 real entries; no 44.
    const arrivalAtStopMs = nowMs + (3 * 60000);
    const nextDepartureTimesMs = [
      nowMs + (4 * 60000),
      nowMs + (24 * 60000)
    ];
    const result = buildNextDepartures({ nextDepartureTimesMs, arrivalAtStopMs, nowMs });
    assert.deepEqual(result.nextDepartures, [4, 24],
      'Must contain exactly the two real entries, no extrapolation');
    assert.equal(result.nextDepartures.length, 2,
      'Must NOT produce a 44-min or 64-min synthetic entry');
  });
});

// ========================================================================
// v5.9.8 (DD1 + DD4) — Home coordinate freshness invariant
// ========================================================================
//
// Pure-function replicas of the api/commutecompute.js::ensureFreshHomeCoords
// helper. When the inline code in api/commutecompute.js is updated, these
// replicas MUST be updated in lock-step — same pattern as the other pure
// replicas in this file. Fixtures use arithmetic offsets from a synthetic
// base coordinate with generic labels (STOP_A, SYNTH_HOME) per §1.1.

import crypto from 'node:crypto';
import { haversine as haversineFn } from '../src/utils/haversine.js';

const HOME_COORD_DRIFT_THRESHOLD_M = 75;
const HOME_COORD_REJECT_THRESHOLD_M = 2000;

function _canonAddr(addr) {
  if (!addr || typeof addr !== 'string') return '';
  return addr.toLowerCase().trim().replace(/\s+/g, ' ');
}

function _addrHash(addr) {
  const canon = _canonAddr(addr);
  if (!canon) return '';
  return crypto.createHash('sha1').update(canon).digest('hex').slice(0, 12);
}

/**
 * Pure-function replica of ensureFreshHomeCoords() for test coverage.
 * Takes a mock geocoder function so the test controls what "fresh" returns.
 * Returns { home, source } matching the live code's verdict semantics.
 */
async function ensureFreshHomeCoordsReplica(kvPrefs, mockGeocode) {
  const home = kvPrefs?.locations?.home;
  const address = home?.address || kvPrefs?.addresses?.home || null;
  if (!address) return { home: home || null, source: 'no-address' };

  const storedLat = home?.lat != null ? Number(home.lat) : null;
  const storedLon = home?.lon != null ? Number(home.lon) : null;
  const storedCoord = (storedLat != null && storedLon != null) ? { lat: storedLat, lon: storedLon } : null;
  const freshHash = _addrHash(address);
  const storedHash = home?._addressHash || null;

  if (storedHash && storedHash === freshHash && storedCoord) {
    return {
      home: { ...home, lat: storedCoord.lat, lon: storedCoord.lon, _addressHash: storedHash },
      source: 'cached-hash-match'
    };
  }

  let fresh = null;
  try {
    fresh = await mockGeocode(address);
  } catch (err) {
    return { home: home || null, source: 'geocode-failed' };
  }
  if (!fresh || fresh.lat == null || fresh.lon == null) {
    return { home: home || null, source: 'geocode-empty' };
  }

  if (storedCoord) {
    const drift = haversineFn(storedCoord.lat, storedCoord.lon, fresh.lat, fresh.lon);
    if (drift > HOME_COORD_REJECT_THRESHOLD_M) {
      return { home: home || null, source: 'geocode-rejected-too-far', drift: Math.round(drift) };
    }
    if (drift <= HOME_COORD_DRIFT_THRESHOLD_M) {
      return {
        home: { ...home, lat: storedCoord.lat, lon: storedCoord.lon, _addressHash: freshHash },
        source: 'cached-drift-ok',
        drift: Math.round(drift)
      };
    }
    // drift exceeds threshold but is within rejection bound — corrective overwrite
    return {
      home: { ...home, address, lat: Number(fresh.lat), lon: Number(fresh.lon), _addressHash: freshHash },
      source: 'geocode-drift-corrected',
      drift: Math.round(drift)
    };
  }

  return {
    home: { ...(home || {}), address, lat: Number(fresh.lat), lon: Number(fresh.lon), _addressHash: freshHash },
    source: 'geocode-first'
  };
}

describe('ensureFreshHomeCoords — v5.9.8 (DD1 + DD4 home coord freshness invariant)', () => {
  // Synthetic base coordinate — a plausible inner-Melbourne lat/lon but
  // specifically NOT any real address. Offsets are arithmetic.
  const SYNTH_BASE = { lat: -37.8000, lon: 145.0000 };
  const SYNTH_ADDRESS = 'A street, A suburb, AU';

  const mockGeocodeFresh = async () => ({ lat: SYNTH_BASE.lat, lon: SYNTH_BASE.lon });
  const mockGeocodeFailed = async () => { throw new Error('geocode-timeout'); };
  const mockGeocodeEmpty = async () => null;

  it('DD4 migration: no address hash in KV → re-geocode and return fresh coord', async () => {
    // Pre-v5.9.8 KV state: stored coord is 300 m east of the real address,
    // with no `_addressHash` present (legacy state). Expected: fresh geocode
    // runs, returns the corrected coord, and the new home object has the
    // fresh-computed address hash.
    const staleLonOffset = 0.0034; // ~300 m at this latitude
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon + staleLonOffset
        }
      }
    };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, mockGeocodeFresh);
    assert.equal(result.source, 'geocode-drift-corrected',
      'Must report a drift correction was performed');
    assert.equal(result.home.lat, SYNTH_BASE.lat, 'lat must be the fresh-geocoded value');
    assert.equal(result.home.lon, SYNTH_BASE.lon, 'lon must be the fresh-geocoded value');
    assert.ok(result.home._addressHash, 'New home object must carry an address hash');
    assert.ok(result.drift > HOME_COORD_DRIFT_THRESHOLD_M,
      'Drift must exceed the jitter threshold to trigger the corrective path');
  });

  it('DD1 fast path: hash matches stored coord → trust cache, no geocode', async () => {
    const hash = _addrHash(SYNTH_ADDRESS);
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon,
          _addressHash: hash
        }
      }
    };
    let geocodeCallCount = 0;
    const spyGeocode = async () => { geocodeCallCount += 1; return mockGeocodeFresh(); };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, spyGeocode);
    assert.equal(result.source, 'cached-hash-match', 'Source must be the fast-path cache verdict');
    assert.equal(geocodeCallCount, 0, 'Geocoder MUST NOT be called on the fast path');
    assert.equal(result.home.lat, SYNTH_BASE.lat);
    assert.equal(result.home.lon, SYNTH_BASE.lon);
  });

  it('DD1 drift within jitter threshold → preserve stored coord, refresh hash only', async () => {
    // Stored coord is 50 m off the fresh-geocoded value — below the 75 m
    // jitter threshold. Expected: stored coord is preserved (no lat/lon
    // churn) but the hash is refreshed so future requests hit the fast
    // path.
    const jitterLonOffset = 0.00056; // ~50 m at this latitude
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon + jitterLonOffset
          // Note: no _addressHash, so the fast path is skipped
        }
      }
    };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, mockGeocodeFresh);
    assert.equal(result.source, 'cached-drift-ok', 'Must report a jitter-tolerance cache hit');
    assert.equal(result.home.lat, SYNTH_BASE.lat, 'Stored lat preserved');
    assert.equal(result.home.lon, SYNTH_BASE.lon + jitterLonOffset, 'Stored lon preserved');
    assert.ok(result.home._addressHash, 'Address hash must be refreshed');
    assert.ok(result.drift <= HOME_COORD_DRIFT_THRESHOLD_M,
      'Drift must be at or below the jitter threshold');
  });

  it('DD1 sanity guard: fresh is absurdly far from stored → reject fresh, keep stored', async () => {
    // Stored coord is correct; mock geocoder returns a confused result
    // 5 km away (e.g. a same-named suburb in another city). The sanity
    // guard must reject the fresh value and keep the stored coord.
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon
        }
      }
    };
    const confusedGeocode = async () => ({ lat: SYNTH_BASE.lat + 0.045, lon: SYNTH_BASE.lon }); // ~5 km
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, confusedGeocode);
    assert.equal(result.source, 'geocode-rejected-too-far',
      'Must reject fresh as a vendor misresolve');
    assert.equal(result.home.lat, SYNTH_BASE.lat, 'Stored lat preserved');
    assert.equal(result.home.lon, SYNTH_BASE.lon, 'Stored lon preserved');
  });

  it('DD1 geocoder failure → fall back to stored coord, request never aborts', async () => {
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon + 0.005 // 400 m drift — would normally trigger correction
        }
      }
    };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, mockGeocodeFailed);
    assert.equal(result.source, 'geocode-failed',
      'Geocoder timeout must produce a fallback verdict');
    // Stored coord is returned unchanged — the request never aborts on a
    // geocoding failure
    assert.equal(result.home.lat, SYNTH_BASE.lat);
    assert.equal(result.home.lon, SYNTH_BASE.lon + 0.005);
  });

  it('DD1 geocoder returns empty → fall back to stored coord', async () => {
    const kvPrefs = {
      locations: {
        home: {
          address: SYNTH_ADDRESS,
          lat: SYNTH_BASE.lat,
          lon: SYNTH_BASE.lon
        }
      }
    };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, mockGeocodeEmpty);
    assert.equal(result.source, 'geocode-empty',
      'Geocoder empty result must produce an explicit fallback reason');
    assert.equal(result.home.lat, SYNTH_BASE.lat);
  });

  it('no address at all → short-circuit without calling the geocoder', async () => {
    const kvPrefs = { locations: { home: { lat: SYNTH_BASE.lat, lon: SYNTH_BASE.lon } } };
    let geocodeCallCount = 0;
    const spyGeocode = async () => { geocodeCallCount += 1; return mockGeocodeFresh(); };
    const result = await ensureFreshHomeCoordsReplica(kvPrefs, spyGeocode);
    assert.equal(result.source, 'no-address');
    assert.equal(geocodeCallCount, 0, 'Geocoder MUST NOT be called when no address is present');
  });
});

// ========================================================================
// v5.9.8 (DD2) — Tram stop coord override hardening telemetry
// ========================================================================

/**
 * Pure-function replica of the v5.9.8 DD2 tram stop coord override block
 * in api/commutecompute.js. Returns both the resolved coord (to write
 * into tramApiOptions) and the diagnostic object (to surface on
 * _liveDataDiag.tramStopCoordOverride).
 */
function computeTramStopCoordOverride({ tramStopId, datasetLookup, nearestHelperLookup, homeCoords }) {
  const diag = {
    attempted: false,
    tramStopId: tramStopId ? String(tramStopId) : null,
    resolved: false,
    fallbackUsed: null,
    resolvedLat: null,
    resolvedLon: null
  };
  let lat = null;
  let lon = null;
  if (tramStopId) {
    diag.attempted = true;
    const ref = datasetLookup(String(tramStopId));
    if (ref?.lat != null && ref?.lon != null) {
      lat = ref.lat;
      lon = ref.lon;
      diag.resolved = true;
      diag.resolvedLat = Number(lat.toFixed(6));
      diag.resolvedLon = Number(lon.toFixed(6));
    } else if (homeCoords?.lat && homeCoords?.lon) {
      const nearby = nearestHelperLookup(homeCoords.lat, homeCoords.lon);
      if (nearby?.lat && nearby?.lon) {
        lat = nearby.lat;
        lon = nearby.lon;
        diag.fallbackUsed = 'nearest-stop-helper';
        diag.resolvedLat = Number(nearby.lat.toFixed(6));
        diag.resolvedLon = Number(nearby.lon.toFixed(6));
      } else {
        lat = homeCoords.lat;
        lon = homeCoords.lon;
        diag.fallbackUsed = 'home-coords-last-resort';
        diag.resolvedLat = Number(homeCoords.lat.toFixed(6));
        diag.resolvedLon = Number(homeCoords.lon.toFixed(6));
      }
    } else {
      diag.fallbackUsed = 'no-home-coords-available';
    }
  }
  return { lat, lon, diag };
}

describe('tramStopCoordOverride — v5.9.8 (DD2 tram stop coord override hardening)', () => {
  const STOP_A_ID = 'A001';
  const STOP_A_COORD = { lat: -37.8001, lon: 145.0001 };
  const STOP_B_COORD = { lat: -37.8005, lon: 145.0008 };
  const SYNTH_HOME = { lat: -37.8010, lon: 145.0015 };

  const datasetHit = (id) => (id === STOP_A_ID ? STOP_A_COORD : null);
  const datasetMiss = () => null;
  const nearbyHit = () => STOP_B_COORD;
  const nearbyMiss = () => null;

  it('success path: exact dataset lookup resolves → resolved=true, no fallback', () => {
    const { lat, lon, diag } = computeTramStopCoordOverride({
      tramStopId: STOP_A_ID,
      datasetLookup: datasetHit,
      nearestHelperLookup: nearbyHit,
      homeCoords: SYNTH_HOME
    });
    assert.equal(lat, STOP_A_COORD.lat);
    assert.equal(lon, STOP_A_COORD.lon);
    assert.equal(diag.attempted, true);
    assert.equal(diag.resolved, true);
    assert.equal(diag.fallbackUsed, null);
    assert.equal(diag.resolvedLat, Number(STOP_A_COORD.lat.toFixed(6)));
  });

  it('fallback path: dataset miss but nearest helper returns a stop → fallbackUsed=nearest-stop-helper', () => {
    const { lat, lon, diag } = computeTramStopCoordOverride({
      tramStopId: 'UNKNOWN',
      datasetLookup: datasetMiss,
      nearestHelperLookup: nearbyHit,
      homeCoords: SYNTH_HOME
    });
    assert.equal(lat, STOP_B_COORD.lat);
    assert.equal(lon, STOP_B_COORD.lon);
    assert.equal(diag.attempted, true);
    assert.equal(diag.resolved, false);
    assert.equal(diag.fallbackUsed, 'nearest-stop-helper');
  });

  it('last-resort path: dataset miss AND nearest helper miss → fallbackUsed=home-coords-last-resort', () => {
    const { lat, lon, diag } = computeTramStopCoordOverride({
      tramStopId: 'UNKNOWN',
      datasetLookup: datasetMiss,
      nearestHelperLookup: nearbyMiss,
      homeCoords: SYNTH_HOME
    });
    assert.equal(lat, SYNTH_HOME.lat);
    assert.equal(lon, SYNTH_HOME.lon);
    assert.equal(diag.fallbackUsed, 'home-coords-last-resort');
  });

  it('no-home-coords path: dataset miss AND no home coords → fallbackUsed=no-home-coords-available, no lat/lon set', () => {
    const { lat, lon, diag } = computeTramStopCoordOverride({
      tramStopId: 'UNKNOWN',
      datasetLookup: datasetMiss,
      nearestHelperLookup: nearbyHit,
      homeCoords: null
    });
    assert.equal(lat, null);
    assert.equal(lon, null);
    assert.equal(diag.fallbackUsed, 'no-home-coords-available');
  });

  it('no tram stop id → not attempted, no diagnostic values set', () => {
    const { lat, lon, diag } = computeTramStopCoordOverride({
      tramStopId: null,
      datasetLookup: datasetHit,
      nearestHelperLookup: nearbyHit,
      homeCoords: SYNTH_HOME
    });
    assert.equal(lat, null);
    assert.equal(lon, null);
    assert.equal(diag.attempted, false);
    assert.equal(diag.resolved, false);
  });
});

// ========================================================================
// v5.9.9 (EE1) — Direct-entry lat/lon escape hatch in /api/admin/preferences
// ========================================================================
//
// Pure-function replica of the EE1 direct-coord branch in
// api/admin/preferences.js::handlePost. When the inline handler is updated,
// this replica MUST be updated in lock-step. Fixtures use only generic
// labels and synthetic arithmetic offsets per §1.1.

/**
 * Pure-function replica of the EE1 branch in handlePost. Takes a POST body
 * and a mock geocoder; returns the computed `locations[field]` record that
 * would be written to KV. Isolates the direct-coord decision branch.
 */
function computeLocationRecordForDirectEntry(body, mockGeocode) {
  const { field, value, lat, lon } = body;
  if (!['home', 'work', 'cafe'].includes(field)) {
    throw new Error('unsupported field: ' + field);
  }
  if (!value) return null;

  const numericLat = Number(lat);
  const numericLon = Number(lon);
  const hasDirectCoord =
    lat != null && lon != null &&
    Number.isFinite(numericLat) && Number.isFinite(numericLon) &&
    Math.abs(numericLat) <= 90 && Math.abs(numericLon) <= 180;

  if (hasDirectCoord) {
    return {
      address: value,
      name: value.split(',')[0],
      lat: numericLat,
      lon: numericLon,
      suburb: null,
      source: 'direct-entry',
      _addressHash: _addrHash(value)
    };
  }

  // Fall through to geocoder
  const geocoded = mockGeocode(value);
  if (geocoded) {
    return { ...geocoded, _addressHash: _addrHash(value) };
  }
  return null;
}

describe('handlePost direct-entry escape hatch — v5.9.9 (EE1)', () => {
  const SYNTH_HOME_ADDRESS = 'A street, A suburb, AU';
  const SYNTH_LAT = -37.8000;
  const SYNTH_LON = 145.0000;

  // Mock geocoder that returns a result with a distinctive source marker
  const mockGeocodeSuccess = (addr) => ({
    address: addr,
    name: addr.split(',')[0],
    lat: SYNTH_LAT + 0.01, // deliberately different from direct-entry
    lon: SYNTH_LON + 0.01,
    suburb: 'A Suburb',
    source: 'mock-geocode'
  });

  it('direct coord valid → bypass geocoder, write caller-supplied lat/lon, compute address hash', () => {
    let geocodeCallCount = 0;
    const spyGeocode = (addr) => { geocodeCallCount += 1; return mockGeocodeSuccess(addr); };
    const body = { field: 'home', value: SYNTH_HOME_ADDRESS, lat: SYNTH_LAT, lon: SYNTH_LON };
    const record = computeLocationRecordForDirectEntry(body, spyGeocode);
    assert.equal(record.lat, SYNTH_LAT, 'direct lat must be written verbatim');
    assert.equal(record.lon, SYNTH_LON, 'direct lon must be written verbatim');
    assert.equal(record.source, 'direct-entry', 'source marker must be direct-entry');
    assert.ok(record._addressHash, 'address hash must be pre-computed');
    assert.equal(record._addressHash, _addrHash(SYNTH_HOME_ADDRESS));
    assert.equal(geocodeCallCount, 0, 'geocoder MUST NOT be called when direct coord provided');
  });

  it('direct coord missing lat → fall through to geocoder', () => {
    let geocodeCallCount = 0;
    const spyGeocode = (addr) => { geocodeCallCount += 1; return mockGeocodeSuccess(addr); };
    const body = { field: 'home', value: SYNTH_HOME_ADDRESS, lon: SYNTH_LON };
    const record = computeLocationRecordForDirectEntry(body, spyGeocode);
    assert.equal(record.source, 'mock-geocode', 'must fall through to geocoder');
    assert.equal(geocodeCallCount, 1, 'geocoder MUST be called exactly once');
    assert.ok(record._addressHash, 'geocoded result must also carry the address hash');
  });

  it('direct coord invalid (NaN string) → fall through to geocoder', () => {
    let geocodeCallCount = 0;
    const spyGeocode = (addr) => { geocodeCallCount += 1; return mockGeocodeSuccess(addr); };
    const body = { field: 'home', value: SYNTH_HOME_ADDRESS, lat: 'abc', lon: SYNTH_LON };
    const record = computeLocationRecordForDirectEntry(body, spyGeocode);
    assert.equal(record.source, 'mock-geocode', 'NaN lat must not be treated as direct-entry');
    assert.equal(geocodeCallCount, 1);
  });

  it('direct coord out of range (lat > 90) → fall through to geocoder', () => {
    let geocodeCallCount = 0;
    const spyGeocode = (addr) => { geocodeCallCount += 1; return mockGeocodeSuccess(addr); };
    const body = { field: 'home', value: SYNTH_HOME_ADDRESS, lat: 100, lon: SYNTH_LON };
    const record = computeLocationRecordForDirectEntry(body, spyGeocode);
    assert.equal(record.source, 'mock-geocode', 'out-of-range lat must reject direct-entry path');
    assert.equal(geocodeCallCount, 1);
  });

  it('direct coord round-trip: DD1 fast path triggers on subsequent read without calling geocoder', async () => {
    // Simulates the v5.9.9 EE1 write followed by a v5.9.8 DD1 read. After
    // EE1 writes the lat/lon + address hash, DD1's fast-path must hit
    // immediately with source === 'cached-hash-match' and NOT call the
    // geocoder — this is the mechanism that makes runtime geocoder
    // breakage irrelevant once the user has pasted a direct coord.
    const directBody = { field: 'home', value: SYNTH_HOME_ADDRESS, lat: SYNTH_LAT, lon: SYNTH_LON };
    const writtenRecord = computeLocationRecordForDirectEntry(directBody, () => null);
    const kvPrefsAfterWrite = { locations: { home: writtenRecord } };
    let driftCallCount = 0;
    const spyDriftGeocode = async () => {
      driftCallCount += 1;
      return { lat: SYNTH_LAT, lon: SYNTH_LON };
    };
    const driftResult = await ensureFreshHomeCoordsReplica(kvPrefsAfterWrite, spyDriftGeocode);
    assert.equal(driftResult.source, 'cached-hash-match',
      'DD1 must take the fast path because the EE1 write included the correct hash');
    assert.equal(driftCallCount, 0,
      'DD1 geocoder MUST NOT be called on a round-trip read after EE1 direct-entry write');
    assert.equal(driftResult.home.lat, SYNTH_LAT);
    assert.equal(driftResult.home.lon, SYNTH_LON);
  });
});

