/**
 * Cafe Busy-ness Detector
 * Determines how busy a cafe is using multiple data sources
 * Falls back to time-based peak detection if live data unavailable
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';

class CafeBusyDetector {
  constructor(preferences = null) {
    // Store preferences for timezone detection
    this.preferences = preferences;

    // Peak time definitions (local time, location-agnostic)
    this.PEAK_TIMES = [
      { start: 7, end: 9, name: 'Morning Rush', multiplier: 2.0 },
      { start: 12, end: 14, name: 'Lunch Rush', multiplier: 1.8 },
      { start: 16, end: 17, name: 'Afternoon Peak', multiplier: 1.5 }
    ];

    // Base coffee purchase times (minutes)
    this.BASE_COFFEE_TIME = 3; // Normal time
    this.MIN_COFFEE_TIME = 2;  // Fastest possible
    this.MAX_COFFEE_TIME = 8;  // Maximum busy time

    // API configuration
    this.googleApiKey = process.env.GOOGLE_PLACES_API_KEY || null;

    // Cache for busy-ness data (5 minutes)
    this.busyCache = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get timezone for Australian state (location-agnostic design)
   * COMPLIANCE: DEVELOPMENT-RULES.md Section K
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
   * Get cafe busy-ness level and adjusted coffee time
   * Returns: { level: 'low'|'medium'|'high', coffeeTime: number, source: string, details: {...} }
   */
  async getCafeBusyness(address, lat, lon) {
    const cacheKey = `${lat},${lon}`;

    // Check cache first
    const cached = this.busyCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      return cached.data;
    }

    // Try data sources in order of preference
    let result = null;

    // 1. Try Google Places API (most accurate)
    if (this.googleApiKey) {
      result = await this.getGooglePlacesBusyness(address, lat, lon);
      if (result) {
        this.busyCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    // 2. Fall back to time-based detection
    result = this.getTimeBasedBusyness();

    this.busyCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * Get busy-ness from Google Places API
   * Uses Popular Times data if available
   */
  async getGooglePlacesBusyness(address, lat, lon) {
    try {
      // First, find the place ID using Places API (New)
      // COMPLIANCE: DEVELOPMENT-RULES.md Section 11.3 - Use Places API (New)
      const searchUrl = 'https://places.googleapis.com/v1/places:searchNearby';
      const searchBody = {
        includedTypes: ['cafe'],
        maxResultCount: 1,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: 50.0
          }
        }
      };

      const searchResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.googleApiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.regularOpeningHours'
        },
        body: JSON.stringify(searchBody)
      });
      const searchData = await searchResponse.json();

      if (!searchData.places || searchData.places.length === 0) {
        return null;
      }

      const place = searchData.places[0];
      const placeId = place.id;

      // Get place details using Places API (New)
      const detailsUrl = `https://places.googleapis.com/v1/places/${placeId}`;

      const detailsResponse = await fetch(detailsUrl, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': this.googleApiKey,
          'X-Goog-FieldMask': 'displayName,rating,userRatingCount,regularOpeningHours,currentOpeningHours'
        }
      });
      const detailsData = await detailsResponse.json();

      if (detailsData.error) {
        return null;
      }

      // Google doesn't provide real-time busy-ness via API (only in app)
      // So we use rating + time of day as proxy
      const now = new Date();
      const hour = now.getHours();
      // Places API (New) response structure
      const rating = detailsData.rating || 3.5;
      const ratingCount = detailsData.userRatingCount || 0;

      // Popular cafe = high rating + many reviews = likely busy during peaks
      const popularity = Math.min((rating / 5.0) * (Math.log10(ratingCount + 1) / 4), 1.0);

      // Check if we're in peak time
      const peakInfo = this.isPeakTime(hour);

      let level = 'low';
      let multiplier = 1.0;

      if (peakInfo && popularity > 0.5) {
        // Popular cafe during peak time = busy
        level = popularity > 0.7 ? 'high' : 'medium';
        multiplier = peakInfo.multiplier * popularity;
      } else if (peakInfo) {
        // Peak time but not super popular
        level = 'medium';
        multiplier = 1.5;
      } else if (popularity > 0.7) {
        // Popular cafe but off-peak
        level = 'medium';
        multiplier = 1.3;
      }

      const coffeeTime = Math.round(
        Math.max(this.MIN_COFFEE_TIME,
        Math.min(this.MAX_COFFEE_TIME, this.BASE_COFFEE_TIME * multiplier))
      );

      return {
        level,
        coffeeTime,
        source: 'google_places',
        details: {
          // Places API (New) uses displayName.text
          name: detailsData.displayName?.text || 'Unknown Cafe',
          rating,
          ratingCount,
          popularity,
          isPeakTime: !!peakInfo,
          peakName: peakInfo?.name || 'Off-peak',
          multiplier,
          estimatedWaitTime: coffeeTime
        }
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Get busy-ness based on time of day (fallback method)
   * Returns estimated busy-ness for current time
   * COMPLIANCE: DEVELOPMENT-RULES.md - Location-agnostic design
   */
  getTimeBasedBusyness() {
    // Get user's timezone from preferences
    const prefs = this.preferences 
      ? (typeof this.preferences.get === 'function' ? this.preferences.get() : this.preferences)
      : {};
    const state = prefs.state || 'VIC';
    const timezone = this.getTimezoneForState(state);

    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();
    const timeDecimal = hour + (minute / 60);

    // Check if we're in a peak period
    const peakInfo = this.isPeakTime(hour);

    if (peakInfo) {
      // During peak time - calculate intensity based on how far into the peak we are
      const peakMid = (peakInfo.start + peakInfo.end) / 2;
      const distanceFromPeak = Math.abs(timeDecimal - peakMid);
      const peakDuration = (peakInfo.end - peakInfo.start) / 2;
      const intensity = 1.0 - (distanceFromPeak / peakDuration);

      const level = intensity > 0.7 ? 'high' : intensity > 0.4 ? 'medium' : 'low';
      const multiplier = 1.0 + (peakInfo.multiplier - 1.0) * intensity;

      const coffeeTime = Math.round(
        Math.max(this.MIN_COFFEE_TIME,
        Math.min(this.MAX_COFFEE_TIME, this.BASE_COFFEE_TIME * multiplier))
      );

      return {
        level,
        coffeeTime,
        source: 'time_based',
        details: {
          currentTime: localTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
          isPeakTime: true,
          peakName: peakInfo.name,
          peakIntensity: Math.round(intensity * 100),
          multiplier: multiplier.toFixed(1),
          estimatedWaitTime: coffeeTime,
          reason: `${peakInfo.name} - ${Math.round(intensity * 100)}% intensity`
        }
      };
    }

    // Off-peak time - minimal wait
    return {
      level: 'low',
      coffeeTime: this.BASE_COFFEE_TIME,
      source: 'time_based',
      details: {
        currentTime: localTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        isPeakTime: false,
        peakName: 'Off-peak',
        peakIntensity: 0,
        multiplier: 1.0,
        estimatedWaitTime: this.BASE_COFFEE_TIME,
        reason: 'Off-peak hours - minimal wait expected'
      }
    };
  }

  /**
   * Check if given hour is in peak time
   * Returns peak info or null
   */
  isPeakTime(hour) {
    for (const peak of this.PEAK_TIMES) {
      if (hour >= peak.start && hour < peak.end) {
        return peak;
      }
    }
    return null;
  }

  /**
   * Get human-readable description of busy-ness
   */
  getBusyDescription(busyData) {
    const descriptions = {
      low: {
        icon: '😊',
        text: 'Quiet',
        detail: 'Minimal wait expected'
      },
      medium: {
        icon: '🙂',
        text: 'Moderate',
        detail: 'Some wait expected'
      },
      high: {
        icon: '😅',
        text: 'Busy',
        detail: 'Longer wait expected'
      }
    };

    const desc = descriptions[busyData.level] || descriptions.low;

    return {
      ...desc,
      coffeeTime: busyData.coffeeTime,
      source: busyData.source === 'google_places' ? 'Live Data' : 'Time-Based Estimate',
      details: busyData.details
    };
  }

  /**
   * Clear busy-ness cache
   */
  clearCache() {
    this.busyCache.clear();
  }

  /**
   * Get current peak time info (for display)
   * COMPLIANCE: DEVELOPMENT-RULES.md - Location-agnostic design
   */
  getCurrentPeakInfo() {
    // Get user's timezone from preferences
    const prefs = this.preferences 
      ? (typeof this.preferences.get === 'function' ? this.preferences.get() : this.preferences)
      : {};
    const state = prefs.state || 'VIC';
    const timezone = this.getTimezoneForState(state);

    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const hour = localTime.getHours();

    const peak = this.isPeakTime(hour);

    return {
      currentTime: localTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
      isPeakTime: !!peak,
      peakName: peak?.name || 'Off-peak',
      nextPeak: this.getNextPeakTime(hour),
      allPeaks: this.PEAK_TIMES.map(p => ({
        name: p.name,
        hours: `${p.start}:00 - ${p.end}:00`,
        multiplier: p.multiplier
      }))
    };
  }

  /**
   * Get next peak time from current hour
   */
  getNextPeakTime(currentHour) {
    for (const peak of this.PEAK_TIMES) {
      if (currentHour < peak.start) {
        return {
          name: peak.name,
          startsIn: peak.start - currentHour,
          startTime: `${peak.start}:00`
        };
      }
    }

    // No peaks left today, return tomorrow's first peak
    const firstPeak = this.PEAK_TIMES[0];
    return {
      name: firstPeak.name,
      startsIn: (24 - currentHour) + firstPeak.start,
      startTime: `${firstPeak.start}:00 (tomorrow)`
    };
  }

  /**
   * Check if cafe is currently open
   * Uses Google Places API opening hours if available, else assumes open during business hours
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {Object} cafeHours - Optional cached cafe hours { open: 'HH:MM', close: 'HH:MM', days: [0-6] }
   * @returns {Promise<{isOpen: boolean, reason?: string, opensAt?: string, closesAt?: string}>}
   */
  async isCafeOpen(lat, lon, cafeHours = null) {
    // Get user's timezone from preferences
    const prefs = this.preferences 
      ? (typeof this.preferences.get === 'function' ? this.preferences.get() : this.preferences)
      : {};
    const state = prefs.state || 'VIC';
    const timezone = this.getTimezoneForState(state);

    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const currentHour = localTime.getHours();
    const currentMinutes = localTime.getMinutes();
    const currentDay = localTime.getDay(); // 0 = Sunday
    const currentTimeDecimal = currentHour + currentMinutes / 60;

    // If we have cached cafe hours, use those
    if (cafeHours && cafeHours.open && cafeHours.close) {
      const [openH, openM] = cafeHours.open.split(':').map(Number);
      const [closeH, closeM] = cafeHours.close.split(':').map(Number);
      const openTimeDecimal = openH + openM / 60;
      const closeTimeDecimal = closeH + closeM / 60;

      // Check if cafe operates on this day
      if (cafeHours.days && !cafeHours.days.includes(currentDay)) {
        return { isOpen: false, reason: 'Closed today' };
      }

      if (currentTimeDecimal < openTimeDecimal) {
        return { isOpen: false, reason: 'Not open yet', opensAt: cafeHours.open };
      }
      if (currentTimeDecimal >= closeTimeDecimal) {
        return { isOpen: false, reason: 'Closed for the day', closesAt: cafeHours.close };
      }
      return { isOpen: true, closesAt: cafeHours.close };
    }

    // Try Google Places API (New) for live opening hours
    // COMPLIANCE: DEVELOPMENT-RULES.md Section 11.3 - Use Places API (New)
    if (this.googleApiKey && lat && lon) {
      try {
        const searchUrl = 'https://places.googleapis.com/v1/places:searchNearby';
        const searchBody = {
          includedTypes: ['cafe'],
          maxResultCount: 1,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: 50.0
            }
          }
        };

        const searchResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googleApiKey,
            'X-Goog-FieldMask': 'places.id,places.currentOpeningHours'
          },
          body: JSON.stringify(searchBody)
        });
        const searchData = await searchResponse.json();

        if (searchData.places && searchData.places.length > 0) {
          const place = searchData.places[0];

          // Places API (New) uses currentOpeningHours.openNow
          if (place.currentOpeningHours && typeof place.currentOpeningHours.openNow === 'boolean') {
            return {
              isOpen: place.currentOpeningHours.openNow,
              reason: place.currentOpeningHours.openNow ? undefined : 'Cafe is closed'
            };
          }
        }
      } catch (error) {
        // Continue with default hours if API check fails
      }
    }

    // Default fallback: assume open during typical cafe hours (6am - 6pm weekdays, 7am - 5pm weekends)
    const isWeekend = currentDay === 0 || currentDay === 6;
    const defaultOpen = isWeekend ? 7 : 6;
    const defaultClose = isWeekend ? 17 : 18;

    if (currentHour < defaultOpen || currentHour >= defaultClose) {
      return {
        isOpen: false,
        reason: currentHour < defaultOpen ? 'Not open yet' : 'Closed for the day',
        opensAt: `${defaultOpen}:00`,
        closesAt: `${defaultClose}:00`
      };
    }

    return { isOpen: true };
  }
}

export default CafeBusyDetector;
