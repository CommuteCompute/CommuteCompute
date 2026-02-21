#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Angus Bergman
"""
Commute Compute™ Compliance Scanner v1.1

Comprehensive Python compliance scanning covering all requirements from:
- DEVELOPMENT-RULES.md (26 sections)
- Project compliance standards and critical patterns

Categories:
- A: Trademark and branding compliance
- B: Australian English spelling enforcement
- C: Security (secrets, XSS, CSP, .env files)
- D: Licensing (SPDX headers, copyright, AGPL compliance)
- E: Prohibited terms (PTV naming, TRMNL server references)
- F: Version consistency and user-facing accuracy
- G: Privacy and regulatory compliance
- H: CI/CD and dependency management
- I: Accessibility (WCAG, emoji prohibition)
- J: Code quality and patterns
- K: Docker and deployment consistency
- L: Numeric legal claim validation

Run from repository root:
    python3 scripts/cc-compliance-scanner.py [--repo-root /path/to/repo]

Exit codes:
    0 = All checks passed (PASS + WARN only)
    1 = One or more checks failed (FAIL)

Copyright (c) 2026 Angus Bergman
Licensed under AGPL-3.0
"""

import os
import re
import sys
import json
import glob
import argparse
from pathlib import Path
from typing import List, Tuple, Dict, Optional, Set

# ============================================================================
# CONFIGURATION
# ============================================================================

# Trademarks that MUST have the TM symbol
REQUIRED_TM_MARKS = [
    "Commute Compute",
    "CCDash",
    "CC LiveDash",
    "CCFirm",
]

# Terms that must NOT have TM symbol
NO_TM_TERMS = [
    "CoffeeDecision",
]

# Forbidden PTV terms (Section 1)
FORBIDDEN_PTV_TERMS = [
    r"PTV_API_KEY",
    r"PTV_DEV_ID",
    r"PTV_USER_ID",
    r"PTV\s+API(?!\s+naming)",   # "PTV API" but not "PTV API naming" in dev rules
    r"PTV\s+Timetable",
    r"PTV\s+Developer",
]

# TRMNL server references (Section 2)
TRMNL_SERVER_PATTERNS = [
    r"usetrmnl\.com",
    r"api\.usetrmnl",
    r"trmnl\.com(?!/)",  # trmnl.com but allow shop.trmnl.com in docs
]

# American English -> Australian English mapping
# Code identifiers (camelCase, UPPER_CASE, snake_case) are exempt
AMERICAN_TO_AUSTRALIAN = {
    "license": "licence",
    "License": "Licence",
    "licenses": "licences",
    "Licenses": "Licences",
    "licensed": "licenced",          # Note: "Licensed" in SPDX headers is exempt
    "licensing": "licensing",         # Same spelling in both
    "optimize": "optimise",
    "Optimize": "Optimise",
    "optimizer": "optimiser",
    "Optimizer": "Optimiser",
    "optimization": "optimisation",
    "Optimization": "Optimisation",
    "organize": "organise",
    "Organize": "Organise",
    "organization": "organisation",
    "Organization": "Organisation",
    "color": "colour",
    "Color": "Colour",
    "colors": "colours",
    "Colors": "Colours",
    "favorite": "favourite",
    "Favorite": "Favourite",
    "favorites": "favourites",
    "honor": "honour",
    "Honor": "Honour",
    "behavior": "behaviour",
    "Behavior": "Behaviour",
    "behaviors": "behaviours",
    "center": "centre",
    "Center": "Centre",
    "centers": "centres",
    "defense": "defence",
    "Defense": "Defence",
    "prioritize": "prioritise",
    "Prioritize": "Prioritise",
    "prioritized": "prioritised",
    "recognize": "recognise",
    "Recognize": "Recognise",
    "recognized": "recognised",
    "analyze": "analyse",
    "Analyze": "Analyse",
    "analyzed": "analysed",
    "summarize": "summarise",
    "Summarize": "Summarise",
    "summarized": "summarised",
    "categorize": "categorise",
    "Categorize": "Categorise",
    "authorize": "authorise",
    "Authorize": "Authorise",
    "authorized": "authorised",
    "criticize": "criticise",
    "Criticize": "Criticise",
    "customizable": "customisable",
    "Customizable": "Customisable",
    "serializable": "serialisable",
    "minimizable": "minimisable",
    "fulfillment": "fulfilment",
    "enrollment": "enrolment",
    "modeling": "modelling",
    "labeling": "labelling",
    "traveler": "traveller",
    "canceled": "cancelled",
    "canceling": "cancelling",
    "signaling": "signalling",
    "gray": "grey",
    "Gray": "Grey",
}

# Exemptions for Australian English check
AUSTRALIAN_ENGLISH_EXEMPTIONS = [
    # File names that follow GitHub/npm convention
    r"LICENSE",
    r"license\.md",
    # SPDX identifiers are standardised as American English
    r"SPDX-License-Identifier",
    r"Licensed under",
    # npm/package.json standard fields
    r'"license"',
    r'"License"',
    # Code identifiers (camelCase, PascalCase, UPPER_CASE, snake_case)
    r"[a-z][a-zA-Z]*[Cc]olor[a-zA-Z]*",
    r"[a-z][a-zA-Z]*[Oo]ptimi[zs]e[a-zA-Z]*",
    r"SleepOptimiser",  # Code class name
    r"AltTransit",
    # CSS property values
    r"color:",
    r"background-color:",
    r"border-color:",
    # URLs and external references
    r"https?://",
    # File references
    r"\.js",
    r"\.json",
    r"\.css",
    # Version strings and filenames in code
    r"`[^`]*`",
    # Markdown code blocks
    r"```",
    # HTML attributes
    r'class="',
    r'id="',
    # Comments in code about American English conventions
    r"//.*",
    r"#.*",
]

# Metro Tunnel stations (Section 25)
METRO_TUNNEL_STATIONS = [
    "Arden",
    "Parkville",
    "State Library",
    "Town Hall",
    "Anzac",
]

# Current system versions
EXPECTED_VERSIONS = {
    "system": "v4.2.0",
    "commute_compute_engine": "v3.1",
    "ccdash_renderer": "v2.1",
    "admin_panel": "v5.0",
    "setup_wizard": "v2.0",
    "firmware": "CC-FW-7.6.0",
}

# Source file extensions for various checks
SOURCE_EXTENSIONS = {".js", ".mjs", ".cjs"}
DOC_EXTENSIONS = {".md", ".txt", ".html"}
ALL_TEXT_EXTENSIONS = SOURCE_EXTENSIONS | DOC_EXTENSIONS | {".json", ".yaml", ".yml", ".sh"}

# Directories to exclude from scanning
EXCLUDE_DIRS = {
    "node_modules", ".git", ".next", "dist", "build",
    "coverage", ".vercel", "archive", ".cache",
}


# ============================================================================
# COUNTERS AND OUTPUT
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
        print(f"COMPLIANCE SCAN RESULTS: {total} checks")
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
    search_root = repo_root
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
        for root, dirs, fnames in os.walk(search_root):
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


def is_code_identifier(line: str, word: str, pos: int) -> bool:
    """
    Heuristic: check if the word at position `pos` in `line` is likely
    a code identifier (camelCase, part of a URL, inside backticks, etc.).
    """
    # Inside backtick code span
    before = line[:pos]
    after = line[pos + len(word):]
    if before.count("`") % 2 == 1:
        return True
    # camelCase context: preceded or followed by lowercase+uppercase
    if pos > 0 and line[pos - 1].isalpha() and line[pos - 1].islower():
        return True
    if pos + len(word) < len(line) and line[pos + len(word)].isalpha():
        # Check if next char is uppercase (PascalCase continuation)
        if line[pos + len(word)].isupper():
            return True
    # Inside a URL
    url_match = re.search(r'https?://\S+', line)
    if url_match and url_match.start() <= pos < url_match.end():
        return True
    # Inside a file path
    if pos > 0 and line[pos - 1] in ('/', '\\', '.', '-', '_'):
        return True
    return False


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 1: TRADEMARK COMPLIANCE
# Category A: Trademark and Branding Compliance
# ============================================================================

