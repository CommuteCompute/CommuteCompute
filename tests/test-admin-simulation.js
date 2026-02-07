/**
 * Admin Panel Simulation Test
 * Simulates the full admin panel → dashboard render flow
 * Uses the sample-journey.json config to test the complete pipeline
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fs from 'fs';
import path from 'path';
import SmartJourneyEngine from '../src/core/smart-journey-engine.js';
import { renderFullDashboard } from '../src/services/ccdash-renderer.js';

console.log('Admin Panel Simulation Test\n');
console.log('Simulating: Home -> [Coffee] Coffee -> [Tram] Tram -> [Train] Train -> Work\n');

// Mock live transit data
const mockTransitData = {
  trains: [
    { 
      minutes: 8, 
      destination: 'Parliament via City Loop',
      routeName: 'Sandringham',
      platform: 1,
      scheduled: '07:25',
      isDelayed: false
    },
    { 
      minutes: 23, 
      destination: 'Parliament via City Loop',
      routeName: 'Sandringham', 
      platform: 1,
      scheduled: '07:40',
      isDelayed: true,
      delayMinutes: 2
    }
  ],
  trams: [
    {
      minutes: 4,
      routeNumber: '8',
      destination: 'South Yarra Station',
      stopName: 'Toorak Rd/Chapel St'
    },
    {
      minutes: 12,
      routeNumber: '8',
      destination: 'South Yarra Station',
      stopName: 'Toorak Rd/Chapel St'
    }
  ],
  buses: []
};

// Mock weather data
const mockWeather = {
  temp: 18,
  condition: 'Partly Cloudy',
  icon: '[Cloud]',
  humidity: 65
};

// Mock service alerts (none for clean test)
const mockAlerts = [];

async function runSimulation() {
  console.log('1. Loading journey configuration...');
  console.log('-'.repeat(50));
  
  const configPath = path.join(process.cwd(), 'config', 'sample-journey.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  console.log(`   Config version: ${config.version}`);
  console.log(`   Pattern: ${config.journey.pattern || 'auto'}`);
  console.log(`   Preferred route: ${config.preferredRoute?.name || 'auto-discover'}`);
  console.log();

  console.log('2. Initializing Smart Journey Engine...');
  console.log('-'.repeat(50));
  
  const engine = new SmartJourneyEngine();
  await engine.initialize();
  
  console.log('   [OK] Engine initialized');
  console.log(`   Coffee engine ready: ${!!engine.coffeeEngine}`);
  console.log();

  console.log('3. Getting coffee decision with live transit...');
  console.log('-'.repeat(50));
  
  const coffeeDecision = engine.coffeeEngine.calculate(
    mockTransitData.trams[0].minutes,  // Next tram in 4 min
    mockTransitData.trams,
    ''  // No alerts
  );
  
  console.log(`   Decision: ${coffeeDecision.decision}`);
  console.log(`   Subtext: ${coffeeDecision.subtext}`);
  console.log(`   Can get coffee: ${coffeeDecision.canGet}`);
  console.log();

  console.log('4. Building journey legs for display...');
  console.log('-'.repeat(50));
  
  // Build journey from preferred route config
  const journeyLegs = [];
  
  if (config.preferredRoute?.segments) {
    for (const seg of config.preferredRoute.segments) {
      const leg = {
        type: seg.type,
        title: buildLegTitle(seg),
        subtitle: buildLegSubtitle(seg, mockTransitData, coffeeDecision),
        minutes: seg.minutes,
        state: 'normal'
      };
      
      // Handle coffee leg
      if (seg.type === 'coffee') {
        leg.state = coffeeDecision.canGet ? 'normal' : 'skip';
        leg.subtitle = coffeeDecision.canGet
          ? '[Coffee] TIME FOR COFFEE'
          : `SKIP -- ${coffeeDecision.subtext}`;
      }
      
      // Add live data for transit
      if (seg.type === 'tram') {
        const liveData = mockTransitData.trams[0];
        leg.liveMinutes = liveData.minutes;
        leg.subtitle = `Route ${liveData.routeNumber} → ${liveData.destination}`;
      }
      
      if (seg.type === 'train') {
        const liveData = mockTransitData.trains[0];
        leg.liveMinutes = liveData.minutes;
        leg.subtitle = `${liveData.routeName} → ${liveData.destination}`;
        leg.platform = liveData.platform;
      }
      
      journeyLegs.push(leg);
      console.log(`   ${getIcon(seg.type)} ${leg.title}: ${leg.minutes}m ${leg.state === 'skip' ? '(SKIP)' : '' }`);
    }
  }
  console.log();

  console.log('5. Building dashboard data model...');
  console.log('-'.repeat(50));
  
  // Build the full data model for zone-renderer (V10 format)
  const now = new Date();
  const melbTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  
  // Calculate times
  const arrivalTime = config.journey.arrivalTime || '09:00';
  const totalMins = config.preferredRoute?.totalMinutes || 29;
  const leaveBy = calculateLeaveTime(arrivalTime, totalMins);
  
  // Calculate leave_in_minutes
  const [leaveH, leaveM] = leaveBy.split(':').map(Number);
  const leaveMins = leaveH * 60 + leaveM;
  const nowMins = melbTime.getHours() * 60 + melbTime.getMinutes();
  const leaveInMins = Math.max(0, leaveMins - nowMins);
  
  // Format legs for V10 zone-renderer
  const formattedLegs = journeyLegs.map((leg, i) => ({
    type: leg.type,
    title: leg.title.replace(/\[Coffee\]|\[Tram\]|\[Train\]/g, '').trim(),  // Remove mode labels from title
    subtitle: leg.subtitle,
    minutes: leg.liveMinutes || leg.minutes,
    state: leg.state,
    platform: leg.platform
  }));
  
  // V10 zone-renderer expects this format:
  const dashboardData = {
    // Header data
    time: formatTime(melbTime),
    ampm: melbTime.getHours() >= 12 ? 'PM' : 'AM',
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][melbTime.getDay()],
    date: `${melbTime.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][melbTime.getMonth()]}`,
    
    // Weather
    temp: mockWeather.temp,
    condition: mockWeather.condition,
    umbrella: false,
    
    // Summary bar
    leave_in_minutes: leaveInMins,
    arrive_by: arrivalTime,
    total_minutes: totalMins,
    status_type: coffeeDecision.urgent ? 'rush' : 'normal',
    
    // Journey legs (V10 format - uses journey_legs key)
    journey_legs: formattedLegs,
    legs: formattedLegs,  // Also include as 'legs' for compatibility
    
    // Footer
    destination: 'WORK',
    coffee_decision: coffeeDecision.decision,
    
    // Extra for context
    pattern: config.journey.pattern || 'coffee-before-multi-modal'
  };
  
  console.log('   [OK] Data model built');
  console.log(`   Leave in: ${leaveInMins} min`);
  console.log(`   Arrive by: ${arrivalTime}`);
  console.log(`   Total: ${totalMins} min`);
  console.log(`   Journey legs: ${formattedLegs.length}`);
  console.log();

  console.log('6. Rendering dashboard PNG...');
  console.log('-'.repeat(50));
  
  try {
    const pngBuffer = await renderFullDashboard(dashboardData);
    
    if (pngBuffer && pngBuffer.length > 0) {
      const outputPath = path.join(process.cwd(), 'tests', 'output-admin-simulation.png');
      fs.writeFileSync(outputPath, pngBuffer);
      console.log(`   [OK] Dashboard rendered: ${pngBuffer.length} bytes`);
      console.log(`   Saved to: ${outputPath}`);
    } else {
      console.log('   [!] Empty render result');
    }
  } catch (error) {
    console.log(`   [FAIL] Render error: ${error.message}`);
    
    // Fallback: render a simplified version
    console.log('   Attempting simplified render...');
    await renderSimplified(dashboardData);
  }
  console.log();

  console.log('7. Summary');
  console.log('-'.repeat(50));
  console.log(`   [Home] Home -> [Coffee] Coffee -> [Tram] Tram -> [Train] Train -> [Office] Work`);
  console.log(`   Total journey: ${config.preferredRoute?.totalMinutes || 29} minutes`);
  console.log(`   Coffee: ${coffeeDecision.canGet ? '[OK] YES' : '[FAIL] NO'} (${coffeeDecision.decision})`);
  console.log(`   Next tram: ${mockTransitData.trams[0].minutes}m (Route ${mockTransitData.trams[0].routeNumber})`);
  console.log(`   Next train: ${mockTransitData.trains[0].minutes}m (${mockTransitData.trains[0].routeName})`);
  console.log();

  console.log('[OK] Admin simulation complete!');
  console.log('=======================================');
}

// Helper functions
function buildLegTitle(seg) {
  switch (seg.type) {
    case 'walk': return `Walk to ${seg.to}`;
    case 'coffee': return `[Coffee] ${seg.location}`;
    case 'tram': return `[Tram] Tram ${seg.route}`;
    case 'train': return `[Train] ${seg.line} Line`;
    default: return seg.type;
  }
}

function buildLegSubtitle(seg, transit, coffee) {
  switch (seg.type) {
    case 'walk': return `${seg.minutes} min walk`;
    case 'coffee': return coffee?.canGet ? 'TIME FOR COFFEE' : 'SKIP';
    case 'tram': return `${seg.from} → ${seg.to}`;
    case 'train': return `${seg.from} → ${seg.to}`;
    default: return '';
  }
}

function getIcon(type) {
  const icons = { walk: 'WALK', coffee: '[Coffee]', tram: '[Tram]', train: '[Train]', bus: '[Bus]' };
  return icons[type] || '•';
}

function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function calculateLeaveTime(arrival, journeyMinutes) {
  const [h, m] = arrival.split(':').map(Number);
  const arrivalMins = h * 60 + m;
  const leaveMins = arrivalMins - journeyMinutes;
  const leaveH = Math.floor(leaveMins / 60);
  const leaveM = leaveMins % 60;
  return `${leaveH}:${leaveM.toString().padStart(2, '0')}`;
}

async function renderSimplified(data) {
  // Use the V11 renderer directly
  const { createCanvas } = await import('canvas');
  const canvas = createCanvas(800, 480);
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 800, 480);
  
  // Header - time
  ctx.fillStyle = '#000';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(data.header.time, 20, 50);
  
  ctx.font = '18px sans-serif';
  ctx.fillText(`${data.header.day} ${data.header.date}`, 20, 75);
  
  // Weather
  ctx.font = '24px sans-serif';
  ctx.fillText(`${data.weather.temp}° ${data.weather.condition}`, 600, 40);
  
  // Status bar
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 90, 800, 35);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`Leave by ${data.journey.leaveBy}`, 20, 112);
  ctx.fillText(`• ${data.journey.coffeeDecision.subtext}`, 400, 112);
  
  // Journey legs
  let y = 150;
  for (const leg of data.journey.legs) {
    ctx.fillStyle = leg.state === 'skip' ? '#999' : '#000';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${getIcon(leg.type)} ${leg.title}`, 30, y);
    
    ctx.font = '14px sans-serif';
    ctx.fillText(leg.subtitle, 50, y + 20);
    
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${leg.liveMinutes || leg.minutes}m`, 720, y + 10);
    
    y += 50;
  }
  
  // Footer
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 440, 800, 40);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  const footerText = data.journey.coffeeDecision.canGet ? '[Coffee] GET COFFEE' : '[!] GO DIRECT';
  ctx.fillText(footerText, 20, 465);
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  const outputPath = path.join(process.cwd(), 'tests', 'output-admin-simulation.png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`   [OK] Simplified render saved: ${buffer.length} bytes`);
}

runSimulation().catch(console.error);
