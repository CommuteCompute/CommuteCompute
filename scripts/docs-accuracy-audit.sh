#!/bin/bash
#
# DOCS ACCURACY AUDIT v1.0
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Validates documentation accuracy across ALL .md and .mjs files:
# - Stale file path references (deleted files still mentioned)
# - Stale spec version references (old CCDashDesign versions)
# - Stale endpoint references (deleted API endpoints)
# - Component version consistency against VERSION.json
#
# Run from repository root: ./scripts/docs-accuracy-audit.sh
# Exit codes: 0=clean, 1=failures found

set -euo pipefail

VIOLATIONS=0
WARNINGS=0
PASSES=0

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { ((PASSES++)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { ((VIOLATIONS++)); echo -e "  ${RED}[FAIL]${NC} $1"; }
warn() { ((WARNINGS++)); echo -e "  ${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# ============================================================================
# SOURCE OF TRUTH
# ============================================================================

# Extract current spec version from VERSION.json
SPEC_VERSION=$(node -e "const v=JSON.parse(require('fs').readFileSync('VERSION.json','utf8')); console.log(v.specs?.dashboard?.version || 'CCDashDesignV16.0')" 2>/dev/null || echo "CCDashDesignV16.0")
SPEC_MAJOR=$(echo "$SPEC_VERSION" | sed 's/.*V\([0-9]*\).*/\1/' || echo "16")
SPEC_PREV=$((SPEC_MAJOR - 1))

info "Docs Accuracy Audit v1.0"
info "Current spec: $SPEC_VERSION (previous: V${SPEC_PREV})"
echo ""

# ============================================================================
# FILE DISCOVERY — find all auditable .md and .mjs files
# ============================================================================

# Exclude: node_modules, .pio (PlatformIO libraries), .git, firmware library READMEs
FIND_EXCLUDES="-not -path '*/node_modules/*' -not -path '*/.pio/*' -not -path '*/.git/*'"

MD_FILES=$(eval "find . -name '*.md' $FIND_EXCLUDES" | sort)
MJS_FILES=$(eval "find . -name '*.mjs' $FIND_EXCLUDES" | sort)

MD_COUNT=$(echo "$MD_FILES" | wc -l | tr -d ' ')
MJS_COUNT=$(echo "$MJS_FILES" | wc -l | tr -d ' ')

info "Discovered: $MD_COUNT .md files, $MJS_COUNT .mjs files"
echo ""

# ============================================================================
# CHECK 1: DELETED FILE REFERENCES
# ============================================================================

echo -e "${CYAN}--- CHECK 1: Deleted File References ---${NC}"

# Known deleted files (add to this list when files are deleted)
DELETED_FILES=(
    "api/screen.js"
)

for deleted in "${DELETED_FILES[@]}"; do
    # Search across all .md and .mjs files
    # Exclude: vercel.json rewrite documentation (explains the redirect),
    #          historical changelog/version-history entries
    REFS=$(grep -rn "$deleted" --include="*.md" --include="*.mjs" . \
        --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
        2>/dev/null | \
        grep -v "commutecompute" | \
        grep -v "CHANGELOG\|changelog\|VERSION-HISTORY\|version.history" | \
        grep -v "vercel\.json.*rewrite" || true)

    if [ -z "$REFS" ]; then
        pass "No stale references to deleted file: $deleted"
    else
        REF_COUNT=$(echo "$REFS" | wc -l | tr -d ' ')
        fail "$REF_COUNT stale reference(s) to deleted file: $deleted"
        echo "$REFS" | head -10 | while IFS= read -r line; do
            echo "    $line"
        done
    fi
done

echo ""

# ============================================================================
# CHECK 2: STALE SPEC VERSION REFERENCES
# ============================================================================

echo -e "${CYAN}--- CHECK 2: Spec Version Consistency (CCDashDesignV${SPEC_MAJOR}) ---${NC}"

# Search for old spec version references
# Exclude: the V15 spec file itself, historical changelog entries,
#          firmware version history, DEVELOPMENT-RULES.md changelog rows
STALE_SPEC=$(grep -rn "CCDashDesignV${SPEC_PREV}" --include="*.md" --include="*.mjs" . \
    --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
    2>/dev/null | \
    grep -v "specs/CCDashDesignV${SPEC_PREV}\.md:" | \
    grep -v "FIRMWARE-VERSION-HISTORY" | \
    grep -v "CHANGELOG" | \
    grep -v "| 1\.[0-9]" | \
    grep -v "git tag" || true)

if [ -z "$STALE_SPEC" ]; then
    pass "No stale CCDashDesignV${SPEC_PREV} references (current: V${SPEC_MAJOR})"
else
    STALE_COUNT=$(echo "$STALE_SPEC" | wc -l | tr -d ' ')
    fail "$STALE_COUNT stale CCDashDesignV${SPEC_PREV} reference(s) — should be V${SPEC_MAJOR}"
    echo "$STALE_SPEC" | head -15 | while IFS= read -r line; do
        echo "    $line"
    done
    if [ "$STALE_COUNT" -gt 15 ]; then
        echo "    ... and $((STALE_COUNT - 15)) more"
    fi
fi

echo ""

# ============================================================================
# CHECK 3: API ENDPOINT DOCUMENTATION ACCURACY
# ============================================================================

echo -e "${CYAN}--- CHECK 3: API Endpoint Documentation ---${NC}"

# Extract actual API endpoint files
ACTUAL_ENDPOINTS=$(find api -name "*.js" -maxdepth 2 2>/dev/null | sort)

# Check for references to endpoints that don't exist (beyond known rewrites)
# Known rewrites in vercel.json:
#   /api/screen → /api/commutecompute (backward compat)
REWRITTEN_ENDPOINTS="api/screen"

# Check docs reference only existing endpoints
for ep_ref in "api/screen.js" "api/fullscreen.js"; do
    DOC_REFS=$(grep -rn "$ep_ref" --include="*.md" . \
        --exclude-dir=node_modules --exclude-dir=.pio --exclude-dir=.git \
        2>/dev/null | \
        grep -v "CHANGELOG\|changelog\|VERSION-HISTORY" | \
        grep -v "commutecompute" || true)

    if [ -z "$DOC_REFS" ]; then
        pass "No docs reference non-existent endpoint: $ep_ref"
    else
        REF_COUNT=$(echo "$DOC_REFS" | wc -l | tr -d ' ')
        warn "$REF_COUNT doc reference(s) to deprecated endpoint: $ep_ref (rewritten via vercel.json)"
        echo "$DOC_REFS" | head -5 | while IFS= read -r line; do
            echo "    $line"
        done
    fi
done

echo ""

# ============================================================================
# CHECK 4: COMPONENT VERSION REFERENCES IN DOCS
# ============================================================================

echo -e "${CYAN}--- CHECK 4: Component Version References ---${NC}"

# Extract versions from VERSION.json
SYS_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('VERSION.json','utf8')).system?.version || '5.0.0')" 2>/dev/null || echo "5.0.0")
ENGINE_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('VERSION.json','utf8')).components?.commutecompute?.version || '4.0')" 2>/dev/null || echo "4.0")
RENDERER_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('VERSION.json','utf8')).components?.renderer?.version || '3.0')" 2>/dev/null || echo "3.0")
FW_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('VERSION.json','utf8')).components?.firmware?.version || '8.1.0')" 2>/dev/null || echo "8.1.0")

