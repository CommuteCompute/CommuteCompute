/**
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/**
 * Device State Manager - Commute Compute
 * 
 * Tracks what the device is displaying, prevents crashes, and enables debugging.
 * Provides verifiable proof of display state via content hashing.
 * 
 * Development Rules v1.0.14 compliant.
 * @license AGPL-3.0
 */

import crypto from 'crypto';

// Configuration
const CONFIG = {
  maxHistorySize: 20,
  maxRenderTimeMs: 10000,
  maxConsecutiveFailures: 3,
  staleDataThresholdMs: 300000,
};

// State storage (in-memory)
const state = {
  current: {
    timestamp: null,
    contentHash: null,
    departures: [],
    alerts: [],
    deviceConfig: null,
    renderTimeMs: null,
    source: null,
    rawData: null,
  },
  health: {
    consecutiveFailures: 0,
    lastFailure: null,
    failureReason: null,
    totalRenders: 0,
    totalFailures: 0,
    avgRenderTimeMs: 0,
    inSafeMode: false,
  },
  history: [],
  lastFetch: {
    timestamp: null,
    departureCount: 0,
    apiResponseTimeMs: null,
  }
};

/**
 * Generate content hash for comparing renders
 */
export function generateContentHash(data) {
  const content = JSON.stringify({
    trains: data.trains?.slice(0, 5).map(d => ({ min: d.minutes, dest: d.destination })),
    trams: data.trams?.slice(0, 5).map(d => ({ min: d.minutes, dest: d.destination })),
    buses: data.buses?.slice(0, 5).map(d => ({ min: d.minutes, dest: d.destination })),
    timestamp: Math.floor(Date.now() / 60000)
  });
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
}

/**
 * Validate data before rendering
 */
export function validateRenderData(data) {
  const errors = [];
  
  if (!data) {
    errors.push('No data provided');
    return { valid: false, errors };
  }
  
  const hasSomeData = data.trains?.length || data.trams?.length || 
                      data.buses?.length || data.ferries?.length;
  
  if (!hasSomeData) {
    errors.push('No departure data available');
  }
  
  if (data.fetchTimestamp) {
    const age = Date.now() - data.fetchTimestamp;
    if (age > CONFIG.staleDataThresholdMs) {
      errors.push(`Data is stale (${Math.round(age/1000)}s old)`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: errors.length > 0 && errors.length < 3 ? errors : []
  };
}

/**
 * Check if content changed
 */
export function hasContentChanged(newData) {
  const newHash = generateContentHash(newData);
  return newHash !== state.current.contentHash;
}

/**
 * Record successful render
 */
export function recordSuccess(data, renderTimeMs) {
  const now = Date.now();
  const contentHash = generateContentHash(data);
  
  state.current = {
    timestamp: now,
    contentHash,
    departures: [
      ...(data.trains || []).slice(0, 3),
      ...(data.trams || []).slice(0, 3),
    ],
    alerts: data.alerts || [],
    deviceConfig: data.deviceConfig || null,
    renderTimeMs,
    source: data.source || 'live',
    rawData: { trains: data.trains?.length, trams: data.trams?.length, buses: data.buses?.length },
  };
  
  state.health.consecutiveFailures = 0;
  state.health.totalRenders++;
  state.health.inSafeMode = false;
  
  if (state.health.avgRenderTimeMs === 0) {
    state.health.avgRenderTimeMs = renderTimeMs;
  } else {
    state.health.avgRenderTimeMs = state.health.avgRenderTimeMs * 0.8 + renderTimeMs * 0.2;
  }
  
  state.history.push({
    timestamp: now,
    contentHash,
    departureCount: (data.trains?.length || 0) + (data.trams?.length || 0),
    renderTimeMs,
    success: true,
    source: data.source || 'live',
  });
  
  if (state.history.length > CONFIG.maxHistorySize) {
    state.history.shift();
  }
  
  return { success: true, contentHash };
}

/**
 * Record failed render
 */
export function recordFailure(reason, error = null) {
  const now = Date.now();
  
  state.health.consecutiveFailures++;
  state.health.lastFailure = now;
  state.health.failureReason = reason;
  state.health.totalFailures++;
  
  if (state.health.consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
    state.health.inSafeMode = true;
  }
  
  state.history.push({
    timestamp: now,
    success: false,
    reason,
    error: error?.message || null,
  });
  
  if (state.history.length > CONFIG.maxHistorySize) {
    state.history.shift();
  }
  
  return {
    success: false,
    inSafeMode: state.health.inSafeMode,
    consecutiveFailures: state.health.consecutiveFailures,
  };
}

/**
 * Record API fetch
 */
export function recordFetch(departureCount, responseTimeMs) {
  state.lastFetch = {
    timestamp: Date.now(),
    departureCount,
    apiResponseTimeMs: responseTimeMs,
  };
}

/**
 * Safe mode content
 */
export function getSafeModeContent() {
  return {
    inSafeMode: true,
    message: 'Service temporarily unavailable',
    lastKnown: state.current.departures?.slice(0, 3) || [],
    lastUpdate: state.current.timestamp,
    retryIn: '60 seconds',
  };
}

/**
 * Check if in safe mode
 */
export function isInSafeMode() {
  return state.health.inSafeMode;
}

/**
 * Should we render?
 */
export function shouldRender(newData, force = false) {
  if (force) return { shouldRender: true, reason: 'forced' };
  if (!state.current.timestamp) return { shouldRender: true, reason: 'first_render' };
  if (!hasContentChanged(newData)) return { shouldRender: false, reason: 'no_change' };
  return { shouldRender: true, reason: 'content_changed' };
}

/**
 * Get current state
 */
export function getState() {
  return {
    current: {
      ...state.current,
      age: state.current.timestamp 
        ? Math.round((Date.now() - state.current.timestamp) / 1000) + 's ago'
        : null,
    },
    health: { ...state.health },
    lastFetch: { ...state.lastFetch },
    historyCount: state.history.length,
    config: CONFIG,
  };
}

/**
 * Get history
 */
export function getHistory() {
  return [...state.history].reverse();
}

/**
 * Reset state
 */
export function reset() {
  state.current = { timestamp: null, contentHash: null, departures: [], alerts: [], deviceConfig: null, renderTimeMs: null, source: null, rawData: null };
  state.health = { consecutiveFailures: 0, lastFailure: null, failureReason: null, totalRenders: 0, totalFailures: 0, avgRenderTimeMs: 0, inSafeMode: false };
  state.history = [];
  state.lastFetch = { timestamp: null, departureCount: 0, apiResponseTimeMs: null };
}

/**
 * Timeout wrapper
 */
export async function withTimeout(renderFn, timeoutMs = CONFIG.maxRenderTimeMs) {
  return Promise.race([
    renderFn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Render timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export default {
  generateContentHash,
  validateRenderData,
  hasContentChanged,
  shouldRender,
  recordSuccess,
  recordFailure,
  recordFetch,
  getSafeModeContent,
  isInSafeMode,
  getState,
  getHistory,
  reset,
  withTimeout,
  CONFIG,
};
