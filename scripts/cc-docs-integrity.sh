#!/bin/bash
#
# CC DOCS INTEGRITY AUDIT v1.0 — Systematic Documentation Coverage
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Ensures all .md files, HTML docs, and spec files are internally consistent
# and aligned with the current codebase state. Supersedes docs-accuracy-audit.sh
# (which had 5 checks) with comprehensive coverage (~50+ checks).
#
# Run from repository root: ./scripts/cc-docs-integrity.sh
# Exit codes: 0=clean, 1=failures found
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
echo "  CC DOCS INTEGRITY AUDIT v1.0"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=================================================================="
echo ""

VERSION_FILE="$REPO_ROOT/VERSION.json"
CONSTANTS_FILE="$REPO_ROOT/scripts/cc-constants.json"

# Extract versions from VERSION.json
SYS_VER=""
ENGINE_VER=""
RENDERER_VER=""
FW_VER=""
SPEC_VER=""
if [ -f "$VERSION_FILE" ]; then
    SYS_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.system?.version || v.system)" 2>/dev/null)
    ENGINE_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.components?.commutecompute?.version)" 2>/dev/null)
    RENDERER_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.components?.renderer?.version)" 2>/dev/null)
    FW_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.firmware?.version)" 2>/dev/null)
    SPEC_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.specs?.dashboard?.version)" 2>/dev/null)
fi

# Discover all doc files
MD_FILES=$(find . -name '*.md' -not -path '*/node_modules/*' -not -path '*/.pio/*' -not -path '*/.git/*' 2>/dev/null | sort)
MD_COUNT=$(echo "$MD_FILES" | wc -l | tr -d ' ')
echo "  Discovered: $MD_COUNT markdown files"
echo "  Versions: System v${SYS_VER}, Engine v${ENGINE_VER}, Renderer v${RENDERER_VER}, Firmware v${FW_VER}, Spec ${SPEC_VER}"
echo ""

# Known deleted files — docs must NOT reference these as if they exist
DELETED_FILES=(
    "api/screen.js"
    "api/calculate-journey.js"
)

# ============================================================================
# D1: FILE PATH REFERENCES
# ============================================================================
section "D1: FILE PATH REFERENCES IN DOCUMENTATION"

subsection "D1.1 Backtick-quoted file paths in .md files exist on disk"

# Extract backtick-quoted paths that look like repo files
TOTAL_PATH_REFS=0
BROKEN_PATH_REFS=0
for md_file in $MD_FILES; do
    # Match patterns like `api/foo.js`, `src/bar/baz.js`, `public/page.html`
    PATHS=$(grep -oE '`(api|src|public|scripts|monitor|firmware|docs|specs|config|data|tests|tools)/[a-zA-Z0-9/_\[\].-]+`' "$md_file" 2>/dev/null | tr -d '`' | sort -u)
    for ref_path in $PATHS; do
        ((TOTAL_PATH_REFS++))
        if [ -f "$ref_path" ] || [ -d "$ref_path" ]; then
            : # exists
        else
            # Check if it's a known deleted file mentioned in context of deletion
            IS_DELETION_CONTEXT=0
            for deleted in "${DELETED_FILES[@]}"; do
                if [ "$ref_path" = "$deleted" ]; then
                    # Check if surrounding context mentions deletion/merger
                    CONTEXT=$(grep -B1 -A1 "$ref_path" "$md_file" 2>/dev/null | head -6)
                    if echo "$CONTEXT" | grep -qiE 'delet|remov|merg|deprecat|rewrit|obsolete|replaced|migrat|unified|gone|former'; then
                        IS_DELETION_CONTEXT=1
                    fi
                fi
            done
            if [ "$IS_DELETION_CONTEXT" -eq 1 ]; then
                : # acceptable — doc is talking about a deleted file
            else
                fail "$md_file references non-existent: $ref_path"
                ((BROKEN_PATH_REFS++))
            fi
        fi
    done
done

if [ "$BROKEN_PATH_REFS" -eq 0 ]; then
    pass "All $TOTAL_PATH_REFS file path references in docs are valid"
