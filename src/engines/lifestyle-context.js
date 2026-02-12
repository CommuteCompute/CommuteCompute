/**
 * LifestyleContext Engine v1.1
 * Part of the Commute Compute™ System
 *
 * Provides contextual lifestyle suggestions based on weather, time of day,
 * and season. Extends the CommuteCompute™ "1 glance, no app switching"
 * philosophy to lifestyle decisions beyond just transit.
 *
 * Suggestion types: umbrella, jacket, sunglasses, sunscreen, hydration, layers
 * Each suggestion has a priority tier and activation logic based on weather
 * conditions, UV index, temperature, humidity, wind speed, and time of day.
 *
 * Supports all Australian states/territories:
 * - VIC: Victoria
 * - NSW: New South Wales
 * - QLD: Queensland
 * - SA: South Australia
 * - WA: Western Australia
 * - TAS: Tasmania
 * - NT: Northern Territory
 * - ACT: Australian Capital Territory
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const DISPLAY_LINE_MAX_LENGTH = 22;

const RAIN_CONDITIONS = ['rain', 'shower', 'drizzle', 'storm', 'thunderstorm'];

/** States with high UV exposure requiring extra sunscreen vigilance */
const HIGH_UV_STATES = ['QLD', 'WA', 'NT'];

/** Valid Australian state/territory codes */
const VALID_STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

/** Wind speed threshold for apparent temperature display (km/h) */
const WIND_CHILL_THRESHOLD_KMH = 15;

/** Steps per minute while walking (average adult pace) */
const STEPS_PER_MINUTE = 100;

/** Disruption count thresholds for commute stress */
const STRESS_LOW_DISRUPTIONS = 0;
const STRESS_MEDIUM_DISRUPTIONS = 1;
const STRESS_HIGH_DISRUPTIONS = 2;

// =============================================================================
// DEFAULT RESPONSE
// =============================================================================

/**
 * Returns the default response when no weather data is available.
 * Per project rules: no mock data fallbacks - return sensible defaults.
 * @returns {Object} Default lifestyle context with all suggestions inactive
 */
function buildNoDataResponse() {
  return {
    suggestions: [
      { type: 'umbrella', active: false, text: null, priority: 0 },
      { type: 'jacket', active: false, text: null, priority: 0 },
      { type: 'sunglasses', active: false, text: null, priority: 0 },
      { type: 'sunscreen', active: false, text: null, priority: 0 },
      { type: 'hydration', active: false, text: null, priority: 0 },
      { type: 'layers', active: false, text: null, priority: 0 }
    ],
    primarySuggestion: null,
    secondarySuggestion: null,
    displayLine: 'NO WEATHER DATA',
    noSuggestions: true
  };
}

// =============================================================================
// LIFESTYLE CONTEXT ENGINE
// =============================================================================

/**
 * LifestyleContext - Contextual lifestyle suggestion engine for Commute Compute™.
 *
 * Analyzes weather conditions, time of day, and user location to produce
 * actionable lifestyle suggestions (umbrella, jacket, sunglasses, sunscreen,
 * hydration, layers) rendered on the CommuteCompute™ dashboard.
 *
 * @example
 * const engine = new LifestyleContext();
 * const result = engine.calculate({
 *   weather: { temp: 12, condition: 'rain', umbrella: true, windSpeed: 15, humidity: 80, uvIndex: 2 },
 *   currentTime: new Date(),
 *   state: 'VIC'
 * });
 * // result.displayLine => 'UMBRELLA + JACKET'
 */
class LifestyleContext {

