/**
 * /api/zone/[id] - Single Zone BMP API
 * 
 * Returns raw 1-bit BMP data for a single zone.
 * Used by firmware for individual zone updates.
 * 
 * Query params:
 * - demo=<scenario>: Use demo scenario data
 * - force=true: Skip ETag check, always return fresh content
 * 
 * Supports ETag caching - returns 304 Not Modified if content unchanged.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { createHash } from 'crypto';
import { getDepartures, getDisruptions, getWeather } from '../../src/services/opendata-client.js';
import CommuteCompute from '../../src/engines/commute-compute.js';
import { renderSingleZone, renderFullScreen, ZONES } from '../../src/services/ccdash-renderer.js';
import { getScenario } from '../../src/services/journey-scenarios.js';
import { createCanvas } from '@napi-rs/canvas';
import PreferencesManager from '../../src/data/preferences-manager.js';
import { getMelbourneTime, formatTime, formatDateParts } from '../../src/utils/time-format.js';
import { decodeConfigToken } from '../../src/utils/config-token.js';

/**
 * Generate ETag from buffer content
 * Zone-specific: used for single-zone BMP ETag caching
 */
function generateETag(buffer) {
  return '"' + createHash('md5').update(buffer).digest('hex').substring(0, 16) + '"';
}

/**
 * Render an empty white zone
 * Zone-specific: BMP rendering for empty zones
 */
function renderEmptyZone(zone) {
  const { w, h } = zone;

  const bytesPerRow = Math.ceil(w / 8);
  const paddedBytesPerRow = Math.ceil(bytesPerRow / 4) * 4;
  const pixelDataSize = paddedBytesPerRow * h;
  const fileSize = 62 + pixelDataSize;

  const buffer = Buffer.alloc(fileSize, 0);

  // BMP header
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(62, 10);

  // DIB header
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(w, 18);
  buffer.writeInt32LE(h, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(1, 28);
  buffer.writeUInt32LE(pixelDataSize, 34);
  buffer.writeUInt32LE(2835, 38);
  buffer.writeUInt32LE(2835, 42);
  buffer.writeUInt32LE(2, 46);
  buffer.writeUInt32LE(2, 50);

  // Color table: white=0, black=1
  buffer.writeUInt32LE(0x00FFFFFF, 54);
  buffer.writeUInt32LE(0x00000000, 58);

  // Pixel data: all white (0x00 = color 0 = white)
  // Buffer already initialized to 0, so it's all white

  return buffer;
}

/**
 * Render a simple divider line zone (2px black line)
 * Zone-specific: BMP rendering for divider zones
 */
function renderDividerZone(zone) {
  const { w, h } = zone;

  // Calculate BMP sizes
  const bytesPerRow = Math.ceil(w / 8);
  const paddedBytesPerRow = Math.ceil(bytesPerRow / 4) * 4;
  const pixelDataSize = paddedBytesPerRow * h;
  const fileSize = 62 + pixelDataSize;

  const buffer = Buffer.alloc(fileSize);

  // BMP header
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(62, 10);

  // DIB header
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(w, 18);
  buffer.writeInt32LE(h, 22);  // Positive = bottom-up
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(1, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelDataSize, 34);
  buffer.writeUInt32LE(2835, 38);
  buffer.writeUInt32LE(2835, 42);
  buffer.writeUInt32LE(2, 46);
  buffer.writeUInt32LE(2, 50);

  // Color table
  buffer.writeUInt32LE(0x00FFFFFF, 54);  // White
  buffer.writeUInt32LE(0x00000000, 58);  // Black

  // Pixel data - all black (0x00 = index 0 = white? No wait, 1-bit: 0=first color, 1=second)
  // For a divider, we want all black pixels, so all bits = 1
  const pixelOffset = 62;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < paddedBytesPerRow; col++) {
      buffer[pixelOffset + row * paddedBytesPerRow + col] = 0xFF;  // All pixels = color 1 = black
    }
  }

  return buffer;
}

// Singleton engine instance (keyed by token for multi-user support)
let engineCache = new Map();

