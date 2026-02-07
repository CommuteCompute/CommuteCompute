/**
 * CoffeeDecision Engine
 * Part of the CommuteCompute™ Component of Commute Compute System™
 * 
 * Calculates whether there's time to get coffee before work.
 * Commute timing is configurable based on user's journey settings.
 * Uses Journey Planner configuration for accurate calculations.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

class CoffeeDecision {
  constructor(config = {}, preferences = null) {
    // Default timing constants (in minutes)
    // These are overridden by user's journey configuration
    this.commute = {
      walkToWork: config.walkToWork || 5,          // Station → Work
      homeToCafe: config.homeToCafe || 5,          // Home → Cafe
      makeCoffee: config.makeCoffee || 5,          // Time at cafe (order + make)
      cafeToTransit: config.cafeToTransit || 2,    // Cafe → Transit stop
      transitRide: config.transitRide || 5,        // Transit ride duration
      platformChange: config.platformChange || 3,  // Connection walking time
      trainRide: config.trainRide || 15            // Primary transit duration
    };

    // Store preferences for timezone detection (Development Rules v1.0.15 - Location Agnostic)
    this.preferences = preferences;
  }

  /**
   * Update commute timings from journey configuration
   */
  updateFromJourney(journey) {
    if (journey?.segments) {
      // Extract timings from journey segments
      journey.segments.forEach(seg => {
        if (seg.type === 'walk' && seg.to?.toLowerCase().includes('work')) {
          this.commute.walkToWork = seg.duration || this.commute.walkToWork;
        }
        if (seg.type === 'coffee') {
          this.commute.makeCoffee = seg.duration || this.commute.makeCoffee;
        }
        if (seg.type === 'train' || seg.type === 'tram') {
          this.commute.trainRide = seg.duration || this.commute.trainRide;
        }
      });
    }
  }

  /**
   * Get timezone for state (Development Rules v1.0.15 - Location Agnostic)
   */
  getTimezoneForState(state) {
    const timezones = {
      'VIC': 'Australia/Melbourne',
      'NSW': 'Australia/Sydney',
      'ACT': 'Australia/Sydney',
      'QLD': 'Australia/Brisbane',
      'SA': 'Australia/Adelaide',
      'WA': 'Australia/Perth',
      'TAS': 'Australia/Hobart',
      'NT': 'Australia/Darwin'
    };
    return timezones[state] || 'Australia/Sydney';
  }

  /**
   * Get current local time based on user's state (replaces getMelbourneTime)
   * Development Rules v1.0.15 Section 4 - Location-Agnostic Design
   */
  getLocalTime() {
    const prefs = this.preferences 
      ? (typeof this.preferences.get === 'function' ? this.preferences.get() : this.preferences)
      : {};
    const state = prefs.location?.state || prefs.state || 'VIC';
    const timezone = this.getTimezoneForState(state);

    const now = new Date();
    // Get local time for user's state
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

    return localTime;
  }

  /**
   * Check if there are major service disruptions
   */
  isDisrupted(newsText) {
    if (!newsText) return false;
    const badWords = ['Major Delays', 'Suspended', 'Buses replace', 'Cancellation'];
    return badWords.some(word => newsText.includes(word));
  }

  /**
   * Main calculation - determines if there's time for coffee
   * 
   * @param {number} nextTrainMin - Minutes until next train
   * @param {array} tramData - Array of upcoming tram departures
   * @param {string} newsText - Service alert text
   * @returns {object} - { decision, subtext, canGet, urgent }
   */
  calculate(nextTrainMin, tramData, newsText) {
    const now = this.getLocalTime();  // Now location-agnostic
    const day = now.getDay(); // 0=Sun, 6=Sat (use local day, not UTC)
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTimeInMins = currentHour * 60 + currentMin;

    // 0. CAFE HOURS CHECK - Check if cafe is within operating hours
    // Default cafe hours: 6:00 AM to 6:00 PM on weekdays, 7:00 AM to 3:00 PM on weekends
    const cafeHours = this.cafeHours || {};
    const isWeekend = (day === 0 || day === 6);
    const defaultOpenHour = isWeekend ? 7 : 6;   // 7am weekends, 6am weekdays
    const defaultCloseHour = isWeekend ? 15 : 18; // 3pm weekends, 6pm weekdays
    
    const openHour = cafeHours.openHour ?? defaultOpenHour;
    const closeHour = cafeHours.closeHour ?? defaultCloseHour;
    
    // Check if cafe is closed
    if (currentHour < openHour || currentHour >= closeHour) {
      const closedReason = currentHour < openHour ? 
        `Opens at ${openHour}:00am` : 
        `Closed after ${closeHour > 12 ? closeHour - 12 : closeHour}:00${closeHour >= 12 ? "pm" : "am"}`;
      return {
        decision: "CAFE CLOSED",
        subtext: closedReason,
        canGet: false,
        cafeClosed: true,
        skipReason: "closed",
        urgent: false
      };
    }

    // 1. SERVICE INTERRUPTION - Skip coffee if network is disrupted
    if (this.isDisrupted(newsText)) {
        return { 
          decision: "SKIP COFFEE", 
          subtext: "Network Alert! Go direct.", 
          canGet: false, 
          urgent: true 
        };
    }

    // 2. WEEKEND MODE - More relaxed timing
    if (day === 0 || day === 6) {
        if (nextTrainMin > 15) {
          return { 
            decision: "WEEKEND VIBES", 
            subtext: `Next train in ${nextTrainMin}m`, 
            canGet: true, 
            urgent: false 
          };
        }
        return { 
          decision: "CATCH TRAIN", 
          subtext: `Train departing in ${nextTrainMin}m`, 
          canGet: true, 
          urgent: false 
        };
    }

    // 3. AFTER 9 AM - Standard mode (not rushing for 9am arrival)
    if (currentHour >= 9) {
        if (nextTrainMin > 15) {
          return { 
            decision: "GET COFFEE", 
            subtext: `Next train in ${nextTrainMin}m`, 
            canGet: true, 
            urgent: false 
          };
        }
        return { 
          decision: "RUSH IT", 
          subtext: "Train is approaching", 
          canGet: false, 
          urgent: true 
        };
    }

    // 4. Calculate timing for work arrival (default 9 AM, configurable)
    const targetArrival = this.targetArrivalMins || 9 * 60; // Default 9:00 AM (540 minutes)

    // Total trip time calculations based on configured timings
    const tripDirect = this.commute.homeToCafe + this.commute.transitRide +
                       this.commute.platformChange + this.commute.trainRide +
                       this.commute.walkToWork;
    const tripWithCoffee = tripDirect + this.commute.makeCoffee + this.commute.cafeToTransit;

    const minsUntilArrival = targetArrival - currentTimeInMins;

    // Not enough time for direct route
    if (minsUntilArrival < tripDirect) {
        return {
            decision: "LATE FOR WORK",
            subtext: `Only ${minsUntilArrival}m left! (Need ${tripDirect}m)`,
            canGet: false,
            urgent: true
        };
    }

    // Not enough time for coffee route
    if (minsUntilArrival < tripWithCoffee) {
        return {
            decision: "SKIP COFFEE",
            subtext: `Need ${tripWithCoffee}m. Have ${minsUntilArrival}m.`,
            canGet: false,
            urgent: true
        };
    }

    // Find best transit that works with coffee timing
    const coffeeReadyTime = this.commute.homeToCafe + this.commute.makeCoffee;
    const bestTransit = tramData ? tramData.find(t => t.minutes >= coffeeReadyTime) : null;

    // Friday treat logic (per CCDash Spec v10.3)
    const isFriday = (day === 5);

    if (bestTransit) {
         return {
            decision: isFriday ? "FRIDAY TREAT" : "GET COFFEE",
            subtext: isFriday
              ? `[OK] FRIDAY TREAT -- Transit in ${bestTransit.minutes}m`
              : `Transit in ${bestTransit.minutes}m → arrive on time`,
            canGet: true,
            isFriday,
            fridayTreat: isFriday,
            urgent: false
        };
    } else {
        return {
            decision: isFriday ? "FRIDAY TREAT" : "GET COFFEE",
            subtext: isFriday
              ? `[OK] FRIDAY TREAT -- ${minsUntilArrival}m buffer`
              : `${minsUntilArrival}m buffer before arrival`,
            canGet: true,
            isFriday,
            fridayTreat: isFriday,
            urgent: false
        };
    }
  }

  /**
   * Set target arrival time (in minutes from midnight)
   */
  setTargetArrival(hours, minutes = 0) {
    this.targetArrivalMins = hours * 60 + minutes;
  }
}

export default CoffeeDecision;
