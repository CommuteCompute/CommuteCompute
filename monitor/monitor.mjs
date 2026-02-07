#!/usr/bin/env node
/**
 * Commute Compute System™ - Continuous Endpoint Monitor
 * Cycles through all API endpoints, pages, hyperlinks, and data flows
 * Provides real-time failure detection and resolution recommendations
 *
 * Usage:
 *   node monitor/monitor.mjs                    # Run once
 *   node monitor/monitor.mjs --continuous       # Run continuously
 *   node monitor/monitor.mjs --watch            # Watch mode with live updates
 *   node monitor/monitor.mjs --report           # Generate full report
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import config from './config.mjs';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';

// State tracking
const state = {
  results: new Map(),
  failureCounts: new Map(),
  lastCheck: new Map(),
  startTime: Date.now(),
  totalChecks: 0,
  totalFailures: 0,
  isRunning: false,
};

// Colors for console output
const { colors } = config.alerts;

/**
 * Make an HTTP/HTTPS request with timeout and retry
 */
async function makeRequest(urlString, options = {}) {
  const url = new URL(urlString);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const bodyString = options.body ? JSON.stringify(options.body) : null;

  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: {
      'User-Agent': 'CCDash-Monitor/1.0',
      ...(bodyString ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyString) } : {}),
      ...options.headers,
    },
    timeout: config.timeout,
  };

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = lib.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          responseTime: Date.now() - startTime,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyString) {
      req.write(bodyString);
    }

    req.end();
  });
}

/**
 * Check a single API endpoint
 */
async function checkEndpoint(name, endpoint) {
  const url = `${config.BASE_URL}${endpoint.path}`;
  let queryString = '';

  // Add query params if specified
  if (endpoint.queryParams) {
    queryString = '?' + new URLSearchParams(endpoint.queryParams).toString();
  }

  // Add token if required
  if (endpoint.requiresToken && config.SAMPLE_CONFIG_TOKEN) {
    queryString += (queryString ? '&' : '?') + `token=${config.SAMPLE_CONFIG_TOKEN}`;
  }

  const fullUrl = url + queryString;
  const result = {
    name,
    url: fullUrl,
    priority: endpoint.priority,
    description: endpoint.description,
    timestamp: new Date().toISOString(),
    success: false,
    error: null,
    status: null,
    responseTime: null,
    recommendation: null,
  };

  try {
    const response = await makeRequest(fullUrl, {
      method: endpoint.method,
      body: endpoint.body,
      headers: endpoint.headers,
    });

    result.status = response.status;
    result.responseTime = response.responseTime;

    // Check expected status
    const expectedStatuses = Array.isArray(endpoint.expectedStatus)
      ? endpoint.expectedStatus
      : [endpoint.expectedStatus];

    if (expectedStatuses.includes(response.status)) {
      result.success = true;

      // Check content type if specified
      if (endpoint.expectedContentType) {
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes(endpoint.expectedContentType)) {
          result.success = false;
          result.error = `Unexpected content type: ${contentType}`;
        }
      }
    } else {
      result.error = `Unexpected status: ${response.status}`;
    }

    // Check response time threshold
    if (response.responseTime > config.alerts.thresholds.responseTimeMs) {
      result.warning = `Slow response: ${response.responseTime}ms`;
    }

  } catch (error) {
    result.error = error.message;
  }

  // Add resolution guide on failure
  if (!result.success) {
    result.recommendation = endpoint.resolutionGuide;
  }

  return result;
}

/**
 * Check a single HTML page
 */
