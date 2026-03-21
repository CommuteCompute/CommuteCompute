#!/bin/bash
#
# CC META-AUDIT v1.0 — Pipeline Self-Assessment
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Checks whether the audit scripts themselves have blind spots relative to
# the current codebase. Ensures no file, endpoint, page, or DEVELOPMENT-RULES
# section escapes audit coverage.
#
# Run from repository root: ./scripts/cc-meta-audit.sh
# Exit codes: 0=pipeline fully covers codebase, 1=blind spots detected
#

set +e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

VIOLATIONS=0
WARNINGS=0
PASSED=0
SKIPPED=0

pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ((VIOLATIONS++)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; ((WARNINGS++)); }
skip() { echo -e "  ${CYAN}[SKIP]${NC} $1"; ((SKIPPED++)); }

section() {
    echo ""
    echo -e "${BLUE}==================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==================================================================${NC}"
}

subsection() {
    echo ""
    echo -e "${CYAN}--- $1 ---${NC}"
}

echo ""
echo "=================================================================="
echo "  CC META-AUDIT v1.0 — Pipeline Self-Assessment"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================================="
echo ""
echo "  Checks audit scripts for blind spots against the live codebase."
echo ""

AUDIT_SCRIPT="$REPO_ROOT/scripts/comprehensive-compliance-audit.sh"
VALIDATE_SCRIPT="$REPO_ROOT/scripts/cc-dev-validate.sh"
DOCS_INTEGRITY="$REPO_ROOT/scripts/cc-docs-integrity.sh"
SEMANTIC_AUDIT="$REPO_ROOT/scripts/semantic-version-audit.js"
PYTHON_SCANNER="$REPO_ROOT/scripts/cc-compliance-scanner.py"
CONSTANTS_FILE="$REPO_ROOT/scripts/cc-constants.json"
VERSION_FILE="$REPO_ROOT/VERSION.json"

# ============================================================================
# M1: HTML PAGE COVERAGE
# ============================================================================
section "M1: HTML PAGE COVERAGE"

subsection "M1.1 Every public/*.html is in comprehensive-compliance-audit.sh G2"

DISK_HTML=$(find public -name '*.html' -not -path '*/node_modules/*' 2>/dev/null | sort)
AUDIT_HTML=$(grep -o 'public/[^"]*\.html' "$AUDIT_SCRIPT" 2>/dev/null | sort -u)

MISSING_HTML=0
for html_file in $DISK_HTML; do
    if echo "$AUDIT_HTML" | grep -qF "$html_file"; then
        pass "Page covered: $html_file"
    else
        fail "Page NOT in audit: $html_file — add to HTML_PAGES arrays"
        ((MISSING_HTML++))
    fi
done

if [ "$MISSING_HTML" -eq 0 ]; then
    pass "All HTML pages covered by comprehensive audit"
fi

subsection "M1.2 Audit references no deleted HTML pages"

for audit_ref in $AUDIT_HTML; do
    if [ -f "$audit_ref" ]; then
        pass "Audit ref exists: $audit_ref"
    else
        fail "Audit references non-existent page: $audit_ref"
    fi
done

# ============================================================================
# M2: API ENDPOINT COVERAGE
# ============================================================================
section "M2: API ENDPOINT COVERAGE"

subsection "M2.1 Every api/*.js (top-level) is in comprehensive-compliance-audit.sh G3"

DISK_API_TOP=$(find api -maxdepth 1 -name '*.js' 2>/dev/null | sort)
AUDIT_API=$(grep -o '"api/[^"]*\.js"' "$AUDIT_SCRIPT" 2>/dev/null | tr -d '"' | grep -v '\$' | grep -v ' ' | sort -u)

MISSING_API=0
for api_file in $DISK_API_TOP; do
    if echo "$AUDIT_API" | grep -qF "$api_file"; then
        pass "Endpoint covered: $api_file"
    else
        fail "Endpoint NOT in audit: $api_file — add to API_ENDPOINTS array"
        ((MISSING_API++))
    fi
done

