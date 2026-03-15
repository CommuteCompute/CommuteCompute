/**
 * /api/test-live-data - Runtime diagnostic endpoint for live data pipeline
 *
 * Tests every step of the GTFS-RT pipeline independently and returns results as JSON.
 * Auth-protected. API key is masked in output.
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { getTransitApiKey, getPreferences, getKvEnvStatus, getClient } from '../src/data/kv-preferences.js';
import { getDepartures } from '../src/services/opendata-client.js';
import { detectStopIdsFromAddress, getStopNameById } from '../src/data/gtfs-stop-names.js';
import { requireAuth, setAdminCorsHeaders } from '../src/utils/auth-middleware.js';

export default async function handler(req, res) {
  setAdminCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authError = requireAuth(req);
  if (authError) return res.status(401).json(authError);

  const results = { timestamp: new Date().toISOString(), steps: {} };

  // Step 0: Redis connectivity diagnostic
  const discoveredVarCount = Object.keys(process.env)
    .filter(k => /redis|kv|upstash|cckv/i.test(k))
    .length;
  const redisStep = { envVars: getKvEnvStatus(), discoveredEnvVarCount: discoveredVarCount, clientAvailable: false, writeReadTest: null };
  try {
    const client = await getClient();
    redisStep.clientAvailable = !!client;
    if (client) {
      const testKey = 'cc:diag:test';
      const testValue = { ts: Date.now(), probe: true };
      const writeOk = await client.set(testKey, testValue);
      const readBack = await client.get(testKey);
      await client.del(testKey);
      redisStep.writeReadTest = {
        writeResult: writeOk,
        readBackMatch: readBack?.ts === testValue.ts && readBack?.probe === true,
        readBackValue: readBack ? { ts: readBack.ts, probe: readBack.probe } : null
      };
    } else {
      redisStep.writeReadTest = { skipped: true, reason: 'No Redis client — check env vars' };
    }
  } catch (e) {
    redisStep.writeReadTest = { error: String(e.message || 'Unknown error').substring(0, 80) };
  }
  results.steps.redisConnectivity = redisStep;

  // Step 1: Read API key from Redis
  const transitApiKey = await getTransitApiKey();
  const apiKeyStr = typeof transitApiKey === 'string' ? transitApiKey : (transitApiKey?.apiKey || null);
  results.steps.apiKey = {
    exists: !!apiKeyStr,
    rawType: typeof transitApiKey,
    rawShape: transitApiKey === null ? 'null' : typeof transitApiKey === 'object' ? `object(keys:${Object.keys(transitApiKey).join(',')})` : `string(len:${String(transitApiKey).length})`,
    prefix: apiKeyStr ? apiKeyStr.substring(0, 4) + '...' : null
  };

  // Step 2: Read preferences (apiMode and stored data)
  const kvPrefs = await getPreferences();
  results.steps.preferences = {
    apiMode: kvPrefs?.apiMode ?? '(undefined — defaults to live)',
    apiModeRaw: kvPrefs?.apiMode,
    hasHomeAddress: !!kvPrefs?.addresses?.home,
    hasLocations: !!kvPrefs?.locations?.home,
    hasCoords: !!(kvPrefs?.locations?.home?.lat && kvPrefs?.locations?.home?.lon),
    storedTrainStopId: kvPrefs?.trainStopId || null,
    storedTramStopId: kvPrefs?.tramStopId || null,
    prefsKeyCount: kvPrefs ? Object.keys(kvPrefs).length : 0
  };

  // Step 3: Run stop detection
  const homeAddress = kvPrefs?.addresses?.home;
  const homeCoords = (kvPrefs?.locations?.home?.lat && kvPrefs?.locations?.home?.lon)
    ? { lat: kvPrefs.locations.home.lat, lon: kvPrefs.locations.home.lon }
    : null;
  const detected = detectStopIdsFromAddress(homeAddress, homeCoords);
  results.steps.stopDetection = {
    hasInputAddress: !!homeAddress,
    hasInputCoords: !!homeCoords,
    result: detected ? { trainStopId: detected.trainStopId, tramStopId: detected.tramStopId, busStopId: detected.busStopId, source: detected.source } : null,
    trainName: detected?.trainStopId ? getStopNameById(detected.trainStopId) : null,
    tramName: detected?.tramStopId ? getStopNameById(detected.tramStopId) : null
  };

  // Determine final stop IDs (same logic as commutecompute.js)
  let trainStopId = detected?.trainStopId || null;
  let tramStopId = detected?.tramStopId || null;
  if (!trainStopId) trainStopId = kvPrefs?.trainStopId || null;
  if (!tramStopId) tramStopId = kvPrefs?.tramStopId || null;

  results.steps.finalStopIds = {
    trainStopId,
    tramStopId,
    trainName: getStopNameById(trainStopId),
    tramName: getStopNameById(tramStopId),
    source: detected?.trainStopId ? detected.source : (kvPrefs?.trainStopId ? 'stored' : 'none')
  };

  // Step 4: Test GTFS-RT API calls
  const apiOptions = apiKeyStr ? { apiKey: apiKeyStr } : {};

  // 4a: Metro trip-updates
  try {
    const startMs = Date.now();
    const trains = await getDepartures(trainStopId, 0, apiOptions);
    const elapsedMs = Date.now() - startMs;
    results.steps.metroApi = {
      called: true,
      stopId: trainStopId,
      elapsedMs,
      resultCount: trains?.length || 0,
      feedEntities: trains?._feedInfo?.entityCount ?? 0,
      matchMethod: trains?._feedInfo?.matchMethod || 'none',
      queriedStopId: trains?._feedInfo?.queriedStopId || null,
      sampleStopIds: trains?._feedInfo?.sampleStopIds?.slice(0, 10) || [],
      sampleRouteIds: trains?._feedInfo?.sampleRouteIds?.slice(0, 5) || [],
      error: trains?._feedInfo?.error || null,
      departures: trains?.slice(0, 3)?.map(t => ({
        minutes: t.minutes,
        line: t.lineName,
        destination: t.destination,
        isLive: t.isLive,
        source: t.source,
        delay: t.delay
      })) || []
    };
  } catch (e) {
    results.steps.metroApi = { called: true, error: String(e.message || 'Unknown error').substring(0, 120) };
  }

  // 4b: Tram trip-updates
  try {
    const startMs = Date.now();
    const trams = await getDepartures(tramStopId, 1, apiOptions);
    const elapsedMs = Date.now() - startMs;
    results.steps.tramApi = {
      called: true,
      stopId: tramStopId,
      elapsedMs,
      resultCount: trams?.length || 0,
      feedEntities: trams?._feedInfo?.entityCount ?? 0,
      matchMethod: trams?._feedInfo?.matchMethod || 'none',
      queriedStopId: trams?._feedInfo?.queriedStopId || null,
      sampleStopIds: trams?._feedInfo?.sampleStopIds?.slice(0, 10) || [],
      error: trams?._feedInfo?.error || null,
      departures: trams?.slice(0, 3)?.map(t => ({
        minutes: t.minutes,
        route: t.routeNumber,
        destination: t.destination,
        isLive: t.isLive,
        source: t.source
      })) || []
    };
  } catch (e) {
    results.steps.tramApi = { called: true, error: String(e.message || 'Unknown error').substring(0, 120) };
  }

  // Summary — transit always live when key present (cafeMode is independent)
  const skipLiveData = !apiKeyStr;
  results.summary = {
    apiKeyPresent: !!apiKeyStr,
    cafeMode: kvPrefs?.apiMode || 'live (default)',
    skipLiveData,
    trainStopId,
    tramStopId,
    trainName: getStopNameById(trainStopId),
    tramName: getStopNameById(tramStopId),
    metroFeedEntities: results.steps.metroApi?.feedEntities || 0,
    tramFeedEntities: results.steps.tramApi?.feedEntities || 0,
    metroLiveResults: results.steps.metroApi?.resultCount || 0,
    tramLiveResults: results.steps.tramApi?.resultCount || 0,
    redisConnected: results.steps.redisConnectivity?.clientAvailable || false,
    redisWriteReadOk: results.steps.redisConnectivity?.writeReadTest?.readBackMatch || false,
    verdict: !results.steps.redisConnectivity?.clientAvailable
      ? 'REDIS NOT CONNECTED — check Redis env var configuration'
      : !results.steps.redisConnectivity?.writeReadTest?.readBackMatch
        ? 'REDIS CONNECTED BUT WRITE/READ FAILED'
      : !apiKeyStr ? 'NO API KEY IN REDIS (Redis works — key never saved or was cleared)'
      : (results.steps.metroApi?.feedEntities === 0 && results.steps.tramApi?.feedEntities === 0) ? 'API RETURNED EMPTY FEEDS — check key validity or API status'
      : (results.steps.metroApi?.error || results.steps.tramApi?.error) ? 'API ERRORS — see step details'
      : (results.steps.metroApi?.resultCount > 0 || results.steps.tramApi?.resultCount > 0) ? 'LIVE DATA AVAILABLE'
      : 'FEEDS HAVE DATA BUT NO MATCHES — stop ID mismatch'
  };

  return res.status(200).json(results);
}
