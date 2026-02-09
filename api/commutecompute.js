/**
 * CommuteCompute API Endpoint - CCDash Compatible Output
 * 
 * Returns CommuteCompute engine output in CCDash-compatible format
 * for 1-bit black and white e-ink rendering.
 * 
 * Output format matches CCDashRenderer expectations:
 * - journey_legs[]: {type, title, subtitle, minutes, state}
 * - status_bar: {text, icon, hasDisruption}
 * - coffee: {canGet, subtext}
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { CommuteCompute } from '../src/engines/commute-compute.js';
import { getTransitApiKey } from '../src/data/kv-preferences.js';
import CafeBusyDetector from '../src/services/cafe-busy-detector.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const STATE_TIMEZONES = {
    'VIC': 'Australia/Melbourne', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney',
    'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth',
    'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin'
  };
  const now = new Date();

  try {
    const params = req.method === 'POST' ? req.body : req.query;
    
    const {
      home, work, cafe,
      arrivalTime = '09:00',
      state = 'VIC',
      coffeeEnabled = true,
      forceRefresh = false,
      walkingTimes = {},
      coffee = {},
      modes = {},
      advanced = {}
    } = params;

    // Location-agnostic timezone (per Development Rules Section 4)
    const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
    const melbourneNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    // Get API key
    let apiKey = null;
    try { apiKey = await getTransitApiKey(); } catch (e) {}
    if (!apiKey && params.apiKey) apiKey = params.apiKey;

    // Build preferences
    const preferences = {
      homeAddress: home,
      workAddress: work,
      coffeeAddress: cafe,
      arrivalTime, state,
      coffeeEnabled: coffeeEnabled !== false && coffeeEnabled !== 'false',
      homeToStop: walkingTimes.homeToStop || 5,
      homeToCafe: walkingTimes.homeToCafe || 5,
      cafeToTransit: walkingTimes.cafeToStop || 2,
      walkToWork: walkingTimes.stopToWork || 5,
      cafeDuration: coffee.duration || 5,
      coffeeBuffer: coffee.buffer || 3,
      coffeePosition: coffee.position || 'auto',
      preferTrain: modes.train !== false,
      preferTram: modes.tram !== false,
      preferBus: modes.bus || false,
      minimizeWalking: modes.minimizeWalking !== false,
      multiModal: modes.multiModal || 'allow',
      walkingSpeed: advanced.walkingSpeed || 80,
      maxWalkingDistance: advanced.maxWalkingDistance || 600,
      api: { key: apiKey },
      transitApiKey: apiKey
    };

    // Initialize engine
    const engine = new CommuteCompute(preferences);
    await engine.initialize();

    // Get live transit data
    const result = await engine.getJourneyRecommendation({ forceRefresh });

    // Check cafe hours FIRST (before building legs)
    const hour = melbourneNow.getHours();
    const dayOfWeek = melbourneNow.getDay(); // 0 = Sunday
    const cafeOpenHour = coffee?.openHour || 6;
    const cafeCloseHour = coffee?.closeHour || 17;
    const cafeOpenDays = coffee?.openDays || [1, 2, 3, 4, 5, 6]; // Mon-Sat default
    const cafeIsOpen = cafeOpenDays.includes(dayOfWeek) && hour >= cafeOpenHour && hour < cafeCloseHour;
    
    // Override coffee decision if cafe is closed
    let coffeeDecision = result.coffee || {};
    if (!cafeIsOpen && cafe) {
      coffeeDecision = {
        canGet: false,
        cafeClosed: true,
        decision: 'CLOSED',
        subtext: 'Cafe not open',
        urgent: false
      };
    }

    // Build CCDash-compatible journey_legs
    const journeyLegs = buildCCDashLegs(result, preferences, melbourneNow, result.route);

    // Build status bar text (matches CCDash status bar format)
    const statusBar = buildStatusBar(result, journeyLegs, preferences, melbourneNow);

    // Calculate times
    const totalMinutes = journeyLegs.reduce((sum, leg) => sum + (leg.minutes || 0), 0);
    const arriveTime = addMinutes(melbourneNow, totalMinutes);

    // Check if on time for target arrival
    const [targetH, targetM] = (arrivalTime || '09:00').split(':').map(Number);
    const targetArrival = new Date(melbourneNow);
    targetArrival.setHours(targetH, targetM, 0, 0);
    const arrivalDiff = Math.round((arriveTime - targetArrival) / 60000);

    const response = {
      success: true,
      timestamp: now.toISOString(),
      
      // Current time in Melbourne (12-hour format per dev rules)
      current_time: formatTime12h(melbourneNow),
      current_time_24h: formatTime24h(melbourneNow),
      
      // CCDash-compatible journey legs (1-bit render ready)
      journey_legs: journeyLegs,
      
      // Status bar (matches CCDash status bar)
      status_bar: statusBar,
      
      // Coffee decision (respects cafe hours)
      coffee: {
        canGet: coffeeDecision.canGet ?? false,
        cafeClosed: coffeeDecision.cafeClosed || false,
        subtext: coffeeDecision.subtext || coffeeDecision.reason || '',
        urgent: coffeeDecision.urgent ?? false
      },
      
      // Journey summary
      summary: {
        leaveNow: formatTime12h(melbourneNow),
        arriveAt: formatTime12h(arriveTime),
        totalMinutes,
        onTime: arrivalDiff <= 5,
        diffMinutes: arrivalDiff,
        status: arrivalDiff > 5 ? 'late' : arrivalDiff < -10 ? 'early' : 'on-time'
      },
      
      // Next departure info
      nextDeparture: getNextDeparture(result.transit, melbourneNow),
      
      // Weather (for header)
      weather: result.weather ? {
        temp: result.weather.temp,
        condition: result.weather.condition,
        icon: result.weather.icon,
        umbrella: result.weather.umbrella
      } : null,
      
      // Footer data
      footer: {
        destination: shortenAddress(work) || 'WORK',
        arriveTime: formatTime12h(arriveTime)
      },
      
      // State info
      state: result.state,
      fallbackMode: result.fallbackMode,
      
      // Raw data for debugging
      raw: {
        route: result.route,
        transit: result.transit,
        engineStatus: engine.getStatus()
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      fallbackMode: true,
      current_time: '--:--',
      journey_legs: [],
      status_bar: { text: 'ERROR', icon: '[!]', hasDisruption: true },
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Build CCDash-compatible journey legs
 * Format: {type, title, subtitle, minutes, state}
 *
 * Honors coffeePosition preference:
 * - 'auto': CommuteCompute decides based on timing
 * - 'before': Always include coffee before transit (if cafe configured)
 * - 'after': Coffee after transit (not yet implemented - falls back to auto)
 * - 'never': Never include coffee stop
 */