async function getEngine(token = null) {
  // Use token-specific engine if token provided
  const cacheKey = token ? token.substring(0, 32) : 'default';

  if (!engineCache.has(cacheKey)) {
    const engine = new CommuteCompute();

    // If token provided, decode and use config (shared config-token.js module)
    if (token) {
      const config = decodeConfigToken(token);
      if (config) {
        await engine.initialize({
          homeAddress: config.addresses?.home,
          homeLocation: config.locations?.home,
          workAddress: config.addresses?.work,
          workLocation: config.locations?.work,
          cafeLocation: config.cafe || config.locations?.cafe,
          targetArrival: config.journey?.arrivalTime,
          coffeeEnabled: config.journey?.coffeeEnabled,
          preferredRoute: config.journey?.transitRoute,
          state: config.state,
          transitApiKey: config.api?.key
        });
      } else {
        await engine.initialize();
      }
    } else {
      await engine.initialize();
    }

    engineCache.set(cacheKey, engine);

    // Clean up old cache entries (keep max 10)
    if (engineCache.size > 10) {
      const firstKey = engineCache.keys().next().value;
      engineCache.delete(firstKey);
    }
  }

  return engineCache.get(cacheKey);
}

/**
 * Build leg title from route leg
 * Zone-specific: [id].js variant with case-insensitive destination matching
 */
function buildLegTitle(leg) {
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  switch (leg.type) {
    case 'walk': {
      const dest = leg.to || leg.destination?.name;
      if (dest === 'cafe' || dest?.toLowerCase()?.includes('cafe')) return 'Walk to Cafe';
      if (dest === 'work' || dest === 'WORK') return 'Walk to Office';
      if (dest?.toLowerCase()?.includes('station')) return 'Walk to Station';
      if (dest?.toLowerCase()?.includes('stop')) return 'Walk to Stop';
      return `Walk to ${cap(dest) || 'Station'}`;
    }
    case 'coffee': return `Coffee at ${leg.location || 'Cafe'}`;
    case 'train': return `Train to ${leg.destination?.name || leg.to || 'City'}`;
    case 'tram': return `Tram ${leg.routeNumber || ''} to ${leg.destination?.name || leg.to || 'City'}`.trim();
    case 'bus': return `Bus ${leg.routeNumber || ''} to ${leg.destination?.name || leg.to || 'City'}`.trim();
    default: return leg.title || 'Continue';
  }
}

/**
 * Build leg subtitle
 * Zone-specific: [id].js variant with simplified subtitle format
 */
function buildLegSubtitle(leg, transitData) {
  switch (leg.type) {
    case 'walk': return `${leg.minutes || 5} min walk`;
    case 'coffee': return 'TIME FOR COFFEE';
    case 'train': {
      const nextTrain = transitData?.trains?.[0];
      return nextTrain ? `Next: ${nextTrain.minutes} min` : 'Check departures';
    }
    case 'tram': {
      const nextTram = transitData?.trams?.[0];
      return nextTram ? `Next: ${nextTram.minutes} min` : 'Check departures';
    }
    default: return leg.subtitle || '';
  }
}

/**
 * Build journey legs from route
 * Zone-specific: [id].js variant with simple leg building
 * // TODO: Consider importing from shared module
 */
function buildJourneyLegs(route, transitData, coffeeDecision) {
  if (!route?.legs) return [];
  
  const legs = [];
  let legNumber = 1;
  
  for (const leg of route.legs) {
    const baseLeg = {
      number: legNumber++,
      type: leg.type,
      title: buildLegTitle(leg),
      subtitle: buildLegSubtitle(leg, transitData),
      minutes: leg.minutes || leg.durationMinutes || 0,
      state: 'normal'
    };
    
    if (leg.type === 'coffee') {
      if (!coffeeDecision?.canGet) {
        baseLeg.state = 'skip';
        baseLeg.subtitle = '[X] SKIP -- Running late';
        legNumber--;
      } else {
        baseLeg.subtitle = '[OK] TIME FOR COFFEE';
      }
    }
    
    if (['train', 'tram', 'bus'].includes(leg.type)) {
      const departures = leg.type === 'train' ? transitData?.trains :
                         leg.type === 'tram' ? transitData?.trams : [];
      if (departures?.[0]?.isDelayed) {
        baseLeg.state = 'delayed';
        baseLeg.minutes = departures[0].minutes;
      }
    }
    
    legs.push(baseLeg);
  }
  
  return legs;
}

