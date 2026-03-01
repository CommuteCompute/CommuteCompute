#!/bin/bash
#
# COMPREHENSIVE DEVELOPMENT RULES COMPLIANCE AUDIT v2.0
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Systematically checks ALL 26 sections of DEVELOPMENT-RULES.md
# 280+ automated checks across 11 groups:
#   G1: Static Analysis (Sections 0-3, 14, 20)
#   G2: Per-Page Verification (all HTML pages)
#   G3: Per-Endpoint Verification (all API endpoints)
#   G4: Data Flow Verification (config, rendering, admin, KV, mock data)
#   G5: Caching Verification (headers, refresh timing, TTLs)
#   G6: Version Consistency (comprehensive: VERSION.json, all HTML, MD, JS, package.json)
#   G7: Security (Section 17 expanded + BLE provisioning URL checks)
#   G8: Architecture & Design (Sections 4-5, 7-10, 21-24)
#   G9: Metro Tunnel Compliance (Section 25)
#   G10: API Security & Auth (Section 26)
#   G11: Python Compliance Scanner (13 unique checks + overlap verification)
#
# Run from repository root: ./scripts/comprehensive-compliance-audit.sh
#

# Don't exit on error - we handle failures explicitly
set +e

# Log file — full untruncated output saved automatically every run
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT_LOG_DIR="$REPO_ROOT/audit-logs"
mkdir -p "$AUDIT_LOG_DIR"
AUDIT_LOG="$AUDIT_LOG_DIR/cc-compliance-audit-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee >(sed 's/\x1b\[[0-9;]*m//g' > "$AUDIT_LOG")) 2>&1

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

VIOLATIONS=0
WARNINGS=0
PASSED=0
SKIPPED=0