  /**
   * Main calculation method. Evaluates all lifestyle suggestion categories
   * and returns a structured result with active suggestions sorted by priority.
   *
   * Uses full-day forecast when available: equipment you carry when leaving home
   * (umbrella, jacket) considers ALL remaining hours of the day, not just current
   * conditions. If it rains at 5pm, you still need an umbrella when leaving at 8am.
   *
   * @param {Object} params
   * @param {Object} params.weather - Weather data object
   * @param {number} params.weather.temp - Temperature in Celsius
   * @param {string} params.weather.condition - Weather condition string (e.g. 'rain', 'clear', 'cloudy')
   * @param {boolean} params.weather.umbrella - Whether umbrella is recommended by weather source
   * @param {number} params.weather.windSpeed - Wind speed in km/h
   * @param {number} params.weather.humidity - Humidity percentage (0-100)
   * @param {number} params.weather.uvIndex - UV index (0-15+)
   * @param {Array} [params.weather.dayForecast] - Hourly forecast for remaining day
   * @param {Date} params.currentTime - Current local time
   * @param {string} params.state - User's Australian state (VIC, NSW, QLD, SA, WA, TAS, NT, ACT)
   * @returns {Object} Lifestyle context with suggestions, display line, and metadata
   */
  calculate(params) {
    const { weather, currentTime, state } = params || {};

    // No mock data fallbacks - if weather is missing, return the no-data response
    if (!weather || typeof weather.temp !== 'number') {
      return buildNoDataResponse();
    }

    const time = currentTime instanceof Date ? currentTime : new Date();
    const resolvedState = VALID_STATES.includes(state) ? state : null;
    const forecast = Array.isArray(weather.dayForecast) ? weather.dayForecast : [];

    // Evaluate each suggestion category (full-day awareness for carry-all-day items)
    const umbrella = this._checkUmbrella(weather, forecast);
    const jacket = this._checkJacket(weather, forecast);
    const sunglasses = this._checkSunglasses(weather, time);
    const sunscreen = this._checkSunscreen(weather, time, resolvedState);
    const hydration = this._checkHydration(weather, forecast);
    const layers = this._checkLayers(weather, time, forecast);

    const suggestions = [umbrella, jacket, sunglasses, sunscreen, hydration, layers];

    // Sort active suggestions by priority (ascending = highest priority first)
    const activeSuggestions = suggestions
      .filter(s => s.active)
      .sort((a, b) => a.priority - b.priority);

    const primarySuggestion = activeSuggestions.length > 0
      ? activeSuggestions[0].text
      : null;

    const secondarySuggestion = activeSuggestions.length > 1
      ? activeSuggestions[1].text
      : null;

    const displayLine = this._buildDisplayLine(suggestions);
    const noSuggestions = activeSuggestions.length === 0;

    return {
      suggestions,
      primarySuggestion,
      secondarySuggestion,
      displayLine,
      noSuggestions
    };
  }

  /**
   * Calculate commute mindset and extended metrics.
   * Provides stress level, walk step estimate, and apparent temperature.
   *
   * @param {Object} params
   * @param {Array} params.legs - Journey legs from CommuteCompute
   * @param {Object} params.weather - Weather data with temp, windSpeed
   * @param {number} params.totalWalkMins - Total walk time in minutes
   * @param {number} params.disruptionCount - Number of disrupted legs
   * @param {number} params.transferCount - Number of transfers
   * @returns {Object} Extended lifestyle metrics
   */
  calculateMindset(params) {
    const { legs = [], weather = {}, totalWalkMins = 0, disruptionCount = 0, transferCount = 0 } = params || {};

    // Commute stress assessment
    const stressFactors = disruptionCount + (transferCount > 2 ? 1 : 0);
    let stressLevel, stressDisplay;
    if (stressFactors >= STRESS_HIGH_DISRUPTIONS) {
      stressLevel = 'HIGH';
      stressDisplay = 'PLAN B NEEDED';
    } else if (stressFactors >= STRESS_MEDIUM_DISRUPTIONS) {
      stressLevel = 'MEDIUM';
      stressDisplay = 'MINOR DELAYS';
    } else {
      stressLevel = 'LOW';
      stressDisplay = 'SMOOTH COMMUTE';
    }

    // Walk step estimate
    const walkSteps = Math.round(totalWalkMins * STEPS_PER_MINUTE);
    const stepsDisplay = walkSteps > 0 ? '~' + walkSteps + ' STEPS' : null;

    // Apparent temperature (wind chill effect)
    const temp = typeof weather.temp === 'number' ? weather.temp : null;
    const windSpeed = typeof weather.windSpeed === 'number' ? weather.windSpeed : 0;
    let apparentTemp = temp;
    let feelsLikeDisplay = null;

    if (temp !== null && windSpeed >= WIND_CHILL_THRESHOLD_KMH && temp < 20) {
      // Australian apparent temperature formula (simplified)
      apparentTemp = Math.round(temp - (windSpeed / 10) * 1.5);
      feelsLikeDisplay = 'FEELS ' + apparentTemp + '\u00B0';
    }

    return {
      stressLevel,
      stressDisplay,
      walkSteps,
      stepsDisplay,
      apparentTemp,
      feelsLikeDisplay,
      mindsetLine: stressDisplay
    };
  }

  // ===========================================================================
  // INDIVIDUAL SUGGESTION CHECKS
  // ===========================================================================

