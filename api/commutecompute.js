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
import { getTransitApiKey, getPreferences } from '../src/data/kv-preferences.js';
import CafeBusyDetector from '../src/services/cafe-busy-detector.js';
import DepartureConfidence from '../src/engines/departure-confidence.js';
import LifestyleContext from '../src/engines/lifestyle-context.js';
import AltTransit from '../src/engines/alt-transit.js';
import SleepOptimiser from '../src/engines/sleep-optimiser.js';
import { getStopNameById, detectStopIdsFromAddress } from '../src/data/gtfs-stop-names.js';
import { getDepartures } from '../src/services/opendata-client.js';

/**
 * Retry wrapper for GTFS-RT fetches — single retry with exponential backoff.
 * Returns [] on exhaustion so Promise.all() never rejects.
 */
async function fetchWithRetry(fetchFn, label, retries = 1, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (e) {
      if (attempt < retries) {
        console.warn(`[${label}] Fetch attempt ${attempt + 1} failed: ${e.message} — retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else {
        console.error(`[${label}] All ${retries + 1} fetch attempts failed: ${e.message}`);
        return [];
      }
    }
  }
}

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
      advanced = {},
      selectedRouteIndex,
      selectedRouteId
    } = params;

    // Location-agnostic timezone (per Development Rules Section 4)
    const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
    const melbourneNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    // Get API key
    let apiKey = null;
    try { apiKey = await getTransitApiKey(); } catch (e) {}
    if (!apiKey && params.apiKey) apiKey = params.apiKey;

    // Get stop IDs from KV storage (user-configured) + auto-detect from address
    const kvPrefs = await getPreferences();
    let trainStopId = kvPrefs?.trainStopId || null;
    let tramStopId = kvPrefs?.tramStopId || null;
    let busStopId = kvPrefs?.busStopId || null;

    let detectedTramRoute = null;
    if (!trainStopId || !tramStopId || !busStopId) {
      const detected = detectStopIdsFromAddress(home);
      if (!trainStopId && detected.trainStopId) trainStopId = detected.trainStopId;
      if (!tramStopId && detected.tramStopId) tramStopId = detected.tramStopId;
      if (!busStopId && detected.busStopId) busStopId = detected.busStopId;
      detectedTramRoute = detected.tramRouteNumber || null;
    }

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
      trainStopId,
      tramStopId,
      busStopId,
      api: { key: apiKey },
      transitApiKey: apiKey
    };

    // Initialize engine
    const engine = new CommuteCompute(preferences);
    await engine.initialize();

    // Apply user's selected route if provided
    if (selectedRouteId !== undefined) {
      engine.selectRoute(selectedRouteId);
    } else if (selectedRouteIndex !== undefined) {
      engine.selectRoute(parseInt(selectedRouteIndex));
    }

    // Get live transit data
    const result = await engine.getJourneyRecommendation({ forceRefresh });

    // Direct departure fetch if engine returned no transit data but we have stop IDs
    const selectedRoute = engine.getSelectedRoute();
    const activeRoute = selectedRoute || result.route;
    const engineTransit = result.transit || {};
    let directTrains = engineTransit.trains || [];
    let directTrams = engineTransit.trams || [];
    let directBuses = engineTransit.buses || [];

    // Respect Free Mode: skip GTFS-RT when user explicitly selected cached mode
    const ccApiMode = kvPrefs?.apiMode || 'live';
    const ccSkipLive = ccApiMode === 'cached';

    if (!ccSkipLive && directTrains.length === 0 && directTrams.length === 0 && directBuses.length === 0 &&
        (trainStopId || tramStopId || busStopId)) {
      const apiOptions = apiKey ? { apiKey } : {};
      const tramRouteNum = activeRoute?.legs?.find(l => l.type === 'tram')?.routeNumber || detectedTramRoute;
      const tramApiOptions = { ...apiOptions };
      if (tramRouteNum) tramApiOptions.routeNumber = tramRouteNum;

      [directTrains, directTrams, directBuses] = await Promise.all([
        fetchWithRetry(() => getDepartures(trainStopId, 0, apiOptions), 'cc-train'),
        fetchWithRetry(() => getDepartures(tramStopId, 1, tramApiOptions), 'cc-tram'),
        fetchWithRetry(() => getDepartures(busStopId, 2, apiOptions), 'cc-bus')
      ]);
      result.transit = {
        ...engineTransit,
        trains: directTrains,
        trams: directTrams,
        buses: directBuses
      };
    }

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

    // Build CCDash-compatible journey_legs (use selected route if available)
    const journeyLegs = buildCCDashLegs(result, preferences, melbourneNow, activeRoute);

    // Build status bar text (matches CCDash status bar format)
    const statusBar = buildStatusBar(result, journeyLegs, preferences, melbourneNow);

    // Calculate times using journeyContribution (includes wait + transit, matching e-ink)
    const totalMinutes = journeyLegs.reduce((sum, leg) => sum + (leg.journeyContribution || leg.minutes || 0), 0);
    const arriveTime = addMinutes(melbourneNow, totalMinutes);

    // Check if on time for target arrival
    const [targetH, targetM] = (arrivalTime || '09:00').split(':').map(Number);
    const targetArrival = new Date(melbourneNow);
    targetArrival.setHours(targetH, targetM, 0, 0);
    const arrivalDiff = Math.round((arriveTime - targetArrival) / 60000);

    // V15.0: Analytics engines for admin dashboard
    // FIX-2a: Compute hasAnyLiveData from transit sources for DepartureConfidence context
    const hasAnyLiveData = ['trains', 'trams', 'buses'].some(mode =>
      (result.transit?.[mode] || []).some(t =>
        (t.source === 'gtfs-rt' || t.source === 'gtfs-rt-route' || t.source === 'gtfs-rt-broad') && t.isLive === true
      )
    );
    const confidenceEngine = new DepartureConfidence();
    const confidence = confidenceEngine.calculate({
      legs: journeyLegs,
      transitData: result.transit || {},
      weather: result.weather,
      coffeeDecision,
      totalMinutes,
      targetArrivalMins: targetH * 60 + targetM,
      currentMins: melbourneNow.getHours() * 60 + melbourneNow.getMinutes(),
      hasLiveData: hasAnyLiveData
    });

    const lifestyleEngine = new LifestyleContext();
    const lifestyle = lifestyleEngine.calculate({
      weather: result.weather,
      currentTime: now,
      state: state || 'VIC',
      localHour: melbourneNow.getHours(),
      localMinute: melbourneNow.getMinutes()
    });

    // V15.0: Alternative Transit - rideshare/bike/scooter costs when transit disrupted
    const hasActiveTransit = journeyLegs.some(l => ['train', 'tram', 'bus'].includes(l.type));
    const hasDisruptedTransit = journeyLegs.some(l =>
      ['train', 'tram', 'bus'].includes(l.type) &&
      ['delayed', 'cancelled', 'suspended'].includes(l.state)
    );
    const cannotArriveOnTime = confidence.label === 'UNLIKELY';
    const showAltTransit = !hasActiveTransit || hasDisruptedTransit || cannotArriveOnTime;
    // V15.0 FIX: Pass actual total journey minutes (not just walk) for distance estimation
    // AltTransit uses totalWalkMins to estimate the full home→work distance
    const altTransitEngine = new AltTransit();
    const altTransit = altTransitEngine.calculate({
      totalWalkMins: totalMinutes,
      currentTime: now,
      transitNotice: showAltTransit ? 'TRANSIT DISRUPTED' : null,
      legs: journeyLegs,
      localHour: melbourneNow.getHours()
    });

    // V15.0: Sleep Optimizer for evening dashboard
    const sleepEngine = new SleepOptimiser();
    const sleep = sleepEngine.calculate({
      targetArrivalMins: targetH * 60 + targetM,
      totalJourneyMins: totalMinutes,
      currentTime: now,
      localHour: melbourneNow.getHours(),
      localMinute: melbourneNow.getMinutes()
    });

    // V15.0: Lifestyle Mindset - stress, steps, apparent temperature
    const mindset = lifestyleEngine.calculateMindset({
      legs: journeyLegs,
      weather: result.weather || {},
      totalWalkMins: journeyLegs.filter(l => l.type === 'walk').reduce((sum, l) => sum + (l.minutes || 0), 0),
      disruptionCount: journeyLegs.filter(l => l.state === 'suspended' || l.state === 'cancelled' || l.hasAlert).length,
      transferCount: journeyLegs.filter(l => ['train', 'tram', 'bus'].includes(l.type)).length
    });

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

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
      
      // Coffee decision (respects cafe hours + matches journey_legs coffee state)
      coffee: {
        canGet: coffeeDecision.canGet ?? false,
        cafeClosed: coffeeDecision.cafeClosed || false,
        decision: coffeeDecision.decision || (coffeeDecision.canGet ? 'OK' : 'SKIP'),
        subtext: coffeeDecision.subtext || coffeeDecision.reason || '',
        urgent: coffeeDecision.urgent ?? false,
        skipCafe: result.skipCafe || false,
        skipReason: result.skipReason || coffeeDecision.reason || ''
      },
      
      // Journey summary (with evening/off-peak detection)
      summary: (() => {
        const currentMins = melbourneNow.getHours() * 60 + melbourneNow.getMinutes();
        const targetMins = targetH * 60 + targetM;
        const isEvening = currentMins > targetMins + 120;

        if (isEvening) {
          // Evening mode: show next morning's departure time
          const leaveAtMins = targetMins - totalMinutes;
          const leaveH = Math.floor(((leaveAtMins % 1440) + 1440) % 1440 / 60);
          const leaveM = ((leaveAtMins % 1440) + 1440) % 1440 % 60;
          const nextLeave = new Date(melbourneNow);
          nextLeave.setDate(nextLeave.getDate() + 1);
          nextLeave.setHours(leaveH, leaveM, 0, 0);
          return {
            leaveNow: formatTime12h(nextLeave),
            arriveAt: arrivalTime,
            totalMinutes,
            onTime: true,
            diffMinutes: 0,
            status: 'off-peak',
            isEvening: true,
            nextMorningLeave: formatTime12h(nextLeave),
            alarmTime: sleep.alarmTime || formatTime12h(nextLeave)
          };
        }

        return {
          leaveNow: formatTime12h(melbourneNow),
          arriveAt: formatTime12h(arriveTime),
          totalMinutes,
          onTime: arrivalDiff <= 5,
          diffMinutes: arrivalDiff,
          status: arrivalDiff > 5 ? 'late' : arrivalDiff < -10 ? 'early' : 'on-time'
        };
      })(),
      
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

      // V15.0: Analytics for admin dashboard
      confidence_score: confidence.score,
      confidence_label: confidence.label,
      confidence_resilience: confidence.resilience,
      confidence_context: confidence.context || '',
      confidence_resilience_detail: confidence.resilienceDetail || '',
      confidence_text: confidence.statusText || '',
      lifestyle_display: lifestyle.displayLine,
      lifestyle_primary: lifestyle.primarySuggestion,

      // V15.0: Alternative Transit (when transit disrupted/cancelled/unavailable)
      alt_transit_active: altTransit.active,
      alt_transit_display: altTransit.displayLine,
      alt_transit_detail: altTransit.detailLine,
      alt_transit_rideshare: altTransit.rideshare,
      alt_transit_scooter: altTransit.scooter,
      alt_transit_bike: altTransit.bike,
      alt_transit_distance_km: altTransit.distanceKm,
      alt_transit_is_peak: altTransit.isPeak,

      // V15.0: Sleep Optimizer (evening mode)
      sleep_active: sleep.active,
      sleep_bedtime: sleep.bedtime,
      sleep_alarm: sleep.alarmTime,
      sleep_display: sleep.displayLine,
      sleep_adequacy: sleep.sleepAdequacy,

      // V15.0: Lifestyle Mindset
      mindset_stress: mindset.stressLevel,
      mindset_display: mindset.stressDisplay,
      mindset_steps: mindset.stepsDisplay,
      mindset_feels_like: mindset.feelsLikeDisplay,

      // Live data status — truthful indicators per Section 23.6
      isLive: hasAnyLiveData,
      dataSource: hasAnyLiveData ? 'gtfs-rt' : (apiOptions.apiKey ? 'no-data' : 'no-key'),
      _liveDataDiag: {
        hasApiKey: !!apiOptions.apiKey,
        trainStopId: trainStopId || null,
        tramStopId: tramStopId || null,
        trainFeedEntities: directTrains?._feedInfo?.entityCount ?? directTrains?.length ?? 0,
        tramFeedEntities: directTrams?._feedInfo?.entityCount ?? directTrams?.length ?? 0,
        busFeedEntities: directBuses?._feedInfo?.entityCount ?? directBuses?.length ?? 0,
        trainMatches: directTrains?.filter(t => t.isLive === true).length || 0,
        tramMatches: directTrams?.filter(t => t.isLive === true).length || 0,
        busMatches: directBuses?.filter(t => t.isLive === true).length || 0,
        trainError: directTrains?._feedInfo?.error || null,
        tramError: directTrams?._feedInfo?.error || null,
        busError: directBuses?._feedInfo?.error || null
      },

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
 * Build CCDash-compatible journey legs from engine route
 *
 * Iterates route.legs from the CommuteCompute engine output, matching each
 * transit leg with live departure data. This mirrors the pattern used by
 * api/screen.js:buildJourneyLegs() for consistency between e-ink and admin.
 *
 * Each leg includes:
 * - minutes: display time (for transit = wait + ride time)
 * - journeyContribution: actual minutes this leg adds to total journey
 * - GTFS stop names via getStopNameById()
 */
/**
 * Merge consecutive walk legs into a single leg (Section 7.5.1 MANDATORY)
 * Must be applied after ALL filtering to ensure no back-to-back walks ever appear
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

function buildCCDashLegs(result, prefs, now, route = null) {
  const transit = result.transit || {};
  const trains = transit.trains || [];
  const trams = transit.trams || [];
  const buses = transit.buses || [];
  const routeLegs = route?.legs || [];

  // If engine provided no route legs, build minimal fallback
  if (routeLegs.length === 0) {
    return buildFallbackLegs(result, prefs, now);
  }

  // Resolve stop IDs for GTFS name lookups
  const trainStopId = prefs.trainStopId || null;
  const tramStopId = prefs.tramStopId || null;
  const busStopId = prefs.busStopId || null;

  // Cafe busyness for coffee legs
  const busyDetector = new CafeBusyDetector(prefs);
  const cafeBusyness = busyDetector.getTimeBasedBusyness();
  const busyLabel = cafeBusyness.level === 'high' ? 'Busy' : cafeBusyness.level === 'medium' ? 'Moderate' : 'Quiet';
  const coffeeWaitTime = cafeBusyness.coffeeTime || 3;

  // Coffee status checks
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const cafeOpenHour = prefs.cafeOpenHour || 6;
  const cafeCloseHour = prefs.cafeCloseHour || 17;
  const cafeOpenDays = prefs.cafeOpenDays || [1, 2, 3, 4, 5, 6];
  const cafeIsOpen = cafeOpenDays.includes(dayOfWeek) && hour >= cafeOpenHour && hour < cafeCloseHour;
  const coffeePosition = prefs.coffeePosition || 'auto';

  // Track cumulative time for wait calculations
  let cumulativeMinutes = 0;
  const legs = [];
  let legNumber = 1;
  // Track which transit types have been used (for multi-modal: tram then train)
  let trainUsed = false;
  let tramUsed = false;

  for (const routeLeg of routeLegs) {
    const legType = routeLeg.type;

    if (legType === 'walk') {
      // Resolve stop name for walk-to-stop legs via GTFS
      let walkTitle;
      let walkSubtitle;

      if (routeLeg.to === 'cafe') {
        walkTitle = 'Walk to Cafe';
        walkSubtitle = 'From home';
      } else if (routeLeg.to === 'work') {
        walkTitle = 'Walk to Work';
        walkSubtitle = routeLeg.workName || shortenAddress(prefs.workAddress) || 'Destination';
      } else {
        // Walking to a transit stop — resolve GTFS name
        const isToTram = routeLeg.to?.toLowerCase().includes('tram');
        const isToTrain = routeLeg.to?.toLowerCase().includes('train') || routeLeg.to?.toLowerCase().includes('platform');
        const isToBus = routeLeg.to?.toLowerCase().includes('bus');
        let stopName;

        if (isToTram) {
          stopName = getStopNameById(tramStopId) ||
            routeLeg.stopName || routeLeg.origin?.name || 'Tram Stop';
        } else if (isToTrain) {
          stopName = getStopNameById(trainStopId) ||
            routeLeg.stationName || routeLeg.origin?.name || 'Station';
        } else if (isToBus) {
          stopName = getStopNameById(busStopId) ||
            routeLeg.stopName || routeLeg.origin?.name || 'Bus Stop';
        } else {
          // Generic stop — try all modes
          stopName = getStopNameById(trainStopId) || getStopNameById(tramStopId) || getStopNameById(busStopId) ||
            routeLeg.stopName || routeLeg.stationName || routeLeg.to || 'Stop';
        }

        walkTitle = `Walk to ${stopName}`;
        walkSubtitle = legs.length === 0 ? 'From home' : `${routeLeg.minutes} min walk`;
      }

      const walkMinutes = routeLeg.minutes || 0;
      legs.push({
        number: legNumber++,
        type: 'walk',
        title: walkTitle,
        to: routeLeg.to,
        subtitle: walkSubtitle,
        isFirst: legs.length === 0,
        minutes: walkMinutes,
        journeyContribution: walkMinutes,
        state: 'normal'
      });
      cumulativeMinutes += walkMinutes;

    } else if (legType === 'coffee') {
      // Coffee leg — check if cafe is open and timing allows
      const cafeName = routeLeg.cafeName || routeLeg.location ||
        shortenAddress(prefs.coffeeAddress) || 'Cafe';

      let coffeeState = 'normal';
      let coffeeSubtitle;
      let coffeeMinutes = routeLeg.minutes || prefs.cafeDuration || 5;
      let canGet = true;

      if (coffeePosition === 'never') {
        coffeeState = 'skip';
        coffeeSubtitle = '[X] SKIP -- Coffee disabled';
        coffeeMinutes = 0;
        canGet = false;
      } else if (!cafeIsOpen) {
        coffeeState = 'closed';
        coffeeSubtitle = '[X] CLOSED -- Cafe not open';
        coffeeMinutes = 0;
        canGet = false;
      } else {
        coffeeSubtitle = `[OK] ${busyLabel} • ~${coffeeWaitTime}m wait`;
      }

      legs.push({
        number: legNumber++,
        type: 'coffee',
        title: 'Coffee Stop',
        location: cafeName,
        subtitle: coffeeSubtitle,
        minutes: coffeeMinutes,
        journeyContribution: coffeeMinutes,
        canGet,
        busyness: cafeBusyness.level,
        coffeeWaitTime,
        state: coffeeState
      });
      cumulativeMinutes += coffeeMinutes;

    } else if (['train', 'tram', 'bus'].includes(legType)) {
      // Transit leg — dynamically match with live departure data for any mode
      const isTrainLeg = legType === 'train';
      const isTramLeg = legType === 'tram';
      const isBusLeg = legType === 'bus';

      // Departure source — dynamic by mode
      const liveDepartures = isTrainLeg ? trains :
                             isTramLeg ? trams :
                             isBusLeg ? buses : [];

      // GTFS stop name resolution (priority: GTFS → engine origin → fallback)
      const stopId = isTrainLeg ? trainStopId :
                     isTramLeg ? tramStopId :
                     isBusLeg ? busStopId : null;
      const gtfsName = getStopNameById(stopId);
      const engineOriginName = routeLeg.origin?.name || routeLeg.originStop || routeLeg.originStation;
      const modeFallback = isTrainLeg ? 'Station' : isBusLeg ? 'Bus Stop' : 'Tram Stop';
      const originName = gtfsName || engineOriginName || modeFallback;

      const destName = routeLeg.destination?.name || 'City';
      const modeLabel = legType.charAt(0).toUpperCase() + legType.slice(1);
      const transitDuration = routeLeg.minutes || routeLeg.durationMinutes || 15;

      // Find catchable departure (must be after cumulative walk/coffee time)
      const catchableDeparture = liveDepartures.find(d => d.minutes >= cumulativeMinutes + 1);

      if (catchableDeparture) {
        // Calculate wait time at stop
        const waitMinutes = Math.max(0, catchableDeparture.minutes - cumulativeMinutes);

        // Add wait leg if significant
        if (waitMinutes > 2) {
          legs.push({
            number: legNumber++,
            type: 'wait',
            title: `Wait at ${originName}`,
            subtitle: `${waitMinutes} min until departure`,
            minutes: waitMinutes,
            journeyContribution: waitMinutes,
            state: 'normal'
          });
          cumulativeMinutes += waitMinutes;
        }

        // Build subtitle with CATCHABLE next departures only
        const catchableDepartures = liveDepartures.filter(d => d.minutes >= cumulativeMinutes + 1);
        const nextTimes = catchableDepartures.slice(0, 3).map(d => d.minutes);
        const nextDepartureTimesMs = catchableDepartures.slice(0, 3).map(d => d.departureTimeMs).filter(Boolean);
        let transitSubtitle = originName;
        if (nextTimes.length >= 2) {
          transitSubtitle += ` • Next: ${nextTimes[0]}, ${nextTimes[1]} min`;
        } else if (nextTimes.length === 1) {
          transitSubtitle += ` • Next: ${nextTimes[0]} min`;
        }
        if (catchableDeparture.platform) {
          transitSubtitle += ` • Plat ${catchableDeparture.platform}`;
        }

        // journeyContribution = wait absorbed (if ≤2min) + transit ride duration
        const journeyContribution = Math.max(0, waitMinutes > 2 ? 0 : waitMinutes) + transitDuration;

        legs.push({
          number: legNumber++,
          type: legType,
          title: `${modeLabel} → ${destName}`,
          to: destName,
          destination: { name: destName },
          originStop: originName,
          stopName: originName,
          stationName: isTrainLeg ? originName : undefined,
          subtitle: transitSubtitle,
          nextDepartures: nextTimes,
          nextDepartureTimesMs,
          platform: catchableDeparture.platform,
          lineName: routeLeg.lineName || catchableDeparture.lineName,
          routeNumber: routeLeg.routeNumber || catchableDeparture.routeNumber,
          minutes: transitDuration,
          journeyContribution,
          state: catchableDeparture.isDelayed ? 'delayed' : 'normal',
          isLive: (catchableDeparture.source === 'gtfs-rt' || catchableDeparture.source === 'gtfs-rt-route' || catchableDeparture.source === 'gtfs-rt-broad') && catchableDeparture.isLive === true
        });
        cumulativeMinutes += transitDuration;
      } else {
        // No live departure — use timetable estimate fallback
        let transitSubtitle = `${originName} • Scheduled ~${transitDuration}min`;
        legs.push({
          number: legNumber++,
          type: legType,
          title: `${modeLabel} → ${destName}`,
          to: destName,
          destination: { name: destName },
          originStop: originName,
          stopName: originName,
          stationName: isTrainLeg ? originName : undefined,
          subtitle: transitSubtitle,
          nextDepartures: [],
          nextDepartureTimesMs: [],
          minutes: transitDuration,
          journeyContribution: transitDuration,
          state: 'normal',
          isLive: false,
          isTimetableEstimate: true
        });
        cumulativeMinutes += transitDuration;
      }

      if (isTrainLeg) trainUsed = true;
      else if (isTramLeg) tramUsed = true;
    }
  }

  // Section 7.5.1: Merge consecutive walk legs after all processing
  return mergeConsecutiveWalkLegs(legs);
}

/**
 * Fallback leg builder when engine provides no route legs
 * Uses raw departure data to build a minimal journey
 */
function buildFallbackLegs(result, prefs, now) {
  const legs = [];
  const transit = result.transit || {};
  const trains = transit.trains || [];
  const trams = transit.trams || [];
  const buses = transit.buses || [];
  const homeToStop = prefs.homeToStop || 5;

  // Pick first available departure from any mode
  const allDepartures = [...trains, ...trams, ...buses].sort((a, b) => a.minutes - b.minutes);
  const departure = allDepartures.find(d => d.minutes >= homeToStop + 1);

  // Determine mode of selected departure dynamically
  const isTrainDep = departure ? trains.includes(departure) : false;
  const isTramDep = departure ? trams.includes(departure) : false;
  const isBusDep = departure ? buses.includes(departure) : false;
  const depType = isTrainDep ? 'train' : isTramDep ? 'tram' : isBusDep ? 'bus' : 'train';

  const stopId = depType === 'train' ? prefs.trainStopId :
                 depType === 'tram' ? prefs.tramStopId :
                 depType === 'bus' ? prefs.busStopId : null;
  const modeFallback = depType === 'train' ? 'Station' : depType === 'bus' ? 'Bus Stop' : 'Tram Stop';
  const stopName = getStopNameById(stopId) || modeFallback;

  legs.push({
    number: 1,
    type: 'walk',
    title: `Walk to ${stopName}`,
    to: stopName,
    subtitle: 'From home',
    isFirst: true,
    minutes: homeToStop,
    journeyContribution: homeToStop,
    state: 'normal'
  });

  if (departure) {
    const dest = departure.destination || 'City';
    const transitDuration = departure.duration || 15;
    const modeLabel = depType.charAt(0).toUpperCase() + depType.slice(1);
    const relevantDepartures = depType === 'train' ? trains : depType === 'tram' ? trams : buses;
    const nextTimes = relevantDepartures.slice(0, 2).map(d => d.minutes);

    legs.push({
      number: 2,
      type: depType,
      title: `${modeLabel} → ${dest}`,
      to: dest,
      destination: { name: dest },
      subtitle: `${stopName} • Next: ${nextTimes.join(', ')} min`,
      nextDepartures: nextTimes,
      minutes: transitDuration,
      journeyContribution: transitDuration,
      state: departure.isDelayed ? 'delayed' : 'normal'
    });
  } else {
    legs.push({
      number: 2,
      type: 'transit',
      title: 'Take Transit',
      subtitle: 'Scheduled ~20min',
      minutes: 20,
      journeyContribution: 20,
      state: 'normal',
      isLive: false,
      isTimetableEstimate: true
    });
  }

  legs.push({
    number: 3,
    type: 'walk',
    title: 'Walk to Work',
    to: 'work',
    subtitle: shortenAddress(prefs.workAddress) || 'Destination',
    minutes: prefs.walkToWork || 5,
    journeyContribution: prefs.walkToWork || 5,
    state: 'normal'
  });

  // Section 7.5.1: Merge consecutive walk legs after all processing
  return mergeConsecutiveWalkLegs(legs);
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
  const totalMinutes = legs.reduce((sum, leg) => sum + (leg.journeyContribution || leg.minutes || 0), 0);
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
    isLive: (next.source === 'gtfs-rt' || next.source === 'gtfs-rt-route' || next.source === 'gtfs-rt-broad') && next.isLive === true
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
