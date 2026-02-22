#!/bin/bash
#
# COMPREHENSIVE DEVELOPMENT RULES COMPLIANCE AUDIT v2.1
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Systematically checks ALL 26 sections of DEVELOPMENT-RULES.md
# 240+ automated checks across 13 groups:
#   G1: Static Analysis (Sections 0-3, 14, 20)
#   G2: Per-Page Verification (all HTML pages)
#   G3: Per-Endpoint Verification (all API endpoints)
#   G4: Data Flow Verification (config, rendering, admin, KV, mock data)
#   G5: Caching Verification (headers, refresh timing, TTLs)
#   G6: Version Consistency (cross-file version checks)
#   G7: Security (Section 17 expanded + BLE provisioning URL checks)
#   G8: Architecture & Design (Sections 4-5, 7-10, 21-24)
#   G9: Metro Tunnel Compliance (Section 25)
#   G10: API Security & Auth (Section 26)
#   G11: Prohibited Internal Terminology + Third-party hardware naming
#   G12: Spelling Consistency (en-AU) + licence/license noun check
#   G13: Jurisdiction & Legal Compliance
#
# Run from repository root: ./scripts/comprehensive-compliance-audit.sh
#

# Don't exit on error - we handle failures explicitly
set +e

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
# GROUP 6: VERSION CONSISTENCY
# ============================================================================
group_header "GROUP 6: VERSION CONSISTENCY"

section "6.1 VERSION SOURCE OF TRUTH"

# Read versions from api/version.js
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

    pass "api/version.js: System=$SYSTEM_VERSION Engine=$ENGINE_VERSION Renderer=$RENDERER_VERSION"
    echo "    Admin=$ADMIN_VERSION Firmware=$FIRMWARE_VERSION Spec=$SPEC_VERSION"
else
    fail "api/version.js not found - cannot determine authoritative versions"
fi

section "6.2 CROSS-FILE VERSION CONSISTENCY"

subsection "VERSION.json consistency"
if [ -f "VERSION.json" ]; then
    VJ_SYSTEM=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' VERSION.json 2>/dev/null | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/"//' || true)
    if [ -n "$SYSTEM_VERSION" ] && [ -n "$VJ_SYSTEM" ]; then
        # Strip leading 'v' for comparison
        SV_CLEAN=$(echo "$SYSTEM_VERSION" | sed 's/^v//')
        VJ_CLEAN=$(echo "$VJ_SYSTEM" | sed 's/^v//')
        if [ "$SV_CLEAN" = "$VJ_CLEAN" ]; then
            pass "VERSION.json system version matches api/version.js ($VJ_SYSTEM)"
        else
            fail "VERSION.json system version mismatch: $VJ_SYSTEM vs api/version.js $SYSTEM_VERSION"
        fi
    else
        warn "Could not compare VERSION.json versions"
    fi
else
    warn "VERSION.json not found"
fi

subsection "HTML footer version fallbacks"
for page in public/admin.html public/index.html public/setup-wizard.html; do
    if [ -f "$page" ]; then
        PAGE_NAME=$(basename "$page")
        # Check if page hardcodes versions that don't match
        if [ -n "$SYSTEM_VERSION" ]; then
            SV_CLEAN=$(echo "$SYSTEM_VERSION" | sed 's/^v//')
            PAGE_HAS_VERSION=$(grep -c "v$SV_CLEAN\|$SV_CLEAN" "$page" 2>/dev/null || echo "0")
            if [ "$PAGE_HAS_VERSION" -gt 0 ]; then
                pass "$PAGE_NAME: Version reference $SV_CLEAN found"
            else
                warn "$PAGE_NAME: Version $SV_CLEAN not found in fallback"
            fi
        fi
    fi
done

subsection "README.md version references"
if [ -f "README.md" ]; then
    if [ -n "$SYSTEM_VERSION" ]; then
        SV_CLEAN=$(echo "$SYSTEM_VERSION" | sed 's/^v//')
        README_VERSION=$(grep -c "$SV_CLEAN" README.md 2>/dev/null || echo "0")
        if [ "$README_VERSION" -gt 0 ]; then
            pass "README.md references current system version $SV_CLEAN"
        else
            warn "README.md may not reference current version $SV_CLEAN"
        fi
    fi
