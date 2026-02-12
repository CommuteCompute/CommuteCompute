/**
 * Multi-Tier Geocoding Service
 * Intelligent address and business name resolution with multiple fallbacks
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fetch from 'node-fetch';

/**
 * Geocoding Service with sequential fallback priority
 *
 * Priority Order:
 * 1. Google Places API (best for businesses/cafes) - if API key configured
 * 2. Mapbox Geocoding API (excellent accuracy) - if API key configured
 * 3. HERE Geocoding API (good for Australian addresses) - if API key configured
 * 4. OpenStreetMap Nominatim (free, no key, always available)
 * 5. LocationIQ (free tier available)
 *
 * For Business/Cafe Names:
 * 1. Google Places API (best)
 * 2. Foursquare Places API (good for venues)
 * 3. OpenStreetMap Nominatim (fallback)
 */
class GeocodingService {
  constructor(config = {}) {
    // API Keys (optional - fallback to free services if not provided)
    // Accept both GOOGLE_PLACES_API_KEY and GOOGLE_PLACES_KEY for compatibility
    this.googlePlacesKey = config.googlePlacesKey || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_KEY;
    this.mapboxToken = config.mapboxToken || process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;
    this.hereApiKey = config.hereApiKey || process.env.HERE_API_KEY;
    this.foursquareApiKey = config.foursquareApiKey || process.env.FOURSQUARE_API_KEY;
    this.locationIqKey = config.locationIqKey || process.env.LOCATIONIQ_KEY;

    // Cache for geocoding results (in-memory)
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Main geocoding function - tries all available services in priority order
   * @param {string} address - Address or business name to geocode
   * @param {object} options - { country: 'AU', bias: { lat, lon }, type: 'address'|'business' }
   * @returns {object} { lat, lon, formattedAddress, source }
   */
  async geocode(address, options = {}) {
    // Check cache first
    const cacheKey = `${address}:${options.country || 'AU'}:${options.type || 'address'}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        if (global.decisionLogger) {
          global.decisionLogger.logCacheUsage('Geocoding', true, cacheKey);
        }
        return cached.result;
      }
    }

    // Cache miss
    if (global.decisionLogger) {
      global.decisionLogger.logCacheUsage('Geocoding', false, cacheKey);
    }

    const country = options.country || 'AU';
    const type = options.type || 'address';

    let result = null;
    const attempts = [];

    // Sequential fallback chain
    const services = [
      // Tier 1: Google Places (best for everything, especially businesses)
      { name: 'Google Places', fn: () => this.geocodeGooglePlaces(address, country, type) },

      // Tier 2: Mapbox (excellent accuracy)
      { name: 'Mapbox', fn: () => this.geocodeMapbox(address, country, options.bias) },

      // Tier 3: HERE (good for Australian addresses)
      { name: 'HERE', fn: () => this.geocodeHERE(address, country) },

      // Tier 4: Foursquare (good for businesses/venues)
      type === 'business' ? { name: 'Foursquare', fn: () => this.geocodeFoursquare(address, country, options.bias) } : null,

      // Tier 5: LocationIQ (free tier)
      { name: 'LocationIQ', fn: () => this.geocodeLocationIQ(address, country) },

      // Tier 6: OpenStreetMap Nominatim (always available, free)
      { name: 'Nominatim', fn: () => this.geocodeNominatim(address, country) }
    ].filter(Boolean);

    for (const service of services) {
      try {
        result = await service.fn();

        if (result && result.lat && result.lon) {
          result.source = service.name;
          attempts.push({ service: service.name, success: true });

          // Log successful geocoding decision
          if (global.decisionLogger) {
            global.decisionLogger.logGeocoding(address, service.name, result, attempts);
          }

          break;
        }
      } catch (error) {
        attempts.push({ service: service.name, success: false, error: error.message });
      }
    }

    if (!result) {
      // Log failed geocoding attempt
      if (global.decisionLogger) {
        global.decisionLogger.logGeocoding(address, 'FAILED', null, attempts);
      }
      throw new Error(`All geocoding services failed for "${address}". Attempts: ${attempts.map(a => a.service).join(', ')}`);
    }

    // Cache the result
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Google Places API (new) - Best for businesses and cafes
   * Uses Places API (new) with v1 endpoint
   * Reference: https://developers.google.com/maps/documentation/places/web-service/text-search
   */
  async geocodeGooglePlaces(query, country, type) {
    if (!this.googlePlacesKey) {
      throw new Error('Google Places API key not configured');
    }

    // Use new Places API (new) endpoint
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody = {
      textQuery: query,
      languageCode: 'en',
      regionCode: country,
      maxResultCount: 1
    };

    // Add location bias if we have coordinates (future enhancement)
    // if (bias && bias.lat && bias.lon) {
    //   requestBody.locationBias = {
    //     circle: {
    //       center: { latitude: bias.lat, longitude: bias.lon },
    //       radius: 50000.0
    //     }
    //   };
    // }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.googlePlacesKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify(requestBody)
    });

    // Check HTTP status first
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error && errorData.error.message) {
          errorMessage = errorData.error.message;
        }
      } catch (e) {
        errorMessage += `: ${errorText.substring(0, 100)}`;
      }

      throw new Error(`Google Places API (new) error: ${errorMessage}`);
    }

    const data = await response.json();

    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      return {
        lat: place.location.latitude,
        lon: place.location.longitude,
        formattedAddress: place.formattedAddress,
        name: place.displayName?.text || null
      };
    }

    // Handle error responses
    if (data.error) {
      throw new Error(`Google Places API (new): ${data.error.message || data.error.status}`);
    }

    throw new Error('Google Places API (new): No results found');
  }

  /**
   * Mapbox Geocoding API - Excellent accuracy
   */
  async geocodeMapbox(query, country, bias) {
    if (!this.mapboxToken) {
      throw new Error('Mapbox token not configured');
    }

    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=${country}&limit=1&access_token=${this.mapboxToken}`;

    if (bias && bias.lat && bias.lon) {
      url += `&proximity=${bias.lon},${bias.lat}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      return {
        lat: feature.center[1],
        lon: feature.center[0],
        formattedAddress: feature.place_name
      };
    }

    throw new Error('Mapbox: No results');
  }

  /**
   * HERE Geocoding API - Good for Australian addresses
   */
  async geocodeHERE(query, country) {
    if (!this.hereApiKey) {
      throw new Error('HERE API key not configured');
    }

    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&in=countryCode:${country}&apiKey=${this.hereApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return {
        lat: item.position.lat,
        lon: item.position.lng,
        formattedAddress: item.address.label
      };
    }

    throw new Error('HERE: No results');
  }

  /**
   * Foursquare Places API - Good for businesses and venues
   */
  async geocodeFoursquare(query, country, bias) {
    if (!this.foursquareApiKey) {
      throw new Error('Foursquare API key not configured');
    }

    let url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(query)}&limit=1`;

    if (bias && bias.lat && bias.lon) {
      url += `&ll=${bias.lat},${bias.lon}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': this.foursquareApiKey,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      return {
        lat: place.geocodes.main.latitude,
        lon: place.geocodes.main.longitude,
        formattedAddress: `${place.name}, ${place.location.formatted_address}`,
        name: place.name
      };
    }

    throw new Error('Foursquare: No results');
  }

  /**
   * LocationIQ - Free tier available
   */
  async geocodeLocationIQ(query, country) {
    if (!this.locationIqKey) {
      throw new Error('LocationIQ key not configured');
    }

    const url = `https://us1.locationiq.com/v1/search.php?key=${this.locationIqKey}&q=${encodeURIComponent(query)}&countrycodes=${country.toLowerCase()}&format=json&limit=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        formattedAddress: result.display_name
      };
    }

    throw new Error('LocationIQ: No results');
  }

  /**
   * OpenStreetMap Nominatim - Always available, free, no API key
   */
  async geocodeNominatim(query, country) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, ${country}&limit=1&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Commute Compute/1.0 (Educational; Contact: gitlab.com/angusbergman)'
      }
    });

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];

      // Extract business/place name from Nominatim result if available
      let name = null;
      if (result.address) {
        name = result.address.amenity || result.address.shop || result.address.cafe ||
               result.address.restaurant || result.address.name || result.name;
      }

      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        formattedAddress: result.display_name,
        name: name
      };
    }

    throw new Error('Nominatim: No results');
  }

  /**
   * Specialized business/cafe search with enhanced name matching
   */
  async findBusiness(name, location, options = {}) {
    const query = location ? `${name}, ${location}` : name;

    return await this.geocode(query, {
      ...options,
      type: 'business'
    });
  }

  /**
   * Reverse geocoding - Convert coordinates to address
   * Tries services in priority order based on accuracy
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {object} { lat, lon, formattedAddress, source }
   */
  async reverseGeocode(lat, lon) {
    // Validate coordinates
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      throw new Error('Valid latitude and longitude required');
    }

    // Check cache first
    const cacheKey = `reverse:${lat.toFixed(6)}:${lon.toFixed(6)}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        if (global.decisionLogger) {
          global.decisionLogger.logCacheUsage('Reverse Geocoding', true, cacheKey);
        }
        return cached.result;
      }
    }

    // Cache miss
    if (global.decisionLogger) {
      global.decisionLogger.logCacheUsage('Reverse Geocoding', false, cacheKey);
    }

    let result = null;
    const attempts = [];

    // Sequential fallback chain for reverse geocoding
    const services = [
      // Tier 1: Google Geocoding API (best accuracy)
      { name: 'Google Geocoding', fn: () => this.reverseGeocodeGoogle(lat, lon) },

      // Tier 2: Mapbox (excellent for addresses)
      { name: 'Mapbox', fn: () => this.reverseGeocodeMapbox(lat, lon) },

      // Tier 3: HERE (good for Australian addresses)
      { name: 'HERE', fn: () => this.reverseGeocodeHERE(lat, lon) },

      // Tier 4: OpenStreetMap Nominatim (always available)
      { name: 'Nominatim', fn: () => this.reverseGeocodeNominatim(lat, lon) }
    ].filter(Boolean);

    for (const service of services) {
      try {
        result = await service.fn();

        if (result && result.formattedAddress) {
          result.source = service.name;
          result.lat = lat;
          result.lon = lon;
          attempts.push({ service: service.name, success: true });

          if (global.decisionLogger) {
            global.decisionLogger.logGeocoding(`${lat},${lon}`, service.name, result, attempts);
          }

          break;
        }
      } catch (error) {
        attempts.push({ service: service.name, success: false, error: error.message });
      }
    }

    if (!result) {
      if (global.decisionLogger) {
        global.decisionLogger.logGeocoding(`${lat},${lon}`, 'FAILED', null, attempts);
      }
      throw new Error(`All reverse geocoding services failed for ${lat}, ${lon}`);
    }

    // Cache the result
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * Google Geocoding API - Reverse geocode
   * Per Section 11.3: Uses Geocoding API endpoint (not legacy Places API)
   */
  async reverseGeocodeGoogle(lat, lon) {
    if (!this.googlePlacesKey) {
      throw new Error('Google API key not configured');
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${this.googlePlacesKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      return {
        formattedAddress: data.results[0].formatted_address
      };
    }

    throw new Error(`Google Geocoding API: ${data.status}`);
  }

  /**
   * Mapbox - Reverse geocode
   */
  async reverseGeocodeMapbox(lat, lon) {
    if (!this.mapboxToken) {
      throw new Error('Mapbox token not configured');
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${this.mapboxToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return {
        formattedAddress: data.features[0].place_name
      };
    }

    throw new Error('Mapbox: No results');
  }

  /**
   * HERE - Reverse geocode
   */
  async reverseGeocodeHERE(lat, lon) {
    if (!this.hereApiKey) {
      throw new Error('HERE API key not configured');
    }

    const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lon}&apiKey=${this.hereApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return {
        formattedAddress: data.items[0].address.label
      };
    }

    throw new Error('HERE: No results');
  }

  /**
   * Nominatim - Reverse geocode
   */
  async reverseGeocodeNominatim(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Commute Compute/1.0 (Educational; Contact: gitlab.com/angusbergman)'
      }
    });

    const data = await response.json();

    if (data && data.display_name) {
      return {
        formattedAddress: data.display_name
      };
    }

    throw new Error('Nominatim: No results');
  }

  /**
   * Get available geocoding services
   */
  getAvailableServices() {
    return {
      googlePlaces: !!this.googlePlacesKey,
      mapbox: !!this.mapboxToken,
      here: !!this.hereApiKey,
      foursquare: !!this.foursquareApiKey,
      locationiq: !!this.locationIqKey,
      nominatim: true // always available
    };
  }

  /**
   * Clear geocoding cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

export default GeocodingService;
