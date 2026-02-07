/**
 * Vercel Serverless Function Handler
 * Part of the Commute Compute System™
 * 
 * Wraps the Express app for Vercel's serverless environment.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

const HANDLER_VERSION = '3.1.0'; // Force rebuild marker
let app;
let initError = null;
let v13Available = false;

try {
  const module = await import('../src/server.js');
  app = module.default;
  v13Available = true; // If we get here, imports worked
} catch (error) {
  initError = error;
}

// Export handler that shows errors gracefully
export default function handler(req, res) {
  // API index - return available endpoints
  if (req.url === '/api/index' || req.url === '/api' || req.url === '/api/') {
    return res.status(200).json({
      name: 'Commute Compute System™ API',
      version: HANDLER_VERSION,
      timestamp: new Date().toISOString(),
      status: initError ? 'error' : 'ok',
      endpoints: {
        rendering: [
          'GET /api/screen - Full dashboard PNG',
          'GET /api/zones - Zone-based BMP refresh',
          'GET /api/zones-tiered - Tiered refresh zones',
          'GET /api/zonedata - Zone metadata',
          'GET /api/fullscreen - Full screen PNG',
          'GET /api/livedash - Multi-device renderer'
        ],
        system: [
          'GET /api/health - Health check',
          'GET /api/status - Server status',
          'GET /api/version - Version info'
        ],
        setup: [
          'GET /api/address-search - Geocoding',
          'POST /api/cafe-details - Cafe info',
          'POST /api/admin/setup-complete - Validate setup'
        ]
      }
    });
  }

  // Debug endpoint to verify deployment
  if (req.url === '/api/debug') {
    return res.status(200).json({
      debug: true,
      handlerVersion: HANDLER_VERSION,
      timestamp: new Date().toISOString(),
      appLoaded: !!app,
      initError: initError?.message || null,
      v13Available,
      nodeVersion: process.version
    });
  }

  if (initError) {
    return res.status(500).json({
      error: 'Server initialization failed',
      message: initError.message,
      stack: process.env.NODE_ENV !== 'production' ? initError.stack : undefined
    });
  }

  if (!app) {
    return res.status(500).json({ error: 'App not initialized' });
  }

  return app(req, res);
}
// Rebuild 20260129-044523
// Deploy 045018
// Test 1769662739
// Fresh deploy 1769663156
