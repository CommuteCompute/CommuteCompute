/**
 * Route Alternatives API Endpoint
 * 
 * Returns available route alternatives from the CommuteCompute engine.
 * Supports GET (list alternatives) and POST (select a route).
 * 
 * GET /api/routes - Returns all discovered route alternatives
 * POST /api/routes - Select a specific route by index or ID
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { CommuteCompute } from '../src/engines/commute-compute.js';
import { getTransitApiKey, getPreferences, setPreferences, getStationOverrides, setStationOverrides } from '../src/data/kv-preferences.js';
import { findNearestStops, findNearestStopsMultiple } from '../src/data/gtfs-stop-names.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get stored preferences
    let prefs = {};
    try {
      prefs = await getPreferences() || {};
    } catch (e) {
    }

    // Get API key
    let apiKey = null;
    try { apiKey = await getTransitApiKey(); } catch (e) {}

    // Merge with request params
    const params = req.method === 'POST' ? req.body : req.query;
    
    const preferences = {
      homeAddress: params.home || prefs.homeAddress || prefs.home,
      workAddress: params.work || prefs.workAddress || prefs.work,
      coffeeAddress: params.cafe || prefs.coffeeAddress || prefs.cafe,
      homeLocation: prefs.homeLocation,
      workLocation: prefs.workLocation,
      cafeLocation: prefs.cafeLocation,
      arrivalTime: params.arrivalTime || prefs.arrivalTime || '09:00',
      state: params.state || prefs.state || 'VIC',
      coffeeEnabled: (params.coffeeEnabled ?? prefs.coffeeEnabled) !== false,
      homeToStop: prefs.walkingTimes?.homeToStop || 5,
      homeToCafe: prefs.walkingTimes?.homeToCafe || 5,
      cafeToTransit: prefs.walkingTimes?.cafeToStop || 2,
      walkToWork: prefs.walkingTimes?.stopToWork || 5,
      cafeDuration: prefs.coffee?.duration || 5,
      coffeePosition: prefs.coffee?.position || 'auto',
      preferTrain: prefs.modes?.train !== false,
      preferTram: prefs.modes?.tram !== false,
      preferBus: prefs.modes?.bus || false,
      minimizeWalking: prefs.modes?.minimizeWalking !== false,
      selectedRouteId: prefs.selectedRouteId,
      api: { key: apiKey },
      transitApiKey: apiKey
    };

    // Initialize CommuteCompute engine
    const engine = new CommuteCompute(preferences);
    await engine.initialize();

    // Handle POST - select a route
    if (req.method === 'POST' && (params.selectRouteId !== undefined || params.selectRouteIndex !== undefined)) {
      const routeId = params.selectRouteId;
      const routeIndex = params.selectRouteIndex;
      
      // Discover routes first
      await engine.discoverRoutes();
      
      // Select the route
      const selectedRoute = engine.selectRoute(routeId !== undefined ? routeId : parseInt(routeIndex));
      
      // Save selection to preferences
      try {
        const currentPrefs = await getPreferences() || {};
        currentPrefs.selectedRouteId = selectedRoute?.id || routeId;
        currentPrefs.selectedRouteIndex = engine.selectedRouteIndex;
        await setPreferences(currentPrefs);
      } catch (e) {
      }
      
      return res.status(200).json({
        success: true,
        message: 'Route selected',
        selectedRoute: formatRouteForDisplay(selectedRoute),
        selectedIndex: engine.selectedRouteIndex,
        selectedId: selectedRoute?.id
      });
    }

    // POST — save station overrides (user selects alternative stops for legs)
    if (req.method === 'POST' && params.stationOverrides !== undefined) {
      await setStationOverrides(params.stationOverrides);
      return res.status(200).json({
        success: true,
        message: 'Station overrides saved',
        overrides: params.stationOverrides
      });
    }

    // GET — return station overrides if requested
    if (req.query?.getOverrides === 'true') {
      const overrides = await getStationOverrides() || {};
      return res.status(200).json({ success: true, overrides });
    }

    // GET - discover and return all route alternatives
    const allRoutes = await engine.discoverRoutes();
    const primaryRoute = allRoutes[0] || null;

    // Format all discovered routes for display
    const alternatives = allRoutes.map((route, index) => formatRouteForDisplay(route, index));

    // Mark the currently selected route
    alternatives.forEach((alt, idx) => {
      alt.isSelected = idx === 0;
    });

    // Include station overrides and nearby alternatives for admin panel dropdowns
    const stationOverrides = await getStationOverrides() || {};
    // Provide nearby stops for home/work locations so admin can offer alternatives
    // Returns top 3 per mode sorted by distance for station preference dropdowns
    const locations = engine.getLocations();
    const nearbyStopsHome = (locations.home?.lat && locations.home?.lon)
      ? findNearestStopsMultiple(locations.home.lat, locations.home.lon, { count: 3 })
      : {};
    const nearbyStopsWork = (locations.work?.lat && locations.work?.lon)
      ? findNearestStopsMultiple(locations.work.lat, locations.work.lon, { count: 3 })
      : {};

    return res.status(200).json({
      success: true,
      count: alternatives.length,
      totalDiscovered: allRoutes.length,
      selectedIndex: 0,
      selectedId: primaryRoute?.id,
      alternatives,
      stationOverrides,
      nearbyStops: {
        home: nearbyStopsHome,
        work: nearbyStopsWork
      },
      state: engine.state,
      fallbackMode: engine.fallbackMode,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      error: error.message,
      alternatives: [],
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Format a route for display in the UI
 */
function formatRouteForDisplay(route, index = 0) {
  if (!route) return null;
  
  // Build mode icons from legs
  const modeIcons = {
    walk: 'WALK',
    coffee: '[Coffee]',
    train: '[Train]',
    tram: '[Tram]',
    bus: '[Bus]',
    ferry: '[Ferry]',
    transit: '[Transit]',
    wait: '[Wait]'
  };
  
  const legSummary = (route.legs || []).map(leg => {
    const icon = modeIcons[leg.type] || '•';
    return icon;
  }).join(' → ');
  
  // Get primary mode
  const transitLeg = (route.legs || []).find(l => 
    ['train', 'tram', 'bus', 'ferry', 'transit'].includes(l.type)
  );
  const primaryMode = transitLeg?.type || 'transit';
  
  return {
    id: route.id || `route-${index}`,
    index,
    name: route.name || `Route ${index + 1}`,
    description: route.description || legSummary,
    type: route.type || 'auto',
    totalMinutes: route.totalMinutes || 0,
    legCount: route.legs?.length || 0,
    legSummary,
    primaryMode,
    via: route.via,
    hasCoffee: (route.legs || []).some(l => l.type === 'coffee'),
    legs: (route.legs || []).map(leg => {
      const legData = {
        type: leg.type,
        icon: modeIcons[leg.type] || '•',
        title: leg.to || leg.location || leg.destination?.name || leg.origin?.name || '',
        minutes: leg.minutes || leg.durationMinutes || 0,
        routeNumber: leg.routeNumber
      };
      // Include stop/station names for transit legs
      if (['train', 'tram', 'bus', 'ferry', 'vline'].includes(leg.type)) {
        legData.originName = leg.origin?.name || leg.originStop || leg.originStation || '';
        legData.destinationName = leg.destination?.name || leg.destinationName || '';
        legData.stopId = leg.stopId || leg.originStopId || null;
        legData.lineName = leg.lineName || null;
      }
      return legData;
    })
  };
}
