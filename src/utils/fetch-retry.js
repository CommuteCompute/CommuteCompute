/**
 * Fetch Retry Utility — Shared Module
 *
 * Exponential backoff wrapper for GTFS-RT fetches.
 * Returns empty array on exhaustion so Promise.all() never rejects.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/**
 * Retry wrapper for GTFS-RT fetches — single retry with exponential backoff.
 * Returns [] on exhaustion so Promise.all() never rejects.
 * @param {Function} fetchFn - Async function to retry
 * @param {string} label - Label for logging (e.g. 'cc-train')
 * @param {number} [retries=1] - Number of retries after initial attempt
 * @param {number} [delayMs=1500] - Initial delay between retries in milliseconds
 * @returns {Promise<Array>} Result of fetchFn or empty array on failure
 */
export async function fetchWithRetry(fetchFn, label, retries = 1, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchFn();
    } catch (e) {
      if (attempt < retries) {
        console.warn(`[${label}] Fetch attempt ${attempt + 1} failed: ${e.message} — retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      } else {
        console.error(`[${label}] All ${retries + 1} fetch attempts failed: ${e.message}`);
        return [];
      }
    }
  }
}

export default { fetchWithRetry };
