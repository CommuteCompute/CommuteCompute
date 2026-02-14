/**
 * Commute Compute Server
 * BYOS (Bring Your Own Server) implementation for TRMNL e-ink display
 * Serves transit data in PIDS format for Australian transit systems
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// Per Section 17.5: No dotenv - Zero-Config uses KV storage only
import express from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { execSync } from 'child_process';
import config from './utils/config.js';
import { getSnapshot } from './data/data-scraper.js';
import CoffeeDecision from './core/coffee-decision.js';
import WeatherBOM from './services/weather-bom.js';
import RoutePlanner from './core/route-planner.js';
import CafeBusyDetector from './services/cafe-busy-detector.js';
import PreferencesManager from './data/preferences-manager.js';
import JourneyPlanner from './services/journey-planner.js';
import GeocodingService from './services/geocoding-service.js';
import DecisionLogger from './core/decision-logger.js';
import DataValidator from './data/data-validator.js';
import { getPrimaryCityForState } from './utils/australian-cities.js';
import fallbackTimetables from './data/fallback-timetables.js';
import { readFileSync } from 'fs';
import nodemailer from 'nodemailer';
import safeguards from './utils/deployment-safeguards.js';
import { decodeConfigToken, encodeConfigToken, generateWebhookUrl } from './utils/config-token.js';
// image-renderer merged into ccdash-renderer
import { renderZones, clearCache as clearZoneCache, ZONES, renderFullScreen as renderDashboard, renderTestPattern } from "./services/ccdash-renderer.js";
import { getChangedZones as getChangedZonesV13, renderSingleZone as renderSingleZoneV13, getZoneDefinition as getZoneDefV13, ZONES as ZONES_V13, clearCache as clearZoneCacheV13 } from "./services/ccdash-renderer.js";
import { getChangedZones as getChangedZonesCCDash, renderSingleZone as renderSingleZoneCCDash, getZoneDefinition as getZoneDefCCDash, getActiveZones as getActiveZonesCCDash, ZONES as ZONES_CCDASH, clearCache as clearZoneCacheCCDash, renderFullScreen as renderFullScreenCCDash } from "./services/ccdash-renderer.js";
import CommuteCompute from "./engines/commute-compute.js";
import { getTransitApiKey, getGoogleApiKey, getStorageStatus } from "./data/kv-preferences.js";

// Setup error handlers early (before any async operations)
safeguards.setupErrorHandlers();

// Read version from package.json
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Location-agnostic timezone helper
 * Maps Australian states to their IANA timezones
 * COMPLIANCE: DEVELOPMENT-RULES.md Section K (Location Agnostic)
 */
function getTimezoneForState(state) {
  const timezones = {
    'VIC': 'Australia/Melbourne',
    'NSW': 'Australia/Sydney',
    'ACT': 'Australia/Sydney',
    'QLD': 'Australia/Brisbane',
    'SA': 'Australia/Adelaide',
    'WA': 'Australia/Perth',
    'TAS': 'Australia/Hobart',
    'NT': 'Australia/Darwin'
  };
  return timezones[state] || 'Australia/Sydney'; // Fallback to Sydney (AEST)
}

// Email configuration (using environment variables)
let emailTransporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Middleware
app.use(express.json());
app.use(safeguards.requestTimeout(30000)); // 30 second timeout for all requests

// Validate environment on startup
const envCheck = safeguards.validateEnvironment();
safeguards.log(safeguards.LOG_LEVELS.INFO, 'Server starting', {
  version: VERSION,
  node: process.version,
  environment: envCheck
});

// Initialize preferences first (needed by other modules for state-agnostic operation)
const preferences = new PreferencesManager();

// Configuration validation flag
let isConfigured = false;

// Initialize all modules (pass preferences where needed for state awareness)
const coffeeEngine = new CoffeeDecision();
const weather = new WeatherBOM(preferences);
const routePlanner = new RoutePlanner(preferences);
const busyDetector = new CafeBusyDetector(preferences);
const journeyPlanner = new JourneyPlanner(); // Compliant implementation

// Initialize multi-tier geocoding service (global for route planner)
// Check for API keys in preferences (saved via admin panel) or environment variables
const prefs = preferences.get();

// Set services as globals for admin endpoints
global.journeyPlanner = journeyPlanner; // Compliant implementation
global.weatherBOM = weather;
global.fallbackTimetables = fallbackTimetables; // For journey planner stop lookup

// Initialize Smart Journey Engine V2 (auto-detects preferred journey from config)
const commuteCompute = new CommuteCompute(preferences);
commuteCompute.initialize().then(() => {
  global.commuteCompute = commuteCompute;
}).catch(err => {
});

// Smart Journey Planner - combines geocoding + stop detection for admin setup
const smartJourneyPlanner = {
  /**
   * Detect Australian state from coordinates
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {string} State code (VIC, NSW, QLD, etc.)
   */
  detectStateFromCoordinates(lat, lon) {
    // Approximate bounding boxes for Australian states
    const states = [
      { code: 'VIC', minLat: -39.2, maxLat: -34.0, minLon: 140.9, maxLon: 150.0 },
      { code: 'NSW', minLat: -37.5, maxLat: -28.2, minLon: 140.9, maxLon: 153.6 },
      { code: 'QLD', minLat: -29.2, maxLat: -10.7, minLon: 138.0, maxLon: 153.6 },
      { code: 'SA', minLat: -38.1, maxLat: -26.0, minLon: 129.0, maxLon: 141.0 },
      { code: 'WA', minLat: -35.1, maxLat: -13.7, minLon: 112.9, maxLon: 129.0 },
      { code: 'TAS', minLat: -43.7, maxLat: -39.6, minLon: 143.8, maxLon: 148.5 },
      { code: 'NT', minLat: -26.0, maxLat: -10.9, minLon: 129.0, maxLon: 138.0 },
      { code: 'ACT', minLat: -35.9, maxLat: -35.1, minLon: 148.8, maxLon: 149.4 }
    ];

    for (const state of states) {
      if (lat >= state.minLat && lat <= state.maxLat &&
          lon >= state.minLon && lon <= state.maxLon) {
        return state.code;
      }
    }

    // Default to VIC if coordinates don't match any state (likely Melbourne area)
    return 'VIC';
  },

  /**
   * Find nearby transit stops using fallback timetable data
   * @param {Object} location - { lat, lon } coordinates
   * @param {Object} apiCredentials - Unused (for compatibility)
   * @returns {Array} Array of nearby stops with metadata
   */
  async findNearbyStops(location, apiCredentials = null) {
    if (!location?.lat || !location?.lon) {
      return [];
    }

    // Detect state from coordinates
    const state = this.detectStateFromCoordinates(location.lat, location.lon);
    // Get all stops for this state from fallback timetables
    const allStops = fallbackTimetables.getStopsForState(state);
    if (!allStops || allStops.length === 0) {
      return [];
    }

    // Calculate distance to each stop and filter nearby ones
    const stopsWithDistance = allStops.map(stop => {
      const distance = this.haversineDistance(location.lat, location.lon, stop.lat, stop.lon);
      return {
        ...stop,
        stop_id: stop.id,
        stop_name: stop.name,
        distance: Math.round(distance),
        walkingMinutes: Math.ceil(distance / 80), // 80m/min walking speed
        route_type_name: this.getRouteTypeName(stop.route_type)
      };
    })
    .filter(stop => stop.distance < 2000) // Within 2km
    .sort((a, b) => {
      // Prioritize by mode (train > tram > bus), then by distance
      const modePriority = { 0: 1, 1: 2, 2: 3, 3: 1.5 }; // train, tram, bus, vline
      const aPriority = modePriority[a.route_type] || 4;
      const bPriority = modePriority[b.route_type] || 4;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.distance - b.distance;
    });

    return stopsWithDistance;
  },

  /**
   * Haversine distance calculation (meters)
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
  },

  /**
   * Get route type display name
   */
  getRouteTypeName(routeType) {
    const types = { 0: 'Train', 1: 'Tram', 2: 'Bus', 3: 'V/Line', 4: 'Ferry' };
    return types[routeType] || 'Transit';
  }
};

global.geocodingService = new GeocodingService({
  googlePlacesKey: prefs.additionalAPIs?.google_places || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_KEY,
  mapboxToken: prefs.additionalAPIs?.mapbox || process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN
});

// Initialize decision logger (global for transparency and troubleshooting)
global.decisionLogger = new DecisionLogger();

// Test the decision logger immediately
if (global.decisionLogger) {
  global.decisionLogger.log({
    category: 'System',
    decision: 'Server started',
    details: {
      version: VERSION,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version
    }
  });
}

// Journey calculation cache (automatically updated in background)
let cachedJourney = null;
let journeyCalculationInterval = null;
const JOURNEY_CALC_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Automatic Journey Calculation
 * Runs in background to keep transit data up-to-date without manual admin login
 */
async function calculateAndCacheJourney() {
  try {
    const prefs = preferences.get();

    // Check if preferences are configured
    if (!prefs.addresses?.home || !prefs.addresses?.work || !prefs.journey?.arrivalTime) {
      return null;
    }

    // Use compliant JourneyPlanner (fallback timetables, no legacy API)

    const result = await journeyPlanner.calculateJourney({
      homeLocation: {
        lat: prefs.addresses.homeCoords?.lat,
        lon: prefs.addresses.homeCoords?.lon,
        formattedAddress: prefs.addresses.home
      },
      workLocation: {
        lat: prefs.addresses.workCoords?.lat,
        lon: prefs.addresses.workCoords?.lon,
        formattedAddress: prefs.addresses.work
      },
      cafeLocation: prefs.addresses.cafe ? {
        lat: prefs.addresses.cafeCoords?.lat,
        lon: prefs.addresses.cafeCoords?.lon,
        formattedAddress: prefs.addresses.cafe
      } : null,
      workStartTime: prefs.journey.arrivalTime,
      cafeDuration: 8,
      transitAuthority: prefs.detectedState || 'VIC'
    });

    if (!result.success) {
      return null;
    }

    const journey = result.journey;

    cachedJourney = {
      ...journey,
      calculatedAt: new Date().toISOString(),
      autoCalculated: true
    };


    // Log the calculation
    if (global.decisionLogger) {
      global.decisionLogger.log({
        category: 'Journey Planning',
        decision: 'Automatic journey calculation completed',
        details: {
          arrivalTime: prefs.journey.arrivalTime,
          coffeeIncluded: prefs.journey.coffeeEnabled,
          timestamp: cachedJourney.calculatedAt
        }
      });
    }

    return cachedJourney;
  } catch (error) {

    // Log the failure
    if (global.decisionLogger) {
      global.decisionLogger.log({
        category: 'Journey Planning',
        decision: 'Automatic journey calculation failed',
        details: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }

    return null;
  }
}

/**
 * Start automatic journey calculation
 */
function startAutomaticJourneyCalculation() {
  // Clear any existing interval
  if (journeyCalculationInterval) {
    clearInterval(journeyCalculationInterval);
  }

  // Calculate immediately
  calculateAndCacheJourney();

  // Schedule recurring calculations
  journeyCalculationInterval = setInterval(calculateAndCacheJourney, JOURNEY_CALC_INTERVAL);

}

// Load preferences on startup
preferences.load().then(() => {
  const status = preferences.getStatus();
  isConfigured = status.configured;

  // Re-initialize geocoding service with API keys from preferences (if any)
  const prefs = preferences.get();
  if (prefs.additionalAPIs?.google_places || prefs.additionalAPIs?.mapbox) {
    global.geocodingService = new GeocodingService({
      googlePlacesKey: prefs.additionalAPIs.google_places || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_KEY,
      mapboxToken: prefs.additionalAPIs.mapbox || process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN
    });
  }

  if (!isConfigured) {
  } else {
    // Start automatic journey calculation if configured
    startAutomaticJourneyCalculation();
  }
});

/**
 * Configuration Validation Middleware
 * Ensures critical endpoints are only accessible when system is configured
 */
function requireConfiguration(req, res, next) {
  if (!isConfigured) {
    // Check if this is a setup-related or admin route
    const allowedPaths = ['/setup', '/admin', '/api/version', '/api/transit-authorities'];
    const isAllowed = allowedPaths.some(path => req.path.startsWith(path));

    if (isAllowed) {
      return next();
    }

    // For API endpoints, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        error: 'System not configured',
        message: 'Please complete the setup wizard at /setup',
        configured: false
      });
    }

    // For HTML pages, redirect to setup wizard
    return res.redirect('/setup');
  }

  next();
}

/**
 * Fallback timetable - typical weekday schedule
 * Used when API is unavailable
 * Destinations are configurable via user preferences
 */
function getFallbackTimetable() {
  // Get user's timezone from preferences (location-agnostic design)
  const prefs = preferences.get();
  const state = prefs.state || 'VIC';
  const timezone = getTimezoneForState(state);

  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

  // Get configured destinations from preferences, or use generic defaults
  const trainDest = prefs?.journey?.transitRoute?.mode1?.destinationStation?.name || 'City';
  const tramDest = prefs?.journey?.transitRoute?.mode2?.destinationStation?.name || 'City';

  // Typical weekday schedule including Night Network
  const trainSchedule = []; 
  // Day services: 5am-midnight
  for (let h = 5; h <= 23; h++) {
    for (let m = 0; m < 60; m += (h >= 7 && h <= 9) || (h >= 16 && h <= 19) ? 5 : 10) {
      trainSchedule.push(h * 60 + m);
    }
  }
  // Night Network: midnight-1am (Fri/Sat nights)
  for (let m = 0; m < 60; m += 20) {
    trainSchedule.push(m); // 00:00, 00:20, 00:40
    trainSchedule.push(60 + m); // 01:00, 01:20, 01:40
  }

  const tramSchedule = []; // Every 8-12 minutes
  for (let h = 5; h <= 23; h++) {
    for (let m = 0; m < 60; m += 10) {
      tramSchedule.push(h * 60 + m);
    }
  }
  // Night Network trams: midnight-2am
  for (let m = 0; m < 60; m += 15) {
    tramSchedule.push(m); // 00:xx
    tramSchedule.push(60 + m); // 01:xx
  }

  // Sort schedules (night services added out of order)
  trainSchedule.sort((a, b) => a - b);
  tramSchedule.sort((a, b) => a - b);

  // Find next departures
  const nextTrains = trainSchedule.filter(t => t > currentMinutes).slice(0, 3).map(t => ({
    minutes: Math.max(1, t - currentMinutes),
    destination: trainDest,
    isScheduled: true
  }));

  const nextTrams = tramSchedule.filter(t => t > currentMinutes).slice(0, 3).map(t => ({
    minutes: Math.max(1, t - currentMinutes),
    destination: tramDest,
    isScheduled: true
  }));

  return { trains: nextTrains, trams: nextTrams };
}

// Cache for data
let cachedData = null;
let lastUpdate = 0;
const CACHE_MS = 25 * 1000; // 25 seconds (device refreshes every 30s)

// Device tracking
const devicePings = new Map(); // deviceId -> { lastSeen, requestCount, ip }

function trackDevicePing(deviceId, ip) {
  const now = Date.now();
  const existing = devicePings.get(deviceId) || { requestCount: 0 };

  devicePings.set(deviceId, {
    lastSeen: now,
    requestCount: existing.requestCount + 1,
    ip: ip,
    status: 'online'
  });
}

// Mark devices offline if not seen in 2 minutes
setInterval(() => {
  const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
  for (const [deviceId, info] of devicePings.entries()) {
    if (info.lastSeen < twoMinutesAgo) {
      info.status = 'offline';
    }
  }
}, 30000); // Check every 30 seconds

// Persistent storage paths
const DEVICES_FILE = path.join(process.cwd(), 'devices.json');

/**
 * Load devices from persistent storage
 */
async function loadDevices() {
  try {
    const data = await fs.readFile(DEVICES_FILE, 'utf8');
    const devicesArray = JSON.parse(data);
    devicesArray.forEach(device => devices.set(device.macAddress, device));
  } catch (err) {
    if (err.code !== "ENOENT" && err.code !== "EACCES" && !process.env.VERCEL) {
    } else {
      // Vercel fallback: hardcoded device for serverless deployment
      // Generic example device - replace with your device via Setup Wizard
      devices.set("00:00:00:00:00:00", {
        macAddress: "00:00:00:00:00:00",
        apiKey: "your-device-api-key",
        friendlyID: "000000",
        registeredAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
    }
  }
}

/**
 * Save devices to persistent storage
 */
async function saveDevices() {
  try {
    const devicesArray = Array.from(devices.values());
    await fs.writeFile(DEVICES_FILE, JSON.stringify(devicesArray, null, 2));
  } catch (err) {
  }
}

/**
 * Fetch fresh data from all sources
 */
async function fetchData(providedApiKey = null) {
  try {
    // Per Section 3.4: API key from KV storage, not env vars
    const apiKey = providedApiKey || await getTransitApiKey();
    if (!apiKey) { throw new Error("No API key configured"); }
    const snapshot = await getSnapshot(apiKey);

    // Transform snapshot into format for renderer
    const now = new Date();

    // Process trains
    // Get configured destinations from preferences
    const prefs = preferences.get();
    const defaultTrainDest = prefs?.journey?.transitRoute?.mode1?.destinationStation?.name || 'City';
    const defaultTramDest = prefs?.journey?.transitRoute?.mode2?.destinationStation?.name || 'City';

    const trains = (snapshot.trains || []).slice(0, 5).map(train => {
      const departureTime = new Date(train.when);
      const minutes = Math.max(0, Math.round((departureTime - now) / 60000));
      return {
        minutes,
        destination: train.destination || defaultTrainDest,
        isScheduled: false
      };
    });

    // Process trams
    const trams = (snapshot.trams || []).slice(0, 5).map(tram => {
      const departureTime = new Date(tram.when);
      const minutes = Math.max(0, Math.round((departureTime - now) / 60000));
      return {
        minutes,
        destination: tram.destination || defaultTramDest,
        isScheduled: false
      };
    });

    // Coffee decision
    const nextTrain = trains[0] ? trains[0].minutes : 15;
    const coffee = coffeeEngine.calculate(nextTrain, trams, null);

    // Weather placeholder
    const weather = {
      temp: process.env.WEATHER_KEY ? '--' : '--',
      condition: 'Partly Cloudy',
      icon: '(cloud)'
    };

    // Service alerts
    const news = snapshot.alerts.metro > 0
      ? `[!] ${snapshot.alerts.metro} Metro alert(s)`
      : null;

    return {
      trains,
      trams,
      weather,
      news,
      coffee,
      meta: snapshot.meta
    };
  } catch (error) {

    // Use fallback static timetable
    const fallback = getFallbackTimetable();

    return {
      trains: fallback.trains,
      trams: fallback.trams,
      weather: { temp: '--', condition: 'Partly Cloudy', icon: '(cloud)' },
      news: null,
      coffee: { canGet: false, decision: 'SCHEDULED', subtext: 'Using timetable', urgent: false },
      meta: { generatedAt: new Date().toISOString(), mode: 'fallback' }
    };
  }
}

/**
 * Get cached or fresh data
 */
async function getData(providedApiKey = null) {
  const now = Date.now();
  if (cachedData && (now - lastUpdate) < CACHE_MS) {
    return cachedData;
  }

  const data = await fetchData(providedApiKey);
  if (!providedApiKey) { cachedData = data; lastUpdate = now; }
  return data;
}

/**
 * Get region updates (dynamic data for firmware)
 * Server does ALL calculation - firmware just displays these values
 */
async function getRegionUpdates() {
  const data = await getData();
  const prefs = preferences.get();
  const state = prefs.state || 'VIC';
  const timezone = getTimezoneForState(state);

  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit', minute: '2-digit', hour12: false
  });

  // Fetch weather data (cached for 15 minutes)
  let weatherData = null;
  try {
    weatherData = await weather.getCurrentWeather();
  } catch (error) {
  }

  // Get station names from preferences
  const stationName = prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'STATION';
  const destName = prefs?.journey?.transitRoute?.mode1?.destinationStation?.name || 'CITY';

  // Calculate "leave by" time (server does the math!)
  const nextTrain = data.trains[0];
  const walkBuffer = 5; // 5 min walk to station
  let leaveTime = '--:--';
  if (nextTrain) {
    const leaveInMins = Math.max(0, nextTrain.minutes - walkBuffer);
    leaveTime = new Date(now.getTime() + leaveInMins * 60000).toLocaleTimeString('en-AU', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  // Define regions for firmware (simple format: id + text only)
  const regions = [];

  // Station name
  regions.push({ id: 'station', text: stationName.toUpperCase() });

  // Current time
  regions.push({ id: 'time', text: timeFormatter.format(now) });

  // LEAVE BY time (most important - server calculates this!)
  regions.push({ id: 'leaveTime', text: leaveTime });

  // Coffee decision (server decides!)
  regions.push({ id: 'coffee', text: data.coffee.canGet ? 'YES' : 'NO' });

  // Train times (2 departures)
  for (let i = 0; i < 2; i++) {
    regions.push({
      id: `train${i + 1}`,
      text: data.trains[i] ? `${data.trains[i].minutes}` : '--'
    });
  }

  // Tram times (2 departures)
  for (let i = 0; i < 2; i++) {
    regions.push({
      id: `tram${i + 1}`,
      text: data.trams[i] ? `${data.trams[i].minutes}` : '--'
    });
  }

  // Weather data (optional - display on right sidebar)
  if (weatherData) {
    regions.push({
      id: 'weather',
      text: weatherData.condition.short || weatherData.condition.full || 'N/A'
    });

    regions.push({
      id: 'temperature',
      text: weatherData.temperature !== null ? `${weatherData.temperature}` : '--'
    });
  } else {
    // Send placeholder weather if unavailable
    regions.push({
      id: 'weather',
      text: 'N/A'
    });

    regions.push({
      id: 'temperature',
      text: '--'
    });
  }

  return {
    timestamp: now.toISOString(),
    regions,
    weather: weatherData // Include full weather data for admin/debugging
  };
}

/* =========================================================
   ROUTES
   ========================================================= */

// Smart Landing Page - Detects setup state and shows appropriate view
app.get('/', (req, res) => {
  // Try multiple paths for Vercel compatibility
  const paths = [
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(__dirname, '..', 'public', 'index.html'),
    '/var/task/public/index.html'
  ];
  
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        return res.sendFile(p);
      }
    } catch (e) {
      // Continue to next path
    }
  }
  
  // Fallback: redirect to admin
  res.redirect('/admin');
});

// Health check endpoint (for monitoring/uptime checks)
app.get('/health', (req, res) => {
  res.send('[OK] Commute Compute service running');
});

// Keep-alive endpoint (for cron pings to prevent cold starts)
app.get('/api/keepalive', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    devices: devices.size
  });
});

