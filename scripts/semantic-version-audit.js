/**
 * Semantic Version Audit — Content Consistency Checker
 * Part of the Commute Compute System™
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Verifies that file content is semantically consistent with VERSION.json,
 * beyond just version number matching. Flags files where descriptions,
 * feature lists, or spec references are outdated.
 *
 * Called by scripts/comprehensive-compliance-audit.sh after G6 checks
 * Output consumed by LLM agent for semantic content review
 * Usage: node scripts/semantic-version-audit.js [--json] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const VERBOSE = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Resolve repo root (script lives in scripts/)
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Read a file relative to repo root. Returns null if missing.
 */
function readFile(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Strip HTML entities so comparisons work against plain text extracted from
 * HTML files (e.g. &#8482; -> nothing, &amp; -> &).
 */
function stripEntities(str) {
  return str
    .replace(/&#8482;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\u2122/g, ''); // unicode TM
}

/**
 * Normalise a version string for comparison: strip leading "v", "CC-FW-" prefix,
 * and trailing ".0" segments so "6.0" matches "6.0.0".
 */
function normVer(v) {
  if (!v) return '';
  let s = String(v).replace(/^v/i, '').replace(/^CC-FW-/i, '');
  // Normalise trailing zeros: "6.0.0" -> "6.0", "2.0" -> "2.0"
  // We reduce to shortest unambiguous form
  while (s.endsWith('.0') && s.split('.').length > 2) {
    s = s.slice(0, -2);
  }
  return s;
}

function log(msg) {
  if (!JSON_MODE) {
    process.stderr.write(msg + '\n');
  }
}

function verbose(msg) {
  if (VERBOSE && !JSON_MODE) {
    process.stderr.write('  [verbose] ' + msg + '\n');
  }
}

// ---------------------------------------------------------------------------
// Load VERSION.json (source of truth)
// ---------------------------------------------------------------------------
const versionJsonRaw = readFile('VERSION.json');
if (!versionJsonRaw) {
  log('FATAL: VERSION.json not found at repo root.');
  process.exit(1);
}

let VERSION;
try {
  VERSION = JSON.parse(versionJsonRaw);
} catch (e) {
  log('FATAL: VERSION.json is not valid JSON: ' + e.message);
  process.exit(1);
}

// Extract authoritative values
const AUTH = {
  systemVersion: VERSION.system?.version,
  systemName: VERSION.system?.name,
  engineVersion: VERSION.components?.commutecompute?.version,
  engineName: VERSION.components?.commutecompute?.name,
  engineDescription: VERSION.components?.commutecompute?.description || '',
  rendererVersion: VERSION.components?.renderer?.version,
  rendererName: VERSION.components?.renderer?.name,
  rendererSpec: VERSION.components?.renderer?.spec,
  rendererDescription: VERSION.components?.renderer?.description || '',
  adminVersion: VERSION.components?.adminPanel?.version,
  adminDescription: VERSION.components?.adminPanel?.description || '',
  setupWizardVersion: VERSION.components?.setupWizard?.version,
  journeyDisplayVersion: VERSION.components?.journeyDisplay?.version,
  livedashVersion: VERSION.components?.livedash?.version,
  livedashDescription: VERSION.components?.livedash?.description || '',
  firmwareVersion: VERSION.firmware?.version,
  firmwareDescription: VERSION.firmware?.description || '',
  firmwareFeatures: VERSION.firmware?.features || [],
  specVersion: VERSION.specs?.dashboard?.version,
  serverVersion: VERSION.backend?.server?.version,
  serverDescription: VERSION.backend?.server?.description || '',
  changelog: VERSION.changelog || [],
};

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------
const report = {
  timestamp: new Date().toISOString(),
  sourceOfTruth: {
    file: 'VERSION.json',
    system: AUTH.systemVersion,
    engine: AUTH.engineVersion,
    renderer: AUTH.rendererVersion,
    spec: AUTH.specVersion,
    admin: AUTH.adminVersion,
    firmware: AUTH.firmwareVersion,
    livedash: AUTH.livedashVersion,
    server: AUTH.serverVersion,
  },
  files: [],
  summary: {
    totalFiles: 0,
    versionMismatches: 0,
    contentStale: 0,
    clean: 0,
    skipped: 0,
  },
};

/**
 * Create a file entry in the report.
 * @returns {object} The file entry (mutated in-place by callers).
 */
function fileEntry(relPath) {
  const entry = {
    path: relPath,
    versionMatch: true,
    contentStale: false,
    staleDetails: [],
  };
  report.files.push(entry);
  return entry;
}

function addStale(entry, line, found, expected, type) {
  entry.contentStale = true;
  entry.staleDetails.push({ line, found: found.trim(), expected: expected.trim(), type });
}

function addVersionMismatch(entry, line, found, expected, type) {
  entry.versionMatch = false;
  entry.staleDetails.push({ line, found: found.trim(), expected: expected.trim(), type });
}

// ---------------------------------------------------------------------------
// (a) CCDash Renderer header — src/services/ccdash-renderer.js
// ---------------------------------------------------------------------------
function auditRendererHeader() {
  const REL = 'src/services/ccdash-renderer.js';
  const content = readFile(REL);
  if (!content) { log('SKIP: ' + REL + ' not found'); report.summary.skipped++; return; }

  const entry = fileEntry(REL);
  const headerLines = content.split('\n').slice(0, 60);
  const header = headerLines.join('\n');

  // Version in header comment, e.g. "CCDash™ Renderer v2.1"
  const versionMatch = header.match(/CCDash[^\n]*Renderer\s+v([\d.]+)/);
  if (versionMatch) {
    const found = versionMatch[1];
    if (normVer(found) !== normVer(AUTH.rendererVersion)) {
      const lineNum = headerLines.findIndex(l => l.includes(versionMatch[0])) + 1;
      addVersionMismatch(entry, lineNum,
        'CCDash Renderer v' + found,
        'CCDash Renderer v' + AUTH.rendererVersion,
        'version_string');
    }
    verbose(REL + ': renderer version in header = v' + found);
  }

  // Spec reference, e.g. "Implements CCDashDesignV15.0"
  const specMatch = header.match(/CCDashDesignV(\d+(?:\.\d+)*)/);
  if (specMatch) {
    const foundSpec = 'CCDashDesignV' + specMatch[1];
    if (foundSpec !== AUTH.specVersion) {
      const lineNum = headerLines.findIndex(l => l.includes(foundSpec)) + 1;
      addStale(entry, lineNum,
        'Implements ' + foundSpec,
        'Implements ' + AUTH.specVersion,
        'spec_reference');
    }
    verbose(REL + ': spec in header = ' + foundSpec);
  }

  // Features block — check if it references an old version label like "FEATURES (v1.54)"
  const featMatch = header.match(/FEATURES\s*\(v([\d.]+)\)/);
  if (featMatch) {
    // The features block version should not reference an ancient version while
    // the component is at a much higher version. Flag if > 1 major behind.
    const featVer = featMatch[1];
    const lineNum = headerLines.findIndex(l => l.includes(featMatch[0])) + 1;
    // Compare major version numbers
    const featMajor = parseInt(featVer.split('.')[0], 10);
    const rendMajor = parseInt(String(AUTH.rendererVersion).split('.')[0], 10);
    if (featMajor < rendMajor) {
      addStale(entry, lineNum,
        'FEATURES (v' + featVer + ')',
        'Should reference current renderer features (v' + AUTH.rendererVersion + ')',
        'stale_feature_block');
    }
    verbose(REL + ': features block version = v' + featVer);
  }

  // Check if the comment block mentions old spec versions (e.g. V13.1, V13.4)
  // that don't match the current spec
  const currentSpecNum = AUTH.specVersion ? AUTH.specVersion.replace('CCDashDesignV', '') : '';
  const oldSpecRefs = [];
  headerLines.forEach((line, i) => {
    const matches = line.match(/V(\d+\.\d+)/g);
    if (matches) {
      matches.forEach(m => {
        const ver = m.replace('V', '');
        // Only flag if it's a design spec version (e.g. V13.1, V15.0) not a component version
        if (parseFloat(ver) >= 10 && ver !== currentSpecNum) {
          oldSpecRefs.push({ line: i + 1, found: m });
        }
      });
    }
  });
  if (oldSpecRefs.length > 3) {
    // Multiple old spec references in header = stale feature documentation
    addStale(entry, oldSpecRefs[0].line,
      oldSpecRefs.length + ' references to old spec versions (e.g. ' + oldSpecRefs[0].found + ')',
      'Feature descriptions should reference current spec ' + AUTH.specVersion,
      'stale_spec_references');
  }
}

// ---------------------------------------------------------------------------
// (b) CommuteCompute Engine header — src/engines/commute-compute.js
// ---------------------------------------------------------------------------
function auditEngineHeader() {
  const REL = 'src/engines/commute-compute.js';
  const content = readFile(REL);
  if (!content) { log('SKIP: ' + REL + ' not found'); report.summary.skipped++; return; }

  const entry = fileEntry(REL);
  const headerLines = content.split('\n').slice(0, 50);
  const header = headerLines.join('\n');

  // Version string, e.g. "CommuteCompute™ Engine (Consolidated v2.0)"
  const versionMatch = header.match(/Engine\s*\((?:Consolidated\s+)?v([\d.]+)\)/i);
  if (versionMatch) {
    const found = versionMatch[1];
    if (normVer(found) !== normVer(AUTH.engineVersion)) {
      const lineNum = headerLines.findIndex(l => l.includes(versionMatch[0])) + 1;
      addVersionMismatch(entry, lineNum,
        'Engine (Consolidated v' + found + ')',
        'Engine v' + AUTH.engineVersion,
        'version_string');
    }
    verbose(REL + ': engine version in header = v' + found);
  }

  // Check if description keywords from VERSION.json are present in header
  // We look for key capability terms from the authoritative description
  const descriptionKeywords = extractKeyCapabilities(AUTH.engineDescription);
  const missingCapabilities = descriptionKeywords.filter(kw => {
    return !header.toLowerCase().includes(kw.toLowerCase());
  });

  if (missingCapabilities.length > 0 && descriptionKeywords.length > 0) {
    const ratio = missingCapabilities.length / descriptionKeywords.length;
    if (ratio > 0.5) {
      addStale(entry, 1,
        'Header describes: ' + summariseContent(header, 80),
        'VERSION.json describes: ' + AUTH.engineDescription.substring(0, 120) + '...',
        'description_drift');
    }
    verbose(REL + ': missing capabilities in header: ' + missingCapabilities.join(', '));
  }

  // Check "Five Interconnected Intelligence Engines" count matches actual engines
  const engineCountMatch = header.match(/(Five|Six|Seven|Four|Three)\s+Interconnected/i);
  if (engineCountMatch) {
    // Count engine entries listed in the header block
    const engineListLines = headerLines.filter(l =>
      /^\s*\*\s+(CommuteCompute|DepartureConfidence|LifestyleContext|SleepOptimiser|AltTransit|CoffeeDecision)[^\n]*\s+—\s+/i.test(l)
    );
    const declaredCount = engineCountMatch[1].toLowerCase();
    const wordToNum = { three: 3, four: 4, five: 5, six: 6, seven: 7 };
    const declared = wordToNum[declaredCount] || 0;
    if (engineListLines.length > 0 && engineListLines.length !== declared) {
      const lineNum = headerLines.findIndex(l => l.includes(engineCountMatch[0])) + 1;
      addStale(entry, lineNum,
        declared + ' engines declared but ' + engineListLines.length + ' listed',
        'Engine count should match listed engines',
        'engine_count_mismatch');
    }
  }
}

/**
 * Extract key capability terms from a description string.
 * Returns terms that are specific enough to be meaningful signals.
 */
function extractKeyCapabilities(description) {
  if (!description) return [];
  const capabilities = [];
  const patterns = [
    /coordinate-based stop detection/i,
    /haversine/i,
    /GTFS-RT/i,
    /Metro Tunnel/i,
    /direction-based/i,
    /route-aware/i,
    /transit-to-walk/i,
    /suburb extraction/i,
    /Departure Confidence/i,
    /Sleep Optimi[sz]er/i,
    /Alt\s*Transit/i,
    /Lifestyle Context/i,
    /Mindset/i,
    /multi-modal/i,
    /findNearestStops/i,
    /alighting/i,
  ];
  for (const pat of patterns) {
    if (pat.test(description)) {
      capabilities.push(pat.source.replace(/\\/g, '').replace(/\[sz\]/g, 's'));
    }
  }
  return capabilities;
}

function summariseContent(text, maxLen) {
  const clean = text.replace(/[/*\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + '...' : clean;
}

// ---------------------------------------------------------------------------
// (c) HTML pages — public/*.html
// ---------------------------------------------------------------------------
function auditHtmlPages() {
  const htmlDir = path.join(REPO_ROOT, 'public');
  let htmlFiles;
  try {
    htmlFiles = fs.readdirSync(htmlDir)
      .filter(f => f.endsWith('.html'))
      .map(f => 'public/' + f);
  } catch {
    log('SKIP: public/ directory not found');
    report.summary.skipped++;
    return;
  }

  // Also check flasher/index.html
  const flasherPath = 'public/flasher/index.html';
  if (fs.existsSync(path.join(REPO_ROOT, flasherPath))) {
    htmlFiles.push(flasherPath);
  }

  for (const relPath of htmlFiles) {
    const content = readFile(relPath);
    if (!content) continue;

    const entry = fileEntry(relPath);
    const lines = content.split('\n');

    // --- System version in HTML markup ---
    // Match footer elements and inline "System vX.Y.Z" text.
    // Excludes JS textContent assignments (handled separately by context-aware fallback check).
    const systemVerPatterns = [
      { re: /cc-footer-system-version[^>]*>(v[\d.]+)</g, label: 'footer system version' },
      { re: /System(?:\s+|&#8482;\s*)v([\d.]+)/g, label: 'inline system version' },
    ];

    for (const pat of systemVerPatterns) {
      lines.forEach((line, i) => {
        let m;
        const re = new RegExp(pat.re.source, pat.re.flags);
        while ((m = re.exec(line)) !== null) {
          const found = normVer(m[1]);
          if (found && found !== normVer(AUTH.systemVersion)) {
            addVersionMismatch(entry, i + 1,
              'System v' + found,
              'System v' + AUTH.systemVersion,
              'html_system_version');
          }
        }
      });
    }

    // --- Engine version in HTML ---
    lines.forEach((line, i) => {
      const plain = stripEntities(line);
      // Match patterns like "CommuteCompute Engine v3.1" or "COMMUTECOMPUTE ENGINE v3.1"
      const engineMatch = plain.match(/CommuteCompute\s*(?:Engine)?\s*v([\d.]+)/i);
      if (engineMatch) {
        const found = normVer(engineMatch[1]);
        if (found !== normVer(AUTH.engineVersion)) {
          addVersionMismatch(entry, i + 1,
            'Engine v' + found,
            'Engine v' + AUTH.engineVersion,
            'html_engine_version');
        }
      }
    });

    // --- Renderer version in HTML ---
    // Only match "CCDash Renderer vX.Y" (explicit renderer label).
    // "CCDash VX.Y" without "Renderer" is ambiguous — it could be a spec
    // reference (e.g. "Zone Layout (CCDash V15.0)") or a shorthand version
    // in architecture diagrams. We handle those separately as spec refs.
    lines.forEach((line, i) => {
      const plain = stripEntities(line);
      // Require "Renderer" in the match to distinguish from spec references
      const rendererMatch = plain.match(/CCDash\s+Renderer\s+v([\d.]+)/i);
      if (rendererMatch) {
        const found = normVer(rendererMatch[1]);
        if (found !== normVer(AUTH.rendererVersion)) {
          addVersionMismatch(entry, i + 1,
            'Renderer v' + found,
            'Renderer v' + AUTH.rendererVersion,
            'html_renderer_version');
        }
      }
      // Also match badge-style short references like "CCDash v3.0" in
      // contexts that are clearly renderer badges (not spec labels)
      const badgeMatch = plain.match(/CCDash\s+v([\d.]+)/i);
      if (badgeMatch && !rendererMatch) {
        const found = normVer(badgeMatch[1]);
        // Skip if the version looks like a spec version (double-digit major = spec)
        const major = parseInt(found.split('.')[0], 10);
        if (major < 10 && found !== normVer(AUTH.rendererVersion)) {
          addVersionMismatch(entry, i + 1,
            'CCDash v' + found,
            'CCDash v' + AUTH.rendererVersion,
            'html_renderer_version');
        }
        // If major >= 10, this is likely a spec reference (e.g. V12, V15.0)
        // which is caught by the spec reference check below
      }
    });

    // --- Spec reference in HTML ---
    // Matches both "CCDashDesignV15.0" and "CCDash V15.0" (when the version
    // major is >= 10, indicating a spec version rather than a component version).
    lines.forEach((line, i) => {
      const plain = stripEntities(line);
      // Explicit spec reference: CCDashDesignVX.Y
      const specMatch = line.match(/CCDashDesignV(\d+(?:\.\d+)*)/);
      if (specMatch) {
        const foundSpec = 'CCDashDesignV' + specMatch[1];
        if (foundSpec !== AUTH.specVersion) {
          addVersionMismatch(entry, i + 1,
            foundSpec,
            AUTH.specVersion,
            'html_spec_reference');
        }
      }
      // Implicit spec reference: "CCDash VXX.Y" where major >= 10
      // (These appear in zone layout headers, architecture diagrams, etc.)
      if (!specMatch) {
        const implicitSpec = plain.match(/CCDash\s+V(\d+(?:\.\d+)?)/i);
        if (implicitSpec) {
          const major = parseInt(implicitSpec[1].split('.')[0], 10);
          if (major >= 10) {
            const foundSpec = 'CCDashDesignV' + implicitSpec[1];
            // Normalise: strip trailing .0 for comparison (V16 == V16.0)
            const normFound = foundSpec.replace(/\.0$/, '');
            const normAuth = AUTH.specVersion.replace(/\.0$/, '');
            if (normFound !== normAuth) {
              addStale(entry, i + 1,
                'Implicit spec ref: CCDash V' + implicitSpec[1],
                'Current spec: ' + AUTH.specVersion,
                'html_implicit_spec_reference');
            }
          }
        }
      }
    });

    // --- Architecture diagram staleness (admin.html) ---
    if (relPath.includes('admin.html')) {
      // Check architecture diagram version string
      lines.forEach((line, i) => {
        const archMatch = stripEntities(line).match(/SYSTEM\s+ARCHITECTURE\s+v([\d.]+)/i);
        if (archMatch) {
          const found = normVer(archMatch[1]);
          if (found !== normVer(AUTH.systemVersion)) {
            addStale(entry, i + 1,
              'Architecture diagram labelled v' + found,
              'System version is v' + AUTH.systemVersion,
              'architecture_diagram_version');
          }
        }
      });

      // Check for inline component descriptions that reference old capabilities
      lines.forEach((line, i) => {
        const plain = stripEntities(line);
        // Admin panel version
        const adminMatch = plain.match(/Admin\s*Panel\s*v([\d.]+)/i);
        if (adminMatch) {
          const found = normVer(adminMatch[1]);
          if (found !== normVer(AUTH.adminVersion)) {
            addVersionMismatch(entry, i + 1,
              'Admin Panel v' + found,
              'Admin Panel v' + AUTH.adminVersion,
              'html_admin_version');
          }
        }
      });
    }

    // --- JS fallback version values ---
    // Match two patterns:
    //   1. || 'vX.Y.Z' (fallback in ternary/or expressions)
    //   2. .textContent = 'vX.Y.Z' (fallback assignment when API call fails)
    // Use element ID or surrounding context to determine which component.
    lines.forEach((line, i) => {
      // Collect all version literals on this line
      const versionLiterals = [];
      // Pattern 1: || 'vX.Y'
      let m;
      const orRe = /\|\|\s*['"]v?([\d.]+)['"]/g;
      while ((m = orRe.exec(line)) !== null) {
        versionLiterals.push(normVer(m[1]));
      }
      // Pattern 2: textContent = 'vX.Y' (or .textContent = 'vX.Y.Z')
      const tcRe = /textContent\s*=\s*['"]v?([\d.]+)['"]/g;
      while ((m = tcRe.exec(line)) !== null) {
        versionLiterals.push(normVer(m[1]));
      }

      if (versionLiterals.length === 0) return;

      // Determine context from element IDs or keywords
      const ctx = line.toLowerCase();
      for (const ver of versionLiterals) {
        // Skip ellipsis or non-version matches
        if (!ver || ver === '.' || ver === '..' || ver === '...') continue;

        if (ctx.includes('system-version') || ctx.includes('system_version')) {
          if (ver !== normVer(AUTH.systemVersion)) {
            addVersionMismatch(entry, i + 1,
              'JS fallback system version: v' + ver,
              'Expected: v' + AUTH.systemVersion,
              'js_fallback_version');
          }
        } else if (ctx.includes('commutecompute-version') || ctx.includes('engine-version') || ctx.includes('engine_version')) {
          if (ver !== normVer(AUTH.engineVersion)) {
            addVersionMismatch(entry, i + 1,
              'JS fallback engine version: v' + ver,
              'Expected: v' + AUTH.engineVersion,
              'js_fallback_version');
          }
        } else if (ctx.includes('renderer-version') || ctx.includes('renderer_version')) {
          if (ver !== normVer(AUTH.rendererVersion)) {
            addVersionMismatch(entry, i + 1,
              'JS fallback renderer version: v' + ver,
              'Expected: v' + AUTH.rendererVersion,
              'js_fallback_version');
          }
        }
        // If no recognisable context, skip — avoid false positives
      }
    });

    // Remove entries that have no issues
    // (We keep them for the total count but mark them clean)
  }
}

// ---------------------------------------------------------------------------
// (d) README.md
// ---------------------------------------------------------------------------
function auditReadme() {
  const REL = 'README.md';
  const content = readFile(REL);
  if (!content) { log('SKIP: ' + REL + ' not found'); report.summary.skipped++; return; }

  const entry = fileEntry(REL);
  const lines = content.split('\n');

  // --- Version references ---
  lines.forEach((line, i) => {
    const plain = stripEntities(line);

    // System version
    const sysMatch = plain.match(/System\s+v([\d.]+)/i);
    if (sysMatch) {
      const found = normVer(sysMatch[1]);
      if (found !== normVer(AUTH.systemVersion)) {
        addVersionMismatch(entry, i + 1,
          'System v' + found,
          'System v' + AUTH.systemVersion,
          'readme_system_version');
      }
    }

    // Engine version
    const engMatch = plain.match(/CommuteCompute\s*(?:Engine)?\s*\(?\s*v([\d.]+)/i);
    if (engMatch) {
      const found = normVer(engMatch[1]);
      if (found !== normVer(AUTH.engineVersion)) {
        addVersionMismatch(entry, i + 1,
          'Engine v' + found,
          'Engine v' + AUTH.engineVersion,
          'readme_engine_version');
      }
    }

    // Renderer version — require "Renderer" keyword to avoid matching spec badges
    // "CCDash Renderer v2.1" = renderer; "CCDash V16.0" in badge = spec (caught below)
    const renMatch = plain.match(/CCDash\s+Renderer\s+v([\d.]+)/i);
    if (renMatch) {
      const found = normVer(renMatch[1]);
      if (found !== normVer(AUTH.rendererVersion)) {
        addVersionMismatch(entry, i + 1,
          'Renderer v' + found,
          'Renderer v' + AUTH.rendererVersion,
          'readme_renderer_version');
      }
    }

    // Firmware version
    const fwMatch = plain.match(/CCFirm\s*v?([\d.]+)/i);
    if (fwMatch) {
      const found = normVer(fwMatch[1]);
      if (found !== normVer(AUTH.firmwareVersion)) {
        addVersionMismatch(entry, i + 1,
          'Firmware v' + found,
          'Firmware v' + AUTH.firmwareVersion,
          'readme_firmware_version');
      }
    }

    // LiveDash version
    const ldMatch = plain.match(/LiveDash\s*(?:v|V)([\d.]+)/i);
    if (ldMatch) {
      const found = normVer(ldMatch[1]);
      if (found !== normVer(AUTH.livedashVersion)) {
        addVersionMismatch(entry, i + 1,
          'LiveDash v' + found,
          'LiveDash v' + AUTH.livedashVersion,
          'readme_livedash_version');
      }
    }

    // Admin Panel version
    const admMatch = plain.match(/Admin\s*Panel\s*v([\d.]+)/i);
    if (admMatch) {
      const found = normVer(admMatch[1]);
      if (found !== normVer(AUTH.adminVersion)) {
        addVersionMismatch(entry, i + 1,
          'Admin Panel v' + found,
          'Admin Panel v' + AUTH.adminVersion,
          'readme_admin_version');
      }
    }
  });

  // --- Spec badge and explicit spec references ---
  lines.forEach((line, i) => {
    // Badge URL-encoded: CCDash%20V16.0
    const badgeMatch = line.match(/CCDash%20V([\d.]+)/);
    if (badgeMatch) {
      const foundSpec = 'CCDashDesignV' + badgeMatch[1];
      if (foundSpec !== AUTH.specVersion) {
        addVersionMismatch(entry, i + 1,
          'Badge: ' + foundSpec,
          'Expected: ' + AUTH.specVersion,
          'readme_spec_badge');
      }
    }
    // Explicit spec string: CCDashDesignV16.0
    const specMatch = line.match(/CCDashDesignV(\d+(?:\.\d+)*)/);
    if (specMatch) {
      const foundSpec = 'CCDashDesignV' + specMatch[1];
      if (foundSpec !== AUTH.specVersion) {
        addVersionMismatch(entry, i + 1,
          foundSpec,
          AUTH.specVersion,
          'readme_spec_reference');
      }
    }
    // Alt text pattern: "Spec: CCDash V16.0"
    const altMatch = line.match(/Spec:\s*CCDash\s+V([\d.]+)/i);
    if (altMatch && !badgeMatch) {
      const foundSpec = 'CCDashDesignV' + altMatch[1];
      if (foundSpec !== AUTH.specVersion) {
        addVersionMismatch(entry, i + 1,
          'Spec alt text: CCDash V' + altMatch[1],
          'Expected: ' + AUTH.specVersion,
          'readme_spec_badge');
      }
    }
  });

  // --- Feature list consistency ---
  // Check if the README mentions capabilities that don't appear in VERSION.json changelog
  // or vice versa. Focus on the latest changelog entry.
  if (AUTH.changelog.length > 0) {
    const latestChanges = AUTH.changelog[0].changes || [];
    // Check if README's engine section mentions coordinate-based detection (a v5.0 feature)
    const hasCoordinateDetection = latestChanges.some(c => /coordinate-based/i.test(c));
    if (hasCoordinateDetection) {
      const readmeHasIt = content.toLowerCase().includes('coordinate-based');
      if (!readmeHasIt) {
        addStale(entry, 1,
          'README does not mention coordinate-based stop detection',
          'VERSION.json v' + AUTH.systemVersion + ' includes coordinate-based stop detection',
          'missing_feature_in_readme');
      }
    }

    // Check if README mentions unified engine (v5.0 key change)
    const hasUnifiedEngine = latestChanges.some(c => /unified engine|single endpoint/i.test(c));
    if (hasUnifiedEngine) {
      const readmeHasIt = content.toLowerCase().includes('unified') || content.toLowerCase().includes('single endpoint');
      if (!readmeHasIt) {
        addStale(entry, 1,
          'README does not mention unified engine architecture',
          'VERSION.json v' + AUTH.systemVersion + ' describes unified engine (single endpoint)',
          'missing_feature_in_readme');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (e) api/version.js
// ---------------------------------------------------------------------------
function auditVersionEndpoint() {
  const REL = 'api/version.js';
  const content = readFile(REL);
  if (!content) { log('SKIP: ' + REL + ' not found'); report.summary.skipped++; return; }

  const entry = fileEntry(REL);
  const lines = content.split('\n');

  // System version — look for version: 'v5.0.0' or system.version
  lines.forEach((line, i) => {
    // Top-level version field
    if (/^\s*version:\s*['"]v?([\d.]+)['"]/.test(line) && !line.includes('//')) {
      const m = line.match(/version:\s*['"]v?([\d.]+)['"]/);
      if (m) {
        const found = normVer(m[1]);
        // Context-sensitive: is this the top-level or nested?
        const prevLines = lines.slice(Math.max(0, i - 3), i).join(' ');
        if (!prevLines.includes('commutecompute') &&
            !prevLines.includes('renderer') &&
            !prevLines.includes('setupWizard') &&
            !prevLines.includes('livedash') &&
            !prevLines.includes('admin') &&
            !prevLines.includes('firmware') &&
            !prevLines.includes('system')) {
          if (found !== normVer(AUTH.systemVersion)) {
            addVersionMismatch(entry, i + 1,
              'version: v' + found,
              'Expected system version: v' + AUTH.systemVersion,
              'api_version_system');
          }
        }
      }
    }
  });

  // Check nested component versions
  const versionChecks = [
    { context: 'commutecompute', auth: AUTH.engineVersion, label: 'engine' },
    { context: 'renderer', auth: AUTH.rendererVersion, label: 'renderer' },
    { context: 'setupWizard', auth: AUTH.setupWizardVersion, label: 'setupWizard' },
    { context: 'livedash', auth: AUTH.livedashVersion, label: 'livedash' },
    { context: 'admin', auth: AUTH.adminVersion, label: 'admin' },
    { context: 'firmware', auth: AUTH.firmwareVersion, label: 'firmware' },
  ];

  // Build a simple state machine to track which component block we're in
  let currentBlock = null;
  lines.forEach((line, i) => {
    // Detect block entry
    for (const vc of versionChecks) {
      if (line.includes(vc.context + ':') || line.includes(vc.context + ' :')) {
        currentBlock = vc;
      }
    }
    if (line.includes('system:') || line.includes('system :')) {
      currentBlock = { context: 'system', auth: AUTH.systemVersion, label: 'system' };
    }

    // Check version within block
    if (currentBlock) {
      const vm = line.match(/version:\s*['"](?:CC-FW-)?(v?[\d.]+)['"]/);
      if (vm) {
        const found = normVer(vm[1]);
        const expected = normVer(currentBlock.auth);
        if (expected && found !== expected) {
          addVersionMismatch(entry, i + 1,
            currentBlock.label + ' version: v' + found,
            'Expected: v' + expected,
            'api_version_' + currentBlock.label);
        }
        currentBlock = null; // Reset after finding version
      }
    }

    // Closing brace resets block context
    if (/^\s*\}/.test(line)) {
      currentBlock = null;
    }
  });

  // Spec reference
  lines.forEach((line, i) => {
    const specMatch = line.match(/CCDashDesignV(\d+(?:\.\d+)*)/);
    if (specMatch) {
      const foundSpec = 'CCDashDesignV' + specMatch[1];
      if (foundSpec !== AUTH.specVersion) {
        addVersionMismatch(entry, i + 1,
          foundSpec,
          AUTH.specVersion,
          'api_version_spec');
      }
    }
  });

  // Description staleness — check if the endpoint descriptions match VERSION.json
  const endpointRendererDesc = extractQuotedDescription(content, 'renderer');
  if (endpointRendererDesc && AUTH.rendererDescription) {
    const similarity = descriptionSimilarity(endpointRendererDesc, AUTH.rendererDescription);
    if (similarity < 0.4) {
      const lineNum = lines.findIndex(l => l.includes(endpointRendererDesc.substring(0, 30))) + 1;
      addStale(entry, lineNum || 1,
        'Renderer description: "' + endpointRendererDesc.substring(0, 80) + '..."',
        'VERSION.json: "' + AUTH.rendererDescription.substring(0, 80) + '..."',
        'description_drift_renderer');
    }
  }

  const endpointEngineDesc = extractQuotedDescription(content, 'commutecompute');
  if (endpointEngineDesc && AUTH.engineDescription) {
    const similarity = descriptionSimilarity(endpointEngineDesc, AUTH.engineDescription);
    if (similarity < 0.4) {
      const lineNum = lines.findIndex(l => l.includes(endpointEngineDesc.substring(0, 30))) + 1;
      addStale(entry, lineNum || 1,
        'Engine description: "' + endpointEngineDesc.substring(0, 80) + '..."',
        'VERSION.json: "' + AUTH.engineDescription.substring(0, 80) + '..."',
        'description_drift_engine');
    }
  }
}

/**
 * Extract a description string from a JS object literal near a given key.
 */
function extractQuotedDescription(content, nearKey) {
  const idx = content.indexOf(nearKey);
  if (idx === -1) return null;
  // Search forward from the key for a description field
  const slice = content.substring(idx, idx + 500);
  const match = slice.match(/description:\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Simple token-overlap similarity score (Jaccard-like).
 * Returns 0.0 (no overlap) to 1.0 (identical).
 */
function descriptionSimilarity(a, b) {
  const tokenize = (s) => new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// (f) package.json
// ---------------------------------------------------------------------------
function auditPackageJson() {
  const REL = 'package.json';
  const content = readFile(REL);
  if (!content) { log('SKIP: ' + REL + ' not found'); report.summary.skipped++; return; }

  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    log('WARN: package.json is not valid JSON');
    report.summary.skipped++;
    return;
  }

  const entry = fileEntry(REL);

  // package.json version should match system version
  if (pkg.version) {
    const found = normVer(pkg.version);
    const expected = normVer(AUTH.systemVersion);
    if (found !== expected) {
      addVersionMismatch(entry, 1,
        'package.json version: ' + pkg.version,
        'VERSION.json system version: ' + AUTH.systemVersion,
        'package_version');
    }
  }

  // Description freshness — check if package description is stale
  if (pkg.description && AUTH.systemName) {
    if (!pkg.description.toLowerCase().includes('commute compute')) {
      addStale(entry, 1,
        'package.json description: "' + pkg.description + '"',
        'Should reference Commute Compute System',
        'package_description');
    }
  }
}

// ---------------------------------------------------------------------------
// Run all audits
// ---------------------------------------------------------------------------
log('Semantic Version Audit — Content Consistency Checker');
log('Source of truth: VERSION.json (System v' + AUTH.systemVersion + ')');
log('');

auditRendererHeader();
auditEngineHeader();
auditHtmlPages();
auditReadme();
auditVersionEndpoint();
auditPackageJson();

// ---------------------------------------------------------------------------
// Summarise
// ---------------------------------------------------------------------------
report.summary.totalFiles = report.files.length;
for (const file of report.files) {
  if (!file.versionMatch) {
    report.summary.versionMismatches++;
  } else if (file.contentStale) {
    report.summary.contentStale++;
  } else if (file.staleDetails.length === 0) {
    report.summary.clean++;
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (JSON_MODE) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  // Human-readable output
  log('='.repeat(72));
  log('RESULTS');
  log('='.repeat(72));

  for (const file of report.files) {
    if (file.staleDetails.length === 0) {
      verbose(file.path + ': CLEAN');
      continue;
    }

    const status = !file.versionMatch ? 'VERSION MISMATCH' : 'CONTENT STALE';
    log('');
    log('[' + status + '] ' + file.path);
    for (const d of file.staleDetails) {
      log('  Line ' + d.line + ' (' + d.type + ')');
      log('    Found:    ' + d.found);
      log('    Expected: ' + d.expected);
    }
  }

  log('');
  log('-'.repeat(72));
  log('Summary:');
  log('  Total files scanned:    ' + report.summary.totalFiles);
  log('  Version mismatches:     ' + report.summary.versionMismatches);
  log('  Content stale:          ' + report.summary.contentStale);
  log('  Clean:                  ' + report.summary.clean);
  log('  Skipped:                ' + report.summary.skipped);
  log('-'.repeat(72));

  // Also output JSON to stdout for programmatic consumption
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Exit code
// ---------------------------------------------------------------------------
if (report.summary.versionMismatches > 0) {
  process.exit(1);
} else if (report.summary.contentStale > 0) {
  process.exit(2);
} else {
  process.exit(0);
}