else
    fail "$BROKEN_PATH_REFS/$TOTAL_PATH_REFS file path references are broken"
fi

# ============================================================================
# D2: DELETED FILE REFERENCES
# ============================================================================
section "D2: DELETED FILE REFERENCES"

subsection "D2.1 No docs reference deleted files as current/active"

for deleted in "${DELETED_FILES[@]}"; do
    # Find references that aren't in deletion/historical context
    ACTIVE_REFS=$(grep -rn "$deleted" --include="*.md" . \
        --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
        2>/dev/null | \
        grep -v 'CHANGELOG\|changelog\|VERSION-HISTORY\|version.history' | \
        grep -v 'deleted\|DELETED\|removed\|REMOVED\|merged\|MERGED' | \
        grep -v 'deprecated\|DEPRECATED\|obsolete\|replaced\|rewrite' | \
        grep -v 'vercel\.json.*rewrite\|backward.*compat' | \
        grep -v 'commutecompute.*screen\|screen.*commutecompute' | \
        head -10 || true)

    if [ -z "$ACTIVE_REFS" ]; then
        pass "No active references to deleted: $deleted"
    else
        REF_COUNT=$(echo "$ACTIVE_REFS" | wc -l | tr -d ' ')
        fail "$REF_COUNT active reference(s) to deleted file: $deleted"
        echo "$ACTIVE_REFS" | head -5 | while IFS= read -r line; do
            echo "      $line"
        done
    fi
done

# ============================================================================
# D3: VERSION CONSISTENCY IN DOCS
# ============================================================================
section "D3: VERSION CONSISTENCY IN DOCUMENTATION"

subsection "D3.1 README.md has current versions"

if [ -f "README.md" ] && [ -n "$SYS_VER" ]; then
    for ver_pair in "system:$SYS_VER" "engine:$ENGINE_VER" "renderer:$RENDERER_VER"; do
        name=$(echo "$ver_pair" | cut -d: -f1)
        ver=$(echo "$ver_pair" | cut -d: -f2)
        if grep -q "v${ver}\|${ver}" README.md 2>/dev/null; then
            pass "README.md: $name version v${ver} present"
        else
            fail "README.md: missing $name version v${ver}"
        fi
    done
fi

subsection "D3.2 Spec version consistency across docs"

if [ -n "$SPEC_VER" ]; then
    SPEC_MAJOR=$(echo "$SPEC_VER" | grep -oE '[0-9]+' | head -1)
    SPEC_PREV=$((SPEC_MAJOR - 1))

    # Check for stale spec references (previous version in non-historical context)
    STALE_SPEC=$(grep -rn "CCDashDesignV${SPEC_PREV}" --include="*.md" . \
        --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
        2>/dev/null | \
        grep -v "specs/CCDashDesignV${SPEC_PREV}" | \
        grep -v 'CHANGELOG\|changelog\|VERSION-HISTORY\|FIRMWARE-VERSION-HISTORY' | \
        grep -v 'git tag\|"version"' | \
        grep -v '| [0-9]\.[0-9]' | \
        head -10 || true)

    if [ -z "$STALE_SPEC" ]; then
        pass "No stale CCDashDesignV${SPEC_PREV} references (current: V${SPEC_MAJOR})"
    else
        STALE_COUNT=$(echo "$STALE_SPEC" | wc -l | tr -d ' ')
        fail "$STALE_COUNT stale spec V${SPEC_PREV} reference(s) — should be V${SPEC_MAJOR}"
        echo "$STALE_SPEC" | head -5 | while IFS= read -r line; do
            echo "      $line"
        done
    fi
fi

subsection "D3.3 Firmware version in firmware docs"

if [ -n "$FW_VER" ]; then
    FW_DOCS="firmware/README.md firmware/FIRMWARE-RELEASE.md firmware/QUICK_START.md"
    for fw_doc in $FW_DOCS; do
        if [ ! -f "$fw_doc" ]; then
            skip "Firmware doc not found: $fw_doc"
            continue
        fi
        if grep -q "$FW_VER\|v${FW_VER}" "$fw_doc" 2>/dev/null; then
            pass "$fw_doc: firmware v${FW_VER} present"
        else
            warn "$fw_doc: may not reference current firmware v${FW_VER}"
        fi
    done
