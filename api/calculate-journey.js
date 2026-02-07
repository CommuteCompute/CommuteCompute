/**
 * Calculate Journey API Endpoint
 * 
 * Calculates a journey using CommuteCompute engine and returns
 * journey legs in CCDash-compatible format.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { CommuteCompute } from '../src/engines/commute-compute.js';
import { getTransitApiKey } from '../src/data/kv-preferences.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const params = req.method === 'POST' ? req.body : req.query;
    
    const {
      home,
      work,
      cafe,
      arrivalTime = '09:00',
      includesCoffee = true
    } = params;

    // Get API key
    let apiKey = null;
    try { apiKey = await getTransitApiKey(); } catch (e) {}

    // Build preferences
    const preferences = {
      homeAddress: home,
      workAddress: work,
      coffeeAddress: cafe,
      arrivalTime,
      coffeeEnabled: includesCoffee !== false && includesCoffee !== 'false',
      api: { key: apiKey },
      transitApiKey: apiKey
    };

    // Initialize engine
    const engine = new CommuteCompute(preferences);
    await engine.initialize();

    // Get journey recommendation
    const result = await engine.getJourneyRecommendation({ forceRefresh: false });

    // Build journey legs
    const legs = [];
    const transit = result.transit || {};
    const trains = transit.trains || [];
    const trams = transit.trams || [];

    // Walk to station or cafe
    if (preferences.coffeeEnabled && cafe) {
      legs.push({
        mode: 'walk',
        description: 'Walk to cafe',
        duration: '5 min',
        time: ''
      });
      legs.push({
        mode: 'coffee',
        description: 'Get coffee',
        duration: '5 min',
        time: ''
      });
      legs.push({
        mode: 'walk',
        description: 'Walk to station',
        duration: '2 min',
        time: ''
      });
    } else {
      legs.push({
        mode: 'walk',
        description: 'Walk to station',
        duration: '5 min',
        time: ''
      });
    }

    // Transit
    const nextDeparture = trains[0] || trams[0];
    if (nextDeparture) {
      const mode = trains[0] ? 'train' : 'tram';
      legs.push({
        mode,
        description: `${mode === 'train' ? 'Train' : 'Tram'} to ${nextDeparture.destination || 'City'}`,
        duration: `${nextDeparture.minutes} min wait + ~15 min ride`,
        time: `Departs in ${nextDeparture.minutes} min`
      });
    } else {
      legs.push({
        mode: 'transit',
        description: 'Take transit',
        duration: 'Check timetable',
        time: ''
      });
    }

    // Final walk
    legs.push({
      mode: 'walk',
      description: 'Walk to work',
      duration: '5 min',
      time: ''
    });

    return res.status(200).json({
      success: true,
      journey: {
        legs,
        totalMinutes: legs.reduce((sum, l) => {
          const match = l.duration?.match(/(\d+)/);
          return sum + (match ? parseInt(match[1]) : 0);
        }, 0)
      },
      coffee: result.coffee,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      error: error.message,
      journey: null,
      timestamp: new Date().toISOString()
    });
  }
}