function buildCCDashLegs(result, prefs, now, route = null) {
  const legs = [];
  const transit = result.transit || {};
  const trains = transit.trains || [];
  const trams = transit.trams || [];

  // Extract stop/station names from route legs if available
  const routeLegs = route?.legs || [];
  const tramStopName = routeLegs.find(l => l.type === 'tram')?.origin?.name || 
                       routeLegs.find(l => l.stopName)?.stopName || 
                       prefs.tramStopName || 'Tram Stop';
  const trainStationName = routeLegs.find(l => l.type === 'train')?.origin?.name ||
                           routeLegs.find(l => l.stationName)?.stationName ||
                           prefs.trainStationName || 'Station';

  // Honor coffeePosition preference
  const coffeePosition = prefs.coffeePosition || 'auto';
  const coffeeNeverEnabled = coffeePosition === 'never';
  const coffeeAlwaysBefore = coffeePosition === 'before';

  // Check if cafe is open (basic hours check)
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const cafeOpenHour = prefs.cafeOpenHour || 6;
  const cafeCloseHour = prefs.cafeCloseHour || 17; // Default close 5pm
  const cafeOpenDays = prefs.cafeOpenDays || [1, 2, 3, 4, 5, 6]; // Default Mon-Sat
  const cafeIsOpen = cafeOpenDays.includes(dayOfWeek) && hour >= cafeOpenHour && hour < cafeCloseHour;

  // Get cafe busyness - automatically calculated based on time of day
  // Peak times: Morning Rush (7-9am), Lunch Rush (12-2pm), Afternoon Peak (4-5pm)
  const busyDetector = new CafeBusyDetector(prefs);
  const cafeBusyness = busyDetector.getTimeBasedBusyness();
  const busyLabel = cafeBusyness.level === 'high' ? 'Busy' : cafeBusyness.level === 'medium' ? 'Moderate' : 'Quiet';
  const coffeeWaitTime = cafeBusyness.coffeeTime || 3;

  const coffeeEnabled = !coffeeNeverEnabled && prefs.coffeeEnabled && prefs.coffeeAddress && cafeIsOpen;

  // Determine if we have time for coffee
  const homeToCafe = prefs.homeToCafe || 5;
  const coffeeDuration = prefs.cafeDuration || 5;
  const cafeToStop = prefs.cafeToTransit || 2;
  const homeToStop = prefs.homeToStop || 5;
  const coffeeBuffer = prefs.coffeeBuffer || 3;
  const totalCoffeeTime = homeToCafe + coffeeDuration + cafeToStop;

  // Find next usable departure
  const allDepartures = [...trains, ...trams].sort((a, b) => a.minutes - b.minutes);
  const directDeparture = allDepartures.find(d => d.minutes >= homeToStop + 1);
  const coffeeDeparture = allDepartures.find(d => d.minutes >= totalCoffeeTime + coffeeBuffer);

  // Determine if coffee is possible/wanted based on position preference
  let canGetCoffee = false;
  if (coffeeAlwaysBefore && coffeeEnabled) {
    // Force coffee if configured to always have it before transit
    canGetCoffee = coffeeDeparture != null;
  } else if (coffeeEnabled) {
    // Auto mode: check if timing allows
    canGetCoffee = coffeeDeparture &&
      (!directDeparture || (coffeeDeparture.minutes - directDeparture.minutes) <= 10);
  }
  
  if (canGetCoffee && coffeeEnabled) {
    // Route with coffee - V13 Spec Section 5.5
    legs.push({
      type: 'walk',
      title: 'Walk to Cafe',
      to: 'cafe',
      subtitle: `From home`,
      isFirst: true,
      minutes: homeToCafe,
      state: 'normal'
    });
    
    legs.push({
      type: 'coffee',
      title: 'Coffee Stop',
      location: shortenAddress(prefs.coffeeAddress) || 'Cafe',
      subtitle: `[OK] ${busyLabel} • ~${coffeeWaitTime}m wait`,
      minutes: coffeeDuration,
      canGet: true,
      busyness: cafeBusyness.level,
      coffeeWaitTime,
      state: 'normal'
    });
    
    // Determine which stop we're walking to (tram or train)
    const walkingToTram = trams.length > 0 && (trams[0]?.minutes || 99) <= (trains[0]?.minutes || 99);
    const stopName = walkingToTram ? tramStopName : trainStationName;
    
    legs.push({
      type: 'walk',
      title: `Walk to ${stopName}`,
      to: stopName,
      subtitle: `${cafeToStop} min walk`,
      minutes: cafeToStop,
      state: 'normal'
    });
  } else if (prefs.coffeeEnabled && prefs.coffeeAddress && !cafeIsOpen) {
    // Cafe is closed - show skip with reason
    const walkingToTram = trams.length > 0 && (trams[0]?.minutes || 99) <= (trains[0]?.minutes || 99);
    const stopName = walkingToTram ? tramStopName : trainStationName;
    
    legs.push({
      type: 'walk',
      title: `Walk to ${stopName}`,
      to: stopName,
      subtitle: 'From home',
      isFirst: true,
      minutes: homeToStop,
      state: 'normal'
    });
    
    legs.push({
      type: 'coffee',
      title: 'Coffee Stop',
      location: shortenAddress(prefs.coffeeAddress) || 'Cafe',
      subtitle: '[X] CLOSED -- Cafe not open',
      minutes: 0,
      canGet: false,
      state: 'closed'
    });
  } else if (prefs.coffeeEnabled && prefs.coffeeAddress && !canGetCoffee) {
    // Skip coffee - V13 Spec Section 5.1.3
    const walkingToTram = trams.length > 0 && (trams[0]?.minutes || 99) <= (trains[0]?.minutes || 99);
    const stopName = walkingToTram ? tramStopName : trainStationName;
    
    legs.push({
      type: 'walk',
      title: `Walk to ${stopName}`,
      to: stopName,
      subtitle: 'From home',
      isFirst: true,
      minutes: homeToStop,
      state: 'normal'
    });
    
    legs.push({
      type: 'coffee',
      title: 'Coffee Stop',
      location: shortenAddress(prefs.coffeeAddress) || 'Cafe',
      subtitle: '[X] SKIP -- Running late',
      minutes: 0,
      canGet: false,
      state: 'skip'
    });
  } else {
    // No coffee configured
    const walkingToTram = trams.length > 0 && (trams[0]?.minutes || 99) <= (trains[0]?.minutes || 99);
    const stopName = walkingToTram ? tramStopName : trainStationName;
    
    legs.push({
      type: 'walk',
      title: `Walk to ${stopName}`,
      to: stopName,
      subtitle: 'From home',
      isFirst: true,
      minutes: homeToStop,
      state: 'normal'
    });
  }
  
  // Transit leg
  const primaryDeparture = canGetCoffee ? coffeeDeparture : directDeparture;
  if (primaryDeparture) {
    const isTrainDep = trains.includes(primaryDeparture);
    const type = isTrainDep ? 'train' : 'tram';
    const dest = primaryDeparture.destination || 'City';
    const originStopName = isTrainDep ? trainStationName : tramStopName;
    
    // Calculate wait time
    const walkTime = canGetCoffee ? totalCoffeeTime : homeToStop;
    const waitMinutes = Math.max(0, primaryDeparture.minutes - walkTime);
    
    if (waitMinutes > 2) {
      legs.push({
        type: 'wait',
        title: `Wait at ${originStopName}`,
        subtitle: `${waitMinutes} min until departure`,
        minutes: waitMinutes,
        state: 'normal'
      });
    }
    
    // Build V13 spec subtitle: "[Stop name] • Next: X, Y min"
    const relevantDepartures = isTrainDep ? trains : trams;
    const nextTimes = relevantDepartures.slice(0, 2).map(d => d.minutes);
    // Store absolute departure times for live countdown in renderer
    const nextDepartureTimesMs = relevantDepartures.slice(0, 2).map(d => d.departureTimeMs).filter(Boolean);
    let transitSubtitle = originStopName;
    if (nextTimes.length >= 2) {
      transitSubtitle += ` • Next: ${nextTimes[0]}, ${nextTimes[1]} min`;
    } else if (nextTimes.length === 1) {
      transitSubtitle += ` • Next: ${nextTimes[0]} min`;
    } else if (primaryDeparture.platform) {
      transitSubtitle += ` • Platform ${primaryDeparture.platform}`;
    }
    
    legs.push({
      type,
      title: `${type === 'train' ? 'Train' : 'Tram'} → ${dest}`,
      to: dest,
      destination: { name: dest },
      subtitle: transitSubtitle || `Departs ${primaryDeparture.minutes} min`,
      nextDepartures: nextTimes,
      nextDepartureTimesMs, // Absolute times for live countdown
      platform: primaryDeparture.platform,
      minutes: type === 'train' ? 15 : 20, // Estimated ride time
      state: primaryDeparture.isDelayed ? 'delayed' : 'normal'
    });
  } else {
    // Fallback transit
    legs.push({
      type: 'transit',
      title: 'Take Transit',
      subtitle: 'Check timetable',
      minutes: 20,
      state: 'normal'
    });
  }
  
  // Final walk to work - V13 Spec Section 5.5
  legs.push({
    type: 'walk',
    title: 'Walk to Work',
    to: 'work',
    subtitle: shortenAddress(prefs.workAddress) || 'Destination',
    minutes: prefs.walkToWork || 5,
    state: 'normal'
  });
  
  return legs;
}

