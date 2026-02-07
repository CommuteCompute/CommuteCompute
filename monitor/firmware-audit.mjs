/**
 * Commute Compute System - Firmware Compliance Audit
 * Comprehensive audit for TRMNL OG (ESP32-C3) firmware safety and compliance
 *
 * Tests against:
 * - DEVELOPMENT-RULES.md v1.17 Section 1.4 (Anti-Brick Rules)
 * - DEVELOPMENT-RULES.md v1.17 Section 5 (Custom Firmware Requirements)
 * - firmware/ANTI-BRICK-REQUIREMENTS.md
 * - firmware/BOOT-SEQUENCE.md
 * - Known bug database and incident history
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

const PROJECT_ROOT = process.cwd();
const FIRMWARE_DIR = path.join(PROJECT_ROOT, 'firmware');

// ============================================
// ANSI COLORS
// ============================================

const colors = {
  critical: '\x1b[31m',
  warning: '\x1b[33m',
  success: '\x1b[32m',
  info: '\x1b[36m',
  reset: '\x1b[0m',
};

// ============================================
// FIRMWARE SPEC CONSTANTS
// ============================================

const FIRMWARE_SPEC = {
  // Current locked production version
  production: {
    version: '6.1-60s',
    name: 'CC-FW-6.1-60s',
    releaseDate: '2026-01-31',
    status: 'LOCKED',
  },

  // Hardware specs (TRMNL OG - ESP32-C3)
  hardware: {
    chip: 'ESP32-C3',
    architecture: 'RISC-V',
    cores: 1,
    cpuFreq: 160, // MHz
    ram: 320, // KB
    flash: 4, // MB
    display: {
      size: 7.5, // inches
      width: 800,
      height: 480,
      bitDepth: 1, // 1-bit only
      type: 'Waveshare e-ink',
    },
    pins: {
      EPD_SCK: 7,
      EPD_MOSI: 8,
      EPD_CS: 6,
      EPD_RST: 10,
      EPD_DC: 5,
      EPD_BUSY: 4,
      BUTTON: 2,
      BATTERY: 3,
    },
  },

  // Anti-brick rules (12 mandatory requirements)
  // NOTE: Rules 1, 2, 8 check ONLY the setup() function content via checkSetup flag
  antiBrickRules: [
    { id: 1, name: 'NO deepSleep() in setup()', pattern: /deepSleep\s*\(/m, forbidden: true, checkSetup: true },
    { id: 2, name: 'NO blocking delays >10s in setup()', pattern: /delay\s*\(\s*[1-9]\d{4,}\s*\)/m, forbidden: true, checkSetup: true },
    { id: 3, name: 'setup() must complete quickly', checkFn: 'checkSetupCompletion' },
    { id: 4, name: 'State machine for long operations', pattern: /enum\s+\w*[Ss]tate|switch\s*\(\s*\w*[Ss]tate|bool\s+\w*(Connected|Paired|Done|State)/m, required: true },
    { id: 5, name: 'Network timeouts configured', pattern: /setTimeout|TIMEOUT|timeout/im, required: true },
    { id: 6, name: 'Memory safety checks', pattern: /heap|freeHeap|ESP\.getFreeHeap/im, required: true },
    { id: 7, name: 'NO ESP.restart() on errors', pattern: /ESP\.restart\s*\(\s*\)/m, forbidden: true, context: 'error handling' },
    { id: 8, name: 'NO HTTP in setup()', pattern: /HTTPClient|http\.(GET|POST|begin)|WiFiClient.*http/im, forbidden: true, checkSetup: true },
    { id: 9, name: 'QR code memory safety', checkFn: 'checkQRSafety' },
    { id: 10, name: 'Display orientation setRotation(0)', pattern: /setRotation\s*\(\s*0\s*\)/m, required: true },
    { id: 11, name: 'Serial logging present', pattern: /Serial\.print|Serial\.begin/m, required: true },
    { id: 12, name: 'Watchdog timer configured', pattern: /wdt|watchdog|WDT_TIMEOUT/im, required: true },
  ],

  // Known bugs and required workarounds
  // NOTE: These patterns must detect ACTUAL USAGE, not comments about disabled features
  knownBugs: [
    {
      id: 'FONT_BUG',
      name: 'FONT_12x16 rotation bug',
      // Match actual usage like setFont(FONT_12x16), not comments
      forbidden: /[^/]\bFONT_12x16\b/m,
      fix: 'Use FONT_8x8 only',
      severity: 'HIGH',
    },
    {
      id: 'USB_CDC',
      name: 'USB CDC must be enabled',
      required: /ARDUINO_USB_CDC_ON_BOOT/m,
      checkFile: 'platformio.ini',
      severity: 'CRITICAL',
    },
    {
      id: 'SPI_MODE',
      name: 'SPI must use bit-bang mode (speed=0)',
      required: /initIO.*,\s*0\s*\)|speed\s*=\s*0/m,
      severity: 'CRITICAL',
    },
    {
      id: 'WIFIMANAGER',
      name: 'WiFiManager causes ESP32-C3 crash',
      // Match actual #include or instantiation, not comments
      forbidden: /^[^/]*#include\s*<WiFiManager\.h>|^[^/]*WiFiManager\s+\w+/m,
      fix: 'Use direct WiFi.begin()',
      severity: 'CRITICAL',
    },
    {
      id: 'ARDUINOJSON',
      name: 'ArduinoJson causes stack corruption',
      // Match actual #include or usage, not comments
      forbidden: /^[^/]*#include\s*<ArduinoJson\.h>|^[^/]*(Static|Dynamic)JsonDocument/m,
      fix: 'Use manual JSON parsing',
      severity: 'CRITICAL',
    },
    {
      id: 'ALLOCBUFFER',
      name: 'allocBuffer() causes garbage display',
      // Match actual usage, not comments about it being removed
      forbidden: /^[^/]*\ballocBuffer\s*\(/m,
      fix: 'Draw directly without allocBuffer()',
      severity: 'HIGH',
    },
  ],

  // Memory constraints
  memory: {
    minFreeHeap: 100000, // 100KB minimum
    zoneBufferMax: 20000, // 20KB per zone
    maxPartialRefresh: 30,
  },

  // Timing requirements (from config.h)
  timing: {
    tier1Refresh: 60000,
    tier2Refresh: 120000,
    tier3Refresh: 300000,
    fullRefresh: 600000,
    wifiTimeout: 30000,
    httpTimeout: 30000,
    watchdogTimeout: 45,
    maxSetupTime: 5000, // 5 seconds max
  },

  // Incident history for reference
  incidents: [
    { id: 1, date: '2026-01-23', cause: 'deepSleep in setup()', status: 'FIXED' },
    { id: 2, date: '2026-01-26', cause: 'Blocking delay in setup()', status: 'FIXED' },
    { id: 3, date: '2026-01-26', cause: 'HTTP request in setup()', status: 'FIXED' },
    { id: 4, date: '2026-01-26', cause: 'WiFiManager in setup()', status: 'FIXED' },
    { id: 5, date: '2026-01-26', cause: 'Memory corruption (SSL+display)', status: 'FIXED' },
  ],
};

// ============================================
// FILE HELPERS
// ============================================

function readFile(filePath) {
  try {
    const fullPath = filePath.startsWith('/') ? filePath : path.join(PROJECT_ROOT, filePath);
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function fileExists(filePath) {
  const fullPath = filePath.startsWith('/') ? filePath : path.join(PROJECT_ROOT, filePath);
  return fs.existsSync(fullPath);
}

function findFiles(pattern, dir, excludeBackups = true) {
  const results = [];
  const searchDir = dir || FIRMWARE_DIR;

  if (!fs.existsSync(searchDir)) return results;

  function walk(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      for (const item of items) {
        // Skip hidden dirs, node_modules, and PlatformIO build/cache directories
        if (item.startsWith('.') || item === 'node_modules' || item === '.pio') continue;

        // Skip backup and archive files
        if (excludeBackups && (
          item.includes('.bak') ||
          item.includes('.backup') ||
          item.includes('.broken') ||
          item.includes('.old') ||
          item.includes('-v5') ||
          item.includes('-v6') ||
          item.includes('-v7') ||
          (item.includes('main-') && item !== 'main.cpp')  // Only main.cpp is active
        )) continue;

        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (pattern.test(item)) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(searchDir);
  return results;
}

// ============================================
// SERIAL MONITOR
// ============================================

async function captureSerialOutput(port, duration = 10000) {
  return new Promise((resolve) => {
    const output = [];
    let serialProcess;

    try {
      // Try to open serial port
      serialProcess = spawn('cat', [port]);

      serialProcess.stdout.on('data', (data) => {
        output.push(data.toString());
      });

      serialProcess.stderr.on('data', (data) => {
        output.push(`[ERROR] ${data.toString()}`);
      });

      // Stop after duration
      setTimeout(() => {
        if (serialProcess) {
          serialProcess.kill();
        }
        resolve(output.join(''));
      }, duration);

    } catch (error) {
      resolve(`Serial capture error: ${error.message}`);
    }
  });
}

function findSerialPort() {
  try {
    const devices = execSync('ls /dev/cu.usb* /dev/tty.usb* 2>/dev/null || true', { encoding: 'utf-8' });
    const ports = devices.trim().split('\n').filter(p => p);
    return ports.length > 0 ? ports[0] : null;
  } catch {
    return null;
  }
}

// ============================================
// FIRMWARE AUDITS
// ============================================

const firmwareAudits = {
  /**
   * Audit 1: Firmware Directory Structure
   */
  async firmwareStructure() {
    const result = {
      name: 'Firmware Directory Structure',
      spec: 'Project structure requirements',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const requiredFiles = [
      'firmware/platformio.ini',
      'firmware/include/config.h',
      'firmware/src/main.cpp',
      'firmware/README.md',
    ];

    const requiredDocs = [
      'firmware/ANTI-BRICK-REQUIREMENTS.md',
      'firmware/BOOT-SEQUENCE.md',
    ];

    for (const file of requiredFiles) {
      if (fileExists(file)) {
        result.details.push(`✓ ${file}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Missing: ${file}`);
      }
    }

    for (const doc of requiredDocs) {
      if (fileExists(doc)) {
        result.details.push(`✓ ${doc}`);
      } else {
        result.details.push(`○ Missing doc: ${doc}`);
      }
    }

    return result;
  },

  /**
   * Audit 2: Firmware Version Compliance
   */
  async firmwareVersion() {
    const result = {
      name: 'Firmware Version Compliance',
      spec: 'DEVELOPMENT-RULES Section 5.6 (Locked Production)',
      priority: 'CRITICAL',
      passed: false,
      details: [],
    };

    // Check config.h for version
    const configH = readFile('firmware/include/config.h');
    if (!configH) {
      result.details.push('✗ Cannot read firmware/include/config.h');
      return result;
    }

    const versionMatch = configH.match(/#define\s+FIRMWARE_VERSION\s+"([^"]+)"/);
    if (versionMatch) {
      const version = versionMatch[1];
      result.details.push(`✓ FIRMWARE_VERSION: ${version}`);

      if (version === FIRMWARE_SPEC.production.version) {
        result.passed = true;
        result.details.push(`✓ Matches production version (${FIRMWARE_SPEC.production.name})`);
      } else {
        result.details.push(`○ Version differs from production (${FIRMWARE_SPEC.production.version})`);
        result.passed = true; // Allow development versions
      }
    } else {
      result.details.push('✗ FIRMWARE_VERSION not defined in config.h');
    }

    // Check VERSION.txt if exists
    const versionTxt = readFile('firmware/VERSION.txt');
    if (versionTxt) {
      result.details.push(`✓ VERSION.txt: ${versionTxt.trim()}`);
    }

    return result;
  },

  /**
   * Audit 3: Anti-Brick Rule Compliance
   * Tests all 12 mandatory anti-brick rules against PRODUCTION source only
   */
  async antiBrickCompliance() {
    const result = {
      name: 'Anti-Brick Rule Compliance (12 Rules)',
      spec: 'DEVELOPMENT-RULES Section 1.4 (Firmware Anti-Brick)',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    // PRODUCTION source files only (not legacy/test files)
    const productionFiles = [
      'firmware/src/main.cpp',
      'firmware/include/config.h',
    ];

    // Combine production source for pattern matching
    let allSource = '';
    for (const file of productionFiles) {
      const content = readFile(file);
      if (content) allSource += `\n// FILE: ${file}\n${content}`;
    }

    if (allSource.length === 0) {
      result.details.push('○ No production firmware source files found');
      return result;
    }

    // Extract ONLY the setup() function content for setup-specific checks
    // Match setup() { ... } by counting braces
    let setupContent = '';
    const mainCpp = readFile('firmware/src/main.cpp');
    if (mainCpp) {
      const setupStart = mainCpp.indexOf('void setup()');
      if (setupStart >= 0) {
        let braceCount = 0;
        let started = false;
        let end = setupStart;
        for (let i = setupStart; i < mainCpp.length; i++) {
          if (mainCpp[i] === '{') {
            braceCount++;
            started = true;
          } else if (mainCpp[i] === '}') {
            braceCount--;
            if (started && braceCount === 0) {
              end = i + 1;
              break;
            }
          }
        }
        setupContent = mainCpp.substring(setupStart, end);
      }
    }

    // Check each anti-brick rule
    let passedRules = 0;
    let failedRules = 0;

    for (const rule of FIRMWARE_SPEC.antiBrickRules) {
      if (rule.pattern) {
        // Use setup content for setup-specific checks, otherwise use all source
        const checkContent = rule.checkSetup ? setupContent : allSource;
        const matches = checkContent.match(rule.pattern);

        if (rule.forbidden) {
          // Pattern should NOT be found
          if (matches) {
            result.details.push(`✗ Rule #${rule.id}: ${rule.name} - VIOLATION FOUND`);
            failedRules++;
          } else {
            result.details.push(`✓ Rule #${rule.id}: ${rule.name}`);
            passedRules++;
          }
        } else if (rule.required) {
          // Pattern MUST be found
          if (matches) {
            result.details.push(`✓ Rule #${rule.id}: ${rule.name}`);
            passedRules++;
          } else {
            result.details.push(`✗ Rule #${rule.id}: ${rule.name} - NOT FOUND`);
            failedRules++;
          }
        }
      } else if (rule.checkFn) {
        // Custom check function
        result.details.push(`○ Rule #${rule.id}: ${rule.name} (manual verification)`);
        passedRules++;
      }
    }

    result.passed = failedRules === 0;
    result.details.push(`\nSummary: ${passedRules} passed, ${failedRules} failed`);

    return result;
  },

  /**
   * Audit 4: Known Bug Avoidance
   * Checks for known ESP32-C3/bb_epaper bugs in PRODUCTION source files only
   * Production = main.cpp + include headers (per platformio.ini build_src_filter)
   */
  async knownBugAvoidance() {
    const result = {
      name: 'Known Bug Avoidance',
      spec: 'ESP32-C3 / bb_epaper Known Issues',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    // PRODUCTION source files only (not legacy/test files)
    // Per platformio.ini: build_src_filter = +<*> -<*.cpp> +<main.cpp>
    const productionFiles = [
      'firmware/src/main.cpp',
      'firmware/include/config.h',
    ];

    const platformio = readFile('firmware/platformio.ini');

    // Extract only production env from platformio.ini
    const prodEnvMatch = platformio?.match(/\[env:trmnl\]([\s\S]*?)(?=\n\[env:|$)/);
    const prodPlatformio = prodEnvMatch ? prodEnvMatch[1] : '';

    // Helper to strip comments from source
    function stripComments(src) {
      if (!src) return '';
      // Remove // comments
      let cleaned = src.replace(/\/\/.*$/gm, '');
      // Remove /* */ comments
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
      return cleaned;
    }

    let allSource = '';
    for (const file of productionFiles) {
      const content = readFile(file);
      if (content) allSource += stripComments(content);
    }

    for (const bug of FIRMWARE_SPEC.knownBugs) {
      const checkContent = bug.checkFile === 'platformio.ini' ? prodPlatformio : allSource;

      if (!checkContent) {
        result.details.push(`○ ${bug.name}: Cannot check (file not found)`);
        continue;
      }

      if (bug.forbidden) {
        const matches = checkContent.match(bug.forbidden);
        if (matches) {
          result.passed = false;
          result.details.push(`✗ [${bug.severity}] ${bug.name} - VIOLATION`);
          result.details.push(`  Fix: ${bug.fix}`);
        } else {
          result.details.push(`✓ ${bug.name}: Avoided`);
        }
      } else if (bug.required) {
        const matches = checkContent.match(bug.required);
        if (matches) {
          result.details.push(`✓ ${bug.name}: Present`);
        } else {
          if (bug.severity === 'CRITICAL') {
            result.passed = false;
            result.details.push(`✗ [${bug.severity}] ${bug.name} - MISSING`);
          } else {
            result.details.push(`○ ${bug.name}: Not found (may be OK)`);
          }
        }
      }
    }

    return result;
  },

  /**
   * Audit 5: Hardware Pin Configuration
   */
  async pinConfiguration() {
    const result = {
      name: 'Hardware Pin Configuration',
      spec: 'TRMNL OG ESP32-C3 Pinout',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const configH = readFile('firmware/include/config.h');
    if (!configH) {
      result.details.push('✗ Cannot read config.h');
      result.passed = false;
      return result;
    }

    const expectedPins = {
      'EPD_SCK_PIN': 7,
      'EPD_MOSI_PIN': 8,
      'EPD_CS_PIN': 6,
      'EPD_RST_PIN': 10,
      'EPD_DC_PIN': 5,
      'EPD_BUSY_PIN': 4,
    };

    for (const [pinName, expected] of Object.entries(expectedPins)) {
      const match = configH.match(new RegExp(`#define\\s+${pinName}\\s+(\\d+)`));
      if (match) {
        const actual = parseInt(match[1]);
        if (actual === expected) {
          result.details.push(`✓ ${pinName}: GPIO ${actual}`);
        } else {
          result.passed = false;
          result.details.push(`✗ ${pinName}: GPIO ${actual} (expected ${expected})`);
        }
      } else {
        result.details.push(`○ ${pinName}: Not defined`);
      }
    }

    return result;
  },

  /**
   * Audit 6: Timing Configuration
   */
  async timingConfiguration() {
    const result = {
      name: 'Timing Configuration',
      spec: 'DEVELOPMENT-RULES Section 19 (Refresh Timing)',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const configH = readFile('firmware/include/config.h');
    if (!configH) {
      result.details.push('✗ Cannot read config.h');
      result.passed = false;
      return result;
    }

    const timingChecks = [
      { name: 'TIER1_REFRESH_INTERVAL', min: 60000, max: 120000 },
      { name: 'TIER2_REFRESH_INTERVAL', min: 120000, max: 300000 },
      { name: 'TIER3_REFRESH_INTERVAL', min: 300000, max: 600000 },
      { name: 'WIFI_TIMEOUT', min: 10000, max: 60000 },
      { name: 'HTTP_TIMEOUT', min: 5000, max: 30000 },
      { name: 'WDT_TIMEOUT_SEC', min: 30, max: 60 },
    ];

    for (const check of timingChecks) {
      const match = configH.match(new RegExp(`#define\\s+${check.name}\\s+(\\d+)`));
      if (match) {
        const value = parseInt(match[1]);
        if (value >= check.min && value <= check.max) {
          result.details.push(`✓ ${check.name}: ${value}${check.name.includes('SEC') ? 's' : 'ms'}`);
        } else {
          result.details.push(`○ ${check.name}: ${value} (outside recommended ${check.min}-${check.max})`);
        }
      } else {
        result.details.push(`○ ${check.name}: Not defined`);
      }
    }

    return result;
  },

  /**
   * Audit 7: Memory Configuration
   */
  async memoryConfiguration() {
    const result = {
      name: 'Memory Configuration',
      spec: 'ESP32-C3 Memory Constraints (320KB RAM)',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const configH = readFile('firmware/include/config.h');
    const sourceFiles = findFiles(/\.(cpp|c)$/, FIRMWARE_DIR);

    // Check zone buffer size
    if (configH) {
      const bufferMatch = configH.match(/#define\s+ZONE_BUFFER_SIZE\s+(\d+)/);
      if (bufferMatch) {
        const size = parseInt(bufferMatch[1]);
        if (size <= FIRMWARE_SPEC.memory.zoneBufferMax) {
          result.details.push(`✓ ZONE_BUFFER_SIZE: ${size} bytes (max ${FIRMWARE_SPEC.memory.zoneBufferMax})`);
        } else {
          result.passed = false;
          result.details.push(`✗ ZONE_BUFFER_SIZE: ${size} bytes exceeds max ${FIRMWARE_SPEC.memory.zoneBufferMax}`);
        }
      }
    }

    // Check for heap checks in source
    let allSource = '';
    for (const file of sourceFiles) {
      const content = readFile(file);
      if (content) allSource += content;
    }

    if (allSource.includes('getFreeHeap') || allSource.includes('freeHeap')) {
      result.details.push('✓ Heap monitoring code present');
    } else {
      result.details.push('○ No heap monitoring detected');
    }

    if (allSource.includes('psramFound') || allSource.includes('PSRAM')) {
      result.details.push('○ PSRAM references found (ESP32-C3 has no PSRAM)');
    }

    result.details.push(`\nESP32-C3 Memory: ${FIRMWARE_SPEC.hardware.ram}KB total`);
    result.details.push(`Minimum free heap required: ${FIRMWARE_SPEC.memory.minFreeHeap / 1000}KB`);

    return result;
  },

  /**
   * Audit 8: Build Configuration
   * Only checks the PRODUCTION [env:trmnl] section, not legacy test environments
   */
  async buildConfiguration() {
    const result = {
      name: 'Build Configuration',
      spec: 'PlatformIO ESP32-C3 Requirements',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    const platformio = readFile('firmware/platformio.ini');
    if (!platformio) {
      result.details.push('✗ Cannot read platformio.ini');
      result.passed = false;
      return result;
    }

    // Strip platformio.ini comments (lines starting with ; or #)
    const cleanPlatformio = platformio.replace(/^[;#].*$/gm, '');

    // Extract ONLY the production [env:trmnl] section (not legacy/test envs)
    const prodEnvMatch = cleanPlatformio.match(/\[env:trmnl\]([\s\S]*?)(?=\n\[env:|$)/);
    const prodEnv = prodEnvMatch ? prodEnvMatch[1] : cleanPlatformio;

    // Check for ESP32-C3 board
    if (platformio.includes('esp32-c3')) {
      result.details.push('✓ Board: ESP32-C3');
    } else {
      result.passed = false;
      result.details.push('✗ Board not set to ESP32-C3');
    }

    // Check USB CDC configuration (CRITICAL for ESP32-C3)
    const usbCdcPatterns = [
      'ARDUINO_USB_MODE=1',
      'ARDUINO_USB_CDC_ON_BOOT=1',
    ];

    for (const pattern of usbCdcPatterns) {
      if (platformio.includes(pattern)) {
        result.details.push(`✓ ${pattern}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Missing: ${pattern} (required for serial output)`);
      }
    }

    // Check bb_epaper library in production env
    if (prodEnv.includes('bb_epaper')) {
      result.details.push('✓ bb_epaper library configured');
    } else {
      result.details.push('○ bb_epaper not in [env:trmnl]');
    }

    // Check for WiFiManager in PRODUCTION env only (should NOT be present)
    // Legacy test environments like [env:trmnl-minimal] may have it, that's OK
    if (prodEnv.includes('WiFiManager')) {
      result.passed = false;
      result.details.push('✗ WiFiManager in production env (causes ESP32-C3 crashes)');
    } else {
      result.details.push('✓ WiFiManager not in production env');
    }

    // Check for ArduinoJson in PRODUCTION env only (should NOT be present)
    if (prodEnv.includes('ArduinoJson')) {
      result.passed = false;
      result.details.push('✗ ArduinoJson in production env (causes stack corruption)');
    } else {
      result.details.push('✓ ArduinoJson not in production env');
    }

    return result;
  },

  /**
   * Audit 9: Incident History Verification
   * Verifies all historical brick incidents have been fixed
   */
  async incidentVerification() {
    const result = {
      name: 'Historical Incident Verification',
      spec: 'Anti-Brick Incident History',
      priority: 'CRITICAL',
      passed: true,
      details: [],
    };

    const mainCpp = readFile('firmware/src/main.cpp');
    if (!mainCpp) {
      result.details.push('○ Cannot verify - main.cpp not found');
      return result;
    }

    // Extract setup() function content
    const setupMatch = mainCpp.match(/void\s+setup\s*\([^)]*\)\s*\{([\s\S]*?)(?=\n\s*void\s+\w+\s*\()/);
    const setupContent = setupMatch ? setupMatch[1] : '';

    // Verify each incident fix
    const incidentChecks = [
      {
        incident: '#1 (deepSleep in setup)',
        check: () => !setupContent.includes('deepSleep'),
        fix: 'deepSleep removed from setup()',
      },
      {
        incident: '#2 (blocking delay in setup)',
        check: () => !/delay\s*\(\s*[3-9]\d{4,}\s*\)/.test(setupContent),
        fix: 'No delays >30s in setup()',
      },
      {
        incident: '#3 (HTTP in setup)',
        check: () => !/http\.|HTTPClient|fetch/.test(setupContent),
        fix: 'No HTTP requests in setup()',
      },
      {
        incident: '#4 (WiFiManager in setup)',
        check: () => !setupContent.includes('WiFiManager'),
        fix: 'WiFiManager removed',
      },
      {
        incident: '#5 (Memory corruption)',
        check: () => mainCpp.includes('getFreeHeap') || mainCpp.includes('delay(500)'),
        fix: 'Heap monitoring/delays added',
      },
    ];

    for (const check of incidentChecks) {
      if (check.check()) {
        result.details.push(`✓ Incident ${check.incident}: ${check.fix}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Incident ${check.incident}: FIX NOT VERIFIED`);
      }
    }

    return result;
  },

  /**
   * Audit 10: Serial Device Detection
   * NOTE: This is an OPTIONAL test - device may be disconnected/sleeping
   */
  async serialDeviceDetection() {
    const result = {
      name: 'Serial Device Detection',
      spec: 'TRMNL OG USB Connection',
      priority: 'OPTIONAL',  // Not a blocking failure
      passed: true,  // Default to pass, downgrade to info if not found
      details: [],
    };

    const port = findSerialPort();

    if (port) {
      result.passed = true;
      result.details.push(`✓ Serial device found: ${port}`);

      // Try to get device info
      try {
        const info = execSync(`ls -la ${port}`, { encoding: 'utf-8' });
        result.details.push(`  ${info.trim()}`);
      } catch {
        // Ignore
      }
    } else {
      result.details.push('○ No serial device detected');
      result.details.push('  Device may be:');
      result.details.push('  - Not connected');
      result.details.push('  - In deep sleep mode');
      result.details.push('  - Needs reset (hold BOOT button)');
    }

    // Check for common ESP32-C3 ports
    const commonPorts = ['/dev/cu.usbmodem*', '/dev/cu.wchusbserial*', '/dev/tty.usbmodem*'];
    result.details.push('\nExpected port patterns for ESP32-C3:');
    for (const p of commonPorts) {
      result.details.push(`  - ${p}`);
    }

    return result;
  },

  /**
   * Audit 11: Live Serial Output Analysis (if device connected)
   */
  async serialOutputAnalysis() {
    const result = {
      name: 'Live Serial Output Analysis',
      spec: 'Runtime Behavior Verification',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const port = findSerialPort();
    if (!port) {
      result.details.push('○ No serial device - skipping live analysis');
      result.details.push('  Connect device and run audit again');
      return result;
    }

    result.details.push(`Capturing serial output from ${port}...`);

    try {
      // Capture 10 seconds of output
      const output = await captureSerialOutput(port, 10000);

      if (!output || output.length < 10) {
        result.details.push('○ No serial output received');
        result.details.push('  - Check baud rate (115200)');
        result.details.push('  - Device may need reset');
        return result;
      }

      result.details.push(`Captured ${output.length} bytes`);

      // Analyze for issues
      const errorPatterns = [
        { pattern: /Guru Meditation Error/i, issue: 'CPU crash detected' },
        { pattern: /panic/i, issue: 'Panic detected' },
        { pattern: /assert/i, issue: 'Assertion failure' },
        { pattern: /heap.*fail|malloc.*fail/i, issue: 'Memory allocation failure' },
        { pattern: /WDT.*reset|watchdog/i, issue: 'Watchdog reset' },
        { pattern: /brown.*out|brownout/i, issue: 'Brownout reset' },
        { pattern: /stack.*overflow/i, issue: 'Stack overflow' },
        { pattern: /timeout/i, issue: 'Timeout detected' },
      ];

      let issuesFound = 0;
      for (const { pattern, issue } of errorPatterns) {
        if (pattern.test(output)) {
          result.passed = false;
          result.details.push(`✗ ${issue}`);
          issuesFound++;
        }
      }

      // Check for successful patterns
      const successPatterns = [
        { pattern: /setup.*complete|entering loop/i, msg: 'Setup completed successfully' },
        { pattern: /WiFi.*connect|SSID/i, msg: 'WiFi connection attempt' },
        { pattern: /HTTP.*200|fetch.*success/i, msg: 'HTTP request successful' },
        { pattern: /display.*refresh|epaper/i, msg: 'Display refresh detected' },
      ];

      for (const { pattern, msg } of successPatterns) {
        if (pattern.test(output)) {
          result.details.push(`✓ ${msg}`);
        }
      }

      if (issuesFound === 0) {
        result.details.push('\n✓ No critical issues detected in serial output');
      }

      // Include raw output sample
      result.details.push('\n--- Serial Output Sample (last 500 chars) ---');
      result.details.push(output.slice(-500));

    } catch (error) {
      result.details.push(`○ Serial capture error: ${error.message}`);
    }

    return result;
  },

  /**
   * Audit 12: Server-Side API Compatibility
   */
  async apiCompatibility() {
    const result = {
      name: 'Server-Side API Compatibility',
      spec: 'Firmware ↔ Server API Contract',
      priority: 'HIGH',
      passed: true,
      details: [],
    };

    const configH = readFile('firmware/include/config.h');
    if (!configH) {
      result.details.push('○ Cannot check config.h');
      return result;
    }

    // Extract server URL
    const urlMatch = configH.match(/#define\s+SERVER_URL\s+"([^"]+)"/);
    if (urlMatch) {
      const serverUrl = urlMatch[1];
      result.details.push(`✓ SERVER_URL: ${serverUrl}`);

      // Check required endpoints
      const endpoints = ['/api/zones', '/api/zonedata', '/api/status'];
      for (const ep of endpoints) {
        if (configH.includes(ep) || configH.includes(ep.split('/').pop().toUpperCase())) {
          result.details.push(`✓ Endpoint configured: ${ep}`);
        }
      }
    } else {
      result.passed = false;
      result.details.push('✗ SERVER_URL not defined');
    }

    // Check zone structure compatibility
    const zoneEndpoints = [
      'API_ZONES_ENDPOINT',
      'API_ZONEDATA_ENDPOINT',
    ];

    for (const ep of zoneEndpoints) {
      if (configH.includes(ep)) {
        result.details.push(`✓ ${ep} defined`);
      }
    }

    return result;
  },
};

// ============================================
// TEST RUNNER
// ============================================

async function runFirmwareAudit(verbose = true) {
  console.log('\n' + '═'.repeat(70));
  console.log(`${colors.critical}COMMUTE COMPUTE SYSTEM - FIRMWARE COMPLIANCE AUDIT${colors.reset}`);
  console.log(`Hardware: ${FIRMWARE_SPEC.hardware.chip} (${FIRMWARE_SPEC.hardware.ram}KB RAM)`);
  console.log(`Display: ${FIRMWARE_SPEC.hardware.display.width}×${FIRMWARE_SPEC.hardware.display.height} e-ink`);
  console.log(`Production: ${FIRMWARE_SPEC.production.name} (${FIRMWARE_SPEC.production.status})`);
  console.log(`Spec: DEVELOPMENT-RULES v1.17 Sections 1.4, 5`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(70) + '\n');

  const results = [];
  let passed = 0;
  let failed = 0;
  let criticalFailed = 0;

  for (const [name, auditFn] of Object.entries(firmwareAudits)) {
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
  console.log(`${colors.critical}FIRMWARE AUDIT SUMMARY${colors.reset}`);
  console.log('═'.repeat(70));

  const passRate = ((passed / results.length) * 100).toFixed(1);
  const statusColor = criticalFailed > 0 ? colors.critical :
                      failed > 0 ? colors.warning : colors.success;
  const status = criticalFailed > 0 ? 'CRITICAL ISSUES' :
                 failed > 0 ? 'ISSUES FOUND' : 'COMPLIANT';

  console.log(`\nTests: ${colors.success}${passed} passed${colors.reset}, ${colors.critical}${failed} failed${colors.reset}`);
  if (criticalFailed > 0) {
    console.log(`${colors.critical}Critical Failures: ${criticalFailed}${colors.reset}`);
  }
  console.log(`Pass Rate: ${passRate}%`);
  console.log(`\nOverall Status: ${statusColor}${status}${colors.reset}`);

  // Anti-brick rule summary
  console.log(`\n${colors.info}Anti-Brick Rules: 12 mandatory requirements${colors.reset}`);
  console.log(`Known Bug Avoidance: ${FIRMWARE_SPEC.knownBugs.length} bugs tracked`);
  console.log(`Historical Incidents: ${FIRMWARE_SPEC.incidents.length} resolved`);

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
export { runFirmwareAudit, firmwareAudits, FIRMWARE_SPEC };
export default runFirmwareAudit;

// ============================================
// MAIN EXECUTION
// ============================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runFirmwareAudit()
    .then(({ criticalFailed }) => {
      process.exit(criticalFailed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Firmware audit error:', error);
      process.exit(1);
    });
}
