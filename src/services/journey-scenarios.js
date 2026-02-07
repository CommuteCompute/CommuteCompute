/**
 * Journey Display Demo Scenarios
 * 
 * Pre-built journey data matching the official V11 mockups.
 * Use for testing, demos, and validation.
 * 
 * Scenarios:
 * - normal: Standard commute with coffee
 * - delay-skip-coffee: Running late, skip coffee
 * - multi-delay: Multiple transit delays
 * - disruption: Service suspended, replacement bus
 * - diversion: Tram diverted
 * - express: Express train service
 * - homebound-friday: Friday treat coffee on way home
 * - weekend-leisure: Weekend trip to park
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { StepType, StepStatus, JourneyStatus } from './ccdash-renderer.js';

// =============================================================================
// DEMO SCENARIOS
// =============================================================================

const scenarios = {

  // ---------------------------------------------------------------------------
  // SCENARIO: Normal Commute with Coffee
  // ---------------------------------------------------------------------------
  'normal': {
    origin: 'HOME',
    destination: 'WORK',
    currentTime: '7:45',
    ampm: 'AM',
    dayOfWeek: 'Tuesday',
    date: '28 January',
    status: JourneyStatus.LEAVE_NOW,
    arrivalTime: '8:32',
    totalDuration: 47,
    isHomebound: false,
    weather: { temp: 22, condition: 'Sunny', umbrella: false },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Local Cafe',
        subtitle: 'From home • From home',
        duration: 4,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.COFFEE,
        title: 'Coffee Stop',
        subtitle: '[OK] TIME FOR COFFEE',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Station',
        subtitle: 'Platform 1',
        duration: 6,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Train to Parliament',
        subtitle: 'Sandringham • Next: 5, 12 min',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Office',
        subtitle: 'Station → Work',
        duration: 26,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Delay - Skip Coffee
  // ---------------------------------------------------------------------------
  'delay-skip-coffee': {
    origin: 'HOME',
    destination: 'WORK',
    currentTime: '8:22',
    ampm: 'AM',
    dayOfWeek: 'Monday',
    date: '27 January',
    status: JourneyStatus.DELAY,
    arrivalTime: '9:18',
    totalDuration: 56,
    delayMinutes: 8,
    isHomebound: false,
    weather: { temp: 17, condition: 'Rain', umbrella: true },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk past Local Cafe',
        subtitle: 'From home • Main street',
        duration: 4,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.COFFEE,
        title: 'Coffee Stop',
        subtitle: '[X] SKIP -- Running late',
        duration: null,
        status: StepStatus.SKIPPED,
        skipReason: 'Running late'
      },
      {
        type: StepType.WALK,
        title: 'Walk to Station',
        subtitle: 'Platform 1',
        duration: 8,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Train to Parliament',
        subtitle: '+8 MIN • Next: 12, 20 min',
        duration: 12,
        status: StepStatus.DELAYED,
        delayMinutes: 8
      },
      {
        type: StepType.WALK,
        title: 'Walk to Office',
        subtitle: 'Station → Work',
        duration: 24,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Multi-Modal Delays
  // ---------------------------------------------------------------------------
  'multi-delay': {
    origin: 'MALVERN STATION',
    destination: '45 BOURKE ST, DOCKLANDS',
    currentTime: '8:15',
    ampm: 'AM',
    dayOfWeek: 'Tuesday',
    date: '28 January',
    status: JourneyStatus.DELAY,
    arrivalTime: '9:22',
    totalDuration: 67,
    delayMinutes: 15,
    isHomebound: false,
    weather: { temp: 15, condition: 'Showers', umbrella: true },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Station',
        subtitle: 'From home • Platform 2',
        duration: 7,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Train to Richmond',
        subtitle: '+10 MIN • Next: 15, 22 min',
        duration: 15,
        status: StepStatus.DELAYED,
        delayMinutes: 10
      },
      {
        type: StepType.WALK,
        title: 'Walk to Tram',
        subtitle: 'Swan St stop',
        duration: 4,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAM,
        title: 'Tram 70 to Docklands',
        subtitle: '+5 MIN • Next: 11, 19 min',
        duration: 11,
        status: StepStatus.DELAYED,
        delayMinutes: 5
      },
      {
        type: StepType.WALK,
        title: 'Walk to Office',
        subtitle: '45 Bourke St, Docklands',
        duration: 12,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Major Disruption
  // ---------------------------------------------------------------------------
  'disruption': {
    origin: 'HOME',
    destination: 'WORK',
    currentTime: '7:20',
    ampm: 'AM',
    dayOfWeek: 'Thursday',
    date: '30 January',
    status: JourneyStatus.DISRUPTION,
    arrivalTime: '8:52',
    totalDuration: 92,
    delayMinutes: 18,
    isHomebound: false,
    weather: { temp: 19, condition: 'Overcast', umbrella: false },
    steps: [
      {
        type: StepType.COFFEE,
        title: 'Coffee Stop',
        subtitle: '[OK] EXTRA TIME -- Disruption',
        duration: 10,
        status: StepStatus.EXTENDED,
        extendReason: 'Disruption'
      },
      {
        type: StepType.WALK,
        title: 'Walk to Station',
        subtitle: 'Platform 1',
        duration: 10,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Sandringham Line',
        subtitle: 'SUSPENDED — Signal fault',
        duration: null,
        status: StepStatus.CANCELLED,
        cancelReason: 'Signal fault'
      },
      {
        type: StepType.BUS,
        title: 'Rail Replacement Bus',
        subtitle: 'S Yarra→Richmond • Next: 5, 15 min',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Train to Parliament',
        subtitle: 'Hurstbridge • Next: 4, 10 min',
        duration: 4,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Tram Diversion (Homebound)
  // ---------------------------------------------------------------------------
  'diversion': {
    origin: 'RICHMOND STATION',
    destination: '18 BURKE RD, CAMBERWELL',
    currentTime: '5:45',
    ampm: 'PM',
    dayOfWeek: 'Wednesday',
    date: '29 January',
    status: JourneyStatus.DIVERSION,
    arrivalTime: '6:38',
    totalDuration: 53,
    delayMinutes: 5,
    isHomebound: true,
    weather: { temp: 31, condition: 'Hot', umbrella: false },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Tram Stop',
        subtitle: 'From work • Swan St',
        duration: 3,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAM,
        title: 'Tram 70 Diverted',
        subtitle: 'Next: 8, 16 min • Wallen Rd',
        duration: 8,
        status: StepStatus.DIVERTED
      },
      {
        type: StepType.WALK,
        title: 'Walk Around Diversion',
        subtitle: 'Extra walk due to works',
        duration: 7,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.BUS,
        title: 'Bus 625 to Camberwell',
        subtitle: 'Burke Rd • Next: 5, 20 min',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk Home',
        subtitle: '18 Burke Rd, Camberwell',
        duration: 6,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Express Train
  // ---------------------------------------------------------------------------
  'express': {
    origin: 'Caulfield Station, Caulfield',
    destination: '360 COLLINS ST',
    currentTime: '6:48',
    ampm: 'AM',
    dayOfWeek: 'Monday',
    date: '03 February',
    status: JourneyStatus.LEAVE_NOW,
    arrivalTime: '7:12',
    totalDuration: 24,
    totalLabel: '24 min total',
    isHomebound: false,
    weather: { temp: 14, condition: 'Fog', umbrella: false, maybeRain: true },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Platform 3',
        subtitle: 'Caulfield Station → City-bound platform',
        duration: 2,
        departTime: '6:48',
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Express to Flinders Street',
        subtitle: 'Frankston Line EXPRESS • Skips 6 stations\nStops: Caulfield → Richmond → Flinders St only\nNext EXPRESS: 6:50 • All stops: 6:55, 7:05',
        duration: 12,
        departTime: '6:50',
        expressBadge: true,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Office',
        subtitle: 'Flinders St Station → 360 Collins St',
        duration: 10,
        departTime: '7:02',
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Friday Treat (Homebound with Coffee)
  // ---------------------------------------------------------------------------
  'homebound-friday': {
    origin: 'WORK',
    destination: 'HOME',
    currentTime: '6:20',
    ampm: 'PM',
    dayOfWeek: 'Friday',
    date: '31 January',
    status: JourneyStatus.LEAVE_NOW,
    arrivalTime: '7:25',
    totalDuration: 65,
    isHomebound: true,
    weather: { temp: 23, condition: 'Warm', umbrella: false },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Parliament',
        subtitle: 'From work',
        duration: 8,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAIN,
        title: 'Train to South Yarra',
        subtitle: 'Sandringham • Next: 4, 11 min',
        duration: 4,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Tram Stop',
        subtitle: 'Main street / Chapel St',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAM,
        title: 'Tram 6 to Glen Iris',
        subtitle: 'High St • Next: 6, 14 min',
        duration: 6,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.COFFEE,
        title: 'Coffee at High St Cafe',
        subtitle: '[OK] FRIDAY TREAT',
        duration: 15,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Weekend Leisure Trip
  // ---------------------------------------------------------------------------
  'weekend-leisure': {
    origin: 'FLINDERS ST STATION',
    destination: 'CAULFIELD PARK ROTUNDA',
    currentTime: '11:15',
    ampm: 'AM',
    dayOfWeek: 'Sunday',
    date: '2 February',
    status: JourneyStatus.LEAVE_NOW,
    arrivalTime: '11:48',
    totalDuration: 33,
    isHomebound: false,
    weather: { temp: 24, condition: 'Sunny', umbrella: false },
    steps: [
      {
        type: StepType.TRAIN,
        title: 'Train to Caulfield',
        subtitle: 'Pakenham • Next: 3, 10 min',
        duration: 3,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Caulfield Park',
        subtitle: 'Balaclava Rd entrance',
        duration: 12,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Picnic Spot',
        subtitle: 'Near the rotunda',
        duration: 5,
        status: StepStatus.NORMAL
      }
    ]
  },

  // ---------------------------------------------------------------------------
  // SCENARIO: Multi-Modal Tram + Bus
  // ---------------------------------------------------------------------------
  'multi-modal': {
    origin: '42 CHAPEL ST, WINDSOR',
    destination: 'ELSTERNWICK STATION',
    currentTime: '2:30',
    ampm: 'PM',
    dayOfWeek: 'Saturday',
    date: '1 February',
    status: JourneyStatus.ON_TIME,
    arrivalTime: '3:28',
    totalDuration: 53,
    leaveInMinutes: 0,  // Always LEAVE_NOW - per Angus 2026-02-01
    isHomebound: false,
    weather: { temp: 28, condition: 'Hot', umbrella: false },
    steps: [
      {
        type: StepType.WALK,
        title: 'Walk to Tram Stop',
        subtitle: 'From home • Chapel St',
        duration: 3,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.TRAM,
        title: 'Tram 78 to Richmond',
        subtitle: 'Chapel St • Next: 4, 12 min',
        duration: 4,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.WALK,
        title: 'Walk to Bus Stop',
        subtitle: 'Swan St / Church St',
        duration: 5,
        status: StepStatus.NORMAL
      },
      {
        type: StepType.BUS,
        title: 'Bus 246 to Elsternwick',
        subtitle: 'Swan St • Next: 6, 18 min',
        duration: 6,
        status: StepStatus.NORMAL
      }
    ]
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Get a demo scenario by name
 * @param {string} name - Scenario name
 * @returns {Object|null} Journey data or null if not found
 */
export function getScenario(name) {
  return scenarios[name] || null;
}

/**
 * Get all available scenario names
 * @returns {string[]} Array of scenario names
 */
export function getScenarioNames() {
  return Object.keys(scenarios);
}

/**
 * Get all scenarios
 * @returns {Object} All scenarios
 */
export function getAllScenarios() {
  return scenarios;
}

export default scenarios;
