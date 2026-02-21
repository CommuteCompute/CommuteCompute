// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system

/**
 * CC LiveDash™ — Multi-Device Dashboard Renderer
 * Part of the Commute Compute System™
 * 
 * Renders CommuteCompute™ output as a live dashboard image
 * optimised for different e-ink device variants.
 * 
 * Supported devices:
 * - TRMNL Display (OG) (800×480 landscape)
 * - TRMNL Mini (400×300 landscape)
 * - Kindle Paperwhite 3/4 (758×1024 portrait)
 * - Kindle Paperwhite 5 (1236×1648 portrait)
 * - Kindle Basic (600×800 portrait)
 * - Inkplate 6 (800×600 landscape)
 * - Inkplate 10 (1200×825 landscape)
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { createCanvas } from '@napi-rs/canvas';
import CommuteCompute from '../engines/commute-compute.js';

// =============================================================================
// DEVICE CONFIGURATIONS
// =============================================================================

export const DEVICE_CONFIGS = {
  'trmnl-og': {
    name: 'TRMNL Display (OG)',
    width: 800,
    height: 480,
    orientation: 'landscape',
    dpi: 117,
    colors: '1-bit',
    refreshRate: '20s partial',
    scale: {
      header: { height: 94, timeSize: 64, dateSize: 18 },
      summary: { height: 28, fontSize: 14 },
      legs: { height: 316, titleSize: 17, subtitleSize: 13, durationSize: 30 },
      footer: { height: 32, fontSize: 16 }
    }
  },
  'trmnl-mini': {
    name: 'TRMNL Mini',
    width: 600,
    height: 448,
    orientation: 'landscape',
    dpi: 117,
    colors: '1-bit',
    refreshRate: '20s partial',
    scale: {
      header: { height: 70, timeSize: 48, dateSize: 14 },
      summary: { height: 22, fontSize: 12 },
      legs: { height: 280, titleSize: 14, subtitleSize: 10, durationSize: 24, maxLegs: 5 },
      footer: { height: 26, fontSize: 12 }
    }
  },
  // Kindle 4 NT / Kindle Touch (600×800)
  'kindle-k4': {
    name: 'Kindle 4 / Touch',
    width: 600,
    height: 800,
    orientation: 'portrait',
    dpi: 167,
    colors: '16-grayscale',
    refreshRate: 'manual',
    jailbreak: 'WatchThis',
    scale: {
      header: { height: 100, timeSize: 56, dateSize: 18 },
      summary: { height: 32, fontSize: 14 },
      legs: { height: 520, titleSize: 18, subtitleSize: 12, durationSize: 32, maxLegs: 6 },
      footer: { height: 40, fontSize: 16 }
    }
  },
  // Kindle Paperwhite 2 (758×1024)
  'kindle-pw2': {
    name: 'Kindle Paperwhite 2',
    width: 758,
    height: 1024,
    orientation: 'portrait',
    dpi: 212,
    colors: '16-grayscale',
    refreshRate: 'manual',
    jailbreak: 'WatchThis',
    scale: {
      header: { height: 130, timeSize: 72, dateSize: 22 },
      summary: { height: 36, fontSize: 16 },
      legs: { height: 700, titleSize: 22, subtitleSize: 14, durationSize: 36, maxLegs: 7 },
      footer: { height: 44, fontSize: 18 }
    }
  },
  // Kindle Paperwhite 3/4 / Kindle Voyage (1072×1448)
  'kindle-pw3': {
    name: 'Kindle Paperwhite 3/4 / Voyage',
    width: 1072,
    height: 1448,
    orientation: 'portrait',
    dpi: 300,
    colors: '16-grayscale',
    refreshRate: 'manual',
    jailbreak: 'WatchThis',
    scale: {
      header: { height: 180, timeSize: 100, dateSize: 32 },
      summary: { height: 50, fontSize: 22 },
      legs: { height: 1000, titleSize: 32, subtitleSize: 20, durationSize: 48, maxLegs: 8 },
      footer: { height: 60, fontSize: 24 }
    }
  },
  // Kindle Paperwhite 5 (1236×1648)
  'kindle-pw5': {
    name: 'Kindle Paperwhite 5',
    width: 1236,
    height: 1648,
    orientation: 'portrait',
    dpi: 300,
    colors: '16-grayscale',
    refreshRate: 'manual',
    jailbreak: 'WatchThis',
    scale: {
      header: { height: 200, timeSize: 120, dateSize: 36 },
      summary: { height: 60, fontSize: 26 },
      legs: { height: 1100, titleSize: 36, subtitleSize: 24, durationSize: 56, maxLegs: 8 },
      footer: { height: 72, fontSize: 28 }
    }
  },
  // Aliases for compatibility
  'kindle-pw4': { alias: 'kindle-pw3' },  // PW4 same as PW3
  'kindle-voyage': { alias: 'kindle-pw3' },  // Voyage same res as PW3/4
  'kindle-touch': { alias: 'kindle-k4' },  // Touch same as K4
  'kindle-basic': { alias: 'kindle-k4' },  // Basic same as K4
  'inkplate-6': {
    name: 'Inkplate 6',
    width: 800,
    height: 600,
    orientation: 'landscape',
    dpi: 166,
    colors: '3-bit grayscale',
    refreshRate: '1s partial',
    scale: {
      header: { height: 100, timeSize: 64, dateSize: 20 },
      summary: { height: 32, fontSize: 16 },
      legs: { height: 400, titleSize: 20, subtitleSize: 14, durationSize: 36 },
      footer: { height: 40, fontSize: 18 }
    }
  },
  'inkplate-10': {
    name: 'Inkplate 10',
    width: 1200,
    height: 825,
    orientation: 'landscape',
    dpi: 150,
    colors: '3-bit grayscale',
    refreshRate: '1s partial',
    scale: {
      header: { height: 130, timeSize: 80, dateSize: 24 },
      summary: { height: 40, fontSize: 20 },
      legs: { height: 560, titleSize: 26, subtitleSize: 18, durationSize: 44 },
      footer: { height: 52, fontSize: 22 }
    }
  }
};

// =============================================================================
// LIVEDASH CLASS
// =============================================================================

export class LiveDash {
  constructor(preferences = null) {
    this.preferences = preferences;
    this.commuteCompute = null;
    this.currentDevice = 'trmnl-og';
    this.deviceConfig = DEVICE_CONFIGS['trmnl-og'];
    
    // Auto-refresh settings
    this.autoRefresh = true;
    this.refreshIntervalMs = 30000; // 30 seconds
  }

  /**
   * Initialize LiveDash with CommuteCompute
   */
  async initialize(preferences = null) {
    if (preferences) {
      this.preferences = preferences;
    }
    
    // Initialize CommuteCompute
    this.commuteCompute = new CommuteCompute(this.preferences);
    await this.commuteCompute.initialize();
    
    return this;
  }

  /**
   * Set the target device (supports aliases)
   */
  setDevice(deviceId) {
    let config = DEVICE_CONFIGS[deviceId];
    
    if (!config) {
      throw new Error(`Unknown device: ${deviceId}. Valid: ${Object.keys(DEVICE_CONFIGS).filter(k => !DEVICE_CONFIGS[k].alias).join(', ')}`);
    }
    
    // Resolve alias
    if (config.alias) {
      deviceId = config.alias;
      config = DEVICE_CONFIGS[deviceId];
    }
    
    this.currentDevice = deviceId;
    this.deviceConfig = config;
    
    return this;
  }

  /**
   * Render the dashboard for the current device
   */
  async render(options = {}) {
    const forceRefresh = options.forceRefresh || false;
    
    // Get journey data from CommuteCompute
    const journeyData = await this.commuteCompute.getJourneyRecommendation({ forceRefresh });
    
    // Render for current device
    return this.renderForDevice(journeyData);
  }

  /**
   * Render dashboard optimised for the selected device
   */
  renderForDevice(data) {
    const { width, height, scale } = this.deviceConfig;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, width, height);
    
    let y = 0;
    
    // Header
    y = this.renderHeader(ctx, data, 0, scale.header);
    
    // Divider
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, width, 2);
    y += 2;
    
    // Summary bar
    y = this.renderSummary(ctx, data, y, scale.summary);
    
    // Gap before legs
    y += 6;
    
    // Journey legs
    y = this.renderLegs(ctx, data, y, scale.legs);
    
    // Footer (at bottom)
    this.renderFooter(ctx, data, height - scale.footer.height, scale.footer);
    
    return canvas.toBuffer('image/png');
  }

  /**
   * Render header zone
   */
  renderHeader(ctx, data, y, scale) {
    const { width } = this.deviceConfig;
    const { height, timeSize, dateSize } = scale;
    
    // Get local time - MUST use 12-hour format per Rule 12.2
    const localTime = this.commuteCompute.getLocalTime();
    const hours24 = localTime.getHours();
    const hours12 = hours24 % 12 || 12; // Convert to 12-hour (12 instead of 0)
    const minutes = localTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours12}:${minutes}`;
    const ampm = hours24 >= 12 ? 'pm' : 'am';
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayStr = days[localTime.getDay()];
    const dateStr = `${localTime.getDate()} ${months[localTime.getMonth()]}`;
    
    // HOME label
    ctx.fillStyle = '#000';
    ctx.font = `600 ${Math.round(dateSize * 0.8)}px sans-serif`;
    ctx.fillText('HOME', 12, y + 18);
    
    // Time (12-hour format)
    ctx.font = `900 ${timeSize}px sans-serif`;
    ctx.fillText(timeStr, 12, y + height - 20);
    
    // AM/PM suffix
    ctx.font = `600 ${Math.round(timeSize * 0.3)}px sans-serif`;
    const timeWidth = ctx.measureText(timeStr).width;
    ctx.fillText(ampm, 12 + timeWidth + 4, y + height - 20);
    
    // Day and date (center)
    ctx.font = `700 ${dateSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dayStr, width / 2, y + height / 2 - 5);
    ctx.font = `600 ${Math.round(dateSize * 0.9)}px sans-serif`;
    ctx.fillText(dateStr, width / 2, y + height / 2 + dateSize);
    ctx.textAlign = 'left';
    
    // Weather box (right)
    const wxWidth = Math.round(width * 0.15);
    const wxHeight = Math.round(height * 0.85);
    const wxX = width - wxWidth - 10;
    const wxY = y + 8;
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(wxX, wxY, wxWidth, wxHeight);
    
    // Temperature
    const temp = data.weather?.temp || '--';
    ctx.font = `900 ${Math.round(timeSize * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${temp}°`, wxX + wxWidth / 2, wxY + wxHeight * 0.35);
    
    // Condition
    const condition = data.weather?.condition || 'Unknown';
    ctx.font = `600 ${Math.round(dateSize * 0.7)}px sans-serif`;
    ctx.fillText(condition.substring(0, 12), wxX + wxWidth / 2, wxY + wxHeight * 0.55);
    
    // Umbrella indicator
    const umbHeight = Math.round(wxHeight * 0.2);
    const umbY = wxY + wxHeight - umbHeight - 4;
    if (data.weather?.umbrella) {
      ctx.fillStyle = '#000';
      ctx.fillRect(wxX + 4, umbY, wxWidth - 8, umbHeight);
      ctx.fillStyle = '#FFF';
      ctx.font = `700 ${Math.round(umbHeight * 0.7)}px sans-serif`;
      ctx.fillText('UMBRELLA', wxX + wxWidth / 2, umbY + umbHeight * 0.75);
    } else {
      ctx.strokeRect(wxX + 4, umbY, wxWidth - 8, umbHeight);
      ctx.fillStyle = '#000';
      ctx.font = `600 ${Math.round(umbHeight * 0.65)}px sans-serif`;
      ctx.fillText('NO UMBRELLA', wxX + wxWidth / 2, umbY + umbHeight * 0.75);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    
    return y + height;
  }

  /**
   * Render summary bar
   */
  renderSummary(ctx, data, y, scale) {
    const { width } = this.deviceConfig;
    const { height, fontSize } = scale;
    
    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, width, height);
    
    // Status text
    ctx.fillStyle = '#FFF';
    ctx.font = `800 ${fontSize}px sans-serif`;
    
    const arriveBy = data.coffee?.arrivalTime || '09:00';
    const totalMins = data.route?.totalMinutes || '--';
    
    let statusText;
    if (data.transit?.source === 'fallback') {
      statusText = `SCHEDULED → Arrive ${arriveBy}`;
    } else if (data.coffee?.urgent) {
      statusText = `LEAVE NOW → Arrive ${arriveBy}`;
    } else {
      statusText = `LEAVE NOW → Arrive ${arriveBy}`;
    }
    
    ctx.fillText(statusText, 12, y + height - (height - fontSize) / 2);
    
    // Total time (right)
    ctx.textAlign = 'right';
    ctx.fillText(`${totalMins} min total`, width - 12, y + height - (height - fontSize) / 2);
    ctx.textAlign = 'left';
    
    return y + height;
  }

  /**
   * Render journey legs
   */
  renderLegs(ctx, data, startY, scale) {
    const { width } = this.deviceConfig;
    const { height, titleSize, subtitleSize, durationSize, maxLegs = 5 } = scale;
    
    // Build legs from route or fallback
    const legs = this.buildLegsFromData(data);
    
    if (legs.length === 0) {
      ctx.fillStyle = '#000';
      ctx.font = `700 ${titleSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('No journey configured', width / 2, startY + height / 2);
      ctx.textAlign = 'left';
      return startY + height;
    }
    
    const displayLegs = legs.slice(0, maxLegs);
    const numLegs = displayLegs.length;
    const arrowHeight = 14;
    const totalArrowSpace = (numLegs - 1) * arrowHeight;
    const availableHeight = height - totalArrowSpace - 8;
    const legHeight = Math.min(80, Math.floor(availableHeight / numLegs));
    
    let y = startY;
    
    displayLegs.forEach((leg, i) => {
      const isLast = i === numLegs - 1;
      this.renderLeg(ctx, leg, i + 1, y, legHeight, scale, isLast);
      y += legHeight;
      
      if (!isLast) {
        // Arrow connector
        this.drawArrowConnector(ctx, width / 2, y + 2);
        y += arrowHeight;
      }
    });
    
    return y;
  }

  /**
   * Render a single leg
   */
  renderLeg(ctx, leg, number, y, height, scale, isLast) {
    const { width } = this.deviceConfig;
    const { titleSize, subtitleSize, durationSize } = scale;
    
    const isSkip = leg.state === 'skip';
    const isCancelled = leg.state === 'cancelled';
    const isDelayed = leg.state === 'delayed';
    
    const boxX = 10;
    const boxW = width - 20;
    const textColor = (isSkip || isCancelled) ? '#888' : '#000';
    
    // Background
    ctx.fillStyle = '#FFF';
    ctx.fillRect(boxX, y, boxW, height);
    
    if (isCancelled) {
      this.drawHatchedBackground(ctx, boxX, y, boxW - 72, height);
    }
    
    // Border
    ctx.strokeStyle = textColor;
    ctx.lineWidth = (leg.type === 'coffee' && !isSkip) || isDelayed ? 3 : 2;
    if (isSkip || isDelayed) {
      ctx.setLineDash([6, 4]);
    }
    ctx.strokeRect(boxX, y, boxW, height);
    ctx.setLineDash([]);
    
    // Number circle
    const circleX = boxX + 20;
    const circleY = y + height / 2;
    const circleR = Math.min(14, height / 3);
    
    ctx.fillStyle = textColor;
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFF';
    ctx.font = `700 ${Math.round(circleR * 1.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(number.toString(), circleX, circleY + circleR / 3);
    ctx.textAlign = 'left';
    
    // Icon
    const iconX = boxX + 44;
    const iconY = y + height / 2 - 12;
    this.drawModeIcon(ctx, leg.type, iconX, iconY, 24, textColor);
    
    // Title
    ctx.fillStyle = textColor;
    ctx.font = `800 ${titleSize}px sans-serif`;
    const titleX = boxX + 76;
    ctx.fillText(leg.title || '', titleX, y + height / 2 - 2);
    
    // Subtitle
    ctx.font = `600 ${subtitleSize}px sans-serif`;
    ctx.fillText(leg.subtitle || '', titleX, y + height / 2 + titleSize - 2);
    
    // Duration box
    const durBoxW = 68;
    const durBoxX = boxX + boxW - durBoxW;
    
    if (isCancelled) {
      ctx.fillStyle = '#FFF';
      ctx.fillRect(durBoxX, y, durBoxW, height);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(durBoxX, y, durBoxW, height);
      // X through
      ctx.beginPath();
      ctx.moveTo(durBoxX + 10, y + 10);
      ctx.lineTo(durBoxX + durBoxW - 10, y + height - 10);
      ctx.moveTo(durBoxX + durBoxW - 10, y + 10);
      ctx.lineTo(durBoxX + 10, y + height - 10);
      ctx.stroke();
      ctx.font = `900 ${Math.round(durationSize * 0.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CANCELLED', durBoxX + durBoxW / 2, y + height / 2 + 4);
    } else if (isSkip) {
      ctx.fillStyle = '#FFF';
      ctx.fillRect(durBoxX, y, durBoxW, height);
      ctx.strokeStyle = '#000';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(durBoxX, y, durBoxW, height);
      ctx.setLineDash([]);
      ctx.font = `900 ${Math.round(durationSize * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SKIP', durBoxX + durBoxW / 2, y + height / 2 + 4);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(durBoxX, y, durBoxW, height);
      ctx.fillStyle = '#FFF';
      ctx.font = `900 ${durationSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(leg.minutes?.toString() || '--', durBoxX + durBoxW / 2, y + height / 2 + durationSize / 3);
      ctx.font = `600 ${Math.round(durationSize * 0.4)}px sans-serif`;
      ctx.fillText(leg.type === 'walk' ? 'MIN WALK' : 'MIN', durBoxX + durBoxW / 2, y + height / 2 + durationSize / 3 + durationSize * 0.4);
    }
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
  }

  /**
   * Render footer
   */
  renderFooter(ctx, data, y, scale) {
    const { width } = this.deviceConfig;
    const { height, fontSize } = scale;
    
    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, width, height);
    
    // Destination
    ctx.fillStyle = '#FFF';
    ctx.font = `800 ${fontSize}px sans-serif`;
    ctx.fillText('WORK', 12, y + height / 2 + fontSize / 3);
    
    // ARRIVE label and time
    ctx.font = `700 ${Math.round(fontSize * 0.8)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('ARRIVE', width - 80, y + height / 2 + fontSize / 4);
    
    const arriveTime = data.coffee?.arrivalTime || '09:00';
    ctx.font = `900 ${Math.round(fontSize * 1.4)}px sans-serif`;
    ctx.fillText(arriveTime, width - 12, y + height / 2 + fontSize / 3);
    
    ctx.textAlign = 'left';
  }

  /**
   * Build legs from CommuteCompute data
   */
  buildLegsFromData(data) {
    const legs = [];
    const route = data.route;
    const coffee = data.coffee;
    
    // Check for pre-computed journey_legs (from CommuteCompute or zone-renderer)
    if (data.journey_legs && Array.isArray(data.journey_legs) && data.journey_legs.length > 0) {
      return data.journey_legs.map(leg => ({
        type: leg.type || 'walk',
        title: leg.title || '',
        subtitle: leg.subtitle || '',
        minutes: leg.minutes || leg.duration || 0,
        state: leg.state || 'normal'
      }));
    }
    
    // Check for preferredRoute.segments format (from sample-journey.json)
    if (this.preferences?.preferredRoute?.segments) {
      return this.preferences.preferredRoute.segments.map(seg => ({
        type: seg.type || 'walk',
        title: this.formatSegmentTitle(seg),
        subtitle: this.formatSegmentSubtitle(seg),
        minutes: seg.minutes || 0,
        state: 'normal'
      }));
    }
    
    // If we have a route with coffee segments
    if (route?.coffeeSegments?.position === 'before-transit') {
      // Walk to cafe
      legs.push({
        type: 'walk',
        title: 'Walk to Cafe',
        subtitle: `${route.coffeeSegments.walkToCafe} min walk`,
        minutes: route.coffeeSegments.walkToCafe,
        state: 'normal'
      });
      
      // Coffee
      const coffeeState = coffee?.canGet === false ? 'skip' : 'normal';
      legs.push({
        type: 'coffee',
        title: 'COFFEE',
        subtitle: coffeeState === 'skip' ? `SKIP -- ${coffee?.subtext || 'No time'}` : '[Coffee] TIME FOR COFFEE',
        minutes: route.coffeeSegments.coffeeTime,
        state: coffeeState
      });
      
      // Walk to station
      legs.push({
        type: 'walk',
        title: 'Walk to Station',
        subtitle: `${route.coffeeSegments.walkToStation} min walk`,
        minutes: route.coffeeSegments.walkToStation,
        state: 'normal'
      });
    } else {
      // Just walk to station
      legs.push({
        type: 'walk',
        title: 'Walk to Station',
        subtitle: '5 min walk',
        minutes: 5,
        state: 'normal'
      });
    }
    
    // Transit modes
    if (route?.modes) {
      for (const mode of route.modes) {
        const modeType = this.getModeType(mode.type);
        legs.push({
          type: modeType,
          title: mode.originStation?.name || modeType,
          subtitle: `${mode.routeNumber || modeType} → ${mode.destinationStation?.name || 'City'}`,
          minutes: mode.estimatedDuration || mode.liveData?.minutes || 10,
          state: mode.cancelled ? 'cancelled' : mode.isDelayed ? 'delayed' : 'normal'
        });
      }
    } else {
      // Fallback transit
      const transit = data.transit;
      if (transit?.trains?.length > 0) {
        const train = transit.trains[0];
        legs.push({
          type: 'train',
          title: 'Train',
          subtitle: `Train → ${train.destination || 'City'}`,
          minutes: train.minutes || 10,
          state: 'normal'
        });
      } else if (transit?.trams?.length > 0) {
        const tram = transit.trams[0];
        legs.push({
          type: 'tram',
          title: `Tram ${tram.routeNumber || ''}`,
          subtitle: `Tram → ${tram.destination || 'City'}`,
          minutes: tram.minutes || 10,
          state: 'normal'
        });
      } else if (transit?.buses?.length > 0) {
        const bus = transit.buses[0];
        legs.push({
          type: 'bus',
          title: `Bus ${bus.routeNumber || ''}`,
          subtitle: `Bus → ${bus.destination || 'City'}`,
          minutes: bus.minutes || 15,
          state: 'normal'
        });
      }
    }
    
    // Final walk to work
    legs.push({
      type: 'walk',
      title: 'Walk to Work',
      subtitle: '5 min walk',
      minutes: route?.walkingSegments?.stationToWork || 5,
      state: 'normal'
    });
    
    return legs;
  }

  /**
   * Draw arrow connector between legs
   */
  drawArrowConnector(ctx, x, y) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + 10);
    ctx.lineTo(x + 8, y + 10);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw hatched background for cancelled legs
   */
  drawHatchedBackground(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#CCC';
    ctx.lineWidth = 1;
    const spacing = 8;
    for (let i = -h; i < w; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw mode icon
   */
  drawModeIcon(ctx, type, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = `${size}px sans-serif`;
    
    const icons = {
      walk: 'WALK',
      coffee: '[Coffee]',
      train: '[Train]',
      tram: '[Tram]',
      bus: '[Bus]',
      ferry: '[Ferry]',
      lightrail: '[Tram]'
    };
    
    ctx.fillText(icons[type] || '•', x, y + size);
  }

  /**
   * Format segment title from preferredRoute.segments format
   */
  formatSegmentTitle(seg) {
    const type = seg.type || 'walk';
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    
    switch (type) {
      case 'walk':
        if (seg.to?.toLowerCase().includes('cafe') || seg.to?.toLowerCase().includes('coffee')) {
          return 'Walk to Cafe';
        }
        if (seg.to?.toLowerCase().includes('station') || seg.to?.toLowerCase().includes('platform')) {
          return 'Walk to Station';
        }
        if (seg.to?.toLowerCase().includes('work') || seg.to === 'WORK') {
          return 'Walk to Office';
        }
        return `Walk to ${seg.to || 'destination'}`;
      case 'coffee':
        return 'GET COFFEE';
      case 'tram':
        return seg.route ? `Tram ${seg.route}` : 'Tram';
      case 'train':
        return seg.line ? `${seg.line} Line` : 'Train';
      case 'bus':
        return seg.route ? `Bus ${seg.route}` : 'Bus';
      default:
        return cap(type);
    }
  }

  /**
   * Format segment subtitle from preferredRoute.segments format
   */
  formatSegmentSubtitle(seg) {
    const type = seg.type || 'walk';
    
    switch (type) {
      case 'walk':
        return `${seg.minutes || 5} min walk`;
      case 'coffee':
        return '[Coffee] TIME FOR COFFEE';
      case 'tram':
      case 'train':
      case 'bus':
        if (seg.from && seg.to) {
          return `${seg.from} → ${seg.to}`;
        }
        return seg.to ? `To ${seg.to}` : '';
      default:
        return seg.minutes ? `${seg.minutes} min` : '';
    }
  }

  /**
   * Get mode type string from numeric type
   */
  getModeType(type) {
    const types = { 0: 'train', 1: 'tram', 2: 'bus', 3: 'train', 4: 'ferry', 5: 'lightrail' };
    return types[type] || 'transit';
  }

  /**
   * Get device list
   */
  static getDeviceList() {
    return Object.entries(DEVICE_CONFIGS).map(([id, config]) => ({
      id,
      name: config.name,
      width: config.width,
      height: config.height,
      orientation: config.orientation,
      dpi: config.dpi,
      colors: config.colors
    }));
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      device: this.currentDevice,
      deviceConfig: {
        name: this.deviceConfig.name,
        width: this.deviceConfig.width,
        height: this.deviceConfig.height,
        orientation: this.deviceConfig.orientation
      },
      commuteCompute: this.commuteCompute?.getStatus(),
      autoRefresh: this.autoRefresh,
      refreshIntervalMs: this.refreshIntervalMs
    };
  }
}

export default LiveDash;
