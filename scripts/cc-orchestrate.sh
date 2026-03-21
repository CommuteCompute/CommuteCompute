#!/bin/bash
#
# CC ORCHESTRATE v1.0 — Unified Pipeline Runner
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Single entry point that runs all audit scripts in the correct order,
# aggregates exit codes, and produces a structured JSON summary.
#
# Usage:
#   ./scripts/cc-orchestrate.sh              # Default: --quick
#   ./scripts/cc-orchestrate.sh --quick      # Phase 2 gate (compliance + validate)
#   ./scripts/cc-orchestrate.sh --full       # All audits including meta + docs
#   ./scripts/cc-orchestrate.sh --meta-only  # Pipeline self-assessment only
#   ./scripts/cc-orchestrate.sh --docs-only  # Documentation integrity only
#
# Exit codes: 0=all passed, 1=blocking failures detected
#
# JSON report: audit-logs/cc-pipeline-report-YYYYMMDD-HHMMSS.json
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
BOLD='\033[1m'
NC='\033[0m'

# Parse arguments
MODE="${1:---quick}"

# Timing
START_TIME=$(date +%s)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATESTAMP=$(date '+%Y%m%d-%H%M%S')

# Report output
REPORT_DIR="$REPO_ROOT/audit-logs"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/cc-pipeline-report-${DATESTAMP}.json"

# Script paths
COMPLIANCE_AUDIT="$REPO_ROOT/scripts/comprehensive-compliance-audit.sh"
DEV_VALIDATE="$REPO_ROOT/scripts/cc-dev-validate.sh"
SEMANTIC_AUDIT="$REPO_ROOT/scripts/semantic-version-audit.js"
PYTHON_SCANNER="$REPO_ROOT/scripts/cc-compliance-scanner.py"
META_AUDIT="$REPO_ROOT/scripts/cc-meta-audit.sh"
DOCS_INTEGRITY="$REPO_ROOT/scripts/cc-docs-integrity.sh"

# Results tracking — compatible with bash 3.2 (macOS)
# Stored as "name|status|duration" entries in a flat array
SCRIPT_RESULTS=()
OVERALL_EXIT=0

echo ""
echo -e "${BOLD}=================================================================="
echo "  CC ORCHESTRATE v1.0 — Unified Pipeline Runner"
echo "  $TIMESTAMP"
echo "  Mode: $MODE"
echo -e "==================================================================${NC}"
echo ""

# Helper: record a result
record_result() {
    local name="$1"
    local status="$2"
    local duration="$3"
    SCRIPT_RESULTS+=("${name}|${status}|${duration}")
}

# Helper: run a script and capture result
run_audit() {
    local NAME="$1"
    local SCRIPT="$2"
    local BLOCKING="$3"  # "blocking" or "advisory"
    local RUNNER="${4:-bash}"  # "bash", "node", "python3"

    if [ ! -f "$SCRIPT" ]; then
        echo -e "  ${YELLOW}[SKIP]${NC} $NAME — script not found: $SCRIPT"
        record_result "$NAME" "skipped" "0"
        return 0
    fi

    echo -e "${CYAN}Running:${NC} $NAME ($BLOCKING)"
    local SCRIPT_START=$(date +%s)

    case "$RUNNER" in
        node)
            node "$SCRIPT" 2>&1
            ;;
        python3)
            if command -v python3 > /dev/null 2>&1; then
                python3 "$SCRIPT" --repo-root "$REPO_ROOT" 2>&1
            else
                echo -e "  ${YELLOW}[SKIP]${NC} Python3 not available"
                record_result "$NAME" "skipped" "0"
                return 0
            fi
            ;;
        *)
            bash "$SCRIPT" 2>&1
            ;;
    esac
    local EXIT_CODE=$?
    local SCRIPT_END=$(date +%s)
    local DURATION=$((SCRIPT_END - SCRIPT_START))

    if [ $EXIT_CODE -eq 0 ]; then
        record_result "$NAME" "passed" "$DURATION"
        echo ""
        echo -e "  ${GREEN}PASSED${NC} $NAME (${DURATION}s)"
    elif [ $EXIT_CODE -eq 2 ] && [ "$RUNNER" = "node" ]; then
        record_result "$NAME" "staleness" "$DURATION"
        echo ""
        echo -e "  ${YELLOW}STALENESS${NC} $NAME — review semantic-version-report.json (${DURATION}s)"
    else
        if [ "$BLOCKING" = "blocking" ]; then
            record_result "$NAME" "failed" "$DURATION"
            OVERALL_EXIT=1
            echo ""
            echo -e "  ${RED}FAILED${NC} $NAME (${DURATION}s) — BLOCKING"
        else
            record_result "$NAME" "advisory-fail" "$DURATION"
            echo ""
            echo -e "  ${YELLOW}ADVISORY FAIL${NC} $NAME (${DURATION}s)"
        fi
    fi

    echo ""
    echo -e "${BLUE}──────────────────────────────────────────────────────────────${NC}"
    return $EXIT_CODE
}

