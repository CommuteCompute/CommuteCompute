/**
 * Fetch utilities with timeout, retry, and circuit breaker support
 *
 * This module provides robust HTTP request handling to prevent hanging
 * and handle flaky external APIs gracefully.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {Object} options - fetch options
 * @param {number} timeout - timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    throw error;
  }
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string} url - URL to fetch
 * @param {Object} options - fetch options
 * @param {number} maxRetries - maximum number of retries (default: 3)
 * @param {number} timeout - timeout per request in ms (default: 10000)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, timeout = 10000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, options, timeout);

      // If response is not ok, throw to trigger retry
      if (!response.ok && response.status >= 500 && attempt < maxRetries) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) or aborts
      if (error.message.includes('timeout') || (error.response && error.response.status < 500)) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * Circuit Breaker for API calls
 * Prevents cascading failures by stopping requests to failing services
 */
export class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold; // Number of failures before opening circuit
    this.timeout = timeout; // Time in ms before attempting to close circuit
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
      // Try half-open state
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }

  reset() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt).toISOString() : null
    };
  }
}

/**
 * Rate limiter to prevent API throttling
 */
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      // Wait until we can make another request
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.acquire(); // Recursive call after waiting
    }

    this.requests.push(now);
  }
}
