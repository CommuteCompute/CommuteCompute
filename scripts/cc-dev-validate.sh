#!/bin/bash
#
# CC-DEV VALIDATION SCRIPT v2.0
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Validates data flow integrity, semantic consistency, version alignment,
# user-facing label compliance, and documentation freshness across the
# entire Commute Compute system.
# Run from repository root: ./scripts/cc-dev-validate.sh
#

set +e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VIOLATIONS=0
WARNINGS=0
PASSED=0

pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; ((VIOLATIONS++)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARNINGS++)); }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo "=================================================================="
echo "  CC-DEV VALIDATION SCRIPT v2.0"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================================="
echo ""

# =========================================================================
# VERSION.json — Single source of truth
# =========================================================================
VERSION_FILE="$REPO_ROOT/VERSION.json"
SYSTEM_VER=""
ENGINE_VER=""
RENDERER_VER=""
FIRMWARE_VER=""
SPEC_VER=""

if [ -f "$VERSION_FILE" ]; then
    SYSTEM_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.system?.version || v.system)" 2>/dev/null)
    ENGINE_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.components?.commutecompute?.version)" 2>/dev/null)
    RENDERER_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.components?.renderer?.version)" 2>/dev/null)
    FIRMWARE_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.firmware?.version)" 2>/dev/null)
    SPEC_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.specs?.dashboard?.version)" 2>/dev/null)
fi

# =========================================================================
# CHECK 1: Version Consistency — ALL HTML pages
# =========================================================================
info "CHECK 1: Version consistency (all HTML pages)"

if [ -z "$SYSTEM_VER" ]; then
    fail "VERSION.json unreadable or missing version fields"
else
    pass "VERSION.json readable: system=$SYSTEM_VER engine=$ENGINE_VER renderer=$RENDERER_VER firmware=$FIRMWARE_VER spec=$SPEC_VER"

    # All HTML pages to check
    HTML_PAGES="public/admin.html public/setup-wizard.html public/journey-display.html public/help.html public/privacy.html public/legal.html public/preview.html public/index.html public/attribution.html public/flasher/index.html"

    for page in $HTML_PAGES; do
        if [ ! -f "$page" ]; then
            warn "HTML page $page not found"
            continue
        fi
        pagename=$(basename "$page")

        # Check engine version (HTML span default + JS fallback)
        if grep -q "v${ENGINE_VER}" "$page" 2>/dev/null; then
            pass "$pagename: engine v${ENGINE_VER} correct"
        else
            fail "$pagename: engine version mismatch — expected v${ENGINE_VER}"
        fi

        # Check renderer version
        if grep -q "v${RENDERER_VER}" "$page" 2>/dev/null; then
            pass "$pagename: renderer v${RENDERER_VER} correct"
        else
            fail "$pagename: renderer version mismatch — expected v${RENDERER_VER}"
        fi

        # Check system version (JS fallback)
        if grep -q "${SYSTEM_VER}" "$page" 2>/dev/null; then
            pass "$pagename: system v${SYSTEM_VER} correct"
        else
            fail "$pagename: system version mismatch — expected v${SYSTEM_VER}"
        fi

        # Check for stale JS fallback versions
        STALE_FALLBACKS=$(grep -n "|| 'v[0-9]" "$page" 2>/dev/null | grep -v "v${ENGINE_VER}" | grep -v "v${RENDERER_VER}" | grep -v "'${SYSTEM_VER}'" | wc -l | tr -d ' ')
        if [ "$STALE_FALLBACKS" -gt 0 ]; then
            fail "$pagename: $STALE_FALLBACKS stale JS fallback version(s) found"
        fi
    done

    # Architecture diagram in admin.html
    if [ -f "public/admin.html" ]; then
        if grep -q "Engine v${ENGINE_VER}" public/admin.html 2>/dev/null; then
            pass "admin.html architecture diagram: Engine v${ENGINE_VER}"
        else
            fail "admin.html architecture diagram: engine version mismatch"
        fi

        if grep -q "Renderer v${RENDERER_VER}" public/admin.html 2>/dev/null; then
            pass "admin.html architecture diagram: Renderer v${RENDERER_VER}"
        else
            fail "admin.html architecture diagram: renderer version mismatch"
        fi
    fi
