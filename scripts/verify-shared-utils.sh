#!/usr/bin/env bash
# verify-shared-utils.sh — Shared Utility Module Verification
#
# Verifies that shared utility modules exist, export expected functions,
# and that no endpoint file retains local copies of shared functions.
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

PASS=0
FAIL=0
WARN=0

pass() { ((PASS++)); echo "  [PASS] $1"; }
fail() { ((FAIL++)); echo "  [FAIL] $1"; }
warn() { ((WARN++)); echo "  [WARN] $1"; }

echo "============================================"
echo "Shared Utility Module Verification"
echo "============================================"
echo ""

# ── 1. Verify shared utility files exist ──
echo "1. Shared Utility Files Exist"
echo "--------------------------------------------"

UTIL_DIR="src/utils"
declare -a SHARED_FILES=(
  "$UTIL_DIR/time-format.js"
  "$UTIL_DIR/fetch-retry.js"
  "$UTIL_DIR/suburb-extract.js"
  "$UTIL_DIR/config-token.js"
)

for f in "${SHARED_FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done

echo ""

# ── 2. Verify exported functions in each utility file ──
echo "2. Exported Functions Present"
echo "--------------------------------------------"

# time-format.js exports
declare -a TIME_EXPORTS=(
  "STATE_TIMEZONES"
  "getMelbourneTime"
  "getMelbourneDisplayTime"
  "formatTime"
  "formatDateParts"
  "formatTime12h"
  "getAmPm"
)

for fn in "${TIME_EXPORTS[@]}"; do
  if grep -q "export.*$fn" "$UTIL_DIR/time-format.js" 2>/dev/null; then
    pass "time-format.js exports $fn"
  else
    fail "time-format.js missing export: $fn"
  fi
done

# fetch-retry.js exports
if grep -q "export.*fetchWithRetry" "$UTIL_DIR/fetch-retry.js" 2>/dev/null; then
  pass "fetch-retry.js exports fetchWithRetry"
else
  fail "fetch-retry.js missing export: fetchWithRetry"
fi

# suburb-extract.js exports
if grep -q "export.*extractSuburb" "$UTIL_DIR/suburb-extract.js" 2>/dev/null; then
  pass "suburb-extract.js exports extractSuburb"
else
  fail "suburb-extract.js missing export: extractSuburb"
fi

# config-token.js exports
declare -a TOKEN_EXPORTS=(
  "encodeConfigToken"
  "decodeConfigToken"
  "generateWebhookUrl"
)

for fn in "${TOKEN_EXPORTS[@]}"; do
  if grep -q "export.*$fn" "$UTIL_DIR/config-token.js" 2>/dev/null; then
    pass "config-token.js exports $fn"
  else
    fail "config-token.js missing export: $fn"
  fi
done

echo ""

# ── 3. Verify no endpoint file has local copies of shared functions ──
echo "3. No Local Duplicate Functions in Endpoints"
echo "--------------------------------------------"

# Endpoint files to check (NOT commutecompute.js — separate agent)
declare -a ENDPOINTS=(
  "api/fullscreen.js"
  "api/livedash.js"
  "api/zones.js"
  "api/zones-tiered.js"
  "api/zonedata.js"
  "api/zone/[id].js"
)

# Functions that should NOT be locally defined in endpoints
# (they should be imported from shared modules)
declare -a SHARED_TIME_FNS=(
  "getMelbourneTime"
  "getMelbourneDisplayTime"
  "formatDateParts"
)

for endpoint in "${ENDPOINTS[@]}"; do
  if [ ! -f "$endpoint" ]; then
    warn "$endpoint not found — skipping"
    continue
  fi

  for fn in "${SHARED_TIME_FNS[@]}"; do
    # Check for local function definition (not import)
    if grep -qE "^function $fn\b|^  function $fn\b|^const $fn\b" "$endpoint" 2>/dev/null; then
      fail "$endpoint has local definition of $fn (should import from shared module)"
    else
      pass "$endpoint: no local $fn"
    fi
  done
done

echo ""

# ── 4. Verify imports from shared modules ──
echo "4. Shared Module Imports Present"
echo "--------------------------------------------"

# Check that endpoints that use time functions import from shared module
declare -a TIME_USERS=(
  "api/zones.js"
  "api/zones-tiered.js"
  "api/zonedata.js"
  "api/zone/[id].js"
)

for endpoint in "${TIME_USERS[@]}"; do
  if [ ! -f "$endpoint" ]; then
    warn "$endpoint not found — skipping"
    continue
  fi

  if grep -q "from.*utils/time-format" "$endpoint" 2>/dev/null; then
    pass "$endpoint imports from time-format.js"
  else
    fail "$endpoint missing import from time-format.js"
  fi
done

# Check livedash.js imports config-token
if grep -q "from.*utils/config-token" "api/livedash.js" 2>/dev/null; then
  pass "api/livedash.js imports from config-token.js"
else
  fail "api/livedash.js missing import from config-token.js"
fi

# Check zone/[id].js imports config-token
if grep -q "from.*utils/config-token" "api/zone/[id].js" 2>/dev/null; then
  pass "api/zone/[id].js imports from config-token.js"
else
  fail "api/zone/[id].js missing import from config-token.js"
fi

echo ""

# ── 5. Syntax verification ──
echo "5. Syntax Verification (node --check)"
echo "--------------------------------------------"

for f in "${SHARED_FILES[@]}"; do
  if [ -f "$f" ] && node --check "$f" 2>/dev/null; then
    pass "$f syntax OK"
  elif [ -f "$f" ]; then
    fail "$f syntax error"
  fi
done

for endpoint in "${ENDPOINTS[@]}"; do
  if [ -f "$endpoint" ] && node --check "$endpoint" 2>/dev/null; then
    pass "$endpoint syntax OK"
  elif [ -f "$endpoint" ]; then
    fail "$endpoint syntax error"
  fi
done

echo ""

# ── 6. Deduplication Line Count ──
echo "6. Deduplication Summary"
echo "--------------------------------------------"

TOTAL_SHARED=0
for f in "${SHARED_FILES[@]}"; do
  if [ -f "$f" ]; then
    lines=$(wc -l < "$f" | tr -d ' ')
    TOTAL_SHARED=$((TOTAL_SHARED + lines))
    echo "  $f: $lines lines"
  fi
done
echo "  Total shared utility lines: $TOTAL_SHARED"

# Count lines saved: approximate based on duplicate function definitions removed
# Each endpoint that previously had local copies of time functions saved ~15-30 lines
LINES_SAVED=0
echo ""
echo "  Estimated lines saved by deduplication:"
echo "    fullscreen.js: ~20 lines (getMelbourneTime, formatTime, formatDateParts removed)"
echo "    zones.js: ~35 lines (getMelbourneTime, formatTime12h, getAmPm, formatDateParts removed)"
echo "    zones-tiered.js: ~20 lines (getMelbourneTime, formatTime, formatDateParts removed)"
echo "    zonedata.js: ~20 lines (getMelbourneTime, formatTime12h, getAmPm, formatDateParts removed)"
echo "    zone/[id].js: ~35 lines (getMelbourneTime, formatTime, formatDateParts, decodeConfigToken removed)"
echo "    livedash.js: ~10 lines (decodeConfigToken removed)"
LINES_SAVED=$((20 + 35 + 20 + 20 + 35 + 10))
echo "  Total estimated lines saved: ~$LINES_SAVED"
echo "  Net deduplication: ~$LINES_SAVED lines removed from endpoints, $TOTAL_SHARED lines in shared modules"

echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo ""
echo "All checks passed."
exit 0
