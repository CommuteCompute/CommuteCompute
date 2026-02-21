// Copyright (c) 2026 Angus Bergman
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OpenData Client Unit Tests
 *
 * Verifies that src/services/opendata-client.js exports the expected
 * public API functions: setApiKey, getDepartures, getDisruptions,
 * getWeather, getDashboardData, and the default export object.
 *
 * These are structural/export tests only -- they do not call live APIs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import opendataDefault, {
  setApiKey,
  getDepartures,
  getDisruptions,
  getWeather,
  getDashboardData
} from '../src/services/opendata-client.js';

describe('opendata-client exports', () => {
  it('should export setApiKey as a function', () => {
    assert.equal(typeof setApiKey, 'function', 'setApiKey should be a function');
  });

  it('should export getDepartures as a function', () => {
    assert.equal(typeof getDepartures, 'function', 'getDepartures should be a function');
  });

  it('should export getDisruptions as a function', () => {
    assert.equal(typeof getDisruptions, 'function', 'getDisruptions should be a function');
  });

  it('should export getWeather as a function', () => {
    assert.equal(typeof getWeather, 'function', 'getWeather should be a function');
  });

  it('should export getDashboardData as a function', () => {
    assert.equal(typeof getDashboardData, 'function', 'getDashboardData should be a function');
  });

  it('should have a default export object with all public functions', () => {
    assert.equal(typeof opendataDefault, 'object', 'Default export should be an object');
    assert.equal(typeof opendataDefault.setApiKey, 'function');
    assert.equal(typeof opendataDefault.getDepartures, 'function');
    assert.equal(typeof opendataDefault.getDisruptions, 'function');
    assert.equal(typeof opendataDefault.getWeather, 'function');
    assert.equal(typeof opendataDefault.getDashboardData, 'function');
  });

  it('should have named exports matching default export members', () => {
    assert.equal(setApiKey, opendataDefault.setApiKey,
      'Named setApiKey should be the same as default.setApiKey');
    assert.equal(getDepartures, opendataDefault.getDepartures,
      'Named getDepartures should be the same as default.getDepartures');
    assert.equal(getDisruptions, opendataDefault.getDisruptions,
      'Named getDisruptions should be the same as default.getDisruptions');
    assert.equal(getWeather, opendataDefault.getWeather,
      'Named getWeather should be the same as default.getWeather');
    assert.equal(getDashboardData, opendataDefault.getDashboardData,
      'Named getDashboardData should be the same as default.getDashboardData');
  });
});
