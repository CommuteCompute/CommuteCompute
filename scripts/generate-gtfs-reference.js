#!/usr/bin/env node
/**
 * Generate GTFS Reference Module from Raw Transport Victoria GTFS Data
 *
 * Reads raw stops.txt files from src/data/vic/gtfs/ and generates
 * src/data/vic/gtfs-reference.js — a JS module with all stop data
 * for runtime use by opendata-client.js and gtfs-stop-names.js.
 *
 * Usage: node scripts/generate-gtfs-reference.js
 *
 * Raw GTFS source files (CC BY 4.0 Transport Victoria OpenData):
 *   src/data/vic/gtfs/metro-stops.txt    — Metro train platforms
 *   src/data/vic/gtfs/tram-stops.txt     — Tram stops
 *   src/data/vic/gtfs/bus-regional-stops.txt  — Regional bus stops
 *   src/data/vic/gtfs/bus-metro-stops.txt     — Metropolitan bus stops
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GTFS_DIR = join(__dirname, '..', 'src', 'data', 'vic', 'gtfs');
const OUTPUT = join(__dirname, '..', 'src', 'data', 'vic', 'gtfs-reference.js');

function parseCsv(filePath) {
  const content = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''); // Strip BOM
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].match(/(".*?"|[^,]+)/g);
    if (!values) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim().replace(/^"|"$/g, '');
    }
    rows.push(row);
  }
  return rows;
}

// ── Metro Stations ──
// Group by parent_station code, collect numeric platform IDs
// Exclude replacement bus stops and infrastructure (non-numeric) IDs
function buildMetroStations() {
  const rows = parseCsv(join(GTFS_DIR, 'metro-stops.txt'));
  const stations = {};

  for (const row of rows) {
    const stopId = row.stop_id;
    const stopName = row.stop_name;
    const parent = row.parent_station || '';
    const platformCode = (row.platform_code || '').toLowerCase();

    if (!/^\d+$/.test(stopId)) continue; // Skip infrastructure IDs
    if (!parent.startsWith('vic:rail:')) continue;
    if (platformCode === 'replacement bus') continue;

    const code = parent.split(':')[2];
    if (!stations[code]) {
      const name = stopName.replace(/ Rail Replacement Bus Stop$/, '').trim();
      stations[code] = { name, platforms: [] };
    }
    stations[code].platforms.push(stopId);
  }

  // Sort platforms numerically within each station
  for (const code of Object.keys(stations)) {
    stations[code].platforms.sort((a, b) => Number(a) - Number(b));
  }

  return stations;
}

// ── Tram Stops ──
// All numeric stop IDs with location_type != 1 (not parent stations)
function buildTramStops() {
  const rows = parseCsv(join(GTFS_DIR, 'tram-stops.txt'));
  const stops = {};

  for (const row of rows) {
    const stopId = row.stop_id;
    const stopName = row.stop_name;
    const locType = row.location_type || '';

    if (!/^\d+$/.test(stopId)) continue;
    if (locType === '1') continue; // Skip parent station entries

    stops[stopId] = stopName;
  }

  return stops;
}

// ── Bus Stops ──
// Combine metropolitan and regional bus stops
// All numeric stop IDs with location_type != 1
function buildBusStops() {
  const stops = {};

  // Metropolitan bus stops first
  const metroRows = parseCsv(join(GTFS_DIR, 'bus-metro-stops.txt'));
  for (const row of metroRows) {
    const stopId = row.stop_id;
    const stopName = row.stop_name;
    const locType = row.location_type || '';

    if (!/^\d+$/.test(stopId)) continue;
    if (locType === '1') continue;

    stops[stopId] = stopName;
  }

  // Regional bus stops (overwrite metro if overlap — regional names may be more specific)
  const regionalRows = parseCsv(join(GTFS_DIR, 'bus-regional-stops.txt'));
  for (const row of regionalRows) {
    const stopId = row.stop_id;
    const stopName = row.stop_name;
    const locType = row.location_type || '';

    if (!/^\d+$/.test(stopId)) continue;
    if (locType === '1') continue;

    stops[stopId] = stopName;
  }

  return stops;
}

// ── Suburb-to-Stop Auto-Detection ──
// Derives suburb names from metro station names and finds nearest tram/bus stops
// by coordinates. Replaces all hardcoded suburb-to-stop mappings.
function buildSuburbStops(metroStations, tramStopsWithCoords, busStopsWithCoords) {
  const suburbStops = {};

  for (const [code, station] of Object.entries(metroStations)) {
    // Extract suburb from station name (remove " Station" suffix)
    const suburb = station.name.replace(/ Station$/i, '').trim().toLowerCase();
    if (!suburb || suburb.length < 2) continue;

    // Get station coordinates (average of platform coordinates)
    const stationLat = station.lat || null;
    const stationLon = station.lon || null;

    const entry = {
      trainStation: code,
      stationName: station.name,
      tram: null,
      tramName: null,
      bus: null,
      busName: null,
    };

    // Find nearest tram stop within 1km
    if (stationLat && stationLon) {
      let nearestTram = null;
      let nearestTramDist = Infinity;
      for (const ts of tramStopsWithCoords) {
        const dist = haversine(stationLat, stationLon, ts.lat, ts.lon);
        if (dist < nearestTramDist && dist < 1.0) { // 1km radius
          nearestTramDist = dist;
          nearestTram = ts;
        }
      }
      if (nearestTram) {
        entry.tram = nearestTram.id;
        entry.tramName = nearestTram.name;
      }

      // Find nearest bus stop within 0.5km
      let nearestBus = null;
      let nearestBusDist = Infinity;
      for (const bs of busStopsWithCoords) {
        const dist = haversine(stationLat, stationLon, bs.lat, bs.lon);
        if (dist < nearestBusDist && dist < 0.5) { // 500m radius
          nearestBusDist = dist;
          nearestBus = bs;
        }
      }
      if (nearestBus) {
        entry.bus = nearestBus.id;
        entry.busName = nearestBus.name;
      }
    }

    suburbStops[suburb] = entry;
  }

  return suburbStops;
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Build tram stops with coordinates for proximity matching
function buildTramStopsWithCoords() {
  const rows = parseCsv(join(GTFS_DIR, 'tram-stops.txt'));
  const stops = [];
  for (const row of rows) {
    if (!/^\d+$/.test(row.stop_id)) continue;
    if ((row.location_type || '') === '1') continue;
    const lat = parseFloat(row.stop_lat);
    const lon = parseFloat(row.stop_lon);
    if (isNaN(lat) || isNaN(lon)) continue;
    stops.push({ id: row.stop_id, name: row.stop_name, lat, lon });
  }
  return stops;
}

// Build bus stops with coordinates for proximity matching
function buildBusStopsWithCoords() {
  const rows = [
    ...parseCsv(join(GTFS_DIR, 'bus-metro-stops.txt')),
    ...parseCsv(join(GTFS_DIR, 'bus-regional-stops.txt'))
  ];
  const stops = [];
  for (const row of rows) {
    if (!/^\d+$/.test(row.stop_id)) continue;
    if ((row.location_type || '') === '1') continue;
    const lat = parseFloat(row.stop_lat);
    const lon = parseFloat(row.stop_lon);
    if (isNaN(lat) || isNaN(lon)) continue;
    stops.push({ id: row.stop_id, name: row.stop_name, lat, lon });
  }
  return stops;
}

// Enhanced metro station builder that includes coordinates
function buildMetroStationsWithCoords() {
  const rows = parseCsv(join(GTFS_DIR, 'metro-stops.txt'));
  const stations = {};

  for (const row of rows) {
    const stopId = row.stop_id;
    const stopName = row.stop_name;
    const parent = row.parent_station || '';
    const platformCode = (row.platform_code || '').toLowerCase();

    if (!/^\d+$/.test(stopId)) continue;
    if (!parent.startsWith('vic:rail:')) continue;
    if (platformCode === 'replacement bus') continue;

    const code = parent.split(':')[2];
    if (!stations[code]) {
      const name = stopName.replace(/ Rail Replacement Bus Stop$/, '').trim();
      stations[code] = { name, platforms: [], lat: null, lon: null };
    }
    stations[code].platforms.push(stopId);

    // Use first platform's coordinates as station coordinates
    if (!stations[code].lat) {
      const lat = parseFloat(row.stop_lat);
      const lon = parseFloat(row.stop_lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        stations[code].lat = lat;
        stations[code].lon = lon;
      }
    }
  }

  for (const code of Object.keys(stations)) {
    stations[code].platforms.sort((a, b) => Number(a) - Number(b));
  }

  return stations;
}

// ── Generate JS Module ──
function generateModule(metroStations, tramStops, busStops, suburbStops, tramStopsWithCoords, busStopsWithCoords) {
  const metroCount = Object.keys(metroStations).length;
  const tramCount = Object.keys(tramStops).length;
  const busCount = Object.keys(busStops).length;
  const totalPlatforms = Object.values(metroStations).reduce((sum, s) => sum + s.platforms.length, 0);
  const date = new Date().toISOString().split('T')[0];

  let js = `// @generated — Do not edit manually. Regenerate with: node scripts/generate-gtfs-reference.js
/**
 * VIC GTFS Reference Data — Auto-generated from Transport Victoria Static GTFS
 *
 * Generated: ${date}
 * Source: Transport Victoria OpenData static GTFS feeds
 * Raw data: src/data/vic/gtfs/*.txt (CC BY 4.0)
 *
 * Metro: ${metroCount} stations, ${totalPlatforms} platform IDs
 * Tram: ${tramCount} stops
 * Bus: ${busCount} stops (metropolitan + regional)
 * Total: ${totalPlatforms + tramCount + busCount} stop IDs
 *
 * THIRD-PARTY DATA ATTRIBUTION:
 * Transit data: Transport Victoria OpenData (CC BY 4.0)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

/**
 * VIC Metro Stations — ${metroCount} stations
 * Key: 3-letter GTFS station code (from parent_station, e.g. vic:rail:SYR -> SYR)
 * Value: { name: string, platforms: string[], lat: number, lon: number }
 * platforms[] contains all numeric platform stop_ids for GTFS-RT matching.
 * lat/lon are station coordinates (from first platform in GTFS).
 * Replacement bus stops and infrastructure IDs are excluded.
 */
