#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Angus Bergman
"""
Commute Compute™ Compliance Scanner Extensions v1.0

Six supplementary compliance checks covering gaps not addressed by the
main compliance scanner (cc-compliance-scanner.py v1.2):

  1. Stale endpoint references — context-aware /api/screen detection
  2. Version propagation — VERSION.json consistency across all files
  3. Prohibited terms (context-aware) — excludes definition files
  4. Format-default ternary — verifies the critical ternary is intact
  5. WCAG contrast (computed) — actual WCAG 2.2 AA contrast ratio computation
  6. Australian English (CSS-aware) — excludes CSS keywords

Run standalone:
    python3 scripts/cc-board-scanner-extensions.py [repo_root]

Exit codes:
    0 = All checks passed (PASS + WARN only)
    1 = One or more checks failed (FAIL)
"""

import os
import re
import sys
import json
from pathlib import Path
from typing import List, Tuple, Optional, Set


# ============================================================================
# CONFIGURATION
# ============================================================================

# Directories to exclude from scanning
EXCLUDE_DIRS = {
    "node_modules", ".git", ".next", "dist", "build", "coverage", ".pio",
}

# File extension sets
SOURCE_EXTENSIONS = {".js", ".mjs", ".cjs"}
DOC_EXTENSIONS = {".md", ".txt", ".html"}
ALL_TEXT_EXTENSIONS = SOURCE_EXTENSIONS | DOC_EXTENSIONS | {".json", ".yaml", ".yml", ".sh"}


# ============================================================================
# AUDIT RESULTS
# ============================================================================

