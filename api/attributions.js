/**
 * /api/attributions - Data Source Attributions
 * Required for compliance with data source licenses.
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.json({
    attributions: [
      {
        source: 'Transport Victoria OpenData',
        license: 'CC BY 4.0',
        url: 'https://opendata.transport.vic.gov.au',
        text: 'Transit data from Transport Victoria OpenData (CC BY 4.0)'
      },
      {
        source: 'Bureau of Meteorology',
        license: 'CC BY 3.0 AU',
        url: 'https://www.bom.gov.au',
        text: 'Weather data from Bureau of Meteorology'
      },
      {
        source: 'OpenStreetMap',
        license: 'ODbL',
        url: 'https://www.openstreetmap.org',
        text: 'Map data © OpenStreetMap contributors'
      }
    ],
    required: true,
    displayFormat: 'footer'
  });
}