info "VERSION.json: System v${SYS_VER}, Engine v${ENGINE_VER}, Renderer v${RENDERER_VER}, Firmware ${FW_VER}"

# Check README.md has current versions
if grep -q "v${SYS_VER}" README.md 2>/dev/null; then
    pass "README.md references current system version v${SYS_VER}"
else
    fail "README.md missing current system version v${SYS_VER}"
fi

if grep -q "v${ENGINE_VER}" README.md 2>/dev/null; then
    pass "README.md references current engine version v${ENGINE_VER}"
else
    fail "README.md missing current engine version v${ENGINE_VER}"
fi

echo ""

# ============================================================================
# CHECK 5: FILE PATH REFERENCES IN KEY DOCS
# ============================================================================

echo -e "${CYAN}--- CHECK 5: File Path Validation (Key Docs) ---${NC}"

# Check ARCHITECTURE.md file table references
if [ -f "docs/ARCHITECTURE.md" ]; then
    # Extract file path references from architecture doc
    ARCH_PATHS=$(grep -oE '`(api/[a-zA-Z/._-]+\.js|src/[a-zA-Z/._-]+\.js|specs/[a-zA-Z/._-]+\.md)`' docs/ARCHITECTURE.md 2>/dev/null | tr -d '`' | sort -u || true)

    for ref_path in $ARCH_PATHS; do
        if [ -f "$ref_path" ]; then
            pass "ARCHITECTURE.md: $ref_path exists"
        else
            fail "ARCHITECTURE.md references non-existent file: $ref_path"
        fi
    done
else
    warn "docs/ARCHITECTURE.md not found"
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}DOCS ACCURACY AUDIT SUMMARY${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Passed:${NC}     $PASSES"
echo -e "${RED}Violations:${NC} $VIOLATIONS"
echo -e "${YELLOW}Warnings:${NC}   $WARNINGS"
echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
    echo -e "${RED}DOCS ACCURACY AUDIT FAILED${NC} — $VIOLATIONS violation(s) found"
    exit 1
else
    if [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}DOCS ACCURACY AUDIT PASSED WITH WARNINGS${NC} — Review $WARNINGS item(s)"
    else
        echo -e "${GREEN}DOCS ACCURACY AUDIT PASSED${NC}"
    fi
    exit 0
fi
