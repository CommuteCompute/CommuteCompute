// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system

import { haversine } from '../utils/haversine.js';

/**
 * Fallback Timetable Data for All Australian States
 * Provides default stop/station data when live APIs are unavailable
 * Used for journey planning when real-time data cannot be fetched
 *
 * DATA ATTRIBUTION:
 * Stop IDs, names, and coordinates compiled from publicly available transit information:
 * - VIC: Transport Victoria - Public transit data (via OpenData API)
 * - NSW: Transport for NSW - Public transit data
 * - QLD: TransLink Queensland - Public transit data
 * - SA: Adelaide Metro - Public transit data
 * - WA: Transperth - Public transit data
 * - TAS: Metro Tasmania - Public transit data
 * - ACT: Transport Canberra - Public transit data
 * - NT: Transport NT - Public transit data
 *
 * This compilation and code structure:
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * The underlying transit data remains property of respective transit authorities.
 */

/**
 * Major transit stops and stations for each Australian state/territory
 * Organized by state code and transit mode
 */
const FALLBACK_STOPS = {
  // ========== VICTORIA (VIC) ==========
  VIC: {
    name: 'Victoria',
    authority: 'Transport Victoria',
    modes: {
      train: [
        { id: '1071', name: 'Flinders Street Station', lat: -37.8183, lon: 144.9671 },
        { id: '1155', name: 'Southern Cross Station', lat: -37.8183, lon: 144.9529 },
        { id: '1181', name: 'Melbourne Central', lat: -37.8102, lon: 144.9628 },
        { id: '1120', name: 'Parliament', lat: -37.8110, lon: 144.9730 },
        { id: '1068', name: 'Flagstaff', lat: -37.8122, lon: 144.9560 },
        { id: '1104', name: 'Richmond', lat: -37.8210, lon: 145.0037 },
        { id: '1159', name: 'South Yarra', lat: -37.8397, lon: 144.9933 },
        { id: '1012', name: 'Caulfield', lat: -37.8770, lon: 145.0250 },
        { id: '1230', name: 'Hawksburn', lat: -37.8530, lon: 145.0122 },
        { id: '1229', name: 'Toorak', lat: -37.8480, lon: 145.0080 },
        { id: '1043', name: 'Footscray', lat: -37.8018, lon: 144.9012 },
        { id: '1026', name: 'Dandenong', lat: -37.9872, lon: 145.2135 },
        { id: '1190', name: 'Box Hill', lat: -37.8190, lon: 145.1240 }
      ],
      tram: [
        { id: '2171', name: 'Federation Square', lat: -37.8180, lon: 144.9690 },
        { id: '2500', name: 'St Kilda Junction', lat: -37.8560, lon: 144.9800 },
        { id: '2172', name: 'Collins St/Elizabeth St', lat: -37.8140, lon: 144.9650 },
        { id: '2173', name: 'Bourke St/Swanston St', lat: -37.8140, lon: 144.9680 },
        { id: '2590', name: 'Melbourne University', lat: -37.7980, lon: 144.9610 },
        { id: '2801', name: 'Chapel St/Tivoli Rd', lat: -37.8420, lon: 144.9970 },
        { id: '2802', name: 'Chapel St/High St', lat: -37.8450, lon: 144.9965 },
        { id: '2803', name: 'Toorak Rd/Chapel St', lat: -37.8400, lon: 144.9980 },
        { id: '2804', name: 'Domain Interchange', lat: -37.8250, lon: 144.9800 },
        { id: '2805', name: 'Collins St/Spring St', lat: -37.8155, lon: 144.9735 }
      ],
      bus: [
        { id: '10005', name: 'Melbourne CBD', lat: -37.8136, lon: 144.9631 },
        { id: '10120', name: 'Monash University', lat: -37.9105, lon: 145.1340 }
      ]
    }
  },

  // ========== NEW SOUTH WALES (NSW) ==========
  // Data: Transport for NSW Open Data — CC BY 4.0
  NSW: {
    name: 'New South Wales',
    authority: 'Transport for NSW (TfNSW)',
    modes: {
      train: [
        // Sydney CBD & Inner
        { id: '10101100', name: 'Central Station', lat: -33.8831, lon: 151.2068 },
        { id: '10101120', name: 'Town Hall', lat: -33.8731, lon: 151.2068 },
        { id: '10101123', name: 'Wynyard', lat: -33.8656, lon: 151.2060 },
        { id: '10101124', name: 'Circular Quay', lat: -33.8614, lon: 151.2109 },
        { id: '10101126', name: 'Martin Place', lat: -33.8679, lon: 151.2105 },
        { id: '10101128', name: 'Kings Cross', lat: -33.8778, lon: 151.2229 },
        { id: '10101130', name: 'Redfern', lat: -33.8927, lon: 151.2027 },
        { id: '10101132', name: 'North Sydney', lat: -33.8396, lon: 151.2079 },
        { id: '10101134', name: 'Milsons Point', lat: -33.8463, lon: 151.2117 },
        // North Shore & Northern
        { id: '10101210', name: 'Chatswood', lat: -33.7978, lon: 151.1817 },
        { id: '10101214', name: 'Epping', lat: -33.7728, lon: 151.0833 },
        { id: '10101216', name: 'Hornsby', lat: -33.7028, lon: 151.0986 },
        { id: '10101218', name: 'Gordon', lat: -33.7564, lon: 151.1535 },
        { id: '10101220', name: 'St Leonards', lat: -33.8233, lon: 151.1956 },
        { id: '10101222', name: 'Macquarie Park', lat: -33.7775, lon: 151.1254 },
        // West & Inner West
        { id: '10101211', name: 'Strathfield', lat: -33.8719, lon: 151.0844 },
        { id: '10101320', name: 'Parramatta', lat: -33.8170, lon: 151.0040 },
        { id: '10101322', name: 'Olympic Park', lat: -33.8468, lon: 151.0694 },
        { id: '10101324', name: 'Blacktown', lat: -33.7686, lon: 150.9060 },
        { id: '10101326', name: 'Penrith', lat: -33.7507, lon: 150.6907 },
        { id: '10101328', name: 'Liverpool', lat: -33.9266, lon: 150.9206 },
        { id: '10101330', name: 'Bankstown', lat: -33.9179, lon: 151.0340 },
        { id: '10101332', name: 'Burwood', lat: -33.8774, lon: 151.1044 },
        { id: '10101334', name: 'Auburn', lat: -33.8500, lon: 151.0327 },
        // South & South-West
        { id: '10101610', name: 'Bondi Junction', lat: -33.8915, lon: 151.2477 },
        { id: '10101612', name: 'Hurstville', lat: -33.9647, lon: 151.1059 },
        { id: '10101614', name: 'Sutherland', lat: -34.0322, lon: 151.0562 },
        { id: '10101616', name: 'Campbelltown', lat: -34.0651, lon: 150.8135 },
        { id: '10101618', name: 'Wolli Creek', lat: -33.9286, lon: 151.1538 },
        // Newcastle & Wollongong
        { id: '10102100', name: 'Newcastle Interchange', lat: -32.9267, lon: 151.7557 },
        { id: '10103100', name: 'Wollongong', lat: -34.4400, lon: 150.8863 }
      ],
      metro: [
        // Sydney Metro (North West & City lines)
        { id: '10201001', name: 'Tallawong', lat: -33.6912, lon: 150.9054 },
        { id: '10201003', name: 'Kellyville', lat: -33.7168, lon: 150.9503 },
        { id: '10201005', name: 'Castle Hill', lat: -33.7310, lon: 151.0036 },
        { id: '10201007', name: 'Cherrybrook', lat: -33.7511, lon: 151.0467 },
        { id: '10201009', name: 'Macquarie University', lat: -33.7743, lon: 151.1153 },
        { id: '10201011', name: 'Crows Nest', lat: -33.8268, lon: 151.2074 },
        { id: '10201013', name: 'Victoria Cross', lat: -33.8396, lon: 151.2070 },
        { id: '10201015', name: 'Barangaroo', lat: -33.8604, lon: 151.2013 },
        { id: '10201017', name: 'Martin Place Metro', lat: -33.8679, lon: 151.2105 },
        { id: '10201019', name: 'Gadigal', lat: -33.8811, lon: 151.2099 },
        { id: '10201021', name: 'Waterloo', lat: -33.8974, lon: 151.2068 },
        { id: '10201023', name: 'Sydenham Metro', lat: -33.9172, lon: 151.1667 }
      ],
      lightrail: [
        // CBD & SE Light Rail (L2/L3)
        { id: '2000107', name: 'Central Chalmers St', lat: -33.8833, lon: 151.2078 },
        { id: '2000108', name: 'Capitol Square', lat: -33.8800, lon: 151.2074 },
        { id: '2000110', name: 'Paddy\'s Markets', lat: -33.8779, lon: 151.2051 },
        { id: '2000112', name: 'Circular Quay LR', lat: -33.8614, lon: 151.2109 },
        { id: '2000114', name: 'Randwick', lat: -33.9149, lon: 151.2399 },
        { id: '2000116', name: 'Kingsford', lat: -33.9213, lon: 151.2275 },
        { id: '2000118', name: 'UNSW High St', lat: -33.9173, lon: 151.2332 },
        // Inner West Light Rail (L1)
        { id: '2000120', name: 'Dulwich Hill', lat: -33.9021, lon: 151.1387 },
        { id: '2000122', name: 'Exhibition Centre', lat: -33.8765, lon: 151.2017 }
      ],
      bus: [
        { id: '209310', name: 'QVB', lat: -33.8717, lon: 151.2063 },
        { id: '209311', name: 'Circular Quay Bus', lat: -33.8617, lon: 151.2109 },
        { id: '209312', name: 'Town Hall Bus', lat: -33.8737, lon: 151.2068 },
        { id: '209313', name: 'Bondi Junction Bus', lat: -33.8915, lon: 151.2477 },
        { id: '209314', name: 'Parramatta Bus', lat: -33.8170, lon: 151.0040 }
      ]
    }
  },

  // ========== QUEENSLAND (QLD) ==========
  // Data: TransLink / Data QLD — CC BY 4.0
  QLD: {
    name: 'Queensland',
    authority: 'TransLink',
    modes: {
      train: [
        // Brisbane CBD & Inner
        { id: '600015', name: 'Roma Street', lat: -27.4651, lon: 153.0176 },
        { id: '600014', name: 'Central', lat: -27.4654, lon: 153.0273 },
        { id: '600016', name: 'Fortitude Valley', lat: -27.4577, lon: 153.0319 },
        { id: '600030', name: 'South Bank', lat: -27.4758, lon: 153.0194 },
        { id: '600031', name: 'South Brisbane', lat: -27.4758, lon: 153.0172 },
        { id: '600012', name: 'Bowen Hills', lat: -27.4467, lon: 153.0392 },
        { id: '600013', name: 'Albion', lat: -27.4347, lon: 153.0442 },
        { id: '600017', name: 'Eagle Junction', lat: -27.4283, lon: 153.0508 },
        // Western suburbs
        { id: '600236', name: 'Toowong', lat: -27.4843, lon: 152.9900 },
        { id: '600237', name: 'Indooroopilly', lat: -27.4989, lon: 152.9749 },
        { id: '600235', name: 'Milton', lat: -27.4694, lon: 153.0004 },
        { id: '600234', name: 'Auchenflower', lat: -27.4757, lon: 152.9889 },
        // Southern suburbs
        { id: '600032', name: 'Yeronga', lat: -27.5026, lon: 153.0143 },
        { id: '600033', name: 'Oxley', lat: -27.5524, lon: 152.9774 },
        // Northern & Sunshine Coast
        { id: '600050', name: 'Caboolture', lat: -27.0807, lon: 152.9532 },
        { id: '600060', name: 'Nambour', lat: -26.6275, lon: 152.9590 },
        // Gold Coast
        { id: '600080', name: 'Helensvale', lat: -27.9063, lon: 153.3441 },
        { id: '600081', name: 'Nerang', lat: -27.9906, lon: 153.3245 },
        { id: '600082', name: 'Robina', lat: -28.0759, lon: 153.3837 },
        { id: '600083', name: 'Varsity Lakes', lat: -28.0874, lon: 153.4092 }
      ],
      bus: [
        { id: '001040', name: 'King George Square', lat: -27.4698, lon: 153.0237 },
        { id: '001610', name: 'Queen Street', lat: -27.4705, lon: 153.0246 },
        { id: '001611', name: 'Cultural Centre', lat: -27.4730, lon: 153.0168 },
        { id: '001612', name: 'Roma St Busway', lat: -27.4651, lon: 153.0176 },
        { id: '001613', name: 'UQ Lakes', lat: -27.4988, lon: 153.0135 },
        { id: '001614', name: 'Garden City', lat: -27.5540, lon: 153.0621 },
        { id: '001615', name: 'Chermside', lat: -27.3867, lon: 153.0333 },
        { id: '001616', name: 'Carindale', lat: -27.5038, lon: 153.1002 },
        // Gold Coast Light Rail stops
        { id: '001700', name: 'Surfers Paradise', lat: -28.0032, lon: 153.4300 },
        { id: '001701', name: 'Broadbeach South', lat: -28.0391, lon: 153.4322 }
      ],
      ferry: [
        { id: '319425', name: 'North Quay', lat: -27.4689, lon: 153.0180 },
        { id: '319427', name: 'South Bank Ferry', lat: -27.4752, lon: 153.0170 },
        { id: '319428', name: 'New Farm', lat: -27.4634, lon: 153.0437 },
        { id: '319429', name: 'Bulimba', lat: -27.4567, lon: 153.0544 },
        { id: '319430', name: 'Teneriffe', lat: -27.4556, lon: 153.0459 },
        { id: '319431', name: 'West End', lat: -27.4782, lon: 153.0106 }
      ]
    }
  },

  // ========== SOUTH AUSTRALIA (SA) ==========
  // Data: Data SA / Adelaide Metro — CC BY 4.0
  SA: {
    name: 'South Australia',
    authority: 'Adelaide Metro',
    modes: {
      train: [
        // Adelaide CBD & Suburban
        { id: '9100001', name: 'Adelaide', lat: -34.9209, lon: 138.6006 },
        { id: '9100009', name: 'North Adelaide', lat: -34.9080, lon: 138.5941 },
        { id: '9100010', name: 'Goodwood', lat: -34.9459, lon: 138.5981 },
        { id: '9100011', name: 'Unley Park', lat: -34.9500, lon: 138.5950 },
        { id: '9100012', name: 'Prospect', lat: -34.8830, lon: 138.5940 },
        { id: '9100013', name: 'Mitcham', lat: -34.9796, lon: 138.6188 },
        { id: '9100014', name: 'Blackwood', lat: -35.0191, lon: 138.6184 },
        { id: '9100015', name: 'Adelaide Showground', lat: -34.9433, lon: 138.5760 },
        // Outer suburbs
        { id: '9100020', name: 'Gawler Central', lat: -34.5990, lon: 138.7480 },
        { id: '9100021', name: 'Seaford', lat: -35.1612, lon: 138.4799 },
        { id: '9100022', name: 'Noarlunga Centre', lat: -35.1395, lon: 138.5077 },
        { id: '9100023', name: 'Elizabeth', lat: -34.7270, lon: 138.6620 },
        { id: '9100024', name: 'Salisbury', lat: -34.7617, lon: 138.6465 },
        { id: '9100025', name: 'Mawson Lakes', lat: -34.8070, lon: 138.6099 },
        { id: '9100300', name: 'Glenelg', lat: -34.9803, lon: 138.5131 }
      ],
      tram: [
        // Adelaide–Glenelg tram line
        { id: '9200001', name: 'Adelaide Railway Station', lat: -34.9209, lon: 138.6008 },
        { id: '9200010', name: 'Adelaide Entertainment Centre', lat: -34.9122, lon: 138.5880 },
        { id: '9200012', name: 'Hindmarsh Square', lat: -34.9245, lon: 138.6013 },
        { id: '9200015', name: 'Victoria Square', lat: -34.9282, lon: 138.6004 },
        { id: '9200018', name: 'Botanic Gardens', lat: -34.9173, lon: 138.6136 },
        { id: '9200025', name: 'South Terrace', lat: -34.9358, lon: 138.6002 },
        { id: '9200030', name: 'Moseley Square (Glenelg)', lat: -34.9803, lon: 138.5131 },
        { id: '9200032', name: 'Jetty Road', lat: -34.9800, lon: 138.5139 }
      ],
      bus: [
        { id: '9300001', name: 'Currie St/King William St', lat: -34.9250, lon: 138.5997 },
        { id: '9300050', name: 'Rundle Mall', lat: -34.9215, lon: 138.6007 },
        { id: '9300051', name: 'Grenfell St', lat: -34.9230, lon: 138.6020 },
        { id: '9300052', name: 'North Terrace', lat: -34.9200, lon: 138.5990 },
        { id: '9300053', name: 'Marion Centre', lat: -35.0466, lon: 138.5556 },
        { id: '9300054', name: 'Tea Tree Plaza', lat: -34.8170, lon: 138.7100 }
      ]
    }
  },

  // ========== WESTERN AUSTRALIA (WA) ==========
  // Data: Transperth public transit information
  WA: {
    name: 'Western Australia',
    authority: 'Transperth',
    modes: {
      train: [
        // Perth CBD
        { id: '99T2001', name: 'Perth Station', lat: -31.9505, lon: 115.8605 },
        { id: '99T2002', name: 'Elizabeth Quay', lat: -31.9558, lon: 115.8668 },
        { id: '99T2003', name: 'Esplanade', lat: -31.9537, lon: 115.8632 },
        { id: '99T2004', name: 'Perth Underground', lat: -31.9505, lon: 115.8610 },
        // Fremantle & Joondalup lines
        { id: '99T2010', name: 'Subiaco', lat: -31.9445, lon: 115.8260 },
        { id: '99T2011', name: 'Leederville', lat: -31.9328, lon: 115.8405 },
        { id: '99T2012', name: 'Stirling', lat: -31.8826, lon: 115.8369 },
        { id: '99T2013', name: 'Warwick', lat: -31.8447, lon: 115.8133 },
        { id: '99T2014', name: 'Whitfords', lat: -31.8109, lon: 115.7757 },
        { id: '99T2072', name: 'Joondalup', lat: -31.7450, lon: 115.7653 },
        { id: '99T2140', name: 'Fremantle', lat: -32.0569, lon: 115.7470 },
        // Midland line
        { id: '99T2020', name: 'Bayswater', lat: -31.9125, lon: 115.9245 },
        { id: '99T2021', name: 'Midland', lat: -31.8889, lon: 116.0049 },
        // Armadale/Mandurah lines
        { id: '99T2030', name: 'Cannington', lat: -32.0141, lon: 115.9366 },
        { id: '99T2031', name: 'Armadale', lat: -32.1454, lon: 116.0157 },
        { id: '99T2032', name: 'Cockburn Central', lat: -32.1215, lon: 115.8477 },
        { id: '99T2033', name: 'Bull Creek', lat: -32.0572, lon: 115.8606 },
        { id: '99T2034', name: 'Mandurah', lat: -32.5260, lon: 115.7340 },
        { id: '99T2035', name: 'Rockingham', lat: -32.2803, lon: 115.7358 }
      ],
      bus: [
        { id: '10001', name: 'Perth Busport', lat: -31.9490, lon: 115.8607 },
        { id: '10050', name: 'Murray St/Barrack St', lat: -31.9520, lon: 115.8570 },
        { id: '10051', name: 'Fremantle Bus', lat: -32.0569, lon: 115.7470 },
        { id: '10052', name: 'Joondalup Bus', lat: -31.7450, lon: 115.7653 },
        { id: '10053', name: 'Morley Bus Station', lat: -31.8920, lon: 115.9035 }
      ],
      ferry: [
        { id: '99F001', name: 'Elizabeth Quay Ferry', lat: -31.9558, lon: 115.8668 },
        { id: '99F002', name: 'South Perth', lat: -31.9577, lon: 115.8619 }
      ]
    }
  },

  // ========== TASMANIA (TAS) ==========
  // Data: Metro Tasmania public transit information
  TAS: {
    name: 'Tasmania',
    authority: 'Metro Tasmania',
    modes: {
      bus: [
        // Hobart
        { id: '20001', name: 'Hobart CBD', lat: -42.8821, lon: 147.3272 },
        { id: '20002', name: 'Elizabeth St Mall', lat: -42.8826, lon: 147.3291 },
        { id: '20003', name: 'Liverpool St', lat: -42.8805, lon: 147.3285 },
        { id: '20004', name: 'Sandy Bay', lat: -42.8950, lon: 147.3240 },
        { id: '20005', name: 'Glenorchy', lat: -42.8324, lon: 147.2800 },
        { id: '20006', name: 'Moonah', lat: -42.8500, lon: 147.3100 },
        { id: '20007', name: 'Kingston', lat: -42.9753, lon: 147.3049 },
        { id: '20008', name: 'New Town', lat: -42.8610, lon: 147.3150 },
        { id: '20009', name: 'Rosny Park', lat: -42.8750, lon: 147.3490 },
        { id: '20010', name: 'Bridgewater', lat: -42.7380, lon: 147.2360 },
        { id: '20011', name: 'Howrah', lat: -42.8810, lon: 147.3780 },
        // Launceston
        { id: '21001', name: 'Launceston CBD', lat: -41.4340, lon: 147.1380 },
        { id: '21002', name: 'St John St', lat: -41.4360, lon: 147.1370 },
        { id: '21003', name: 'Invermay', lat: -41.4200, lon: 147.1400 },
        { id: '21004', name: 'Mowbray', lat: -41.4100, lon: 147.1400 },
        // Burnie/Devonport
        { id: '22001', name: 'Burnie CBD', lat: -41.0564, lon: 145.9069 },
        { id: '23001', name: 'Devonport', lat: -41.1800, lon: 146.3529 }
      ]
    }
  },

  // ========== AUSTRALIAN CAPITAL TERRITORY (ACT) ==========
  // Data: Transport Canberra / ACT Open Data — CC BY 4.0
  ACT: {
    name: 'Australian Capital Territory',
    authority: 'Transport Canberra',
    modes: {
      lightrail: [
        // Canberra Light Rail (Stage 1 & 2)
        { id: '3000001', name: 'Alinga Street', lat: -35.2781, lon: 149.1309 },
        { id: '3000002', name: 'City West', lat: -35.2792, lon: 149.1275 },
        { id: '3000003', name: 'City South', lat: -35.2810, lon: 149.1295 },
        { id: '3000004', name: 'Macarthur Ave', lat: -35.2625, lon: 149.1342 },
        { id: '3000005', name: 'Ipima St', lat: -35.2690, lon: 149.1323 },
        { id: '3000006', name: 'Elouera St', lat: -35.2740, lon: 149.1316 },
        { id: '3000007', name: 'Swinden', lat: -35.2550, lon: 149.1376 },
        { id: '3000008', name: 'Dickson', lat: -35.2505, lon: 149.1387 },
        { id: '3000009', name: 'Mitchell', lat: -35.2145, lon: 149.1305 },
        { id: '3000010', name: 'Well Station', lat: -35.2035, lon: 149.1320 },
        { id: '3000011', name: 'Franklin', lat: -35.1960, lon: 149.1328 },
        { id: '3000015', name: 'Gungahlin Place', lat: -35.1836, lon: 149.1329 },
        // Stage 2 (planned/under construction)
        { id: '3000020', name: 'Commonwealth Park', lat: -35.2930, lon: 149.1315 },
        { id: '3000021', name: 'Woden', lat: -35.3439, lon: 149.0866 }
      ],
      bus: [
        { id: '3100001', name: 'City Bus Station', lat: -35.2789, lon: 149.1303 },
        { id: '3100002', name: 'Civic', lat: -35.2780, lon: 149.1300 },
        { id: '3100050', name: 'Woden Bus Station', lat: -35.3439, lon: 149.0866 },
        { id: '3100051', name: 'Belconnen Community', lat: -35.2389, lon: 149.0667 },
        { id: '3100052', name: 'Tuggeranong Bus Station', lat: -35.4147, lon: 149.0658 },
        { id: '3100053', name: 'Dickson Bus', lat: -35.2505, lon: 149.1387 },
        { id: '3100054', name: 'Fyshwick', lat: -35.3210, lon: 149.1740 },
        { id: '3100055', name: 'Gungahlin Bus', lat: -35.1836, lon: 149.1329 },
        { id: '3100056', name: 'Barton', lat: -35.3095, lon: 149.1387 },
        { id: '3100057', name: 'Manuka', lat: -35.3170, lon: 149.1365 }
      ]
    }
  },

  // ========== NORTHERN TERRITORY (NT) ==========
  // Data: NT Government public transit information
  NT: {
    name: 'Northern Territory',
    authority: 'NT Public Transport',
    modes: {
      bus: [
        // Darwin
        { id: '4000001', name: 'Darwin City', lat: -12.4634, lon: 130.8456 },
        { id: '4000002', name: 'Mitchell St', lat: -12.4625, lon: 130.8412 },
        { id: '4000003', name: 'Smith St Mall', lat: -12.4636, lon: 130.8419 },
        { id: '4000004', name: 'Casuarina', lat: -12.3760, lon: 130.8760 },
        { id: '4000005', name: 'Palmerston', lat: -12.4867, lon: 130.9828 },
        { id: '4000006', name: 'Stuart Park', lat: -12.4440, lon: 130.8350 },
        { id: '4000007', name: 'Nightcliff', lat: -12.3900, lon: 130.8480 },
        { id: '4000008', name: 'Fannie Bay', lat: -12.4355, lon: 130.8330 },
        { id: '4000009', name: 'Rapid Creek', lat: -12.3830, lon: 130.8560 },
        // Alice Springs
        { id: '4100001', name: 'Alice Springs', lat: -23.6980, lon: 133.8807 },
        { id: '4100002', name: 'Todd Mall', lat: -23.6993, lon: 133.8810 }
      ]
    }
  }
};