async function checkPage(name, page) {
  const url = `${config.BASE_URL}${page.path}`;
  const result = {
    name,
    url,
    description: page.description,
    timestamp: new Date().toISOString(),
    success: false,
    error: null,
    status: null,
    responseTime: null,
    elementsFound: [],
    elementsMissing: [],
    recommendation: null,
  };

  try {
    const response = await makeRequest(url);
    result.status = response.status;
    result.responseTime = response.responseTime;

    // Check expected status (default: 200)
    const expectedStatuses = page.expectedStatus
      ? (Array.isArray(page.expectedStatus) ? page.expectedStatus : [page.expectedStatus])
      : [200];

    if (expectedStatuses.includes(response.status)) {
      result.success = true;

      // Check for expected elements (only if we got content, not a redirect)
      if (page.expectedElements && page.expectedElements.length > 0 && response.status === 200) {
        for (const element of page.expectedElements) {
          if (response.body.toLowerCase().includes(element.toLowerCase())) {
            result.elementsFound.push(element);
          } else {
            result.elementsMissing.push(element);
          }
        }

        if (result.elementsMissing.length > 0) {
          result.warning = `Missing expected content: ${result.elementsMissing.join(', ')}`;
        }
      }
    } else {
      result.error = `HTTP ${response.status}`;
    }

  } catch (error) {
    result.error = error.message;
  }

  if (!result.success) {
    result.recommendation = page.resolutionGuide;
  }

  return result;
}

/**
 * Check an external API
 */
async function checkExternalApi(name, api) {
  const result = {
    name,
    url: api.url,
    description: api.description,
    timestamp: new Date().toISOString(),
    success: false,
    error: null,
    status: null,
    responseTime: null,
    recommendation: null,
    optional: api.optional || false,
  };

  // Skip if requires API key and none configured
  if (api.requiresApiKey) {
    result.skipped = true;
    result.skipReason = 'Requires API key - check manually or configure';
    return result;
  }

  try {
    const response = await makeRequest(api.url, {
      method: api.method,
    });

    result.status = response.status;
    result.responseTime = response.responseTime;
    result.success = response.status >= 200 && response.status < 400;

    if (!result.success) {
      result.error = `HTTP ${response.status}`;
    }

  } catch (error) {
    result.error = error.message;
    // For optional external APIs, treat timeouts as warnings not failures
    if (api.optional) {
      result.warning = result.error;
      result.error = null;
      result.success = true; // Don't count optional timeouts as failures
      result.optionalFailed = true;
    }
  }

  if (!result.success) {
    result.recommendation = api.resolutionGuide;
  }

  return result;
}

/**
 * Check a hyperlink
 */
