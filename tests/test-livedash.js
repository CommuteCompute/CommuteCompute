/**
 * Test LiveDash - Multi-Device Rendering
 * Tests dashboard rendering for all supported e-ink devices
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import LiveDash, { DEVICE_CONFIGS } from '../src/services/livedash.js';
import fs from 'fs';
import path from 'path';

console.log('Testing LiveDash - Multi-Device Rendering\n');

// Test preferences (Melbourne)
const testPreferences = {
  get: () => ({
    homeAddress: { formattedAddress: '123 Example Street, Suburb VIC 3000', state: 'VIC' },
    workAddress: { formattedAddress: '123 Sample Street, Melbourne VIC 3000' },
    cafeLocation: { formattedAddress: 'Example Cafe, South Yarra VIC', lat: -37.8398, lon: 144.9915 },
    arrivalTime: '09:00',
    coffeeEnabled: true,
    preferMultiModal: true
  })
};

async function testDevice(deviceId) {
  console.log(`\n${'─'.repeat(50)}`);
  const config = DEVICE_CONFIGS[deviceId];
  console.log(`${config.name}`);
  console.log(`   Dimensions: ${config.width}×${config.height} (${config.orientation})`);
  console.log(`   DPI: ${config.dpi} | Colors: ${config.colors}`);
  
  try {
    const dash = new LiveDash(testPreferences);
    await dash.initialize();
    dash.setDevice(deviceId);
    
    const pngBuffer = await dash.render();
    
    // Save to output folder
    const outputDir = path.join(process.cwd(), 'tests', 'output', 'devices');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filename = `livedash-${deviceId}.png`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, pngBuffer);
    
    console.log(`   [OK] Rendered: ${filename} (${pngBuffer.length} bytes)`);
    
    return { success: true, device: deviceId, filename, size: pngBuffer.length };
  } catch (error) {
    console.log(`   [FAIL] Error: ${error.message}`);
    return { success: false, device: deviceId, error: error.message };
  }
}

async function runTests() {
  console.log('Supported devices:');
  LiveDash.getDeviceList().forEach(d => {
    console.log(`  • ${d.id}: ${d.name} (${d.width}×${d.height})`);
  });
  
  const results = [];
  
  for (const deviceId of Object.keys(DEVICE_CONFIGS)) {
    const result = await testDevice(deviceId);
    results.push(result);
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n[OK] Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`[FAIL] Failed: ${failed}/${results.length}`);
  }
  
  console.log('\nGenerated files:');
  results.filter(r => r.success).forEach(r => {
    console.log(`  devices/${r.filename}`);
  });
  
  console.log('\nLiveDash multi-device test complete!');
}

runTests().catch(console.error);