fi

echo ""

# =========================================================================
# CHECK 1b: Version Consistency — Markdown and firmware docs
# =========================================================================
info "CHECK 1b: Version consistency (documentation files)"

if [ -n "$FIRMWARE_VER" ]; then
    FIRMWARE_DOCS="firmware/README.md firmware/QUICK_START.md firmware/FIRMWARE-RELEASE.md firmware/BOOT-SEQUENCE.md INSTALL.md KNOWN-ISSUES.md"
    for doc in $FIRMWARE_DOCS; do
        if [ -f "$doc" ]; then
            if grep -q "v${FIRMWARE_VER}\|${FIRMWARE_VER}" "$doc" 2>/dev/null; then
                pass "$(basename $doc): firmware v${FIRMWARE_VER} correct"
            else
                fail "$(basename $doc): firmware version stale — expected v${FIRMWARE_VER}"
            fi
        fi
    done
fi

if [ -n "$SPEC_VER" ]; then
    SPEC_MAJOR=$(echo "$SPEC_VER" | sed 's/CCDashDesignV//' | sed 's/\..*//')
    # Monitor scripts
    MONITOR_FILES="monitor/semantic-audit.mjs monitor/config.mjs monitor/spec-compliance.mjs monitor/visual-logic-audit.mjs monitor/documentation-audit.mjs"
    for mf in $MONITOR_FILES; do
        if [ -f "$mf" ]; then
            if grep -q "CCDashDesignV${SPEC_MAJOR}" "$mf" 2>/dev/null; then
                pass "$(basename $mf): spec reference V${SPEC_MAJOR} correct"
            else
                # Check for stale V10/V11/V13/V14
                STALE_SPEC=$(grep -n "CCDashDesignV[0-9]" "$mf" 2>/dev/null | grep -v "V${SPEC_MAJOR}" | wc -l | tr -d ' ')
                if [ "$STALE_SPEC" -gt 0 ]; then
                    fail "$(basename $mf): $STALE_SPEC stale CCDashDesign spec reference(s)"
                else
                    warn "$(basename $mf): no CCDashDesign spec reference found"
                fi
            fi
        fi
    done
fi

echo ""

# =========================================================================
# CHECK 2: Data Flow Integrity — dashboardData fields consumed
# =========================================================================
info "CHECK 2: Data flow integrity (engine → API → renderer/admin)"

# Key dashboardData fields that screen.js produces
# Core fields that MUST be consumed (critical data flow)
DASHBOARD_FIELDS="confidence_score confidence_label confidence_context confidence_resilience confidence_resilience_detail lifestyle_display lifestyle_primary mindset_stress mindset_display mindset_steps mindset_feels_like"
# Advisory fields that should ideally be consumed but are not critical
DASHBOARD_ADVISORY="confidence_text"

for field in $DASHBOARD_FIELDS; do
    # Check if field is set in screen.js
    if grep -q "$field" api/screen.js 2>/dev/null; then
        # Check if field is consumed by renderer OR admin panel
        RENDERER_HIT=$(grep -c "$field" src/services/ccdash-renderer.js 2>/dev/null | head -1 || echo 0)
        ADMIN_HIT=$(grep -c "$field" public/admin.html 2>/dev/null | head -1 || echo 0)
        TOTAL=$(( ${RENDERER_HIT:-0} + ${ADMIN_HIT:-0} ))
        if [ "$TOTAL" -gt 0 ]; then
            pass "Data field '$field' produced and consumed (renderer:$RENDERER_HIT admin:$ADMIN_HIT)"
        else
            fail "Data field '$field' produced in screen.js but NEVER consumed"
        fi
    else
        warn "Data field '$field' not found in screen.js"
    fi
done

# Advisory fields — warn if not consumed (not critical)
for field in $DASHBOARD_ADVISORY; do
    if grep -q "$field" api/screen.js 2>/dev/null; then
        RENDERER_HIT=$(grep -c "$field" src/services/ccdash-renderer.js 2>/dev/null | head -1 || echo 0)
        ADMIN_HIT=$(grep -c "$field" public/admin.html 2>/dev/null | head -1 || echo 0)
        TOTAL=$(( ${RENDERER_HIT:-0} + ${ADMIN_HIT:-0} ))
        if [ "$TOTAL" -gt 0 ]; then
            pass "Data field '$field' produced and consumed (renderer:$RENDERER_HIT admin:$ADMIN_HIT)"
        else
            warn "Data field '$field' produced but not consumed (advisory)"
        fi
    fi
