#!/bin/bash
# ============================================================================
# Version Consistency & Hyperlink Validation Script
#
# Reads VERSION.json as the single source of truth and validates all version
# references, hyperlinks, and cross-file consistency across the entire repo.
#
# Usage:
#   ./scripts/update-versions.sh           # Full report (check only)
#   ./scripts/update-versions.sh --json    # Output JSON report for automation
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/VERSION.json"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

JSON_OUTPUT=false
ISSUE_COUNT=0
WARN_COUNT=0
JSON_ISSUES_FILE=$(mktemp)
echo "[]" > "$JSON_ISSUES_FILE"

for arg in "$@"; do
    case $arg in
        --json) JSON_OUTPUT=true ;;
    esac
done

# ============================================================================
# Parse VERSION.json using node
# ============================================================================

if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}FATAL: VERSION.json not found at $VERSION_FILE${NC}"
    exit 1
fi

eval "$(node -e "
const v = require('$VERSION_FILE');
console.log('SYS_VER=\"' + v.system.version + '\"');
console.log('ENGINE_VER=\"' + v.components.commutecompute.version + '\"');
console.log('RENDERER_VER=\"' + v.components.renderer.version + '\"');
console.log('ADMIN_VER=\"' + v.components.adminPanel.version + '\"');
console.log('FIRMWARE_VER=\"' + v.firmware.version + '\"');
console.log('SPEC_VER=\"' + v.specs.dashboard.version + '\"');
console.log('LIVEDASH_VER=\"' + v.components.livedash.version + '\"');
")"

echo -e "${CYAN}=== Version Consistency & Hyperlink Validation ===${NC}"
echo -e "Source of truth: VERSION.json"
echo -e "  System:   v${SYS_VER}"
echo -e "  Engine:   v${ENGINE_VER}"
echo -e "  Renderer: v${RENDERER_VER}"
echo -e "  Firmware: v${FIRMWARE_VER}"
echo -e "  Spec:     ${SPEC_VER}"
echo ""

