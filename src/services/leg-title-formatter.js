/**
 * Leg Title Formatter — Shared between API and renderer
 *
 * v5.9.0 (T11): Previously the leg title was built twice — once in
 * api/commutecompute.js::buildLegTitle and again in ccdash-renderer.js::
 * getLegTitle — with subtly different logic. This module is the single
 * source of truth for every journey leg's display title.
 *
 * Also the home for:
 *   - T5 / B6: unconditional `\s+Station$` strip on tram destinations
 *     (trams do not enter stations; they stop at tram stops near stations)
 *   - T6 / B8: `Line` suffix handling for trains with a line name
 *   - Fallback defaults when live data has not populated a title yet
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/** Capitalise the first letter of a string. */
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Strip a trailing " Station" from a destination name. Tram legs should
 *  never carry " Station" because trams stop at tram stops — not inside
 *  train stations. Used by trams and buses only; trains keep " Station". */
function stripStation(name) {
  if (!name || typeof name !== 'string') return name;
  return name.replace(/\s+Station\s*$/i, '').trim();
}

/** Extract a short name from a location object or address string. */
function extractName(location) {
  if (!location) return null;
  if (location.name) return location.name;
  if (typeof location === 'string') {
    const parts = location.split(',');
    return parts[0]?.trim() || location;
  }
  if (location.address) {
    const parts = location.address.split(',');
    return parts[0]?.trim() || location.address;
  }
  return null;
}

/**
 * Canonical leg title formatter.
 * Produces the single display title used by both the API JSON response
 * and the server-side renderer.
 *
 * @param {Object} leg - A journey leg object
 * @returns {string} The formatted title
 */
export function formatLegTitle(leg) {
  if (!leg || !leg.type) return 'Continue';

  switch (leg.type) {
    case 'walk': {
      const dest = leg.to || leg.destination?.name;
      if (leg.destinationName) return `Walk to ${leg.destinationName}`;
      if (dest === 'cafe' && leg.cafeName) return `Walk to ${leg.cafeName}`;
      if (dest === 'cafe') return 'Walk to Cafe';
      if (dest === 'work') return `Walk to ${leg.workName || 'Office'}`;
      if (dest?.toLowerCase() === 'tram stop' && leg.stopName) return `Walk to ${leg.stopName}`;
      if ((dest?.toLowerCase() === 'train platform' || dest?.toLowerCase() === 'station') && leg.stationName) return `Walk to ${leg.stationName}`;
      if (dest?.toLowerCase() === 'tram stop') return 'Walk to Tram Stop';
      if (dest?.toLowerCase() === 'train platform' || dest?.toLowerCase() === 'station') return `Walk to ${leg.stationName || 'Station'}`;
      if (leg.stationName) return `Walk to ${leg.stationName}`;
      if (leg.stopName) return `Walk to ${leg.stopName}`;
      return `Walk to ${cap(dest) || 'Station'}`;
    }

    case 'coffee': {
      const cafeName = extractName(leg.location) || leg.cafeName || leg.name || 'Cafe';
      return `Coffee at ${cafeName}`;
    }

    case 'train': {
      // v5.9.0 (T6 / B8): Prefer the lineName that the T6 stability lock
      // has populated (from either live GTFS-RT this cycle or the KV-locked
      // preferredTrainLine from the last good detection). Fall back to the
      // explicit destination when no line name is known.
      const destName = leg.destinationName || leg.destination?.name || 'City';
      const line = leg.lineName || '';
      return line ? `${line} to ${destName}` : `Train to ${destName}`;
    }

    case 'tram': {
      // v5.9.0 (T5 / B5 + B6): Tram destination names must never contain
      // " Station". Trams stop at tram stops NEAR stations, not inside them.
      // Arrow indicator distinguishes "alight near" from "terminates at" —
      // the destination is the user's transfer point, not the tram terminus.
      const rawDest = leg.destination?.name || leg.destinationName || 'City';
      const destName = stripStation(rawDest);
      const num = leg.routeNumber ? `Route ${leg.routeNumber}` : (leg.lineName || 'Tram');
      return `${num} \u2192 ${destName}`;
    }

    case 'bus': {
      const rawDest = leg.destination?.name || leg.destinationName || 'City';
      const destName = stripStation(rawDest);
      const num = leg.routeNumber ? `Bus ${leg.routeNumber}` : 'Bus';
      return `${num} to ${destName}`;
    }

    default:
      return leg.title || 'Continue';
  }
}

export default formatLegTitle;
