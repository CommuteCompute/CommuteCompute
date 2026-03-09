#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Angus Bergman
# Part of the Commute Compute System
#
# verify-zones.sh — Zone endpoint consolidation verification
# Checks syntax, shared module imports, duplicate elimination, and handler preservation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

echo "================================================"
echo "  Zone Endpoint Consolidation Verification"
echo "================================================"
echo ""

# ── 1. Syntax checks ──────────────────────────────
echo "1. Syntax Verification (node --check)"
echo "───────────────────────────────────────"

ZONE_FILES=(
  "api/zones.js"
  "api/zones-tiered.js"
  "api/zonedata.js"
  "api/zone/[id].js"
)

for f in "${ZONE_FILES[@]}"; do
  if node --check "$f" 2>/dev/null; then
    pass "$f passes node --check"
  else
    fail "$f FAILED node --check"
  fi
done
echo ""

# ── 2. Shared module imports ──────────────────────
echo "2. Shared Module Imports"
echo "───────────────────────────────────────"

# Check time-format.js imports
for f in "${ZONE_FILES[@]}"; do
  if grep -q "from.*src/utils/time-format.js" "$f"; then
    pass "$f imports from time-format.js"
  else
    fail "$f does NOT import from time-format.js"
  fi
done

# Check config-token.js import in zone/[id].js
if grep -q "from.*src/utils/config-token.js" "api/zone/[id].js"; then
  pass "api/zone/[id].js imports from config-token.js"
else
  warn "api/zone/[id].js does not import from config-token.js (may use local decodeConfigToken)"
fi
echo ""

# ── 3. Duplicate function elimination ─────────────
echo "3. Duplicate Function Elimination"
echo "───────────────────────────────────────"

ELIMINATED=0

# Check getMelbourneTime is NOT defined locally in any zone file
for f in "${ZONE_FILES[@]}"; do
  if grep -q "^function getMelbourneTime" "$f"; then
    fail "$f still has local getMelbourneTime()"
  else
    pass "$f: getMelbourneTime() eliminated (imported)"
    ELIMINATED=$((ELIMINATED + 1))
  fi
done

# Check formatDateParts is NOT defined locally in any zone file
for f in "${ZONE_FILES[@]}"; do
  if grep -q "^function formatDateParts" "$f"; then
    fail "$f still has local formatDateParts()"
  else
    pass "$f: formatDateParts() eliminated (imported)"
    ELIMINATED=$((ELIMINATED + 1))
  fi
done

# Check formatTime is NOT defined locally in zones-tiered.js and zone/[id].js
for f in "api/zones-tiered.js" "api/zone/[id].js"; do
  if grep -q "^function formatTime\b" "$f"; then
    fail "$f still has local formatTime()"
  else
    pass "$f: formatTime() eliminated (imported)"
    ELIMINATED=$((ELIMINATED + 1))
  fi
done

# Check formatTime12h is NOT defined locally in zones.js and zonedata.js
for f in "api/zones.js" "api/zonedata.js"; do
  if grep -q "^function formatTime12h" "$f"; then
    fail "$f still has local formatTime12h()"
  else
    pass "$f: formatTime12h() eliminated (imported)"
    ELIMINATED=$((ELIMINATED + 1))
  fi
done

# Check getAmPm is NOT defined locally in zones.js and zonedata.js
for f in "api/zones.js" "api/zonedata.js"; do
  if grep -q "^function getAmPm" "$f"; then
    fail "$f still has local getAmPm()"
  else
    pass "$f: getAmPm() eliminated (imported)"
    ELIMINATED=$((ELIMINATED + 1))
  fi
done

# Check decodeConfigToken is NOT defined locally in zone/[id].js (imported from config-token.js)
if grep -q "^function decodeConfigToken" "api/zone/[id].js"; then
  fail "api/zone/[id].js still has local decodeConfigToken()"
else
  pass "api/zone/[id].js: decodeConfigToken() eliminated (imported from config-token.js)"
  ELIMINATED=$((ELIMINATED + 1))
fi

echo ""
echo "  Total duplicate functions eliminated: $ELIMINATED"
echo ""

