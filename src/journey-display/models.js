/**
 * Journey Display Data Models
 * Defines the structure for multi-leg journey planning display
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export const TransportMode = {
  TRAIN: 0, TRAM: 1, BUS: 2, VLINE: 3, FERRY: 4, WALK: 'walk', COFFEE: 'coffee'
};

export const ModeConfig = {
  [TransportMode.TRAIN]: { name: 'Train', icon: '[Train]', iconChar: '□', color: '#0072CE' },
  [TransportMode.TRAM]: { name: 'Tram', icon: '[Tram]', iconChar: '⊞', color: '#78BE20' },
  [TransportMode.BUS]: { name: 'Bus', icon: '[Bus]', iconChar: '▣', color: '#FF8200' },
  [TransportMode.VLINE]: { name: 'V/Line', icon: '[Train]', iconChar: '▤', color: '#8E44AD' },
  [TransportMode.FERRY]: { name: 'Ferry', icon: '[Ferry]', iconChar: '◈', color: '#00A0D6' },
  [TransportMode.WALK]: { name: 'Walk', icon: 'WALK', iconChar: '⚉', color: '#333333' },
  [TransportMode.COFFEE]: { name: 'Coffee', icon: '[Coffee]', iconChar: '[Coffee]', color: '#6F4E37' }
};

export const StepStatus = {
  NORMAL: 'normal', ACTIVE: 'active', DELAYED: 'delayed', SKIPPED: 'skipped',
  CANCELLED: 'cancelled', DIVERTED: 'diverted', EXTENDED: 'extended', COMPLETED: 'completed'
};

export const JourneyStatus = {
  ON_TIME: 'on_time', DELAY: 'delay', DISRUPTION: 'disruption', DIVERSION: 'diversion', LEAVE_NOW: 'leave_now'
};

export const UmbrellaConditions = ['rain', 'showers', 'drizzle', 'storm', 'thunderstorm'];

export class JourneyStep {
  constructor(options = {}) {
    this.stepNumber = options.stepNumber || 1;
    this.mode = options.mode || TransportMode.WALK;
    this.title = options.title || '';
    this.subtitle = options.subtitle || '';
    this.duration = options.duration || 0;
    this.actualDuration = options.actualDuration || options.duration || 0;
    this.delayMinutes = options.delayMinutes || 0;
    this.status = options.status || StepStatus.NORMAL;
    this.routeNumber = options.routeNumber || null;
    this.direction = options.direction || null;
    this.platform = options.platform || null;
    this.nextDepartures = options.nextDepartures || [];
    this.fromLocation = options.fromLocation || null;
    this.toLocation = options.toLocation || null;
    this.coffeeDecision = options.coffeeDecision || null;
    this.coffeeReason = options.coffeeReason || null;
    this.disruptionMessage = options.disruptionMessage || null;
    this.diversionMessage = options.diversionMessage || null;
    this.showNextDepartures = options.showNextDepartures !== false;
    this.isOptional = options.isOptional || false;
  }
  
  getDurationLabel() {
    return this.mode === TransportMode.WALK ? 'MIN WALK' : 'MIN';
  }
  
  getDurationDisplay() {
    if (this.status === StepStatus.CANCELLED) return 'CANCELLED';
    if (this.mode === TransportMode.COFFEE && this.status === StepStatus.EXTENDED) return `~${this.actualDuration}`;
    return this.delayMinutes > 0 ? this.actualDuration : this.duration;
  }
  
  hasDelay() { return this.delayMinutes > 0 && this.status !== StepStatus.CANCELLED; }
  getModeConfig() { return ModeConfig[this.mode] || ModeConfig[TransportMode.WALK]; }
}

export class JourneyDisplay {
  constructor(options = {}) {
    this.originAddress = options.originAddress || '';
    this.destinationAddress = options.destinationAddress || '';
    this.currentTime = options.currentTime || new Date();
    this.dayOfWeek = options.dayOfWeek || '';
    this.dateString = options.dateString || '';
    this.temperature = options.temperature || null;
    this.weatherCondition = options.weatherCondition || '';
    this.bringUmbrella = options.bringUmbrella || false;
    this.status = options.status || JourneyStatus.ON_TIME;
    this.arrivalTime = options.arrivalTime || null;
    this.delayMinutes = options.delayMinutes || 0;
    this.statusMessage = options.statusMessage || '';
    this.totalDuration = options.totalDuration || 0;
    this.steps = options.steps || [];
    this.destinationLabel = options.destinationLabel || '';
    this.isHomebound = options.isHomebound || false;
    this.lastUpdated = options.lastUpdated || new Date();
    this.dataSource = options.dataSource || 'live';
  }
  
  getStatusBarText() {
    const arrivalStr = this.arrivalTime ? 
      this.arrivalTime.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: false }) : '--:--';
    switch (this.status) {
      case JourneyStatus.LEAVE_NOW: return `LEAVE NOW → Arrive ${arrivalStr}`;
      case JourneyStatus.DELAY: return `□ DELAY → Arrive ${arrivalStr} (+${this.delayMinutes} min)`;
      case JourneyStatus.DISRUPTION: return `▲ DISRUPTION → Arrive ${arrivalStr} (+${this.delayMinutes} min)`;
      case JourneyStatus.DIVERSION: return `▲ ${this.statusMessage} → Arrive ${arrivalStr} (+${this.delayMinutes} min)`;
      default: return `LEAVE NOW → Arrive ${arrivalStr}`;  // Always LEAVE NOW - per Angus 2026-02-01
    }
  }
  
  getLeaveInMinutes() {
    if (!this.arrivalTime) return 0;
    const totalTripMinutes = this.steps.reduce((sum, s) => sum + (s.actualDuration || s.duration), 0);
    const leaveTime = new Date(this.arrivalTime.getTime() - totalTripMinutes * 60000);
    return Math.max(0, Math.round((leaveTime.getTime() - this.currentTime.getTime()) / 60000));
  }
  
  getWeatherDisplay() {
    return { temp: this.temperature !== null ? `${this.temperature}°` : '--°', condition: this.weatherCondition || 'Unknown', umbrella: this.bringUmbrella };
  }
  
  addStep(step) {
    if (!(step instanceof JourneyStep)) step = new JourneyStep(step);
    step.stepNumber = this.steps.length + 1;
    this.steps.push(step);
    this.recalculateTotals();
  }
  
  recalculateTotals() {
    this.totalDuration = this.steps.reduce((sum, s) => {
      if (s.status === StepStatus.SKIPPED || s.status === StepStatus.CANCELLED) return sum;
      return sum + (s.actualDuration || s.duration);
    }, 0);
    this.delayMinutes = this.steps.reduce((sum, s) => sum + (s.delayMinutes || 0), 0);
    if (this.delayMinutes > 0) {
      const hasDisruption = this.steps.some(s => s.status === StepStatus.CANCELLED || s.disruptionMessage);
      const hasDiversion = this.steps.some(s => s.status === StepStatus.DIVERTED);
      if (hasDisruption) this.status = JourneyStatus.DISRUPTION;
      else if (hasDiversion) this.status = JourneyStatus.DIVERSION;
      else this.status = JourneyStatus.DELAY;
    }
  }
  
  applyDelayToStep(stepNumber, delayMinutes, reason = null) {
    const step = this.steps.find(s => s.stepNumber === stepNumber);
    if (step) { step.delayMinutes = delayMinutes; step.actualDuration = step.duration + delayMinutes; step.status = StepStatus.DELAYED; if (reason) step.disruptionMessage = reason; this.recalculateTotals(); }
  }
  
  skipStep(stepNumber, reason = null) {
    const step = this.steps.find(s => s.stepNumber === stepNumber);
    if (step) { step.status = StepStatus.SKIPPED; step.coffeeReason = reason || 'Running late'; step.actualDuration = 0; this.recalculateTotals(); }
  }
  
  cancelStep(stepNumber, reason = null) {
    const step = this.steps.find(s => s.stepNumber === stepNumber);
    if (step) { step.status = StepStatus.CANCELLED; step.disruptionMessage = reason || 'Service cancelled'; this.recalculateTotals(); }
  }
  
  extendStep(stepNumber, extraMinutes, reason = null) {
    const step = this.steps.find(s => s.stepNumber === stepNumber);
    if (step) { step.status = StepStatus.EXTENDED; step.actualDuration = step.duration + extraMinutes; step.coffeeReason = reason || 'Extra time available'; this.recalculateTotals(); }
  }
  
  toJSON() {
    return {
      originAddress: this.originAddress, destinationAddress: this.destinationAddress, currentTime: this.currentTime.toISOString(),
      dayOfWeek: this.dayOfWeek, dateString: this.dateString, temperature: this.temperature, weatherCondition: this.weatherCondition,
      bringUmbrella: this.bringUmbrella, status: this.status, statusBarText: this.getStatusBarText(),
      arrivalTime: this.arrivalTime?.toISOString(), delayMinutes: this.delayMinutes, totalDuration: this.totalDuration,
      steps: this.steps.map(s => ({
        stepNumber: s.stepNumber, mode: s.mode, title: s.title, subtitle: s.subtitle, duration: s.duration,
        actualDuration: s.actualDuration, delayMinutes: s.delayMinutes, status: s.status, routeNumber: s.routeNumber,
        direction: s.direction, platform: s.platform, nextDepartures: s.nextDepartures, coffeeDecision: s.coffeeDecision,
        coffeeReason: s.coffeeReason, disruptionMessage: s.disruptionMessage, diversionMessage: s.diversionMessage,
        durationLabel: s.getDurationLabel(), durationDisplay: s.getDurationDisplay(), hasDelay: s.hasDelay()
      })),
      destinationLabel: this.destinationLabel, isHomebound: this.isHomebound, lastUpdated: this.lastUpdated.toISOString(), dataSource: this.dataSource
    };
  }
}

export class DisplayRegion {
  constructor(name, x, y, width, height) { this.name = name; this.x = x; this.y = y; this.width = width; this.height = height; this.lastHash = null; }
  contains(px, py) { return px >= this.x && px < this.x + this.width && py >= this.y && py < this.y + this.height; }
  toRect() { return { x: this.x, y: this.y, width: this.width, height: this.height }; }
}

export const DisplayRegions = {
  HEADER: new DisplayRegion('header', 0, 0, 800, 80),
  STATUS_BAR: new DisplayRegion('status_bar', 0, 80, 800, 30),
  STEP_1: new DisplayRegion('step_1', 0, 110, 800, 66),
  STEP_2: new DisplayRegion('step_2', 0, 176, 800, 66),
  STEP_3: new DisplayRegion('step_3', 0, 242, 800, 66),
  STEP_4: new DisplayRegion('step_4', 0, 308, 800, 66),
  STEP_5: new DisplayRegion('step_5', 0, 374, 800, 66),
  FOOTER: new DisplayRegion('footer', 0, 445, 800, 35)
};

export default { TransportMode, ModeConfig, StepStatus, JourneyStatus, UmbrellaConditions, JourneyStep, JourneyDisplay, DisplayRegion, DisplayRegions };
