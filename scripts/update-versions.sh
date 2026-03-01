#!/bin/bash
#
# VERSION AUTO-UPDATE SCRIPT
# Copyright (c) 2026 Angus Bergman
# Licensed under AGPL-3.0
#
# Reads VERSION.json and updates all version fallback values
# across HTML pages, firmware docs, and monitor scripts.
# Run from repository root: ./scripts/update-versions.sh
#
# Usage:
#   ./scripts/update-versions.sh              # Apply updates
#   ./scripts/update-versions.sh --dry-run    # Show what would change
#

set +e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
UPDATED_COUNT=0
UPDATED_FILES=""

for arg in "$@"; do
    case $arg in
        --dry-run) DRY_RUN=true ;;
    esac
done

# ============================================================================
# Read versions from VERSION.json
# ============================================================================

VERSION_FILE="$REPO_ROOT/VERSION.json"

if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}FATAL: VERSION.json not found at $VERSION_FILE${NC}"
    exit 1
fi

eval "$(node -e "
const v = require('$VERSION_FILE');
console.log('SYS_VER=\"' + v.system.version + '\"');
console.log('ENGINE_VER=\"' + v.components.commutecompute.version + '\"');
console.log('RENDERER_VER=\"' + v.components.renderer.version + '\"');
console.log('FIRMWARE_VER=\"' + v.firmware.version + '\"');
console.log('SPEC_VER=\"' + v.specs.dashboard.version + '\"');
")"

echo -e "${CYAN}=== Version Auto-Update ===${NC}"
echo -e "Source: VERSION.json"
echo -e "  System:   v${SYS_VER}"
echo -e "  Engine:   v${ENGINE_VER}"
echo -e "  Renderer: v${RENDERER_VER}"
echo -e "  Firmware: CC-FW-${FIRMWARE_VER}"
echo -e "  Spec:     ${SPEC_VER}"
echo ""

if $DRY_RUN; then
    echo -e "${YELLOW}DRY RUN — no files will be modified${NC}"
    echo ""
fi

# ============================================================================
# Helper: report and optionally apply a sed replacement on a single file
# Uses node for the actual replacement to avoid shell quoting issues with sed
# ============================================================================

update_file() {
    local file="$1"
    local search_pattern="$2"
    local replace_pattern="$3"
    local description="$4"

    # Check if pattern exists using node (avoids grep regex quoting issues)
    local has_match
    has_match=$(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$file', 'utf8');
        const re = new RegExp($(printf '%s' "$search_pattern" | node -e "
            let s = '';
            process.stdin.on('data', d => s += d);
            process.stdin.on('end', () => process.stdout.write(JSON.stringify(s)));
        "));
        process.stdout.write(re.test(content) ? '1' : '0');
    " 2>/dev/null)

    if [ "$has_match" != "1" ]; then
        return
    fi

    local bname
    bname=$(echo "$file" | sed "s|$REPO_ROOT/||")

    if $DRY_RUN; then
        echo -e "  ${YELLOW}WOULD UPDATE${NC} $bname — $description"
        UPDATED_COUNT=$((UPDATED_COUNT + 1))
    else
        node -e "
            const fs = require('fs');
            let content = fs.readFileSync('$file', 'utf8');
            const re = new RegExp($(printf '%s' "$search_pattern" | node -e "
                let s = '';
                process.stdin.on('data', d => s += d);
                process.stdin.on('end', () => process.stdout.write(JSON.stringify(s)));
            "), 'g');
            content = content.replace(re, $(printf '%s' "$replace_pattern" | node -e "
                let s = '';
                process.stdin.on('data', d => s += d);
                process.stdin.on('end', () => process.stdout.write(JSON.stringify(s)));
            "));
            fs.writeFileSync('$file', content);
        " 2>/dev/null
        echo -e "  ${GREEN}UPDATED${NC} $bname — $description"
        UPDATED_COUNT=$((UPDATED_COUNT + 1))
        if ! echo "$UPDATED_FILES" | grep -q "$bname"; then
            UPDATED_FILES="$UPDATED_FILES $bname"
        fi
    fi
}

# ============================================================================
# Batch update: uses node for reliable regex replacements across all targets
# ============================================================================

run_updates() {
    node -e "
const fs = require('fs');
const path = require('path');

const REPO = '$REPO_ROOT';
const DRY_RUN = $( $DRY_RUN && echo 'true' || echo 'false' );

const SYS_VER = '$SYS_VER';
const ENGINE_VER = '$ENGINE_VER';
const RENDERER_VER = '$RENDERER_VER';
const FIRMWARE_VER = '$FIRMWARE_VER';
const SPEC_VER = '$SPEC_VER';

let updatedCount = 0;
const updatedFiles = new Set();

function findHtmlFiles(dir) {
    const results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...findHtmlFiles(fullPath));
            } else if (entry.name.endsWith('.html')) {
                results.push(fullPath);
            }
        }
    } catch (e) { /* skip unreadable dirs */ }
    return results.sort();
}

function applyReplacement(file, regex, replacement, description) {
    let content;
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (e) { return; }

    if (!regex.test(content)) return;

    // Reset lastIndex for global regexes
    regex.lastIndex = 0;

    const relPath = path.relative(REPO, file);

    if (DRY_RUN) {
        console.log('  \\x1b[33mWOULD UPDATE\\x1b[0m ' + relPath + ' — ' + description);
        // Show matching lines
        const lines = content.split('\\n');
        let shown = 0;
        for (let i = 0; i < lines.length && shown < 3; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
                console.log('    \\x1b[33m>\\x1b[0m ' + (i + 1) + ':' + lines[i].trim());
                shown++;
            }
            regex.lastIndex = 0;
        }
    } else {
        regex.lastIndex = 0;
        const newContent = content.replace(regex, replacement);
        fs.writeFileSync(file, newContent);
        console.log('  \\x1b[32mUPDATED\\x1b[0m ' + relPath + ' — ' + description);
        updatedFiles.add(relPath);
    }
    updatedCount++;
}

const htmlFiles = findHtmlFiles(path.join(REPO, 'public'));

// ============================================================================
// S1: JS Fallback — Engine Version
// ============================================================================
console.log('\\x1b[36m--- S1: HTML JS Fallback — Engine Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /commutecompute\?\.version \|\| 'v\d+\.\d+'/g,
        \"commutecompute?.version || 'v\" + ENGINE_VER + \"'\",
        'engine JS fallback');
}

// ============================================================================
// S2: JS Fallback — Renderer Version
// ============================================================================
console.log('\\n\\x1b[36m--- S2: HTML JS Fallback — Renderer Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /renderer\?\.version \|\| 'v\d+\.\d+'/g,
        \"renderer?.version || 'v\" + RENDERER_VER + \"'\",
        'renderer JS fallback');
}

// ============================================================================
// S3: JS Fallback — System Version
// ============================================================================
console.log('\\n\\x1b[36m--- S3: HTML JS Fallback — System Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /system\?\.version \|\| '\d+\.\d+\.\d+'/g,
        \"system?.version || '\" + SYS_VER + \"'\",
        'system JS fallback');
}

