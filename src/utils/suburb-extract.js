/**
 * Suburb Extraction Utility — Shared Module
 *
 * Extracts suburb/location name from Australian address format.
 * Comprehensive 3-pass implementation with municipality detection
 * and broad city name skipping.
 *
 * Used for e-ink header/footer display and stop name derivation.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/**
 * Extract suburb/location name from Australian address format
 * e.g., "42 Chapel St, South Yarra VIC 3141" -> "South Yarra"
 *
 * Three-pass extraction:
 * 1. Combined suburb+state parts (e.g. "Melbourne VIC 3000")
 * 2. Nominatim-style addresses with separate suburb and state parts,
 *    detecting municipality names via "City of [name]" parts
 * 3. Fallback to second comma-separated part
 *
 * @param {string} address - Full Australian address string
 * @returns {string|null} Extracted suburb name or null
 */
export function extractSuburb(address) {
  if (!address) return null;
  const parts = address.split(',');
  // Pass 1: Look for "Melbourne VIC 3000" style combined suburb+state parts
  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i].trim();
    const match = part.match(/^([A-Za-z\s]+?)(?:\s+(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)|\s+\d{4})/);
    if (match && match[1].trim().length > 1) return match[1].trim();
  }
  // Pass 2: Nominatim-style addresses where suburb and state are separate parts
  // e.g. "..., South Yarra, Melbourne, City of Melbourne, Victoria, 3141, Australia"
  // Municipality names (e.g. "Melbourne") appear closer to state than suburbs (e.g. "South Yarra").
  // Detect municipalities via matching "City of [name]" parts and prefer the suburb.
  const statePattern = /^(VIC|NSW|QLD|SA|WA|TAS|NT|ACT|Victoria|New South Wales|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory)$/i;
  for (let i = 1; i < parts.length; i++) {
    if (statePattern.test(parts[i].trim())) {
      let municipalityFallback = null;
      for (let j = i - 1; j >= 0; j--) {
        const candidate = parts[j].trim();
        if (/^[A-Z][a-z]/.test(candidate) && candidate.length > 2 &&
            !/^(City of|Shire of)/i.test(candidate) &&
            !/\b(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Terrace|Tce|Boulevard|Blvd|Highway|Hwy|Way|Crescent|Cres|Parade|Pde|Close|Circuit|Esplanade|District|House|Tower|Centre|Center|Building|Complex|Plaza|Mall)\b/i.test(candidate)) {
          // Skip municipality-level names — prefer suburb if available
          const isMunicipality = parts.some(p =>
            p.trim().toLowerCase() === `city of ${candidate.toLowerCase()}`
          );
          if (isMunicipality) {
            if (!municipalityFallback) municipalityFallback = candidate;
            continue;
          }
          // Skip broad capital city names — prefer actual suburb (e.g. "South Yarra" over "Melbourne")
          const broadCities = ['melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'hobart', 'darwin', 'canberra'];
          if (broadCities.includes(candidate.toLowerCase())) {
            if (!municipalityFallback) municipalityFallback = candidate;
            continue;
          }
          return candidate;
        }
      }
      if (municipalityFallback) return municipalityFallback;
    }
  }
  // Pass 3: Fallback — try second part, skip leading digits
  if (parts.length >= 2) {
    const suburbia = parts[1].trim();
    const alphaMatch = suburbia.match(/(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (alphaMatch) return alphaMatch[1];
  }
  return null;
}

export default { extractSuburb };