function buildDemoData(scenario) {
  const journeyLegs = (scenario.steps || []).map((step, idx) => ({
    number: idx + 1,
    type: step.type.toLowerCase(),
    title: step.title,
    subtitle: step.subtitle,
    minutes: step.duration || 0,
    state: step.status === 'SKIPPED' ? 'skip' : 
           step.status === 'DELAYED' ? 'delayed' :
           step.status === 'CANCELLED' ? 'suspended' :
           step.status === 'DIVERTED' ? 'diverted' : 'normal'
  }));

  return {
    location: scenario.origin || 'Home',
    current_time: scenario.currentTime || '7:45',
    day: scenario.dayOfWeek || 'Tuesday',
    date: scenario.date || '28 January',
    temp: scenario.weather?.temp ?? 22,
    condition: scenario.weather?.condition || 'Sunny',
    umbrella: scenario.weather?.umbrella || false,
    status_type: scenario.status === 'DELAY' ? 'delay' :
                 scenario.status === 'DISRUPTION' ? 'disruption' :
                 scenario.status === 'DIVERSION' ? 'diversion' : 'normal',
    arrive_by: scenario.arrivalTime || '9:00',
    total_minutes: scenario.totalDuration || journeyLegs.reduce((t, l) => t + (l.minutes || 0), 0),
    leave_in_minutes: scenario.leaveInMinutes || null,
    journey_legs: journeyLegs,
    destination: scenario.destination || 'Work'
  };
}

// Composite zone mappings for firmware compatibility
// Firmware requests: header, divider, summary, legs, footer
// Maps to multiple granular zones rendered as one BMP
const COMPOSITE_ZONES = {
  'header': { 
    x: 0, y: 0, w: 800, h: 94,
    subzones: ['header.location', 'header.time', 'header.dayDate', 'header.weather']
  },
  'divider': { x: 0, y: 94, w: 800, h: 2 },  // Just a line
  'summary': { 
    x: 0, y: 96, w: 800, h: 36,
    subzones: ['status']
  },
  'legs': { 
    x: 0, y: 132, w: 800, h: 316,
    subzones: ['leg1', 'leg2', 'leg3', 'leg4', 'leg5', 'leg6']
  },
  'footer': { 
    x: 0, y: 448, w: 800, h: 32,
    subzones: ['footer']
  }
};

