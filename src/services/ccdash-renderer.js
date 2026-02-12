/**
 * CCDash™ Renderer v1.81
 * Part of the Commute Compute System™
 *
 * Primary renderer for Commute Compute System dashboards.
 * Implements CCDashDesignV15.0 specification (UNLOCKED 2026-02-06).
 *
 * ============================================================================
 * FEATURES (v1.54) — V13.4 Walk Legs & Live Timing Update
 * ============================================================================
 *
 * HEADER (0-94px):
 * - Large clock (82px) positioned at bottom, touching status bar
 * - AM/PM aligned with bottom of coffee/weather boxes
 * - Service status indicator ([OK] SERVICES OK / [!] DISRUPTIONS)
 * - Data source indicator (● LIVE DATA / ○ NO LIVE DATA)
 * - Coffee decision box (GET A COFFEE / NO TIME FOR COFFEE with sad face)
 * - Weather box with temp, condition, umbrella indicator
 *
 * STATUS BAR (96-124px):
 * - Full black background (no outline)
 * - Status message with arrival time
 * - V13.1: Distinguishes Service Alerts vs Late Arrival
 * - V13.1: Badge shows "DISRUPTION" or "LATE +X min"
 * - Total journey time
 *
 * JOURNEY LEGS (132-432px):
 * - V13: Variable height legs (walk=1x, transit/coffee=2x)
 * - Walk legs: individual duration (X MIN)
 * - V13.1: Transit legs show minutes until departure (not cumulative)
 * - V13.1: Coffee legs show busyness (Quiet/Moderate/Busy) and LEAVE time
 * - DEPART/LEAVE column with scheduled times
 * - Next departures in subtitle (Next: X, Y min LIVE)
 * - Arrow connectors between legs
 *
 * FOOTER (440-480px):
 * - V13: 40px height with centered CC logo
 * - Destination with address (WORK — 80 COLLINS ST)
 * - Arrival time (ARRIVE label + time)
 *
 * ============================================================================
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Layout (800x480):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ HEADER: Clock | Day/Date/Status | Coffee Box | Weather             │ 0-94
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ STATUS BAR: Leave status | Disruption/Late badge | Total time      │ 96-124
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ LEG 1-7: Variable height legs with mode icons and departure times  │ 132-432
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ FOOTER: WORK — ADDRESS    [CC LOGO]            ARRIVE  HH:MM       │ 440-480
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Font loading flag
let fontsLoaded = false;

// Cached footer icon image (loaded on first use)
let footerIconImage = null;
let footerIconLoading = null;
let footerIconImageCache = null;  // V13.6: Sync cache for full render

/**
 * Load footer icon image (async, cached)
 * V13.6: Uses exact cc-footer-icon.bmp file - NO conversion, NO estimation
 */
async function loadFooterIcon() {
  if (footerIconImage) return footerIconImage;
  if (footerIconLoading) return footerIconLoading;

  footerIconLoading = (async () => {
    const possiblePaths = [
      path.join(process.cwd(), 'public/assets/brand/cc-footer-icon.bmp'),
      path.join(__dirname, '../../public/assets/brand/cc-footer-icon.bmp'),
      '/var/task/public/assets/brand/cc-footer-icon.bmp'
    ];

    for (const iconPath of possiblePaths) {
      try {
        if (fs.existsSync(iconPath)) {
          footerIconImage = await loadImage(iconPath);
          footerIconImageCache = footerIconImage;  // V13.6: Update sync cache
          return footerIconImage;
        }
      } catch (e) {
        // Continue to next path
      }
    }
    return null;
  })();

  return footerIconLoading;
}

/**
 * Preload footer icon (call during initialization)
 * V13.6: Ensures icon is loaded before first render
 */
async function preloadFooterIcon() {
  if (!footerIconImageCache) {
    await loadFooterIcon();
  }
  return footerIconImageCache;
}