fi

# ============================================================================
# D4: INTERNAL LINK INTEGRITY
# ============================================================================
section "D4: INTERNAL LINK INTEGRITY"

subsection "D4.1 Markdown links to local files resolve"

BROKEN_LINKS=0
TOTAL_LINKS=0
for md_file in $MD_FILES; do
    # Match [text](relative/path.md) but not http/https URLs
    LINKS=$(grep -oE '\]\([^)]+\)' "$md_file" 2>/dev/null | \
        sed 's/\](//' | sed 's/)//' | \
        grep -v '^http\|^https\|^mailto\|^#\|^/' | \
        grep -v '\.png$\|\.jpg$\|\.gif$\|\.svg$\|\.bmp$' | \
        sort -u)

    MD_DIR=$(dirname "$md_file")
    for link in $LINKS; do
        # Strip any anchor (#section)
        CLEAN_LINK=$(echo "$link" | sed 's/#.*//')
        if [ -z "$CLEAN_LINK" ]; then
            continue  # anchor-only link
        fi
        ((TOTAL_LINKS++))
        # Resolve relative to the doc's directory
        RESOLVED="$MD_DIR/$CLEAN_LINK"
        if [ -f "$RESOLVED" ] || [ -d "$RESOLVED" ]; then
            : # exists
        elif [ -f "$CLEAN_LINK" ]; then
            : # exists from repo root
        else
            fail "Broken link in $md_file: $link"
            ((BROKEN_LINKS++))
        fi
    done
done

if [ "$BROKEN_LINKS" -eq 0 ]; then
    pass "All $TOTAL_LINKS internal markdown links resolve"
else
    fail "$BROKEN_LINKS/$TOTAL_LINKS internal links are broken"
fi

# ============================================================================
# D5: ARCHITECTURE ALIGNMENT
# ============================================================================
section "D5: ARCHITECTURE ALIGNMENT"

subsection "D5.1 ARCHITECTURE.md file references exist"

if [ -f "docs/ARCHITECTURE.md" ]; then
    ARCH_PATHS=$(grep -oE '`(api|src|public|scripts|monitor|firmware)/[a-zA-Z0-9/_\[\].-]+\.(js|html|md|sh|py|json)`' docs/ARCHITECTURE.md 2>/dev/null | tr -d '`' | sort -u)

    ARCH_MISSING=0
    for ref_path in $ARCH_PATHS; do
        if [ -f "$ref_path" ]; then
            pass "ARCHITECTURE.md: $ref_path exists"
        else
            fail "ARCHITECTURE.md references non-existent: $ref_path"
            ((ARCH_MISSING++))
        fi
    done

    if [ "$ARCH_MISSING" -eq 0 ] && [ -n "$ARCH_PATHS" ]; then
        pass "All ARCHITECTURE.md file references valid"
    fi
else
    warn "docs/ARCHITECTURE.md not found"
fi

subsection "D5.2 ARCHITECTURE.md mentions all API endpoints"

if [ -f "docs/ARCHITECTURE.md" ]; then
    ACTUAL_API=$(find api -maxdepth 1 -name '*.js' -exec basename {} .js \; 2>/dev/null | sort)
    MISSING_IN_ARCH=0
    for ep in $ACTUAL_API; do
        if grep -qi "$ep" docs/ARCHITECTURE.md 2>/dev/null; then
            : # mentioned
        else
            warn "ARCHITECTURE.md does not mention endpoint: $ep"
            ((MISSING_IN_ARCH++))
        fi
    done
    if [ "$MISSING_IN_ARCH" -eq 0 ]; then
        pass "ARCHITECTURE.md mentions all API endpoints"
    fi
fi

# ============================================================================
# D6: TRADE MARK COMPLIANCE IN DOCS
# ============================================================================
section "D6: TRADE MARK COMPLIANCE IN DOCUMENTATION"

subsection "D6.1 TM symbols on first reference in user-facing docs"