export const VIC_METRO_STATIONS = {\n`;

  for (const code of Object.keys(metroStations).sort()) {
    const s = metroStations[code];
    const name = s.name.replace(/'/g, "\\'");
    const platforms = s.platforms.map(p => `'${p}'`).join(', ');
    js += `  ${code}: { name: '${name}', platforms: [${platforms}], lat: ${s.lat}, lon: ${s.lon} },\n`;
  }

  js += `};\n\n`;

  // Tram stops — sorted numerically
  js += `/**
 * VIC Tram Stops — ${tramCount} stops
 * Key: numeric tram stop ID (string)
 * Value: official stop name from GTFS
 */
export const VIC_TRAM_STOPS = {\n`;

  const tramIds = Object.keys(tramStops).sort((a, b) => Number(a) - Number(b));
  for (const sid of tramIds) {
    const name = tramStops[sid].replace(/'/g, "\\'").trim();
    js += `  '${sid}': '${name}',\n`;
  }

  js += `};\n\n`;

  // Bus stops — sorted numerically
  js += `/**
 * VIC Bus Stops — ${busCount} stops (metropolitan + regional)
 * Key: numeric bus stop ID (string)
 * Value: official stop name from GTFS
 */
export const VIC_BUS_STOPS = {\n`;

  const busIds = Object.keys(busStops).sort((a, b) => Number(a) - Number(b));
  for (const sid of busIds) {
    const name = busStops[sid].replace(/'/g, "\\'").trim();
    js += `  '${sid}': '${name}',\n`;
  }

  js += `};\n\n`;

  // Suburb-to-stop mapping (auto-generated from GTFS coordinates)
  const suburbCount = Object.keys(suburbStops).length;
  js += `/**
 * VIC Suburb-to-Stop Auto-Detection — ${suburbCount} suburbs
 * Auto-generated from GTFS station names + nearest tram/bus by coordinates.
 * Key: suburb name (lowercase, from station name minus "Station" suffix)
 * Value: { trainStation, stationName, tram, tramName, bus, busName }
 * tram/bus = nearest stop within 1km/0.5km by haversine distance.
 */
