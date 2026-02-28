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

// ── Generate JS Module ──
function generateModule(metroStations, tramStops, busStops) {
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
 * Value: { name: string, platforms: string[] }
 * platforms[] contains all numeric platform stop_ids for GTFS-RT matching.
 * Replacement bus stops and infrastructure IDs are excluded.
 */
export const VIC_METRO_STATIONS = {\n`;

  for (const code of Object.keys(metroStations).sort()) {
    const s = metroStations[code];
    const name = s.name.replace(/'/g, "\\'");
    const platforms = s.platforms.map(p => `'${p}'`).join(', ');
    js += `  ${code}: { name: '${name}', platforms: [${platforms}] },\n`;
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

  return js;
}

// ── Main ──
console.log('Parsing metro-stops.txt...');
const metroStations = buildMetroStations();
console.log(`  ${Object.keys(metroStations).length} stations, ${Object.values(metroStations).reduce((s, st) => s + st.platforms.length, 0)} platforms`);

console.log('Parsing tram-stops.txt...');
const tramStops = buildTramStops();
console.log(`  ${Object.keys(tramStops).length} stops`);

console.log('Parsing bus-metro-stops.txt + bus-regional-stops.txt...');
const busStops = buildBusStops();
console.log(`  ${Object.keys(busStops).length} stops`);

console.log('Generating gtfs-reference.js...');
const module = generateModule(metroStations, tramStops, busStops);
writeFileSync(OUTPUT, module, 'utf-8');

const sizeKB = Math.round(Buffer.byteLength(module, 'utf-8') / 1024);
console.log(`Written: ${OUTPUT} (${sizeKB} KB)`);
console.log('Done.');
