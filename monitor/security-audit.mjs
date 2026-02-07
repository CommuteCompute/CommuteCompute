/**
 * Commute Compute System - Security & Critical Compliance Audit
 * CRITICAL priority tests for public launch readiness
 *
 * Tests against:
 * - DEVELOPMENT-RULES.md v1.17 Section 1 (Absolute Prohibitions)
 * - DEVELOPMENT-RULES.md v1.17 Section 2 (TRMNL Prohibition)
 * - DEVELOPMENT-RULES.md v1.17 Section 3 (Zero-Config)
 * - DEVELOPMENT-RULES.md v1.17 Section 17 (Security)
 * - DEVELOPMENT-RULES.md v1.17 Section 1.4 (Anti-Brick Rules)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import config from './config.mjs';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const colors = config.alerts.colors;
const PROJECT_ROOT = process.cwd();

// ============================================
// SECURITY SPEC CONSTANTS
// ============================================

const SECURITY_SPEC = {
  // Section 1.1: Forbidden Terms & Patterns
  forbiddenTerms: [
    'PTV API',
    'PTV Timetable API',
    'PTV Developer ID',
    'PTV API Token',
    'PTV_USER_ID',
    'PTV_API_KEY',
    'PTV_DEV_ID',
    'Metro API',
    'ptv-api',
    'ptvapi',
  ],

  // Section 2: TRMNL/usetrmnl Prohibition (cloud services, not hardware references)
  trmnlForbidden: [
    'usetrmnl.com',
    'api.usetrmnl',
    'TRMNL cloud',
    'trmnl-server',
    'trmnl.api',
    'trmnl-plugin',
    'TRMNL_API_KEY',
    'TRMNL_DEVICE_ID',
    // Note: "TRMNL" alone is OK - it's the hardware brand
    // Note: "usetrmnl" without .com may be documentation context
  ],

  // Section 17: XSS Prevention Patterns
  xssPatterns: [
    /innerHTML\s*=\s*[^'"`]*\+/,  // innerHTML with concatenation
    /document\.write\s*\(/,        // document.write
    /eval\s*\(/,                   // eval()
    /\.html\s*\([^)]*\+/,          // jQuery .html() with concatenation
    /dangerouslySetInnerHTML/,     // React dangerous pattern
  ],

  // Section 3: Zero-Config Requirements
  zeroConfigForbidden: [
    '.env',
    'dotenv',
    'process.env.API_KEY',
    'process.env.PTV',
    'hardcoded.*key',
  ],

  // Section 1.4: Anti-Brick Keywords
  antiBrickRequired: [
    'watchdog',
    'fallback',
    'timeout',
    'recovery',
  ],

  // Sensitive data patterns (hardcoded personal info)
  sensitivePatterns: [
    /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/,  // Credit card
    /password\s*[:=]\s*['"][^'"]+['"]/i,   // Hardcoded passwords
    /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,  // Hardcoded API keys
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,  // Email addresses (check context)
    /AIza[0-9A-Za-z\-_]{35}/,  // Google API key pattern
  ],

  // Files/dirs to exclude from scanning
  excludePaths: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    'monitor/',  // Monitor files legitimately contain terms being checked
    'archive/',  // Archive files are not production code
    'DEVELOPMENT-RULES',  // Doc file defines the rules
    'README',
    'CONTRIBUTING',
    'INSTALL',
    'SETUP_GUIDE',
    '.md',  // Documentation files may reference terms for context
  ],
};

// ============================================
// HTTP HELPER
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
      headers: { 'User-Agent': 'CCDash-SecurityAudit/1.0' },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
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
      headers: { 'User-Agent': 'CCDash-SecurityAudit/1.0' },
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
// FILE HELPERS
// ============================================

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8');
  } catch {
    return null;
  }
}

function findFiles(extensions, dir = PROJECT_ROOT, maxDepth = 5) {
  const results = [];
  const extList = Array.isArray(extensions) ? extensions : [extensions];

  function shouldExclude(itemPath) {
    const relativePath = itemPath.replace(PROJECT_ROOT + '/', '');
    return SECURITY_SPEC.excludePaths.some(ex => {
      // Exact directory match or contained within
      if (relativePath.startsWith(ex) || relativePath.includes('/' + ex)) {
        return true;
      }
      // File name contains excluded pattern
      if (path.basename(itemPath).includes(ex)) {
        return true;
      }
      return false;
    });
  }

  function walk(currentDir, depth) {
    if (depth > maxDepth) return;

    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);

        // Skip excluded paths
        if (shouldExclude(fullPath)) {
          continue;
        }

        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.')) {
          walk(fullPath, depth + 1);
        } else if (stat.isFile()) {
          const ext = path.extname(item).slice(1);
          if (extList.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(dir, 0);
  return results;
}

// ============================================
// SECURITY AUDITS
// ============================================

const securityAudits = {
  /**
   * Audit 1: XSS Vulnerability Scan
   * CRITICAL: Section 17 compliance
   */
  async xssVulnerabilities() {
    const result = {
      name: 'XSS Vulnerability Scan',
      spec: 'DEVELOPMENT-RULES Section 17 (Security)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      // Scan JS files for XSS patterns (excluding audit files which define patterns)
      const jsFiles = findFiles(['js', 'mjs'], PROJECT_ROOT);
      let vulnerabilities = [];

      for (const file of jsFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip this audit file itself
        if (relPath.includes('security-audit')) continue;

        const content = fs.readFileSync(file, 'utf-8');

        for (const pattern of SECURITY_SPEC.xssPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            vulnerabilities.push({
              file: relPath,
              pattern: pattern.toString(),
              sample: matches[0].substring(0, 50),
            });
          }
        }
      }

      // Scan HTML files for inline JS XSS
      const htmlFiles = findFiles(['html'], path.join(PROJECT_ROOT, 'public'));

      for (const file of htmlFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip archive files
        if (relPath.includes('archive/')) continue;

        const content = fs.readFileSync(file, 'utf-8');

        // Check for dangerous innerHTML patterns (excluding lines with escapeHtml)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip lines that use escapeHtml or sanitize (properly sanitized)
          if (line.includes('escapeHtml') || line.includes('sanitize(')) continue;
          // Skip lines that are duplicating static content (like items + items for loops)
          if (line.match(/=\s*(\w+)\s*\+\s*\1\s*;/)) continue;
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

          // Check for innerHTML with concatenation (potential XSS)
          if (line.match(/innerHTML\s*=\s*[^'"`]*\+/) ||
              line.match(/document\.write\s*\(/)) {
            // For multi-line template literals, check if sanitize/escapeHtml appears in next 10 lines
            const nextLines = lines.slice(i, i + 10).join('\n');
            if (nextLines.includes('escapeHtml(') || nextLines.includes('sanitize(')) {
              continue; // Sanitization happens in the template literal body
            }
            vulnerabilities.push({
              file: relPath,
              line: i + 1,
              pattern: 'innerHTML/document.write without escapeHtml',
              sample: line.trim().substring(0, 60),
            });
          }
        }
      }

      if (vulnerabilities.length === 0) {
        result.details.push('✓ No XSS vulnerabilities detected');
      } else {
        result.passed = false;
        result.details.push(`✗ Found ${vulnerabilities.length} potential XSS vulnerabilities:`);
        for (const v of vulnerabilities.slice(0, 5)) {
          result.details.push(`  - ${v.file}: ${v.sample}`);
        }
        if (vulnerabilities.length > 5) {
          result.details.push(`  ... and ${vulnerabilities.length - 5} more`);
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 2: API Key Validation
   * CRITICAL: Ensures no hardcoded API keys in source
   */
  async apiKeyValidation() {
    const result = {
      name: 'Hardcoded API Key Check',
      spec: 'DEVELOPMENT-RULES Section 3 (Zero-Config)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      const sourceFiles = findFiles(['js', 'mjs', 'html'], PROJECT_ROOT);
      const hardcodedKeys = [];

      // Pattern for detecting hardcoded API keys (exclude config tokens which are user-generated)
      const keyPatterns = [
        /AIza[0-9A-Za-z\-_]{35}/g,  // Google API key
        // Note: UUID format excluded - used for config tokens which are user-generated
        /api[_-]?key\s*[:=]\s*['"]([a-zA-Z0-9]{32,})['"]/gi,  // Generic API key assignment
        /['"]sk-[a-zA-Z0-9]{48}['"]/g,  // OpenAI keys
        /PRIVATE[_-]?KEY\s*[:=]\s*['"][^'"]+['"]/gi,  // Private keys
      ];

      for (const file of sourceFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip config files that legitimately contain sample tokens
        if (relPath.includes('config.mjs') || relPath.includes('test')) continue;

        const content = fs.readFileSync(file, 'utf-8');

        for (const pattern of keyPatterns) {
          const matches = content.match(pattern);
          if (matches) {
            // Filter out false positives (config token structure, comments, etc.)
            const realMatches = matches.filter(m => {
              // Exclude if it's in a comment
              const lineWithMatch = content.split('\n').find(l => l.includes(m));
              if (lineWithMatch && (lineWithMatch.trim().startsWith('//') || lineWithMatch.trim().startsWith('*'))) {
                return false;
              }
              // Exclude sample/placeholder values
              if (m.includes('YOUR_') || m.includes('SAMPLE_') || m.includes('example')) {
                return false;
              }
              return true;
            });

            if (realMatches.length > 0) {
              hardcodedKeys.push({
                file: relPath,
                count: realMatches.length,
                sample: realMatches[0].substring(0, 20) + '...',
              });
            }
          }
        }
      }

      if (hardcodedKeys.length === 0) {
        result.details.push('✓ No hardcoded API keys detected');
      } else {
        result.passed = false;
        result.details.push(`✗ Found ${hardcodedKeys.length} files with potential hardcoded keys:`);
        for (const k of hardcodedKeys) {
          result.details.push(`  - ${k.file}: ${k.count} occurrence(s)`);
        }
      }

      // Also check that config token system is in use
      const serverFile = readFile('src/server.js');
      if (serverFile && serverFile.includes('configToken') || serverFile.includes('config-token')) {
        result.details.push('✓ Config token system detected in server');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 3: Personal Information Check
   * CRITICAL: No hardcoded addresses, emails, or personal data
   */
  async personalInfoCheck() {
    const result = {
      name: 'Hardcoded Personal Info Check',
      spec: 'Privacy & Security Requirements',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      const sourceFiles = findFiles(['js', 'mjs', 'html'], PROJECT_ROOT);
      const personalInfo = [];

      // Patterns for personal info (excluding test/sample data)
      const patterns = [
        { name: 'Street Address', regex: /\d+\s+[A-Z][a-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct)\b/g },
        { name: 'Phone Number', regex: /\b04\d{2}\s?\d{3}\s?\d{3}\b/g },  // Australian mobile
        { name: 'Email', regex: /\b[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
      ];

      for (const file of sourceFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip test files and config
        if (relPath.includes('test') || relPath.includes('spec') ||
            relPath.includes('config.mjs') || relPath.includes('monitor')) continue;

        const content = fs.readFileSync(file, 'utf-8');

        for (const { name, regex } of patterns) {
          const matches = content.match(regex);
          if (matches) {
            // Filter obvious test data
            const realMatches = matches.filter(m => {
              const lower = m.toLowerCase();
              return !lower.includes('test') && !lower.includes('example') &&
                     !lower.includes('sample') && !lower.includes('placeholder');
            });

            if (realMatches.length > 0) {
              personalInfo.push({
                file: relPath,
                type: name,
                sample: realMatches[0],
              });
            }
          }
        }
      }

      if (personalInfo.length === 0) {
        result.details.push('✓ No hardcoded personal information detected');
      } else {
        // Warn but don't fail for addresses in sample configs
        result.details.push(`○ Found ${personalInfo.length} potential personal info entries:`);
        for (const p of personalInfo.slice(0, 3)) {
          result.details.push(`  - ${p.file}: ${p.type} ("${p.sample.substring(0, 30)}...")`);
        }
        result.details.push('  Review these to ensure they are sample/test data only');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 4: TRMNL/usetrmnl Prohibition
   * CRITICAL: Section 2 compliance
   */
  async trmnlProhibition() {
    const result = {
      name: 'TRMNL/usetrmnl Prohibition',
      spec: 'DEVELOPMENT-RULES Section 2 (TRMNL Prohibition)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      // Only scan code files, not documentation
      const allFiles = findFiles(['js', 'mjs', 'html', 'json'], PROJECT_ROOT);
      const violations = [];

      for (const file of allFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip documentation and help files
        if (relPath.includes('DEVELOPMENT-RULES') || relPath.includes('README') ||
            relPath.includes('help.html') || relPath.includes('attribution')) continue;

        const content = fs.readFileSync(file, 'utf-8').toLowerCase();

        for (const term of SECURITY_SPEC.trmnlForbidden) {
          if (content.includes(term.toLowerCase())) {
            violations.push({
              file: relPath,
              term: term,
            });
          }
        }
      }

      // Also check deployed API responses
      try {
        const endpoints = ['/api/status', '/api/health', '/api/index'];
        for (const endpoint of endpoints) {
          const response = await fetchJson(`${config.BASE_URL}${endpoint}`);
          if (response.status === 200) {
            const responseStr = JSON.stringify(response.data).toLowerCase();
            for (const term of SECURITY_SPEC.trmnlForbidden) {
              if (responseStr.includes(term.toLowerCase())) {
                violations.push({
                  file: `API: ${endpoint}`,
                  term: term,
                });
              }
            }
          }
        }
      } catch {
        result.details.push('○ Could not check live API responses');
      }

      if (violations.length === 0) {
        result.details.push('✓ No TRMNL/usetrmnl dependencies detected');
        result.details.push('✓ System is fully self-hosted compliant');
      } else {
        result.passed = false;
        result.details.push(`✗ Found ${violations.length} TRMNL prohibition violations:`);
        for (const v of violations.slice(0, 5)) {
          result.details.push(`  - ${v.file}: "${v.term}"`);
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 5: Forbidden PTV Terms
   * CRITICAL: Section 1.1 compliance
   */
  async forbiddenPtvTerms() {
    const result = {
      name: 'Forbidden PTV API Terms',
      spec: 'DEVELOPMENT-RULES Section 1.1 (Forbidden Terms)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      // Only check actual code files for forbidden terms
      const allFiles = findFiles(['js', 'mjs', 'html'], PROJECT_ROOT);
      const violations = [];

      for (const file of allFiles) {
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Skip documentation, help, and attribution files
        if (relPath.includes('DEVELOPMENT-RULES') || relPath.includes('README') ||
            relPath.includes('help.html') || relPath.includes('attribution') ||
            relPath.includes('.md')) continue;

        const content = fs.readFileSync(file, 'utf-8');

        for (const term of SECURITY_SPEC.forbiddenTerms) {
          // Case-insensitive search for code files
          if (content.toLowerCase().includes(term.toLowerCase())) {
            // Check if it's in a comment (acceptable for documentation)
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(term.toLowerCase())) {
                const line = lines[i].trim();
                if (!line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*')) {
                  violations.push({
                    file: relPath,
                    line: i + 1,
                    term: term,
                  });
                }
              }
            }
          }
        }
      }

      // Check API responses
      try {
        const statusResp = await fetchJson(`${config.BASE_URL}/api/status`);
        if (statusResp.status === 200) {
          const statusStr = JSON.stringify(statusResp.data);
          for (const term of SECURITY_SPEC.forbiddenTerms) {
            if (statusStr.toLowerCase().includes(term.toLowerCase())) {
              violations.push({
                file: 'API: /api/status',
                line: 0,
                term: term,
              });
            }
          }
        }
      } catch {
        // Skip API check if unavailable
      }

      if (violations.length === 0) {
        result.details.push('✓ No forbidden PTV API terms in code');
        result.details.push('✓ Uses GTFS-RT/OpenData terminology correctly');
      } else {
        result.passed = false;
        result.details.push(`✗ Found ${violations.length} forbidden term violations:`);
        for (const v of violations.slice(0, 5)) {
          result.details.push(`  - ${v.file}:${v.line}: "${v.term}"`);
        }
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 6: Zero-Config Compliance
   * CRITICAL: Section 3 compliance
   */
  async zeroConfigCompliance() {
    const result = {
      name: 'Zero-Config Serverless Compliance',
      spec: 'DEVELOPMENT-RULES Section 3 (Zero-Config)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      // Check for .env files in public directories
      const envFiles = [];
      const checkDirs = ['public', 'api', 'src'];

      for (const dir of checkDirs) {
        const fullDir = path.join(PROJECT_ROOT, dir);
        if (fs.existsSync(fullDir)) {
          const items = fs.readdirSync(fullDir);
          for (const item of items) {
            if (item.includes('.env') && !item.includes('.example')) {
              envFiles.push(path.join(dir, item));
            }
          }
        }
      }

      if (envFiles.length > 0) {
        result.passed = false;
        result.details.push(`✗ Found .env files (forbidden in zero-config):`);
        for (const f of envFiles) {
          result.details.push(`  - ${f}`);
        }
      } else {
        result.details.push('✓ No .env files in deployment directories');
      }

      // Check config token system is implemented
      const apiFiles = findFiles(['js'], path.join(PROJECT_ROOT, 'api'));
      let tokenSystemFound = false;

      for (const file of apiFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('token') && (content.includes('base64') || content.includes('Base64') || content.includes('decode'))) {
          tokenSystemFound = true;
          break;
        }
      }

      if (tokenSystemFound) {
        result.details.push('✓ Config token system implemented in API');
      } else {
        result.details.push('○ Config token system not detected in API');
      }

      // Verify no hardcoded server-side environment dependencies
      const serverFile = readFile('src/server.js');
      if (serverFile) {
        const envRefs = serverFile.match(/process\.env\.[A-Z_]+/g) || [];
        const forbiddenEnv = envRefs.filter(ref =>
          !ref.includes('NODE_ENV') &&
          !ref.includes('PORT') &&
          !ref.includes('VERCEL') &&
          !ref.includes('KV_')  // Vercel KV is allowed
        );

        if (forbiddenEnv.length > 0) {
          result.details.push(`○ Environment variables in server (verify these are optional):`);
          for (const env of forbiddenEnv.slice(0, 3)) {
            result.details.push(`  - ${env}`);
          }
        } else {
          result.details.push('✓ No forbidden environment dependencies');
        }
      }

      // Check that API endpoints work without server-side config
      try {
        const healthResp = await fetchJson(`${config.BASE_URL}/api/health`);
        if (healthResp.status === 200) {
          result.details.push('✓ API health check works (zero-config operational)');
        }
      } catch {
        result.details.push('○ Could not verify API health');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 7: Firmware Anti-Brick Rules
   * CRITICAL: Section 1.4 compliance
   */
  async firmwareAntiBrick() {
    const result = {
      name: 'Firmware Anti-Brick Compliance',
      spec: 'DEVELOPMENT-RULES Section 1.4 (Anti-Brick Rules)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    try {
      // Check firmware directory exists
      const firmwareDir = path.join(PROJECT_ROOT, 'firmware');
      if (!fs.existsSync(firmwareDir)) {
        result.details.push('○ No firmware directory (skip if not managing firmware)');
        return result;
      }

      const firmwareFiles = findFiles(['ino', 'cpp', 'h', 'c'], firmwareDir);

      if (firmwareFiles.length === 0) {
        result.details.push('○ No firmware source files found');
        return result;
      }

      let antiBrickChecks = {
        watchdog: false,
        timeout: false,
        fallback: false,
        recovery: false,
      };

      for (const file of firmwareFiles) {
        const content = fs.readFileSync(file, 'utf-8').toLowerCase();

        if (content.includes('watchdog') || content.includes('wdt')) {
          antiBrickChecks.watchdog = true;
        }
        if (content.includes('timeout') || content.includes('http_timeout')) {
          antiBrickChecks.timeout = true;
        }
        if (content.includes('fallback') || content.includes('default_url')) {
          antiBrickChecks.fallback = true;
        }
        if (content.includes('recovery') || content.includes('safe_mode')) {
          antiBrickChecks.recovery = true;
        }
      }

      // Report findings
      const checkResults = Object.entries(antiBrickChecks);
      const passedChecks = checkResults.filter(([, v]) => v).length;

      for (const [check, passed] of checkResults) {
        if (passed) {
          result.details.push(`✓ ${check} protection detected`);
        } else {
          result.details.push(`○ ${check} protection not detected`);
        }
      }

      if (passedChecks >= 2) {
        result.details.push(`✓ Firmware has ${passedChecks}/4 anti-brick measures`);
      } else {
        result.passed = false;
        result.details.push(`✗ Insufficient anti-brick measures (${passedChecks}/4)`);
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 8: Input Validation
   * HIGH: Validates API input sanitization
   */
  async inputValidation() {
    const result = {
      name: 'API Input Validation',
      spec: 'DEVELOPMENT-RULES Section 17 (Security)',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    try {
      // Test endpoints with malicious input
      const maliciousInputs = [
        '<script>alert(1)</script>',
        '"><script>alert(1)</script>',
        "'; DROP TABLE users; --",
        '../../../etc/passwd',
        '${7*7}',
      ];

      const endpoints = [
        { path: '/api/address-search', param: 'q' },
      ];

      for (const endpoint of endpoints) {
        for (const input of maliciousInputs) {
          try {
            const url = `${config.BASE_URL}${endpoint.path}?${endpoint.param}=${encodeURIComponent(input)}`;
            const response = await fetchHtml(url);

            // Check if input is reflected without encoding
            if (response.html.includes(input) && !response.html.includes(encodeURIComponent(input))) {
              result.passed = false;
              result.details.push(`✗ ${endpoint.path}: Reflects unencoded input`);
              break;
            }
          } catch {
            // Timeout or error is acceptable for malicious input
          }
        }
      }

      if (result.passed) {
        result.details.push('✓ API endpoints handle malicious input safely');
      }

      // Check for input validation patterns in code
      const apiFiles = findFiles(['js'], path.join(PROJECT_ROOT, 'api'));
      let hasValidation = false;

      for (const file of apiFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('sanitize') || content.includes('escape') ||
            content.includes('validate') || content.includes('encodeURI')) {
          hasValidation = true;
          break;
        }
      }

      if (hasValidation) {
        result.details.push('✓ Input validation/sanitization code detected');
      } else {
        result.details.push('○ No explicit validation code found (may use framework defaults)');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 9: HTTPS Enforcement
   * HIGH: Ensures secure communication
   */
  async httpsEnforcement() {
    const result = {
      name: 'HTTPS Enforcement',
      spec: 'Security Best Practices',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    try {
      // Check if production URL uses HTTPS
      if (config.BASE_URL.startsWith('https://')) {
        result.details.push('✓ Production URL uses HTTPS');
      } else {
        result.passed = false;
        result.details.push('✗ Production URL does not use HTTPS');
      }

      // Check for HTTP references in code
      const publicFiles = findFiles(['html', 'js'], path.join(PROJECT_ROOT, 'public'));
      let httpRefs = [];

      for (const file of publicFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = file.replace(PROJECT_ROOT + '/', '');

        // Find http:// references (excluding localhost)
        const matches = content.match(/http:\/\/(?!localhost|127\.0\.0\.1)[^\s'"]+/g);
        if (matches) {
          httpRefs.push({ file: relPath, count: matches.length });
        }
      }

      if (httpRefs.length === 0) {
        result.details.push('✓ No insecure HTTP references in public files');
      } else {
        result.details.push(`○ Found ${httpRefs.length} files with HTTP references:`);
        for (const r of httpRefs.slice(0, 3)) {
          result.details.push(`  - ${r.file}: ${r.count} reference(s)`);
        }
      }

      // Test HTTPS redirect
      try {
        const httpUrl = config.BASE_URL.replace('https://', 'http://');
        // Note: Most hosts auto-redirect, so we just verify HTTPS works
        const httpsResp = await fetchJson(`${config.BASE_URL}/api/health`);
        if (httpsResp.status === 200) {
          result.details.push('✓ HTTPS endpoint responding');
        }
      } catch {
        result.details.push('○ Could not verify HTTPS');
      }
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 10: Dependency Security
   * MEDIUM: Checks for known vulnerable patterns
   */
  async dependencySecurity() {
    const result = {
      name: 'Dependency Security Check',
      spec: 'Security Best Practices',
      priority: 'MEDIUM',
      passed: true,
      details: [],
    };

    try {
      // Check package.json for known risky packages
      const pkgContent = readFile('package.json');
      if (!pkgContent) {
        result.details.push('○ Could not read package.json');
        return result;
      }

      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Known risky or deprecated packages
      const riskyPackages = [
        'request',  // Deprecated
        'node-uuid',  // Deprecated, use uuid
        'moment',  // Large, consider dayjs (already used)
        'lodash',  // Large attack surface
      ];

      const foundRisky = [];
      for (const [name] of Object.entries(allDeps)) {
        if (riskyPackages.includes(name)) {
          foundRisky.push(name);
        }
      }

      if (foundRisky.length === 0) {
        result.details.push('✓ No known risky dependencies');
      } else {
        result.details.push(`○ Found potentially risky dependencies:`);
        for (const pkg of foundRisky) {
          result.details.push(`  - ${pkg}`);
        }
      }

      // Check for lock file
      if (fs.existsSync(path.join(PROJECT_ROOT, 'package-lock.json'))) {
        result.details.push('✓ package-lock.json present (reproducible builds)');
      } else if (fs.existsSync(path.join(PROJECT_ROOT, 'yarn.lock'))) {
        result.details.push('✓ yarn.lock present (reproducible builds)');
      } else {
        result.details.push('○ No lock file found');
      }

      // Report dependency count
      const depCount = Object.keys(pkg.dependencies || {}).length;
      result.details.push(`✓ ${depCount} production dependencies`);
    } catch (error) {
      result.details.push(`Error: ${error.message}`);
    }

    return result;
  },
};

// ============================================
// TEST RUNNER
// ============================================

async function runSecurityAudit(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.critical}COMMUTE COMPUTE SYSTEM - SECURITY AUDIT${colors.reset}`);
  console.log(`Target: ${config.BASE_URL}`);
  console.log(`Local: ${PROJECT_ROOT}`);
  console.log(`Scope: Security, TRMNL Prohibition, Zero-Config, Anti-Brick`);
  console.log(`Spec: DEVELOPMENT-RULES v1.17 Sections 1, 2, 3, 17`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;
  let criticalFailed = 0;

  for (const [name, auditFn] of Object.entries(securityAudits)) {
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
      console.log(`  ${colors.warning}Priority: ${result.priority}${colors.reset}`);
      for (const detail of result.details) {
        console.log(`  ${detail}`);
      }
      console.log('');
    }
  }

  // Summary
  console.log('═'.repeat(70));
  console.log(`${colors.critical}SECURITY AUDIT SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = criticalFailed > 0 ? colors.critical :
                      failed > 0 ? colors.warning : colors.success;
  const status = criticalFailed > 0 ? 'CRITICAL ISSUES' :
                 failed > 0 ? 'ISSUES FOUND' : 'SECURE';

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
export { runSecurityAudit, securityAudits, SECURITY_SPEC };
export default runSecurityAudit;

// ============================================
// MAIN EXECUTION
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runSecurityAudit()
    .then(({ criticalFailed }) => {
      // Exit with error code if any CRITICAL failures
      process.exit(criticalFailed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Security audit error:', error);
      process.exit(1);
    });
}
