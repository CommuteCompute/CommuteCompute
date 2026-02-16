/**
 * Journey Display API - Express router for journey display endpoints
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import express from 'express';
import { TransportMode, JourneyDisplay, JourneyStep, StepStatus, JourneyStatus } from './models.js';
import { JourneyDisplayEngine, JourneyConfig, TransitLegConfig } from './engine.js';
import JourneyDisplayRenderer from './renderer.js';
import { getDiffTracker } from './diff.js';

const router = express.Router();
let engine = null, renderer = null, currentJourney = null, journeyConfig = null;

export function initJourneyDisplay(preferences) {
  engine = new JourneyDisplayEngine(); renderer = new JourneyDisplayRenderer();
  updateConfigFromPreferences(preferences);
}

export function updateConfigFromPreferences(preferences) {
  const prefs = preferences?.get() || {};
  journeyConfig = new JourneyConfig({
    homeAddress: prefs.addresses?.home || 'Home Address (configure in Setup Wizard)',
    workAddress: prefs.addresses?.work || 'Work Address (configure in Setup Wizard)',
    cafeEnabled: prefs.coffee?.enabled !== false,
    cafeName: prefs.addresses?.cafeName || prefs.coffee?.name || 'Local Cafe',
    cafeAddress: prefs.addresses?.cafe || '',
    cafeDuration: prefs.coffee?.duration || 5,
    cafePosition: prefs.coffee?.position || 'before-transit',
    targetArrivalTime: prefs.journey?.arrivalTime || prefs.arrivalTime || '09:00',
    state: prefs.state || prefs.location?.state || 'VIC',
    transitSteps: buildTransitSteps(prefs),
    walkingTimes: prefs.manualWalkingTimes || {}
  });
}

function buildTransitSteps(prefs) {
  const steps = [], route = prefs.journey?.transitRoute || {};
  for (let i = 1; i <= (route.numberOfModes || 2); i++) {
    const m = route[`mode${i}`]; if (!m) continue;
    steps.push(new TransitLegConfig({ mode: m.type ?? m.routeType ?? TransportMode.TRAIN, routeNumber: m.routeNumber,
      originStopName: m.originStation?.name || '', destinationStopName: m.destinationStation?.name || '',
      direction: m.direction || `to ${m.destinationStation?.name || 'Destination'}`, estimatedDuration: m.estimatedDuration || 15 }));
  }
  return steps;
}

export async function calculateJourney(liveData = {}) {
  if (!engine || !journeyConfig) throw new Error('Journey display not initialized');
  currentJourney = engine.buildJourneyDisplay(journeyConfig, liveData);
  return currentJourney;
}

export function getCurrentJourney() { return currentJourney; }
export function renderJourneyPNG(journey) { if (!renderer) throw new Error('Renderer not initialized'); return renderer.render(journey || currentJourney); }
export function renderJourneyBase64(journey) { if (!renderer) throw new Error('Renderer not initialized'); return renderer.renderBase64(journey || currentJourney); }

async function getLiveDataFromServices() {
  const liveData = { liveDepartures: [], disruptions: [], weather: null };
  try { if (global.weatherBOM) { const w = await global.weatherBOM.getCurrentWeather(); if (w) liveData.weather = { temperature: w.temperature, condition: w.condition?.short || w.description }; } } catch (e) { /* weather fetch failed */ }
  return liveData;
}

