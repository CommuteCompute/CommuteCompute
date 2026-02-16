/**
 * Sleep Optimizer Engine v1.0
 * Part of the Commute Compute™ System
 *
 * Calculates optimal bedtime and alarm time based on the user's
 * next-day commute requirements. Extends the CommuteCompute "1 glance"
 * philosophy to evening preparation and morning readiness.
 *
 * Factors: target arrival time, journey duration, wake routine buffer,
 * recommended sleep duration (7-9 hours), and current time.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Recommended sleep duration in hours (National Sleep Foundation guidelines) */
const RECOMMENDED_SLEEP_HOURS = 8;

/** Minimum acceptable sleep duration in hours */
const MIN_SLEEP_HOURS = 6;

/** Maximum sleep duration in hours (beyond this may indicate issues) */
const MAX_SLEEP_HOURS = 10;

/** Default wake routine buffer in minutes (shower, dress, breakfast) */
const DEFAULT_WAKE_ROUTINE_MINS = 30;

/** Evening mode activation hour (6pm / 18:00) */
const EVENING_MODE_HOUR = 18;

/** Latest reasonable bedtime hour (midnight) */
const LATEST_BEDTIME_HOUR = 0;

/** Display line maximum characters for e-ink */
const DISPLAY_LINE_MAX = 22;

// =============================================================================
// SLEEP OPTIMIZER ENGINE
// =============================================================================

/**
 * SleepOptimizer - Evening preparation engine for Commute Compute™.
 *
 * When the dashboard is viewed in the evening (after 6pm), this engine
 * calculates when the user should go to bed and set their alarm to
 * get optimal sleep before tomorrow's commute.
 *
 * @example
 * const engine = new SleepOptimizer();
 * const result = engine.calculate({
 *   targetArrivalMins: 540, // 9:00am
 *   totalJourneyMins: 45,
 *   currentTime: new Date('2026-02-06T21:00:00'),
 *   wakeRoutineMins: 30,
 *   sleepHours: 8
 * });
 * // result.displayLine => 'BED BY 10:25PM'
 * // result.alarmTime => '7:45AM'
 */
class SleepOptimizer {

