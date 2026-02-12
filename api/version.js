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

  // Build date from deployment or current date
  const buildDate = process.env.VERCEL_GIT_COMMIT_SHA 
    ? new Date().toISOString().split('T')[0]
    : '2026-01-31';

  res.json({
    version: 'v4.1.0',
    date: buildDate,
    system: {
      version: '4.1.0',
      name: 'Commute Compute System',
      copyright: '© 2026 Angus Bergman',
      license: 'AGPL-3.0'
    },
    components: {
      // CommuteCompute journey calculation engine (V3.1)
      commutecompute: {
        version: 'v3.1',
        name: 'CommuteCompute Engine',
        description: 'Real-time multi-modal journey planning with GTFS stop names, Metro Tunnel citybound detection, direction-based train filtering, Departure Confidence, Sleep Optimizer, Alt Transit (disruption-triggered), Lifestyle Context with all-day forecast, Mindset analysis',
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
        description: 'V15.0 spec-compliant box sizing, font sizes, status indicators, unified cafe closed/skipped rendering, confidence labels, sleep mode, mindset status, lifestyle context display'
      },
      // Setup wizard
      setupWizard: { version: 'v2.0', locked: false },
      // LiveDash multi-device endpoint
      livedash: { version: 'v3.0', locked: false },
      // Admin panel
      admin: { version: 'v5.0', locked: false },
      // Firmware (LOCKED — runtime factory reset + BLE provisioning)
      firmware: {
        version: 'CC-FW-7.5.0',
        locked: true,
        lockedDate: '2026-02-06',
        description: 'ESP32 firmware with battery reporting and zero-config auto-pairing'
      }
    },
    specs: {
      dashboard: {
        version: 'CCDashDesignV15.0',
        status: 'UNLOCKED',
        lockedDate: null,
        modifiedDate: '2026-02-12',
        changes: [
          'Metro Tunnel citybound detection (Town Hall, State Library, Parkville, Arden, Anzac)',
          'Direction-based train filtering (any citybound train, not route-locked)',
          'Tram route-level future-departure heuristic for accurate timing',
          'All-day weather forecast for equipment decisions (umbrella, jacket, hydration, layers)',
          'V15.0 spec-compliant status/data box sizing (16px)',
          'V15.0 spec-compliant font sizes (8px status, 36px temp, 13px status bar)',
          'Unified cafe closed/skipped rendering path',
          'Closed cafe completely removed from journey (not just skipped)',
          'Consecutive walk legs merged automatically',
          'Live departure times factor in time to reach stop',
          'Larger transit time boxes (72px to 88px)',
          'Bigger countdown numbers (30px to 38px)',
          'Actual disruption text shown (not generic DISRUPTION)',
          'Smart coffee skip - cafe leg visible but excluded from timing when late',
          'Variable leg heights',
          'Live departures with proper timing',
          'Coffee busyness display (outside +/-2hr shows busyness only)',
          'Departure countdown times (live calculated)',
          'Walk legs show duration in text (no box)',
          'ARRIVE + time on same line in footer',
          'Specific stop/station names in legs',
          'CommuteCompute engine with live departTime and nextDepartures'
        ]
      }
    },
    environment: process.env.VERCEL ? 'vercel-production' : 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local'
  });
}
