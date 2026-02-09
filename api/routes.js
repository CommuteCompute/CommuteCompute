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
import { getTransitApiKey, getPreferences, setPreferences } from '../src/data/kv-preferences.js';

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

    // GET - discover and return all route alternatives
    const allRoutes = await engine.discoverRoutes();
    const primaryRoute = allRoutes[0] || null;

    // Format all discovered routes for display
    const alternatives = allRoutes.map((route, index) => formatRouteForDisplay(route, index));

    // Mark the currently selected route
    alternatives.forEach((alt, idx) => {
      alt.isSelected = idx === 0;
    });

    return res.status(200).json({
      success: true,
      count: alternatives.length,
      totalDiscovered: allRoutes.length,
      selectedIndex: 0,
      selectedId: primaryRoute?.id,
      alternatives,
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
    legs: (route.legs || []).map(leg => ({
      type: leg.type,
      icon: modeIcons[leg.type] || '•',
      title: leg.to || leg.location || leg.destination?.name || leg.origin?.name || '',
      minutes: leg.minutes || leg.durationMinutes || 0,
      routeNumber: leg.routeNumber
    }))
  };
}
