/**
 * Decision Logger
 * Records all system decisions for transparency and troubleshooting
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

class DecisionLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 decisions
  }

  /**
   * Log a decision made by the system
   * @param {object} decision - Decision details
   */
  log(decision) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...decision
    };

    this.logs.push(entry);

    // Keep only the most recent decisions
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Decision logged to internal array (no console output per dev rules)
  }

  /**
   * Log geocoding decisions
   */
  logGeocoding(address, service, result, attempts = []) {
    this.log({
      category: 'Geocoding',
      decision: `Used ${service} for "${address}"`,
      details: {
        address,
        service,
        coordinates: result ? { lat: result.lat, lon: result.lon } : null,
        attemptedServices: attempts,
        success: !!result
      }
    });
  }

  /**
   * Log route calculation decisions
   */
  logRouteCalculation(from, to, mode, result) {
    this.log({
      category: 'Route Calculation',
      decision: `${from} → ${to} via ${mode}`,
      details: {
        from,
        to,
        mode,
        departureTime: result?.departureTime,
        arrivalTime: result?.arrivalTime,
        duration: result?.duration
      }
    });
  }

  /**
   * Log delay detection
   */
  logDelayDetection(service, scheduledTime, actualTime, delayMinutes) {
    this.log({
      category: 'Delay Detection',
      decision: `${service} delayed by ${delayMinutes} minutes`,
      details: {
        service,
        scheduledTime,
        actualTime,
        delayMinutes,
        severity: delayMinutes > 10 ? 'high' : delayMinutes > 5 ? 'medium' : 'low'
      }
    });
  }

  /**
   * Log connection adjustments
   */
  logConnectionAdjustment(original, adjusted, reason) {
    this.log({
      category: 'Connection Adjustment',
      decision: `Adjusted connection due to ${reason}`,
      details: {
        original,
        adjusted,
        reason
      }
    });
  }

  /**
   * Log coffee decisions
   */
  logCoffeeDecision(canGetCoffee, availableTime, requiredTime) {
    this.log({
      category: 'Coffee Decision',
      decision: canGetCoffee ? 'YES - Get coffee' : 'NO - Go direct',
      details: {
        canGetCoffee,
        availableMinutes: availableTime,
        requiredMinutes: requiredTime,
        buffer: availableTime - requiredTime
      }
    });
  }

  /**
   * Log API fallback decisions
   */
  logApiFallback(service, primary, fallback, reason) {
    this.log({
      category: 'API Fallback',
      decision: `Switched from ${primary} to ${fallback}`,
      details: {
        service,
        primaryService: primary,
        fallbackService: fallback,
        reason
      }
    });
  }

  /**
   * Log transit mode selection
   */
  logTransitModeSelection(selectedMode, availableModes, reason) {
    this.log({
      category: 'Transit Mode Selection',
      decision: `Selected ${selectedMode}`,
      details: {
        selectedMode,
        availableModes,
        reason
      }
    });
  }

  /**
   * Log cache usage
   */
  logCacheUsage(cacheType, hit, key) {
    this.log({
      category: 'Cache',
      decision: hit ? `Cache HIT for ${cacheType}` : `Cache MISS for ${cacheType}`,
      details: {
        cacheType,
        hit,
        key: key?.substring(0, 50) // Truncate long keys
      }
    });
  }

  /**
   * Get all logs
   */
  getAllLogs() {
    return this.logs;
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category) {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Get logs since timestamp
   */
  getLogsSince(timestamp) {
    return this.logs.filter(log => new Date(log.timestamp) >= new Date(timestamp));
  }

  /**
   * Get recent logs (last N)
   */
  getRecentLogs(count = 100) {
    return this.logs.slice(-count);
  }

  /**
   * Get statistics
   */
  getStats() {
    const categories = {};
    for (const log of this.logs) {
      categories[log.category] = (categories[log.category] || 0) + 1;
    }

    return {
      totalDecisions: this.logs.length,
      categories,
      oldestLog: this.logs[0]?.timestamp,
      newestLog: this.logs[this.logs.length - 1]?.timestamp
    };
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  export() {
    return JSON.stringify({
      exported: new Date().toISOString(),
      stats: this.getStats(),
      logs: this.logs
    }, null, 2);
  }
}

export default DecisionLogger;