// ============================================================================
// S4: JS Fallback — Firmware Version
// ============================================================================
console.log('\\n\\x1b[36m--- S4: HTML JS Fallback — Firmware Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /firmware\?\.version \|\| 'CC-FW-\d+\.\d+\.\d+'/g,
        \"firmware?.version || 'CC-FW-\" + FIRMWARE_VER + \"'\",
        'firmware JS fallback');
}

// ============================================================================
// S5: HTML Span Defaults — Engine Version
// ============================================================================
console.log('\\n\\x1b[36m--- S5: HTML Span Defaults — Engine Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /id=\"cc-footer-commutecompute-version\">v\d+\.\d+</g,
        'id=\"cc-footer-commutecompute-version\">v' + ENGINE_VER + '<',
        'engine footer span default');
    applyReplacement(f,
        /id=\"cc-grid-engine-version\"[^>]*>v\d+\.\d+</g,
        'id=\"cc-grid-engine-version\" style=\"font-size: 20px; font-weight: 700; color: #4fb28e;\">v' + ENGINE_VER + '<',
        'engine grid span default');
}

// ============================================================================
// S6: HTML Span Defaults — Renderer Version
// ============================================================================
console.log('\\n\\x1b[36m--- S6: HTML Span Defaults — Renderer Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /id=\"cc-footer-renderer-version\">v\d+\.\d+</g,
        'id=\"cc-footer-renderer-version\">v' + RENDERER_VER + '<',
        'renderer footer span default');
    applyReplacement(f,
        /id=\"cc-grid-renderer-version\"[^>]*>v\d+\.\d+</g,
        'id=\"cc-grid-renderer-version\" style=\"font-size: 20px; font-weight: 700; color: #667eea;\">v' + RENDERER_VER + '<',
        'renderer grid span default');
}

// ============================================================================
// S7: HTML Span Defaults — System Version
// ============================================================================
console.log('\\n\\x1b[36m--- S7: HTML Span Defaults — System Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /id=\"cc-footer-system-version\">v\d+\.\d+\.\d+</g,
        'id=\"cc-footer-system-version\">v' + SYS_VER + '<',
        'system footer span default');
    applyReplacement(f,
        /id=\"cc-grid-system-version\"[^>]*>v\d+\.\d+\.\d+</g,
        'id=\"cc-grid-system-version\" style=\"font-size: 20px; font-weight: 700; color: #ec4899;\">v' + SYS_VER + '<',
        'system grid span default');
    applyReplacement(f,
        /id=\"cc-badge-system-version\"[^>]*>v\d+\.\d+\.\d+</g,
        'id=\"cc-badge-system-version\" style=\"padding: 6px 14px; background: rgba(79, 178, 142, 0.2); border-radius: 20px; font-size: 12px; font-weight: 600; color: #4fb28e;\">v' + SYS_VER + '<',
        'system badge span default');
}