class AuditResults:
    """Track pass/fail/warn/skip counts and individual findings."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.skipped = 0
        self.findings: List[Tuple[str, str, str]] = []  # (level, check, detail)

    def pass_check(self, message: str):
        self.passed += 1
        self.findings.append(("PASS", message, ""))
        print(f"  \033[32m[PASS]\033[0m {message}")

    def fail_check(self, message: str, detail: str = ""):
        self.failed += 1
        self.findings.append(("FAIL", message, detail))
        print(f"  \033[31m[FAIL]\033[0m {message}")
        if detail:
            for line in detail.split("\n")[:5]:
                print(f"         {line}")

    def warn_check(self, message: str, detail: str = ""):
        self.warnings += 1
        self.findings.append(("WARN", message, detail))
        print(f"  \033[33m[WARN]\033[0m {message}")
        if detail:
            for line in detail.split("\n")[:3]:
                print(f"         {line}")

    def skip_check(self, message: str):
        self.skipped += 1
        self.findings.append(("SKIP", message, ""))
        print(f"  \033[36m[SKIP]\033[0m {message}")

    def summary(self) -> int:
        total = self.passed + self.failed + self.warnings + self.skipped
        print("\n" + "=" * 66)
        print(f"EXTENSION SCAN RESULTS: {total} checks")
        print(f"  \033[32mPASSED:  {self.passed}\033[0m")
        print(f"  \033[31mFAILED:  {self.failed}\033[0m")
        print(f"  \033[33mWARNS:   {self.warnings}\033[0m")
        print(f"  \033[36mSKIPPED: {self.skipped}\033[0m")
        print("=" * 66)
        if self.failed > 0:
            print("\033[31mRESULT: FAIL\033[0m")
            return 1
        else:
            print("\033[32mRESULT: PASS\033[0m")
            return 0


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def get_files(repo_root: Path, extensions: Set[str],
              subdirs: Optional[List[str]] = None) -> List[Path]:
    """Walk repo tree and return files matching extensions, excluding standard dirs."""
    files = []
    if subdirs:
        for subdir in subdirs:
            sd = repo_root / subdir
            if sd.exists():
                for root, dirs, fnames in os.walk(sd):
                    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                    for fname in fnames:
                        if Path(fname).suffix in extensions:
                            files.append(Path(root) / fname)
    else:
        for root, dirs, fnames in os.walk(repo_root):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for fname in fnames:
                if Path(fname).suffix in extensions:
                    files.append(Path(root) / fname)
    return files


def read_file_safe(filepath: Path) -> Optional[str]:
    """Read file contents, returning None on error."""
    try:
        return filepath.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


# ============================================================================
# EXTENSION 1: Stale Endpoint Reference Audit (Pattern 18)
# ============================================================================

def check_stale_endpoint_references(repo_root: Path, results: AuditResults):
    """
    Detect stale /api/screen references in documentation files.
    Pattern 18 (Endpoint Unification): api/screen.js DELETED.
    api/commutecompute.js is THE single unified endpoint.
    vercel.json rewrites /api/screen -> /api/commutecompute for firmware.

    Context-aware: firmware docs describing what the device sends
    may legitimately reference /api/screen with a rewrite note.
    User-facing setup docs MUST use /api/commutecompute.
    """
    print("\n--- Stale Endpoint Reference Audit (Pattern 18) ---")

    USER_FACING_DOCS = {
        "SETUP_GUIDE.md", "COMPLETE-BEGINNER-GUIDE.md",
        "INSTALL.md", "DEVICE-COMPATIBILITY.md",
        "SUPPORT.md", "GOOGLE-PLACES-SETUP.md",
    }
    HISTORICAL_EXEMPT = {"KNOWN-ISSUES.md", "CHANGELOG.md"}
    REWRITE_NOTE = re.compile(
        r'rewrite|redirect|backward.?compat|firmware.?sends',
        re.IGNORECASE,
    )

    doc_files = get_files(repo_root, DOC_EXTENSIONS)
    user_facing_violations = []
    technical_warnings = []

    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = str(fpath.relative_to(repo_root))
        fname = fpath.name

        if fname in HISTORICAL_EXEMPT:
            continue

        for i, line in enumerate(content.splitlines(), 1):
            if '/api/screen' not in line:
                continue
            # Check surrounding context (3 lines) for rewrite note
            lines = content.splitlines()
            context_start = max(0, i - 3)
            context_end = min(len(lines), i + 2)
            context_block = ' '.join(lines[context_start:context_end])
            has_rewrite_note = bool(REWRITE_NOTE.search(context_block))

            if fname in USER_FACING_DOCS:
                user_facing_violations.append(f"  {rel}:{i}")
            elif not has_rewrite_note:
                technical_warnings.append(f"  {rel}:{i}")

    if user_facing_violations:
        results.fail_check(
            f"Stale /api/screen in {len(user_facing_violations)} "
            f"user-facing doc location(s) -- must use /api/commutecompute",
            "\n".join(user_facing_violations[:10])
        )
    else:
        results.pass_check("No stale /api/screen refs in user-facing docs")

    if technical_warnings:
        results.warn_check(
            f"/api/screen in {len(technical_warnings)} technical doc(s) "
            f"without rewrite context note",
            "\n".join(technical_warnings[:10])
        )


# ============================================================================
# EXTENSION 2: Version Consistency Audit (Pattern 15)
# ============================================================================

def check_version_propagation(repo_root: Path, results: AuditResults):
    """
    Verify VERSION.json version is propagated to all version-bearing files.
    Pattern 15: VERSION.json is single source of truth.
    scripts/update-versions.sh must be run after version changes.
    """
    print("\n--- Version Propagation Audit (Pattern 15) ---")

    version_file = repo_root / "VERSION.json"
    pkg_file = repo_root / "package.json"
    lock_file = repo_root / "package-lock.json"

    if not version_file.exists():
        results.skip_check("VERSION.json not found")
        return

    try:
        version_data = json.loads(version_file.read_text())
        system_val = version_data.get("system", {})
        # system may be a dict with a 'version' key, or a plain string
        if isinstance(system_val, dict):
            canonical = system_val.get("version", "")
        else:
            canonical = str(system_val)
    except (json.JSONDecodeError, KeyError):
        results.fail_check("VERSION.json is malformed or missing 'system' key")
        return

    if not canonical:
        results.fail_check("VERSION.json 'system.version' is empty or missing")
        return

    # Strip leading 'v' for comparison
    ver_bare = canonical.lstrip('v')
    ver_v = f"v{ver_bare}"

    # Validate version string has expected semver structure
    parts = ver_bare.split('.')
    if len(parts) != 3:
        results.fail_check(
            f"VERSION.json 'system' value '{canonical}' is not valid semver"
        )
        return

    try:
        major, minor, patch = parts[0], parts[1], int(parts[2])
    except ValueError:
        results.fail_check(
            f"VERSION.json 'system' value '{canonical}' has non-numeric patch"
        )
        return

    # Check package.json
    stale_files = []
    if pkg_file.exists():
        try:
            pkg = json.loads(pkg_file.read_text())
            if pkg.get("version") != ver_bare:
                stale_files.append(
                    f"  package.json: {pkg.get('version')} (expected {ver_bare})"
                )
        except json.JSONDecodeError:
            stale_files.append("  package.json: malformed JSON")

    # Check package-lock.json
    if lock_file.exists():
        try:
            lock = json.loads(lock_file.read_text())
            if lock.get("version") != ver_bare:
                stale_files.append(
                    f"  package-lock.json: {lock.get('version')} (expected {ver_bare})"
                )
        except json.JSONDecodeError:
            stale_files.append("  package-lock.json: malformed JSON")

    # Build previous version strings to scan for in markdown
    previous_versions = []
    if patch > 0:
        previous_versions.append(f"v{major}.{minor}.{patch - 1}")
    if patch > 1:
        previous_versions.append(f"v{major}.{minor}.{patch - 2}")

    doc_files = get_files(repo_root, {".md"})
    # Pattern 17: exclude historical version comments (annotations, not stale refs)
    HISTORICAL_COMMENT = re.compile(
        r'//\s*V\d+\.\d+|SPEC FIX|per CCDashDesign|ALIGNED with|LOCKED'
    )

    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = str(fpath.relative_to(repo_root))
        for i, line in enumerate(content.splitlines(), 1):
            if HISTORICAL_COMMENT.search(line):
                continue
            for old_ver in previous_versions:
                if old_ver in line and ver_v not in line:
                    stale_files.append(f"  {rel}:{i}: contains {old_ver}")
                    break

    if stale_files:
        results.fail_check(
            f"Version drift: {len(stale_files)} location(s) not at {ver_v}",
            "\n".join(stale_files[:15])
        )
    else:
        results.pass_check(f"All version references consistent with {ver_v}")


# ============================================================================
# EXTENSION 3: Prohibited Terms (Context-Aware)
# ============================================================================

def check_prohibited_terms_contextaware(repo_root: Path, results: AuditResults):
    """
    Detect prohibited terms with context awareness.
    Resolves false positives: terms inside prohibited_terms definition
    arrays (cc-constants.json, scanner config) must not trigger.
    """
    print("\n--- Prohibited Terms (Context-Aware) ---")

    constants_file = repo_root / "scripts" / "cc-constants.json"
    DEFINITION_FILES = {
        "cc-constants.json", "cc-compliance-scanner.py",
        "cc-pre-review-scan.py", "cc-board-scanner-extensions.py",
    }

    prohibited = []
    if constants_file.exists():
        try:
            data = json.loads(constants_file.read_text())
            prohibited = [
                (p["term"], p["reason"])
                for p in data.get("prohibited_terms", [])
            ]
        except (json.JSONDecodeError, KeyError):
            pass

    if not prohibited:
        results.skip_check("No prohibited terms loaded from cc-constants.json")
        return

    all_text_files = get_files(repo_root, ALL_TEXT_EXTENSIONS)
    violations = []

    for fpath in all_text_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = str(fpath.relative_to(repo_root))
        fname = fpath.name

        # Skip definition files entirely -- they DEFINE the terms
        if fname in DEFINITION_FILES:
            continue

        for term, reason in prohibited:
            if term in content:
                for i, line in enumerate(content.splitlines(), 1):
                    if term in line:
                        violations.append(
                            f"  {rel}:{i}: '{term}' ({reason})"
                        )

    if violations:
        results.fail_check(
            f"Prohibited terms found in {len(violations)} location(s)",
            "\n".join(violations[:10])
        )
    else:
        results.pass_check("No prohibited terms found (definition files excluded)")


# ============================================================================
# EXTENSION 4: Format-Default Ternary (Pattern 16, P0)
# ============================================================================

def check_format_default_ternary(repo_root: Path, results: AuditResults):
    """
    Verify the format-default ternary in api/commutecompute.js is intact.
    Pattern 16 (CRITICAL): POST=json (admin panel), GET=png (firmware).
    The exact pattern must be:
        req.query?.format || (req.method === 'POST' ? 'json' : 'png')
    Any deviation bricks all firmware devices.
    """
    print("\n--- Format-Default Ternary (Pattern 16, P0) ---")

    endpoint = repo_root / "api" / "commutecompute.js"
    if not endpoint.exists():
        results.fail_check("api/commutecompute.js not found -- unified endpoint missing")
        return

    content = read_file_safe(endpoint)
    if content is None:
        results.fail_check("Cannot read api/commutecompute.js")
        return

    # Exact expected pattern
    EXPECTED = "req.query?.format || (req.method === 'POST' ? 'json' : 'png')"
    # Dangerous anti-patterns
    DANGEROUS = [
        re.compile(r"format\s*=\s*['\"]json['\"]"),      # unconditional json default
        re.compile(r"format\s*=\s*req\.query\?\.format"), # missing fallback
    ]

    if EXPECTED in content:
        results.pass_check("Format-default ternary intact (POST=json, GET=png)")
    else:
        results.fail_check(
            "Format-default ternary MISSING or ALTERED in api/commutecompute.js -- "
            "this will brick all firmware devices. "
            f"Expected: {EXPECTED}"
        )

    for pattern in DANGEROUS:
        for i, line in enumerate(content.splitlines(), 1):
            if pattern.search(line) and 'req.method' not in line:
                results.fail_check(
                    f"DANGEROUS format default at line {i}: "
                    f"unconditional default detected -- firmware will break",
                    f"  Line {i}: {line.strip()[:100]}"
                )


# ============================================================================
# EXTENSION 5: WCAG 2.2 AA Contrast Ratio (Computed)
# ============================================================================

def check_wcag_contrast_computed(repo_root: Path, results: AuditResults):
    """
    Compute actual WCAG 2.2 AA contrast ratios for admin panel colour pairs.
    AHRC April 2025 guidelines: WCAG 2.2 AA is recommended DDA benchmark.
    Ratio must be >= 4.5:1 for normal text, >= 3.0:1 for large text.
    """
    print("\n--- WCAG 2.2 AA Contrast Ratio (Computed) ---")

    def hex_to_rgb(h):
        h = h.lstrip('#')
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

    def relative_luminance(r, g, b):
        def channel(c):
            c = c / 255.0
            return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

    def contrast_ratio(hex1, hex2):
        l1 = relative_luminance(*hex_to_rgb(hex1))
        l2 = relative_luminance(*hex_to_rgb(hex2))
        lighter = max(l1, l2)
        darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)

    # Known colour pairs from admin panel (dark theme)
    PAIRS_TO_CHECK = [
        ("#94a3b8", "#1a2744", "secondary text on dark bg"),
        ("#a3b8d0", "#1e293b", "--text-secondary on --bg-secondary"),
    ]

    admin_file = repo_root / "public" / "admin.html"
    if not admin_file.exists():
        results.skip_check("admin.html not found")
        return

    content = read_file_safe(admin_file)
    if content is None:
        results.skip_check("Cannot read admin.html")
        return

    failures = []
    for fg, bg, label in PAIRS_TO_CHECK:
        if fg in content:
            ratio = contrast_ratio(fg, bg)
            if ratio < 4.5:
                failures.append(
                    f"  {fg} on {bg} ({label}): {ratio:.1f}:1 (need 4.5:1)"
                )

    if failures:
        results.warn_check(
            f"WCAG 2.2 AA contrast failures: {len(failures)} pair(s)",
            "\n".join(failures)
        )
    else:
        results.pass_check("All checked colour pairs meet WCAG 2.2 AA 4.5:1")


# ============================================================================
# EXTENSION 6: Australian English (CSS-Aware)
# ============================================================================

def check_australian_english_css_aware(repo_root: Path, results: AuditResults):
    """
    Enhanced Australian English check that excludes CSS property values
    and HTML attribute values from flagging.
    Resolves: admin.html:4317 'center' is align-items:center (CSS keyword).
    W3C CSS specification defines 'center' -- cannot be changed to 'centre'.
    """
    print("\n--- Australian English (CSS-Aware) ---")

    CSS_CONTEXT = re.compile(
        r'(align-items|text-align|align-self|justify-content|'
        r'vertical-align|align|justify|transform-origin)\s*:\s*[^;]*center',
        re.IGNORECASE,
    )
    HTML_ATTR_CONTEXT = re.compile(
        r'align\s*=\s*["\']center["\']',
        re.IGNORECASE,
    )
    STYLE_ATTR = re.compile(r'style\s*=\s*"[^"]*center[^"]*"', re.IGNORECASE)
    # JavaScript API constants (e.g. scrollIntoView({ block: 'center' }))
    JS_API_CONTEXT = re.compile(
        r"(block|inline)\s*:\s*['\"]center['\"]",
        re.IGNORECASE,
    )

    html_files = get_files(repo_root, {".html"})

    false_positive_count = 0
    genuine_count = 0

    for fpath in html_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = str(fpath.relative_to(repo_root))

        for i, line in enumerate(content.splitlines(), 1):
            if 'center' not in line.lower():
                continue
            # Is this a CSS, HTML attribute, or JS API context?
            if (CSS_CONTEXT.search(line) or
                    HTML_ATTR_CONTEXT.search(line) or
                    STYLE_ATTR.search(line) or
                    JS_API_CONTEXT.search(line)):
                false_positive_count += 1
                continue
            # Check for prose 'center' (not in a tag attribute or style)
            stripped = re.sub(r'<[^>]+>', '', line)  # strip HTML tags
            if re.search(r'\bcenter\b', stripped, re.IGNORECASE):
                genuine_count += 1
                results.warn_check(
                    f"Prose 'center' in {rel}:{i} -- should be 'centre'",
                    f"  {line.strip()[:80]}"
                )

    if false_positive_count and not genuine_count:
        results.pass_check(
            f"All {false_positive_count} 'center' instance(s) are CSS/HTML -- "
            f"no prose Australian English violations"
        )


# ============================================================================
# MAIN
# ============================================================================

def run_all_extensions(repo_root: Path) -> int:
    """Execute all extension checks and return exit code."""
    results = AuditResults()

    print("=" * 66)
    print("COMMUTE COMPUTE COMPLIANCE SCANNER EXTENSIONS v1.0")
    print(f"Repository: {repo_root}")
    print("=" * 66)

    # Extension 1: Stale Endpoint References
    print("\n" + "=" * 66)
    print("EXT 1: STALE ENDPOINT REFERENCES")
    print("=" * 66)
    check_stale_endpoint_references(repo_root, results)

    # Extension 2: Version Propagation
    print("\n" + "=" * 66)
    print("EXT 2: VERSION PROPAGATION")
    print("=" * 66)
    check_version_propagation(repo_root, results)

    # Extension 3: Prohibited Terms (Context-Aware)
    print("\n" + "=" * 66)
    print("EXT 3: PROHIBITED TERMS (CONTEXT-AWARE)")
    print("=" * 66)
    check_prohibited_terms_contextaware(repo_root, results)

    # Extension 4: Format-Default Ternary
    print("\n" + "=" * 66)
    print("EXT 4: FORMAT-DEFAULT TERNARY (P0)")
    print("=" * 66)
    check_format_default_ternary(repo_root, results)

    # Extension 5: WCAG Contrast (Computed)
    print("\n" + "=" * 66)
    print("EXT 5: WCAG 2.2 AA CONTRAST (COMPUTED)")
    print("=" * 66)
    check_wcag_contrast_computed(repo_root, results)

    # Extension 6: Australian English (CSS-Aware)
    print("\n" + "=" * 66)
    print("EXT 6: AUSTRALIAN ENGLISH (CSS-AWARE)")
    print("=" * 66)
    check_australian_english_css_aware(repo_root, results)

    return results.summary()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        repo_path = Path(sys.argv[1]).resolve()
    else:
        repo_path = Path("/tmp/cc-public-review").resolve()

    if not repo_path.exists():
        print(f"Error: repository root '{repo_path}' does not exist")
        sys.exit(1)

    exit_code = run_all_extensions(repo_path)
    sys.exit(exit_code)