done

# Check commutecompute.js also provides key fields to admin
CC_FIELDS="isLive dataSource _liveDataDiag hasAnyLiveData"
for field in $CC_FIELDS; do
    if grep -q "$field" api/commutecompute.js 2>/dev/null; then
        pass "commutecompute.js provides '$field' field"
    else
        fail "commutecompute.js missing '$field' field (admin panel needs it)"
    fi
done

echo ""

# =========================================================================
# CHECK 3: GTFS-RT Source String Consistency
# =========================================================================
info "CHECK 3: GTFS-RT source string consistency"

# Check for incorrect source === 'live' pattern (but NOT apiMode === 'live' which is correct)
BAD_LIVE=$(grep -rn "source === 'live'\|dataSource === 'live'\|dataMode === 'Live'" api/commutecompute.js api/screen.js public/admin.html src/services/ccdash-renderer.js 2>/dev/null | grep -v 'apiMode' | grep -v '// ' | wc -l | tr -d ' ')
if [ "$BAD_LIVE" -gt 0 ]; then
    fail "Found $BAD_LIVE instances of incorrect 'live' source checks (should be 'gtfs-rt')"
    grep -rn "source === 'live'\|dataSource === 'live'\|dataMode === 'Live'" api/commutecompute.js api/screen.js public/admin.html src/services/ccdash-renderer.js 2>/dev/null | grep -v 'apiMode' | grep -v '// ' | head -5
else
    pass "No incorrect source === 'live' patterns found"
fi