async function checkHyperlink(link) {
  const fullUrl = link.href.startsWith('http')
    ? link.href
    : `${config.BASE_URL}${link.href}`;

  const result = {
    page: link.page,
    text: link.text,
    href: link.href,
    fullUrl,
    timestamp: new Date().toISOString(),
    success: false,
    error: null,
    status: null,
  };

  try {
    const response = await makeRequest(fullUrl);
    result.status = response.status;
    result.success = response.status >= 200 && response.status < 400;

    if (!result.success) {
      result.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Check a data flow sequence
 */
async function checkDataFlow(name, flow) {
  const result = {
    name,
    description: flow.description,
    timestamp: new Date().toISOString(),
    success: true,
    steps: [],
    recommendation: null,
  };

  for (const path of flow.checkSequence) {
    const endpoint = Object.values(config.apiEndpoints).find(e => e.path === path);
    if (endpoint) {
      const stepResult = await checkEndpoint(path, endpoint);
      result.steps.push(stepResult);

      if (!stepResult.success) {
        result.success = false;
        result.failedAt = path;
        break;
      }
    }
  }

  if (!result.success) {
    result.recommendation = flow.resolutionGuide;
  }

  return result;
}

/**
 * Print a single result
 */
function printResult(result, type) {
  const statusIcon = result.success ? '✓' : '✗';
  const statusColor = result.success ? colors.success : colors.critical;

  if (result.skipped) {
    console.log(`${colors.info}○ [${type}] ${result.name}: SKIPPED - ${result.skipReason}${colors.reset}`);
    return;
  }

  console.log(`${statusColor}${statusIcon} [${type}] ${result.name}${colors.reset}`);
  console.log(`  URL: ${result.url}`);
  console.log(`  Status: ${result.status || 'N/A'} | Time: ${result.responseTime || 'N/A'}ms`);

  if (result.error) {
    console.log(`  ${colors.critical}Error: ${result.error}${colors.reset}`);
  }

  if (result.warning) {
    console.log(`  ${colors.warning}Warning: ${result.warning}${colors.reset}`);
  }

  if (!result.success && result.recommendation) {
    console.log(`\n${colors.info}═══ RESOLUTION GUIDE ═══${colors.reset}`);
    console.log(result.recommendation);
    console.log(`${colors.info}═════════════════════════${colors.reset}\n`);
  }
}

/**
 * Print a summary of all results
 */
function printSummary(allResults) {
  console.log('\n' + '═'.repeat(60));
  console.log(`${colors.info}MONITORING SUMMARY${colors.reset}`);
  console.log('═'.repeat(60));

  const categories = {
    'API Endpoints': allResults.api,
    'HTML Pages': allResults.pages,
    'External APIs': allResults.external,
    'Hyperlinks': allResults.hyperlinks,
    'Data Flows': allResults.dataFlows,
  };

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [category, results] of Object.entries(categories)) {
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;

    totalSuccess += success;
    totalFailed += failed;
    totalSkipped += skipped;

    const statusColor = failed > 0 ? colors.critical : colors.success;
    console.log(`\n${category}:`);
    console.log(`  ${statusColor}${success}/${results.length - skipped} passing${colors.reset}` +
      (skipped > 0 ? ` (${skipped} skipped)` : ''));

    // List failures
    const failures = results.filter(r => !r.success && !r.skipped);
    if (failures.length > 0) {
      console.log(`  ${colors.critical}Failures:${colors.reset}`);
      for (const f of failures) {
        console.log(`    - ${f.name || f.text}: ${f.error}`);
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`TOTAL: ${colors.success}${totalSuccess} passed${colors.reset}, ` +
    `${colors.critical}${totalFailed} failed${colors.reset}, ` +
    `${colors.info}${totalSkipped} skipped${colors.reset}`);

  const overallStatus = totalFailed === 0 ? 'HEALTHY' : 'DEGRADED';
  const overallColor = totalFailed === 0 ? colors.success : colors.critical;
  console.log(`\nOverall Status: ${overallColor}${overallStatus}${colors.reset}`);
  console.log('═'.repeat(60) + '\n');

  return { totalSuccess, totalFailed, totalSkipped };
}

/**
 * Run all checks once
 */
async function runAllChecks(verbose = true) {
  if (verbose) {
    console.log('\n' + '═'.repeat(60));
    console.log(`${colors.info}COMMUTE COMPUTE SYSTEM™ - ENDPOINT MONITOR${colors.reset}`);
    console.log(`Target: ${config.BASE_URL}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('═'.repeat(60) + '\n');
  }

  const allResults = {
    api: [],
    pages: [],
    external: [],
    hyperlinks: [],
    dataFlows: [],
  };

  // Check API endpoints
  if (verbose) console.log(`\n${colors.info}━━━ API ENDPOINTS ━━━${colors.reset}\n`);
  for (const [name, endpoint] of Object.entries(config.apiEndpoints)) {
    const result = await checkEndpoint(name, endpoint);
    allResults.api.push(result);
    if (verbose) printResult(result, 'API');
    state.totalChecks++;
    if (!result.success) state.totalFailures++;
  }

  // Check HTML pages
  if (verbose) console.log(`\n${colors.info}━━━ HTML PAGES ━━━${colors.reset}\n`);
  for (const [name, page] of Object.entries(config.pages)) {
    const result = await checkPage(name, page);
    allResults.pages.push(result);
    if (verbose) printResult(result, 'PAGE');
    state.totalChecks++;
    if (!result.success) state.totalFailures++;
  }

  // Check external APIs
  if (verbose) console.log(`\n${colors.info}━━━ EXTERNAL APIs ━━━${colors.reset}\n`);
  for (const [name, api] of Object.entries(config.externalApis)) {
    const result = await checkExternalApi(name, api);
    allResults.external.push(result);
    if (verbose) printResult(result, 'EXTERNAL');
    state.totalChecks++;
    if (!result.success && !result.skipped) state.totalFailures++;
  }

  // Check hyperlinks
  if (verbose) console.log(`\n${colors.info}━━━ HYPERLINKS ━━━${colors.reset}\n`);
  for (const link of config.hyperlinks) {
    const result = await checkHyperlink(link);
    allResults.hyperlinks.push(result);
    if (verbose) {
      const statusIcon = result.success ? '✓' : '✗';
      const statusColor = result.success ? colors.success : colors.critical;
      console.log(`${statusColor}${statusIcon} [LINK] "${link.text}" → ${link.href}${colors.reset}`);
      if (!result.success) {
        console.log(`  ${colors.critical}Error: ${result.error}${colors.reset}`);
      }
    }
    state.totalChecks++;
    if (!result.success) state.totalFailures++;
  }

  // Check data flows
  if (verbose) console.log(`\n${colors.info}━━━ DATA FLOWS ━━━${colors.reset}\n`);
  for (const [name, flow] of Object.entries(config.dataFlowChecks)) {
    const result = await checkDataFlow(name, flow);
    allResults.dataFlows.push(result);
    if (verbose) {
      const statusIcon = result.success ? '✓' : '✗';
      const statusColor = result.success ? colors.success : colors.critical;
      console.log(`${statusColor}${statusIcon} [FLOW] ${result.name}${colors.reset}`);
      if (!result.success) {
        console.log(`  ${colors.critical}Failed at: ${result.failedAt}${colors.reset}`);
        if (result.recommendation) {
          console.log(`\n${colors.info}═══ RESOLUTION GUIDE ═══${colors.reset}`);
          console.log(result.recommendation);
          console.log(`${colors.info}═════════════════════════${colors.reset}\n`);
        }
      }
    }
    state.totalChecks++;
    if (!result.success) state.totalFailures++;
  }

  // Print summary
  if (verbose) printSummary(allResults);

  return allResults;
}

/**
 * Continuous monitoring mode
 */
async function runContinuous() {
  console.log(`${colors.info}Starting continuous monitoring...${colors.reset}`);
  console.log(`Press Ctrl+C to stop\n`);

  state.isRunning = true;
  let iteration = 0;

  while (state.isRunning) {
    iteration++;
    console.log(`\n${'▓'.repeat(60)}`);
    console.log(`${colors.info}ITERATION ${iteration} - ${new Date().toISOString()}${colors.reset}`);
    console.log(`${'▓'.repeat(60)}`);

    await runAllChecks(true);

    // Wait before next iteration
    const waitTime = config.intervals.critical;
    console.log(`\n${colors.info}Next check in ${waitTime / 1000} seconds...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

/**
 * Watch mode with compact output
 */
async function runWatch() {
  console.log(`${colors.info}Starting watch mode (compact output)...${colors.reset}`);
  console.log(`Press Ctrl+C to stop\n`);

  state.isRunning = true;

  while (state.isRunning) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const results = await runAllChecks(false);

    // Compact single-line status
    const apiOk = results.api.filter(r => r.success).length;
    const apiTotal = results.api.length;
    const pagesOk = results.pages.filter(r => r.success).length;
    const pagesTotal = results.pages.length;
    const linksOk = results.hyperlinks.filter(r => r.success).length;
    const linksTotal = results.hyperlinks.length;
    const flowsOk = results.dataFlows.filter(r => r.success).length;
    const flowsTotal = results.dataFlows.length;

    const allOk = apiOk === apiTotal && pagesOk === pagesTotal &&
      linksOk === linksTotal && flowsOk === flowsTotal;

    const statusColor = allOk ? colors.success : colors.critical;
    const status = allOk ? '✓ HEALTHY' : '✗ ISSUES';

    process.stdout.write(`\r${timestamp} | ${statusColor}${status}${colors.reset} | ` +
      `API: ${apiOk}/${apiTotal} | Pages: ${pagesOk}/${pagesTotal} | ` +
      `Links: ${linksOk}/${linksTotal} | Flows: ${flowsOk}/${flowsTotal}    `);

    // Print details on failure
    if (!allOk) {
      console.log('\n');
      const failures = [
        ...results.api.filter(r => !r.success),
        ...results.pages.filter(r => !r.success),
        ...results.hyperlinks.filter(r => !r.success),
        ...results.dataFlows.filter(r => !r.success),
      ];

      for (const f of failures) {
        console.log(`${colors.critical}  ✗ ${f.name || f.text}: ${f.error}${colors.reset}`);
        if (f.recommendation) {
          console.log(`${colors.info}    Resolution: See full report for details${colors.reset}`);
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, config.intervals.critical));
  }
}

/**
 * Generate JSON report
 */
async function generateReport() {
  console.log(`${colors.info}Generating full monitoring report...${colors.reset}\n`);

  const results = await runAllChecks(true);

  const report = {
    generated: new Date().toISOString(),
    target: config.BASE_URL,
    summary: {
      api: {
        total: results.api.length,
        passed: results.api.filter(r => r.success).length,
        failed: results.api.filter(r => !r.success).length,
      },
      pages: {
        total: results.pages.length,
        passed: results.pages.filter(r => r.success).length,
        failed: results.pages.filter(r => !r.success).length,
      },
      external: {
        total: results.external.length,
        passed: results.external.filter(r => r.success).length,
        failed: results.external.filter(r => !r.success && !r.skipped).length,
        skipped: results.external.filter(r => r.skipped).length,
      },
      hyperlinks: {
        total: results.hyperlinks.length,
        passed: results.hyperlinks.filter(r => r.success).length,
        failed: results.hyperlinks.filter(r => !r.success).length,
      },
      dataFlows: {
        total: results.dataFlows.length,
        passed: results.dataFlows.filter(r => r.success).length,
        failed: results.dataFlows.filter(r => !r.success).length,
      },
    },
    results,
    failures: {
      api: results.api.filter(r => !r.success),
      pages: results.pages.filter(r => !r.success),
      external: results.external.filter(r => !r.success && !r.skipped),
      hyperlinks: results.hyperlinks.filter(r => !r.success),
      dataFlows: results.dataFlows.filter(r => !r.success),
    },
  };

  // Write report to file
  const reportDir = new URL('./reports/', import.meta.url).pathname;
  const reportPath = `${reportDir}report-${Date.now()}.json`;

  try {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n${colors.success}Report saved to: ${reportPath}${colors.reset}`);
  } catch (err) {
    console.log(`\n${colors.warning}Could not save report file: ${err.message}${colors.reset}`);
  }

  return report;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n\n${colors.info}Shutting down monitor...${colors.reset}`);
  state.isRunning = false;
  process.exit(0);
});

// Main entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--continuous') || args.includes('-c')) {
    await runContinuous();
  } else if (args.includes('--watch') || args.includes('-w')) {
    await runWatch();
  } else if (args.includes('--report') || args.includes('-r')) {
    await generateReport();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Commute Compute System™ - Endpoint Monitor

Usage:
  node monitor/monitor.mjs              Run once and exit
  node monitor/monitor.mjs --continuous Run continuously with full output
  node monitor/monitor.mjs --watch      Watch mode (compact single-line status)
  node monitor/monitor.mjs --report     Generate full JSON report
  node monitor/monitor.mjs --help       Show this help

Environment Variables:
  MONITOR_BASE_URL     Override target URL (default: http://localhost:3000)
  SAMPLE_CONFIG_TOKEN  Config token for testing authenticated endpoints

Examples:
  # Run single check
  node monitor/monitor.mjs

  # Continuous monitoring
  node monitor/monitor.mjs --continuous

  # Watch mode for terminal dashboard
  node monitor/monitor.mjs --watch

  # Generate report
  node monitor/monitor.mjs --report
`);
  } else {
    await runAllChecks(true);
  }
}

main().catch(err => {
  console.error(`${colors.critical}Fatal error: ${err.message}${colors.reset}`);
  process.exit(1);
});