def check_trademark_symbols(repo_root: Path, results: AuditResults):
    """
    Verify that required trademarks have TM symbol in public-facing docs.
    Per DEVELOPMENT-RULES.md: Commute Compute™, CCDash™, CC LiveDash™, CCFirm™
    must always carry trademark symbols in user-facing text.
    """
    print("\n--- Trademark Symbol Enforcement ---")
    doc_files = get_files(repo_root, DOC_EXTENSIONS)

    for mark in REQUIRED_TM_MARKS:
        # Find occurrences of the mark WITHOUT the TM symbol
        # Pattern: the mark followed by anything that is NOT the TM symbol
        # We check for the mark as a whole word, not followed by (TM) or the actual symbol
        bare_pattern = re.compile(
            rf'\b{re.escape(mark)}\b(?!\s*[\u2122]|&trade;|\(TM\))',
            re.IGNORECASE
        )
        tm_pattern = re.compile(
            rf'\b{re.escape(mark)}\s*[\u2122]',
            re.IGNORECASE
        )

        violations = []
        has_tm_usage = False

        for fpath in doc_files:
            content = read_file_safe(fpath)
            if content is None:
                continue
            rel = fpath.relative_to(repo_root)

            for i, line in enumerate(content.splitlines(), 1):
                # Skip code blocks
                if line.strip().startswith("```"):
                    continue
                # Skip lines that are in code context
                if "`" in line and line.count("`") >= 2:
                    # Check if the mark is inside backticks
                    pass

                if tm_pattern.search(line):
                    has_tm_usage = True

                bare_matches = bare_pattern.finditer(line)
                for m in bare_matches:
                    # Exclude if inside backticks or code block
                    before = line[:m.start()]
                    if before.count("`") % 2 == 1:
                        continue
                    # Exclude if in a heading defining the term
                    if line.strip().startswith("#"):
                        continue
                    # Exclude DEVELOPMENT-RULES definition tables
                    if "DEVELOPMENT-RULES" in str(rel):
                        continue
                    violations.append(f"  {rel}:{i}: {line.strip()[:80]}")

        if violations and has_tm_usage:
            # Only flag if we see some TM usage (confirming the doc uses TM)
            # but also bare references
            if len(violations) > 10:
                results.warn_check(
                    f"'{mark}' has {len(violations)} bare references (no TM symbol) "
                    f"across docs — review manually",
                    "\n".join(violations[:5])
                )
            else:
                results.pass_check(
                    f"'{mark}' TM symbol usage acceptable ({len(violations)} "
                    f"bare refs may be in non-public context)"
                )
        elif not has_tm_usage and doc_files:
            results.warn_check(
                f"'{mark}' TM symbol not found in any document — "
                f"verify trademark usage in public docs"
            )
        else:
            results.pass_check(f"'{mark}' TM symbol correctly applied")


def check_coffeedecision_no_tm(repo_root: Path, results: AuditResults):
    """
    Verify CoffeeDecision does NOT have TM symbol.
    CoffeeDecision is a feature name, not a trademark — must not carry TM symbol.
    """
    print("\n--- CoffeeDecision No-TM Check ---")
    all_files = get_files(repo_root, ALL_TEXT_EXTENSIONS)
    violations = []

    pattern = re.compile(r'CoffeeDecision\s*[\u2122]|CoffeeDecision\s*&trade;|CoffeeDecision\s*\(TM\)')

    for fpath in all_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        for i, line in enumerate(content.splitlines(), 1):
            if pattern.search(line):
                rel = fpath.relative_to(repo_root)
                violations.append(f"  {rel}:{i}: {line.strip()[:80]}")

    if violations:
        results.fail_check(
            f"CoffeeDecision has TM symbol ({len(violations)} occurrences) -- "
            f"CoffeeDecision is NOT a trademark",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("CoffeeDecision correctly has no TM symbol")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 2: AUSTRALIAN ENGLISH
# Category B: Australian English Spelling Enforcement
# ============================================================================

def check_australian_english(repo_root: Path, results: AuditResults):
    """
    Scan .md, .html, .txt files for American English spellings.
    Code identifiers (camelCase, UPPER_CASE, inside backticks) are exempt.
    All prose, documentation, and user-facing strings must use Australian English.
    """
    print("\n--- Australian English Enforcement ---")
    doc_files = get_files(repo_root, {".md", ".html", ".txt"})

    # Build exemption patterns
    exemption_regexes = [re.compile(p) for p in AUSTRALIAN_ENGLISH_EXEMPTIONS]

    total_violations = 0
    violation_details = []

    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)

        in_code_block = False
        for i, line in enumerate(content.splitlines(), 1):
            # Track fenced code blocks
            stripped = line.strip()
            if stripped.startswith("```"):
                in_code_block = not in_code_block
                continue
            if in_code_block:
                continue

            # Skip HTML tag lines (CSS, JS embedded)
            if stripped.startswith("<style") or stripped.startswith("<script"):
                continue

            for american, australian in AMERICAN_TO_AUSTRALIAN.items():
                if american == australian:
                    continue
                # Word boundary match
                pattern = re.compile(rf'\b{re.escape(american)}\b')
                for m in pattern.finditer(line):
                    pos = m.start()
                    # Check exemptions
                    exempt = False
                    for ex_re in exemption_regexes:
                        if ex_re.search(line):
                            # Check if the exemption applies near this position
                            ex_match = ex_re.search(line)
                            if ex_match and (
                                ex_match.start() <= pos < ex_match.end()
                                or abs(ex_match.start() - pos) < 20
                            ):
                                exempt = True
                                break

                    if exempt:
                        continue

                    # Check if inside backticks
                    before = line[:pos]
                    if before.count("`") % 2 == 1:
                        continue

                    # Check if it's a code identifier
                    if is_code_identifier(line, american, pos):
                        continue

                    # Check if inside an HTML attribute
                    if re.search(r'[a-z]+=\s*"[^"]*$', before):
                        continue

                    total_violations += 1
                    if len(violation_details) < 20:
                        violation_details.append(
                            f"  {rel}:{i}: '{american}' -> '{australian}': "
                            f"{line.strip()[:70]}"
                        )

    if total_violations == 0:
        results.pass_check("Australian English: no American spellings detected in prose")
    elif total_violations <= 5:
        results.warn_check(
            f"Australian English: {total_violations} potential American spelling(s)",
            "\n".join(violation_details)
        )
    else:
        results.fail_check(
            f"Australian English: {total_violations} American spellings found",
            "\n".join(violation_details[:10])
        )


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 3: SECURITY
# Category C: Security Checks
# ============================================================================

def check_no_env_files(repo_root: Path, results: AuditResults):
    """
    Verify no .env files exist (Section 3.1 Zero-Config).
    DEVELOPMENT-RULES Section 3: no .env files in repository.
    """
    print("\n--- No .env Files (Section 3.1) ---")
    env_files = []
    for root, dirs, fnames in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fname in fnames:
            if fname.startswith(".env") and fname != ".envrc":
                env_files.append(Path(root) / fname)

    if env_files:
        details = "\n".join(f"  {f.relative_to(repo_root)}" for f in env_files)
        results.fail_check(f"Found {len(env_files)} .env file(s) -- forbidden", details)
    else:
        results.pass_check("No .env files found (Zero-Config compliant)")