// Try to load custom fonts from multiple possible locations
function loadFonts() {
  if (fontsLoaded) return;
  
  const possiblePaths = [
    path.join(process.cwd(), 'fonts'),           // Vercel serverless standard
    path.join(__dirname, '../../fonts'),          // Relative to src/services
    path.join(__dirname, '../../../fonts'),       // Relative to deeper path
    '/var/task/fonts'                              // Vercel absolute path
  ];
  
  for (const fontsDir of possiblePaths) {
    try {
      const boldPath = path.join(fontsDir, 'Inter-Bold.ttf');
      const regularPath = path.join(fontsDir, 'Inter-Regular.ttf');
      
      if (fs.existsSync(boldPath) && fs.existsSync(regularPath)) {
        GlobalFonts.registerFromPath(boldPath, 'Inter Bold');
        GlobalFonts.registerFromPath(regularPath, 'Inter');
        GlobalFonts.registerFromPath(boldPath, 'Inter');  // Also register bold as 'Inter' fallback
        fontsLoaded = true;
        return;
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
}

// Load fonts on module init
loadFonts();

// =============================================================================
// TYPE CONSTANTS (merged from v11-journey-renderer.js)
// =============================================================================

export const StepType = {
  WALK: 'walk',
  TRAIN: 'train',
  TRAM: 'tram',
  BUS: 'bus',
  COFFEE: 'coffee',
  FERRY: 'ferry'
};

export const StepStatus = {
  NORMAL: 'normal',
  DELAYED: 'delayed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  DIVERTED: 'diverted',
  EXTENDED: 'extended'
};

export const JourneyStatus = {
  ON_TIME: 'on-time',
  LEAVE_NOW: 'leave-now',
  DELAY: 'delay',
  DISRUPTION: 'disruption',
  DIVERSION: 'diversion'
};

// =============================================================================
// DEVICE CONFIGURATIONS (merged from v11-dashboard-renderer.js)
// =============================================================================

/**
 * Device configurations for CC LiveDash™ multi-device rendering
 */
export const DEVICE_CONFIGS = {
  'trmnl-og': {
    name: 'CC E-Ink Original',
    width: 800,
    height: 480,
    orientation: 'landscape',
    colorDepth: 1,
    format: 'bmp'
  },
  'trmnl-mini': {
    name: 'CC E-Ink Mini',
    width: 400,
    height: 300,
    orientation: 'landscape',
    colorDepth: 1,
    format: 'bmp'
  },
  'kindle-pw3': {
    name: 'Kindle Paperwhite 3',
    width: 758,
    height: 1024,
    orientation: 'portrait',
    colorDepth: 8,
    format: 'png'
  },
  'kindle-pw5': {
    name: 'Kindle Paperwhite 5',
    width: 1236,
    height: 1648,
    orientation: 'portrait',
    colorDepth: 8,
    format: 'png'
  },
  'kindle-basic': {
    name: 'Kindle Basic',
    width: 600,
    height: 800,
    orientation: 'portrait',
    colorDepth: 8,
    format: 'png'
  },
  'inkplate-6': {
    name: 'Inkplate 6',
    width: 800,
    height: 600,
    orientation: 'landscape',
    colorDepth: 1,
    format: 'bmp'
  },
  'inkplate-10': {
    name: 'Inkplate 10',
    width: 1200,
    height: 825,
    orientation: 'landscape',
    colorDepth: 1,
    format: 'bmp'
  },
  'web': {
    name: 'Web Preview',
    width: 800,
    height: 480,
    orientation: 'landscape',
    colorDepth: 24,
    format: 'png'
  }
};

// =============================================================================
// TIERED REFRESH CONFIGURATION (merged from zone-renderer-tiered.js)
// =============================================================================

/**
 * Refresh tier configuration
 * - Tier 1 (1 min): Time-critical zones (clock, status, leg times)
 * - Tier 2 (2 min): Content zones (weather, leg content)
 * - Tier 3 (5 min): Static zones (location)
 * - Full refresh: 10 minutes
 */
export const TIER_CONFIG = {
  1: {
    interval: 60000,  // 1 minute
    zones: ['header.time', 'status', 'leg1.time', 'leg2.time', 'leg3.time', 'leg4.time', 'leg5.time']
  },
  2: {
    interval: 120000, // 2 minutes
    zones: ['header.weather', 'header.dayDate', 'footer', 'leg1', 'leg2', 'leg3', 'leg4', 'leg5']
  },
  3: {
    interval: 300000, // 5 minutes
    zones: ['header.location']
  },
  full: {
    interval: 600000  // 10 minutes
  }
};

/**
 * Get zones for a specific refresh tier
 */
export function getZonesForTier(tier) {
  return TIER_CONFIG[tier]?.zones || [];
}

// =============================================================================
// ZONE DEFINITIONS
// =============================================================================

// Zone definitions for the new layout
export const ZONES = {
  // Header row (0-94px)
  'header.location': { id: 'header.location', x: 16, y: 2, w: 200, h: 18 },
  'header.time': { id: 'header.time', x: 12, y: 16, w: 320, h: 80 },  // v1.26: larger, lower, closer to status bar
  'header.dayDate': { id: 'header.dayDate', x: 320, y: 8, w: 260, h: 86 },
  'header.weather': { id: 'header.weather', x: 600, y: 8, w: 192, h: 86 },  // v1.26: slightly wider
  
  // Status bar (96-124px) - Full width
  'status': { id: 'status', x: 0, y: 96, w: 800, h: 32 },
  
  // Journey legs (132-440px) - Dynamic based on leg count
  'leg1': { id: 'leg1', x: 8, y: 132, w: 784, h: 54 },
  'leg2': { id: 'leg2', x: 8, y: 190, w: 784, h: 54 },
  'leg3': { id: 'leg3', x: 8, y: 248, w: 784, h: 54 },
  'leg4': { id: 'leg4', x: 8, y: 306, w: 784, h: 54 },
  'leg5': { id: 'leg5', x: 8, y: 364, w: 784, h: 54 },
  'leg6': { id: 'leg6', x: 8, y: 422, w: 784, h: 54 },
  
  // Footer (448-480px)
  'footer': { id: 'footer', x: 0, y: 440, w: 800, h: 40 }  // V13: Taller footer (40px)
};

// Cache for change detection and BMP data
let previousDataHash = {};
let cachedBMPs = {};

// =============================================================================
// MODE ICON DRAWING FUNCTIONS (V10 Spec Section 5.3)
// Canvas-drawn icons for 1-bit e-ink (no emojis, no anti-aliasing)
// =============================================================================

/**
 * Draw walk icon - person walking (32x32)
 * V10 Spec Section 5.3.1
 */
function drawWalkIcon(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  // Head
  ctx.beginPath();
  ctx.arc(16, 5, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Body
  ctx.beginPath();
  ctx.moveTo(16, 10);
  ctx.lineTo(16, 18);
  ctx.stroke();
  
  // Legs
  ctx.beginPath();
  ctx.moveTo(16, 18);
  ctx.lineTo(11, 28);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(16, 18);
  ctx.lineTo(21, 28);
  ctx.stroke();
  
  // Arms
  ctx.beginPath();
  ctx.moveTo(16, 12);
  ctx.lineTo(11, 17);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(16, 12);
  ctx.lineTo(21, 17);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw train icon (32x32)
 * V10 Spec Section 5.3.2
 */
function drawTrainIcon(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.fillStyle = '#000';
  
  // Main body with rounded top
  ctx.beginPath();
  ctx.moveTo(5, 26);
  ctx.lineTo(5, 9);
  ctx.quadraticCurveTo(5, 4, 10, 4);
  ctx.lineTo(22, 4);
  ctx.quadraticCurveTo(27, 4, 27, 9);
  ctx.lineTo(27, 26);
  ctx.closePath();
  ctx.fill();
  
  // Window (white cutout)
  ctx.fillStyle = '#FFF';
  ctx.fillRect(8, 7, 16, 10);
  
  // Lights/details at bottom (white)
  ctx.fillRect(10, 20, 4, 3);
  ctx.fillRect(18, 20, 4, 3);
  
  // Wheels/rails
  ctx.fillStyle = '#000';
  ctx.fillRect(7, 26, 6, 3);
  ctx.fillRect(19, 26, 6, 3);
  
  ctx.restore();
}

/**
 * Draw tram icon - Melbourne W-class style (32x32)
 * V10 Spec Section 5.3.3
 */
function drawTramIcon(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  
  // Pantograph pole
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(16, 8);
  ctx.stroke();
  
  // Pantograph bar
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(20, 2);
  ctx.stroke();
  
  // Main body
  ctx.beginPath();
  ctx.moveTo(4, 24);
  ctx.lineTo(4, 12);
  ctx.quadraticCurveTo(4, 8, 8, 8);
  ctx.lineTo(24, 8);
  ctx.quadraticCurveTo(28, 8, 28, 12);
  ctx.lineTo(28, 24);
  ctx.closePath();
  ctx.fill();
  
  // Windows (white cutouts)
  ctx.fillStyle = '#FFF';
  ctx.fillRect(6, 11, 6, 6);
  ctx.fillRect(13, 11, 6, 6);
  ctx.fillRect(20, 11, 6, 6);
  
  // Wheels
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(9, 26, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(23, 26, 2.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

/**
 * Draw bus icon (32x32)
 * V10 Spec Section 5.3.4
 */
function drawBusIcon(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.fillStyle = '#000';
  
  // Main body
  ctx.beginPath();
  ctx.moveTo(3, 24);
  ctx.lineTo(3, 9);
  ctx.quadraticCurveTo(3, 6, 6, 6);
  ctx.lineTo(26, 6);
  ctx.quadraticCurveTo(29, 6, 29, 9);
  ctx.lineTo(29, 24);
  ctx.closePath();
  ctx.fill();
  
  // Windshield (white)
  ctx.fillStyle = '#FFF';
  ctx.fillRect(5, 8, 22, 8);
  
  // Side windows (white)
  ctx.fillRect(5, 17, 5, 4);
  ctx.fillRect(11, 17, 5, 4);
  ctx.fillRect(17, 17, 5, 4);
  
  // Wheels
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(9, 26, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(23, 26, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

/**
 * Draw coffee icon (32x32) WITH STEAM LINES
 * V10 Spec Section 5.3.5 - Per reference image 2
 */
function drawCoffeeIcon(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  
  // Steam lines (wavy lines above cup) - per reference image
  ctx.beginPath();
  ctx.moveTo(10, 8);
  ctx.quadraticCurveTo(8, 5, 10, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 8);
  ctx.quadraticCurveTo(16, 5, 14, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, 8);
  ctx.quadraticCurveTo(16, 5, 18, 2);
  ctx.stroke();
  
  ctx.lineWidth = 2.5;
  
  // Cup body
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(6, 13);
  ctx.quadraticCurveTo(6, 24, 14, 24);
  ctx.quadraticCurveTo(22, 24, 22, 13);
  ctx.lineTo(22, 10);
  ctx.closePath();
  ctx.fill();
  
  // Handle
  ctx.beginPath();
  ctx.moveTo(22, 12);
  ctx.lineTo(25, 12);
  ctx.quadraticCurveTo(28.5, 12, 28.5, 15.5);
  ctx.quadraticCurveTo(28.5, 19, 25, 19);
  ctx.lineTo(22, 19);
  ctx.stroke();
  
  // Saucer
  ctx.fillRect(4, 26, 20, 3);
  
  ctx.restore();
}

/**
 * Draw train icon OUTLINE variant (for delayed state)
 */
function drawTrainIconOutline(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#FFF';
  
  // Main body outline
  ctx.beginPath();
  ctx.roundRect(5, 4, 22, 22, 5);
  ctx.stroke();
  
  // Window
  ctx.strokeRect(8, 7, 16, 10);
  
  // Wheels
  ctx.beginPath();
  ctx.arc(10, 28, 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(22, 28, 2, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw tram icon OUTLINE variant (for delayed state)
 */
function drawTramIconOutline(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  
  // Pantograph
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(16, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(20, 2);
  ctx.stroke();
  
  // Main body outline
  ctx.beginPath();
  ctx.roundRect(4, 8, 24, 16, 4);
  ctx.stroke();
  
  // Windows
  ctx.strokeRect(6, 11, 6, 6);
  ctx.strokeRect(13, 11, 6, 6);
  ctx.strokeRect(20, 11, 6, 6);
  
  // Wheels
  ctx.beginPath();
  ctx.arc(9, 26, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(23, 26, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw bus icon OUTLINE variant (for delayed state)
 */
function drawBusIconOutline(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  
  // Main body outline
  ctx.beginPath();
  ctx.roundRect(3, 6, 26, 18, 3);
  ctx.stroke();
  
  // Windshield
  ctx.strokeRect(5, 8, 22, 8);
  
  // Side windows
  ctx.strokeRect(5, 17, 5, 4);
  ctx.strokeRect(11, 17, 5, 4);
  ctx.strokeRect(17, 17, 5, 4);
  
  // Wheels
  ctx.beginPath();
  ctx.arc(9, 26, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(23, 26, 3, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw coffee icon OUTLINE variant (for skipped state)
 */
function drawCoffeeIconOutline(ctx, x, y, size = 32) {
  const scale = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;
  
  // Cup body outline
  ctx.beginPath();
  ctx.moveTo(6, 10);
  ctx.lineTo(6, 13);
  ctx.quadraticCurveTo(6, 24, 14, 24);
  ctx.quadraticCurveTo(22, 24, 22, 13);
  ctx.lineTo(22, 10);
  ctx.closePath();
  ctx.stroke();
  
  // Handle
  ctx.beginPath();
  ctx.moveTo(22, 12);
  ctx.lineTo(25, 12);
  ctx.quadraticCurveTo(28.5, 12, 28.5, 15.5);
  ctx.quadraticCurveTo(28.5, 19, 25, 19);
  ctx.lineTo(22, 19);
  ctx.stroke();
  
  // Saucer outline
  ctx.strokeRect(4, 26, 20, 3);
  
  ctx.restore();
}

/**
 * Draw ferry icon (canvas-drawn, no emojis)
 * Simple boat hull with cabin and wave line
 * @param {boolean} outline - If true, draw outline only
 */
function drawFerryIcon(ctx, x, y, size = 32, outline = false) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 32;
  ctx.scale(s, s);

  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Hull
  ctx.beginPath();
  ctx.moveTo(4, 20);
  ctx.lineTo(8, 26);
  ctx.lineTo(24, 26);
  ctx.lineTo(28, 20);
  ctx.closePath();
  if (outline) { ctx.stroke(); } else { ctx.fill(); }

  // Cabin
  ctx.beginPath();
  ctx.rect(11, 12, 10, 8);
  if (outline) { ctx.stroke(); } else { ctx.fill(); }

  // Funnel
  ctx.beginPath();
  ctx.rect(14, 6, 4, 6);
  if (outline) { ctx.stroke(); } else { ctx.fill(); }

  // Wave line beneath hull
  ctx.beginPath();
  ctx.moveTo(2, 29);
  ctx.quadraticCurveTo(8, 32, 16, 29);
  ctx.quadraticCurveTo(24, 26, 30, 29);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw mode icon by type
 * @param {boolean} outline - If true, draw outline variant (for delayed/skipped states)
 */
function drawModeIcon(ctx, type, x, y, size = 32, outline = false) {
  if (outline) {
    switch (type) {
      case 'train':
      case 'vline':
        drawTrainIconOutline(ctx, x, y, size);
        return;
      case 'tram':
        drawTramIconOutline(ctx, x, y, size);
        return;
      case 'bus':
        drawBusIconOutline(ctx, x, y, size);
        return;
      case 'coffee':
        drawCoffeeIconOutline(ctx, x, y, size);
        return;
      case 'ferry':
        drawFerryIcon(ctx, x, y, size, true);
        return;
      // Walk icon doesn't have outline variant - always show solid
    }
  }

  switch (type) {
    case 'walk':
      drawWalkIcon(ctx, x, y, size);
      break;
    case 'train':
    case 'vline':
      drawTrainIcon(ctx, x, y, size);
      break;
    case 'tram':
      drawTramIcon(ctx, x, y, size);
      break;
    case 'bus':
      drawBusIcon(ctx, x, y, size);
      break;
    case 'coffee':
      drawCoffeeIcon(ctx, x, y, size);
      break;
    case 'ferry':
      drawFerryIcon(ctx, x, y, size);
      break;
    default:
      // Default: draw a simple transit icon (circle with T)
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x + size/2, y + size/2, size/2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${Math.floor(size * 0.5)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', x + size/2, y + size/2);
      ctx.textAlign = 'left';
      break;
  }
}

/**
 * Draw leg number circle (V10 Spec Section 5.2)
 * Per design reference images:
 * - Normal: Filled black circle with white number
 * - Skipped/Coffee-skip: Dashed circle outline with black number inside
 * - Cancelled: Dashed circle with X
 */
function drawLegNumber(ctx, number, x, y, status = 'normal', sizeParam = 24) {
  // v1.20: Accept size parameter for scaling
  const size = typeof sizeParam === 'number' ? sizeParam : 24;
  const isSkippedCoffee = sizeParam === true;  // Backward compat: old boolean param
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const fontSize = Math.max(10, Math.round(size * 0.54));
  
  ctx.fillStyle = '#000';
  
  // Skipped coffee or cancelled: dashed circle outline
  if (status === 'skipped' || status === 'cancelled' || isSkippedCoffee) {
    // Dashed circle outline (per reference image 1 - leg 2)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Number inside (black, no fill behind)
    if (status === 'cancelled') {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('X', centerX, centerY);
    } else {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(number.toString(), centerX, centerY);
    }
  } else {
    // Normal: solid black circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // White number - v1.20: scaled font
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), centerX, centerY);
  }
  
  ctx.textAlign = 'left';
}

/**
 * Convert canvas to 1-bit BMP for e-ink display
 */
function canvasToBMP(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  
  // BMP row size must be multiple of 4 bytes
  const rowSize = Math.ceil(w / 32) * 4;
  const dataSize = rowSize * h;
  
  // BMP header (14 bytes) + DIB header (40 bytes) + color table (8 bytes) = 62 bytes
  const buffer = Buffer.alloc(62 + dataSize);
  
  // BMP Header
  buffer.write('BM', 0);                        // Signature
  buffer.writeUInt32LE(62 + dataSize, 2);       // File size
  buffer.writeUInt32LE(62, 10);                 // Pixel data offset
  
  // DIB Header (BITMAPINFOHEADER)
  buffer.writeUInt32LE(40, 14);                 // DIB header size
  buffer.writeInt32LE(w, 18);                   // Width
  buffer.writeInt32LE(-h, 22);                  // Height (negative = top-down)
  buffer.writeUInt16LE(1, 26);                  // Color planes
  buffer.writeUInt16LE(1, 28);                  // Bits per pixel (1-bit)
  buffer.writeUInt32LE(0, 30);                  // Compression (none)
  buffer.writeUInt32LE(dataSize, 34);           // Image size
  buffer.writeInt32LE(2835, 38);                // X pixels per meter
  buffer.writeInt32LE(2835, 42);                // Y pixels per meter
  buffer.writeUInt32LE(2, 46);                  // Colors in color table
  buffer.writeUInt32LE(0, 50);                  // Important colors
  
  // Color table (black and white)
  buffer.writeUInt32LE(0x00000000, 54);         // Black (index 0)
  buffer.writeUInt32LE(0x00FFFFFF, 58);         // White (index 1)
  
  // Pixel data
  let offset = 62;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8 && (x + bit) < w; bit++) {
        const i = (y * w + x + bit) * 4;
        // Convert to grayscale and threshold
        const gray = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
        if (gray > 128) {
          byte |= (0x80 >> bit); // White pixel = 1
        }
      }
      buffer.writeUInt8(byte, offset++);
    }
    // Pad row to 4-byte boundary
    const padding = rowSize - Math.ceil(w / 8);
    for (let p = 0; p < padding; p++) {
      buffer.writeUInt8(0, offset++);
    }
  }
  
  return buffer;
}

/**
 * Get dynamic leg zone based on total leg count
 * V13: Variable heights - walk legs are compact (1x), transit/coffee are double (2x)
 */
function getDynamicLegZone(legIndex, totalLegs, legs = null) {
  const startY = 132;
  const endY = 432;  // V13: Reduced to 432 for taller footer (40px instead of 32px)
  const gap = 10;  // V13: Slightly smaller gap for more leg space
  const availableHeight = endY - startY;  // 300px total

  // V13: If we have the legs array, calculate variable heights
  if (legs && legs.length > 0) {
    // Calculate total "weight" - walk=1, transit/coffee=2
    let totalWeight = 0;
    const legWeights = legs.map(leg => {
      const isWalk = leg.type === 'walk';
      const weight = isWalk ? 1 : 2;  // Walk legs are half height
      totalWeight += weight;
      return weight;
    });

    // Calculate base unit height
    const totalGaps = (legs.length - 1) * gap;
    const baseUnit = Math.floor((availableHeight - totalGaps) / totalWeight);

    // Calculate Y position by summing previous legs
    let y = startY;
    for (let i = 0; i < legIndex - 1; i++) {
      y += (baseUnit * legWeights[i]) + gap;
    }

    const legHeight = baseUnit * legWeights[legIndex - 1];

    // Clamp heights: walk max 40px, transit/coffee max 80px
    const maxHeight = legWeights[legIndex - 1] === 1 ? 40 : 80;
    const finalHeight = Math.min(legHeight, maxHeight);

    return { id: `leg${legIndex}`, x: 8, y, w: 784, h: finalHeight };
  }

  // Fallback: equal heights (legacy behavior)
  const maxLegHeight = 52;
  const legHeight = Math.min(maxLegHeight, Math.floor((availableHeight - (totalLegs - 1) * gap) / totalLegs));
  const y = startY + (legIndex - 1) * (legHeight + gap);

  return { id: `leg${legIndex}`, x: 8, y, w: 784, h: legHeight };
}

/**
 * Merge consecutive walk legs into a single leg (Section 7.5.1 MANDATORY)
 * Defensive pass — ensures no back-to-back walks ever appear in rendering
 */
function mergeConsecutiveWalkLegs(legs) {
  const merged = [];
  for (let i = 0; i < legs.length; i++) {
    const current = { ...legs[i] };
    if (current.type === 'walk' && i + 1 < legs.length && legs[i + 1].type === 'walk') {
      const next = legs[i + 1];
      current.minutes = (current.minutes || 0) + (next.minutes || 0);
      current.durationMinutes = (current.durationMinutes || 0) + (next.durationMinutes || 0);
      current.to = next.to || current.to;
      current.stopName = next.stopName || current.stopName;
      current.stationName = next.stationName || current.stationName;
      current.title = `Walk to ${next.to || current.to || 'destination'}`;
      i++;
    }
    merged.push(current);
  }
  return merged;
}

/**
 * Render a journey leg zone (V10 Spec Section 5)
 * Includes: leg number, mode icon, title, subtitle, duration box
 * v1.20: Dynamic scaling based on leg height
 */
function renderLegZone(ctx, leg, zone, legNumber = 1, isHighlighted = false) {
  const { x, y, w, h } = { x: 0, y: 0, w: zone.w, h: zone.h };
  const status = leg.status || 'normal';
  
  // v1.20: Calculate scale factor based on leg height (baseline 52px)
  const baseHeight = 52;
  const scale = Math.min(1, h / baseHeight);
  const titleSize = Math.max(11, Math.round(16 * scale));
  const subtitleSize = Math.max(9, Math.round(12 * scale));
  const iconSize = Math.max(20, Math.round(32 * scale));
  const numberSize = Math.max(16, Math.round(24 * scale));
  
  // Determine border style based on status (V10 Spec Section 5.1)
  let borderWidth = 2;
  let borderDash = [];
  
  if (status === 'delayed') {
    borderWidth = 3;
    borderDash = [6, 4];
  } else if (leg.type === 'coffee' && leg.canGet) {
    borderWidth = 3;
  } else if (leg.type === 'coffee' && !leg.canGet) {
    borderWidth = 2;
    borderDash = [4, 4];
  }
  
  // Background
  if (isHighlighted) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFF';
  } else {
    ctx.fillStyle = '#FFF';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000';
    
    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = borderWidth;
    ctx.setLineDash(borderDash);
    ctx.strokeRect(x + borderWidth/2, y + borderWidth/2, w - borderWidth, h - borderWidth);
    ctx.setLineDash([]);
  }
  
  // Leg number circle (V10 Spec Section 5.2) - scaled
  // v1.21: Fixed positioning - consistent spacing
  const numberX = x + 6;
  const numberY = y + (h - numberSize) / 2;
  drawLegNumber(ctx, legNumber, numberX, numberY, status, numberSize);
  
  // Mode icon (V10 Spec Section 5.3) - scaled
  // v1.21: Icon starts right after number with 4px gap
  const iconX = numberX + numberSize + 4;
  const iconY = y + (h - iconSize) / 2;
  
  // For skipped coffee, use outline variant (1-bit safe, no gray pixels)
  const useOutline = (leg.type === 'coffee' && !leg.canGet);
  drawModeIcon(ctx, leg.type, iconX, iconY, iconSize, useOutline);
  
  // Main text area (1-bit: ALL text must be #000 or #FFF, no gray)
  const textX = iconX + iconSize + 8;
  const textColor = isHighlighted ? '#FFF' : '#000';  // E-ink 1-bit: NO GRAY
  ctx.fillStyle = textColor;
  
  // v1.20: Calculate vertical positions based on height
  const textAreaHeight = h - 4;
  const titleY = y + Math.round(textAreaHeight * 0.15);
  const subtitleY = y + Math.round(textAreaHeight * 0.55);
  
  // Title with status prefix (V10 Spec Section 5.4)
  // v1.23: Removed emoji prefixes - they render as artifacts on e-ink
  // Status is already indicated by border style and we have proper icons
  ctx.font = `bold ${titleSize}px Inter, sans-serif`;
  ctx.textBaseline = 'top';
  
  const title = leg.title || getLegTitle(leg);
  ctx.fillText(title, textX, titleY);
  
  // v1.20: Time box dimensions (scaled) - define early for DEPART positioning
  const timeBoxW = Math.max(56, Math.round(72 * scale));
  const timeBoxX = w - timeBoxW;
  
  // Subtitle (V10 Spec Section 5.5)
  // Calculate max width to prevent overlap with DEPART column and time box
  const hasDepart = ['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type) && leg.departTime;
  const departColW = hasDepart ? 55 : 0;  // v1.20: narrower DEPART column
  const subtitleMaxWidth = w - textX - timeBoxW - departColW - 8;
  
  ctx.font = `${subtitleSize}px Inter, sans-serif`;
  // V15.0: screen.js provides subtitle with "Next: X, Y min LIVE" (catchable only)
  let subtitle = leg.subtitle || getLegSubtitle(leg);

  // Truncate subtitle if too long
  while (ctx.measureText(subtitle).width > subtitleMaxWidth && subtitle.length > 10) {
    subtitle = subtitle.slice(0, -4) + '...';
  }
  ctx.fillText(subtitle, textX, subtitleY);
  
  // v1.26: DEPART column - scales with leg height
  if (hasDepart) {
    const departColW = Math.max(35, Math.round(45 * scale));
    const departX = timeBoxX - departColW / 2 - 5;
    ctx.fillStyle = textColor;
    // Two-line label: "PLANNED" / "DEPART" - scaled
    const labelSize = Math.max(5, Math.round(6 * scale));
    const timeSize = Math.max(8, Math.round(10 * scale));
    ctx.font = `${labelSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('PLANNED', departX, titleY);
    ctx.fillText('DEPART', departX, titleY + labelSize + 1);
    // Time below - scaled
    ctx.font = `bold ${timeSize}px Inter, sans-serif`;
    ctx.fillText(leg.departTime, departX, subtitleY);
    ctx.textAlign = 'left';
  }
  
  // Time box (right side, fills to edge) - V10 Spec Section 5.6
  // v1.20: timeBoxW and timeBoxX already defined above for DEPART positioning
  const timeBoxH = h;
  const timeBoxY = y;
  
  // Determine time box style
  let timeBoxBg = '#000';
  let timeBoxTextColor = '#FFF';
  let showDuration = true;
  
  if (isHighlighted) {
    timeBoxBg = '#FFF';
    timeBoxTextColor = '#000';
  } else if (status === 'delayed') {
    timeBoxBg = '#FFF';
    timeBoxTextColor = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(timeBoxX + 2, timeBoxY + 2, timeBoxW - 4, timeBoxH - 4);
    ctx.setLineDash([]);
  } else if (leg.type === 'coffee' && !leg.canGet) {
    // Skip coffee - dashed border, no fill (1-bit: use #000, not gray)
    ctx.strokeStyle = '#000';  // E-ink 1-bit: NO GRAY
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(timeBoxX + 2, timeBoxY + 2, timeBoxW - 4, timeBoxH - 4);
    ctx.setLineDash([]);
    showDuration = false;
    // Draw "—" for skipped - v1.20: scaled
    const skipFontSize = Math.max(16, Math.round(22 * scale));
    ctx.fillStyle = '#000';  // E-ink 1-bit: NO GRAY
    ctx.font = `bold ${skipFontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('—', timeBoxX + timeBoxW / 2, timeBoxY + timeBoxH / 2);
    ctx.textAlign = 'left';
  }
  
  if (showDuration && !(leg.type === 'coffee' && !leg.canGet)) {
    // Time box background
    ctx.fillStyle = timeBoxBg;
    if (timeBoxBg === '#000') {
      ctx.fillRect(timeBoxX, timeBoxY, timeBoxW, timeBoxH);
    }
    
    // v1.20: Scale time text based on box height
    const minFontSize = Math.max(16, Math.round(22 * scale));
    const labelFontSize = Math.max(7, Math.round(9 * scale));
    const minOffset = Math.round(8 * scale);
    const labelOffset = Math.round(12 * scale);
    
    // Time text
    ctx.fillStyle = timeBoxTextColor;
    ctx.font = `bold ${minFontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const minutes = leg.minutes ?? leg.durationMinutes ?? '--';
    const displayMin = leg.type === 'coffee' ? `~${minutes}` : minutes.toString();
    ctx.fillText(displayMin, timeBoxX + timeBoxW / 2, timeBoxY + timeBoxH / 2 - minOffset);
    
    ctx.font = `${labelFontSize}px Inter, sans-serif`;
    const timeLabel = leg.type === 'walk' ? 'MIN WALK' : 'MIN';
    ctx.fillText(timeLabel, timeBoxX + timeBoxW / 2, timeBoxY + timeBoxH / 2 + labelOffset);
  }
  
  // Reset
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';
}

/**
 * Generate leg title from leg data
 */
function getLegTitle(leg) {
  // Handle diversion walks (per ref image 8)
  if (leg.type === 'walk' && leg.isDiversion) {
    return 'Walk Around Diversion';
  }

  // V13.3: Helper to get specific stop/station name
  const getStopName = () => {
    return leg.stopName || leg.stationName || leg.platformName ||
           leg.from?.name || leg.fromStop || leg.departure?.name ||
           leg.to || 'Stop';
  };

  const getDestName = () => {
    return leg.destination?.name || leg.arrivalStop || leg.to ||
           leg.arrival?.name || leg.toStop || 'City';
  };

  switch (leg.type) {
    case 'walk':
      // V13.3: Be specific about destination
      if (leg.to === 'home' || leg.toHome || leg.to?.toLowerCase().includes('home')) return 'Walk Home';
      if (leg.cafeName || leg.to?.toLowerCase().includes('cafe')) {
        return `Walk to ${leg.cafeName || 'Cafe'}`;
      }
      if (leg.to === 'work' || leg.to?.toLowerCase().includes('work') || leg.to === 'office') return 'Walk to Office';
      // V13.3: Use specific station/stop name
      const walkDest = leg.toStopName || leg.toStation || leg.to || getStopName();
      return `Walk to ${walkDest}`;
    case 'coffee':
      // V13.3: Show specific cafe name
      return leg.cafeName || leg.location || leg.name || 'Coffee at Cafe';
    case 'tram':
      // V13.3: Show specific stop name in title
      if (leg.status === 'diverted') {
        return `Tram ${leg.routeNumber || ''} Diverted`;
      }
      const tramDest = getDestName();
      return `Tram ${leg.routeNumber || ''} to ${tramDest}`;
    case 'train':
      // V13.3: Show specific station name
      const trainDest = getDestName();
      return `Train to ${trainDest}`;
    case 'bus':
      if (leg.isReplacement) {
        return 'Rail Replacement Bus';
      }
      const busDest = getDestName();
      return `Bus ${leg.routeNumber || ''} to ${busDest}`;
    case 'ferry':
      const ferryDest = getDestName();
      return `Ferry to ${ferryDest}`;
    case 'vline':
      const vlineDest = getDestName();
      return `V/Line to ${vlineDest}`;
    case 'transit':
      const transitDest = getDestName();
      return `${leg.mode || 'Transit'} ${leg.routeNumber || ''} to ${transitDest}`;
    case 'wait':
      return `Wait at ${leg.location || leg.stopName || 'stop'}`;
    default:
      return leg.title || leg.type || 'Leg';
  }
}

/**
 * Generate leg subtitle from leg data (V10 Spec Section 5.5)
 */
function getLegSubtitle(leg) {
  const status = leg.status || 'normal';
  
  switch (leg.type) {
    case 'walk':
      // V15.0: Coffee bypass walk — direct route skipping cafe
      if (leg.coffeeBypass) {
        const dest = leg.to || leg.stopName || leg.stationName || '';
        return dest ? `Bypass coffee, direct to ${dest}` : 'Bypass coffee, recalculating direct';
      }
      // Diversion walk (per ref image 8)
      if (leg.isDiversion) {
        return leg.diversionReason || 'Extra walk due to works';
      }
      // First walk: "From home • [dest]" or "From work • [dest]" (per ref images 5, 8)
      if (leg.isFirst || leg.fromHome || leg.fromWork) {
        const dest = leg.to || leg.destination?.name || '';
        const origin = leg.fromWork ? 'From work' : 'From home';
        return dest ? `${origin} • ${dest}` : origin;
      }
      // Final walk to home (per ref image 8)
      if (leg.toHome) {
        return leg.destination?.address || leg.to || '';
      }
      const location = leg.platform || leg.location || leg.to || '';
      const dist = leg.distanceMeters || leg.distance;
      return dist ? `${location} • ${dist}m` : location;
      
    case 'coffee':
      // V13.2: Coffee status - only show open/closed and busyness
      // No timing calculations relative to arrival (per user request)
      if (leg.skipReason === 'closed' || leg.cafeClosed) {
        // Cafe is closed
        const opensAt = leg.opensAt || leg.cafeOpensAt;
        return opensAt ? `CLOSED — Opens at ${opensAt}` : 'CLOSED — Cafe not open';
      }
      // V15.0: Handle skipped coffee (running late or other skip reasons)
      if (leg.canGet === false || leg.status === 'skipped' || leg.state === 'skip') {
        return leg.subtitle || '[X] SKIPPED — No time for coffee';
      }

      // V13.2: Show busyness level only (not timing-dependent)
      const busyness = leg.busyness || leg.busyLevel || 'low';
      const busyLabel = busyness === 'high' ? 'Busy' : busyness === 'medium' ? 'Moderate' : 'Quiet';
      const waitTime = leg.coffeeWaitTime || leg.coffeeTime || (busyness === 'high' ? 8 : busyness === 'medium' ? 5 : 3);

      // Show coffee with busyness and estimated wait
      if (leg.fridayTreat || leg.isFriday) {
        return `FRIDAY TREAT • ${busyLabel} • ~${waitTime} min`;
      }
      return `COFFEE • ${busyLabel} • ~${waitTime} min wait`;
      
    case 'tram':
    case 'train':
    case 'bus':
    case 'ferry':
    case 'vline':
    case 'transit':
      // Transit: show line name + routing + "Next: X, Y min"
      // V1.40: Metro Tunnel compliance
      const lineName = leg.lineName || leg.routeName || '';
      
      // v1.40: Calculate live countdown from absolute times if available
      // V15.0: Filter to catchable departures only (per Critical Pattern #6)
      let nextDepartures = [];
      if (leg.nextDepartureTimesMs && leg.nextDepartureTimesMs.length > 0) {
        const nowMs = Date.now();
        nextDepartures = leg.nextDepartureTimesMs
          .map(depMs => Math.max(0, Math.round((depMs - nowMs) / 60000)))
          .filter(mins => mins >= 0 && mins <= 60);
      } else if (leg.nextDepartures && leg.nextDepartures.length > 0) {
        // Only use pre-filtered catchable departures from screen.js
        nextDepartures = leg.nextDepartures.filter(m => m >= 0 && m <= 60);
      }
      
      let parts = [];
      if (lineName) parts.push(lineName);
      
      // V1.40: Add Metro Tunnel or City Loop routing indicator
      if (leg.viaMetroTunnel || leg.via?.toLowerCase().includes('metro tunnel')) {
        parts.push('via Metro Tunnel');
      } else if (leg.viaCityLoop || leg.via?.toLowerCase().includes('city loop')) {
        parts.push('via City Loop');
      } else if (leg.via) {
        // Generic via indicator
        parts.push(`via ${leg.via}`);
      }
      
      // Add "Next: X, Y min" with LIVE indicator or ~ prefix for timetable data
      // V15.0: Use explicit isLive flag — only true when GTFS-RT data matched
      const hasLiveData = leg.isLive === true;
      const liveIndicator = hasLiveData ? ' LIVE' : '';
      const tilde = hasLiveData ? '' : '~';
      if (nextDepartures.length >= 2) {
        parts.push(`${tilde}Next: ${nextDepartures[0]}, ${nextDepartures[1]} min${liveIndicator}`);
      } else if (nextDepartures.length === 1) {
        parts.push(`${tilde}Next: ${nextDepartures[0]} min${liveIndicator}`);
      }
      
      // Add delay info if delayed
      if (status === 'delayed' && leg.delayMinutes) {
        return `+${leg.delayMinutes} MIN • ${parts.join(' • ')}`;
      }
      
      // Add diversion stop if diverted
      if (status === 'diverted' && leg.diversionStop) {
        parts.push(leg.diversionStop);
      }
      
      return parts.join(' • ');
      
    case 'wait':
      return leg.location ? `At ${leg.location}` : '';
      
    default:
      return leg.subtitle || '';
  }
}

/**
 * Draw battery icon with fill level
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} percent - Battery percentage (0-100)
 * @param {number} size - Icon size (default 12)
 */
function drawBatteryIcon(ctx, x, y, percent, size = 12) {
  const w = size * 1.8;  // Battery body width
  const h = size;        // Battery body height
  const tipW = size * 0.15;  // Battery tip width
  const tipH = size * 0.4;   // Battery tip height
  const padding = 2;

  // Battery outline
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Battery tip (positive terminal)
  ctx.fillStyle = '#000';
  ctx.fillRect(x + w, y + (h - tipH) / 2, tipW, tipH);

  // Battery fill level
  const fillWidth = Math.max(0, ((w - padding * 2) * Math.min(100, percent)) / 100);
  ctx.fillStyle = '#000';
  ctx.fillRect(x + padding, y + padding, fillWidth, h - padding * 2);
}

/**
 * Render header location zone
 * V13.6: Now includes battery icon and percentage
 */
function renderHeaderLocation(data, prefs) {
  const zone = ZONES['header.location'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, zone.w, zone.h);

  ctx.fillStyle = '#000';
  ctx.font = 'bold 10px Inter, sans-serif';
  ctx.textBaseline = 'top';

  const location = (data.location || data.origin || 'HOME').toUpperCase();
  ctx.fillText(location, 0, 4);

  // V13.6: Battery indicator (if provided by device)
  const batteryPercent = data.battery_percent;
  if (batteryPercent !== null && batteryPercent !== undefined) {
    const locationWidth = ctx.measureText(location).width;
    const batteryX = locationWidth + 8;
    const batteryY = 3;

    // Draw battery icon
    drawBatteryIcon(ctx, batteryX, batteryY, batteryPercent, 10);

    // Draw percentage text
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText(`${batteryPercent}%`, batteryX + 22, 4);
  }

  return canvasToBMP(canvas);
}

/**
 * Render header time zone
 */
function renderHeaderTime(data, prefs) {
  const zone = ZONES['header.time'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, zone.w, zone.h);
  
  ctx.fillStyle = '#000';
  // v1.26: Maximum clock size (96px), positioned to fill zone
  ctx.font = '900 96px Inter, sans-serif';
  ctx.textBaseline = 'top';
  
  const time = data.current_time || data.time || '--:--';
  ctx.fillText(time, 0, -10);  // Negative offset to maximize visible size
  
  return canvasToBMP(canvas);
}

/**
 * Render header day/date zone
 */
function renderHeaderDayDate(data, prefs) {
  const zone = ZONES['header.dayDate'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, zone.w, zone.h);
  
  ctx.fillStyle = '#000';
  
  // Day of week
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(data.day || '', 0, 8);
  
  // Date
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText(data.date || '', 0, 36);
  
  return canvasToBMP(canvas);
}

/**
 * Render weather zone (V10 Spec Section 2.6 & 2.7)
 * Includes temperature, condition, and umbrella indicator
 */
function renderHeaderWeather(data, prefs) {
  const zone = ZONES['header.weather'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, zone.w, zone.h);
  
  // Weather box border (V10 Spec Section 2.6)
  // v1.26: Better spacing for temp and condition
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, zone.w - 4, 60);
  
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  
  // Temperature (larger, top of box)
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.textBaseline = 'top';
  const temp = data.temp ?? data.temperature ?? '--';
  ctx.fillText(`${temp}°`, zone.w / 2, 4);
  
  // Condition (below temp with clear separation)
  ctx.font = '12px Inter, sans-serif';
  let condition = data.condition || data.weather || '';
  // Truncate if too long for box width
  while (ctx.measureText(condition).width > zone.w - 16 && condition.length > 3) {
    condition = condition.slice(0, -1);
  }
  ctx.fillText(condition, zone.w / 2, 42);

  // V15.0: Feels-like temperature from mindset engine (wind chill)
  if (data.mindset_feels_like) {
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(data.mindset_feels_like, zone.w / 2, 56);
  }

  // V14.0: Lifestyle context suggestions (replaces simple umbrella indicator)
  // Uses lifestyle_display from LifestyleContext engine, falls back to umbrella logic
  const umbrellaY = 66;
  const umbrellaH = 18;
  const umbrellaW = zone.w - 8;
  const umbrellaX = 4;

  const lifestyleDisplay = data.lifestyle_display;
  const needsUmbrella = data.rain_expected || data.precipitation > 30 ||
    (data.condition && /rain|shower|storm|drizzle/i.test(data.condition));

  // Determine display text: prefer lifestyle engine output, fallback to basic umbrella
  const displayText = lifestyleDisplay || (needsUmbrella ? 'BRING UMBRELLA' : 'NO UMBRELLA');
  const isAlert = needsUmbrella || (lifestyleDisplay && /UMBRELLA|JACKET|HYDRAT/i.test(lifestyleDisplay));

  if (isAlert) {
    // V15.0: Black background with white text — action needed (bring umbrella, jacket, etc.)
    ctx.fillStyle = '#000';
    ctx.fillRect(umbrellaX, umbrellaY, umbrellaW, umbrellaH);
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, umbrellaX + umbrellaW / 2, umbrellaY + umbrellaH / 2);
  } else {
    // V15.0: Subtle text only — no action needed (no box, no border)
    ctx.fillStyle = '#000';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayText, umbrellaX + umbrellaW / 2, umbrellaY + umbrellaH / 2);
  }

  ctx.textAlign = 'left';
  return canvasToBMP(canvas);
}

/**
 * Render status bar zone (V10 Spec Section 4)
 * Left: Status message (LEAVE NOW / DELAY / DISRUPTION)
 * Right: Total journey time
 */

function renderStatus(data, prefs) {
  const zone = ZONES['status'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Inverted bar (black background)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, zone.w, zone.h);
  
  ctx.fillStyle = '#FFF';
  ctx.textBaseline = 'middle';
  
  // v1.41: Calculate LIVE arrival time based on current time + journey duration
  // This ensures the arrival time is always fresh, not stale from when data was fetched
  const totalMinutes = data.total_minutes || data.totalMinutes || data.journeyDuration || 0;
  
  // Get Melbourne time for live calculation (DEVELOPMENT-RULES.md - location agnostic)
  const state = data.state || prefs?.state || 'VIC';
  const timezones = {
    'VIC': 'Australia/Melbourne', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney',
    'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth',
    'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin'
  };
  const timezone = timezones[state] || 'Australia/Melbourne';
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const arriveTime = new Date(localNow.getTime() + totalMinutes * 60000);
  
  // Format in 12-hour format (per DEVELOPMENT-RULES.md Section 12.2)
  const arrH = arriveTime.getHours();
  const arrM = arriveTime.getMinutes().toString().padStart(2, '0');
  const ampm = arrH >= 12 ? 'pm' : 'am';
  const arrH12 = arrH % 12 || 12;
  const arriveBy = totalMinutes > 0 ? `${arrH12}:${arrM}${ampm}` : (data.arrive_by || '--:--');
  const leaveIn = data.leave_in || data.leaveIn;
  
  // Determine status type and message (V10 Spec Section 4.1)
  let statusText = '';
  if (data.status_type === 'disruption' || data.disruption) {
    const delayMin = data.delay_minutes || data.delayMinutes || 0;
    statusText = delayMin > 0 
      ? `[!] DISRUPTION → Arrive ${arriveBy} (+${delayMin} min)`
      : `[!] DISRUPTION → Arrive ${arriveBy}`;
  } else if (data.status_type === 'delay' || data.isDelayed) {
    const delayMin = data.delay_minutes || data.delayMinutes || 0;
    statusText = `[!] DELAY → Arrive ${arriveBy} (+${delayMin} min)`;
  } else if (data.status_type === 'diversion' || data.isDiverted) {
    const delayMin = data.delay_minutes || data.delayMinutes || 0;
    statusText = delayMin > 0
      ? `[!] TRAM DIVERSION → Arrive ${arriveBy} (+${delayMin} min)`
      : `[!] DIVERSION → Arrive ${arriveBy}`;
  } else {
    // Always show "LEAVE NOW" - per Angus 2026-02-01
    statusText = `LEAVE NOW → Arrive ${arriveBy}`;
  }
  
  // Left text (status message)
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText(statusText, 16, zone.h / 2);

  // V14.0: Confidence score (before total minutes)
  const confidenceScore = data.confidence_score;
  if (confidenceScore !== undefined && confidenceScore !== null) {
    ctx.textAlign = 'right';
    const confLabel = confidenceScore >= 75 ? 'ON TIME' : confidenceScore >= 50 ? 'AT RISK' : 'UNLIKELY';
    const needsAttention = confidenceScore < 75;
    // V15.0: Bold only when action needed (AT RISK / UNLIKELY). Subtle for ON TIME.
    ctx.font = needsAttention ? 'bold 12px Inter, sans-serif' : '11px Inter, sans-serif';
    // V15.0: Only append mindset when stress is not LOW (action-needed only)
    const stressIsLow = !data.mindset_stress || data.mindset_stress === 'LOW';
    const mindsetText = (!stressIsLow && data.mindset_display) ? ` \u2022 ${data.mindset_display}` : '';
    ctx.fillText(`${confidenceScore}% ${confLabel}${mindsetText}`, zone.w - 80, zone.h / 2);
  }

  // Right text - Total journey time (V10 Spec Section 4.2)
  if (totalMinutes) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`${totalMinutes} min`, zone.w - 16, zone.h / 2);
    ctx.textAlign = 'left';
  }
  
  return canvasToBMP(canvas);
}
/**
 * Render a journey leg
 */
function renderLeg(legIndex, data, prefs) {
  const legs = data.journey_legs || data.legs || [];
  const totalLegs = legs.length;
  
  if (legIndex > totalLegs) {
    return null; // No leg at this index
  }
  
  const leg = legs[legIndex - 1];
  if (!leg) return null;
  
  // Mark first leg for subtitle generation
  if (legIndex === 1) {
    leg.isFirst = true;
  }
  
  const zone = getDynamicLegZone(legIndex, totalLegs, legs);
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Check if this leg is the current/next one to highlight
  const isHighlighted = leg.isCurrent || leg.isNext || (legIndex === 1 && data.highlight_first);
  
  renderLegZone(ctx, leg, zone, legIndex, isHighlighted);
  
  return canvasToBMP(canvas);
}

/**
 * Render footer zone
 * V13.6: Uses exact cc-footer-icon.bmp file - no conversion, no estimation
 */
async function renderFooter(data, prefs) {
  const zone = ZONES['footer'];
  const canvas = createCanvas(zone.w, zone.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // V13: Inverted bar (black background)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, zone.w, zone.h);

  ctx.fillStyle = '#FFF';

  // V13: Destination (left) - 16px bold
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const dest = (data.destination || data.work || 'WORK').toUpperCase();
  const destAddress = data.destination_address || data.destinationAddress || '';
  const footerDest = destAddress ? `${dest} — ${destAddress.toUpperCase()}` : dest;
  ctx.fillText(footerDest, 16, zone.h / 2);

  // V13.6: Load and draw exact BMP icon - no modification
  const footerIcon = await loadFooterIcon();
  if (footerIcon) {
    // Center the icon (33x38 original size)
    const iconW = footerIcon.width;
    const iconH = footerIcon.height;
    const iconX = (zone.w - iconW) / 2;
    const iconY = (zone.h - iconH) / 2;
    ctx.drawImage(footerIcon, iconX, iconY, iconW, iconH);
  } else {
    // Fallback: simple "CC" text if icon not found
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CC', zone.w / 2, zone.h / 2);
  }

  // V13: Arrival time (right) - 22px bold with label
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';

  // "ARRIVE" label (smaller, above time) - white text on black footer background
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = '#FFF';
  ctx.fillText('ARRIVE', zone.w - 16, zone.h / 2 - 10);

  // Time (larger)
  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 22px Inter, sans-serif';
  const arriveTime = data.arrive_by || data.arrivalTime || '--:--';
  ctx.fillText(arriveTime, zone.w - 16, zone.h / 2 + 6);

  ctx.textAlign = 'left';

  return canvasToBMP(canvas);
}

/**
 * Main render function for a single zone
 * V13.6: Now async to support footer icon loading
 */
export async function renderSingleZone(zoneId, data, prefs = {}) {
  try {
    switch (zoneId) {
      case 'header.location':
        return renderHeaderLocation(data, prefs);
      case 'header.time':
        return renderHeaderTime(data, prefs);
      case 'header.dayDate':
        return renderHeaderDayDate(data, prefs);
      case 'header.weather':
        return renderHeaderWeather(data, prefs);
      case 'status':
        return renderStatus(data, prefs);
      case 'footer':
        return await renderFooter(data, prefs);
      default:
        // Handle leg zones (leg1, leg2, etc.)
        if (zoneId.startsWith('leg')) {
          const legIndex = parseInt(zoneId.replace('leg', ''), 10);
          return renderLeg(legIndex, data, prefs);
        }
        return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Get all active zone IDs based on data
 */
export function getActiveZones(data) {
  const zones = ['header.location', 'header.time', 'header.dayDate', 'header.weather', 'status', 'footer'];
  
  const legs = data.journey_legs || data.legs || [];
  const legCount = Math.min(legs.length, 6);
  
  for (let i = 1; i <= legCount; i++) {
    zones.push(`leg${i}`);
  }
  
  return zones;
}

/**
 * Get changed zones by comparing with previous data
 */
export function getChangedZones(data, forceAll = false) {
  const activeZones = getActiveZones(data);
  
  if (forceAll) {
    return activeZones;
  }
  
  const changedZones = [];
  
  for (const zoneId of activeZones) {
    // Create a hash of the relevant data for this zone
    let hash;
    
    if (zoneId === 'header.time') {
      hash = data.current_time || data.time;
    } else if (zoneId === 'header.weather') {
      hash = JSON.stringify({ temp: data.temp, condition: data.condition });
    } else if (zoneId === 'status') {
      hash = JSON.stringify({ 
        coffee: data.coffee_decision, 
        disruption: data.disruption,
        arrive: data.arrive_by 
      });
    } else if (zoneId.startsWith('leg')) {
      const legIndex = parseInt(zoneId.replace('leg', ''), 10) - 1;
      const leg = (data.journey_legs || data.legs || [])[legIndex];
      hash = leg ? JSON.stringify({ m: leg.minutes, t: leg.title }) : null;
    } else {
      hash = JSON.stringify(data[zoneId] || zoneId);
    }
    
    if (hash !== previousDataHash[zoneId]) {
      previousDataHash[zoneId] = hash;
      changedZones.push(zoneId);
    }
  }
  
  return changedZones;
}

/**
 * Get zone definition (for coordinates)
 */
export function getZoneDefinition(zoneId, data = null) {
  if (zoneId.startsWith('leg') && data) {
    const legIndex = parseInt(zoneId.replace('leg', ''), 10);
    const totalLegs = (data.journey_legs || data.legs || []).length;
    return getDynamicLegZone(legIndex, totalLegs);
  }
  return ZONES[zoneId] || null;
}

/**
 * Clear all caches
 */
export function clearCache() {
  previousDataHash = {};
  cachedBMPs = {};
}

/**
 * Internal helper - renders full dashboard to canvas
 * Used by both renderFullScreen (PNG) and renderFullScreenBMP (BMP)
 */
function _renderFullScreenCanvas(data, prefs = {}) {
  // Ensure fonts are loaded
  loadFonts();

  const canvas = createCanvas(800, 480);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // White background
  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, 800, 480);
  
  // Render each zone
  const activeZones = getActiveZones(data);
  
  for (const zoneId of activeZones) {
    const zoneDef = getZoneDefinition(zoneId, data);
    if (!zoneDef) continue;
    
    const bmp = renderSingleZone(zoneId, data, prefs);
    if (!bmp) continue;
    
    // For the full screen render, we'd need to composite BMPs
    // For now, just re-render directly to the main canvas
    // This is a simplified version - actual compositing would parse BMP
  }
  
  // Re-render zones directly to main canvas for preview
  // =========================================================================
  // HEADER (V10 Spec Section 2) - v1.31: Clock at bottom, coffee indicator
  // =========================================================================
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  
  // Location - small, top left (truncated to prevent overflow)
  ctx.font = 'bold 10px Inter, sans-serif';
  const locationTextRaw = (data.location || 'HOME').toUpperCase();
  const maxLocationW = 150;
  let locationText = locationTextRaw;
  while (ctx.measureText(locationText).width > maxLocationW && locationText.length > 3) {
    locationText = locationText.slice(0, -1);
  }
  if (locationText !== locationTextRaw) locationText += '\u2026';
  ctx.fillText(locationText, 12, 4);

  // V13.6: Battery indicator next to location (if provided by device)
  const batteryPercent = data.battery_percent;
  if (batteryPercent !== null && batteryPercent !== undefined) {
    const locationWidth = ctx.measureText(locationText).width;
    const batteryX = 12 + locationWidth + 8;
    const batteryY = 3;

    // Draw battery icon
    drawBatteryIcon(ctx, batteryX, batteryY, batteryPercent, 10);

    // Draw percentage text
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillText(`${batteryPercent}%`, batteryX + 22, 4);
  }
  
  // Convert to 12-hour format (DEVELOPMENT-RULES.md: 12-hour time MANDATORY)
  let displayTime = data.current_time || '--:--';
  let isPM = false;
  
  // Parse and convert 24h to 12h
  const timeMatch = displayTime.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const mins = timeMatch[2];
    isPM = hours >= 12;
    const hours12 = hours % 12 || 12;
    displayTime = `${hours12}:${mins}`;
  } else if (displayTime.toLowerCase().includes('pm')) {
    isPM = true;
    displayTime = displayTime.replace(/\s*(am|pm)/gi, '');
  } else if (displayTime.toLowerCase().includes('am')) {
    isPM = false;
    displayTime = displayTime.replace(/\s*(am|pm)/gi, '');
  }
  
  // v1.35: Clock LOWER - bottom touching status bar
  const clockFontSize = 82;
  ctx.font = `bold ${clockFontSize}px Inter, sans-serif`;
  const clockY = 94 - clockFontSize + 12;  // Bottom of clock touching status bar
  ctx.fillText(displayTime, 8, clockY);
  
  // Measure clock width for AM/PM positioning
  const clockWidth = ctx.measureText(displayTime).width;
  
  // v1.37: AM/PM indicator - aligned with BOTTOM of coffee/weather boxes (y=90)
  ctx.font = 'bold 22px Inter, sans-serif';
  const amPmX = 12 + clockWidth + 8;
  ctx.fillText(data.am_pm || (isPM ? 'PM' : 'AM'), amPmX, 90 - 22);  // Bottom aligned at y=90
  
  // v1.36: Day and date - to the right of AM/PM
  const dayDateX = amPmX + 50;
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText(data.day || '', dayDateX, 6);
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText(data.date || '', dayDateX, 28);
  
  // v1.33: Service status box with live/scheduled data indicator
  const serviceStatus = data.service_status || (data.disruption ? 'DISRUPTIONS' : 'OK');
  const hasDisruption = data.disruption || data.status_type === 'disruption' ||
    serviceStatus.toUpperCase().includes('DISRUPTION') || serviceStatus.toUpperCase().includes('DELAY');
  // Per Section 23.6: Only show LIVE DATA badge when data actually comes from GTFS-RT,
  // never for fallback/timetable data. Default to false (timetable) unless explicitly marked live.
  const isLiveData = data.isLive === true || data.dataSource === 'live';

  // V15.0 SPEC FIX: Service status and data source indicators per CCDashDesignV15.0 Section 2.6-2.7
  // Size: 115×16px each, positioned below day/date
  const statusBoxX = dayDateX;
  const statusBoxY = 46;      // Per spec Section 2.6: top: 46px
  const statusBoxW = 115;
  const statusBoxH = 16;      // Per spec Section 2.6: 115×16px

  // Data source indicator (below status box) per spec Section 2.7: top: 64px
  const dataBoxY = 64;
  const dataBoxH = 16;        // Per spec Section 2.7: 115×16px

  ctx.font = 'bold 8px Inter, sans-serif';
  ctx.textBaseline = 'middle';

  // Service status box — per spec Section 2.6
  if (hasDisruption) {
    ctx.fillStyle = '#000';
    ctx.fillRect(statusBoxX, statusBoxY, statusBoxW, statusBoxH);
    ctx.fillStyle = '#FFF';
    ctx.fillText('\u26A0 DISRUPTIONS', statusBoxX + 6, statusBoxY + statusBoxH / 2);
  } else {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(statusBoxX, statusBoxY, statusBoxW, statusBoxH);
    ctx.fillStyle = '#000';
    ctx.fillText('\u2713 SERVICES OK', statusBoxX + 6, statusBoxY + statusBoxH / 2);
  }

  // Data source indicator — per spec Section 2.7
  ctx.font = 'bold 8px Inter, sans-serif';
  if (isLiveData) {
    ctx.fillStyle = '#000';
    ctx.fillRect(statusBoxX, dataBoxY, statusBoxW, dataBoxH);
    ctx.fillStyle = '#FFF';
    ctx.fillText('\u25CF LIVE DATA', statusBoxX + 6, dataBoxY + dataBoxH / 2);
  } else {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(statusBoxX, dataBoxY, statusBoxW, dataBoxH);
    ctx.fillStyle = '#000';
    ctx.fillText('\u25CB TIMETABLE FALLBACK', statusBoxX + 6, dataBoxY + dataBoxH / 2);
  }
  
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  
  // v1.32: Weather box position (declared early for coffee box sizing)
  const weatherBoxX = 620;
  const weatherBoxY = 4;
  const weatherBoxW = 172;
  const weatherBoxH = 86;
  
  // v1.32: Check if route includes coffee
  const journeyLegs = data.journey_legs || data.legs || [];

  // V13.3: Calculate ±2 hour window from arrive-by time
  // If current time is outside this window, don't show coffee decision - just busyness
  const targetArriveBy = data.arrive_by || '09:00';
  const [targetHour, targetMin] = targetArriveBy.split(':').map(Number);
  const targetMinutes = (targetHour || 9) * 60 + (targetMin || 0);

  // Get current time in minutes
  let currentMins = 0;
  if (data.current_time) {
    const timeMatch = data.current_time.match(/(\d+):(\d+)/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      if (data.current_time.toLowerCase().includes('pm') && h < 12) h += 12;
      if (data.current_time.toLowerCase().includes('am') && h === 12) h = 0;
      currentMins = h * 60 + m;
    }
  } else {
    const now = new Date();
    currentMins = now.getHours() * 60 + now.getMinutes();
  }

  // Check if within ±2 hours of arrive-by time
  const minutesFromTarget = Math.abs(currentMins - targetMinutes);
  const isWithinArrivalWindow = minutesFromTarget <= 120; // ±2 hours = 120 minutes

  // Get coffee leg and cafe busyness info
  const coffeeLeg = journeyLegs.find(l => l.type === 'coffee');
  const cafeBusyness = coffeeLeg?.busyness || coffeeLeg?.busy_level || data.cafe_busyness || 'quiet';
  const cafeWaitTime = coffeeLeg?.waitTime || coffeeLeg?.wait_time || data.cafe_wait_time || '--';

  const coffeeLegCanGet = journeyLegs.find(l => l.type === 'coffee' && l.canGet !== false);
  const coffeeLegSkipped = journeyLegs.find(l => l.type === 'coffee' && l.canGet === false);
  const coffeeLegClosed = journeyLegs.find(l => l.type === "coffee" && (l.cafeClosed === true || l.skipReason === "closed"));

  // V13.6: Check coffee_decision from dashboardData (used when cafe leg is removed entirely)
  // When cafe is closed, the leg is filtered out but we still want to show CAFE CLOSED in header
  const coffeeDecisionFromData = data.coffee_decision || '';
  const isCafeClosedFromData = coffeeDecisionFromData === 'CAFE CLOSED' ||
                               coffeeDecisionFromData.includes('CLOSED');

  // V13.3: Only show coffee decision when within ±2hr window
  const hasCoffee = isWithinArrivalWindow && !!coffeeLegCanGet;
  const cafeClosed = !!coffeeLegClosed || isCafeClosedFromData;  // V13.6: Also check data flag
  const coffeeSkipped = isWithinArrivalWindow && !!coffeeLegSkipped && !isCafeClosedFromData;
  const showCafeBusynessOnly = !isWithinArrivalWindow && coffeeLeg;
  
  // v1.40: Calculate arrival time early for coffee header display
  const earlyTotalMinutes = data.total_minutes || data.totalMinutes || data.journeyDuration || 20;
  let earlyNowMins = 0;
  if (data.current_time) {
    const earlyTimeMatch = data.current_time.match(/(\d+):(\d+)/);
    if (earlyTimeMatch) {
      let earlyHours = parseInt(earlyTimeMatch[1]);
      const earlyMins = parseInt(earlyTimeMatch[2]);
      // Handle 12h format with embedded am/pm
      if (data.current_time.toLowerCase().includes('pm') && earlyHours < 12) earlyHours += 12;
      if (data.current_time.toLowerCase().includes('am') && earlyHours === 12) earlyHours = 0;
      // Use data.am_pm when current_time has no am/pm suffix (e.g. "5:45")
      if (!data.current_time.toLowerCase().includes('am') && !data.current_time.toLowerCase().includes('pm')) {
        if (data.am_pm === 'PM' && earlyHours < 12) earlyHours += 12;
        if (data.am_pm === 'AM' && earlyHours === 12) earlyHours = 0;
      }
      earlyNowMins = earlyHours * 60 + earlyMins;
    }
  } else {
    // Timezone-aware fallback (not UTC — Vercel runs in UTC)
    const state = data.state || 'VIC';
    const tzMap = { VIC:'Australia/Melbourne', NSW:'Australia/Sydney', QLD:'Australia/Brisbane',
      SA:'Australia/Adelaide', WA:'Australia/Perth', TAS:'Australia/Hobart', NT:'Australia/Darwin', ACT:'Australia/Sydney' };
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tzMap[state] || 'Australia/Melbourne' }));
    earlyNowMins = localNow.getHours() * 60 + localNow.getMinutes();
  }
  const earlyArrivalMins = earlyNowMins + earlyTotalMinutes;
  const earlyArrivalH = Math.floor(earlyArrivalMins / 60) % 24;
  const earlyArrivalM = earlyArrivalMins % 60;
  const earlyArrivalH12 = earlyArrivalH % 12 || 12;
  const earlyArrivalAmPm = earlyArrivalH >= 12 ? 'pm' : 'am';
  const coffeeArrivalTime = `${earlyArrivalH12}:${earlyArrivalM.toString().padStart(2, '0')}${earlyArrivalAmPm}`;
  
  // v1.32: COFFEE INDICATOR - larger box, spread to right edge before weather
  const coffeeBoxX = statusBoxX + statusBoxW + 10;
  const coffeeBoxY = 4;
  const coffeeBoxW = weatherBoxX - coffeeBoxX - 8;  // Spread to weather box
  const coffeeBoxH = 86;
  
  if (hasCoffee) {
    // Black filled box for coffee
    ctx.fillStyle = '#000';
    ctx.fillRect(coffeeBoxX, coffeeBoxY, coffeeBoxW, coffeeBoxH);
    
    // Draw coffee cup icon (no emoji - pure shapes)
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    // Cup body
    ctx.fillRect(coffeeBoxX + 16, coffeeBoxY + 28, 28, 36);
    // Handle
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 44, coffeeBoxY + 44, 10, -Math.PI/2, Math.PI/2);
    ctx.stroke();
    // Steam lines
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(coffeeBoxX + 20 + i * 8, coffeeBoxY + 24);
      ctx.quadraticCurveTo(coffeeBoxX + 24 + i * 8, coffeeBoxY + 16, coffeeBoxX + 20 + i * 8, coffeeBoxY + 10);
      ctx.stroke();
    }
    
    // "GET A COFFEE" text - larger
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('GET A COFFEE', coffeeBoxX + 62, coffeeBoxY + 20);
    
    // "+ ARRIVE BY" + time
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText('+ ARRIVE BY', coffeeBoxX + 62, coffeeBoxY + 42);
    
    // Large arrival time - v1.40: use calculated arrival, not configured arrive_by
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.fillText(coffeeArrivalTime, coffeeBoxX + 62, coffeeBoxY + 58);
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
  } else if (!isWithinArrivalWindow && data.sleep_active && data.sleep_display) {
    // V15.0: Sleep mode - evening bedtime/alarm display (only outside commute window)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(coffeeBoxX, coffeeBoxY, coffeeBoxW, coffeeBoxH);

    // Moon icon (crescent) - drawn with arcs
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 30, coffeeBoxY + 43, 20, 0, Math.PI * 2);
    ctx.fill();
    // Cut out inner circle to make crescent
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 38, coffeeBoxY + 37, 18, 0, Math.PI * 2);
    ctx.fill();

    // Primary line (BED BY 10:30PM or ALARM 6:15AM)
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(data.sleep_display, coffeeBoxX + 62, coffeeBoxY + 28);

    // Secondary line (ALARM time or sleep adequacy)
    ctx.font = '14px Inter, sans-serif';
    const sleepSecondary = data.sleep_secondary || '';
    ctx.fillText(sleepSecondary, coffeeBoxX + 62, coffeeBoxY + 50);

    // Sleep adequacy indicator
    if (data.sleep_adequacy === 'INSUFFICIENT') {
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillRect(coffeeBoxX + 62, coffeeBoxY + 62, 80, 16);
      ctx.fillStyle = '#FFF';
      ctx.textAlign = 'center';
      ctx.fillText('LOW SLEEP', coffeeBoxX + 62 + 40, coffeeBoxY + 70);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
  } else if (cafeClosed || coffeeSkipped) {
    // V15.0 SPEC FIX: Per CCDashDesignV15.0 Section 2.8.2 — canGet: false
    // White box with 2px black border, sad face icon, "NO TIME FOR COFFEE"
    // v1.32: "No time for coffee" box with sad face
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(coffeeBoxX, coffeeBoxY, coffeeBoxW, coffeeBoxH);
    
    // Sad face (simple drawn)
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    // Face circle
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 30, coffeeBoxY + 43, 22, 0, Math.PI * 2);
    ctx.stroke();
    // Eyes
    ctx.fillRect(coffeeBoxX + 22, coffeeBoxY + 36, 4, 6);
    ctx.fillRect(coffeeBoxX + 34, coffeeBoxY + 36, 4, 6);
    // Sad mouth (frown)
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 30, coffeeBoxY + 58, 10, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
    
    // "NO TIME FOR COFFEE" text
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NO TIME', coffeeBoxX + 62, coffeeBoxY + 28);
    ctx.fillText('FOR COFFEE', coffeeBoxX + 62, coffeeBoxY + 48);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
  } else if (showCafeBusynessOnly) {
    // V13.3: Outside ±2hr window - just show cafe busyness info, no decision
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(coffeeBoxX, coffeeBoxY, coffeeBoxW, coffeeBoxH);

    // Coffee cup icon (outline only)
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    // Cup body outline
    ctx.strokeRect(coffeeBoxX + 16, coffeeBoxY + 28, 28, 36);
    // Handle
    ctx.beginPath();
    ctx.arc(coffeeBoxX + 44, coffeeBoxY + 44, 10, -Math.PI/2, Math.PI/2);
    ctx.stroke();

    // "CAFE STATUS" header
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CAFE STATUS', coffeeBoxX + 62, coffeeBoxY + 24);

    // Busyness level
    ctx.font = 'bold 18px Inter, sans-serif';
    const busyLabel = cafeBusyness === 'quiet' ? 'QUIET' :
                      cafeBusyness === 'moderate' ? 'MODERATE' :
                      cafeBusyness === 'busy' ? 'BUSY' : cafeBusyness.toUpperCase();
    ctx.fillText(busyLabel, coffeeBoxX + 62, coffeeBoxY + 46);

    // Wait time
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`~${cafeWaitTime} min wait`, coffeeBoxX + 62, coffeeBoxY + 64);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
  }

  // v1.32: Weather box - draw (position already declared above)
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(weatherBoxX, weatherBoxY, weatherBoxW, weatherBoxH);
  
  // Temperature - centered in upper portion of box
  // V15.0 SPEC FIX: Per CCDashDesignV15.0 Section 2.9.1 — 36px bold
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${data.temp || '--'}°`, weatherBoxX + weatherBoxW / 2, weatherBoxY + 26);

  // Condition - below temp
  // V15.0 SPEC FIX: Per CCDashDesignV15.0 Section 2.9.2 — 11px
  ctx.font = '11px Inter, sans-serif';
  let condition = data.condition || '';
  while (ctx.measureText(condition).width > weatherBoxW - 12 && condition.length > 3) {
    condition = condition.slice(0, -1);
  }
  ctx.fillText(condition, weatherBoxX + weatherBoxW / 2, weatherBoxY + 54);

  // V15.0: Feels-like temperature from mindset engine (wind chill)
  if (data.mindset_feels_like) {
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(data.mindset_feels_like, weatherBoxX + weatherBoxW / 2, weatherBoxY + 68);
  }

  // V14.0: Lifestyle context suggestions (replaces simple umbrella indicator)
  const needsUmbrella = data.rain_expected || data.precipitation > 30 ||
    (data.condition && /rain|shower|storm|drizzle/i.test(data.condition));
  const umbrellaY = weatherBoxY + weatherBoxH - 18;

  const lifestyleDisplay = data.lifestyle_display;
  const displayText = lifestyleDisplay || (needsUmbrella ? 'BRING UMBRELLA' : 'NO UMBRELLA');
  const isAlert = needsUmbrella || (lifestyleDisplay && /UMBRELLA|JACKET|HYDRAT/i.test(lifestyleDisplay));

  if (isAlert) {
    // V15.0: Black background with white text — action needed
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillRect(weatherBoxX + 4, umbrellaY, weatherBoxW - 8, 14);
    ctx.fillStyle = '#FFF';
    ctx.fillText(displayText, weatherBoxX + weatherBoxW / 2, umbrellaY + 7);
  } else {
    // V15.0: Subtle text only — no action needed (no box, no border)
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(displayText, weatherBoxX + weatherBoxW / 2, umbrellaY + 7);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  
  // Divider line
  ctx.fillRect(0, 94, 800, 2);
  
  // =========================================================================
  // STATUS BAR (V10 Spec Section 4) - Real-Time Arrival Amendment 2026-01-31
  // =========================================================================
  
  // Calculate real-time arrival: current time + total journey duration
  const totalMinutes = data.total_minutes || data.totalMinutes || data.journeyDuration || 20;
  const targetArrival = data.arrive_by || data.arrivalTime || '09:00';
  
  // Parse current time from display data or use now
  let nowMins = 0;
  if (data.current_time) {
    const timeMatch = data.current_time.match(/(\d+):(\d+)/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const mins = parseInt(timeMatch[2]);
      // Handle 12h format with embedded am/pm
      if (data.current_time.toLowerCase().includes('pm') && hours < 12) hours += 12;
      if (data.current_time.toLowerCase().includes('am') && hours === 12) hours = 0;
      // Use data.am_pm when current_time has no am/pm suffix (e.g. "5:45")
      if (!data.current_time.toLowerCase().includes('am') && !data.current_time.toLowerCase().includes('pm')) {
        if (data.am_pm === 'PM' && hours < 12) hours += 12;
        if (data.am_pm === 'AM' && hours === 12) hours = 0;
      }
      nowMins = hours * 60 + mins;
    }
  } else {
    // Timezone-aware fallback (not UTC — Vercel runs in UTC)
    const state = data.state || 'VIC';
    const tzMap = { VIC:'Australia/Melbourne', NSW:'Australia/Sydney', QLD:'Australia/Brisbane',
      SA:'Australia/Adelaide', WA:'Australia/Perth', TAS:'Australia/Hobart', NT:'Australia/Darwin', ACT:'Australia/Sydney' };
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tzMap[state] || 'Australia/Melbourne' }));
    nowMins = localNow.getHours() * 60 + localNow.getMinutes();
  }
  
  // Calculate arrival time (now + journey duration)
  const arrivalMins = nowMins + totalMinutes;
  const arrivalH = Math.floor(arrivalMins / 60) % 24;
  const arrivalM = arrivalMins % 60;
  const arrivalH12 = arrivalH % 12 || 12;
  const arrivalAmPm = arrivalH >= 12 ? 'pm' : 'am';
  const calculatedArrival = `${arrivalH12}:${arrivalM.toString().padStart(2, '0')}${arrivalAmPm}`;
  
  // Parse target arrival time
  const [targetH, targetM] = targetArrival.split(':').map(Number);
  const targetMins = (targetH || 9) * 60 + (targetM || 0);
  
  // V13.2: Only consider late/early relative to arrive-by time if one is set
  // Outside this context, simply display route as if leaving now
  const diffMins = arrivalMins - targetMins;
  const hasArriveByTarget = data.arrive_by && targetArrival !== '09:00';  // User explicitly set target
  const isLate = hasArriveByTarget && diffMins > 5;
  const isEarly = hasArriveByTarget && diffMins < -5;
  const isOnTime = hasArriveByTarget && !isLate && !isEarly;

  // V15.0 SPEC FIX: Status bar per CCDashDesignV15.0 Section 3 — 28px height, 13px bold
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 96, 800, 28);

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.textBaseline = 'middle';

  // -----------------------------------------------------------------------
  // V13.2: Simplified status display
  // - Only show LATE if user has arrive-by time set and would miss it
  // - Service alerts shown for transit disruptions
  // - Otherwise just "LEAVE NOW → Arrive X:XX"
  // -----------------------------------------------------------------------
  let statusText;

  // Check for service alerts (transit disruptions only)
  const legsForStatus = data.journey_legs || data.legs || [];
  const hasServiceAlert = legsForStatus.some(leg =>
    leg.serviceAlert || leg.hasAlert || leg.status === 'disruption' ||
    leg.status === 'suspended' || leg.status === 'cancelled'
  );
  const delayedLegCount = data._delayedLegCount || legsForStatus.filter(l => l.status === 'delayed' || l.delayMinutes > 0).length;
  const totalLegDelay = legsForStatus.reduce((sum, leg) => sum + (leg.delayMinutes || 0), 0);

  // V13.2: Track disruption type for badge display
  // Only show LATE badge if user has an arrive-by target
  // V13.6: Extract actual disruption text to display
  let disruptionType = null;  // 'service' | 'late' | null
  let disruptionText = '';  // V13.6: Actual disruption description

  // V13.6: Find the actual disruption/delay details from legs
  const disruptedLeg = legsForStatus.find(leg =>
    leg.serviceAlert || leg.hasAlert || leg.status === 'disruption' ||
    leg.status === 'suspended' || leg.status === 'cancelled' || leg.status === 'delayed'
  );

  if (data.status_type === 'disruption' || data.disruption || hasServiceAlert) {
    // Service alert (transit disruption) - always show
    disruptionType = 'service';
    // V13.6: Extract actual disruption reason
    disruptionText = disruptedLeg?.alertText || disruptedLeg?.reason ||
                     disruptedLeg?.serviceAlert || data.disruption_text ||
                     (disruptedLeg?.status === 'suspended' ? 'SERVICE SUSPENDED' :
                      disruptedLeg?.status === 'cancelled' ? 'SERVICE CANCELLED' : 'SERVICE ALERT');
    statusText = `[!] ${disruptionText} → Arrive ${calculatedArrival}`;
    if (totalLegDelay > 0) statusText += ` (+${totalLegDelay} min)`;
  } else if (delayedLegCount > 0 || data.status_type === 'delay') {
    // Service delays - V13.6: Show which service is delayed
    disruptionType = 'service';
    const delayedLeg = legsForStatus.find(l => l.status === 'delayed' || l.delayMinutes > 0);
    const delayedService = delayedLeg?.routeNumber ? `${delayedLeg.type?.toUpperCase()} ${delayedLeg.routeNumber}` :
                           delayedLeg?.lineName || delayedLeg?.type?.toUpperCase() || 'SERVICE';
    disruptionText = `${delayedService} +${delayedLeg?.delayMinutes || totalLegDelay} MIN`;
    statusText = `[!] ${delayedService} DELAYED → Arrive ${calculatedArrival}`;
    if (totalLegDelay > 0) statusText += ` (+${totalLegDelay} min)`;
  } else if (isLate) {
    // V13.2: Only show LATE if user has arrive-by time set
    disruptionType = 'late';
    const lateMinutes = Math.abs(diffMins);
    disruptionText = `LATE +${lateMinutes} min`;
    statusText = `LATE → Arrive ${calculatedArrival} (+${lateMinutes} min)`;
  } else {
    // Normal - just show route as if leaving now
    statusText = `LEAVE NOW → Arrive ${calculatedArrival}`;
  }

  ctx.fillText(statusText, 16, 112);

  // -----------------------------------------------------------------------
  // V13.2: Badge display - LARGER, only for service alerts or late (if target set)
  // V13.6: Show actual disruption text in badge
  // -----------------------------------------------------------------------
  if (disruptionType) {
    // V13.6: Dynamic width based on text length
    ctx.font = 'bold 12px Inter, sans-serif';
    const badgeText = disruptionText.substring(0, 20);  // Limit length
    const textWidth = ctx.measureText(badgeText).width;
    const delayBoxW = Math.max(110, textWidth + 16);
    const delayBoxH = 22;
    const delayBoxX = 784 - 80 - delayBoxW - 10;
    const delayBoxY = 101;

    ctx.fillStyle = '#FFF';
    ctx.fillRect(delayBoxX, delayBoxY, delayBoxW, delayBoxH);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';

    // V13.6: Show actual disruption/delay info instead of generic "DISRUPTION"
    ctx.fillText(badgeText, delayBoxX + delayBoxW / 2, 112);

    ctx.fillStyle = '#FFF';
  }

  // -----------------------------------------------------------------------
  // V15.0: Confidence score + mindset stress indicator
  // -----------------------------------------------------------------------
  const confidenceScore = data.confidence_score;
  if (confidenceScore !== undefined && confidenceScore !== null) {
    ctx.textAlign = 'right';
    const confLabel = confidenceScore >= 75 ? 'ON TIME' : confidenceScore >= 50 ? 'AT RISK' : 'UNLIKELY';
    const needsAttention = confidenceScore < 75;
    // V15.0: Bold only when action needed (AT RISK / UNLIKELY). Subtle for ON TIME.
    ctx.font = needsAttention ? 'bold 12px Inter, sans-serif' : '11px Inter, sans-serif';
    // V15.0: Only append mindset when stress is not LOW (action-needed only)
    const stressIsLow = !data.mindset_stress || data.mindset_stress === 'LOW';
    const mindsetText = (!stressIsLow && data.mindset_display) ? ` \u2022 ${data.mindset_display}` : '';
    ctx.fillText(`${confidenceScore}% ${confLabel}${mindsetText}`, 690, 112);
  }

  // -----------------------------------------------------------------------
  // Right: Total journey time - LARGER font
  // -----------------------------------------------------------------------
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px Inter, sans-serif';  // V13.2: Increased from 13px
  const statusRight = `${totalMinutes} min`;
  ctx.fillText(statusRight, 784, 112);
  ctx.textAlign = 'left';
  
  // Store calculated values for footer
  data._calculatedArrival = data._calculatedArrival || calculatedArrival;
  data._targetArrival = targetArrival;
  
  // =========================================================================
  // =========================================================================
  // JOURNEY LEGS (V10 Spec Section 5) - Per Reference Design Images
  // v1.29: Improved scaling, spacing, and time display
  // =========================================================================
  let legs = data.journey_legs || data.legs || [];

  // V13.3: Filter out coffee legs when outside ±2hr arrival window
  // Coffee decisions only relevant within commute window
  if (!isWithinArrivalWindow) {
    legs = legs.filter(l => l.type !== 'coffee');
  }

  // Section 7.5.1: Defensive merge — no consecutive walk legs ever
  legs = mergeConsecutiveWalkLegs(legs);

  // V13.2: MUCH LARGER font sizes for e-ink visibility
  const legCount = legs.length;
  const baseLegs = 5;
  const scale = Math.min(1, Math.max(0.8, baseLegs / Math.max(legCount, 3)));

  // V13.6: Significantly increased font sizes for e-ink readability
  const titleSize = 22;        // V13.6: Increased from 20px for glanceability
  const subtitleSize = 18;     // V13.6: Increased from 16px for "Next: x,y,z" visibility
  const subtitleSize2 = 14;    // V13.2: Increased from 12px
  // V13.3: Transit icons double height to match two text lines; walk icons normal
  const transitIconSize = Math.max(48, Math.round(56 * scale));  // V13.3: Double height for transit
  const walkIconSize = Math.max(24, Math.round(28 * scale));     // V13.3: Normal size for walk
  const iconSize = Math.max(28, Math.round(36 * scale));         // Default fallback
  const numberSize = 28;       // V13.2: Increased from 24px
  const departLabelSize = 14;  // V13.3: Increased from 12px for glanceability
  const departTimeSize = 26;   // V13.6: Increased from 22px for better e-ink visibility
  // V13.6: Larger duration numbers and label for e-ink visibility
  const durationSize = Math.max(32, Math.round(38 * scale));  // V13.6: Increased from 30
  const durationLabelSize = Math.max(12, Math.round(14 * scale));  // V13.6: Increased from 13
  
  // V13.1: Pre-calculate "minutes until departure" for each leg
  // This represents how long from NOW until the user needs to leave for/catch this leg
  // Walk legs: show duration (time to complete the walk)
  // Transit legs: show minutes until the service departs
  // Coffee legs: show minutes until user must leave cafe
  // V13.5: Skipped legs (cafe detour when running late) are excluded from timing
  // V13.6: Transit legs show: time to reach stop + live departure time from that point

  const nowMs = Date.now();
  let cumulativeMinutes = 0;
  const departureCountdowns = legs.map((leg, idx) => {
    // V13.5: Skipped legs return 0 and don't contribute to cumulative time
    if (leg.skippedForTiming) {
      return 0;  // Will show as dashed/skipped visually
    }

    // V13.6: For transit legs with live departure data (nextDepartureTimesMs),
    // calculate: time to reach stop + minutes until next departure after arrival
    if (['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type)) {
      // Time user will arrive at the stop
      const arrivalAtStopMs = nowMs + (cumulativeMinutes * 60000);

      // Find first live departure AFTER user arrives at stop
      if (leg.nextDepartureTimesMs && leg.nextDepartureTimesMs.length > 0) {
        const validDeparture = leg.nextDepartureTimesMs.find(depMs => depMs >= arrivalAtStopMs);
        if (validDeparture) {
          // Minutes from NOW until that departure
          const minsUntilDepart = Math.max(0, Math.round((validDeparture - nowMs) / 60000));
          cumulativeMinutes += (leg.minutes || leg.durationMinutes || 0);
          return minsUntilDepart;
        }
      }

      // Fallback: use cumulative time + leg duration
      cumulativeMinutes += (leg.minutes || leg.durationMinutes || 0);
      return cumulativeMinutes;
    }

    // If leg has explicit departTime, calculate minutes from now
    if (leg.departTime && typeof leg.departTime === 'string') {
      const [h, m] = leg.departTime.replace(/[ap]m/i, '').split(':').map(Number);
      const isPM = leg.departTime.toLowerCase().includes('pm') && h !== 12;
      const isAM = leg.departTime.toLowerCase().includes('am') && h === 12;
      const hour24 = isPM ? h + 12 : (isAM ? 0 : h);
      const now = new Date();
      const departMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour24, m).getTime();
      const minsUntilDepart = Math.max(0, Math.round((departMs - nowMs) / 60000));
      cumulativeMinutes += (leg.minutes || leg.durationMinutes || 0);
      return minsUntilDepart;
    }

    // Otherwise, use cumulative time (legacy behavior)
    cumulativeMinutes += (leg.minutes || leg.durationMinutes || 0);
    return cumulativeMinutes;
  });

  // v1.29: Identify transit leg types (use departure countdown) vs walk (use duration)
  const isTransitLeg = (type) => ['train', 'tram', 'bus', 'vline', 'ferry', 'coffee'].includes(type);
  
  // Count delayed legs for status bar (DELAY vs DELAYS)
  const delayedLegs = legs.filter(l => l.status === 'delayed' || l.delayMinutes > 0);
  const hasMultipleDelays = delayedLegs.length > 1;
  
  legs.forEach((leg, idx) => {
    const legNum = idx + 1;
    const zone = getDynamicLegZone(legNum, legs.length, legs);  // V13: Pass legs for variable heights
    const status = leg.status || leg.state || 'normal';
    const isDelayed = status === 'delayed' || leg.delayMinutes > 0;
    const isSuspended = status === 'suspended' || status === 'cancelled';
    const isDiverted = status === 'diverted';
    const isSkippedCoffee = leg.type === 'coffee' && leg.canGet === false;
    const isCoffeeCanGet = leg.type === 'coffee' && leg.canGet !== false;
    const isExtraTimeCoffee = leg.type === 'coffee' && leg.extraTime;
    // V13.5: Skipped legs (cafe detour when running late)
    const isSkippedLeg = leg.skippedForTiming || (status === 'skipped' || status === 'skip');
    // V13.5: Move isWalkLeg declaration before border logic that uses it
    const isWalkLeg = leg.type === 'walk';
    
    // -----------------------------------------------------------------------
    // BACKGROUND (varies by state per reference images 6, 8)
    // - Suspended: Diagonal stripes pattern (//////)
    // - Diverted: Vertical stripes pattern (|||||)
    // - Normal: Solid white
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#FFF';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    
    // Draw stripe patterns for suspended/diverted
    // v1.42: Stripes cover entire leg EXCEPT time box, text is "carved out" (knocked out)
    // Per Angus 2026-02-01: Pattern covers leg, text has white background knockout
    // v1.81: stripeTimeBoxW must match actual timeBoxW (88*scale) to prevent stripe bleed
    const stripeTimeBoxW = Math.max(72, Math.round(88 * scale));
    const stripeAreaW = zone.w - stripeTimeBoxW;  // Everything except time box
    
    if (isSuspended) {
      // Diagonal stripes on content area (not time box)
      ctx.save();
      ctx.beginPath();
      ctx.rect(zone.x, zone.y, stripeAreaW, zone.h);
      ctx.clip();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      for (let i = -zone.h; i < stripeAreaW + zone.h; i += 8) {
        ctx.beginPath();
        ctx.moveTo(zone.x + i, zone.y);
        ctx.lineTo(zone.x + i + zone.h, zone.y + zone.h);
        ctx.stroke();
      }
      ctx.restore();
    } else if (isDiverted) {
      // Vertical stripes on content area (not time box)
      ctx.save();
      ctx.beginPath();
      ctx.rect(zone.x, zone.y, stripeAreaW, zone.h);
      ctx.clip();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      for (let i = 0; i < stripeAreaW; i += 6) {
        ctx.beginPath();
        ctx.moveTo(zone.x + i, zone.y);
        ctx.lineTo(zone.x + i, zone.y + zone.h);
        ctx.stroke();
      }
      ctx.restore();
    }
    
    // v1.81: Unified knockout system - white zones protecting text from stripe patterns
    // Per Angus 2026-02-01: All knockouts scale equally
    // v1.81 FIX: Knockout must use actual rendered subtitle (leg.subtitle), not fallback text
    // v1.81 FIX: timeBoxW must match actual time box (88*scale not 72*scale)
    // v1.81 FIX: Increased padding from 2px to 4px for reliable stripe clearance
    if (isSuspended || isDiverted) {
      const pad = Math.max(4, Math.round(4 * scale));  // v1.81: 4px min padding (was 2px)

      // Use EXACT same sizes as actual element rendering
      const numSize = Math.max(16, Math.round(24 * scale));
      const iconSize = Math.max(20, Math.round(32 * scale));
      const titleSize = Math.max(12, Math.round(16 * scale));
      const subtitleSize = Math.max(10, Math.round(12 * scale));
      const departLabelSize = Math.max(7, Math.round(9 * scale));
      const departTimeSize = Math.max(10, Math.round(14 * scale));
      // v1.81: Must match actual timeBoxW at line 2911
      const timeBoxW = Math.max(72, Math.round(88 * scale));
      const departColW = ['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type) && leg.departTime ? 55 : 0;

      ctx.fillStyle = '#FFF';

      // 1. Leg number knockout - exact position match
      const numX = zone.x + 6;
      const numY = zone.y + (zone.h - numSize) / 2;
      ctx.fillRect(numX - pad, numY - pad, numSize + pad * 2, numSize + pad * 2);

      // 2. Icon knockout - exact position match
      const iconX = numX + numSize + 6;
      const iconY = zone.y + (zone.h - iconSize) / 2;
      ctx.fillRect(iconX - pad, iconY - pad, iconSize + pad * 2, iconSize + pad * 2);

      // 3. Title/subtitle knockout - measured text width
      // v1.81 FIX: Use leg.subtitle (actual rendered text) when available,
      // not the hardcoded fallback which may be much shorter than the real subtitle
      const textX = iconX + iconSize + 8;
      const textBlockH = titleSize + subtitleSize + 4;  // v1.81: match actual 4px gap
      const textBlockY = zone.y + (zone.h - textBlockH) / 2;

      const legTitle = leg.title || getLegTitle(leg);
      ctx.font = `bold ${titleSize}px Inter, sans-serif`;
      const titleW = ctx.measureText(legTitle).width;

      // v1.81: Use the ACTUAL subtitle that will be rendered, not a shorter fallback
      let subtitleText;
      if (leg.subtitle) {
        subtitleText = leg.subtitle;
      } else if (isSuspended) {
        subtitleText = `SUSPENDED — ${leg.reason || leg.cancelReason || 'Service disruption'}`;
      } else {
        subtitleText = leg.divertedStop || 'Diverted route';
      }
      ctx.font = `${subtitleSize}px Inter, sans-serif`;
      const subtitleW = ctx.measureText(subtitleText).width;

      // v1.81: Knockout must cover full width of whichever text line is wider
      // Also cap at stripeAreaW to not overflow into time box area
      const textW = Math.min(Math.max(titleW, subtitleW), stripeAreaW - textX + zone.x);
      ctx.fillRect(textX - pad, textBlockY - pad, textW + pad * 2, textBlockH + pad * 2);

      // 4. DEPART knockout - exact position match with actual render
      if (departColW > 0) {
        const deptColCenter = zone.x + zone.w - timeBoxW - departColW - 8;
        const deptBlockY = zone.y + (zone.h - departLabelSize - departTimeSize - 1) / 2;

        ctx.font = `bold ${departLabelSize}px Inter, sans-serif`;
        const labelW = ctx.measureText('DEPART').width;
        ctx.font = `bold ${departTimeSize}px Inter, sans-serif`;
        const timeW = ctx.measureText(leg.departTime || '').width;
        const deptW = Math.max(labelW, timeW);
        const deptH = departLabelSize + departTimeSize + 1;

        // Center knockout on text center point
        ctx.fillRect(deptColCenter - deptW / 2 - pad, deptBlockY - pad, deptW + pad * 2, deptH + pad * 2);
      }
    }
    
    // -----------------------------------------------------------------------
    // BORDER - v1.32: Thinner borders for easier glancing
    // V13.3: Walk legs have thinner borders than transit
    // - Walk: 0.5px dotted (subtle)
    // - Normal transit: 1px solid
    // - Coffee can-get: 2px solid
    // - Coffee skip: 1px dashed
    // - Delayed: 2px dashed
    // - Suspended/Diverted: 2px solid
    // -----------------------------------------------------------------------
    ctx.strokeStyle = '#000';

    if (isCoffeeCanGet) {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (isSkippedCoffee || isSkippedLeg) {
      // V13.5: All skipped legs (coffee or walk detour) get dashed borders
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
    } else if (isDelayed) {
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
    } else if (isSuspended || isDiverted) {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (isWalkLeg) {
      // V13.3: Walk legs have thinner, subtler borders
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);  // Subtle dotted line
    } else {
      ctx.lineWidth = 1;  // v1.32: Thinner normal borders
      ctx.setLineDash([]);
    }

    ctx.strokeRect(zone.x + 1, zone.y + 1, zone.w - 2, zone.h - 2);
    ctx.setLineDash([]);
    
    // -----------------------------------------------------------------------
    // LEG NUMBER CIRCLE (V10 Spec Section 5.2)
    // - Normal: Filled black circle with white number
    // - Skipped: Dashed circle outline with black number
    // - Suspended: Dashed circle with X (per ref image 6)
    // v1.27: scaled leg numbers
    // -----------------------------------------------------------------------
    if (isSuspended) {
      drawLegNumber(ctx, 'X', zone.x + 6, zone.y + (zone.h - numberSize) / 2, 'cancelled', numberSize);
    } else if (isSkippedLeg) {
      // V13.5: Skipped legs get dashed circle outline (same as skipped coffee)
      drawLegNumber(ctx, legNum, zone.x + 6, zone.y + (zone.h - numberSize) / 2, 'skipped', numberSize);
    } else {
      drawLegNumber(ctx, legNum, zone.x + 6, zone.y + (zone.h - numberSize) / 2, status, numberSize);
    }
    
    // -----------------------------------------------------------------------
    // MODE ICON (V10 Spec Section 5.3) - v1.27: scaled
    // V13.3: Transit icons double height to match two text lines
    // - Normal: Filled solid icons
    // - Delayed/Skipped/Suspended/Diverted: Outline icons
    // -----------------------------------------------------------------------
    // V13.5: Use outline icons for all skipped/delayed/diverted/suspended legs
    const useOutlineIcon = isDelayed || isSkippedCoffee || isSkippedLeg || isSuspended || isDiverted;
    const currentIconSize = isWalkLeg ? walkIconSize : transitIconSize;
    const iconX = zone.x + 8 + numberSize + 6;
    drawModeIcon(ctx, leg.type, iconX, zone.y + (zone.h - currentIconSize) / 2, currentIconSize, useOutlineIcon);

    // -----------------------------------------------------------------------
    // TITLE (V10 Spec Section 5.4) - v1.30: title/subtitle closer together
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    const textX = iconX + currentIconSize + 8;

    // V13: Walk legs are compact (single line), Transit/Coffee are multi-line
    if (isWalkLeg) {
      // V13.3: Walk leg - single line with duration in text (no duration box)
      // V13.5: Skipped walk legs show skip indicator
      ctx.font = `bold 16px Inter, sans-serif`;  // V13.3: Slightly larger for readability
      const titleY = zone.y + (zone.h - 16) / 2;
      if (idx === 0) leg.isFirst = true;
      const walkDuration = leg.minutes || leg.durationMinutes || 0;
      // V13.3: Format as "Walk to [destination] (X min)" - no separate duration box
      let legTitle = leg.title || getLegTitle(leg);

      // V13.5: If this walk leg is skipped (cafe detour), show skip indicator
      if (isSkippedLeg) {
        legTitle = `[X] ${legTitle} -- SKIPPED`;
      } else if (walkDuration > 0 && !legTitle.includes('min')) {
        legTitle = `${legTitle} (${walkDuration} min)`;
      }
      ctx.fillText(legTitle, textX, titleY);
    } else {
      // V13: Transit/Coffee - multi-line layout
      ctx.font = `bold ${titleSize}px Inter, sans-serif`;

      // v1.30: Title and subtitle CLOSE together, vertically centered as a unit
      const textBlockHeight = titleSize + subtitleSize + 4;  // V13: Slightly more spacing
      const textBlockY = zone.y + (zone.h - textBlockHeight) / 2;
      const titleY = textBlockY;
      const subtitleY = textBlockY + titleSize + 4;  // V13: 4px gap
      const verticalPadding = Math.max(4, Math.round(zone.h * 0.08));

      if (idx === 0) leg.isFirst = true;
      const legTitle = leg.title || getLegTitle(leg);
      ctx.fillText(legTitle, textX, titleY);

      // -----------------------------------------------------------------------
      // SUBTITLE (V10 Spec Section 5.5) - v1.27: scaled
      // V13: Only for transit/coffee legs (walk legs are single-line)
      // -----------------------------------------------------------------------
      ctx.font = `${subtitleSize}px Inter, sans-serif`;
      let legSubtitle = leg.subtitle;

      // V15.0: screen.js provides subtitle with "Next: X, Y min LIVE" (catchable only)

    if (!legSubtitle) {
      if (isExtraTimeCoffee) {
        legSubtitle = '[OK] EXTRA TIME -- Disruption';
      } else if (isCoffeeCanGet) {
        const dayOfWeek = new Date().getDay();
        legSubtitle = dayOfWeek === 5 ? '[OK] FRIDAY TREAT' : '[OK] TIME FOR COFFEE';
      } else if (isSkippedCoffee) {
        legSubtitle = '[X] SKIP -- Running late';
      } else if (isSuspended) {
        legSubtitle = `SUSPENDED — ${leg.reason || 'Service disruption'}`;
      } else if (isDiverted) {
        // v1.40: Live countdown from absolute times
        let nextTimes = leg.nextDepartures || [];
        if (leg.nextDepartureTimesMs && leg.nextDepartureTimesMs.length > 0) {
          const nowMs = Date.now();
          nextTimes = leg.nextDepartureTimesMs
            .map(depMs => Math.max(0, Math.round((depMs - nowMs) / 60000)))
            .filter(mins => mins >= 0 && mins <= 60);
        }
        const divertedStop = leg.divertedStop || '';
        legSubtitle = nextTimes.length > 0 
          ? `Next: ${nextTimes.join(', ')} min • ${divertedStop}`
          : divertedStop || 'Diverted route';
      } else if (isDelayed && leg.delayMinutes && leg.type !== 'walk') {
        // v1.40: Live countdown from absolute times
        let nextTimes = leg.nextDepartures || [leg.nextDeparture, leg.nextDeparture2].filter(Boolean);
        if (leg.nextDepartureTimesMs && leg.nextDepartureTimesMs.length > 0) {
          const nowMs = Date.now();
          nextTimes = leg.nextDepartureTimesMs
            .map(depMs => Math.max(0, Math.round((depMs - nowMs) / 60000)))
            .filter(mins => mins >= 0 && mins <= 60);
        }
        const nextStr = nextTimes.length > 0 ? ` • Next: ${nextTimes.join(', ')} min` : '';
        legSubtitle = `+${leg.delayMinutes} MIN${nextStr}`;
      } else if (['train', 'tram', 'bus', 'vline', 'ferry'].includes(leg.type)) {
        // V13.6: Transit legs - calculate time-adjusted "Next" departures
        // Account for time user needs to reach the stop before showing departure times
        const lineName = leg.lineName || leg.routeName || '';
        let parts = [];
        if (lineName) parts.push(lineName);

        // V1.40: Add routing indicator
        if (leg.viaMetroTunnel || leg.via?.toLowerCase().includes('metro tunnel')) {
          parts.push('via Metro Tunnel');
        } else if (leg.viaCityLoop || leg.via?.toLowerCase().includes('city loop')) {
          parts.push('via City Loop');
        } else if (leg.via) {
          parts.push(`via ${leg.via}`);
        }

        // V13.6: Calculate ADJUSTED "Next" times - departures user can actually catch
        // Filter to departures AFTER user arrives at the stop, then show mins from now
        // V15.0: Use explicit isLive flag — only true when GTFS-RT data matched
        const hasLiveData = leg.isLive === true;
        const liveIndicator = hasLiveData ? ' LIVE' : '';
        const tilde = hasLiveData ? '' : '~';
        if (leg.nextDepartureTimesMs && leg.nextDepartureTimesMs.length > 0) {
          // Calculate cumulative time to reach this leg's stop
          let cumulativeMins = 0;
          for (let i = 0; i < idx; i++) {
            if (!legs[i].skippedForTiming) {
              cumulativeMins += (legs[i].minutes || legs[i].durationMinutes || 0);
            }
          }
          const arrivalAtStopMs = nowMs + (cumulativeMins * 60000);

          // Find departures user can catch (depart AFTER arrival + 1 min buffer)
          const catchableDepartures = leg.nextDepartureTimesMs
            .filter(depMs => depMs >= arrivalAtStopMs + 60000)  // 1 min buffer
            .slice(0, 3)  // Max 3 departures
            .map(depMs => Math.max(0, Math.round((depMs - nowMs) / 60000)));

          if (catchableDepartures.length >= 2) {
            parts.push(`Next: ${catchableDepartures[0]}, ${catchableDepartures[1]} min${liveIndicator}`);
          } else if (catchableDepartures.length === 1) {
            parts.push(`Next: ${catchableDepartures[0]} min${liveIndicator}`);
          }
        } else if (leg.nextDepartures && leg.nextDepartures.length > 0) {
          // Fallback to raw nextDepartures if no absolute times (timetable data)
          parts.push(`${tilde}Next: ${leg.nextDepartures.slice(0, 2).join(', ')} min${liveIndicator}`);
        }

        legSubtitle = parts.join(' • ') || getLegSubtitle(leg);
      } else {
        legSubtitle = getLegSubtitle(leg);
      }
    }
    // v1.27: Calculate max width with scaled elements
    // V13.1: DEPART column now shows for transit AND coffee legs
    const hasDepart = (['train', 'tram', 'bus', 'vline', 'ferry', 'coffee'].includes(leg.type) && leg.departTime) ||
                      (leg.type === 'coffee' && leg.canGet !== false);
    const timeBoxW = Math.max(56, Math.round(72 * scale));
    const departColW = hasDepart ? Math.max(40, Math.round(50 * scale)) : 0;
    const subtitleMaxWidth = zone.w - textX - timeBoxW - departColW - 10;

    while (ctx.measureText(legSubtitle).width > subtitleMaxWidth && legSubtitle.length > 10) {
      legSubtitle = legSubtitle.slice(0, -4) + '...';
    }

    // V13.6: Render "Next: x,y,z min" portion in BOLD for glanceability
    // Split subtitle at " • Next:" or if it starts with "Next:"
    const nextIdx = legSubtitle.indexOf(' • Next:');
    const startsWithNext = legSubtitle.startsWith('Next:');

    if (nextIdx > -1) {
      // Render part before "Next:" in normal font
      const beforeNext = legSubtitle.substring(0, nextIdx + 3); // Include " • "
      const nextPart = legSubtitle.substring(nextIdx + 3);       // "Next: x,y,z min"

      ctx.font = `${subtitleSize}px Inter, sans-serif`;
      ctx.fillText(beforeNext, textX, subtitleY);
      const beforeWidth = ctx.measureText(beforeNext).width;

      // Render "Next:" portion in bold
      ctx.font = `bold ${subtitleSize}px Inter, sans-serif`;
      ctx.fillText(nextPart, textX + beforeWidth, subtitleY);
    } else if (startsWithNext) {
      // Entire subtitle is "Next: x,y,z min" - render all bold
      ctx.font = `bold ${subtitleSize}px Inter, sans-serif`;
      ctx.fillText(legSubtitle, textX, subtitleY);
    } else {
      // No "Next:" - render normally
      ctx.fillText(legSubtitle, textX, subtitleY);
    }

    // -----------------------------------------------------------------------
    // DEPART TIME COLUMN - V13.1: Now shows for transit AND coffee legs
    // Shows the scheduled departure time for this leg in sequence
    // -----------------------------------------------------------------------
    if (hasDepart) {
      // V13.6: DEPART column much further left for clear separation from countdown box
      const departColCenter = zone.x + zone.w - timeBoxW - departColW - 30;
      const departBlockY = zone.y + (zone.h - departLabelSize - departTimeSize - 1) / 2;

      // "DEPART" label - for coffee, show "LEAVE" instead
      ctx.font = `bold ${departLabelSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      const departLabel = leg.type === 'coffee' ? 'LEAVE' : 'DEPART';
      ctx.fillText(departLabel, departColCenter, departBlockY);

      // Time directly below with minimal gap
      // V13.1: Calculate scheduled departure time if not provided
      let displayDepartTime = leg.departTime;
      if (!displayDepartTime && leg.type === 'coffee') {
        // For coffee: depart time is when user should leave cafe
        // Calculate from now + cumulative time to coffee
        const now = new Date();
        const coffeeEndMins = departureCountdowns[idx];
        const departDate = new Date(now.getTime() + coffeeEndMins * 60000);
        const h = departDate.getHours();
        const m = departDate.getMinutes();
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        displayDepartTime = `${h12}:${String(m).padStart(2, '0')}${ampm}`;
      }

      ctx.font = `bold ${departTimeSize}px Inter, sans-serif`;
      ctx.fillText(displayDepartTime, departColCenter, departBlockY + departLabelSize + 1);
      ctx.textAlign = 'left';
    }
    }  // V13: Close else block for transit/coffee legs

    // -----------------------------------------------------------------------
    // TIME BOX (V10 Spec Section 5.6) - Per reference images
    // V13.3: Walk legs have NO time box - duration shown in title text
    // Transit/Coffee legs show minutes until departure in black box
    // V13.6: Larger time boxes with bigger numbers and more spacing
    // -----------------------------------------------------------------------
    if (!isWalkLeg) {
    // V13.6: Increased time box size for better visibility
    const timeBoxW = Math.max(72, Math.round(88 * scale));
    const timeBoxX = zone.x + zone.w - timeBoxW;
    // V13.6: More spacing between number and 'MIN' label
    const minOffset = Math.round(6 * scale);
    const labelOffset = Math.round(16 * scale);

    // V13.1: Transit/Coffee = minutes until departure
    const displayMinutes = departureCountdowns[idx];

    if (isSuspended) {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(11 * scale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CANCELLED', timeBoxX + timeBoxW / 2, zone.y + zone.h / 2);
    } else if (isSkippedCoffee) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(timeBoxX + 2, zone.y + 2, timeBoxW - 4, zone.h - 4);
      ctx.setLineDash([]);
      ctx.fillStyle = '#000';
      ctx.font = `bold ${durationSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', timeBoxX + timeBoxW / 2, zone.y + zone.h / 2);
    } else if (isDiverted) {
      ctx.fillStyle = '#000';
      ctx.font = `bold ${durationSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // v1.29: Walk=duration, Transit=cumulative
      ctx.fillText(displayMinutes.toString(), timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 - minOffset);
      ctx.font = `${durationLabelSize}px Inter, sans-serif`;
      ctx.fillText(isWalkLeg ? 'MIN WALK' : 'MIN', timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 + labelOffset);
    } else if (isDelayed && leg.type !== 'walk') {
      ctx.fillStyle = '#FFF';
      ctx.fillRect(timeBoxX, zone.y, timeBoxW, zone.h);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(timeBoxX, zone.y);
      ctx.lineTo(timeBoxX, zone.y + zone.h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#000';
      ctx.font = `bold ${durationSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // v1.29: Walk=duration, Transit=cumulative
      ctx.fillText(displayMinutes.toString(), timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 - minOffset);
      ctx.font = `${durationLabelSize}px Inter, sans-serif`;
      const delayedTimeLabel = leg.type === 'walk' ? 'MIN WALK' : 'MIN';
      ctx.fillText(delayedTimeLabel, timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 + labelOffset);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(timeBoxX, zone.y, timeBoxW, zone.h);
      ctx.fillStyle = '#FFF';
      ctx.font = `bold ${durationSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // v1.29: Walk=duration, Transit=cumulative (coffee gets ~ prefix)
      const displayMin = leg.type === 'coffee' ? `~${displayMinutes}` : displayMinutes.toString();
      ctx.fillText(displayMin, timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 - minOffset);
      ctx.font = `${durationLabelSize}px Inter, sans-serif`;
      const normalTimeLabel = leg.type === 'walk' ? 'MIN WALK' : 'MIN';
      ctx.fillText(normalTimeLabel, timeBoxX + timeBoxW / 2, zone.y + zone.h / 2 + labelOffset);
    }
    }  // V13.3: End of !isWalkLeg block for time box

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';

    // -----------------------------------------------------------------------
    // ARROW CONNECTOR ▼ (between legs) - Per reference images
    // Downward-pointing triangle centered between leg boxes
    // V13: Smaller arrows (12x8) for compact layout
    // V13.6: NO arrows after walk legs (cleaner visual hierarchy)
    // -----------------------------------------------------------------------
    if (idx < legs.length - 1 && !isWalkLeg) {
      const nextZone = getDynamicLegZone(legNum + 1, legs.length, legs);  // V13: Pass legs
      const gapTop = zone.y + zone.h;
      const gapBottom = nextZone.y;
      const gapCenter = gapTop + (gapBottom - gapTop) / 2;
      const arrowX = 400;  // Center of screen

      // Draw filled black arrow pointing down
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(arrowX - 8, gapCenter - 5);  // Top left
      ctx.lineTo(arrowX + 8, gapCenter - 5);  // Top right
      ctx.lineTo(arrowX, gapCenter + 5);      // Bottom point
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
  
  // Store delay count for status bar
  data._delayedLegCount = delayedLegs.length;

  // =========================================================================
  // V15.0: ALTERNATIVE TRANSIT NOTICE
  // When all public transit is cancelled, show rideshare/bike/scooter costs
  // Renders below the last journey leg, above footer
  // =========================================================================
  if (data.alt_transit_active && data.alt_transit_display) {
    const altY = 430 - 52;  // Above footer (footerY=430)
    const altH = 48;
    const altW = 780;
    const altX = 10;

    // Black background panel
    ctx.fillStyle = '#000';
    ctx.fillRect(altX, altY, altW, altH);

    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "ALTERNATIVES" header
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('ALTERNATIVES', altX + altW / 2, altY + 12);

    // Cost estimates line (e.g. "UBER ~$12 | BIKE ~$4")
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillText(data.alt_transit_display, altX + altW / 2, altY + 32);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
  }

  // =========================================================================
  // FOOTER (V13 Spec Section 5) - Taller footer with centered CC logo
  // Height: 40px (increased from 32px)
  // V13.6: Moved up 4px to prevent device frame cutoff
  // =========================================================================
  const footerY = 430;  // V13.6: Moved higher for better visibility on device frames
  const footerH = 50;   // V13.6: Taller footer for better e-ink visibility

  ctx.fillStyle = '#000';
  ctx.fillRect(0, footerY, 800, footerH);
  ctx.fillStyle = '#FFF';

  // V13.2: Destination address (left side, LARGER for visibility)
  ctx.font = 'bold 18px Inter, sans-serif';  // V13.2: Increased from 16px
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // V13.6: Footer text raised 6px for better e-ink visibility (within 50px footer)
  const footerTextY = footerY + footerH / 2 - 6;

  // v1.38: Show destination with address (e.g., "WORK — 80 COLLINS ST")
  let footerDest = (data.destination || 'WORK').toUpperCase();
  const destAddress = data.destination_address || data.workAddress || data.address || '';
  const isHomeDestination = data.destinationType === 'home' ||
                            data.isReverseCommute ||
                            data.destination?.toLowerCase().includes('home') ||
                            footerDest.includes('HOME');

  if (isHomeDestination && !footerDest.startsWith('HOME')) {
    footerDest = `HOME — ${destAddress || footerDest}`.toUpperCase();
  } else if (destAddress && !footerDest.includes(destAddress.toUpperCase())) {
    footerDest = `${footerDest} — ${destAddress}`.toUpperCase();
  }
  // Truncate to prevent overlap with CC logo (max ~300px)
  const maxDestW = 300;
  let truncatedDest = footerDest;
  while (ctx.measureText(truncatedDest).width > maxDestW && truncatedDest.length > 3) {
    truncatedDest = truncatedDest.slice(0, -1);
  }
  if (truncatedDest !== footerDest) truncatedDest += '\u2026';
  ctx.fillText(truncatedDest, 16, footerTextY);

  // V13.6: Load and draw exact cc-footer-icon.bmp - NO conversion, NO estimation
  // The icon is drawn exactly as stored in the BMP file
  // V13.6: Icon raised 6px to match text position
  if (footerIconImageCache) {
    const iconW = footerIconImageCache.width;
    const iconH = footerIconImageCache.height;
    const logoX = (800 - iconW) / 2;
    const logoY = footerY + (footerH - iconH) / 2 - 6;
    ctx.drawImage(footerIconImageCache, logoX, logoY, iconW, iconH);
  } else {
    // Fallback: simple "CC" text if icon not loaded
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CC', 400, footerTextY);
    ctx.textAlign = 'left';
  }

  // V13.3: "ARRIVE" + time on SAME LINE (right aligned, larger for e-ink visibility)
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';
  // Ensure arrival time is in 12-hour format (per dev rules Section 12.2)
  let footerArrival = data._calculatedArrival || '--:--';
  if (footerArrival === '--:--' && data.arrive_by) {
    // Convert arrive_by from 24h to 12h if needed
    const arrMatch = String(data.arrive_by).match(/^(\d{1,2}):(\d{2})/);
    if (arrMatch) {
      const h = parseInt(arrMatch[1], 10);
      const m = arrMatch[2];
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 || 12;
      footerArrival = `${h12}:${m}${ampm}`;
    } else {
      footerArrival = data.arrive_by;
    }
  }

  // V13.3: Combined "ARRIVE X:XX" on same line - fits in footer without cutoff
  // V13.6: Uses footerTextY for raised position
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText(`ARRIVE ${footerArrival}`, 784, footerTextY);

  return canvas;
}

/**
 * Render full screen image as PNG (for debugging/preview)
 * V13.6: Now async to support footer icon loading
 */
export async function renderFullScreen(data, prefs = {}) {
  // V13.6: Preload footer icon before rendering
  await preloadFooterIcon();
  const canvas = _renderFullScreenCanvas(data, prefs);
  return canvas.toBuffer('image/png');
}

/**
 * Render full screen as 1-bit BMP for e-ink devices
 * Uses same rendering as renderFullScreen but outputs BMP format
 * V13.6: Now async to support footer icon loading
 */
export async function renderFullScreenBMP(data, prefs = {}) {
  // V13.6: Preload footer icon before rendering
  await preloadFooterIcon();
  const canvas = _renderFullScreenCanvas(data, prefs);
  return canvasToBMP(canvas);
}

// =============================================================================
// UTILITY FUNCTIONS (merged from image-renderer.js)
// =============================================================================

/**
 * Render a test pattern for display calibration
 */
export function renderTestPattern() {
  const canvas = createCanvas(800, 480);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // White background
  ctx.fillStyle = '#FFF';
  ctx.fillRect(0, 0, 800, 480);
  
  // Black border
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 798, 478);
  
  // Grid pattern
  ctx.lineWidth = 1;
  for (let x = 0; x <= 800; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 480);
    ctx.stroke();
  }
  for (let y = 0; y <= 480; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(800, y);
    ctx.stroke();
  }
  
  // Center text
  ctx.fillStyle = '#000';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CCDash Test Pattern', 400, 240);
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('800 × 480', 400, 280);
  
  return canvasToBMP(canvas);
}

// =============================================================================
// BACKWARD COMPATIBILITY (aliases for zone-renderer.js)
// =============================================================================

export function renderZones(data, forceAll = false) {
  const zones = getChangedZones(data, forceAll);
  const result = {};
  for (const zoneId of zones) {
    result[zoneId] = renderSingleZone(zoneId, data);
  }
  return result;
}

export async function renderFullDashboard(data) {
  return await renderFullScreen(data);
}

export { ZONES as ZONES_V10 };

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Get device configuration by type
 */
export function getDeviceConfig(deviceType) {
  return DEVICE_CONFIGS[deviceType] || DEVICE_CONFIGS['trmnl-og'];
}

/**
 * Render for a specific device (wrapper for multi-device support)
 */
export function render(options) {
  // Extract data from options
  const data = {
    ...options.journeyData,
    coffee_decision: options.coffeeDecision,
    transit: options.transitData,
    alerts: options.alerts,
    weather: options.weather,
    temp: options.weather?.temp,
    condition: options.weather?.condition
  };
  
  return renderFullScreen(data);
}

export default {
  // Device configs
  DEVICE_CONFIGS,
  getDeviceConfig,
  
  // Zone definitions
  ZONES,
  TIER_CONFIG,
  
  // Primary API
  render,
  renderSingleZone,
  renderFullScreen,
  renderZones,
  renderFullDashboard,
  renderTestPattern,
  
  // Zone utilities
  getActiveZones,
  getChangedZones,
  getZoneDefinition,
  getZonesForTier,
  clearCache,
  
  // Low-level utilities
  canvasToBMP
};
