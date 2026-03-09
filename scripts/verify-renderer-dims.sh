#!/bin/bash
# =============================================================================
# verify-renderer-dims.sh
# Verification script for CCDash Renderer multi-display dimension support
#
# Checks:
# 1. No hardcoded 800/480 in rendering code (except defaults, comments, lookups)
# 2. renderFullDashboard accepts options parameter
# 3. renderFullScreenBMP accepts options parameter
# 4. Both files pass syntax check
# 5. DISPLAY_DIMENSIONS export exists
# 6. computeZones function exists
# 7. getDynamicLegZone accepts display dimension parameters
# 8. Font size minimum floors (11px) are enforced
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later
# =============================================================================

set -e

RENDERER="src/services/ccdash-renderer.js"
ENDPOINT="api/commutecompute.js"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  [PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  [FAIL] $1"; }

echo "========================================"
echo "CCDash Renderer Dimension Verification"
echo "========================================"
echo ""

# --- 1. Syntax checks ---
echo "1. Syntax verification"
if node --check "$RENDERER" 2>/dev/null; then
  pass "ccdash-renderer.js passes syntax check"
else
  fail "ccdash-renderer.js syntax error"
fi

if node --check "$ENDPOINT" 2>/dev/null; then
  pass "commutecompute.js passes syntax check"
else
  fail "commutecompute.js syntax error"
fi

echo ""

# --- 2. renderFullDashboard accepts options parameter ---
echo "2. Function signatures"
if grep -q 'export async function renderFullDashboard(data, options' "$RENDERER"; then
  pass "renderFullDashboard accepts options parameter"
else
  fail "renderFullDashboard does not accept options parameter"
fi

if grep -q 'export async function renderFullScreenBMP(data, prefs.*options' "$RENDERER"; then
  pass "renderFullScreenBMP accepts options parameter"
else
  fail "renderFullScreenBMP does not accept options parameter"
fi

if grep -q 'export async function renderFullScreen(data, prefs.*options' "$RENDERER"; then
  pass "renderFullScreen accepts options parameter"
else
  fail "renderFullScreen does not accept options parameter"
fi

echo ""

# --- 3. DISPLAY_DIMENSIONS and computeZones ---
echo "3. Dimension infrastructure"
if grep -q 'export const DISPLAY_DIMENSIONS' "$RENDERER"; then
  pass "DISPLAY_DIMENSIONS constant exported"
else
  fail "DISPLAY_DIMENSIONS constant not found"
fi

if grep -q 'function computeZones(w, h)' "$RENDERER"; then
  pass "computeZones function exists"
else
  fail "computeZones function not found"
fi

if grep -q 'const REF_W = 800' "$RENDERER"; then
  pass "REF_W reference constant defined"
else
  fail "REF_W reference constant not found"
fi

if grep -q 'const REF_H = 480' "$RENDERER"; then
  pass "REF_H reference constant defined"
else
  fail "REF_H reference constant not found"
fi

echo ""

# --- 4. getDynamicLegZone accepts display dimensions ---
echo "4. getDynamicLegZone signature"
if grep -q 'function getDynamicLegZone(legIndex, totalLegs, legs.*displayWidth.*displayHeight' "$RENDERER"; then
  pass "getDynamicLegZone accepts displayWidth and displayHeight"
else
  fail "getDynamicLegZone does not accept display dimensions"
fi

echo ""

# --- 5. _renderFullScreenCanvas accepts dimensions ---
echo "5. Internal canvas function"
if grep -q 'function _renderFullScreenCanvas(data, prefs.*displayWidth.*displayHeight' "$RENDERER"; then
  pass "_renderFullScreenCanvas accepts display dimensions"
else
  fail "_renderFullScreenCanvas does not accept display dimensions"
fi

if grep -q 'createCanvas(displayWidth, displayHeight)' "$RENDERER"; then
  pass "Canvas created with dynamic dimensions"
else
  fail "Canvas not created with dynamic dimensions"
fi

echo ""

# --- 6. No hardcoded 800/480 in rendering functions ---
echo "6. Hardcoded dimension check (rendering code only)"

# Extract _renderFullScreenCanvas function body (line range) and check for literal 800/480
# We check from the function definition to 'return canvas;' at the end
RENDER_START=$(grep -n '_renderFullScreenCanvas(data' "$RENDERER" | head -1 | cut -d: -f1)
RENDER_END=$(awk "NR>=$RENDER_START && /^  return canvas;$/{print NR; exit}" "$RENDERER")

if [ -n "$RENDER_START" ] && [ -n "$RENDER_END" ]; then
  # Check for literal 800 in rendering body (exclude comments, REF_W references)
  HARDCODED_800=$(sed -n "${RENDER_START},${RENDER_END}p" "$RENDERER" | grep -n '\b800\b' | grep -v '//' | grep -v 'REF_W' | grep -v 'DISPLAY_DIMENSIONS' || true)
  if [ -z "$HARDCODED_800" ]; then
    pass "No hardcoded 800 in _renderFullScreenCanvas"
  else
    fail "Found hardcoded 800 in _renderFullScreenCanvas:"
    echo "$HARDCODED_800"
  fi

  HARDCODED_480=$(sed -n "${RENDER_START},${RENDER_END}p" "$RENDERER" | grep -n '\b480\b' | grep -v '//' | grep -v 'REF_H' | grep -v 'DISPLAY_DIMENSIONS' || true)
  if [ -z "$HARDCODED_480" ]; then
    pass "No hardcoded 480 in _renderFullScreenCanvas"
  else
    fail "Found hardcoded 480 in _renderFullScreenCanvas:"
    echo "$HARDCODED_480"
  fi
else
  fail "Could not locate _renderFullScreenCanvas function bounds"
fi

echo ""

# --- 7. Font minimum floors ---
echo "7. Font size minimum floors (11px)"
# Count Math.max(11, patterns — should be many
FLOOR_COUNT=$(grep -c 'Math.max(11,' "$RENDERER" || true)
if [ "$FLOOR_COUNT" -ge 10 ]; then
  pass "Found $FLOOR_COUNT font floor expressions (Math.max(11, ...))"
else
  fail "Only $FLOOR_COUNT font floor expressions found (expected 10+)"
fi

echo ""

# --- 8. Endpoint passes dimensions ---
echo "8. Endpoint dimension passing"
if grep -q 'DISPLAY_DIMENSIONS' "$ENDPOINT"; then
  pass "DISPLAY_DIMENSIONS imported in endpoint"
else
  fail "DISPLAY_DIMENSIONS not imported in endpoint"
fi

if grep -q 'deviceModel' "$ENDPOINT"; then
  pass "deviceModel resolved from KV preferences"
else
  fail "deviceModel not resolved in endpoint"
fi

if grep -q 'renderFullScreenBMP(dashboardData, {}, displayDims)' "$ENDPOINT"; then
  pass "renderFullScreenBMP called with display dimensions"
else
  fail "renderFullScreenBMP not called with display dimensions"
fi

if grep -q 'renderFullDashboard(dashboardData, displayDims)' "$ENDPOINT"; then
  pass "renderFullDashboard called with display dimensions"
else
  fail "renderFullDashboard not called with display dimensions"
fi

echo ""

# --- 9. TRMNL Mini dimensions ---
echo "9. Device dimension definitions"
if grep -q "'trmnl-mini'.*width: 600.*height: 448" "$RENDERER"; then
  pass "TRMNL Mini defined as 600x448"
else
  fail "TRMNL Mini dimensions incorrect"
fi

if grep -q "'trmnl-og'.*width: 800.*height: 480" "$RENDERER"; then
  pass "TRMNL OG defined as 800x480"
else
  fail "TRMNL OG dimensions incorrect"
fi

echo ""

# --- Summary ---
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo ""
echo "All checks passed."