/**
 * Get fallback stops for a specific state
 * @param {string} stateCode - State code (VIC, NSW, QLD, etc.)
 * @returns {object} State transit data with stops
 */
export function getFallbackStops(stateCode) {
  return FALLBACK_STOPS[stateCode.toUpperCase()] || null;
}

/**
 * Get all stops for a specific mode in a state
 * @param {string} stateCode - State code
 * @param {string} mode - Transport mode (train, tram, bus, etc.)
 * @returns {array} Array of stop objects
 */
export function getStopsByMode(stateCode, mode) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData || !stateData.modes[mode]) {
    return [];
  }
  return stateData.modes[mode];
}

/**
 * Search for stops by name across all modes
 * @param {string} stateCode - State code
 * @param {string} query - Search query
 * @returns {array} Matching stops with mode information
 */
export function searchStops(stateCode, query) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData) {
    return [];
  }

  const results = [];
  const queryLower = query.toLowerCase();

  for (const [mode, stops] of Object.entries(stateData.modes)) {
    for (const stop of stops) {
      if (stop.name.toLowerCase().includes(queryLower)) {
        results.push({
          ...stop,
          mode: mode,
          modeLabel: mode.charAt(0).toUpperCase() + mode.slice(1)
        });
      }
    }
  }

  return results;
}

