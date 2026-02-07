/**
 * CommuteCompute™ Journey Planner
 * Part of the Commute Compute System™
 * 
 * Builds dynamic route segments based on user-configured journey preferences.
 * All routing is derived from user preferences - no hardcoded addresses.
 * Integrates SmartRouteRecommender for auto-detection of optimal routes.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import SmartRouteRecommender from './smart-route-recommender.js';

class JourneyPlanner {
  constructor() {
    this.cache = null;
    this.cacheExpiry = null;
    this.smartRecommender = new SmartRouteRecommender();
    this.recommendationCache = null;
    this.recommendationCacheExpiry = null;
  }

  /**
   * Get smart route recommendations based on locations and preferences
   * Auto-detects optimal routes including coffee-before-transit pattern
   * 
   * @param {Object} params - Parameters
   * @param {Object} params.locations - { home, cafe, work } with lat/lon
   * @param {Array} params.allStops - All available transit stops
   * @param {Object} params.preferences - User preferences
   * @returns {Object} Recommendation result with alternatives and reasoning
   */
  async getSmartRecommendations(params) {
    const { locations, allStops, preferences } = params;
    
    // Check cache (valid for 5 minutes since stops don't change often)
    const now = Date.now();
    if (this.recommendationCache && this.recommendationCacheExpiry > now) {
      return this.recommendationCache;
    }
    
    // Build preference object for recommender
    const routePrefs = {
      coffeeEnabled: preferences?.coffeeEnabled !== false,
      cafeDuration: preferences?.cafeDuration || 5,
      preferTrain: preferences?.preferTrain !== false,
      minimizeWalking: preferences?.minimizeWalking !== false,
      modePriority: preferences?.modePriority || { train: 1, tram: 2, bus: 3, vline: 2 },
      walking: {
        maxDistanceMeters: preferences?.maxWalkingDistance || 500,
        idealDistanceMeters: preferences?.idealWalkingDistance || 300,
        weightFactor: preferences?.walkingWeightFactor || 2.0,
        avoidLongWalks: preferences?.avoidLongWalks !== false
      }
    };
    
    // Get recommendations from smart recommender
    const result = this.smartRecommender.analyzeAndRecommend(
      locations,
      allStops || [],
      routePrefs
    );
    
    // Cache the result
    this.recommendationCache = result;
    this.recommendationCacheExpiry = now + (5 * 60 * 1000);
    
    return result;
  }

  /**
   * Use recommended route to calculate full journey
   * Combines smart recommendations with real-time transit data
   * 
   * @param {Object} params - Parameters
   * @returns {Object} Complete journey calculation
   */
  async calculateWithSmartRecommendation(params) {
    const { locations, allStops, preferences, arrivalTime, liveData } = params;
    
    // Get smart recommendations
    const recommendations = await this.getSmartRecommendations({
      locations,
      allStops,
      preferences
    });
    
    if (!recommendations.recommended) {
      return this.calculateJourney({
        homeLocation: locations.home,
        workLocation: locations.work,
        cafeLocation: locations.cafe,
        workStartTime: arrivalTime || '09:00',
        cafeDuration: preferences?.cafeDuration || 5
      });
    }
    
    // Use recommended route
    const route = recommendations.recommended;
    // Build journey from recommendation
    const journey = this.buildJourneyFromRecommendation(route, {
      locations,
      arrivalTime: arrivalTime || '09:00',
      cafeDuration: preferences?.cafeDuration || 5,
      liveData
    });
    
    return {
      success: true,
      journey,
      recommendation: {
        name: route.name,
        pattern: recommendations.pattern.type,
        confidence: recommendations.pattern.confidence,
        reasoning: recommendations.reasoning,
        alternatives: recommendations.routes.slice(0, 5)
      }
    };
  }

  /**
   * Build complete journey object from a recommendation
   */
  buildJourneyFromRecommendation(route, options) {
    const { locations, arrivalTime, cafeDuration, liveData } = options;
    const segments = [];
    
    // Parse arrival time
    const [arrHours, arrMins] = arrivalTime.split(':').map(Number);
    const arrivalMinutes = arrHours * 60 + arrMins;
    
    // Start building segments
    let totalMinutes = 0;
    
    // Coffee segments (if pattern is coffee-before-transit)
    if (route.coffeeSegments?.position === 'before-transit') {
      segments.push({
        type: 'walk',
        from: 'Home',
        to: 'Cafe',
        minutes: route.coffeeSegments.walkToCafe,
        icon: 'WALK'
      });
      totalMinutes += route.coffeeSegments.walkToCafe;
      
      segments.push({
        type: 'coffee',
        location: 'Cafe',
        minutes: cafeDuration,
        icon: '[Coffee]',
        decision: 'TIME FOR COFFEE'
      });
      totalMinutes += cafeDuration;
      
      segments.push({
        type: 'walk',
        from: 'Cafe',
        to: route.modes[0]?.originStation?.name || 'Station',
        minutes: route.coffeeSegments.walkToStation,
        icon: 'WALK'
      });
      totalMinutes += route.coffeeSegments.walkToStation;
    } else {
      // Direct walk to station
      const walkTime = route.walkingSegments?.homeToStation || 5;
      segments.push({
        type: 'walk',
        from: 'Home',
        to: route.modes[0]?.originStation?.name || 'Station',
        minutes: walkTime,
        icon: 'WALK'
      });
      totalMinutes += walkTime;
    }
    
    // Transit segments
    for (let i = 0; i < route.modes.length; i++) {
      const mode = route.modes[i];
      
      // Wait time
      segments.push({
        type: 'wait',
        location: mode.originStation?.name || 'Station',
        minutes: 2,
        icon: '[Wait]'
      });
      totalMinutes += 2;
      
      // Transit leg
      const transitMins = mode.estimatedDuration || 10;
      segments.push({
        type: 'transit',
        mode: this.getModeName(mode.type),
        icon: this.getModeIcon(mode.type),
        from: mode.originStation?.name || 'Origin',
        to: mode.destinationStation?.name || 'Destination',
        minutes: transitMins,
        routeNumber: mode.routeNumber,
        // Add live delay if available
        delay: liveData?.delays?.[mode.routeNumber] || 0
      });
      totalMinutes += transitMins;
      
      // Inter-modal walk if not last segment
      if (i < route.modes.length - 1) {
        segments.push({
          type: 'walk',
          from: mode.destinationStation?.name,
          to: route.modes[i + 1].originStation?.name,
          minutes: 3,
          icon: 'WALK'
        });
        totalMinutes += 3;
      }
    }
    
    // Final walk to work
    const finalWalk = route.walkingSegments?.stationToWork || 5;
    segments.push({
      type: 'walk',
      from: route.modes[route.modes.length - 1]?.destinationStation?.name || 'Station',
      to: 'Work',
      minutes: finalWalk,
      icon: 'WALK'
    });
    totalMinutes += finalWalk;
    
    // Calculate departure time
    const departureMinutes = arrivalMinutes - totalMinutes;
    const depHours = Math.floor(departureMinutes / 60);
    const depMins = departureMinutes % 60;
    const departureTime = `${String(depHours).padStart(2, '0')}:${String(depMins).padStart(2, '0')}`;
    
    // Add times to segments (working backwards)
    let currentMinutes = arrivalMinutes;
    for (let i = segments.length - 1; i >= 0; i--) {
      currentMinutes -= segments[i].minutes;
      const h = Math.floor(currentMinutes / 60);
      const m = currentMinutes % 60;
      segments[i].time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    
    return {
      departureTime,
      arrivalTime,
      totalMinutes,
      segments,
      hasCoffee: route.coffeeSegments?.position === 'before-transit',
      routeName: route.name,
      pattern: route.pattern,
      score: route.score
    };
  }

  /**
   * Clear recommendation cache
   */
  clearRecommendationCache() {
    this.recommendationCache = null;
    this.recommendationCacheExpiry = null;
  }

  /**
   * Calculate journey based on locations and preferences
   * This is a simplified journey planner that works with the smart route calculation
   */
  async calculateJourney(params) {
    const {
      homeLocation,
      workLocation,
      cafeLocation,
      workStartTime,
      cafeDuration = 5,
      transitAuthority = 'VIC',
      selectedStops = null
    } = params;

    try {
      // Use global fallback timetables for stop lookup
      const fallbackStops = global.fallbackTimetables?.getStopsForState?.(transitAuthority) || [];
      
      // Find nearest stops to home and work
      const homeStops = this.findNearbyStops(homeLocation, fallbackStops, 5);
      const workStops = this.findNearbyStops(workLocation, fallbackStops, 5);
      const cafeStop = cafeLocation ? this.findNearbyStops(cafeLocation, fallbackStops, 1)[0] : null;

      if (homeStops.length === 0 || workStops.length === 0) {
        return {
          success: false,
          error: 'No transit stops found near home or work location'
        };
      }

      // Select best stops (or use user-selected if provided)
      const originStop = selectedStops?.origin || homeStops[0];
      const destStop = selectedStops?.destination || workStops[0];

      // Calculate journey segments
      const segments = this.buildJourneySegments({
        homeLocation,
        workLocation,
        cafeLocation,
        originStop,
        destStop,
        cafeStop,
        workStartTime,
        cafeDuration
      });

      // Calculate total time
      const totalMinutes = segments.reduce((sum, seg) => sum + (seg.minutes || 0), 0);
      
      // Calculate departure time
      const [hours, mins] = workStartTime.split(':').map(Number);
      const arrivalMinutes = hours * 60 + mins;
      const departureMinutes = arrivalMinutes - totalMinutes;
      const depHours = Math.floor(departureMinutes / 60);
      const depMins = departureMinutes % 60;
      const departureTime = `${String(depHours).padStart(2, '0')}:${String(depMins).padStart(2, '0')}`;

      return {
        success: true,
        journey: {
          departureTime,
          arrivalTime: workStartTime,
          totalMinutes,
          segments,
          route: {
            mode: this.getModeName(originStop.route_type),
            icon: this.getModeIcon(originStop.route_type),
            originStop,
            destinationStop: destStop,
            transitMinutes: originStop.route_type === destStop.route_type ? 
              this.estimateTransitTime(originStop, destStop) : 15
          },
          cafe: cafeLocation ? {
            included: true,
            location: cafeLocation,
            stop: cafeStop,
            durationMinutes: cafeDuration
          } : null
        },
        options: {
          homeStops: homeStops.map((s, i) => ({ ...s, selected: i === 0 })),
          workStops: workStops.map((s, i) => ({ ...s, selected: i === 0 })),
          alternativeRoutes: this.findAlternativeRoutes(homeStops, workStops)
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find stops near a location
   */
  /**
   * Find nearby stops with route preference support
   * @param {Object} location - Location with lat/lon
   * @param {Array} allStops - All available stops
   * @param {number} limit - Max stops to return
   * @param {Object} routePrefs - Optional route preferences from config
   */
  findNearbyStops(location, allStops, limit = 5, routePrefs = null) {
    if (!location?.lat || !location?.lon || !allStops?.length) {
      return [];
    }

    // Default preferences (can be overridden by config)
    const prefs = routePrefs || {
      optimizeFor: 'minimal-walking',
      walking: {
        maxDistanceMeters: 500,
        idealDistanceMeters: 300,
        weightFactor: 2.0
      },
      modePriority: { train: 1, tram: 2, vline: 2, bus: 3 }
    };

    // Map route_type to mode name for priority lookup
    const routeTypeToMode = { 0: 'train', 1: 'tram', 2: 'bus', 3: 'vline' };
    const maxDist = prefs.walking?.maxDistanceMeters || 500;
    const idealDist = prefs.walking?.idealDistanceMeters || 300;
    const walkWeight = prefs.walking?.weightFactor || 2.0;

    return allStops
      .map(stop => {
        const distance = this.haversineDistance(location.lat, location.lon, stop.lat, stop.lon);
        const walkingMinutes = Math.ceil(distance / 80); // ~80m/min walking
        return {
          ...stop,
          distance,
          walkingMinutes,
          icon: this.getModeIcon(stop.route_type),
          withinIdeal: distance <= idealDist,
          withinMax: distance <= maxDist
        };
      })
      .filter(stop => {
        // When optimizing for minimal walking, strictly enforce max distance
        if (prefs.optimizeFor === 'minimal-walking') {
          return stop.distance <= maxDist;
        }
        return stop.distance < 2000; // Fallback: 2km max
      })
      .sort((a, b) => {
        // When optimizing for minimal walking: distance first, then mode
        if (prefs.optimizeFor === 'minimal-walking') {
          // Prefer stops within ideal distance
          if (a.withinIdeal && !b.withinIdeal) return -1;
          if (!a.withinIdeal && b.withinIdeal) return 1;
          // Then sort by distance (weighted)
          const distDiff = (a.distance * walkWeight) - (b.distance * walkWeight);
          if (Math.abs(distDiff) > 50) return distDiff; // Significant distance difference
          // If similar distance, prefer better mode
          const aMode = routeTypeToMode[a.route_type] || 'bus';
          const bMode = routeTypeToMode[b.route_type] || 'bus';
          const aPriority = prefs.modePriority[aMode] || 4;
          const bPriority = prefs.modePriority[bMode] || 4;
          return aPriority - bPriority;
        }
        // Default: mode first, then distance
        const aMode = routeTypeToMode[a.route_type] || 'bus';
        const bMode = routeTypeToMode[b.route_type] || 'bus';
        const aPriority = prefs.modePriority[aMode] || 4;
        const bPriority = prefs.modePriority[bMode] || 4;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.distance - b.distance;
      })
      .slice(0, limit);
  }

  /**
   * Build journey segments
   */
  buildJourneySegments(params) {
    const { homeLocation, workLocation, cafeLocation, originStop, destStop, cafeStop, workStartTime, cafeDuration } = params;
    const segments = [];
    let currentTime = 0; // Will calculate backwards from arrival

    // Calculate times
    const walkToStop = originStop.walkingMinutes || 5;
    const transitTime = this.estimateTransitTime(originStop, destStop);
    const walkFromStop = destStop.walkingMinutes || 5;
    const waitTime = 2;

    // Segment 1: Walk to stop (or cafe first)
    if (cafeLocation && cafeStop) {
      const walkToCafe = Math.ceil(this.haversineDistance(
        homeLocation.lat, homeLocation.lon, 
        cafeLocation.lat, cafeLocation.lon
      ) / 80);
      
      segments.push({
        type: 'walk',
        from: 'Home',
        to: 'Cafe',
        minutes: walkToCafe,
        time: '' // Will fill in later
      });
      
      segments.push({
        type: 'coffee',
        location: 'Cafe',
        minutes: cafeDuration,
        time: ''
      });

      const walkFromCafe = Math.ceil(this.haversineDistance(
        cafeLocation.lat, cafeLocation.lon,
        originStop.lat, originStop.lon
      ) / 80);
      
      segments.push({
        type: 'walk',
        from: 'Cafe',
        to: originStop.name,
        minutes: walkFromCafe,
        time: ''
      });
    } else {
      segments.push({
        type: 'walk',
        from: 'Home',
        to: originStop.name,
        minutes: walkToStop,
        time: ''
      });
    }

    // Segment 2: Wait
    segments.push({
      type: 'wait',
      location: originStop.name,
      minutes: waitTime,
      time: ''
    });

    // Segment 3: Transit
    segments.push({
      type: 'transit',
      mode: this.getModeName(originStop.route_type),
      icon: this.getModeIcon(originStop.route_type),
      from: originStop.name,
      to: destStop.name,
      minutes: transitTime,
      time: '',
      note: 'Timetabled estimate (configure Transport API for live times)'
    });

    // Segment 4: Walk to work
    segments.push({
      type: 'walk',
      from: destStop.name,
      to: 'Work',
      minutes: walkFromStop,
      time: ''
    });

    // Calculate times backwards from arrival
    const [hours, mins] = workStartTime.split(':').map(Number);
    let currentMinutes = hours * 60 + mins;
    
    for (let i = segments.length - 1; i >= 0; i--) {
      currentMinutes -= segments[i].minutes;
      const h = Math.floor(currentMinutes / 60);
      const m = currentMinutes % 60;
      segments[i].time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return segments;
  }

  /**
   * Estimate transit time between stops
   */
  estimateTransitTime(origin, dest) {
    const distance = this.haversineDistance(origin.lat, origin.lon, dest.lat, dest.lon);
    // Rough estimate: 30km/h average for transit
    return Math.max(2, Math.ceil(distance / 500));
  }

  /**
   * Find alternative routes
   */
  findAlternativeRoutes(homeStops, workStops) {
    const routes = [];
    
    for (const origin of homeStops.slice(0, 3)) {
      for (const dest of workStops.slice(0, 3)) {
        if (origin.route_type === dest.route_type) {
          routes.push({
            originStopId: origin.id,
            originStopName: origin.name,
            destinationStopId: dest.id,
            destinationStopName: dest.name,
            mode: this.getModeName(origin.route_type),
            icon: this.getModeIcon(origin.route_type),
            totalMinutes: origin.walkingMinutes + this.estimateTransitTime(origin, dest) + dest.walkingMinutes,
            transitMinutes: this.estimateTransitTime(origin, dest),
            walkingMinutes: origin.walkingMinutes + dest.walkingMinutes
          });
        }
      }
    }
    
    return routes.sort((a, b) => a.totalMinutes - b.totalMinutes).slice(0, 5);
  }

  /**
   * Haversine distance in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Get mode name from route type
   */
  getModeName(routeType) {
    const modes = { 0: 'Train', 1: 'Tram', 2: 'Bus', 3: 'V/Line', 4: 'Ferry' };
    return modes[routeType] || 'Transit';
  }

  /**
   * Get mode icon from route type
   */
  getModeIcon(routeType) {
    const icons = { 0: '[Train]', 1: '[Tram]', 2: '[Bus]', 3: '[Train]', 4: '[Ferry]' };
    return icons[routeType] || '[Transit]';
  }

  /**
   * Auto-discover route alternatives from home to work
   * Finds all viable routes and ranks by user preferences
   * @param {Object} locations - { home, cafe, work } with lat/lon
   * @param {Array} allStops - All available stops from timetable
   * @param {Object} routePrefs - Route preferences from config
   * @returns {Array} Ranked list of route alternatives
   */
  discoverRouteAlternatives(locations, allStops, routePrefs) {
    const maxWalk = routePrefs?.walking?.maxDistanceMeters || 500;
    const walkWeight = routePrefs?.walking?.weightFactor || 2.0;
    const alternatives = [];

    // Find all stops near home and work
    const homeStops = this.findNearbyStops(locations.home, allStops, 10, routePrefs);
    const workStops = this.findNearbyStops(locations.work, allStops, 10, routePrefs);
    
    // Group stops by route for better alternative discovery
    const homeByRoute = this.groupStopsByRoute(homeStops);
    const workByRoute = this.groupStopsByRoute(workStops);

    // Strategy 1: Direct routes (same route serves both areas)
    for (const [routeId, homeRouteStops] of Object.entries(homeByRoute)) {
      if (workByRoute[routeId]) {
        const workRouteStops = workByRoute[routeId];
        const bestHome = homeRouteStops[0];
        const bestWork = workRouteStops[0];
        
        alternatives.push({
          id: 'direct-' + routeId,
          name: bestHome.route_name || this.getModeName(bestHome.route_type) + ' ' + (bestHome.route_number || ''),
          type: 'direct',
          modes: [{
            type: bestHome.route_type,
            routeNumber: bestHome.route_number,
            routeName: bestHome.route_name,
            originStation: bestHome,
            destinationStation: bestWork,
            estimatedDuration: this.estimateTransitTime(bestHome, bestWork)
          }],
          totalWalking: bestHome.distance + bestWork.distance,
          totalTransit: this.estimateTransitTime(bestHome, bestWork),
          score: this.scoreRoute([bestHome, bestWork], routePrefs)
        });
      }
    }

    // Strategy 2: Multi-modal via interchange stations
    const interchanges = this.findInterchangeStations(allStops);
    
    for (const homeStop of homeStops.slice(0, 5)) {
      for (const interchange of interchanges) {
        // Check if homeStop's route goes to this interchange
        const interchangeStops = allStops.filter(s => 
          s.stop_id === interchange.stop_id || 
          (Math.abs(s.lat - interchange.lat) < 0.001 && Math.abs(s.lon - interchange.lon) < 0.001)
        );
        
        for (const workStop of workStops.slice(0, 5)) {
          // Check if there's a connecting route from interchange to work
          const connectingStops = interchangeStops.filter(s => 
            s.route_type === workStop.route_type || this.routesConnect(s, workStop, allStops)
          );
          
          if (connectingStops.length > 0) {
            const connecting = connectingStops[0];
            const walkToInterchange = this.haversineDistance(
              homeStop.lat, homeStop.lon, connecting.lat, connecting.lon
            );
            
            // Only include if transfer walk is reasonable
            if (walkToInterchange < 300) {
              alternatives.push({
                id: 'multi-' + homeStop.route_number + '-' + interchange.name + '-' + workStop.route_number,
                name: (homeStop.route_number || this.getModeName(homeStop.route_type)) + 
                      ' via ' + interchange.name + ' to ' + 
                      (workStop.route_number || this.getModeName(workStop.route_type)),
                type: 'multi-modal',
                via: interchange.name,
                modes: [
                  {
                    type: homeStop.route_type,
                    routeNumber: homeStop.route_number,
                    originStation: homeStop,
                    destinationStation: { ...connecting, name: interchange.name }
                  },
                  {
                    type: workStop.route_type,
                    routeNumber: workStop.route_number,
                    originStation: { ...connecting, name: interchange.name },
                    destinationStation: workStop
                  }
                ],
                totalWalking: homeStop.distance + walkToInterchange + workStop.distance,
                totalTransit: this.estimateTransitTime(homeStop, connecting) + 
                              this.estimateTransitTime(connecting, workStop),
                score: this.scoreRoute([homeStop, connecting, workStop], routePrefs)
              });
            }
          }
        }
      }
    }

    // Sort by score (lower = better)
    alternatives.sort((a, b) => a.score - b.score);
    
    // Remove duplicates and limit
    const seen = new Set();
    const unique = alternatives.filter(alt => {
      const key = alt.modes.map(m => m.routeNumber + '-' + m.originStation?.name).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);

    return unique;
  }

  /**
   * Group stops by their route ID
   */
  groupStopsByRoute(stops) {
    const grouped = {};
    for (const stop of stops) {
      const routeId = stop.route_id || stop.route_number || stop.route_type;
      if (!grouped[routeId]) grouped[routeId] = [];
      grouped[routeId].push(stop);
    }
    return grouped;
  }

  /**
   * Find major interchange stations (stations with multiple modes)
   */
  findInterchangeStations(allStops) {
    // Group stops by location (within 200m)
    const locations = {};
    for (const stop of allStops) {
      const key = Math.round(stop.lat * 500) + ',' + Math.round(stop.lon * 500);
      if (!locations[key]) locations[key] = [];
      locations[key].push(stop);
    }
    
    // Find locations with multiple route types (interchange)
    const interchanges = [];
    for (const stops of Object.values(locations)) {
      const types = new Set(stops.map(s => s.route_type));
      if (types.size > 1) {
        // This is an interchange - has multiple modes
        const trainStop = stops.find(s => s.route_type === 0);
        interchanges.push(trainStop || stops[0]);
      }
    }
    
    return interchanges;
  }

  /**
   * Check if two routes connect (share a stop)
   */
  routesConnect(stop1, stop2, allStops) {
    // Simplified: check if they're the same route type or at same location
    return stop1.route_id === stop2.route_id;
  }

  /**
   * Score a route based on preferences (lower = better)
   */
  scoreRoute(stops, routePrefs) {
    const walkWeight = routePrefs?.walking?.weightFactor || 2.0;
    const modePriority = routePrefs?.modePriority || { train: 1, tram: 2, vline: 2, bus: 3 };
    const routeTypeToMode = { 0: 'train', 1: 'tram', 2: 'bus', 3: 'vline' };
    
    let score = 0;
    
    // Walking penalty (weighted)
    for (const stop of stops) {
      if (stop.distance) {
        score += (stop.distance / 100) * walkWeight;
      }
    }
    
    // Mode preference bonus
    for (const stop of stops) {
      const mode = routeTypeToMode[stop.route_type] || 'bus';
      score += modePriority[mode] || 3;
    }
    
    // Fewer transfers is better
    score += (stops.length - 2) * 5;
    
    return score;
  }

  /**
   * Use user's saved/selected route alternative
   * @param {Object} savedRoute - Saved route config from preferences
   * @param {Object} locations - { home, cafe, work } with lat/lon
   * @param {string} arrivalTime - Target arrival time
   */
  useSelectedRoute(savedRoute, locations, arrivalTime) {
    if (!savedRoute?.enabled || !savedRoute?.alternatives?.length) {
      return null;
    }

    const selectedIndex = savedRoute.selectedAlternative || 0;
    const selected = savedRoute.alternatives[selectedIndex];
    
    if (!selected) {
      return null;
    }

    // Build modes array from the selected alternative
    const modes = selected.modes.map(m => ({
      type: m.type,
      routeNumber: m.routeNumber,
      originStation: m.originStation,
      destinationStation: m.destinationStation,
      estimatedDuration: m.estimatedDuration || null
    }));

    return {
      routeId: selected.id,
      routeName: selected.name,
      description: selected.description,
      modes
    };
  }

  /**
   * Get available route alternatives for display/selection
   * @param {Object} routePrefs - Route preferences from config
   */
  getRouteAlternatives(routePrefs) {
    const alternatives = routePrefs?.savedRoute?.alternatives || [];
    const selectedIndex = routePrefs?.savedRoute?.selectedAlternative || 0;
    
    return alternatives.map((alt, index) => ({
      ...alt,
      isSelected: index === selectedIndex,
      index
    }));
  }

  /**
   * Smart journey planner - auto-discovers alternatives and uses preferred route
   * @param {Object} params.locations - { home, cafe, work }
   * @param {Array} params.allStops - All stops from timetable data
   * @param {Object} params.routePrefs - User's route preferences
   * @param {string} params.arrivalTime - Target arrival time
   * @param {number} params.selectedAlternative - Index of selected alternative (optional)
   */
  async calculateWithPreferredRoute(params) {
    const { locations, allStops, routePrefs, arrivalTime, cafeDuration, selectedAlternative } = params;
    
    // Auto-discover route alternatives
    let alternatives = [];
    if (allStops?.length > 0) {
      alternatives = this.discoverRouteAlternatives(locations, allStops, routePrefs);
    }
    
    // Check if user has manually selected an alternative
    const selectedIndex = selectedAlternative ?? routePrefs?.savedRoute?.selectedAlternative ?? 0;
    
    // Use discovered alternative if available
    if (alternatives.length > 0) {
      const selected = alternatives[Math.min(selectedIndex, alternatives.length - 1)];
      const result = this.calculateMultiModalJourney({
        locations,
        modes: selected.modes,
        routePrefs,
        arrivalTime,
        cafeDuration
      });
      
      // Attach alternatives to result for UI
      if (result.success) {
        result.alternatives = alternatives;
        result.selectedAlternative = selectedIndex;
      }
      
      return result;
    }
    
    // Check for manually saved route
    const savedRoute = this.useSelectedRoute(routePrefs?.savedRoute, locations, arrivalTime);
    if (savedRoute?.modes?.length > 0) {
      return this.calculateMultiModalJourney({
        locations,
        modes: savedRoute.modes,
        routePrefs,
        arrivalTime,
        cafeDuration
      });
    }
    
    // Fall back to basic auto-calculation
    return this.calculateJourney({
      homeLocation: locations.home,
      workLocation: locations.work,
      cafeLocation: locations.cafe,
      workStartTime: arrivalTime,
      cafeDuration
    });
  }

  /**
   * Calculate multi-modal journey with up to 4 transit modes
   * Supports: Walk → Mode1 → [Walk] → Mode2 → [Walk] → Mode3 → [Walk] → Mode4 → Walk
   * @param {Object} params - Journey parameters
   * @param {Object} params.locations - { home, cafe, work } with lat/lon
   * @param {Array} params.modes - Array of mode configs (1-4 modes)
   * @param {Object} params.routePrefs - Route preferences from config
   * @param {string} params.arrivalTime - Target arrival time (HH:MM)
   */
  calculateMultiModalJourney(params) {
    const { locations, modes, routePrefs, arrivalTime, cafeDuration = 5 } = params;
    const segments = [];
    
    if (!modes || modes.length === 0 || modes.length > 4) {
      return { success: false, error: 'Must have 1-4 transit modes' };
    }

    // Get walking constraints from preferences
    const maxWalk = routePrefs?.walking?.maxDistanceMeters || 500;
    const walkSpeed = 80; // meters per minute

    // Track current position through the journey
    let currentPos = locations.home;
    let totalMinutes = 0;

    // Optional: Start with cafe
    if (locations.cafe) {
      const walkToCafe = this.haversineDistance(
        currentPos.lat, currentPos.lon,
        locations.cafe.lat, locations.cafe.lon
      );
      const walkMinutes = Math.ceil(walkToCafe / walkSpeed);
      
      segments.push({
        type: 'walk',
        from: 'Home',
        to: 'Cafe',
        distance: Math.round(walkToCafe),
        minutes: walkMinutes
      });
      totalMinutes += walkMinutes;

      segments.push({
        type: 'coffee',
        location: 'Cafe',
        minutes: cafeDuration
      });
      totalMinutes += cafeDuration;

      currentPos = locations.cafe;
    }

    // Process each transit mode (up to 4)
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i];
      const isFirstMode = (i === 0 && !locations.cafe) || (i === 0 && locations.cafe);
      const isLastMode = (i === modes.length - 1);

      // Walk to this mode's origin station
      const walkToStation = this.haversineDistance(
        currentPos.lat, currentPos.lon,
        mode.originStation.lat, mode.originStation.lon
      );

      // Check walking distance constraint
      // Walk distance check (no action needed)

      const walkMinutes = Math.ceil(walkToStation / walkSpeed);
      segments.push({
        type: 'walk',
        from: isFirstMode ? (locations.cafe ? 'Cafe' : 'Home') : modes[i-1].destinationStation.name,
        to: mode.originStation.name,
        distance: Math.round(walkToStation),
        minutes: walkMinutes
      });
      totalMinutes += walkMinutes;

      // Wait time (average 2-3 min)
      const waitMinutes = 2;
      segments.push({
        type: 'wait',
        location: mode.originStation.name,
        minutes: waitMinutes
      });
      totalMinutes += waitMinutes;

      // Transit leg
      const transitMinutes = mode.estimatedDuration || 
        this.estimateTransitTime(mode.originStation, mode.destinationStation);
      
      segments.push({
        type: 'transit',
        mode: this.getModeName(mode.type),
        icon: this.getModeIcon(mode.type),
        routeType: mode.type,
        from: mode.originStation.name,
        to: mode.destinationStation.name,
        minutes: transitMinutes,
        leg: i + 1
      });
      totalMinutes += transitMinutes;

      // Update current position to destination station
      currentPos = mode.destinationStation;
    }

    // Final walk to work
    const walkToWork = this.haversineDistance(
      currentPos.lat, currentPos.lon,
      locations.work.lat, locations.work.lon
    );
    const finalWalkMinutes = Math.ceil(walkToWork / walkSpeed);
    
    segments.push({
      type: 'walk',
      from: modes[modes.length - 1].destinationStation.name,
      to: 'Work',
      distance: Math.round(walkToWork),
      minutes: finalWalkMinutes
    });
    totalMinutes += finalWalkMinutes;

    // Calculate departure time from arrival time
    const [arrHours, arrMins] = arrivalTime.split(':').map(Number);
    const arrivalMinutes = arrHours * 60 + arrMins;
    const departureMinutes = arrivalMinutes - totalMinutes;
    const depHours = Math.floor(departureMinutes / 60);
    const depMins = departureMinutes % 60;
    const departureTime = String(depHours).padStart(2, '0') + ':' + String(depMins).padStart(2, '0');

    // Add times to each segment (working backwards)
    let currentMinutes = arrivalMinutes;
    for (let i = segments.length - 1; i >= 0; i--) {
      currentMinutes -= segments[i].minutes;
      const h = Math.floor(currentMinutes / 60);
      const m = currentMinutes % 60;
      segments[i].time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    return {
      success: true,
      journey: {
        departureTime,
        arrivalTime,
        totalMinutes,
        numberOfModes: modes.length,
        segments,
        summary: modes.map(m => this.getModeIcon(m.type)).join(' → ')
      }
    };
  }

  /**
   * Build a mode config for multi-modal journey
   */
  buildModeConfig(type, originStation, destinationStation, estimatedDuration = null) {
    return {
      type,
      originStation: {
        name: originStation.name,
        id: originStation.id,
        lat: originStation.lat,
        lon: originStation.lon
      },
      destinationStation: {
        name: destinationStation.name,
        id: destinationStation.id,
        lat: destinationStation.lat,
        lon: destinationStation.lon
      },
      estimatedDuration
    };
  }
}

export default JourneyPlanner;
