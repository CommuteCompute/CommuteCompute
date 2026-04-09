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

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const versionData = require('../VERSION.json');

const SYSTEM_VERSION = versionData.system?.version || '0.0.0';
const comp = versionData.components || {};
const fw = versionData.firmware || comp.firmware || {};
const specs = versionData.specs || {};

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

  // V5.6.9: All version data read from VERSION.json — no hardcoded version strings.
  // Previous hardcoded component versions caused audit false positives when the
  // static analyser matched a component version instead of the system version.
  res.json({
    version: `v${SYSTEM_VERSION}`,
    date: buildDate,
    system: {
      version: SYSTEM_VERSION,
      name: versionData.system?.name || 'Commute Compute System',
      copyright: '© 2026 Angus Bergman',
      license: 'AGPL-3.0'
    },
    components: {
      commutecompute: {
        version: `v${comp.commutecompute?.version || '0.0'}`,
        name: comp.commutecompute?.name || 'CommuteCompute Engine',
        description: comp.commutecompute?.description || '',
        locked: comp.commutecompute?.locked ?? false
      },
      renderer: {
        version: `v${comp.renderer?.version || '0.0'}`,
        name: comp.renderer?.name || 'CCDash Renderer',
        spec: comp.renderer?.spec || '',
        description: comp.renderer?.description || '',
        locked: comp.renderer?.locked ?? false
      },
      setupWizard: { version: `v${comp.setupWizard?.version || '0.0'}`, locked: comp.setupWizard?.locked ?? false },
      livedash: { version: `v${comp.livedash?.version || '0.0'}`, locked: comp.livedash?.locked ?? false },
      admin: { version: `v${comp.adminPanel?.version || '0.0'}`, locked: comp.adminPanel?.locked ?? false },
      firmware: {
        version: fw.version ? `CC-FW-${fw.version}` : 'CC-FW-0.0.0',
        locked: fw.locked ?? false,
        description: fw.description || ''
      }
    },
    specs: {
      dashboard: specs.dashboard || {}
    },
    environment: process.env.VERCEL ? 'vercel-production' : 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
    repoUrls: {
      gitlab: 'https://gitlab.com/angusbergman/commute-compute-system/-/raw/main/VERSION.json'
    }
  });
}