else
    warn "README.md not found"
fi

section "6.3 SPEC VERSION"

subsection "Current spec file exists"
if [ -n "$SPEC_VERSION" ]; then
    # Check for the spec file matching current version (e.g., CCDashDesignV15.md)
    SPEC_FILE=$(find specs/ -name "${SPEC_VERSION}*" -o -name "$(echo "$SPEC_VERSION" | sed 's/\.0$//')*" 2>/dev/null | head -1 || true)
    if [ -n "$SPEC_FILE" ]; then
        pass "Current spec file found: $SPEC_FILE"
    else
        # Try common patterns
        SPEC_NUM=$(echo "$SPEC_VERSION" | grep -o "[0-9]\+" | head -1)
        SPEC_FILE_ALT=$(find specs/ -name "*V${SPEC_NUM}*" 2>/dev/null | head -1 || true)
        if [ -n "$SPEC_FILE_ALT" ]; then
            pass "Spec file found: $SPEC_FILE_ALT"
        else
            fail "Spec file for $SPEC_VERSION not found in specs/"
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
    AUDIT_RESULT=$(npm audit --audit-level=high 2>&1 | grep -c "found 0 vulnerabilities" 2>/dev/null || true)
    AUDIT_RESULT=${AUDIT_RESULT:-0}
    if [ "$AUDIT_RESULT" -gt 0 ] 2>/dev/null; then
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

for stopid in 26010 26011 26012 26013 26014; do
    if grep -q "'$stopid'" src/services/opendata-client.js 2>/dev/null; then
        pass "Metro Tunnel stop ID $stopid present"
    else
        fail "Missing Metro Tunnel stop ID $stopid in opendata-client.js"
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
ADMIN_SKIP_AUTH=""
for f in api/admin/preferences.js api/admin/reset.js api/profiles.js; do
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
# GROUP 11: PROHIBITED INTERNAL TERMINOLOGY
# ============================================================================
group_header "GROUP 11: PROHIBITED INTERNAL TERMINOLOGY"

section "Checking for prohibited internal development terminology..."

# Directories and file types to scan
TERM_SCAN_DIRS=""
for d in src/ api/ public/ firmware/ docs/ *.md; do
    if [ -e "$d" ]; then
        TERM_SCAN_DIRS="$TERM_SCAN_DIRS $d"
    fi
done

TERM_EXCLUDES="--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.pio --binary-files=without-match --exclude=package-lock.json --exclude=*.bmp --exclude=*.png --exclude=*.jpg --exclude=*.pdf --exclude=*.elf --exclude=*.o --exclude=*.a --exclude=comprehensive-compliance-audit.sh"

# G11 terminology checks load patterns from an external gitignored config file.
# This prevents the audit script itself from embedding prohibited terms in source.
TERMS_CONF="$(dirname "$0")/../.cc-prohibited-terms.conf"
if [ ! -f "$TERMS_CONF" ]; then
    TERMS_CONF="$REPO_ROOT/.cc-prohibited-terms.conf"
fi

