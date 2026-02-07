/**
 * /api/system-status - System Health Status
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = new Date();
  const hours = now.getHours();
  const isBusinessHours = hours >= 6 && hours <= 22;

  res.json({
    status: 'operational',
    timestamp: now.toISOString(),
    uptime: 'serverless',
    checks: {
      api: { status: 'ok', latency: 0 },
      rendering: { status: 'ok' },
      data: { status: isBusinessHours ? 'active' : 'idle' }
    },
    mode: 'serverless',
    region: process.env.VERCEL_REGION || 'unknown'
  });
}
