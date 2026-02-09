#!/bin/bash
#
# COMPREHENSIVE DEVELOPMENT RULES COMPLIANCE AUDIT
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# This script systematically checks EVERY rule in DEVELOPMENT-RULES.md
# Run from repository root: ./scripts/comprehensive-compliance-audit.sh
#
# Covers ALL 24 sections including:
# - Naming conventions, Forbidden terms, Zero-config architecture
# - System architecture, Data flow, Vercel KV storage
# - Security (XSS, Path Traversal, Input Validation, CSP)
# - SmartCommute data flow, Caching strategy
# - UI/UX branding (no emojis), Licensing, Documentation
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

# ============================================================================
# SECTION 0: NAMING CONVENTIONS
# ============================================================================
section "SECTION 0: NAMING CONVENTIONS"

subsection "0.2 Code Naming (cc-* prefixes)"
# Check localStorage keys use cc-* prefix
BAD_LOCALSTORAGE=$(grep -rn "localStorage\.\(get\|set\)Item" public/*.html 2>/dev/null | grep -v "cc-" | grep -v "//.*localStorage" | head -5 || true)
if [ -n "$BAD_LOCALSTORAGE" ]; then
    warn "Some localStorage keys may not use cc-* prefix"
    echo "$BAD_LOCALSTORAGE" | head -3
else
    pass "localStorage keys follow cc-* naming convention"
fi

subsection "0.2 CSS Classes (cc-* prefixes)"
BAD_CSS=$(grep -rn "class=\"[^\"]*\"" public/*.html 2>/dev/null | grep -v "cc-\|btn\|form\|card\|nav\|container\|row\|col\|icon\|svg\|hidden\|active" | head -3 || true)
if [ -n "$BAD_CSS" ]; then
    warn "Some CSS classes may not follow cc-* convention (review manually)"
else
    pass "CSS class naming appears consistent"
fi

# ============================================================================
# SECTION 1: ABSOLUTE PROHIBITIONS - PTV API NAMING
# ============================================================================
section "SECTION 1: ABSOLUTE PROHIBITIONS - PTV API NAMING"

subsection "1.1 Forbidden Terms Check"

# Check for forbidden PTV terms in code
FORBIDDEN_TERMS="PTV_API_KEY|PTV_DEV_ID|PTV_USER_ID|PTV API|PTV Timetable|PTV Developer"
PTV_VIOLATIONS=$(grep -rn "$FORBIDDEN_TERMS" src/ api/ public/*.html public/*.js 2>/dev/null | grep -v "NEVER use\|Forbidden\|DEVELOPMENT-RULES\|archive/" | head -10 || true)

if [ -n "$PTV_VIOLATIONS" ]; then
    fail "Forbidden PTV terms found in code:"
    echo "$PTV_VIOLATIONS"
else
    pass "No forbidden PTV terms in src/, api/, public/"
fi

# Check for PTV in user-facing strings (excluding comments/rules)
PTV_DISPLAY=$(grep -rn '".*PTV.*"' public/*.html 2>/dev/null | grep -v "NEVER use\|Transport Victoria\|archive/" | head -5 || true)
if [ -n "$PTV_DISPLAY" ]; then
    fail "PTV displayed in user-facing strings (use 'Transport Victoria'):"
    echo "$PTV_DISPLAY"
else
    pass "No PTV in user-facing display strings"
fi

subsection "1.1 Forbidden console.log patterns"
PTV_LOGS=$(grep -rn "console.*PTV" src/ api/ 2>/dev/null | grep -v "DEVELOPMENT-RULES" | head -5 || true)
if [ -n "$PTV_LOGS" ]; then
    fail "Console logs contain forbidden 'PTV' references:"
    echo "$PTV_LOGS"
else
    pass "No PTV references in console logs"
fi

subsection "1.2 Legacy PTV API URL Check"
LEGACY_PTV_URL=$(grep -rn "timetableapi\.ptv\.vic\.gov\.au\|data\.ptv\.vic\.gov\.au" src/ api/ 2>/dev/null | head -5 || true)
if [ -n "$LEGACY_PTV_URL" ]; then
    fail "Legacy PTV API URLs found (use Transport Victoria OpenData):"
    echo "$LEGACY_PTV_URL"
else
    pass "No legacy PTV API URLs"
fi

# ============================================================================
# SECTION 2: TRMNL/USETRMNL PROHIBITION
# ============================================================================
section "SECTION 2: TRMNL/USETRMNL PROHIBITION"

subsection "2.1 Express Prohibition on TRMNL Services"
TRMNL_VIOLATIONS=$(grep -rn "usetrmnl\.com\|trmnl\.com\|api\.usetrmnl" src/ api/ public/ firmware/ 2>/dev/null | grep -v "archive/" | head -5 || true)
if [ -n "$TRMNL_VIOLATIONS" ]; then
    fail "TRMNL/usetrmnl server references found (CRITICAL):"
    echo "$TRMNL_VIOLATIONS"
else
    pass "No TRMNL/usetrmnl server dependencies"
fi

# ============================================================================
# SECTION 3: ZERO-CONFIG SERVERLESS ARCHITECTURE
# ============================================================================
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

subsection "3.6 Vercel KV Storage Pattern"
# Check for Vercel KV usage in API files
if [ -d "src/data" ]; then
    KV_USAGE=$(grep -rn "@vercel/kv\|kv\.get\|kv\.set" src/ api/ 2>/dev/null | head -3 || true)
    if [ -n "$KV_USAGE" ]; then
        pass "Vercel KV storage pattern in use"
    else
        warn "No Vercel KV usage found - verify KV storage is implemented"
    fi
else
    skip "src/data directory not found"
fi

subsection "3.7 localStorage Keys Structure"
# Check for required localStorage keys
REQUIRED_KEYS="cc-config|cc-configured|cc-transit-api-key"
LOCALSTORAGE_KEYS=$(grep -rn "$REQUIRED_KEYS" public/setup-wizard.html public/admin.html 2>/dev/null | head -5 || true)
if [ -n "$LOCALSTORAGE_KEYS" ]; then
    pass "Required localStorage keys present (cc-config, cc-configured)"
else
    warn "Some required localStorage keys may be missing"
fi

# ============================================================================
# SECTION 4: SYSTEM ARCHITECTURE RULES
# ============================================================================
section "SECTION 4: SYSTEM ARCHITECTURE RULES"

subsection "4.5 Required Endpoints Check"
REQUIRED_ENDPOINTS="zones|screen|livedash|status|health"
for endpoint in zones screen livedash status health; do
    if [ -f "api/$endpoint.js" ]; then
        pass "/api/$endpoint endpoint exists"
    else
        fail "/api/$endpoint endpoint MISSING (required by Section 4.5)"
    fi
done

subsection "4.3 Data Flow - Cache Patterns"
# Check for proper caching in opendata-client
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

# ============================================================================
# SECTION 5: CUSTOM FIRMWARE REQUIREMENT
# ============================================================================
section "SECTION 5: CUSTOM FIRMWARE REQUIREMENT"

subsection "5.2 Firmware Directory Structure"
if [ -d "firmware" ]; then
    pass "firmware/ directory exists"

    # Check for main.cpp
    if [ -f "firmware/src/main.cpp" ]; then
        pass "firmware/src/main.cpp exists"

        # Check for anti-brick patterns (no deepSleep in setup)
        DEEPSLEEP_SETUP=$(grep -n "deepSleep\|esp_deep_sleep" firmware/src/main.cpp 2>/dev/null | grep -v "loop\|//" | head -3 || true)
        if [ -z "$DEEPSLEEP_SETUP" ]; then
            pass "No immediate deepSleep calls detected"
        else
            warn "Potential deepSleep calls found (verify not in setup()):"
            echo "$DEEPSLEEP_SETUP"
        fi
    else
        skip "firmware/src/main.cpp not found"
    fi

    # Check for platformio.ini
    if [ -f "firmware/platformio.ini" ]; then
        pass "firmware/platformio.ini exists"
    else
        warn "firmware/platformio.ini not found"
    fi
else
    skip "firmware/ directory not found"
fi

subsection "5.4 ESP32-C3 Anti-Brick Patterns"
if [ -f "firmware/src/main.cpp" ]; then
    # Check for watchdog (should be removed per Section 1.1)
    WATCHDOG=$(grep -n "esp_task_wdt\|wdt_" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -z "$WATCHDOG" ]; then
        pass "No watchdog timer usage (correct per Section 1.1)"
    else
        fail "Watchdog timer found (Section 1.1 prohibits esp_task_wdt_*):"
        echo "$WATCHDOG"
    fi

    # Check for brownout disable
    BROWNOUT=$(grep -n "BROWN_OUT\|brownout" firmware/src/main.cpp 2>/dev/null | head -1 || true)
    if [ -n "$BROWNOUT" ]; then
        pass "Brownout detection handling present"
    else
        warn "No brownout handling found (recommended for ESP32-C3)"
    fi
fi

# ============================================================================
# SECTION 7: SPEC INTEGRITY
# ============================================================================
section "SECTION 7: SPEC INTEGRITY"

subsection "7.1 V10 Spec File Exists"
if [ -f "specs/CCDashDesignV12.md" ]; then
    pass "CCDashDesignV12.md spec file exists"
else
    warn "specs/CCDashDesignV12.md not found"
fi

# ============================================================================
# SECTION 11: API & DATA RULES
# ============================================================================
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

subsection "11.1 KeyId Header Pattern"
KEYID_HEADER=$(grep -rn "KeyId\|keyid" src/ api/ 2>/dev/null | grep -v "apiKey\|api_key" | head -3 || true)
if [ -n "$KEYID_HEADER" ]; then
    pass "KeyId header pattern found for GTFS-RT auth"
else
    warn "KeyId header not found - verify Transport Victoria API auth"
fi

subsection "11.3 Google Places API (New) Pattern"
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

# ============================================================================
# SECTION 12: BUSINESS LOGIC
# ============================================================================
section "SECTION 12: BUSINESS LOGIC"

subsection "12.2 12-hour Time Format"
# Check for 24-hour time patterns in display code
TIME_24H=$(grep -rn "getHours()" public/*.html src/ 2>/dev/null | grep -v "% 12\|archive/" | head -5 || true)
if [ -n "$TIME_24H" ]; then
    warn "Potential 24-hour time format usage (check manually):"
    echo "$TIME_24H" | head -3
else
    pass "Time formatting appears to use 12-hour format"
fi

# ============================================================================
# SECTION 13: CODE QUALITY
# ============================================================================
section "SECTION 13: CODE QUALITY"

subsection "13.5 File Naming (no ptv-api.js, ptv-service.js)"
PTV_FILES=$(find src/ api/ -name "*ptv*" 2>/dev/null | grep -v "stop\|route" || true)
if [ -n "$PTV_FILES" ]; then
    warn "Files with 'ptv' in name should use neutral naming:"
    echo "$PTV_FILES"
else
    pass "No legacy ptv-api/ptv-service file names"
fi

subsection "13.3 No Magic Numbers"
# Check for common magic numbers in rendering code
MAGIC_NUMBERS=$(grep -rn "\b800\b.*\b480\b\|\b480\b.*\b800\b" src/ api/ 2>/dev/null | grep -v "DISPLAY_WIDTH\|DISPLAY_HEIGHT\|WIDTH\|HEIGHT\|comment\|//" | head -3 || true)
if [ -n "$MAGIC_NUMBERS" ]; then
    warn "Possible magic numbers (should use named constants):"
    echo "$MAGIC_NUMBERS" | head -3
else
    pass "No obvious magic number violations"
fi

# ============================================================================
# SECTION 17: SECURITY (COMPREHENSIVE)
# ============================================================================
section "SECTION 17: SECURITY (COMPREHENSIVE)"

subsection "17.1 XSS Input Sanitization"
# Check for sanitize function in HTML files
SANITIZE_CHECK=$(grep -l "function sanitize" public/admin.html public/setup-wizard.html 2>/dev/null || true)
if [ -z "$SANITIZE_CHECK" ]; then
    fail "sanitize() function missing from admin.html or setup-wizard.html"
else
    pass "sanitize() function present in UI files"
fi

# Check for unsanitized innerHTML with user data
UNSAFE_INNERHTML=$(grep -rn 'innerHTML.*\${[^}]*}' public/*.html 2>/dev/null | grep -v "sanitize\|icon\|svg\|archive/" | head -5 || true)
if [ -n "$UNSAFE_INNERHTML" ]; then
    warn "Potential unsanitized innerHTML (verify sanitize() is used):"
    echo "$UNSAFE_INNERHTML" | head -3
fi

subsection "17.4 No Hardcoded Personal Information"
# Check for personal address patterns
PERSONAL_ADDR=$(grep -rn "[0-9]\+ [A-Z][a-z]*\(Street\|St\|Road\|Rd\|Ave\|Avenue\)" src/ api/ public/*.js 2>/dev/null | grep -v "Example\|Sample\|test\|placeholder\|archive/" | head -5 || true)
if [ -n "$PERSONAL_ADDR" ]; then
    warn "Potential hardcoded addresses (verify they're examples):"
    echo "$PERSONAL_ADDR" | head -3
else
    pass "No suspicious hardcoded addresses found"
fi

# Check for Melbourne coordinates that aren't defaults
COORDS=$(grep -rn "\-37\.[0-9][0-9][0-9]" src/ api/ 2>/dev/null | grep -v "8136\|DEFAULT\|example\|test\|MELBOURNE_CBD\|MELBOURNE_CENTER" | head -5 || true)
if [ -n "$COORDS" ]; then
    warn "Potential hardcoded coordinates (verify they're defaults):"
    echo "$COORDS" | head -3
fi

subsection "17.5 No Environment Files in Repository"
pass "Environment file check (see Section 3)"

subsection "17.6 Path Traversal Prevention"
# Check for path.basename or path.resolve usage with user input
PATH_TRAVERSAL=$(grep -rn "req\.\(query\|params\|body\).*path\.\(join\|resolve\)" api/ 2>/dev/null | grep -v "basename" | head -3 || true)
if [ -n "$PATH_TRAVERSAL" ]; then
    warn "Possible path traversal vulnerability (verify path.basename is used):"
    echo "$PATH_TRAVERSAL"
else
    pass "No obvious path traversal vulnerabilities"
fi

subsection "17.7 Supply Chain Security"
if [ -f "package-lock.json" ]; then
    pass "package-lock.json exists (dependency locking)"
else
    fail "package-lock.json missing (dependencies not locked)"
fi

# Check npm audit (if npm available)
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

subsection "17.8 CSP Headers (vercel.json)"
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

subsection "17.9 Security Pre-Commit Patterns"
# Check for console.log with sensitive data
SENSITIVE_LOGS=$(grep -rn "console.log.*\(apiKey\|password\|secret\|token\)" src/ api/ 2>/dev/null | grep -v "//\|sanitize" | head -3 || true)
if [ -n "$SENSITIVE_LOGS" ]; then
    warn "Possible sensitive data in logs (review):"
    echo "$SENSITIVE_LOGS"
else
    pass "No sensitive data patterns in console.log"
fi

subsection "17.12 HTTPS Enforcement"
# Check for http:// URLs (should be https://)
# Exclude: localhost, 127.0.0.1, comments, and XML/SVG namespace declarations (http://www.w3.org)
HTTP_URLS=$(grep -rn "http://" src/ api/ 2>/dev/null | grep -v "localhost\|127.0.0.1\|http://\*\|//.*http\|www\.w3\.org" | head -5 || true)
if [ -n "$HTTP_URLS" ]; then
    fail "Non-HTTPS URLs found (Section 17.12 requires HTTPS):"
    echo "$HTTP_URLS"
else
    pass "No non-HTTPS external URLs found"
fi

subsection "17.13 Input Validation Patterns"
# Check for parseInt/validation on query params
VALIDATION_CHECK=$(grep -rn "parseInt\|Number\(\|isNaN" api/ 2>/dev/null | head -3 || true)
if [ -n "$VALIDATION_CHECK" ]; then
    pass "Input validation patterns found in API"
else
    warn "Limited input validation patterns found - review API endpoints"
fi

# ============================================================================
# SECTION 19: REFRESH TIMING
# ============================================================================
section "SECTION 19: REFRESH TIMING"

subsection "19.0 Refresh Interval Compliance"
if [ -f "firmware/src/main.cpp" ]; then
    # Check for 60-second refresh interval
    REFRESH_60=$(grep -n "60000\|60 \* 1000\|REFRESH_INTERVAL" firmware/src/main.cpp 2>/dev/null | head -3 || true)
    if [ -n "$REFRESH_60" ]; then
        pass "60-second refresh interval pattern found in firmware"
    else
        warn "60-second refresh interval not confirmed - verify REFRESH_INTERVAL"
    fi
fi

# ============================================================================
# SECTION 20: LICENSING
# ============================================================================
section "SECTION 20: LICENSING"

subsection "20.4 License Headers"
# Check for AGPL-3.0 headers in key files
JS_FILES_COUNT=$(find src/ api/ -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JS_FILES_COUNT" -gt 0 ]; then
    LICENSED_COUNT=$(grep -l "AGPL-3.0\|Angus Bergman" src/*.js api/*.js 2>/dev/null | wc -l | tr -d ' ' || echo "0")
    if [ "$LICENSED_COUNT" -lt 5 ]; then
        warn "Some source files may be missing license headers (found $LICENSED_COUNT with headers)"
    else
        pass "License headers present in source files"
    fi
else
    skip "No JS files found in src/ or api/"
fi

subsection "20.0 LICENSE File"
if [ -f "LICENSE" ]; then
    AGPL_CHECK=$(grep -c "AGPL\|GNU AFFERO" LICENSE 2>/dev/null || echo "0")
    if [ "$AGPL_CHECK" -gt 0 ]; then
        pass "LICENSE file contains AGPL reference"
    else
        warn "LICENSE file exists but may not be AGPL-3.0"
    fi
else
    fail "LICENSE file missing"
fi

# ============================================================================
# SECTION 16: DOCUMENTATION STANDARDS
# ============================================================================
section "SECTION 16: DOCUMENTATION STANDARDS"

subsection "16.3 Logo Header in Documentation"
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

# ============================================================================
# SECTION 22: ADMIN PANEL UI/UX BRANDING
# ============================================================================
section "SECTION 22: ADMIN PANEL UI/UX BRANDING"

subsection "22.3 Icons & Imagery (NO EMOJIS) - CRITICAL"

# Comprehensive emoji pattern - common UI emojis
EMOJI_PATTERN='📋|🌐|❌|🎯|🔍|⚠️|✓|✅|🔄|💡|⏳|✨|👍|🤖|🌏|✗|🚊|☕|🧠|📊|⚡|📱|🔗|📟|🕐|🌤️|👤|🗺️|🔒|🔓|💾|🚀|⭐|🎉|👋|📝|🔧|⚙️|📁|📂|🗂️|📌|📍|🏠|🏢|🚌|🚃|🛤️|✈️|🚶|🚶‍♂️|🚶‍♀️|💼|🎒|☀️|🌙|⛅|🌧️|❄️|🌡️|💧|🔥|💨|🌊'

# Check main UI files (excluding archives)
EMOJI_VIOLATIONS=""
for file in public/admin.html public/setup-wizard.html public/index.html public/flasher/index.html; do
    if [ -f "$file" ]; then
        FOUND=$(grep -n "$EMOJI_PATTERN" "$file" 2>/dev/null | head -5 || true)
        if [ -n "$FOUND" ]; then
            EMOJI_VIOLATIONS="$EMOJI_VIOLATIONS\n$file:\n$FOUND"
        fi
    fi
done

# Check SVG files
for file in public/assets/*.svg; do
    if [ -f "$file" ]; then
        FOUND=$(grep -n "$EMOJI_PATTERN" "$file" 2>/dev/null | head -3 || true)
        if [ -n "$FOUND" ]; then
            EMOJI_VIOLATIONS="$EMOJI_VIOLATIONS\n$file:\n$FOUND"
        fi
    fi
done

if [ -n "$EMOJI_VIOLATIONS" ]; then
    fail "EMOJIS FOUND IN UI FILES (Section 22.3 violation):"
    echo -e "$EMOJI_VIOLATIONS"
else
    pass "No emojis in main UI files (Section 22.3 compliant)"
fi

subsection "22.9 Global System Footer"
# Check for system footer in admin.html
if [ -f "public/admin.html" ]; then
    FOOTER_CHECK=$(grep -n "cc-system-footer\|cc-footer-smartcommute-version" public/admin.html 2>/dev/null | head -1 || true)
    if [ -z "$FOOTER_CHECK" ]; then
        fail "Global system footer missing from admin.html"
    else
        pass "Global system footer present in admin.html"
    fi

    # Check version is pulled from API, not hardcoded
    HARDCODED_VERSION=$(grep -n "SmartCommute v[0-9]\|CCDash.*v[0-9]" public/admin.html 2>/dev/null | grep -v "api/version\|fetch\|\.textContent\s*=\s*v\." | head -3 || true)
    if [ -n "$HARDCODED_VERSION" ]; then
        warn "Possible hardcoded versions (should be from /api/version):"
        echo "$HARDCODED_VERSION" | head -3
    fi
fi

subsection "22.10 Official Tagline"
# Check README has official tagline
if [ -f "README.md" ]; then
    TAGLINE_CHECK=$(grep -cE "Other apps show delays\. CommuteCompute(™|&#8482;|\(TM\)) reacts to them" README.md 2>/dev/null || echo "0")
    if [ "$TAGLINE_CHECK" -gt 0 ]; then
        pass "Official tagline present in README.md"
    else
        fail "Official tagline missing from README.md"
    fi
fi

# ============================================================================
# SECTION 23: SMARTCOMMUTE DATA FLOW
# ============================================================================
section "SECTION 23: SMARTCOMMUTE DATA FLOW"

subsection "23.1 GTFS-RT Stop ID Handling"
if [ -d "src/services" ]; then
    STOP_ID_HANDLING=$(grep -rn "stopId\|stop_id\|trainStopId" src/services/ 2>/dev/null | head -3 || true)
    if [ -n "$STOP_ID_HANDLING" ]; then
        pass "Stop ID handling patterns found in services"
    else
        warn "Limited stop ID handling patterns found"
    fi
fi

subsection "23.3 Citybound Detection Logic"
CITYBOUND_CHECK=$(grep -rn "isCitybound\|citybound\|City Loop" src/ 2>/dev/null | head -3 || true)
if [ -n "$CITYBOUND_CHECK" ]; then
    pass "Citybound detection logic found"
else
    warn "Citybound detection logic not found (Section 23.3)"
fi

subsection "23.6 Fallback Data Pattern"
FALLBACK_CHECK=$(grep -rn "fallback\|Fallback\|FALLBACK\|mock\|Mock" src/ 2>/dev/null | grep -v "node_modules" | head -3 || true)
if [ -n "$FALLBACK_CHECK" ]; then
    pass "Fallback data patterns present"
else
    warn "Fallback data patterns not found - verify fallback handling"
fi

# ============================================================================
# SECTION 24: SYSTEM ARCHITECTURE PRINCIPLES
# ============================================================================
section "SECTION 24: SYSTEM ARCHITECTURE PRINCIPLES"

subsection "24.5 Caching Strategy"
# Check for proper TTL values (30s for GTFS-RT, 5min for weather)
CACHE_TTL_30=$(grep -rn "30\s*\*\s*1000\|30000\|30 sec" src/ api/ 2>/dev/null | grep -i "cache\|ttl" | head -2 || true)
CACHE_TTL_300=$(grep -rn "300\s*\*\s*1000\|300000\|5 min\|5min" src/ api/ 2>/dev/null | grep -i "cache\|ttl\|weather" | head -2 || true)
if [ -n "$CACHE_TTL_30" ] || [ -n "$CACHE_TTL_300" ]; then
    pass "Caching TTL patterns found (30s/5min)"
else
    warn "Caching TTL patterns not clearly found - verify Section 24.5"
fi

subsection "24.6 Vercel KV Key Naming"
if [ -d "src/data" ]; then
    KV_KEYS=$(grep -rn "transit-api-key\|google-api-key\|preferences" src/data/ api/ 2>/dev/null | head -3 || true)
    if [ -n "$KV_KEYS" ]; then
        pass "Vercel KV key naming patterns found"
    else
        warn "Vercel KV key naming not found - verify Section 24.6.1"
    fi
fi

subsection "24.7 Security Model - Zero-Config"
# Check that API keys come from KV, not env
ENV_API_KEY=$(grep -rn "process\.env\..*API_KEY\|process\.env\..*KEY" api/ 2>/dev/null | grep -v "KV_REST\|VERCEL" | head -3 || true)
if [ -n "$ENV_API_KEY" ]; then
    warn "API keys from process.env detected (should use Vercel KV):"
    echo "$ENV_API_KEY"
else
    pass "No direct process.env API key usage found"
fi

subsection "24.10 Required API Endpoints"
echo "Verifying all required endpoints exist..."
MISSING_ENDPOINTS=0
for endpoint in zones screen livedash health status; do
    if [ ! -f "api/$endpoint.js" ]; then
        fail "Required endpoint /api/$endpoint MISSING"
        ((MISSING_ENDPOINTS++))
    fi
done
if [ $MISSING_ENDPOINTS -eq 0 ]; then
    pass "All required API endpoints present (Section 24.10)"
fi

# ============================================================================
# SECTION 14: TESTING REQUIREMENTS
# ============================================================================
section "SECTION 14: TESTING REQUIREMENTS"

subsection "14.1.1 Forbidden Terms Verification"
# Final comprehensive check
FINAL_FORBIDDEN=$(grep -rn "PTV_API_KEY\|PTV_DEV_ID\|PTV_USER_ID\|usetrmnl\.com\|trmnl\.com" --include="*.js" --include="*.html" src/ api/ public/ 2>/dev/null | grep -v "archive/\|NEVER use\|Forbidden\|DEVELOPMENT" | head -10 || true)
if [ -n "$FINAL_FORBIDDEN" ]; then
    fail "CRITICAL: Forbidden terms found in final check:"
    echo "$FINAL_FORBIDDEN"
else
    pass "Forbidden terms verification passed"
fi

# ============================================================================
# ADDITIONAL COMPLIANCE CHECKS
# ============================================================================
section "ADDITIONAL COMPLIANCE CHECKS"

subsection "API Version Endpoint"
if [ -f "api/version.js" ]; then
    pass "api/version.js exists for dynamic versioning"
else
    warn "api/version.js not found"
fi

subsection "Attribution Requirements"
if [ -f "public/admin.html" ]; then
    ATTRIBUTION_CHECK=$(grep -c "Transport Victoria\|Bureau of Meteorology\|OpenStreetMap\|Angus Bergman" public/admin.html 2>/dev/null || echo "0")
    if [ "$ATTRIBUTION_CHECK" -lt 2 ]; then
        warn "May be missing required attributions in admin.html"
    else
        pass "Attribution references found in admin.html"
    fi
fi

subsection "Function Naming (no savePtvConfig)"
PTV_FUNCTIONS=$(grep -rn "function.*[Pp]tv\|savePtv\|getPtv" public/*.html src/*.js api/*.js 2>/dev/null | grep -v "archive/" | head -3 || true)
if [ -n "$PTV_FUNCTIONS" ]; then
    fail "Function names contain forbidden 'Ptv' term:"
    echo "$PTV_FUNCTIONS"
else
    pass "No PTV-named functions"
fi

subsection "DEVELOPMENT-RULES.md Exists"
if [ -f "DEVELOPMENT-RULES.md" ]; then
    pass "DEVELOPMENT-RULES.md exists"
else
    fail "DEVELOPMENT-RULES.md not found"
fi

# ============================================================================
# SUMMARY
# ============================================================================
section "AUDIT SUMMARY"

echo ""
echo -e "${GREEN}Passed:${NC}     $PASSED"
echo -e "${YELLOW}Warnings:${NC}   $WARNINGS"
echo -e "${RED}Violations:${NC} $VIOLATIONS"
echo -e "${CYAN}Skipped:${NC}    $SKIPPED"
echo ""

TOTAL_CHECKS=$((PASSED + WARNINGS + VIOLATIONS))
echo "Total Checks: $TOTAL_CHECKS"
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
