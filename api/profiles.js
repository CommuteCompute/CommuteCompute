/**
 * /api/profiles - Journey Profile Management
 *
 * Manages saved journey profiles for different routes/schedules.
 * Profiles are stored in Redis (via Vercel Marketplace).
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getClient } from '../src/data/kv-preferences.js';
import { requireAuth, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

const KV_PROFILES_KEY = 'cc-profiles';

// In-memory fallback for local development
const localProfileStore = global.profileStore || (global.profileStore = new Map());

async function kvGet(key) {
  try {
    const client = await getClient();
    if (client) return await client.get(key);
  } catch (e) { /* Redis not available */ }
  return localProfileStore.get(key) || null;
}

async function kvSet(key, value) {
  try {
    const client = await getClient();
    if (client) {
      await client.set(key, value);
      return true;
    }
  } catch (e) { /* Redis not available */ }
  localProfileStore.set(key, value);
  return true;
}

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Profiles contain personal data — auth required on all methods (Section 26.1)
  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  try {
    // GET - List all profiles
    if (req.method === 'GET') {
      const profiles = await kvGet(KV_PROFILES_KEY) || [];

      return res.json({
        success: true,
        profiles,
        count: profiles.length
      });
    }

    // POST - Create new profile
    if (req.method === 'POST') {
      const { name, home, work, cafe, arrivalTime, coffeeEnabled, state } = req.body || {};

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Profile name is required'
        });
      }

      const profiles = await kvGet(KV_PROFILES_KEY) || [];

      const newProfile = {
        id: `profile-${Date.now()}`,
        name,
        home,
        work,
        cafe,
        arrivalTime: arrivalTime || '09:00',
        coffeeEnabled: coffeeEnabled !== false,
        state: state || 'VIC',
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      profiles.push(newProfile);

      const saved = await kvSet(KV_PROFILES_KEY, profiles);
      if (!saved) {
        return res.status(500).json({ success: false, error: 'Failed to save profile' });
      }

      return res.json({
        success: true,
        profile: newProfile,
        message: 'Profile created'
      });
    }

    // DELETE - Remove profile
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Profile ID required' });
      }

      let profiles = await kvGet(KV_PROFILES_KEY) || [];

      const originalLength = profiles.length;
      profiles = profiles.filter(p => p.id !== id);

      if (profiles.length === originalLength) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      const saved = await kvSet(KV_PROFILES_KEY, profiles);
      if (!saved) {
        return res.status(500).json({ success: false, error: 'Failed to delete profile' });
      }

      return res.json({
        success: true,
        message: 'Profile deleted'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}