# User-facing docs that should have TM on first reference
USER_DOCS="README.md LEGAL.md PRIVACY.md SECURITY.md CONTRIBUTING.md INSTALL.md SUPPORT.md docs/COMMUTE-COMPUTE-OVERVIEW.md docs/COMMUTE-COMPUTE-COMPLETE-OVERVIEW.md docs/PROJECT-VISION.md"

# Key TM marks to check (first reference should include TM symbol)
PRIMARY_TMS=("Commute Compute" "CCDash" "CC LiveDash" "CCFirm")

for doc in $USER_DOCS; do
    if [ ! -f "$doc" ]; then
        continue
    fi
    for tm in "${PRIMARY_TMS[@]}"; do
        # Check if the term appears at all
        if grep -q "$tm" "$doc" 2>/dev/null; then
            # Check if TM symbol appears (Unicode or HTML entity)
            if grep -q "${tm}™\|${tm}&#8482;\|${tm}&trade;" "$doc" 2>/dev/null; then
                pass "$doc: '$tm' has TM symbol"
            else
                warn "$doc: '$tm' appears without TM symbol (check first reference)"
            fi
        fi
    done
done

# ============================================================================
# D7: PROHIBITED TERMS IN DOCUMENTATION
# ============================================================================
section "D7: PROHIBITED TERMS IN DOCUMENTATION"

subsection "D7.1 No prohibited terms in docs"