/**
 * Find nearest stop to coordinates
 * @param {string} stateCode - State code
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} mode - Optional: filter by transport mode
 * @returns {object} Nearest stop with distance
 */
export function findNearestStop(stateCode, lat, lon, mode = null) {
  const stateData = getFallbackStops(stateCode);
  if (!stateData) {
    return null;
  }

  let nearest = null;
  let minDistance = Infinity;

  const modesToSearch = mode ? [mode] : Object.keys(stateData.modes);

  for (const searchMode of modesToSearch) {
    const stops = stateData.modes[searchMode] || [];
    for (const stop of stops) {
      const distance = haversine(lat, lon, stop.lat, stop.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = {
          ...stop,
          mode: searchMode,
          modeLabel: searchMode.charAt(0).toUpperCase() + searchMode.slice(1),
          distance: Math.round(distance)
        };
      }
    }
  }

  return nearest;
}

/**
 * Get all stops for a state (across all modes)
 * @param {string} state State code (e.g., 'VIC')
 * @returns {array} Array of all stops with coordinates and route_type
 */
export function getAllStops(state) {
  const stateData = FALLBACK_STOPS[state?.toUpperCase()];
  if (!stateData) {
    return [];
  }

  const allStops = [];

  // Mode to route_type mapping (GTFS standard)
  const modeToRouteType = {
    'train': 0,
    'tram': 1,
    'bus': 2,
    'vline': 3,
    'ferry': 4,
    'lightrail': 0  // Light rail treated as train for priority
  };

  // Iterate through all modes - data structure is modes: { train: [...], tram: [...], ... }
  for (const [modeKey, stops] of Object.entries(stateData.modes)) {
    // Get route type from mode key
    const routeType = modeToRouteType[modeKey] ?? 2; // Default to bus (2) if unknown

    // Stops are directly in the array, not nested
    if (Array.isArray(stops)) {
      stops.forEach(stop => {
        allStops.push({
          ...stop,
          route_type: routeType,
          mode: modeKey
        });
      });
    }
  }

  return allStops;
}

/**
 * Alias for getAllStops - used by journey planner
 * @param {string} state State code (e.g., 'VIC')
 * @returns {array} Array of all stops with coordinates
 */
export function getStopsForState(state) {
  return getAllStops(state);
}

/**
 * Get all available states with transit data
 * @returns {array} Array of state objects
 */
export function getAllStates() {
  return Object.entries(FALLBACK_STOPS).map(([code, data]) => ({
    code,
    name: data.name,
    authority: data.authority,
    modes: Object.keys(data.modes)
  }));
}

export default {
  getFallbackStops,
  getStopsByMode,
  searchStops,
  findNearestStop,
  getAllStops,
  getStopsForState,
  getAllStates,
  FALLBACK_STOPS
};