export const VIC_SUBURB_STOPS = {\n`;

  for (const suburb of Object.keys(suburbStops).sort()) {
    const s = suburbStops[suburb];
    const stationName = (s.stationName || '').replace(/'/g, "\\'");
    const tramName = s.tramName ? `'${s.tramName.replace(/'/g, "\\'")}'` : 'null';
    const busName = s.busName ? `'${s.busName.replace(/'/g, "\\'")}'` : 'null';
    const tramId = s.tram ? `'${s.tram}'` : 'null';
    const busId = s.bus ? `'${s.bus}'` : 'null';
    js += `  '${suburb}': { trainStation: '${s.trainStation}', stationName: '${stationName}', tram: ${tramId}, tramName: ${tramName}, bus: ${busId}, busName: ${busName} },\n`;
  }

  js += `};\n\n`;

  // Helper function
  js += `/**
 * Build a Set of all platform IDs for a given list of station codes.
 * Used to construct CITY_LOOP_STOP_IDS, METRO_TUNNEL_STOP_IDS, etc.
 * @param {...string} codes - 3-letter station codes
 * @returns {Set<string>} - Set of all platform stop IDs
 */
export function getPlatformIds(...codes) {
  const ids = new Set();
  for (const code of codes) {
    const station = VIC_METRO_STATIONS[code];
    if (station) {
      for (const pid of station.platforms) {
        ids.add(pid);
      }
    }
  }
  return ids;
}
`;

  // Tram stops with coordinates
  const tramCoordsCount = tramStopsWithCoords.length;
  js += `\n/**
 * VIC Tram Stops with Coordinates — ${tramCoordsCount} stops
 * Array of { id: string, name: string, lat: number, lon: number }
 * Used for coordinate-based nearest-stop detection.
 */
export const VIC_TRAM_STOPS_WITH_COORDS = [\n`;

  for (const stop of tramStopsWithCoords) {
    const name = stop.name.replace(/'/g, "\\'").trim();
    js += `  { id: '${stop.id}', name: '${name}', lat: ${stop.lat}, lon: ${stop.lon} },\n`;
  }

  js += `];\n`;

  // Bus stops with coordinates
  const busCoordsCount = busStopsWithCoords.length;
  js += `\n/**
 * VIC Bus Stops with Coordinates — ${busCoordsCount} stops
 * Array of { id: string, name: string, lat: number, lon: number }
 * Used for coordinate-based nearest-stop detection.
 */
export const VIC_BUS_STOPS_WITH_COORDS = [\n`;

  for (const stop of busStopsWithCoords) {
    const name = stop.name.replace(/'/g, "\\'").trim();
    js += `  { id: '${stop.id}', name: '${name}', lat: ${stop.lat}, lon: ${stop.lon} },\n`;
  }

  js += `];\n`;

  return js;
}

// ── Main ──
console.log('Parsing metro-stops.txt (with coordinates)...');
const metroStations = buildMetroStationsWithCoords();
console.log(`  ${Object.keys(metroStations).length} stations, ${Object.values(metroStations).reduce((s, st) => s + st.platforms.length, 0)} platforms`);

console.log('Parsing tram-stops.txt...');
const tramStops = buildTramStops();
console.log(`  ${Object.keys(tramStops).length} stops`);

console.log('Parsing bus-metro-stops.txt + bus-regional-stops.txt...');
const busStops = buildBusStops();
console.log(`  ${Object.keys(busStops).length} stops`);

console.log('Building tram stops with coordinates for proximity matching...');
const tramStopsWithCoords = buildTramStopsWithCoords();
console.log(`  ${tramStopsWithCoords.length} tram stops with coordinates`);

console.log('Building bus stops with coordinates for proximity matching...');
const busStopsWithCoords = buildBusStopsWithCoords();
console.log(`  ${busStopsWithCoords.length} bus stops with coordinates`);

console.log('Auto-generating suburb-to-stop mapping from GTFS...');
const suburbStops = buildSuburbStops(metroStations, tramStopsWithCoords, busStopsWithCoords);
console.log(`  ${Object.keys(suburbStops).length} suburbs auto-mapped`);

console.log('Generating gtfs-reference.js...');
const module = generateModule(metroStations, tramStops, busStops, suburbStops, tramStopsWithCoords, busStopsWithCoords);
writeFileSync(OUTPUT, module, 'utf-8');

const sizeKB = Math.round(Buffer.byteLength(module, 'utf-8') / 1024);
console.log(`Written: ${OUTPUT} (${sizeKB} KB)`);
console.log('Done.');
