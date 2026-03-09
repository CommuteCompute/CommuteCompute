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
    version: 'v5.0.0',
    date: buildDate,
    system: {
      version: '5.0.0',
      name: 'Commute Compute System',
      copyright: '© 2026 Angus Bergman',
      license: 'AGPL-3.0'
    },
    components: {
      // CommuteCompute journey calculation engine (V4.0)
      commutecompute: {
        version: 'v4.0',
        name: 'CommuteCompute Engine',
        description: 'GTFS coordinate-based stop detection (226 metro + 1637 tram + 4151 bus stops), runtime line verification for alighting stops, no hardcoded station fallbacks, shared haversine utility, real-time multi-modal journey planning with Metro Tunnel citybound detection, direction-based train filtering, route-aware transit filtering, transit-to-walk conversion, suburb extraction, strictly live GTFS-RT, Departure Confidence, Sleep Optimizer, Alt Transit, Lifestyle Context, Mindset analysis',
        metroTunnelCompliant: true,
        effectiveDate: '2026-03-02',
        locked: false,
        lockedDate: null
      },
      // CCDash renderer (implements CCDashDesignV16.0 spec)
      renderer: {
        version: 'v3.0',
        name: 'CCDash Renderer',
        spec: 'CCDashDesignV16.0',
        specLocked: false,
        lockedDate: null,
        modifiedDate: '2026-03-02',
        description: 'V16.0 spec-compliant rendering with transit countdown fix (trusts leg.minutes, 180-min sanity cap), cafe closed case-insensitive matching, confidence context line rendering, subtitle overflow protection, lifestyle obligation styling, transit-to-walk display, suburb locations, confidence labels, sleep mode, mindset status, lifestyle context display'
      },
      // Setup wizard
      setupWizard: { version: 'v2.0', locked: false },
      // LiveDash multi-device endpoint
      livedash: { version: 'v3.1', locked: false },
      // Admin panel
      admin: { version: 'v6.0', locked: false },
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
        version: 'CCDashDesignV16.0',
        status: 'UNLOCKED',
        lockedDate: null,
        modifiedDate: '2026-03-02',
        changes: [
          'UNIFIED ENGINE: Single /api/commutecompute endpoint for admin JSON, e-ink PNG/BMP, and debug diagnostics',
          'GTFS coordinate-based stop detection: findNearestStops() for 226 metro + 1637 tram + 4151 bus stops',
          'Coordinate-based destination resolution, no hardcoded Flinders Street Station fallback',
          'Shared haversine utility replacing 3 duplicate implementations',
          'Transit countdown fix (trusts leg.minutes, 180-min sanity cap)',
          'Cafe closed case-insensitive matching',
          'Confidence context line rendering',
          'Subtitle overflow protection',
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
          'Variable leg heights, coffee busyness, specific stop/station names',
          'AltTransit gate fix: only activates when ALL transit is cancelled/suspended',
          'Walk merge name resolution: uses stopName/stationName before generic destination',
          'Backward-compatible vercel.json rewrite: /api/screen → /api/commutecompute'
        ]
      }
    },
    environment: process.env.VERCEL ? 'vercel-production' : 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
    repoUrls: {
      github: 'https://raw.githubusercontent.com/CommuteCompute/CommuteCompute/main/VERSION.json',
      gitlab: 'https://gitlab.com/angusbergman/commute-compute-system/-/raw/main/VERSION.json'
    }
  });
}