  /**
   * Check umbrella suggestion.
   * Priority 1 when active.
   * Active when weather.umbrella is true, current condition indicates rain/storm,
   * OR any remaining hour of the day has rain forecast. You carry an umbrella
   * all day — if it rains on the way home, you still need it when leaving.
   *
   * @param {Object} weather - Weather data
   * @param {Array} forecast - Hourly forecast for remaining day
   * @returns {Object} Umbrella suggestion object
   */
  _checkUmbrella(weather, forecast) {
    const condition = (weather.condition || '').toLowerCase();
    const umbrellaFlag = weather.umbrella === true;
    const rainyCondition = RAIN_CONDITIONS.some(rc => condition.includes(rc));
    const rainLaterToday = forecast.some(h => h.isRainy);

    const active = umbrellaFlag || rainyCondition || rainLaterToday;

    return {
      type: 'umbrella',
      active,
      text: active ? 'BRING UMBRELLA' : null,
      priority: active ? 1 : 0
    };
  }

  /**
   * Check jacket suggestion.
   * Priority 2 when active.
   * Active when current or any forecast hour temp < 15, or wind chill.
   * You carry a jacket all day — if evening drops cold, bring it when leaving.
   * Text varies: 'WARM JACKET' if coldest temp < 10, otherwise 'GRAB A JACKET'.
   *
   * @param {Object} weather - Weather data
   * @param {Array} forecast - Hourly forecast for remaining day
   * @returns {Object} Jacket suggestion object
   */
  _checkJacket(weather, forecast) {
    const temp = weather.temp;
    const windSpeed = typeof weather.windSpeed === 'number' ? weather.windSpeed : 0;

    const coldEnough = temp < 15;
    const windChillFactor = windSpeed > 25 && temp < 20;
    const coldLaterToday = forecast.some(h => h.temp < 15 || h.apparentTemp < 13);
    const active = coldEnough || windChillFactor || coldLaterToday;

    // Use coldest forecast temp to determine jacket severity
    const coldestTemp = forecast.length > 0
      ? Math.min(temp, ...forecast.map(h => h.apparentTemp ?? h.temp))
      : temp;

    let text = null;
    if (active) {
      text = coldestTemp < 10 ? 'WARM JACKET' : 'GRAB A JACKET';
    }

    return {
      type: 'jacket',
      active,
      text,
      priority: active ? 2 : 0
    };
  }

  /**
   * Check sunglasses suggestion.
   * Priority 3 when active.
   * Active when condition is clear/sunny/fine AND time is 7am-5pm,
   * or when UV index > 5.
   *
   * @param {Object} weather - Weather data
   * @param {Date} time - Current local time
   * @returns {Object} Sunglasses suggestion object
   */
  _checkSunglasses(weather, time) {
    const condition = (weather.condition || '').toLowerCase();
    const hour = time.getHours();
    const uvIndex = typeof weather.uvIndex === 'number' ? weather.uvIndex : 0;

    const sunnyCondition = ['clear', 'sunny', 'fine'].some(sc => condition.includes(sc));
    const daytime = hour >= 7 && hour < 17; // 7am to before 5pm
    const highUv = uvIndex > 5;

    const active = (sunnyCondition && daytime) || highUv;

    return {
      type: 'sunglasses',
      active,
      text: active ? 'SUNGLASSES' : null,
      priority: active ? 3 : 0
    };
  }

  /**
   * Check sunscreen suggestion.
   * Priority 3 when active (same tier as sunglasses).
   * Active when UV index > 6, or when condition is clear/sunny AND state
   * is QLD/WA/NT AND time is 9am-3pm.
   *
   * @param {Object} weather - Weather data
   * @param {Date} time - Current local time
   * @param {string|null} state - User's Australian state code
   * @returns {Object} Sunscreen suggestion object
   */
  _checkSunscreen(weather, time, state) {
    const condition = (weather.condition || '').toLowerCase();
    const hour = time.getHours();
    const uvIndex = typeof weather.uvIndex === 'number' ? weather.uvIndex : 0;

    const highUv = uvIndex > 6;
    const sunnyCondition = ['clear', 'sunny', 'fine'].some(sc => condition.includes(sc));
    const highUvState = state && HIGH_UV_STATES.includes(state);
    const peakUvHours = hour >= 9 && hour < 15; // 9am to before 3pm
    const stateSpecific = sunnyCondition && highUvState && peakUvHours;

    const active = highUv || stateSpecific;

    return {
      type: 'sunscreen',
      active,
      text: active ? 'WEAR SUNSCREEN' : null,
      priority: active ? 3 : 0
    };
  }