# ============================================================================
# MODE: --quick (Phase 2 gate)
# ============================================================================
if [ "$MODE" = "--quick" ]; then
    echo -e "${BOLD}Phase 2 Gate: Compliance + Validation${NC}"
    echo ""

    run_audit "comprehensive-compliance-audit" "$COMPLIANCE_AUDIT" "blocking" "bash"
    run_audit "cc-dev-validate" "$DEV_VALIDATE" "blocking" "bash"
fi

# ============================================================================
# MODE: --full (All audits)
# ============================================================================
if [ "$MODE" = "--full" ]; then
    echo -e "${BOLD}Full Pipeline Audit: All Scripts${NC}"
    echo ""

    # Tier 1: Blocking gates
    run_audit "comprehensive-compliance-audit" "$COMPLIANCE_AUDIT" "blocking" "bash"
    run_audit "cc-dev-validate" "$DEV_VALIDATE" "blocking" "bash"

    # Tier 2: Version & semantic
    run_audit "semantic-version-audit" "$SEMANTIC_AUDIT" "advisory" "node"

    # Tier 3: Python scanner
    run_audit "cc-compliance-scanner" "$PYTHON_SCANNER" "advisory" "python3"

    # Tier 4: Pipeline self-check
    run_audit "cc-meta-audit" "$META_AUDIT" "advisory" "bash"

    # Tier 5: Documentation integrity
    run_audit "cc-docs-integrity" "$DOCS_INTEGRITY" "advisory" "bash"
fi

# ============================================================================
# MODE: --meta-only
# ============================================================================
if [ "$MODE" = "--meta-only" ]; then
    echo -e "${BOLD}Pipeline Self-Assessment Only${NC}"
    echo ""
    run_audit "cc-meta-audit" "$META_AUDIT" "blocking" "bash"
fi

# ============================================================================
# MODE: --docs-only
# ============================================================================
if [ "$MODE" = "--docs-only" ]; then
    echo -e "${BOLD}Documentation Integrity Only${NC}"
    echo ""
    run_audit "cc-docs-integrity" "$DOCS_INTEGRITY" "blocking" "bash"
fi

# ============================================================================
# TIMING
# ============================================================================
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

# ============================================================================
# JSON REPORT
# ============================================================================

# Repo state
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('VERSION.json','utf8')).system?.version || 'unknown')" 2>/dev/null || echo "unknown")

# Build JSON from flat array (bash 3.2 compatible)
{
    echo "{"
    echo "  \"timestamp\": \"$TIMESTAMP\","
    echo "  \"mode\": \"$MODE\","
    echo "  \"overall\": \"$([ $OVERALL_EXIT -eq 0 ] && echo 'passed' || echo 'failed')\","
    echo "  \"duration_seconds\": $TOTAL_DURATION,"
    echo "  \"scripts\": {"

    FIRST=true
    for entry in "${SCRIPT_RESULTS[@]}"; do
        IFS='|' read -r name status duration <<< "$entry"
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo ","
        fi
        printf "    \"%s\": {\"status\": \"%s\", \"duration_seconds\": %s}" "$name" "$status" "$duration"
    done

    echo ""
    echo "  },"
    echo "  \"repo_state\": {"
    echo "    \"branch\": \"$GIT_BRANCH\","
    echo "    \"commit\": \"$GIT_HASH\","
    echo "    \"dirty_files\": $GIT_DIRTY,"
    echo "    \"system_version\": \"$VERSION\""
    echo "  }"
    echo "}"
} > "$REPORT_FILE"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${BOLD}=================================================================="
echo "  CC ORCHESTRATE — PIPELINE SUMMARY"
echo -e "==================================================================${NC}"
echo ""
echo "  Mode:     $MODE"
echo "  Duration: ${TOTAL_DURATION}s"
echo "  Report:   $REPORT_FILE"
echo ""

# Print per-script results
echo -e "  ${BOLD}Script Results:${NC}"
for entry in "${SCRIPT_RESULTS[@]}"; do
    IFS='|' read -r name status duration <<< "$entry"
    case "$status" in
        passed)
            echo -e "    ${GREEN}PASS${NC}  $name (${duration}s)"
            ;;
        failed)
            echo -e "    ${RED}FAIL${NC}  $name (${duration}s) [BLOCKING]"
            ;;
        advisory-fail)
            echo -e "    ${YELLOW}WARN${NC}  $name (${duration}s) [ADVISORY]"
            ;;
        staleness)
            echo -e "    ${YELLOW}STALE${NC} $name (${duration}s) [REVIEW]"
            ;;
        skipped)
            echo -e "    ${CYAN}SKIP${NC}  $name"
            ;;
    esac
done

echo ""
if [ $OVERALL_EXIT -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}PIPELINE PASSED${NC}"
else
    echo -e "  ${RED}${BOLD}PIPELINE FAILED${NC} — Blocking failures detected"
    echo ""
    echo "  Fix all blocking failures before proceeding."
fi
echo ""

exit $OVERALL_EXIT
