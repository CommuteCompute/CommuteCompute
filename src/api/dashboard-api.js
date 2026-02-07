/**
 * Dashboard API Routes
 * 
 * Exposes the V13 Dashboard rendering endpoints for devices.
 * 
 * Endpoints:
 * - GET /api/zones - Zone-based data for TRMNL partial refresh
 * - GET /api/screen - PNG image for TRMNL webhook
 * - GET /api/kindle/image - PNG image for Kindle devices
 * - GET /api/setup-status - Check if setup is complete
 * - GET /api/dashboard - Full HTML dashboard preview
 * - GET /api/dashboard/json - JSON data for debugging
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import express from 'express';
import DashboardService from '../services/dashboard-service.js';
import { DEVICE_CONFIGS } from '../services/ccdash-renderer.js';

const router = express.Router();

// Service instance (initialized by server)
let dashboardService = null;
let openDataService = null;
let weatherService = null;

/**
 * Initialize dashboard API with services
 * @param {Object} options - Service instances
 */
export function initDashboardAPI(options = {}) {
  const { preferences, openData, weather } = options;
  
  dashboardService = new DashboardService(preferences);
  dashboardService.initialize(preferences);
  
  openDataService = openData || null;
  weatherService = weather || null;
  
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Request timeout middleware
 */
function withTimeout(timeoutMs = 30000) {
  return (req, res, next) => {
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout' });
      }
    }, timeoutMs);
    
    res.on('finish', () => clearTimeout(timeoutId));
    next();
  };
}

/**
 * Device identification middleware
 */
