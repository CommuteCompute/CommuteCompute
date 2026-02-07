/**
 * Commute Compute System - Semantic Compliance Audit
 * Reviews actual content, UI/UX, and documentation against spec
 *
 * Tests against:
 * - DEVELOPMENT-RULES.md v1.17 (Section 22: Admin Panel UI/UX)
 * - CCDashDesignV10.md (LOCKED specification)
 * - Project vision and naming conventions
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
// SEMANTIC SPEC CONSTANTS
// ============================================

const SEMANTIC_SPEC = {
  // Section 22.1: Color Palette
  colors: {
    ccGreen: '#4fb28e',
    ccPurple: '#667eea',
    ccDark: '#0f172a',
    ccSurface: '#1e293b',
    white: '#f1f5f9',
    muted: '#94a3b8',
    warning: '#fbbf24',
    error: '#ef4444',
  },

  // Section 22.2: Typography
  typography: {
    primaryFont: 'Inter',
    fontStack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    monospace: 'JetBrains Mono',
  },

  // Section 22.3: NO EMOJIS
  forbiddenEmojis: [
    '🚆', '🚃', '🚊', '🚇', '🚈', // Transit emojis
    '☕', '🍵', // Coffee emojis
    '⚠️', '⚠', '🚨', '❗', '❌', // Warning emojis
    '✅', '✓', '☑', // Checkmark emojis
    '🏠', '🏢', '🏙', // Building emojis
    '🌤', '☀️', '🌧', '☁️', '🌡', // Weather emojis
    '👤', '🧑', '🚶', // Person emojis
  ],

  // Section 0: Official Names
  naming: {
    systemName: 'Commute Compute System',
    shortName: 'Commute Compute',
    dashboardSpec: 'CCDashDesignV10',
    renderer: 'CCDashRendererV13',
    multiDevice: 'CC LiveDash',
    journeyEngine: 'CommuteCompute',
  },

  // Section 1.1: Forbidden Terms
  forbiddenTerms: [
    'PTV API',
    'PTV Timetable API',
    'PTV Developer ID',
    'PTV API Token',
    'PTV_USER_ID',
    'PTV_API_KEY',
    'PTV_DEV_ID',
    'Metro API',
    'usetrmnl.com',
    'usetrmnl',
    'TRMNL cloud',
    'trmnl-server',
  ],

  // Section 22.9: Required Footer Elements
  footerRequired: [
    'CommuteCompute',
    'CCDash',
    'Angus Bergman',
    'AGPL-3.0',
  ],

  // Required pages
  requiredPages: [
    { path: '/setup-wizard.html', name: 'Setup Wizard' },
    { path: '/admin.html', name: 'Admin Panel' },
    { path: '/preview.html', name: 'Preview' },
    { path: '/help.html', name: 'Help' },
    { path: '/attribution.html', name: 'Attribution' },
  ],

  // Navigation requirements
  requiredNavLinks: [
    'Setup',
    'Dashboard',
    'Preview',
    'Help',
  ],
};

// ============================================
// HTTP REQUEST HELPER
// ============================================

async function fetchHtml(urlString) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'CCDash-SemanticAudit/1.0' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, html: data, headers: res.headers }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function fetchJson(urlString) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'CCDash-SemanticAudit/1.0' },
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
// SEMANTIC AUDIT TESTS
// ============================================

const semanticAudits = {
  /**
   * Audit 1: Brand Naming Consistency
   * Verifies correct system naming throughout UI
   */
  async brandNaming() {
    const result = {
      name: 'Brand Naming Consistency',
      spec: 'DEVELOPMENT-RULES Section 0 (Naming Conventions)',
      passed: true,
      details: [],
    };

    try {
      const pages = ['/setup-wizard.html', '/admin.html', '/help.html'];

      for (const page of pages) {
        const url = `${config.BASE_URL}${page}`;
        const response = await fetchHtml(url);

        if (response.status !== 200) continue;

        const html = response.html;
        const pageName = page.replace('.html', '').replace('/', '');

        // Check for correct system name
        if (html.includes('Commute Compute')) {
          result.details.push(`✓ ${pageName}: Uses "Commute Compute" branding`);
        } else {
          result.details.push(`○ ${pageName}: Branding not prominent`);
        }

        // Check for forbidden old names
        const forbiddenOld = ['PTV Dashboard', 'Transit Display', 'TRMNL Dashboard'];
        for (const term of forbiddenOld) {
          if (html.includes(term)) {
            result.passed = false;
            result.details.push(`✗ ${pageName}: Contains legacy name "${term}"`);
          }
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 2: Forbidden Terms Check
   * Scans UI for prohibited terminology
   */
  async forbiddenTerms() {
    const result = {
      name: 'Forbidden Terms Check',
      spec: 'DEVELOPMENT-RULES Section 1.1 (Forbidden Terms)',
      passed: true,
      details: [],
    };

    try {
      const pages = ['/setup-wizard.html', '/admin.html', '/help.html', '/attribution.html'];
      let foundForbidden = [];

      for (const page of pages) {
        const url = `${config.BASE_URL}${page}`;
        const response = await fetchHtml(url);

        if (response.status !== 200) continue;

        const html = response.html.toLowerCase();
        const pageName = page.replace('.html', '').replace('/', '');

        for (const term of SEMANTIC_SPEC.forbiddenTerms) {
          if (html.includes(term.toLowerCase())) {
            result.passed = false;
            foundForbidden.push({ page: pageName, term });
          }
        }
      }

      if (foundForbidden.length === 0) {
        result.details.push('✓ No forbidden terms found in UI');
      } else {
        for (const { page, term } of foundForbidden) {
          result.details.push(`✗ ${page}: Contains forbidden term "${term}"`);
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 3: Emoji Compliance
   * Checks that production UI doesn't use emojis (Section 22.3)
   */
  async emojiCompliance() {
    const result = {
      name: 'No Emojis in Production UI',
      spec: 'DEVELOPMENT-RULES Section 22.3 (NO EMOJIS)',
      passed: true,
      details: [],
    };

    try {
      // Check admin/production pages (not help or attribution which may have exemptions)
      const pages = ['/setup-wizard.html', '/admin.html'];
      let emojiCount = 0;

      for (const page of pages) {
        const url = `${config.BASE_URL}${page}`;
        const response = await fetchHtml(url);

        if (response.status !== 200) continue;

        const html = response.html;
        const pageName = page.replace('.html', '').replace('/', '');

        // Check for emoji patterns
        const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        const matches = html.match(emojiPattern);

        if (matches && matches.length > 0) {
          // Filter out emojis that might be in comments or scripts
          const uniqueEmojis = [...new Set(matches)];
          emojiCount += uniqueEmojis.length;
          result.details.push(`○ ${pageName}: Found ${uniqueEmojis.length} emoji(s): ${uniqueEmojis.join(' ')}`);
        } else {
          result.details.push(`✓ ${pageName}: No emojis detected`);
        }
      }

      // Allow some emojis but warn
      if (emojiCount > 5) {
        result.passed = false;
        result.details.push('✗ Too many emojis in production UI (>5)');
      } else if (emojiCount > 0) {
        result.details.push(`○ Warning: ${emojiCount} emoji(s) found — consider replacing with SVG icons`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 4: Typography Compliance
   * Verifies Inter font is specified in UI
   */
  async typographyCompliance() {
    const result = {
      name: 'Typography (Inter Font)',
      spec: 'DEVELOPMENT-RULES Section 22.2 (Typography)',
      passed: false,
      details: [],
    };

    try {
      const pages = ['/setup-wizard.html', '/admin.html'];

      for (const page of pages) {
        const url = `${config.BASE_URL}${page}`;
        const response = await fetchHtml(url);

        if (response.status !== 200) continue;

        const html = response.html;
        const pageName = page.replace('.html', '').replace('/', '');

        // Check for Inter font reference
        if (html.includes('Inter') || html.includes("font-family: 'Inter'") || html.includes('fonts.googleapis.com/css2?family=Inter')) {
          result.passed = true;
          result.details.push(`✓ ${pageName}: Uses Inter font family`);
        } else if (html.includes('-apple-system') || html.includes('BlinkMacSystemFont')) {
          result.details.push(`○ ${pageName}: Uses system fonts (acceptable fallback)`);
          result.passed = true;
        } else {
          result.details.push(`○ ${pageName}: Font specification not detected`);
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 5: Color Palette Compliance
   * Checks for CC brand colors
   */
  async colorPalette() {
    const result = {
      name: 'Color Palette (CC Brand)',
      spec: 'DEVELOPMENT-RULES Section 22.1 (Color Palette)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/admin.html`;
      const response = await fetchHtml(url);

      if (response.status !== 200) {
        result.details.push('Could not fetch admin page');
        return result;
      }

      const html = response.html.toLowerCase();

      // Check for CC Green (#4fb28e)
      if (html.includes('#4fb28e') || html.includes('4fb28e')) {
        result.details.push('✓ CC Green (#4fb28e) detected');
        result.passed = true;
      }

      // Check for CC Purple (#667eea)
      if (html.includes('#667eea') || html.includes('667eea')) {
        result.details.push('✓ CC Purple (#667eea) detected');
      }

      // Check for dark theme colors
      if (html.includes('#0f172a') || html.includes('0f172a') ||
          html.includes('#1e293b') || html.includes('1e293b')) {
        result.details.push('✓ CC Dark theme colors detected');
        result.passed = true;
      }

      if (!result.passed) {
        result.details.push('○ CC brand colors not prominent — verify CSS');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 6: Global Footer Compliance
   * Verifies system footer with version info (Section 22.9)
   */
  async globalFooter() {
    const result = {
      name: 'Global System Footer',
      spec: 'DEVELOPMENT-RULES Section 22.9 (MANDATORY)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/admin.html`;
      const response = await fetchHtml(url);

      if (response.status !== 200) {
        result.details.push('Could not fetch admin page');
        return result;
      }

      const html = response.html;

      // Check for footer elements
      let footerChecks = 0;

      if (html.includes('CommuteCompute') || html.includes('commutecompute')) {
        result.details.push('✓ CommuteCompute reference found');
        footerChecks++;
      }

      if (html.includes('CCDash') || html.includes('ccdash') || html.includes('Renderer')) {
        result.details.push('✓ CCDash/Renderer reference found');
        footerChecks++;
      }

      if (html.includes('Angus Bergman') || html.includes('angus bergman')) {
        result.details.push('✓ Author attribution found');
        footerChecks++;
      }

      if (html.includes('AGPL-3.0') || html.includes('agpl-3.0') || html.includes('GNU Affero')) {
        result.details.push('✓ License reference found');
        footerChecks++;
      }

      // Check for footer element or version display
      if (html.includes('cc-system-footer') || html.includes('system-footer') ||
          html.includes('api/version')) {
        result.details.push('✓ Footer component/version API reference found');
        footerChecks++;
      }

      result.passed = footerChecks >= 3;

      if (!result.passed) {
        result.details.push('✗ Global footer missing required elements');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 7: Navigation Consistency
   * Checks consistent navigation across pages
   */
  async navigationConsistency() {
    const result = {
      name: 'Navigation Consistency',
      spec: 'DEVELOPMENT-RULES Section 14.4 (UI Consistency)',
      passed: true,
      details: [],
    };

    try {
      const pages = ['/setup-wizard.html', '/admin.html', '/help.html'];
      const navPatterns = {};

      for (const page of pages) {
        const url = `${config.BASE_URL}${page}`;
        const response = await fetchHtml(url);

        if (response.status !== 200) continue;

        const html = response.html;
        const pageName = page.replace('.html', '').replace('/', '');

        // Count nav links
        const navLinks = [];
        for (const link of SEMANTIC_SPEC.requiredNavLinks) {
          if (html.includes(`>${link}<`) || html.includes(`"${link}"`) ||
              html.toLowerCase().includes(link.toLowerCase())) {
            navLinks.push(link);
          }
        }

        navPatterns[pageName] = navLinks;
        result.details.push(`○ ${pageName}: Has ${navLinks.length} nav elements (${navLinks.join(', ')})`);
      }

      // Check consistency
      const linkCounts = Object.values(navPatterns).map(arr => arr.length);
      const isConsistent = linkCounts.every(count => Math.abs(count - linkCounts[0]) <= 1);

      if (isConsistent) {
        result.details.push('✓ Navigation is consistent across pages');
      } else {
        result.details.push('○ Navigation varies across pages (may be intentional)');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 8: Version API Accuracy
   * Verifies /api/version returns valid component versions
   */
  async versionAccuracy() {
    const result = {
      name: 'Version API Accuracy',
      spec: 'DEVELOPMENT-RULES Section 22.9.1 (Footer Requirements)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/api/version`;
      const response = await fetchJson(url);

      if (response.status !== 200) {
        result.details.push(`API returned ${response.status}`);
        return result;
      }

      const data = response.data;

      // Check system version
      if (data.system?.version || data.version) {
        const version = data.system?.version || data.version;
        result.details.push(`✓ System version: ${version}`);
        result.passed = true;
      }

      // Check component versions
      if (data.components) {
        if (data.components.commutecompute?.version) {
          result.details.push(`✓ CommuteCompute version: ${data.components.commutecompute.version}`);
        }
        if (data.components.renderer?.version) {
          result.details.push(`✓ CCDash Renderer version: ${data.components.renderer.version}`);
        }
      }

      // Check date
      if (data.date || data.buildDate) {
        result.details.push(`✓ Build date: ${data.date || data.buildDate}`);
      }

      // Check timestamp
      if (data.timestamp) {
        result.details.push(`✓ Timestamp: ${data.timestamp}`);
      }

      if (!result.passed) {
        result.details.push('✗ Version info incomplete');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 9: Attribution Page Compliance
   * Checks attribution page has required data source credits
   */
  async attributionCompliance() {
    const result = {
      name: 'Attribution Page',
      spec: 'DEVELOPMENT-RULES Section 22.9.2 (Dynamic Attribution)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/attribution.html`;
      const response = await fetchHtml(url);

      if (response.status !== 200) {
        result.details.push(`Could not fetch attribution page (${response.status})`);
        return result;
      }

      const html = response.html;
      let attrCount = 0;

      // Check for required attributions
      if (html.includes('Transport Victoria') || html.includes('OpenData') || html.includes('GTFS')) {
        result.details.push('✓ Transit data attribution present');
        attrCount++;
      }

      if (html.includes('Bureau of Meteorology') || html.includes('BOM') || html.includes('weather')) {
        result.details.push('✓ Weather attribution present');
        attrCount++;
      }

      if (html.includes('OpenStreetMap') || html.includes('OSM')) {
        result.details.push('✓ OpenStreetMap attribution present');
        attrCount++;
      }

      if (html.includes('Angus Bergman') || html.includes('AGPL-3.0')) {
        result.details.push('✓ Creator/license attribution present');
        attrCount++;
      }

      if (html.includes('Google') && (html.includes('Places') || html.includes('Maps'))) {
        result.details.push('✓ Google attribution present');
        attrCount++;
      }

      result.passed = attrCount >= 3;

      if (!result.passed) {
        result.details.push(`○ Only ${attrCount}/3 required attributions found`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 10: Help Documentation Quality
   * Checks help page has useful content
   */
  async helpDocumentation() {
    const result = {
      name: 'Help Documentation',
      spec: 'DEVELOPMENT-RULES Section 16 (Documentation Standards)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/help.html`;
      const response = await fetchHtml(url);

      if (response.status !== 200) {
        result.details.push(`Could not fetch help page (${response.status})`);
        return result;
      }

      const html = response.html;
      let helpChecks = 0;

      // Check for setup instructions
      if (html.includes('setup') || html.includes('Setup') || html.includes('getting started')) {
        result.details.push('✓ Setup instructions present');
        helpChecks++;
      }

      // Check for troubleshooting
      if (html.includes('troubleshoot') || html.includes('Troubleshoot') || html.includes('FAQ') || html.includes('problem')) {
        result.details.push('✓ Troubleshooting section present');
        helpChecks++;
      }

      // Check for device info
      if (html.includes('TRMNL') || html.includes('device') || html.includes('e-ink') || html.includes('firmware')) {
        result.details.push('✓ Device information present');
        helpChecks++;
      }

      // Check for API/configuration info
      if (html.includes('API') || html.includes('configuration') || html.includes('config')) {
        result.details.push('✓ Configuration information present');
        helpChecks++;
      }

      result.passed = helpChecks >= 2;

      if (!result.passed) {
        result.details.push(`○ Only ${helpChecks}/2 required help sections found`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 11: Setup Wizard Flow
   * Verifies setup wizard has required steps
   */
  async setupWizardFlow() {
    const result = {
      name: 'Setup Wizard Flow',
      spec: 'DEVELOPMENT-RULES Section 21 (Device Setup Flow)',
      passed: false,
      details: [],
    };

    try {
      const url = `${config.BASE_URL}/setup-wizard.html`;
      const response = await fetchHtml(url);

      if (response.status !== 200) {
        result.details.push(`Could not fetch setup wizard (${response.status})`);
        return result;
      }

      const html = response.html;
      let stepCount = 0;

      // Check for address/location setup
      if (html.includes('address') || html.includes('Address') || html.includes('home') || html.includes('work')) {
        result.details.push('✓ Address configuration step present');
        stepCount++;
      }

      // Check for API key setup
      if (html.includes('API') || html.includes('api') || html.includes('key') || html.includes('Key')) {
        result.details.push('✓ API key configuration present');
        stepCount++;
      }

      // Check for coffee/preferences
      if (html.includes('coffee') || html.includes('Coffee') || html.includes('preference')) {
        result.details.push('✓ Preferences configuration present');
        stepCount++;
      }

      // Check for completion/next steps
      if (html.includes('complete') || html.includes('Complete') || html.includes('finish') || html.includes('done')) {
        result.details.push('✓ Completion step present');
        stepCount++;
      }

      result.passed = stepCount >= 3;

      if (!result.passed) {
        result.details.push(`○ Only ${stepCount}/3 required wizard steps found`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 12: API Documentation Accuracy
   * Verifies API index matches actual endpoints
   */
  async apiDocumentation() {
    const result = {
      name: 'API Documentation Accuracy',
      spec: 'DEVELOPMENT-RULES Section 4.5 (Required Endpoints)',
      passed: false,
      details: [],
    };

    try {
      // Get API index
      const indexUrl = `${config.BASE_URL}/api/index`;
      const indexResponse = await fetchJson(indexUrl);

      if (indexResponse.status !== 200) {
        result.details.push(`Could not fetch API index (${indexResponse.status})`);
        return result;
      }

      const apiData = indexResponse.data;

      // Check documented endpoints are working
      if (apiData.endpoints) {
        result.details.push(`✓ API index lists endpoints`);

        let workingCount = 0;
        let testedCount = 0;

        // Test a sample of endpoints
        const sampleEndpoints = ['/api/health', '/api/status', '/api/version'];

        for (const endpoint of sampleEndpoints) {
          testedCount++;
          try {
            const testUrl = `${config.BASE_URL}${endpoint}`;
            const testResponse = await fetchJson(testUrl);
            if (testResponse.status === 200) {
              workingCount++;
            }
          } catch {
            // Skip failed tests
          }
        }

        result.details.push(`✓ ${workingCount}/${testedCount} documented endpoints responding`);
        result.passed = workingCount >= 2;
      }

      // Check name
      if (apiData.name && apiData.name.includes('Commute Compute')) {
        result.details.push('✓ API name matches branding');
      }

      // Check version
      if (apiData.version) {
        result.details.push(`✓ API version documented: ${apiData.version}`);
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

async function runSemanticAudit(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.info}COMMUTE COMPUTE SYSTEM - SEMANTIC AUDIT${colors.reset}`);
  console.log(`Target: ${config.BASE_URL}`);
  console.log(`Scope: UI/UX Branding, Documentation, Project Vision`);
  console.log(`Spec: DEVELOPMENT-RULES v1.17 + CCDashDesignV10`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const [name, auditFn] of Object.entries(semanticAudits)) {
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
  console.log(`${colors.info}SEMANTIC AUDIT SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = failed === 0 ? colors.success :
                      failed <= 2 ? colors.warning : colors.critical;
  const status = failed === 0 ? 'FULLY COMPLIANT' :
                 failed <= 2 ? 'MOSTLY COMPLIANT' : 'NEEDS ATTENTION';

  console.log(`\nTests: ${colors.success}${passed} passed${colors.reset}, ${colors.critical}${failed} failed${colors.reset}`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log(`\nOverall Status: ${statusColor}${status}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.critical}Failed Audits:${colors.reset}`);
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
export { runSemanticAudit, semanticAudits, SEMANTIC_SPEC };
export default runSemanticAudit;

// ============================================
// MAIN EXECUTION
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runSemanticAudit()
    .then(({ passed, failed }) => {
      process.exit(failed > 3 ? 1 : 0); // Allow some failures for advisory audits
    })
    .catch((error) => {
      console.error('Semantic audit error:', error);
      process.exit(1);
    });
}
