#!/usr/bin/env node

/**
 * Commute Compute Setup Wizard
 * Cross-platform tool for device firmware flashing and deployment setup
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Supports: macOS, Windows, Linux
 * Devices: TRMNL BYOS (OG only), Kindle Paperwhite 3/4/5, Kindle 4
 */

import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Device specifications
const DEVICES = {
  'trmnl-og': {
    name: 'TRMNL OG (Original)',
    chip: 'ESP32',
    resolution: { width: 800, height: 480 },
    orientation: 'landscape',
    display: '7.5" E-ink',
    compatible: true,
    flashMethod: 'esp32-flash',
    minimumRefresh: 900000, // 15 minutes
    notes: 'Fully supported. Requires USB-C cable and ESP32 flash tool.'
  },
  'trmnl-x': {
    name: 'TRMNL X (Newer Model)',
    chip: 'Unknown',
    resolution: { width: 800, height: 480 },
    orientation: 'landscape',
    display: '7.5" E-ink',
    compatible: false,
    flashMethod: null,
    notes: 'NOT YET COMPATIBLE. Different hardware architecture. Check back for future updates.'
  },
  'kindle-pw3': {
    name: 'Kindle Paperwhite 3/4',
    chip: 'ARM',
    resolution: { width: 758, height: 1024 },
    orientation: 'portrait',
    display: '6" E-ink (Carta)',
    compatible: true,
    flashMethod: 'kindle-jailbreak',
    minimumRefresh: 300000, // 5 minutes
    notes: 'Requires jailbreak. See: https://www.mobileread.com/forums/forumdisplay.php?f=150'
  },
  'kindle-pw4': {
    name: 'Kindle Paperwhite 4',
    chip: 'ARM',
    resolution: { width: 758, height: 1024 },
    orientation: 'portrait',
    display: '6" E-ink (Carta)',
    compatible: true,
    flashMethod: 'kindle-jailbreak',
    minimumRefresh: 300000, // 5 minutes
    notes: 'Requires jailbreak. See: https://www.mobileread.com/forums/forumdisplay.php?f=150'
  },
  'kindle-pw5': {
    name: 'Kindle Paperwhite 5',
    chip: 'ARM',
    resolution: { width: 1236, height: 1648 },
    orientation: 'portrait',
    display: '6.8" E-ink (Carta 1200)',
    compatible: true,
    flashMethod: 'kindle-jailbreak',
    minimumRefresh: 300000, // 5 minutes
    notes: 'Requires jailbreak. See: https://www.mobileread.com/forums/forumdisplay.php?f=150'
  },
  'kindle-4': {
    name: 'Kindle 4 (Non-Touch)',
    chip: 'ARM',
    resolution: { width: 600, height: 800 },
    orientation: 'portrait',
    display: '6" E-ink (Pearl)',
    compatible: true,
    flashMethod: 'kindle-jailbreak',
    minimumRefresh: 600000, // 10 minutes
    notes: 'Requires jailbreak. Older Pearl display - higher wear factor.'
  }
};

class SetupWizard {
  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(query) {
    return new Promise(resolve => this.rl.question(query, resolve));
  }

