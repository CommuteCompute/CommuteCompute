/**
 * /api/admin/check-updates — Upstream Update Checker
 *
 * Compares this deployment's system version against the latest release on the
 * public upstream repository. Returns whether updates are available and what
 * changed.
 *
 * Requires: Authorization: Bearer <CC_ADMIN_TOKEN>
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { requireAuth, setAdminCorsHeaders } from '../../src/utils/auth-middleware.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const localVersion = require('../../VERSION.json');

const UPSTREAM_VERSION_URL =
  'https://gitlab.com/angusbergman/commute-compute-system/-/raw/main/VERSION.json';

const UPSTREAM_RELEASES_URL =
  'https://gitlab.com/angusbergman/commute-compute-system';

/**
 * Compare two semver strings. Returns:
 *   1  if a > b (a is newer)
 *   0  if a === b
 *  -1  if a < b (b is newer)
 */
function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map(Number);
  const pb = String(b || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export default async function handler(req, res) {
  setAdminCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = requireAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error, message: auth.message });
  }

  const localSystemVersion = localVersion.system?.version || '0.0.0';
  const localReleaseDate = localVersion.system?.releaseDate || null;

  let upstreamSystemVersion = null;
  let upstreamReleaseDate = null;
  let fetchError = null;

  try {
    const response = await fetch(UPSTREAM_VERSION_URL, {
      headers: { 'User-Agent': 'Commute-Compute-UpdateChecker/1.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      fetchError = `Upstream responded with HTTP ${response.status}`;
    } else {
      const data = await response.json();
      upstreamSystemVersion = data.system?.version || null;
      upstreamReleaseDate = data.system?.releaseDate || null;
    }
  } catch (err) {
    fetchError = err.message || 'Network error reaching upstream repository';
  }

  if (fetchError || !upstreamSystemVersion) {
    return res.status(200).json({
      status: 'check_failed',
      error: fetchError || 'Could not parse upstream version',
      local: { version: localSystemVersion, releaseDate: localReleaseDate },
      upstream: null,
      updateAvailable: false,
      checkedAt: new Date().toISOString()
    });
  }

  const cmp = compareSemver(upstreamSystemVersion, localSystemVersion);
  const updateAvailable = cmp > 0;
  const behindBy = updateAvailable ? `${upstreamSystemVersion} → (your deployment: ${localSystemVersion})` : null;

  return res.status(200).json({
    status: updateAvailable ? 'update_available' : 'up_to_date',
    updateAvailable,
    local: {
      version: localSystemVersion,
      releaseDate: localReleaseDate
    },
    upstream: {
      version: upstreamSystemVersion,
      releaseDate: upstreamReleaseDate,
      repoUrl: UPSTREAM_RELEASES_URL
    },
    behindBy,
    updateInstructions: updateAvailable ? [
      'Pull the latest changes from the upstream repository.',
      'Merge or rebase onto your fork.',
      'Commit and push to trigger a new Vercel deployment.',
      'Verify the updated version appears in this admin panel after redeployment.'
    ] : null,
    checkedAt: new Date().toISOString()
  });
}