router.get('/', async (req, res) => {
  try {
    const format = req.query.format || 'png';
    if (!currentJourney) await calculateJourney(await getLiveDataFromServices());
    if (format === 'json') res.json(currentJourney.toJSON());
    else if (format === 'base64') res.json({ image: renderJourneyBase64(currentJourney) });
    else { res.set('Content-Type', 'image/png'); res.set('Cache-Control', 'no-cache'); res.send(renderJourneyPNG(currentJourney)); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/regions', async (req, res) => {
  try {
    await calculateJourney(await getLiveDataFromServices());
    const diffTracker = getDiffTracker(), changes = diffTracker.calculateChanges(currentJourney);
    res.json({ changed: changes.changed, regions: diffTracker.getMergedRegions(changes.regions), needsFullRefresh: changes.needsFullRefresh, stats: diffTracker.getStats() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/preview', async (req, res) => {
  try {
    await calculateJourney(await getLiveDataFromServices());
    res.send(`<!DOCTYPE html><html><head><title>Journey Display</title><meta http-equiv="refresh" content="20"><style>body{margin:0;padding:20px;background:#333;display:flex;flex-direction:column;align-items:center}h1{color:white}.display{width:800px;height:480px;background:white;border:4px solid #000;border-radius:8px;overflow:hidden}.display img{width:100%;height:100%}.info{color:#aaa;margin-top:20px}</style></head><body><h1>CC Journey Display</h1><div class="display"><img src="/api/journey-display?t=${Date.now()}"></div><div class="info">Auto-refreshes every 20s | ${new Date().toLocaleString()}</div></body></html>`);
  } catch (e) { res.status(500).send(`<h1>Error</h1><pre>${e.message}</pre>`); }
});

router.get('/trmnl', async (req, res) => {
  try {
    await calculateJourney(await getLiveDataFromServices());
    res.json({ image: renderJourneyBase64(currentJourney), orientation: 'landscape', refresh_rate: 20 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kindle device resolutions
const KINDLE_DEVICES = {
  'kindle-pw3': { width: 1072, height: 1448, name: 'Kindle Paperwhite 3' },
  'kindle-pw4': { width: 1072, height: 1448, name: 'Kindle Paperwhite 4' },
  'kindle-pw5': { width: 1236, height: 1648, name: 'Kindle Paperwhite 5' },
  'kindle-basic-10': { width: 600, height: 800, name: 'Kindle Basic (10th gen)' },
  'kindle-11': { width: 1072, height: 1448, name: 'Kindle (11th gen)' },
  'default': { width: 1072, height: 1448, name: 'Default Kindle' }
};

// Kindle endpoint - returns HTML for Kindle extension to render
router.get('/kindle', async (req, res) => {
  try {
    const model = req.query.model || 'default';
    const deviceConfig = KINDLE_DEVICES[model] || KINDLE_DEVICES['default'];
    
    await calculateJourney(await getLiveDataFromServices());
    const journey = currentJourney;
    
    // Generate HTML optimised for Kindle e-ink
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:serif;background:#fff;color:#000;width:${deviceConfig.width}px;height:${deviceConfig.height}px;padding:20px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px}
.origin{font-size:14px;font-weight:bold}
.time{font-size:48px;font-weight:bold}
.date{text-align:center}
.weather{border:2px solid #000;padding:10px;text-align:center}
.weather .temp{font-size:28px;font-weight:bold}
.status-bar{background:#000;color:#fff;padding:8px 15px;margin:10px 0;display:flex;justify-content:space-between}
.step{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #ccc}
.step-num{width:30px;height:30px;border-radius:50%;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;margin-right:15px}
.step.skipped{opacity:0.5}.step.skipped .step-num{background:transparent;border:2px dashed #000;color:#000}
.step.cancelled{background:repeating-linear-gradient(45deg,#fff,#fff 5px,#ddd 5px,#ddd 10px)}
.step-content{flex:1}
.step-title{font-size:16px;font-weight:bold}
.step-subtitle{font-size:12px;color:#666}
.step-duration{text-align:right;font-size:24px;font-weight:bold}
.step-duration small{display:block;font-size:10px;font-weight:normal}
.footer{position:absolute;bottom:20px;left:20px;right:20px;display:flex;justify-content:space-between;border-top:2px solid #000;padding-top:10px}
</style></head>
<body>
<div class="header">
  <div><div class="origin">${journey.originAddress}</div><div class="time">${journey.currentTime.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:false})}</div></div>
  <div class="date"><strong>${journey.dayOfWeek}</strong><br>${journey.dateString}</div>
  <div class="weather"><div class="temp">${journey.temperature || '--'}°</div><div>${journey.weatherCondition}</div><div style="margin-top:5px;font-size:11px;${journey.bringUmbrella?'background:#000;color:#fff;padding:2px 5px':''}">${journey.bringUmbrella?'BRING UMBRELLA':'NO UMBRELLA'}</div></div>
</div>
<div class="status-bar"><span>${journey.getStatusBarText()}</span><span>${journey.totalDuration} min</span></div>
${journey.steps.slice(0,6).map((s,i)=>`
<div class="step ${s.status}">
  <div class="step-num">${s.status==='cancelled'?'X':i+1}</div>
  <div class="step-content"><div class="step-title">${s.title}</div><div class="step-subtitle">${s.subtitle}</div></div>
  <div class="step-duration">${s.status==='cancelled'?'CANCELLED':(s.status==='extended'?'~':'')+s.getDurationDisplay()}<small>${s.getDurationLabel()}</small></div>
</div>`).join('')}
<div class="footer">
  <div style="font-weight:bold">${journey.isHomebound?'HOME — ':''}${journey.destinationAddress}</div>
  <div>ARRIVE <strong style="font-size:20px">${journey.arrivalTime?journey.arrivalTime.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit',hour12:false}):'--:--'}</strong></div>
</div>
</body></html>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) { res.status(500).send(`<h1>Error</h1><pre>${e.message}</pre>`); }
});

router.get('/demo', async (req, res) => {
  try {
    const scenario = req.query.scenario || 'normal', format = req.query.format || 'png';
    const demo = createDemoJourney(scenario);
    if (format === 'json') res.json(demo.toJSON());
    else if (format === 'base64') res.json({ image: renderer.renderBase64(demo), scenario });
    else { res.set('Content-Type', 'image/png'); res.send(renderer.render(demo)); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function createDemoJourney(scenario) {
  const now = new Date(), arrival = new Date(now); arrival.setHours(9, 0, 0, 0);
  if (arrival < now) arrival.setDate(arrival.getDate() + 1);
  // Demo journey - uses generic addresses (not personal data)
  const journey = new JourneyDisplay({
    originAddress: 'HOME', destinationAddress: 'WORK', currentTime: now,
    dayOfWeek: now.toLocaleDateString('en-AU', { weekday: 'long' }), dateString: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }),
    arrivalTime: arrival, temperature: 22, weatherCondition: 'Sunny', bringUmbrella: false, destinationLabel: 'WORK', dataSource: 'demo'
  });
  journey.addStep(new JourneyStep({ mode: TransportMode.WALK, title: 'Walk to Cafe', subtitle: 'From home', duration: 4 }));
  journey.addStep(new JourneyStep({ mode: TransportMode.COFFEE, title: 'Coffee Stop', subtitle: '[OK] TIME FOR COFFEE', duration: 5, coffeeDecision: 'time', isOptional: true }));
  journey.addStep(new JourneyStep({ mode: TransportMode.WALK, title: 'Walk to Station', subtitle: 'Platform 1', duration: 6 }));
  journey.addStep(new JourneyStep({ mode: TransportMode.TRAIN, title: 'Train to City', subtitle: 'City Loop • Next: 5, 12 min', duration: 5, nextDepartures: [5, 12] }));
  journey.addStep(new JourneyStep({ mode: TransportMode.WALK, title: 'Walk to Office', subtitle: 'Station → Office', duration: 26 }));
  
  if (scenario === 'delay') { journey.applyDelayToStep(4, 8); journey.steps[3].subtitle = 'City Loop • +8 MIN • Next: 12, 20 min'; }
  else if (scenario === 'skip-coffee') { journey.skipStep(2, 'Running late'); journey.steps[0].title = 'Walk past Cafe'; }
  else if (scenario === 'disruption') { journey.cancelStep(4, 'Signal fault'); journey.steps[3].title = '▲ Train Line'; journey.steps[3].subtitle = 'SUSPENDED — Signal fault'; journey.extendStep(2, 5, 'Disruption'); journey.steps[1].subtitle = '[OK] EXTRA TIME -- Disruption'; }
  
  journey.recalculateTotals();
  return journey;
}

export { router as journeyDisplayRouter };
export default { router, initJourneyDisplay, updateConfigFromPreferences, calculateJourney, getCurrentJourney, renderJourneyPNG, renderJourneyBase64 };
