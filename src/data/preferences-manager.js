/**
 * User Preferences Manager
 * Stores and manages user settings including addresses, API credentials, and preferences
 * Persists to JSON file for permanent storage
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import fs from 'fs/promises';
import path from 'path';

class PreferencesManager {
  constructor() {
    this.preferencesFile = path.join(process.cwd(), 'user-preferences.json');
    this.preferences = null;
    this.defaultPreferences = {
      // Personal addresses
      addresses: {
        home: '',
        cafe: '',
        cafeName: '',  // Business name (e.g., "Seven Seeds Coffee")
        work: ''
      },

      // Manual walking times (used when address geocoding fails or user prefers manual entry)
      manualWalkingTimes: {
        homeToStation: null,           // minutes, null = use geocoding
        stationToCafe: null,            // minutes, null = use geocoding
        cafeToStation: null,            // minutes, null = use geocoding
        stationToWork: null,            // minutes, null = use geocoding
        useManualTimes: false           // override geocoding with manual times
      },

      // Address validation flags
      addressFlags: {
        homeFound: true,                // false if address couldn't be geocoded
        cafeFound: true,
        workFound: true
      },

      // Journey preferences
      journey: {
        arrivalTime: '09:00',
        preferredTransitModes: [0, 1, 2, 3], // Train, Tram, Bus, V/Line (route type IDs)
        maxWalkingDistance: 1000, // meters
        coffeeEnabled: true,
        defaultCafeTime: 3,          // minutes, used if cafe busy-ness unavailable

        // Cafe location in journey (NEW)
        cafeLocation: 'before-transit-1',  // Options: 'before-transit-1', 'between-transits', 'after-last-transit'

        // Transit route configuration
        // No hardcoded defaults - users configure via Journey Planner
        // Supports 1-4 transit connections for complex journeys
        transitRoute: {
          numberOfModes: 1,              // 1-4 transit modes (expandable)
          mode1: {
            type: 0,                     // Route type ID (0=Train, 1=Tram, 2=Bus, 3=V/Line, 4=Ferry, 5=Light Rail)
            originStation: {
              name: null,                // Configure via Journey Planner
              id: null,                  // Station/stop ID
              lat: null,
              lon: null
            },
            destinationStation: {
              name: null,                // Configure via Journey Planner
              id: null,
              lat: null,
              lon: null
            },
            estimatedDuration: null      // minutes - auto-calculated
          },
          mode2: {                       // Optional: used if numberOfModes >= 2
            type: null,
            originStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            destinationStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            estimatedDuration: null
          },
          mode3: {                       // Optional: used if numberOfModes >= 3
            type: null,
            originStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            destinationStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            estimatedDuration: null
          },
          mode4: {                       // Optional: used if numberOfModes === 4
            type: null,
            originStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            destinationStation: {
              name: '',
              id: null,
              lat: null,
              lon: null
            },
            estimatedDuration: null
          }
        }
      },

      // Transit Authority API credentials (configured per state)
      // Note: Transport Victoria OpenData API uses only KeyId header (api key), no separate token
      // Per Section 3.4: API keys come from KV storage ONLY, never process.env
      api: {
        key: '',  // Loaded from KV via getTransitApiKey()
        baseUrl: ''  // Set based on selected transit authority, NO DEFAULT
      },

      // Display preferences
      display: {
        use24HourTime: true,
        showWalkingTimes: true,
        showBusyness: true,
        colorCoding: true
      },

      // Device Configuration (Development Rules v1.0.16 Section U)
      deviceConfig: {
        selectedDevice: 'trmnl-byos',  // Default to TRMNL BYOS
        trmnlModel: 'trmnl-og',        // TRMNL OG (compatible) vs TRMNL X (not yet compatible)
        resolution: {
          width: 800,
          height: 480
        },
        orientation: 'landscape'
      },

      // Refresh Rate Settings (Development Rules v1.0.15 Section Y)
      refreshSettings: {
        // Display refresh (how often device updates screen)
        displayRefresh: {
          interval: 900000,  // 15 minutes default (milliseconds)
          minimum: 900000,   // Device-specific minimum (TRMNL BYOS: 15 min)
          unit: 'minutes'
        },

        // Journey recalculation (how often server recalculates route)
        journeyRecalc: {
          interval: 120000,  // 2 minutes default
          minimum: 60000,    // 1 minute minimum
          unit: 'minutes'
        },

        // Data fetching (how often server fetches transit/weather APIs)
        dataFetch: {
          interval: 30000,   // 30 seconds default
          minimum: 10000,    // 10 seconds minimum
          unit: 'seconds'
        },

        // TRMNL webhook interval (BYOS platform limitation)
        trmnlWebhook: {
          interval: 900000,  // 15 minutes (TRMNL platform requirement)
          fixed: true,       // Cannot be changed (platform limitation)
          note: 'TRMNL BYOS platform enforces 15-minute minimum'
        },

        // Partial Refresh Settings (E-ink zone updates)
        // Enables fast updates of specific display areas without full refresh
        partialRefresh: {
          enabled: true,              // Enable partial refresh capability
          interval: 20000,            // 20 seconds default for zone updates
          minimum: 20000,             // Minimum 20 seconds (e-ink safety)
          unit: 'seconds',

          // Display zones that can be refreshed independently
          zones: {
            header: {
              enabled: true,
              name: 'Header Zone',
              description: 'Time, date, weather icon',
              refreshInterval: 60000,  // 1 minute (time updates)
              coordinates: {           // Relative to display resolution
                x: 0,
                y: 0,
                width: '100%',         // Full width
                height: '15%'          // Top 15% of screen
              }
            },

            transitInfo: {
              enabled: true,
              name: 'Transit Info Zone',
              description: 'Next departure times, delays',
              refreshInterval: 20000,  // 20 seconds (live transit data)
              coordinates: {
                x: 0,
                y: '15%',
                width: '100%',
                height: '50%'          // Middle 50% of screen
              }
            },

            coffeeDecision: {
              enabled: true,
              name: 'Coffee Decision Zone',
              description: 'Coffee recommendation banner',
              refreshInterval: 120000, // 2 minutes
              coordinates: {
                x: 0,
                y: '65%',
                width: '100%',
                height: '20%'
              }
            },

            footer: {
              enabled: true,
              name: 'Footer Zone',
              description: 'Journey summary, walking times',
              refreshInterval: 120000, // 2 minutes
              coordinates: {
                x: 0,
                y: '85%',
                width: '100%',
                height: '15%'
              }
            }
          },

          // Optimisation settings
          fullRefreshInterval: 600000,    // Force full refresh every 10 minutes (reduce ghosting)
          zoneChangeThreshold: 5,         // Minimum % change to trigger zone update
          smartCoalescing: true,          // Combine adjacent zone updates
          fallbackToFull: true            // Fall back to full refresh if multiple zones changed
        }
      },

      // Metadata
      meta: {
        version: '1.0',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString()
      },

      // Journey Profiles (NEW - Task #6)
      profiles: {
        activeProfileId: 'default',
        profiles: {
          'default': {
            id: 'default',
            name: 'Default Journey',
            enabled: true,
            schedule: {
              type: 'all',  // 'all', 'weekdays', 'weekends', 'custom'
              days: [0, 1, 2, 3, 4, 5, 6],  // Sunday=0, Monday=1, ..., Saturday=6
              effectiveFrom: null,  // Date string
              effectiveUntil: null  // Date string (for vacation mode)
            },
            // Profile-specific journey config (inherits from journey section if not specified)
            journeyConfig: null  // null = use default journey config
          }
        }
      }
    };
  }

  /**
   * Load preferences from file or environment variable
   * Priority: 1) USER_CONFIG env var (for Render persistence), 2) user-preferences.json file
   */
  async load() {
    // FIRST: Try loading from environment variable (Render persistence)
    if (process.env.USER_CONFIG) {
      try {
        this.preferences = JSON.parse(process.env.USER_CONFIG);
        this.preferences = this.mergeWithDefaults(this.preferences);

        // Per Section 3.4: API keys loaded from KV storage, not env vars

        return this.preferences;
      } catch (error) {
      }
    }

    // SECOND: Try loading from file (local development)
    try {
      const data = await fs.readFile(this.preferencesFile, 'utf8');
      this.preferences = JSON.parse(data);

      // Merge with defaults for any missing fields
      this.preferences = this.mergeWithDefaults(this.preferences);

      return this.preferences;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with defaults
        this.preferences = { ...this.defaultPreferences };
        // Per Section 3.4: API keys loaded from KV storage, not env vars

        await this.save();
        return this.preferences;
      }

      // Return defaults on error
      this.preferences = { ...this.defaultPreferences };
      return this.preferences;
    }
  }

  /**
   * Save preferences to file
   */
  async save() {
    try {
      // Update last modified timestamp
      if (this.preferences.meta) {
        this.preferences.meta.lastModified = new Date().toISOString();
      }

      await fs.writeFile(
        this.preferencesFile,
        JSON.stringify(this.preferences, null, 2),
        'utf8'
      );

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all preferences
   */
  get() {
    // If temporary preferences are set (for zero-config token requests), use those
    if (this.temporaryPreferences) {
      return this.temporaryPreferences;
    }
    if (!this.preferences) {
      return { ...this.defaultPreferences };
    }
    return this.preferences;
  }

  /**
   * Set temporary preferences for a single request (zero-config token support)
   */
  setTemporary(tempPrefs) {
    this.temporaryPreferences = { ...this.defaultPreferences, ...tempPrefs };
  }

  /**
   * Clear temporary preferences after request completes
   */
  clearTemporary() {
    this.temporaryPreferences = null;
  }

  /**
   * Update preferences (partial or full)
   */
  async update(updates) {
    if (!this.preferences) {
      await this.load();
    }

    // Deep merge updates
    this.preferences = this.deepMerge(this.preferences, updates);

    await this.save();
    return this.preferences;
  }

  /**
   * Get specific preference section
   */
  getSection(section) {
    if (!this.preferences) {
      return this.defaultPreferences[section] || null;
    }
    return this.preferences[section] || null;
  }

  /**
   * Update specific section
   */
  async updateSection(section, data) {
    if (!this.preferences) {
      await this.load();
    }

    this.preferences[section] = {
      ...this.preferences[section],
      ...data
    };

    await this.save();
    return this.preferences[section];
  }

  /**
   * Get addresses
   */
  getAddresses() {
    return this.getSection('addresses');
  }

  /**
   * Update addresses
   */
  async updateAddresses(addresses) {
    return await this.updateSection('addresses', addresses);
  }

  /**
   * Get API credentials
   */
  getApiCredentials() {
    return this.getSection('api');
  }

  /**
   * Update API credentials
   */
  async updateApiCredentials(credentials) {
    return await this.updateSection('api', credentials);
  }

  /**
   * Get journey preferences
   */
  getJourneyPreferences() {
    return this.getSection('journey');
  }

  /**
   * Update journey preferences
   */
  async updateJourneyPreferences(journey) {
    return await this.updateSection('journey', journey);
  }

  /**
   * Get device configuration
   */
  getDeviceConfig() {
    return this.getSection('deviceConfig');
  }

  /**
   * Update device configuration
   */
  async updateDeviceConfig(deviceConfig) {
    return await this.updateSection('deviceConfig', deviceConfig);
  }

  /**
   * Get refresh settings
   */
  getRefreshSettings() {
    return this.getSection('refreshSettings');
  }

  /**
   * Update refresh settings
   */
  async updateRefreshSettings(refreshSettings) {
    // Validate minimums
    const deviceConfig = this.getDeviceConfig();
    const deviceMinimums = {
      'trmnl-byos': 900000,     // 15 minutes
      'kindle-pw3': 300000,     // 5 minutes
      'kindle-pw4': 300000,     // 5 minutes
      'kindle-pw5': 300000,     // 5 minutes
      'kindle-4': 600000        // 10 minutes
    };

    const minDisplay = deviceMinimums[deviceConfig?.selectedDevice] || 900000;

    // Enforce minimums
    if (refreshSettings.displayRefresh) {
      refreshSettings.displayRefresh.interval = Math.max(
        refreshSettings.displayRefresh.interval,
        minDisplay
      );
      refreshSettings.displayRefresh.minimum = minDisplay;
    }

    if (refreshSettings.journeyRecalc) {
      refreshSettings.journeyRecalc.interval = Math.max(
        refreshSettings.journeyRecalc.interval,
        60000  // 1 minute minimum
      );
    }

    if (refreshSettings.dataFetch) {
      refreshSettings.dataFetch.interval = Math.max(
        refreshSettings.dataFetch.interval,
        10000  // 10 seconds minimum
      );
    }

    return await this.updateSection('refreshSettings', refreshSettings);
  }

  /**
   * Get partial refresh settings
   */
  getPartialRefreshSettings() {
    const refreshSettings = this.getRefreshSettings();
    return refreshSettings?.partialRefresh || null;
  }

  /**
   * Update partial refresh settings
   */
  async updatePartialRefreshSettings(partialRefreshSettings) {
    const refreshSettings = this.getRefreshSettings();
    refreshSettings.partialRefresh = {
      ...refreshSettings.partialRefresh,
      ...partialRefreshSettings
    };

    // Validate minimum interval (20 seconds for e-ink safety)
    if (refreshSettings.partialRefresh.interval) {
      refreshSettings.partialRefresh.interval = Math.max(
        refreshSettings.partialRefresh.interval,
        20000  // 20 seconds minimum
      );
    }

    return await this.updateSection('refreshSettings', refreshSettings);
  }

  /**
   * Get enabled refresh zones
   */
  getEnabledRefreshZones() {
    const partialRefresh = this.getPartialRefreshSettings();
    if (!partialRefresh || !partialRefresh.enabled) {
      return [];
    }

    const zones = [];
    for (const [zoneId, zoneConfig] of Object.entries(partialRefresh.zones)) {
      if (zoneConfig.enabled) {
        zones.push({
          id: zoneId,
          ...zoneConfig
        });
      }
    }

    return zones;
  }

  /**
   * Check if a zone should be refreshed based on interval
   */
  shouldRefreshZone(zoneId, lastRefreshTime) {
    const partialRefresh = this.getPartialRefreshSettings();
    if (!partialRefresh || !partialRefresh.enabled) {
      return false;
    }

    const zone = partialRefresh.zones[zoneId];
    if (!zone || !zone.enabled) {
      return false;
    }

    const now = Date.now();
    const timeSinceRefresh = now - lastRefreshTime;
    return timeSinceRefresh >= zone.refreshInterval;
  }

  /**
   * Validate preferences structure
   */
  validate() {
    const errors = [];

    // Check addresses
    const addresses = this.getAddresses();
    if (!addresses.home) {
      errors.push('Home address is required');
    }
    if (!addresses.work) {
      errors.push('Work address is required');
    }

    // Check API credentials (only API Key required - token is deprecated)
    const api = this.getApiCredentials();
    if (!api.key) {
      errors.push('Transport Victoria API Key is required');
    }
    // Note: api.token is deprecated for Transport Victoria OpenData API
    // The KeyId header with UUID format API key is now the only authentication method

    // Check journey preferences
    const journey = this.getJourneyPreferences();
    if (!journey.arrivalTime) {
      errors.push('Arrival time is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Reset preferences to defaults
   */
  async reset() {
    this.preferences = { ...this.defaultPreferences };
    // Per Section 3.4: API keys loaded from KV storage, not env vars
    await this.save();
    return this.preferences;
  }

  /**
   * Export preferences as JSON (formatted for viewing)
   */
  export() {
    return JSON.stringify(this.preferences, null, 2);
  }

  /**
   * Export preferences as compact JSON for environment variable
   * Use this value for USER_CONFIG environment variable on Render
   */
  exportForEnvVar() {
    // Remove sensitive data that should be set separately
    const configCopy = JSON.parse(JSON.stringify(this.preferences));

    // API key should be set via ODATA_API_KEY env var, not in USER_CONFIG
    if (configCopy.api) {
      delete configCopy.api.key;
    }

    // Compact JSON (no whitespace)
    return JSON.stringify(configCopy);
  }

  /**
   * Import preferences from JSON
   */
  async import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.preferences = this.mergeWithDefaults(imported);
      await this.save();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge object with defaults (for missing fields)
   */
  mergeWithDefaults(obj) {
    return this.deepMerge({ ...this.defaultPreferences }, obj);
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        if (target[key] instanceof Object && !Array.isArray(target[key])) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Check if preferences are configured
   */
  isConfigured() {
    const validation = this.validate();
    return validation.valid;
  }

  /**
   * Get configuration status
   */
  getStatus() {
    const addresses = this.getAddresses();
    const api = this.getApiCredentials();
    const journey = this.getJourneyPreferences();

    return {
      configured: this.isConfigured(),
      addresses: {
        home: !!addresses.home,
        cafe: !!addresses.cafe,
        work: !!addresses.work
      },
      api: {
        key: !!api.key,
        token: !!api.token,  // Deprecated - not required for Transport Victoria
        tokenNote: 'Token is deprecated, only API Key (UUID format) is required'
      },
      journey: {
        arrivalTime: !!journey.arrivalTime,
        coffeeEnabled: journey.coffeeEnabled
      },
      validation: this.validate()
    };
  }

  // ==================== JOURNEY PROFILES (Task #6) ====================

  /**
   * Get all profiles
   */
  getProfiles() {
    if (!this.preferences) {
      return this.defaultPreferences.profiles;
    }
    return this.preferences.profiles || this.defaultPreferences.profiles;
  }

  /**
   * Get active profile
   */
  getActiveProfile() {
    const profiles = this.getProfiles();
    const activeId = profiles.activeProfileId || 'default';
    return profiles.profiles[activeId] || profiles.profiles['default'];
  }

  /**
   * Get profile by ID
   */
  getProfile(profileId) {
    const profiles = this.getProfiles();
    return profiles.profiles[profileId] || null;
  }

  /**
   * Create new profile
   */
  async createProfile(profileData) {
    if (!this.preferences) {
      await this.load();
    }

    const profileId = profileData.id || `profile_${Date.now()}`;
    const profiles = this.getProfiles();

    // Create profile with defaults
    const newProfile = {
      id: profileId,
      name: profileData.name || 'New Journey',
      enabled: profileData.enabled !== false,
      schedule: {
        type: profileData.schedule?.type || 'all',
        days: profileData.schedule?.days || [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: profileData.schedule?.effectiveFrom || null,
        effectiveUntil: profileData.schedule?.effectiveUntil || null
      },
      journeyConfig: profileData.journeyConfig || null
    };

    profiles.profiles[profileId] = newProfile;
    this.preferences.profiles = profiles;

    await this.save();
    return newProfile;
  }

  /**
   * Update profile
   */
  async updateProfile(profileId, updates) {
    if (!this.preferences) {
      await this.load();
    }

    const profiles = this.getProfiles();
    const profile = profiles.profiles[profileId];

    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    // Deep merge updates
    profiles.profiles[profileId] = this.deepMerge(profile, updates);
    this.preferences.profiles = profiles;

    await this.save();
    return profiles.profiles[profileId];
  }

  /**
   * Delete profile
   */
  async deleteProfile(profileId) {
    if (!this.preferences) {
      await this.load();
    }

    if (profileId === 'default') {
      throw new Error('Cannot delete default profile');
    }

    const profiles = this.getProfiles();

    if (!profiles.profiles[profileId]) {
      throw new Error(`Profile ${profileId} not found`);
    }

    // If deleting active profile, switch to default
    if (profiles.activeProfileId === profileId) {
      profiles.activeProfileId = 'default';
    }

    delete profiles.profiles[profileId];
    this.preferences.profiles = profiles;

    await this.save();
    return { success: true };
  }

  /**
   * Set active profile
   */
  async setActiveProfile(profileId) {
    if (!this.preferences) {
      await this.load();
    }

    const profiles = this.getProfiles();

    if (!profiles.profiles[profileId]) {
      throw new Error(`Profile ${profileId} not found`);
    }

    profiles.activeProfileId = profileId;
    this.preferences.profiles = profiles;

    await this.save();
    return profiles.profiles[profileId];
  }

  /**
   * Get profile that should be active based on current date/time
   */
  getScheduledProfile() {
    const profiles = this.getProfiles();
    const now = new Date();
    const dayOfWeek = now.getDay();  // 0=Sunday, 6=Saturday
    const today = now.toISOString().split('T')[0];

    // Check each enabled profile for schedule match
    for (const [id, profile] of Object.entries(profiles.profiles)) {
      if (!profile.enabled) continue;

      const schedule = profile.schedule;

      // Check effective date range
      if (schedule.effectiveFrom && today < schedule.effectiveFrom) continue;
      if (schedule.effectiveUntil && today > schedule.effectiveUntil) continue;

      // Check day of week
      if (schedule.type === 'custom' && schedule.days) {
        if (schedule.days.includes(dayOfWeek)) {
          return profile;
        }
      } else if (schedule.type === 'weekdays' && [1, 2, 3, 4, 5].includes(dayOfWeek)) {
        return profile;
      } else if (schedule.type === 'weekends' && [0, 6].includes(dayOfWeek)) {
        return profile;
      } else if (schedule.type === 'all') {
        return profile;
      }
    }

    // Fallback to active profile or default
    return this.getActiveProfile();
  }

  /**
   * Get effective journey config for active/scheduled profile
   */
  getEffectiveJourneyConfig() {
    const profile = this.getScheduledProfile();

    // If profile has custom journey config, use it
    if (profile.journeyConfig) {
      return profile.journeyConfig;
    }

    // Otherwise, use default journey config
    return this.getJourneyPreferences();
  }

  /**
   * List all profiles with their status
   */
  listProfiles() {
    const profiles = this.getProfiles();
    const activeId = profiles.activeProfileId;
    const scheduledProfile = this.getScheduledProfile();

    return Object.values(profiles.profiles).map(profile => ({
      ...profile,
      isActive: profile.id === activeId,
      isScheduled: profile.id === scheduledProfile.id
    }));
  }

  // ==================== END JOURNEY PROFILES ====================
}

// Export the class for instantiation in server.js
export default PreferencesManager;

// Export a singleton instance for modules that need shared access
// This ensures all modules reference the same preferences instance
export const preferencesInstance = new PreferencesManager();
