/**
 * Commute Compute System™ - Endpoint Monitor Configuration
 * Comprehensive monitoring for all API endpoints, pages, and data flows
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

const BASE_URL = process.env.MONITOR_BASE_URL || 'http://localhost:3000';

// Config token for testing authenticated endpoints
// Contains: generic example addresses with placeholder API keys
const SAMPLE_CONFIG_TOKEN = process.env.SAMPLE_CONFIG_TOKEN || 'eyJhIjp7ImhvbWUiOiIxMjMgRXhhbXBsZSBTdHJlZXQsIFNvdXRoIFlhcnJhIFZJQyIsIndvcmsiOiIxMjMgV29yayBTdHJlZXQsIE1lbGJvdXJuZSBWSUMiLCJjYWZlIjoiU2FtcGxlIENhZmUsIFNvdXRoIFlhcnJhIFZJQyJ9LCJsIjp7ImhvbWUiOnsibGF0IjotMzcuODEzNiwibG9uIjoxNDQuOTYzMX0sIndvcmsiOnsibGF0IjotMzcuODEzNiwibG9uIjoxNDQuOTYzMX0sImNhZmUiOnsibGF0IjotMzcuODEzNiwibG9uIjoxNDQuOTYzMX19LCJ0IjoiMDk6MDAiLCJjIjp0cnVlLCJzIjoiVklDIiwiayI6IllPVVJfVFJBTlNQT1JUX1ZJQ1RPUklBX0FQSV9LRVkiLCJnIjoiWU9VUl9HT09HTEVfUExBQ0VTX0FQSV9LRVkifQ==';

export default {
  BASE_URL,
  SAMPLE_CONFIG_TOKEN,

  // Monitoring intervals (milliseconds)
  intervals: {
    critical: 60000,      // 1 minute - health, screen rendering
    standard: 300000,     // 5 minutes - API endpoints
    pages: 600000,        // 10 minutes - HTML pages
    external: 900000,     // 15 minutes - external APIs (rate limit friendly)
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    backoffMs: 2000,
  },

  // Timeout for requests (ms)
  timeout: 30000,

  // ============================================
  // API ENDPOINTS - Core Dashboard Rendering
  // ============================================
  apiEndpoints: {
    // System Health & Status
    health: {
      path: '/api/health',
      method: 'GET',
      priority: 'critical',
      expectedStatus: 200,
      description: 'System health check',
      resolutionGuide: `
        FAILURE: /api/health not responding
        CAUSES:
        1. Vercel function cold start timeout
        2. Server deployment issue
        3. Function crashed

        RESOLUTION:
        1. Check Vercel dashboard for deployment status
        2. Review Vercel function logs for errors
        3. Redeploy if necessary: vercel --prod
        4. Check for syntax errors in api/health.js
      `
    },

    status: {
      path: '/api/status',
      method: 'GET',
      priority: 'standard',
      expectedStatus: 200,
      description: 'Server status endpoint',
      resolutionGuide: `
        FAILURE: /api/status not responding
        CAUSES:
        1. Status endpoint misconfiguration
        2. Missing dependencies

        RESOLUTION:
        1. Check api/status.js for errors
        2. Verify all imports are available
        3. Check Vercel function logs
      `
    },

    systemStatus: {
      path: '/api/system-status',
      method: 'GET',
      priority: 'standard',
      expectedStatus: 200,
      description: 'Detailed system status',
      resolutionGuide: `
        FAILURE: /api/system-status not responding
        CAUSES:
        1. Dependency resolution failure
        2. Memory limit exceeded during status check

        RESOLUTION:
        1. Check api/system-status.js
        2. Review memory usage in Vercel dashboard
        3. Simplify status checks if memory constrained
      `
    },

    version: {
      path: '/api/version',
      method: 'GET',
      priority: 'standard',
      expectedStatus: 200,
      description: 'Version information',
      resolutionGuide: `
        FAILURE: /api/version not responding
        CAUSES:
        1. package.json read failure

        RESOLUTION:
        1. Verify package.json exists and is valid JSON
        2. Check api/version.js implementation
      `
    },

    // Dashboard Rendering Endpoints
    screen: {
      path: '/api/screen',
      method: 'GET',
      priority: 'critical',
      expectedStatus: [200, 400], // 400 if no token provided
      expectedContentType: 'image/png',
      requiresToken: true,
      description: 'Full 800x480 PNG dashboard for TRMNL',
      resolutionGuide: `
        FAILURE: /api/screen not rendering
        CAUSES:
        1. @napi-rs/canvas initialization failure
        2. Font loading issues
        3. Transit data fetch timeout
        4. Memory limit exceeded (>1024MB)
        5. Config token decode failure

        RESOLUTION:
        1. Check Vercel function logs for canvas errors
        2. Verify fonts are in public/fonts/
        3. Check GTFS-RT API availability
        4. Increase function memory in vercel.json
        5. Validate config token format (Base64URL JSON)
        6. Test locally: node src/server.js
      `
    },

    zones: {
      path: '/api/zones',
      method: 'GET',
      priority: 'critical',
      expectedStatus: [200, 400],
      requiresToken: true,
      description: 'V10 zone-based partial refresh (1-bit BMP)',
      resolutionGuide: `
        FAILURE: /api/zones not responding
        CAUSES:
        1. Zone renderer initialization failure
        2. BMP encoding error
        3. Zone boundary calculation error

        RESOLUTION:
        1. Check src/services/zone-renderer.js
        2. Verify CCDashDesignV10 zone boundaries
        3. Check 1-bit BMP encoding logic
        4. Review ccdash-renderer-v13.js for errors
      `
    },

    zonesTiered: {
      path: '/api/zones-tiered',
      method: 'GET',
      priority: 'standard',
      expectedStatus: [200, 400],
      requiresToken: true,
      description: 'Tiered refresh strategy',
      resolutionGuide: `
        FAILURE: /api/zones-tiered not responding
        CAUSES:
        1. Tiered renderer configuration error
        2. Priority calculation failure

        RESOLUTION:
        1. Check api/zones-tiered.js
        2. Review zone-renderer-tiered.js
        3. Verify tier priority logic
      `
    },

    zoneData: {
      path: '/api/zonedata',
      method: 'GET',
      priority: 'standard',
      expectedStatus: [200, 400],
      requiresToken: true,
      description: 'Zone metadata with render info',
      resolutionGuide: `
        FAILURE: /api/zonedata not responding
        CAUSES:
        1. Metadata generation error
        2. JSON serialization failure

        RESOLUTION:
        1. Check api/zonedata.js
        2. Verify zone metadata structure
      `
    },

    fullscreen: {
      path: '/api/fullscreen',
      method: 'GET',
      priority: 'standard',
      expectedStatus: [200, 400],
      requiresToken: true,
      description: 'Full-screen PNG variant',
      resolutionGuide: `
        FAILURE: /api/fullscreen not responding
        CAUSES:
        1. Canvas rendering failure
        2. PNG encoding error

        RESOLUTION:
        1. Check api/fullscreen.js
        2. Review canvas memory usage
      `
    },

    livedash: {
      path: '/api/livedash',
      method: 'GET',
      priority: 'standard',
      expectedStatus: [200, 400],
      requiresToken: true,
      description: 'Multi-device renderer (TRMNL, Kindle, Inkplate)',
      resolutionGuide: `
        FAILURE: /api/livedash not responding
        CAUSES:
        1. Device type detection failure
        2. Resolution mismatch

        RESOLUTION:
        1. Check api/livedash.js
        2. Review src/services/livedash.js
        3. Verify device-specific rendering paths
      `
    },

    // Admin/Setup Endpoints
    addressSearch: {
      path: '/api/address-search',
      method: 'GET',
      priority: 'standard',
      expectedStatus: [200, 400],
      queryParams: { q: 'Melbourne' },
      description: 'Geocoding (Google/OSM fallback)',
      resolutionGuide: `
        FAILURE: /api/address-search not responding
        CAUSES:
        1. All geocoding services unavailable
        2. Rate limiting on Google/Mapbox
        3. Nominatim (OSM) fallback failing

        RESOLUTION:
        1. Check geocoding-service.js cascade logic
        2. Verify API keys if using premium services
        3. Test Nominatim directly: curl "https://nominatim.openstreetmap.org/search?q=Melbourne&format=json"
        4. Check rate limit status on geocoding APIs
      `
    },

    cafeDetails: {
      path: '/api/cafe-details',
      method: 'POST',
      priority: 'standard',
      expectedStatus: [200, 400],
      body: { lat: -37.84, lon: 144.99, cafeName: 'Test Cafe' },
      description: 'Fetch cafe busyness data',
      resolutionGuide: `
        FAILURE: /api/cafe-details not responding
        CAUSES:
        1. Google Places API unavailable
        2. Invalid place ID format

        RESOLUTION:
        1. Check api/cafe-details.js
        2. Verify Google Places API key
        3. Test with valid place ID
      `
    },

    attributions: {
      path: '/api/attributions',
      method: 'GET',
      priority: 'standard',
      expectedStatus: 200,
      description: 'Data source credits',
      resolutionGuide: `
        FAILURE: /api/attributions not responding
        CAUSES:
        1. Static data load failure

        RESOLUTION:
        1. Check api/attributions.js
        2. Verify ATTRIBUTION.md exists
      `
    },

    apiIndex: {
      path: '/api/index',
      method: 'GET',
      priority: 'standard',
      expectedStatus: 200,
      description: 'API landing page',
      resolutionGuide: `
        FAILURE: /api/index not responding
        CAUSES:
        1. Route configuration error

        RESOLUTION:
        1. Check api/index.js
        2. Verify vercel.json rewrites
      `
    },
  },

  // ============================================
  // HTML PAGES - Public Interface
  // ============================================
  pages: {
    landing: {
      path: '/',
      description: 'Landing page (redirects to setup wizard)',
      expectedStatus: [200, 307], // 307 is intentional redirect to /setup-wizard.html
      expectedElements: [],
      resolutionGuide: `
        NOTE: 307 redirect is INTENTIONAL
        The landing page redirects to /setup-wizard.html by design (see vercel.json)

        If 5xx error:
        1. Check Vercel deployment logs
        2. Verify vercel.json redirects config
      `
    },

    setupWizard: {
      path: '/setup-wizard.html',
      description: 'Interactive setup wizard',
      expectedElements: ['Home Address', 'Work Address'],
      resolutionGuide: `
        FAILURE: Setup wizard not loading
        CAUSES:
        1. JavaScript errors in setup-wizard.html
        2. Missing CSS/JS dependencies

        RESOLUTION:
        1. Check browser console for JS errors
        2. Verify all script src paths
        3. Test locally with python -m http.server
      `
    },

    admin: {
      path: '/admin.html',
      description: 'Full admin panel with all configuration',
      expectedElements: ['Settings', 'Journey Configuration'],
      resolutionGuide: `
        FAILURE: Admin panel not loading
        CAUSES:
        1. Large file (319KB) causing timeout
        2. JavaScript initialization errors

        RESOLUTION:
        1. Check browser console for errors
        2. Verify all inline scripts
        3. Test admin panel functionality step-by-step
      `
    },

    preview: {
      path: '/preview.html',
      description: 'Dashboard preview with live data',
      expectedElements: ['preview', 'refresh'],
      resolutionGuide: `
        FAILURE: Preview not loading
        CAUSES:
        1. API endpoint failures cascading
        2. Canvas rendering in browser failing

        RESOLUTION:
        1. Check /api/screen endpoint first
        2. Verify browser supports canvas
        3. Check CORS settings if applicable
      `
    },

    simulator: {
      path: '/simulator.html',
      description: 'TRMNL device simulator',
      expectedElements: ['simulator', 'device'],
      resolutionGuide: `
        FAILURE: Simulator not loading
        CAUSES:
        1. Device frame assets missing
        2. API connection failure

        RESOLUTION:
        1. Verify simulator assets in public/
        2. Check API endpoints are responding
      `
    },

    deviceSimulator: {
      path: '/device-simulator.html',
      description: 'Enhanced multi-device simulator',
      expectedElements: ['device', 'render'],
      resolutionGuide: `
        FAILURE: Device simulator not loading
        CAUSES:
        1. Multi-device rendering logic error
        2. Device profile configuration missing

        RESOLUTION:
        1. Check device-simulator.html
        2. Verify device profiles in JS
      `
    },

    journeyDisplay: {
      path: '/journey-display.html',
      description: 'Journey visualization interface',
      expectedElements: ['journey', 'route'],
      resolutionGuide: `
        FAILURE: Journey display not loading
        CAUSES:
        1. Journey engine initialization failure
        2. Route data not available

        RESOLUTION:
        1. Check src/journey-display/ modules
        2. Verify transit data availability
      `
    },

    help: {
      path: '/help.html',
      description: 'Documentation and help',
      expectedElements: ['help', 'documentation'],
      resolutionGuide: `
        FAILURE: Help page not loading
        CAUSES:
        1. Static file serving issue

        RESOLUTION:
        1. Verify public/help.html exists
        2. Check Vercel deployment
      `
    },

    attribution: {
      path: '/attribution.html',
      description: 'Data source attributions',
      expectedElements: ['attribution', 'credit'],
      resolutionGuide: `
        FAILURE: Attribution page not loading
        CAUSES:
        1. Static file missing

        RESOLUTION:
        1. Verify public/attribution.html exists
      `
    },
  },

  // ============================================
  // EXTERNAL DATA SOURCES
  // ============================================
  externalApis: {
    // Transport Victoria GTFS-RT
    ptvMetroTrips: {
      url: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates',
      method: 'GET',
      requiresApiKey: true,
      apiKeyHeader: 'KeyId',
      description: 'Metro Train Train GTFS-RT Trip Updates',
      resolutionGuide: `
        FAILURE: Metro Train GTFS-RT unavailable
        CAUSES:
        1. API key invalid or expired
        2. Transport Victoria OpenData API maintenance
        3. Rate limiting

        RESOLUTION:
        1. Verify API key at data.vic.gov.au
        2. Check Transport Victoria OpenData API status page
        3. System will fallback to static timetables
        4. Wait and retry - usually transient
      `
    },

    ptvTramTrips: {
      url: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/trip-updates',
      method: 'GET',
      requiresApiKey: true,
      apiKeyHeader: 'KeyId',
      description: 'Tram GTFS-RT Trip Updates',
      resolutionGuide: `
        FAILURE: Tram GTFS-RT unavailable
        CAUSES:
        1. Same as Metro - API key or maintenance

        RESOLUTION:
        1. Same steps as Metro
        2. Fallback timetables will be used
      `
    },

    ptvBusTrips: {
      url: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates',
      method: 'GET',
      requiresApiKey: true,
      apiKeyHeader: 'KeyId',
      description: 'Bus GTFS-RT Trip Updates',
      resolutionGuide: `
        FAILURE: Bus GTFS-RT unavailable
        CAUSES:
        1. Same as Metro - API key or maintenance

        RESOLUTION:
        1. Same steps as Metro
      `
    },

    // Bureau of Meteorology
    bomMelbourne: {
      url: 'https://www.bom.gov.au/fwo/IDV60901/IDV60901.94868.json',
      method: 'GET',
      requiresApiKey: false,
      description: 'BOM Melbourne Weather (Olympic Park)',
      resolutionGuide: `
        FAILURE: BOM weather unavailable
        CAUSES:
        1. BOM server maintenance
        2. Station ID changed
        3. Network timeout

        RESOLUTION:
        1. Check BOM website directly
        2. Verify station ID is current
        3. Dashboard will show "Weather unavailable"
        4. Usually resolves within minutes
      `
    },

    // Nominatim Geocoding (always-free fallback)
    // Note: Nominatim has strict rate limits (1 req/sec) and may timeout
    // This is a low-priority check since it's external and /api/address-search has fallbacks
    nominatim: {
      url: 'https://nominatim.openstreetmap.org/search?q=Melbourne&format=json&limit=1',
      method: 'GET',
      requiresApiKey: false,
      optional: true, // Mark as optional - failures don't indicate system problems
      description: 'OpenStreetMap Nominatim Geocoding (external)',
      resolutionGuide: `
        NOTE: This is an EXTERNAL service check
        Nominatim failures don't affect your system - /api/address-search has multiple fallbacks

        If consistently failing:
        1. Check OSM status: https://status.openstreetmap.org
        2. Nominatim enforces 1 req/sec rate limit
        3. Your geocoding still works via Google/Mapbox fallbacks
      `
    },
  },

  // ============================================
  // DATA FLOW CHECKS
  // ============================================
  dataFlowChecks: {
    transitToRender: {
      name: 'Transit Data → Dashboard Render',
      description: 'Validates transit data flows correctly to dashboard rendering',
      checkSequence: ['/api/health', '/api/screen'],
      resolutionGuide: `
        FAILURE: Transit data not reaching dashboard
        CAUSES:
        1. opendata-client.js fetch failure
        2. Protobuf parsing error
        3. Journey engine transformation error
        4. Renderer receiving empty data

        RESOLUTION:
        1. Check /api/health first
        2. Test transit API directly
        3. Review opendata-client.js logs
        4. Check SmartJourneyEngine data transformation
        5. Verify ccdash-renderer-v13.js receives journey data
      `
    },

    weatherToRender: {
      name: 'Weather Data → Dashboard Render',
      description: 'Validates weather flows to header rendering',
      checkSequence: ['/api/health', '/api/screen'],
      resolutionGuide: `
        FAILURE: Weather data not appearing on dashboard
        CAUSES:
        1. BOM API failure
        2. weather-bom.js parsing error
        3. Renderer not receiving weather object

        RESOLUTION:
        1. Test BOM API directly
        2. Check weather-bom.js for parsing errors
        3. Verify renderer header section receives weather
      `
    },

    configTokenFlow: {
      name: 'Config Token → All Endpoints',
      description: 'Validates config token decoding works across all token-requiring endpoints',
      checkSequence: ['/api/zones', '/api/screen', '/api/livedash'],
      resolutionGuide: `
        FAILURE: Config token not working
        CAUSES:
        1. Token encoding changed
        2. Base64URL decode failure
        3. JSON parse error in token
        4. Missing required fields in token

        RESOLUTION:
        1. Check config-token.js encode/decode
        2. Verify token is valid Base64URL
        3. Decode token and check JSON structure
        4. Ensure all required fields present: a, l, t, s
      `
    },

    zonePartialRefresh: {
      name: 'Zone Change Detection → Partial Refresh',
      description: 'Validates zone-based partial refresh is working',
      checkSequence: ['/api/zones', '/api/zonedata'],
      resolutionGuide: `
        FAILURE: Zone partial refresh not working
        CAUSES:
        1. Zone boundary calculation error
        2. Change detection failing
        3. BMP encoding error for zone

        RESOLUTION:
        1. Check zone-renderer.js boundaries
        2. Verify CCDashDesignV10 zone spec
        3. Test individual zone with /api/zone/[id]
      `
    },
  },

  // ============================================
  // HYPERLINKS TO CHECK
  // ============================================
  hyperlinks: [
    // Landing page links
    { page: '/', text: 'Dashboard Setup', href: '/admin.html' },
    { page: '/', text: 'Journey Display', href: '/journey-display.html' },
    { page: '/', text: 'Device Simulator', href: '/simulator.html' },

    // Navigation links (common across pages)
    { page: '*', text: 'Home', href: '/' },
    { page: '*', text: 'Setup', href: '/setup-wizard.html' },
    { page: '*', text: 'Dashboard', href: '/admin.html' },
    { page: '*', text: 'Preview', href: '/preview.html' },
    { page: '*', text: 'Help', href: '/help.html' },

    // Setup wizard links
    { page: '/setup-wizard.html', text: 'Skip', href: '/admin.html' },

    // Admin panel links
    { page: '/admin.html', text: 'Preview', href: '/preview.html' },
    { page: '/admin.html', text: 'Simulator', href: '/simulator.html' },

    // External links
    { page: '*', text: 'GitLab', href: 'https://gitlab.com/angusbergman/commute-compute-system' },
  ],

  // ============================================
  // ALERT CONFIGURATION
  // ============================================
  alerts: {
    // Console colors
    colors: {
      critical: '\x1b[31m', // Red
      warning: '\x1b[33m',  // Yellow
      success: '\x1b[32m',  // Green
      info: '\x1b[36m',     // Cyan
      reset: '\x1b[0m',
    },

    // Failure thresholds
    thresholds: {
      consecutiveFailures: 3,  // Alert after 3 consecutive failures
      responseTimeMs: 10000,   // Alert if response > 10s
    },
  },
};
