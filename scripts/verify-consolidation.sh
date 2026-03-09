#!/bin/bash
# verify-consolidation.sh — Verify endpoint consolidation integrity
#
# Checks that:
# 1. All modified files pass node --check
# 2. No duplicate getMelbourneTime/formatTime/formatDateParts/fetchWithRetry
#    definitions remain in fullscreen.js or livedash.js
# 3. All imports in modified files resolve to existing modules
# 4. Shared config-token.js decodes all required fields
# 5. No local decodeConfigToken definitions remain in consolidated files
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

echo "============================================"
echo "Endpoint Consolidation Verification"
echo "============================================"
echo ""

# --- 1. Syntax checks ---
echo "--- 1. Syntax Checks ---"
for file in \
  api/fullscreen.js \
  api/livedash.js \
  "api/device/[token].js" \
  src/utils/config-token.js; do
  if node --check "$file" 2>/dev/null; then
    pass "$file syntax OK"
  else
    fail "$file syntax ERROR"
  fi
done
echo ""

# --- 2. No duplicate utility function definitions ---
echo "--- 2. Duplicate Utility Function Check ---"
DUPLICATE_FUNCS="getMelbourneTime|formatTime|formatDateParts|fetchWithRetry"
for file in api/fullscreen.js api/livedash.js; do
  FOUND=$(grep -cE "^function ($DUPLICATE_FUNCS)" "$file" 2>/dev/null || true)
  if [ "$FOUND" -gt 0 ]; then
    fail "$file still has $FOUND duplicate utility function definition(s)"
  else
    pass "$file has no duplicate utility function definitions"
  fi
done
echo ""

# --- 3. No local decodeConfigToken in consolidated files ---
echo "--- 3. Local decodeConfigToken Check ---"
for file in api/livedash.js "api/device/[token].js"; do
  # Check for function definition (not import)
  FOUND=$(grep -c "^function decodeConfigToken" "$file" 2>/dev/null || true)
  if [ "$FOUND" -gt 0 ]; then
    fail "$file still has local decodeConfigToken definition"
  else
    pass "$file uses shared decodeConfigToken (no local definition)"
  fi
done
echo ""

# --- 4. Import resolution check ---
echo "--- 4. Import Resolution ---"
# Check that imported modules exist
check_import() {
  local source_file="$1"
  local import_path="$2"
  local source_dir
  source_dir="$(dirname "$source_file")"

  # Resolve relative path
  local resolved
  resolved="$(cd "$source_dir" && realpath "$import_path" 2>/dev/null || echo "")"

  if [ -z "$resolved" ] || [ ! -f "$resolved" ]; then
    fail "$source_file imports '$import_path' but file not found"
  else
    pass "$source_file -> $import_path resolves OK"
  fi
}

# fullscreen.js imports
# Only imports @napi-rs/canvas (npm package, skip)
pass "api/fullscreen.js: @napi-rs/canvas (npm package, skip)"

# livedash.js imports
check_import "api/livedash.js" "../src/services/livedash.js"
check_import "api/livedash.js" "../src/data/kv-preferences.js"
check_import "api/livedash.js" "../src/utils/config-token.js"

# device/[token].js imports
check_import "api/device/[token].js" "../../src/services/livedash.js"
check_import "api/device/[token].js" "../../src/data/kv-preferences.js"
check_import "api/device/[token].js" "../../src/services/ccdash-renderer.js"
check_import "api/device/[token].js" "../../src/utils/config-token.js"
echo ""

# --- 5. Shared config-token.js field coverage ---
echo "--- 5. Config Token Field Coverage ---"
CONFIG_TOKEN="src/utils/config-token.js"
for field in "minified.t" "minified.c" "minified.cf" "minified.m" "minified.k" "minified.a" "minified.l" "minified.j" "minified.s"; do
  if grep -q "$field" "$CONFIG_TOKEN" 2>/dev/null; then
    pass "config-token.js decodes $field"
  else
    fail "config-token.js missing decode for $field"
  fi
done
echo ""

# --- 6. Unused imports in fullscreen.js ---
echo "--- 6. Unused Import Check (fullscreen.js) ---"
for module in opendata-client commute-compute ccdash-renderer preferences-manager kv-preferences time-format; do
  # Only match actual import statements, not comments
  if grep -E "^import .+$module" api/fullscreen.js 2>/dev/null | grep -qv "^[[:space:]]*//" ; then
    fail "api/fullscreen.js still imports unused module: $module"
  else
    pass "api/fullscreen.js does not import unused $module"
  fi
done
echo ""

# --- Summary ---
echo "============================================"
echo "RESULTS: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo "CONSOLIDATION VERIFICATION FAILED"
  exit 1
else
  echo "CONSOLIDATION VERIFICATION PASSED"
  exit 0
fi
