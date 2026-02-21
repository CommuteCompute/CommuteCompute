// Copyright (c) 2026 Angus Bergman
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Auth Middleware Unit Tests
 *
 * Tests requireAuth(), isFirstTimeSetup(), and setAdminCorsHeaders()
 * from src/utils/auth-middleware.js.
 *
 * Covers:
 *   - Deny when CC_ADMIN_TOKEN env is not set
 *   - Deny when no Authorization header provided
 *   - Deny when Authorization header is malformed (not Bearer)
 *   - Deny when token does not match
 *   - Allow when token matches
 *   - Timing-safe comparison for different-length tokens
 *   - CORS headers set correctly via setAdminCorsHeaders()
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

describe('requireAuth', () => {
  let originalToken;

  beforeEach(() => {
    originalToken = process.env.CC_ADMIN_TOKEN;
  });

  afterEach(() => {
    // Restore original env state
    if (originalToken === undefined) {
      delete process.env.CC_ADMIN_TOKEN;
    } else {
      process.env.CC_ADMIN_TOKEN = originalToken;
    }
  });

  it('should deny when CC_ADMIN_TOKEN env is not set', () => {
    delete process.env.CC_ADMIN_TOKEN;

    const result = requireAuth({ headers: { authorization: 'Bearer some-token' } });

    assert.notEqual(result, null, 'Should return an error object when token env is not set');
    assert.equal(result.error, 'Authentication not configured');
    assert.ok(result.message.includes('CC_ADMIN_TOKEN'), 'Message should mention CC_ADMIN_TOKEN');
  });

  it('should deny when no Authorization header is provided', () => {
    process.env.CC_ADMIN_TOKEN = 'test-secret-token';

    const result = requireAuth({ headers: {} });

    assert.notEqual(result, null, 'Should return an error object when no auth header');
    assert.equal(result.error, 'Authentication required');
    assert.ok(result.message.includes('Bearer'), 'Message should mention Bearer format');
  });

  it('should deny when Authorization header is malformed (not Bearer)', () => {
    process.env.CC_ADMIN_TOKEN = 'test-secret-token';

    // Basic auth instead of Bearer
    const result = requireAuth({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });

    assert.notEqual(result, null, 'Should return an error object for non-Bearer auth');
    assert.equal(result.error, 'Authentication required');
  });

  it('should deny when Authorization header is empty string', () => {
    process.env.CC_ADMIN_TOKEN = 'test-secret-token';

    const result = requireAuth({ headers: { authorization: '' } });

    assert.notEqual(result, null, 'Should return an error object for empty auth header');
    assert.equal(result.error, 'Authentication required');
  });

  it('should deny when token does not match', () => {
    process.env.CC_ADMIN_TOKEN = 'correct-token';

    const result = requireAuth({ headers: { authorization: 'Bearer wrong-token' } });

    assert.notEqual(result, null, 'Should return an error object for wrong token');
    assert.equal(result.error, 'Forbidden');
    assert.ok(result.message.includes('Invalid'), 'Message should indicate invalid token');
  });

  it('should allow when token matches', () => {
    process.env.CC_ADMIN_TOKEN = 'my-secret-admin-token';

    const result = requireAuth({ headers: { authorization: 'Bearer my-secret-admin-token' } });

    assert.equal(result, null, 'Should return null when token matches (auth passes)');
  });

  it('should handle case-insensitive Bearer prefix', () => {
    process.env.CC_ADMIN_TOKEN = 'my-token';

    // The regex uses /i flag, so "bearer" should work too
    const result = requireAuth({ headers: { authorization: 'bearer my-token' } });

    assert.equal(result, null, 'Should accept lowercase "bearer" prefix');
  });

  it('should deny when tokens differ in length (timing-safe comparison)', () => {
    process.env.CC_ADMIN_TOKEN = 'short';

    const result = requireAuth({ headers: { authorization: 'Bearer a-much-longer-token-value' } });

    assert.notEqual(result, null, 'Should deny when token lengths differ');
    assert.equal(result.error, 'Forbidden');
  });

  it('should deny when provided token is shorter than expected', () => {
    process.env.CC_ADMIN_TOKEN = 'a-very-long-secret-admin-token';

    const result = requireAuth({ headers: { authorization: 'Bearer ab' } });

    assert.notEqual(result, null, 'Should deny when provided token is shorter');
    assert.equal(result.error, 'Forbidden');
  });

  it('should handle missing headers object gracefully', () => {
    process.env.CC_ADMIN_TOKEN = 'test-token';

    // req with no headers property at all
    const result = requireAuth({ headers: undefined });

    assert.notEqual(result, null, 'Should return error when headers is undefined');
    assert.equal(result.error, 'Authentication required');
  });

  it('should handle Bearer with extra whitespace gracefully', () => {
    process.env.CC_ADMIN_TOKEN = 'my-token';

    // "Bearer  my-token" with extra space -- the regex /^Bearer\s+(.+)$/i
    // uses greedy \s+ which consumes all whitespace, then (.+) captures
    // "my-token", so the token still matches correctly.
    const result = requireAuth({ headers: { authorization: 'Bearer  my-token' } });

    assert.equal(result, null, 'Extra whitespace after Bearer should still allow valid token');
  });
});

describe('setAdminCorsHeaders', () => {
  let originalOrigin;

  beforeEach(() => {
    originalOrigin = process.env.CC_ALLOWED_ORIGIN;
  });

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.CC_ALLOWED_ORIGIN;
    } else {
      process.env.CC_ALLOWED_ORIGIN = originalOrigin;
    }
  });

  it('should set Allow-Methods and Allow-Headers regardless of origin config', () => {
    delete process.env.CC_ALLOWED_ORIGIN;

    const headers = {};
    const res = {
      setHeader(name, value) { headers[name] = value; }
    };

    setAdminCorsHeaders(res);

    assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
    assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });

  it('should NOT set Access-Control-Allow-Origin when CC_ALLOWED_ORIGIN is unset', () => {
    delete process.env.CC_ALLOWED_ORIGIN;

    const headers = {};
    const res = {
      setHeader(name, value) { headers[name] = value; }
    };

    setAdminCorsHeaders(res);

    assert.equal(headers['Access-Control-Allow-Origin'], undefined,
      'Should not set Allow-Origin when env var is not configured');
  });

  it('should set Access-Control-Allow-Origin when CC_ALLOWED_ORIGIN is set', () => {
    process.env.CC_ALLOWED_ORIGIN = 'https://my-dashboard.example.com';

    const headers = {};
    const res = {
      setHeader(name, value) { headers[name] = value; }
    };

    setAdminCorsHeaders(res);

    assert.equal(headers['Access-Control-Allow-Origin'], 'https://my-dashboard.example.com');
    assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
    assert.equal(headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });
});
