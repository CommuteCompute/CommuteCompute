/**
 * CCDash™ Journey Display Module
 * Part of the Commute Compute System™
 * 
 * Server-side journey planning display for e-ink devices.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export { TransportMode, ModeConfig, StepStatus, JourneyStatus, UmbrellaConditions, JourneyStep, JourneyDisplay, DisplayRegion, DisplayRegions } from './models.js';
export { JourneyDisplayEngine, JourneyConfig, TransitLegConfig, LiveDeparture, Disruption } from './engine.js';
export { JourneyDisplayRenderer } from './renderer.js';
export { JourneyDisplayDiff, getDiffTracker } from './diff.js';
export { journeyDisplayRouter, initJourneyDisplay, updateConfigFromPreferences, calculateJourney, getCurrentJourney, renderJourneyPNG, renderJourneyBase64 } from './api.js';

export default {
  TransportMode, ModeConfig, StepStatus, JourneyStatus, JourneyStep, JourneyDisplay,
  JourneyDisplayEngine, JourneyConfig, TransitLegConfig, JourneyDisplayRenderer,
  JourneyDisplayDiff, getDiffTracker, initJourneyDisplay, updateConfigFromPreferences,
  calculateJourney, getCurrentJourney, renderJourneyPNG, renderJourneyBase64
};
