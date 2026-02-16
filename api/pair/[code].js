/**
 * Device Pairing Endpoint
 * Handles device code pairing flow (like Chromecast/Roku)
 *
 * GET /api/pair/[code] - Device polls to check if config is ready
 * POST /api/pair/[code] - Setup wizard sends config for device
 *
 * Uses Redis (via Vercel Marketplace) for persistent storage
 * across serverless invocations. Fallback to in-memory for local development.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getClient } from '../../src/data/kv-preferences.js';

// In-memory fallback for local development
const localStore = global.pairingStore || (global.pairingStore = new Map());

// Simple rate limiter — 20 requests per minute per IP
// Acceptable for serverless: each cold start resets, but catches burst/brute-force
// attacks within a single instance lifecycle.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 20;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

/**
 * Get pairing data from Redis or local store
 */
async function getPairingData(code) {
  try {
    const client = await getClient();
    if (client) {
      const data = await client.get(`cc:pair:${code}`);
      if (data) return data;
    }
  } catch (e) {
    // Redis not available, use local store
  }
  return localStore.get(code) || null;
}

/**
 * Set pairing data in Redis and local store
 */
async function setPairingData(code, data) {
  try {
    const client = await getClient();
    if (client) {
      await client.set(`cc:pair:${code}`, data, { ex: 600 });
    }
  } catch (e) {
    // Redis not available, use local store only
  }
  localStore.set(code, data);
}

/**
 * Delete pairing data from Redis and local store
 */
async function deletePairingData(code) {
  try {
    const client = await getClient();
    if (client) {
      await client.del(`cc:pair:${code}`);
    }
  } catch (e) {
    // Redis not available
  }
  localStore.delete(code);
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limiting — protect against brute-force pairing code guessing
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Try again in one minute.' });
  }

  const { code } = req.query;

  if (!code || code.length < 4 || code.length > 8) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid pairing code format' 
    });
  }

  const normalizedCode = code.toUpperCase();
  
  // GET - Device polling for config
  if (req.method === 'GET') {
    const pairingData = await getPairingData(normalizedCode);

    if (!pairingData) {
      // Code not registered yet - device should keep polling
      return res.json({
        success: true,
        status: 'waiting',
        message: 'Waiting for setup to complete...'
      });
    }

    if (pairingData.webhookUrl) {
      // Config is ready! Return it to device
      const webhookUrl = pairingData.webhookUrl;

      // Delete the pairing code after successful retrieval
      await deletePairingData(normalizedCode);


      return res.json({
        success: true,
        status: 'paired',
        webhookUrl: webhookUrl,
        message: 'Device paired successfully!'
      });
    }

    // Code registered but no config yet
    return res.json({
      success: true,
      status: 'waiting',
      message: 'Setup in progress...'
    });
  }

  // POST - Setup wizard sending config
  if (req.method === 'POST') {
    const { webhookUrl, config } = req.body;

    if (!webhookUrl && !config) {
      return res.status(400).json({
        success: false,
        error: 'Missing webhookUrl or config'
      });
    }

    // Use provided webhookUrl or generate /api/screen URL
    // Config should already be saved to KV by the setup wizard
    let finalWebhookUrl = webhookUrl;
    if (!finalWebhookUrl) {
      // Dynamically determine base URL from request
      const host = req.headers.host || req.headers['x-forwarded-host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = host
        ? `${protocol}://${host}`
        : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${protocol}://${req.headers.host}`);
      // Use /api/screen which reads from KV storage
      // NOTE: Do NOT append ?format=bmp here - firmware adds it
      finalWebhookUrl = `${baseUrl}/api/screen`;
    }

    // Store the pairing data in KV (with TTL) and local store
    await setPairingData(normalizedCode, {
      webhookUrl: finalWebhookUrl,
      createdAt: Date.now(),
      paired: true
    });


    return res.json({
      success: true,
      status: 'configured',
      message: `Device code ${normalizedCode} configured. Device will receive config on next poll.`,
      webhookUrl: finalWebhookUrl
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
