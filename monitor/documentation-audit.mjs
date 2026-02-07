/**
 * Commute Compute System - Documentation & Version Audit
 * Tracks versions, validates docs, diagrams, and legal compliance
 *
 * Tests against:
 * - DEVELOPMENT-RULES.md v1.17
 * - CCDashDesignV10.md (LOCKED)
 * - Architecture documentation
 * - Legal/licensing compliance
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
// SPEC CONSTANTS
// ============================================

const DOC_SPEC = {
  // Required documentation files
  requiredDocs: [
    'README.md',
    'DEVELOPMENT-RULES.md',
    'LICENSE',
    'specs/CCDashDesignV10.md',
  ],

  // License requirements
  license: {
    type: 'AGPL-3.0',
    copyright: 'Angus Bergman',
    year: '2026',
    requiredInFiles: ['*.html', '*.js', '*.mjs', '*.css'],
  },

  // Version tracking
  versionFiles: {
    'package.json': ['version'],
    'DEVELOPMENT-RULES.md': ['Version:', 'v1.'],
    'specs/CCDashDesignV10.md': ['v10', 'LOCKED'],
    'src/server.js': ['version', 'VERSION'],
  },

  // Required README sections
  readmeSections: [
    'Installation',
    'Setup',
    'Features',
    'License',
  ],

  // Architecture diagrams/docs
  architectureDocs: [
    'docs/ARCHITECTURE.md',
    'specs/CCDashDesignV10.md',
  ],

  // API documentation
  apiDocs: [
    'api/index.js',
  ],
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
      headers: { 'User-Agent': 'CCDash-DocAudit/1.0' },
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

function fileExists(filePath) {
  try {
    return fs.existsSync(path.join(PROJECT_ROOT, filePath));
  } catch {
    return false;
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8');
  } catch {
    return null;
  }
}

function findFiles(pattern, dir = PROJECT_ROOT) {
  const results = [];
  const extensions = pattern.replace('*.', '').split(',');

  function walk(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walk(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).slice(1);
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(dir);
  return results;
}

// ============================================
// DOCUMENTATION AUDITS
// ============================================

const documentationAudits = {
  /**
   * Audit 1: Required Documentation Files
   */
  async requiredDocs() {
    const result = {
      name: 'Required Documentation',
      spec: 'Project structure requirements',
      passed: true,
      details: [],
    };

    for (const doc of DOC_SPEC.requiredDocs) {
      if (fileExists(doc)) {
        result.details.push(`✓ ${doc} exists`);
      } else {
        result.passed = false;
        result.details.push(`✗ Missing: ${doc}`);
      }
    }

    return result;
  },

  /**
   * Audit 2: Version Consistency
   * Verifies versions match across files and API
   */
  async versionConsistency() {
    const result = {
      name: 'Version Consistency',
      spec: 'DEVELOPMENT-RULES Section 15.5 (Version Tagging)',
      passed: true,
      details: [],
    };

    const versions = {};

    // Get package.json version
    const pkgContent = readFile('package.json');
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        versions.package = pkg.version;
        result.details.push(`✓ package.json: ${pkg.version}`);
      } catch {
        result.details.push('✗ Could not parse package.json');
        result.passed = false;
      }
    }

    // Get API version
    try {
      const apiResponse = await fetchJson(`${config.BASE_URL}/api/version`);
      if (apiResponse.status === 200 && apiResponse.data.system?.version) {
        versions.api = apiResponse.data.system.version;
        result.details.push(`✓ API version: ${apiResponse.data.system.version}`);

        // Check component versions
        if (apiResponse.data.components) {
          const comps = apiResponse.data.components;
          if (comps.commutecompute?.version) {
            result.details.push(`  CommuteCompute: ${comps.commutecompute.version}`);
          }
          if (comps.renderer?.version) {
            result.details.push(`  CCDash Renderer: ${comps.renderer.version}`);
          }
        }
      }
    } catch (error) {
      result.details.push(`○ Could not fetch API version: ${error.message}`);
    }

    // Check DEVELOPMENT-RULES version
    const devRules = readFile('DEVELOPMENT-RULES.md');
    if (devRules) {
      const versionMatch = devRules.match(/Version:\s*(\d+\.\d+)/);
      if (versionMatch) {
        versions.devRules = versionMatch[1];
        result.details.push(`✓ DEVELOPMENT-RULES: v${versionMatch[1]}`);
      }
    }

    // Compare versions
    if (versions.package && versions.api && versions.package !== versions.api) {
      result.passed = false;
      result.details.push(`✗ Version mismatch: package.json (${versions.package}) != API (${versions.api})`);
    }

    return result;
  },

  /**
   * Audit 3: License Headers
   * Checks for proper license headers in source files
   */
  async licenseHeaders() {
    const result = {
      name: 'License Headers',
      spec: 'DEVELOPMENT-RULES Section 20 (Licensing)',
      passed: true,
      details: [],
    };

    const requiredPattern = /AGPL-3\.0|GNU Affero|Copyright.*Angus Bergman/i;
    const filesToCheck = [];

    // Check public HTML files
    const htmlFiles = findFiles('*.html', path.join(PROJECT_ROOT, 'public'));
    filesToCheck.push(...htmlFiles.slice(0, 5)); // Sample first 5

    // Check source JS files
    const jsFiles = findFiles('*.js', path.join(PROJECT_ROOT, 'src'));
    filesToCheck.push(...jsFiles.slice(0, 5)); // Sample first 5

    let withHeader = 0;
    let withoutHeader = 0;

    for (const file of filesToCheck) {
      const content = readFile(file.replace(PROJECT_ROOT + '/', ''));
      if (content) {
        const first500 = content.slice(0, 500);
        if (requiredPattern.test(first500)) {
          withHeader++;
        } else {
          withoutHeader++;
          const relPath = file.replace(PROJECT_ROOT + '/', '');
          result.details.push(`○ Missing header: ${relPath}`);
        }
      }
    }

    result.details.unshift(`Checked ${filesToCheck.length} files: ${withHeader} with headers, ${withoutHeader} without`);

    if (withoutHeader > 2) {
      result.passed = false;
      result.details.push('✗ Too many files missing license headers');
    } else {
      result.details.push('✓ Most files have proper license headers');
    }

    return result;
  },

  /**
   * Audit 4: README Completeness
   */
  async readmeCompleteness() {
    const result = {
      name: 'README Completeness',
      spec: 'DEVELOPMENT-RULES Section 16 (Documentation Standards)',
      passed: false,
      details: [],
    };

    const readme = readFile('README.md');
    if (!readme) {
      result.details.push('✗ README.md not found');
      return result;
    }

    let sectionsFound = 0;
    for (const section of DOC_SPEC.readmeSections) {
      if (readme.toLowerCase().includes(section.toLowerCase())) {
        result.details.push(`✓ Section found: ${section}`);
        sectionsFound++;
      } else {
        result.details.push(`○ Section missing: ${section}`);
      }
    }

    result.passed = sectionsFound >= 3;

    // Check for badges/shields
    if (readme.includes('![') || readme.includes('shields.io')) {
      result.details.push('✓ Has badges/shields');
    }

    // Check for installation instructions
    if (readme.includes('npm install') || readme.includes('yarn')) {
      result.details.push('✓ Has installation instructions');
    }

    return result;
  },

  /**
   * Audit 5: Spec Document Integrity
   */
  async specIntegrity() {
    const result = {
      name: 'Spec Document Integrity',
      spec: 'DEVELOPMENT-RULES Section 7 (Spec Integrity)',
      passed: false,
      details: [],
    };

    // Check CCDashDesignV10
    const designSpec = readFile('specs/CCDashDesignV10.md');
    if (designSpec) {
      result.passed = true;

      // Check for LOCKED status
      if (designSpec.includes('LOCKED') || designSpec.includes('🔒')) {
        result.details.push('✓ CCDashDesignV10: LOCKED status present');
      } else {
        result.passed = false;
        result.details.push('✗ CCDashDesignV10: Missing LOCKED status');
      }

      // Check for version
      if (designSpec.includes('v10') || designSpec.includes('V10')) {
        result.details.push('✓ CCDashDesignV10: Version V10 confirmed');
      }

      // Check for key dimensions
      if (designSpec.includes('800') && designSpec.includes('480')) {
        result.details.push('✓ CCDashDesignV10: Display dimensions (800x480) present');
      }

      // Check for zone definitions
      if (designSpec.includes('header') && designSpec.includes('footer') && designSpec.includes('journey')) {
        result.details.push('✓ CCDashDesignV10: Zone definitions present');
      }
    } else {
      result.details.push('✗ specs/CCDashDesignV10.md not found');
    }

    return result;
  },

  /**
   * Audit 6: Development Rules Currency
   */
  async devRulesCurrency() {
    const result = {
      name: 'Development Rules Currency',
      spec: 'DEVELOPMENT-RULES version tracking',
      passed: false,
      details: [],
    };

    const devRules = readFile('DEVELOPMENT-RULES.md');
    if (!devRules) {
      result.details.push('✗ DEVELOPMENT-RULES.md not found');
      return result;
    }

    // Extract version
    const versionMatch = devRules.match(/Version:\s*(\d+\.\d+)/);
    if (versionMatch) {
      const version = parseFloat(versionMatch[1]);
      result.details.push(`✓ Version: ${versionMatch[1]}`);

      if (version >= 1.15) {
        result.passed = true;
        result.details.push('✓ Version is current (1.15+)');
      } else {
        result.details.push('○ Version may need updating');
      }
    }

    // Check for last update date
    const dateMatch = devRules.match(/Last Updated:\s*(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      result.details.push(`✓ Last updated: ${dateMatch[1]}`);

      const lastUpdate = new Date(dateMatch[1]);
      const daysSince = Math.floor((Date.now() - lastUpdate) / (1000 * 60 * 60 * 24));

      if (daysSince <= 30) {
        result.details.push(`✓ Updated ${daysSince} days ago`);
      } else {
        result.details.push(`○ Updated ${daysSince} days ago - consider review`);
      }
    }

    // Check for key sections
    const keySections = ['Section 0:', 'Section 1:', 'Section 22:', 'Section 24:'];
    let sectionsFound = 0;
    for (const section of keySections) {
      if (devRules.includes(section)) {
        sectionsFound++;
      }
    }
    result.details.push(`✓ ${sectionsFound}/${keySections.length} key sections present`);

    if (!result.passed && sectionsFound === keySections.length) {
      result.passed = true;
    }

    return result;
  },

  /**
   * Audit 7: Architecture Documentation
   */
  async architectureDoc() {
    const result = {
      name: 'Architecture Documentation',
      spec: 'DEVELOPMENT-RULES Section 24 (System Architecture)',
      passed: false,
      details: [],
    };

    // Check for architecture doc
    const archDoc = readFile('docs/ARCHITECTURE.md');
    if (archDoc) {
      result.passed = true;
      result.details.push('✓ docs/ARCHITECTURE.md exists');

      // Check for key architecture concepts
      const concepts = ['Zero-Config', 'Vercel', 'GTFS-RT', 'e-ink', 'serverless'];
      let foundConcepts = 0;

      for (const concept of concepts) {
        if (archDoc.toLowerCase().includes(concept.toLowerCase())) {
          foundConcepts++;
        }
      }

      result.details.push(`✓ ${foundConcepts}/${concepts.length} architecture concepts documented`);

      // Check for diagrams (ASCII or references)
      if (archDoc.includes('```') || archDoc.includes('┌') || archDoc.includes('diagram')) {
        result.details.push('✓ Contains diagrams/visual representations');
      }
    } else {
      result.details.push('○ docs/ARCHITECTURE.md not found');

      // Check if architecture is documented in dev rules
      const devRules = readFile('DEVELOPMENT-RULES.md');
      if (devRules && devRules.includes('Section 24')) {
        result.passed = true;
        result.details.push('✓ Architecture documented in DEVELOPMENT-RULES Section 24');
      }
    }

    return result;
  },

  /**
   * Audit 8: API Documentation Accuracy
   */
  async apiDocAccuracy() {
    const result = {
      name: 'API Documentation',
      spec: 'DEVELOPMENT-RULES Section 4.5 (Required Endpoints)',
      passed: false,
      details: [],
    };

    try {
      // Get API index
      const apiResponse = await fetchJson(`${config.BASE_URL}/api/index`);

      if (apiResponse.status === 200 && apiResponse.data.endpoints) {
        result.passed = true;
        result.details.push('✓ API index endpoint returns documentation');

        // Count documented endpoints
        const endpoints = apiResponse.data.endpoints;
        let totalEndpoints = 0;

        for (const category of Object.keys(endpoints)) {
          const count = endpoints[category]?.length || 0;
          totalEndpoints += count;
          result.details.push(`  ${category}: ${count} endpoints`);
        }

        result.details.push(`✓ Total documented endpoints: ${totalEndpoints}`);

        // Check if essential endpoints are documented
        const allEndpoints = JSON.stringify(endpoints).toLowerCase();
        const essentials = ['/api/screen', '/api/health', '/api/zones'];
        let essentialCount = 0;

        for (const ep of essentials) {
          if (allEndpoints.includes(ep)) {
            essentialCount++;
          }
        }

        result.details.push(`✓ Essential endpoints: ${essentialCount}/${essentials.length}`);
      }
    } catch (error) {
      result.details.push(`○ Could not fetch API docs: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 9: Changelog/History
   */
  async changelogPresence() {
    const result = {
      name: 'Version History',
      spec: 'Documentation standards',
      passed: false,
      details: [],
    };

    // Check for CHANGELOG.md
    if (fileExists('CHANGELOG.md')) {
      result.passed = true;
      result.details.push('✓ CHANGELOG.md exists');
    }

    // Check version history in DEVELOPMENT-RULES
    const devRules = readFile('DEVELOPMENT-RULES.md');
    if (devRules && devRules.includes('Version History')) {
      result.passed = true;
      result.details.push('✓ Version history in DEVELOPMENT-RULES.md');

      // Count version entries
      const versionEntries = (devRules.match(/\|\s*\d+\.\d+\s*\|/g) || []).length;
      result.details.push(`  ${versionEntries} version entries documented`);
    }

    // Check git tags
    try {
      const { execSync } = await import('child_process');
      const tags = execSync('git tag -l', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
      const tagCount = tags.split('\n').filter(t => t.trim()).length;

      if (tagCount > 0) {
        result.passed = true;
        result.details.push(`✓ ${tagCount} git tags for version tracking`);
      }
    } catch {
      result.details.push('○ Could not check git tags');
    }

    return result;
  },

  /**
   * Audit 10: Legal Compliance
   */
  async legalCompliance() {
    const result = {
      name: 'Legal Compliance',
      spec: 'DEVELOPMENT-RULES Section 20 (Licensing)',
      passed: false,
      details: [],
    };

    // Check LICENSE file
    const license = readFile('LICENSE');
    if (license) {
      result.details.push('✓ LICENSE file exists');

      if (license.includes('GNU Affero') || license.includes('AGPL') || license.includes('agpl-3.0')) {
        result.passed = true;
        result.details.push('✓ AGPL-3.0 license confirmed');
      }

      if (license.includes('Angus Bergman')) {
        result.details.push('✓ Copyright holder identified');
      }
    } else {
      result.details.push('✗ LICENSE file not found');
    }

    // Check package.json license field
    const pkg = readFile('package.json');
    if (pkg) {
      try {
        const pkgJson = JSON.parse(pkg);
        if (pkgJson.license) {
          result.details.push(`✓ package.json license: ${pkgJson.license}`);
        }
      } catch {
        // Skip
      }
    }

    // Check for attribution page
    try {
      const attrResponse = await fetchJson(`${config.BASE_URL}/attribution.html`);
      if (attrResponse.status === 200) {
        result.details.push('✓ Attribution page accessible');
      }
    } catch {
      result.details.push('○ Could not check attribution page');
    }

    return result;
  },
};

// ============================================
// TEST RUNNER
// ============================================

async function runDocumentationAudit(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.info}COMMUTE COMPUTE SYSTEM - DOCUMENTATION AUDIT${colors.reset}`);
  console.log(`Target: ${config.BASE_URL}`);
  console.log(`Local: ${PROJECT_ROOT}`);
  console.log(`Scope: Versions, Documentation, Architecture, Legal Compliance`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const [name, auditFn] of Object.entries(documentationAudits)) {
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
  console.log(`${colors.info}DOCUMENTATION AUDIT SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = failed === 0 ? colors.success :
                      failed <= 2 ? colors.warning : colors.critical;
  const status = failed === 0 ? 'FULLY DOCUMENTED' :
                 failed <= 2 ? 'MOSTLY DOCUMENTED' : 'NEEDS ATTENTION';

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
export { runDocumentationAudit, documentationAudits, DOC_SPEC };
export default runDocumentationAudit;

// ============================================
// MAIN EXECUTION
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runDocumentationAudit()
    .then(({ passed, failed }) => {
      process.exit(failed > 3 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Documentation audit error:', error);
      process.exit(1);
    });
}
