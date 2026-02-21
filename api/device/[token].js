/**
 * Device Webhook Endpoint
 * Decodes config token from URL and returns dashboard image/data
 *
 * Also reads CommuteCompute settings from KV if available to apply
 * user's walking times, coffee position, and mode preferences.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import LiveDash from '../../src/services/livedash.js';
import { getPreferences } from '../../src/data/kv-preferences.js';
import { renderFullScreenBMP } from '../../src/services/ccdash-renderer.js';

/**
 * Decode config token back to config object
 */
function decodeConfigToken(token) {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    const minified = JSON.parse(json);
    
    return {
      addresses: minified.a || {},
      journey: {
        transitRoute: minified.j || {},
        arrivalTime: minified.t || '09:00',
        coffeeEnabled: minified.c !== false
      },
      locations: minified.l || {},
      state: minified.s || 'VIC',
      api: {
        key: minified.k || ''
      },
      cafe: minified.cf || null,
      apiMode: minified.m || 'cached'
    };
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'No config token provided' });
    }

    // Decode the config token
    const config = decodeConfigToken(token);
    
    if (!config) {
      return res.status(400).json({ error: 'Invalid config token' });
    }

    // Get format from query or default to image
    const format = req.query.format || 'image';
    const device = req.query.device || 'trmnl-og';

    // Try to load CommuteCompute settings from KV (user's saved preferences)
    let kvPrefs = null;
    try {
      kvPrefs = await getPreferences();
    } catch (e) {
    }

    // Extract CommuteCompute settings from KV preferences
    const scSettings = kvPrefs?.commutecompute || {};

    // Transform config to CommuteCompute preferences format
    const apiKey = config.api?.key;
    const preferences = {
      homeAddress: config.addresses?.home,
      homeLocation: config.locations?.home,
      workAddress: config.addresses?.work,
      workLocation: config.locations?.work,
      cafeLocation: config.cafe || config.locations?.cafe,
      coffeeAddress: config.addresses?.cafe,
      targetArrival: config.journey?.arrivalTime,
      arrivalTime: config.journey?.arrivalTime,
      coffeeEnabled: config.journey?.coffeeEnabled,
      preferCoffee: config.journey?.coffeeEnabled,
      preferredRoute: config.journey?.transitRoute,
      apiMode: config.apiMode,
      state: config.state || 'VIC',
      // CommuteCompute settings from KV (or defaults)
      homeToStop: scSettings.homeToStop || 5,
      homeToCafe: scSettings.homeToCafe || 5,
      cafeToTransit: scSettings.cafeToStop || 2,
      walkToWork: scSettings.stopToWork || 5,
      cafeDuration: scSettings.coffeeDuration || 5,
      coffeeBuffer: scSettings.bufferTime || 3,
      coffeePosition: scSettings.coffeePosition || 'auto',
      preferTrain: scSettings.preferTrain !== false,
      preferTram: scSettings.preferTram !== false,
      preferBus: scSettings.preferBus || false,
      minimizeWalking: scSettings.minimizeWalking !== false,
      walkingSpeed: scSettings.walkingSpeed || 80,
      maxWalkingDistance: scSettings.maxWalk || 600,
      // API keys in format expected by CommuteCompute engine
      api: {
        key: apiKey
      },
      transitApiKey: apiKey
    };
    
    // Initialize LiveDash with the config
    const liveDash = new LiveDash();
    await liveDash.initialize(preferences);
    liveDash.setDevice(device);

    if (format === 'json') {
      // Return JSON data
      const journeyData = await liveDash.commuteCompute.getJourneyRecommendation({});
      const result = {
        status: 'ok',
        config: {
          home: config.addresses?.home,
          work: config.addresses?.work,
          arrivalTime: config.journey?.arrivalTime
        },
        journey: journeyData
      };
      
      // Include debug info if requested (no key fragments per Section 17)
      if (req.query.debug === '1') {
        result.debug = {
          hasApiKey: !!apiKey,
          fallbackMode: liveDash.commuteCompute.fallbackMode,
          state: liveDash.commuteCompute.state,
          hasTransitKey: !!liveDash.commuteCompute.apiKeys?.transitKey
        };
      }
      
      return res.json(result);
    }

    // Render dashboard image
    if (format === 'bmp') {
      // BMP format for e-ink devices - use buildJourneyForDisplay() for live data
      const journeyRec = await liveDash.commuteCompute.getJourneyRecommendation({});
      const transitData = journeyRec?.transit || { trains: [], trams: [], buses: [] };
      const weatherData = journeyRec?.weather || null;
      const displayData = await liveDash.commuteCompute.buildJourneyForDisplay(transitData, weatherData);

      // Map display legs to renderer format
      let journeyLegs = (displayData?.legs || []).map((leg, idx) => ({
        number: idx + 1,
        type: leg.type || 'walk',
        title: leg.title || leg.description || '',
        subtitle: leg.subtitle || '',
        minutes: leg.duration || leg.minutes || leg.durationMinutes || 0,
        state: leg.status === 'delayed' ? 'delayed' :
               leg.status === 'skipped' ? 'skip' : 'normal',
        canGet: leg.type === 'coffee' ? leg.canGet !== false : undefined
      }));

      // Informational fallback if no journey data configured
      if (journeyLegs.length === 0) {
        journeyLegs = [
          { number: 1, type: 'walk', title: 'No journey data', subtitle: 'Configure via Setup Wizard', minutes: 0, state: 'normal' }
        ];
      }

      const dashboardData = {
        location: displayData?.location || preferences.homeAddress || 'Home',
        current_time: displayData?.current_time || '',
        day: displayData?.day || '',
        date: displayData?.date || '',
        temp: displayData?.temp ?? weatherData?.temp ?? '--',
        condition: displayData?.condition || weatherData?.condition || 'N/A',
        umbrella: weatherData?.umbrella || false,
        status_type: journeyRec?.status || 'normal',
        arrive_by: displayData?.arrive_by || preferences.arrivalTime || '09:00',
        total_minutes: displayData?.total_minutes || 30,
        leave_in_minutes: journeyRec?.leaveIn || null,
        journey_legs: journeyLegs,
        destination: displayData?.destination || preferences.workAddress || 'Work'
      };

      const bmpBuffer = renderFullScreenBMP(dashboardData);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', bmpBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=20');
      return res.send(bmpBuffer);
    }

    // Default: return PNG image
    const imageBuffer = await liveDash.render({ format: 'png' });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=20');
    return res.send(imageBuffer);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