if [ -f "$TERMS_CONF" ]; then
    # Parse config: extract values after '=' on non-comment, non-empty lines
    _cfg_get() { grep "^$1=" "$TERMS_CONF" 2>/dev/null | head -1 | sed "s/^$1=//" ; }

    CFG_STANDALONE=$(_cfg_get STANDALONE_NAMES)
    CFG_PAIRED_NAMES=$(_cfg_get PAIRED_NAMES)
    CFG_ROLE_TITLES=$(_cfg_get ROLE_TITLES)
    CFG_ROLE_PATTERNS=$(_cfg_get ROLE_PATTERNS)
    CFG_TOOL_PATTERNS=$(_cfg_get TOOL_PATTERNS)
    CFG_ATTRIB_PATTERNS=$(_cfg_get ATTRIB_PATTERNS)

    # 11.1: Standalone prohibited terms
    subsection "11.1 Standalone prohibited terms"
    if [ -n "$CFG_STANDALONE" ]; then
        STANDALONE_HITS=$(grep -rni "$CFG_STANDALONE" $TERM_SCAN_DIRS $TERM_EXCLUDES 2>/dev/null | head -20 || true)
        if [ -n "$STANDALONE_HITS" ]; then
            fail "Prohibited internal terminology found (standalone):"
            echo "$STANDALONE_HITS" | head -10
        else
            pass "No prohibited standalone internal terms found"
        fi
    else
        warn "No standalone terms configured"
    fi

    # 11.2: Names paired with role titles
    subsection "11.2 Names paired with role titles"
    ROLE_PAIRED_HITS=""
    for NAME in $CFG_PAIRED_NAMES; do
        # Pass 1: find lines containing the name as a whole word
        NAME_LINES=$(grep -rniw "$NAME" $TERM_SCAN_DIRS $TERM_EXCLUDES 2>/dev/null || true)
        if [ -n "$NAME_LINES" ]; then
            # Pass 2: filter those lines for role titles as whole words
            PAIRED=$(echo "$NAME_LINES" | grep -Eiw "${CFG_ROLE_TITLES}" 2>/dev/null | head -5 || true)
            if [ -n "$PAIRED" ]; then
                ROLE_PAIRED_HITS="${ROLE_PAIRED_HITS}${PAIRED}
"
            fi
        fi
    done
    if [ -n "$ROLE_PAIRED_HITS" ]; then
        fail "Prohibited internal terminology found (name+role combinations):"
        echo "$ROLE_PAIRED_HITS" | head -10
    else
        pass "No prohibited name+role combinations found"
    fi

    # 11.3: Internal development role patterns
    subsection "11.3 Internal development role patterns"
    if [ -n "$CFG_ROLE_PATTERNS" ]; then
        GREP_ROLE_PAT=$(echo "$CFG_ROLE_PATTERNS" | sed 's/|/\\|/g')
        ROLE_HITS=$(grep -rn "$GREP_ROLE_PAT" $TERM_SCAN_DIRS $TERM_EXCLUDES 2>/dev/null | head -20 || true)
        if [ -n "$ROLE_HITS" ]; then
            fail "Prohibited internal development patterns found:"
            echo "$ROLE_HITS" | head -10
        else
            pass "No prohibited internal development patterns found"
        fi
    else
        warn "No role patterns configured"
    fi

    # 11.4: Prohibited tool references
    subsection "11.4 Prohibited tool references"
    if [ -n "$CFG_TOOL_PATTERNS" ]; then
        GREP_TOOL_PAT=$(echo "$CFG_TOOL_PATTERNS" | sed 's/|/\\|/g')
        TOOL_HITS=$(grep -rn "$GREP_TOOL_PAT" $TERM_SCAN_DIRS $TERM_EXCLUDES 2>/dev/null | head -20 || true)
        if [ -n "$TOOL_HITS" ]; then
            fail "Prohibited tool references found:"
            echo "$TOOL_HITS" | head -10
        else
            pass "No prohibited tool references found"
        fi
    else
        warn "No tool patterns configured"
    fi

    # 11.5: Prohibited attribution patterns
    subsection "11.5 Prohibited attribution patterns"
    if [ -n "$CFG_ATTRIB_PATTERNS" ]; then
        GREP_ATTRIB_PAT=$(echo "$CFG_ATTRIB_PATTERNS" | sed 's/|/\\|/g')
        ATTRIB_HITS=$(grep -rni "$GREP_ATTRIB_PAT" $TERM_SCAN_DIRS $TERM_EXCLUDES 2>/dev/null | head -20 || true)
        if [ -n "$ATTRIB_HITS" ]; then
            fail "Prohibited attribution patterns found in source files:"
            echo "$ATTRIB_HITS" | head -10
        else
            pass "No prohibited attribution patterns in source files"
        fi
    else
        warn "No attribution patterns configured"
    fi

else
    # Config file not present — skip G11 terminology checks with warning
    subsection "11.1-11.5 Prohibited terminology checks"
    warn "Terminology config not found — G11 checks 11.1-11.5 skipped (run setup to enable)"
fi

