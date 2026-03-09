#!/usr/bin/env bash
# verify-merge.sh — Post-merge verification for screen.js → commutecompute.js unification
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

PASS=0
FAIL=0
WARN=0
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pass() { PASS=$((PASS + 1)); echo "  [PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  [FAIL] $1"; }
warn() { WARN=$((WARN + 1)); echo "  [WARN] $1"; }

echo "============================================"
echo "  Endpoint Merge Verification"
echo "  screen.js -> commutecompute.js"
echo "============================================"
echo ""

# ---- 1. File existence checks ----
echo "--- 1. File Existence ---"

if [ ! -f "$PROJECT_ROOT/api/screen.js" ]; then
  pass "api/screen.js is DELETED"
else
  fail "api/screen.js still exists -- must be deleted"
fi

if [ -f "$PROJECT_ROOT/api/commutecompute.js" ]; then
  pass "api/commutecompute.js EXISTS"
else
  fail "api/commutecompute.js is MISSING"
fi

# ---- 2. Line count check (must be > 2000) ----
echo ""
echo "--- 2. Line Count ---"

LINE_COUNT=$(wc -l < "$PROJECT_ROOT/api/commutecompute.js" | tr -d ' ')
if [ "$LINE_COUNT" -gt 2000 ]; then
  pass "api/commutecompute.js has $LINE_COUNT lines (> 2000)"
else
  fail "api/commutecompute.js has only $LINE_COUNT lines (expected > 2000)"
fi

# ---- 3. Key function presence ----
echo ""
echo "--- 3. Key Functions from screen.js ---"

FUNCTIONS=(
  "getMelbourneTime"
  "getMelbourneDisplayTime"
  "formatTime"
  "formatDateParts"
  "getEngine"
  "extractSuburb"
  "mergeConsecutiveWalkLegs"
  "buildJourneyLegs"
  "buildLegTitle"
  "buildLegSubtitle"
  "findMatchingDeparture"
  "calculateTotalMinutes"
  "getStatusType"
  "filterUnavailableTransitLegs"
  "generateRandomJourney"
  "handleDemoMode"
  "handleRandomJourney"
  "fetchWithRetry"
  "export default"
)

for fn in "${FUNCTIONS[@]}"; do
  if grep -q "$fn" "$PROJECT_ROOT/api/commutecompute.js"; then
    pass "Function/export present: $fn"
  else
    fail "Function/export MISSING: $fn"
  fi
done

# ---- 4. AltTransit fix applied ----
echo ""
echo "--- 4. AltTransit Fix (allTransitCancelled) ---"

if grep -q "allTransitCancelled" "$PROJECT_ROOT/api/commutecompute.js"; then
  pass "allTransitCancelled variable present"
else
  fail "allTransitCancelled variable MISSING -- AltTransit fix not applied"
fi

if grep -q "hasDisruptedTransit" "$PROJECT_ROOT/api/commutecompute.js"; then
  fail "hasDisruptedTransit still present -- should have been removed"
else
  pass "hasDisruptedTransit removed"
fi

if grep -q "cannotArriveOnTime" "$PROJECT_ROOT/api/commutecompute.js"; then
  fail "cannotArriveOnTime still present -- should have been removed"
else
  pass "cannotArriveOnTime removed"
fi

# ---- 5. Walk merge name resolution (D4) ----
echo ""
echo "--- 5. Walk Merge Name Resolution (resolvedDest) ---"

if grep -q "resolvedDest" "$PROJECT_ROOT/api/commutecompute.js"; then
  pass "resolvedDest variable present in walk merge"
else
  fail "resolvedDest variable MISSING -- walk merge name fix not applied"
fi

# ---- 6. Timetable fallback sanity cap (D6) ----
echo ""
echo "--- 6. Timetable Fallback Sanity Cap ---"

if grep -q "Math.min(cumulativeMinutes.*180)" "$PROJECT_ROOT/api/commutecompute.js"; then
  pass "Timetable fallback capped at 180 minutes"
else
  fail "Timetable fallback sanity cap (Math.min 180) MISSING"