export default async function handler(req, res) {
  try {
    const { id, token } = req.query;
    const demoScenario = req.query?.demo;

    // Log token presence for debugging
    if (token) {
    }
    
    // Check for composite zone first
    const isComposite = COMPOSITE_ZONES[id];
    
    // Validate zone ID (support both granular and composite)
    if (!id || (!ZONES[id] && !isComposite)) {
      return res.status(400).json({ 
        error: 'Invalid zone ID',
        available: [...Object.keys(ZONES), ...Object.keys(COMPOSITE_ZONES)]
      });
    }
    
    const zone = isComposite ? COMPOSITE_ZONES[id] : ZONES[id];
    let dashboardData;
    
    // Get dashboard data (demo or live)
    if (demoScenario) {
      const scenario = getScenario(demoScenario);
      if (!scenario) {
        return res.status(400).json({ error: 'Unknown demo scenario' });
      }
      dashboardData = buildDemoData(scenario);
    } else {
      // Live data - use token if provided
      const now = getMelbourneTime();
      const engine = await getEngine(token);
      const route = engine.getSelectedRoute();
      const locations = engine.getLocations();
      const config = engine.journeyConfig;
      
      // Per Section 3.1: Zero-Config - get stop IDs from preferences (KV), no process.env
      const prefs = new PreferencesManager();
      const trainStopId = prefs.get()?.trainStopId || null;
      const tramStopId = prefs.get()?.tramStopId || null;
      
      const [trains, trams, weather, disruptions] = await Promise.all([
        getDepartures(trainStopId, 0),
        getDepartures(tramStopId, 1),
        getWeather(locations.home?.lat, locations.home?.lon),
        getDisruptions(0).catch(() => [])
      ]);
      
      const transitData = { trains, trams, disruptions };
      const coffeeDecision = engine.calculateCoffeeDecision(transitData, route?.legs || []);
      
      // Build journey legs from route
      const journeyLegs = buildJourneyLegs(route, transitData, coffeeDecision);
      const totalMinutes = journeyLegs.filter(l => l.state !== 'skip').reduce((t, l) => t + (l.minutes || 0), 0);
      const statusType = journeyLegs.some(l => l.state === 'delayed') ? 'delay' : 
                         disruptions.length > 0 ? 'disruption' : 'normal';
      
      // Calculate leave time
      const arrivalTime = config?.journey?.arrivalTime || '09:00';
      const [arrH, arrM] = arrivalTime.split(':').map(Number);
      const targetMins = arrH * 60 + arrM;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const leaveInMinutes = Math.max(0, targetMins - totalMinutes - nowMins);
      
      // Build dashboard data for zone
      dashboardData = {
        location: locations.home?.address || 'Home',
        current_time: formatTime(now),
        day: formatDateParts(now).day,
        date: formatDateParts(now).date,
        temp: weather?.temp ?? '--',
        condition: weather?.condition || 'N/A',
        umbrella: weather?.umbrella || false,
        status_type: statusType,
        arrive_by: arrivalTime,
        total_minutes: totalMinutes || 30,
        leave_in_minutes: leaveInMinutes > 0 ? leaveInMinutes : null,
        journey_legs: journeyLegs,
        destination: locations.work?.address || 'Work'
      };
    }
    
    // Render zone to BMP (composite or single)
    let bmpBuffer;
    
    if (isComposite) {
      if (id === 'divider') {
        // Divider is just a 2px black line
        bmpBuffer = renderDividerZone(zone);
      } else if (zone.subzones && zone.subzones.length > 0) {
        // Composite zone: render subzones and combine into single BMP
        // For now, render the first subzone that matches
        // This gives us working BMP format
        const firstSubzone = zone.subzones[0];
        if (ZONES[firstSubzone]) {
          bmpBuffer = renderSingleZone(firstSubzone, dashboardData);
        }
        
        // If first subzone failed, try others
        if (!bmpBuffer) {
          for (const sz of zone.subzones) {
            if (ZONES[sz]) {
              bmpBuffer = renderSingleZone(sz, dashboardData);
              if (bmpBuffer) break;
            }
          }
        }
        
        // Still nothing? Return empty white zone
        if (!bmpBuffer) {
          bmpBuffer = renderEmptyZone(zone);
        }
      } else {
        // No subzones defined, render empty
        bmpBuffer = renderEmptyZone(zone);
      }
    } else {
      // Single granular zone
      bmpBuffer = renderSingleZone(id, dashboardData);
    }
    
    if (!bmpBuffer) {
      return res.status(500).json({ error: 'Zone render failed' });
    }
    
    // Generate ETag from content hash
    const etag = generateETag(bmpBuffer);
    const forceRefresh = req.query?.force === 'true';
    
    // Check If-None-Match header for caching (unless force=true)
    const clientETag = req.headers['if-none-match'];
    if (!forceRefresh && clientETag && clientETag === etag) {
      // Content unchanged - return 304 Not Modified
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, max-age=10');
      return res.status(304).end();
    }
    
    // Return raw BMP with headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', bmpBuffer.length);
    res.setHeader('ETag', etag);
    res.setHeader('X-Zone-X', zone.x);
    res.setHeader('X-Zone-Y', zone.y);
    res.setHeader('X-Zone-Width', zone.w);
    res.setHeader('X-Zone-Height', zone.h);
    res.setHeader('Cache-Control', 'private, max-age=10');
    
    return res.status(200).send(bmpBuffer);
    
  } catch (error) {
    return res.status(500).json({
      error: 'Zone render failed',
      message: error.message
    });
  }
}
