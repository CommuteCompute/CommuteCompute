/**
 * Random Journey Generator
 * Generates dynamic SmartJourney simulation data for testing and demos.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export const RANDOM_LOCATIONS = {
  homes: [
    { address: '42 Brunswick St, Fitzroy', lat: -37.8025, lon: 144.9780, suburb: 'Fitzroy' },
    { address: '15 Chapel St, Windsor', lat: -37.8556, lon: 144.9936, suburb: 'Windsor' },
    { address: '88 Smith St, Collingwood', lat: -37.8010, lon: 144.9875, suburb: 'Collingwood' },
    { address: '120 Acland St, St Kilda', lat: -37.8678, lon: 144.9803, suburb: 'St Kilda' },
    { address: '7 Lygon St, Carlton', lat: -37.7995, lon: 144.9663, suburb: 'Carlton' },
    { address: '33 Swan St, Richmond', lat: -37.8247, lon: 144.9995, suburb: 'Richmond' },
    { address: '56 High St, Northcote', lat: -37.7695, lon: 144.9998, suburb: 'Northcote' },
    { address: '21 Glenferrie Rd, Hawthorn', lat: -37.8220, lon: 145.0365, suburb: 'Hawthorn' }
  ],
  works: [
    { address: '200 Bourke St, Melbourne', lat: -37.8136, lon: 144.9631, name: 'Bourke St Office' },
    { address: '123 Work Street, Melbourne', lat: -37.8141, lon: 144.9707, name: 'Collins St Office' },
    { address: '525 Collins St, Melbourne', lat: -37.8184, lon: 144.9558, name: 'Southern Cross' },
    { address: '101 Collins St, Melbourne', lat: -37.8138, lon: 144.9724, name: 'Collins Place' },
    { address: '1 Nicholson St, East Melbourne', lat: -37.8075, lon: 144.9779, name: 'Treasury' }
  ],
  cafes: [
    { name: 'Example Cafe', address: '3/62 Rose St, Fitzroy', suburb: 'Fitzroy' },
    { name: 'Proud Mary', address: '172 Oxford St, Collingwood', suburb: 'Collingwood' },
    { name: 'Seven Seeds', address: '114 Berkeley St, Carlton', suburb: 'Carlton' },
    { name: 'Patricia Coffee', address: 'Little William St, Melbourne', suburb: 'CBD' },
    { name: 'Market Lane', address: 'Collins St, Melbourne', suburb: 'CBD' },
    { name: 'St Ali', address: '12-18 Yarra Place, South Melbourne', suburb: 'South Melbourne' },
    { name: 'Axil Coffee', address: '322 Burwood Rd, Hawthorn', suburb: 'Hawthorn' }
  ],
  transit: {
    trams: ['86', '96', '11', '12', '109', '70', '75', '19', '48', '57'],
    trains: ['Sandringham', 'Frankston', 'Craigieburn', 'South Morang', 'Werribee', 'Belgrave', 'Glen Waverley', 'Lilydale'],
    buses: ['200', '220', '246', '302', '401', '506', '703', '905']
  }
};

/**
 * Generate random journey using SmartJourney patterns
 */
