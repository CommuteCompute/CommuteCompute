/**
 * Commute Compute System - Visual Logic Compliance Audit
 * Validates display output against CCDashDesignV15.0 spec and CommuteCompute engines
 *
 * Tests against:
 * - CCDashDesignV15.0 (UNLOCKED 2026-02-06) - Display format specification
 * - DEVELOPMENT-RULES.md v1.28 Section 12 - Time/Date formatting
 * - CommuteCompute Engine v3.1 - Journey calculation logic
 * - Coffee Decision Engine - Coffee availability logic
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
// V11 SPEC CONSTANTS
// ============================================

const V11_SPEC = {
  // Time format: 12-hour, no leading zero (e.g., "7:24")
  timeFormat: {
    pattern: /^(1[0-2]|[1-9]):[0-5][0-9]$/,
    description: '12-hour format without leading zero',
  },

  // AM/PM: uppercase, separate field
  amPmFormat: {
    valid: ['AM', 'PM'],
    description: 'Uppercase AM or PM',
  },

  // Day: Title case (e.g., "Sunday")
  dayFormat: {
    valid: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    description: 'Title case day name',
  },

  // Date: "DD Month" (e.g., "1 February") - no year
  dateFormat: {
    pattern: /^([1-9]|[12][0-9]|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December)$/,
    description: 'Day number + full month name, no year',
  },

  // Journey leg types
  legTypes: ['walk', 'coffee', 'train', 'tram', 'bus', 'ferry', 'vline'],

  // Coffee leg requirements
  coffeeLeg: {
    requiredFields: ['number', 'type', 'title', 'subtitle', 'minutes', 'state'],
    validSubtitles: ['TIME FOR COFFEE', 'FRIDAY TREAT', 'WEEKEND VIBES', 'NO TIME FOR COFFEE'],
    validStates: ['normal', 'skip', 'delayed'],
  },

  // Transit leg requirements
  transitLeg: {
    requiredFields: ['number', 'type', 'title', 'subtitle', 'minutes', 'state', 'departTime'],
    optionalFields: ['nextDepartures', 'lineName', 'to', 'delayMinutes'],
  },

  // Walk leg requirements
  walkLeg: {
    requiredFields: ['number', 'type', 'title', 'subtitle', 'minutes', 'state'],
  },

  // Dashboard data requirements
  dashboardData: {
    requiredFields: [
      'location', 'current_time', 'am_pm', 'day', 'date',
      'temp', 'condition', 'status_type', 'arrive_by',
      'total_minutes', 'journey_legs', 'destination',
    ],
    optionalFields: ['umbrella', 'leave_in_minutes', 'coffee_available', 'target_arrival'],
  },
};

// ============================================
// HTTP HELPER
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
      headers: { 'User-Agent': 'CCDash-VisualLogicAudit/1.0' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ============================================
// VISUAL LOGIC AUDITS
// ============================================

const visualLogicAudits = {
  /**
   * Audit 1: Time Format Compliance
   * CCDashDesignV15.0: 12-hour time with separate AM/PM field
   */
  async timeFormatCompliance() {
    const result = {
      name: 'Time Format Compliance (V15)',
      spec: 'CCDashDesignV15.0 Section 2.2 + DEVELOPMENT-RULES Section 12.2',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const currentTime = data.current_time;
      const amPm = data.am_pm;

      // Check current_time format
      if (currentTime) {
        if (V11_SPEC.timeFormat.pattern.test(currentTime)) {
          result.details.push(`✓ current_time: "${currentTime}" (${V11_SPEC.timeFormat.description})`);
        } else {
          result.passed = false;
          result.details.push(`✗ current_time: "${currentTime}" - Invalid format`);
          result.details.push(`  Expected: ${V11_SPEC.timeFormat.description}`);
        }
      } else {
        result.passed = false;
        result.details.push('✗ current_time field missing');
      }

      // Check am_pm field
      if (amPm) {
        if (V11_SPEC.amPmFormat.valid.includes(amPm)) {
          result.details.push(`✓ am_pm: "${amPm}" (${V11_SPEC.amPmFormat.description})`);
        } else {
          result.passed = false;
          result.details.push(`✗ am_pm: "${amPm}" - Invalid value`);
          result.details.push(`  Expected: ${V11_SPEC.amPmFormat.valid.join(' or ')}`);
        }
      } else {
        result.passed = false;
        result.details.push('✗ am_pm field missing (required by V11)');
      }

      // Check arrive_by format
      const arriveBy = data.arrive_by;
      if (arriveBy) {
        // arrive_by can be either 12-hour or HH:MM format
        const is12Hour = V11_SPEC.timeFormat.pattern.test(arriveBy);
        const is24Hour = /^\d{2}:\d{2}$/.test(arriveBy);
        if (is12Hour || is24Hour) {
          result.details.push(`✓ arrive_by: "${arriveBy}"`);
        } else {
          result.details.push(`○ arrive_by: "${arriveBy}" - Unusual format`);
        }
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 2: Day/Date Format Compliance
   * CCDashDesignV15.0: Title case day, full month name, no year
   */
  async dayDateFormatCompliance() {
    const result = {
      name: 'Day/Date Format Compliance (V15)',
      spec: 'CCDashDesignV15.0 Section 2.3',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const day = data.day;
      const date = data.date;

      // Check day format
      if (day) {
        if (V11_SPEC.dayFormat.valid.includes(day)) {
          result.details.push(`✓ day: "${day}" (Title case)`);
        } else if (day === day.toUpperCase()) {
          result.passed = false;
          result.details.push(`✗ day: "${day}" - Uses UPPERCASE (V10 format)`);
          result.details.push(`  V11 requires: Title case (e.g., "Sunday")`);
        } else {
          result.passed = false;
          result.details.push(`✗ day: "${day}" - Invalid format`);
        }
      } else {
        result.passed = false;
        result.details.push('✗ day field missing');
      }

      // Check date format
      if (date) {
        if (V11_SPEC.dateFormat.pattern.test(date)) {
          result.details.push(`✓ date: "${date}" (Day + full month, no year)`);
        } else if (date.includes('202')) {
          result.passed = false;
          result.details.push(`✗ date: "${date}" - Contains year (V10 format)`);
          result.details.push(`  V11 requires: "1 February" (no year)`);
        } else {
          result.passed = false;
          result.details.push(`✗ date: "${date}" - Invalid format`);
          result.details.push(`  Expected: "DD Month" (e.g., "1 February")`);
        }
      } else {
        result.passed = false;
        result.details.push('✗ date field missing');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 3: Coffee Decision Logic
   * Validates CommuteCompute Coffee Decision Engine output
   */
  async coffeeDecisionLogic() {
    const result = {
      name: 'Coffee Decision Logic (CommuteCompute)',
      spec: 'CommuteCompute Engine v3.1 + CCDashDesignV15.0 Section 7',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const legs = data.journey_legs || [];

      // Find coffee leg
      const coffeeLeg = legs.find(l => l.type === 'coffee');
      const coffeeAvailable = data.coffee_available;

      if (coffeeLeg) {
        result.details.push(`✓ Coffee leg found: "${coffeeLeg.title}"`);

        // Check required fields
        const missingFields = V11_SPEC.coffeeLeg.requiredFields.filter(f => !(f in coffeeLeg));
        if (missingFields.length === 0) {
          result.details.push('✓ All required coffee leg fields present');
        } else {
          result.passed = false;
          result.details.push(`✗ Missing coffee leg fields: ${missingFields.join(', ')}`);
        }

        // Check subtitle validity
        if (V11_SPEC.coffeeLeg.validSubtitles.includes(coffeeLeg.subtitle)) {
          result.details.push(`✓ Coffee subtitle: "${coffeeLeg.subtitle}"`);
        } else {
          result.details.push(`○ Coffee subtitle: "${coffeeLeg.subtitle}" (non-standard)`);
        }

        // Check state validity
        if (V11_SPEC.coffeeLeg.validStates.includes(coffeeLeg.state)) {
          result.details.push(`✓ Coffee state: "${coffeeLeg.state}"`);
        } else {
          result.details.push(`○ Coffee state: "${coffeeLeg.state}" (unusual)`);
        }

        // V11: Title should be cafe name, not decision text
        if (coffeeLeg.title && !coffeeLeg.title.includes('COFFEE') && !coffeeLeg.title.includes('CATCH')) {
          result.details.push(`✓ Coffee title is cafe name: "${coffeeLeg.title}"`);
        } else if (coffeeLeg.title.includes('GET') || coffeeLeg.title.includes('SKIP')) {
          result.passed = false;
          result.details.push(`✗ Coffee title is decision text: "${coffeeLeg.title}"`);
          result.details.push('  V11 requires: Cafe name as title');
        }

        // Check canGet field
        if ('canGet' in coffeeLeg) {
          result.details.push(`✓ canGet field: ${coffeeLeg.canGet}`);
        }
      } else {
        // No coffee leg - check if there's a "go direct" walk leg
        const directLeg = legs.find(l => l.type === 'walk' && l.title?.toLowerCase().includes('direct'));
        if (directLeg) {
          result.details.push('○ No coffee leg - "Go Direct" mode active');
          if (directLeg.canGet === false) {
            result.details.push('✓ canGet: false (correctly indicates no coffee)');
          }
        } else {
          result.details.push('○ No coffee leg found in journey');
        }
      }

      // Check coffee_available field
      if (typeof coffeeAvailable === 'boolean') {
        result.details.push(`✓ coffee_available: ${coffeeAvailable}`);
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 4: Journey Leg Structure
   * Validates all journey legs have required V11 fields
   */
  async journeyLegStructure() {
    const result = {
      name: 'Journey Leg Structure (V15)',
      spec: 'CCDashDesignV15.0 Section 5',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const legs = data.journey_legs || [];

      result.details.push(`Total legs: ${legs.length}`);

      if (legs.length === 0) {
        result.passed = false;
        result.details.push('✗ No journey legs found');
        return result;
      }

      if (legs.length > 7) {
        result.details.push(`○ Warning: ${legs.length} legs exceeds V11 max of 7`);
      }

      let legErrors = 0;

      for (const leg of legs) {
        const legDesc = `Leg ${leg.number}: ${leg.type} - "${leg.title}"`;

        // Check type is valid
        if (!V11_SPEC.legTypes.includes(leg.type)) {
          result.details.push(`○ ${legDesc} - Unknown type`);
        }

        // Check required fields based on type
        let requiredFields;
        if (leg.type === 'coffee') {
          requiredFields = V11_SPEC.coffeeLeg.requiredFields;
        } else if (['train', 'tram', 'bus', 'ferry', 'vline'].includes(leg.type)) {
          requiredFields = V11_SPEC.transitLeg.requiredFields;

          // Transit legs should have departTime in V11
          if (!leg.departTime) {
            result.details.push(`○ ${legDesc} - Missing departTime (V11 enhancement)`);
          } else {
            result.details.push(`✓ ${legDesc} - departTime: ${leg.departTime}`);
          }

          // Check nextDepartures array
          if (leg.nextDepartures && Array.isArray(leg.nextDepartures)) {
            result.details.push(`  ✓ nextDepartures: [${leg.nextDepartures.join(', ')}] min`);
          }
        } else {
          requiredFields = V11_SPEC.walkLeg.requiredFields;
        }

        const missingFields = requiredFields.filter(f => !(f in leg));
        if (missingFields.length > 0) {
          legErrors++;
          result.details.push(`✗ ${legDesc} - Missing: ${missingFields.join(', ')}`);
        } else {
          result.details.push(`✓ ${legDesc}`);
        }
      }

      if (legErrors > 0) {
        result.passed = false;
        result.details.push(`\n✗ ${legErrors} leg(s) have missing required fields`);
      } else {
        result.details.push('\n✓ All legs have required fields');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 5: Dashboard Data Completeness
   * Validates all required V11 dashboard fields are present
   */
  async dashboardDataCompleteness() {
    const result = {
      name: 'Dashboard Data Completeness (V15)',
      spec: 'CCDashDesignV15.0 Data Model',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;

      // Check required fields
      const missingRequired = V11_SPEC.dashboardData.requiredFields.filter(f => !(f in data));
      const presentRequired = V11_SPEC.dashboardData.requiredFields.filter(f => f in data);

      for (const field of presentRequired) {
        const value = data[field];
        const displayValue = typeof value === 'object' ? JSON.stringify(value).substring(0, 50) : value;
        result.details.push(`✓ ${field}: ${displayValue}`);
      }

      if (missingRequired.length > 0) {
        result.passed = false;
        for (const field of missingRequired) {
          result.details.push(`✗ Missing required field: ${field}`);
        }
      }

      // Check optional fields
      const presentOptional = V11_SPEC.dashboardData.optionalFields.filter(f => f in data);
      if (presentOptional.length > 0) {
        result.details.push(`\nOptional fields present: ${presentOptional.join(', ')}`);
      }

      // Validate specific field types
      if (typeof data.total_minutes !== 'number') {
        result.details.push('○ total_minutes should be a number');
      }

      if (data.journey_legs && !Array.isArray(data.journey_legs)) {
        result.passed = false;
        result.details.push('✗ journey_legs must be an array');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 6: Address Formatting
   * Validates location/destination address display
   */
  async addressFormatting() {
    const result = {
      name: 'Address Formatting',
      spec: 'CCDashDesignV15.0 Section 2.1 + 6.1',
      priority: 'MEDIUM',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const location = data.location;
      const destination = data.destination;

      // V11: Addresses should be formatted for display (street + suburb)
      if (location) {
        result.details.push(`✓ location: "${location}"`);
        // Check if it's a proper formatted address or just "HOME"
        if (location !== 'HOME' && location.includes(',')) {
          result.details.push('  ✓ Contains formatted address with suburb');
        }
        // Should be uppercase for display
        if (location === location.toUpperCase()) {
          result.details.push('  ✓ Uppercase format for header display');
        }
      } else {
        result.passed = false;
        result.details.push('✗ location field missing');
      }

      if (destination) {
        result.details.push(`✓ destination: "${destination}"`);
        if (destination !== 'WORK' && destination.includes(',')) {
          result.details.push('  ✓ Contains formatted address with suburb');
        }
        if (destination === destination.toUpperCase()) {
          result.details.push('  ✓ Uppercase format for footer display');
        }
      } else {
        result.passed = false;
        result.details.push('✗ destination field missing');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 7: Weather Integration
   * Validates weather data structure
   */
  async weatherIntegration() {
    const result = {
      name: 'Weather Data Integration',
      spec: 'CCDashDesignV15.0 Section 2.6',
      priority: 'MEDIUM',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;

      // Check temp
      if ('temp' in data) {
        result.details.push(`✓ temp: ${data.temp}`);
        if (typeof data.temp === 'number' || data.temp === '--') {
          result.details.push('  ✓ Valid temp format');
        }
      } else {
        result.passed = false;
        result.details.push('✗ temp field missing');
      }

      // Check condition
      if ('condition' in data) {
        result.details.push(`✓ condition: "${data.condition}"`);
      } else {
        result.passed = false;
        result.details.push('✗ condition field missing');
      }

      // Check umbrella (optional but recommended)
      if ('umbrella' in data) {
        result.details.push(`✓ umbrella: ${data.umbrella}`);
        if (typeof data.umbrella === 'boolean') {
          result.details.push('  ✓ Boolean format');
        }
      } else {
        result.details.push('○ umbrella field not present (optional)');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 8: Status Type Logic
   * Validates status bar state determination
   */
  async statusTypeLogic() {
    const result = {
      name: 'Status Type Logic',
      spec: 'CCDashDesignV15.0 Section 4',
      priority: 'MEDIUM',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const statusType = data.status_type;
      const legs = data.journey_legs || [];

      // Valid status types
      const validTypes = ['normal', 'delay', 'disruption', 'diversion'];

      if (statusType) {
        if (validTypes.includes(statusType)) {
          result.details.push(`✓ status_type: "${statusType}"`);
        } else {
          result.passed = false;
          result.details.push(`✗ status_type: "${statusType}" - Invalid`);
          result.details.push(`  Expected: ${validTypes.join(', ')}`);
        }

        // Cross-check with leg states
        const hasDelayedLeg = legs.some(l => l.state === 'delayed');
        const hasDisruptedLeg = legs.some(l => l.state === 'suspended' || l.state === 'cancelled');

        if (hasDelayedLeg && statusType !== 'delay' && statusType !== 'disruption') {
          result.details.push('○ Has delayed leg but status_type is not "delay"');
        }

        if (hasDisruptedLeg && statusType !== 'disruption') {
          result.details.push('○ Has disrupted leg but status_type is not "disruption"');
        }

        if (!hasDelayedLeg && !hasDisruptedLeg && statusType === 'normal') {
          result.details.push('✓ Status correctly reflects normal journey');
        }
      } else {
        result.passed = false;
        result.details.push('✗ status_type field missing');
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 9: Transit Departure Times
   * Validates transit legs have proper departure time data
   */
  async transitDepartureTimes() {
    const result = {
      name: 'Transit Departure Times (V15)',
      spec: 'CCDashDesignV15.0 Section 5.3 - Transit Legs',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data?.data || response.data;
      const legs = data.journey_legs || [];

      // Find transit legs
      const transitLegs = legs.filter(l => ['train', 'tram', 'bus', 'ferry', 'vline'].includes(l.type));

      if (transitLegs.length === 0) {
        result.details.push('○ No transit legs in journey');
        return result;
      }

      result.details.push(`Found ${transitLegs.length} transit leg(s):`);

      for (const leg of transitLegs) {
        const legDesc = `${leg.type} - "${leg.title}"`;

        // Check departTime (V11 requirement)
        if (leg.departTime) {
          // Should be in format like "7:40am" or "7:40"
          const timePattern = /^(1[0-2]|[1-9]):[0-5][0-9](am|pm)?$/i;
          if (timePattern.test(leg.departTime)) {
            result.details.push(`✓ ${legDesc}`);
            result.details.push(`  departTime: ${leg.departTime}`);
          } else {
            result.details.push(`○ ${legDesc}`);
            result.details.push(`  departTime: ${leg.departTime} (unusual format)`);
          }
        } else {
          result.passed = false;
          result.details.push(`✗ ${legDesc}`);
          result.details.push('  Missing departTime (required by V11)');
        }

        // Check nextDepartures array
        if (leg.nextDepartures) {
          if (Array.isArray(leg.nextDepartures)) {
            result.details.push(`  nextDepartures: [${leg.nextDepartures.join(', ')}] min`);
          } else {
            result.details.push(`  nextDepartures: invalid (not an array)`);
          }
        }

        // Check destination
        if (leg.to) {
          result.details.push(`  to: ${leg.to}`);
        }
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 10: API Response Version
   * Validates API indicates V11 compliance
   */
  async apiVersionCompliance() {
    const result = {
      name: 'API Version Compliance',
      spec: 'CCDashDesignV15.0 API Contract',
      priority: 'MEDIUM',
      passed: true,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/zonedata?token=${config.SAMPLE_CONFIG_TOKEN}`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.passed = false;
        result.details.push(`✗ API returned ${response.status}`);
        return result;
      }

      const data = response.data;

      // Check version field
      if (data.version) {
        if (data.version === 'v15') {
          result.details.push(`✓ API version: ${data.version}`);
        } else if (data.version === 'v10' || data.version === 'v11') {
          result.passed = false;
          result.details.push(`✗ API version: ${data.version} (outdated)`);
          result.details.push('  Expected: v15');
        } else {
          result.details.push(`○ API version: ${data.version}`);
        }
      } else {
        result.details.push('○ No version field in response');
      }

      // Check timestamp
      if (data.timestamp) {
        result.details.push(`✓ timestamp: ${data.timestamp}`);
      }

      // Check zones are present (for zone renderer)
      if (data.zones) {
        const zoneCount = typeof data.zones === 'object' ? Object.keys(data.zones).length : 0;
        result.details.push(`✓ zones: ${zoneCount} rendered`);
      }
    } catch (error) {
      result.passed = false;
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },
};

// ============================================
// TEST RUNNER
// ============================================

async function runVisualLogicAudit(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.info}COMMUTE COMPUTE SYSTEM - VISUAL LOGIC AUDIT${colors.reset}`);
  console.log(`Target: ${config.BASE_URL}`);
  console.log(`Scope: CCDashDesignV15.0 Compliance, CommuteCompute Engine Logic`);
  console.log(`Spec: CCDashDesignV15.0 (UNLOCKED 2026-02-06) + DEVELOPMENT-RULES v1.28`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;
  let criticalFailed = 0;

  for (const [name, auditFn] of Object.entries(visualLogicAudits)) {
    if (verbose) {
      process.stdout.write(`Auditing ${name}... `);
    }

    const result = await auditFn();
    results.push(result);

    if (result.passed) {
      passed++;
      if (verbose) console.log(`${colors.success}PASS${colors.reset}`);
    } else {
      failed++;
      if (result.priority === 'CRITICAL') criticalFailed++;
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
  console.log(`${colors.info}VISUAL LOGIC AUDIT SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = criticalFailed > 0 ? colors.critical :
                      failed > 0 ? colors.warning : colors.success;
  const status = criticalFailed > 0 ? 'V11 NON-COMPLIANT' :
                 failed > 0 ? 'PARTIAL COMPLIANCE' : 'V11 COMPLIANT';

  console.log(`\nTests: ${colors.success}${passed} passed${colors.reset}, ${colors.critical}${failed} failed${colors.reset}`);
  if (criticalFailed > 0) {
    console.log(`${colors.critical}Critical Failures: ${criticalFailed}${colors.reset}`);
  }
  console.log(`Pass Rate: ${passRate}%`);
  console.log(`\nOverall Status: ${statusColor}${status}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.critical}Failed Audits:${colors.reset}`);
    for (const result of results) {
      if (!result.passed) {
        const priorityColor = result.priority === 'CRITICAL' ? colors.critical : colors.warning;
        console.log(`  ✗ [${priorityColor}${result.priority}${colors.reset}] ${result.name}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  return { results, passed, failed, criticalFailed, passRate };
}

// Export for use in main monitor
export { runVisualLogicAudit, visualLogicAudits, V11_SPEC };
export default runVisualLogicAudit;

// ============================================
// MAIN EXECUTION
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runVisualLogicAudit()
    .then(({ criticalFailed }) => {
      process.exit(criticalFailed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Visual logic audit error:', error);
      process.exit(1);
    });
}
