#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system

/**
 * State GTFS Reference Data Generator
 *
 * Generates comprehensive stop reference data for a given Australian state
 * from downloaded GTFS static feeds. Follows the same pattern as the
 * VIC-specific generate-gtfs-reference.js but is parameterised for any state.
 *
 * Usage:
 *   node scripts/generate-state-reference.js <STATE_CODE>
 *
 * Example:
 *   node scripts/generate-state-reference.js NSW
 *
 * Prerequisites:
 *   Download the state's GTFS static feed and extract stops.txt into:
 *     src/data/<state>/gtfs/stops.txt
 *
 * GTFS Static Feed Download URLs:
 *   VIC: https://data.ptv.vic.gov.au/downloads/gtfs.zip
 *   NSW: https://opendata.transport.nsw.gov.au/dataset/timetables-complete-gtfs
 *   QLD: https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip
 *   SA:  https://data.sa.gov.au/data/dataset/adelaide-metro-general-transit-feed
 *   WA:  https://www.transperth.wa.gov.au/About/Spatial-Data-Access (registration required)
 *   TAS: https://www.metrotas.com.au/community/gtfs/ (contact required)
 *   ACT: https://www.data.act.gov.au/Transport/GTFS-Static-Feed/4fdc-wfrp
 *   NT:  Contact NT Department of Infrastructure, Planning and Logistics
 *
 * Open Data Licence Attribution:
 *   VIC: Transport Victoria OpenData — CC BY 4.0
 *   NSW: Transport for NSW Open Data — CC BY 4.0
 *   QLD: TransLink / Data QLD — CC BY 4.0
 *   SA:  Data SA / Adelaide Metro — CC BY 4.0
 *   WA:  Transperth — terms at https://www.transperth.wa.gov.au
 *   TAS: Metro Tasmania — contact for terms
 *   ACT: Transport Canberra / ACT Open Data — CC BY 4.0
 *   NT:  NT Government — contact for terms
 *
 * Output:
 *   src/data/<state>/gtfs-reference.js
 *   Contains exported constants: <STATE>_STOPS, <STATE>_SUBURB_STOPS
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALID_STATES = ['NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];

const state = process.argv[2]?.toUpperCase();
if (!state || !VALID_STATES.includes(state)) {
  console.error(`Usage: node ${process.argv[1]} <STATE_CODE>`);
  console.error(`Valid states: ${VALID_STATES.join(', ')}`);
  console.error('(VIC uses generate-gtfs-reference.js — its own dedicated script)');
  process.exit(1);
}

const GTFS_DIR = join(__dirname, '..', 'src', 'data', state.toLowerCase(), 'gtfs');
const OUTPUT = join(__dirname, '..', 'src', 'data', state.toLowerCase(), 'gtfs-reference.js');
const STOPS_FILE = join(GTFS_DIR, 'stops.txt');

if (!existsSync(STOPS_FILE)) {
  console.error(`GTFS stops file not found: ${STOPS_FILE}`);
  console.error(`\nTo generate reference data for ${state}:`);
  console.error(`  1. Download the GTFS static feed for ${state}`);
  console.error(`  2. Extract stops.txt to: ${STOPS_FILE}`);
  console.error('  3. Re-run this script');
  process.exit(1);
}

// Parse CSV (handles quoted fields)
function parseCsv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

console.log(`\nGenerating GTFS reference data for ${state}...`);
console.log(`Reading: ${STOPS_FILE}`);

const rows = parseCsv(STOPS_FILE);
console.log(`Parsed ${rows.length} stop records`);

// Build stops with coordinates, grouped by route_type if available
const stops = {};
for (const row of rows) {
  const lat = parseFloat(row.stop_lat);
  const lon = parseFloat(row.stop_lon);
  if (isNaN(lat) || isNaN(lon)) continue;

  const id = row.stop_id;
  const name = (row.stop_name || '').replace(/ Platform \d+$/i, '').replace(/ Stand [A-Z]\d*$/i, '').trim();
  const routeType = row.route_type || row.location_type || '0';

  if (!stops[id]) {
    stops[id] = { id, name, lat, lon, routeType };
  }
}

console.log(`Built ${Object.keys(stops).length} unique stops`);

// Generate suburb-to-stop mappings from stop names
const suburbStops = {};
for (const stop of Object.values(stops)) {
  const suburb = stop.name
    .replace(/ Station$/i, '')
    .replace(/ Stop$/i, '')
    .replace(/ Platform.*$/i, '')
    .replace(/ \(.*\)$/i, '')
    .trim()
    .toLowerCase();

  if (suburb.length < 3) continue;
  if (!suburbStops[suburb]) {
    suburbStops[suburb] = { trainStation: stop.id, stationName: stop.name };
  }
}

console.log(`Generated ${Object.keys(suburbStops).length} suburb mappings`);

// Ensure output directory exists
const outputDir = dirname(OUTPUT);
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Write output file
const stateUpper = state.toUpperCase();
const output = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™
// Auto-generated from ${state} GTFS static feed — do not edit manually

/**
 * ${state} GTFS Reference Data
 * Generated by: scripts/generate-state-reference.js
 * Stops: ${Object.keys(stops).length}
 * Suburbs: ${Object.keys(suburbStops).length}
 */

export const ${stateUpper}_STOPS = ${JSON.stringify(Object.values(stops), null, 2)};

export const ${stateUpper}_SUBURB_STOPS = ${JSON.stringify(suburbStops, null, 2)};

export default { ${stateUpper}_STOPS, ${stateUpper}_SUBURB_STOPS };
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`\nOutput written to: ${OUTPUT}`);
console.log(`  Stops: ${Object.keys(stops).length}`);
console.log(`  Suburbs: ${Object.keys(suburbStops).length}`);
console.log('\nDone.');
