/**
 * KV-Based Preferences Storage
 *
 * Zero-Config compliant storage using Redis (via Vercel Marketplace).
 * Per DEVELOPMENT-RULES Section 3.1: Users must NEVER configure server-side env vars.
 * Per Section 11.8: Direct endpoints must load API key from persistent storage.
 *
 * Supports multiple Redis connection methods:
 *   1. Vercel KV env vars (KV_REST_API_URL / KV_REST_API_TOKEN) — legacy
 *   2. Upstash Marketplace env vars (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 *   3. Native Redis via ioredis (REDIS_URL)
 *   4. In-memory fallback for local development
 *
 * Redis provides persistent key-value storage across serverless invocations.
 * Falls back to in-memory storage for local development.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// Keys for stored preferences
const KEYS = {
  API_KEY: 'cc:api:transit_key',
  GOOGLE_KEY: 'cc:api:google_key',
  PREFERENCES: 'cc:preferences',
  STATE: 'cc:state',
  DEVICE_STATUS: 'cc:device:status'  // V13.6: Device battery and status
};

// In-memory fallback for local development (no KV configured)
const memoryStore = new Map();

// Cached clients
let vercelKvClient = null;
let upstashClient = null;

/**
 * Get Vercel KV client (uses REST API directly)
 */
async function getVercelKv() {
  if (vercelKvClient) return vercelKvClient;

  // Only try if env vars are set
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }

  vercelKvClient = createRestClient(
    process.env.KV_REST_API_URL,
    process.env.KV_REST_API_TOKEN
  );
  return vercelKvClient;
}

/**
 * Simple REST client for Redis (no external dependencies)
 * Works with both Vercel KV (legacy) and Upstash Marketplace env vars
 */
function createRestClient(baseUrl, token) {
  return {
    async get(key) {
      const response = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      return data.result;
    },
    async set(key, value, options) {
      let url = `${baseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`;
      if (options?.ex) url += `/EX/${options.ex}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      return data.result === 'OK';
    },
    async del(key) {
      const response = await fetch(`${baseUrl}/del/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      return data.result;
    },
    async keys(pattern) {
      const response = await fetch(`${baseUrl}/keys/${encodeURIComponent(pattern)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      return data.result || [];
    }
  };
}

/**
 * Get Redis client (uses REST API directly - no hanging imports)
 */
async function getUpstashClient() {
  if (upstashClient) return upstashClient;

  // Try Upstash REST env vars
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    upstashClient = createRestClient(
      process.env.UPSTASH_REDIS_REST_URL,
      process.env.UPSTASH_REDIS_REST_TOKEN
    );
    return upstashClient;
  }

  // Try Upstash REST URL first
  if (process.env.REDIS_URL && process.env.REDIS_URL.includes('upstash.io')) {
    try {
      const redisUrl = process.env.REDIS_URL;
      const url = new URL(redisUrl);
      const token = url.password;
      const hostname = url.hostname;

      if (token && hostname) {
        const restUrl = `https://${hostname}`;
        upstashClient = createRestClient(restUrl, token);
        return upstashClient;
      }
    } catch (e) {
      console.error('[KV]', { operation: 'parseRedisUrl', error: e.message, timestamp: new Date().toISOString() });
    }
  }

  // Try Redis Cloud (or other native Redis) via ioredis
  if (process.env.REDIS_URL) {
    try {
      // Intentional Docker/self-host fallback — ioredis is not declared in package.json
      // for Vercel deployments. Only triggered when REDIS_URL is set (non-Upstash Redis).
      const Redis = (await import('ioredis')).default;

      const client = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        commandTimeout: 5000,
        lazyConnect: true
      });

      // Create wrapper with get/set/del/keys interface
      upstashClient = {
        async get(key) {
          await client.connect().catch(() => {});
          const value = await client.get(key);
          return value ? JSON.parse(value) : null;
        },
        async set(key, value, options) {
          await client.connect().catch(() => {});
          if (options?.ex) {
            await client.set(key, JSON.stringify(value), 'EX', options.ex);
          } else {
            await client.set(key, JSON.stringify(value));
          }
          return true;
        },
        async del(key) {
          await client.connect().catch(() => {});
          return await client.del(key);
        },
        async keys(pattern) {
          await client.connect().catch(() => {});
          return await client.keys(pattern);
        }
      };

      return upstashClient;
    } catch (e) {
      console.error('[KV]', { operation: 'ioredisClientInit', error: e.message, timestamp: new Date().toISOString() });
    }
  }

  return null;
}

/**
 * Check if Redis storage is available
 * Supports: Vercel KV (legacy), Upstash Marketplace, Redis Cloud (native)
 */
function isKvAvailable() {
  // Check Vercel KV standard vars (auto-set when you link KV in Vercel dashboard)
  const hasVercelKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  // Check Upstash direct vars
  const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  // Check REDIS_URL (works with both Upstash and Redis Cloud)
  const hasRedisUrl = !!process.env.REDIS_URL;

  return hasVercelKv || hasUpstash || hasRedisUrl;
}

/**
 * Get all KV-related env vars for debugging
 */
export function getKvEnvStatus() {
  return {
    // Vercel KV standard
    KV_REST_API_URL: process.env.KV_REST_API_URL ? 'set' : 'missing',
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'set' : 'missing',
    KV_URL: process.env.KV_URL ? 'set' : 'missing',
    // Upstash direct
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? 'set' : 'missing',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? 'set' : 'missing',
    // Native Redis
    REDIS_URL: process.env.REDIS_URL ? 'set' : 'missing'
  };
}

