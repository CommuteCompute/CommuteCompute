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
    version: 'v3.4.0',
    date: buildDate,
    system: {
      version: '3.4.0',
      name: 'Commute Compute System',
      copyright: '© 2026 Angus Bergman',
      license: 'AGPL-3.0'
    },
    components: {
      // CommuteCompute journey calculation engine (V2.3)
      commutecompute: {
        version: 'v2.3',
        name: 'CommuteCompute Engine',
        description: 'Real-time journey planning with Metro Tunnel compliance, Departure Confidence, Sleep Optimizer, Alt Transit, Mindset analysis',
        metroTunnelCompliant: true,
        effectiveDate: '2026-02-06',
        locked: false,
        lockedDate: '2026-02-06'
      },
      // CCDash renderer (implements CCDashDesignV15.0 spec)
      renderer: {
        version: 'v1.80',
        name: 'CCDash Renderer',
        spec: 'CCDashDesignV15.0',
        specLocked: false,
        lockedDate: '2026-02-06',
        modifiedDate: '2026-02-06',
        description: 'Sleep mode, alt transit panel, mindset status, enhanced glanceability, lifestyle context display'
      },
      // Setup wizard
      setupWizard: { version: 'v2.0', locked: true },
      // LiveDash multi-device endpoint
      livedash: { version: 'v3.0', locked: true },
      // Admin panel
      admin: { version: 'v3.2', locked: true },
      // Firmware (LOCKED)
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
        lockedDate: '2026-02-06',
        modifiedDate: '2026-02-06',
        changes: [
          'Closed cafe completely removed from journey (not just skipped)',
          'Consecutive walk legs merged automatically',
          'Live departure times factor in time to reach stop',
          'Larger transit time boxes (72px → 88px)',
          'Bigger countdown numbers (30px → 38px)',
          'More spacing between number and MIN label',
          'Actual disruption text shown (not generic DISRUPTION)',
          'Updated CC logo in footer matching boot screen',
          'Smart coffee skip - cafe leg visible but excluded from timing when late',
          'Skipped cafe/walk legs show dashed borders and outline icons',
          'Journey timing recalculates excluding skipped cafe detour',
          'Variable leg heights',
          'Live departures with proper timing',
          'Coffee busyness display (outside ±2hr shows busyness only)',
          'Departure countdown times (live calculated)',
          'Larger text for e-ink visibility',
          'Walk legs show duration in text (no box)',
          'Transit icons double height',
          'Walk legs thinner borders',
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