fi

# ---- 7. Format detection (admin backward compat) ----
echo ""
echo "--- 7. Format Detection ---"

if grep -q "req.method === 'POST'" "$PROJECT_ROOT/api/commutecompute.js"; then
  pass "POST method detection for admin JSON default"
else
  fail "POST method detection MISSING -- admin panel backward compat broken"
fi

# ---- 8. vercel.json checks ----
echo ""
echo "--- 8. vercel.json Configuration ---"

if grep -q '"api/commutecompute.js"' "$PROJECT_ROOT/vercel.json"; then
  pass "vercel.json has api/commutecompute.js function entry"
else
  fail "vercel.json MISSING api/commutecompute.js function entry"
fi

if grep -q '"api/screen.js"' "$PROJECT_ROOT/vercel.json"; then
  fail "vercel.json still has api/screen.js function entry"
else
  pass "vercel.json api/screen.js function entry removed"
fi

# Check the rewrite rule for backward compat
if grep -A1 '"/api/screen"' "$PROJECT_ROOT/vercel.json" | grep -q '"/api/commutecompute"'; then
  pass "vercel.json rewrite: /api/screen -> /api/commutecompute"
else
  fail "vercel.json rewrite for /api/screen backward compat MISSING or incorrect"
fi

# ---- 9. No import from screen.js in source code ----
echo ""
echo "--- 9. No Stale screen.js Imports ---"

STALE_IMPORTS=$(grep -rl "import.*from.*['\"].*screen" "$PROJECT_ROOT/api/" "$PROJECT_ROOT/src/" 2>/dev/null | grep -v node_modules || true)
if [ -z "$STALE_IMPORTS" ]; then
  pass "No import statements referencing screen.js in api/ or src/"
else
  fail "Stale screen.js imports found in: $STALE_IMPORTS"
fi

# ---- 10. Header check ----
echo ""
echo "--- 10. File Header ---"

if head -3 "$PROJECT_ROOT/api/commutecompute.js" | grep -q "Unified Dashboard Endpoint"; then
  pass "New unified header present"
else
  fail "Unified header MISSING"
fi

if head -16 "$PROJECT_ROOT/api/commutecompute.js" | grep -q "AGPL-3.0-or-later"; then
  pass "AGPL-3.0 licence identifier present"
else
  fail "AGPL-3.0 licence identifier MISSING"
fi

if head -16 "$PROJECT_ROOT/api/commutecompute.js" | grep -q "Copyright (c) 2026 Angus Bergman"; then
  pass "Copyright notice present"
else
  fail "Copyright notice MISSING"
fi

# ---- 11. Key features preserved ----
echo ""
echo "--- 11. Key Features Preserved ---"

FEATURES=(
  "renderFullDashboard"
  "renderFullScreenBMP"
  "DepartureConfidence"
  "LifestyleContext"
  "SleepOptimiser"
  "AltTransit"
  "getDisruptions"
  "getWeather"
  "METRO_LINE_NAMES"
  "isTimetableEstimate"
  "isLive"
  "fetchWithRetry"
  "maxDuration"
  "getMelbourneDisplayTime"
  "hourCycle.*h23"
)

for feat in "${FEATURES[@]}"; do
  if grep -q "$feat" "$PROJECT_ROOT/api/commutecompute.js"; then
    pass "Feature present: $feat"
  else
    fail "Feature MISSING: $feat"
  fi
done

# ---- 12. Syntax check ----
echo ""
echo "--- 12. Syntax Check ---"

if node --check "$PROJECT_ROOT/api/commutecompute.js" 2>/dev/null; then
  pass "Node.js syntax check passed"
else
  fail "Node.js syntax check FAILED"
fi

# ---- Summary ----
echo ""
echo "============================================"
TOTAL=$((PASS + FAIL))
echo "  RESULTS: $PASS/$TOTAL passed, $FAIL failed, $WARN warnings"
if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: VERIFICATION FAILED"
  exit 1
else
  echo "  STATUS: ALL CHECKS PASSED"
  exit 0
fi