# 11.6: Third-party hardware naming compliance (TRMNL renamed to CC E-Ink)
subsection "11.6 Third-party hardware naming compliance"
# TRMNL is a third-party hardware product. It must not be renamed to "CC E-Ink Display" in docs.
# Check for "CC E-Ink Display" (incorrect rename of TRMNL hardware) in documentation
HW_RENAME_HITS=$(grep -rn "CC E-Ink Display" $TERM_SCAN_DIRS $TERM_EXCLUDES --include="*.md" --include="*.html" 2>/dev/null \
    | grep -v "DEVELOPMENT-RULES\|archive/" | head -10 || true)
if [ -n "$HW_RENAME_HITS" ]; then
    warn "Third-party hardware possibly renamed to 'CC E-Ink Display' (should use 'TRMNL display' for hardware):"
    echo "$HW_RENAME_HITS" | head -5
else
    pass "No incorrect third-party hardware renames found ('CC E-Ink Display')"
fi

# Also check for "Commute Compute display" or "Commute Compute device" when referring to hardware
HW_RENAME_CC=$(grep -rn "Commute Compute display\|Commute Compute device" $TERM_SCAN_DIRS $TERM_EXCLUDES --include="*.md" 2>/dev/null \
    | grep -v "DEVELOPMENT-RULES\|archive/" | head -10 || true)
if [ -n "$HW_RENAME_CC" ]; then
    warn "'Commute Compute display/device' found (should use 'TRMNL display' for hardware references):"
    echo "$HW_RENAME_CC" | head -5
else
    pass "No 'Commute Compute display/device' hardware renames found"
fi

# ============================================================================
# GROUP 12: SPELLING CONSISTENCY (en-AU)
# ============================================================================
group_header "GROUP 12: SPELLING CONSISTENCY (en-AU)"

section "Checking spelling consistency (en-AU)..."

# Directories and file types to scan for prose
SPELL_INCLUDES="--include=*.md --include=*.html --include=*.txt"
SPELL_EXCLUDES="--exclude-dir=.git --exclude-dir=node_modules --exclude=package-lock.json --exclude=*.bmp --exclude=*.png --exclude=*.jpg --exclude=*.pdf"

SPELL_SCAN_DIRS=""
for d in src/ api/ public/ firmware/ docs/ *.md; do
    if [ -e "$d" ]; then
        SPELL_SCAN_DIRS="$SPELL_SCAN_DIRS $d"
    fi
done

# Helper: check a spelling pattern (American → Australian), issue WARNING per match
# Arguments: check_number, american_pattern, australian_spelling
check_spelling() {
    local CHECK_NUM="$1"
    local AMERICAN="$2"
    local AUSTRALIAN="$3"

    subsection "${CHECK_NUM} ${AMERICAN} → ${AUSTRALIAN}"
    # Use grep -inw for word-boundary matching; filter out CSS property lines and code lines
    SPELL_HITS=$(grep -rniwE "$AMERICAN" $SPELL_SCAN_DIRS $SPELL_INCLUDES $SPELL_EXCLUDES 2>/dev/null \
        | grep -v "color:\|background-color:\|text-align:\|var \|const \|let \|function \|=>\|require(\|import " \
        | head -10 || true)
    if [ -n "$SPELL_HITS" ]; then
        warn "American English spelling '${AMERICAN}' found (use '${AUSTRALIAN}'):"
        echo "$SPELL_HITS" | head -5
    else
        pass "No '${AMERICAN}' found — consistent en-AU spelling"
    fi
}

check_spelling "12.1" "behavior" "behaviour"
check_spelling "12.2" "favorite" "favourite"
check_spelling "12.3" "optimize" "optimise"
check_spelling "12.4" "optimization" "optimisation"
check_spelling "12.5" "minimize" "minimise"
check_spelling "12.6" "customize" "customise"
check_spelling "12.7" "customizing" "customising"
check_spelling "12.8" "canceled" "cancelled"
check_spelling "12.9" "authorize" "authorise"
check_spelling "12.10" "catalog" "catalogue"
check_spelling "12.11" "defense" "defence"
check_spelling "12.12" "standardize" "standardise"
check_spelling "12.13" "analyze" "analyse"

