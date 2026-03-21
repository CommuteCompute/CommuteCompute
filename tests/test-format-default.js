// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman

/**
 * Format-Default Ternary Tests
 *
 * Verifies the critical format-default logic from api/commutecompute.js:
 *   const format = req.query?.format || (req.method === 'POST' ? 'json' : 'png');
 *
 * This ternary determines the response format for every request:
 *   - GET (firmware devices) must default to 'png'
 *   - POST (admin panel) must default to 'json'
 *   - An explicit ?format= query parameter overrides both defaults
 *
 * A regression here bricks all firmware devices. These tests replicate the
 * format-selection logic in isolation — no Express or endpoint deps required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Replicates the format-default ternary exactly as it appears in
 * api/commutecompute.js (line ~2483). This must stay in sync with the
 * source — any divergence means the test is no longer guarding the
 * production logic.
 */
function resolveFormat(req) {
  return req.query?.format || (req.method === 'POST' ? 'json' : 'png');
}

describe('Format-default ternary', () => {
  it('GET with no format param defaults to png (firmware)', () => {
    const req = { method: 'GET', query: {} };
    assert.equal(resolveFormat(req), 'png',
      'GET requests without ?format must default to png for firmware devices');
  });

  it('POST with no format param defaults to json (admin panel)', () => {
    const req = { method: 'POST', query: {} };
    assert.equal(resolveFormat(req), 'json',
      'POST requests without ?format must default to json for the admin panel');
  });

  it('GET with format=json uses json', () => {
    const req = { method: 'GET', query: { format: 'json' } };
    assert.equal(resolveFormat(req), 'json',
      'Explicit ?format=json must override the GET default');
  });

  it('POST with format=bmp uses bmp', () => {
    const req = { method: 'POST', query: { format: 'bmp' } };
    assert.equal(resolveFormat(req), 'bmp',
      'Explicit ?format=bmp must override the POST default');
  });

  it('GET with format=png uses png', () => {
    const req = { method: 'GET', query: { format: 'png' } };
    assert.equal(resolveFormat(req), 'png',
      'Explicit ?format=png must be honoured even though it matches the default');
  });

  it('GET with undefined query still defaults to png', () => {
    const req = { method: 'GET' };
    assert.equal(resolveFormat(req), 'png',
      'GET requests with no query object at all must still default to png');
  });

  it('POST with undefined query still defaults to json', () => {
    const req = { method: 'POST' };
    assert.equal(resolveFormat(req), 'json',
      'POST requests with no query object at all must still default to json');
  });

  it('GET with empty-string format defaults to png', () => {
    const req = { method: 'GET', query: { format: '' } };
    assert.equal(resolveFormat(req), 'png',
      'Empty-string format is falsy and must fall through to the GET default');
  });
});