export function generateRandomJourney() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  const home = pick(RANDOM_LOCATIONS.homes);
  const work = pick(RANDOM_LOCATIONS.works);
  const cafe = pick(RANDOM_LOCATIONS.cafes);
  
  // Random transit type with weighted probability
  const rand = Math.random();
  const transitType = rand < 0.4 ? 'train' : rand < 0.8 ? 'tram' : 'bus';
  
  // Random number of legs (3-5)
  const includeCoffee = Math.random() > 0.25; // 75% chance of coffee
  const includeTransfer = Math.random() > 0.6; // 40% chance of transfer
  
  // Build legs dynamically
  const legs = [];
  let legNum = 1;
  
  // Leg 1: Walk to cafe or transit
  if (includeCoffee) {
    legs.push({
      number: legNum++,
      type: 'walk',
      title: `Walk to ${cafe.name}`,
      subtitle: `From home - ${cafe.address}`,
      minutes: 3 + Math.floor(Math.random() * 6),
      state: 'normal'
    });
    
    // Leg 2: Coffee
    const coffeeTime = 4 + Math.floor(Math.random() * 4);
    legs.push({
      number: legNum++,
      type: 'coffee',
      title: `Coffee at ${cafe.name}`,
      subtitle: 'TIME FOR COFFEE',
      minutes: coffeeTime,
      state: 'normal'
    });
    
    // Leg 3: Walk to transit
    legs.push({
      number: legNum++,
      type: 'walk',
      title: transitType === 'train' ? 'Walk to Station' : 'Walk to Stop',
      subtitle: `${home.suburb} ${transitType === 'train' ? 'Station' : 'Stop'}`,
      minutes: 3 + Math.floor(Math.random() * 5),
      state: 'normal'
    });
  } else {
    legs.push({
      number: legNum++,
      type: 'walk',
      title: transitType === 'train' ? 'Walk to Station' : 'Walk to Stop',
      subtitle: `From home - ${home.suburb}`,
      minutes: 5 + Math.floor(Math.random() * 8),
      state: 'normal'
    });
  }
  
  // Main transit leg
  const transitMins = 8 + Math.floor(Math.random() * 15);
  const nextDep = 2 + Math.floor(Math.random() * 8);
  const nextDep2 = nextDep + 5 + Math.floor(Math.random() * 8);
  
  if (transitType === 'train') {
    const line = pick(RANDOM_LOCATIONS.transit.trains);
    legs.push({
      number: legNum++,
      type: 'train',
      title: `Train to City`,
      subtitle: `${line} - Next: ${nextDep}, ${nextDep2} min`,
      minutes: transitMins,
      state: Math.random() > 0.85 ? 'delayed' : 'normal'
    });
  } else if (transitType === 'tram') {
    const route = pick(RANDOM_LOCATIONS.transit.trams);
    legs.push({
      number: legNum++,
      type: 'tram',
      title: `Tram ${route} to City`,
      subtitle: `City bound - Next: ${nextDep}, ${nextDep2} min`,
      minutes: transitMins,
      state: Math.random() > 0.85 ? 'delayed' : 'normal'
    });
  } else {
    const route = pick(RANDOM_LOCATIONS.transit.buses);
    legs.push({
      number: legNum++,
      type: 'bus',
      title: `Bus ${route} to City`,
      subtitle: `Via ${pick(['Hoddle St', 'Brunswick Rd', 'Victoria Pde', 'St Kilda Rd'])} - Next: ${nextDep} min`,
      minutes: transitMins,
      state: 'normal'
    });
  }
  
  // Optional transfer
  if (includeTransfer && transitType !== 'train') {
    const transferType = transitType === 'tram' ? 'train' : 'tram';
    legs.push({
      number: legNum++,
      type: 'walk',
      title: 'Walk to Transfer',
      subtitle: transferType === 'train' ? 'Flinders St Station' : 'Collins St Stop',
      minutes: 2 + Math.floor(Math.random() * 3),
      state: 'normal'
    });
    
    if (transferType === 'train') {
      legs.push({
        number: legNum++,
        type: 'train',
        title: 'Train to Parliament',
        subtitle: 'City Loop - Next: 3, 8 min',
        minutes: 3 + Math.floor(Math.random() * 4),
        state: 'normal'
      });
    } else {
      const route = pick(RANDOM_LOCATIONS.transit.trams);
      legs.push({
        number: legNum++,
        type: 'tram',
        title: `Tram ${route} to Stop`,
        subtitle: 'Collins St - Next: 2, 6 min',
        minutes: 4 + Math.floor(Math.random() * 5),
        state: 'normal'
      });
    }
  }
  
  // Final walk to office
  legs.push({
    number: legNum++,
    type: 'walk',
    title: `Walk to Office`,
    subtitle: `${work.name} - ${work.address.split(',')[0]}`,
    minutes: 3 + Math.floor(Math.random() * 8),
    state: 'normal'
  });
  
  // Calculate totals
  const totalMinutes = legs.reduce((sum, leg) => sum + leg.minutes, 0);
  
  // Random time
  const hour = 7 + Math.floor(Math.random() * 2);
  const mins = Math.floor(Math.random() * 45);
  const arriveHour = hour + Math.floor((mins + totalMinutes) / 60);
  const arriveMins = (mins + totalMinutes) % 60;
  
  return {
    origin: home.address,
    destination: work.address,
    currentTime: `${hour}:${mins.toString().padStart(2, '0')}`,
    amPm: 'AM',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][Math.floor(Math.random() * 5)],
    date: `${Math.floor(Math.random() * 28) + 1} January`,
    status: legs.some(l => l.state === 'delayed') ? 'DELAY' : 'LEAVE NOW',
    arrivalTime: `${arriveHour}:${arriveMins.toString().padStart(2, '0')}`,
    totalDuration: totalMinutes,
    weather: {
      temp: 18 + Math.floor(Math.random() * 12),
      condition: pick(['Sunny', 'Partly Cloudy', 'Cloudy', 'Clear']),
      umbrella: Math.random() > 0.8
    },
    legs,
    journey_legs: legs, // Alias for zone renderer compatibility
    cafe: includeCoffee ? cafe.name : null,
    transitType,
    home,
    work
  };
}

export default { generateRandomJourney, RANDOM_LOCATIONS };
