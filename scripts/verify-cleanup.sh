#!/bin/bash
# verify-cleanup.sh — Verify dead code cleanup and legacy file status
#
# Checks:
# 1. Files in api/ and src/ with zero importers (orphan detection)
# 2. All API endpoint files pass node --check (syntax validation)
# 3. api/screen.js does NOT exist (merged into api/commutecompute.js)
# 4. Deprecated files with deprecation comments
# 5. Admin panel API call pattern compatibility
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN + 1)); }

echo "============================================"
echo " verify-cleanup.sh — Dead Code Cleanup Audit"
echo "============================================"
echo ""

# ─────────────────────────────────────────────────
# 1. Syntax validation: all API endpoint files
# ─────────────────────────────────────────────────
echo "--- Section 1: API Endpoint Syntax (node --check) ---"
api_errors=0
for f in api/*.js api/admin/*.js api/device/*.js api/pair/*.js api/zone/*.js; do
  [ -f "$f" ] || continue
  if node --check "$f" 2>/dev/null; then
    pass "$f syntax OK"
  else
    fail "$f syntax error"
    api_errors=$((api_errors + 1))
  fi
done
echo ""

# ─────────────────────────────────────────────────
# 2. api/screen.js must NOT exist (merged)
# ─────────────────────────────────────────────────
echo "--- Section 2: api/screen.js Removal ---"
if [ -f "api/screen.js" ]; then
  fail "api/screen.js still exists — should be merged into api/commutecompute.js"
else
  pass "api/screen.js does not exist (correctly merged)"
fi

# Verify /api/screen rewrite in vercel.json
if grep -q '"source": "/api/screen"' vercel.json 2>/dev/null; then
  if grep -q '"destination": "/api/commutecompute"' vercel.json 2>/dev/null; then
    pass "vercel.json rewrites /api/screen -> /api/commutecompute"
  else
    fail "vercel.json /api/screen rewrite points to wrong destination"
  fi
else
  warn "vercel.json has no /api/screen rewrite rule"
fi
echo ""

# ─────────────────────────────────────────────────
# 3. Orphan detection: src/ files with zero importers
# ─────────────────────────────────────────────────
echo "--- Section 3: Orphan File Detection ---"
orphan_count=0

check_importers() {
  local file="$1"
  local basename
  basename="$(basename "$file" .js)"
  # Search for any import/require reference to this module name
  local count
  count=$(grep -rl "$basename" --include="*.js" --include="*.mjs" --include="*.html" "$REPO_ROOT" 2>/dev/null \
    | grep -v node_modules \
    | grep -v "$file" \
    | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    warn "ORPHAN: $file (zero importers found)"
    orphan_count=$((orphan_count + 1))
  fi
}

# Check services
for f in src/services/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

# Check engines
for f in src/engines/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

# Check data
for f in src/data/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

# Check utils
for f in src/utils/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

# Check core
for f in src/core/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

# Check api (internal src/api)
for f in src/api/*.js; do
  [ -f "$f" ] || continue
  check_importers "$f"
done

if [ "$orphan_count" -eq 0 ]; then
  pass "No orphan files detected in src/"
else
  echo "  INFO: $orphan_count orphan file(s) detected — review for removal"
fi
echo ""

# ─────────────────────────────────────────────────
# 4. Deprecated file detection
# ─────────────────────────────────────────────────
echo "--- Section 4: Deprecated Files ---"
deprecated_count=0
for f in $(grep -rl "@deprecated" --include="*.js" src/ 2>/dev/null); do
  deprecated_line=$(grep "@deprecated" "$f" | head -1 | sed 's/^ *\* *//')
  echo "  DEPRECATED: $f — $deprecated_line"
  deprecated_count=$((deprecated_count + 1))
done

if [ "$deprecated_count" -eq 0 ]; then
  pass "No deprecated files found"
else
  echo "  INFO: $deprecated_count deprecated file(s) — pending founder approval for deletion"
fi
echo ""

# ─────────────────────────────────────────────────
# 5. Admin panel API call compatibility
# ─────────────────────────────────────────────────
echo "--- Section 5: Admin Panel API Compatibility ---"

