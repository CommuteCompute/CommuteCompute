/**
 * Dashboard Service
 * 
 * Coordinates the Journey Planner, Coffee Decision Engine, and V13 Dashboard Renderer
 * to produce the final output for devices.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import RoutePlanner from '../core/route-planner.js';
import CoffeeDecision from '../core/coffee-decision.js';
import * as ccdashRenderer from './ccdash-renderer.js';
import SmartJourneyIntegration from './smart-journey-integration.js';

class DashboardService {
  constructor(preferences = null) {
    this.preferences = preferences;
    this.routePlanner = null;
    this.coffeeDecision = null;
    this.smartJourney = null;  // Smart journey integration
    this.renderer = ccdashRenderer;
    
    // Cache for computed data
    this.cache = {
      journey: null,
      journeyExpiry: null,
      transit: null,
      transitExpiry: null,
      smartDecision: null,
      smartDecisionExpiry: null
    };
    
    this.JOURNEY_CACHE_MS = 5 * 60 * 1000; // 5 minutes
    this.TRANSIT_CACHE_MS = 20 * 1000; // 20 seconds
    this.SMART_DECISION_CACHE_MS = 30 * 1000; // 30 seconds for live updates
  }

  /**
   * Initialize with preferences
   * @param {Object} preferences - User preferences object
   */
  initialize(preferences) {
    this.preferences = preferences;
    const prefs = preferences?.get ? preferences.get() : preferences;
    
    this.routePlanner = new RoutePlanner(preferences);
    this.coffeeDecision = new CoffeeDecision({
      walkToWork: prefs?.walkToWork || 5,
      homeToCafe: prefs?.homeToCafe || 5,
      makeCoffee: prefs?.makeCoffee || 5,
      cafeToTransit: prefs?.cafeToTransit || 2
    }, preferences);

    // Initialize smart journey integration (connects to CoffeeDecision + live updates)
    this.smartJourney = new SmartJourneyIntegration(preferences);
    this.smartJourney.initialize(preferences);

    // Set target arrival time from preferences
    if (prefs?.arrivalTime) {
      const [hours, minutes] = prefs.arrivalTime.split(':').map(Number);
      this.coffeeDecision.setTargetArrival(hours, minutes);
    }
  }

  /**
   * Get cached or fresh journey data
   */
  async getJourneyData(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && this.cache.journey && this.cache.journeyExpiry > now) {
      return this.cache.journey;
    }

    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;
    
    if (!prefs?.homeAddress || !prefs?.workAddress) {
      return null;
    }

    try {
      const journey = await this.routePlanner.calculateRoute(
        prefs.homeAddress,
        prefs.coffeeAddress || prefs.cafeAddress,
        prefs.workAddress,
        prefs.arrivalTime || '09:00',
        prefs.manualWalkingTimes || {},
        prefs.addressFlags || {},
        prefs.journeyConfig || {}
      );

      this.cache.journey = journey;
      this.cache.journeyExpiry = now + this.JOURNEY_CACHE_MS;

      return journey;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get coffee decision based on current transit data
   * @param {Object} transitData - Real-time transit data
   * @param {string} alertText - Service alert text
   */
  getCoffeeDecision(transitData, alertText = '') {
    if (!this.coffeeDecision) {
      return { decision: 'NO DATA', subtext: 'Configure journey first', canGet: false, urgent: false };
    }

    const nextTrain = transitData?.trains?.[0]?.minutes || 30;
    const tramData = transitData?.trams || [];

    return this.coffeeDecision.calculate(nextTrain, tramData, alertText);
  }

  /**
   * Get smart journey decision with live transit integration
   * Uses SmartRouteRecommender + CoffeeDecision + live updates
   * 
   * Pattern: Home → Coffee → Tram → Train → Work (multi-modal)
   * 
   * @param {Object} openDataService - OpenData service for live transit
   * @param {Array} allStops - All available transit stops
   * @param {boolean} forceRefresh - Force refresh cached data
   * @returns {Object} Complete journey decision with coffee recommendation
   */
  async getSmartJourneyDecision(openDataService, allStops = [], forceRefresh = false) {
    if (!this.smartJourney) {
      return null;
    }

    const now = Date.now();
    
    // Check cache (30 seconds for live updates)
    if (!forceRefresh && this.cache.smartDecision && this.cache.smartDecisionExpiry > now) {
      return this.cache.smartDecision;
    }

    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;

    // Build locations from preferences
    const locations = {
      home: prefs?.homeLocation || prefs?.homeAddress,
      cafe: prefs?.cafeLocation || prefs?.coffeeAddress,
      work: prefs?.workLocation || prefs?.workAddress
    };

    // Fetch live transit data
    const liveTransit = await this.fetchTransitData(openDataService);
    
    // Fetch alerts
    const alerts = await this.fetchAlerts(openDataService);
    const alertText = alerts?.[0]?.text || '';

    // Get smart decision
    const decision = await this.smartJourney.getSmartJourneyDecision({
      locations,
      allStops,
      liveTransit,
      alertText
    });

    // Cache result
    this.cache.smartDecision = decision;
    this.cache.smartDecisionExpiry = now + this.SMART_DECISION_CACHE_MS;

    return decision;
  }

  /**
   * Update journey from smart recommendation
   * Syncs the CoffeeDecision engine with the smart route
   */
  syncFromSmartRecommendation(recommendation) {
    if (!recommendation?.route || !this.coffeeDecision) return;

    // Update coffee decision timings from recommended route
    const route = recommendation.route;
    
    if (route.coffeeSegments) {
      this.coffeeDecision.commute.homeToCafe = route.coffeeSegments.walkToCafe || 5;
      this.coffeeDecision.commute.makeCoffee = route.coffeeSegments.coffeeTime || 5;
      this.coffeeDecision.commute.cafeToTransit = route.coffeeSegments.walkToStation || 2;
    }

    if (route.modes?.length > 0) {
      this.coffeeDecision.commute.transitRide = route.modes[0]?.estimatedDuration || 5;
      if (route.modes.length > 1) {
        this.coffeeDecision.commute.trainRide = route.modes[1]?.estimatedDuration || 15;
      }
    }

    if (route.walkingSegments?.stationToWork) {
      this.coffeeDecision.commute.walkToWork = route.walkingSegments.stationToWork;
    }

  }

  /**
   * Fetch real-time transit data
   * @param {Object} openDataService - OpenData service instance
   */
  async fetchTransitData(openDataService) {
    const now = Date.now();
    
    if (this.cache.transit && this.cache.transitExpiry > now) {
      return this.cache.transit;
    }

    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;
    
    if (!prefs?.homeStop) {
      return { trains: [], trams: [], buses: [] };
    }

    try {
      const transitData = {
        trains: [],
        trams: [],
        buses: []
      };

      // Fetch departures based on configured modes
      if (openDataService) {
        // Use OpenData service if available
        const departures = await openDataService.getDepartures(
          prefs.homeStop.id,
          prefs.homeStop.type
        );
        
        if (departures) {
          // Sort by departure time
          const sorted = departures.sort((a, b) => a.minutes - b.minutes);
          
          // Categorize by type
          sorted.forEach(dep => {
            if (dep.routeType === 0) transitData.trains.push(dep);
            else if (dep.routeType === 1) transitData.trams.push(dep);
            else if (dep.routeType === 2) transitData.buses.push(dep);
          });
        }
      }

      this.cache.transit = transitData;
      this.cache.transitExpiry = now + this.TRANSIT_CACHE_MS;

      return transitData;
    } catch (error) {
      return { trains: [], trams: [], buses: [] };
    }
  }

  /**
   * Get service alerts
   * @param {Object} openDataService - OpenData service instance
   */
  async fetchAlerts(openDataService) {
    if (!openDataService) return [];

    try {
      const alerts = await openDataService.getServiceAlerts();
      return alerts?.map(a => ({
        text: a.headerText || a.description,
        severity: a.severity || 'info',
        routes: a.affectedRoutes || []
      })) || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get weather data
   * @param {Object} weatherService - Weather service instance
   */
  async fetchWeather(weatherService) {
    if (!weatherService) return null;

    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;
    
    try {
      return await weatherService.getCurrentWeather(
        prefs?.location?.lat,
        prefs?.location?.lon
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * Render dashboard for device
   * Main entry point for device requests
   * 
   * @param {Object} options - Render options
   * @returns {Buffer|Object} PNG buffer or zone data
   */
  async renderDashboard(options = {}) {
    const {
      deviceType = 'trmnl-og',
      format = 'png',
      openDataService = null,
      weatherService = null,
      forceRefresh = false
    } = options;

    // Gather all data
    const [journeyData, transitData, alerts, weather] = await Promise.all([
      this.getJourneyData(forceRefresh),
      this.fetchTransitData(openDataService),
      this.fetchAlerts(openDataService),
      this.fetchWeather(weatherService)
    ]);

    // Get coffee decision
    const alertText = alerts?.[0]?.text || '';
    const coffeeDecision = this.getCoffeeDecision(transitData, alertText);

    // Update coffee decision with journey timings if available
    if (journeyData) {
      this.coffeeDecision.updateFromJourney(journeyData);
    }

    // Render dashboard
    return this.renderer.render({
      journeyData,
      coffeeDecision,
      transitData,
      alerts,
      weather,
      deviceType,
      format
    });
  }

  /**
   * Render for TRMNL display webhook (returns PNG)
   */
  async renderForTRMNL(openDataService, weatherService) {
    return this.renderDashboard({
      deviceType: 'trmnl-og',
      format: 'png',
      openDataService,
      weatherService
    });
  }

  /**
   * Render for Kindle (returns PNG at device resolution)
   */
  async renderForKindle(kindleModel, openDataService, weatherService) {
    const deviceMap = {
      'pw3': 'kindle-pw3',
      'pw4': 'kindle-pw3', // Same resolution as PW3
      'pw5': 'kindle-pw5',
      'basic': 'kindle-basic',
      'kindle-pw3': 'kindle-pw3',
      'kindle-pw5': 'kindle-pw5',
      'kindle-basic': 'kindle-basic'
    };

    const deviceType = deviceMap[kindleModel] || 'kindle-pw3';

    return this.renderDashboard({
      deviceType,
      format: 'png',
      openDataService,
      weatherService
    });
  }

  /**
   * Render zones for partial refresh
   */
  async renderZones(deviceType, openDataService, weatherService, forceAll = false) {
    const result = await this.renderDashboard({
      deviceType,
      format: 'zones',
      openDataService,
      weatherService
    });

    if (forceAll) {
      // Mark all zones as changed
      result.zones.forEach(z => {
        if (!z.changed) {
          z.changed = true;
          z.imageBase64 = this.renderer.renderSingleZone(
            z.id,
            result.data,
            this.renderer.getDeviceConfig(deviceType)
          );
        }
      });
    }

    return result;
  }

  /**
   * Get JSON data (for debugging/preview)
   */
  async getJsonData(openDataService, weatherService) {
    return this.renderDashboard({
      format: 'json',
      openDataService,
      weatherService
    });
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.cache = {
      journey: null,
      journeyExpiry: null,
      transit: null,
      transitExpiry: null
    };
    this.renderer.clearCache();
    this.routePlanner?.clearCache();
  }

  /**
   * Check if service is ready
   */
  isReady() {
    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;
    return !!(prefs?.homeAddress && prefs?.workAddress && prefs?.homeStop);
  }

  /**
   * Get setup status for device polling
   */
  getSetupStatus() {
    const prefs = this.preferences?.get ? this.preferences.get() : this.preferences;
    
    return {
      setupComplete: this.isReady(),
      serverTime: new Date().toISOString(),
      version: '3.0.0',
      homeStop: prefs?.homeStop ? {
        name: prefs.homeStop.name,
        id: prefs.homeStop.id
      } : null,
      workStop: prefs?.workStop ? {
        name: prefs.workStop.name,
        id: prefs.workStop.id
      } : null
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DashboardService };
export default DashboardService;
