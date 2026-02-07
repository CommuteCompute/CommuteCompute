/**
 * /api/profiles - Journey Profile Management
 * 
 * Manages saved journey profiles for different routes/schedules.
 * Profiles are stored in Vercel KV.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { kv } from '@vercel/kv';
import { requireAuth } from '../src/utils/auth-middleware.js';

const KV_PROFILES_KEY = 'cc-profiles';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CC_ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    const authError = requireAuth(req);
    if (authError) return res.status(401).json(authError);
  }

  try {
    // GET - List all profiles
    if (req.method === 'GET') {
      let profiles = [];
      
      try {
        profiles = await kv.get(KV_PROFILES_KEY) || [];
      } catch (e) {
        profiles = [];
      }
      
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

      let profiles = [];
      try {
        profiles = await kv.get(KV_PROFILES_KEY) || [];
      } catch (e) {
        profiles = [];
      }

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
      
      try {
        await kv.set(KV_PROFILES_KEY, profiles);
      } catch (e) {
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

      let profiles = [];
      try {
        profiles = await kv.get(KV_PROFILES_KEY) || [];
      } catch (e) {
        profiles = [];
      }

      const originalLength = profiles.length;
      profiles = profiles.filter(p => p.id !== id);

      if (profiles.length === originalLength) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }

      try {
        await kv.set(KV_PROFILES_KEY, profiles);
      } catch (e) {
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
