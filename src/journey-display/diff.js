/**
 * Journey Display Diff System - Region change tracking for partial refresh
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import crypto from 'crypto';
import { DisplayRegions } from './models.js';

class RegionState { constructor(name) { this.name = name; this.hash = null; this.lastUpdated = null; }
  update(hash) { const changed = this.hash !== hash; this.hash = hash; this.lastUpdated = Date.now(); return changed; }
}

function hashSection(data) { return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 16); }

export class JourneyDisplayDiff {
  constructor() {
    this.regions = { header: new RegionState('header'), status_bar: new RegionState('status_bar'),
      step_1: new RegionState('step_1'), step_2: new RegionState('step_2'), step_3: new RegionState('step_3'),
      step_4: new RegionState('step_4'), step_5: new RegionState('step_5'), footer: new RegionState('footer') };
    this.lastFullRender = null; this.renderCount = 0; this.fullRefreshInterval = 30;
  }
  
  calculateChanges(journey) {
    this.renderCount++;
    if (this.renderCount >= this.fullRefreshInterval) {
      this.renderCount = 0; this.lastFullRender = Date.now();
      return { changed: Object.keys(this.regions), regions: [{ x: 0, y: 0, width: 800, height: 480 }], needsFullRefresh: true };
    }
    
    const changed = [], regionRects = [];
    if (this.regions.header.update(hashSection({ time: journey.currentTime.getMinutes(), temp: journey.temperature, condition: journey.weatherCondition, umbrella: journey.bringUmbrella }))) { changed.push('header'); regionRects.push(DisplayRegions.HEADER.toRect()); }
    if (this.regions.status_bar.update(hashSection({ status: journey.status, delay: journey.delayMinutes, total: journey.totalDuration }))) { changed.push('status_bar'); regionRects.push(DisplayRegions.STATUS_BAR.toRect()); }
    
    const stepRegions = ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'];
    const stepDisplayRegions = [DisplayRegions.STEP_1, DisplayRegions.STEP_2, DisplayRegions.STEP_3, DisplayRegions.STEP_4, DisplayRegions.STEP_5];
    for (let i = 0; i < stepRegions.length; i++) {
      const step = journey.steps[i];
      if (this.regions[stepRegions[i]].update(hashSection(step ? { status: step.status, delay: step.delayMinutes, duration: step.actualDuration, coffee: step.coffeeDecision } : null))) { changed.push(stepRegions[i]); regionRects.push(stepDisplayRegions[i].toRect()); }
    }
    
    if (this.regions.footer.update(hashSection({ arrival: journey.arrivalTime?.getTime(), homebound: journey.isHomebound }))) { changed.push('footer'); regionRects.push(DisplayRegions.FOOTER.toRect()); }
    return { changed, regions: regionRects, needsFullRefresh: false };
  }
  
  getMergedRegions(regions) {
    if (regions.length <= 1) return regions;
    const sorted = [...regions].sort((a, b) => a.y - b.y);
    const merged = []; let current = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i];
      if (r.y <= current.y + current.height + 10) { current.height = Math.max(current.y + current.height, r.y + r.height) - current.y; }
      else { merged.push(current); current = { ...r }; }
    }
    merged.push(current); return merged;
  }
  
  reset() { for (const r of Object.values(this.regions)) { r.hash = null; r.lastUpdated = null; } this.renderCount = 0; }
  getStats() { const stats = {}; for (const [n, r] of Object.entries(this.regions)) stats[n] = { hash: r.hash?.slice(0, 8), lastUpdated: r.lastUpdated ? new Date(r.lastUpdated).toISOString() : null }; return { renderCount: this.renderCount, lastFullRender: this.lastFullRender ? new Date(this.lastFullRender).toISOString() : null, regions: stats }; }
}

let diffTrackerInstance = null;
export function getDiffTracker() { if (!diffTrackerInstance) diffTrackerInstance = new JourneyDisplayDiff(); return diffTrackerInstance; }
export default JourneyDisplayDiff;