# Helper functions
pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((VIOLATIONS++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

skip() {
    echo -e "${CYAN}[SKIP]${NC} $1"
    ((SKIPPED++))
}

section() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
}

subsection() {
    echo ""
    echo -e "${BLUE}── $1 ──${NC}"
}

group_header() {
    echo ""
    echo -e "${CYAN}┌──────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│ $1${NC}"
    echo -e "${CYAN}└──────────────────────────────────────────────────────────────┘${NC}"
}

# Comprehensive emoji pattern used across multiple checks
EMOJI_PATTERN='📋|🌐|❌|🎯|🔍|⚠️|✓|✅|🔄|💡|⏳|✨|👍|🤖|🌏|✗|🚊|☕|🧠|📊|⚡|📱|🔗|📟|🕐|🌤️|👤|🗺️|🔒|🔓|💾|🚀|⭐|🎉|👋|📝|🔧|⚙️|📁|📂|🗂️|📌|📍|🏠|🏢|🚌|🚃|🛤️|✈️|🚶|🚶‍♂️|🚶‍♀️|💼|🎒|☀️|🌙|⛅|🌧️|❄️|🌡️|💧|🔥|💨|🌊|🏃|💤|🚗|🛴|🚲|🧮|🎭|📈|📉|🆘|🆗|🔔|🔕|🔴|🟢|🟡|🟠|⭕|🔵|💚|❤️|💛'

# ============================================================================
# GROUP 1: STATIC ANALYSIS (Sections 0-3, 14, 20)
# ============================================================================
group_header "GROUP 1: STATIC ANALYSIS (Sections 0-3, 14, 20)"

# ---------- Section 0: Naming Conventions ----------
section "SECTION 0: NAMING CONVENTIONS"

subsection "0.2 localStorage cc-* prefix"
BAD_LOCALSTORAGE=$(grep -rn "localStorage\.\(get\|set\)Item" public/*.html 2>/dev/null | grep -v "cc-" | grep -v "//.*localStorage" | head -5 || true)
if [ -n "$BAD_LOCALSTORAGE" ]; then
    fail "localStorage keys not using cc-* prefix:"
    echo "$BAD_LOCALSTORAGE" | head -3
else
    pass "localStorage keys follow cc-* naming convention"
fi

subsection "0.2 CSS class cc-* convention"
BAD_CSS=$(grep -rn "class=\"[^\"]*\"" public/*.html 2>/dev/null | grep -v "cc-\|btn\|form\|card\|nav\|container\|row\|col\|icon\|svg\|hidden\|active\|modal\|tab\|input\|select\|label\|header\|footer\|main\|section" | head -3 || true)
if [ -n "$BAD_CSS" ]; then
    warn "Some CSS classes may not follow cc-* convention (review manually)"
else
    pass "CSS class naming appears consistent"
fi

subsection "0.2 HTML id cc-* convention"
BAD_IDS=$(grep -rn "id=\"[^\"]*\"" public/*.html 2>/dev/null | grep -v "cc-\|icon-\|svg\|modal\|tab\|section\|main\|root" | head -5 || true)
if [ -n "$BAD_IDS" ]; then
    warn "Some HTML ids may not follow cc-* convention (review manually):"
    echo "$BAD_IDS" | head -3
else
    pass "HTML id attributes follow cc-* convention"
fi

# ---------- Section 1: Absolute Prohibitions - PTV ----------
section "SECTION 1: ABSOLUTE PROHIBITIONS - PTV API NAMING"

subsection "1.1 Forbidden PTV terms in code"
FORBIDDEN_TERMS="PTV_API_KEY|PTV_DEV_ID|PTV_USER_ID|PTV API|PTV Timetable|PTV Developer"
PTV_VIOLATIONS=$(grep -rn "$FORBIDDEN_TERMS" src/ api/ public/*.html 2>/dev/null | grep -v "NEVER use\|Forbidden\|DEVELOPMENT-RULES\|archive/" | head -10 || true)
if [ -n "$PTV_VIOLATIONS" ]; then
    fail "Forbidden PTV terms found in code:"
    echo "$PTV_VIOLATIONS"
else
    pass "No forbidden PTV terms in src/, api/, public/"
fi

subsection "1.1 PTV in user-facing strings"
PTV_DISPLAY=$(grep -rn '".*PTV.*"' public/*.html 2>/dev/null | grep -v "NEVER use\|Transport Victoria\|archive/" | head -5 || true)
if [ -n "$PTV_DISPLAY" ]; then
    fail "PTV displayed in user-facing strings (use 'Transport Victoria'):"
    echo "$PTV_DISPLAY"
else
    pass "No PTV in user-facing display strings"
fi

subsection "1.1 PTV in HTML <option> and <label> elements"
PTV_OPTIONS=$(grep -rn "<option\|<label" public/*.html 2>/dev/null | grep -i "PTV" | grep -v "Transport Victoria\|archive/" | head -5 || true)
if [ -n "$PTV_OPTIONS" ]; then
    fail "PTV found in HTML <option>/<label> elements:"
    echo "$PTV_OPTIONS"
else
    pass "No PTV references in <option>/<label> elements"
fi

subsection "1.1 PTV in console.log"
PTV_LOGS=$(grep -rn "console.*PTV" src/ api/ 2>/dev/null | grep -v "DEVELOPMENT-RULES" | head -5 || true)
if [ -n "$PTV_LOGS" ]; then
    fail "Console logs contain forbidden 'PTV' references:"
    echo "$PTV_LOGS"
else
    pass "No PTV references in console logs"
fi

subsection "1.1 PTV-named functions"
PTV_FUNCTIONS=$(grep -rn "function.*[Pp]tv\|savePtv\|getPtv\|loadPtv" public/*.html src/ api/ 2>/dev/null | grep -v "archive/" | head -3 || true)
if [ -n "$PTV_FUNCTIONS" ]; then
    fail "Function names contain forbidden 'Ptv' term:"
    echo "$PTV_FUNCTIONS"
else
    pass "No PTV-named functions"
fi

subsection "1.2 Legacy PTV API URLs"
LEGACY_PTV_URL=$(grep -rn "timetableapi\.ptv\.vic\.gov\.au\|data\.ptv\.vic\.gov\.au" src/ api/ 2>/dev/null | head -5 || true)
if [ -n "$LEGACY_PTV_URL" ]; then
    fail "Legacy PTV API URLs found (use Transport Victoria OpenData):"
    echo "$LEGACY_PTV_URL"
else
    pass "No legacy PTV API URLs"
fi

# ---------- Section 2: TRMNL Prohibition ----------
section "SECTION 2: TRMNL/USETRMNL PROHIBITION"

subsection "2.1 TRMNL server references"
TRMNL_VIOLATIONS=$(grep -rn "usetrmnl\.com\|trmnl\.com\|api\.usetrmnl" src/ api/ public/ firmware/ 2>/dev/null | grep -v "archive/" | head -5 || true)
if [ -n "$TRMNL_VIOLATIONS" ]; then
    fail "TRMNL/usetrmnl server references found (CRITICAL):"
    echo "$TRMNL_VIOLATIONS"
else
    pass "No TRMNL/usetrmnl server dependencies"
fi

subsection "2.1 TRMNL in imports/requires"
TRMNL_IMPORTS=$(grep -rn "require.*trmnl\|import.*trmnl\|from.*trmnl" src/ api/ 2>/dev/null | head -3 || true)
if [ -n "$TRMNL_IMPORTS" ]; then
    fail "TRMNL imports/requires found:"
    echo "$TRMNL_IMPORTS"
else
    pass "No TRMNL imports or requires"
fi

# ---------- Section 3: Zero-Config Architecture ----------
section "SECTION 3: ZERO-CONFIG SERVERLESS ARCHITECTURE"

subsection "3.1 No .env files"
ENV_FILES=$(find . -maxdepth 3 -name ".env*" 2>/dev/null | grep -v node_modules | grep -v ".envrc" || true)
if [ -n "$ENV_FILES" ]; then
    fail "Forbidden .env files detected:"
    echo "$ENV_FILES"
else
    pass "No .env files in repository"
fi

subsection "3.2 No hardcoded API keys"
HARDCODED_KEYS=$(grep -rn "ODATA_API_KEY\s*=\s*['\"][a-f0-9-]\{20,\}" src/ api/ 2>/dev/null | head -5 || true)
if [ -n "$HARDCODED_KEYS" ]; then
    fail "Hardcoded API keys detected:"
    echo "$HARDCODED_KEYS"
else
    pass "No hardcoded API keys found"
fi

subsection "3.2 No common API key patterns"
COMMON_KEYS=$(grep -rn "AIzaSy[a-zA-Z0-9_-]\{30,\}\|sk_live_[a-zA-Z0-9]\{20,\}\|sk_test_[a-zA-Z0-9]\{20,\}" src/ api/ public/ 2>/dev/null | head -5 || true)
if [ -n "$COMMON_KEYS" ]; then
    fail "Hardcoded API key patterns found:"
    echo "$COMMON_KEYS"
else
    pass "No common API key patterns detected"
fi

subsection "3.6 Redis storage pattern"
if [ -d "src/data" ]; then
    KV_USAGE=$(grep -rn "kv-preferences\|getClient\|getTransitApiKey\|@upstash/redis" src/ api/ 2>/dev/null | head -3 || true)
    if [ -n "$KV_USAGE" ]; then
        pass "Redis storage pattern in use (via kv-preferences.js)"
    else
        warn "No Redis storage usage found - verify kv-preferences.js is implemented"
    fi
else
    skip "src/data directory not found"
fi

subsection "3.7 localStorage keys structure"
REQUIRED_LS_KEYS="cc-config|cc-configured|cc-transit-api-key"
LS_KEYS_CHECK=$(grep -rn "$REQUIRED_LS_KEYS" public/setup-wizard.html public/admin.html 2>/dev/null | head -5 || true)
if [ -n "$LS_KEYS_CHECK" ]; then
    pass "Required localStorage keys present (cc-config, cc-configured)"
else
    warn "Some required localStorage keys may be missing"
fi

# ---------- ESLint: Temporal Dead Zone Detection ----------
section "ESLINT: VARIABLE USE-BEFORE-DEFINE (TDZ PREVENTION)"

subsection "no-use-before-define on critical rendering files"
if command -v npx >/dev/null 2>&1; then
    ESLINT_OUTPUT=$(ESLINT_USE_FLAT_CONFIG=false npx eslint --no-eslintrc --rule '{"no-use-before-define": ["error", {"variables": true, "functions": false, "classes": false}]}' --env es2020 --env node --parser-options=ecmaVersion:2020,sourceType:module src/services/ccdash-renderer.js api/screen.js 2>&1 || true)
    if echo "$ESLINT_OUTPUT" | grep -q "error.*no-use-before-define"; then
        fail "Variables used before definition (temporal dead zone risk):"
        echo "$ESLINT_OUTPUT" | grep "no-use-before-define" | head -5
    else
        pass "No use-before-define violations in ccdash-renderer.js and screen.js"
    fi
else
    skip "npx not available — cannot run ESLint TDZ check"
fi

# ---------- Section 14: Final Forbidden Terms Sweep ----------
section "SECTION 14: TESTING REQUIREMENTS"

subsection "14.1 Final forbidden terms sweep"
FINAL_FORBIDDEN=$(grep -rn "PTV_API_KEY\|PTV_DEV_ID\|PTV_USER_ID\|usetrmnl\.com\|trmnl\.com" --include="*.js" --include="*.html" src/ api/ public/ 2>/dev/null | grep -v "archive/\|NEVER use\|Forbidden\|DEVELOPMENT" | head -10 || true)
if [ -n "$FINAL_FORBIDDEN" ]; then
    fail "CRITICAL: Forbidden terms found in final sweep:"
    echo "$FINAL_FORBIDDEN"
else
    pass "Forbidden terms verification passed"
fi

subsection "14.1 SmartCommute naming (should be CommuteCompute)"
# Only flag SmartCommute where it's used as the engine name, not as a trademark reference
SMARTCOMMUTE_ENGINE=$(grep -rn "SmartCommute" src/ api/ 2>/dev/null | grep -v "SmartCommute™\|trademark\|©\|DEVELOPMENT\|archive/\|// SmartCommute" | head -5 || true)
if [ -n "$SMARTCOMMUTE_ENGINE" ]; then
    warn "SmartCommute references found (verify these use CommuteCompute for engine):"
    echo "$SMARTCOMMUTE_ENGINE" | head -3
else
    pass "No non-trademark SmartCommute references in engine code"
fi

subsection "14.2 Bill 2025 prohibited term (should be Act 2024)"
BILL_2025=$(grep -rn "Bill 2025" --include="*.js" --include="*.html" --include="*.md" src/ api/ public/ *.md 2>/dev/null | grep -v "prohibited\|should be\|DEVELOPMENT-RULES\|compliance-scanner\|compliance-audit" | head -5 || true)
if [ -n "$BILL_2025" ]; then
    fail "'Bill 2025' prohibited — should be 'Privacy and Other Legislation Amendment Act 2024':"
    echo "$BILL_2025"
else
    pass "No prohibited 'Bill 2025' references (correct: Act 2024)"
fi

# ---------- Section 15: Security Practices ----------
section "SECTION 15: SECURITY PRACTICES"

subsection "15.4 No .env files tracked by git"
TRACKED_ENV=$(git ls-files '*.env' '.env*' 2>/dev/null | grep -v node_modules || true)
if [ -n "$TRACKED_ENV" ]; then
    fail ".env files are tracked by git (must be in .gitignore):"
    echo "$TRACKED_ENV"
else
    pass "No .env files tracked by git"
fi

subsection "15.5 Git tags follow version format convention"
GIT_TAGS=$(git tag 2>/dev/null || true)
if [ -n "$GIT_TAGS" ]; then
    BAD_TAGS=$(echo "$GIT_TAGS" | grep -v "^v[0-9]" || true)
    if [ -n "$BAD_TAGS" ]; then
        warn "Some git tags do not follow v* version format:"
        echo "$BAD_TAGS" | head -5
    else
        pass "All git tags follow v* version format convention"
    fi
else
    pass "No git tags present (version tracking via VERSION.json)"
fi

# ---------- Section 20: Licensing ----------
section "SECTION 20: LICENSING"

subsection "20.0 LICENSE file (AGPL-3.0)"
if [ -f "LICENSE" ]; then
    AGPL_CHECK=$(grep -c "AGPL\|GNU AFFERO" LICENSE 2>/dev/null || echo "0")
    if [ "$AGPL_CHECK" -gt 0 ]; then
        pass "LICENSE file contains AGPL-3.0 reference"
    else
        fail "LICENSE file exists but does not reference AGPL-3.0"
    fi

    # Check for dual licence indication
    DUAL_CHECK=$(grep -ci "dual\|commercial" LICENSE 2>/dev/null || echo "0")
    if [ "$DUAL_CHECK" -gt 0 ]; then
        pass "LICENSE file references dual licensing / commercial terms"
    else
        fail "LICENSE file does not mention dual licence (AGPL-3.0 + commercial)"
    fi
else
    fail "LICENSE file missing"
fi

subsection "20.5 Prohibited licences for original work"
# Original source files must NOT be MIT/Apache/BSD/GPL — only AGPL-3.0
PROHIBITED_LICENCE=$(grep -rn "Licensed under MIT\|Licensed under Apache\|Licensed under BSD\|Licensed under GPL\b\|Licensed under LGPL" src/ api/ 2>/dev/null | grep -v "node_modules\|third.party\|vendor\|DEVELOPMENT-RULES\|LEGAL" | head -5 || true)
if [ -n "$PROHIBITED_LICENCE" ]; then
    fail "Prohibited licence found in original work (must be AGPL-3.0 only):"
    echo "$PROHIBITED_LICENCE" | head -3
else
    pass "No prohibited licences (MIT/Apache/BSD/GPL) in original source files"
fi

subsection "20.6 LEGAL.md exists"
if [ -f "LEGAL.md" ]; then
    pass "LEGAL.md exists (full IP documentation)"

    # Check LEGAL.md references AGPL-3.0 dual licence
    LEGAL_AGPL=$(grep -c "AGPL-3.0" LEGAL.md 2>/dev/null || echo "0")
    if [ "$LEGAL_AGPL" -gt 0 ]; then
        pass "LEGAL.md references AGPL-3.0"
    else
        fail "LEGAL.md does not reference AGPL-3.0"
    fi

    # Check LEGAL.md has third-party content exclusion
    LEGAL_3P=$(grep -ci "third.party\|Third-Party" LEGAL.md 2>/dev/null || echo "0")
    if [ "$LEGAL_3P" -gt 0 ]; then
        pass "LEGAL.md has third-party content section"
    else
        fail "LEGAL.md missing third-party content exclusion (Section 20.6)"
    fi
else
    fail "LEGAL.md missing (required by Section 20.6)"
fi

subsection "20.4 DEVELOPMENT-RULES.md exists"
if [ -f "DEVELOPMENT-RULES.md" ]; then
    pass "DEVELOPMENT-RULES.md exists"
else
    fail "DEVELOPMENT-RULES.md not found"
fi

subsection "20.4 License headers - src/engines/*.js"
ENGINES_TOTAL=0
ENGINES_LICENSED=0
for f in src/engines/*.js; do
    [ -f "$f" ] || continue
    ((ENGINES_TOTAL++))
    if grep -q "AGPL-3.0\|Angus Bergman" "$f" 2>/dev/null; then
        ((ENGINES_LICENSED++))
    else
        warn "Missing license header: $f"
    fi
done
if [ "$ENGINES_TOTAL" -gt 0 ]; then
    if [ "$ENGINES_LICENSED" -eq "$ENGINES_TOTAL" ]; then
        pass "All src/engines/*.js files have license headers ($ENGINES_LICENSED/$ENGINES_TOTAL)"
    else
        fail "License headers missing in src/engines/ ($ENGINES_LICENSED/$ENGINES_TOTAL)"
    fi
fi

subsection "20.4 License headers - src/services/*.js"
SERVICES_TOTAL=0
SERVICES_LICENSED=0
for f in src/services/*.js; do
    [ -f "$f" ] || continue
    ((SERVICES_TOTAL++))
    if grep -q "AGPL-3.0\|Angus Bergman" "$f" 2>/dev/null; then
        ((SERVICES_LICENSED++))
    else
        warn "Missing license header: $f"
    fi
done
if [ "$SERVICES_TOTAL" -gt 0 ]; then
    if [ "$SERVICES_LICENSED" -eq "$SERVICES_TOTAL" ]; then
        pass "All src/services/*.js files have license headers ($SERVICES_LICENSED/$SERVICES_TOTAL)"
    else
        fail "License headers missing in src/services/ ($SERVICES_LICENSED/$SERVICES_TOTAL)"
    fi
fi

subsection "20.4 License headers - src/data/*.js"
DATA_TOTAL=0
DATA_LICENSED=0
for f in src/data/*.js; do
    [ -f "$f" ] || continue
    ((DATA_TOTAL++))
    if grep -q "AGPL-3.0\|Angus Bergman" "$f" 2>/dev/null; then
        ((DATA_LICENSED++))
    else
        warn "Missing license header: $f"
    fi
done
if [ "$DATA_TOTAL" -gt 0 ]; then
    if [ "$DATA_LICENSED" -eq "$DATA_TOTAL" ]; then
        pass "All src/data/*.js files have license headers ($DATA_LICENSED/$DATA_TOTAL)"
    else
        fail "License headers missing in src/data/ ($DATA_LICENSED/$DATA_TOTAL)"
    fi
fi

subsection "20.4 License headers - api/*.js"
API_TOTAL=0
API_LICENSED=0
API_MISSING=""
for f in api/*.js; do
    [ -f "$f" ] || continue
    ((API_TOTAL++))
    if grep -q "AGPL-3.0\|Angus Bergman" "$f" 2>/dev/null; then
        ((API_LICENSED++))
    else
        API_MISSING="$API_MISSING  $f\n"
    fi
done
# Also check api subdirectories
for f in api/admin/*.js api/device/*.js api/pair/*.js api/zone/*.js; do
    [ -f "$f" ] || continue
    ((API_TOTAL++))
    if grep -q "AGPL-3.0\|Angus Bergman" "$f" 2>/dev/null; then
        ((API_LICENSED++))
    else
        API_MISSING="$API_MISSING  $f\n"
    fi
done
if [ "$API_TOTAL" -gt 0 ]; then
    if [ "$API_LICENSED" -eq "$API_TOTAL" ]; then
        pass "All api/**/*.js files have license headers ($API_LICENSED/$API_TOTAL)"
    else
        fail "License headers missing in api/ ($API_LICENSED/$API_TOTAL):"
        echo -e "$API_MISSING" | head -10
    fi
fi

subsection "20.4 SPDX licence identifiers"
# LEGAL.md requires: SPDX-License-Identifier: AGPL-3.0-or-later
SPDX_TOTAL=0
SPDX_FOUND=0
SPDX_MISSING=""
for f in src/engines/*.js src/services/*.js src/data/*.js api/*.js api/admin/*.js api/device/*.js api/pair/*.js api/zone/*.js; do
    [ -f "$f" ] || continue
    ((SPDX_TOTAL++))
    if grep -q "SPDX-License-Identifier" "$f" 2>/dev/null; then
        ((SPDX_FOUND++))
    else
        SPDX_MISSING="$SPDX_MISSING  $f\n"
    fi
done
if [ "$SPDX_TOTAL" -gt 0 ]; then
    if [ "$SPDX_FOUND" -eq "$SPDX_TOTAL" ]; then
        pass "All source files have SPDX-License-Identifier ($SPDX_FOUND/$SPDX_TOTAL)"
    else
        fail "SPDX-License-Identifier missing from source files ($SPDX_FOUND/$SPDX_TOTAL):"
        echo -e "$SPDX_MISSING" | head -10
    fi
fi

subsection "20.4 Dual licence text in headers"
# Headers should reference dual licensing: "Dual-licensed under AGPL-3.0 and commercial terms"
DUAL_TOTAL=0
DUAL_FOUND=0
for f in src/engines/*.js src/services/*.js src/data/*.js api/*.js api/admin/*.js api/device/*.js api/pair/*.js api/zone/*.js; do
    [ -f "$f" ] || continue
    ((DUAL_TOTAL++))
    if grep -qi "dual.licen\|commercial terms\|Dual License" "$f" 2>/dev/null; then
        ((DUAL_FOUND++))
    fi
done
if [ "$DUAL_TOTAL" -gt 0 ]; then
    if [ "$DUAL_FOUND" -eq "$DUAL_TOTAL" ]; then
        pass "Dual licence text found in all file headers ($DUAL_FOUND/$DUAL_TOTAL)"
    else
        fail "Dual licence text missing from source files ($DUAL_FOUND/$DUAL_TOTAL) — all files must reference AGPL-3.0 + commercial"
    fi
fi

subsection "20.4 Copyright year consistency"
# All headers should say "Copyright (c) 2026 Angus Bergman"
WRONG_YEAR=$(grep -rn "Copyright.*Angus Bergman" src/ api/ 2>/dev/null | grep -v "2026\|node_modules" | head -5 || true)
if [ -n "$WRONG_YEAR" ]; then
    fail "Copyright headers with incorrect year (should be 2026):"
    echo "$WRONG_YEAR" | head -3
else
    pass "All copyright headers use correct year (2026)"
fi

subsection "20.7 LEGAL.md governing law clause (Australian jurisdiction)"
GOVERNING_LAW=$(grep -ci "governing law\|Laws of Victoria\|courts of Victoria" LEGAL.md 2>/dev/null || echo "0")
if [ "$GOVERNING_LAW" -gt 0 ]; then
    pass "LEGAL.md has governing law clause (Australian jurisdiction)"
else
    fail "LEGAL.md missing governing law clause — must specify Australian jurisdiction (Section 20.7)"
fi

subsection "20.8 LEGAL.md commercial licence framework"
COMMERCIAL_FRAMEWORK=$(grep -ci "commercial licen\|bespoke\|sole discretion\|commutecompute.licensing" LEGAL.md 2>/dev/null || echo "0")
if [ "$COMMERCIAL_FRAMEWORK" -gt 0 ]; then
    pass "LEGAL.md has commercial licence framework"
else
    fail "LEGAL.md missing commercial licence framework (Section 20.8)"
fi

subsection "20.9 LEGAL.md Copyright Act 1968 reference"
COPYRIGHT_ACT=$(grep -ci "Copyright Act 1968" LEGAL.md 2>/dev/null || echo "0")
if [ "$COPYRIGHT_ACT" -gt 0 ]; then
    pass "LEGAL.md references Copyright Act 1968 (Cth)"
else
    fail "LEGAL.md missing Copyright Act 1968 (Cth) reference (Section 20.9)"
fi

# ============================================================================
# GROUP 2: PER-PAGE VERIFICATION
# ============================================================================
group_header "GROUP 2: PER-PAGE VERIFICATION"

HTML_PAGES=(
    "public/index.html"
    "public/admin.html"
    "public/setup-wizard.html"
    "public/help.html"
    "public/privacy.html"
    "public/attribution.html"
    "public/journey-display.html"
    "public/preview.html"
    "public/flasher/index.html"
)

for page in "${HTML_PAGES[@]}"; do
    if [ ! -f "$page" ]; then
        skip "Page not found: $page"
        continue
    fi

    PAGE_NAME=$(basename "$(dirname "$page")")/$(basename "$page")
    if [ "$PAGE_NAME" = "public/$(basename "$page")" ]; then
        PAGE_NAME=$(basename "$page")
    fi
    subsection "Page: $PAGE_NAME"

    # 2.1 sanitize() function
    if grep -q "function sanitize" "$page" 2>/dev/null; then
        pass "$PAGE_NAME: sanitize() function present"
    else
        # Some pages (privacy, attribution, help) may not need sanitize if they have no user input
        case "$page" in
            *privacy*|*attribution*|*help*|*preview*|*journey-display*)
                warn "$PAGE_NAME: sanitize() function not found (may not be required)"
                ;;
            *)
                fail "$PAGE_NAME: sanitize() function MISSING"
                ;;
        esac
    fi

    # 2.2 cc-system-footer
    if grep -q "cc-system-footer" "$page" 2>/dev/null; then
        pass "$PAGE_NAME: cc-system-footer present"
    else
        case "$page" in
            *privacy*|*help*|*journey-display*|*preview*)
                warn "$PAGE_NAME: cc-system-footer not found (may not be required)"
                ;;
            *)
                fail "$PAGE_NAME: cc-system-footer MISSING"
                ;;
        esac
    fi

    # 2.3 Inter font
    if grep -q "fonts.googleapis.com.*Inter\|font-family.*Inter" "$page" 2>/dev/null; then
        pass "$PAGE_NAME: Inter font referenced"
    else
        warn "$PAGE_NAME: Inter font reference not found"
    fi

    # 2.4 No emojis
    PAGE_EMOJIS=$(grep -n "$EMOJI_PATTERN" "$page" 2>/dev/null | head -3 || true)
    if [ -n "$PAGE_EMOJIS" ]; then
        fail "$PAGE_NAME: EMOJIS found (Section 22.3 violation):"
        echo "$PAGE_EMOJIS" | head -3
    else
        pass "$PAGE_NAME: No emojis found"
    fi

    # 2.5 No PTV references (excluding comments about rules)
    PAGE_PTV=$(grep -n "PTV API\|PTV_API\|PTV_DEV" "$page" 2>/dev/null | grep -v "NEVER use\|Forbidden\|DEVELOPMENT\|archive\|<!--" | head -3 || true)
    if [ -n "$PAGE_PTV" ]; then
        fail "$PAGE_NAME: PTV references found:"
        echo "$PAGE_PTV"
    else
        pass "$PAGE_NAME: No forbidden PTV references"
    fi

    # 2.6 No hardcoded API keys
    PAGE_KEYS=$(grep -n "AIzaSy[a-zA-Z0-9_-]\{30,\}\|sk_live_\|sk_test_" "$page" 2>/dev/null | head -3 || true)
    if [ -n "$PAGE_KEYS" ]; then
        fail "$PAGE_NAME: Hardcoded API keys found:"
        echo "$PAGE_KEYS"
    else
        pass "$PAGE_NAME: No hardcoded API keys"
    fi
done

# Also check SVG assets for emojis
subsection "SVG Assets: Emoji Check"
SVG_EMOJI_VIOLATIONS=""
for svgfile in public/assets/*.svg; do
    if [ -f "$svgfile" ]; then
        FOUND=$(grep -n "$EMOJI_PATTERN" "$svgfile" 2>/dev/null | head -3 || true)
        if [ -n "$FOUND" ]; then
            SVG_EMOJI_VIOLATIONS="$SVG_EMOJI_VIOLATIONS\n$svgfile:\n$FOUND"
        fi
    fi
done
if [ -n "$SVG_EMOJI_VIOLATIONS" ]; then
    fail "Emojis found in SVG assets:"
    echo -e "$SVG_EMOJI_VIOLATIONS"
else
    pass "No emojis in SVG assets"
fi

# ============================================================================
# GROUP 3: PER-ENDPOINT VERIFICATION
# ============================================================================
group_header "GROUP 3: PER-ENDPOINT VERIFICATION"

# All API endpoints
API_ENDPOINTS=(
    "api/screen.js"
    "api/health.js"
    "api/version.js"
    "api/status.js"
    "api/commutecompute.js"
    "api/device-status.js"
    "api/livedash.js"
    "api/zones.js"
    "api/zonedata.js"
    "api/routes.js"
    "api/profiles.js"
    "api/save-transit-key.js"
    "api/save-google-key.js"
    "api/validate-transit-key.js"
    "api/validate-google-key.js"
    "api/sync-config.js"
    "api/cafe-details.js"
    "api/address-search.js"
    "api/attributions.js"
    "api/fullscreen.js"
    "api/kv-status.js"
    "api/system-status.js"
    "api/landing.js"
    "api/index.js"
    "api/zones-tiered.js"
    "api/debug-api-key.js"
    "api/admin/preferences.js"
    "api/admin/setup-complete.js"
    "api/admin/reset.js"
    "api/admin/resolve-stops.js"
    "api/admin/generate-webhook.js"
    "api/device/[token].js"
    "api/pair/[code].js"
    "api/zone/[id].js"
)

EP_TOTAL=0
EP_LICENSED=0
EP_OPTIONS=0
EP_ERRORS=0
EP_PTV=0
EP_KEYS=0

for ep in "${API_ENDPOINTS[@]}"; do
    if [ ! -f "$ep" ]; then
        continue
    fi
    ((EP_TOTAL++))

    # 3.1 License header
    if grep -q "AGPL-3.0\|Angus Bergman" "$ep" 2>/dev/null; then
        ((EP_LICENSED++))
    fi

    # 3.2 OPTIONS handler (CORS preflight)
    if grep -q "OPTIONS" "$ep" 2>/dev/null; then
        ((EP_OPTIONS++))
    fi

    # 3.3 Error handling
    if grep -q "catch\|status(4\|status(5" "$ep" 2>/dev/null; then
        ((EP_ERRORS++))
    fi

    # 3.4 PTV references
    EP_PTV_HIT=$(grep -n "PTV_API\|PTV_DEV\|PTV API" "$ep" 2>/dev/null | grep -v "NEVER\|Forbidden\|DEVELOPMENT" | head -1 || true)
    if [ -n "$EP_PTV_HIT" ]; then
        fail "Endpoint $ep: Forbidden PTV reference: $EP_PTV_HIT"
        ((EP_PTV++))
    fi

    # 3.5 Hardcoded API keys
    EP_KEY_HIT=$(grep -n "AIzaSy[a-zA-Z0-9_-]\{30,\}\|sk_live_\|sk_test_" "$ep" 2>/dev/null | head -1 || true)
    if [ -n "$EP_KEY_HIT" ]; then
        fail "Endpoint $ep: Hardcoded API key found: $EP_KEY_HIT"
        ((EP_KEYS++))
    fi
done

subsection "Endpoint Summary ($EP_TOTAL endpoints)"

if [ "$EP_LICENSED" -eq "$EP_TOTAL" ]; then
    pass "All $EP_TOTAL endpoints have license headers"
else
    fail "License headers: $EP_LICENSED/$EP_TOTAL endpoints"
fi

if [ "$EP_OPTIONS" -ge "$((EP_TOTAL * 7 / 10))" ]; then
    pass "OPTIONS handlers: $EP_OPTIONS/$EP_TOTAL endpoints"
else
    warn "OPTIONS handlers: $EP_OPTIONS/$EP_TOTAL endpoints (some may be missing CORS)"
fi

if [ "$EP_ERRORS" -ge "$((EP_TOTAL * 7 / 10))" ]; then
    pass "Error handling: $EP_ERRORS/$EP_TOTAL endpoints"
else
    warn "Error handling: $EP_ERRORS/$EP_TOTAL endpoints (review unhandled)"
fi

if [ "$EP_PTV" -eq 0 ]; then
    pass "No forbidden PTV references across all endpoints"
fi

if [ "$EP_KEYS" -eq 0 ]; then
    pass "No hardcoded API keys across all endpoints"
fi

# ============================================================================
# GROUP 4: DATA FLOW VERIFICATION
# ============================================================================
group_header "GROUP 4: DATA FLOW VERIFICATION"

# ---------- 4.1 Config Token Flow ----------
section "4.1 CONFIG TOKEN FLOW"

subsection "sync-config.js POST handler"
if [ -f "api/sync-config.js" ]; then
    if grep -q "POST\|req\.method" api/sync-config.js 2>/dev/null; then
        pass "sync-config.js handles POST requests"
    else
        fail "sync-config.js: POST handler not found"
    fi
else
    skip "api/sync-config.js not found"
fi

subsection "pair/[code].js KV storage"
if [ -f "api/pair/[code].js" ]; then
    if grep -q "kv\.\|KV\.\|preferences\|getPreferences\|setPreferences" "api/pair/[code].js" 2>/dev/null; then
        pass "pair/[code].js uses KV storage"
    else
        warn "pair/[code].js: KV storage usage not confirmed"
    fi
else
    skip "api/pair/[code].js not found"
fi

subsection "kv-preferences.js required functions"
if [ -f "src/data/kv-preferences.js" ]; then
    KV_FUNCS_PASS=0
    KV_FUNCS_TOTAL=0
    for func in getPreferences setPreferences getTransitApiKey setTransitApiKey; do
        ((KV_FUNCS_TOTAL++))
        if grep -q "$func" src/data/kv-preferences.js 2>/dev/null; then
            ((KV_FUNCS_PASS++))
        else
            fail "kv-preferences.js: Missing function $func"
        fi
    done
    if [ "$KV_FUNCS_PASS" -eq "$KV_FUNCS_TOTAL" ]; then
        pass "kv-preferences.js has all required functions ($KV_FUNCS_PASS/$KV_FUNCS_TOTAL)"
    fi
else
    skip "src/data/kv-preferences.js not found"
fi

# ---------- 4.2 Screen Rendering Pipeline ----------
section "4.2 SCREEN RENDERING PIPELINE"

subsection "screen.js imports"
if [ -f "api/screen.js" ]; then
    SCREEN_IMPORTS_PASS=0
    SCREEN_IMPORTS_TOTAL=0

    for import_mod in "ccdash-renderer" "opendata-client" "commute-compute"; do
        ((SCREEN_IMPORTS_TOTAL++))
        if grep -q "$import_mod" api/screen.js 2>/dev/null; then
            ((SCREEN_IMPORTS_PASS++))
        else
            fail "screen.js: Missing import from $import_mod"
        fi
    done

    for engine in "departure-confidence" "lifestyle-context" "sleep-optimiser" "alt-transit"; do
        ((SCREEN_IMPORTS_TOTAL++))
        if grep -q "$engine" api/screen.js 2>/dev/null; then
            ((SCREEN_IMPORTS_PASS++))
        else
            fail "screen.js: Missing V15.0 engine import: $engine"
        fi
    done

    if [ "$SCREEN_IMPORTS_PASS" -eq "$SCREEN_IMPORTS_TOTAL" ]; then
        pass "screen.js imports all required modules ($SCREEN_IMPORTS_PASS/$SCREEN_IMPORTS_TOTAL)"
    fi
else
    skip "api/screen.js not found"
fi

# ---------- 4.3 Admin Data Flow ----------
section "4.3 ADMIN DATA FLOW"

subsection "commutecompute.js analytics fields"
if [ -f "api/commutecompute.js" ]; then
    CC_FIELDS_PASS=0
    CC_FIELDS_TOTAL=0
    for field in "confidence_score" "confidence_resilience" "lifestyle_display"; do
        ((CC_FIELDS_TOTAL++))
        if grep -q "$field" api/commutecompute.js 2>/dev/null; then
            ((CC_FIELDS_PASS++))
        else
            fail "commutecompute.js: Missing analytics field $field"
        fi
    done
    if [ "$CC_FIELDS_PASS" -eq "$CC_FIELDS_TOTAL" ]; then
        pass "commutecompute.js exports all V15.0 analytics fields ($CC_FIELDS_PASS/$CC_FIELDS_TOTAL)"
    fi
else
    skip "api/commutecompute.js not found"
fi

subsection "admin.html API fetches"
if [ -f "public/admin.html" ]; then
    ADMIN_FETCH_PASS=0
    ADMIN_FETCH_TOTAL=0
    for api_path in "/api/commutecompute" "/api/version" "/api/device-status"; do
        ((ADMIN_FETCH_TOTAL++))
        if grep -q "$api_path" public/admin.html 2>/dev/null; then
            ((ADMIN_FETCH_PASS++))
        else
            warn "admin.html: Does not fetch from $api_path"
        fi
    done
    if [ "$ADMIN_FETCH_PASS" -eq "$ADMIN_FETCH_TOTAL" ]; then
        pass "admin.html fetches from all required APIs ($ADMIN_FETCH_PASS/$ADMIN_FETCH_TOTAL)"
    fi
else
    skip "public/admin.html not found"
fi

# ---------- 4.4 KV Storage Keys ----------
section "4.4 KV STORAGE KEYS"

subsection "cc: prefix on all KV keys"
if [ -f "src/data/kv-preferences.js" ]; then
    # Check for cc: prefixed keys
    CC_KV_KEYS=$(grep -n "cc:" src/data/kv-preferences.js 2>/dev/null | head -10 || true)
    if [ -n "$CC_KV_KEYS" ]; then
        pass "KV keys use cc: prefix in kv-preferences.js"
    else
        fail "No cc: prefixed KV keys found in kv-preferences.js"
    fi

    # Check for non-prefixed KV keys (excluding comments and cc: keys)
    NON_CC_KV=$(grep -n "kv\.get\|kv\.set" src/data/kv-preferences.js 2>/dev/null | grep -v "cc:" | grep -v "//" | head -5 || true)
    if [ -n "$NON_CC_KV" ]; then
        warn "Possible non-cc: prefixed KV keys found:"
        echo "$NON_CC_KV" | head -3
    else
        pass "All KV operations use cc: prefix"
    fi
fi

subsection "Required KV key patterns"
if [ -f "src/data/kv-preferences.js" ]; then
    for kv_key in "cc:preferences" "cc:device:status"; do
        if grep -q "$kv_key" src/data/kv-preferences.js 2>/dev/null; then
            pass "KV key pattern found: $kv_key"
        else
            warn "KV key pattern not found: $kv_key"
        fi
    done

    # Check for transit API key pattern (could be cc:api:transit_key or cc:transit-api-key)
    if grep -q "cc:api:transit\|cc:transit" src/data/kv-preferences.js 2>/dev/null; then
        pass "Transit API key KV pattern found"
    else
        warn "Transit API key KV pattern not found"
    fi
fi

# ---------- 4.5 No Mock Data Fallbacks (Section 23.6) ----------
section "4.5 NO MOCK DATA FALLBACKS (Section 23.6)"

subsection "opendata-client.js mock data check"
if [ -f "src/services/opendata-client.js" ]; then
    MOCK_ARRAY=$(grep -n "\[3,\s*8,\s*15\]\|\[3, 8, 15\]" src/services/opendata-client.js 2>/dev/null | head -3 || true)
    if [ -n "$MOCK_ARRAY" ]; then
        fail "Mock departure array [3, 8, 15] found in opendata-client.js (Section 23.6):"
        echo "$MOCK_ARRAY"
    else
        pass "No mock [3, 8, 15] array in opendata-client.js"
    fi

    MOCK_FUNC=$(grep -n "getMockDepartures\|mockDepartures\|MOCK_DEPARTURES" src/services/opendata-client.js 2>/dev/null | head -3 || true)
    if [ -n "$MOCK_FUNC" ]; then
        # Check if it's a removal comment
        MOCK_REMOVAL=$(grep -n "getMockDepartures.*removed\|// getMockDepartures\|removed.*getMockDepartures" src/services/opendata-client.js 2>/dev/null | head -1 || true)
        if [ -n "$MOCK_REMOVAL" ]; then
            pass "getMockDepartures confirmed removed (comment found)"
        else
            fail "getMockDepartures function/reference found in opendata-client.js (Section 23.6)"
        fi
    else
        pass "No getMockDepartures function in opendata-client.js"
    fi
else
    skip "src/services/opendata-client.js not found"
fi

# 23.6b: "Check timetable" is prohibited — must use "Scheduled" with isTimetableEstimate
subsection "No 'Check timetable' in source (Section 23.6)"
CHECK_TIMETABLE=$(grep -rn "Check timetable" api/ src/ public/ 2>/dev/null | head -3 || true)
if [ -z "$CHECK_TIMETABLE" ]; then
    pass "No 'Check timetable' found — timetable fallback uses 'Scheduled' labelling"
else
    fail "'Check timetable' found in source — must use 'Scheduled ~Xmin' with isTimetableEstimate: true (Section 23.6)"
    echo "$CHECK_TIMETABLE"
fi

subsection "Global mock data check"
GLOBAL_MOCK=$(grep -rn "getMockDepartures\|mockDepartures\|MOCK_DEPARTURES" src/ api/ 2>/dev/null | grep -v "removed\|// \|DEVELOPMENT\|test\|spec\|archive" | head -5 || true)
if [ -n "$GLOBAL_MOCK" ]; then
    fail "Mock departure references found outside opendata-client.js:"
    echo "$GLOBAL_MOCK"
else
    pass "No active mock departure references in codebase"
fi

# ============================================================================
# GROUP 5: CACHING VERIFICATION
# ============================================================================
group_header "GROUP 5: CACHING VERIFICATION"

# ---------- 5.1 API Endpoint Cache Headers ----------
section "5.1 API ENDPOINT CACHE HEADERS"

subsection "version.js cache (max-age=300)"
if [ -f "api/version.js" ]; then
    if grep -q "max-age=300\|max-age.*300" api/version.js 2>/dev/null; then
        pass "version.js has max-age=300 (5-min cache)"
    else
        warn "version.js: max-age=300 not found"
    fi
else
    skip "api/version.js not found"
fi

subsection "screen.js cache headers"
if [ -f "api/screen.js" ]; then
    if grep -q "Cache-Control\|cache-control\|max-age" api/screen.js 2>/dev/null; then
        pass "screen.js has cache headers set"
    else
        warn "screen.js: Cache headers not found"
    fi
else
    skip "api/screen.js not found"
fi

subsection "Mutation endpoints: no-cache/no-store"
MUTATION_ENDPOINTS=(
    "api/save-transit-key.js"
    "api/save-google-key.js"
    "api/sync-config.js"
    "api/admin/reset.js"
)
MUTATION_PASS=0
MUTATION_TOTAL=0
for mep in "${MUTATION_ENDPOINTS[@]}"; do
    if [ -f "$mep" ]; then
        ((MUTATION_TOTAL++))
        if grep -q "no-cache\|no-store\|Cache-Control" "$mep" 2>/dev/null; then
            ((MUTATION_PASS++))
        else
            warn "Mutation endpoint $mep: no cache control headers found"
        fi
    fi
done
if [ "$MUTATION_TOTAL" -gt 0 ] && [ "$MUTATION_PASS" -eq "$MUTATION_TOTAL" ]; then
    pass "All mutation endpoints have cache control ($MUTATION_PASS/$MUTATION_TOTAL)"
elif [ "$MUTATION_TOTAL" -gt 0 ]; then
    warn "Mutation endpoint cache control: $MUTATION_PASS/$MUTATION_TOTAL"
fi

subsection "Real-time endpoints: no-cache"
REALTIME_ENDPOINTS=(
    "api/commutecompute.js"
    "api/routes.js"
    "api/livedash.js"
    "api/device-status.js"
)
RT_PASS=0
RT_TOTAL=0
for rtep in "${REALTIME_ENDPOINTS[@]}"; do
    if [ -f "$rtep" ]; then
        ((RT_TOTAL++))
        if grep -q "no-cache\|no-store\|max-age=0\|Cache-Control" "$rtep" 2>/dev/null; then
            ((RT_PASS++))
        else
            warn "Real-time endpoint $rtep: cache control not found"
        fi
    fi
done
if [ "$RT_TOTAL" -gt 0 ] && [ "$RT_PASS" -eq "$RT_TOTAL" ]; then
    pass "All real-time endpoints have cache control ($RT_PASS/$RT_TOTAL)"
elif [ "$RT_TOTAL" -gt 0 ]; then
    warn "Real-time endpoint cache control: $RT_PASS/$RT_TOTAL"
fi

# ---------- 5.2 Refresh Timing (Section 19) ----------
section "5.2 REFRESH TIMING (Section 19)"

subsection "Firmware 60s refresh interval"
if [ -f "firmware/src/main.cpp" ]; then
    REFRESH_60=$(grep -n "60000\|60 \* 1000\|REFRESH_INTERVAL" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -n "$REFRESH_60" ]; then
        pass "60-second refresh interval pattern found in firmware"
    else
        warn "60-second refresh interval not confirmed in firmware"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

subsection "Client-side auto-refresh"
CLIENT_REFRESH=$(grep -rn "setInterval\|setTimeout.*refresh\|autoRefresh\|auto-refresh" public/admin.html public/index.html 2>/dev/null | head -3 || true)
if [ -n "$CLIENT_REFRESH" ]; then
    pass "Client-side auto-refresh patterns found"
else
    warn "No client-side auto-refresh patterns detected"
fi

# ---------- 5.3 In-Memory Cache TTLs (Section 24) ----------
section "5.3 IN-MEMORY CACHE TTLs (Section 24)"

subsection "Transit data: 30s TTL"
CACHE_30=$(grep -rn "30.*1000\|30000" src/ api/ 2>/dev/null | grep -i "cache\|ttl\|expire\|stale" | head -3 || true)
if [ -n "$CACHE_30" ]; then
    pass "30s cache TTL pattern found for transit data"
else
    warn "30s cache TTL pattern not found - verify transit data caching"
fi

subsection "Weather data: 5min TTL"
CACHE_300=$(grep -rn "300.*1000\|300000\|5.*min" src/ api/ 2>/dev/null | grep -i "cache\|ttl\|expire\|weather\|stale" | head -3 || true)
if [ -n "$CACHE_300" ]; then
    pass "5-minute cache TTL pattern found for weather data"
else
    warn "5-minute weather cache TTL pattern not found"
fi

# ============================================================================
# GROUP 6: VERSION CONSISTENCY (Comprehensive)
# ============================================================================
group_header "GROUP 6: VERSION CONSISTENCY (Comprehensive)"

section "6.1 VERSION SOURCE OF TRUTH (VERSION.json)"

# --------------------------------------------------------------------------
# Read ALL authoritative versions from VERSION.json using node -e
# VERSION.json is the single source of truth; api/version.js must match it.
# --------------------------------------------------------------------------
VJ_SYSTEM_VERSION=""
VJ_ENGINE_VERSION=""
VJ_RENDERER_VERSION=""
VJ_ADMIN_VERSION=""
VJ_SETUP_VERSION=""
VJ_JOURNEY_VERSION=""
VJ_LIVEDASH_VERSION=""
VJ_FIRMWARE_VERSION=""
VJ_SPEC_VERSION=""
VJ_SERVER_VERSION=""

if [ -f "VERSION.json" ]; then
    VJ_SYSTEM_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.system.version);" 2>/dev/null || true)
    VJ_ENGINE_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.commutecompute.version);" 2>/dev/null || true)
    VJ_RENDERER_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.renderer.version);" 2>/dev/null || true)
    VJ_ADMIN_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.adminPanel.version);" 2>/dev/null || true)
    VJ_SETUP_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.setupWizard.version);" 2>/dev/null || true)
    VJ_JOURNEY_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.journeyDisplay.version);" 2>/dev/null || true)
    VJ_LIVEDASH_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.components.livedash.version);" 2>/dev/null || true)
    VJ_FIRMWARE_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.firmware.version);" 2>/dev/null || true)
    VJ_SPEC_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.specs.dashboard.version);" 2>/dev/null || true)
    VJ_SERVER_VERSION=$(node -e "const v=require('./VERSION.json'); process.stdout.write(v.backend.server.version);" 2>/dev/null || true)

    pass "VERSION.json loaded: System=$VJ_SYSTEM_VERSION Engine=$VJ_ENGINE_VERSION Renderer=$VJ_RENDERER_VERSION"
    echo "    Admin=$VJ_ADMIN_VERSION Setup=$VJ_SETUP_VERSION Journey=$VJ_JOURNEY_VERSION LiveDash=$VJ_LIVEDASH_VERSION"
    echo "    Firmware=$VJ_FIRMWARE_VERSION Spec=$VJ_SPEC_VERSION Server=$VJ_SERVER_VERSION"
else
    fail "VERSION.json not found — cannot determine authoritative versions"
fi

# Also read api/version.js for cross-check
SYSTEM_VERSION=""
ENGINE_VERSION=""
RENDERER_VERSION=""
ADMIN_VERSION=""
FIRMWARE_VERSION=""
SPEC_VERSION=""

if [ -f "api/version.js" ]; then
    SYSTEM_VERSION=$(grep -o "version: '[^']*'" api/version.js 2>/dev/null | head -1 | sed "s/version: '//;s/'//" || true)
    ENGINE_VERSION=$(grep -A2 "commutecompute:" api/version.js 2>/dev/null | grep "version:" | head -1 | sed "s/.*version: '//;s/'.*//" || true)
    RENDERER_VERSION=$(grep -A2 "renderer:" api/version.js 2>/dev/null | grep "version:" | head -1 | sed "s/.*version: '//;s/'.*//" || true)
    ADMIN_VERSION=$(grep -A2 "admin:" api/version.js 2>/dev/null | grep "version:" | head -1 | sed "s/.*version: '//;s/'.*//" || true)
    FIRMWARE_VERSION=$(grep -A2 "firmware:" api/version.js 2>/dev/null | grep "version:" | head -1 | sed "s/.*version: '//;s/'.*//" || true)
    SPEC_VERSION=$(grep -o "CCDashDesignV[0-9.]*" api/version.js 2>/dev/null | head -1 || true)
    pass "api/version.js loaded: System=$SYSTEM_VERSION Engine=$ENGINE_VERSION Renderer=$RENDERER_VERSION"
else
    fail "api/version.js not found — cannot check endpoint versions"
fi

# --------------------------------------------------------------------------
# 6.1a: api/version.js must match VERSION.json
# --------------------------------------------------------------------------
subsection "api/version.js vs VERSION.json cross-check"
if [ -n "$VJ_SYSTEM_VERSION" ] && [ -n "$SYSTEM_VERSION" ]; then
    SV_CLEAN=$(echo "$SYSTEM_VERSION" | sed 's/^v//')
    if [ "$SV_CLEAN" = "$VJ_SYSTEM_VERSION" ]; then
        pass "api/version.js system version ($SYSTEM_VERSION) matches VERSION.json ($VJ_SYSTEM_VERSION)"
    else
        fail "api/version.js system version ($SYSTEM_VERSION) does NOT match VERSION.json ($VJ_SYSTEM_VERSION)"
    fi

    EV_CLEAN=$(echo "$ENGINE_VERSION" | sed 's/^v//')
    if [ "$EV_CLEAN" = "$VJ_ENGINE_VERSION" ]; then
        pass "api/version.js engine version ($ENGINE_VERSION) matches VERSION.json ($VJ_ENGINE_VERSION)"
    else
        fail "api/version.js engine version ($ENGINE_VERSION) does NOT match VERSION.json ($VJ_ENGINE_VERSION)"
    fi

    RV_CLEAN=$(echo "$RENDERER_VERSION" | sed 's/^v//')
    if [ "$RV_CLEAN" = "$VJ_RENDERER_VERSION" ]; then
        pass "api/version.js renderer version ($RENDERER_VERSION) matches VERSION.json ($VJ_RENDERER_VERSION)"
    else
        fail "api/version.js renderer version ($RENDERER_VERSION) does NOT match VERSION.json ($VJ_RENDERER_VERSION)"
    fi

    if [ -n "$SPEC_VERSION" ] && [ -n "$VJ_SPEC_VERSION" ]; then
        if [ "$SPEC_VERSION" = "$VJ_SPEC_VERSION" ]; then
            pass "api/version.js spec version ($SPEC_VERSION) matches VERSION.json ($VJ_SPEC_VERSION)"
        else
            fail "api/version.js spec version ($SPEC_VERSION) does NOT match VERSION.json ($VJ_SPEC_VERSION)"
        fi
    fi

    FW_CLEAN=$(echo "$FIRMWARE_VERSION" | sed 's/^CC-FW-//')
    if [ "$FW_CLEAN" = "$VJ_FIRMWARE_VERSION" ]; then
        pass "api/version.js firmware version ($FIRMWARE_VERSION) matches VERSION.json ($VJ_FIRMWARE_VERSION)"
    else
        fail "api/version.js firmware version ($FIRMWARE_VERSION) does NOT match VERSION.json ($VJ_FIRMWARE_VERSION)"
    fi
else
    warn "Cannot cross-check api/version.js vs VERSION.json — one or both missing"
fi

# --------------------------------------------------------------------------
# 6.1b: package.json version must match VERSION.json system version
# --------------------------------------------------------------------------
subsection "package.json version vs VERSION.json"
if [ -f "package.json" ] && [ -n "$VJ_SYSTEM_VERSION" ]; then
    PKG_VERSION=$(node -e "const p=require('./package.json'); process.stdout.write(p.version);" 2>/dev/null || true)
    if [ -n "$PKG_VERSION" ]; then
        if [ "$PKG_VERSION" = "$VJ_SYSTEM_VERSION" ]; then
            pass "package.json version ($PKG_VERSION) matches VERSION.json system version ($VJ_SYSTEM_VERSION)"
        else
            fail "package.json version ($PKG_VERSION) does NOT match VERSION.json system version ($VJ_SYSTEM_VERSION)"
        fi
    else
        warn "Could not read package.json version"
    fi
else
    warn "package.json or VERSION.json missing — cannot compare"
fi

section "6.2 HTML FOOTER VERSION CONSISTENCY (ALL 10 PAGES)"

# --------------------------------------------------------------------------
# Check ALL HTML pages for three types of version references:
#   1. Hardcoded fallback values in footer HTML elements
#   2. JavaScript fallback values in loadFooterVersions / catch blocks
#   3. System version in footer elements
# --------------------------------------------------------------------------

# All pages to check (all HTML files in public/ and flasher)
HTML_PAGES=(
    "public/admin.html"
    "public/setup-wizard.html"
    "public/journey-display.html"
    "public/help.html"
    "public/privacy.html"
    "public/legal.html"
    "public/preview.html"
    "public/index.html"
    "public/attribution.html"
    "public/flasher/index.html"
)

# Clean versions for comparison (strip leading 'v')
SYS_CLEAN=$(echo "$VJ_SYSTEM_VERSION" | sed 's/^v//')
ENG_CLEAN=$(echo "$VJ_ENGINE_VERSION" | sed 's/^v//')
REN_CLEAN=$(echo "$VJ_RENDERER_VERSION" | sed 's/^v//')
FW_CLEAN_VJ="$VJ_FIRMWARE_VERSION"

subsection "Footer system version references (all pages)"
for page in "${HTML_PAGES[@]}"; do
    if [ -f "$page" ]; then
        PAGE_NAME=$(basename "$page")
        [ "$PAGE_NAME" = "index.html" ] && [ "$(dirname "$page")" = "public/flasher" ] && PAGE_NAME="flasher/index.html"

        # Check system version in footer HTML — match v4.2.0 OR 4.2.0 (JS fallback prepends 'v')
        SYS_FOUND=$(grep -c "${SYS_CLEAN}" "$page" 2>/dev/null || echo "0")
        if [ "$SYS_FOUND" -gt 0 ]; then
            pass "$PAGE_NAME: System version ${SYS_CLEAN} found"
        else
            fail "$PAGE_NAME: System version ${SYS_CLEAN} NOT found in page"
        fi
    else
        skip "$page not found"
    fi
done

subsection "Footer engine version fallbacks (all pages)"
for page in "${HTML_PAGES[@]}"; do
    if [ -f "$page" ]; then
        PAGE_NAME=$(basename "$page")
        [ "$PAGE_NAME" = "index.html" ] && [ "$(dirname "$page")" = "public/flasher" ] && PAGE_NAME="flasher/index.html"

        # Check for engine version in JS fallback (e.g., || 'v3.1' or >v3.1<)
        ENG_FOUND=$(grep -c "v${ENG_CLEAN}" "$page" 2>/dev/null || echo "0")
        if [ "$ENG_FOUND" -gt 0 ]; then
            pass "$PAGE_NAME: Engine version v${ENG_CLEAN} found"
        else
            # Some pages use placeholder '--' and load dynamically — only warn
            HAS_DYNAMIC=$(grep -c "api/version" "$page" 2>/dev/null || echo "0")
            if [ "$HAS_DYNAMIC" -gt 0 ]; then
                warn "$PAGE_NAME: Engine version v${ENG_CLEAN} not in static fallback (dynamic load present)"
            else
                fail "$PAGE_NAME: Engine version v${ENG_CLEAN} NOT found and no dynamic loading"
            fi
        fi
    fi
done

subsection "Footer renderer version fallbacks (all pages)"
for page in "${HTML_PAGES[@]}"; do
    if [ -f "$page" ]; then
        PAGE_NAME=$(basename "$page")
        [ "$PAGE_NAME" = "index.html" ] && [ "$(dirname "$page")" = "public/flasher" ] && PAGE_NAME="flasher/index.html"

        REN_FOUND=$(grep -c "v${REN_CLEAN}" "$page" 2>/dev/null || echo "0")
        if [ "$REN_FOUND" -gt 0 ]; then
            pass "$PAGE_NAME: Renderer version v${REN_CLEAN} found"
        else
            HAS_DYNAMIC=$(grep -c "api/version" "$page" 2>/dev/null || echo "0")
            if [ "$HAS_DYNAMIC" -gt 0 ]; then
                warn "$PAGE_NAME: Renderer version v${REN_CLEAN} not in static fallback (dynamic load present)"
            else
                fail "$PAGE_NAME: Renderer version v${REN_CLEAN} NOT found and no dynamic loading"
            fi
        fi
    fi
done

subsection "Footer firmware version (flasher page)"
if [ -f "public/flasher/index.html" ] && [ -n "$FW_CLEAN_VJ" ]; then
    FW_FOUND=$(grep -c "$FW_CLEAN_VJ" "public/flasher/index.html" 2>/dev/null || echo "0")
    if [ "$FW_FOUND" -gt 0 ]; then
        pass "flasher/index.html: Firmware version $FW_CLEAN_VJ found"
    else
        fail "flasher/index.html: Firmware version $FW_CLEAN_VJ NOT found"
    fi
fi

subsection "Stale version detection in HTML JS fallbacks"
# Check for obviously stale engine/renderer fallback versions in JS
# Current engine is VJ_ENGINE_VERSION; stale would be anything older
for page in "${HTML_PAGES[@]}"; do
    if [ -f "$page" ]; then
        PAGE_NAME=$(basename "$page")
        [ "$PAGE_NAME" = "index.html" ] && [ "$(dirname "$page")" = "public/flasher" ] && PAGE_NAME="flasher/index.html"

        # Look for JS fallback patterns like || 'v3.0' or || 'v2.0' that don't match current
        STALE_ENGINE=$(grep -n "|| 'v[0-9]" "$page" 2>/dev/null | grep "commutecompute-version\|commutecompute\.version" | grep -v "v${ENG_CLEAN}" | head -3 || true)
        if [ -n "$STALE_ENGINE" ]; then
            fail "$PAGE_NAME: Stale engine fallback (expected v${ENG_CLEAN}):"
            echo "    $STALE_ENGINE"
        fi

        STALE_RENDERER=$(grep -n "|| 'v[0-9]" "$page" 2>/dev/null | grep "renderer-version\|renderer\.version" | grep -v "v${REN_CLEAN}" | head -3 || true)
        if [ -n "$STALE_RENDERER" ]; then
            fail "$PAGE_NAME: Stale renderer fallback (expected v${REN_CLEAN}):"
            echo "    $STALE_RENDERER"
        fi

        STALE_SYSTEM=$(grep -n "|| '[0-9]\||| 'v[0-9]" "$page" 2>/dev/null | grep "system.version\|system-version" | grep -v "${SYS_CLEAN}" | head -3 || true)
        if [ -n "$STALE_SYSTEM" ]; then
            fail "$PAGE_NAME: Stale system fallback (expected ${SYS_CLEAN}):"
            echo "    $STALE_SYSTEM"
        fi
    fi
done

section "6.3 ADMIN ARCHITECTURE DIAGRAM VERSIONS"

# --------------------------------------------------------------------------
# admin.html contains ASCII architecture diagrams with inline version strings
# These must match VERSION.json values.
# --------------------------------------------------------------------------
subsection "Architecture diagram version strings"
if [ -f "public/admin.html" ] && [ -n "$VJ_SYSTEM_VERSION" ]; then
    # System architecture header (e.g., "ARCHITECTURE v4.2.0")
    ARCH_SYS=$(grep -c "ARCHITECTURE v${SYS_CLEAN}" "public/admin.html" 2>/dev/null || echo "0")
    if [ "$ARCH_SYS" -gt 0 ]; then
        pass "admin.html: Architecture diagram system version v${SYS_CLEAN} found"
    else
        fail "admin.html: Architecture diagram missing system version v${SYS_CLEAN}"
    fi

    # Engine version in diagram (e.g., "CommuteCompute Engine v3.1")
    ARCH_ENG=$(grep -c "Engine v${ENG_CLEAN}" "public/admin.html" 2>/dev/null || echo "0")
    if [ "$ARCH_ENG" -gt 0 ]; then
        pass "admin.html: Architecture diagram engine version v${ENG_CLEAN} found"
    else
        fail "admin.html: Architecture diagram missing engine version v${ENG_CLEAN}"
    fi

    # Renderer version in diagram (e.g., "Renderer v2.1")
    ARCH_REN=$(grep -c "Renderer v${REN_CLEAN}" "public/admin.html" 2>/dev/null || echo "0")
    if [ "$ARCH_REN" -gt 0 ]; then
        pass "admin.html: Architecture diagram renderer version v${REN_CLEAN} found"
    else
        fail "admin.html: Architecture diagram missing renderer version v${REN_CLEAN}"
    fi

    # Firmware version in diagram (e.g., "CC-FW-8.1.0")
    ARCH_FW=$(grep -c "CC-FW-${FW_CLEAN_VJ}" "public/admin.html" 2>/dev/null || echo "0")
    if [ "$ARCH_FW" -gt 0 ]; then
        pass "admin.html: Architecture diagram firmware version CC-FW-${FW_CLEAN_VJ} found"
    else
        fail "admin.html: Architecture diagram missing firmware version CC-FW-${FW_CLEAN_VJ}"
    fi

    # Grid system version element (e.g., "v4.2.0" in cc-grid-system-version)
    GRID_SYS=$(grep -c "cc-grid-system-version" "public/admin.html" 2>/dev/null || echo "0")
    if [ "$GRID_SYS" -gt 0 ]; then
        GRID_VER=$(grep "cc-grid-system-version" "public/admin.html" 2>/dev/null | grep -o "v[0-9][0-9.]*" | head -1 || true)
        if [ "$GRID_VER" = "v${SYS_CLEAN}" ]; then
            pass "admin.html: Grid system version display ($GRID_VER) matches VERSION.json"
        else
            fail "admin.html: Grid system version display ($GRID_VER) does NOT match VERSION.json (expected v${SYS_CLEAN})"
        fi
    fi
fi

section "6.4 MARKDOWN FILE VERSION REFERENCES"

# --------------------------------------------------------------------------
# Check README.md for all key version references
# --------------------------------------------------------------------------
subsection "README.md version references"
if [ -f "README.md" ]; then
    README_SYS=$(grep -Ec "v${SYS_CLEAN}|System v${SYS_CLEAN}|System&#8482; v${SYS_CLEAN}" README.md 2>/dev/null | head -1 || echo "0")
    if [ "$README_SYS" -gt 0 ]; then
        pass "README.md: System version v${SYS_CLEAN} referenced"
    else
        warn "README.md: System version v${SYS_CLEAN} not found"
    fi

    README_ENG=$(grep -c "Engine v${ENG_CLEAN}" README.md 2>/dev/null || echo "0")
    if [ "$README_ENG" -gt 0 ]; then
        pass "README.md: Engine version v${ENG_CLEAN} referenced"
    else
        warn "README.md: Engine version v${ENG_CLEAN} not found"
    fi

    README_REN=$(grep -c "Renderer v${REN_CLEAN}" README.md 2>/dev/null || echo "0")
    if [ "$README_REN" -gt 0 ]; then
        pass "README.md: Renderer version v${REN_CLEAN} referenced"
    else
        warn "README.md: Renderer version v${REN_CLEAN} not found"
    fi

    README_FW=$(grep -Ec "v${FW_CLEAN_VJ}|CCFirm.*${FW_CLEAN_VJ}" README.md 2>/dev/null | head -1 || echo "0")
    if [ "$README_FW" -gt 0 ]; then
        pass "README.md: Firmware version ${FW_CLEAN_VJ} referenced"
    else
        warn "README.md: Firmware version ${FW_CLEAN_VJ} not found"
    fi

    # Check for badge version strings (e.g., shield.io badge URLs)
    README_BADGE_FW=$(grep -Ec "Firmware.*${FW_CLEAN_VJ}|CCFirm.*v${FW_CLEAN_VJ}" README.md 2>/dev/null | head -1 || echo "0")
    if [ "$README_BADGE_FW" -gt 0 ]; then
        pass "README.md: Firmware badge references v${FW_CLEAN_VJ}"
    else
        warn "README.md: Firmware badge may not reference v${FW_CLEAN_VJ}"
    fi
else
    warn "README.md not found"
fi

# --------------------------------------------------------------------------
# Check CONTRIBUTING.md for spec version references
# --------------------------------------------------------------------------
subsection "CONTRIBUTING.md spec version"
if [ -f "CONTRIBUTING.md" ] && [ -n "$VJ_SPEC_VERSION" ]; then
    CONTRIB_SPEC=$(grep -c "$VJ_SPEC_VERSION" CONTRIBUTING.md 2>/dev/null || echo "0")
    if [ "$CONTRIB_SPEC" -gt 0 ]; then
        pass "CONTRIBUTING.md: Spec version $VJ_SPEC_VERSION referenced"
    else
        # Check for major version match (e.g., CCDashDesignV15 without .0)
        SPEC_MAJOR=$(echo "$VJ_SPEC_VERSION" | sed 's/\.0$//')
        CONTRIB_SPEC_MAJOR=$(grep -c "$SPEC_MAJOR" CONTRIBUTING.md 2>/dev/null || echo "0")
        if [ "$CONTRIB_SPEC_MAJOR" -gt 0 ]; then
            pass "CONTRIBUTING.md: Spec version $SPEC_MAJOR referenced (major version match)"
        else
            warn "CONTRIBUTING.md: Spec version $VJ_SPEC_VERSION not found"
        fi
    fi
elif [ -f "CONTRIBUTING.md" ]; then
    warn "CONTRIBUTING.md: Cannot check spec version — VJ_SPEC_VERSION not available"
else
    skip "CONTRIBUTING.md not found"
fi

# --------------------------------------------------------------------------
# Check docs/ markdown files for version references
# --------------------------------------------------------------------------
subsection "Documentation files version references"
for docfile in docs/CHANGELOG.md docs/COMMUTE-COMPUTE-COMPLETE-OVERVIEW.md docs/PROJECT-VISION.md docs/hardware/DEVICE-COMPATIBILITY.md docs/setup/SETUP-WIZARD-ARCHITECTURE.md; do
    if [ -f "$docfile" ]; then
        DOC_NAME=$(basename "$docfile")
        DOC_SYS=$(grep -c "${SYS_CLEAN}" "$docfile" 2>/dev/null | head -1 || echo "0")
        if [ "$DOC_SYS" -gt 0 ]; then
            pass "$DOC_NAME: References current system version ${SYS_CLEAN}"
        else
            warn "$DOC_NAME: Does not reference current system version ${SYS_CLEAN}"
        fi
    fi
done

section "6.5 JAVASCRIPT SOURCE FILE VERSION CONSISTENCY"

# --------------------------------------------------------------------------
# Check ccdash-renderer.js for correct CCDashDesignV spec reference
# --------------------------------------------------------------------------
subsection "ccdash-renderer.js spec reference"
if [ -f "src/services/ccdash-renderer.js" ] && [ -n "$VJ_SPEC_VERSION" ]; then
    RENDERER_SPEC_REFS=$(grep -c "$VJ_SPEC_VERSION" "src/services/ccdash-renderer.js" 2>/dev/null || echo "0")
    if [ "$RENDERER_SPEC_REFS" -gt 0 ]; then
        pass "ccdash-renderer.js: References $VJ_SPEC_VERSION ($RENDERER_SPEC_REFS occurrences)"
    else
        # Check for major version match
        SPEC_MAJOR=$(echo "$VJ_SPEC_VERSION" | sed 's/\.0$//')
        RENDERER_SPEC_MAJOR=$(grep -c "$SPEC_MAJOR" "src/services/ccdash-renderer.js" 2>/dev/null || echo "0")
        if [ "$RENDERER_SPEC_MAJOR" -gt 0 ]; then
            pass "ccdash-renderer.js: References $SPEC_MAJOR ($RENDERER_SPEC_MAJOR occurrences)"
        else
            fail "ccdash-renderer.js: Does NOT reference spec $VJ_SPEC_VERSION or $SPEC_MAJOR"
        fi
    fi

    # Check for stale spec references (any CCDashDesignV that is NOT the current version)
    SPEC_NUM=$(echo "$VJ_SPEC_VERSION" | grep -o "[0-9]\+" | head -1)
    STALE_SPEC=$(grep -n "CCDashDesignV[0-9]" "src/services/ccdash-renderer.js" 2>/dev/null | grep -v "CCDashDesignV${SPEC_NUM}" | head -5 || true)
    if [ -n "$STALE_SPEC" ]; then
        fail "ccdash-renderer.js: Stale spec references found (expected V${SPEC_NUM}):"
        echo "    $STALE_SPEC"
    else
        pass "ccdash-renderer.js: No stale CCDashDesignV references"
    fi
fi

# --------------------------------------------------------------------------
# Check ALL JS files for stale CCDashDesignV references
# --------------------------------------------------------------------------
subsection "All JS files: stale CCDashDesignV references"
if [ -n "$VJ_SPEC_VERSION" ]; then
    SPEC_NUM=$(echo "$VJ_SPEC_VERSION" | grep -o "[0-9]\+" | head -1)
    STALE_JS_SPECS=$(grep -rn "CCDashDesignV[0-9]" src/ api/ 2>/dev/null | grep -v "CCDashDesignV${SPEC_NUM}" | grep -v "node_modules" | head -10 || true)
    if [ -n "$STALE_JS_SPECS" ]; then
        fail "Stale CCDashDesignV references in JS files (expected V${SPEC_NUM}):"
        echo "$STALE_JS_SPECS" | while read -r line; do echo "    $line"; done
    else
        pass "No stale CCDashDesignV references in src/ or api/"
    fi
fi

section "6.6 SPEC FILE"

subsection "Current spec file exists"
if [ -n "$VJ_SPEC_VERSION" ]; then
    # Check for the spec file matching current version (e.g., CCDashDesignV15.md)
    SPEC_FILE=$(find specs/ -name "${VJ_SPEC_VERSION}*" -o -name "$(echo "$VJ_SPEC_VERSION" | sed 's/\.0$//')*" 2>/dev/null | head -1 || true)
    if [ -n "$SPEC_FILE" ]; then
        pass "Current spec file found: $SPEC_FILE"
    else
        # Try common patterns
        SPEC_NUM=$(echo "$VJ_SPEC_VERSION" | grep -o "[0-9]\+" | head -1)
        SPEC_FILE_ALT=$(find specs/ -name "*V${SPEC_NUM}*" 2>/dev/null | head -1 || true)
        if [ -n "$SPEC_FILE_ALT" ]; then
            pass "Spec file found: $SPEC_FILE_ALT"
        else
            fail "Spec file for $VJ_SPEC_VERSION not found in specs/"
        fi
    fi
else
    warn "Could not determine current spec version"
fi

# ============================================================================
# GROUP 7: SECURITY (Section 17 Expanded)
# ============================================================================
group_header "GROUP 7: SECURITY (Section 17 Expanded)"

section "SECTION 17: SECURITY (COMPREHENSIVE)"

subsection "17.1 XSS: sanitize() in interactive pages"
INTERACTIVE_PAGES=("public/admin.html" "public/setup-wizard.html" "public/index.html" "public/flasher/index.html")
SANITIZE_PASS=0
SANITIZE_TOTAL=0
for ipage in "${INTERACTIVE_PAGES[@]}"; do
    if [ -f "$ipage" ]; then
        ((SANITIZE_TOTAL++))
        if grep -q "function sanitize" "$ipage" 2>/dev/null; then
            ((SANITIZE_PASS++))
        else
            fail "sanitize() function missing from $ipage"
        fi
    fi
done
if [ "$SANITIZE_TOTAL" -gt 0 ] && [ "$SANITIZE_PASS" -eq "$SANITIZE_TOTAL" ]; then
    pass "sanitize() present in all interactive pages ($SANITIZE_PASS/$SANITIZE_TOTAL)"
fi

subsection "17.1 XSS: unsanitized innerHTML"
UNSAFE_INNERHTML=$(grep -rn 'innerHTML.*\${[^}]*}' public/*.html 2>/dev/null | grep -v "sanitize\|icon\|svg\|archive/" | head -5 || true)
if [ -n "$UNSAFE_INNERHTML" ]; then
    warn "Potential unsanitized innerHTML (verify sanitize() is used):"
    echo "$UNSAFE_INNERHTML" | head -3
else
    pass "No obviously unsanitized innerHTML patterns"
fi

subsection "17.2 API key validation before KV storage"
if [ -f "src/data/kv-preferences.js" ]; then
    KEY_VALIDATE=$(grep -n "validate\|\.length\|typeof.*string\|!.*key\|!.*apiKey" src/data/kv-preferences.js 2>/dev/null | head -3 || true)
    if [ -n "$KEY_VALIDATE" ]; then
        pass "API key validation patterns found in kv-preferences.js"
    else
        warn "No explicit key validation found in kv-preferences.js"
    fi
fi

subsection "17.4 No hardcoded personal information"
# Check for personal address patterns
PERSONAL_ADDR=$(grep -rn "[0-9]\+ [A-Z][a-z]*\(Street\|St\|Road\|Rd\|Ave\|Avenue\)" src/ api/ 2>/dev/null | grep -v "Example\|Sample\|test\|placeholder\|archive/" | head -5 || true)
if [ -n "$PERSONAL_ADDR" ]; then
    warn "Potential hardcoded addresses (verify they're examples):"
    echo "$PERSONAL_ADDR" | head -3
else
    pass "No suspicious hardcoded addresses found"
fi

# Expanded coordinate check
COORDS=$(grep -rn "\-37\.[0-9][0-9][0-9]" src/ api/ 2>/dev/null | grep -v "8136\|DEFAULT\|example\|test\|MELBOURNE_CBD\|MELBOURNE_CENTER\|default\|fallback" | head -5 || true)
if [ -n "$COORDS" ]; then
    warn "Potential hardcoded coordinates (verify they're defaults):"
    echo "$COORDS" | head -3
else
    pass "No suspicious hardcoded coordinates found"
fi

subsection "17.5 No environment files"
pass "Environment file check (covered in Section 3)"

subsection "17.6 Path traversal prevention"
PATH_TRAVERSAL=$(grep -rn "req\.\(query\|params\|body\).*path\.\(join\|resolve\)" api/ 2>/dev/null | grep -v "basename" | head -3 || true)
if [ -n "$PATH_TRAVERSAL" ]; then
    warn "Possible path traversal vulnerability (verify path.basename is used):"
    echo "$PATH_TRAVERSAL"
else
    pass "No obvious path traversal vulnerabilities"
fi

subsection "17.7 Supply chain: package-lock.json"
if [ -f "package-lock.json" ]; then
    pass "package-lock.json exists (dependency locking)"
else
    fail "package-lock.json missing (dependencies not locked)"
fi

subsection "17.7 npm audit"
if command -v npm &> /dev/null && [ -f "package.json" ]; then
    AUDIT_RESULT=$(npm audit --audit-level=high 2>&1 | grep -c "found 0 vulnerabilities" || echo "0")
    if [ "$AUDIT_RESULT" -gt 0 ]; then
        pass "npm audit shows no high/critical vulnerabilities"
    else
        warn "npm audit may have findings - run 'npm audit' for details"
    fi
else
    skip "npm not available for audit check"
fi

subsection "17.8 CSP headers (vercel.json)"
if [ -f "vercel.json" ]; then
    CSP_CHECK=$(grep -c "Content-Security-Policy" vercel.json 2>/dev/null || echo "0")
    if [ "$CSP_CHECK" -gt 0 ]; then
        pass "Content-Security-Policy header configured in vercel.json"
    else
        warn "CSP headers not found in vercel.json (recommended)"
    fi

    X_FRAME=$(grep -c "X-Frame-Options" vercel.json 2>/dev/null || echo "0")
    if [ "$X_FRAME" -gt 0 ]; then
        pass "X-Frame-Options header configured"
    else
        warn "X-Frame-Options header not found (recommended)"
    fi
else
    warn "vercel.json not found - security headers may not be configured"
fi

subsection "17.9 Sensitive data in console.log"
SENSITIVE_LOGS=$(grep -rn "console.log.*\(apiKey\|password\|secret\|token\)" src/ api/ 2>/dev/null | grep -v "//\|sanitize" | head -3 || true)
if [ -n "$SENSITIVE_LOGS" ]; then
    warn "Possible sensitive data in logs (review):"
    echo "$SENSITIVE_LOGS"
else
    pass "No sensitive data patterns in console.log"
fi

subsection "17.12 HTTPS enforcement"
# Check for http:// URLs (should be https://)
HTTP_URLS=$(grep -rn "http://" src/ api/ 2>/dev/null | grep -v "localhost\|127.0.0.1\|http://\*\|//.*http\|www\.w3\.org\|http://schemas" | head -5 || true)
if [ -n "$HTTP_URLS" ]; then
    fail "Non-HTTPS URLs found (Section 17.12 requires HTTPS):"
    echo "$HTTP_URLS"
else
    pass "No non-HTTPS external URLs found"
fi

subsection "17.12 BOM URLs HTTPS check"
BOM_HTTP=$(grep -rn "http://.*bom\.gov\.au\|http://.*bureau" src/ api/ 2>/dev/null | head -3 || true)
if [ -n "$BOM_HTTP" ]; then
    fail "BOM URLs using HTTP instead of HTTPS:"
    echo "$BOM_HTTP"
else
    pass "BOM URLs use HTTPS (or not present)"
fi

subsection "17.14 No hardcoded Vercel deployment URLs in source"
# Check all source directories for real Vercel deployment URLs (excluding placeholder and docs)
HARDCODED_VERCEL_ALL=$(grep -rn "[a-zA-Z0-9_-]*\.vercel\.app" src/ api/ public/ firmware/ 2>/dev/null \
    | grep -v "your-project\.vercel\.app\|your-deployment\.vercel\.app\|your-vercel-url\.vercel\.app\|commute-compute-abc123\.vercel\.app" \
    | grep -v "node_modules\|archive/\|\.md:\|\.bin" \
    | grep -v "//.*example\|//.*placeholder\|//.*template\|#.*example\|#.*placeholder\|#.*Usage" \
    | head -10 || true)
if [ -n "$HARDCODED_VERCEL_ALL" ]; then
    fail "Hardcoded Vercel deployment URLs found in source (security risk — use BLE provisioning or config):"
    echo "$HARDCODED_VERCEL_ALL"
else
    pass "No hardcoded Vercel deployment URLs in source (excluding placeholder)"
fi

subsection "17.13 Input validation patterns"
VALIDATION_CHECK=$(grep -rn "parseInt\|Number\(\|isNaN\|typeof.*===\|\.trim()" api/ 2>/dev/null | head -3 || true)
if [ -n "$VALIDATION_CHECK" ]; then
    pass "Input validation patterns found in API"
else
    warn "Limited input validation patterns found - review API endpoints"
fi

# ============================================================================
# GROUP 8: ARCHITECTURE & DESIGN (Sections 4-5, 7-10, 11-13, 16, 21-24)
# ============================================================================
group_header "GROUP 8: ARCHITECTURE & DESIGN (Sections 4-5, 7-13, 16, 21-24)"

# ---------- Section 4: Required Endpoints ----------
section "SECTION 4: SYSTEM ARCHITECTURE RULES"

subsection "4.5 Required endpoints"
for endpoint in zones screen livedash status health; do
    if [ -f "api/$endpoint.js" ]; then
        pass "/api/$endpoint endpoint exists"
    else
        fail "/api/$endpoint endpoint MISSING (required by Section 4.5)"
    fi
done

subsection "4.3 Caching in opendata-client"
if [ -f "src/services/opendata-client.js" ]; then
    CACHE_PATTERN=$(grep -n "cache\|Cache\|TTL\|ttl" src/services/opendata-client.js 2>/dev/null | head -3 || true)
    if [ -n "$CACHE_PATTERN" ]; then
        pass "Caching patterns found in opendata-client.js"
    else
        warn "No caching patterns found in opendata-client.js"
    fi
else
    skip "src/services/opendata-client.js not found"
fi

# ---------- Section 5: Firmware ----------
section "SECTION 5: CUSTOM FIRMWARE REQUIREMENT"

subsection "5.2 Firmware directory structure"
if [ -d "firmware" ]; then
    pass "firmware/ directory exists"

    if [ -f "firmware/src/main.cpp" ]; then
        pass "firmware/src/main.cpp exists"
    else
        skip "firmware/src/main.cpp not found"
    fi

    if [ -f "firmware/platformio.ini" ]; then
        pass "firmware/platformio.ini exists"
    else
        warn "firmware/platformio.ini not found"
    fi
else
    skip "firmware/ directory not found"
fi

subsection "5.4 Anti-brick patterns"
if [ -f "firmware/src/main.cpp" ]; then
    # Check for deepSleep guard
    DEEPSLEEP=$(grep -n "deepSleep\|esp_deep_sleep" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -n "$DEEPSLEEP" ]; then
        # Verify it's guarded (not in setup())
        DEEPSLEEP_SETUP=$(grep -A2 "void setup" firmware/src/main.cpp 2>/dev/null | grep -c "deepSleep" || echo "0")
        if [ "$DEEPSLEEP_SETUP" -gt 0 ]; then
            fail "Unguarded deepSleep in setup() - anti-brick violation"
        else
            pass "deepSleep is properly guarded (not in setup)"
        fi
    else
        pass "No immediate deepSleep calls detected"
    fi

    # Watchdog check
    WATCHDOG=$(grep -n "esp_task_wdt\|wdt_" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -z "$WATCHDOG" ]; then
        pass "No watchdog timer usage"
    else
        warn "Watchdog timer found (verify correct usage):"
        echo "$WATCHDOG" | head -2
    fi

    # Brownout detection
    BROWNOUT=$(grep -n "BROWN_OUT\|brownout" firmware/src/main.cpp 2>/dev/null | head -1 || true)
    if [ -n "$BROWNOUT" ]; then
        pass "Brownout detection handling present"
    else
        warn "No brownout handling found (recommended for ESP32-C3)"
    fi
fi

subsection "5.5 BLE provisioning: CC000004 URL characteristic"
if [ -f "firmware/src/main.cpp" ]; then
    BLE_URL_CHAR=$(grep -n "BLE_CHAR_URL_UUID" firmware/src/main.cpp 2>/dev/null | head -1 || true)
    if [ -n "$BLE_URL_CHAR" ]; then
        pass "BLE_CHAR_URL_UUID (CC000004) defined in firmware"
    else
        fail "BLE_CHAR_URL_UUID not defined in firmware/src/main.cpp (CC000004 characteristic required for BLE provisioning)"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

subsection "5.5 No hardcoded Vercel deployment URLs in firmware"
if [ -f "firmware/src/main.cpp" ]; then
    # Check for real deployment URLs in firmware (allow placeholder URLs)
    HARDCODED_VERCEL_FW=$(grep -rn "[a-zA-Z0-9_-]*\.vercel\.app" firmware/src/ 2>/dev/null | grep -v "your-project\.vercel\.app\|your-deployment\.vercel\.app\|//.*placeholder\|//.*example" | head -5 || true)
    if [ -n "$HARDCODED_VERCEL_FW" ]; then
        fail "Hardcoded Vercel deployment URLs found in firmware source (must use BLE provisioning):"
        echo "$HARDCODED_VERCEL_FW"
    else
        pass "No hardcoded Vercel deployment URLs in firmware source"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

subsection "5.5 DEFAULT_SERVER uses placeholder URL only"
if [ -f "firmware/src/main.cpp" ]; then
    DEFAULT_SERVER_LINE=$(grep -n "DEFAULT_SERVER" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -n "$DEFAULT_SERVER_LINE" ]; then
        # Verify it contains the placeholder, not a real deployment URL
        DEFAULT_SERVER_PLACEHOLDER=$(echo "$DEFAULT_SERVER_LINE" | grep "your-project\.vercel\.app" || true)
        DEFAULT_SERVER_REAL=$(echo "$DEFAULT_SERVER_LINE" | grep -v "your-project\.vercel\.app\|//\|#define" | grep "\.vercel\.app" || true)
        if [ -n "$DEFAULT_SERVER_REAL" ]; then
            fail "DEFAULT_SERVER contains a real deployment URL (should be your-project.vercel.app placeholder):"
            echo "$DEFAULT_SERVER_REAL"
        elif [ -n "$DEFAULT_SERVER_PLACEHOLDER" ]; then
            pass "DEFAULT_SERVER uses placeholder URL (your-project.vercel.app)"
        else
            warn "DEFAULT_SERVER defined but could not verify placeholder URL — review manually:"
            echo "$DEFAULT_SERVER_LINE" | head -2
        fi
    else
        warn "DEFAULT_SERVER not defined in firmware/src/main.cpp"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

# ---------- Section 5.6: Firmware Turnkey Compliance ----------
subsection "5.6 No hardcoded WiFi credentials in firmware source"
if [ -d "firmware/src" ]; then
    # Check for hardcoded SSID/password assignments (not variable declarations or BLE callbacks)
    HARDCODED_WIFI=$(grep -rn 'wifiSSID\s*=\s*"[^"]\+"\|wifiPassword\s*=\s*"[^"]\+"\|WiFi\.begin\s*("[^"]\+"' firmware/src/ 2>/dev/null | grep -v '""' | grep -v "wifiSSID\[" | grep -v "wifiPassword\[" | head -5 || true)
    if [ -n "$HARDCODED_WIFI" ]; then
        fail "Hardcoded WiFi credentials found in firmware source (must use BLE provisioning):"
        echo "$HARDCODED_WIFI"
    else
        pass "No hardcoded WiFi credentials in firmware source"
    fi
else
    skip "firmware/src/ directory not found"
fi

subsection "5.6 No personal filesystem paths in firmware source"
if [ -d "firmware/src" ]; then
    PERSONAL_PATHS=$(grep -rn '/Users/\|/home/\|C:\\Users\\' firmware/src/ firmware/include/ 2>/dev/null | head -5 || true)
    if [ -n "$PERSONAL_PATHS" ]; then
        fail "Personal filesystem paths found in firmware source:"
        echo "$PERSONAL_PATHS"
    else
        pass "No personal filesystem paths in firmware source"
    fi
else
    skip "firmware/src/ directory not found"
fi

subsection "5.6 No personal email addresses in firmware source"
if [ -d "firmware/src" ]; then
    # Allow the copyright-standard commutecompute.licensing@gmail.com but flag any other personal emails
    PERSONAL_EMAILS=$(grep -rnoE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' firmware/src/ firmware/include/ 2>/dev/null | grep -v 'commutecompute\.licensing@gmail\.com' | head -5 || true)
    if [ -n "$PERSONAL_EMAILS" ]; then
        fail "Personal email addresses found in firmware source:"
        echo "$PERSONAL_EMAILS"
    else
        pass "No personal email addresses in firmware source"
    fi
else
    skip "firmware/src/ directory not found"
fi

subsection "5.6 No API keys or tokens hardcoded in firmware source"
if [ -d "firmware/src" ]; then
    # Check for common API key patterns (hex strings 32+ chars, Bearer tokens, key= assignments)
    API_KEYS=$(grep -rnoE '(api[_-]?key|api[_-]?token|bearer|secret[_-]?key)\s*[:=]\s*"[^"]{8,}"' firmware/src/ firmware/include/ 2>/dev/null | grep -iv 'example\|placeholder\|your-' | head -5 || true)
    if [ -n "$API_KEYS" ]; then
        fail "Hardcoded API keys/tokens found in firmware source:"
        echo "$API_KEYS"
    else
        pass "No hardcoded API keys or tokens in firmware source"
    fi
else
    skip "firmware/src/ directory not found"
fi

# ---------- Section 5.7: Firmware Founder Privacy ----------
subsection "5.7 Credential redaction in serial output"
if [ -f "firmware/src/main.cpp" ]; then
    # Verify that WiFi password is NOT printed in serial output
    # Safe patterns: "Password received" (no value), wifiSSID printed (non-sensitive)
    # Unsafe patterns: printing wifiPassword value, printing webhookUrl value
    PASSWORD_LOGGED=$(grep -n 'Serial.*wifiPassword\b' firmware/src/main.cpp 2>/dev/null | grep -v 'received\|saved\|set\|strlen\|> 0' | head -5 || true)
    if [ -n "$PASSWORD_LOGGED" ]; then
        fail "WiFi password may be logged to serial output (credential redaction violation):"
        echo "$PASSWORD_LOGGED"
    else
        pass "WiFi password not logged to serial output (credential redaction OK)"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

subsection "5.7 No personal identifiers in firmware source"
if [ -d "firmware/src" ]; then
    # Check for personal identifiers beyond the standard copyright attribution
    # Only scan text files (exclude .bmp, .bin, .o), exclude standard code patterns
    PERSONAL_IDS=$(grep -rn --include='*.cpp' --include='*.h' --include='*.c' --include='*.ino' 'phone[^_]\|mobile[^_]\|employer\|street\|suburb\|postcode\|[0-9]\{4\} [0-9]\{3\} [0-9]\{3\}' firmware/src/ firmware/include/ 2>/dev/null | grep -iv 'callback\|handler\|smartphone\|telephone_number\|phone_type\|ADDRESS\|BLEPhone' | head -5 || true)
    if [ -n "$PERSONAL_IDS" ]; then
        warn "Possible personal identifiers in firmware source — review manually:"
        echo "$PERSONAL_IDS"
    else
        pass "No personal identifiers found in firmware source beyond standard attribution"
    fi
else
    skip "firmware/src/ directory not found"
fi

subsection "5.7 Firmware version constant matches documentation"
if [ -f "firmware/include/config.h" ] && [ -f "firmware/FIRMWARE-VERSION-HISTORY.md" ]; then
    FW_VERSION_CODE=$(grep 'FIRMWARE_VERSION' firmware/include/config.h 2>/dev/null | sed -n 's/.*FIRMWARE_VERSION[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 || true)
    FW_VERSION_DOC=$(grep 'CC-FW-.*Current' firmware/FIRMWARE-VERSION-HISTORY.md 2>/dev/null | sed -n 's/.*CC-FW-\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/p' | head -1 || true)
    if [ -z "$FW_VERSION_CODE" ]; then
        warn "Could not extract FIRMWARE_VERSION from config.h"
    elif [ -z "$FW_VERSION_DOC" ]; then
        warn "Could not extract current version from FIRMWARE-VERSION-HISTORY.md"
    elif [ "$FW_VERSION_CODE" = "$FW_VERSION_DOC" ]; then
        pass "Firmware version matches documentation ($FW_VERSION_CODE)"
    else
        fail "Firmware version mismatch: config.h=$FW_VERSION_CODE, docs=$FW_VERSION_DOC"
    fi
else
    skip "firmware/include/config.h or FIRMWARE-VERSION-HISTORY.md not found"
fi

# ---------- Section 6: Compatible Kindle Devices ----------
section "SECTION 6: COMPATIBLE KINDLE DEVICES"

subsection "6.1 Kindle device directories exist"
KINDLE_DIR="firmware/kindle"
if [ -d "$KINDLE_DIR" ]; then
    KINDLE_DEVICES_FOUND=0
    for device_dir in "$KINDLE_DIR"/kindle-*; do
        [ -d "$device_dir" ] || continue
        ((KINDLE_DEVICES_FOUND++))
    done
    if [ "$KINDLE_DEVICES_FOUND" -ge 1 ]; then
        pass "Kindle device directories present ($KINDLE_DEVICES_FOUND found in firmware/kindle/)"
    else
        fail "No kindle-* device directories found in firmware/kindle/"
    fi
else
    skip "firmware/kindle/ directory not found"
fi

subsection "6.2 Kindle launcher script present"
if [ -f "firmware/kindle/common/commute-compute-launcher.sh" ]; then
    pass "Kindle launcher script present (firmware/kindle/common/commute-compute-launcher.sh)"
else
    if [ -d "firmware/kindle" ]; then
        fail "Kindle launcher script missing (expected firmware/kindle/common/commute-compute-launcher.sh)"
    else
        skip "firmware/kindle/ directory not found"
    fi
fi

subsection "6.3 Kindle device-config.sh scripts present"
if [ -d "$KINDLE_DIR" ]; then
    KINDLE_CONFIGS=0
    for cfg in "$KINDLE_DIR"/kindle-*/device-config.sh; do
        [ -f "$cfg" ] || continue
        ((KINDLE_CONFIGS++))
    done
    if [ "$KINDLE_CONFIGS" -ge 1 ]; then
        pass "Kindle device-config.sh scripts present ($KINDLE_CONFIGS devices)"
    else
        fail "No device-config.sh scripts found in kindle-* directories"
    fi
else
    skip "firmware/kindle/ directory not found"
fi

# ---------- Section 7: Spec Integrity ----------
section "SECTION 7: SPEC INTEGRITY"

subsection "7.1 Current spec file (V15.0)"
if [ -f "specs/CCDashDesignV15.md" ]; then
    pass "CCDashDesignV15.md spec file exists"
elif [ -f "specs/CCDashDesignV15.0.md" ]; then
    pass "CCDashDesignV15.0.md spec file exists"
else
    # Check if any V15 spec exists
    V15_SPEC=$(find specs/ -name "*V15*" 2>/dev/null | head -1 || true)
    if [ -n "$V15_SPEC" ]; then
        pass "V15 spec file found: $V15_SPEC"
    else
        fail "No V15.0 spec file found in specs/ (stale V12 check removed)"
    fi
fi

# ---------- Section 11: API & Data Rules ----------
section "SECTION 11: API & DATA RULES"

subsection "11.1 Transport Victoria OpenData URL"
CORRECT_API_URL="api.opendata.transport.vic.gov.au"
if [ -d "src/services" ]; then
    API_URL_CHECK=$(grep -rn "$CORRECT_API_URL" src/services/ api/ 2>/dev/null | head -1 || true)
    if [ -n "$API_URL_CHECK" ]; then
        pass "Correct Transport Victoria OpenData URL in use"
    else
        warn "Transport Victoria OpenData URL not found - verify API client"
    fi
fi

subsection "11.1 KeyId header pattern"
KEYID_HEADER=$(grep -rn "KeyId\|keyid" src/ api/ 2>/dev/null | grep -v "apiKey\|api_key" | head -3 || true)
if [ -n "$KEYID_HEADER" ]; then
    pass "KeyId header pattern found for GTFS-RT auth"
else
    warn "KeyId header not found - verify Transport Victoria API auth"
fi

subsection "11.3 Google Places API (New) pattern"
PLACES_NEW=$(grep -rn "places\.googleapis\.com/v1" src/ api/ 2>/dev/null | head -1 || true)
PLACES_LEGACY=$(grep -rn "maps\.googleapis\.com/maps/api/place" src/ api/ 2>/dev/null | head -1 || true)
if [ -n "$PLACES_LEGACY" ]; then
    fail "Legacy Google Places API found (use Places API New):"
    echo "$PLACES_LEGACY"
elif [ -n "$PLACES_NEW" ]; then
    pass "Google Places API (New) pattern in use"
else
    skip "No Google Places API usage found"
fi

# ---------- Section 12: Business Logic ----------
section "SECTION 12: BUSINESS LOGIC"

subsection "12.2 12-hour time format"
TIME_24H=$(grep -rn "getHours()" public/*.html src/ 2>/dev/null | grep -v "% 12\|archive/" | head -5 || true)
if [ -n "$TIME_24H" ]; then
    warn "Potential 24-hour time format usage (check manually):"
    echo "$TIME_24H" | head -3
else
    pass "Time formatting appears to use 12-hour format"
fi

# ---------- Section 13: Code Quality ----------
section "SECTION 13: CODE QUALITY"

subsection "13.5 File naming (no ptv-api.js)"
PTV_FILES=$(find src/ api/ -name "*ptv*" 2>/dev/null | grep -v "stop\|route" || true)
if [ -n "$PTV_FILES" ]; then
    warn "Files with 'ptv' in name should use neutral naming:"
    echo "$PTV_FILES"
else
    pass "No legacy ptv-api/ptv-service file names"
fi

subsection "13.3 No magic numbers in renderer"
MAGIC_NUMBERS=$(grep -rn "\b800\b.*\b480\b\|\b480\b.*\b800\b" src/ api/ 2>/dev/null | grep -v "DISPLAY_WIDTH\|DISPLAY_HEIGHT\|WIDTH\|HEIGHT\|comment\|//" | head -3 || true)
if [ -n "$MAGIC_NUMBERS" ]; then
    warn "Possible magic numbers (should use named constants):"
    echo "$MAGIC_NUMBERS" | head -3
else
    pass "No obvious magic number violations"
fi

# ---------- Section 16: Documentation ----------
section "SECTION 16: DOCUMENTATION STANDARDS"

subsection "16.3 Logo header in README"
if [ -f "README.md" ]; then
    LOGO_CHECK=$(grep -c "cc-mark-cropped.png\|cc-logo" README.md 2>/dev/null || echo "0")
    if [ "$LOGO_CHECK" -gt 0 ]; then
        pass "Logo header present in README.md"
    else
        warn "Logo header may be missing from README.md"
    fi
else
    fail "README.md not found"
fi

# ---------- Section 18: Change Management ----------
section "SECTION 18: CHANGE MANAGEMENT"

subsection "18.1 DEVELOPMENT-RULES.md exists and is non-empty"
if [ -f "DEVELOPMENT-RULES.md" ]; then
    DEVRULES_SIZE=$(wc -c < DEVELOPMENT-RULES.md 2>/dev/null | tr -d ' ')
    if [ "$DEVRULES_SIZE" -gt 100 ]; then
        pass "DEVELOPMENT-RULES.md exists and is non-empty ($DEVRULES_SIZE bytes)"
    else
        fail "DEVELOPMENT-RULES.md exists but appears empty or trivial ($DEVRULES_SIZE bytes)"
    fi
else
    fail "DEVELOPMENT-RULES.md not found (required for change management)"
fi

subsection "18.2 VERSION.json exists and is non-empty"
if [ -f "VERSION.json" ]; then
    VJ_SIZE=$(wc -c < VERSION.json 2>/dev/null | tr -d ' ')
    if [ "$VJ_SIZE" -gt 10 ]; then
        pass "VERSION.json exists and is non-empty ($VJ_SIZE bytes)"
    else
        fail "VERSION.json exists but appears empty or trivial ($VJ_SIZE bytes)"
    fi
else
    fail "VERSION.json not found (required for version tracking)"
fi

# ---------- Section 21: Device Setup & BLE Provisioning ----------
section "SECTION 21: DEVICE SETUP & BLE PROVISIONING"

subsection "21.1 Setup Wizard defines BLE_CHAR_URL_UUID"
if [ -f "public/setup-wizard.html" ]; then
    WIZARD_BLE_UUID=$(grep -n "BLE_CHAR_URL_UUID" public/setup-wizard.html 2>/dev/null | head -1 || true)
    if [ -n "$WIZARD_BLE_UUID" ]; then
        pass "Setup Wizard defines BLE_CHAR_URL_UUID"
    else
        fail "Setup Wizard (setup-wizard.html) does not define BLE_CHAR_URL_UUID (required for BLE provisioning)"
    fi
else
    skip "public/setup-wizard.html not found"
fi

subsection "21.1 Setup Wizard sends webhook URL via BLE"
if [ -f "public/setup-wizard.html" ]; then
    # Check that the wizard uses window.location.origin to derive the URL sent via BLE
    WIZARD_ORIGIN=$(grep -n "window\.location\.origin" public/setup-wizard.html 2>/dev/null | head -1 || true)
    if [ -n "$WIZARD_ORIGIN" ]; then
        pass "Setup Wizard uses window.location.origin for BLE URL provisioning"
    else
        warn "Setup Wizard does not reference window.location.origin — verify BLE URL provisioning method"
    fi
else
    skip "public/setup-wizard.html not found"
fi

subsection "21.2 Firmware must NOT auto-pair with DEFAULT_SERVER"
if [ -f "firmware/src/main.cpp" ]; then
    # Check that AUTO-PAIR / auto-pair does not appear as active code (comments are OK)
    AUTOPAIR_ACTIVE=$(grep -n -i "auto.pair" firmware/src/main.cpp 2>/dev/null | grep -v "^\s*//" | grep -v "^\s*\*" | grep -v "//.*auto.pair" | head -5 || true)
    if [ -n "$AUTOPAIR_ACTIVE" ]; then
        fail "AUTO-PAIR logic found as active code in firmware (device must require BLE provisioning):"
        echo "$AUTOPAIR_ACTIVE"
    else
        pass "No active AUTO-PAIR logic in firmware (BLE provisioning required)"
    fi
else
    skip "firmware/src/main.cpp not found"
fi

# ---------- Section 22: Admin Panel UI/UX ----------
section "SECTION 22: ADMIN PANEL UI/UX BRANDING"

subsection "22.3 No emojis (comprehensive, all UI files)"
EMOJI_FAILS=0
for ui_file in public/admin.html public/setup-wizard.html public/index.html public/flasher/index.html; do
    if [ -f "$ui_file" ]; then
        UI_EMOJIS=$(grep -n "$EMOJI_PATTERN" "$ui_file" 2>/dev/null | head -3 || true)
        if [ -n "$UI_EMOJIS" ]; then
            fail "Emojis in $(basename "$ui_file"):"
            echo "$UI_EMOJIS" | head -3
            ((EMOJI_FAILS++))
        fi
    fi
done
if [ "$EMOJI_FAILS" -eq 0 ]; then
    pass "No emojis in main UI files (Section 22.3)"
fi

subsection "22.11 No border-left accent anti-patterns"
BORDERLEFT_FAILS=0
for ui_file in public/admin.html public/setup-wizard.html public/index.html public/legal.html public/privacy.html public/attribution.html; do
    if [ -f "$ui_file" ]; then
        BL_MATCHES=$(grep -n 'border-left:\s*[0-9]\+px\s*solid' "$ui_file" 2>/dev/null | grep -v 'border-left:\s*0\|border-left:\s*none' || true)
        if [ -n "$BL_MATCHES" ]; then
            fail "Prohibited border-left accent pattern in $(basename "$ui_file") (Section 22.11):"
            echo "$BL_MATCHES" | head -5
            ((BORDERLEFT_FAILS++))
        fi
    fi
done
if [ "$BORDERLEFT_FAILS" -eq 0 ]; then
    pass "No prohibited border-left accent patterns in UI files (Section 22.11)"
fi

subsection "22.9 Global system footer"
if [ -f "public/admin.html" ]; then
    if grep -q "cc-system-footer" public/admin.html 2>/dev/null; then
        pass "Global system footer present in admin.html"
    else
        fail "Global system footer missing from admin.html"
    fi
fi

subsection "22.9.2 Dynamic attribution in admin footer"
if [ -f "public/admin.html" ]; then
    # Always required: copyright + AGPL-3.0
    if grep -qi "Angus Bergman.*AGPL\|AGPL.*Angus Bergman\|© 2026 Angus Bergman" public/admin.html 2>/dev/null; then
        pass "Admin footer: copyright + AGPL-3.0 attribution present"
    else
        warn "Admin footer: '© 2026 Angus Bergman AGPL-3.0 Dual License' not found"
    fi

    # Transport Victoria attribution
    if grep -qi "Transport Victoria" public/admin.html 2>/dev/null; then
        pass "Admin footer: Transport Victoria attribution present"
    else
        warn "Admin footer: Transport Victoria attribution not found"
    fi

    # Bureau of Meteorology attribution
    if grep -qi "Bureau of Meteorology\|BoM\|bom\.gov" public/admin.html 2>/dev/null; then
        pass "Admin footer: Bureau of Meteorology attribution present"
    else
        warn "Admin footer: Bureau of Meteorology attribution not found"
    fi

    # OpenStreetMap attribution
    if grep -qi "OpenStreetMap" public/admin.html 2>/dev/null; then
        pass "Admin footer: OpenStreetMap attribution present"
    else
        warn "Admin footer: OpenStreetMap attribution not found"
    fi
fi

subsection "22.9 Versions from /api/version (not hardcoded)"
if [ -f "public/admin.html" ]; then
    HARDCODED_VERSION=$(grep -n "CommuteCompute v[0-9]\|CCDash.*v[0-9]\|SmartCommute v[0-9]" public/admin.html 2>/dev/null | grep -v "api/version\|fetch\|\.textContent\s*=\s*v\.\|fallback\|//" | head -3 || true)
    if [ -n "$HARDCODED_VERSION" ]; then
        warn "Possible hardcoded versions in admin.html (should be from /api/version):"
        echo "$HARDCODED_VERSION" | head -3
    else
        pass "No hardcoded version strings in admin.html"
    fi
fi

subsection "22.10 Official tagline in README"
if [ -f "README.md" ]; then
    TAGLINE_CHECK=$(grep -cE "Other apps show delays\. CommuteCompute(™|&#8482;|\(TM\)) reacts to them" README.md 2>/dev/null || echo "0")
    if [ "$TAGLINE_CHECK" -gt 0 ]; then
        pass "Official tagline present in README.md"
    else
        fail "Official tagline missing from README.md"
    fi
fi

# ---------- Section 23: CommuteCompute Data Flow ----------
section "SECTION 23: COMMUTECOMPUTE DATA FLOW"

subsection "23.1 GTFS-RT stop ID handling"
if [ -d "src/services" ]; then
    STOP_ID_HANDLING=$(grep -rn "stopId\|stop_id\|trainStopId" src/services/ 2>/dev/null | head -3 || true)
    if [ -n "$STOP_ID_HANDLING" ]; then
        pass "Stop ID handling patterns found in services"
    else
        warn "Limited stop ID handling patterns found"
    fi
fi

subsection "23.3 Citybound detection logic"
CITYBOUND_CHECK=$(grep -rn "isCitybound\|citybound\|City Loop" src/ 2>/dev/null | head -3 || true)
if [ -n "$CITYBOUND_CHECK" ]; then
    pass "Citybound detection logic found"
else
    warn "Citybound detection logic not found (Section 23.3)"
fi

subsection "23.6 No mock/fallback data in opendata-client"
if [ -f "src/services/opendata-client.js" ]; then
    ACTIVE_MOCK=$(grep -n "mock\|Mock\|MOCK\|fallback.*\[" src/services/opendata-client.js 2>/dev/null | grep -v "removed\|// \|comment\|no mock" | head -3 || true)
    if [ -n "$ACTIVE_MOCK" ]; then
        warn "Possible mock/fallback data in opendata-client.js (verify removed):"
        echo "$ACTIVE_MOCK"
    else
        pass "No active mock/fallback data in opendata-client.js"
    fi
fi

subsection "23.10 GTFS-RT source completeness (gtfs-rt-broad)"
if [ -f "api/screen.js" ]; then
    BROAD_CHECKS=$(grep -c "gtfs-rt-broad" api/screen.js 2>/dev/null || echo "0")
    if [ "$BROAD_CHECKS" -ge 3 ]; then
        pass "gtfs-rt-broad included in all hasLive*Data checks ($BROAD_CHECKS occurrences)"
    else
        fail "gtfs-rt-broad missing from hasLive*Data checks (found $BROAD_CHECKS, need >= 3)"
    fi
else
    skip "api/screen.js not found"
fi

subsection "23.11 Stop ID maps use 3-letter station codes"
STOP_ID_FAIL=0
for file in api/admin/setup-complete.js api/admin/resolve-stops.js; do
    if [ -f "$file" ]; then
        NUMERIC_TRAIN=$(grep "train:" "$file" 2>/dev/null | grep -E "train: '[0-9]+'" | head -3 || true)
        if [ -n "$NUMERIC_TRAIN" ]; then
            fail "$file: Train stop IDs use numeric platform IDs instead of 3-letter station codes"
            echo "$NUMERIC_TRAIN" | head -2
            ((STOP_ID_FAIL++))
        else
            pass "$file: Train stop IDs use 3-letter station codes"
        fi
    fi
done

subsection "23.12 Transit leg subtitle includes destination"
if [ -f "api/screen.js" ]; then
    DEST_REF=$(grep -n "leg.destination" api/screen.js 2>/dev/null | grep -i "subtitle\|buildLeg" || true)
    if [ -z "$DEST_REF" ]; then
        DEST_IN_BUILDLEG=$(grep -A50 "function buildLegSubtitle" api/screen.js 2>/dev/null | grep "destination" || true)
        if [ -n "$DEST_IN_BUILDLEG" ]; then
            pass "buildLegSubtitle references leg.destination for transit legs"
        else
            fail "buildLegSubtitle does not reference leg.destination (Section 23.12)"
        fi
    else
        pass "Transit leg subtitle references destination stop name"
    fi
else
    skip "api/screen.js not found"
fi

subsection "12.7 DepartureConfidence context and resilienceDetail"
if [ -f "src/engines/departure-confidence.js" ]; then
    CTX_CHECK=$(grep -c "_generateContext\|context:" src/engines/departure-confidence.js 2>/dev/null || echo "0")
    RES_CHECK=$(grep -c "_generateResilienceDetail\|resilienceDetail:" src/engines/departure-confidence.js 2>/dev/null || echo "0")
    if [ "$CTX_CHECK" -ge 2 ] && [ "$RES_CHECK" -ge 2 ]; then
        pass "DepartureConfidence returns context and resilienceDetail"
    else
        fail "DepartureConfidence missing context ($CTX_CHECK refs) or resilienceDetail ($RES_CHECK refs)"
    fi
else
    skip "src/engines/departure-confidence.js not found"
fi

subsection "5.7 Dual subtitle pipeline (renderer getLegSubtitle)"
if [ -f "src/services/ccdash-renderer.js" ]; then
    GET_LEG_SUB=$(grep -c "getLegSubtitle" src/services/ccdash-renderer.js 2>/dev/null || echo "0")
    if [ "$GET_LEG_SUB" -ge 1 ]; then
        TRANSIT_TYPES=$(grep -A100 "getLegSubtitle" src/services/ccdash-renderer.js 2>/dev/null | grep -c "train\|tram\|bus" || echo "0")
        if [ "$TRANSIT_TYPES" -ge 3 ]; then
            pass "ccdash-renderer getLegSubtitle handles all transit types ($TRANSIT_TYPES type refs)"
        else
            warn "ccdash-renderer getLegSubtitle may not handle all transit types ($TRANSIT_TYPES refs)"
        fi
    else
        fail "ccdash-renderer.js missing getLegSubtitle (dual subtitle pipeline broken)"
    fi
else
    skip "src/services/ccdash-renderer.js not found"
fi

# ---------- Section 24: System Architecture Principles ----------
section "SECTION 24: SYSTEM ARCHITECTURE PRINCIPLES"

subsection "24.6 cc: KV key prefix"
if [ -d "src/data" ]; then
    KV_KEYS=$(grep -rn "transit-api-key\|google-api-key\|preferences\|device:status" src/data/ api/ 2>/dev/null | head -3 || true)
    if [ -n "$KV_KEYS" ]; then
        pass "Vercel KV key naming patterns found"
    else
        warn "Vercel KV key naming not found"
    fi
fi

subsection "24.7 API keys from KV, not process.env"
ENV_API_KEY=$(grep -rn "process\.env\..*API_KEY\|process\.env\..*KEY" api/ 2>/dev/null | grep -v "KV_REST\|VERCEL\|COMMIT\|NODE_ENV" | head -3 || true)
if [ -n "$ENV_API_KEY" ]; then
    warn "API keys from process.env detected (should use Vercel KV):"
    echo "$ENV_API_KEY"
else
    pass "No direct process.env API key usage found"
fi

subsection "24.10 All required API endpoints"
MISSING_EP=0
for endpoint in zones screen livedash health status; do
    if [ ! -f "api/$endpoint.js" ]; then
        fail "Required endpoint /api/$endpoint MISSING"
        ((MISSING_EP++))
    fi
done
if [ "$MISSING_EP" -eq 0 ]; then
    pass "All required API endpoints present (Section 24.10)"
fi

subsection "Attribution page exists"
if [ -f "public/attribution.html" ]; then
    pass "public/attribution.html exists"
else
    fail "public/attribution.html missing (required for data provider attribution)"
fi

subsection "Attribution: Transport Victoria (CC BY 4.0)"
if [ -f "public/attribution.html" ]; then
    if grep -qi "Transport Victoria\|CC BY 4.0\|Creative Commons.*Attribution.*4" public/attribution.html 2>/dev/null; then
        pass "Attribution page references Transport Victoria / CC BY 4.0"
    else
        fail "Attribution page missing Transport Victoria / CC BY 4.0 attribution"
    fi
fi

subsection "Attribution: Bureau of Meteorology (CC BY 3.0 AU)"
if [ -f "public/attribution.html" ]; then
    if grep -qi "Bureau of Meteorology\|CC BY 3.0\|Commonwealth of Australia" public/attribution.html 2>/dev/null; then
        pass "Attribution page references Bureau of Meteorology / CC BY 3.0 AU"
    else
        fail "Attribution page missing Bureau of Meteorology / CC BY 3.0 AU attribution"
    fi
fi

subsection "Attribution: OpenStreetMap (ODbL)"
if [ -f "public/attribution.html" ]; then
    if grep -qi "OpenStreetMap\|ODbL\|Open Database" public/attribution.html 2>/dev/null; then
        pass "Attribution page references OpenStreetMap / ODbL"
    else
        warn "Attribution page missing OpenStreetMap / ODbL attribution"
    fi
fi

subsection "Attribution: Copyright Angus Bergman"
if [ -f "public/attribution.html" ]; then
    if grep -q "Angus Bergman" public/attribution.html 2>/dev/null; then
        pass "Attribution page includes copyright holder (Angus Bergman)"
    else
        fail "Attribution page missing copyright holder (Angus Bergman)"
    fi
fi

subsection "Attribution: AGPL-3.0 licence reference"
if [ -f "public/attribution.html" ]; then
    if grep -qi "AGPL\|Dual Licen\|Dual License" public/attribution.html 2>/dev/null; then
        pass "Attribution page references AGPL-3.0 / dual licence"
    else
        warn "Attribution page does not reference AGPL-3.0 / dual licence"
    fi
fi

subsection "api/version.js exists"
if [ -f "api/version.js" ]; then
    pass "api/version.js exists for dynamic versioning"

    # Check version.js exposes copyright and licence info
    if grep -q "AGPL-3.0" api/version.js 2>/dev/null; then
        pass "api/version.js includes AGPL-3.0 licence in response"
    else
        warn "api/version.js may not expose AGPL-3.0 licence in API response"
    fi

    if grep -q "Angus Bergman" api/version.js 2>/dev/null; then
        pass "api/version.js includes copyright holder in response"
    else
        warn "api/version.js may not expose copyright holder in API response"
    fi
else
    fail "api/version.js not found"
fi

subsection "Canvas fillText maxWidth:0 safety"
FILLTEXT_ZERO=$(grep -n 'fillText' src/services/ccdash-renderer.js 2>/dev/null | grep -i 'Math\.max(0,' | head -5 || true)
if [ -n "$FILLTEXT_ZERO" ]; then
    warn "Potential maxWidth:0 in fillText — Math.max(0,...) allows zero width which crashes node-canvas:"
    echo "$FILLTEXT_ZERO" | head -3
else
    pass "No Math.max(0,...) pattern near fillText in ccdash-renderer.js"
fi

# ============================================================================
# GROUP 9: METRO TUNNEL COMPLIANCE (Section 25)
# ============================================================================
group_header "GROUP 9: METRO TUNNEL COMPLIANCE (Section 25)"

# 25.2: METRO_TUNNEL_LINE_CODES must exist in opendata-client.js
section "Metro Tunnel line codes in opendata-client.js"
if grep -q "METRO_TUNNEL_LINE_CODES" src/services/opendata-client.js 2>/dev/null; then
    pass "METRO_TUNNEL_LINE_CODES constant exists in opendata-client.js"
else
    fail "Missing METRO_TUNNEL_LINE_CODES in opendata-client.js (Section 25.6)"
fi

# Check all 5 line codes are present
for code in PKM CBE SUY CGB UFD; do
    if grep -q "'$code'" src/services/opendata-client.js 2>/dev/null; then
        pass "Metro Tunnel line code $code present"
    else
        fail "Missing Metro Tunnel line code $code in opendata-client.js"
    fi
done

# 25.4: Metro Tunnel stop IDs
section "Metro Tunnel station stop IDs"
if grep -q "METRO_TUNNEL_STOP_IDS" src/services/opendata-client.js 2>/dev/null; then
    pass "METRO_TUNNEL_STOP_IDS constant exists in opendata-client.js"
else
    fail "Missing METRO_TUNNEL_STOP_IDS in opendata-client.js (Section 25.4)"
fi

# Metro Tunnel station codes — verified against Transport Victoria GTFS (2026-02-28)
# Station codes resolve to platform IDs via getPlatformIds() from gtfs-reference.js
for code in ARN PKV STL THL AZC; do
    if grep -q "'$code'" src/services/opendata-client.js 2>/dev/null; then
        pass "Metro Tunnel station code $code present"
    else
        fail "Missing Metro Tunnel station code $code in opendata-client.js"
    fi
done

# 25.5: isMetroTunnel flag in departure processing
section "isMetroTunnel flag in GTFS-RT departures"
if grep -q "isMetroTunnel" src/services/opendata-client.js 2>/dev/null; then
    pass "isMetroTunnel flag used in opendata-client.js"
else
    fail "Missing isMetroTunnel flag in GTFS-RT departure processing (Section 25.5)"
fi

# 25.5: Metro Tunnel filtering in screen.js
section "Metro Tunnel departure filtering in screen.js"
if grep -q "requiresCityLoop\|requiresMetroTunnel" api/screen.js 2>/dev/null; then
    pass "City Loop / Metro Tunnel filtering present in screen.js"
else
    fail "Missing Metro Tunnel vs City Loop filtering in screen.js (Section 25.5)"
fi

# 25.6: METRO_TUNNEL_LINES in commute-compute.js
section "Metro Tunnel config in commute-compute engine"
if grep -q "METRO_TUNNEL_LINES" src/engines/commute-compute.js 2>/dev/null; then
    pass "METRO_TUNNEL_LINES exists in commute-compute.js"
else
    fail "Missing METRO_TUNNEL_LINES in commute-compute.js (Section 25.6)"
fi

if grep -q "METRO_TUNNEL_STATIONS" src/engines/commute-compute.js 2>/dev/null; then
    pass "METRO_TUNNEL_STATIONS exists in commute-compute.js"
else
    fail "Missing METRO_TUNNEL_STATIONS in commute-compute.js (Section 25.6)"
fi

# ============================================================================
# GROUP 10: API SECURITY & AUTH (Section 26)
# ============================================================================
group_header "GROUP 10: API SECURITY & AUTH (Section 26)"

# 26.1: No skip-auth-for-GET pattern in admin endpoints
section "Admin endpoints auth on all methods"

# Check for the dangerous pattern: auth only checked inside if (req.method !== 'GET') block
# This skips auth for GET requests, exposing data
# Pattern: lines with req.method !== 'GET' followed within 2 lines by requireAuth
# NOTE: api/profiles.js uses tiered auth — unauthenticated GET returns names/IDs only,
# authenticated GET returns full profile data with personal addresses. This is safe.
ADMIN_SKIP_AUTH=""
for f in api/admin/preferences.js api/admin/reset.js; do
    if [ -f "$f" ]; then
        MATCH=$(grep -n "req\.method !== 'GET'" "$f" 2>/dev/null | while read -r line; do
            LINENUM=$(echo "$line" | cut -d: -f1)
            # Check if requireAuth appears within the next 3 lines (inside the block)
            NEXT_LINES=$(sed -n "$((LINENUM+1)),$((LINENUM+3))p" "$f" 2>/dev/null)
            if echo "$NEXT_LINES" | grep -q "requireAuth"; then
                echo "$f:$LINENUM: auth gated behind method check"
            fi
        done || true)
        if [ -n "$MATCH" ]; then
            ADMIN_SKIP_AUTH="${ADMIN_SKIP_AUTH}${MATCH}"
        fi
    fi
done
if [ -z "$ADMIN_SKIP_AUTH" ]; then
    pass "No skip-auth-for-GET pattern in admin endpoints"
else
    fail "Admin endpoints skip auth for GET: $ADMIN_SKIP_AUTH (Section 26.1)"
fi

# 26.1b: Profiles endpoint uses tiered auth (unauthenticated GET = names only, full data requires auth)
section "Profiles endpoint tiered auth model"
if [ -f "api/profiles.js" ]; then
    if grep -q "requireAuth" api/profiles.js 2>/dev/null; then
        if grep -q "isAuthenticated" api/profiles.js 2>/dev/null; then
            pass "Profiles endpoint uses tiered auth (names-only for unauthenticated GET, full data with auth)"
        elif grep -q "req\.method !== 'GET'" api/profiles.js 2>/dev/null; then
            fail "Profiles GET returns full data without auth — must use tiered model (Section 26.1)"
        else
            pass "Profiles endpoint has auth check"
        fi
    else
        fail "Profiles endpoint missing requireAuth — POST/DELETE must be authenticated (Section 26.1)"
    fi
fi

# 26.2: Auth middleware denies by default when CC_ADMIN_TOKEN unset
section "Auth middleware deny-by-default"

if grep -q "return null" src/utils/auth-middleware.js 2>/dev/null; then
    # Check if the null return is ONLY for successful auth, not for missing token
    SKIP_AUTH_PATTERN=$(grep -B2 "return null" src/utils/auth-middleware.js | grep -c "adminToken\|skip auth\|backward" || true)
    if [ "$SKIP_AUTH_PATTERN" -gt 0 ]; then
        fail "Auth middleware silently passes when CC_ADMIN_TOKEN unset (Section 26.2)"
    else
        pass "Auth middleware denies by default when CC_ADMIN_TOKEN unset"
    fi
else
    pass "Auth middleware denies by default when CC_ADMIN_TOKEN unset"
fi

# 26.3: Setup endpoints use isFirstTimeSetup
section "Setup endpoints use first-time-setup guard"

SETUP_ENDPOINTS="api/save-transit-key.js api/save-google-key.js api/admin/setup-complete.js api/sync-config.js api/admin/generate-webhook.js"
SETUP_GUARD_COUNT=0
SETUP_TOTAL=0
for f in $SETUP_ENDPOINTS; do
    if [ -f "$f" ]; then
        SETUP_TOTAL=$((SETUP_TOTAL + 1))
        if grep -q "isFirstTimeSetup" "$f" 2>/dev/null; then
            SETUP_GUARD_COUNT=$((SETUP_GUARD_COUNT + 1))
        fi
    fi
done

if [ "$SETUP_GUARD_COUNT" -eq "$SETUP_TOTAL" ] && [ "$SETUP_TOTAL" -gt 0 ]; then
    pass "All setup endpoints use isFirstTimeSetup guard ($SETUP_GUARD_COUNT/$SETUP_TOTAL)"
else
    fail "Setup endpoints missing isFirstTimeSetup guard ($SETUP_GUARD_COUNT/$SETUP_TOTAL) (Section 26.3)"
fi

# 26.4: No wildcard CORS on admin/state-mutating endpoints
section "No wildcard CORS on admin endpoints"

WILDCARD_CORS=$(grep -rn "CC_ALLOWED_ORIGIN || '\*'" api/admin/ api/save-transit-key.js api/save-google-key.js api/sync-config.js api/profiles.js 2>/dev/null | grep -v "node_modules" || true)
if [ -z "$WILDCARD_CORS" ]; then
    pass "No wildcard CORS fallback on admin/state-mutating endpoints"
else
    fail "Wildcard CORS on admin endpoints: $WILDCARD_CORS (Section 26.4)"
fi

# 26.4: Admin endpoints use setAdminCorsHeaders
section "Admin endpoints use setAdminCorsHeaders"

ADMIN_CORS_COUNT=0
ADMIN_CORS_TOTAL=0
ADMIN_CORS_FILES="api/admin/preferences.js api/admin/setup-complete.js api/admin/generate-webhook.js api/admin/reset.js api/save-transit-key.js api/save-google-key.js api/sync-config.js api/profiles.js"
for f in $ADMIN_CORS_FILES; do
    if [ -f "$f" ]; then
        ADMIN_CORS_TOTAL=$((ADMIN_CORS_TOTAL + 1))
        if grep -q "setAdminCorsHeaders" "$f" 2>/dev/null; then
            ADMIN_CORS_COUNT=$((ADMIN_CORS_COUNT + 1))
        fi
    fi
done

if [ "$ADMIN_CORS_COUNT" -eq "$ADMIN_CORS_TOTAL" ] && [ "$ADMIN_CORS_TOTAL" -gt 0 ]; then
    pass "All admin endpoints use setAdminCorsHeaders ($ADMIN_CORS_COUNT/$ADMIN_CORS_TOTAL)"
else
    fail "Admin endpoints not using setAdminCorsHeaders ($ADMIN_CORS_COUNT/$ADMIN_CORS_TOTAL) (Section 26.4)"
fi

# 26.5: Zone APIs use KV-first config check
section "Zone APIs KV-first config check"

ZONE_KV_OK=0
for f in api/zones.js api/zones-tiered.js; do
    if [ -f "$f" ]; then
        if grep -q "getTransitApiKey" "$f" 2>/dev/null; then
            ZONE_KV_OK=$((ZONE_KV_OK + 1))
        fi
    fi
done

if [ "$ZONE_KV_OK" -ge 2 ]; then
    pass "Zone APIs use KV-first config check (getTransitApiKey)"
else
    fail "Zone APIs not using KV-first config check ($ZONE_KV_OK/2) (Section 26.5)"
fi

# 26.6: No bare __dirname in ESM files
section "No bare __dirname in ESM API files"

# Check each API file for __dirname — only flag if file lacks ESM-compatible definition
BARE_DIRNAME=""
for f in $(grep -rl "__dirname" api/ --include="*.js" 2>/dev/null | grep -v "node_modules" || true); do
    # If file has ESM-compatible __dirname definition (fileURLToPath), it's fine
    if ! grep -q "fileURLToPath" "$f" 2>/dev/null; then
        BARE_DIRNAME="${BARE_DIRNAME}${f} "
    fi
done
if [ -z "$BARE_DIRNAME" ]; then
    pass "No bare __dirname usage in API files (ESM-safe)"
else
    fail "Bare __dirname in ESM files without import.meta.url polyfill: $BARE_DIRNAME (Section 26.6)"
fi

# Auth middleware imports isFirstTimeSetup and setAdminCorsHeaders
section "Auth middleware exports security helpers"

if grep -q "isFirstTimeSetup" src/utils/auth-middleware.js 2>/dev/null; then
    pass "auth-middleware.js exports isFirstTimeSetup"
else
    fail "auth-middleware.js missing isFirstTimeSetup export (Section 26.3)"
fi

if grep -q "setAdminCorsHeaders" src/utils/auth-middleware.js 2>/dev/null; then
    pass "auth-middleware.js exports setAdminCorsHeaders"
else
    fail "auth-middleware.js missing setAdminCorsHeaders export (Section 26.4)"
fi

# ============================================================================
# GROUP 11: PYTHON COMPLIANCE SCANNER (13 unique checks + overlap verification)
# ============================================================================
group_header "GROUP 11: PYTHON COMPLIANCE SCANNER"

PYTHON_SCANNER="./scripts/cc-compliance-scanner.py"
if [ -f "$PYTHON_SCANNER" ] && command -v python3 > /dev/null 2>&1; then
    PYTHON_OUTPUT=$(python3 "$PYTHON_SCANNER" --repo-root . 2>&1)
    PYTHON_EXIT=$?

    PY_PASS=$(echo "$PYTHON_OUTPUT" | grep -c "\[PASS\]" || true)
    PY_FAIL=$(echo "$PYTHON_OUTPUT" | grep -c "\[FAIL\]" || true)
    PY_WARN=$(echo "$PYTHON_OUTPUT" | grep -c "\[WARN\]" || true)
    PY_PASS=${PY_PASS:-0}
    PY_FAIL=${PY_FAIL:-0}
    PY_WARN=${PY_WARN:-0}

    # Show Python scanner results
    echo "$PYTHON_OUTPUT" | grep -E "\[PASS\]|\[FAIL\]|\[WARN\]|\[SKIP\]|CATEGORY|---"

    PASSED=$((PASSED + PY_PASS))
    VIOLATIONS=$((VIOLATIONS + PY_FAIL))
    WARNINGS=$((WARNINGS + PY_WARN))

    if [ "$PYTHON_EXIT" -eq 0 ]; then
        pass "Python scanner: $PY_PASS passed, $PY_WARN warnings"
    else
        fail "Python scanner: $PY_FAIL violations detected"
    fi
else
    if ! command -v python3 > /dev/null 2>&1; then
        warn "Python 3 not available — 13 unique checks skipped"
    else
        fail "cc-compliance-scanner.py not found"
    fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
section "AUDIT SUMMARY"

echo ""
TOTAL_CHECKS=$((PASSED + VIOLATIONS + WARNINGS + SKIPPED))
echo "Total Checks: $TOTAL_CHECKS"
echo ""
echo -e "${GREEN}Passed:${NC}     $PASSED"
echo -e "${RED}Violations:${NC} $VIOLATIONS"
echo -e "${YELLOW}Warnings:${NC}   $WARNINGS"
echo -e "${CYAN}Skipped:${NC}    $SKIPPED"
echo ""

echo "Full log (no truncation): $AUDIT_LOG"
echo ""

if [ $VIOLATIONS -gt 0 ]; then
    echo -e "${RED}AUDIT FAILED - $VIOLATIONS critical violations found${NC}"
    echo ""
    echo "Fix all violations before committing!"
    echo "Refer to DEVELOPMENT-RULES.md for compliance requirements."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}AUDIT PASSED WITH WARNINGS - Review $WARNINGS items${NC}"
    echo ""
    echo "Warnings are non-blocking but should be reviewed."
    exit 0
else
    echo -e "${GREEN}AUDIT PASSED - Full compliance achieved${NC}"
    exit 0
fi
