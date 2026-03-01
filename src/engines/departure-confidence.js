// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system
// Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE

/**
 * Departure Confidence Engine v1.0
 * Part of the Commute Compute™ System
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Calculates a Departure Confidence Score (0-100%) representing how likely
 * the user's planned journey will succeed on time. Uses real-time transit data,
 * weather conditions, disruption alerts, and time buffer analysis to produce
 * an actionable confidence metric.
 *
 * Integrates with CommuteCompute Engine journey legs and transit data feeds.
 * No mock data fallbacks -- returns zeros/defaults if data is unavailable.
 */

const BASE_SCORE = 50;

const TIME_BUFFER_MAX = 30;
const SERVICE_FREQ_MAX = 20;
const WEATHER_IMPACT_MIN = -15;
const WEATHER_IMPACT_MAX = 0;
const DISRUPTION_IMPACT_MIN = -40;
const DISRUPTION_IMPACT_MAX = 0;

const SCORE_MIN = 0;
const SCORE_MAX = 100;

const LABEL_HIGH_THRESHOLD = 75;
const LABEL_MEDIUM_THRESHOLD = 50;

const FREQUENT_SERVICE_COUNT = 3;
const MODERATE_SERVICE_COUNT = 2;

const HIGH_WIND_THRESHOLD_KMH = 40;

/**
 * Departure Confidence Engine
 *
 * Produces a confidence score for a planned journey based on:
 * - Time buffer between now and target arrival
 * - Service frequency for transit legs (from CommuteCompute data)
 * - Weather conditions (storms, rain, wind)
 * - Active disruptions (suspensions, delays, alerts)
 *
 * Also calculates journey resilience based on structural factors
 * (transfer count, service frequency) independent of current conditions.
 */
class DepartureConfidence {
  /**
   * Calculate the Departure Confidence Score for a planned journey.
   *
   * @param {Object} params
   * @param {Array} params.legs - Journey legs array from buildJourneyLegs()
   * @param {Object} params.transitData - { trains: [], trams: [], buses: [], disruptions: [] }
   * @param {Object} params.weather - { temp, condition, umbrella, windSpeed }
   * @param {Object} params.coffeeDecision - { canGet, decision, urgent }
   * @param {number} params.totalMinutes - Total journey duration in minutes
   * @param {number} params.targetArrivalMins - Target arrival time in minutes from midnight (e.g., 540 = 9:00am)
   * @param {number} params.currentMins - Current time in minutes from midnight
   * @returns {Object} confidence result with score, label, statusText, resilience, and factors
   */
  calculate(params) {
    const {
      legs = [],
      transitData = {},
      weather = {},
      coffeeDecision = {},
      totalMinutes = 0,
      targetArrivalMins = 0,
      currentMins = 0,
      isCommuteDay = true
    } = params || {};

    // Non-commute day: confidence is not applicable — return neutral result
    if (!isCommuteDay) {
      return {
        score: 0,
        label: 'N/A',
        statusText: 'Not today',
        resilience: 'N/A',
        factors: { timeBuffer: 0, serviceFrequency: 0, weatherImpact: 0, disruptionImpact: 0, base: 0 }
      };
    }

    // Handle overnight/next-day scenario: if target is tomorrow (current > target),
    // add 1440 minutes (24 hours) to get the real buffer
    let bufferMins = targetArrivalMins - currentMins - totalMinutes;
    if (currentMins > targetArrivalMins) {
      // Target is tomorrow: buffer = (minutes until midnight) + targetArrival - journey
      bufferMins = (1440 - currentMins) + targetArrivalMins - totalMinutes;
      // Past today's window check: if buffer exceeds 12 hours, it's afternoon/evening
      // and the target has already passed — not genuinely tomorrow's commute
      if (bufferMins > 720) {
        bufferMins = targetArrivalMins - currentMins - totalMinutes; // negative = late
      }
    }

    const timeBuffer = this._calcTimeBuffer(bufferMins);
    const serviceFrequency = this._calcServiceFrequency(legs);
    const weatherImpact = this._calcWeatherImpact(weather);
    const disruptionImpact = this._calcDisruptionImpact(legs);

    const rawScore = BASE_SCORE + timeBuffer + serviceFrequency + weatherImpact + disruptionImpact;
    const score = this._clamp(rawScore, SCORE_MIN, SCORE_MAX);

    const label = this._getLabel(score);
    const resilience = this._calcResilience(legs);

    return {
      score,
      label,
      statusText: `${score}%`,
      resilience,
      factors: {
        timeBuffer,
        serviceFrequency,
        weatherImpact,
        disruptionImpact,
        base: BASE_SCORE
      }
    };
  }

  /**
   * Calculate time buffer points based on how much slack the user has.
   *
   * @param {number} bufferMins - Minutes of slack (targetArrival - currentTime - journeyDuration)
   * @returns {number} Points from 0 to 30
   */
  _calcTimeBuffer(bufferMins) {
    if (bufferMins == null || isNaN(bufferMins)) {
      return 0;
    }

    if (bufferMins < 0) return 0;
    if (bufferMins < 5) return 5;
    if (bufferMins < 10) return 10;
    if (bufferMins < 20) return 20;
    if (bufferMins < 30) return 25;
    return TIME_BUFFER_MAX; // 30
  }

