/**
 * Device Status API
 * Returns last known device status including battery level
 *
 * V13.6: Stores device status when reported via /api/screen requests
 * Retrieves status for admin panel display
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getDeviceStatus, setDeviceStatus } from '../src/data/kv-preferences.js';

/**
 * Get or set device status
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // POST: Update device status
    if (req.method === 'POST') {
      const { battery_percent, battery_voltage, device_id, timestamp } = req.body;

      await setDeviceStatus({
        battery_percent: battery_percent || null,
        battery_voltage: battery_voltage || null,
        device_id: device_id || null,
        last_seen: timestamp || new Date().toISOString()
      });

      return res.json({ success: true });
    }

    // GET: Retrieve device status
    if (req.method === 'GET') {
      const status = await getDeviceStatus();

      if (!status) {
        return res.json({
          success: true,
          status: null,
          message: 'No device status recorded yet'
        });
      }

      // Calculate time since last seen
      const lastSeen = new Date(status.last_seen || status.updated_at);
      const now = new Date();
      const minutesAgo = Math.round((now - lastSeen) / 60000);

      // Battery color coding: >40% green, 21-40% yellow, <=20% red
      const batteryPercent = status.battery_percent;
      const batteryColor = batteryPercent != null
        ? (batteryPercent > 40 ? 'green' : batteryPercent > 20 ? 'yellow' : 'red')
        : null;

      return res.json({
        success: true,
        status: {
          ...status,
          battery_color: batteryColor,
          minutes_ago: minutesAgo,
          online: minutesAgo < 15  // Consider online if seen in last 15 min
        }
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