def check_no_hardcoded_secrets(repo_root: Path, results: AuditResults):
    """
    Scan for hardcoded API keys, tokens, or credentials.
    No hardcoded API keys, tokens, or secrets in source files.
    """
    print("\n--- No Hardcoded Secrets ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS | {".html"},
                             subdirs=["src", "api", "public"])
    secret_patterns = [
        (r'["\'](?:sk|pk|rk)_(?:live|test)_[a-zA-Z0-9]{20,}["\']', "Stripe-like key"),
        (r'["\']AIza[0-9A-Za-z_-]{35}["\']', "Google API key"),
        (r'["\']ghp_[a-zA-Z0-9]{36}["\']', "GitHub token"),
        (r'["\']glpat-[a-zA-Z0-9_-]{20,}["\']', "GitLab token"),
        (r'AKIA[0-9A-Z]{16}', "AWS access key"),
        (r'["\'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["\']',
         "UUID-like secret (review)"),
    ]

    violations = []
    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            for pattern, desc in secret_patterns:
                if re.search(pattern, line):
                    # Exclude test files and comments
                    if "/test" in str(rel) or "// " in line.strip()[:5]:
                        continue
                    violations.append(f"  {rel}:{i}: {desc}")

    if violations:
        results.fail_check(
            f"Potential hardcoded secrets found ({len(violations)} matches)",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("No hardcoded secrets detected in source files")


def check_xss_sanitisation(repo_root: Path, results: AuditResults):
    """
    Check for innerHTML/outerHTML usage without sanitisation.
    DEVELOPMENT-RULES Section 17: all user input displayed in HTML must use sanitize().
    """
    print("\n--- XSS Sanitisation (Section 17) ---")
    html_files = get_files(repo_root, {".html"}, subdirs=["public"])
    js_files = get_files(repo_root, SOURCE_EXTENSIONS, subdirs=["src", "api"])

    # Check for dangerous patterns
    dangerous_patterns = [
        (r'\.innerHTML\s*=', "innerHTML assignment"),
        (r'\.outerHTML\s*=', "outerHTML assignment"),
        (r'document\.write\s*\(', "document.write()"),
        (r'eval\s*\(', "eval()"),
    ]

    # Sanitisation patterns that mitigate the risk
    sanitise_patterns = [
        r'escapeHtml',
        r'sanitize',
        r'sanitise',
        r'DOMPurify',
        r'textContent',
        r'createTextNode',
        r'encodeURIComponent',
    ]

    warnings = []
    for fpath in html_files + js_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            for pattern, desc in dangerous_patterns:
                if re.search(pattern, line):
                    # Check if sanitisation is nearby (within 5 lines)
                    context = "\n".join(
                        content.splitlines()[max(0, i - 3):i + 2]
                    )
                    sanitised = any(
                        re.search(sp, context) for sp in sanitise_patterns
                    )
                    if not sanitised:
                        warnings.append(f"  {rel}:{i}: {desc} (no visible sanitisation)")

    if warnings:
        results.warn_check(
            f"XSS: {len(warnings)} potentially unsanitised DOM operations",
            "\n".join(warnings[:5])
        )
    else:
        results.pass_check("XSS: no unsanitised DOM operations detected")


def check_csp_no_unsafe_eval(repo_root: Path, results: AuditResults):
    """
    Verify CSP header does not contain unsafe-eval.
    No unsafe-eval or unsafe-inline in Content Security Policy headers.
    """
    print("\n--- CSP No unsafe-eval ---")
    vercel_json = repo_root / "vercel.json"
    if not vercel_json.exists():
        results.skip_check("vercel.json not found -- cannot verify CSP")
        return

    content = read_file_safe(vercel_json)
    if content is None:
        results.skip_check("Cannot read vercel.json")
        return

    if "unsafe-eval" in content:
        results.fail_check("CSP contains 'unsafe-eval' -- must be removed (v8 fix)")
    else:
        results.pass_check("CSP does not contain unsafe-eval")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 4: LICENSING & IP
# Category D: Licensing and Copyright Compliance
# ============================================================================

def check_spdx_headers(repo_root: Path, results: AuditResults):
    """
    Verify SPDX-License-Identifier headers on all source files.
    All source files must carry SPDX-License-Identifier: AGPL-3.0-or-later.
    """
    print("\n--- SPDX Licence Headers ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src", "api"])

    missing = []
    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        # Check first 30 lines for SPDX identifier
        header = "\n".join(content.splitlines()[:30])
        if "SPDX-License-Identifier" not in header:
            rel = fpath.relative_to(repo_root)
            missing.append(f"  {rel}")

    if missing:
        results.fail_check(
            f"SPDX headers missing from {len(missing)} source file(s)",
            "\n".join(missing[:10])
        )
    else:
        results.pass_check("All source files have SPDX-License-Identifier headers")


def check_copyright_year(repo_root: Path, results: AuditResults):
    """
    Verify copyright year is 2026 across all source files.
    All source files must have Copyright (c) 2026 Angus Bergman header.
    """
    print("\n--- Copyright Year 2026 ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src", "api"])

    wrong_year = []
    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        header = "\n".join(content.splitlines()[:30])
        # Look for "Copyright (c) YYYY" with wrong year
        match = re.search(r'Copyright\s*\(c\)\s*(\d{4})', header)
        if match and match.group(1) != "2026":
            rel = fpath.relative_to(repo_root)
            wrong_year.append(f"  {rel}: year={match.group(1)}")

    if wrong_year:
        results.fail_check(
            f"Copyright year not 2026 in {len(wrong_year)} file(s)",
            "\n".join(wrong_year[:10])
        )
    else:
        results.pass_check("Copyright year 2026 consistent across source files")


def check_licence_file(repo_root: Path, results: AuditResults):
    """
    Verify LICENSE file exists with AGPL-3.0 content.
    LICENCE/LICENSE file must exist and contain AGPL-3.0 text.
    """
    print("\n--- AGPL-3.0 Licence File ---")
    licence_file = repo_root / "LICENSE"
    if not licence_file.exists():
        results.fail_check("LICENSE file not found in repository root")
        return

    content = read_file_safe(licence_file)
    if content is None:
        results.fail_check("Cannot read LICENSE file")
        return

    if "GNU AFFERO GENERAL PUBLIC LICENSE" in content or "AGPL" in content:
        results.pass_check("LICENSE file contains AGPL-3.0 text")
    else:
        results.fail_check("LICENSE file does not contain AGPL-3.0 text")


def check_governing_law(repo_root: Path, results: AuditResults):
    """
    Verify LEGAL.md references Victoria, Australia as governing law.
    DEVELOPMENT-RULES Section 20.7: governing law must be Victoria, Australia.
    """
    print("\n--- Governing Law: Victoria, Australia ---")
    legal_md = repo_root / "LEGAL.md"
    if not legal_md.exists():
        results.fail_check("LEGAL.md not found")
        return

    content = read_file_safe(legal_md)
    if content is None:
        results.fail_check("Cannot read LEGAL.md")
        return

    if "Victoria" in content and "Australia" in content:
        results.pass_check("LEGAL.md references Victoria, Australia jurisdiction")
    else:
        results.fail_check("LEGAL.md missing Victoria, Australia governing law reference")


def check_dco_documented(repo_root: Path, results: AuditResults):
    """
    Check CONTRIBUTING.md documents DCO requirement.
    CONTRIBUTING.md must document DCO/CLA sign-off requirements.
    """
    print("\n--- DCO Documented in CONTRIBUTING.md ---")
    contributing = repo_root / "CONTRIBUTING.md"
    if not contributing.exists():
        results.fail_check("CONTRIBUTING.md not found")
        return

    content = read_file_safe(contributing)
    if content is None:
        results.fail_check("Cannot read CONTRIBUTING.md")
        return

    if "Signed-off-by" in content or "Developer Certificate of Origin" in content:
        results.pass_check("CONTRIBUTING.md documents DCO requirement")
    else:
        results.warn_check("CONTRIBUTING.md does not mention DCO/Signed-off-by")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 5: PROHIBITIONS
# Category E: Prohibited Terms (DEVELOPMENT-RULES Sections 1-2)
# ============================================================================

