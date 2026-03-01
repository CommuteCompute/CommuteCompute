/**
 * CC LiveDash™ API Endpoint
 * Part of the Commute Compute System™
 * 
 * Renders the CommuteCompute™ dashboard for different e-ink devices.
 * 
 * Query params:
 * - device: Device ID (trmnl-og, trmnl-mini, kindle-pw3, etc.)
 * - format: Output format (png, json, html)
 * - refresh: Force refresh (true/false)
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import LiveDash, { DEVICE_CONFIGS } from '../src/services/livedash.js';
import { getPreferences, getTransitApiKey } from '../src/data/kv-preferences.js';
import fs from 'fs/promises';
import path from 'path';

// Singleton instance
let liveDash = null;

/**
 * Decode config token from webhook URL
 */
function decodeConfigToken(token) {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

/**
 * Load journey configuration from config token or filesystem fallback
 */
async function loadJourneyConfig(configToken = null) {
  // First try config token (for Vercel serverless)
  if (configToken) {
    const minified = decodeConfigToken(configToken);
    if (minified) {
      return {
        homeAddress: minified.a?.home,
        homeLocation: minified.l?.home,
        workAddress: minified.a?.work,
        workLocation: minified.l?.work,
        cafeLocation: minified.cf || minified.l?.cafe,
        targetArrival: minified.t || '09:00',
        preferCoffee: minified.c !== false,
        walkToWork: 5,
        homeToCafe: 3,
        makeCoffee: 4,
        cafeToTransit: 2,
        preferredRoute: minified.j || null,
        apiMode: minified.m || 'cached'
      };
    }
  }
  
  // Fallback to KV preferences (Vercel serverless — synced from Setup Wizard)
  try {
    const kvPrefs = await getPreferences();
    if (kvPrefs && (kvPrefs.addresses?.home || kvPrefs.locations?.home?.address)) {
      const transitKey = await getTransitApiKey();
      return {
        ...kvPrefs,
        homeAddress: kvPrefs.addresses?.home || kvPrefs.locations?.home?.address || '',
        workAddress: kvPrefs.addresses?.work || kvPrefs.locations?.work?.address || '',
        cafeAddress: kvPrefs.addresses?.cafe || kvPrefs.locations?.cafe?.address || '',
        homeLocation: kvPrefs.locations?.home,
        workLocation: kvPrefs.locations?.work,
        cafeLocation: kvPrefs.locations?.cafe,
        arrivalTime: kvPrefs.journey?.arrivalTime || '09:00',
        coffeeEnabled: kvPrefs.journey?.coffeeEnabled !== false,
        api: { key: transitKey },
        transitApiKey: transitKey
      };
    }
  } catch (e) {
    // KV not available, continue to filesystem fallback
  }

  // Fallback to filesystem (for self-hosted)
  try {
    const configPath = path.join(process.cwd(), 'config', 'sample-journey.json');
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    // Transform to CommuteCompute preferences format
    return {
      homeAddress: config.locations?.home?.address,
      homeLocation: config.locations?.home,
      workAddress: config.locations?.work?.address,
      workLocation: config.locations?.work,
      cafeLocation: config.locations?.cafe,
      targetArrival: config.journey?.arrivalTime,
      preferCoffee: config.journey?.preferCoffee,
      walkToWork: config.coffeeEngine?.walkToWork || 5,
      homeToCafe: config.coffeeEngine?.homeToCafe || 3,
      makeCoffee: config.coffeeEngine?.makeCoffee || 4,
      cafeToTransit: config.coffeeEngine?.cafeToTransit || 2,
      preferredRoute: config.preferredRoute
    };
  } catch (e) {
    return null;
  }
}

/**
 * Initialize LiveDash with config token support
 */
async function getLiveDash(configToken = null) {
  // For serverless, we need to create a new instance each time with token config
  // because there's no persistent memory between requests
  if (configToken) {
    const preferences = await loadJourneyConfig(configToken);
    const instance = new LiveDash();
    await instance.initialize(preferences);
    return instance;
  }
  
  // For self-hosted, use singleton
  if (!liveDash) {
    const preferences = await loadJourneyConfig();
    liveDash = new LiveDash();
    await liveDash.initialize(preferences);
  }
  return liveDash;
}

/**
 * API Handler
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { device = 'trmnl-og', format = 'png', refresh = 'false', token = null } = req.query;
    
    // Special case: list devices
    if (device === 'list' || format === 'devices') {
      return res.json({
        devices: LiveDash.getDeviceList(),
        default: 'trmnl-og'
      });
    }
    
    // Validate device
    if (!DEVICE_CONFIGS[device]) {
      return res.status(400).json({
        error: 'Invalid device',
        valid: Object.keys(DEVICE_CONFIGS),
        requested: device
      });
    }
    
    // Get LiveDash instance (pass config token for serverless mode)
    const dash = await getLiveDash(token);
    dash.setDevice(device);
    
    // JSON format - return data only
    if (format === 'json') {
      const journeyData = await dash.commuteCompute.getJourneyRecommendation({
        forceRefresh: refresh === 'true'
      });
      
      return res.json({
        status: 'ok',
        device: {
          id: device,
          ...DEVICE_CONFIGS[device]
        },
        data: journeyData,
        timestamp: new Date().toISOString()
      });
    }
    
    // HTML format - return embeddable page
    if (format === 'html') {
      const config = DEVICE_CONFIGS[device];
      const html = generateHtmlPreview(device, config);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }
    
    // PNG format (default)
    const pngBuffer = await dash.render({
      forceRefresh: refresh === 'true'
    });
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.setHeader('X-Device', device);
    res.setHeader('X-Dimensions', `${DEVICE_CONFIGS[device].width}x${DEVICE_CONFIGS[device].height}`);
    
    return res.send(pngBuffer);
    
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Generate HTML preview page with full branding, attribution, and support links
 */
function generateHtmlPreview(device, config) {
  return `<!DOCTYPE html>
<html lang="en">
<!--
    Commute Compute LiveDash - Smart Transit Display
    Copyright (c) 2025-2026 Angus Bergman
    SPDX-License-Identifier: AGPL-3.0-or-later
    Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
-->
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Live transit dashboard preview for ${config.name}">
    <title>LiveDash - ${config.name} | Commute Compute</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>CC</text></svg>">
    <style>
        :root {
            --bg-primary: #1a2744;
            --bg-secondary: #1e293b;
            --bg-card: rgba(30, 41, 59, 0.8);
            --accent: #4fb28e;
            --accent-hover: #6ec9a8;
            --success: #4fb28e;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --border: rgba(255, 255, 255, 0.1);
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: var(--text-primary);
        }
        
        /* Header */
        .header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border);
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
            text-decoration: none;
        }
        
        .brand:hover { opacity: 0.9; }
        
        .nav-links {
            display: flex;
            gap: 8px;
        }
        
        .nav-link {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
        }
        
        .nav-link:hover {
            background: var(--bg-card);
            color: var(--text-primary);
        }
        
        /* Main Content */
        .main {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
        }
        
        .page-title {
            font-size: 28px;
            margin-bottom: 8px;
        }
        
        .device-info {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 24px;
        }
        
        .device-frame {
            background: #000;
            border-radius: 20px;
            padding: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        
        .screen {
            background: #f5f5f0;
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }
        
        .screen img {
            display: block;
            width: 100%;
            height: auto;
        }
        
        .refresh-indicator {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: #fff;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        
        .refresh-indicator.live {
            background: var(--success);
        }
        
        .controls {
            margin-top: 24px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: center;
        }
        
        .btn {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        .btn:hover {
            background: var(--accent);
            border-color: var(--accent);
        }
        
        .btn.active {
            background: var(--accent);
            border-color: var(--accent);
        }
        
        select {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
        }
        
        .status {
            margin-top: 16px;
            font-size: 13px;
            color: var(--text-secondary);
        }
        
        /* Footer */
        .footer {
            background: var(--bg-secondary);
            border-top: 1px solid var(--border);
            padding: 20px;
            text-align: center;
            font-size: 13px;
            color: var(--text-secondary);
        }
        
        .footer-attribution {
            margin-bottom: 12px;
        }
        
        .footer-attribution a {
            color: var(--text-secondary);
            text-decoration: none;
        }
        
        .footer-attribution a:hover {
            color: var(--text-primary);
            text-decoration: underline;
        }
        
        .footer-support {
            display: flex;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 12px;
        }
        
        .support-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
            font-size: 13px;
            transition: all 0.2s;
        }
        
        .support-btn.coffee {
            background: #FFDD00;
            color: #000;
        }
        
        .support-btn.sponsor {
            background: #db61a2;
            color: #fff;
        }
        
        .support-btn.feedback {
            background: var(--accent);
            color: #fff;
        }
        
        .support-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .footer-legal {
            font-size: 12px;
        }
        
        .footer-legal a {
            color: var(--text-secondary);
        }
        
        .footer-legal a:hover {
            color: var(--text-primary);
        }
        
        @media (max-width: 600px) {
            .nav-links { display: none; }
            .page-title { font-size: 22px; }
            .device-frame { padding: 10px; border-radius: 12px; }
            .footer-support { flex-direction: column; align-items: center; }
            .support-btn { width: 200px; justify-content: center; }
        }
    </style>
</head>
<body>
    <header class="header">
        <a href="/" class="brand">
            <span>CC</span>
            <span>Commute Compute</span>
        </a>
        <nav class="nav-links">
            <a href="/" class="nav-link">Home</a>
            <a href="/setup-wizard.html" class="nav-link">Setup</a>
            <a href="/admin.html" class="nav-link">Dashboard</a>
        </nav>
    </header>
    
    <main class="main">
        <h1 class="page-title">[Display] LiveDash</h1>
        <p class="device-info">${config.name} • ${config.width}×${config.height} • ${config.orientation}</p>
        
        <div class="device-frame" style="max-width: ${Math.min(config.width + 40, 900)}px">
            <div class="screen" style="width: ${config.width}px; max-width: 100%; aspect-ratio: ${config.width}/${config.height}">
                <img id="dashboard" src="/api/livedash?device=${device}&t=${Date.now()}" alt="Smart Transit Dashboard for ${config.name}">
                <div class="refresh-indicator live" id="refresh-indicator">● Live</div>
            </div>
        </div>
        
        <div class="controls">
            <select id="device-select" onchange="changeDevice(this.value)" aria-label="Select device">
                ${Object.entries(DEVICE_CONFIGS).map(([id, cfg]) => 
                    `<option value="${id}" ${id === device ? 'selected' : ''}>${cfg.name} (${cfg.width}×${cfg.height})</option>`
                ).join('')}
            </select>
            <button class="btn" onclick="refresh()" aria-label="Refresh dashboard">[Refresh] Refresh</button>
            <button class="btn active" id="auto-btn" onclick="toggleAuto()" aria-label="Toggle auto-refresh">[Pause] Auto: ON</button>
        </div>
        
        <p class="status" id="status">Last updated: just now</p>
    </main>
    
    <footer class="footer">
        <div class="footer-attribution">
            <strong>Data:</strong>
            <a href="https://opendata.transport.vic.gov.au" target="_blank" rel="noopener">Transport Victoria OpenData</a> (CC BY 4.0) •
            <a href="https://www.bom.gov.au" target="_blank" rel="noopener">Bureau of Meteorology</a>
        </div>
        <div class="footer-support">
            <a href="https://ko-fi.com/commutecompute" target="_blank" rel="noopener" class="support-btn coffee">
                [Coffee] Buy me a coffee
            </a>
            <a href="https://gitlab.com/angusbergman/commute-compute-system" target="_blank" rel="noopener" class="support-btn sponsor">
                [Heart] Sponsor
            </a>
            <a href="https://gitlab.com/angusbergman/commute-compute-system/issues/new?template=feedback.md&title=[Feedback]" target="_blank" rel="noopener" class="support-btn feedback">
                [Feedback] Feedback
            </a>
        </div>
        <div class="footer-legal">
            © 2025-2026 <a href="https://gitlab.com/angusbergman" target="_blank" rel="noopener">Angus Bergman</a> •
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">AGPL-3.0</a> •
            Commute Compute&#8482; System v4.2.0
        </div>
    </footer>
    
    <script>
        let autoRefresh = true;
        let refreshInterval;
        let lastUpdate = Date.now();
        
        function refresh() {
            const img = document.getElementById('dashboard');
            const indicator = document.getElementById('refresh-indicator');
            indicator.textContent = '↻ Updating...';
            indicator.classList.remove('live');
            
            img.src = '/api/livedash?device=${device}&refresh=true&t=' + Date.now();
            img.onload = () => {
                indicator.textContent = '● Live';
                indicator.classList.add('live');
                lastUpdate = Date.now();
                document.getElementById('status').textContent = 'Last updated: just now';
            };
            img.onerror = () => {
                indicator.textContent = '[!] Error';
                indicator.classList.remove('live');
            };
        }
        
        function changeDevice(deviceId) {
            window.location.href = '/api/livedash?device=' + deviceId + '&format=html';
        }
        
        function toggleAuto() {
            autoRefresh = !autoRefresh;
            const btn = document.getElementById('auto-btn');
            if (autoRefresh) {
                btn.textContent = '[Pause] Auto: ON';
                btn.classList.add('active');
                startAutoRefresh();
            } else {
                btn.textContent = '[Play] Auto: OFF';
                btn.classList.remove('active');
                clearInterval(refreshInterval);
            }
        }
        
        function startAutoRefresh() {
            refreshInterval = setInterval(refresh, 30000);
        }
        
        function updateStatusTimer() {
            const elapsed = Math.floor((Date.now() - lastUpdate) / 1000);
            const status = document.getElementById('status');
            if (elapsed < 5) {
                status.textContent = 'Last updated: just now';
            } else if (elapsed < 60) {
                status.textContent = 'Last updated: ' + elapsed + 's ago';
            } else {
                const mins = Math.floor(elapsed / 60);
                status.textContent = 'Last updated: ' + mins + 'm ago';
            }
        }
        
        // Start auto-refresh and status timer
        startAutoRefresh();
        setInterval(updateStatusTimer, 1000);
    </script>
</body>
</html>`;
}
