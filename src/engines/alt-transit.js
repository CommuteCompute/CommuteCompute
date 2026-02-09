/**
 * Alternative Transit Engine v1.0
 * Part of the Commute Compute™ System
 *
 * Estimates costs for alternative transport options when all public
 * transit services are cancelled or suspended. Provides actionable
 * cost estimates for rideshare, e-scooter, and bike share so the
 * user can make an informed decision at a glance.
 *
 * Pricing models based on Melbourne market rates (2026).
 * No API calls required - uses distance-based estimation.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// =============================================================================
// PRICING CONSTANTS (Melbourne market rates, 2026)
// =============================================================================

/** Rideshare base fare (AUD) */
const RIDESHARE_BASE_FARE = 2.50;

/** Rideshare per-km rate (AUD) */
const RIDESHARE_PER_KM = 1.45;

/** Rideshare per-minute rate (AUD) */
const RIDESHARE_PER_MIN = 0.38;

/** Rideshare minimum fare (AUD) */
const RIDESHARE_MIN_FARE = 8.00;

/** Rideshare surge multiplier for peak hours */
const RIDESHARE_PEAK_SURGE = 1.5;

/** E-scooter unlock fee (AUD) */
const SCOOTER_UNLOCK_FEE = 1.00;

/** E-scooter per-minute rate (AUD) */
const SCOOTER_PER_MIN = 0.38;

/** E-scooter average speed in km/h */
const SCOOTER_AVG_SPEED_KMH = 15;

/** Bike share 30-minute pass cost (AUD) */
const BIKE_SHARE_PASS_COST = 4.00;

/** Bike share per additional 30-min block (AUD) */
const BIKE_SHARE_EXTRA_BLOCK = 4.00;

/** Bike average speed in km/h */
const BIKE_AVG_SPEED_KMH = 12;

/** Walking speed in km/h (for distance estimation from walk minutes) */
const WALK_SPEED_KMH = 5;

/** Peak hour ranges (morning and evening) */
const PEAK_MORNING_START = 7;
const PEAK_MORNING_END = 9;
const PEAK_EVENING_START = 16;
const PEAK_EVENING_END = 19;

/** Display line max characters */
const DISPLAY_LINE_MAX = 22;

// =============================================================================
// ALTERNATIVE TRANSIT ENGINE
// =============================================================================

/**
 * AltTransit - Alternative transport cost estimator for Commute Compute™.
 *
 * When all public transit options are cancelled or unavailable, this engine
 * estimates the cost of alternative transport so the user can decide between
 * walking, rideshare, scooter, or bike at a glance.
 *
 * @example
 * const engine = new AltTransit();
 * const result = engine.calculate({
 *   totalWalkMins: 45,
 *   currentTime: new Date(),
 *   transitNotice: 'NO PUBLIC TRANSIT OPTIONS AVAILABLE'
 * });
 * // result.displayLine => 'UBER ~$12 | BIKE ~$4'
 */
class AltTransit {

  /**
   * Calculate alternative transit cost estimates.
   *
   * @param {Object} params
   * @param {number} params.totalWalkMins - Total walking time for the full journey in minutes
   * @param {Date} params.currentTime - Current local time (for peak hour detection)
   * @param {string} params.transitNotice - Transit notice string (triggers when set)
   * @param {Array} [params.legs] - Journey legs array (for distance estimation)
   * @param {number} [params.localHour] - Local timezone hour (0-23), overrides currentTime.getHours()
   * @returns {Object} Alternative transit estimates
   */
  calculate(params) {
    const {
      totalWalkMins,
      currentTime,
      transitNotice,
      legs = [],
      localHour
    } = params || {};

    // Only activate when transit is unavailable
    if (!transitNotice) {
      return this._buildInactiveResult();
    }

    // Estimate distance from walk time
    const walkMins = typeof totalWalkMins === 'number' ? totalWalkMins : this._estimateWalkMins(legs);

    if (!walkMins || walkMins <= 0) {
      return this._buildInactiveResult();
    }

    const distanceKm = (walkMins / 60) * WALK_SPEED_KMH;
    const isPeak = typeof localHour === 'number' ? this._isPeakHourFromHour(localHour) : this._isPeakHour(currentTime);

    // Calculate estimates
    const rideshare = this._calcRideshare(distanceKm, walkMins, isPeak);
    const scooter = this._calcScooter(distanceKm);
    const bike = this._calcBike(distanceKm);

    // Build display
    const displayLine = this._buildDisplayLine(rideshare, bike);

    return {
      active: true,
      distanceKm: Math.round(distanceKm * 10) / 10,
      isPeak,
      rideshare,
      scooter,
      bike,
      walkMins,
      displayLine,
      detailLine: 'WALK ' + walkMins + ' MIN TOTAL'
    };
  }

  // ===========================================================================
  // COST CALCULATORS
  // ===========================================================================

