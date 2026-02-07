/**
 * Data Validator - Multi-Layer Validation with Confidence Scores
 * Part of the Commute Compute System™
 *
 * Provides:
 * - Geocoding confidence scores (0-100%)
 * - Cross-reference validation across sources
 * - Transit stop validation
 * - Data quality indicators
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Design Principles:
 * - Accuracy from up-to-date sources
 * - Intelligent redundancies
 *
 * License: AGPL-3.0
 */

class DataValidator {
  constructor() {
    this.confidenceThresholds = {
      high: 90,
      medium: 70,
      low: 50
    };
  }

  /**
   * Calculate geocoding confidence score
   *
   * Factors considered:
   * - Number of sources agreeing
   * - Precision of match (exact vs approximate)
   * - Completeness of address
   * - Distance between source results
   */
  calculateGeocodingConfidence(results) {
    if (!results || results.length === 0) {
      return {
        score: 0,
        level: 'none',
        message: 'No geocoding results found'
      };
    }

    let score = 0;

    // Base score: 50 for having at least one result
    score += 50;

    // Multiple sources agreement (+20)
    if (results.length >= 2) {
      const coords = results.map(r => ({ lat: r.lat, lon: r.lon }));
      const maxDistance = this.calculateMaxDistance(coords);

      if (maxDistance < 0.01) score += 20; // Results within 1km
      else if (maxDistance < 0.05) score += 10; // Results within 5km
    }

    // Address completeness (+15)
    const firstResult = results[0];
    if (firstResult.display_name) {
      const parts = firstResult.display_name.split(',').length;
      if (parts >= 4) score += 15; // Full address
      else if (parts >= 3) score += 10; // Partial address
      else if (parts >= 2) score += 5;
    }

    // Source reliability (+15)
    const sources = results.map(r => r.source);
    if (sources.includes('google')) score += 10; // Google is most reliable
    if (sources.includes('nominatim')) score += 5;

    // Cap at 100
    score = Math.min(100, score);

    // Determine confidence level
    let level = 'low';
    if (score >= this.confidenceThresholds.high) level = 'high';
    else if (score >= this.confidenceThresholds.medium) level = 'medium';

    return {
      score: Math.round(score),
      level,
      message: this.getConfidenceMessage(score),
      sourceCount: results.length,
      sources: sources.join(', ')
    };
  }

