/**
 * /api/version - Version Information Endpoint
 * 
 * Returns system version, component versions, and build info.
 * Used by the global system footer on all admin panel tabs.
 * 
 * Per DEVELOPMENT-RULES.md Section 7.4: Renderer version must match spec compliance.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 min
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Build date from deployment — use Melbourne timezone (Vercel runs in UTC)
  const buildDate = process.env.VERCEL_GIT_COMMIT_SHA
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
    : '2026-01-31';

  res.json({
    version: 'v4.2.0',
    date: buildDate,
    system: {
      version: '4.2.0',
      name: 'Commute Compute System',
      copyright: '© 2026 Angus Bergman',
      license: 'AGPL-3.0'
    },
    components: {
      // CommuteCompute journey calculation engine (V3.1)
      commutecompute: {
        version: 'v3.1',
        name: 'CommuteCompute Engine',
        description: 'Real-time multi-modal journey planning with route-aware transit filtering, transit-to-walk conversion, suburb extraction, Metro Tunnel citybound detection, strictly live GTFS-RT, Departure Confidence, Sleep Optimizer, Alt Transit, Lifestyle Context, Mindset analysis',
        metroTunnelCompliant: true,
        effectiveDate: '2026-02-12',
        locked: false,
        lockedDate: null
      },
      // CCDash renderer (implements CCDashDesignV15.0 spec)
      renderer: {
        version: 'v2.1',
        name: 'CCDash Renderer',
        spec: 'CCDashDesignV15.0',
        specLocked: false,
        lockedDate: null,
        modifiedDate: '2026-02-12',
        description: 'V15.0 spec-compliant rendering with lifestyle obligation styling, transit-to-walk display, suburb locations, confidence labels, sleep mode, mindset status, lifestyle context display'
      },
      // Setup wizard
      setupWizard: { version: 'v2.0', locked: false },
      // LiveDash multi-device endpoint
      livedash: { version: 'v3.0', locked: false },
      // Admin panel
      admin: { version: 'v5.0', locked: false },
      // Firmware (UNLOCKED — runtime factory reset + BLE provisioning)
      firmware: {
        version: 'CC-FW-8.1.0',
        locked: false,
        lockedDate: null,
        description: 'ESP32 firmware with battery optimisation, runtime factory reset, BLE pairing, 60-second deep sleep interval'
      }
    },
    specs: {
      dashboard: {
        version: 'CCDashDesignV15.0',
        status: 'UNLOCKED',
        lockedDate: null,
        modifiedDate: '2026-02-12',
        changes: [
          'Strictly live GTFS-RT data — no timetable fallbacks, transit legs removed when no match',
          'Transit-to-walk conversion with speed ratios (train 4x, tram 2.5x, bus 3x)',
          'Route-aware transit filtering (specific route number, not just mode)',
          'Catchable departures only in Next: subtitles (>= arrival at stop time)',
          'Lifestyle obligation styling (black fill for positive, plain for passive notices)',
          'Suburb display for home/work (Places API → Nominatim → address-derived)',
          'V/Line support as 4th transit mode with named lines',
          'Ferry canvas-drawn icon, all-mode disruptions (metro + tram + bus)',
          'Consecutive walk leg merging (handles chains)',
          'Metro Tunnel inline destination detection in transit filter',
          'Departure Confidence score (0-100%) in status bar',
          'Sleep mode display replacing coffee box after 6pm',
          'Alt transit cost panel (UBER/BIKE/SCOOTER) when transit unavailable',
          'Mindset indicator (stress, steps, feels-like) in status bar',
          'Admin panel edits persist to KV with geocoding and Places API autocomplete',
          'Security: auth deny-by-default, CORS restriction, KV-first config',
          'Variable leg heights, coffee busyness, specific stop/station names'
        ]
      }
    },
    environment: process.env.VERCEL ? 'vercel-production' : 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local'
  });
}