function identifyDevice(req, res, next) {
  req.deviceId = req.headers['x-device-id'] || req.query.deviceId || 'unknown';
  req.deviceType = req.query.device || req.query.deviceType || 'trmnl-og';
  next();
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/setup-status
 * Check if user has completed setup
 * Device polls this to know when to fetch dashboard
 */
router.get('/setup-status', (req, res) => {
  if (!dashboardService) {
    return res.json({
      setupComplete: false,
      serverTime: new Date().toISOString(),
      version: '3.0.0',
      error: 'Service not initialized'
    });
  }
  
  res.json(dashboardService.getSetupStatus());
});

/**
 * GET /api/zones
 * Zone-based data for TRMNL partial refresh
 * Returns changed zones with Base64 PNG images
 */
router.get('/zones', identifyDevice, withTimeout(20000), async (req, res) => {
  if (!dashboardService) {
    return res.status(503).json({ error: 'Service not initialized' });
  }

  try {
    const forceAll = req.query.forceAll === 'true';
    const result = await dashboardService.renderZones(
      req.deviceType,
      openDataService,
      weatherService,
      forceAll
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/screen
 * PNG image for TRMNL BYOS webhook
 * Returns 800×480 monochrome PNG
 */
router.get('/screen', identifyDevice, withTimeout(20000), async (req, res) => {
  if (!dashboardService) {
    return res.status(503).send('Service not initialized');
  }

  try {
    const png = await dashboardService.renderForTRMNL(openDataService, weatherService);
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (error) {
    res.status(500).send('Render failed');
  }
});

/**
 * GET /api/kindle/image
 * PNG image for Kindle devices at device-specific resolution
 * Query params: device=kindle-pw3|kindle-pw5|kindle-basic
 */
router.get('/kindle/image', identifyDevice, withTimeout(20000), async (req, res) => {
  if (!dashboardService) {
    return res.status(503).send('Service not initialized');
  }

  try {
    const kindleModel = req.query.device || 'kindle-pw3';
    const png = await dashboardService.renderForKindle(
      kindleModel,
      openDataService,
      weatherService
    );
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(png);
  } catch (error) {
    res.status(500).send('Render failed');
  }
});

/**
 * GET /api/dashboard
 * Full HTML dashboard for browser preview
 */
router.get('/dashboard', identifyDevice, withTimeout(20000), async (req, res) => {
  if (!dashboardService) {
    return res.status(503).send('Service not initialized');
  }

  try {
    const deviceConfig = DEVICE_CONFIGS[req.deviceType] || DEVICE_CONFIGS['trmnl-og'];
    const jsonData = await dashboardService.getJsonData(openDataService, weatherService);
    
    // Render HTML preview
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Commute Compute Dashboard Preview</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${deviceConfig.width}, height=${deviceConfig.height}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f0f0f0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .device-frame {
      background: white;
      border: 3px solid #333;
      border-radius: 8px;
      width: ${deviceConfig.width}px;
      height: ${deviceConfig.height}px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .dashboard {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .zone { border-bottom: 1px solid #eee; }
    .zone-header {
      height: ${deviceConfig.zones.header.h}px;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .time { font-size: ${deviceConfig.fonts.headerTime}px; font-weight: bold; }
    .date { font-size: ${deviceConfig.fonts.headerDate}px; }
    .weather-box {
      border: 2px solid black;
      padding: 10px;
      text-align: center;
    }
    .zone-status {
      height: ${deviceConfig.zones.statusBar.h}px;
      background: black;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      font-size: ${deviceConfig.fonts.statusBar}px;
      font-weight: bold;
    }
    .zone-transit {
      flex: 1;
      padding: 10px 20px;
      overflow-y: auto;
    }
    .transit-mode {
      margin-bottom: 15px;
    }
    .transit-title {
      font-size: ${deviceConfig.fonts.transitTitle}px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .departures-box {
      border: 2px solid black;
      padding: 10px;
    }
    .departure {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
    }
    .departure-time {
      font-size: ${deviceConfig.fonts.transitDeparture}px;
      font-weight: bold;
    }
    .departure-dest {
      font-size: ${deviceConfig.fonts.transitSubtext}px;
    }
    .zone-alerts {
      height: ${deviceConfig.zones.alerts.h}px;
      background: ${jsonData.alerts?.active ? 'black' : 'white'};
      color: ${jsonData.alerts?.active ? 'white' : 'black'};
      display: flex;
      align-items: center;
      padding: 0 20px;
      font-size: ${deviceConfig.fonts.alert}px;
    }
    .zone-footer {
      height: ${deviceConfig.zones.footer.h}px;
      border-top: 2px solid black;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .coffee-decision {
      font-size: ${deviceConfig.fonts.footer}px;
      font-weight: bold;
    }
    .coffee-subtext {
      font-size: ${deviceConfig.fonts.footer * 0.8}px;
    }
    .journey-time {
      font-size: ${deviceConfig.fonts.footer}px;
      font-weight: bold;
    }
    .device-selector {
      position: fixed;
      top: 10px;
      left: 10px;
      background: white;
      padding: 10px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .refresh-btn {
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="device-selector">
    <label>Device: 
      <select onchange="window.location.href='/api/dashboard?device='+this.value">
        <option value="trmnl-og" ${req.deviceType === 'trmnl-og' ? 'selected' : ''}>TRMNL OG (800×480)</option>
        <option value="trmnl-mini" ${req.deviceType === 'trmnl-mini' ? 'selected' : ''}>TRMNL Mini (400×300)</option>
        <option value="kindle-pw3" ${req.deviceType === 'kindle-pw3' ? 'selected' : ''}>Kindle PW3/4 (758×1024)</option>
        <option value="kindle-pw5" ${req.deviceType === 'kindle-pw5' ? 'selected' : ''}>Kindle PW5 (1236×1648)</option>
        <option value="kindle-basic" ${req.deviceType === 'kindle-basic' ? 'selected' : ''}>Kindle Basic (600×800)</option>
      </select>
    </label>
    <button class="refresh-btn" onclick="location.reload()">Refresh</button>
    <div style="margin-top:10px;font-size:12px;">
      <a href="/api/screen" target="_blank">PNG (TRMNL)</a> |
      <a href="/api/kindle/image?device=${req.deviceType}" target="_blank">PNG (Kindle)</a> |
      <a href="/api/dashboard/json" target="_blank">JSON</a>
    </div>
  </div>

  <div class="device-frame">
    <div class="dashboard">
      <div class="zone zone-header">
        <div>
          <div class="time">${jsonData.header?.time || '--:--'}</div>
        </div>
        <div class="date">${jsonData.header?.date || '--'}</div>
        ${jsonData.weather ? `
        <div class="weather-box">
          <div style="font-size:${deviceConfig.fonts.headerDate * 1.5}px;font-weight:bold;">${jsonData.weather.temp}</div>
          <div style="font-size:${deviceConfig.fonts.headerDate * 0.7}px;">${jsonData.weather.condition}</div>
          ${jsonData.weather.umbrella ? '<div style="background:black;color:white;padding:2px 5px;margin-top:5px;">☔ UMBRELLA</div>' : ''}
        </div>
        ` : ''}
      </div>
      
      <div class="zone zone-status">
        <span>Leave by ${jsonData.statusBar?.leaveBy || '--:--'}</span>
        <span>• ${jsonData.statusBar?.statusText || 'Calculating...'}</span>
        <span>${jsonData.statusBar?.journeyTime || '--'}</span>
      </div>
      
      <div class="zone zone-transit">
        ${jsonData.transitInfo?.departures?.length > 0 ? 
          jsonData.transitInfo.departures.map(mode => `
            <div class="transit-mode">
              <div class="transit-title">${mode.icon} ${mode.type.charAt(0).toUpperCase() + mode.type.slice(1)} - Route ${mode.route}</div>
              <div class="departures-box">
                ${mode.items.map(item => `
                  <div class="departure">
                    <span class="departure-time">${item.time}${item.delayed ? ` <span style="border:1px dashed black;padding:2px;">+${item.delayMinutes} MIN</span>` : ''}</span>
                    <span class="departure-dest">${item.destination}${item.platform ? ` (Plat ${item.platform})` : ''}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('') 
          : '<div style="text-align:center;padding:50px;">No departures found</div>'
        }
      </div>
      
      <div class="zone zone-alerts">
        ${jsonData.alerts?.active ? `[!] ${jsonData.alerts.messages?.[0] || 'Service alert'}` : ''}
      </div>
      
      <div class="zone zone-footer">
        <div>
          <div class="coffee-decision">${jsonData.footer?.coffeeEnabled ? `[Coffee] ${jsonData.footer.coffeeDecision}` : '[*] GO DIRECT'}</div>
          ${jsonData.footer?.coffeeSubtext ? `<div class="coffee-subtext">${jsonData.footer.coffeeSubtext}</div>` : ''}
        </div>
        <div class="journey-time">[Home]→[Office] ${jsonData.footer?.totalJourney || '--'}</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error generating dashboard');
  }
});

/**
 * GET /api/dashboard/json
 * Raw JSON data for debugging
 */
router.get('/dashboard/json', withTimeout(20000), async (req, res) => {
  if (!dashboardService) {
    return res.status(503).json({ error: 'Service not initialized' });
  }

  try {
    const jsonData = await dashboardService.getJsonData(openDataService, weatherService);
    res.json(jsonData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/dashboard/clear-cache
 * Clear all caches and force full refresh
 */
router.post('/dashboard/clear-cache', (req, res) => {
  if (!dashboardService) {
    return res.status(503).json({ error: 'Service not initialized' });
  }

  dashboardService.clearCache();
  res.json({ cleared: true, timestamp: new Date().toISOString() });
});

/**
 * GET /api/devices
 * List supported device configurations
 */
router.get('/devices', (req, res) => {
  const devices = Object.entries(DEVICE_CONFIGS).map(([id, config]) => ({
    id,
    width: config.width,
    height: config.height,
    orientation: config.orientation
  }));
  
  res.json({ devices });
});

// =============================================================================
// EXPORTS
// =============================================================================

export { router as dashboardRouter };
export default router;