// Version control endpoint
app.get('/api/version', (req, res) => {
  try {
    // Load VERSION.json for comprehensive version info
    const versionJsonPath = path.join(process.cwd(), 'VERSION.json');
    let versionData = null;

    try {
      versionData = JSON.parse(readFileSync(versionJsonPath, 'utf-8'));
    } catch (e) {
    }

    const gitDate = execSync('git log -1 --format="%ci"', { encoding: 'utf-8' }).trim().split(' ')[0];
    const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

    res.json({
      version: `v${VERSION}`,
      date: gitDate,
      build: gitHash,
      system: versionData?.system || null,
      components: versionData?.components || null,
      backend: versionData?.backend || null,
      firmware: versionData?.firmware || null
    });
  } catch (error) {
    // Fallback if not in a git repository
    const versionJsonPath = path.join(process.cwd(), 'VERSION.json');
    let versionData = null;

    try {
      versionData = JSON.parse(readFileSync(versionJsonPath, 'utf-8'));
    } catch (e) {
      // Ignore if VERSION.json doesn't exist
    }

    res.json({
      version: `v${VERSION}`,
      date: new Date().toISOString().split('T')[0],
      build: 'dev',
      system: versionData?.system || null,
      components: versionData?.components || null,
      backend: versionData?.backend || null,
      firmware: versionData?.firmware || null
    });
  }
});

/**
 * Get API Status and Configuration
 * Returns status of all configured APIs and services
 */
app.get('/api/system-status', (req, res) => {
  try {
    const prefs = preferences.get();

    // Gather all API and service statuses
    const status = {
      configured: isConfigured,
      location: {
        city: prefs?.location?.city || 'Not configured',
        state: prefs?.location?.stateName || 'Not configured',
        transitAuthority: prefs?.location?.authorityName || 'Not configured',
        timezone: prefs?.location?.timezone || 'Not configured'
      },
      apis: {
        transitAuthority: {
          name: prefs?.location?.authorityName || 'Not configured',
          baseUrl: prefs?.api?.baseUrl || 'Not configured',
          configured: !!(prefs?.api?.key && prefs?.api?.token),
          status: (prefs?.api?.key && prefs?.api?.token) ? 'active' : 'not-configured'
        },
        weather: {
          name: 'Bureau of Meteorology',
          service: weather.stationName || 'Not configured',
          configured: true,
          status: 'active',
          cacheStatus: weather.getCacheStatus ? weather.getCacheStatus() : null
        },
        geocoding: {
          name: 'Multi-Tier Geocoding',
          services: global.geocodingService ? global.geocodingService.getAvailableServices() : [],
          configured: true,
          status: 'active'
        },
        googlePlaces: {
          name: 'Google Places API',
          configured: !!process.env.GOOGLE_PLACES_API_KEY,
          status: process.env.GOOGLE_PLACES_API_KEY ? 'active' : 'optional'
        },
        mapbox: {
          name: 'Mapbox Geocoding',
          configured: !!process.env.MAPBOX_TOKEN,
          status: process.env.MAPBOX_TOKEN ? 'active' : 'optional'
        },
        here: {
          name: 'HERE Geocoding',
          configured: !!process.env.HERE_API_KEY,
          status: process.env.HERE_API_KEY ? 'active' : 'optional'
        }
      },
      journey: {
        addresses: {
          home: !!prefs?.addresses?.home,
          cafe: !!prefs?.addresses?.cafe,
          work: !!prefs?.addresses?.work
        },
        configured: !!(prefs?.addresses?.home && prefs?.addresses?.work),
        arrivalTime: prefs?.journey?.arrivalTime || 'Not set',
        coffeeEnabled: prefs?.journey?.coffeeEnabled || false,
        autoCalculation: {
          active: !!journeyCalculationInterval,
          lastCalculated: cachedJourney?.calculatedAt || null,
          nextCalculation: journeyCalculationInterval ? 'In 2 minutes' : 'Not active'
        }
      },
      transitStations: {
        mode1: {
          origin: prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'Not configured',
          destination: prefs?.journey?.transitRoute?.mode1?.destinationStation?.name || 'Not configured',
          type: prefs?.journey?.transitRoute?.mode1?.type !== undefined ?
            ['Train', 'Tram', 'Bus', 'V/Line'][prefs.journey.transitRoute.mode1.type] : 'Not configured'
        },
        mode2: prefs?.journey?.transitRoute?.numberOfModes === 2 ? {
          origin: prefs?.journey?.transitRoute?.mode2?.originStation?.name || 'Not configured',
          destination: prefs?.journey?.transitRoute?.mode2?.destinationStation?.name || 'Not configured',
          type: prefs?.journey?.transitRoute?.mode2?.type !== undefined ?
            ['Train', 'Tram', 'Bus', 'V/Line'][prefs.journey.transitRoute.mode2.type] : 'Not configured'
        } : null
      }
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      configured: false
    });
  }
});

/**
 * Get Required Attributions
 * Returns data source attributions based on configured transit authority
 */
app.get('/api/attributions', (req, res) => {
  try {
    const prefs = preferences.get();
    const attributions = [];

    // Software attribution (always shown)
    attributions.push({
      name: 'Commute Compute',
      text: 'Created by Angus Bergman',
      license: 'AGPL-3.0',
      required: true,
      priority: 1
    });

    // Transit Authority (based on configuration)
    const transitAuthority = prefs?.location?.transitAuthority || prefs?.location?.state;
    if (transitAuthority) {
      const authorityMappings = {
        'VIC': { name: 'Transport Victoria', text: 'Data © Transport Victoria', license: 'CC BY 4.0' },
        'NSW': { name: 'Transport for NSW', text: 'Data © Transport for NSW', license: 'CC BY 4.0' },
        'QLD': { name: 'TransLink', text: 'Data © TransLink Queensland', license: 'Open Data License' },
        'WA': { name: 'Transperth', text: 'Data © Transperth', license: 'Creative Commons' },
        'SA': { name: 'Adelaide Metro', text: 'Data © Adelaide Metro', license: 'Data.SA License' },
        'TAS': { name: 'Metro Tasmania', text: 'Data © Metro Tasmania', license: 'Open Data' },
        'ACT': { name: 'Transport Canberra', text: 'Data © Transport Canberra', license: 'CC BY 4.0' },
        'NT': { name: 'Department of Infrastructure', text: 'Data © NT Government', license: 'Open Data' }
      };

      const authority = authorityMappings[transitAuthority];
      if (authority) {
        attributions.push({
          name: authority.name,
          text: authority.text,
          license: authority.license,
          required: true,
          priority: 2
        });
      }
    }

    // Weather data (always used)
    attributions.push({
      name: 'Bureau of Meteorology',
      text: 'Weather data © Commonwealth of Australia, Bureau of Meteorology',
      license: 'CC BY 3.0 AU',
      required: true,
      priority: 3
    });

    // Geocoding services (based on what's configured)
    // Always show OpenStreetMap as it's the fallback
    attributions.push({
      name: 'OpenStreetMap',
      text: '© OpenStreetMap contributors',
      license: 'ODbL',
      required: true,
      priority: 4
    });

    // Optional services (only if API keys are configured)
    if (process.env.GOOGLE_PLACES_API_KEY) {
      attributions.push({
        name: 'Google Places',
        text: 'Powered by Google',
        license: 'Google Maps Platform ToS',
        required: false,
        priority: 5
      });
    }

    res.json({
      attributions: attributions.sort((a, b) => a.priority - b.priority),
      transitAuthority: transitAuthority || 'Not configured',
      location: prefs?.location?.city || prefs?.location?.stateName || 'Not configured'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      attributions: []
    });
  }
});

/**
 * Get Fallback Transit Stops for a State
 * Returns default stops/stations when live API is unavailable
 */