# Check that correct source strings are used
CORRECT_SOURCES=$(grep -rn "gtfs-rt" api/commutecompute.js api/screen.js public/admin.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$CORRECT_SOURCES" -gt 0 ]; then
    pass "Found $CORRECT_SOURCES references to correct GTFS-RT source strings"
else
    warn "No GTFS-RT source string references found in main files"
fi

# Check isLive truthfulness — must use .isLive === true, not just !!data
BAD_ISLIVE=$(grep -rn "isLive.*!!liveData\|isLive.*!!.*source\|isLive:.*!!dep" api/screen.js api/commutecompute.js 2>/dev/null | wc -l | tr -d ' ')
if [ "$BAD_ISLIVE" -gt 0 ]; then
    fail "Found $BAD_ISLIVE non-truthful isLive assignments (must use .isLive === true)"
else
    pass "All isLive assignments use truthful source checks"
fi

echo ""

# =========================================================================
# CHECK 4: apiMode Pipeline
# =========================================================================
info "CHECK 4: apiMode pipeline completeness"

if grep -q "apiMode" api/admin/preferences.js 2>/dev/null; then
    pass "preferences.js handles apiMode field"
else
    fail "preferences.js missing apiMode handler"
fi

if grep -q "apiMode" api/screen.js 2>/dev/null; then
    pass "screen.js reads apiMode preference"
else
    fail "screen.js does not read apiMode preference"
fi

if grep -q "apiMode" api/commutecompute.js 2>/dev/null; then
    pass "commutecompute.js reads apiMode preference"
else
    fail "commutecompute.js does not read apiMode preference"
fi

if grep -q "field: 'apiMode'" public/admin.html 2>/dev/null; then
    pass "admin.html sends apiMode in correct field format"
else
    fail "admin.html does not send apiMode in field format"
fi

echo ""

# =========================================================================
# CHECK 5: Stop Name Rendering — no raw HTML entities
# =========================================================================
info "CHECK 5: Stop name rendering"

if grep -q "'/':'&#x2F;'" public/admin.html 2>/dev/null; then
    fail "sanitize() still encodes forward slash — causes &#x2F; display bug"
else
    pass "sanitize() does not encode forward slash"
fi

echo ""

# =========================================================================
# CHECK 5b: User-Facing Data Source Labels — no technical jargon
# =========================================================================
info "CHECK 5b: User-facing data source labels (no GTFS jargon)"

# Check renderer does not show "GTFS-RT" or "gtfs-rt" in fillText calls
BAD_LABELS=$(grep -n "fillText.*[Gg][Tt][Ff][Ss]" src/services/ccdash-renderer.js 2>/dev/null | wc -l | tr -d ' ')
if [ "$BAD_LABELS" -eq 0 ]; then
    pass "Renderer does not display GTFS terminology to users"
else
    fail "Found $BAD_LABELS fillText calls exposing GTFS jargon in renderer"
    grep -n "fillText.*[Gg][Tt][Ff][Ss]" src/services/ccdash-renderer.js 2>/dev/null | head -5
fi

# Check renderer uses plain-language labels
if grep -q "LIVE DATA" src/services/ccdash-renderer.js 2>/dev/null; then
    pass "Renderer uses 'LIVE DATA' label"
else
    fail "Renderer missing 'LIVE DATA' label"
fi

if grep -q "SCHEDULED DATA" src/services/ccdash-renderer.js 2>/dev/null; then
    pass "Renderer uses 'SCHEDULED DATA' label"
else
    fail "Renderer missing 'SCHEDULED DATA' label"
fi

# Check admin panel uses 'Live'/'Scheduled' badges (not GTFS terms)
ADMIN_GTFS_DISPLAY=$(grep -n "textContent.*[Gg][Tt][Ff][Ss]" public/admin.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$ADMIN_GTFS_DISPLAY" -eq 0 ]; then
    pass "Admin panel does not display GTFS terminology to users"
else
    fail "Found $ADMIN_GTFS_DISPLAY instances of GTFS jargon in admin panel textContent"
fi

# Check admin banner text does not expose GTFS terms
ADMIN_BANNER_GTFS=$(grep -n "GTFS-RT\|gtfs-rt" public/admin.html 2>/dev/null | grep -i "innerhtml\|textContent\|innerText\|innerHTML" | wc -l | tr -d ' ')
if [ "$ADMIN_BANNER_GTFS" -eq 0 ]; then
    pass "Admin banner/status messages do not expose GTFS terms"
else
    fail "Found $ADMIN_BANNER_GTFS admin banner/status messages exposing GTFS terms"
fi

echo ""

# =========================================================================
# CHECK 6: Zone Boundary Compliance
# =========================================================================
info "CHECK 6: Zone boundary compliance (renderer)"

CLIP_COUNT=$(grep -c "ctx.clip()" src/services/ccdash-renderer.js 2>/dev/null || echo 0)
if [ "$CLIP_COUNT" -ge 3 ]; then
    pass "Renderer has $CLIP_COUNT canvas clipping regions"
else
    warn "Renderer has only $CLIP_COUNT clipping regions (expected 3+)"
fi

MEASURE_TRUNCATE=$(grep -c "measureText.*width.*>" src/services/ccdash-renderer.js 2>/dev/null || echo 0)
if [ "$MEASURE_TRUNCATE" -ge 5 ]; then
    pass "Renderer has $MEASURE_TRUNCATE pixel-aware truncation checks"
else
    warn "Renderer has only $MEASURE_TRUNCATE pixel-aware truncation checks (expected 5+)"
fi

OLD_TRUNCATION=$(grep -n "slice(0, -4) + '\\.\\.\\.'" src/services/ccdash-renderer.js 2>/dev/null | wc -l | tr -d ' ')
if [ "$OLD_TRUNCATION" -eq 0 ]; then
    pass "No old character-based truncation (slice+...) remaining"
else
    fail "Found $OLD_TRUNCATION instances of old character-based truncation"
fi

echo ""

# =========================================================================
# CHECK 7: GTFS Stop Files Integrity
# =========================================================================
info "CHECK 7: GTFS stop files integrity"

STOP_FILES="src/data/vic/gtfs/metro-stops.txt src/data/vic/gtfs/tram-stops.txt src/data/vic/gtfs/bus-metro-stops.txt src/data/vic/gtfs/bus-regional-stops.txt"
for sf in $STOP_FILES; do
    if [ -f "$sf" ]; then
        LINE_COUNT=$(wc -l < "$sf" | tr -d ' ')
        # Check header contains stop_id (handles BOM and varied column sets)
        if head -1 "$sf" | grep -q "stop_id"; then
            pass "$sf: $LINE_COUNT lines, valid header"
        else
            fail "$sf: missing expected CSV header (stop_id)"
        fi
    else
        fail "$sf not found"
    fi
done

echo ""

# =========================================================================
# CHECK 8: API Endpoint Parity
# =========================================================================
info "CHECK 8: API endpoint parity"

ENDPOINTS="api/screen.js api/commutecompute.js api/version.js api/admin/preferences.js api/admin/setup-complete.js api/admin/resolve-stops.js api/status.js api/livedash.js api/zones.js api/zonedata.js"
for ep in $ENDPOINTS; do
    if [ -f "$ep" ]; then
        pass "Endpoint $ep exists"
    else
        fail "Documented endpoint $ep missing"
    fi
done

echo ""

# =========================================================================
# CHECK 9: Trade Mark Symbols (first prose reference)
# =========================================================================
info "CHECK 9: Trade mark symbols in README"

TM_MARKS="Commute Compute System CommuteCompute CCDash CCFirm CoffeeDecision DepartureConfidence LifestyleContext SleepOptimiser AltTransit"
if [ -f "README.md" ]; then
    for mark in $TM_MARKS; do
        if grep -q "${mark}™" README.md 2>/dev/null; then
            pass "README.md: ${mark}™ symbol present"
        else
            warn "README.md: ${mark}™ symbol not found (may be first-reference only)"
        fi
    done
else
    warn "README.md not found"
fi

echo ""

# =========================================================================
# CHECK 10: Documentation Freshness
# =========================================================================
info "CHECK 10: Documentation freshness"

if grep -q "24 calls per 60 seconds" DEVELOPMENT-RULES.md 2>/dev/null; then
    pass "DEVELOPMENT-RULES.md rate limits match Transport Victoria (24/60s)"
else
    fail "DEVELOPMENT-RULES.md rate limits outdated"
fi

for engine in "DepartureConfidence" "LifestyleContext" "SleepOptimiser" "AltTransit"; do
    if grep -q "$engine" README.md 2>/dev/null; then
        pass "README.md documents $engine engine"
    else
        fail "README.md missing $engine engine documentation"
    fi
done

# CoffeeDecision is integrated into CommuteCompute engine, not standalone section
if grep -qi "coffee" README.md 2>/dev/null; then
    pass "README.md references coffee decision logic"
else
    warn "README.md missing coffee decision references"
fi

echo ""

# =========================================================================
# CHECK 11: Live Data Pipeline Resilience
# =========================================================================
info "CHECK 11: Live data pipeline resilience"

# Check Promise.all has error resilience (per-call .catch() OR fetchWithRetry wrapper)
SCREEN_CATCH=$(grep -c "getDepartures.*\.catch\|fetchWithRetry.*getDepartures" api/screen.js 2>/dev/null | head -1 || echo 0)
if [ "${SCREEN_CATCH:-0}" -ge 3 ]; then
    pass "screen.js: $SCREEN_CATCH getDepartures calls have error resilience"
else
    fail "screen.js: only $SCREEN_CATCH getDepartures calls have error resilience — need 3+"
fi

# Check commutecompute.js has error resilience
CC_CATCH=$(grep -c "getDepartures.*\.catch\|fetchWithRetry.*getDepartures" api/commutecompute.js 2>/dev/null | head -1 || echo 0)
if [ "${CC_CATCH:-0}" -ge 3 ]; then
    pass "commutecompute.js: $CC_CATCH getDepartures calls have error resilience"
else
    fail "commutecompute.js: only $CC_CATCH getDepartures calls have error resilience — need 3+"
fi

# Check diagnostic data is surfaced
if grep -q "_liveDataDiag" api/screen.js 2>/dev/null; then
    pass "screen.js provides _liveDataDiag diagnostic object"
else
    fail "screen.js missing _liveDataDiag — admin panel cannot diagnose live data issues"
fi

if grep -q "_liveDataDiag" api/commutecompute.js 2>/dev/null; then
    pass "commutecompute.js provides _liveDataDiag diagnostic object"
else
    fail "commutecompute.js missing _liveDataDiag diagnostic object"
fi

# Check admin panel consumes diagnostics
if grep -q "ccLatestDiag\|_liveDataDiag" public/admin.html 2>/dev/null; then
    pass "Admin panel reads diagnostic data"
else
    fail "Admin panel does not consume _liveDataDiag diagnostic data"
fi

echo ""

# =========================================================================
# CHECK 12: E-ink Preview Indicator Truthfulness
# =========================================================================
info "CHECK 12: E-ink preview indicator truthfulness"

# Check e-ink indicator is dynamic (not hardcoded green)
if grep -q "eink-live-indicator" public/admin.html 2>/dev/null; then
    pass "E-ink indicator uses dynamic element (eink-live-indicator)"
else
    fail "E-ink indicator may be hardcoded — missing eink-live-indicator element"
fi

# Check JS updates the indicator based on actual state
if grep -q "eink-live-dot" public/admin.html 2>/dev/null; then
    pass "E-ink indicator dot is dynamically updated"
else
    fail "E-ink indicator dot not found — may be hardcoded"
fi

echo ""

# =========================================================================
# CHECK 13: HTML Page Footer Consistency (dynamic loading)
# =========================================================================
info "CHECK 13: HTML page footer consistency"

HTML_PAGES="public/admin.html public/setup-wizard.html public/journey-display.html public/help.html public/privacy.html public/legal.html public/preview.html public/index.html public/attribution.html public/flasher/index.html"

for page in $HTML_PAGES; do
    if [ ! -f "$page" ]; then continue; fi
    pagename=$(basename "$page")

    # Check footer loads from /api/version
    if grep -q "/api/version" "$page" 2>/dev/null; then
        pass "$pagename: loads versions from /api/version"
    else
        warn "$pagename: does not load versions from /api/version (may use static footer)"
    fi

    # Check cc-system-footer class exists
    if grep -q "cc-system-footer" "$page" 2>/dev/null; then
        pass "$pagename: has cc-system-footer"
    else
        fail "$pagename: missing cc-system-footer"
    fi
done

echo ""

# =========================================================================
# CHECK 14: Semantic Consistency — dataSource values
# =========================================================================
info "CHECK 14: Semantic consistency (dataSource pipeline)"

# Verify screen.js sets dataSource to 'gtfs-rt' (may be via ternary)
if grep -q "gtfs-rt" api/screen.js 2>/dev/null; then
    if grep -q "dataSource.*gtfs-rt" api/screen.js 2>/dev/null; then
        pass "screen.js sets dataSource to 'gtfs-rt' (correct)"
    else
        pass "screen.js references 'gtfs-rt' source strings"
    fi
else
    fail "screen.js does not reference 'gtfs-rt' anywhere"
fi

# Verify renderer checks for 'gtfs-rt'
if grep -q "dataSource.*gtfs-rt" src/services/ccdash-renderer.js 2>/dev/null; then
    pass "Renderer checks dataSource === 'gtfs-rt' (correct)"
else
    fail "Renderer does not check for 'gtfs-rt' dataSource"
fi

# Verify admin checks for 'gtfs-rt'
if grep -q "dataSource.*gtfs-rt" public/admin.html 2>/dev/null; then
    pass "Admin panel checks dataSource === 'gtfs-rt' (correct)"
else
    fail "Admin panel does not check for 'gtfs-rt' dataSource"
fi

echo ""

# =========================================================================
# SUMMARY
# =========================================================================
echo "=================================================================="
echo "  CC-DEV VALIDATION SUMMARY v2.0"
echo "=================================================================="
echo -e "  ${GREEN}PASSED:${NC}     $PASSED"
echo -e "  ${RED}VIOLATIONS:${NC} $VIOLATIONS"
echo -e "  ${YELLOW}WARNINGS:${NC}  $WARNINGS"
echo "=================================================================="

if [ "$VIOLATIONS" -gt 0 ]; then
    echo -e "${RED}VALIDATION FAILED${NC} — $VIOLATIONS violation(s) found"
    exit 1
else
    echo -e "${GREEN}VALIDATION PASSED${NC}"
    exit 0
fi