// ============================================================================
// S8: HTML Span Defaults — Firmware Version
// ============================================================================
console.log('\\n\\x1b[36m--- S8: HTML Span Defaults — Firmware Version ---\\x1b[0m');
for (const f of htmlFiles) {
    applyReplacement(f,
        /id=\"cc-footer-firmware-version\">CC-FW-\d+\.\d+\.\d+</g,
        'id=\"cc-footer-firmware-version\">CC-FW-' + FIRMWARE_VER + '<',
        'firmware footer span default');
    applyReplacement(f,
        /id=\"cc-grid-firmware-version\"[^>]*>CC-FW-\d+\.\d+\.\d+</g,
        'id=\"cc-grid-firmware-version\" style=\"font-size: 20px; font-weight: 700; color: #fbbf24;\">CC-FW-' + FIRMWARE_VER + '<',
        'firmware grid span default');
    applyReplacement(f,
        /id=\"cc-badge-firmware-version\"[^>]*>CCFirm[^<]*CC-FW-\d+\.\d+\.\d+</g,
        'id=\"cc-badge-firmware-version\" style=\"padding: 6px 14px; background: rgba(251, 191, 36, 0.2); border-radius: 20px; font-size: 12px; font-weight: 600; color: #fbbf24;\">CCFirm\&#8482; CC-FW-' + FIRMWARE_VER + '<',
        'firmware badge span default');
}

// ============================================================================
// S9: Admin Panel .catch() Fallback Block
// ============================================================================
console.log('\\n\\x1b[36m--- S9: Admin Panel .catch() Fallbacks ---\\x1b[0m');
const adminFile = path.join(REPO, 'public', 'admin.html');
if (fs.existsSync(adminFile)) {
    applyReplacement(adminFile,
        /commutecompute-version'\)\.textContent = 'v\d+\.\d+'/g,
        \"commutecompute-version').textContent = 'v\" + ENGINE_VER + \"'\",
        'admin .catch() engine fallback');
    applyReplacement(adminFile,
        /renderer-version'\)\.textContent = 'v\d+\.\d+'/g,
        \"renderer-version').textContent = 'v\" + RENDERER_VER + \"'\",
        'admin .catch() renderer fallback');
    applyReplacement(adminFile,
        /system-version'\)\.textContent = 'v\d+\.\d+\.\d+'/g,
        \"system-version').textContent = 'v\" + SYS_VER + \"'\",
        'admin .catch() system fallback');
}

// ============================================================================
// S10: Admin Panel Inline System Version Badges
// ============================================================================
console.log('\\n\\x1b[36m--- S10: Admin Panel Inline System Badge ---\\x1b[0m');
if (fs.existsSync(adminFile)) {
    applyReplacement(adminFile,
        /font-weight: 600; color: #4fb28e;\">v\d+\.\d+\.\d+<\/span>/g,
        'font-weight: 600; color: #4fb28e;\">v' + SYS_VER + '</span>',
        'admin system version badge (inline)');
}

// ============================================================================
// S11: Admin Panel Renderer Badge
// ============================================================================
console.log('\\n\\x1b[36m--- S11: Admin Panel Renderer Badge ---\\x1b[0m');
if (fs.existsSync(adminFile)) {
    applyReplacement(adminFile,
        /id=\"cc-badge-renderer-version\"[^>]*>CCDash[^<]*v\d+\.\d+</g,
        'id=\"cc-badge-renderer-version\" style=\"padding: 6px 14px; background: rgba(102, 126, 234, 0.2); border-radius: 20px; font-size: 12px; font-weight: 600; color: #667eea;\">CCDash\&#8482; v' + RENDERER_VER + '<',
        'admin renderer badge');
}

// ============================================================================
// S12: firmware/VERSION.txt
// ============================================================================
console.log('\\n\\x1b[36m--- S12: firmware/VERSION.txt ---\\x1b[0m');
const fwVersionFile = path.join(REPO, 'firmware', 'VERSION.txt');
if (fs.existsSync(fwVersionFile)) {
    applyReplacement(fwVersionFile,
        /^VERSION=\d+\.\d+\.\d+/m,
        'VERSION=' + FIRMWARE_VER,
        'firmware VERSION.txt version');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('');
console.log('\\x1b[36m=== SUMMARY ===\\x1b[0m');

if (DRY_RUN) {
    if (updatedCount === 0) {
        console.log('\\x1b[32mAll versions already current\\x1b[0m — nothing to update');
    } else {
        console.log('\\x1b[33m' + updatedCount + ' pattern groups would be updated\\x1b[0m');
        console.log('Run without --dry-run to apply changes');
    }
} else {
    if (updatedCount === 0) {
        console.log('\\x1b[32mAll versions already current\\x1b[0m — no changes made');
    } else {
        console.log('\\x1b[32m' + updatedCount + ' pattern groups updated\\x1b[0m');
        if (updatedFiles.size > 0) {
            console.log('\\nFiles modified:');
            for (const f of [...updatedFiles].sort()) {
                console.log('  ' + f);
            }
        }
    }
}
console.log('');
"
}

run_updates
