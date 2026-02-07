// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Angus Bergman

/**
 * Authentication middleware for admin and state-mutating endpoints.
 *
 * Checks for Authorization: Bearer <token> header against CC_ADMIN_TOKEN env var.
 * If CC_ADMIN_TOKEN is not set, authentication is skipped (backward compatibility).
 *
 * Part of the Commute Compute System
 */

/**
 * Verify the request has a valid admin token.
 * Returns null if auth passes, or an error object if it fails.
 *
 * @param {object} req - The request object
 * @returns {object|null} Error object with { error, message } or null if authorized
 */
export function requireAuth(req) {
  const adminToken = process.env.CC_ADMIN_TOKEN;

  // If no admin token is configured, skip auth (development / backward compat)
  if (!adminToken) {
    return null;
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
