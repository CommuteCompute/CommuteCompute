/**
 * /api/admin/resolve-stops - Auto-detect GTFS stop IDs from address
 *
 * Per DEVELOPMENT-RULES Section 23.1.1 & 23.9.1:
 * Resolves transit stop IDs from a home address using GTFS-derived
 * suburb-to-stop mapping. Auto-generated from .txt stop files — no hardcoding.
 * Covers ALL 226 metro stations + nearest tram/bus stops.
 *
 * POST: { address: "123 Example St, South Yarra VIC 3141" }
 * Returns: { success, stops: { trainStopId, tramStopId, stationName, ... } }
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { VIC_SUBURB_STOPS, VIC_TRAM_STOPS, VIC_BUS_STOPS } from '../../src/data/vic/gtfs-reference.js';

/**
 * Detect stop IDs from address string
 * Uses GTFS-derived VIC_SUBURB_STOPS (226 suburbs, auto-generated from .txt files)
 * Longest match first to prevent partial suburb name collisions.
 */
function detectStopIdsFromAddress(address) {
  if (!address) return null;

  const addressLower = address.toLowerCase();
  const suburbs = Object.keys(VIC_SUBURB_STOPS).sort((a, b) => b.length - a.length);

  for (const suburb of suburbs) {
    if (addressLower.includes(suburb)) {
      const data = VIC_SUBURB_STOPS[suburb];
      return {
        suburb,
        trainStopId: data.trainStation || null,
        tramStopId: data.tram || null,
        stationName: data.stationName || null,
        tramStop: data.tramName || (data.tram ? (VIC_TRAM_STOPS[data.tram] || null) : null),
        busStopId: data.bus || null,
        busStop: data.busName || (data.bus ? (VIC_BUS_STOPS[data.bus] || null) : null),
        line: null
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { address } = req.body || {};

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ success: false, error: 'Address is required' });
    }

    const detected = detectStopIdsFromAddress(address);

    if (detected) {
      console.log(`[resolve-stops] Detected stops for "${address.substring(0, 40)}": ${detected.stationName || detected.tramStop}`);
      return res.json({
        success: true,
        detected: true,
        stops: detected
      });
    }

    // Per Section 23.1.1: No match → null → system uses fallback timetable
    console.log(`[resolve-stops] No suburb match for "${address.substring(0, 40)}" - fallback mode`);
    return res.json({
      success: true,
      detected: false,
      stops: null,
      message: 'No matching suburb found. Your dashboard will use timetable data.'
    });

  } catch (error) {
    console.error('[resolve-stops] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