  /**
   * Calculate rideshare (Uber-style) cost estimate.
   * @param {number} distanceKm - Journey distance in km
   * @param {number} durationMins - Estimated duration in minutes
   * @param {boolean} isPeak - Whether current time is peak hour
   * @returns {Object} Rideshare estimate
   */
  _calcRideshare(distanceKm, durationMins, isPeak) {
    // Rideshare trip time is roughly half the walk time
    const tripMins = Math.max(5, Math.round(durationMins / 3));
    let cost = RIDESHARE_BASE_FARE + (distanceKm * RIDESHARE_PER_KM) + (tripMins * RIDESHARE_PER_MIN);

    if (isPeak) {
      cost *= RIDESHARE_PEAK_SURGE;
    }

    cost = Math.max(cost, RIDESHARE_MIN_FARE);
    const roundedCost = Math.round(cost);

    return {
      type: 'rideshare',
      cost: roundedCost,
      label: 'UBER ~$' + roundedCost,
      tripMins,
      isPeak
    };
  }

  /**
   * Calculate e-scooter rental cost estimate.
   * @param {number} distanceKm - Journey distance in km
   * @returns {Object} Scooter estimate
   */
  _calcScooter(distanceKm) {
    const tripMins = Math.ceil((distanceKm / SCOOTER_AVG_SPEED_KMH) * 60);
    const cost = SCOOTER_UNLOCK_FEE + (tripMins * SCOOTER_PER_MIN);
    const roundedCost = Math.round(cost);

    return {
      type: 'scooter',
      cost: roundedCost,
      label: 'SCOOTER ~$' + roundedCost,
      tripMins
    };
  }

  /**
   * Calculate bike share cost estimate.
   * @param {number} distanceKm - Journey distance in km
   * @returns {Object} Bike share estimate
   */
  _calcBike(distanceKm) {
    const tripMins = Math.ceil((distanceKm / BIKE_AVG_SPEED_KMH) * 60);
    const blocks = Math.ceil(tripMins / 30);
    const cost = blocks === 1 ? BIKE_SHARE_PASS_COST : BIKE_SHARE_PASS_COST + ((blocks - 1) * BIKE_SHARE_EXTRA_BLOCK);
    const roundedCost = Math.round(cost);

    return {
      type: 'bike',
      cost: roundedCost,
      label: 'BIKE ~$' + roundedCost,
      tripMins
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Check if current time is during peak hours.
   * @param {Date} time - Current time
   * @returns {boolean} True if peak hour
   */
  _isPeakHour(time) {
    if (!(time instanceof Date)) return false;
    return this._isPeakHourFromHour(time.getHours());
  }

  /**
   * Check if a given hour is during peak hours (timezone-safe).
   * @param {number} hour - Hour (0-23)
   * @returns {boolean} True if peak hour
   */
  _isPeakHourFromHour(hour) {
    return (hour >= PEAK_MORNING_START && hour < PEAK_MORNING_END) ||
           (hour >= PEAK_EVENING_START && hour < PEAK_EVENING_END);
  }

  /**
   * Estimate total walk minutes from journey legs.
   * @param {Array} legs - Journey legs array
   * @returns {number} Total walk minutes
   */
  _estimateWalkMins(legs) {
    if (!Array.isArray(legs)) return 0;
    let total = 0;
    for (const leg of legs) {
      if (leg && (leg.mode === 'walk' || leg.type === 'walk')) {
        total += leg.minutes || leg.durationMinutes || 0;
      }
    }
    // If no walk legs but we have transit legs, estimate from transit duration
    if (total === 0) {
      for (const leg of legs) {
        if (leg && leg.type !== 'walk' && leg.mode !== 'walk') {
          const transitMins = leg.minutes || leg.durationMinutes || 0;
          total += transitMins * 2.5; // Transit ~2.5x faster than walking
        }
      }
    }
    return Math.round(total);
  }

  /**
   * Build compact display line for e-ink (max 22 chars).
   * @param {Object} rideshare - Rideshare estimate
   * @param {Object} bike - Bike estimate
   * @returns {string} Display line
   */
  _buildDisplayLine(rideshare, bike) {
    const line = 'UBER ~$' + rideshare.cost + ' | BIKE ~$' + bike.cost;
    if (line.length <= DISPLAY_LINE_MAX) return line;
    // Fallback to shorter format
    return 'UBER ~$' + rideshare.cost + '/BIKE ~$' + bike.cost;
  }

  /**
   * Build inactive result when alt transit is not needed.
   * @returns {Object} Inactive result
   */
  _buildInactiveResult() {
    return {
      active: false,
      distanceKm: null,
      isPeak: false,
      rideshare: null,
      scooter: null,
      bike: null,
      walkMins: null,
      displayLine: null,
      detailLine: null
    };
  }
}

export default AltTransit;
