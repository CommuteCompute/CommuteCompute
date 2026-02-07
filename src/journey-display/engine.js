/**
 * Journey Display Engine
 * Calculates optimal journey with live updates, delays, disruptions, and coffee decisions
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { TransportMode, StepStatus, JourneyStatus, UmbrellaConditions, JourneyStep, JourneyDisplay } from './models.js';

export class JourneyConfig {
  constructor(options = {}) {
    this.homeAddress = options.homeAddress || ''; this.homeCoords = options.homeCoords || null;
    this.workAddress = options.workAddress || ''; this.workCoords = options.workCoords || null;
    this.cafeEnabled = options.cafeEnabled !== false; this.cafeName = options.cafeName || '';
    this.cafeAddress = options.cafeAddress || ''; this.cafeCoords = options.cafeCoords || null;
    this.cafeDuration = options.cafeDuration || 5; this.cafePosition = options.cafePosition || 'before-transit';
    this.targetArrivalTime = options.targetArrivalTime || '09:00';
    this.transitSteps = options.transitSteps || []; this.walkingTimes = options.walkingTimes || {};
    this.state = options.state || 'VIC';
  }
}

export class TransitLegConfig {
  constructor(options = {}) {
    this.mode = options.mode || TransportMode.TRAIN; this.routeNumber = options.routeNumber || null;
    this.routeName = options.routeName || ''; this.originStopId = options.originStopId || '';
    this.originStopName = options.originStopName || ''; this.originLat = options.originLat;
    this.originLon = options.originLon; this.destinationStopId = options.destinationStopId || '';
    this.destinationStopName = options.destinationStopName || ''; this.destinationLat = options.destinationLat;
    this.destinationLon = options.destinationLon; this.direction = options.direction || '';
    this.estimatedDuration = options.estimatedDuration || 10; this.platform = options.platform || null;
  }
}

export class LiveDeparture {
  constructor(options = {}) {
    this.routeId = options.routeId || ''; this.routeNumber = options.routeNumber || '';
    this.direction = options.direction || ''; this.scheduledTime = options.scheduledTime || null;
    this.estimatedTime = options.estimatedTime || null; this.platform = options.platform || null;
    this.delayMinutes = options.delayMinutes || 0; this.isCancelled = options.isCancelled || false;
  }
  getMinutesUntil(fromTime = new Date()) {
    const depTime = this.estimatedTime || this.scheduledTime;
    if (!depTime) return null;
    return Math.round((depTime.getTime() - fromTime.getTime()) / 60000);
  }
}

export class Disruption {
  constructor(options = {}) {
    this.type = options.type || 'delay'; this.routeId = options.routeId || '';
    this.lineName = options.lineName || ''; this.title = options.title || '';
    this.description = options.description || ''; this.severity = options.severity || 'minor';
    this.affectsJourney = options.affectsJourney || false; this.alternativeRoute = options.alternativeRoute || null;
  }
}

export class JourneyDisplayEngine {
  constructor() { this.WALKING_SPEED = 80; this.MIN_COFFEE_SLACK = 3; this.BUFFER_TIME = 2; }
  
  getTimezoneForState(state) {
    const tz = { 'VIC': 'Australia/Melbourne', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney', 'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth', 'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin' };
    return tz[state] || 'Australia/Melbourne';
  }
  
  getCurrentTime(state) { return new Date(new Date().toLocaleString('en-US', { timeZone: this.getTimezoneForState(state) })); }
  
  calculateWalkingTime(fromCoords, toCoords) {
    if (!fromCoords || !toCoords) return 5;
    return Math.ceil(this.haversineDistance(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon) / this.WALKING_SPEED);
  }
  
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; const φ1 = lat1 * Math.PI / 180; const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180; const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  
  buildJourneyDisplay(config, liveData = {}) {
    const { liveDepartures = [], disruptions = [], weather = null } = liveData;
    const now = this.getCurrentTime(config.state);
    const timezone = this.getTimezoneForState(config.state);
    const [targetHour, targetMin] = config.targetArrivalTime.split(':').map(Number);
    const arrivalTime = new Date(now); arrivalTime.setHours(targetHour, targetMin, 0, 0);
    if (arrivalTime < now) arrivalTime.setDate(arrivalTime.getDate() + 1);
    
    const journey = new JourneyDisplay({
      originAddress: config.homeAddress, destinationAddress: config.workAddress, currentTime: now,
      dayOfWeek: now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: timezone }),
      dateString: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: timezone }),
      arrivalTime, destinationLabel: config.workAddress, isHomebound: false,
      dataSource: liveDepartures.length > 0 ? 'live' : 'fallback'
    });
    
    if (weather) {
      journey.temperature = weather.temperature; journey.weatherCondition = weather.condition;
      journey.bringUmbrella = UmbrellaConditions.some(c => weather.condition?.toLowerCase().includes(c));
    }
    
    this.buildSteps(journey, config, liveDepartures, disruptions);
    this.applyDisruptions(journey, disruptions);
    this.makeCoffeeDecision(journey, config);
    this.calculateJourneyStatus(journey, now);
    return journey;
  }
  
  buildSteps(journey, config, liveDepartures, disruptions) {
    let stepNumber = 1;
    const coffeeBeforeTransit = config.cafeEnabled && (!config.cafePosition || config.cafePosition === 'before-transit');
    
    if (coffeeBeforeTransit && config.cafeName) {
      journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.WALK, title: `Walk to ${config.cafeName}`, subtitle: `From home • ${config.cafeAddress?.split(',')[0] || ''}`, duration: config.walkingTimes.homeToCafe || 4 }));
      journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.COFFEE, title: `Coffee at ${config.cafeName}`, subtitle: '[OK] TIME FOR COFFEE', duration: config.cafeDuration, coffeeDecision: 'time', isOptional: true }));
      if (config.transitSteps.length > 0) {
        const firstTransit = config.transitSteps[0];
        journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.WALK, title: `Walk to ${firstTransit.originStopName}`, subtitle: firstTransit.platform ? `Platform ${firstTransit.platform}` : '', duration: config.walkingTimes.cafeToTransit || 5 }));
      }
    } else if (config.transitSteps.length > 0) {
      const firstTransit = config.transitSteps[0];
      journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.WALK, title: `Walk to ${firstTransit.originStopName}`, subtitle: `From home`, duration: config.walkingTimes.homeToTransit || 5 }));
    }
    
    for (let i = 0; i < config.transitSteps.length; i++) {
      const tc = config.transitSteps[i];
      const liveDep = liveDepartures.find(d => d.routeNumber === tc.routeNumber);
      const modeNames = { [TransportMode.TRAIN]: 'Train', [TransportMode.TRAM]: 'Tram', [TransportMode.BUS]: 'Bus' };
      const title = tc.routeNumber ? `${modeNames[tc.mode] || 'Transit'} ${tc.routeNumber} ${tc.direction}` : `${modeNames[tc.mode] || 'Transit'} to ${tc.destinationStopName}`;
      const step = new JourneyStep({
        stepNumber: stepNumber++, mode: tc.mode, title, subtitle: `${tc.originStopName}${liveDep?.delayMinutes > 0 ? ` • +${liveDep.delayMinutes} MIN` : ''} • Next: ${tc.estimatedDuration}, ${tc.estimatedDuration + 8} min`,
        duration: tc.estimatedDuration, routeNumber: tc.routeNumber, direction: tc.direction, platform: liveDep?.platform || tc.platform,
        nextDepartures: [tc.estimatedDuration, tc.estimatedDuration + 8], delayMinutes: liveDep?.delayMinutes || 0
      });
      if (liveDep?.delayMinutes > 0) { step.status = StepStatus.DELAYED; step.actualDuration = step.duration + liveDep.delayMinutes; }
      if (liveDep?.isCancelled) { step.status = StepStatus.CANCELLED; step.disruptionMessage = 'Service cancelled'; }
      journey.addStep(step);
      
      if (i < config.transitSteps.length - 1) {
        const next = config.transitSteps[i + 1];
        journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.WALK, title: `Walk to ${next.originStopName}`, subtitle: `${tc.destinationStopName}`, duration: 5 }));
      }
    }
    
    journey.addStep(new JourneyStep({ stepNumber: stepNumber++, mode: TransportMode.WALK, title: 'Walk to Office', subtitle: `→ ${config.workAddress?.split(',')[0] || 'Work'}`, duration: config.walkingTimes.transitToWork || 5 }));
  }
  
  applyDisruptions(journey, disruptions) {
    for (const d of disruptions) {
      if (!d.affectsJourney) continue;
      const step = journey.steps.find(s => s.routeNumber && d.lineName?.includes(s.routeNumber));
      if (!step) continue;
      if (d.type === 'suspension') { step.status = StepStatus.CANCELLED; step.disruptionMessage = d.description || 'Service suspended'; }
      else if (d.type === 'diversion') { step.status = StepStatus.DIVERTED; step.diversionMessage = d.description; step.delayMinutes = d.delayMinutes || 5; step.actualDuration = step.duration + step.delayMinutes; }
      else if (d.type === 'delay' && d.delayMinutes) { step.status = StepStatus.DELAYED; step.delayMinutes = d.delayMinutes; step.actualDuration = step.duration + d.delayMinutes; }
    }
    journey.recalculateTotals();
  }
  
  makeCoffeeDecision(journey, config) {
    if (!config.cafeEnabled) return;
    const coffeeStep = journey.steps.find(s => s.mode === TransportMode.COFFEE);
    if (!coffeeStep) return;
    const journeyWithoutCoffee = journey.steps.filter(s => s.mode !== TransportMode.COFFEE && s.status !== StepStatus.CANCELLED).reduce((sum, s) => sum + (s.actualDuration || s.duration), 0);
    const availableMinutes = Math.round((journey.arrivalTime.getTime() - journey.currentTime.getTime()) / 60000);
    const slackTime = availableMinutes - journeyWithoutCoffee;
    const hasDisruption = journey.steps.some(s => s.status === StepStatus.CANCELLED || s.status === StepStatus.DELAYED);
    
    if (slackTime < config.cafeDuration + this.MIN_COFFEE_SLACK) {
      coffeeStep.status = StepStatus.SKIPPED; coffeeStep.coffeeDecision = 'skip'; coffeeStep.coffeeReason = 'Running late';
      coffeeStep.subtitle = '[X] SKIP -- Running late'; coffeeStep.actualDuration = 0;
      const walkToCafe = journey.steps.find(s => s.mode === TransportMode.WALK && s.title.includes(config.cafeName));
      if (walkToCafe) { walkToCafe.title = `Walk past ${config.cafeName}`; }
    } else if (hasDisruption && slackTime > config.cafeDuration + 10) {
      coffeeStep.status = StepStatus.EXTENDED; coffeeStep.coffeeDecision = 'extra'; coffeeStep.coffeeReason = 'Disruption';
      coffeeStep.subtitle = '[OK] EXTRA TIME -- Disruption'; coffeeStep.actualDuration = config.cafeDuration + 5;
    }
    journey.recalculateTotals();
  }
  
  calculateJourneyStatus(journey, now) {
    // Per Angus 2026-02-01: Engine should only ever show LEAVE_NOW timing
    // No buffer time ("leave in X min") - always show current departure journey
    const hasCancellation = journey.steps.some(s => s.status === StepStatus.CANCELLED);
    const hasDiversion = journey.steps.some(s => s.status === StepStatus.DIVERTED);
    if (hasCancellation) journey.status = JourneyStatus.DISRUPTION;
    else if (hasDiversion) { journey.status = JourneyStatus.DIVERSION; journey.statusMessage = 'ROUTE DIVERTED'; }
    else if (journey.delayMinutes > 0) journey.status = JourneyStatus.DELAY;
    else journey.status = JourneyStatus.LEAVE_NOW;  // Always LEAVE_NOW for normal state
  }
}

export default JourneyDisplayEngine;
