/**
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */


// gtfs-static.js
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

const GTFS_ZIP = path.resolve("data/gtfs/gtfs.zip");

export function tryLoadStops() {
  try {
    if (!fs.existsSync(GTFS_ZIP)) return { stops: [], platformsByParent: new Map(), stopsByName: new Map() };
    const zip = new AdmZip(GTFS_ZIP);
    const entry = zip.getEntry("stops.txt");
    if (!entry) return { stops: [], platformsByParent: new Map(), stopsByName: new Map() };

    const content = entry.getData().toString("utf8");
    const rows = parse(content, { columns: true, skip_empty_lines: true });

    const platformsByParent = new Map();
    const stopsByName = new Map();

    for (const r of rows) {
      // Normalize whitespace in names for matching
      const nm = (r.stop_name || "").trim();
      if (nm) stopsByName.set(nm.toLowerCase(), r);
      if (r.parent_station) {
        if (!platformsByParent.has(r.parent_station)) platformsByParent.set(r.parent_station, []);
        platformsByParent.get(r.parent_station).push(r);
      }
    }

    return { stops: rows, platformsByParent, stopsByName };
  } catch (e) {
    // GTFS static load failed silently
    return { stops: [], platformsByParent: new Map(), stopsByName: new Map() };
  }
}

/**
 * Resolve user's origin station parent + preferred platform stop_id list using stops.txt
 * Station name should be configured via admin panel Journey Planner
 */
export function resolveOriginStationIds(cfg, gtfs) {
  const preferredPlatformCode = cfg?.stations?.origin?.preferredPlatformCode || null;
  const stationName = cfg?.stations?.origin?.name || null;
  let parentStopId = cfg?.stations?.origin?.parentStopId || null;

  // If parentStopId not configured, look up by station name (no parent)
  if (!parentStopId && stationName && gtfs?.stops?.length) {
    const station = gtfs.stops.find(s =>
      (s.stop_name || "").toLowerCase() === stationName.toLowerCase() && !s.parent_station
    );
    parentStopId = station?.stop_id || null;
  }

  const platforms = parentStopId ? (gtfs.platformsByParent.get(parentStopId) || []) : [];
  const preferredPlatform = preferredPlatformCode
    ? platforms.find(p => (p.platform_code || "").trim() === preferredPlatformCode)
    : null;

  return {
    parentStopId,
    preferredPlatformStopId: preferredPlatform?.stop_id || null,
    allPlatformStopIds: platforms.map(p => p.stop_id)
  };
}

// Alias for backward compatibility
export const resolveSouthYarraIds = resolveOriginStationIds;

/** Build a set of stop_ids representing CBD targets (names → ids) */
export function buildTargetStopIdSet(gtfs, names = []) {
  const set = new Set();
  if (!gtfs?.stops?.length || !names?.length) return set;

  // 1) Try exact station name matches, include all their child platforms
  for (const want of names) {
    const key = (want || "").toLowerCase().trim();
    if (!key) continue;

    // Find station records (no parent) matching the name
    const stations = gtfs.stops.filter(s => !s.parent_station && (s.stop_name || "").toLowerCase() === key);

    for (const st of stations) {
      set.add(st.stop_id);
      const children = gtfs.platformsByParent.get(st.stop_id) || [];
      for (const ch of children) set.add(ch.stop_id);
    }

    // 2) As a fallback, add any stop whose name equals the desired name directly
    const direct = gtfs.stops.filter(s => (s.stop_name || "").toLowerCase() === key);
    for (const s of direct) set.add(s.stop_id);
  }

  return set;
}
