// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman

/**
 * Authentication middleware for admin and state-mutating endpoints.
 *
 * Checks for Authorization: Bearer <token> header against CC_ADMIN_TOKEN env var.
 * SECURITY: Denies by default when CC_ADMIN_TOKEN is not set (Section 26.2).
 *
 * Part of the Commute Compute System
 */

import crypto from 'node:crypto';
import { getTransitApiKey, getSetupComplete, setSetupComplete } from '../data/kv-preferences.js';

/**
 * Verify the request has a valid admin token.
 * Returns null if auth passes, or an error object if it fails.
 * DENIES by default when CC_ADMIN_TOKEN is not configured.
 *
 * @param {object} req - The request object
 * @returns {object|null} Error object with { error, message } or null if authorized
 */
export function requireAuth(req) {
  const adminToken = process.env.CC_ADMIN_TOKEN;

  if (!adminToken) {
    return {
      error: 'Authentication not configured',
      message: 'CC_ADMIN_TOKEN environment variable must be set. See setup documentation.'
    };
  }

  const authHeader = req.headers?.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return {
      error: 'Authentication required',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>'
    };
  }

  const providedToken = match[1];

  // Timing-safe comparison to prevent timing attacks (Section 17)
  const providedBuf = Buffer.from(providedToken, 'utf8');
  const expectedBuf = Buffer.from(adminToken, 'utf8');
  const lengthsMatch = providedBuf.length === expectedBuf.length;

  // When lengths differ, compare expectedBuf against itself to maintain
  // constant-time behaviour, then reject based on the length mismatch.
  const tokenMatch = lengthsMatch
    ? crypto.timingSafeEqual(providedBuf, expectedBuf)
    : !crypto.timingSafeEqual(expectedBuf, expectedBuf);

  if (!tokenMatch) {
    return {
      error: 'Forbidden',
      message: 'Invalid admin token'
    };
  }

  return null;
}

/**
 * Check if the system is in first-time setup state.
 * Uses cc:setup_complete flag to determine if setup has finished.
 * This prevents the race condition where saving the transit key during
 * setup (Step 5) would cause subsequent wizard API calls to require auth.
 *
 * @returns {Promise<boolean>} true if system has not been configured yet
 */
export async function isFirstTimeSetup() {
  try {
    // Check the dedicated setup_complete flag first
    const setupComplete = await getSetupComplete();
    if (setupComplete) return false;

    // Backward compat: if transit key exists but no setup_complete flag,
    // this is a pre-migration deployment — auto-migrate and return false
    const transitKey = await getTransitApiKey();
    if (transitKey) {
      await setSetupComplete({ timestamp: new Date().toISOString(), source: 'auto-migration' });
      return false;
    }

    // Neither flag nor transit key — genuine first-time setup
    return true;
  } catch {
    return true;
  }
}

/**
 * Set CORS headers for admin/state-mutating endpoints.
 * Does NOT use wildcard origin — same-origin only unless CC_ALLOWED_ORIGIN is set.
 * Per Section 26.4: state-mutating endpoints must not use wildcard CORS.
 */
export function setAdminCorsHeaders(res) {
  const allowedOrigin = process.env.CC_ALLOWED_ORIGIN;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