  /**
   * Calculate maximum distance between coordinate pairs
   */
  calculateMaxDistance(coords) {
    if (coords.length < 2) return 0;

    let maxDist = 0;
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const dist = this.haversineDistance(
          coords[i].lat, coords[i].lon,
          coords[j].lat, coords[j].lon
        );
        maxDist = Math.max(maxDist, dist);
      }
    }
    return maxDist;
  }

  /**
   * Haversine distance calculation (in degrees, approximate)
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Get confidence message
   */
  getConfidenceMessage(score) {
    if (score >= 90) return 'Very high confidence - location verified';
    if (score >= 70) return 'Good confidence - location likely correct';
    if (score >= 50) return 'Medium confidence - verify location';
    return 'Low confidence - please check address';
  }

  /**
   * Validate transit stop
   */
  validateTransitStop(stop, location) {
    const confidence = {
      score: 0,
      level: 'unknown',
      checks: []
    };

    // Check 1: Stop has required fields
    if (stop.stop_id && stop.stop_name) {
      confidence.score += 30;
      confidence.checks.push('[OK] Stop ID and name present');
    } else {
      confidence.checks.push('[X] Missing stop information');
      return { ...confidence, level: 'low', message: 'Incomplete stop data' };
    }

    // Check 2: Stop has coordinates
    if (stop.lat && stop.lon) {
      confidence.score += 20;
      confidence.checks.push('[OK] Coordinates available');

      // Check 3: Stop is within reasonable distance from address
      if (location && location.lat && location.lon) {
        const distance = this.haversineDistance(
          location.lat, location.lon,
          stop.lat, stop.lon
        );

        if (distance < 0.8) { // Within 800m
          confidence.score += 30;
          confidence.checks.push(`[OK] Within walking distance (${Math.round(distance * 1000)}m)`);
        } else if (distance < 2) {
          confidence.score += 15;
          confidence.checks.push(`[!] Distance: ${Math.round(distance * 1000)}m (consider closer stop)`);
        } else {
          confidence.checks.push(`[X] Far from address: ${Math.round(distance * 1000)}m`);
        }
      }
    } else {
      confidence.checks.push('[!] No coordinates');
    }

    // Check 4: Stop has route type
    if (stop.route_type !== undefined) {
      confidence.score += 20;
      const types = ['Train', 'Tram', 'Bus', 'V/Line', 'Night Bus'];
      const typeName = types[stop.route_type] || 'Unknown';
      confidence.checks.push(`[OK] Route type: ${typeName}`);
    }

    // Determine level
    if (confidence.score >= 80) confidence.level = 'high';
    else if (confidence.score >= 60) confidence.level = 'medium';
    else confidence.level = 'low';

    confidence.message = `${confidence.level} confidence transit stop`;

    return confidence;
  }

  /**
   * Cross-validate geocoding results
   */
  crossValidateGeocoding(sources) {
    const validation = {
      isValid: false,
      agreement: 'none',
      message: ''
    };

    if (sources.length < 2) {
      validation.message = 'Single source - cannot cross-validate';
      validation.isValid = sources.length === 1;
      return validation;
    }

    // Calculate coordinate agreement
    const coords = sources.map(s => ({ lat: s.lat, lon: s.lon }));
    const maxDistance = this.calculateMaxDistance(coords);

    if (maxDistance < 0.01) {
      validation.agreement = 'excellent';
      validation.isValid = true;
      validation.message = 'All sources agree (within 1km)';
    } else if (maxDistance < 0.05) {
      validation.agreement = 'good';
      validation.isValid = true;
      validation.message = 'Sources generally agree (within 5km)';
    } else if (maxDistance < 0.1) {
      validation.agreement = 'moderate';
      validation.isValid = true;
      validation.message = 'Sources vary somewhat (within 10km)';
    } else {
      validation.agreement = 'poor';
      validation.isValid = false;
      validation.message = `Sources disagree significantly (${Math.round(maxDistance)}km apart)`;
    }

    return validation;
  }

  /**
   * Get validation summary for display
   */
  getValidationSummary(geocodingResults, transitStop, addressLocation) {
    const summary = {
      geocoding: this.calculateGeocodingConfidence(geocodingResults),
      crossValidation: this.crossValidateGeocoding(geocodingResults),
      transitStop: transitStop ? this.validateTransitStop(transitStop, addressLocation) : null,
      overallScore: 0,
      overallLevel: 'unknown',
      recommendations: []
    };

    // Calculate overall score (weighted average)
    let weights = { geocoding: 0.5 };
    summary.overallScore = summary.geocoding.score * weights.geocoding;

    if (summary.transitStop) {
      weights.transit = 0.5;
      summary.overallScore += summary.transitStop.score * weights.transit;
    }

    // Normalize if we have transit validation
    if (summary.transitStop) {
      summary.overallScore = summary.overallScore; // Already weighted 50/50
    }

    // Determine overall level
    if (summary.overallScore >= 85) summary.overallLevel = 'high';
    else if (summary.overallScore >= 65) summary.overallLevel = 'medium';
    else summary.overallLevel = 'low';

    // Add recommendations
    if (summary.geocoding.score < 70) {
      summary.recommendations.push('Consider entering more specific address details');
    }
    if (summary.crossValidation.agreement === 'poor') {
      summary.recommendations.push('Verify address on map before confirming');
    }
    if (summary.transitStop && summary.transitStop.score < 70) {
      summary.recommendations.push('Check if selected transit stop is correct');
    }

    return summary;
  }
}

export default new DataValidator();