subsection "M2.2 Every api/**/*.js (subdirectory) is in audit"

DISK_API_SUB=$(find api -mindepth 2 -name '*.js' 2>/dev/null | sort)
for api_file in $DISK_API_SUB; do
    if echo "$AUDIT_API" | grep -qF "$api_file"; then
        pass "Sub-endpoint covered: $api_file"
    else
        # Check if it's referenced anywhere in the audit (even outside main array)
        if grep -qF "$(basename "$api_file" .js)" "$AUDIT_SCRIPT" 2>/dev/null; then
            pass "Sub-endpoint referenced (not in main array): $api_file"
        else
            warn "Sub-endpoint NOT in audit: $api_file — consider adding"
        fi
    fi
done

subsection "M2.3 Audit references no deleted endpoints"

for audit_ref in $AUDIT_API; do
    if [ -f "$audit_ref" ]; then
        pass "Audit ref exists: $audit_ref"
    else
        fail "Audit references non-existent endpoint: $audit_ref — remove from API_ENDPOINTS"
    fi
done

subsection "M2.4 vercel.json function entries match disk"

if [ -f "vercel.json" ]; then
    VERCEL_FUNCS=$(node -e "
        const v = JSON.parse(require('fs').readFileSync('vercel.json','utf8'));
        if (v.functions) Object.keys(v.functions).forEach(k => console.log(k));
    " 2>/dev/null)

    for func in $VERCEL_FUNCS; do
        if [ -f "$func" ]; then
            pass "vercel.json function exists: $func"
        else
            fail "vercel.json references non-existent function: $func"
        fi
    done
fi

# ============================================================================
# M3: DEVELOPMENT-RULES SECTION COVERAGE
# ============================================================================
section "M3: DEVELOPMENT-RULES SECTION COVERAGE"

subsection "M3.1 Every numbered section has audit coverage"

# Extract section numbers from DEVELOPMENT-RULES.md
DEV_RULES="$REPO_ROOT/DEVELOPMENT-RULES.md"
if [ -f "$DEV_RULES" ]; then
    RULE_SECTIONS=$(grep -oE 'Section [0-9]+' "$DEV_RULES" | sort -t' ' -k2 -n -u | awk '{print $2}')
    RULE_COUNT=$(echo "$RULE_SECTIONS" | wc -l | tr -d ' ')
    pass "Found $RULE_COUNT numbered sections in DEVELOPMENT-RULES.md"

    for sec_num in $RULE_SECTIONS; do
        # Check if this section is referenced in the comprehensive audit
        if grep -qE "Section $sec_num[^0-9]|SECTION $sec_num[^0-9]|Sections.*$sec_num" "$AUDIT_SCRIPT" 2>/dev/null; then
            pass "Section $sec_num: referenced in comprehensive-compliance-audit.sh"
        elif grep -qE "Section $sec_num|section.*$sec_num" "$VALIDATE_SCRIPT" 2>/dev/null; then
            pass "Section $sec_num: referenced in cc-dev-validate.sh"
        elif grep -qE "section.*$sec_num" "$PYTHON_SCANNER" 2>/dev/null; then
            pass "Section $sec_num: referenced in cc-compliance-scanner.py"
        else
            warn "Section $sec_num: NO audit coverage found — review whether checks needed"
        fi
    done
else
    fail "DEVELOPMENT-RULES.md not found"
fi

# ============================================================================
# M4: CONSTANTS CONSISTENCY
# ============================================================================
section "M4: CONSTANTS CONSISTENCY"

subsection "M4.1 cc-constants.json TM marks checked in audit"

if [ -f "$CONSTANTS_FILE" ]; then
    TM_MARKS=$(node -e "
        const c = JSON.parse(require('fs').readFileSync('$CONSTANTS_FILE','utf8'));
        c.required_tm_marks.forEach(m => console.log(m));
    " 2>/dev/null)

    for mark in $TM_MARKS; do
        if grep -qF "$mark" "$AUDIT_SCRIPT" 2>/dev/null || \
           grep -qF "$mark" "$VALIDATE_SCRIPT" 2>/dev/null || \
           grep -qF "$mark" "$PYTHON_SCANNER" 2>/dev/null; then
            pass "TM mark checked: $mark"
        else
            warn "TM mark '$mark' not found in any audit script"
        fi
    done
else
    fail "cc-constants.json not found"
fi

subsection "M4.2 cc-constants.json prohibited terms checked in audit"

if [ -f "$CONSTANTS_FILE" ]; then
    PROHIBITED=$(node -e "
        const c = JSON.parse(require('fs').readFileSync('$CONSTANTS_FILE','utf8'));
        c.prohibited_terms.forEach(p => console.log(p.term));
    " 2>/dev/null)

    for term in $PROHIBITED; do
        if grep -qF "$term" "$AUDIT_SCRIPT" 2>/dev/null || \
           grep -qF "$term" "$PYTHON_SCANNER" 2>/dev/null; then
            pass "Prohibited term checked: $term"
        else
            fail "Prohibited term '$term' not checked in any audit"
        fi
    done
fi

subsection "M4.3 VERSION.json component versions parsed by all version audits"

if [ -f "$VERSION_FILE" ]; then
    COMPONENTS=$(node -e "
        const v = JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8'));
        const c = v.components || {};
        Object.keys(c).forEach(k => console.log(k + '=' + (c[k].version || 'unknown')));
        if (v.firmware) console.log('firmware=' + v.firmware.version);
        if (v.system) console.log('system=' + (v.system.version || v.system));
    " 2>/dev/null)

    for comp in $COMPONENTS; do
        name=$(echo "$comp" | cut -d= -f1)
        ver=$(echo "$comp" | cut -d= -f2)
        if grep -q "$ver" "$VALIDATE_SCRIPT" 2>/dev/null || \
           grep -q "$ver" "$AUDIT_SCRIPT" 2>/dev/null || \
           grep -q "$name" "$SEMANTIC_AUDIT" 2>/dev/null; then
            pass "Version component '$name' (v$ver) checked"
        else
            warn "Version component '$name' (v$ver) may not be checked"
        fi
    done
fi

# ============================================================================
# M5: VERIFY-SCRIPT RELEVANCE
# ============================================================================
section "M5: VERIFY-SCRIPT RELEVANCE"

subsection "M5.1 Verify scripts reference files that still exist"

VERIFY_SCRIPTS=$(find scripts -name 'verify-*.sh' 2>/dev/null | sort)
for vscript in $VERIFY_SCRIPTS; do
    VNAME=$(basename "$vscript")
    # Extract file paths referenced in the verify script
    FILE_REFS=$(grep -oE '(api|src|public)/[a-zA-Z0-9/_\[\].-]+\.js' "$vscript" 2>/dev/null | sort -u)
    STALE_COUNT=0
    for ref in $FILE_REFS; do
        if [ ! -f "$ref" ]; then
            fail "$VNAME references non-existent: $ref"
            ((STALE_COUNT++))
        fi
    done
    if [ "$STALE_COUNT" -eq 0 ]; then
        pass "$VNAME: all file references valid"
    fi
done

subsection "M5.2 Verify scripts reference functions that still exist"

for vscript in $VERIFY_SCRIPTS; do
    VNAME=$(basename "$vscript")
    # Extract function names checked by grep in verify scripts
    FUNC_REFS=$(grep -oE 'grep.*"(function |export |const )[a-zA-Z_]+"' "$vscript" 2>/dev/null | grep -oE '(function |export |const )[a-zA-Z_]+' | awk '{print $NF}' | sort -u)
    # This is a rough heuristic — just check a few key ones exist somewhere in src/ or api/
    MISSING_FUNC=0
    for func in $FUNC_REFS; do
        if grep -rq "$func" src/ api/ 2>/dev/null; then
            : # exists
        else
            warn "$VNAME checks for '$func' which is not found in src/ or api/"
            ((MISSING_FUNC++))
        fi
    done
    if [ "$MISSING_FUNC" -eq 0 ] && [ -n "$FUNC_REFS" ]; then
        pass "$VNAME: all checked functions exist in codebase"
    fi
done

# ============================================================================
# M6: SOURCE FILE COVERAGE
# ============================================================================
section "M6: SOURCE FILE COVERAGE"

subsection "M6.1 src/ files referenced by at least one audit"

# Key source directories that should be covered
SRC_KEY_FILES=(
    "src/services/ccdash-renderer.js"
    "src/services/opendata-client.js"
    "src/engines/commute-compute.js"
    "src/engines/lifestyle-context.js"
    "src/data/gtfs-stop-names.js"
    "src/utils/haversine.js"
    "src/utils/time-format.js"
    "src/utils/fetch-retry.js"
    "src/utils/suburb-extract.js"
    "src/utils/auth-middleware.js"
    "src/utils/config-token.js"
    "src/services/kv-preferences.js"
)

for src_file in "${SRC_KEY_FILES[@]}"; do
    if [ ! -f "$src_file" ]; then
        skip "Key file not found (may have moved): $src_file"
        continue
    fi
    BASENAME=$(basename "$src_file" .js)
    if grep -rq "$BASENAME\|$src_file" scripts/ 2>/dev/null; then
        pass "Key file audited: $src_file"
    else
        warn "Key file NOT referenced by any audit script: $src_file"
    fi
done

subsection "M6.2 New src/ files not covered by any audit"

ALL_SRC=$(find src -name '*.js' -not -path '*/node_modules/*' 2>/dev/null | sort)
UNCOVERED=0
for src_file in $ALL_SRC; do
    BASENAME=$(basename "$src_file" .js)
    if grep -rq "$BASENAME\|$src_file" scripts/ 2>/dev/null; then
        : # covered
    else
        warn "Uncovered src file: $src_file"
        ((UNCOVERED++))
    fi
done
if [ "$UNCOVERED" -eq 0 ]; then
    pass "All src/ files referenced by at least one audit script"
else
    warn "$UNCOVERED src/ files not referenced by any audit script"
fi

# ============================================================================
# M7: SCRIPT INFRASTRUCTURE HEALTH
# ============================================================================
section "M7: SCRIPT INFRASTRUCTURE HEALTH"

subsection "M7.1 All audit scripts have valid shebang and are executable"

AUDIT_SCRIPTS=(
    "scripts/comprehensive-compliance-audit.sh"
    "scripts/cc-dev-validate.sh"
    "scripts/cc-docs-integrity.sh"
    "scripts/cc-meta-audit.sh"
)

for script in "${AUDIT_SCRIPTS[@]}"; do
    if [ ! -f "$script" ]; then
        skip "Script not found: $script"
        continue
    fi
    # Check shebang
    FIRST_LINE=$(head -1 "$script")
    if echo "$FIRST_LINE" | grep -q '^#!/bin/bash'; then
        pass "$script: valid bash shebang"
    else
        fail "$script: missing or invalid shebang (got: $FIRST_LINE)"
    fi
    # Check executable
    if [ -x "$script" ]; then
        pass "$script: executable permission set"
    else
        warn "$script: not executable (run chmod +x)"
    fi
done

subsection "M7.2 Node.js audit scripts have valid syntax"

NODE_SCRIPTS=$(find scripts -name '*.js' 2>/dev/null | sort)
for nscript in $NODE_SCRIPTS; do
    if node --check "$nscript" 2>/dev/null; then
        pass "Syntax OK: $nscript"
    else
        fail "Syntax ERROR: $nscript"
    fi
done

subsection "M7.3 Python scanner syntax"

if [ -f "$PYTHON_SCANNER" ] && command -v python3 > /dev/null 2>&1; then
    if python3 -c "import py_compile; py_compile.compile('$PYTHON_SCANNER', doraise=True)" 2>/dev/null; then
        pass "Python scanner syntax OK"
    else
        fail "Python scanner syntax error"
    fi
else
    skip "Python scanner not available"
fi

subsection "M7.4 Audit log directory exists"

if [ -d "audit-logs" ]; then
    pass "audit-logs/ directory exists"
    LOG_COUNT=$(find audit-logs -name '*.log' -o -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
    pass "audit-logs/ contains $LOG_COUNT log files"
else
    warn "audit-logs/ directory does not exist (will be created on first run)"
fi

# ============================================================================
# M8: CROSS-SCRIPT CONSISTENCY
# ============================================================================
section "M8: CROSS-SCRIPT CONSISTENCY"

subsection "M8.1 VERSION.json is single source of truth"

# Ensure no audit script has hardcoded version numbers
HARDCODED_VERS=$(grep -n "v5\.0\.0\|v4\.0\|v3\.0\|v8\.1\.0\|CCDashDesignV16" scripts/comprehensive-compliance-audit.sh 2>/dev/null | grep -v '#\|echo\|LOCKED\|SPEC FIX\|VERSION_FILE\|VJ_\|_VER\|_CLEAN\|fallback' | head -5 || true)
if [ -n "$HARDCODED_VERS" ]; then
    warn "Possible hardcoded versions in comprehensive-compliance-audit.sh (should read from VERSION.json):"
    echo "$HARDCODED_VERS" | head -5
else
    pass "No hardcoded versions detected in comprehensive-compliance-audit.sh"
fi

subsection "M8.2 Endpoint loop targets use 'commutecompute' (not 'screen')"

SCREEN_LOOPS=$(grep -n 'for.*endpoint.*screen\|for.*screen.*endpoint' scripts/comprehensive-compliance-audit.sh 2>/dev/null | head -5 || true)
if [ -n "$SCREEN_LOOPS" ]; then
    fail "Audit still loops over 'screen' endpoint (should be 'commutecompute'):"
    echo "$SCREEN_LOOPS"
else
    pass "No stale 'screen' endpoint loops in audit"
fi

subsection "M8.3 Exit code semantics consistent"

for script in scripts/comprehensive-compliance-audit.sh scripts/cc-dev-validate.sh scripts/cc-docs-integrity.sh; do
    if [ ! -f "$script" ]; then
        skip "Script not found: $script"
        continue
    fi
    # Check script exits with proper codes
    if grep -q 'exit 1' "$script" 2>/dev/null && grep -q 'exit 0' "$script" 2>/dev/null; then
        pass "$(basename "$script"): has both exit 0 and exit 1 paths"
    else
        warn "$(basename "$script"): may be missing proper exit code handling"
    fi
done

# ============================================================================
# M9: DELETED FILE REFERENCE SWEEP
# ============================================================================
section "M9: DELETED FILE REFERENCE SWEEP"

subsection "M9.1 No audit script references api/screen.js as existing"

# api/screen.js was deleted and merged into api/commutecompute.js
SCREEN_REFS=$(grep -n 'api/screen\.js' scripts/*.sh scripts/*.js scripts/*.py 2>/dev/null | \
    grep -v 'deleted\|DELETED\|merged\|rewrite\|backward\|compat\|removed\|gone\|KNOWN_DELETED\|DELETED_FILES' | \
    head -10 || true)
if [ -n "$SCREEN_REFS" ]; then
    warn "Scripts still reference api/screen.js (may be intentional for checking its absence):"
    echo "$SCREEN_REFS" | head -5
else
    pass "No live references to deleted api/screen.js in audit scripts"
fi

subsection "M9.2 No references to removed terminology"

SMART_REFS=$(grep -rn 'SmartCommute' scripts/ 2>/dev/null | grep -v 'prohibited\|PROHIBITED\|Forbidden\|forbidden\|removed\|REMOVED\|renamed\|RENAMED\|legacy\|check\|CHECK\|FAIL\|fail\|expected\|legitimately\|Skip\|scanner\|print.*---\|"term"\|subsection\|Only flag\|grep.*SmartCommute\|No active\|cc-constants\|warn.*SmartCommute\|pass.*SmartCommute\|Non-trademark\|non-trademark\|verify these' | head -5 || true)
if [ -n "$SMART_REFS" ]; then
    fail "Scripts use 'SmartCommute' outside prohibition checks:"
    echo "$SMART_REFS"
else
    pass "No active SmartCommute usage in scripts"
fi

# ============================================================================
# M10: MARKDOWN FILE AUDIT COVERAGE
# ============================================================================
section "M10: MARKDOWN FILE AUDIT COVERAGE"

subsection "M10.1 Key documentation files are audited"

KEY_DOCS=(
    "README.md"
    "DEVELOPMENT-RULES.md"
    "docs/ARCHITECTURE.md"
    "SECURITY.md"
    "PRIVACY.md"
    "LEGAL.md"
    "INSTALL.md"
    "CONTRIBUTING.md"
    "docs/CHANGELOG.md"
)

for doc in "${KEY_DOCS[@]}"; do
    if [ ! -f "$doc" ]; then
        skip "Doc not found: $doc"
        continue
    fi
    BASENAME=$(basename "$doc" .md)
    if grep -rq "$BASENAME\|$doc" scripts/ 2>/dev/null; then
        pass "Doc audited: $doc"
    else
        warn "Doc NOT referenced by any audit script: $doc"
    fi
done

subsection "M10.2 Total .md file count vs audited count"

TOTAL_MD=$(find . -name '*.md' -not -path '*/node_modules/*' -not -path '*/.pio/*' -not -path '*/.git/*' 2>/dev/null | wc -l | tr -d ' ')
AUDITED_MD=0
for md_file in $(find . -name '*.md' -not -path '*/node_modules/*' -not -path '*/.pio/*' -not -path '*/.git/*' 2>/dev/null); do
    BASENAME=$(basename "$md_file" .md)
    if grep -rq "$BASENAME" scripts/ 2>/dev/null; then
        ((AUDITED_MD++))
    fi
done
COVERAGE_PCT=$((AUDITED_MD * 100 / TOTAL_MD))
if [ "$COVERAGE_PCT" -ge 50 ]; then
    pass "Markdown audit coverage: $AUDITED_MD/$TOTAL_MD files ($COVERAGE_PCT%)"
else
    warn "Low markdown audit coverage: $AUDITED_MD/$TOTAL_MD files ($COVERAGE_PCT%)"
fi

# ============================================================================
# M11: MONITOR SCRIPT ALIGNMENT
# ============================================================================
section "M11: MONITOR SCRIPT ALIGNMENT"

subsection "M11.1 Monitor config endpoints match actual API endpoints"

MONITOR_CONFIG="monitor/config.mjs"
if [ -f "$MONITOR_CONFIG" ]; then
    # Check that monitor references existing endpoints
    MONITOR_ENDPOINTS=$(grep -oE '/api/[a-zA-Z/_-]+' "$MONITOR_CONFIG" 2>/dev/null | sort -u)
    for mep in $MONITOR_ENDPOINTS; do
        # Convert URL path to file path
        FILE_PATH="api/$(echo "$mep" | sed 's|/api/||').js"
        if [ -f "$FILE_PATH" ]; then
            pass "Monitor endpoint exists: $mep"
        else
            # Check if it's a rewrite
            if grep -q "$(echo "$mep" | sed 's|/api/||')" vercel.json 2>/dev/null; then
                pass "Monitor endpoint via rewrite: $mep"
            else
                warn "Monitor references possibly non-existent endpoint: $mep"
            fi
        fi
    done
else
    skip "Monitor config not found"
fi

# ============================================================================
# SUMMARY
# ============================================================================
section "META-AUDIT SUMMARY"

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
    echo -e "${RED}META-AUDIT FAILED${NC} — $VIOLATIONS blind spot(s) detected"
    echo ""
    echo "The audit pipeline does not fully cover the current codebase."
    echo "Fix violations by adding missing checks to the appropriate audit script."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}META-AUDIT PASSED WITH WARNINGS${NC} — $WARNINGS advisory item(s)"
    echo ""
    echo "Pipeline coverage is adequate but has potential gaps. Review warnings."
    exit 0
else
    echo -e "${GREEN}META-AUDIT PASSED${NC} — Pipeline fully covers codebase"
    exit 0
fi