  /**
   * Calculate optimal bedtime and alarm time.
   *
   * @param {Object} params
   * @param {number} params.targetArrivalMins - Target arrival at work in minutes from midnight (e.g. 540 = 9:00am)
   * @param {number} params.totalJourneyMins - Total journey duration in minutes
   * @param {Date} params.currentTime - Current local time
   * @param {number} [params.wakeRoutineMins=30] - Minutes needed for morning routine
   * @param {number} [params.sleepHours=8] - Desired sleep duration in hours
   * @param {number} [params.localHour] - Local timezone hour (0-23), overrides currentTime.getHours() for timezone-correct evaluation
   * @returns {Object} Sleep optimisation result
   */
  calculate(params) {
    const {
      targetArrivalMins,
      totalJourneyMins,
      currentTime,
      wakeRoutineMins = DEFAULT_WAKE_ROUTINE_MINS,
      sleepHours = RECOMMENDED_SLEEP_HOURS,
      localHour,
      localMinute
    } = params || {};

    // Validate inputs - no mock data, return inactive if missing
    if (!targetArrivalMins || !totalJourneyMins || !(currentTime instanceof Date)) {
      return this._buildInactiveResult();
    }

    // Use localHour if provided (timezone-correct), otherwise fall back to Date.getHours()
    const currentHour = typeof localHour === 'number' ? localHour : currentTime.getHours();
    const isEveningMode = currentHour >= EVENING_MODE_HOUR || currentHour < 5;

    if (!isEveningMode) {
      return this._buildInactiveResult();
    }

    // Clamp sleep hours to reasonable range
    const clampedSleepHours = Math.max(MIN_SLEEP_HOURS, Math.min(MAX_SLEEP_HOURS, sleepHours));
    const sleepMins = clampedSleepHours * 60;

    // Calculate alarm time: arrival - journey duration - wake routine
    const alarmMins = targetArrivalMins - totalJourneyMins - wakeRoutineMins;

    // Handle negative (arrival before midnight edge case)
    const normalizedAlarmMins = alarmMins < 0 ? alarmMins + 1440 : alarmMins;

    // Calculate bedtime: alarm - sleep duration
    let bedtimeMins = normalizedAlarmMins - sleepMins;
    if (bedtimeMins < 0) bedtimeMins += 1440;

    // Format times
    const alarmTime = this._formatTime(normalizedAlarmMins);
    const bedtime = this._formatTime(bedtimeMins);

    // Calculate hours of sleep available if going to bed now
    const currentMinute = typeof localMinute === 'number' ? localMinute : currentTime.getMinutes();
    const currentMins = currentHour * 60 + currentMinute;
    let availableSleepMins = normalizedAlarmMins - currentMins;
    if (availableSleepMins < 0) availableSleepMins += 1440;
    const availableSleepHours = Math.round(availableSleepMins / 60 * 10) / 10;

    // Determine sleep adequacy
    const sleepAdequacy = this._getSleepAdequacy(availableSleepHours, clampedSleepHours);

    // Build display line
    const displayLine = this._buildDisplayLine(bedtime, alarmTime, bedtimeMins, currentMins);

    return {
      active: true,
      isEveningMode: true,
      alarmTime,
      alarmMins: normalizedAlarmMins,
      bedtime,
      bedtimeMins,
      sleepHoursTarget: clampedSleepHours,
      availableSleepHours,
      sleepAdequacy,
      displayLine,
      secondaryLine: 'ALARM ' + alarmTime
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Build inactive result when sleep optimizer is not applicable.
   * @returns {Object} Inactive sleep result
   */
  _buildInactiveResult() {
    return {
      active: false,
      isEveningMode: false,
      alarmTime: null,
      alarmMins: null,
      bedtime: null,
      bedtimeMins: null,
      sleepHoursTarget: null,
      availableSleepHours: null,
      sleepAdequacy: null,
      displayLine: null,
      secondaryLine: null
    };
  }

  /**
   * Determine sleep adequacy category.
   * @param {number} available - Hours of sleep available
   * @param {number} target - Target sleep hours
   * @returns {string} 'OPTIMAL', 'ADEQUATE', or 'INSUFFICIENT'
   */
  _getSleepAdequacy(available, target) {
    if (available >= target) return 'OPTIMAL';
    if (available >= target - 1) return 'ADEQUATE';
    return 'INSUFFICIENT';
  }

  /**
   * Build compact display line for e-ink (max 22 chars).
   * Shows "BED BY HH:MMam/pm" if bedtime hasn't passed,
   * or "ALARM HH:MMam/pm" if it has.
   *
   * @param {string} bedtime - Formatted bedtime string
   * @param {string} alarmTime - Formatted alarm time string
   * @param {number} bedtimeMins - Bedtime in minutes from midnight
   * @param {number} currentMins - Current time in minutes from midnight
   * @returns {string} Display line (max 22 chars)
   */
  _buildDisplayLine(bedtime, alarmTime, bedtimeMins, currentMins) {
    // If bedtime has already passed, show alarm instead
    const bedtimePassed = this._hasTimePassed(bedtimeMins, currentMins);

    let line;
    if (bedtimePassed) {
      line = 'ALARM ' + alarmTime;
    } else {
      line = 'BED BY ' + bedtime;
    }

    if (line.length > DISPLAY_LINE_MAX) {
      return line.substring(0, DISPLAY_LINE_MAX);
    }
    return line;
  }

  /**
   * Check if a target time has passed relative to current time,
   * accounting for day boundary (midnight crossing).
   *
   * @param {number} targetMins - Target time in minutes from midnight
   * @param {number} currentMins - Current time in minutes from midnight
   * @returns {boolean} True if target time has passed
   */
  _hasTimePassed(targetMins, currentMins) {
    // Evening context: if target is PM (>= 720) and current is PM
    if (targetMins >= 720 && currentMins >= 720) {
      return currentMins > targetMins;
    }
    // Target is AM (next day), current is PM - bedtime hasn't passed
    if (targetMins < 720 && currentMins >= 720) {
      return false;
    }
    // Both AM - target has passed
    return currentMins > targetMins;
  }

  /**
   * Format minutes from midnight to 12-hour time string.
   * @param {number} mins - Minutes from midnight (0-1439)
   * @returns {string} Formatted time (e.g. "10:30PM", "6:15AM")
   */
  _formatTime(mins) {
    const normalizedMins = ((mins % 1440) + 1440) % 1440;
    const hours24 = Math.floor(normalizedMins / 60);
    const minutes = normalizedMins % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
    return hours12 + ':' + String(minutes).padStart(2, '0') + period;
  }
}

export default SleepOptimizer;