/**
 * Build CCDash status bar
 */
function buildStatusBar(result, legs, prefs, now) {
  const coffee = result.coffee;
  const transit = result.transit;
  
  // Check for disruptions
  const hasDisruption = transit?.alerts?.length > 0 || 
    legs.some(l => l.state === 'cancelled' || l.state === 'delayed');
  
  // Calculate arrival
  const totalMinutes = legs.reduce((sum, leg) => sum + (leg.minutes || 0), 0);
  const arriveTime = addMinutes(now, totalMinutes);
  const arriveStr = formatTime12h(arriveTime);
  
  if (hasDisruption) {
    return {
      text: `DISRUPTION → Arrive ${arriveStr}`,
      icon: '[!]',
      hasDisruption: true
    };
  }
  
  if (coffee?.urgent) {
    return {
      text: `LEAVE NOW → Arrive ${arriveStr}`,
      icon: '[WARNING]',
      hasDisruption: false
    };
  }
  
  if (coffee?.canGet) {
    return {
      text: `[Coffee] COFFEE TIME → Arrive ${arriveStr}`,
      icon: '[Coffee]',
      hasDisruption: false
    };
  }
  
  return {
    text: `LEAVE NOW → Arrive ${arriveStr}`,
    icon: '',
    hasDisruption: false
  };
}

/**
 * Get next departure info
 */
function getNextDeparture(transit, now) {
  if (!transit) return null;
  
  const trains = transit.trains || [];
  const trams = transit.trams || [];
  const next = [...trains, ...trams].sort((a, b) => a.minutes - b.minutes)[0];
  
  if (!next) return null;
  
  return {
    mode: trains.includes(next) ? 'train' : 'tram',
    minutes: next.minutes,
    destination: next.destination || 'City',
    platform: next.platform,
    departureTime: formatTime12h(addMinutes(now, next.minutes)),
    isLive: next.source === 'live'
  };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function formatTime12h(date) {
  if (!date) return '--:--';
  const d = date instanceof Date ? date : new Date(date);
  // Per dev rules 12.2: 12-hour format with am/pm
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

function formatTime24h(date) {
  if (!date) return '--:--';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortenAddress(addr) {
  if (!addr) return '';
  if (typeof addr !== 'string') return '';
  return addr.split(',')[0].trim();
}