  /**
   * Check hydration suggestion.
   * Priority 4 when active.
   * Active when current or any forecast hour temp > 30.
   * Bring a water bottle if it gets hot at any point during the day.
   *
   * @param {Object} weather - Weather data
   * @param {Array} forecast - Hourly forecast for remaining day
   * @returns {Object} Hydration suggestion object
   */
  _checkHydration(weather, forecast) {
    const temp = weather.temp;
    const humidity = typeof weather.humidity === 'number' ? weather.humidity : 0;

    const veryHot = temp > 30;
    const hotAndHumid = temp > 28 && humidity > 70;
    const hotLaterToday = forecast.some(h => h.temp > 30);
    const active = veryHot || hotAndHumid || hotLaterToday;

    return {
      type: 'hydration',
      active,
      text: active ? 'STAY HYDRATED' : null,
      priority: active ? 4 : 0
    };
  }

  /**
   * Check layers suggestion.
   * Priority 5 when active.
   * Active when morning is cool but afternoon warms up significantly (8+ degree swing),
   * or original heuristic: cool morning before 9am with no rain.
   *
   * @param {Object} weather - Weather data
   * @param {Date} time - Current local time
   * @param {Array} forecast - Hourly forecast for remaining day
   * @returns {Object} Layers suggestion object
   */
  _checkLayers(weather, time, forecast) {
    const temp = weather.temp;
    const hour = time.getHours();
    const condition = (weather.condition || '').toLowerCase();

    const isMorning = hour < 9;
    const isCool = temp < 15;
    const isNotRainy = !RAIN_CONDITIONS.some(rc => condition.includes(rc));

    // Check forecast for big temperature swing (cool now, warm later)
    const afternoonHours = forecast.filter(h => h.hour >= 12 && h.hour <= 17);
    const maxAfternoonTemp = afternoonHours.length > 0
      ? Math.max(...afternoonHours.map(h => h.temp))
      : temp;
    const bigSwing = isCool && (maxAfternoonTemp - temp) >= 8;

    const active = (isMorning && isCool && isNotRainy) || bigSwing;

    return {
      type: 'layers',
      active,
      text: active ? 'DRESS IN LAYERS' : null,
      priority: active ? 5 : 0
    };
  }

  // ===========================================================================
  // DISPLAY LINE BUILDER
  // ===========================================================================

  /**
   * Build a compact display line for the e-ink weather box.
   * Maximum 22 characters.
   *
   * Rules:
   * - 0 active suggestions: 'ALL CLEAR'
   * - 1 active suggestion: use that suggestion's text
   * - 2+ active suggestions: combine top 2 by priority (e.g. 'UMBRELLA + JACKET')
   * - Special case: if umbrella is NOT active and nothing higher is active,
   *   show 'NO UMBRELLA' as the display line
   *
   * @param {Array<Object>} suggestions - All suggestion objects
   * @returns {string} Compact display line (max 22 chars)
   */
  _buildDisplayLine(suggestions) {
    const activeSorted = suggestions
      .filter(s => s.active)
      .sort((a, b) => a.priority - b.priority);

    if (activeSorted.length === 0) {
      // Special case: no suggestions active - check umbrella explicitly
      const umbrella = suggestions.find(s => s.type === 'umbrella');
      if (umbrella && !umbrella.active) {
        return 'NO UMBRELLA';
      }
      return 'ALL CLEAR';
    }

    if (activeSorted.length === 1) {
      return this._truncateDisplayLine(activeSorted[0].text);
    }

    // 2+ suggestions: combine top 2 with short labels
    const shortLabels = {
      'BRING UMBRELLA': 'UMBRELLA',
      'WARM JACKET': 'JACKET',
      'GRAB A JACKET': 'JACKET',
      'SUNGLASSES': 'SUNGLASSES',
      'WEAR SUNSCREEN': 'SUNSCREEN',
      'STAY HYDRATED': 'HYDRATE',
      'DRESS IN LAYERS': 'LAYERS'
    };

    const label1 = shortLabels[activeSorted[0].text] || activeSorted[0].text;
    const label2 = shortLabels[activeSorted[1].text] || activeSorted[1].text;
    const combined = label1 + ' + ' + label2;

    return this._truncateDisplayLine(combined);
  }

  /**
   * Truncate a display line to the maximum character length for e-ink display.
   *
   * @param {string} line - Display line text
   * @returns {string} Truncated line (max 22 chars)
   */
  _truncateDisplayLine(line) {
    if (!line) return 'ALL CLEAR';
    if (line.length <= DISPLAY_LINE_MAX_LENGTH) return line;
    return line.substring(0, DISPLAY_LINE_MAX_LENGTH);
  }
}

export default LifestyleContext;