  /**
   * Calculate service frequency points based on available next departures
   * for each transit leg in the journey.
   *
   * @param {Array} legs - Journey legs from buildJourneyLegs()
   * @returns {number} Points from 0 to 20
   */
  _calcServiceFrequency(legs) {
    if (!Array.isArray(legs) || legs.length === 0) {
      return 0;
    }

    let total = 0;

    for (const leg of legs) {
      if (!leg || (leg.type || leg.mode) === 'walk' || (leg.type || leg.mode) === 'walking') {
        continue;
      }

      const nextDepartures = leg.nextDepartures || [];
      const count = nextDepartures.length;

      if (count >= FREQUENT_SERVICE_COUNT) {
        total += 7;
      } else if (count >= MODERATE_SERVICE_COUNT) {
        total += 5;
      } else if (count >= 1) {
        total += 2;
      }
      // 0 entries -> 0 points
    }

    return Math.min(total, SERVICE_FREQ_MAX);
  }

  /**
   * Calculate weather impact penalty based on current conditions.
   *
   * @param {Object} weather - { temp, condition, umbrella, windSpeed }
   * @returns {number} Points from -15 to 0
   */
  _calcWeatherImpact(weather) {
    if (!weather || typeof weather !== 'object') {
      return 0;
    }

    let impact = 0;
    const condition = (weather.condition || '').toLowerCase();

    // Condition-based penalties (use worst applicable)
    if (condition.includes('storm') || condition.includes('thunder')) {
      impact = -15;
    } else if (condition.includes('heavy rain')) {
      impact = -10;
    } else if (
      condition.includes('light rain') ||
      condition.includes('drizzle') ||
      condition.includes('rain')
    ) {
      impact = -5;
    }

    // Wind penalty (additive)
    const windSpeed = typeof weather.windSpeed === 'number' ? weather.windSpeed : 0;
    if (windSpeed > HIGH_WIND_THRESHOLD_KMH) {
      impact -= 5;
    }

    return this._clamp(impact, WEATHER_IMPACT_MIN, WEATHER_IMPACT_MAX);
  }

  /**
   * Calculate disruption impact penalty based on leg statuses and alerts.
   *
   * @param {Array} legs - Journey legs from buildJourneyLegs()
   * @returns {number} Points from -40 to 0
   */
  _calcDisruptionImpact(legs) {
    if (!Array.isArray(legs) || legs.length === 0) {
      return 0;
    }

    let impact = 0;
    let delayCount = 0;

    for (const leg of legs) {
      if (!leg) continue;

      const status = (leg.state || leg.status || '').toLowerCase();

      // Suspended or cancelled is the worst case -- immediate -40
      if (status === 'suspended' || status === 'cancelled') {
        return DISRUPTION_IMPACT_MIN; // -40
      }

      if (status === 'delayed') {
        delayCount++;
      }

      if (leg.hasAlert === true) {
        impact -= 10;
      }
    }

    // Delayed legs: -15 each, max -30
    const delayPenalty = Math.min(delayCount * 15, 30);
    impact -= delayPenalty;

    return this._clamp(impact, DISRUPTION_IMPACT_MIN, DISRUPTION_IMPACT_MAX);
  }

  /**
   * Calculate journey resilience based on structural factors:
   * transfer count and service frequency. Independent of current conditions.
   *
   * @param {Array} legs - Journey legs from buildJourneyLegs()
   * @returns {string} 'HIGH', 'MEDIUM', or 'LOW'
   */
  _calcResilience(legs) {
    if (!Array.isArray(legs) || legs.length === 0) {
      return 'HIGH';
    }

    // Check for any suspended or cancelled service first
    for (const leg of legs) {
      if (!leg) continue;
      const status = (leg.state || leg.status || '').toLowerCase();
      if (status === 'suspended' || status === 'cancelled') {
        return 'LOW';
      }
    }

    // Count transit legs (non-walking) and transfers
    const transitLegs = legs.filter(
      (leg) => leg && (leg.type || leg.mode) !== 'walk' && (leg.type || leg.mode) !== 'walking'
    );
    const transferCount = Math.max(0, transitLegs.length - 1);

    // Check if all transit services are frequent (3+ next departures)
    const allFrequent = transitLegs.every((leg) => {
      const nextDepartures = leg.nextDepartures || [];
      return nextDepartures.length >= FREQUENT_SERVICE_COUNT;
    });

    if (transferCount === 0) {
      return 'HIGH';
    }

    if (transferCount === 1) {
      return allFrequent ? 'HIGH' : 'MEDIUM';
    }

    // 2+ transfers
    return allFrequent ? 'MEDIUM' : 'LOW';
  }

  /**
   * Get the human-readable label for a confidence score.
   *
   * @param {number} score - Confidence score 0-100
   * @returns {string} 'ON TIME', 'AT RISK', or 'UNLIKELY'
   */
  _getLabel(score) {
    if (score > LABEL_HIGH_THRESHOLD) return 'ON TIME';
    if (score >= LABEL_MEDIUM_THRESHOLD) return 'AT RISK';
    return 'UNLIKELY';
  }

  /**
   * Clamp a value between min and max (inclusive).
   *
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}

export default DepartureConfidence;