# ── 4. Handler function preservation ──────────────
echo "4. Handler Function Preservation"
echo "───────────────────────────────────────"

for f in "${ZONE_FILES[@]}"; do
  if grep -q "export default async function handler" "$f"; then
    pass "$f: handler function preserved"
  else
    fail "$f: handler function MISSING"
  fi
done
echo ""

# ── 5. Zone-specific function preservation ────────
echo "5. Zone-Specific Function Preservation"
echo "───────────────────────────────────────"

# zones.js specific functions
for fn in "buildLegTitle" "buildLegSubtitle" "buildJourneyLegs" "buildDemoData" "getEngine" "calculateTotalMinutes" "getStatusType"; do
  if grep -q "function $fn" "api/zones.js"; then
    pass "api/zones.js: $fn() preserved"
  else
    fail "api/zones.js: $fn() MISSING"
  fi
done

# zones-tiered.js specific functions
for fn in "buildLegTitle" "buildLegSubtitle" "buildJourneyLegs" "getEngine"; do
  if grep -q "function $fn" "api/zones-tiered.js"; then
    pass "api/zones-tiered.js: $fn() preserved"
  else
    fail "api/zones-tiered.js: $fn() MISSING"
  fi
done

# zonedata.js specific functions
for fn in "decodeConfigToken" "formatDepartTime" "formatCoffeeSubtitle" "buildJourneyLegs" "calculateTotalMinutes" "calculateLeaveInMinutes" "formatDisplayAddress"; do
  if grep -q "function $fn" "api/zonedata.js"; then
    pass "api/zonedata.js: $fn() preserved"
  else
    fail "api/zonedata.js: $fn() MISSING"
  fi
done

# zone/[id].js specific functions
for fn in "generateETag" "renderEmptyZone" "renderDividerZone" "getEngine" "buildLegTitle" "buildLegSubtitle" "buildJourneyLegs" "buildDemoData"; do
  if grep -q "function $fn" "api/zone/[id].js"; then
    pass "api/zone/[id].js: $fn() preserved"
  else
    fail "api/zone/[id].js: $fn() MISSING"
  fi
done

# zone/[id].js COMPOSITE_ZONES constant
if grep -q "COMPOSITE_ZONES" "api/zone/[id].js"; then
  pass "api/zone/[id].js: COMPOSITE_ZONES constant preserved"
else
  fail "api/zone/[id].js: COMPOSITE_ZONES constant MISSING"
fi
echo ""

# ── 6. TODO comments for future consolidation ─────
echo "6. TODO Comments for Future Consolidation"
echo "───────────────────────────────────────"

for f in "${ZONE_FILES[@]}"; do
  TODO_COUNT=$(grep -c "TODO: Consider importing" "$f" 2>/dev/null || echo "0")
  if [ "$TODO_COUNT" -gt 0 ]; then
    pass "$f: $TODO_COUNT TODO comment(s) for future consolidation"
  fi
done
echo ""

# ── 7. Compliance checks ──────────────────────────
echo "7. Compliance Checks"
echo "───────────────────────────────────────"

# No PTV API references
for f in "${ZONE_FILES[@]}"; do
  if grep -qi "PTV.API\|PTV_API_KEY\|PTV_DEV_ID\|PTV_USER_ID" "$f"; then
    fail "$f contains prohibited PTV API reference"
  else
    pass "$f: no PTV API references"
  fi
done

# Copyright headers
for f in "api/zones.js" "api/zones-tiered.js" "api/zonedata.js" "api/zone/[id].js"; do
  if grep -q "Copyright (c) 2026 Angus Bergman" "$f"; then
    pass "$f: copyright header present"
  else
    fail "$f: copyright header MISSING"
  fi
done
echo ""

# ── Summary ───────────────────────────────────────
echo "================================================"
echo "  RESULTS"
echo "================================================"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  WARN: $WARN"
echo "  Duplicate functions eliminated: $ELIMINATED"
echo "================================================"

if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: FAILED ($FAIL failures)"
  exit 1
else
  echo "  STATUS: ALL CHECKS PASSED"
  exit 0
fi