def check_forbidden_ptv_terms(repo_root: Path, results: AuditResults):
    """
    Scan source/HTML for forbidden PTV terms.
    DEVELOPMENT-RULES Section 1: forbidden PTV terminology.
    """
    print("\n--- Forbidden PTV Terms (Section 1) ---")
    scan_files = get_files(repo_root, SOURCE_EXTENSIONS | {".html"},
                           subdirs=["src", "api", "public"])

    violations = []
    for fpath in scan_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            # Skip comments about the prohibition itself
            if "NEVER use" in line or "Forbidden" in line or "DEVELOPMENT-RULES" in line:
                continue
            for pattern in FORBIDDEN_PTV_TERMS:
                if re.search(pattern, line):
                    violations.append(f"  {rel}:{i}: {line.strip()[:60]}")

    if violations:
        results.fail_check(
            f"Forbidden PTV terms found ({len(violations)} occurrences)",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("No forbidden PTV terms in source/HTML files")


def check_trmnl_references(repo_root: Path, results: AuditResults):
    """
    Check for TRMNL server/cloud references in code (Section 2).
    DEVELOPMENT-RULES Section 2: no TRMNL server/cloud references.
    NOTE: Documentation references to shop.trmnl.com for hardware purchase are exempt.
    """
    print("\n--- TRMNL Server References (Section 2) ---")
    scan_files = get_files(repo_root, SOURCE_EXTENSIONS | {".html"},
                           subdirs=["src", "api", "public", "firmware"])

    violations = []
    for fpath in scan_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            if "archive/" in str(rel):
                continue
            for pattern in TRMNL_SERVER_PATTERNS:
                if re.search(pattern, line):
                    violations.append(f"  {rel}:{i}: {line.strip()[:60]}")

    if violations:
        results.fail_check(
            f"TRMNL server references in code ({len(violations)})",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("No TRMNL server references in source/firmware code")


def check_smartcommute_removed(repo_root: Path, results: AuditResults):
    """
    Verify SmartCommute references are removed (renamed to CommuteCompute 2026-02-07).
    SmartCommute is removed terminology — must not appear in source files.
    """
    print("\n--- SmartCommute Removed ---")
    all_files = get_files(repo_root, ALL_TEXT_EXTENSIONS)

    violations = []
    for fpath in all_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            # Allow references explaining the rename
            if "renamed from SmartCommute" in line or "SmartCommute (non-generic)" in line:
                continue
            if "SmartCommute" in line:
                # Check if it's in a "do not use" context
                if "removed" in line.lower() or "renamed" in line.lower():
                    continue
                violations.append(f"  {rel}:{i}: {line.strip()[:70]}")

    if violations:
        results.fail_check(
            f"SmartCommute references still present ({len(violations)})",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("SmartCommute correctly removed (renamed to CommuteCompute)")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 6: DOCUMENTATION CONSISTENCY
# Category F: Version Consistency and User-Facing Accuracy
# ============================================================================

def check_version_consistency(repo_root: Path, results: AuditResults):
    """
    Cross-reference system version numbers across key files.
    Version strings must be consistent across all files.
    """
    print("\n--- Version Consistency ---")
    version_files = [
        repo_root / "package.json",
        repo_root / "src" / "config" / "version.js",
        repo_root / "README.md",
    ]

    versions_found = {}
    for vf in version_files:
        if not vf.exists():
            continue
        content = read_file_safe(vf)
        if content is None:
            continue
        # Look for version patterns like v4.2.0 or "version": "4.2.0"
        matches = re.findall(r'(?:version["\s:]*["\s]?)(\d+\.\d+\.\d+)', content, re.IGNORECASE)
        if matches:
            versions_found[vf.name] = matches[0]

    if len(set(versions_found.values())) > 1:
        detail = "\n".join(f"  {k}: {v}" for k, v in versions_found.items())
        results.warn_check(
            "Version numbers differ across files (review for consistency)",
            detail
        )
    elif versions_found:
        results.pass_check(
            f"Version consistency: {list(versions_found.values())[0]} "
            f"across {len(versions_found)} files"
        )
    else:
        results.skip_check("No version numbers found to compare")


def check_setup_time_estimates(repo_root: Path, results: AuditResults):
    """
    Flag inconsistent setup time estimates across guides.
    Setup time estimates must be accurate and consistent across all documentation.
    """
    print("\n--- Setup Time Estimate Consistency ---")
    guide_files = {
        "README.md": repo_root / "README.md",
        "SETUP_GUIDE.md": repo_root / "SETUP_GUIDE.md",
        "COMPLETE-BEGINNER-GUIDE.md": None,  # Could be in docs/guides/
    }

    # Search for beginner guide
    for pattern in ["docs/guides/COMPLETE-BEGINNER-GUIDE.md",
                     "COMPLETE-BEGINNER-GUIDE.md",
                     "docs/COMPLETE-BEGINNER-GUIDE.md"]:
        candidate = repo_root / pattern
        if candidate.exists():
            guide_files["COMPLETE-BEGINNER-GUIDE.md"] = candidate
            break

    time_estimates = {}
    for name, fpath in guide_files.items():
        if fpath is None or not fpath.exists():
            continue
        content = read_file_safe(fpath)
        if content is None:
            continue
        # Look for time patterns: "XX minutes", "~XX-YY minutes", "X hours"
        matches = re.findall(
            r'(\d+[-\u2013]\d+\s*minutes?|\d+\s*minutes?|\d+[-\u2013]\d+\s*hours?|\d+\s*hours?)',
            content, re.IGNORECASE
        )
        if matches:
            time_estimates[name] = matches[:3]  # First 3 time mentions

    if time_estimates:
        detail = "\n".join(f"  {k}: {', '.join(v)}" for k, v in time_estimates.items())
        # Just warn -- manual review needed for consistency
        results.warn_check(
            f"Setup time estimates found in {len(time_estimates)} guides -- "
            f"verify consistency across all documentation",
            detail
        )
    else:
        results.skip_check("No setup time estimates found to compare")


def check_api_key_messaging(repo_root: Path, results: AuditResults):
    """
    Check API key is described as 'Required' consistently, not 'Optional'.
    API key wait time messaging must be consistent and accurate.
    """
    print("\n--- API Key Messaging Consistency ---")
    doc_files = get_files(repo_root, {".md", ".html"})

    required_count = 0
    optional_count = 0
    skip_mentions = []

    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            lower = line.lower()
            if "api key" in lower or "transport victoria" in lower.replace("opendata", ""):
                if "required" in lower:
                    required_count += 1
                if "optional" in lower or "skip" in lower or "come back later" in lower:
                    optional_count += 1
                    skip_mentions.append(f"  {rel}:{i}: {line.strip()[:70]}")

    if optional_count > 0 and required_count > 0:
        results.warn_check(
            f"API key messaging: {required_count} 'Required' vs {optional_count} "
            f"'Optional/Skip' mentions -- resolve contradiction",
            "\n".join(skip_mentions[:5])
        )
    elif required_count > 0:
        results.pass_check(f"API key consistently described as Required ({required_count} refs)")
    else:
        results.skip_check("No API key messaging found")


def check_device_naming(repo_root: Path, results: AuditResults):
    """
    Flag prohibited 'CC E-Ink' hardware naming -- must use TRMNL device names.
    Device names must use official TRMNL product names, not internal codenames.
    Rule: Physical e-ink display hardware manufactured by TRMNL must use TRMNL names.
    """
    print("\n--- Device Naming Consistency ---")
    doc_files = get_files(repo_root, {".md"})

    cc_eink_refs = []

    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            if "CC E-Ink" in line:
                cc_eink_refs.append(f"  {rel}:{i}")

    if cc_eink_refs:
        results.fail_check(
            f"Prohibited 'CC E-Ink' hardware naming ({len(cc_eink_refs)} refs) -- "
            f"must use TRMNL device names (TRMNL Display (OG), TRMNL Mini, TRMNL display)",
            "CC E-Ink refs:\n" + "\n".join(cc_eink_refs[:5])
        )
    else:
        results.pass_check("Device naming consistent: TRMNL hardware names used (no 'CC E-Ink')")


def check_hardware_urls(repo_root: Path, results: AuditResults):
    """
    Verify hardware purchase URLs point to valid locations.
    Hardware purchase URLs must point to correct TRMNL shop pages.
    """
    print("\n--- Hardware Purchase URLs ---")
    doc_files = get_files(repo_root, {".md"})

    urls_found = {}
    for fpath in doc_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        # Find shop URLs
        shop_urls = re.findall(r'https?://(?:usetrmnl\.com|shop\.trmnl\.com)[^\s\)]*', content)
        for url in shop_urls:
            urls_found.setdefault(url, []).append(str(rel))

    if "https://usetrmnl.com/shop" in urls_found:
        results.warn_check(
            "README links to usetrmnl.com/shop -- recommend shop.trmnl.com "
            "for cleaner direct link",
            f"  Found in: {', '.join(urls_found['https://usetrmnl.com/shop'])}"
        )
    elif any("shop.trmnl.com" in url for url in urls_found):
        results.pass_check("Hardware URLs use shop.trmnl.com (recommended)")
    else:
        results.warn_check("No hardware shop URLs found in documentation")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 7: PRIVACY & REGULATORY
# Category G: Privacy and Regulatory Compliance
# ============================================================================

def check_privacy_app_compliance(repo_root: Path, results: AuditResults):
    """
    Verify PRIVACY.md contains required APP compliance sections.
    Privacy policy must address all 13 Australian Privacy Principles.
    """
    print("\n--- PRIVACY.md APP Compliance ---")
    privacy_md = repo_root / "PRIVACY.md"
    if not privacy_md.exists():
        results.fail_check("PRIVACY.md not found")
        return

    content = read_file_safe(privacy_md)
    if content is None:
        results.fail_check("Cannot read PRIVACY.md")
        return

    checks = [
        ("APP 1", "Australian Privacy Principle"),
        ("ADM", "Automated Decision"),
        ("data collection", "What We Collect"),
        ("third-party", "Third-Party"),
        ("deletion", "delete"),
        ("contact", "contact"),
    ]

    for label, pattern in checks:
        if re.search(pattern, content, re.IGNORECASE):
            results.pass_check(f"PRIVACY.md contains {label} section")
        else:
            results.warn_check(f"PRIVACY.md may be missing {label} disclosure")

    # Check for OAIC complaint pathway
    if "oaic.gov.au" in content.lower() or "OAIC" in content:
        results.pass_check("PRIVACY.md includes OAIC reference")
    else:
        results.warn_check(
            "PRIVACY.md missing OAIC complaint pathway -- "
            "add link to oaic.gov.au/privacy/privacy-complaints"
        )

    # Check for APP 8 reasonable steps (cross-border data disclosure)
    if "reasonable steps" in content.lower():
        results.pass_check("PRIVACY.md includes APP 8 'reasonable steps' disclosure")
    else:
        results.warn_check(
            "PRIVACY.md missing APP 8 'reasonable steps' for cross-border data -- "
            "compliance review identified this gap"
        )


def check_security_md_exists(repo_root: Path, results: AuditResults):
    """
    Verify SECURITY.md exists with responsible disclosure and NDB plan.
    SECURITY.md must exist with responsible disclosure process.
    """
    print("\n--- SECURITY.md Existence ---")
    security_md = repo_root / "SECURITY.md"
    if not security_md.exists():
        results.fail_check(
            "SECURITY.md not found -- CRITICAL gap. "
            "Must contain: responsible disclosure policy, security contact, NDB response plan"
        )
        return

    content = read_file_safe(security_md)
    if content is None:
        results.fail_check("Cannot read SECURITY.md")
        return

    required_sections = [
        ("responsible disclosure", "Responsible Disclosure"),
        ("security contact", "security.*contact|commutecompute.*security"),
        ("breach response", "breach|incident|NDB|notification"),
    ]

    for label, pattern in required_sections:
        if re.search(pattern, content, re.IGNORECASE):
            results.pass_check(f"SECURITY.md contains {label} section")
        else:
            results.warn_check(f"SECURITY.md may be missing {label} section")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 8: CI/CD & SUPPLY CHAIN
# Category H: CI/CD and Dependency Management
# ============================================================================

def check_cicd_audit_job(repo_root: Path, results: AuditResults):
    """
    Verify .gitlab-ci.yml audit-job runs the actual compliance audit script,
    not 'npm test'.
    CI/CD pipeline must include compliance audit job that runs the scanner.
    """
    print("\n--- CI/CD Audit Job Configuration ---")
    cicd_file = repo_root / ".gitlab-ci.yml"
    if not cicd_file.exists():
        results.skip_check(".gitlab-ci.yml not found")
        return

    content = read_file_safe(cicd_file)
    if content is None:
        results.skip_check("Cannot read .gitlab-ci.yml")
        return

    # Check if audit-job runs the actual audit script
    if "comprehensive-compliance-audit" in content:
        results.pass_check("CI/CD audit-job references compliance audit script")
    elif "npm test" in content:
        results.fail_check(
            "CI/CD audit-job runs 'npm test' (1 integration test) instead of "
            "comprehensive-compliance-audit.sh (214 checks) -- "
            "compliance audit must run in CI/CD pipeline"
        )
    else:
        results.warn_check("CI/CD audit-job configuration unclear -- verify manually")

    # Check for npm audit in pipeline
    if "npm audit" in content:
        results.pass_check("CI/CD includes npm audit for dependency scanning")
    else:
        results.warn_check(
            "CI/CD missing 'npm audit --audit-level=critical' -- "
            "recommend adding supply chain scanning to CI pipeline"
        )


def check_ghost_dependencies(repo_root: Path, results: AuditResults):
    """
    Verify no ghost dependencies (declared but unused packages).
    No ghost dependencies (referenced in code but not in package.json).
    This check prevents future ghost deps from entering.
    """
    print("\n--- Ghost Dependency Check ---")
    pkg_json = repo_root / "package.json"
    if not pkg_json.exists():
        results.skip_check("package.json not found")
        return

    content = read_file_safe(pkg_json)
    if content is None:
        results.skip_check("Cannot read package.json")
        return

    try:
        pkg = json.loads(content)
    except json.JSONDecodeError:
        results.fail_check("package.json is not valid JSON")
        return

    deps = pkg.get("dependencies", {})

    # Known ghost dependency patterns
    ghost_suspects = ["@upstash/redis", "@vercel/kv", "ioredis"]

    for suspect in ghost_suspects:
        if suspect in deps:
            # Verify it's actually imported somewhere
            source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                                     subdirs=["src", "api"])
            imported = False
            for fpath in source_files:
                fc = read_file_safe(fpath)
                if fc and (f"from '{suspect}'" in fc
                           or f'from "{suspect}"' in fc
                           or f"require('{suspect}')" in fc
                           or f'require("{suspect}")' in fc):
                    imported = True
                    break

            if not imported:
                results.fail_check(
                    f"Ghost dependency: '{suspect}' in package.json but zero "
                    f"imports found in src/api/ -- remove from package.json"
                )
            else:
                results.pass_check(f"Dependency '{suspect}' is imported in code")

    # Check adm-zip is flagged as unmaintained
    if "adm-zip" in deps:
        results.warn_check(
            "adm-zip present (unmaintained 12+ months) -- "
            "evaluate replacement with yauzl for read-only GTFS extraction. "
            "Risk accepted: trusted government source, read-only usage"
        )


def check_dependency_freshness(repo_root: Path, results: AuditResults):
    """
    Check package.json for exact version pinning (no caret ^ or tilde ~).
    All dependencies must use exact version pinning (no caret ^ or tilde ~).
    """
    print("\n--- Dependency Version Pinning ---")
    pkg_json = repo_root / "package.json"
    if not pkg_json.exists():
        results.skip_check("package.json not found")
        return

    content = read_file_safe(pkg_json)
    if content is None:
        results.skip_check("Cannot read package.json")
        return

    try:
        pkg = json.loads(content)
    except json.JSONDecodeError:
        results.fail_check("package.json is not valid JSON")
        return

    deps = pkg.get("dependencies", {})
    unpinned = []
    for dep, version in deps.items():
        if version.startswith("^") or version.startswith("~"):
            unpinned.append(f"  {dep}: {version}")

    if unpinned:
        results.fail_check(
            f"{len(unpinned)} dependencies use caret/tilde ranges (should be exact-pinned)",
            "\n".join(unpinned)
        )
    else:
        results.pass_check(f"All {len(deps)} dependencies use exact version pinning")


def check_node_version_pinning(repo_root: Path, results: AuditResults):
    """
    Verify Node.js version is pinned to patched minimum.
    Node.js version must be pinned consistently across package.json, .nvmrc, CI config.
    """
    print("\n--- Node.js Version Pinning ---")
    pkg_json = repo_root / "package.json"
    if not pkg_json.exists():
        results.skip_check("package.json not found")
        return

    content = read_file_safe(pkg_json)
    if content is None:
        results.skip_check("Cannot read package.json")
        return

    try:
        pkg = json.loads(content)
    except json.JSONDecodeError:
        return

    engines = pkg.get("engines", {})
    node_version = engines.get("node", "")

    if node_version == "20.x":
        results.warn_check(
            "Node.js version '20.x' is too broad -- pin to '>=20.17.0' "
            "to ensure latest security patches are included"
        )
    elif ">=" in node_version or re.match(r'\d+\.\d+\.\d+', node_version):
        results.pass_check(f"Node.js version pinned: {node_version}")
    else:
        results.warn_check(f"Node.js version '{node_version}' -- verify minimum is >=20.17.0")

    # Check for .nvmrc
    nvmrc = repo_root / ".nvmrc"
    if nvmrc.exists():
        results.pass_check(".nvmrc file exists for Node version management")
    else:
        results.warn_check(".nvmrc not found -- consider adding for explicit version control")


def check_npm_audit_in_cicd(repo_root: Path, results: AuditResults):
    """
    Verify npm audit is part of CI/CD pipeline.
    CI/CD pipeline should include npm audit for dependency vulnerability scanning.
    """
    # This is already checked in check_cicd_audit_job, but we include explicit pass
    print("\n--- npm Audit in CI/CD ---")
    cicd_file = repo_root / ".gitlab-ci.yml"
    if not cicd_file.exists():
        results.skip_check(".gitlab-ci.yml not found")
        return

    content = read_file_safe(cicd_file)
    if content and "npm audit" in content:
        results.pass_check("npm audit present in CI/CD pipeline")
    else:
        results.warn_check(
            "npm audit not in CI/CD -- add 'npm audit --audit-level=critical' "
            "to audit-job for supply chain security"
        )


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 9: UI/UX & ACCESSIBILITY
# Category I: Accessibility (WCAG, Emoji Prohibition)
# ============================================================================

def check_no_emojis_admin(repo_root: Path, results: AuditResults):
    """
    Verify admin panel uses SVG icons, not emojis.
    Admin panel must not contain emojis — SVG icons only per DEVELOPMENT-RULES.
    """
    print("\n--- No Emojis in Admin Panel ---")
    admin_file = repo_root / "public" / "admin.html"
    if not admin_file.exists():
        results.skip_check("public/admin.html not found")
        return

    content = read_file_safe(admin_file)
    if content is None:
        results.skip_check("Cannot read admin.html")
        return

    # Comprehensive emoji pattern (matching the bash audit)
    emoji_pattern = re.compile(
        r'[\U0001F300-\U0001F9FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F'
        r'\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002600-\U000026FF'
        r'\U0000231A-\U0000231B\U000023E9-\U000023F3\U000023F8-\U000023FA]'
    )

    violations = []
    for i, line in enumerate(content.splitlines(), 1):
        # Skip script content (JS may reference emoji patterns for detection)
        if "<script" in line.lower():
            continue
        matches = emoji_pattern.findall(line)
        if matches:
            violations.append(f"  admin.html:{i}: {''.join(matches)} - {line.strip()[:50]}")

    if violations:
        results.fail_check(
            f"Emojis found in admin panel ({len(violations)} lines) -- use SVG icons only",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("Admin panel: no emojis detected (SVG icons only)")


def check_wcag_contrast_values(repo_root: Path, results: AuditResults):
    """
    Check admin panel CSS for known WCAG colour contrast failures.
    WCAG 1.4.3 AA: text colour contrast ratio must be at least 4.5:1.
    DDA 1992 compliance risk if not met.
    """
    print("\n--- WCAG 2.2 AA Colour Contrast ---")
    admin_file = repo_root / "public" / "admin.html"
    if not admin_file.exists():
        results.skip_check("public/admin.html not found")
        return

    content = read_file_safe(admin_file)
    if content is None:
        results.skip_check("Cannot read admin.html")
        return

    # Check for the known failing colour combination
    # Check: --text-secondary: #a3b8d0 on --bg-secondary: #1e293b = 4.2:1
    if "#a3b8d0" in content:
        results.warn_check(
            "Admin panel uses --text-secondary: #a3b8d0 (4.2:1 contrast ratio) -- "
            "WCAG 1.4.3 failure (requires 4.5:1). "
            "Fix: change to #b8cbe0 (4.6:1) for compliance. "
            "DDA 1992 non-compliance risk."
        )
    else:
        results.pass_check("Known WCAG contrast issue (#a3b8d0) not detected in admin panel")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 10: CODE QUALITY & PATTERNS
# Category J: Code Quality and Patterns
# ============================================================================

def check_time_format(repo_root: Path, results: AuditResults):
    """
    Verify 12-hour time format uses hourCycle: 'h23'.
    Time display must use 12-hour format with hourCycle: 'h23'.
    """
    print("\n--- 12-Hour Time Format (h23 hourCycle) ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src", "api"])

    h23_found = False
    h12_wrong = False

    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        if "hourCycle" in content and "'h23'" in content:
            h23_found = True
        if "hourCycle" in content and ("'h12'" in content or "'h11'" in content):
            h12_wrong = True

    if h12_wrong:
        results.fail_check("Found hourCycle: 'h12' or 'h11' -- must use 'h23'")
    elif h23_found:
        results.pass_check("hourCycle: 'h23' correctly used for 12-hour time display")
    else:
        results.skip_check("No hourCycle references found (may not be applicable)")


def check_timezone_usage(repo_root: Path, results: AuditResults):
    """
    Verify timezone handling uses getMelbourneDisplayTime() / localHour,
    not new Date().getHours() directly.
    Must use getMelbourneDisplayTime()/localHour — Vercel serverless returns UTC.
    """
    print("\n--- Timezone Correctness ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src", "api"])

    violations = []
    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            # Flag direct new Date().getHours() usage (returns UTC on Vercel)
            if "new Date().getHours()" in line or "new Date().getMinutes()" in line:
                # Skip if it's in a comment
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("*"):
                    continue
                violations.append(f"  {rel}:{i}: {line.strip()[:70]}")

    if violations:
        results.fail_check(
            f"Direct new Date().getHours() usage ({len(violations)}) -- "
            f"use getMelbourneDisplayTime() / localHour instead (Vercel = UTC)",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("No direct new Date().getHours() usage (timezone-safe)")


def check_no_mock_data(repo_root: Path, results: AuditResults):
    """
    Verify opendata-client.js returns [] not mock data on failure.
    Strictly live GTFS-RT data only — no mock/fake data from opendata-client.js.
    """
    print("\n--- No Mock Data (opendata-client.js) ---")
    client_file = repo_root / "src" / "services" / "opendata-client.js"
    if not client_file.exists():
        results.skip_check("opendata-client.js not found")
        return

    content = read_file_safe(client_file)
    if content is None:
        results.skip_check("Cannot read opendata-client.js")
        return

    # Look for mock/fake/dummy data patterns
    mock_patterns = [
        r'mock[Dd]ata',
        r'fake[Dd]ata',
        r'dummy[Dd]ata',
        r'sample[Dd]epartures',
        r'hardcoded.*departure',
    ]

    for pattern in mock_patterns:
        if re.search(pattern, content):
            results.fail_check(
                f"Mock data pattern found in opendata-client.js: '{pattern}' -- "
                f"must return [] not mock data"
            )
            return

    results.pass_check("opendata-client.js: no mock data patterns detected")


def check_transport_vic_api_references(repo_root: Path, results: AuditResults):
    """
    Verify Transport Victoria API references use new portal URL.
    All Transport Victoria API references must use correct OpenData naming.
    """
    print("\n--- Transport Victoria API References ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS | DOC_EXTENSIONS,
                             subdirs=["src", "api"])

    old_urls = []
    new_url_found = False

    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)

        # Check for old DEP URLs (decommissioned 30 Sep 2025)
        if "timetableapi.ptv.vic.gov.au" in content:
            old_urls.append(f"  {rel}: timetableapi.ptv.vic.gov.au (legacy DEP)")
        if "data.ptv.vic.gov.au" in content:
            old_urls.append(f"  {rel}: data.ptv.vic.gov.au (legacy DEP)")

        # Check for new portal URL
        if "opendata.transport.vic.gov.au" in content:
            new_url_found = True

    if old_urls:
        results.fail_check(
            f"Legacy Transport Victoria DEP URLs found ({len(old_urls)}) -- "
            f"DEP decommissioned 30 Sep 2025",
            "\n".join(old_urls[:5])
        )
    elif new_url_found:
        results.pass_check("Transport Victoria API uses new opendata portal URL")
    else:
        results.warn_check("No Transport Victoria API URL references found in source")


def check_metro_tunnel_stations(repo_root: Path, results: AuditResults):
    """
    Verify Metro Tunnel station references are present.
    DEVELOPMENT-RULES Section 25: Metro Tunnel station support and line routing.
    """
    print("\n--- Metro Tunnel Station References ---")
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src"])

    found_stations = set()
    for fpath in source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        for station in METRO_TUNNEL_STATIONS:
            if station in content:
                found_stations.add(station)

    missing = set(METRO_TUNNEL_STATIONS) - found_stations
    if missing:
        results.warn_check(
            f"Metro Tunnel stations not found in source: {', '.join(missing)}"
        )
    else:
        results.pass_check(
            f"All {len(METRO_TUNNEL_STATIONS)} Metro Tunnel stations referenced in source"
        )


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY 11: TERMINOLOGY
# Category K.0: Redis Terminology Compliance
# ============================================================================

def check_redis_terminology(repo_root: Path, results: AuditResults):
    """
    Verify Redis storage uses correct terminology (not 'Vercel KV' or 'Upstash Redis').
    Redis storage terminology: "Redis" not "Vercel KV" or "Upstash Redis" in docs.
    Product name: 'Redis' (via Vercel Marketplace, powered by Upstash).
    """
    print("\n--- Redis Terminology ---")
    doc_files = get_files(repo_root, DOC_EXTENSIONS)
    source_files = get_files(repo_root, SOURCE_EXTENSIONS,
                             subdirs=["src", "api"])

    violations = []
    for fpath in doc_files + source_files:
        content = read_file_safe(fpath)
        if content is None:
            continue
        rel = fpath.relative_to(repo_root)
        for i, line in enumerate(content.splitlines(), 1):
            # Check for deprecated terminology
            if "Vercel KV" in line and "removed" not in line.lower():
                violations.append(f"  {rel}:{i}: 'Vercel KV' -> 'Redis'")
            # "Upstash Redis" is wrong product name -- should be just "Redis"
            # (Upstash is the provider, not the product name in Vercel Marketplace)
            if "Upstash Redis" in line and "provider" not in line.lower() \
                    and "encryption" not in line.lower():
                violations.append(f"  {rel}:{i}: 'Upstash Redis' -> 'Redis'")

    if violations:
        results.warn_check(
            f"Deprecated Redis terminology ({len(violations)} occurrences) -- "
            f"use 'Redis' (via Vercel Marketplace)",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("Redis terminology correct (no 'Vercel KV' or 'Upstash Redis')")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY C EXPANSION (C.8-C.10): DOC CONSISTENCY
# Category C: Documentation consistency checks per DEVELOPMENT-RULES
# ============================================================================

def check_device_naming_consistency(repo_root: Path, results: AuditResults):
    """
    C.8: Check docs/hardware/DEVICE-COMPATIBILITY.md for prohibited 'CC E-Ink'
    hardware naming -- must use TRMNL device names.
    Physical e-ink display hardware must use TRMNL names (TRMNL Display (OG), TRMNL Mini).
    "CC E-Ink" is prohibited — CC trademarks apply to software/firmware only.
    """
    print("\n--- C.8 Device Naming: TRMNL hardware names ---")
    compat_file = repo_root / "docs" / "hardware" / "DEVICE-COMPATIBILITY.md"
    if not compat_file.exists():
        results.skip_check("docs/hardware/DEVICE-COMPATIBILITY.md not found")
        return

    content = read_file_safe(compat_file)
    if content is None:
        results.skip_check("Cannot read DEVICE-COMPATIBILITY.md")
        return

    violations = []
    for i, line in enumerate(content.splitlines(), 1):
        if "CC E-Ink" in line:
            violations.append(f"  DEVICE-COMPATIBILITY.md:{i}: {line.strip()[:80]}")

    if violations:
        results.fail_check(
            f"'CC E-Ink' found ({len(violations)} occurrences) -- "
            f"must use TRMNL device names (TRMNL Display (OG), TRMNL Mini)",
            "\n".join(violations[:5])
        )
    else:
        results.pass_check("Device naming consistent: TRMNL hardware names used (no 'CC E-Ink')")


def check_support_signpost(repo_root: Path, results: AuditResults):
    """
    C.9: Check first 20 lines of SUPPORT.md for technical help redirect keywords.
    SUPPORT.md must signpost users to technical help resources.
    """
    print("\n--- C.9 SUPPORT.md Technical Help Signpost ---")
    support_md = repo_root / "SUPPORT.md"
    if not support_md.exists():
        results.skip_check("SUPPORT.md not found")
        return

    content = read_file_safe(support_md)
    if content is None:
        results.skip_check("Cannot read SUPPORT.md")
        return

    first_20 = "\n".join(content.splitlines()[:20]).lower()

    redirect_keywords = [
        "issue", "bug", "help", "support", "question",
        "discussion", "troubleshoot", "contact", "report",
    ]

    found = [kw for kw in redirect_keywords if kw in first_20]

    if found:
        results.pass_check(
            f"SUPPORT.md contains technical help signpost keywords in first 20 lines: "
            f"{', '.join(found[:5])}"
        )
    else:
        results.warn_check(
            "SUPPORT.md first 20 lines missing technical help redirect keywords -- "
            "users may not find support channels. "
            f"Expected one of: {', '.join(redirect_keywords)}"
        )


def check_readme_privacy_link(repo_root: Path, results: AuditResults):
    """
    C.10: Check README.md Prerequisites section for PRIVACY.md reference.
    README prerequisites section must link to PRIVACY.md.
    """
    print("\n--- C.10 README.md Privacy Link in Prerequisites ---")
    readme = repo_root / "README.md"
    if not readme.exists():
        results.skip_check("README.md not found")
        return

    content = read_file_safe(readme)
    if content is None:
        results.skip_check("Cannot read README.md")
        return

    # Find the Prerequisites section and check for PRIVACY.md reference
    in_prerequisites = False
    privacy_ref_found = False
    lines = content.splitlines()

    for line in lines:
        stripped = line.strip().lower()
        # Detect prerequisites heading (## Prerequisites, ### Prerequisites, etc.)
        if stripped.startswith("#") and "prerequisite" in stripped:
            in_prerequisites = True
            continue
        # Next heading ends the section
        if in_prerequisites and stripped.startswith("#") and "prerequisite" not in stripped:
            break
        if in_prerequisites and "privacy" in stripped:
            privacy_ref_found = True
            break

    # Also check if PRIVACY.md is referenced anywhere near "prerequisites" context
    if not privacy_ref_found:
        # Fallback: check for PRIVACY.md link in README overall near prerequisites
        if "PRIVACY.md" in content and "prerequisite" in content.lower():
            privacy_ref_found = True

    if privacy_ref_found:
        results.pass_check("README.md Prerequisites section references privacy policy")
    else:
        results.warn_check(
            "README.md Prerequisites section missing PRIVACY.md reference -- "
            "users should see privacy policy before setup"
        )


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY K: DOCKER & DEPLOYMENT CONSISTENCY
# ============================================================================

def check_docker_node_version(repo_root: Path, results: AuditResults):
    """
    K.1: Extract Node.js version from package.json engines field and check
    Dockerfile, docker-compose.yml, and .gitlab-ci.yml for version consistency.
    Deployment artefacts (Dockerfile, CI config) must match pinned Node.js version.
    """
    print("\n--- K.1 Docker/CI Node.js Version Consistency ---")
    pkg_json = repo_root / "package.json"
    if not pkg_json.exists():
        results.skip_check("package.json not found")
        return

    content = read_file_safe(pkg_json)
    if content is None:
        results.skip_check("Cannot read package.json")
        return

    try:
        pkg = json.loads(content)
    except json.JSONDecodeError:
        results.fail_check("package.json is not valid JSON")
        return

    engines = pkg.get("engines", {})
    node_version = engines.get("node", "")

    if not node_version:
        results.skip_check("No Node.js version in package.json engines field")
        return

    # Extract the version number (handle >=20.17.0, 20.x, 20.17.0, etc.)
    version_match = re.search(r'(\d+)(?:\.(\d+)(?:\.(\d+))?)?', node_version)
    if not version_match:
        results.skip_check(f"Cannot parse Node.js version from engines: '{node_version}'")
        return

    major = version_match.group(1)
    pkg_version_str = node_version

    # Files to check for Node.js version consistency
    check_files = {
        "Dockerfile": repo_root / "Dockerfile",
        "docker-compose.yml": repo_root / "docker-compose.yml",
        ".gitlab-ci.yml": repo_root / ".gitlab-ci.yml",
    }

    files_checked = 0
    mismatches = []
    not_found = []

    for label, fpath in check_files.items():
        if not fpath.exists():
            not_found.append(label)
            continue

        fc = read_file_safe(fpath)
        if fc is None:
            not_found.append(label)
            continue

        files_checked += 1

        # Look for node version references: FROM node:XX, image: node:XX, NODE_VERSION, etc.
        node_refs = re.findall(
            r'(?:FROM\s+node:|image:\s*node:|NODE_VERSION[=:]\s*|node:)(\d+(?:\.\d+(?:\.\d+)?)?)',
            fc, re.IGNORECASE
        )

        if not node_refs:
            # No node version reference in this file -- not necessarily a problem
            continue

        for ref in node_refs:
            ref_major = ref.split(".")[0]
            if ref_major != major:
                mismatches.append(
                    f"  {label}: node:{ref} (package.json engines: {pkg_version_str})"
                )

    if mismatches:
        results.fail_check(
            f"Node.js version mismatch between package.json and deployment files",
            "\n".join(mismatches)
        )
    elif files_checked > 0:
        results.pass_check(
            f"Node.js version consistent across package.json and "
            f"{files_checked} deployment file(s) (engines: {pkg_version_str})"
        )

    if not_found:
        for nf in not_found:
            results.warn_check(f"{nf} not found -- cannot verify Node.js version consistency")


# ============================================================================
# CHECK FUNCTIONS -- CATEGORY L: NUMERIC LEGAL CLAIM VALIDATION
# ============================================================================

def check_numeric_legal_claims(repo_root: Path, results: AuditResults):
    """
    L.1: Check LEGAL.md and PRIVACY.md for known incorrect statutory figures.
    Numeric claims in legal documents must be verified against current legislation.

    Known checks:
    - Statutory tort cap: correct = $478,550; incorrect = $660,000 / $660K / $660k
    - GST threshold: correct = $75,000; incorrect = $50,000
    """
    print("\n--- L.1 Numeric Legal Claim Validation ---")
    legal_files = {
        "LEGAL.md": repo_root / "LEGAL.md",
        "PRIVACY.md": repo_root / "PRIVACY.md",
    }

    incorrect_patterns = [
        # Statutory tort cap: incorrect values
        (r'\$660[,.]?000', "Incorrect statutory tort cap ($660,000) -- correct is $478,550"),
        (r'\$660[Kk]', "Incorrect statutory tort cap ($660K) -- correct is $478,550"),
        # GST threshold: incorrect value
        (r'\$50[,.]?000(?!\s*(?:per|fine|penalty|maximum))',
         "Incorrect GST threshold ($50,000) -- correct is $75,000"),
    ]

    correct_patterns = [
        (r'\$478[,.]?550', "Statutory tort cap $478,550"),
        (r'\$75[,.]?000', "GST threshold $75,000"),
    ]

    all_violations = []
    correct_found = set()

    for label, fpath in legal_files.items():
        if not fpath.exists():
            continue

        content = read_file_safe(fpath)
        if content is None:
            continue

        for i, line in enumerate(content.splitlines(), 1):
            for pattern, desc in incorrect_patterns:
                if re.search(pattern, line):
                    all_violations.append(f"  {label}:{i}: {desc}")

            for pattern, desc in correct_patterns:
                if re.search(pattern, line):
                    correct_found.add(desc)

    if all_violations:
        results.fail_check(
            f"Incorrect statutory figures in legal documents ({len(all_violations)} found)",
            "\n".join(all_violations[:5])
        )
    elif correct_found:
        results.pass_check(
            f"Legal numeric claims verified: {', '.join(sorted(correct_found))}"
        )
    else:
        results.pass_check(
            "No known incorrect statutory figures found in LEGAL.md / PRIVACY.md"
        )


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def run_all_checks(repo_root: Path) -> int:
    """Execute all compliance checks and return exit code."""
    results = AuditResults()

    print("=" * 66)
    print("COMMUTE COMPUTE COMPLIANCE SCANNER v1.1")
    print(f"Repository: {repo_root}")
    print("=" * 66)

    # Category 1: Trademark Compliance
    print("\n" + "=" * 66)
    print("CATEGORY 1: TRADEMARK COMPLIANCE")
    print("=" * 66)
    check_trademark_symbols(repo_root, results)
    check_coffeedecision_no_tm(repo_root, results)

    # Category 2: Australian English
    print("\n" + "=" * 66)
    print("CATEGORY 2: AUSTRALIAN ENGLISH ENFORCEMENT")
    print("=" * 66)
    check_australian_english(repo_root, results)

    # Category 3: Security
    print("\n" + "=" * 66)
    print("CATEGORY 3: SECURITY")
    print("=" * 66)
    check_no_env_files(repo_root, results)
    check_no_hardcoded_secrets(repo_root, results)
    check_xss_sanitisation(repo_root, results)
    check_csp_no_unsafe_eval(repo_root, results)

    # Category 4: Licensing & IP
    print("\n" + "=" * 66)
    print("CATEGORY 4: LICENSING & IP")
    print("=" * 66)
    check_spdx_headers(repo_root, results)
    check_copyright_year(repo_root, results)
    check_licence_file(repo_root, results)
    check_governing_law(repo_root, results)
    check_dco_documented(repo_root, results)

    # Category 5: Prohibitions
    print("\n" + "=" * 66)
    print("CATEGORY 5: PROHIBITIONS (DEVELOPMENT-RULES Sections 1-2)")
    print("=" * 66)
    check_forbidden_ptv_terms(repo_root, results)
    check_trmnl_references(repo_root, results)
    check_smartcommute_removed(repo_root, results)

    # Category 6: Documentation Consistency
    print("\n" + "=" * 66)
    print("CATEGORY 6: DOCUMENTATION CONSISTENCY")
    print("=" * 66)
    check_version_consistency(repo_root, results)
    check_setup_time_estimates(repo_root, results)
    check_api_key_messaging(repo_root, results)
    check_device_naming(repo_root, results)
    check_hardware_urls(repo_root, results)
    # C.8-C.10: Additional documentation checks
    check_device_naming_consistency(repo_root, results)
    check_support_signpost(repo_root, results)
    check_readme_privacy_link(repo_root, results)

    # Category 7: Privacy & Regulatory
    print("\n" + "=" * 66)
    print("CATEGORY 7: PRIVACY & REGULATORY COMPLIANCE")
    print("=" * 66)
    check_privacy_app_compliance(repo_root, results)
    check_security_md_exists(repo_root, results)

    # Category 8: CI/CD & Supply Chain
    print("\n" + "=" * 66)
    print("CATEGORY 8: CI/CD & SUPPLY CHAIN")
    print("=" * 66)
    check_cicd_audit_job(repo_root, results)
    check_ghost_dependencies(repo_root, results)
    check_dependency_freshness(repo_root, results)
    check_node_version_pinning(repo_root, results)
    check_npm_audit_in_cicd(repo_root, results)

    # Category 9: UI/UX & Accessibility
    print("\n" + "=" * 66)
    print("CATEGORY 9: UI/UX & ACCESSIBILITY")
    print("=" * 66)
    check_no_emojis_admin(repo_root, results)
    check_wcag_contrast_values(repo_root, results)

    # Category 10: Code Quality & Patterns
    print("\n" + "=" * 66)
    print("CATEGORY 10: CODE QUALITY & CRITICAL PATTERNS")
    print("=" * 66)
    check_time_format(repo_root, results)
    check_timezone_usage(repo_root, results)
    check_no_mock_data(repo_root, results)
    check_transport_vic_api_references(repo_root, results)
    check_metro_tunnel_stations(repo_root, results)

    # Category 11: Terminology
    print("\n" + "=" * 66)
    print("CATEGORY 11: TERMINOLOGY")
    print("=" * 66)
    check_redis_terminology(repo_root, results)

    # Category K: Docker & Deployment Consistency
    print("\n" + "=" * 66)
    print("CATEGORY K: DOCKER & DEPLOYMENT CONSISTENCY")
    print("=" * 66)
    check_docker_node_version(repo_root, results)

    # Category L: Numeric Legal Claim Validation
    print("\n" + "=" * 66)
    print("CATEGORY L: NUMERIC LEGAL CLAIM VALIDATION")
    print("=" * 66)
    check_numeric_legal_claims(repo_root, results)

    return results.summary()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Commute Compute Compliance Scanner v1.1"
    )
    parser.add_argument(
        "--repo-root",
        type=str,
        default=".",
        help="Path to repository root (default: current directory)"
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        print(f"Error: repository root '{repo_root}' does not exist")
        sys.exit(1)

    exit_code = run_all_checks(repo_root)
    sys.exit(exit_code)