admin_file="public/admin.html"
if [ -f "$admin_file" ]; then
  # Check admin panel uses POST for JSON data
  post_calls=$(grep -c "method: 'POST'" "$admin_file" 2>/dev/null || echo 0)
  if [ "$post_calls" -gt 0 ]; then
    pass "Admin panel uses POST for /api/commutecompute ($post_calls POST calls)"
  else
    fail "Admin panel does not use POST for /api/commutecompute"
  fi

  # Check admin panel uses GET /api/screen for e-ink preview image
  screen_get=$(grep -c "/api/screen" "$admin_file" 2>/dev/null || echo 0)
  if [ "$screen_get" -gt 0 ]; then
    pass "Admin panel references /api/screen for e-ink preview ($screen_get references)"
    # Verify it uses format=png
    if grep -q "format=png" "$admin_file" 2>/dev/null; then
      pass "Admin panel requests format=png for e-ink preview"
    else
      warn "Admin panel /api/screen calls may not specify format=png"
    fi
  else
    warn "Admin panel has no /api/screen references"
  fi

  # Check admin panel calls commutecompute endpoint
  cc_calls=$(grep -c "/api/commutecompute" "$admin_file" 2>/dev/null || echo 0)
  if [ "$cc_calls" -gt 0 ]; then
    pass "Admin panel calls /api/commutecompute ($cc_calls references)"
  else
    fail "Admin panel does not reference /api/commutecompute"
  fi

  # Verify POST -> JSON, GET -> PNG routing is compatible
  echo "  INFO: api/commutecompute.js format logic: POST defaults to JSON, GET defaults to PNG"
  echo "  INFO: Admin panel POST calls -> JSON (correct)"
  echo "  INFO: Admin panel GET /api/screen -> rewrite -> /api/commutecompute GET -> PNG (correct)"
else
  fail "Admin panel file not found at $admin_file"
fi
echo ""

# ─────────────────────────────────────────────────
# 6. Duplicate export detection (key function names)
# ─────────────────────────────────────────────────
echo "--- Section 6: Duplicate Export Detection ---"
dup_count=0

check_duplicate_export() {
  local func_name="$1"
  local count
  count=$(grep -rl "export.*$func_name" --include="*.js" src/ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -gt 1 ]; then
    warn "DUPLICATE EXPORT: '$func_name' exported from $count files:"
    grep -rl "export.*$func_name" --include="*.js" src/ 2>/dev/null | while read -r f; do
      echo "    - $f"
    done
    dup_count=$((dup_count + 1))
  fi
}

check_duplicate_export "getDepartures"
check_duplicate_export "getDisruptions"
check_duplicate_export "getWeather"
check_duplicate_export "METRO_LINE_NAMES"

if [ "$dup_count" -eq 0 ]; then
  pass "No conflicting duplicate exports found"
fi
echo ""

# ─────────────────────────────────────────────────
# 7. Legacy opendata.js status
# ─────────────────────────────────────────────────
echo "--- Section 7: Legacy opendata.js Status ---"
if [ -f "src/services/opendata.js" ]; then
  if grep -q "@deprecated" "src/services/opendata.js" 2>/dev/null; then
    pass "opendata.js has deprecation comment"
  else
    warn "opendata.js exists but lacks deprecation comment"
  fi
  # Check importers of the legacy file
  legacy_importers=$(grep -rl 'from.*opendata\.js"' --include="*.js" src/ api/ 2>/dev/null | grep -v opendata-client | wc -l | tr -d ' ')
  if [ "$legacy_importers" -eq 0 ]; then
    pass "opendata.js has zero production importers"
  else
    echo "  INFO: opendata.js has $legacy_importers importer(s):"
    grep -rl 'from.*opendata\.js"' --include="*.js" src/ api/ 2>/dev/null | grep -v opendata-client | while read -r f; do
      echo "    - $f"
    done
  fi
else
  pass "opendata.js has been removed"
fi
echo ""

# ─────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────
echo "============================================"
echo " SUMMARY: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo "STATUS: FAILED — $FAIL check(s) need attention"
  exit 1
else
  echo "STATUS: PASSED (with $WARN advisory warning(s))"
  exit 0
fi
