/**
 * Cafe Details API - One-time fetch during setup
 * Fetches business hours and details to cache in webhook URL.
 * This is the ONLY time Google Places is called for cafe data.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { lat, lon, googleKey, cafeName } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ success: false, error: 'lat/lon required' });
    }

    // If no Google key, return estimated hours (still works, just not personalized)
    if (!googleKey) {
      const defaultHoursNoKey = getDefaultCafeHours();
      return res.json({
        success: true,
        cached: true,
        cafe: {
          name: cafeName || 'Local Cafe',
          lat,
          lon,
          hours: defaultHoursNoKey,
          busyness: generateBusynessEstimates(defaultHoursNoKey),
          source: 'default'
        }
      });
    }

    // Fetch from Google Places (one-time during setup)
    
    try {
      // Search for cafe at location
      const searchUrl = `https://places.googleapis.com/v1/places:searchNearby`;
      const searchResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.regularOpeningHours'
        },
        body: JSON.stringify({
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: 100
            }
          },
          includedTypes: ['cafe', 'coffee_shop'],
          maxResultCount: 1
        })
      });

      const searchData = await searchResponse.json();
      
      if (searchData.places && searchData.places.length > 0) {
        const place = searchData.places[0];
        const hours = place.regularOpeningHours?.weekdayDescriptions || getDefaultCafeHours();

        return res.json({
          success: true,
          cached: true,
          cafe: {
            name: place.displayName?.text || cafeName || 'Cafe',
            lat,
            lon,
            placeId: place.id,
            hours: hours,
            busyness: generateBusynessEstimates(hours),
            source: 'google'
          }
        });
      }
    } catch (googleError) {
    }

    // Fallback to default hours
    const defaultHours = getDefaultCafeHours();
    return res.json({
      success: true,
      cached: true,
      cafe: {
        name: cafeName || 'Local Cafe',
        lat,
        lon,
        hours: defaultHours,
        busyness: generateBusynessEstimates(defaultHours),
        source: 'default'
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Default cafe hours for when no Google API is available
 * Based on typical Melbourne cafe hours
 */
function getDefaultCafeHours() {
  return [
    'Monday: 6:30 AM \u2013 4:00 PM',
    'Tuesday: 6:30 AM \u2013 4:00 PM',
    'Wednesday: 6:30 AM \u2013 4:00 PM',
    'Thursday: 6:30 AM \u2013 4:00 PM',
    'Friday: 6:30 AM \u2013 4:00 PM',
    'Saturday: 7:00 AM \u2013 3:00 PM',
    'Sunday: 8:00 AM \u2013 2:00 PM'
  ];
}

/**
 * Generate estimated busyness levels by day and hour.
 * Based on typical Melbourne cafe traffic patterns calibrated to opening hours.
 * Busyness levels: 'quiet' (0-2 min wait), 'moderate' (2-4 min), 'busy' (4-7 min), 'very_busy' (7+ min)
 * Wait time estimates are used by CoffeeDecision to adjust total coffee duration.
 *
 * @param {Array<string>} hoursStrings - Weekday description strings from Google Places
 * @returns {Object} - { dayIndex: { hourString: { level, waitMinutes } } }
 */
function generateBusynessEstimates(hoursStrings) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const busyness = {};

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayName = dayNames[dayIdx];
    const dayStr = (hoursStrings || []).find(h => typeof h === 'string' && h.startsWith(dayName));
    busyness[dayIdx] = {};

    if (!dayStr || dayStr.toLowerCase().includes('closed')) continue;

    // Parse open/close hours
    const timeMatch = dayStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*[\u2013\-]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
    if (!timeMatch || !timeMatch[3] || !timeMatch[6]) continue;

    let openH = parseInt(timeMatch[1], 10);
    if (timeMatch[3].toUpperCase() === 'PM' && openH !== 12) openH += 12;
    if (timeMatch[3].toUpperCase() === 'AM' && openH === 12) openH = 0;

    let closeH = parseInt(timeMatch[4], 10);
    if (timeMatch[6].toUpperCase() === 'PM' && closeH !== 12) closeH += 12;
    if (timeMatch[6].toUpperCase() === 'AM' && closeH === 12) closeH = 0;

    if (isNaN(openH) || isNaN(closeH)) continue;

    const isWeekend = (dayIdx === 0 || dayIdx === 6);

    for (let h = openH; h < closeH; h++) {
      // Melbourne cafe busyness model
      let level = 'quiet';
      let waitMinutes = 1;

      if (h >= 7 && h < 9) {
        // Morning rush
        level = isWeekend ? 'moderate' : 'busy';
        waitMinutes = isWeekend ? 3 : 5;
      } else if (h >= 9 && h < 10) {
        level = isWeekend ? 'busy' : 'moderate';
        waitMinutes = isWeekend ? 5 : 3;
      } else if (h >= 11 && h < 13) {
        // Lunch period
        level = 'moderate';
        waitMinutes = 3;
      } else if (h >= 13 && h < 15) {
        level = 'quiet';
        waitMinutes = 1;
      } else {
        level = 'quiet';
        waitMinutes = 1;
      }

      busyness[dayIdx][h] = { level, waitMinutes };
    }
  }

  return busyness;
}