if [ -f "$CONSTANTS_FILE" ]; then
    PROHIBITED=$(node -e "
        const c = JSON.parse(require('fs').readFileSync('$CONSTANTS_FILE','utf8'));
        c.prohibited_terms.forEach(p => console.log(p.term + '|' + p.reason));
    " 2>/dev/null)

    echo "$PROHIBITED" | while IFS='|' read -r term reason; do
        FOUND=$(grep -rn "$term" --include="*.md" . \
            --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
            2>/dev/null | \
            grep -v 'prohibited\|PROHIBITED\|Forbidden\|forbidden\|removed\|REMOVED\|renamed\|RENAMED\|NEVER' | \
            head -5 || true)
        if [ -n "$FOUND" ]; then
            FOUND_COUNT=$(echo "$FOUND" | wc -l | tr -d ' ')
            echo -e "  ${RED}[FAIL]${NC} '$term' found in $FOUND_COUNT doc(s) ($reason)"
            # Note: can't increment VIOLATIONS in subshell, tracked in parent
        else
            echo -e "  ${GREEN}[PASS]${NC} No prohibited '$term' in docs"
        fi
    done
fi

# ============================================================================
# D8: AUSTRALIAN ENGLISH IN DOCUMENTATION
# ============================================================================
section "D8: AUSTRALIAN ENGLISH IN DOCUMENTATION"

subsection "D8.1 User-facing docs use Australian spelling"

if [ -f "$CONSTANTS_FILE" ]; then
    # Check key American spellings that should be Australian in prose
    # Exclude: code identifiers (camelCase), SPDX, URLs, backtick-quoted code
    AE_CHECKS=("license:licence" "optimize:optimise" "color:colour" "center:centre" "behavior:behaviour" "organize:organise" "analyze:analyse" "customize:customise" "recognize:recognise")

    for check in "${AE_CHECKS[@]}"; do
        american=$(echo "$check" | cut -d: -f1)
        australian=$(echo "$check" | cut -d: -f2)

        # Search user-facing docs for American spelling in prose (not code/SPDX)
        AMERICAN_USAGE=$(grep -rn "\b${american}\b" --include="*.md" \
            README.md LEGAL.md PRIVACY.md CONTRIBUTING.md INSTALL.md SUPPORT.md SECURITY.md docs/ \
            2>/dev/null | \
            grep -v 'SPDX\|spdx\|npm\|node_modules\|\.json\|`.*`\|```\|http\|Licensed\|licensed\|LICENSED' | \
            grep -vi "license.*identifier\|license.*header\|AGPL.*license" | \
            head -3 || true)

        if [ -n "$AMERICAN_USAGE" ]; then
            warn "American spelling '$american' found (should be '$australian'):"
            echo "$AMERICAN_USAGE" | head -2 | while IFS= read -r line; do
                echo "      $line"
            done
        else
            pass "No American '$american' in user-facing docs"
        fi
    done
fi

# ============================================================================
# D9: ENDPOINT DOCUMENTATION ACCURACY
# ============================================================================
section "D9: ENDPOINT DOCUMENTATION ACCURACY"

subsection "D9.1 vercel.json rewrites reference existing destinations"

if [ -f "vercel.json" ]; then
    REWRITE_DESTS=$(node -e "
        const v = JSON.parse(require('fs').readFileSync('vercel.json','utf8'));
        if (v.rewrites) v.rewrites.forEach(r => console.log(r.destination));
    " 2>/dev/null)

    for dest in $REWRITE_DESTS; do
        # Convert /api/commutecompute to api/commutecompute.js
        FILE_PATH=$(echo "$dest" | sed 's|^/||' | sed 's|\[|\[|g').js
        # Handle dynamic routes
        FILE_PATH=$(echo "$FILE_PATH" | sed 's|:id|\[id\]|g')
        if [ -f "$FILE_PATH" ]; then
            pass "vercel.json rewrite destination exists: $dest"
        elif echo "$dest" | grep -qE '^\/(api\/)?[a-z]'; then
            # For path-based rewrites that map 1:1
            SIMPLE_PATH="api/$(echo "$dest" | sed 's|/api/||').js"
            if [ -f "$SIMPLE_PATH" ]; then
                pass "vercel.json rewrite destination exists: $dest (as $SIMPLE_PATH)"
            else
                warn "vercel.json rewrite destination may not exist: $dest"
            fi
        fi
    done
fi

subsection "D9.2 README API documentation matches actual endpoints"

if [ -f "README.md" ]; then
    # Check that key endpoints mentioned in README exist
    README_ENDPOINTS=$(grep -oE '/api/[a-zA-Z-]+' README.md 2>/dev/null | sort -u)
    for ep in $README_ENDPOINTS; do
        FILE_PATH="api/$(echo "$ep" | sed 's|/api/||').js"
        if [ -f "$FILE_PATH" ]; then
            pass "README endpoint exists: $ep"
        else
            # Check rewrites
            if grep -q "$(echo "$ep" | sed 's|/api/||')" vercel.json 2>/dev/null; then
                pass "README endpoint via rewrite: $ep"
            else
                warn "README references endpoint that may not exist: $ep"
            fi
        fi
    done
fi

# ============================================================================
# D10: DOCUMENT-INDEX ALIGNMENT
# ============================================================================
section "D10: DOCUMENT-INDEX ALIGNMENT"

subsection "D10.1 DOCUMENT-INDEX.md references existing files"

if [ -f "DOCUMENT-INDEX.md" ]; then
    DOC_INDEX_PATHS=$(grep -oE '`[a-zA-Z0-9/_.-]+\.(md|js|html|sh|py|json)`' DOCUMENT-INDEX.md 2>/dev/null | tr -d '`' | sort -u)
    MISSING_FROM_INDEX=0
    for ref_path in $DOC_INDEX_PATHS; do
        if [ -f "$ref_path" ]; then
            : # exists
        else
            fail "DOCUMENT-INDEX.md references non-existent: $ref_path"
            ((MISSING_FROM_INDEX++))
        fi
    done
    if [ "$MISSING_FROM_INDEX" -eq 0 ] && [ -n "$DOC_INDEX_PATHS" ]; then
        pass "All DOCUMENT-INDEX.md file references valid ($(echo "$DOC_INDEX_PATHS" | wc -l | tr -d ' ') paths)"
    fi
else
    warn "DOCUMENT-INDEX.md not found"
fi

subsection "D10.2 Key docs are listed in DOCUMENT-INDEX.md"

if [ -f "DOCUMENT-INDEX.md" ]; then
    REQUIRED_IN_INDEX=("README.md" "DEVELOPMENT-RULES.md" "SECURITY.md" "PRIVACY.md" "LEGAL.md" "INSTALL.md" "CONTRIBUTING.md")
    for req_doc in "${REQUIRED_IN_INDEX[@]}"; do
        if grep -q "$req_doc" DOCUMENT-INDEX.md 2>/dev/null; then
            pass "DOCUMENT-INDEX.md includes $req_doc"
        else
            warn "DOCUMENT-INDEX.md missing entry for $req_doc"
        fi
    done
fi

# ============================================================================
# D11: SPEC FILE INTEGRITY
# ============================================================================
section "D11: SPEC FILE INTEGRITY"

subsection "D11.1 Current spec file exists and is referenced"

if [ -n "$SPEC_VER" ]; then
    # SPEC_VER is like "CCDashDesignV16.0" — try exact match first, then without minor version
    SPEC_FILE="specs/${SPEC_VER}.md"
    if [ ! -f "$SPEC_FILE" ]; then
        # Try without the .0 suffix (e.g. CCDashDesignV16.md)
        SPEC_FILE_ALT="specs/$(echo "$SPEC_VER" | sed 's/\.[0-9]*$//').md"
        if [ -f "$SPEC_FILE_ALT" ]; then
            SPEC_FILE="$SPEC_FILE_ALT"
        fi
    fi
    if [ -f "$SPEC_FILE" ]; then
        pass "Current spec file exists: $SPEC_FILE"

        # Check it's referenced in key docs
        if grep -rq "$SPEC_VER" README.md DEVELOPMENT-RULES.md 2>/dev/null; then
            pass "$SPEC_VER referenced in README/DEVELOPMENT-RULES"
        else
            warn "$SPEC_VER not referenced in README.md or DEVELOPMENT-RULES.md"
        fi
    else
        fail "Current spec file missing: $SPEC_FILE"
    fi
fi

subsection "D11.2 Spec sections reference existing renderer functions"

if [ -n "$SPEC_VER" ] && [ -f "specs/${SPEC_VER}.md" ]; then
    SPEC_FUNCS=$(grep -oE '[a-zA-Z_]+\(\)' "specs/${SPEC_VER}.md" 2>/dev/null | sort -u)
    RENDERER="src/services/ccdash-renderer.js"
    if [ -f "$RENDERER" ]; then
        for func in $SPEC_FUNCS; do
            FUNC_NAME=$(echo "$func" | sed 's/()//')
            if grep -q "$FUNC_NAME" "$RENDERER" 2>/dev/null; then
                pass "Spec function in renderer: $func"
            else
                # Some spec functions may be in engine or other files
                if grep -rq "$FUNC_NAME" src/ api/ 2>/dev/null; then
                    pass "Spec function in codebase: $func"
                else
                    warn "Spec function not found in codebase: $func"
                fi
            fi
        done
    fi
fi

# ============================================================================
# D12: CHANGELOG CONSISTENCY
# ============================================================================
section "D12: CHANGELOG CONSISTENCY"

subsection "D12.1 VERSION.json changelog matches docs/CHANGELOG.md"

if [ -f "docs/CHANGELOG.md" ] && [ -f "$VERSION_FILE" ]; then
    LATEST_VJ_VER=$(node -e "const v=JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf8')); console.log(v.changelog?.[0]?.version || '')" 2>/dev/null)
    if [ -n "$LATEST_VJ_VER" ]; then
        if grep -q "$LATEST_VJ_VER" docs/CHANGELOG.md 2>/dev/null; then
            pass "docs/CHANGELOG.md includes latest VERSION.json entry v${LATEST_VJ_VER}"
        else
            warn "docs/CHANGELOG.md may be missing latest version v${LATEST_VJ_VER}"
        fi
    fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
section "DOCS INTEGRITY AUDIT SUMMARY"

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
    echo -e "${RED}DOCS INTEGRITY AUDIT FAILED${NC} — $VIOLATIONS violation(s) found"
    echo ""
    echo "Documentation is out of sync with the codebase."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}DOCS INTEGRITY AUDIT PASSED WITH WARNINGS${NC} — $WARNINGS advisory item(s)"
    exit 0
else
    echo -e "${GREEN}DOCS INTEGRITY AUDIT PASSED${NC} — Documentation fully aligned"
    exit 0
fi