app.get('/api/fallback-stops/:stateCode', (req, res) => {
  try {
    const { stateCode } = req.params;
    const { mode, search, lat, lon } = req.query;

    if (search) {
      // Search for stops by name
      const results = fallbackTimetables.searchStops(stateCode, search);
      return res.json({
        success: true,
        stateCode,
        query: search,
        results,
        count: results.length
      });
    }

    if (lat && lon) {
      // Find nearest stop
      const nearest = fallbackTimetables.findNearestStop(
        stateCode,
        parseFloat(lat),
        parseFloat(lon),
        mode || null
      );
      return res.json({
        success: true,
        stateCode,
        nearest
      });
    }

    if (mode) {
      // Get stops for specific mode
      const stops = fallbackTimetables.getStopsByMode(stateCode, mode);
      return res.json({
        success: true,
        stateCode,
        mode,
        stops,
        count: stops.length
      });
    }

    // Get all stops for state
    const stateData = fallbackTimetables.getFallbackStops(stateCode);
    if (!stateData) {
      return res.status(404).json({
        success: false,
        error: `No fallback data available for state: ${stateCode}`
      });
    }

    res.json({
      success: true,
      stateCode,
      name: stateData.name,
      authority: stateData.authority,
      modes: stateData.modes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get All States with Fallback Data
 */
app.get('/api/fallback-stops', (req, res) => {
  try {
    const states = fallbackTimetables.getAllStates();
    res.json({
      success: true,
      states,
      count: states.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Decision log endpoints (transparency and troubleshooting)
app.get('/api/decisions', (req, res) => {
  try {
    const { category, since, limit } = req.query;

    let logs;
    if (category) {
      logs = global.decisionLogger.getLogsByCategory(category);
    } else if (since) {
      logs = global.decisionLogger.getLogsSince(since);
    } else {
      const count = limit ? parseInt(limit) : 100;
      logs = global.decisionLogger.getRecentLogs(count);
    }

    res.json({
      success: true,
      stats: global.decisionLogger.getStats(),
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/decisions/export', (req, res) => {
  try {
    const exported = global.decisionLogger.export();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="decisions-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(exported);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/decisions/clear', (req, res) => {
  try {
    global.decisionLogger.clear();
    res.json({
      success: true,
      message: 'Decision log cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Feedback submission endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, type, message, timestamp } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // HTML escape helper to prevent injection in email templates
    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Log feedback to console and decision logger
    const feedbackLog = {
      from: escapeHtml(name || 'Anonymous'),
      email: escapeHtml(email || 'No email provided'),
      type: escapeHtml(type || 'other'),
      message: escapeHtml(message.trim()),
      timestamp: timestamp || new Date().toISOString()
    };


    // Log to decision logger for record keeping
    if (global.decisionLogger) {
      global.decisionLogger.log({
        category: 'User Feedback',
        decision: `Feedback received: ${type}`,
        details: feedbackLog
      });
    }

    // Send email if transporter and FEEDBACK_EMAIL are configured
    if (emailTransporter && process.env.FEEDBACK_EMAIL) {
      try {
        await emailTransporter.sendMail({
          from: `"Commute Compute System" <${process.env.SMTP_USER}>`,
          to: process.env.FEEDBACK_EMAIL, // Required env var - no hardcoded email per Section 17.4
          subject: `Commute Compute Feedback: ${type}`,
          text: `New feedback received from Commute Compute system:

From: ${feedbackLog.from}
Email: ${feedbackLog.email}
Type: ${feedbackLog.type}
Timestamp: ${feedbackLog.timestamp}

Message:
${feedbackLog.message}

---
Sent via Commute Compute Admin Panel`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #667eea;">New Commute Compute Feedback</h2>
              <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>From:</strong> ${feedbackLog.from}</p>
                <p><strong>Email:</strong> ${feedbackLog.email}</p>
                <p><strong>Type:</strong> ${feedbackLog.type}</p>
                <p><strong>Timestamp:</strong> ${feedbackLog.timestamp}</p>
              </div>
              <div style="background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h3>Message:</h3>
                <p style="white-space: pre-wrap;">${feedbackLog.message}</p>
              </div>
              <p style="color: #718096; font-size: 12px; margin-top: 20px;">
                Sent via Commute Compute Admin Panel
              </p>
            </div>
          `
        });


        res.json({
          success: true,
          message: 'Feedback received and emailed. Thank you for your input!'
        });
      } catch (emailError) {

        // Still return success since feedback was logged
        res.json({
          success: true,
          message: 'Feedback received and logged (email delivery failed). Thank you for your input!'
        });
      }
    } else {
      // No email configured - just log
      res.json({
        success: true,
        message: 'Feedback received and logged. Thank you for your input!'
      });
    }

    // Also try to create GitLab issue if token is configured
    const gitlabToken = process.env.GITLAB_FEEDBACK_TOKEN;
    if (gitlabToken) {
      try {
        const issueLabels = {
          'bug': ['bug', 'user-feedback'],
          'feature': ['enhancement', 'user-feedback'],
          'general': ['user-feedback']
        };
        
        const issueBody = `## User Feedback

**Type:** ${feedbackLog.type}
**From:** ${feedbackLog.from}
**Email:** ${feedbackLog.email}
**Timestamp:** ${feedbackLog.timestamp}

### Message

${feedbackLog.message}

---
*Submitted via Commute Compute Feedback System*`;

        const issueResponse = await fetch('https://gitlab.com/api/v4/projects/angusbergman%2Fcommute-compute-system/issues', {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': gitlabToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `[${feedbackLog.type}] ${feedbackLog.message.substring(0, 50)}${feedbackLog.message.length > 50 ? '...' : ''}`,
            body: issueBody,
            labels: issueLabels[feedbackLog.type] || ['user-feedback']
          })
        });
        
        if (issueResponse.ok) {
          const issue = await issueResponse.json();
        } else {
        }
      } catch (glError) {
      }
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback: ' + error.message
    });
  }
});

// Status endpoint (enhanced for monitoring and troubleshooting)
app.get('/api/status', async (req, res) => {
  try {
    const data = await getData();

    // Get enhanced health status
    const healthStatus = safeguards.getHealthStatus({
      version: VERSION,
      configured: isConfigured,
      dataMode: data.meta?.mode === 'fallback' ? 'Fallback' : 'Live',
      cache: {
        age: Math.round((Date.now() - lastUpdate) / 1000),
        maxAge: Math.round(CACHE_MS / 1000)
      },
      data: {
        trains: data.trains,
        trams: data.trams,
        alerts: data.news ? 1 : 0,
        coffee: data.coffee,
        weather: data.weather
      },
      geocoding: {
        circuitBreaker: safeguards.getCircuitBreakerStatus(global.geocodingService),
        rateLimiter: safeguards.getRateLimiterStatus(global.geocodingService)
      },
      meta: data.meta
    });

    res.json(healthStatus);
  } catch (error) {
    safeguards.trackError('health-check', error.message);
    safeguards.log(safeguards.LOG_LEVELS.ERROR, 'Health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Token-based device endpoint (config embedded in URL)
// This allows zero-setup deployment - user gets a unique URL after setup wizard
app.get('/api/device/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Decode config from token
    const config = decodeConfigToken(token);
    if (!config) {
      return res.status(400).json({ error: 'Invalid config token' });
    }

    // Temporarily apply config for this request (KV fallback per Section 3.4)
    const apiKey = config.api?.key || await getTransitApiKey();
    const transitRoute = config.journey?.transitRoute;
    
    // Temporarily set preferences from token for this request
    const tempPrefs = { journey: { transitRoute }, addresses: config.addresses || {}, state: config.state || 'VIC' };
    preferences.setTemporary(tempPrefs);
    
    // Get data using the decoded config
    let data = await getData(apiKey);
    
    // Clear temporary preferences
    preferences.clearTemporary();
    
    // If real-time data is empty, use fallback timetable
    if ((!data.trains || data.trains.length === 0) && (!data.trams || data.trams.length === 0)) {
      const fallback = getFallbackTimetable();
      data = { ...data, trains: fallback.trains, trams: fallback.trams };
    }

    // Get station names from decoded config
    const mode1Name = transitRoute?.mode1?.originStation?.name || 'TRANSIT 1';
    const mode2Name = transitRoute?.mode2?.originStation?.name || 'TRANSIT 2';
    // Get correct data based on mode type (0=train, 1=tram)
    const mode1Data = transitRoute?.mode1?.type === 0 ? data.trains : data.trams;
    const mode2Data = transitRoute?.mode2?.type === 0 ? data.trains : data.trams;

    const mode1Type = transitRoute?.mode1?.type === 0 ? 'TRAINS' : 'TRAMS';
    const mode2Type = transitRoute?.mode2?.type === 0 ? 'TRAINS' : 'TRAMS';

    // Build TRMNL markup
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' });

    const markup = [
      `**${timeStr}** | ${data.weather?.icon || '(cloud)'} ${data.weather?.temp || '--'}°C`,
      '',
      data.coffee?.canGet ? '[Coffee] **YOU HAVE TIME FOR COFFEE!**' : '[*] **NO COFFEE - GO DIRECT**',
      '',
      `**${mode1Name.toUpperCase()}** (${mode1Type})`,
      mode1Data?.length > 0 ? mode1Data.slice(0, 2).map(t => `→ ${t.minutes} min`).join('\n') : '→ Checking...',
      '',
      `**${mode2Name.toUpperCase()}** (${mode2Type})`,
      mode2Data?.length > 0 ? mode2Data.slice(0, 2).map(t => `→ ${t.minutes} min`).join('\n') : '→ Checking...',
      '',
      data.coffee?.subtext || '[OK] Good service'
    ];

    // Get Melbourne time for firmware
    const melbTime = new Date().toLocaleTimeString('en-AU', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' 
    });

    res.json({
      // For TRMNL web display
      merge_variables: {
        screen_text: markup.join('\n'),
        device: 'trmnl-byos',
        width: 800,
        height: 480,
        orientation: 'landscape'
      },
      // For firmware parsing (flat structure)
      current_time: melbTime,
      weather: data.weather?.condition || 'Clear',
      location: (config.addresses?.home || 'Home').split(',')[0],
      setup_addresses: true,
      setup_transit_api: !!apiKey,
      setup_journey: !!transitRoute,
      coffee_decision: data.coffee?.canGet ? 'GET COFFEE' : 'NO COFFEE',
      trams: (mode1Type === 'TRAMS' ? mode1Data : mode2Data)?.slice(0, 3) || [],
      trains: (mode1Type === 'TRAINS' ? mode1Data : mode2Data)?.slice(0, 3) || [],
      tram_stop: mode1Type === 'TRAMS' ? mode1Name : mode2Name,
      train_stop: mode1Type === 'TRAINS' ? mode1Name : mode2Name,
      // Journey data for v5.18+
      home_address: (config.addresses?.home || 'Home').split(',')[0],
      work_address: (config.addresses?.work || 'Work').split(',')[0],
      leave_by: new Date(Date.now() + Math.max(0, ((mode1Data?.[0]?.minutes || 10) - 3)) * 60000).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false }),
      arrive_by: new Date(Date.now() + ((mode1Data?.[0]?.minutes || 10) + 8 + 3 + 5) * 60000).toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hour12: false }),
      leg1_type: mode1Type === 'TRAMS' ? 'tram' : 'train',
      leg2_type: mode2Type === 'TRAINS' ? 'train' : 'tram',
      leg2_dest: transitRoute?.mode2?.destinationStation?.name || 'Parliament'
    });
  } catch (error) {
    res.status(500).json({
      merge_variables: {
        screen_text: `[!] Error: ${error.message}`
      }
    });
  }
});

// Generate webhook URL after setup completion
app.post('/admin/generate-webhook', async (req, res) => {
  try {
    // Accept config from request body (for serverless) or fall back to stored prefs
    const configFromBody = req.body?.config;
    const prefs = configFromBody || preferences.get();
    const baseUrl = req.headers.origin || `https://${req.headers.host}`;
    
    const webhookUrl = generateWebhookUrl(baseUrl, prefs);
    
    if (!webhookUrl) {
      return res.status(500).json({ success: false, error: 'Failed to generate webhook URL' });
    }

    res.json({
      success: true,
      webhookUrl,
      instructions: [
        '1. Copy this webhook URL',
        '2. Flash custom firmware to your e-ink device',
        '3. Paste the webhook URL',
        '4. Your device will start showing transit data!'
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// TRMNL screen endpoint (JSON markup)
app.get('/api/screen', requireConfiguration, async (req, res) => {
  try {
    const data = await getData();

    // Get station names and device config from preferences
    const prefs = preferences.get();
    const trainStation = prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'TRAINS';
    const tramStation = prefs?.journey?.transitRoute?.mode2?.originStation?.name || 'TRAMS';

    // Get device configuration (Development Rules v1.0.14 Section U)
    const deviceConfig = prefs?.deviceConfig || {
      selectedDevice: 'trmnl-byos',
      resolution: { width: 800, height: 480 },
      orientation: 'landscape'
    };


    // Build TRMNL markup
    const markup = [
      `**${new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}** | ${data.weather.icon} ${data.weather.temp}°C`,
      '',
      data.coffee.canGet ? '[Coffee] **YOU HAVE TIME FOR COFFEE!**' : '[*] **NO COFFEE - GO DIRECT**',
      '',
      `**${trainStation.toUpperCase()}**`,
      data.trains.length > 0 ? data.trains.slice(0, 3).map(t => `→ ${t.minutes} min`).join('\n') : '→ No departures',
      '',
      `**${tramStation.toUpperCase()}**`,
      data.trams.length > 0 ? data.trams.slice(0, 3).map(t => `→ ${t.minutes} min`).join('\n') : '→ No departures',
      '',
      data.news ? `[!] ${data.news}` : '[OK] Good service on all lines'
    ];

    res.json({
      merge_variables: {
        screen_text: markup.join('\n'),
        device: deviceConfig.selectedDevice,
        width: deviceConfig.resolution.width,
        height: deviceConfig.resolution.height,
        orientation: deviceConfig.orientation
      }
    });
  } catch (error) {
    res.status(500).json({
      merge_variables: {
        screen_text: `[!] Error: ${error.message}`
      }
    });
  }
});

// Region updates endpoint - dynamic data (downloaded every 30 seconds)
app.get('/api/region-updates', async (req, res) => {
  try {
    // Check if system is configured
    const prefs = preferences.get();
    if (!prefs.system_configured) {
      return res.status(503).json({
        error: 'System not configured',
        message: 'Please complete setup at /setup',
        setupRequired: true
      });
    }

    // Track device ping from user-agent or generate ID
    const deviceId = req.headers['user-agent']?.includes('ESP32') ? 'TRMNL-Device' : 'Unknown';
    trackDevicePing(deviceId, req.ip);

    const updates = await getRegionUpdates();

    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'no-cache');
    res.json(updates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Live PNG image endpoint (legacy - for compatibility)
// HTML Dashboard endpoint (for TRMNL device - 800x480)
// Server does ALL the thinking - display just shows simple info
// Design based on user's template
/**
 * ========================================================================
 * DEVELOPMENT RULES COMPLIANCE: docs/development/DEVELOPMENT-RULES.md v1.0.12
 * ========================================================================
 * - Location agnostic (dynamic timezone based on detected state)
 * - Works with fallback data (no API keys required)
 * - Transit mode agnostic (supports all 8 Australian states)
 * - BYOS compliant (800x480 dimensions)
 * - Clear data source indicators
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getData();
    const prefs = preferences.get();

    // Build config from preferences (replaces undefined dataManager.getConfig())
    const config = {
      location: {
        state: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC',
        stateCode: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC'
      },
      preferences: {
        transitMode: 'train',
        walkingTime: prefs?.manualWalkingTimes?.homeToStation || 5
      },
      stops: {
        home: { name: prefs?.journey?.transitRoute?.mode1?.originStation?.name },
        work: { name: prefs?.journey?.transitRoute?.mode1?.destinationStation?.name }
      }
    };

    // Check if APIs are configured via KV (Section 3.4)
    const transitKey = await getTransitApiKey();
    const apis = {
      transitAuthority: { configured: !!transitKey },
      victorianGTFS: { configured: !!transitKey }
    };

    // Get device configuration (Development Rules v1.0.14 Section U - Device-First Design)
    const deviceConfig = prefs?.deviceConfig || {
      selectedDevice: 'trmnl-byos',
      resolution: { width: 800, height: 480 },
      orientation: 'landscape'
    };
    const deviceWidth = req.query.width || deviceConfig.resolution.width;
    const deviceHeight = req.query.height || deviceConfig.resolution.height;
    const deviceOrientation = req.query.orientation || deviceConfig.orientation;


    // Location-agnostic timezone detection
    const state = config?.location?.state || config?.location?.stateCode || 'VIC';
    const timezone = getTimezoneForState(state);

    // Get transit mode and stops (location agnostic)
    const transitMode = config?.preferences?.transitMode || prefs?.preferences?.transitMode || 'train';
    const stationName = config?.stops?.home?.name || prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'STATION';
    const destName = config?.stops?.work?.name || prefs?.journey?.transitRoute?.mode1?.destinationStation?.name || 'DESTINATION';

    // Determine data source mode
    const hasLiveData = apis?.transitAuthority?.configured || apis?.victorianGTFS?.configured || false;
    const dataSourceMode = hasLiveData ? 'LIVE' : 'FALLBACK';
    const dataSourceText = hasLiveData ? 'LIVE DATA' : 'FALLBACK TIMETABLES';

    // Get current time (location agnostic)
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-AU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Calculate "leave by" time based on next departure
    const nextDeparture = data.trains?.[0] || data.trams?.[0] || data.buses?.[0] || data.ferries?.[0] || null;
    const walkBuffer = prefs?.manualWalkingTimes?.homeToStation || config?.preferences?.walkingTime || 5;
    const leaveInMins = nextDeparture ? Math.max(0, nextDeparture.minutes - walkBuffer) : null;
    const leaveTime = leaveInMins !== null ? new Date(now.getTime() + leaveInMins * 60000).toLocaleTimeString('en-AU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) : '--:--';

    // Get weather data (graceful fallback)
    let weatherText = 'N/A';
    let tempText = '--';
    try {
      const weatherData = await weather.getCurrentWeather();
      if (weatherData) {
        weatherText = weatherData.condition?.short || 'N/A';
        tempText = weatherData.temperature !== null ? weatherData.temperature + '°' : '--';
      }
    } catch (e) {
      // Weather unavailable - silent fail
    }

    // Dynamic transit mode data (supports all modes)
    const getModeTimes = (modeData) => {
      const dep1 = modeData?.[0] ? modeData[0].minutes + ' min' : '-- min';
      const dep2 = modeData?.[1] ? modeData[1].minutes + ' min' : '-- min';
      return { dep1, dep2 };
    };

    const trains = getModeTimes(data.trains);
    const trams = getModeTimes(data.trams);
    const buses = getModeTimes(data.buses);
    const ferries = getModeTimes(data.ferries);
    const lightRail = getModeTimes(data.lightRail);

    // Determine primary and secondary modes based on state and configuration
    let primaryMode = 'TRAINS';
    let primaryTimes = trains;
    let secondaryMode = 'TRAMS';
    let secondaryTimes = trams;

    // State-specific mode selection
    if (state === 'NSW' || state === 'ACT') {
      primaryMode = 'TRAINS';
      secondaryMode = 'BUSES';
      primaryTimes = trains;
      secondaryTimes = buses;
    } else if (state === 'QLD') {
      primaryMode = 'TRAINS';
      secondaryMode = 'BUSES';
      primaryTimes = trains;
      secondaryTimes = buses;
    } else if (state === 'WA') {
      primaryMode = 'TRAINS';
      secondaryMode = 'BUSES';
      primaryTimes = trains;
      secondaryTimes = buses;
    } else if (state === 'SA') {
      primaryMode = 'TRAMS';
      secondaryMode = 'BUSES';
      primaryTimes = trams;
      secondaryTimes = buses;
    } else if (state === 'TAS') {
      primaryMode = 'BUSES';
      secondaryMode = 'FERRIES';
      primaryTimes = buses;
      secondaryTimes = ferries;
    } else if (state === 'NT') {
      primaryMode = 'BUSES';
      secondaryMode = 'BUSES';
      primaryTimes = buses;
      secondaryTimes = buses;
    } else {
      // VIC - default trains and trams
      primaryMode = 'TRAINS';
      secondaryMode = 'TRAMS';
      primaryTimes = trains;
      secondaryTimes = trams;
    }

    // Dashboard HTML - Device-aware (uses device config from preferences), supports fallback data
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${deviceWidth}, height=${deviceHeight}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: white;
      color: black;
      width: ${deviceWidth}px;
      height: ${deviceHeight}px;
      overflow: hidden;
      position: relative;
    }
    /* Data Source Indicator (Top Banner) */
    .data-source-banner {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 20px;
      background: ${hasLiveData ? '#4fb28e' : '#fbbf24'};
      color: ${hasLiveData ? 'white' : '#1f2937'};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1px;
      z-index: 1000;
    }
    /* Station Name Box (Top Left) */
    .station-box {
      position: absolute;
      top: 30px;
      left: 10px;
      width: 100px;
      height: 45px;
      border: 2px solid black;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: bold;
      text-align: center;
      padding: 5px;
      line-height: 1.2;
    }
    /* Large Time Display (Top Center) */
    .time {
      position: absolute;
      top: 30px;
      left: 130px;
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 2px;
    }
    /* State/Location Badge */
    .location-badge {
      position: absolute;
      top: 32px;
      left: 290px;
      font-size: 9px;
      color: #666;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    /* LEAVE BY Box (Top Right) - KEY FEATURE */
    .leave-box {
      position: absolute;
      top: 30px;
      right: 10px;
      width: 180px;
      height: 45px;
      background: black;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .leave-label { font-size: 9px; letter-spacing: 0.5px; }
    .leave-time { font-size: 22px; letter-spacing: 1px; margin-top: 2px; }
    /* Section Headers (Black Strips) */
    .section-header {
      position: absolute;
      height: 24px;
      background: black;
      color: white;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .secondary-header { top: 100px; left: 10px; width: 360px; }
    .primary-header { top: 100px; left: 390px; width: 400px; }
    /* Departure Labels */
    .departure-label {
      position: absolute;
      font-size: 11px;
      color: #666;
      font-weight: 600;
    }
    /* Departure Times (Large Numbers) */
    .departure {
      position: absolute;
      font-size: 26px;
      font-weight: bold;
    }
    /* Weather (Right Sidebar) */
    .weather {
      position: absolute;
      right: 15px;
      top: 290px;
      font-size: 10px;
      text-align: right;
      color: #666;
    }
    .temperature {
      position: absolute;
      right: 15px;
      top: 308px;
      font-size: 18px;
      font-weight: bold;
      text-align: right;
    }
    /* Coffee Strip (Bottom) */
    .coffee-strip {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 70px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: bold;
      border-top: 3px solid black;
    }
    .coffee-yes { background: black; color: white; }
    .coffee-no { background: white; color: black; }
    /* Status indicator */
    .status {
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      color: #666;
    }
  </style>
</head>
<body>
  <!-- Data Source Banner -->
  <div class="data-source-banner">${dataSourceText} • ${state}</div>

  <!-- Station Name Box -->
  <div class="station-box">${stationName.toUpperCase().substring(0, 25)}</div>

  <!-- Large Time -->
  <div class="time">${currentTime}</div>

  <!-- Location Badge -->
  <div class="location-badge">${state} ${timezone.split('/')[1].toUpperCase()}</div>

  <!-- LEAVE BY Box -->
  <div class="leave-box">
    <div class="leave-label">LEAVE BY</div>
    <div class="leave-time">${leaveTime}</div>
  </div>

  <!-- Secondary Mode Section (Left) -->
  <div class="section-header secondary-header">${secondaryMode}</div>
  <div class="departure-label" style="top: 132px; left: 20px;">Next:</div>
  <div class="departure" style="top: 148px; left: 20px;">${secondaryTimes.dep1}</div>
  <div class="departure-label" style="top: 192px; left: 20px;">Then:</div>
  <div class="departure" style="top: 208px; left: 20px;">${secondaryTimes.dep2}</div>

  <!-- Primary Mode Section (Right) -->
  <div class="section-header primary-header">${primaryMode} → ${destName.toUpperCase().substring(0, 18)}</div>
  <div class="departure-label" style="top: 132px; left: 400px;">Next:</div>
  <div class="departure" style="top: 148px; left: 400px;">${primaryTimes.dep1}</div>
  <div class="departure-label" style="top: 192px; left: 400px;">Then:</div>
  <div class="departure" style="top: 208px; left: 400px;">${primaryTimes.dep2}</div>

  <!-- Weather -->
  <div class="weather">${weatherText}</div>
  <div class="temperature">${tempText}</div>

  <!-- Status -->
  <div class="status">${hasLiveData ? 'LIVE SERVICE DATA' : 'FALLBACK TIMETABLES'}</div>

  <!-- Coffee Strip -->
  <div class="coffee-strip ${data.coffee?.canGet ? 'coffee-yes' : 'coffee-no'}">
    ${data.coffee?.canGet ? '[Coffee] TIME FOR COFFEE' : '[*] GO DIRECT - NO COFFEE'}
  </div>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Error generating dashboard');
  }
});

// ========== BYOS API ENDPOINTS ==========
// These endpoints implement TRMNL BYOS protocol for custom firmware

// Device database (in-memory for now - use real DB in production)
const devices = new Map();

// Device setup/registration endpoint
app.get('/api/setup', async (req, res) => {
  const macAddress = req.headers.id || req.headers['ID'];

  if (!macAddress) {
    return res.status(400).json({
      status: 404,
      error: 'MAC address required in ID header'
    });
  }

  // Check if device exists, create if not
  let device = devices.get(macAddress);
  if (!device) {
    // Generate API key and friendly ID
    const apiKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const friendlyID = macAddress.replace(/:/g, '').substring(0, 6).toUpperCase();

    device = {
      macAddress,
      apiKey,
      friendlyID,
      registeredAt: new Date().toISOString()
    };

    devices.set(macAddress, device);

    // Save to persistent storage
    await saveDevices();
  }

  res.json({
    status: 200,
    api_key: device.apiKey,
    friendly_id: device.friendlyID,
    screen_url: `https://${req.get('host')}/api/screen`,
    dashboard_url: `https://${req.get('host')}/api/dashboard`
  });
});

// Display content endpoint (compatible with custom firmware v5.9+)
app.get('/api/display', async (req, res) => {
  const friendlyID = req.headers.id || req.headers['ID'];
  const accessToken = req.headers['access-token'] || req.headers['Access-Token'];
  const refreshRate = req.headers['refresh-rate'] || req.headers['Refresh-Rate'] || '900';
  const batteryVoltage = req.headers['battery-voltage'] || req.headers['Battery-Voltage'];
  const fwVersion = req.headers['fw-version'] || req.headers['FW-Version'];
  const rssi = req.headers.rssi || req.headers['RSSI'];

  // Track device ping
  if (friendlyID) {
    trackDevicePing(friendlyID, req.ip);
  }

  // Log device status

  // Verify device exists
  let deviceFound = false;
  for (const [mac, device] of devices.entries()) {
    if (device.friendlyID === friendlyID && device.apiKey === accessToken) {
      deviceFound = true;
      device.lastSeen = new Date().toISOString();
      device.batteryVoltage = batteryVoltage;
      device.rssi = rssi;

      // Save updated device stats (async, don't wait)
      saveDevices().catch(() => {});
      break;
    }
  }

  if (!deviceFound && !process.env.VERCEL) {
    return res.status(500).json({
      status: 500,
      error: 'Device not found'
    });
  }

  // Get current time and weather for firmware display
  const prefs = preferences.get();
  const state = prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC';
  const timezone = getTimezoneForState(state);

  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Get weather data
  let weatherText = 'N/A';
  try {
    const weatherData = await weather.getCurrentWeather();
    if (weatherData) {
      weatherText = weatherData.condition?.short || 'N/A';
      if (weatherData.temperature !== null) {
        weatherText = `${weatherText} ${weatherData.temperature}°`;
      }
    }
  } catch (e) {
    // Weather unavailable - silent fail
  }

  // Check setup progress for unified setup screen (v5.15+)
  // These flags tell the firmware whether to show setup screen or live dashboard
  const setupAddresses = Boolean(prefs?.journey?.homeAddress && prefs?.journey?.workAddress);
  const setupTransitAPI = Boolean(prefs?.apis?.transport?.apiKey || prefs?.apis?.transport?.devId);
  const setupJourney = Boolean(prefs?.journey?.transitRoute?.mode1?.departure);

  // Log setup flags for debugging (v5.15 deployment verification)

  // Get location if available
  const location = prefs?.journey?.currentContext?.location || 'Melbourne Central';

  // Get transit data for v5.16+ firmware
  let transitData = { trains: [], trams: [], buses: [], ferries: [], coffee: { canGet: false } };
  try {
    transitData = await getData();
  } catch (e) {
  }

  // Get station names from preferences
  const tramStop = prefs?.journey?.transitRoute?.mode2?.originStation?.name || 
                   prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'TRAMS';
  const trainStop = prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'TRAINS';

  // Format trams array for firmware
  const trams = (transitData.trams || []).slice(0, 3).map(t => ({
    minutes: t.minutes || 0,
    destination: t.destination || t.direction || 'City'
  }));

  // Format trains array for firmware
  const trains = (transitData.trains || []).slice(0, 3).map(t => ({
    minutes: t.minutes || 0,
    destination: t.destination || t.direction || 'City'
  }));

  
  // Journey planning data for v5.18+ firmware
  const homeAddress = prefs?.journey?.homeAddress || prefs?.addresses?.home || 'Home';
  const workAddress = prefs?.journey?.workAddress || prefs?.addresses?.work || 'Work';
  
  // Calculate leave by and arrive by times
  const transferTime = 5;
  const walkToTram = prefs?.manualWalkingTimes?.homeToStation || 3;
  const walkFromTrain = prefs?.manualWalkingTimes?.stationToWork || 5;
  const trainJourneyTime = 3;
  
  const nextTramMins = trams[0]?.minutes || 10;
  const totalJourneyTime = walkToTram + nextTramMins + transferTime + trainJourneyTime + walkFromTrain;
  
  const nowTime = new Date();
  const leaveByMs = Math.max(0, (nextTramMins - walkToTram)) * 60000;
  const leaveByTime = new Date(nowTime.getTime() + leaveByMs);
  const arriveByTime = new Date(nowTime.getTime() + totalJourneyTime * 60000);
  
  const leaveBy = leaveByTime.toLocaleTimeString('en-AU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const arriveBy = arriveByTime.toLocaleTimeString('en-AU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  
  const leg1Type = prefs?.journey?.transitRoute?.mode1?.type === 1 ? 'tram' : 'train';
  const leg2Type = prefs?.journey?.transitRoute?.mode2?.type === 0 ? 'train' : 'tram';
  const leg2Dest = prefs?.journey?.transitRoute?.mode2?.destinationStation?.name || 'Parliament';

  // Coffee decision
  const coffeeDecision = transitData.coffee?.canGet ? 'STOP FOR COFFEE' : 'GO DIRECT';

  // Return display content with firmware-compatible fields
  const response = {
    status: 0,
    screen_url: `https://${req.get('host')}/api/screen`,
    dashboard_url: `https://${req.get('host')}/api/dashboard`,
    refresh_rate: refreshRate,
    update_firmware: false,
    firmware_url: null,
    reset_firmware: false,
    // Firmware-compatible fields (v5.9+)
    current_time: currentTime,
    weather: weatherText,
    location: location,
    // Setup progress flags (v5.15+) - CRITICAL FOR UNIFIED SETUP SCREEN
    setup_addresses: setupAddresses,
    setup_transit_api: setupTransitAPI,
    setup_journey: setupJourney,
    // Transit data for v5.16+ firmware
    trams: trams,
    trains: trains,
    tram_stop: tramStop,
    train_stop: trainStop,
    coffee_decision: coffeeDecision,
    // Journey data for v5.18+
    home_address: homeAddress,
    work_address: workAddress,
    leave_by: leaveBy,
    arrive_by: arriveBy,
    leg1_type: leg1Type,
    leg2_type: leg2Type,
    leg2_dest: leg2Dest
  };

  res.json(response);
});

// ========== KINDLE DEVICE SUPPORT ==========
// Supports Kindle devices via WinterBreak jailbreak + TRMNL extension

// Kindle device resolutions
const KINDLE_DEVICES = {
  'kindle-pw3': { width: 1072, height: 1448, name: 'Kindle Paperwhite 3' },
  'kindle-pw4': { width: 1072, height: 1448, name: 'Kindle Paperwhite 4' },
  'kindle-pw5': { width: 1236, height: 1648, name: 'Kindle Paperwhite 5' },
  'kindle-basic-10': { width: 600, height: 800, name: 'Kindle Basic (10th gen)' },
  'kindle-11': { width: 1072, height: 1448, name: 'Kindle (11th gen)' },
  'default': { width: 1072, height: 1448, name: 'Default Kindle' }
};

// Kindle image endpoint - returns PNG at device resolution
// Used by TRMNL Kindle extension on jailbroken devices
app.get("/api/kindle/image", async (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

// TRMNL Image Endpoint - Returns 1-bit BMP
app.get('/api/image', async (req, res) => {
  try {
    const isTest = req.query.test === 'true';
    if (isTest) {
      const bmp = renderTestPattern();
      res.setHeader('Content-Type', 'image/bmp');
      return res.send(bmp);
    }
    const data = await getData();
    const prefs = preferences.get();
    const dashData = {
      current_time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }),
      trains: data.trains || [],
      trams: data.trams || [],
      weather: data.weather,
      coffee: data.coffee
    };
    const bmp = renderDashboard(dashData, prefs);
    res.setHeader('Content-Type', 'image/bmp');
    res.setHeader('Content-Length', bmp.length);
    res.send(bmp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/image/test', async (req, res) => {
  try {
    const bmp = renderTestPattern();
    res.setHeader('Content-Type', 'image/bmp');
    res.send(bmp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Zone-based partial refresh endpoint
app.get('/api/zones', async (req, res) => {
  try {
    const forceAll = req.query.force === 'true';
    const data = await getData();
    const dashData = {
      current_time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }),
      trains: data.trains || [],
      trams: data.trams || [],
      weather: data.weather,
      coffee: data.coffee
    };
    const result = renderZones(dashData, forceAll);
    const changed = result.zones.filter(z => z.changed).length;
    res.setHeader('X-Zones-Changed', changed.toString());
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/zones/list', (req, res) => {
  res.json({ zones: Object.entries(ZONES).map(([id, z]) => ({ id, ...z })) });
});

app.post('/api/zones/reset', (req, res) => {
  clearZoneCache();
  res.json({ success: true });
});

// Device logging endpoint
app.post('/api/log', express.json(), (req, res) => {
  res.json({ status: 'ok' });
});

// ========== PARTIAL REFRESH ENDPOINTS ==========
// These endpoints support the custom firmware's partial refresh capability

// Partial data endpoint - returns just the dynamic data for quick updates
app.get('/api/partial', async (req, res) => {
  try {
    const data = await getData();
    const prefs = preferences.get();
    const state = prefs.state || 'VIC';
    const timezone = getTimezoneForState(state);

    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', hour12: false
    });

    // Return minimal JSON for partial screen update
    res.json({
      time: timeFormatter.format(now),
      trains: data.trains.slice(0, 3).map(t => t.minutes),
      trams: data.trams.slice(0, 3).map(t => t.minutes),
      coffee: data.coffee.canGet,
      coffeeText: data.coffee.canGet ? 'COFFEE TIME' : 'NO COFFEE',
      alert: data.news ? true : false,
      ts: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Firmware config endpoint - tells device refresh intervals (legacy)
app.get('/api/config', (req, res) => {
  const prefs = preferences.get();
  const state = prefs.state || 'VIC';
  const timezone = getTimezoneForState(state);

  res.json({
    partialRefreshMs: 20000,    // 20 seconds partial refresh (HARDCODED REQUIREMENT)
    fullRefreshMs: 600000,      // 10 minutes full refresh
    sleepBetweenMs: 18000,      // Sleep time between polls (20s cycle)
    timezone: timezone,
    version: '1.0.0'
  });
});

// Device configuration endpoint - SERVER-DRIVEN SETTINGS
// Following DEVELOPMENT-RULES.md Section X: Firmware Flash Once Philosophy
// Returns all device settings so user can change them in admin panel without reflashing
// Supports: TRMNL BYOS, Kindle Paperwhite 3/4/5, Kindle Basic, Kindle 11
// NOTE: Second definition at ~line 3256 provides extended config - keeping both for compatibility

/* =========================================================
   ADMIN PANEL ROUTES
   ========================================================= */

const API_CONFIG_FILE = path.join(process.cwd(), 'api-config.json');

// Load API configuration
async function loadApiConfig() {
  try {
    const data = await fs.readFile(API_CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // Return default config if file doesn't exist (location-agnostic)
    const prefs = preferences.get();
    const state = prefs.state || 'VIC';
    const timezone = getTimezoneForState(state);

    // Per Section 3.4: Check KV for API key status
    const kvTransitKey = await getTransitApiKey();
    return {
      apis: {
        transport_vic: {
          name: "Transport Victoria OpenData API",
          api_key: kvTransitKey ? "***configured***" : "",
          enabled: true,
          baseUrl: "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1",
          lastChecked: null,
          status: kvTransitKey ? "active" : "unconfigured"
        }
      },
      server: {
        timezone: timezone,
        refreshInterval: 30,
        fallbackEnabled: true
      },
      lastModified: null
    };
  }
}

// Save API configuration
async function saveApiConfig(config) {
  config.lastModified = new Date().toISOString();
  await fs.writeFile(API_CONFIG_FILE, JSON.stringify(config, null, 2));

  // Per Section 3.4 & 17.5: Save to KV storage, not env vars
  if (config.apis.transport_vic?.api_key) {
    const { setTransitApiKey } = await import('./data/kv-preferences.js');
    await setTransitApiKey(config.apis.transport_vic.api_key);
  }
}

// Serve static assets (SVGs, CSS, JS)
app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));

// Serve all public files
app.use(express.static(path.join(process.cwd(), 'public')));

// Admin panel - Staged Setup Wizard (Development Rules compliant)
// Per DEVELOPMENT-RULES.md: "One Step at a Time" - Present only ONE task per screen
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin-v3.html'));
});

// Single-page admin (alternative view)
app.get('/admin/simple', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
});

// Setup redirect to admin
app.get('/setup', (req, res) => {
  res.redirect('/admin');
});

// Journey demo visualization
app.get('/journey-demo', (req, res) => {
app.get('/v11', (req, res) => { res.sendFile(path.join(process.cwd(), 'public', 'trmnl-og-v11.html')); });
app.get('/trmnl-og-v11', (req, res) => { res.sendFile(path.join(process.cwd(), 'public', 'trmnl-og-v11.html')); });  res.sendFile(path.join(process.cwd(), 'public', 'journey-demo.html'));
});

// Journey display visualization (legacy - kept for compatibility)
app.get('/journey', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'journey-display.html'));
});

// Dashboard template
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'dashboard-template.html'));
});

// ============================================================================
// SMART SETUP WIZARD ENDPOINTS (v3)
// ============================================================================

// Geocode address using best available service
app.post('/admin/geocode', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, error: 'Address is required' });
    }

    const result = await global.geocodingService.geocode(address);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Could not find address' });
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reverse geocode coordinates to address
app.post('/admin/reverse-geocode', async (req, res) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ success: false, error: 'Latitude and longitude required' });
    }

    const result = await global.geocodingService.reverseGeocode(lat, lon);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Could not find address for coordinates' });
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Calculate smart journey
app.post('/admin/smart-journey/calculate', async (req, res) => {
  try {
    const {
      homeLocation,
      workLocation,
      cafeLocation,
      workStartTime,
      cafeDuration,
      transitAuthority,
      useFallbackData,
      selectedStops  // NEW: Allow user to select specific stops
    } = req.body;

    if (!homeLocation || !workLocation || !workStartTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    if (selectedStops) {
    }

    // Use NEW compliant journey planner (works with coordinates from Step 2)
    const result = await global.journeyPlanner.calculateJourney({
      homeLocation: {
        lat: homeLocation.lat,
        lon: homeLocation.lon,
        formattedAddress: homeLocation.formattedAddress || `${homeLocation.lat}, ${homeLocation.lon}`
      },
      workLocation: {
        lat: workLocation.lat,
        lon: workLocation.lon,
        formattedAddress: workLocation.formattedAddress || `${workLocation.lat}, ${workLocation.lon}`
      },
      cafeLocation: cafeLocation ? {
        lat: cafeLocation.lat,
        lon: cafeLocation.lon,
        formattedAddress: cafeLocation.formattedAddress || `${cafeLocation.lat}, ${cafeLocation.lon}`
      } : null,
      workStartTime,
      cafeDuration: cafeDuration || 8,
      transitAuthority: transitAuthority || 'VIC',
      selectedStops: selectedStops || null  // Pass user-selected stops
    });

    if (result.success) {
      res.json({
        success: true,
        journey: result.journey,
        options: result.options  // Include stop options for customization
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find closest BOM weather station
app.post('/admin/bom/find-station', async (req, res) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ success: false, error: 'Coordinates required' });
    }

    // Find closest weather station
    const station = await global.weatherBOM.findClosestStation(lat, lon);

    if (!station) {
      return res.status(404).json({ success: false, error: 'No weather station found' });
    }

    // Get current weather
    const current = await global.weatherBOM.getCurrentWeather(station.id);

    res.json({
      success: true,
      stationID: station.id,
      stationName: station.name,
      distance: station.distance,
      current: current || null
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate transit API key
app.post('/admin/transit/validate-api', async (req, res) => {
  try {
    const { state, apiKey } = req.body;

    if (!state || !apiKey) {
      return res.status(400).json({ success: false, error: 'State and API key required' });
    }

    // Test API key with simple request
    // For VIC, test with Transport Victoria OpenData API
    if (state === 'VIC') {
      // Use CORRECT endpoint from Development Rules / VICTORIA-GTFS-REALTIME-PROTOCOL.md
      // VERIFIED WORKING: /metro/trip-updates (NOT /metro-trains/vehicle-positions)
      const testUrl = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates';

      const response = await fetch(testUrl, {
        headers: {
          'KeyId': apiKey,  // Case-sensitive! Must be 'KeyId'
          'Accept': '*/*'   // Accept any content type (API returns application/octet-stream)
        },
        timeout: 10000
      });


      if (!response.ok) {
        const statusText = response.statusText || 'Not Found';
        throw new Error(`API validation failed (${response.status}): ${statusText}. Check your API key at https://opendata.transport.vic.gov.au/`);
      }

      // Check if we got protobuf data (binary content)
      const contentType = response.headers.get('content-type');

      // OpenData API returns 'application/octet-stream' for protobuf
      if (contentType && !contentType.includes('octet-stream') && !contentType.includes('protobuf')) {
      }

      // Success - API key is valid
      res.json({
        success: true,
        message: 'Transport Victoria API key validated successfully',
        apiUrl: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/',
        endpoint: 'metro/trip-updates',
        authentication: 'KeyId header'
      });
    } else {
      // For other states, assume valid (implement state-specific validation as needed)
      res.json({ success: true, message: 'API key accepted' });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Complete setup and save all configuration
app.post('/admin/setup/complete', async (req, res) => {
  try {
    const setupData = req.body;

    // Save all configuration to preferences
    const prefs = preferences.get();

    // Update locations
    if (setupData.homeLocation) {
      prefs.locations = prefs.locations || {};
      prefs.locations.home = {
        address: setupData.homeLocation.formattedAddress,
        lat: setupData.homeLocation.lat,
        lon: setupData.homeLocation.lon
      };
    }

    if (setupData.workLocation) {
      prefs.locations = prefs.locations || {};
      prefs.locations.work = {
        address: setupData.workLocation.formattedAddress,
        lat: setupData.workLocation.lat,
        lon: setupData.workLocation.lon
      };
    }

    if (setupData.cafeLocation) {
      prefs.locations = prefs.locations || {};
      prefs.locations.cafe = {
        address: setupData.cafeLocation.formattedAddress,
        lat: setupData.cafeLocation.lat,
        lon: setupData.cafeLocation.lon,
        businessName: setupData.cafeLocation.businessName
      };
    }

    // Update state and transit authority
    if (setupData.detectedState) {
      prefs.state = setupData.detectedState;
      prefs.transitAuthority = setupData.transitAuthority.name;
    }

    // Update journey with full details
    if (setupData.calculatedJourney) {
      prefs.journey = setupData.calculatedJourney;
    }

    // Save journey configuration (selectedStops, workStartTime, cafeDuration)
    prefs.journeyConfig = prefs.journeyConfig || {};
    if (setupData.selectedStops) {
      prefs.journeyConfig.selectedStops = setupData.selectedStops;
    }
    if (setupData.workStartTime) {
      prefs.journeyConfig.workStartTime = setupData.workStartTime;
    }
    if (setupData.cafeDuration !== undefined) {
      prefs.journeyConfig.cafeDuration = setupData.cafeDuration;
    }
    // Save journey options for dashboard recalculation
    if (setupData.journeyOptions) {
      prefs.journeyConfig.options = setupData.journeyOptions;
    }

    // Update BOM station
    if (setupData.bomStation) {
      prefs.weatherStation = {
        id: setupData.bomStation.stationID,
        name: setupData.bomStation.stationName
      };
    }

    // Update device
    if (setupData.selectedDevice) {
      prefs.device = {
        type: setupData.selectedDevice,
        name: setupData.selectedDevice
      };
    }

    // Update API keys if provided - save to KV per Section 3.4
    if (setupData.transitAPIKey) {
      const { setTransitApiKey } = await import('./data/kv-preferences.js');
      await setTransitApiKey(setupData.transitAPIKey);
      prefs.transitAPIConfigured = true;
    } else {
      prefs.transitAPIConfigured = false;
    }

    // Mark system as configured (for firmware check)
    prefs.system_configured = true;

    // Save preferences
    await preferences.save(prefs);

    // Mark system as configured (in-memory flag)
    isConfigured = true;

    // Start automatic journey calculation now that setup is complete
    startAutomaticJourneyCalculation();

    res.json({
      success: true,
      message: 'Setup completed successfully',
      redirectTo: '/admin.html'  // Tell frontend to redirect to dashboard
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export configuration for Render environment variable
// Per Section 3.1 Zero-Config: Config stored in KV, not env vars
app.get('/admin/export-config', async (req, res) => {
  try {
    const kvStatus = await getStorageStatus();
    
    res.json({
      success: true,
      message: 'Configuration is stored in Redis (Zero-Config)',
      instructions: [
        'Your configuration is automatically saved to Redis storage.',
        'No environment variables needed - this is Zero-Config compliant.',
        'Use the Setup Wizard or Admin Panel to update settings.'
      ],
      kvStatus: {
        available: kvStatus.available,
        hasTransitKey: kvStatus.hasTransitKey,
        hasGoogleKey: kvStatus.hasGoogleKey
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// END SMART SETUP WIZARD ENDPOINTS
// ============================================================================

// Get server status (KV-based per Section 3.4)
app.get('/admin/status', async (req, res) => {
  const apiConfig = await loadApiConfig();
  const totalApis = Object.keys(apiConfig.apis).length;
  const activeApis = Object.values(apiConfig.apis).filter(api => api.enabled && api.token).length;
  
  // Check KV for API key status per Section 3.4
  const transitKey = await getTransitApiKey();
  const hasKey = !!transitKey;

  // Get data sources status
  const dataSources = [
    {
      name: 'Metro Trains',
      active: hasKey,
      status: hasKey ? 'Live' : 'Offline'
    },
    {
      name: 'Yarra Trams',
      active: hasKey,
      status: hasKey ? 'Live' : 'Offline'
    },
    {
      name: 'Fallback Timetable',
      active: apiConfig.server.fallbackEnabled,
      status: apiConfig.server.fallbackEnabled ? 'Enabled' : 'Disabled'
    }
  ];

  res.json({
    status: 'Online',
    lastUpdate: lastUpdate || Date.now(),
    totalApis,
    activeApis,
    dataMode: hasKey ? 'Live' : 'Fallback',
    dataSources
  });
});

// Get all APIs
app.get('/admin/apis', async (req, res) => {
  const config = await loadApiConfig();
  res.json(config.apis);
});

// Get single API
app.get('/admin/api/:id', async (req, res) => {
  const config = await loadApiConfig();
  const api = config.apis[req.params.id];

  if (!api) {
    return res.status(404).json({ error: 'API not found' });
  }

  res.json(api);
});

// Update API
app.put('/admin/api/:id', async (req, res) => {
  const config = await loadApiConfig();
  const apiId = req.params.id;

  // Create or update API
  config.apis[apiId] = {
    ...config.apis[apiId],
    ...req.body,
    lastChecked: new Date().toISOString(),
    status: req.body.enabled && req.body.token ? 'active' : 'unconfigured'
  };

  await saveApiConfig(config);

  res.json({ success: true, api: config.apis[apiId] });
});

// Toggle API enabled/disabled
app.post('/admin/api/:id/toggle', async (req, res) => {
  const config = await loadApiConfig();
  const api = config.apis[req.params.id];

  if (!api) {
    return res.status(404).json({ error: 'API not found' });
  }

  api.enabled = req.body.enabled;
  api.lastChecked = new Date().toISOString();
  api.status = api.enabled && api.token ? 'active' : 'inactive';

  await saveApiConfig(config);

  res.json({ success: true, api });
});

// Delete API
app.delete('/admin/api/:id', async (req, res) => {
  const config = await loadApiConfig();

  if (!config.apis[req.params.id]) {
    return res.status(404).json({ error: 'API not found' });
  }

  delete config.apis[req.params.id];
  await saveApiConfig(config);

  res.json({ success: true });
});

// Get system configuration
app.get('/admin/config', async (req, res) => {
  const config = await loadApiConfig();
  res.json(config.server);
});

// Update system configuration
app.put('/admin/config', async (req, res) => {
  const config = await loadApiConfig();

  config.server = {
    ...config.server,
    ...req.body
  };

  await saveApiConfig(config);

  res.json({ success: true, config: config.server });
});

// Get connected devices
app.get('/admin/devices', (req, res) => {
  const deviceList = Array.from(devicePings.entries()).map(([id, info]) => ({
    id,
    lastSeen: info.lastSeen,
    lastSeenAgo: Math.floor((Date.now() - info.lastSeen) / 1000),
    requestCount: info.requestCount,
    ip: info.ip,
    status: info.status
  }));

  res.json(deviceList);
});

// Get weather status
app.get('/admin/weather', async (req, res) => {
  try {
    const weatherData = await weather.getCurrentWeather();
    const cacheStatus = weather.getCacheStatus();

    // Get location from preferences or use default
    const prefs = preferences.get();
    const location = prefs?.weather?.location || 'Configured Location';

    res.json({
      current: weatherData,
      cache: cacheStatus,
      location: location,
      source: 'Bureau of Meteorology'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force refresh weather cache
app.post('/admin/weather/refresh', async (req, res) => {
  try {
    weather.clearCache();
    const weatherData = await weather.getCurrentWeather();

    res.json({
      success: true,
      message: 'Weather cache refreshed',
      weather: weatherData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== USER PREFERENCES ENDPOINTS ==========

// Get all preferences
app.get('/admin/preferences', (req, res) => {
  try {
    const prefs = preferences.get();
    const status = preferences.getStatus();

    res.json({
      success: true,
      preferences: prefs,
      status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update preferences (full or partial)
app.put('/admin/preferences', async (req, res) => {
  try {
    const updates = req.body;

    const updated = await preferences.update(updates);

    res.json({
      success: true,
      preferences: updated,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint for preferences (for backward compatibility)
app.post('/admin/preferences', async (req, res) => {
  try {
    const updates = req.body;

    const updated = await preferences.update(updates);

    res.json({
      success: true,
      preferences: updated,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update addresses specifically
app.put('/admin/preferences/addresses', async (req, res) => {
  try {
    const { home, cafe, work } = req.body;

    const addresses = await preferences.updateAddresses({
      home: home || '',
      cafe: cafe || '',
      work: work || ''
    });

    res.json({
      success: true,
      addresses,
      message: 'Addresses updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update journey preferences
app.put('/admin/preferences/journey', async (req, res) => {
  try {
    const updates = req.body;

    const journey = await preferences.updateJourneyPreferences(updates);

    res.json({
      success: true,
      journey,
      message: 'Journey preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== JOURNEY PROFILES API (Task #6) ====================

// Get all profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = preferences.listProfiles();
    res.json({
      success: true,
      profiles,
      activeProfileId: preferences.getProfiles().activeProfileId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active profile
app.get('/api/profiles/active', async (req, res) => {
  try {
    const profile = preferences.getActiveProfile();
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get scheduled profile (based on current date/time)
app.get('/api/profiles/scheduled', async (req, res) => {
  try {
    const profile = preferences.getScheduledProfile();
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get profile by ID
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const profile = preferences.getProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new profile
app.post('/api/profiles', async (req, res) => {
  try {
    const profileData = req.body;
    const profile = await preferences.createProfile(profileData);

    // Show success toast
    res.json({
      success: true,
      profile,
      message: `Profile "${profile.name}" created successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update profile
app.put('/api/profiles/:id', async (req, res) => {
  try {
    const updates = req.body;
    const profile = await preferences.updateProfile(req.params.id, updates);

    res.json({
      success: true,
      profile,
      message: `Profile "${profile.name}" updated successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete profile
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    if (req.params.id === 'default') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete default profile'
      });
    }

    await preferences.deleteProfile(req.params.id);

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Set active profile
app.put('/api/profiles/:id/activate', async (req, res) => {
  try {
    const profile = await preferences.setActiveProfile(req.params.id);

    // Trigger journey recalculation
    if (journeyCalculationInterval) {
      await calculateAndCacheJourney();
    }

    res.json({
      success: true,
      profile,
      message: `Switched to profile "${profile.name}"`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== END JOURNEY PROFILES API ====================

// GTFS Realtime API configuration (Victorian users)
app.post('/admin/apis/gtfs-realtime', async (req, res) => {
  try {
    const { subscription_key } = req.body;

    if (!subscription_key) {
      return res.status(400).json({
        success: false,
        message: 'Subscription key is required'
      });
    }

    // Store in preferences
    const prefs = preferences.get();
    prefs.gtfsRealtime = { subscription_key };
    await preferences.save();


    res.json({
      success: true,
      message: 'GTFS Realtime API key saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test GTFS Realtime API connection
app.post('/admin/apis/gtfs-realtime/test', async (req, res) => {
  try {
    const { subscription_key } = req.body;

    if (!subscription_key) {
      return res.status(400).json({
        success: false,
        message: 'Subscription key is required'
      });
    }


    // Test the GTFS Realtime API using KeyId header (correct for Transport Victoria)
    const testUrl = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates';
    const response = await fetch(testUrl, {
      headers: {
        'KeyId': subscription_key,
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }

    // Get the response as binary data
    const buffer = await response.arrayBuffer();
    const dataSize = buffer.byteLength;


    res.json({
      success: true,
      message: 'Connection successful',
      tripCount: 'Data received',
      dataSize: `${(dataSize / 1024).toFixed(2)} KB`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Transport Victoria API key configuration
app.post('/admin/apis/transport', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    // Update preferences with the transport API key
    const prefs = preferences.get();
    prefs.api = prefs.api || {};
    prefs.api.key = apiKey;
    prefs.api.provider = 'Transport Victoria OpenData';

    await preferences.save();

    // Save to KV for Zero-Config per Section 3.4 & 17.5
    const { setTransitApiKey } = await import('./data/kv-preferences.js');
    await setTransitApiKey(apiKey);

    res.json({
      success: true,
      message: 'Transport Victoria API key saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Additional APIs configuration (Google Places, Mapbox, RSS feeds)
app.post('/admin/apis/additional', async (req, res) => {
  try {
    // Support both old format (google_places, mapbox, rss_feeds) and new format (apiId, apiKey)
    const { google_places, mapbox, rss_feeds, apiId, apiKey, enabled } = req.body;

    // Store in environment variables / preferences
    const prefs = preferences.get();

    // Initialize additionalAPIs if it doesn't exist
    if (!prefs.additionalAPIs) {
      prefs.additionalAPIs = {
        google_places: null,
        mapbox: null,
        rss_feeds: []
      };
    }

    // Handle new format (from setup wizard)
    if (apiId && apiKey !== undefined) {
      if (apiId === 'googlePlaces') {
        prefs.additionalAPIs.google_places = enabled ? apiKey : null;
      } else if (apiId === 'mapbox') {
        prefs.additionalAPIs.mapbox = enabled ? apiKey : null;
      }
    } else {
      // Handle old format (from API Settings tab)
      prefs.additionalAPIs.google_places = google_places || prefs.additionalAPIs.google_places;
      prefs.additionalAPIs.mapbox = mapbox || prefs.additionalAPIs.mapbox;
      prefs.additionalAPIs.rss_feeds = rss_feeds || prefs.additionalAPIs.rss_feeds;
    }

    await preferences.save();

    // Re-initialize geocoding service with new API keys for immediate effect
    if (prefs.additionalAPIs.google_places || prefs.additionalAPIs.mapbox) {
      global.geocodingService = new GeocodingService({
        googlePlacesKey: prefs.additionalAPIs.google_places || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_KEY,
        mapboxToken: prefs.additionalAPIs.mapbox || process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN
      });
    }

    res.json({
      success: true,
      message: 'Additional APIs saved successfully. Geocoding service updated for immediate use.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Force save Google Places API key and test it immediately
// This endpoint saves the key, reinitializes services, and validates the key works
app.post('/admin/apis/force-save-google-places', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || apiKey.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'API key is required',
        tested: false
      });
    }


    // Get preferences
    const prefs = preferences.get();

    // Initialize additionalAPIs if it doesn't exist
    if (!prefs.additionalAPIs) {
      prefs.additionalAPIs = {
        google_places: null,
        mapbox: null,
        rss_feeds: []
      };
    }

    // Save the API key
    prefs.additionalAPIs.google_places = apiKey.trim();
    await preferences.save();

    // Immediately reinitialize geocoding service with the new key
    global.geocodingService = new GeocodingService({
      googlePlacesKey: prefs.additionalAPIs.google_places,
      mapboxToken: prefs.additionalAPIs.mapbox || process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN
    });

    // Test the API key by doing a test geocode
    let testResult = { success: false, message: 'Not tested' };
    try {
      // Use a generic Australian landmark for testing (state-agnostic)
      const testAddress = 'Sydney Opera House, Sydney NSW';
      const result = await global.geocodingService.geocode(testAddress);

      if (result && result.results && result.results.length > 0) {
        const firstResult = result.results[0];
        testResult = {
          success: true,
          message: 'API key is valid and working',
          testAddress: testAddress,
          foundAddress: firstResult.formatted_address,
          service: firstResult.service,
          confidence: firstResult.confidence
        };
      } else {
        testResult = {
          success: false,
          message: 'API key saved but test geocode returned no results',
          testAddress: testAddress
        };
      }
    } catch (testError) {
      testResult = {
        success: false,
        message: `API key saved but test failed: ${testError.message}`,
        error: testError.message
      };
    }

    res.json({
      success: true,
      message: 'Google Places API key saved and service reinitialized',
      keyLength: apiKey.trim().length,
      availableServices: global.geocodingService.getAvailableServices(),
      tested: true,
      testResult: testResult,
      prioritizeGoogle: testResult.success ? true : false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      tested: false
    });
  }
});

// Get preferences status
app.get('/admin/preferences/status', (req, res) => {
  try{
    const status = preferences.getStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Smart Setup - Auto-detect stops and configure journey
// This endpoint uses FALLBACK data initially - no API keys required
// Users configure API keys later to enable live real-time data
app.post('/admin/smart-setup', async (req, res) => {
  // Set a timeout for the entire request (30 seconds max)
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout - setup took too long. This could be due to network issues. Please try again.',
        suggestion: 'Check your internet connection and try again. If the problem persists, try using more specific addresses with suburb and state.'
      });
    }
  }, 30000);

  try {
    const { addresses, arrivalTime, coffeeEnabled, deviceConfig } = req.body;


    // Validate required fields
    if (!addresses?.home || !addresses?.work || !arrivalTime) {
      return res.status(400).json({
        success: false,
        message: 'Home address, work address, and arrival time are required'
      });
    }

    // Step 1: Geocode addresses to get coordinates
    // GeocodingService returns { lat, lon, formattedAddress, source } directly
    let homeGeocode;
    try {
      homeGeocode = await global.geocodingService.geocode(addresses.home, { country: 'AU' });
    } catch (geoError) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        message: `Could not find home address: "${addresses.home}". Please try entering the full address with suburb and state (e.g., "123 Example Street, Melbourne VIC 3000")`
      });
    }

    let workGeocode;
    try {
      workGeocode = await global.geocodingService.geocode(addresses.work, { country: 'AU' });
    } catch (geoError) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        message: `Could not find work address: "${addresses.work}". Please try entering the full address with suburb and state.`
      });
    }

    if (!homeGeocode?.lat || !homeGeocode?.lon) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        message: `Could not find home address: "${addresses.home}". Please try entering the full address with suburb and state (e.g., "123 Example Street, Melbourne VIC 3000")`
      });
    }

    if (!workGeocode?.lat || !workGeocode?.lon) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        message: `Could not find work address: "${addresses.work}". Please try entering the full address with suburb and state.`
      });
    }

    // Convert geocode result to location format expected by rest of code
    const homeLocation = {
      lat: homeGeocode.lat,
      lon: homeGeocode.lon,
      city: homeGeocode.formattedAddress?.split(',')[1]?.trim() || '',
      formattedAddress: homeGeocode.formattedAddress
    };
    const workLocation = {
      lat: workGeocode.lat,
      lon: workGeocode.lon,
      city: workGeocode.formattedAddress?.split(',')[1]?.trim() || '',
      formattedAddress: workGeocode.formattedAddress
    };


    // Step 2: Detect state from coordinates (using home address)
    const state = smartJourneyPlanner.detectStateFromCoordinates(homeLocation.lat, homeLocation.lon);

    // Step 3: Find nearby stops using smart journey planner
    // During initial setup, we use fallback data (no API keys required yet)
    // Users will configure API keys later to enable live data
    const nearbyStopsHome = await smartJourneyPlanner.findNearbyStops(homeLocation, { key: null, token: null });

    const nearbyStopsWork = await smartJourneyPlanner.findNearbyStops(workLocation, { key: null, token: null });

    if (!nearbyStopsHome || nearbyStopsHome.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No transit stops found near your home address (${addresses.home}). This area may not have public transport coverage, or you may be too far from the nearest stop. Try a different address or contact support.`
      });
    }

    if (!nearbyStopsWork || nearbyStopsWork.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No transit stops found near your work address (${addresses.work}). This area may not have public transport coverage, or you may be too far from the nearest stop. Try a different address or contact support.`
      });
    }


    // Step 4: Auto-select best stops (highest priority = train, then tram, then bus)
    const bestHomeStop = nearbyStopsHome[0]; // Already sorted by priority + distance
    const bestWorkStop = nearbyStopsWork[0];


    // Step 5: Determine transit route configuration
    const transitRoute = {
      numberOfModes: 1, // Start with single mode
      mode1: {
        type: bestHomeStop.route_type,
        originStation: {
          stop_id: bestHomeStop.stop_id,
          name: bestHomeStop.stop_name,
          lat: bestHomeStop.lat,
          lon: bestHomeStop.lon
        },
        destinationStation: {
          stop_id: bestWorkStop.stop_id,
          name: bestWorkStop.stop_name,
          lat: bestWorkStop.lat,
          lon: bestWorkStop.lon
        }
      }
    };

    // Step 6: Save all configuration to preferences
    const configData = {
      addresses: {
        home: addresses.home,
        work: addresses.work,
        cafe: addresses.cafe || ''
      },
      location: {
        state: state,
        city: homeLocation.city || '',
        transitAuthority: getTransitAuthorityForState(state)
      },
      journey: {
        arrivalTime: arrivalTime,
        coffeeEnabled: coffeeEnabled,
        coffeeTime: 5,
        transitRoute: transitRoute
      },
      deviceConfig: deviceConfig || {
        selectedDevice: 'trmnl-byos',
        resolution: { width: 800, height: 480 },
        orientation: 'landscape'
      }
    };

    await preferences.update(configData);

    // Step 7: Validate selected transit stops
    const homeStopValidation = DataValidator.validateTransitStop(bestHomeStop, homeLocation);
    const workStopValidation = DataValidator.validateTransitStop(bestWorkStop, workLocation);


    // Step 8: Start automatic journey calculation
    startAutomaticJourneyCalculation();

    // Clear timeout
    clearTimeout(timeoutId);

    // Return success with details
    res.json({
      success: true,
      state: state,
      stopsFound: nearbyStopsHome.length + nearbyStopsWork.length,
      routeMode: bestHomeStop.route_type_name,
      homeStop: bestHomeStop.stop_name,
      workStop: bestWorkStop.stop_name,
      message: 'Journey planning configured successfully. Configure API keys in the API Settings tab to enable live data.',
      usingFallbackData: true, // Indicate we're using fallback data initially
      nextStep: 'Configure API keys to enable real-time transit data',
      validation: {
        homeStop: {
          confidence: homeStopValidation.score,
          level: homeStopValidation.level,
          checks: homeStopValidation.checks
        },
        workStop: {
          confidence: workStopValidation.score,
          level: workStopValidation.level,
          checks: workStopValidation.checks
        }
      }
    });

  } catch (error) {

    // Clear timeout
    clearTimeout(timeoutId);

    // Only send response if not already sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'An unexpected error occurred during setup',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        suggestion: 'Please check the addresses are correct and try again. If the issue persists, contact support.'
      });
    }
  }
});

// ========== MULTI-MODAL JOURNEY CONFIGURATION ==========
// Supports complex journeys with up to 4 transit modes
// Example: Home → Cafe → Tram → Train → Walk → Office
app.post('/admin/multi-modal-journey/configure', async (req, res) => {
  try {
    const {
      addresses,      // { home, cafe, work }
      arrivalTime,    // "09:00"
      coffeeEnabled,  // true/false
      cafeLocation,   // 'before-transit-1', 'between-transit-1-2', 'after-last-transit'
      transitModes    // Array of { type, origin, destination, estimatedDuration }
    } = req.body;


    // Validate required fields
    if (!addresses?.home || !addresses?.work || !arrivalTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: addresses.home, addresses.work, and arrivalTime are required'
      });
    }

    if (!transitModes || !Array.isArray(transitModes) || transitModes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one transit mode is required'
      });
    }

    if (transitModes.length > 4) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 4 transit modes supported'
      });
    }

    // Build transit route configuration
    const transitRoute = {
      numberOfModes: transitModes.length,
      mode1: null,
      mode2: null,
      mode3: null,
      mode4: null
    };

    // Configure each transit mode
    for (let i = 0; i < transitModes.length; i++) {
      const mode = transitModes[i];
      const modeKey = `mode${i + 1}`;

      // Validate mode data
      if (!mode.origin || !mode.destination) {
        return res.status(400).json({
          success: false,
          error: `Mode ${i + 1} must have origin and destination`
        });
      }

      transitRoute[modeKey] = {
        type: mode.type ?? 0,  // Default to train (0)
        originStation: {
          name: mode.origin.name || mode.origin,
          id: mode.origin.id || null,
          lat: mode.origin.lat || null,
          lon: mode.origin.lon || null
        },
        destinationStation: {
          name: mode.destination.name || mode.destination,
          id: mode.destination.id || null,
          lat: mode.destination.lat || null,
          lon: mode.destination.lon || null
        },
        estimatedDuration: mode.estimatedDuration || null
      };
    }

    // Validate cafe location for multi-modal journeys
    const validCafeLocations = [
      'before-transit-1',
      'between-transit-1-2',
      'between-transit-2-3',
      'between-transit-3-4',
      'after-last-transit'
    ];
    const effectiveCafeLocation = coffeeEnabled
      ? (validCafeLocations.includes(cafeLocation) ? cafeLocation : 'before-transit-1')
      : null;

    // Update preferences
    const configData = {
      addresses: {
        home: addresses.home,
        cafe: addresses.cafe || '',
        cafeName: addresses.cafeName || '',
        work: addresses.work
      },
      journey: {
        arrivalTime: arrivalTime,
        coffeeEnabled: coffeeEnabled === true,
        cafeLocation: effectiveCafeLocation,
        transitRoute: transitRoute
      }
    };

    await preferences.update(configData);

    // Start automatic journey calculation
    startAutomaticJourneyCalculation();


    res.json({
      success: true,
      message: 'Multi-modal journey configured successfully',
      configuration: {
        numberOfModes: transitRoute.numberOfModes,
        modes: transitModes.map((m, i) => ({
          modeNumber: i + 1,
          type: ['Train', 'Tram', 'Bus', 'V/Line', 'Ferry', 'Light Rail'][m.type] || 'Unknown',
          from: m.origin.name || m.origin,
          to: m.destination.name || m.destination
        })),
        coffeeLocation: effectiveCafeLocation
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get example multi-modal journey configurations
app.get('/admin/multi-modal-journey/examples', (req, res) => {
  res.json({
    success: true,
    examples: [
      {
        name: 'South Yarra to Parliament (Tram + Train)',
        description: 'Home → Cafe → Tram → Train → Office',
        config: {
          addresses: {
            home: 'Home Address (configure in wizard)',
            cafe: 'Local Cafe',
            work: 'Work Address (configure in wizard)'
          },
          arrivalTime: '09:00',
          coffeeEnabled: true,
          cafeLocation: 'before-transit-1',
          transitModes: [
            {
              type: 1,  // Tram
              origin: { name: 'Toorak Rd/Chapel St', id: '2803', lat: -37.8400, lon: 144.9980 },
              destination: { name: 'South Yarra', id: '1159', lat: -37.8397, lon: 144.9933 },
              estimatedDuration: 5
            },
            {
              type: 0,  // Train
              origin: { name: 'South Yarra', id: '1159', lat: -37.8397, lon: 144.9933 },
              destination: { name: 'Parliament', id: '1120', lat: -37.8110, lon: 144.9730 },
              estimatedDuration: 8
            }
          ]
        }
      },
      {
        name: 'Richmond to CBD (Single Train)',
        description: 'Home → Cafe → Train → Office',
        config: {
          addresses: {
            home: 'Your Home Address (configure)',
            cafe: 'Your Cafe (configure)',
            work: 'Your Work Address (configure)'
          },
          arrivalTime: '09:00',
          coffeeEnabled: true,
          cafeLocation: 'before-transit-1',
          transitModes: [
            {
              type: 0,  // Train
              origin: { name: 'Richmond', id: '1104', lat: -37.8210, lon: 145.0037 },
              destination: { name: 'Flinders Street Station', id: '1071', lat: -37.8183, lon: 144.9671 },
              estimatedDuration: 5
            }
          ]
        }
      }
    ]
  });
});

// Helper function to get transit authority for state
function getTransitAuthorityForState(state) {
  const authorities = {
    'VIC': 'Transport for Victoria',
    'NSW': 'Transport for NSW',
    'QLD': 'TransLink (Queensland)',
    'SA': 'Adelaide Metro',
    'WA': 'Transperth',
    'TAS': 'Metro Tasmania',
    'ACT': 'Transport Canberra',
    'NT': 'Transport NT'
  };
  return authorities[state] || 'Local Transit Authority';
}

// Get device configuration for firmware (Development Rules v1.0.15 Section X)
// Supports: TRMNL BYOS, Kindle Paperwhite 3/4/5, Kindle Basic, Kindle 11
app.get('/api/device-config', (req, res) => {
  try {
    const prefs = preferences.get();

    // All supported device specifications
    const DEVICE_SPECS = {
      'trmnl-byos': {
        name: 'TRMNL BYOS (7.5")',
        resolution: { width: 800, height: 480 },
        orientation: 'landscape',
        ppi: 117,
        colorDepth: '1-bit',
        refreshMethod: 'webhook',
        partialRefreshSupported: true,
        firmwarePath: '/firmware/src/main.cpp',
        jailbreakRequired: false
      },
      'kindle-pw3': {
        name: 'Kindle Paperwhite 3 (6")',
        resolution: { width: 1072, height: 1448 },
        orientation: 'portrait',
        ppi: 300,
        colorDepth: '4-bit grayscale',
        refreshMethod: 'trmnl_extension',
        partialRefreshSupported: false,
        firmwarePath: '/firmware/kindle/kindle-pw3/',
        jailbreakRequired: true
      },
      'kindle-pw4': {
        name: 'Kindle Paperwhite 4 (6")',
        resolution: { width: 1072, height: 1448 },
        orientation: 'portrait',
        ppi: 300,
        colorDepth: '4-bit grayscale',
        refreshMethod: 'trmnl_extension',
        partialRefreshSupported: false,
        firmwarePath: '/firmware/kindle/kindle-pw4/',
        jailbreakRequired: true
      },
      'kindle-pw5': {
        name: 'Kindle Paperwhite 5 (6.8")',
        resolution: { width: 1236, height: 1648 },
        orientation: 'portrait',
        ppi: 300,
        colorDepth: '4-bit grayscale',
        refreshMethod: 'trmnl_extension',
        partialRefreshSupported: false,
        firmwarePath: '/firmware/kindle/kindle-pw5/',
        jailbreakRequired: true
      },
      'kindle-basic-10': {
        name: 'Kindle Basic (10th gen)',
        resolution: { width: 600, height: 800 },
        orientation: 'portrait',
        ppi: 167,
        colorDepth: '4-bit grayscale',
        refreshMethod: 'trmnl_extension',
        partialRefreshSupported: false,
        firmwarePath: '/firmware/kindle/kindle-basic-10/',
        jailbreakRequired: true
      },
      'kindle-11': {
        name: 'Kindle (11th gen)',
        resolution: { width: 1072, height: 1448 },
        orientation: 'portrait',
        ppi: 300,
        colorDepth: '4-bit grayscale',
        refreshMethod: 'trmnl_extension',
        partialRefreshSupported: false,
        firmwarePath: '/firmware/kindle/kindle-11/',
        jailbreakRequired: true
      }
    };

    const deviceConfig = prefs.deviceConfig || {
      selectedDevice: 'trmnl-byos',
      resolution: { width: 800, height: 480 },
      orientation: 'landscape'
    };

    const selectedDevice = deviceConfig.selectedDevice || 'trmnl-byos';
    const deviceSpec = DEVICE_SPECS[selectedDevice] || DEVICE_SPECS['trmnl-byos'];

    const refreshSettings = prefs.refreshSettings || {
      displayRefresh: { interval: 900000, unit: 'minutes' },
      journeyRecalc: { interval: 120000, unit: 'minutes' },
      dataFetch: { interval: 30000, unit: 'seconds' },
      trmnlWebhook: { interval: 900000, fixed: true }
    };

    // Get partial refresh settings if enabled
    const partialRefresh = refreshSettings.partialRefresh || null;
    const enabledZones = preferences.getEnabledRefreshZones ? preferences.getEnabledRefreshZones() : [];

    // Determine correct endpoint based on device type
    const isKindle = selectedDevice.startsWith('kindle-');
    const webhookEndpoint = isKindle ? '/api/kindle/image' : '/api/screen';

    res.json({
      success: true,
      device: selectedDevice,
      deviceName: deviceSpec.name,
      resolution: deviceSpec.resolution,
      orientation: deviceSpec.orientation,
      ppi: deviceSpec.ppi,
      colorDepth: deviceSpec.colorDepth,
      refreshMethod: deviceSpec.refreshMethod,
      jailbreakRequired: deviceSpec.jailbreakRequired,
      firmwarePath: deviceSpec.firmwarePath,
      refreshInterval: refreshSettings.displayRefresh.interval,
      webhookEndpoint: webhookEndpoint,
      dashboardEndpoint: '/api/dashboard',
      kindleImageEndpoint: isKindle ? `/api/kindle/image?model=${selectedDevice}` : null,
      serverVersion: process.env.npm_package_version || '3.0.0',

      // Partial refresh configuration (TRMNL only)
      partialRefresh: deviceSpec.partialRefreshSupported && partialRefresh ? {
        enabled: partialRefresh.enabled,
        interval: partialRefresh.interval,
        zones: enabledZones.map(zone => ({
          id: zone.id,
          name: zone.name,
          refreshInterval: zone.refreshInterval,
          coordinates: zone.coordinates
        })),
        fullRefreshInterval: partialRefresh.fullRefreshInterval,
        smartCoalescing: partialRefresh.smartCoalescing
      } : null,

      // All available devices for setup wizard
      availableDevices: Object.keys(DEVICE_SPECS).map(key => ({
        id: key,
        ...DEVICE_SPECS[key]
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update refresh settings (Development Rules v1.0.15 Section Y)
app.post('/admin/refresh-settings', async (req, res) => {
  try {
    const { displayRefresh, journeyRecalc, dataFetch } = req.body;

    const refreshSettings = {};
    if (displayRefresh) refreshSettings.displayRefresh = displayRefresh;
    if (journeyRecalc) refreshSettings.journeyRecalc = journeyRecalc;
    if (dataFetch) refreshSettings.dataFetch = dataFetch;

    await preferences.updateRefreshSettings(refreshSettings);

    res.json({
      success: true,
      message: 'Refresh settings updated successfully',
      settings: preferences.getRefreshSettings()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update partial refresh settings
app.post('/admin/partial-refresh-settings', async (req, res) => {
  try {
    const { enabled, interval, zones, fullRefreshInterval, smartCoalescing } = req.body;

    const partialRefreshSettings = {};
    if (enabled !== undefined) partialRefreshSettings.enabled = enabled;
    if (interval) partialRefreshSettings.interval = interval;
    if (zones) partialRefreshSettings.zones = zones;
    if (fullRefreshInterval) partialRefreshSettings.fullRefreshInterval = fullRefreshInterval;
    if (smartCoalescing !== undefined) partialRefreshSettings.smartCoalescing = smartCoalescing;

    await preferences.updatePartialRefreshSettings(partialRefreshSettings);

    res.json({
      success: true,
      message: 'Partial refresh settings updated successfully',
      settings: preferences.getPartialRefreshSettings()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get zones that need refreshing
// Device firmware calls this to determine which zones to update
app.get('/api/refresh-zones', (req, res) => {
  try {
    const { lastRefreshTimes } = req.query;
    const parsedTimes = lastRefreshTimes ? JSON.parse(lastRefreshTimes) : {};

    const partialRefresh = preferences.getPartialRefreshSettings();
    if (!partialRefresh || !partialRefresh.enabled) {
      return res.json({
        success: true,
        partialRefreshEnabled: false,
        refreshAll: true,
        zones: []
      });
    }

    const zonesToRefresh = [];
    const enabledZones = preferences.getEnabledRefreshZones();

    for (const zone of enabledZones) {
      const lastRefresh = parsedTimes[zone.id] || 0;
      if (preferences.shouldRefreshZone(zone.id, lastRefresh)) {
        zonesToRefresh.push({
          id: zone.id,
          name: zone.name,
          coordinates: zone.coordinates,
          refreshInterval: zone.refreshInterval
        });
      }
    }

    // Check if we should do full refresh instead
    const shouldFullRefresh =
      zonesToRefresh.length >= 3 ||  // Too many zones changed
      (parsedTimes.fullRefresh && Date.now() - parsedTimes.fullRefresh >= partialRefresh.fullRefreshInterval);

    res.json({
      success: true,
      partialRefreshEnabled: true,
      refreshAll: shouldFullRefresh,
      zones: shouldFullRefresh ? [] : zonesToRefresh,
      fullRefreshRecommended: shouldFullRefresh,
      nextFullRefresh: parsedTimes.fullRefresh
        ? parsedTimes.fullRefresh + partialRefresh.fullRefreshInterval
        : Date.now() + partialRefresh.fullRefreshInterval
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate preferences
app.get('/admin/preferences/validate', (req, res) => {
  try {
    const validation = preferences.validate();

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset preferences to defaults
app.post('/admin/preferences/reset', async (req, res) => {
  try {
    const reset = await preferences.reset();

    res.json({
      success: true,
      preferences: reset,
      message: 'Preferences reset to defaults'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export preferences
app.get('/admin/preferences/export', (req, res) => {
  try {
    const json = preferences.export();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="commute-compute-preferences.json"');
    res.send(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import preferences
app.post('/admin/preferences/import', async (req, res) => {
  try {
    const { json } = req.body;

    const result = await preferences.import(json);

    if (result.success) {
      res.json({
        success: true,
        message: 'Preferences imported successfully'
      });
    } else {
      res.status(400).json({
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Address autocomplete search - PARALLEL MULTI-SOURCE SEARCH
app.get('/admin/address/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 3) {
      return res.json({
        success: true,
        results: [],
        message: 'Query too short (minimum 3 characters)'
      });
    }


    // Query ALL services in PARALLEL
    const searchPromises = [];

    // 1. Google Places (New) API (if API key available)
    // Per Section 11.3: MUST use Places API (New) at places.googleapis.com/v1
    const googleApiKey = process.env.GOOGLE_PLACES_KEY || process.env.GOOGLE_API_KEY;
    if (googleApiKey) {
      searchPromises.push(
        (async () => {
          try {
            // Places API (New) - POST to places.googleapis.com/v1/places:autocomplete
            const autocompleteResponse = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleApiKey
              },
              body: JSON.stringify({
                input: query,
                includedRegionCodes: ['au']
              })
            });
            const autocompleteData = await autocompleteResponse.json();

            if (autocompleteData.suggestions && autocompleteData.suggestions.length > 0) {
              // Get details for top 3 predictions using Place Details (New)
              const detailsPromises = autocompleteData.suggestions.slice(0, 3).map(async (suggestion) => {
                if (!suggestion.placePrediction?.placeId) return null;

                const placeId = suggestion.placePrediction.placeId;
                // Place Details (New) API
                const detailsResponse = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
                  method: 'GET',
                  headers: {
                    'X-Goog-Api-Key': googleApiKey,
                    'X-Goog-FieldMask': 'displayName,formattedAddress,location,types,addressComponents'
                  }
                });
                const place = await detailsResponse.json();

                if (place && place.location) {
                  // Extract state from address components
                  const stateComponent = place.addressComponents?.find(c =>
                    c.types?.includes('administrative_area_level_1')
                  );
                  return {
                    display_name: place.displayName?.text || suggestion.placePrediction.text?.text || query,
                    address: place.displayName?.text || suggestion.placePrediction.text?.text || query,
                    full_address: place.formattedAddress || '',
                    lat: place.location.latitude,
                    lon: place.location.longitude,
                    type: place.types?.[0] || 'place',
                    state: stateComponent?.shortText || null,
                    importance: 1.0,
                    source: 'google'
                  };
                }
                return null;
              });

              const results = (await Promise.all(detailsPromises)).filter(r => r !== null);
              return results;
            }
          } catch (error) {
          }
          return [];
        })()
      );
    }

    // 2. Nominatim (OpenStreetMap) - always available, no API key
    searchPromises.push(
      (async () => {
        try {
          // NO location bias - search all of Australia
          const nominatimQuery = encodeURIComponent(query + ', Australia');
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${nominatimQuery}&countrycodes=au&limit=5&addressdetails=1`;

          const response = await fetch(url, {
            headers: { 'User-Agent': 'Commute Compute/2.5 (Smart Transit System)' }
          });

          if (!response.ok) {
            throw new Error(`Status ${response.status}`);
          }

          const data = await response.json();
          const results = data.map(place => ({
            display_name: place.display_name,
            address: place.address?.road || place.address?.suburb || place.name,
            full_address: place.display_name,
            lat: parseFloat(place.lat),
            lon: parseFloat(place.lon),
            type: place.type,
            state: place.address?.state || null,
            importance: place.importance || 0.5,
            source: 'nominatim'
          }));

          return results;
        } catch (error) {
          return [];
        }
      })()
    );

    // 3. Mapbox (if API key available)
    const mapboxToken = process.env.MAPBOX_TOKEN;
    if (mapboxToken) {
      searchPromises.push(
        (async () => {
          try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=au&limit=3&access_token=${mapboxToken}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
              const results = data.features.map(feature => ({
                display_name: feature.place_name,
                address: feature.text,
                full_address: feature.place_name,
                lat: feature.geometry.coordinates[1],
                lon: feature.geometry.coordinates[0],
                type: feature.place_type?.[0] || 'place',
                state: feature.context?.find(c => c.id.startsWith('region'))?.text || null,
                importance: feature.relevance || 0.5,
                source: 'mapbox'
              }));

              return results;
            }
          } catch (error) {
          }
          return [];
        })()
      );
    }

    // Wait for ALL services to respond (or timeout after 3 seconds each)
    const allResults = await Promise.all(searchPromises);

    // Combine and deduplicate results
    const combinedResults = allResults.flat();

    // Remove duplicates (same lat/lon within 50m)
    const uniqueResults = [];
    for (const result of combinedResults) {
      const isDuplicate = uniqueResults.some(existing => {
        const distance = Math.sqrt(
          Math.pow((existing.lat - result.lat) * 111000, 2) +
          Math.pow((existing.lon - result.lon) * 111000, 2)
        );
        return distance < 50; // Within 50 meters
      });

      if (!isDuplicate) {
        uniqueResults.push(result);
      }
    }

    // Sort by importance (Google results first, then by relevance)
    uniqueResults.sort((a, b) => {
      if (a.source === 'google' && b.source !== 'google') return -1;
      if (b.source === 'google' && a.source !== 'google') return 1;
      return (b.importance || 0) - (a.importance || 0);
    });


    if (uniqueResults.length === 0) {
      return res.json({
        success: true,
        results: [],
        count: 0,
        sources: [...new Set(combinedResults.map(r => r.source))],
        message: `No results found for "${query}". Try including more details (e.g., suburb, state, postcode)`
      });
    }

    // Calculate geocoding confidence for results
    const topResults = uniqueResults.slice(0, 10);
    const geocodingConfidence = DataValidator.calculateGeocodingConfidence(topResults);
    const crossValidation = DataValidator.crossValidateGeocoding(topResults);


    res.json({
      success: true,
      results: topResults,
      count: uniqueResults.length,
      sources: [...new Set(combinedResults.map(r => r.source))],
      message: `Found ${uniqueResults.length} result(s)`,
      validation: {
        confidence: {
          score: geocodingConfidence.score,
          level: geocodingConfidence.level,
          message: geocodingConfidence.message,
          sourceCount: geocodingConfidence.sourceCount,
          sources: geocodingConfidence.sources
        },
        crossValidation: {
          agreement: crossValidation.agreement,
          isValid: crossValidation.isValid,
          message: crossValidation.message
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Search failed. Please try again or contact support.'
    });
  }
});

// ========== ROUTE PLANNING ENDPOINTS ==========

// Calculate smart route: Home → Coffee → Work
// Uses saved preferences if not provided in request
app.post('/admin/route/calculate', async (req, res) => {
  try {
    // Get saved preferences
    const prefs = preferences.get();
    const savedAddresses = prefs.addresses || {};
    const savedJourney = prefs.journey || {};
    const savedApi = prefs.api || {};
    const manualWalkingTimes = prefs.manualWalkingTimes || {};
    const addressFlags = prefs.addressFlags || {};

    // Use provided values or fall back to saved preferences
    const homeAddress = req.body.homeAddress || savedAddresses.home;
    const coffeeAddress = req.body.coffeeAddress || savedAddresses.cafe;
    const workAddress = req.body.workAddress || savedAddresses.work;
    const arrivalTime = req.body.arrivalTime || savedJourney.arrivalTime;

    // Validate inputs
    if (!homeAddress || !workAddress || !arrivalTime) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['homeAddress', 'workAddress', 'arrivalTime'],
        message: 'Please configure addresses in preferences or provide them in the request'
      });
    }

    // Coffee is optional
    const coffeeEnabled = savedJourney.coffeeEnabled && coffeeAddress;

    if (manualWalkingTimes.useManualTimes) {
    }

    // Extract journey configuration from preferences
    // No hardcoded defaults - users must configure their own stations via journey planner
    const journeyConfig = {
      coffeeEnabled: savedJourney.coffeeEnabled !== false,
      cafeLocation: savedJourney.cafeLocation || 'before-transit-1',
      transitRoute: savedJourney.transitRoute || {
        numberOfModes: 1,
        mode1: {
          type: 0,
          originStation: {
            name: null,  // Must be configured by user
            lat: null,
            lon: null
          },
          destinationStation: {
            name: null,  // Must be configured by user
            lat: null,
            lon: null
          },
          estimatedDuration: null
        },
        mode2: null
      }
    };


    // Calculate the route with manual walking times and journey config
    const route = await routePlanner.calculateRoute(
      homeAddress,
      coffeeAddress || 'No coffee stop',
      workAddress,
      arrivalTime,
      manualWalkingTimes,
      addressFlags,
      journeyConfig
    );

    // Update address validation flags after successful calculation
    if (!manualWalkingTimes.useManualTimes) {
      // If we successfully calculated without manual times, all addresses were geocoded
      await preferences.updateSection('addressFlags', {
        homeFound: true,
        cafeFound: !!coffeeAddress, // true if cafe was provided
        workFound: true
      });
    }

    res.json({
      success: true,
      route,
      message: 'Route calculated successfully'
    });

  } catch (error) {

    // Check if this is a geocoding error
    const isGeocodingError = error.message.includes('Address not found') ||
                            error.message.includes('Geocoding failed');

    if (isGeocodingError && !manualWalkingTimes.useManualTimes) {
      // Update address flags to indicate geocoding failure
      const addressFlagsUpdate = {};
      if (error.message.includes(homeAddress)) {
        addressFlagsUpdate.homeFound = false;
      }
      if (coffeeAddress && error.message.includes(coffeeAddress)) {
        addressFlagsUpdate.cafeFound = false;
      }
      if (error.message.includes(workAddress)) {
        addressFlagsUpdate.workFound = false;
      }

      if (Object.keys(addressFlagsUpdate).length > 0) {
        await preferences.updateSection('addressFlags', addressFlagsUpdate);
      }

      return res.status(400).json({
        error: error.message,
        message: 'Address could not be geocoded. Please enable "Use Manual Walking Times" and enter walking times manually.',
        suggestion: 'Enable manual walking times in User Preferences section'
      });
    }

    res.status(500).json({
      error: error.message,
      message: 'Failed to calculate route'
    });
  }
});

// ========== SMART AUTOMATIC JOURNEY PLANNER ==========
// One-click journey planning - just provide addresses, everything else is automatic

/**
 * Automatic Journey Planner
 * POST /admin/route/auto-plan
 *
 * This is the "one click" endpoint that does everything:
 * - Geocodes your addresses automatically
 * - Finds nearby transit stops
 * - Determines the best route and transport mode
 * - Optimally places your cafe stop
 * - Calculates all timing
 * - Gets real-time departures
 *
 * Request body:
 * {
 *   homeAddress: "123 Smith St, Richmond" (required)
 *   workAddress: "456 Central Ave, City" (required)
 *   cafeAddress: "Some Cafe, Suburb" (optional - auto-finds if not provided)
 *   arrivalTime: "09:00" (required)
 *   includeCoffee: true (optional, default true)
 * }
 */
app.post('/admin/route/auto-plan', async (req, res) => {
  try {
    // Get saved preferences for defaults and API credentials
    const prefs = preferences.get();
    const savedAddresses = prefs.addresses || {};
    const savedJourney = prefs.journey || {};
    const savedApi = prefs.api || {};

    // Use provided values or fall back to saved preferences
    const homeAddress = req.body.homeAddress || savedAddresses.home;
    const workAddress = req.body.workAddress || savedAddresses.work;
    const cafeAddress = req.body.cafeAddress || savedAddresses.cafe || null;
    const arrivalTime = req.body.arrivalTime || savedJourney.arrivalTime || '09:00';
    const includeCoffee = req.body.includeCoffee !== undefined
      ? req.body.includeCoffee
      : (savedJourney.coffeeEnabled !== false);

    // Validate required fields
    if (!homeAddress || !workAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required addresses',
        required: ['homeAddress', 'workAddress'],
        message: 'Please provide your home and work addresses. You can save them in preferences or include them in the request.',
        tip: 'Example: { "homeAddress": "123 Main St, Your Suburb", "workAddress": "456 Central Ave, City", "arrivalTime": "09:00" }'
      });
    }

    // DEPRECATED ENDPOINT - Use /admin/smart-journey/calculate instead
    return res.status(410).json({
      success: false,
      error: 'Endpoint deprecated',
      message: 'This endpoint uses legacy Transport Victoria API v3 code and has been removed for compliance.',
      migration: {
        newEndpoint: '/admin/smart-journey/calculate',
        documentation: 'Use the new admin-v3.html interface which uses compliant Transport Victoria OpenData API'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to plan journey automatically',
      suggestion: 'Check that your addresses are valid Australian locations'
    });
  }
});

/**
 * Quick Plan - even simpler, uses all saved preferences
 * GET /admin/route/quick-plan
 *
 * Just calculates a journey using all saved preferences.
 * No body needed - just call it and get your route.
 */
app.get('/admin/route/quick-plan', async (req, res) => {
  try {
    const prefs = preferences.get();
    const savedAddresses = prefs.addresses || {};
    const savedJourney = prefs.journey || {};
    const savedApi = prefs.api || {};

    // Check if we have enough info
    if (!savedAddresses.home || !savedAddresses.work) {
      return res.status(400).json({
        success: false,
        error: 'No addresses configured',
        message: 'Please configure your home and work addresses first via POST /admin/route/auto-plan or the admin panel'
      });
    }

    // DEPRECATED ENDPOINT - Use /admin/smart-journey/calculate instead
    return res.status(410).json({
      success: false,
      error: 'Endpoint deprecated',
      message: 'This endpoint uses legacy Transport Victoria API v3 code and has been removed for compliance.',
      migration: {
        newEndpoint: '/admin/smart-journey/calculate',
        documentation: 'Use the new admin-v3.html interface'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Quick Plan POST - accepts addresses directly
 * POST /admin/route/quick-plan
 */
app.post('/admin/route/quick-plan', async (req, res) => {
  try {
    const { homeAddress, cafeAddress, workAddress, arrivalTime } = req.body;

    if (!homeAddress || !workAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required addresses',
        message: 'Please provide home and work addresses'
      });
    }

    // DEPRECATED ENDPOINT - Use /admin/smart-journey/calculate instead
    return res.status(410).json({
      success: false,
      error: 'Endpoint deprecated',
      message: 'This endpoint uses legacy Transport Victoria API v3 code and has been removed for compliance.',
      migration: {
        newEndpoint: '/admin/smart-journey/calculate',
        documentation: 'Use the new admin-v3.html interface'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get the cached automatic journey plan
 * GET /admin/route/auto
 */
app.get('/admin/route/auto', (req, res) => {
  try {
    // DEPRECATED ENDPOINT - Use /admin/smart-journey/calculate instead
    return res.status(410).json({
      success: false,
      error: 'Endpoint deprecated',
      message: 'This endpoint uses legacy code and has been removed for compliance.',
      migration: {
        newEndpoint: '/admin/smart-journey/calculate',
        documentation: 'Use the new admin-v3.html interface'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get cached route
app.get('/admin/route', (req, res) => {
  try {
    const route = routePlanner.getCachedRoute();

    if (!route) {
      return res.status(404).json({
        error: 'No cached route',
        message: 'Calculate a route first using POST /admin/route/calculate'
      });
    }

    res.json({
      success: true,
      route,
      cached: true
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Journey Status - Real-time journey information with live connection updates
 * GET /api/journey-status
 *
 * Returns current journey status including:
 * - All journey legs with transit mode icons
 * - Departure times (scheduled and revised if delayed)
 * - Delay detection and live updates
 * - Expected arrival time at work
 * - Overall journey status (on-time, delayed, disrupted)
 */
app.get('/api/journey-status', async (req, res) => {
  try {
    // Get the cached journey plan (auto-calculated from compliant JourneyPlanner)
    let journey = cachedJourney;

    if (!journey || !journey.success) {
      // Return fallback journey status
      return res.json({
        status: 'no-journey',
        message: 'No journey planned. Configure your journey in the admin panel.',
        arrivalTime: '--:--',
        legs: [],
        autoCalculated: false
      });
    }

    // Get real-time data for delay detection
    const liveData = await getData();

    // Build journey legs with icons and times
    const legs = [];
    let overallStatus = 'on-time';
    let totalDelay = 0;

    // Parse the journey structure
    const { route } = journey;

    if (route && route.legs) {
      for (const leg of route.legs) {
        const legData = {
          type: leg.type || 'walk',
          icon: getTransitIcon(leg.type),
          route: leg.route || 'Walking',
          from: leg.from || '',
          to: leg.to || '',
          departureTime: leg.departureTime || '--:--',
          arrivalTime: leg.arrivalTime || '--:--',
          duration: leg.duration || 0,
          delayed: false,
          revisedTime: null
        };

        // Check for delays on transit legs
        if (leg.type !== 'walk' && leg.type !== 'walking') {
          const delay = await checkForDelays(leg, liveData);
          if (delay > 0) {
            legData.delayed = true;
            legData.revisedTime = calculateRevisedTime(leg.departureTime, delay);
            totalDelay += delay;
            overallStatus = delay > 10 ? 'disrupted' : 'delayed';
          }
        }

        legs.push(legData);
      }
    }

    // Calculate final arrival time
    const plannedArrival = journey.arrivalTime || '--:--';
    const actualArrival = totalDelay > 0
      ? calculateRevisedTime(plannedArrival, totalDelay)
      : plannedArrival;

    res.json({
      status: overallStatus,
      legs,
      arrivalTime: actualArrival,
      plannedArrival,
      totalDelay,
      lastUpdate: new Date().toISOString(),
      autoCalculated: journey.autoCalculated || false,
      calculatedAt: journey.calculatedAt || null
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      arrivalTime: '--:--',
      legs: []
    });
  }
});

/**
 * Get cached journey info
 * Returns information about the automatically calculated journey
 */
app.get('/api/journey-cache', (req, res) => {
  try {
    if (!cachedJourney) {
      return res.json({
        cached: false,
        message: 'No journey calculated yet',
        nextCalculation: null
      });
    }

    res.json({
      cached: true,
      calculatedAt: cachedJourney.calculatedAt,
      autoCalculated: cachedJourney.autoCalculated,
      journey: {
        arrivalTime: cachedJourney.arrivalTime,
        departureTime: cachedJourney.departureTime,
        success: cachedJourney.success
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Get journey cache status
 * Returns information about the auto-calculated journey cache
 */
app.get('/api/journey-cache', (req, res) => {
  try {
    if (cachedJourney) {
      res.json({
        cached: true,
        calculatedAt: cachedJourney.calculatedAt,
        autoCalculated: cachedJourney.autoCalculated,
        journey: {
          arrivalTime: cachedJourney.arrivalTime,
          startTime: cachedJourney.startTime,
          legs: cachedJourney.route?.legs || []
        }
      });
    } else {
      res.json({
        cached: false,
        message: 'No journey calculated yet. Please configure your addresses and API credentials.'
      });
    }
  } catch (error) {
    res.status(500).json({
      cached: false,
      error: error.message
    });
  }
});

/**
 * Force journey recalculation
 * Triggers an immediate calculation instead of waiting for next scheduled run
 */
app.post('/api/journey-recalculate', async (req, res) => {
  try {
    const journey = await calculateAndCacheJourney();

    if (!journey) {
      return res.status(400).json({
        success: false,
        message: 'Journey calculation failed. Check preferences configuration.'
      });
    }

    res.json({
      success: true,
      message: 'Journey recalculated successfully',
      calculatedAt: journey.calculatedAt,
      arrivalTime: journey.arrivalTime
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper: Get transit icon for leg type
function getTransitIcon(type) {
  const icons = {
    'train': '[Train]',
    'tram': '[Tram]',
    'bus': '[Bus]',
    'vline': '[Train]',
    'ferry': '[Ferry]',
    'walk': 'WALK',
    'walking': 'WALK'
  };
  return icons[type?.toLowerCase()] || 'WALK';
}

// Helper: Check for delays on a specific leg
async function checkForDelays(leg, liveData) {
  try {
    // Compare scheduled vs actual departure times
    if (leg.type === 'train' && liveData.trains) {
      const relevantTrain = liveData.trains.find(t =>
        t.destination === leg.destination || t.line === leg.route
      );
      if (relevantTrain && relevantTrain.delay) {
        return relevantTrain.delay;
      }
    }

    if (leg.type === 'tram' && liveData.trams) {
      const relevantTram = liveData.trams.find(t =>
        t.destination === leg.destination || t.route === leg.route
      );
      if (relevantTram && relevantTram.delay) {
        return relevantTram.delay;
      }
    }

    return 0; // No delay detected
  } catch (error) {
    return 0;
  }
}

// Helper: Calculate revised time with delay
function calculateRevisedTime(originalTime, delayMinutes) {
  try {
    const [hours, minutes] = originalTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes + delayMinutes);
    return date.toTimeString().slice(0, 5);
  } catch (error) {
    return originalTime;
  }
}

// Get transit connections for cached route
app.get('/admin/route/connections', async (req, res) => {
  try {
    const route = routePlanner.getCachedRoute();

    if (!route) {
      return res.status(404).json({
        error: 'No cached route',
        message: 'Calculate a route first using POST /admin/route/calculate'
      });
    }

    // Get current Transport Victoria data
    const data = await getData();

    // Find suitable transit connections
    const connections = await routePlanner.findTransitConnections(route, data);

    res.json({
      success: true,
      route: {
        must_leave_home: route.must_leave_home,
        arrival_time: route.arrival_time,
        coffee_enabled: route.display.coffee_enabled
      },
      connections
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GTFS Standard Route Types (for multi-modal transit support)
const ROUTE_TYPES = {
  0: { id: 0, name: 'Train', icon: '[Train]', description: 'Metro/commuter trains' },
  1: { id: 1, name: 'Tram', icon: '[Tram]', description: 'Trams/Streetcars' },
  2: { id: 2, name: 'Bus', icon: '[Bus]', description: 'Buses' },
  3: { id: 3, name: 'V/Line', icon: '[Train]', description: 'Regional trains' },
  4: { id: 4, name: 'Ferry', icon: '[Ferry]', description: 'Ferries' },
  5: { id: 5, name: 'Light Rail', icon: '[Tram]', description: 'Light rail' }
};

// Get multi-modal transit options (trains, trams, buses, V/Line)
// Returns journey configuration for user's selected transit modes
app.get('/admin/route/multi-modal', async (req, res) => {
  try {
    const route = routePlanner.getCachedRoute();

    if (!route) {
      return res.status(404).json({
        error: 'No cached route',
        message: 'Calculate a route first using POST /admin/route/calculate'
      });
    }

    // Get user preferences
    const prefs = preferences.get();
    const api = prefs.api || {};
    const journey = prefs.journey || {};

    // Validate API credentials (only key required - token is deprecated)
    if (!api.key) {
      return res.status(400).json({
        error: 'API credentials not configured',
        message: 'Please configure Transport Victoria API Key in preferences'
      });
    }

    // Parse train departure time from route
    const trainSegment = route.segments.find(s => s.type === 'train');
    if (!trainSegment) {
      return res.status(400).json({
        error: 'No transit segment in route',
        message: 'Route does not include public transport'
      });
    }

    // Get enabled transit modes (default to all)
    const enabledModes = journey.preferredTransitModes || [0, 1, 2, 3];

    // Get stop IDs from user's configured transit route
    const transitRoute = journey.transitRoute || {};
    const originStopId = transitRoute.mode1?.originStation?.id;
    const destStopId = transitRoute.mode1?.destinationStation?.id;

    if (!originStopId || !destStopId) {
      return res.status(400).json({
        error: 'Transit stations not configured',
        message: 'Please use the Journey Planner to configure your route with origin and destination stations'
      });
    }

    // Use fallback timetable data since real-time API requires specific station queries
    const fallback = getFallbackTimetable();
    const options = fallback.departures.slice(0, 3).map((dep, i) => ({
      mode: ROUTE_TYPES[transitRoute.mode1?.type || 0]?.name || 'Train',
      modeType: transitRoute.mode1?.type || 0,
      minutesUntil: dep.minutes,
      departure: dep.time,
      canGetCoffee: dep.minutes >= 15
    }));

    res.json({
      success: true,
      route: {
        must_leave_home: route.must_leave_home,
        arrival_time: route.arrival_time,
        coffee_enabled: route.display.coffee_enabled
      },
      options: options,
      modesSearched: enabledModes.map(m => ROUTE_TYPES[m]).filter(Boolean)
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all supported transit modes
app.get('/admin/route/transit-modes', (req, res) => {
  try {
    const modes = Object.values(ROUTE_TYPES);

    res.json({
      success: true,
      modes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear route cache
app.delete('/admin/route', (req, res) => {
  try {
    routePlanner.clearCache();

    res.json({
      success: true,
      message: 'Route cache cleared'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check cafe busy-ness for a specific address
app.post('/admin/cafe/busyness', async (req, res) => {
  try {
    const { address, lat, lon } = req.body;

    if (!address) {
      return res.status(400).json({
        error: 'Missing required field: address'
      });
    }

    // Get busy-ness data
    const busyData = await busyDetector.getCafeBusyness(
      address,
      lat || null,
      lon || null
    );

    const description = busyDetector.getBusyDescription(busyData);

    res.json({
      success: true,
      busy: busyData,
      description,
      message: 'Cafe busy-ness retrieved successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      message: 'Failed to check cafe busy-ness'
    });
  }
});

// Get current peak time information
app.get('/admin/cafe/peak-times', (req, res) => {
  try {
    const peakInfo = busyDetector.getCurrentPeakInfo();

    res.json({
      success: true,
      peak: peakInfo
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard preview (HTML visualization)
app.get('/admin/dashboard-preview', async (req, res) => {
  try {
    const updates = await getRegionUpdates();
    const prefs = preferences.get();

    // Get station names from preferences
    const trainStationName = (prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'STATION').toUpperCase();
    const tramDestination = prefs?.journey?.transitRoute?.mode2?.destinationStation?.name || 'CITY';

    // Create HTML preview of dashboard
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commute Compute Dashboard Preview</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .dashboard {
      width: 800px;
      height: 480px;
      background: white;
      border: 2px solid #333;
      position: relative;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .station-box {
      position: absolute;
      top: 10px;
      left: 10px;
      width: 90px;
      height: 50px;
      border: 2px solid black;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    .time {
      position: absolute;
      top: 15px;
      left: 140px;
      font-size: 32px;
      font-weight: bold;
    }
    .section-header {
      position: absolute;
      height: 25px;
      background: black;
      color: white;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-size: 11px;
      font-weight: bold;
    }
    .tram-header {
      top: 120px;
      left: 10px;
      width: 370px;
    }
    .train-header {
      top: 120px;
      left: 400px;
      width: 360px;
    }
    .departure {
      position: absolute;
      font-size: 24px;
      font-weight: bold;
    }
    .departure-label {
      position: absolute;
      font-size: 12px;
      color: #666;
    }
    .status {
      position: absolute;
      bottom: 20px;
      left: 250px;
      font-size: 12px;
    }
    .weather {
      position: absolute;
      right: 10px;
      top: 340px;
      font-size: 11px;
      text-align: right;
    }
    .temperature {
      position: absolute;
      right: 10px;
      top: 410px;
      font-size: 14px;
      text-align: right;
      font-weight: bold;
    }
    .info {
      margin-top: 20px;
      padding: 15px;
      background: white;
      border-radius: 8px;
      border: 1px solid #ddd;
    }
    .region {
      display: inline-block;
      margin: 5px;
      padding: 5px 10px;
      background: #e0e0e0;
      border-radius: 4px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Commute Compute Dashboard Preview</h1>
    <p>Live visualization of 800×480 e-ink display</p>

    <div class="dashboard">
      <!-- Station Name -->
      <div class="station-box">${trainStationName}</div>

      <!-- Large Time -->
      <div class="time">${updates.regions.find(r => r.id === 'time')?.text || '00:00'}</div>

      <!-- Tram Section -->
      <div class="section-header tram-header">TRAM TO ${tramDestination.toUpperCase()}</div>
      <div class="departure-label" style="top: 152px; left: 20px;">Next:</div>
      <div class="departure" style="top: 170px; left: 20px;">${updates.regions.find(r => r.id === 'tram1')?.text || '--'} min*</div>
      <div class="departure-label" style="top: 222px; left: 20px;">Then:</div>
      <div class="departure" style="top: 240px; left: 20px;">${updates.regions.find(r => r.id === 'tram2')?.text || '--'} min*</div>

      <!-- Train Section -->
      <div class="section-header train-header">TRAINS (CITY LOOP)</div>
      <div class="departure-label" style="top: 152px; left: 410px;">Next:</div>
      <div class="departure" style="top: 170px; left: 410px;">${updates.regions.find(r => r.id === 'train1')?.text || '--'} min*</div>
      <div class="departure-label" style="top: 222px; left: 410px;">Then:</div>
      <div class="departure" style="top: 240px; left: 410px;">${updates.regions.find(r => r.id === 'train2')?.text || '--'} min*</div>

      <!-- Weather (Right Sidebar) -->
      <div class="weather">${updates.regions.find(r => r.id === 'weather')?.text || 'N/A'}</div>
      <div class="temperature">${updates.regions.find(r => r.id === 'temperature')?.text || '--'}°</div>

      <!-- Status Bar -->
      <div class="status">GOOD SERVICE</div>
    </div>

    <div class="info">
      <h3>Region Data</h3>
      ${updates.regions.map(r => `<span class="region"><strong>${r.id}:</strong> ${r.text}</span>`).join('')}

      <h3 style="margin-top: 20px;">Metadata</h3>
      <p><strong>Timestamp:</strong> ${updates.timestamp}</p>
      <p><strong>Auto-refresh:</strong> Every 10 seconds</p>
    </div>
  </div>

  <script>
    // Auto-refresh every 10 seconds
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>
    `;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== COMPREHENSIVE LIVE DISPLAY PAGE ==========
// Shows all data being pushed to the TRMNL device in real-time

// Helper functions for building HTML
function buildDepartureRows(departures, type) {
  if (!departures || departures.length === 0) {
    return '<div class="no-data">No departures available</div>';
  }
  return departures.slice(0, 4).map(dep => `
    <div class="departure-row">
      <div class="departure-info">
        <span class="departure-dest">${dep.destination || 'City'}</span>
        <span class="departure-status">${dep.isScheduled ? 'Scheduled' : '[*] Live'}</span>
      </div>
      <div class="departure-time">
        ${dep.minutes}<span> min</span>
      </div>
    </div>
  `).join('');
}

function buildSegmentRows(segments) {
  if (!segments || segments.length === 0) return '';
  const icons = { walk: 'WALK', coffee: '[Coffee]', train: '[Train]', tram: '[Tram]', bus: '[Bus]', vline: '[Train]', wait: '[Wait]' };
  return segments.map(seg => {
    const icon = icons[seg.type] || seg.mode_icon || '*';
    let details = '';
    if (seg.type === 'walk') details = `${seg.from} → ${seg.to}`;
    else if (seg.type === 'coffee') details = `Coffee at ${seg.location}`;
    else if (seg.type === 'wait') details = `Wait at ${seg.location}`;
    else details = `${seg.from} → ${seg.to}`;
    return `
      <div class="segment">
        <span class="segment-icon">${icon}</span>
        <span class="segment-details">${details}</span>
        <span class="segment-duration">${seg.duration} min</span>
      </div>
    `;
  }).join('');
}

function buildRegionDataItems(regions) {
  return regions.map(r => `
    <div class="data-item">
      <div class="data-label">${r.id}</div>
      <div class="data-value">${r.text}</div>
    </div>
  `).join('');
}

/**
 * ========================================================================
 * DEVELOPMENT RULES COMPLIANCE: docs/development/DEVELOPMENT-RULES.md v1.0.12
 * ========================================================================
 * - Location agnostic (dynamic timezone based on detected state)
 * - Works with fallback data (no API keys required)
 * - Transit mode agnostic (supports all 8 Australian states)
 * - Clear data source indicators
 */
app.get('/admin/live-display', async (req, res) => {
  try {
    // Gather all live data
    const data = await getData();
    const regionUpdates = await getRegionUpdates();
    const prefs = preferences.get();

    // Build config from preferences (replaces undefined dataManager.getConfig())
    const config = {
      location: {
        state: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC',
        stateCode: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC',
        stateName: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'Victoria'
      },
      preferences: {
        transitMode: 'train',
        walkingTime: prefs?.manualWalkingTimes?.homeToStation || 5
      },
      stops: {
        home: { name: prefs?.journey?.transitRoute?.mode1?.originStation?.name },
        work: { name: prefs?.journey?.transitRoute?.mode1?.destinationStation?.name }
      }
    };

    // Check if APIs are configured via KV (Section 3.4)
    const kvTransitKey = await getTransitApiKey();
    const apis = {
      transitAuthority: { configured: !!kvTransitKey },
      victorianGTFS: { configured: !!kvTransitKey }
    };

    const cachedRoute = routePlanner.getCachedRoute();
    const cachedAutoJourney = cachedJourney; // Use compliant auto-calculated journey

    // Location-agnostic timezone detection
    const state = config?.location?.state || config?.location?.stateCode || 'VIC';
    const stateName = config?.location?.stateName || state;
    const timezone = getTimezoneForState(state);

    // Determine data source mode
    const hasLiveData = apis?.transitAuthority?.configured || apis?.victorianGTFS?.configured || false;
    const dataSourceMode = hasLiveData ? 'LIVE' : 'FALLBACK';
    const dataSourceIcon = hasLiveData ? '🟢' : '🔴';
    const dataSourceText = hasLiveData ? 'Live Data Active' : 'Using Fallback Timetables';

    // Get weather data
    let weatherData = null;
    try {
      weatherData = await weather.getCurrentWeather();
    } catch (e) {
      weatherData = { temperature: '--', condition: { short: 'N/A' } };
    }

    // Get cafe busyness if cafe is configured
    let cafeData = null;
    if (prefs.addresses?.cafe) {
      try {
        cafeData = await busyDetector.getCafeBusyness(prefs.addresses.cafe);
      } catch (e) {
        cafeData = { level: 'unknown', coffeeTime: 3 };
      }
    }

    // Get transit mode and stops (location agnostic)
    const transitMode = config?.preferences?.transitMode || prefs?.preferences?.transitMode || 'train';
    const primaryStop = config?.stops?.home?.name || prefs?.journey?.transitRoute?.mode1?.originStation?.name || 'Transit Stop';
    const secondaryStop = config?.stops?.work?.name || prefs?.journey?.transitRoute?.mode2?.originStation?.name || 'Destination';

    // State-specific mode labels
    let primaryModeLabel = 'Trains';
    let secondaryModeLabel = 'Trams';
    let primaryModeIcon = '[Train]';
    let secondaryModeIcon = '[Tram]';

    if (state === 'NSW' || state === 'ACT' || state === 'QLD' || state === 'WA') {
      primaryModeLabel = 'Trains';
      secondaryModeLabel = 'Buses';
      primaryModeIcon = '[Train]';
      secondaryModeIcon = '[Bus]';
    } else if (state === 'SA') {
      primaryModeLabel = 'Trams';
      secondaryModeLabel = 'Buses';
      primaryModeIcon = '[Tram]';
      secondaryModeIcon = '[Bus]';
    } else if (state === 'TAS') {
      primaryModeLabel = 'Buses';
      secondaryModeLabel = 'Ferries';
      primaryModeIcon = '[Bus]';
      secondaryModeIcon = '[Ferry]';
    } else if (state === 'NT') {
      primaryModeLabel = 'Buses';
      secondaryModeLabel = 'Buses';
      primaryModeIcon = '[Bus]';
      secondaryModeIcon = '[Bus]';
    }

    // Pre-build dynamic HTML parts
    const trainRows = buildDepartureRows(data.trains, 'train');
    const tramRows = buildDepartureRows(data.trams, 'tram');
    const busRows = buildDepartureRows(data.buses, 'bus');
    const ferryRows = buildDepartureRows(data.ferries, 'ferry');
    const regionDataItems = buildRegionDataItems(regionUpdates.regions);

    // Select appropriate rows based on state
    const primaryRows = trainRows || busRows;
    const secondaryRows = tramRows || busRows || ferryRows;

    // Build journey section
    const journey = cachedAutoJourney || cachedRoute;
    const journeySegments = journey ? buildSegmentRows(cachedAutoJourney?.segments || cachedRoute?.segments) : '';
    const leaveHome = cachedAutoJourney?.summary?.must_leave_home || cachedRoute?.must_leave_home || '--:--';
    const arriveWork = cachedAutoJourney?.summary?.arrival_at_work || cachedRoute?.arrival_time || '--:--';
    const totalDuration = cachedAutoJourney?.summary?.total_duration || cachedRoute?.summary?.total_duration || '--';
    const walkingTime = cachedAutoJourney?.summary?.walking_time || cachedRoute?.summary?.walking_time || '--';
    const transitTime = cachedAutoJourney?.summary?.transit_time || cachedRoute?.summary?.transit_time || '--';
    const coffeeTime = cachedAutoJourney?.summary?.coffee_time || cachedRoute?.summary?.coffee_time || '0';

    // Cafe busyness display
    let cafeBusynessHtml = '';
    if (cafeData) {
      const busyIcon = cafeData.level === 'high' ? '😅 Busy' : cafeData.level === 'medium' ? '🙂 Moderate' : '😊 Quiet';
      cafeBusynessHtml = `
        <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
          <div style="font-size: 12px; opacity: 0.7;">Cafe Busyness</div>
          <div style="font-size: 16px; font-weight: 600;">
            ${busyIcon} - ~${cafeData.coffeeTime || 3} min wait
          </div>
        </div>
      `;
    }

    // Location-agnostic time display
    const now = new Date();
    const currentTime = now.toLocaleString('en-AU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const currentDate = now.toLocaleDateString('en-AU', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Device Display - Commute Compute</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: white;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
        }

        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
        }

        .back-btn {
            display: inline-block;
            background: rgba(79, 178, 142, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
            margin-bottom: 15px;
            transition: all 0.2s;
        }

        .back-btn:hover {
            background: rgba(79, 178, 142, 1);
            transform: translateY(-1px);
        }

        .live-indicator {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(239, 68, 68, 0.2);
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
        }

        .live-dot {
            width: 10px;
            height: 10px;
            background: #ef4444;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }

        .time-display {
            font-size: 48px;
            font-weight: 700;
            margin: 15px 0 5px;
            font-variant-numeric: tabular-nums;
        }

        .date-display {
            font-size: 16px;
            opacity: 0.8;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .card {
            background: rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .card-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }

        .card-header h2 {
            font-size: 18px;
            font-weight: 600;
        }

        .card-icon {
            font-size: 24px;
        }

        .departure-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .departure-row:last-child {
            border-bottom: none;
        }

        .departure-info {
            display: flex;
            flex-direction: column;
        }

        .departure-dest {
            font-weight: 500;
            font-size: 15px;
        }

        .departure-status {
            font-size: 12px;
            opacity: 0.7;
        }

        .departure-time {
            font-size: 28px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        .departure-time span {
            font-size: 14px;
            font-weight: 400;
            opacity: 0.7;
        }

        .weather-display {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .weather-temp {
            font-size: 48px;
            font-weight: 700;
        }

        .weather-condition {
            font-size: 16px;
            opacity: 0.8;
        }

        .coffee-decision {
            text-align: center;
            padding: 20px;
        }

        .coffee-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }

        .coffee-text {
            font-size: 24px;
            font-weight: 700;
        }

        .coffee-subtext {
            font-size: 14px;
            opacity: 0.8;
            margin-top: 5px;
        }

        .route-summary {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .route-time {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
        }

        .route-time-label {
            font-size: 12px;
            text-transform: uppercase;
            opacity: 0.7;
            margin-bottom: 5px;
        }

        .route-time-value {
            font-size: 32px;
            font-weight: 700;
        }

        .segment-list {
            margin-top: 15px;
        }

        .segment {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .segment:last-child {
            border-bottom: none;
        }

        .segment-icon {
            font-size: 18px;
            width: 30px;
            text-align: center;
        }

        .segment-details {
            flex: 1;
            font-size: 13px;
        }

        .segment-duration {
            font-weight: 600;
            font-size: 14px;
        }

        .status-good { color: #4ade80; }
        .status-warning { color: #fbbf24; }
        .status-bad { color: #f87171; }

        .data-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
        }

        .data-item {
            background: rgba(255,255,255,0.05);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }

        .data-label {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.6;
            margin-bottom: 4px;
        }

        .data-value {
            font-size: 18px;
            font-weight: 600;
        }

        .refresh-info {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            opacity: 0.6;
        }

        .full-width {
            grid-column: 1 / -1;
        }

        .alert-box {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.5);
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }

        .no-data {
            text-align: center;
            padding: 30px;
            opacity: 0.5;
        }

        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: rgba(255,255,255,0.7);
            text-decoration: none;
            font-size: 14px;
        }

        .back-link:hover {
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/admin" class="back-link">← Back to Admin Panel</a>

        <!-- Data Source Banner -->
        <div style="background: ${hasLiveData ? 'rgba(16, 185, 129, 0.2)' : 'rgba(251, 191, 36, 0.2)'}; border: 2px solid ${hasLiveData ? 'rgba(16, 185, 129, 0.5)' : 'rgba(251, 191, 36, 0.5)'}; border-radius: 12px; padding: 15px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">${dataSourceIcon}</span>
                <div>
                    <div style="font-size: 16px; font-weight: 600;">${dataSourceText}</div>
                    <div style="font-size: 12px; opacity: 0.8;">${stateName} • ${dataSourceMode} Mode</div>
                </div>
            </div>
            ${!hasLiveData ? '<a href="/admin#tab-api" style="background: #4fb28e; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">Configure API Keys</a>' : ''}
        </div>

        <div class="header">
            <h1>[Display] Live Device Display</h1>
            <div class="live-indicator">
                <span class="live-dot"></span>
                ${dataSourceMode}
            </div>
            <div class="time-display" id="currentTime">${currentTime}</div>
            <div class="date-display">${currentDate}</div>
        </div>

        <div class="grid">
            <!-- Primary Mode Departures -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">${primaryModeIcon}</span>
                    <h2>${primaryModeLabel} - ${primaryStop}</h2>
                </div>
                ${primaryRows}
            </div>

            <!-- Secondary Mode Departures -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">${secondaryModeIcon}</span>
                    <h2>${secondaryModeLabel} - ${secondaryStop}</h2>
                </div>
                ${secondaryRows}
            </div>

            <!-- Weather -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">(cloud)</span>
                    <h2>Weather</h2>
                </div>
                <div class="weather-display">
                    <div class="weather-temp">${weatherData?.temperature || '--'}°</div>
                    <div>
                        <div class="weather-condition">${weatherData?.condition?.short || weatherData?.condition?.full || 'N/A'}</div>
                        ${weatherData?.humidity ? '<div class="weather-condition">Humidity: ' + weatherData.humidity + '%</div>' : ''}
                    </div>
                </div>
            </div>

            <!-- Coffee Decision -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">[Coffee]</span>
                    <h2>Coffee Decision</h2>
                </div>
                <div class="coffee-decision">
                    <div class="coffee-icon">${data.coffee?.canGet ? '[Coffee]' : '[*]'}</div>
                    <div class="coffee-text ${data.coffee?.canGet ? 'status-good' : 'status-warning'}">
                        ${data.coffee?.canGet ? 'TIME FOR COFFEE!' : 'NO COFFEE - GO DIRECT'}
                    </div>
                    <div class="coffee-subtext">${data.coffee?.subtext || ''}</div>
                    ${cafeBusynessHtml}
                </div>
            </div>

            <!-- Journey Plan -->
            ${journey ? `
            <div class="card full-width">
                <div class="card-header">
                    <span class="card-icon">MAP</span>
                    <h2>Your Journey Plan</h2>
                </div>
                <div class="route-summary">
                    <div class="route-time">
                        <div class="route-time-label">[Home] Leave Home</div>
                        <div class="route-time-value">${leaveHome}</div>
                    </div>
                    <div class="route-time">
                        <div class="route-time-label">[Office] Arrive Work</div>
                        <div class="route-time-value">${arriveWork}</div>
                    </div>
                </div>

                ${journeySegments ? '<div class="segment-list">' + journeySegments + '</div>' : ''}

                <div class="data-grid" style="margin-top: 15px;">
                    <div class="data-item">
                        <div class="data-label">Total Time</div>
                        <div class="data-value">${totalDuration} min</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Walking</div>
                        <div class="data-value">${walkingTime} min</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Transit</div>
                        <div class="data-value">${transitTime} min</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Coffee</div>
                        <div class="data-value">${coffeeTime} min</div>
                    </div>
                </div>
            </div>
            ` : `
            <div class="card full-width">
                <div class="card-header">
                    <span class="card-icon">MAP</span>
                    <h2>Journey Plan</h2>
                </div>
                <div class="no-data">
                    No journey planned yet.<br>
                    <a href="/admin" style="color: #60a5fa;">Configure your journey in the admin panel →</a>
                </div>
            </div>
            `}

            <!-- Service Status -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">[!]</span>
                    <h2>Service Status</h2>
                </div>
                ${data.news ? `
                    <div class="alert-box">
                        <strong>[!] Alert:</strong> ${data.news}
                    </div>
                ` : `
                    <div style="display: flex; align-items: center; gap: 10px; color: #4ade80;">
                        <span style="font-size: 24px;">[OK]</span>
                        <span style="font-size: 16px; font-weight: 500;">Good service on all lines</span>
                    </div>
                `}
            </div>

            <!-- Region Data (Raw) -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">DATA</span>
                    <h2>Device Region Data</h2>
                </div>
                <div class="data-grid">
                    ${regionDataItems}
                </div>
            </div>

            <!-- System Info -->
            <div class="card">
                <div class="card-header">
                    <span class="card-icon">SYS</span>
                    <h2>System Information</h2>
                </div>
                <div class="data-grid">
                    <div class="data-item">
                        <div class="data-label">Data Mode</div>
                        <div class="data-value">${data.meta?.mode === 'fallback' ? 'Fallback' : '[*] Live'}</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Last Update</div>
                        <div class="data-value">${new Date(data.meta?.generatedAt || Date.now()).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Cache Age</div>
                        <div class="data-value" id="cacheAge">0s</div>
                    </div>
                    <div class="data-item">
                        <div class="data-label">Refresh In</div>
                        <div class="data-value" id="refreshIn">10s</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="refresh-info">
            Auto-refreshing every 10 seconds • Data pushed to device every 30 seconds
        </div>
    </div>

    <script>
        // Update time display every second (location-agnostic)
        const systemTimezone = '${timezone}';
        function updateTime() {
            const now = new Date();
            const time = now.toLocaleTimeString('en-AU', {
                timeZone: systemTimezone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            document.getElementById('currentTime').textContent = time;
        }
        setInterval(updateTime, 1000);

        // Countdown to refresh
        let refreshCountdown = 10;
        const lastUpdate = ${Date.now()};

        function updateCountdown() {
            refreshCountdown--;
            document.getElementById('refreshIn').textContent = refreshCountdown + 's';
            document.getElementById('cacheAge').textContent = Math.round((Date.now() - lastUpdate) / 1000) + 's';

            if (refreshCountdown <= 0) {
                location.reload();
            }
        }
        setInterval(updateCountdown, 1000);
    </script>
</body>
</html>
    `;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('<h1>Error loading live display</h1><pre>' + error.message + '</pre>');
  }
});

// Clear server caches
app.post('/admin/cache/clear', async (req, res) => {
  try {
    // Clear in-memory caches
    cachedData = null;
    lastUpdate = 0;
    cachedJourney = null;

    // Clear geocoding cache if available
    if (global.geocodingService && global.geocodingService.clearCache) {
      global.geocodingService.clearCache();
    }

    // Clear weather cache if available
    if (weather && weather.clearCache) {
      weather.clearCache();
    }

    res.json({
      success: true,
      message: 'All caches cleared successfully',
      cleared: {
        dataCache: true,
        geocodingCache: !!global.geocodingService,
        weatherCache: !!weather,
        journeyCache: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Force server refresh (re-fetch data immediately)
app.post('/admin/server/refresh', async (req, res) => {
  try {
    // Force refresh by clearing cache
    cachedData = null;
    lastUpdate = 0;

    // Fetch new data
    const data = await getData();

    res.json({ success: true, message: 'Server refreshed successfully', timestamp: lastUpdate });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restart server (trigger process restart - requires PM2 or similar)
app.post('/admin/server/restart', (req, res) => {
  res.json({ success: true, message: 'Server restart initiated' });

  // Graceful shutdown
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

/**
 * Complete System Reset
 * Wipes all user data, clears all caches, and restarts the server
 * DESTRUCTIVE ACTION - Cannot be undone
 */
app.post('/admin/system/reset-all', async (req, res) => {
  try {

    // 1. Reset preferences to defaults
    await preferences.reset();

    // 2. Clear all in-memory caches
    cachedData = null;
    lastUpdate = 0;
    cachedJourney = null;

    // 3. Clear geocoding cache
    if (global.geocodingService && global.geocodingService.clearCache) {
      global.geocodingService.clearCache();
    }

    // 4. Clear weather cache
    if (weather && weather.clearCache) {
      weather.clearCache();
    }

    // 5. Stop journey calculation interval if running
    if (journeyCalculationInterval) {
      clearInterval(journeyCalculationInterval);
      journeyCalculationInterval = null;
    }

    // 6. Reset configuration flags
    isConfigured = false;

    // Send success response
    res.json({
      success: true,
      message: 'System reset complete. Server will restart in 10 seconds.',
      actions: {
        preferencesReset: true,
        cachesCleared: true,
        journeyCalculationStopped: true,
        serverRestart: 'pending'
      }
    });

    // 7. Restart server after 10 second delay
    setTimeout(() => {
      process.exit(0);
    }, 10000);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Preview HTML page
/**
 * ========================================================================
 * DEVELOPMENT RULES COMPLIANCE: docs/development/DEVELOPMENT-RULES.md v1.0.12
 * ========================================================================
 * - Works with fallback data (no API keys required)
 * - Location agnostic (no hardcoded locations/timezones)
 * - BYOS compliant (800x480 dimensions, proper refresh)
 * - Clear data source indicators (fallback vs live)
 */
app.get('/preview', requireConfiguration, async (req, res) => {
  const prefs = preferences.get();

  // Build config from preferences (replaces undefined dataManager.getConfig())
  const config = {
    location: {
      state: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC',
      stateCode: prefs?.journey?.transitRoute?.mode1?.originStation?.state || 'VIC'
    },
    preferences: {
      transitMode: 'train',
      walkingTime: prefs?.manualWalkingTimes?.homeToStation || 5
    },
    stops: {
      home: { name: prefs?.journey?.transitRoute?.mode1?.originStation?.name },
      work: { name: prefs?.journey?.transitRoute?.mode1?.destinationStation?.name }
    }
  };

  // Check if APIs are configured via KV (Section 3.4)
  const kvKey = await getTransitApiKey();
  const apis = {
    transitAuthority: { configured: !!kvKey },
    victorianGTFS: { configured: !!kvKey }
  };

  // Get device configuration (Development Rules v1.0.14 Section U - Device-First Design)
  const deviceConfig = prefs?.deviceConfig || {
    selectedDevice: 'trmnl-byos',
    resolution: { width: 800, height: 480 },
    orientation: 'landscape'
  };

  // Allow query parameter override for testing different devices
  const deviceParam = req.query.device;
  const deviceResolutions = {
    'trmnl-byos': { width: 800, height: 480, orientation: 'landscape', name: 'TRMNL BYOS (7.5")' },
    'kindle-pw3': { width: 758, height: 1024, orientation: 'portrait', name: 'Kindle Paperwhite 3/4 (6")' },
    'kindle-pw4': { width: 758, height: 1024, orientation: 'portrait', name: 'Kindle Paperwhite 4 (6")' },
    'kindle-pw5': { width: 1236, height: 1648, orientation: 'portrait', name: 'Kindle Paperwhite 5 (6.8")' },
    'kindle-4': { width: 600, height: 800, orientation: 'portrait', name: 'Kindle 4 (6" Non-Touch)' }
  };

  let deviceSpec = deviceConfig;
  let deviceName = deviceResolutions[deviceConfig.selectedDevice]?.name || deviceConfig.selectedDevice;

  if (deviceParam && deviceResolutions[deviceParam]) {
    deviceSpec = {
      selectedDevice: deviceParam,
      resolution: { width: deviceResolutions[deviceParam].width, height: deviceResolutions[deviceParam].height },
      orientation: deviceResolutions[deviceParam].orientation
    };
    deviceName = deviceResolutions[deviceParam].name;
  }


  // Determine data source mode
  const hasLiveData = apis?.transitAuthority?.configured ||
                      apis?.victorianGTFS?.configured ||
                      false;

  const dataSourceMode = hasLiveData ? 'live' : 'fallback';
  const dataSourceIcon = hasLiveData ? '🟢' : '🔴';
  const dataSourceTitle = hasLiveData ? 'Live Data Active' : 'Using Fallback Timetable Data';
  const dataSourceSubtitle = hasLiveData
    ? 'Real-time transit updates enabled • Last updated just now'
    : 'Configure API keys in Admin Panel to enable real-time updates';
  const dataSourceColor = hasLiveData
    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%)'
    : 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)';
  const dataSourceBorder = hasLiveData ? 'rgba(16, 185, 129, 0.3)' : 'rgba(251, 191, 36, 0.3)';

  // Get journey configuration details
  const state = config?.location?.state || config?.location?.stateCode || 'N/A';
  const stateName = config?.location?.stateName || state;
  const transitMode = config?.preferences?.transitMode || 'Not configured';
  const homeStop = config?.stops?.home?.name || 'Not configured';
  const workStop = config?.stops?.work?.name || 'Not configured';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Commute Compute E-ink Preview</title>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="20">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }

        .container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 25px;
        }

        .header h1 {
          color: white;
          font-size: 32px;
          font-weight: 600;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .btn {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          color: white;
          padding: 12px 24px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .data-source-indicator {
          background: ${dataSourceColor};
          border: 2px solid ${dataSourceBorder};
          border-radius: 16px;
          padding: 20px 25px;
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .data-source-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .data-source-icon {
          font-size: 32px;
        }

        .data-source-text h2 {
          color: #1f2937;
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .data-source-text p {
          color: #6b7280;
          font-size: 14px;
        }

        .data-source-actions {
          display: flex;
          gap: 12px;
        }

        .btn-primary {
          background: #4fb28e;
          color: white;
          padding: 10px 20px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: #4f46e5;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(79, 178, 142, 0.4);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.8);
          color: #374151;
          padding: 10px 20px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s ease;
          border: 1px solid rgba(0,0,0,0.1);
        }

        .btn-secondary:hover {
          background: white;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .config-summary {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 25px;
          margin-bottom: 25px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .config-summary h3 {
          color: #1f2937;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
        }

        .config-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }

        .config-item {
          background: rgba(79, 178, 142, 0.05);
          padding: 12px 16px;
          border-radius: 8px;
          border-left: 3px solid #4fb28e;
        }

        .config-item label {
          display: block;
          color: #6b7280;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .config-item value {
          display: block;
          color: #1f2937;
          font-size: 16px;
          font-weight: 600;
        }

        .preview-section {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 25px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .preview-section h3 {
          color: #1f2937;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
        }

        .device-frame {
          background: #1f2937;
          border-radius: 12px;
          padding: 20px;
          display: inline-block;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        .device-screen {
          background: white;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.1);
        }

        iframe {
          width: ${deviceSpec.resolution.width}px;
          height: ${deviceSpec.resolution.height}px;
          border: none;
          display: block;
          background: white;
        }

        .device-label {
          text-align: center;
          margin-top: 15px;
          color: #9ca3af;
          font-size: 13px;
        }

        .device-specs {
          color: #6b7280;
          font-size: 12px;
          margin-top: 4px;
        }

        .refresh-info {
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: 15px;
          color: #92400e;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .endpoints-section {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 25px;
          margin-top: 25px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .endpoints-section h3 {
          color: #1f2937;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
        }

        .endpoints-list {
          list-style: none;
        }

        .endpoints-list li {
          padding: 12px;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }

        .endpoints-list li:last-child {
          border-bottom: none;
        }

        .endpoints-list a {
          color: #4fb28e;
          text-decoration: none;
          font-weight: 600;
          font-family: 'Courier New', monospace;
        }

        .endpoints-list a:hover {
          text-decoration: underline;
        }

        .endpoint-description {
          color: #6b7280;
          font-size: 14px;
          margin-left: 8px;
        }
      </style>
      <script>
        // BYOS-compliant refresh: Respect e-ink display limits
        // Refresh every 5 minutes (300000ms) to avoid excessive e-ink wear
        setInterval(() => {
          const iframe = document.getElementById('live-dashboard');
          if (iframe) {
            iframe.src = '/api/dashboard?t=' + Date.now();
          }
        }, 300000);

        // Manual refresh function
        function refreshPreview() {
          const iframe = document.getElementById('live-dashboard');
          if (iframe) {
            iframe.src = '/api/dashboard?t=' + Date.now();
          }
        }
      </script>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>[Frame] E-ink Display Preview</h1>
          <a href="/admin" class="btn">← Back to Admin Panel</a>
        </div>

        <!-- Data Source Indicator -->
        <div class="data-source-indicator">
          <div class="data-source-info">
            <div class="data-source-icon">${dataSourceIcon}</div>
            <div class="data-source-text">
              <h2>${dataSourceTitle}</h2>
              <p>${dataSourceSubtitle}</p>
            </div>
          </div>
          <div class="data-source-actions">
            ${!hasLiveData ? '<a href="/admin#tab-api" class="btn-primary">[Key] Configure API Keys</a>' : '<button onclick="refreshPreview()" class="btn-primary">[Refresh] Refresh Now</button>'}
            <a href="/admin#tab-live" class="btn-secondary">View Live Data</a>
          </div>
        </div>

        <!-- Journey Configuration Summary -->
        <div class="config-summary">
          <h3>Current Configuration</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>Device</label>
              <value>${deviceName}</value>
            </div>
            <div class="config-item">
              <label>Resolution</label>
              <value>${deviceSpec.resolution.width}×${deviceSpec.resolution.height}</value>
            </div>
            <div class="config-item">
              <label>State</label>
              <value>${stateName}</value>
            </div>
            <div class="config-item">
              <label>Transit Mode</label>
              <value>${transitMode}</value>
            </div>
            <div class="config-item">
              <label>Home Stop</label>
              <value>${homeStop}</value>
            </div>
            <div class="config-item">
              <label>Work Stop</label>
              <value>${workStop}</value>
            </div>
            <div class="config-item">
              <label>Data Source</label>
              <value>${dataSourceMode === 'live' ? 'Real-time API' : 'Fallback Timetables'}</value>
            </div>
          </div>
          ${deviceParam ? '<div style="margin-top: 15px; padding: 12px; background: rgba(79, 178, 142, 0.1); border-radius: 8px; border-left: 3px solid #4fb28e; font-size: 13px;"><strong>Testing Mode:</strong> Preview showing ' + deviceName + '. <a href="/preview" style="color: #4fb28e; font-weight: 600;">View your configured device</a></div>' : '<div style="margin-top: 15px; padding: 12px; background: rgba(79, 178, 142, 0.1); border-radius: 8px; border-left: 3px solid #4fb28e; font-size: 13px;"><strong>Tip:</strong> Test other devices by adding ?device=kindle-pw5 to the URL</div>'}
        </div>

        <!-- Preview Section -->
        <div class="preview-section">
          <h3>[Display] ${deviceName} Preview</h3>
          <div class="device-frame">
            <div class="device-screen">
              <iframe id="live-dashboard" src="/api/dashboard?width=${deviceSpec.resolution.width}&height=${deviceSpec.resolution.height}&orientation=${deviceSpec.orientation}" title="Device Dashboard Preview"></iframe>
            </div>
            <div class="device-label">
              ${deviceName}
              <div class="device-specs">${deviceSpec.resolution.width} × ${deviceSpec.resolution.height} pixels • ${deviceSpec.orientation.charAt(0).toUpperCase() + deviceSpec.orientation.slice(1)} orientation</div>
            </div>
          </div>
          <div class="refresh-info">
            Auto-refresh: Every 5 minutes (e-ink display protection) -- <a href="#" onclick="refreshPreview(); return false;" style="color: #92400e; font-weight: 600;">Refresh now</a>
          </div>
        </div>

        <!-- Available Endpoints -->
        <div class="endpoints-section">
          <h3>[Link] Available API Endpoints</h3>
          <ul class="endpoints-list">
            <li>
              <a href="/admin">/admin</a>
              <span class="endpoint-description">Admin Panel - Configure journey, API keys, and settings</span>
            </li>
            <li>
              <a href="/api/screen">/api/screen</a>
              <span class="endpoint-description">TRMNL JSON Webhook - For TRMNL BYOS platform</span>
            </li>
            <li>
              <a href="/api/dashboard">/api/dashboard</a>
              <span class="endpoint-description">HTML Dashboard - 800×480 optimized display</span>
            </li>
            <li>
              <a href="/api/status">/api/status</a>
              <span class="endpoint-description">System Status - Server health and configuration</span>
            </li>
            <li>
              <a href="/journey">/journey</a>
              <span class="endpoint-description">Journey Visualizer - Interactive timeline view</span>
            </li>
            <li>
              <a href="/admin/live-display">/admin/live-display</a>
              <span class="endpoint-description">Live Display - Auto-refreshing journey view</span>
            </li>
          </ul>
        </div>
      </div>
      
      <script>
        // Live dashboard refresh every 20 seconds
        let countdown = 20;
        const countdownEl = document.createElement('div');
        countdownEl.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: rgba(0,0,0,0.7); color: #4fb28e; padding: 10px 15px; border-radius: 8px; font-family: monospace; font-size: 14px; z-index: 9999;';
        countdownEl.innerHTML = '[Refresh] Live: <span id="cd">20</span>s';
        document.body.appendChild(countdownEl);
        
        setInterval(() => {
          countdown--;
          document.getElementById('cd').textContent = countdown;
          if (countdown <= 0) {
            countdown = 20;
            const iframe = document.getElementById('live-dashboard');
            if (iframe) {
              iframe.src = iframe.src.split('?')[0] + '?t=' + Date.now() + '&width=' + iframe.src.match(/width=(\d+)/)?.[1] + '&height=' + iframe.src.match(/height=(\d+)/)?.[1];
            }
          }
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

/* =========================================================
   SETUP WIZARD ENDPOINTS
   ========================================================= */

/**
 * Setup Wizard Page
 */
// Redirect setup wizard to admin page (all setup done through admin interface)
app.get('/setup', (req, res) => {
  res.redirect('/admin#tab-setup');
});

/* =========================================================
   V13 ZONE ENDPOINTS - Memory-efficient for ESP32
   ========================================================= */

// V13: Get changed zones
app.get('/api/zones/changed', async (req, res) => {
  try {
    const forceAll = req.query.force === 'true';
    const prefs = preferences.get();
    const now = new Date();
    const data = {
      location: prefs?.addresses?.home?.split(',')[0] || 'HOME',
      current_time: now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }),
      day: now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' }),
      date: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'Australia/Melbourne' }),
      temp: cachedJourney?.weather?.temp || '--',
      condition: cachedJourney?.weather?.condition || 'N/A',
      status_type: cachedJourney?.hasDisruption ? 'disruption' : 'normal',
      arrive_by: cachedJourney?.arriveBy || '--:--',
      total_minutes: cachedJourney?.totalMinutes || '--',
      journey_legs: cachedJourney?.legs || [],
      destination: prefs?.addresses?.work?.split(',')[0] || 'WORK'
    };
    res.json({ timestamp: new Date().toISOString(), changed: getChangedZonesV13(data, forceAll) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// V13: Get single zone BMP
app.get('/api/zone/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prefs = preferences.get();
    const now = new Date();
    const data = {
      location: prefs?.addresses?.home?.split(',')[0] || 'HOME',
      current_time: now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }),
      day: now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' }),
      date: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'Australia/Melbourne' }),
      temp: cachedJourney?.weather?.temp || '--',
      condition: cachedJourney?.weather?.condition || 'N/A',
      status_type: cachedJourney?.hasDisruption ? 'disruption' : 'normal',
      arrive_by: cachedJourney?.arriveBy || '--:--',
      total_minutes: cachedJourney?.totalMinutes || '--',
      journey_legs: cachedJourney?.legs || [],
      destination: prefs?.addresses?.work?.split(',')[0] || 'WORK'
    };
    const bmp = renderSingleZoneV13(id, data, prefs);
    if (!bmp) return res.status(404).json({ error: 'Zone not found' });
    const zoneDef = getZoneDefV13(id, data);
    res.set({ 'Content-Type': 'application/octet-stream', 'X-Zone-X': zoneDef.x, 'X-Zone-Y': zoneDef.y, 'X-Zone-Width': zoneDef.w, 'X-Zone-Height': zoneDef.h });
    res.send(bmp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================
   CCDASH RENDERER ENDPOINTS - New UI/UX with Smart Journey Engine
   ========================================================= */

/**
 * Build V13 display data using Smart Journey Engine
 */
async function buildV13DisplayData() {
  const prefs = preferences.get();
  const state = prefs?.state || prefs?.location?.state || 'VIC';
  const timezone = getTimezoneForState(state);
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  
  // Try Smart Journey Engine first
  if (global.commuteCompute) {
    try {
      const journeyData = await global.commuteCompute.buildJourneyForDisplay(
        cachedData, // Transit data
        cachedJourney?.weather // Weather data
      );
      return journeyData;
    } catch (e) {
    }
  }
  
  // Fallback to basic data structure
  return {
    location: prefs?.addresses?.home?.split(',')[0] || 'HOME',
    current_time: localNow.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
    day: localNow.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase(),
    date: localNow.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    temp: cachedJourney?.weather?.temp || '--',
    condition: cachedJourney?.weather?.condition || 'N/A',
    weather_icon: '(sun)',
    status_type: cachedJourney?.hasDisruption ? 'disruption' : 'normal',
    arrive_by: prefs?.journey?.arrivalTime || '09:00',
    total_minutes: cachedJourney?.totalMinutes || '--',
    journey_legs: cachedJourney?.legs || [
      { type: 'walk', to: 'cafe', minutes: 3 },
      { type: 'coffee', location: 'Cafe', minutes: 4 },
      { type: 'walk', to: 'tram stop', minutes: 2 },
      { type: 'tram', routeNumber: '', destination: { name: 'CBD' }, minutes: 12 },
      { type: 'walk', to: 'work', minutes: 4 }
    ],
    destination: prefs?.addresses?.work?.split(',')[0] || 'WORK',
    coffee_decision: global.commuteCompute?.calculateCoffeeDecision?.(cachedData, cachedJourney?.legs) || { decision: 'GET COFFEE', subtext: 'You have time', canGet: true }
  };
}

// CCDash: Simple diagnostic endpoint (no imports required)
app.get('/api/v13/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: new Date().toISOString(),
    v13: 'active',
    commuteCompute: typeof global.commuteCompute !== 'undefined'
  });
});

// CCDash: Get changed zones using Smart Journey Engine
app.get('/api/v13/zones/changed', async (req, res) => {
  try {
    const forceAll = req.query.force === 'true';
    const data = await buildV13DisplayData();
    const changed = getChangedZonesCCDash(data, forceAll);
    res.json({ 
      timestamp: new Date().toISOString(), 
      changed,
      version: 'ccdash',
      smartJourney: !!global.commuteCompute
    });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// CCDash: Get single zone BMP
app.get('/api/v13/zone/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prefs = preferences.get();
    const data = await buildV13DisplayData();
    
    const bmp = renderSingleZoneCCDash(id, data, prefs);
    if (!bmp) return res.status(404).json({ error: 'Zone not found', available: getActiveZonesCCDash(data) });
    
    const zoneDef = getZoneDefCCDash(id, data);
    res.set({ 
      'Content-Type': 'application/octet-stream', 
      'X-Zone-X': zoneDef.x, 
      'X-Zone-Y': zoneDef.y, 
      'X-Zone-Width': zoneDef.w, 
      'X-Zone-Height': zoneDef.h,
      'X-Renderer-Version': 'ccdash'
    });
    res.send(bmp);
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// CCDash: List all active zones
app.get('/api/v13/zones/list', async (req, res) => {
  try {
    const data = await buildV13DisplayData();
    const zones = getActiveZonesCCDash(data);
    const definitions = {};
    for (const zoneId of zones) {
      definitions[zoneId] = getZoneDefCCDash(zoneId, data);
    }
    res.json({ zones, definitions, version: 'ccdash' });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// CCDash: Full screen PNG preview (for debugging/simulator)
app.get('/api/v13/screen', async (req, res) => {
  try {
    const prefs = preferences.get();
    const data = await buildV13DisplayData();
    const png = renderFullScreenCCDash(data, prefs);
    res.set({ 'Content-Type': 'image/png', 'X-Renderer-Version': 'ccdash' });
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CCDash: Get journey data as JSON
app.get('/api/v13/journey', async (req, res) => {
  try {
    const data = await buildV13DisplayData();
    res.json({
      success: true,
      version: 'ccdash',
      journey: {
        location: data.location,
        destination: data.destination,
        arriveBy: data.arrive_by,
        departureTime: data.departure_time,
        totalMinutes: data.total_minutes,
        routeName: data.route_name,
        legs: data.journey_legs,
        coffeeDecision: data.coffee_decision
      },
      weather: {
        temp: data.temp,
        condition: data.condition,
        icon: data.weather_icon
      },
      meta: {
        timestamp: data.timestamp,
        smartJourneyActive: !!global.commuteCompute
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CCDash: Reset zone cache
app.post('/api/v13/zones/reset', (req, res) => {
  clearZoneCacheCCDash();
  res.json({ success: true, message: 'CCDash zone cache cleared' });
});

// CCDash: Get alternative routes
app.get('/api/v13/alternatives', (req, res) => {
  try {
    const alternatives = global.commuteCompute?.getAlternativeRoutes() || [];
    res.json({ 
      success: true, 
      alternatives,
      activeRoute: global.commuteCompute?.getPreferredRoute()?.description || 'Default route'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CCDash: Select alternative route
app.post('/api/v13/select-route', async (req, res) => {
  try {
    const { routeId } = req.body;
    if (!routeId) return res.status(400).json({ error: 'routeId required' });
    
    const selected = await global.commuteCompute?.selectAlternativeRoute(routeId);
    if (!selected) return res.status(404).json({ error: 'Route not found' });
    
    clearZoneCacheCCDash(); // Clear cache to force re-render
    res.json({ success: true, selected });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   START SERVER
   ========================================================= */

// Export app for Vercel serverless functions
export default app;

const HOST = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Start server and capture instance for graceful shutdown (only for local/Render)
const server = app.listen(PORT, async () => {

  // Initialize persistent storage
  await loadDevices();

  // Pre-warm cache
  getData().then(() => {
    safeguards.log(safeguards.LOG_LEVELS.INFO, 'Initial data loaded successfully');
  }).catch(err => {
    safeguards.trackError('initial-data-load', err.message);
  });

  // Set up refresh cycle
  setInterval(() => {
    getData().catch(err => {
      safeguards.trackError('background-refresh', err.message);
    });
  }, config.refreshSeconds * 1000);

  safeguards.log(safeguards.LOG_LEVELS.INFO, 'Server started successfully', {
    port: PORT,
    host: HOST,
    version: VERSION
  });
});

// Setup graceful shutdown with cleanup
safeguards.setupGracefulShutdown(server, async () => {

  // Save any pending data
  try {
    await saveDevices();
  } catch (err) {
  }

  // Close geocoding service connections
  if (global.geocodingService) {
  }

});

// Force rebuild 20260129-042622

// ============================================================================
// DEVICE PAIRING API (from PAIRING-SPEC.md)
// ============================================================================

// In-memory pairing codes (for simplicity - production should use KV/DB)
const pairingCodes = new Map();

// Generate pairing code
function generatePairingCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/pair/register - Device registers and gets a pairing code
app.post('/api/pair/register', (req, res) => {
  const { deviceMac } = req.body;
  const code = generatePairingCode();
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
  
  pairingCodes.set(code.toUpperCase(), {
    code,
    deviceMac: deviceMac || 'unknown',
    status: 'waiting',
    webhookUrl: null,
    createdAt: Date.now(),
    expiresAt
  });
  
  res.json({ success: true, code, expiresAt });
});

// GET /api/pair/:code - Device polls to check if paired
app.get('/api/pair/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const entry = pairingCodes.get(code);
  
  if (!entry) {
    return res.status(404).json({ success: false, status: 'invalid', message: 'Code not found or expired' });
  }
  
  // Check expiry
  if (Date.now() > entry.expiresAt) {
    pairingCodes.delete(code);
    return res.status(410).json({ success: false, status: 'expired', message: 'Code expired' });
  }
  
  if (entry.status === 'paired' && entry.webhookUrl) {
    // Device is paired - return webhook URL
    pairingCodes.delete(code); // One-time use
    return res.json({
      success: true,
      status: 'paired',
      webhookUrl: entry.webhookUrl,
      message: 'Device paired successfully!'
    });
  }
  
  // Still waiting
  res.json({
    success: true,
    status: 'waiting',
    message: 'Waiting for setup to complete...'
  });
});

// POST /api/pair/:code - Setup wizard sends config
app.post('/api/pair/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const entry = pairingCodes.get(code);
  
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Code not found or expired' });
  }
  
  if (Date.now() > entry.expiresAt) {
    pairingCodes.delete(code);
    return res.status(410).json({ success: false, message: 'Code expired' });
  }
  
  const { webhookUrl } = req.body;
  const host = req.get('host');
  const protocol = req.protocol;
  
  // Generate device-specific webhook URL
  const deviceToken = require('crypto').randomBytes(16).toString('hex');
  const generatedWebhookUrl = webhookUrl || `${protocol}://${host}/api/screen?deviceId=${deviceToken}`;

  entry.status = 'paired';
  entry.webhookUrl = generatedWebhookUrl;
  pairingCodes.set(code, entry);

  res.json({
    success: true,
    status: 'configured',
    message: `Device code ${code} configured.`,
    webhookUrl: generatedWebhookUrl
  });
});

// GET /api/pair - List active codes (admin only, for debugging)
app.get('/api/pair', (req, res) => {
  const codes = [];
  for (const [code, entry] of pairingCodes) {
    if (Date.now() < entry.expiresAt) {
      codes.push({ code, status: entry.status, expiresIn: Math.round((entry.expiresAt - Date.now()) / 1000) });
    }
  }
  res.json({ codes });
});

