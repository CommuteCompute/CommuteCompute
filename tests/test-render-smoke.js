/**
 * Render Pipeline Smoke Test
 *
 * Validates that the CCDash Renderer can be imported, exports the expected
 * functions, and can produce output without crashing on minimal input.
 *
 * Smoke test covering module exports, minimal-input rendering (PNG + BMP),
 * null/undefined resilience, device config fallback, and test pattern output.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms -- see LICENSE
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the renderer under test
import {
  renderFullDashboard,
  renderFullScreen,
  renderFullScreenBMP,
  renderTestPattern,
  renderSingleZone,
  getActiveZones,
  getDeviceConfig,
  render,
  DEVICE_CONFIGS,
  ZONES,
} from '../src/services/ccdash-renderer.js';

// Minimal valid data model -- enough for the renderer to not crash,
// but not enough to populate real journey content
const MINIMAL_DATA = {
  legs: [],
  coffee_decision: null,
  transit: { trains: [], trams: [], buses: [] },
  alerts: [],
  weather: null,
  temp: null,
  condition: null,
};

describe('Render pipeline smoke test', () => {

  // ---- Check 1: Module exports the expected functions ----
  it('should export renderFullDashboard as a function', () => {
    assert.equal(typeof renderFullDashboard, 'function',
      'renderFullDashboard must be exported as a function');
  });

  it('should export renderFullScreen as a function', () => {
    assert.equal(typeof renderFullScreen, 'function',
      'renderFullScreen must be exported as a function');
  });

  it('should export renderFullScreenBMP as a function', () => {
    assert.equal(typeof renderFullScreenBMP, 'function',
      'renderFullScreenBMP must be exported as a function');
  });

  it('should export renderTestPattern as a function', () => {
    assert.equal(typeof renderTestPattern, 'function',
      'renderTestPattern must be exported as a function');
  });

  it('should export renderSingleZone as a function', () => {
    assert.equal(typeof renderSingleZone, 'function',
      'renderSingleZone must be exported as a function');
  });

  it('should export getActiveZones as a function', () => {
    assert.equal(typeof getActiveZones, 'function',
      'getActiveZones must be exported as a function');
  });

  it('should export getDeviceConfig as a function', () => {
    assert.equal(typeof getDeviceConfig, 'function',
      'getDeviceConfig must be exported as a function');
  });

  it('should export render as a function', () => {
    assert.equal(typeof render, 'function',
      'render must be exported as a function');
  });

  it('should export DEVICE_CONFIGS as an object', () => {
    assert.equal(typeof DEVICE_CONFIGS, 'object',
      'DEVICE_CONFIGS must be exported as an object');
    assert.ok(Object.keys(DEVICE_CONFIGS).length > 0,
      'DEVICE_CONFIGS must have at least one device');
  });

  it('should export ZONES as an object', () => {
    assert.equal(typeof ZONES, 'object',
      'ZONES must be exported as an object');
  });

  // ---- Check 2: renderFullScreen produces a Buffer with minimal input ----
  it('should render a PNG Buffer from minimal data', async () => {
    const result = await renderFullScreen(MINIMAL_DATA);
    assert.ok(Buffer.isBuffer(result),
      'renderFullScreen must return a Buffer (PNG)');
    assert.ok(result.length > 0,
      'PNG output must not be empty');
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    assert.equal(result[0], 0x89, 'PNG header byte 0 must be 0x89');
    assert.equal(result[1], 0x50, 'PNG header byte 1 must be 0x50 (P)');
    assert.equal(result[2], 0x4E, 'PNG header byte 2 must be 0x4E (N)');
    assert.equal(result[3], 0x47, 'PNG header byte 3 must be 0x47 (G)');
  });

  // ---- Check 3: renderFullScreenBMP produces a Buffer with BMP header ----
  it('should render a BMP Buffer from minimal data', async () => {
    const result = await renderFullScreenBMP(MINIMAL_DATA);
    assert.ok(Buffer.isBuffer(result),
      'renderFullScreenBMP must return a Buffer (BMP)');
    assert.ok(result.length > 0,
      'BMP output must not be empty');
    // BMP magic bytes: 0x42 0x4D ('BM')
    assert.equal(result[0], 0x42, 'BMP header byte 0 must be 0x42 (B)');
    assert.equal(result[1], 0x4D, 'BMP header byte 1 must be 0x4D (M)');
  });

  // ---- Check 4: renderFullDashboard does not crash with minimal data ----
  it('should not throw when called with minimal data', async () => {
    // renderFullDashboard wraps renderFullScreen -- confirm no crash
    const result = await renderFullDashboard(MINIMAL_DATA);
    assert.ok(result === undefined || Buffer.isBuffer(result) ||
              typeof result === 'object',
      'renderFullDashboard must not throw on minimal input');
  });

  // ---- Check 5: Error handling -- null/undefined input ----
  it('should not crash with null input', async () => {
    try {
      await renderFullScreen(null);
      // If it returns without error, that is acceptable
      assert.ok(true, 'renderFullScreen(null) did not throw');
    } catch (err) {
      // A TypeError or controlled error is acceptable -- a crash is not.
      // We just verify the error is a known JS error, not a segfault or
      // unhandled rejection that would take down the process.
      assert.ok(err instanceof Error,
        'renderFullScreen(null) should throw a proper Error, not crash');
    }
  });

  it('should not crash with undefined input', async () => {
    try {
      await renderFullScreen(undefined);
      assert.ok(true, 'renderFullScreen(undefined) did not throw');
    } catch (err) {
      assert.ok(err instanceof Error,
        'renderFullScreen(undefined) should throw a proper Error, not crash');
    }
  });

  it('should not crash with empty object input', async () => {
    const result = await renderFullScreen({});
    assert.ok(result === undefined || Buffer.isBuffer(result) ||
              typeof result === 'object',
      'renderFullScreen({}) must not crash');
  });

  // ---- Check 6: getDeviceConfig returns valid config ----
  it('should return default device config for trmnl-og', () => {
    const config = getDeviceConfig('trmnl-og');
    assert.ok(config, 'Device config for trmnl-og must exist');
    assert.ok(typeof config === 'object', 'Device config must be an object');
  });

  it('should return a config even for unknown device type', () => {
    const config = getDeviceConfig('nonexistent-device');
    assert.ok(config, 'getDeviceConfig must fall back for unknown device');
  });

  // ---- Check 7: renderTestPattern produces output ----
  it('should produce a test pattern', () => {
    const result = renderTestPattern();
    // renderTestPattern may return Buffer or object -- just verify no crash
    assert.ok(result !== undefined && result !== null,
      'renderTestPattern must return a value');
  });
});