add_issue() {
    local file="$1" line="$2" type="$3" message="$4" severity="${5:-ERROR}"
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
    if [ "$severity" = "WARN" ]; then
        WARN_COUNT=$((WARN_COUNT + 1))
        echo -e "  ${YELLOW}WARN${NC} $file:$line — $message"
    else
        echo -e "  ${RED}FAIL${NC} $file:$line — $message"
    fi
    if $JSON_OUTPUT; then
        # Escape message for safe JSON insertion
        local safe_msg
        safe_msg=$(printf '%s' "$message" | sed 's/\\/\\\\/g;s/"/\\"/g;s/\t/\\t/g' | tr -d "'\n")
        node -e "
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('$JSON_ISSUES_FILE','utf8'));
r.push({file:'$file',line:$line,type:'$type',message:\"$safe_msg\",severity:'$severity'});
fs.writeFileSync('$JSON_ISSUES_FILE', JSON.stringify(r));
" 2>/dev/null || true
    fi
}

add_pass() {
    echo -e "  ${GREEN}PASS${NC} $1"
}

# ============================================================================
# G1: Version Reference Checks
# ============================================================================
echo -e "${CYAN}--- G1: Version References ---${NC}"

# 1.1 package.json
PKG_VER=$(node -e "process.stdout.write(require('$REPO_ROOT/package.json').version)")
if [ "$PKG_VER" = "$SYS_VER" ]; then
    add_pass "package.json version ($PKG_VER) matches system ($SYS_VER)"
else
    add_issue "package.json" 0 "version_mismatch" "package.json has $PKG_VER, expected $SYS_VER"
fi

# 1.2 api/version.js system version
if [ -f "$REPO_ROOT/api/version.js" ]; then
    API_SYS=$(grep -Eo "'v[0-9]+\.[0-9]+\.[0-9]+'" "$REPO_ROOT/api/version.js" | head -1 | tr -d "'" | sed 's/^v//' || echo "")
    if [ -n "$API_SYS" ] && [ "$API_SYS" = "$SYS_VER" ]; then
        add_pass "api/version.js system version matches (v$API_SYS)"
    elif [ -n "$API_SYS" ]; then
        add_issue "api/version.js" 0 "version_mismatch" "api/version.js has v$API_SYS, expected v$SYS_VER"
    fi

    # 1.2b api/version.js firmware version
    API_FW=$(grep -Eo 'CC-FW-[0-9]+\.[0-9]+\.[0-9]+' "$REPO_ROOT/api/version.js" | head -1 | sed 's/CC-FW-//' || echo "")
    if [ -n "$API_FW" ] && [ "$API_FW" = "$FIRMWARE_VER" ]; then
        add_pass "api/version.js firmware matches (CC-FW-$API_FW)"
    elif [ -n "$API_FW" ]; then
        add_issue "api/version.js" 0 "version_mismatch" "api/version.js firmware CC-FW-$API_FW, expected CC-FW-$FIRMWARE_VER"
    fi

    # 1.2c api/version.js engine version
    API_ENG=$(grep -Eo "'v[0-9]+\.[0-9]+'" "$REPO_ROOT/api/version.js" | head -1 | tr -d "'" | sed 's/^v//' || echo "")
    if [ -n "$API_ENG" ] && [ "$API_ENG" = "$ENGINE_VER" ]; then
        add_pass "api/version.js engine version matches (v$API_ENG)"
    elif [ -n "$API_ENG" ]; then
        add_issue "api/version.js" 0 "version_mismatch" "api/version.js engine v$API_ENG, expected v$ENGINE_VER" "WARN"
    fi
fi

# 1.3 firmware/include/config.h
if [ -f "$REPO_ROOT/firmware/include/config.h" ]; then
    FW_CONFIG=$(grep 'FIRMWARE_VERSION' "$REPO_ROOT/firmware/include/config.h" | grep -Eo '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"' || echo "")
    if [ "$FW_CONFIG" = "$FIRMWARE_VER" ]; then
        add_pass "firmware/include/config.h FIRMWARE_VERSION matches ($FW_CONFIG)"
    elif [ -n "$FW_CONFIG" ]; then
        add_issue "firmware/include/config.h" 16 "version_mismatch" "config.h has $FW_CONFIG, expected $FIRMWARE_VER"
    fi
fi

# 1.4 README.md badges
if [ -f "$REPO_ROOT/README.md" ]; then
    README_FW=$(grep -Eo 'CCFirm-v[0-9]+\.[0-9]+\.[0-9]+' "$REPO_ROOT/README.md" | head -1 | sed 's/CCFirm-v//' || echo "")
    if [ -n "$README_FW" ] && [ "$README_FW" = "$FIRMWARE_VER" ]; then
        add_pass "README.md firmware badge matches (v$README_FW)"
    elif [ -n "$README_FW" ]; then
        add_issue "README.md" 0 "version_mismatch" "README badge has v$README_FW, expected v$FIRMWARE_VER"
    fi

    README_SYS=$(grep -Eo 'System-v[0-9]+\.[0-9]+\.[0-9]+' "$REPO_ROOT/README.md" | head -1 | sed 's/System-v//' || echo "")
    if [ -n "$README_SYS" ] && [ "$README_SYS" = "$SYS_VER" ]; then
        add_pass "README.md system badge matches (v$README_SYS)"
    elif [ -n "$README_SYS" ]; then
        add_issue "README.md" 0 "version_mismatch" "README system badge v$README_SYS, expected v$SYS_VER"
    fi
fi

# ============================================================================
# G2: HTML Footer Fallback Versions
# ============================================================================
echo -e "\n${CYAN}--- G2: HTML Footer Fallback & Firmware Versions ---${NC}"

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" | sort | while read -r htmlfile; do
    bname=$(basename "$htmlfile")

    # Check for stale CC-FW- references
    while IFS=: read -r linenum content; do
        FW_REF=$(echo "$content" | grep -Eo 'CC-FW-[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/CC-FW-//' || echo "")
        if [ -n "$FW_REF" ] && [ "$FW_REF" != "$FIRMWARE_VER" ]; then
            add_issue "$bname" "$linenum" "stale_firmware" "Stale firmware ref CC-FW-$FW_REF (current: CC-FW-$FIRMWARE_VER)"
        fi
    done < <(grep -n "CC-FW-" "$htmlfile" 2>/dev/null || true)

    # Check for stale CCFirm version text references
    while IFS=: read -r linenum content; do
        FW_TXT=$(echo "$content" | grep -Eo 'CCFirm[^0-9]*v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' || echo "")
        if [ -n "$FW_TXT" ] && [ "$FW_TXT" != "$FIRMWARE_VER" ]; then
            add_issue "$bname" "$linenum" "stale_firmware_text" "Stale CCFirm text reference v$FW_TXT (current: v$FIRMWARE_VER)"
        fi
    done < <(grep -n "CCFirm" "$htmlfile" 2>/dev/null || true)
done

# ============================================================================
# G3: Internal Hyperlink Validation
# ============================================================================
echo -e "\n${CYAN}--- G3: Internal Hyperlinks ---${NC}"

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" | sort | while read -r htmlfile; do
    bname=$(basename "$htmlfile")
    dir=$(dirname "$htmlfile")

    # Extract all href values
    grep -n 'href="' "$htmlfile" 2>/dev/null | while IFS=: read -r linenum content; do
        echo "$content" | grep -Eo 'href="[^"]*"' | sed 's/href="//;s/"$//' | while read -r href; do
            # Skip external, anchors, javascript, mailto, tel, api paths, JS template strings
            if echo "$href" | grep -qE '^(https?://|mailto:|tel:|javascript:|#|/api/)'; then
                continue
            fi
            # Skip JavaScript concatenation artefacts (template strings in script blocks)
            if echo "$href" | grep -qE "[\+\|'\"]|icons|function|var |const "; then
                continue
            fi

            # Resolve the target path
            local_target=""
            if echo "$href" | grep -qE '^/'; then
                local_target="$REPO_ROOT/public${href}"
            else
                local_target="$dir/${href}"
            fi

            # Strip query params and anchors
            local_target=$(echo "$local_target" | sed 's/[?#].*//')

            # Check existence
            if [ ! -f "$local_target" ] && [ ! -d "$local_target" ]; then
                # Check directory with index.html
                if [ -f "${local_target}/index.html" ] || [ -f "${local_target%/}/index.html" ]; then
                    continue
                fi
                if [ -f "${local_target%/}" ]; then
                    continue
                fi
                add_issue "$bname" "$linenum" "broken_link" "Broken internal link: $href" "WARN"
            fi
        done
    done
done

# ============================================================================
# G4: External Links Inventory
# ============================================================================
echo -e "\n${CYAN}--- G4: External Links (unique domains) ---${NC}"

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" -exec grep -Eoh 'href="https?://[^"]*"' {} \; 2>/dev/null \
    | sed 's/href="//;s/"$//' \
    | grep -Eo 'https?://[^/]+' \
    | sort -u | while read -r domain; do
    echo "    $domain"
done

# ============================================================================
# G5: API Endpoint References
# ============================================================================
echo -e "\n${CYAN}--- G5: API Endpoint References ---${NC}"

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" | sort | while read -r htmlfile; do
    bname=$(basename "$htmlfile")
    if grep -q "cc-system-footer" "$htmlfile" 2>/dev/null; then
        if grep -q "api/version" "$htmlfile" 2>/dev/null; then
            add_pass "$bname fetches /api/version dynamically"
        else
            add_issue "$bname" 0 "missing_api_version" "Has cc-system-footer but no /api/version fetch"
        fi
    fi
done

# ============================================================================
# G6: Upstream Update Checking
# ============================================================================
echo -e "\n${CYAN}--- G6: Upstream Update Checking ---${NC}"

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" | sort | while read -r htmlfile; do
    bname=$(basename "$htmlfile")
    if grep -q "cc-system-footer" "$htmlfile" 2>/dev/null; then
        if grep -q "checkForUpstreamUpdates" "$htmlfile" 2>/dev/null; then
            add_pass "$bname has upstream update checking"
        else
            add_issue "$bname" 0 "missing_upstream_check" "Has footer but no upstream update checking" "WARN"
        fi
        if grep -q "cc-footer-update-notice" "$htmlfile" 2>/dev/null; then
            add_pass "$bname has update notice element"
        else
            add_issue "$bname" 0 "missing_notice_element" "Missing cc-footer-update-notice span" "WARN"
        fi
    fi
done

# ============================================================================
# G7: Navigation Link Consistency
# ============================================================================
echo -e "\n${CYAN}--- G7: Navigation Link Consistency ---${NC}"

NAV_TARGETS=("/" "/setup-wizard.html" "/admin.html" "/privacy.html" "/attribution.html")

find "$REPO_ROOT/public" -name "*.html" -not -path "*/node_modules/*" -not -name "journey-display.html" | sort | while read -r htmlfile; do
    bname=$(basename "$htmlfile")
    missing=""
    for nav in "${NAV_TARGETS[@]}"; do
        nav_base=$(basename "$nav")
        if [ "$nav" = "/" ]; then nav_base="index.html"; fi
        if ! grep -qE "href=\"($nav|$nav_base|/$nav_base)\"" "$htmlfile" 2>/dev/null; then
            missing="$missing $nav"
        fi
    done
    if [ -n "$missing" ]; then
        add_issue "$bname" 0 "missing_nav" "Missing navigation links:$missing" "WARN"
    fi
done

# ============================================================================
# G8: Stale Version String Scan (cross-repo)
# ============================================================================
echo -e "\n${CYAN}--- G8: Stale Version String Scan ---${NC}"

# Scan for old firmware 8.0.0 references (excluding VERSION.json changelog)
OLD_FW=$(grep -rn "8\.0\.0" "$REPO_ROOT" \
    --include="*.html" --include="*.js" --include="*.h" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=audit-logs \
    --exclude="VERSION.json" --exclude="FIRMWARE-VERSION-HISTORY.md" \
    2>/dev/null | grep -iE "firm|CCFirm|CC-FW|firmware" || true)

if [ -n "$OLD_FW" ]; then
    while IFS= read -r ref; do
        FILE=$(echo "$ref" | cut -d: -f1 | sed "s|$REPO_ROOT/||")
        LINE=$(echo "$ref" | cut -d: -f2)
        add_issue "$FILE" "$LINE" "stale_firmware_version" "References old firmware 8.0.0 (current: $FIRMWARE_VER)"
    done <<< "$OLD_FW"
else
    add_pass "No stale firmware 8.0.0 references found"
fi

# Scan README/docs for old system version references
OLD_SYS=$(grep -rn "v4\.1\.0\|v4\.0\.0\|v3\.5\.0" "$REPO_ROOT/README.md" \
    2>/dev/null | grep -iE "system|badge" || true)

if [ -n "$OLD_SYS" ]; then
    while IFS= read -r ref; do
        LINE=$(echo "$ref" | cut -d: -f1)
        add_issue "README.md" "$LINE" "stale_system_version" "Old system version reference" "WARN"
    done <<< "$OLD_SYS"
else
    add_pass "No stale system version references in README badges"
fi

# ============================================================================
# G9: Backend Version References
# ============================================================================
echo -e "\n${CYAN}--- G9: Backend API Version Consistency ---${NC}"

# Check all api/*.js files for CC-FW- references
find "$REPO_ROOT/api" -name "*.js" 2>/dev/null | sort | while read -r apifile; do
    bname=$(basename "$apifile")
    while IFS=: read -r linenum content; do
        FW_API=$(echo "$content" | grep -Eo 'CC-FW-[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/CC-FW-//' || echo "")
        if [ -n "$FW_API" ] && [ "$FW_API" != "$FIRMWARE_VER" ]; then
            add_issue "$bname" "$linenum" "stale_api_firmware" "Stale firmware CC-FW-$FW_API (current: CC-FW-$FIRMWARE_VER)"
        fi
    done < <(grep -n "CC-FW-" "$apifile" 2>/dev/null || true)
done

# ============================================================================
# G10: Source File Spec Version
# ============================================================================
echo -e "\n${CYAN}--- G10: Source File Spec References ---${NC}"

if [ -f "$REPO_ROOT/src/services/ccdash-renderer.js" ]; then
    RSPEC=$(grep -Eo 'CCDashDesignV[0-9]+\.[0-9]+' "$REPO_ROOT/src/services/ccdash-renderer.js" | head -1 || echo "")
    if [ -n "$RSPEC" ] && [ "$RSPEC" = "$SPEC_VER" ]; then
        add_pass "ccdash-renderer.js spec matches ($RSPEC)"
    elif [ -n "$RSPEC" ]; then
        add_issue "src/services/ccdash-renderer.js" 0 "spec_mismatch" "Renderer has $RSPEC, expected $SPEC_VER"
    fi
fi

# ============================================================================
# G11: Markdown Documentation Version Scan
# ============================================================================
echo -e "\n${CYAN}--- G11: Documentation Version References ---${NC}"

# Scan all .md files for firmware version references
find "$REPO_ROOT" -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" \
    -not -name "FIRMWARE-VERSION-HISTORY.md" 2>/dev/null | sort | while read -r mdfile; do
    bname=$(echo "$mdfile" | sed "s|$REPO_ROOT/||")
    while IFS=: read -r linenum content; do
        FW_MD=$(echo "$content" | grep -Eo 'CCFirm[^0-9]*v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' || echo "")
        if [ -n "$FW_MD" ] && [ "$FW_MD" != "$FIRMWARE_VER" ]; then
            add_issue "$bname" "$linenum" "stale_doc_firmware" "Stale CCFirm reference v$FW_MD (current: v$FIRMWARE_VER)" "WARN"
        fi
    done < <(grep -n "CCFirm" "$mdfile" 2>/dev/null || true)

    # Check for CC-FW- references
    while IFS=: read -r linenum content; do
        FW_MD2=$(echo "$content" | grep -Eo 'CC-FW-[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/CC-FW-//' || echo "")
        if [ -n "$FW_MD2" ] && [ "$FW_MD2" != "$FIRMWARE_VER" ]; then
            add_issue "$bname" "$linenum" "stale_doc_firmware" "Stale CC-FW-$FW_MD2 (current: CC-FW-$FIRMWARE_VER)" "WARN"
        fi
    done < <(grep -n "CC-FW-" "$mdfile" 2>/dev/null || true)
done

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${CYAN}=== SUMMARY ===${NC}"

ERRORS=$((ISSUE_COUNT - WARN_COUNT))
if [ $ERRORS -eq 0 ] && [ $WARN_COUNT -eq 0 ]; then
    echo -e "${GREEN}ALL CHECKS PASSED${NC} — Zero discrepancies"
    EXIT_CODE=0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}PASS WITH WARNINGS${NC} — $WARN_COUNT warnings (no errors)"
    EXIT_CODE=0
else
    echo -e "${RED}DISCREPANCIES FOUND${NC} — $ERRORS errors, $WARN_COUNT warnings"
    EXIT_CODE=1
fi

echo -e "  Errors:   $ERRORS"
echo -e "  Warnings: $WARN_COUNT"
echo ""

# JSON report output
if $JSON_OUTPUT; then
    REPORT_FILE="$REPO_ROOT/scripts/version-report.json"
    ISSUES_JSON=$(cat "$JSON_ISSUES_FILE")
    node -e "
const report = {
    timestamp: new Date().toISOString(),
    sourceOfTruth: 'VERSION.json',
    versions: {
        system: '$SYS_VER',
        engine: '$ENGINE_VER',
        renderer: '$RENDERER_VER',
        firmware: '$FIRMWARE_VER',
        spec: '$SPEC_VER'
    },
    errors: $ERRORS,
    warnings: $WARN_COUNT,
    issues: $ISSUES_JSON
};
process.stdout.write(JSON.stringify(report, null, 2));
" > "$REPORT_FILE"
    echo -e "JSON report: ${CYAN}$REPORT_FILE${NC}"
fi

rm -f "$JSON_ISSUES_FILE"
exit $EXIT_CODE
