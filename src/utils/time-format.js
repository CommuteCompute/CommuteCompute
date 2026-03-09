/**
 * Time Formatting Utilities — Shared Module
 *
 * State-aware timezone handling for Australian states/territories.
 * Single source of truth — all endpoints import from here.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// State timezone mapping - supports all 8 Australian states/territories
// Fallback: 'Australia/Melbourne' if state is unknown
export const STATE_TIMEZONES = {
  'VIC': 'Australia/Melbourne', 'NSW': 'Australia/Sydney', 'ACT': 'Australia/Sydney',
  'QLD': 'Australia/Brisbane', 'SA': 'Australia/Adelaide', 'WA': 'Australia/Perth',
  'TAS': 'Australia/Hobart', 'NT': 'Australia/Darwin'
};

/**
 * Get local time (as a Date object)
 * V13.6 FIX: Return actual Date object with correct timestamp
 * The timestamp (getTime()) must be accurate for timing calculations
 * Only use timezone conversion for display (hours, minutes)
 */
export function getMelbourneTime() {
  // Return the actual current time - the timestamp is always UTC-correct
  // For display purposes, we extract hours/minutes with timezone consideration
  return new Date();
}

/**
 * Get local hours and minutes from a Date object for the given state
 * Use this for display, not for timestamp calculations
 * @param {Date} date - Date object to extract time from
 * @param {string} [state] - Australian state code (e.g. 'VIC', 'NSW'). Defaults to Melbourne timezone.
 */
export function getMelbourneDisplayTime(date, state) {
  const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    hourCycle: 'h23'  // V13.6 FIX: Use 0-23 hour format (not h24 which shows "24" for midnight)
  }).formatToParts(date);

  let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  // V13.6 FIX: Handle edge case where hour might still be 24
  if (hour === 24) hour = 0;
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  return { hour, minute };
}

/**
 * Format time as H:MM (12-hour format, state-aware timezone)
 * Per Section 12: Business Logic - use 12-hour time format
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
export function formatTime(date, state) {
  const melb = getMelbourneDisplayTime(date, state);
  const hour12 = melb.hour % 12 || 12;  // Convert 0 to 12, 13-23 to 1-11
  return `${hour12}:${melb.minute.toString().padStart(2, '0')}`;
}

/**
 * Format date parts for display (state-aware timezone)
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
export function formatDateParts(date, state) {
  const timezone = STATE_TIMEZONES[state] || 'Australia/Melbourne';
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  return {
    day: weekday,
    date: `${day} ${month}`
  };
}

/**
 * Format time in 12-hour format per CCDashDesignV15
 * Returns: "7:24" (no leading zero on hour)
 * Uses getMelbourneDisplayTime for timezone correctness when state provided.
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
export function formatTime12h(date, state) {
  if (state) {
    const melb = getMelbourneDisplayTime(date, state);
    const hour12 = melb.hour % 12 || 12;
    return `${hour12}:${melb.minute.toString().padStart(2, '0')}`;
  }
  // Legacy path: direct extraction (Melbourne-locale parse)
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get AM/PM indicator per CCDashDesignV15
 * @param {Date} date
 * @param {string} [state] - Australian state code
 */
export function getAmPm(date, state) {
  if (state) {
    const melb = getMelbourneDisplayTime(date, state);
    return melb.hour >= 12 ? 'PM' : 'AM';
  }
  return date.getHours() >= 12 ? 'PM' : 'AM';
}

export default {
  STATE_TIMEZONES,
  getMelbourneTime,
  getMelbourneDisplayTime,
  formatTime,
  formatDateParts,
  formatTime12h,
  getAmPm
};