# 12.14: "license" used as a noun should be "licence" (en-AU)
subsection "12.14 license (noun) → licence"
# Check for "license" preceded by articles/adjectives indicating noun use
# Exclude: files named LICENSE, SPDX-License-Identifier lines, GNU.*License (proper noun)
LICENSE_NOUN_HITS=$(grep -rnE "(a |the |this |software |commercial |open source |dual |Dual )[Ll]icense" $SPELL_SCAN_DIRS $SPELL_INCLUDES $SPELL_EXCLUDES 2>/dev/null \
    | grep -vi "SPDX-License-Identifier\|GNU.*License\|dual-licensed\|dual licensed" \
    | grep -v "/LICENSE:" \
    | grep -v "Licensed " \
    | head -10 || true)
if [ -n "$LICENSE_NOUN_HITS" ]; then
    warn "American English 'license' used as noun (should be 'licence' in en-AU):"
    echo "$LICENSE_NOUN_HITS" | head -5
else
    pass "No 'license' noun forms found — consistent en-AU 'licence' spelling"
fi

# ============================================================================
# GROUP 13: JURISDICTION & LEGAL COMPLIANCE
# ============================================================================
group_header "GROUP 13: JURISDICTION & LEGAL COMPLIANCE"

section "Verifying jurisdiction and legal references..."

# 13.1: LEGAL.md governing law clause
subsection "13.1 LEGAL.md governing law (Victoria, Australia)"
if [ -f "LEGAL.md" ]; then
    GOV_LAW_VIC=$(grep -ci "Victoria, Australia\|State of Victoria" LEGAL.md 2>/dev/null || echo "0")
    if [ "$GOV_LAW_VIC" -gt 0 ]; then
        pass "LEGAL.md specifies Victoria, Australia as governing law"
    else
        fail "LEGAL.md missing governing law clause (must specify Victoria, Australia)"
    fi
else
    fail "LEGAL.md not found"
fi

# 13.2: LEGAL.md references Copyright Act 1968
subsection "13.2 LEGAL.md references Copyright Act 1968"
if [ -f "LEGAL.md" ]; then
    COPYRIGHT_ACT_1968=$(grep -c "Copyright Act 1968" LEGAL.md 2>/dev/null || echo "0")
    if [ "$COPYRIGHT_ACT_1968" -gt 0 ]; then
        pass "LEGAL.md references Copyright Act 1968 (Cth)"
    else
        fail "LEGAL.md missing Copyright Act 1968 reference"
    fi
fi

# 13.3: PRIVACY.md references Privacy Act 1988 or APPs
subsection "13.3 PRIVACY.md references Privacy Act 1988"
if [ -f "PRIVACY.md" ]; then
    PRIVACY_ACT=$(grep -c "Privacy Act 1988\|Australian Privacy Principles" PRIVACY.md 2>/dev/null || echo "0")
    if [ "$PRIVACY_ACT" -gt 0 ]; then
        pass "PRIVACY.md references Privacy Act 1988 / Australian Privacy Principles"
    else
        fail "PRIVACY.md missing Privacy Act 1988 or Australian Privacy Principles reference"
    fi
else
    fail "PRIVACY.md not found"
fi

# 13.4: Flag US-specific legislation in legal docs
subsection "13.4 No US-specific legislation references in legal docs"
US_LEGISLATION="DMCA\|CCPA\|HIPAA\|FTC Act\|Digital Millennium"
US_LEG_HITS=$(grep -rn "$US_LEGISLATION" LEGAL.md PRIVACY.md CONTRIBUTING.md 2>/dev/null | head -5 || true)
if [ -n "$US_LEG_HITS" ]; then
    warn "US-specific legislation referenced in legal docs (should use Australian equivalents):"
    echo "$US_LEG_HITS" | head -5
else
    pass "No US-specific legislation references in legal docs"
fi

# 13.5: LEGAL.md references Australian Consumer Law
subsection "13.5 LEGAL.md references Australian Consumer Law"
if [ -f "LEGAL.md" ]; then
    ACL_REF=$(grep -c "Australian Consumer Law" LEGAL.md 2>/dev/null || echo "0")
    if [ "$ACL_REF" -gt 0 ]; then
        pass "LEGAL.md references Australian Consumer Law"
    else
        fail "LEGAL.md missing Australian Consumer Law reference"
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