  log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
  }

  logBanner() {
    console.clear();
    this.log('\n╔═══════════════════════════════════════════════╗', 'cyan');
    this.log('║  Commute Compute Setup Wizard v3.0.0                ║', 'cyan');
    this.log('║  Copyright © 2026 Angus Bergman               ║', 'cyan');
    this.log('╚═══════════════════════════════════════════════╝\n', 'cyan');
  }

  async checkPrerequisites() {
    this.log('\n📋 Checking prerequisites...', 'yellow');

    const checks = [
      { name: 'Node.js', command: 'node --version', required: true },
      { name: 'npm', command: 'npm --version', required: true },
      { name: 'Git', command: 'git --version', required: true },
      { name: 'GitLab CLI (glab)', command: 'glab --version', required: false }
    ];

    const results = [];

    for (const check of checks) {
      try {
        const { stdout } = await execAsync(check.command);
        this.log(`  ✅ ${check.name}: ${stdout.trim()}`, 'green');
        results.push({ ...check, installed: true, version: stdout.trim() });
      } catch (error) {
        if (check.required) {
          this.log(`  ❌ ${check.name}: Not found (REQUIRED)`, 'red');
          results.push({ ...check, installed: false });
        } else {
          this.log(`  ⚠️  ${check.name}: Not found (optional)`, 'yellow');
          results.push({ ...check, installed: false });
        }
      }
    }

    const missingRequired = results.filter(r => r.required && !r.installed);
    if (missingRequired.length > 0) {
      this.log('\n❌ Missing required dependencies. Please install:', 'red');
      missingRequired.forEach(r => this.log(`   - ${r.name}`, 'red'));
      process.exit(1);
    }

    return results;
  }

  async selectDevice() {
    this.log('\n📱 Select Your Device', 'blue');
    this.log('═══════════════════════\n', 'blue');

    const deviceList = Object.entries(DEVICES);
    deviceList.forEach(([id, device], index) => {
      const status = device.compatible
        ? colors.green + '✅ Compatible' + colors.reset
        : colors.red + '⚠️  Not Compatible' + colors.reset;

      this.log(`${index + 1}. ${device.name} - ${device.display} (${device.chip})`);
      this.log(`   ${status}`, 'reset');
      if (!device.compatible) {
        this.log(`   ${device.notes}`, 'yellow');
      }
      console.log();
    });

    while (true) {
      const choice = await this.question('Enter device number (1-' + deviceList.length + '): ');
      const index = parseInt(choice) - 1;

      if (index >= 0 && index < deviceList.length) {
        const [deviceId, deviceConfig] = deviceList[index];

        if (!deviceConfig.compatible) {
          this.log(`\n⚠️  ${deviceConfig.name} is not yet compatible.`, 'red');
          this.log(deviceConfig.notes, 'yellow');
          const cont = await this.question('\nSelect a different device? (yes/no): ');
          if (cont.toLowerCase() === 'yes' || cont.toLowerCase() === 'y') {
            continue;
          } else {
            this.log('Setup cancelled.', 'yellow');
            process.exit(0);
          }
        }

        this.log(`\n✅ Selected: ${deviceConfig.name}`, 'green');
        this.log(`   Resolution: ${deviceConfig.resolution.width}×${deviceConfig.resolution.height}`, 'cyan');
        this.log(`   Orientation: ${deviceConfig.orientation}`, 'cyan');
        this.log(`   Display: ${deviceConfig.display}`, 'cyan');
        this.log(`   Minimum Refresh: ${deviceConfig.minimumRefresh / 60000} minutes\n`, 'cyan');

        return { deviceId, ...deviceConfig };
      } else {
        this.log('Invalid choice. Please try again.', 'red');
      }
    }
  }

  async checkGitLabSetup() {
    this.log('\n🐙 GitLab Setup', 'blue');
    this.log('═══════════════\n', 'blue');

    // Check if current directory is a git repo
    try {
      const { stdout: gitRemote } = await execAsync('git remote get-url origin');
      this.log(`✅ Git repository detected: ${gitRemote.trim()}`, 'green');

      // Check if it's a fork
      if (gitRemote.includes('commute-compute')) {
        this.log('✅ Repository appears to be commute-compute', 'green');

        const isFork = await this.question('\nIs this your own fork? (yes/no): ');
        if (isFork.toLowerCase() === 'yes' || isFork.toLowerCase() === 'y') {
          return { setup: true, url: gitRemote.trim() };
        }
      }
    } catch (error) {
      this.log('⚠️  Not in a git repository or no remote configured', 'yellow');
    }

    this.log('\n📝 You need to fork the commute-compute repository:', 'yellow');
    this.log('   1. Go to: https://gitlab.com/angusbergman/commute-compute-system', 'cyan');
    this.log('   2. Click "Fork" in the top-right', 'cyan');
    this.log('   3. Clone your fork to your computer\n', 'cyan');

    const proceed = await this.question('Have you forked and cloned the repository? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes' && proceed.toLowerCase() !== 'y') {
      this.log('\nPlease fork and clone the repository, then run this wizard again.', 'yellow');
      process.exit(0);
    }

    return { setup: false, needsClone: true };
  }

  async guideRenderDeployment() {
    this.log('\n🚀 Render Deployment', 'blue');
    this.log('═══════════════════════\n', 'blue');

    this.log('Follow these steps to deploy your server to Render:\n', 'cyan');
    this.log('1. Go to: https://render.com', 'cyan');
    this.log('2. Sign up or log in', 'cyan');
    this.log('3. Click "New +" → "Web Service"', 'cyan');
    this.log('4. Connect your GitLab account if not already connected', 'cyan');
    this.log('5. Select your forked commute-compute repository', 'cyan');
    this.log('6. Configure:', 'cyan');
    this.log('   - Name: commute-compute-[your-name]', 'cyan');
    this.log('   - Region: Choose closest to you', 'cyan');
    this.log('   - Branch: main', 'cyan');
    this.log('   - Build Command: npm install', 'cyan');
    this.log('   - Start Command: npm start', 'cyan');
    this.log('   - Plan: Free', 'cyan');
    this.log('7. Click "Create Web Service"\n', 'cyan');

    await this.question('Press Enter when your Render deployment is complete...');

    const url = await this.question('\nEnter your Render URL (e.g., https://your-project.vercel.app):');
    this.log(`✅ Render URL saved: ${url}`, 'green');

    return { url: url.trim() };
  }

  async configureEnvironmentVariables(renderUrl, device) {
    this.log('\n🔧 Environment Variables', 'blue');
    this.log('══════════════════════════\n', 'blue');

    this.log('Add these environment variables in Render:\n', 'yellow');
    this.log('1. Go to your Render dashboard', 'cyan');
    this.log('2. Select your Commute Compute service', 'cyan');
    this.log('3. Click "Environment" tab', 'cyan');
    this.log('4. Add the following variables:\n', 'cyan');

    const envVars = [
      { key: 'NODE_ENV', value: 'production', required: true },
      { key: 'PORT', value: '3000', required: true, note: '(Render provides this automatically)' },
      { key: 'DEVICE_TYPE', value: device.deviceId, required: true },
      { key: 'DEVICE_WIDTH', value: device.resolution.width.toString(), required: true },
      { key: 'DEVICE_HEIGHT', value: device.resolution.height.toString(), required: true },
      { key: 'ODATA_API_KEY', value: '<your-transport-victoria-api-key>', required: false, note: 'Get from: https://opendata.transport.vic.gov.au/' },
      { key: 'GOOGLE_PLACES_API_KEY', value: '<your-google-places-api-key>', required: false, note: 'Recommended for setup' },
      { key: 'MAPBOX_ACCESS_TOKEN', value: '<your-mapbox-token>', required: false, note: 'Optional geocoding fallback' }
    ];

    envVars.forEach(env => {
      const req = env.required ? colors.red + '(REQUIRED)' + colors.reset : colors.yellow + '(Optional)' + colors.reset;
      const note = env.note ? colors.yellow + ' ' + env.note + colors.reset : '';
      this.log(`   ${env.key}=${env.value} ${req}${note}`);
    });

    this.log('\n💡 Tip: You can add API keys later via the admin panel', 'yellow');
    await this.question('\nPress Enter when environment variables are configured...');

    return { configured: true };
  }

  async provideFirmwareInstructions(device) {
    this.log('\n💾 Device Firmware', 'blue');
    this.log('═══════════════════\n', 'blue');

    if (device.flashMethod === 'esp32-flash') {
      await this.flashTRMNLInstructions(device);
    } else if (device.flashMethod === 'kindle-jailbreak') {
      await this.flashKindleInstructions(device);
    }

    return { completed: true };
  }

  async flashTRMNLInstructions(device) {
    this.log('📱 TRMNL OG Firmware Flashing Instructions:\n', 'cyan');

    this.log('⚠️  CRITICAL: Verify your TRMNL model before proceeding!', 'red');
    this.log('   - TRMNL OG: ✅ Compatible (ESP32 chip)', 'green');
    this.log('   - TRMNL X: ❌ NOT Compatible (different architecture)\n', 'red');

    this.log('Prerequisites:', 'yellow');
    this.log('   - USB-C cable', 'cyan');
    this.log('   - ESP32 flash tool (esptool.py)', 'cyan');
    this.log('   - TRMNL firmware file\n', 'cyan');

    this.log('Steps:', 'yellow');
    this.log('   1. Install esptool: pip install esptool', 'cyan');
    this.log('   2. Connect TRMNL OG via USB-C', 'cyan');
    this.log('   3. Put device in flash mode (hold BOOT button while connecting)', 'cyan');
    this.log('   4. Run: esptool.py --port /dev/ttyUSB0 write_flash 0x0 firmware.bin', 'cyan');
    this.log('   5. Wait for "Hash of data verified" message', 'cyan');
    this.log('   6. Reset device\n', 'cyan');

    this.log('Configuration:', 'yellow');
    this.log(`   - Server URL: Your Render URL`, 'cyan');
    this.log(`   - Refresh Interval: ${device.minimumRefresh / 60000} minutes minimum`, 'cyan');
    this.log(`   - Display Resolution: ${device.resolution.width}×${device.resolution.height}`, 'cyan');
    this.log(`   - Orientation: ${device.orientation}\n`, 'cyan');

    const firmwarePath = path.join(__dirname, 'firmware', 'cc-eink-byos.ino');
    const firmwareExists = await fs.access(firmwarePath).then(() => true).catch(() => false);

    if (firmwareExists) {
      this.log(`✅ Firmware file found: ${firmwarePath}`, 'green');
    } else {
      this.log(`⚠️  Firmware file not found. Create: ${firmwarePath}`, 'yellow');
    }

    await this.question('\nPress Enter when firmware is flashed...');
  }

  async flashKindleInstructions(device) {
    this.log(`📱 ${device.name} Jailbreak Instructions:\n`, 'cyan');

    this.log('⚠️  WARNING: Jailbreaking may void your warranty', 'red');
    this.log('⚠️  Follow instructions carefully to avoid bricking your device\n', 'red');

    this.log('Resources:', 'yellow');
    this.log('   - MobileRead Forums: https://www.mobileread.com/forums/forumdisplay.php?f=150', 'cyan');
    this.log('   - Kindle Setup: See docs/KINDLE-SETUP.md for e-ink display setup\n', 'cyan');

    this.log('Steps:', 'yellow');
    this.log('   1. Check your Kindle firmware version', 'cyan');
    this.log('   2. Download appropriate jailbreak for your firmware', 'cyan');
    this.log('   3. Follow MobileRead jailbreak instructions carefully', 'cyan');
    this.log('   4. Install KUAL (Kindle Unified Application Launcher)', 'cyan');
    this.log('   5. Install Python runtime', 'cyan');
    this.log('   6. Install display script launcher\n', 'cyan');

    this.log('Configuration:', 'yellow');
    this.log(`   - Server URL: Your Render URL`, 'cyan');
    this.log(`   - Refresh Interval: ${device.minimumRefresh / 60000} minutes minimum`, 'cyan');
    this.log(`   - Display Resolution: ${device.resolution.width}×${device.resolution.height}`, 'cyan');
    this.log(`   - Orientation: ${device.orientation}\n`, 'cyan');

    const launcherPath = path.join(__dirname, 'firmware', 'kindle-launcher.sh');
    const launcherExists = await fs.access(launcherPath).then(() => true).catch(() => false);

    if (launcherExists) {
      this.log(`✅ Launcher script found: ${launcherPath}`, 'green');
    } else {
      this.log(`⚠️  Launcher script not found. Create: ${launcherPath}`, 'yellow');
    }

    this.log(`\n${device.notes}`, 'yellow');
    await this.question('\nPress Enter when jailbreak and setup are complete...');
  }

  async openAdminPanel(renderUrl) {
    this.log('\n⚙️  Admin Panel Configuration', 'blue');
    this.log('══════════════════════════════\n', 'blue');

    this.log('Complete your setup in the admin panel:\n', 'cyan');
    this.log(`   1. Open: ${renderUrl}/admin`, 'cyan');
    this.log('   2. Complete the setup wizard:', 'cyan');
    this.log('      - Enter home address', 'cyan');
    this.log('      - Enter work address', 'cyan');
    this.log('      - Set arrival time', 'cyan');
    this.log('      - (Optional) Add coffee shop', 'cyan');
    this.log('   3. Configure API keys (if not added to Render)', 'cyan');
    this.log('   4. Test your configuration\n', 'cyan');

    const open = await this.question('Open admin panel in browser now? (yes/no): ');
    if (open.toLowerCase() === 'yes' || open.toLowerCase() === 'y') {
      const openCommand = process.platform === 'darwin' ? 'open' :
                         process.platform === 'win32' ? 'start' : 'xdg-open';

      try {
        await execAsync(`${openCommand} ${renderUrl}/admin`);
        this.log('✅ Admin panel opened in browser', 'green');
      } catch (error) {
        this.log(`⚠️  Could not open browser. Please visit: ${renderUrl}/admin`, 'yellow');
      }
    }

    return { completed: true };
  }

  async showSummary(config) {
    this.log('\n✅ Setup Complete!', 'green');
    this.log('═══════════════════\n', 'green');

    this.log('Your Commute Compute is configured with:', 'cyan');
    this.log(`   📱 Device: ${config.device.name}`, 'cyan');
    this.log(`   🌐 Server: ${config.renderUrl}`, 'cyan');
    this.log(`   📏 Resolution: ${config.device.resolution.width}×${config.device.resolution.height}`, 'cyan');
    this.log(`   🔄 Minimum Refresh: ${config.device.minimumRefresh / 60000} minutes\n`, 'cyan');

    this.log('Next Steps:', 'yellow');
    this.log('   1. Complete setup wizard in admin panel', 'cyan');
    this.log('   2. Add your transit API keys', 'cyan');
    this.log('   3. Test display refresh', 'cyan');
    this.log('   4. Enjoy your smart transit display!\n', 'cyan');

    this.log('Resources:', 'yellow');
    this.log('   - GitLab: https://gitlab.com/angusbergman/commute-compute-system', 'cyan');
    this.log('   - Documentation: Check docs/ folder in repository', 'cyan');
    this.log('   - Support: Open an issue on GitLab\n', 'cyan');

    this.log('Thank you for using Commute Compute! 🎉\n', 'green');
  }

  async run() {
    try {
      this.logBanner();

      // Step 1: Check prerequisites
      await this.checkPrerequisites();

      // Step 2: Select device
      const device = await this.selectDevice();

      // Step 3: GitLab setup
      const gitlab = await this.checkGitLabSetup();

      // Step 4: Render deployment
      const render = await this.guideRenderDeployment();

      // Step 5: Environment variables
      await this.configureEnvironmentVariables(render.url, device);

      // Step 6: Firmware flashing
      await this.provideFirmwareInstructions(device);

      // Step 7: Admin panel
      await this.openAdminPanel(render.url);

      // Step 8: Summary
      await this.showSummary({
        device,
        renderUrl: render.url
      });

      this.rl.close();
      process.exit(0);
    } catch (error) {
      this.log(`\n❌ Error: ${error.message}`, 'red');
      this.log(error.stack, 'red');
      this.rl.close();
      process.exit(1);
    }
  }
}

// Run wizard
const wizard = new SetupWizard();
wizard.run();