/**
 * Get the active Redis client (Upstash Marketplace, legacy Vercel KV, or native Redis)
 * Returns null quickly if no Redis env vars are configured.
 * Returned client supports: get(key), set(key, value, options?), del(key), keys(pattern)
 */
export async function getClient() {
  // Fast path: if no KV env vars are set, use memory fallback immediately
  if (!isKvAvailable()) {
    return null;
  }

  // Wrap client initialization with timeout to prevent hanging
  try {
    const clientPromise = (async () => {
      // Prefer Vercel KV if env vars are set
      const vercelClient = await getVercelKv();
      if (vercelClient) return vercelClient;

      // Fall back to Upstash client
      return await getUpstashClient();
    })();

    // 3 second timeout for client initialization
    const client = await withTimeout(clientPromise, 3000, null);
    return client;
  } catch (e) {
    console.error('[KV]', { operation: 'getClient', error: e.message, timestamp: new Date().toISOString() });
    return null;
  }
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`KV operation timeout after ${ms}ms`)), ms)
    )
  ]).catch(err => {
    console.error('[KV]', { operation: 'withTimeout', error: err.message, timestamp: new Date().toISOString() });
    return fallback;
  });
}

/**
 * Get a value from storage
 * @param {string} key - Storage key
 * @returns {Promise<any>} - Stored value or null
 */
async function get(key) {
  try {
    const client = await getClient();
    if (client) {
      // 5 second timeout to prevent hanging
      const value = await withTimeout(client.get(key), 5000, null);
      return value;
    }
    return memoryStore.get(key) || null;
  } catch (error) {
    console.error('[KV]', { operation: 'get', key, error: error.message, timestamp: new Date().toISOString() });
    return memoryStore.get(key) || null;
  }
}

/**
 * Set a value in storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<boolean>} - Success status
 */
async function set(key, value) {
  try {
    const client = await getClient();
    if (client) {
      // 5 second timeout to prevent hanging
      await withTimeout(client.set(key, value), 5000, false);
      return true;
    }
    memoryStore.set(key, value);
    return true;
  } catch (error) {
    console.error('[KV]', { operation: 'set', key, error: error.message, timestamp: new Date().toISOString() });
    memoryStore.set(key, value);
    return false;
  }
}

/**
 * Get Transport Victoria OpenData API key
 * Per Section 11.8: Zero-Config compliant API key retrieval
 * @returns {Promise<string|null>}
 */
export async function getTransitApiKey() {
  const key = await get(KEYS.API_KEY);
  return key;
}

/**
 * Set Transport Victoria OpenData API key
 * @param {string} apiKey - The API key to store
 * @returns {Promise<boolean>}
 */
export async function setTransitApiKey(apiKey) {
  return await set(KEYS.API_KEY, apiKey);
}

/**
 * Get Google Places API key
 * @returns {Promise<string|null>}
 */
export async function getGoogleApiKey() {
  return await get(KEYS.GOOGLE_KEY);
}

/**
 * Set Google Places API key
 * @param {string} apiKey - The API key to store
 * @returns {Promise<boolean>}
 */
export async function setGoogleApiKey(apiKey) {
  return await set(KEYS.GOOGLE_KEY, apiKey);
}

/**
 * Get user state (VIC, NSW, etc.)
 * @returns {Promise<string|null>}
 */
export async function getUserState() {
  return await get(KEYS.STATE) || 'VIC';
}

/**
 * Set user state
 * @param {string} state - State code (VIC, NSW, QLD, etc.)
 * @returns {Promise<boolean>}
 */
export async function setUserState(state) {
  return await set(KEYS.STATE, state);
}

/**
 * Get full preferences object
 * @returns {Promise<Object>}
 */
export async function getPreferences() {
  const prefs = await get(KEYS.PREFERENCES);
  return prefs || {};
}

/**
 * Set full preferences object
 * @param {Object} preferences - Preferences to store
 * @returns {Promise<boolean>}
 */
export async function setPreferences(preferences) {
  return await set(KEYS.PREFERENCES, preferences);
}

/**
 * V13.6: Get device status (battery, last seen)
 * @returns {Promise<Object|null>}
 */
export async function getDeviceStatus() {
  return await get(KEYS.DEVICE_STATUS);
}

/**
 * V13.6: Set device status (called when device reports battery)
 * @param {Object} status - { battery_percent, battery_voltage, device_id, last_seen }
 * @returns {Promise<boolean>}
 */
export async function setDeviceStatus(status) {
  const value = {
    ...status,
    updated_at: new Date().toISOString()
  };
  try {
    const client = await getClient();
    if (client) {
      await withTimeout(client.set(KEYS.DEVICE_STATUS, value, { ex: 86400 }), 5000, false);
      return true;
    }
    memoryStore.set(KEYS.DEVICE_STATUS, value);
    return true;
  } catch (error) {
    console.error('[KV]', { operation: 'setDeviceStatus', error: error.message, timestamp: new Date().toISOString() });
    memoryStore.set(KEYS.DEVICE_STATUS, value);
    return false;
  }
}

/**
 * Get storage status for debugging
 * @returns {Promise<Object>}
 */
export async function getStorageStatus() {
  return {
    kvAvailable: isKvAvailable(),
    hasTransitKey: !!(await getTransitApiKey()),
    hasGoogleKey: !!(await getGoogleApiKey()),
    state: await getUserState()
  };
}

export default {
  getClient,
  getTransitApiKey,
  setTransitApiKey,
  getGoogleApiKey,
  setGoogleApiKey,
  getUserState,
  setUserState,
  getPreferences,
  setPreferences,
  getDeviceStatus,
  setDeviceStatus,
  getStorageStatus,
  KEYS
};
