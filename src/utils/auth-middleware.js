// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Angus Bergman

/**
 * Authentication middleware for admin and state-mutating endpoints.
 *
 * Checks for Authorization: Bearer <token> header against CC_ADMIN_TOKEN env var.
 * SECURITY: Denies by default when CC_ADMIN_TOKEN is not set (Section 26.2).
 *
 * Part of the Commute Compute System
 */

import { getTransitApiKey } from '../data/kv-preferences.js';

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

  if (providedToken !== adminToken) {
    return {
      error: 'Forbidden',
      message: 'Invalid admin token'
    };
  }

  return null;
}

/**
 * Check if the system is in first-time setup state (no transit key configured).
 * Used by setup endpoints to allow unauthenticated initial configuration.
 * Once the system is configured (transit key exists in KV), auth is required.
 *
 * @returns {Promise<boolean>} true if system has not been configured yet
 */
export async function isFirstTimeSetup() {
  try {
    const transitKey = await getTransitApiKey();
    return !transitKey;
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
