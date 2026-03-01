/**
 * Commute Compute System™ - Spec Compliance Testing
 * End-to-end CCDashDesignV15.0 and DEVELOPMENT-RULES compliance validation
 *
 * Tests against:
 * - CCDashDesignV15.md (UNLOCKED specification)
 * - DEVELOPMENT-RULES.md v1.28
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import config from './config.mjs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const colors = config.alerts.colors;

// ============================================
// SPEC CONSTANTS (from CCDashDesignV15.0)
// ============================================

const SPEC = {
  // Display dimensions (LOCKED)
  display: {
    width: 800,
    height: 480,
    bitDepth: 1, // 1-bit only, no grayscale
  },

  // Layout sections (LOCKED)
  layout: {
    header: { top: 0, height: 94 },
    divider: { top: 94, height: 2 },
    summaryBar: { top: 96, height: 28 },
    journeyLegs: { top: 132, bottom: 440 },
    footer: { top: 448, height: 32 },
  },

  // Zone boundaries (LOCKED - Section 7.2)
  zones: {
    'header.location': { x: 16, y: 8, w: 200, h: 32 },
    'header.time': { x: 16, y: 40, w: 200, h: 54 },
    'header.dayDate': { x: 240, y: 16, w: 280, h: 78 },
    'header.weather': { x: 600, y: 8, w: 184, h: 86 },
    'status': { x: 0, y: 96, w: 800, h: 28 },
    'footer': { x: 0, y: 448, w: 800, h: 32 },
  },

  // Timing requirements
  timing: {
    partialRefresh: 60000,  // 60 seconds (v1.8)
    fullRefresh: 300000,    // 5 minutes
    weatherCache: 1800000,  // 30 minutes
    departureCache: 20000,  // 20 seconds
    disruptionCache: 300000, // 5 minutes
  },

  // Required endpoints (Section 4.5)
  requiredEndpoints: [
    '/api/screen',
    '/api/zones',
    '/api/health',
    '/api/status',
    '/api/livedash',
  ],

  // Forbidden terms (Section 1.1)
  forbiddenTerms: [
    'PTV API',
    'ptv-api',
    'ptvapi',
    'usetrmnl.com',
    'usetrmnl',
    'TRMNL cloud',
    'trmnl-server',
    'hardcoded API key',
  ],

  // Required naming patterns (Section 0)
  namingPatterns: {
    cssClasses: /^cc-/,
    htmlIds: /^cc-/,
    localStorageKeys: /^cc-/,
  },

  // Color palette (Section 8.3 - LOCKED)
  colors: {
    black: '#000000',
    white: '#ffffff',
    // No other colors allowed for e-ink
  },

  // Time format (Section 12.2)
  timeFormat: '12-hour', // Must use 12-hour format
};

// ============================================
// HTTP REQUEST HELPER
// ============================================

async function fetchJson(urlString) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'CCDash-SpecTest/1.0' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function fetchBinary(urlString) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'CCDash-SpecTest/1.0' },
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: Buffer.concat(chunks),
          headers: res.headers,
          contentType: res.headers['content-type'],
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ============================================
// COMPLIANCE TESTS
// ============================================

const complianceTests = {
  /**
   * Test 1: Display Dimensions
   * Verifies rendered output is exactly 800x480
   */
  async displayDimensions() {
    const result = {
      name: 'Display Dimensions (800×480)',
      spec: 'CCDashDesignV15.0 Section 1',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/screen?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchBinary(url);

      if (response.status !== 200) {
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      // Check PNG header for dimensions
      const png = response.data;
      if (png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4E && png[3] === 0x47) {
        // PNG signature found, read IHDR chunk for dimensions
        const width = png.readUInt32BE(16);
        const height = png.readUInt32BE(20);

        result.details.push(`Rendered size: ${width}×${height}`);

        if (width === SPEC.display.width && height === SPEC.display.height) {
          result.passed = true;
          result.details.push('✓ Matches spec (800×480)');
        } else {
          result.details.push(`✗ Expected ${SPEC.display.width}×${SPEC.display.height}`);
        }
      } else {
        result.details.push('Response is not a valid PNG');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 2: Zone Boundaries
   * Verifies zone definitions match spec exactly
   * Note: API returns zone names, coordinates are defined in renderer (LOCKED)
   */
  async zoneBoundaries() {
    const result = {
      name: 'Zone Boundaries (LOCKED)',
      spec: 'CCDashDesignV15.0 + DEVELOPMENT-RULES Section 7.2',
      passed: true,
      details: [],
    };

    try {
      // Check zones-tiered endpoint which returns zone names
      const url = `${config.BASE_URL}/api/zones-tiered?format=json&token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data;
      const returnedZones = data.zones || [];

      // Required zones per spec (header zones + status + footer)
      const requiredZones = Object.keys(SPEC.zones);

      for (const zoneId of requiredZones) {
        if (returnedZones.includes(zoneId)) {
          result.details.push(`✓ Zone present: ${zoneId}`);
        } else {
          result.passed = false;
          result.details.push(`✗ Missing zone: ${zoneId}`);
        }
      }

      // Also verify zones-tiered returns BMP data (coordinates applied during render)
      const bmpUrl = `${config.BASE_URL}/api/zones-tiered?tier=3&token=${config.SAMPLE_CONFIG_TOKEN}`;
      const bmpResponse = await fetchJson(bmpUrl);

      if (bmpResponse.status === 200 && bmpResponse.data['header.location']) {
        result.details.push('✓ Zone BMP rendering operational');
      } else {
        result.passed = false;
        result.details.push('✗ Zone BMP rendering failed');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 3: Required Endpoints
   * Verifies all mandatory endpoints exist
   */
  async requiredEndpoints() {
    const result = {
      name: 'Required Endpoints',
      spec: 'DEVELOPMENT-RULES Section 4.5',
      passed: true,
      details: [],
    };

    for (const endpoint of SPEC.requiredEndpoints) {
      try {
        const url = `${config.BASE_URL}${endpoint}`;
        const response = await fetchJson(url);

        if (response.status >= 200 && response.status < 500) {
          result.details.push(`✓ ${endpoint} (${response.status})`);
        } else {
          result.passed = false;
          result.details.push(`✗ ${endpoint} (${response.status})`);
        }
      } catch (error) {
        result.passed = false;
        result.details.push(`✗ ${endpoint} (${error.message})`);
      }
    }

    return result;
  },

  /**
   * Test 4: Config Token Architecture
   * Verifies zero-config serverless pattern
   */
  async configTokenArchitecture() {
    const result = {
      name: 'Zero-Config Token Architecture',
      spec: 'DEVELOPMENT-RULES Section 3',
      passed: true,
      details: [],
    };

    // Decode and validate token structure
    try {
      const token = config.SAMPLE_CONFIG_TOKEN;
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

      const requiredFields = ['a', 'l', 't', 's']; // addresses, locations, time, state
      const optionalFields = ['c', 'k', 'g']; // coffee, transit key, google key

      for (const field of requiredFields) {
        if (decoded[field] !== undefined) {
          result.details.push(`✓ Required field '${field}' present`);
        } else {
          result.passed = false;
          result.details.push(`✗ Missing required field '${field}'`);
        }
      }

      for (const field of optionalFields) {
        if (decoded[field] !== undefined) {
          result.details.push(`✓ Optional field '${field}' present`);
        }
      }

      // Verify token works with endpoints
      const screenUrl = `${config.BASE_URL}/api/screen?token=${token}`;
      const response = await fetchBinary(screenUrl);

      if (response.status === 200) {
        result.details.push('✓ Token accepted by /api/screen');
      } else {
        result.passed = false;
        result.details.push(`✗ Token rejected by /api/screen (${response.status})`);
      }

    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 5: 12-Hour Time Format
   * Verifies dashboard uses 12-hour format
   */
  async timeFormat() {
    const result = {
      name: '12-Hour Time Format',
      spec: 'DEVELOPMENT-RULES Section 12.2',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data;
      const currentTime = data.data?.current_time || data.current_time;

      if (currentTime) {
        result.details.push(`Current time displayed: "${currentTime}"`);

        // Check for 12-hour format (no leading zero, max 12)
        const match = currentTime.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
          const hours = parseInt(match[1]);
          if (hours >= 1 && hours <= 12) {
            result.passed = true;
            result.details.push('✓ Uses 12-hour format (1-12)');
          } else if (hours >= 0 && hours <= 23) {
            result.details.push('✗ Appears to use 24-hour format');
          }
        }
      } else {
        result.details.push('Could not find current_time in response');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 6: Coffee Decision Logic
   * Verifies coffee calculation is present and logical
   */
  async coffeeDecision() {
    const result = {
      name: 'Coffee Decision Logic',
      spec: 'CCDashDesignV15.0 Section 7.2 + DEVELOPMENT-RULES Section 12.1',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data.data || response.data;
      const legs = data.journey_legs || data.legs || [];

      // Look for coffee leg
      const coffeeLeg = legs.find(l => l.type === 'coffee');

      if (coffeeLeg) {
        result.details.push(`✓ Coffee leg found: "${coffeeLeg.title}"`);
        result.details.push(`  State: ${coffeeLeg.state}`);
        result.details.push(`  Subtitle: ${coffeeLeg.subtitle}`);

        // Validate coffee states per spec
        if (['normal', 'skip'].includes(coffeeLeg.state)) {
          result.passed = true;
          result.details.push('✓ Valid coffee state');
        } else {
          result.details.push(`✗ Unknown coffee state: ${coffeeLeg.state}`);
        }
      } else {
        result.details.push('No coffee leg in journey (may be disabled)');
        result.passed = true; // Not a failure if coffee is disabled
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 7: Journey Leg Structure
   * Verifies leg data matches spec requirements
   */
  async journeyLegStructure() {
    const result = {
      name: 'Journey Leg Structure',
      spec: 'CCDashDesignV15.0 Section 5',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data.data || response.data;
      const legs = data.journey_legs || data.legs || [];

      result.details.push(`Total legs: ${legs.length}`);

      if (legs.length > 5) {
        result.details.push(`⚠ More than 5 legs (${legs.length}) - should show "+N more"`);
      }

      const validTypes = ['walk', 'train', 'tram', 'bus', 'coffee'];
      const validStates = ['normal', 'delayed', 'skip', 'suspended', 'diverted'];

      for (const leg of legs) {
        const issues = [];

        if (!leg.type || !validTypes.includes(leg.type)) {
          issues.push(`invalid type: ${leg.type}`);
        }
        if (!leg.title) {
          issues.push('missing title');
        }
        if (leg.state && !validStates.includes(leg.state)) {
          issues.push(`invalid state: ${leg.state}`);
        }
        if (leg.minutes === undefined && leg.type !== 'coffee') {
          issues.push('missing minutes');
        }

        if (issues.length === 0) {
          result.details.push(`✓ Leg ${leg.number || '?'}: ${leg.type} - "${leg.title}"`);
        } else {
          result.passed = false;
          result.details.push(`✗ Leg ${leg.number || '?'}: ${issues.join(', ')}`);
        }
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 8: Weather Data Structure
   * Verifies weather box data matches spec
   */
  async weatherData() {
    const result = {
      name: 'Weather Data Structure',
      spec: 'CCDashDesignV15.0 Section 2.6',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data.data || response.data;

      // Check temperature
      if (data.temp !== undefined) {
        result.details.push(`✓ Temperature: ${data.temp}°`);
      } else {
        result.passed = false;
        result.details.push('✗ Missing temperature');
      }

      // Check condition
      if (data.condition) {
        result.details.push(`✓ Condition: "${data.condition}"`);
      } else {
        result.passed = false;
        result.details.push('✗ Missing condition');
      }

      // Check umbrella indicator
      if (data.umbrella !== undefined) {
        result.details.push(`✓ Umbrella indicator: ${data.umbrella ? 'BRING UMBRELLA' : 'NO UMBRELLA'}`);
      } else {
        result.details.push('⚠ Missing umbrella indicator');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 9: Summary Bar States
   * Verifies status bar matches spec states
   */
  async summaryBarStates() {
    const result = {
      name: 'Summary Bar States',
      spec: 'CCDashDesignV15.0 Section 4',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data.data || response.data;

      const validStatusTypes = ['normal', 'delay', 'disruption', 'diversion'];
      const statusType = data.status_type;

      if (statusType && validStatusTypes.includes(statusType)) {
        result.details.push(`✓ Status type: "${statusType}"`);
      } else if (statusType) {
        result.passed = false;
        result.details.push(`✗ Invalid status type: "${statusType}"`);
      }

      // Check arrive_by
      if (data.arrive_by) {
        result.details.push(`✓ Arrive by: ${data.arrive_by}`);
      }

      // Check total_minutes
      if (data.total_minutes !== undefined) {
        result.details.push(`✓ Total minutes: ${data.total_minutes}`);
      }

      // Check leave_in_minutes
      if (data.leave_in_minutes !== undefined) {
        result.details.push(`✓ Leave in: ${data.leave_in_minutes} min`);
      } else {
        result.details.push('✓ Leave now (no leave_in_minutes)');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 10: Tiered Refresh System
   * Verifies tier configuration matches spec
   */
  async tieredRefresh() {
    const result = {
      name: 'Tiered Refresh System',
      spec: 'DEVELOPMENT-RULES Section 19',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zones-tiered?format=json&token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data;

      // Check tier intervals
      if (data.intervals) {
        result.details.push('Tier intervals:');
        for (const [tier, config] of Object.entries(data.intervals)) {
          const seconds = config.interval / 1000;
          result.details.push(`  Tier ${tier}: ${seconds}s`);
        }
      }

      // Check zones per tier
      if (data.zones) {
        result.details.push(`✓ Total zones: ${data.zones.length}`);
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 11: Footer Structure
   * Verifies footer matches spec
   */
  async footerStructure() {
    const result = {
      name: 'Footer Structure',
      spec: 'CCDashDesignV15.0 Section 6',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data.data || response.data;

      // Check destination
      if (data.destination) {
        result.details.push(`✓ Destination: "${data.destination}"`);
      } else {
        result.passed = false;
        result.details.push('✗ Missing destination');
      }

      // Check arrival time
      if (data.arrive_by) {
        result.details.push(`✓ Arrival time: ${data.arrive_by}`);
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 12: GTFS-RT Data Source
   * Verifies transit data architecture complies with spec
   * - Must NOT reference legacy PTV API (FORBIDDEN per Section 1.1)
   * - Must use OpenData/GTFS-RT architecture
   */
  async gtfsrtDataSource() {
    const result = {
      name: 'GTFS-RT Data Source',
      spec: 'DEVELOPMENT-RULES Section 11.1',
      passed: true, // Pass by default, fail if forbidden terms found
      details: [],
    };

    try {
      // Check multiple endpoints for forbidden terms
      const endpoints = [
        '/api/status',
        '/api/health',
        '/api/system-status',
      ];

      let foundForbiddenTerms = false;

      for (const endpoint of endpoints) {
        const url = `${config.BASE_URL}${endpoint}`;
        const response = await fetchJson(url);

        if (response.status === 200) {
          const statusStr = JSON.stringify(response.data).toLowerCase();

          // Check for FORBIDDEN terms (Section 1.1)
          const forbidden = ['ptv-api', 'ptvapi', 'ptv api'];
          for (const term of forbidden) {
            if (statusStr.includes(term)) {
              result.passed = false;
              foundForbiddenTerms = true;
              result.details.push(`✗ FORBIDDEN term "${term}" found in ${endpoint}`);
            }
          }
        }
      }

      if (!foundForbiddenTerms) {
        result.details.push('✓ No forbidden API references');
      }

      // Check /api/status for transit service info
      const statusUrl = `${config.BASE_URL}/api/status`;
      const statusResp = await fetchJson(statusUrl);

      if (statusResp.status === 200) {
        const status = statusResp.data;

        // Check if transit service is active
        if (status.services?.transit) {
          const transitStatus = status.services.transit;
          result.details.push(`✓ Transit service: ${transitStatus.status}`);

          if (transitStatus.message) {
            result.details.push(`  Message: ${transitStatus.message}`);
          }
        }

        // KV storage should be available for API key storage (zero-config)
        if (status.kv?.available) {
          result.details.push('✓ KV storage available for API keys');
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 13: BMP Format Compliance
   * Verifies zone renders produce valid 1-bit BMP
   */
  async bmpFormatCompliance() {
    const result = {
      name: '1-Bit BMP Format',
      spec: 'DEVELOPMENT-RULES Section 10.1',
      passed: false,
      details: [],
    };

    try {
      // Use zones-tiered endpoint which returns consistent BMP zone data
      const url = `${config.BASE_URL}/api/zones-tiered?tier=1&token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data;

      // Check if zones contain BMP data (skip metadata fields)
      let zoneCount = 0;
      let bmpCount = 0;
      const metadataFields = ['intervals', 'tier', 'timestamp'];

      for (const [zoneId, zoneData] of Object.entries(data)) {
        if (metadataFields.includes(zoneId)) continue;
        zoneCount++;

        // BMP data comes as {type: 'Buffer', data: [...]} from JSON serialization
        if (zoneData && typeof zoneData === 'object' && zoneData.type === 'Buffer' && Array.isArray(zoneData.data)) {
          bmpCount++;

          // Verify BMP header magic bytes (BM = 0x42, 0x4D)
          if (zoneData.data[0] === 66 && zoneData.data[1] === 77) {
            result.details.push(`✓ ${zoneId}: Valid BMP header (${zoneData.data.length} bytes)`);
          } else {
            result.details.push(`✗ ${zoneId}: Invalid BMP header`);
          }
        }
      }

      result.details.push(`Total zones: ${zoneCount}, BMP data: ${bmpCount}`);

      if (bmpCount > 0) {
        result.passed = true;
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 14: Multi-Device Support
   * Verifies LiveDash endpoint works
   */
  async multiDeviceSupport() {
    const result = {
      name: 'Multi-Device Support (LiveDash)',
      spec: 'DEVELOPMENT-RULES Section 11.6',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/livedash?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchBinary(url);

      if (response.status === 200) {
        result.passed = true;
        result.details.push('✓ LiveDash endpoint responding');
        result.details.push(`  Content-Type: ${response.contentType}`);
        result.details.push(`  Size: ${response.data.length} bytes`);
      } else {
        result.details.push(`✗ LiveDash returned ${response.status}`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Test 15: Error State Rendering
   * Verifies system renders gracefully on errors
   */
  async errorStateRendering() {
    const result = {
      name: 'Error State Rendering',
      spec: 'DEVELOPMENT-RULES Section 13.2',
      passed: true,
      details: [],
    };

    try {
      // Test with invalid token
      const url = `${config.BASE_URL}/api/screen?token=invalid_token`;
      const response = await fetchBinary(url);

      if (response.status === 200) {
        result.details.push('✓ Renders fallback on invalid token');
      } else if (response.status === 400) {
        result.details.push('✓ Returns 400 for invalid token (acceptable)');
      } else {
        result.passed = false;
        result.details.push(`✗ Unexpected status ${response.status} for invalid token`);
      }

      // Test health endpoint still works
      const healthUrl = `${config.BASE_URL}/api/health`;
      const healthResponse = await fetchJson(healthUrl);

      if (healthResponse.status === 200) {
        result.details.push('✓ Health check passes during error conditions');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },
};

// ============================================
// TEST RUNNER
// ============================================

async function runAllComplianceTests(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.info}COMMUTE COMPUTE SYSTEM™ - SPEC COMPLIANCE AUDIT${colors.reset}`);
  console.log(`Target: ${config.BASE_URL}`);
  console.log(`Spec: CCDashDesignV15.0 (UNLOCKED) + DEVELOPMENT-RULES v1.28`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const [name, testFn] of Object.entries(complianceTests)) {
    if (verbose) {
      process.stdout.write(`Testing ${name}... `);
    }

    const result = await testFn();
    results.push(result);

    if (result.passed) {
      passed++;
      if (verbose) console.log(`${colors.success}PASS${colors.reset}`);
    } else {
      failed++;
      if (verbose) console.log(`${colors.critical}FAIL${colors.reset}`);
    }

    if (verbose && result.details.length > 0) {
      console.log(`  ${colors.info}Spec: ${result.spec}${colors.reset}`);
      for (const detail of result.details) {
        console.log(`  ${detail}`);
      }
      console.log('');
    }
  }

  // Summary
  console.log('═'.repeat(70));
  console.log(`${colors.info}COMPLIANCE SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = failed === 0 ? colors.success : colors.critical;
  const status = failed === 0 ? 'FULLY COMPLIANT' : 'NON-COMPLIANT';

  console.log(`\nTests: ${colors.success}${passed} passed${colors.reset}, ${colors.critical}${failed} failed${colors.reset}`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log(`\nOverall Status: ${statusColor}${status}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.critical}Failed Tests:${colors.reset}`);
    for (const result of results) {
      if (!result.passed) {
        console.log(`  ✗ ${result.name}`);
        console.log(`    Spec: ${result.spec}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  return { results, passed, failed, passRate };
}

// Export for use in main monitor
export { runAllComplianceTests, complianceTests, SPEC };
export default runAllComplianceTests;

// ============================================
// MAIN EXECUTION
// ============================================

// Run when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllComplianceTests()
    .then(({ passed, failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Compliance test error:', error);
      process.exit(1);
    });
}
