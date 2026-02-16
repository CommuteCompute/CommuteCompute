// Copyright (c) 2026 Angus Bergman
// Licensed under AGPL-3.0

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTransitApiKey, setTransitApiKey,
  getGoogleApiKey, setGoogleApiKey,
  getUserState, setUserState,
  getPreferences, setPreferences,
  getDeviceStatus, setDeviceStatus,
  getStorageStatus
} from '../src/data/kv-preferences.js';

describe('KV Preferences Storage (in-memory fallback)', () => {
  it('should return null for unset transit API key', async () => {
    const key = await getTransitApiKey();
    assert.equal(key, null, 'Transit API key should be null when unset');
  });

  it('should store and retrieve transit API key', async () => {
    await setTransitApiKey({ devId: 'test-dev', apiKey: 'test-key' });
    const key = await getTransitApiKey();
    assert.ok(key, 'Transit API key should be retrievable after set');
    assert.equal(key.devId, 'test-dev');
    assert.equal(key.apiKey, 'test-key');
  });

  it('should store and retrieve Google API key', async () => {
    await setGoogleApiKey('test-google-key');
    const key = await getGoogleApiKey();
    assert.equal(key, 'test-google-key');
  });

  it('should return default VIC for unset user state', async () => {
    // getUserState returns 'VIC' as default when no value is stored
    const state = await getUserState();
    assert.equal(state, 'VIC', 'Default user state should be VIC');
  });

  it('should store and retrieve user state', async () => {
    await setUserState('NSW');
    const retrieved = await getUserState();
    assert.equal(retrieved, 'NSW');
  });

  it('should return empty object for unset preferences', async () => {
    // getPreferences returns {} as default when no value is stored
    const prefs = await getPreferences();
    assert.deepEqual(prefs, {});
  });

  it('should store and retrieve preferences', async () => {
    const prefs = { theme: 'dark', refreshInterval: 60 };
    await setPreferences(prefs);
    const retrieved = await getPreferences();
    assert.deepEqual(retrieved, prefs);
  });

  it('should store and retrieve device status', async () => {
    const status = { lastSeen: Date.now(), firmware: 'CC-FW-7.6.0' };
    await setDeviceStatus(status);
    const retrieved = await getDeviceStatus();
    // setDeviceStatus adds updated_at, so check individual fields
    assert.equal(retrieved.lastSeen, status.lastSeen);
    assert.equal(retrieved.firmware, status.firmware);
    assert.ok(retrieved.updated_at, 'Device status should include updated_at timestamp');
  });

  it('should report storage status', async () => {
    const status = await getStorageStatus();
    assert.ok(status, 'Storage status should not be null');
    assert.ok(typeof status === 'object', 'Storage status should be an object');
    assert.equal(typeof status.kvAvailable, 'boolean', 'kvAvailable should be boolean');
    assert.equal(typeof status.hasTransitKey, 'boolean', 'hasTransitKey should be boolean');
    assert.equal(typeof status.hasGoogleKey, 'boolean', 'hasGoogleKey should be boolean');
  });
});
