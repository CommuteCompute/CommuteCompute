<p align="center">
  <img src="../../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ Testing Guide
**MANDATORY COMPLIANCE DOCUMENT**
**Created**: 2026-01-28
**Version**: 1.0.0
**Status**: [LOCKED] - Approved by Angus Bergman

---

## [WARNING] CRITICAL: Testing Requirements

**All testing MUST follow these explicit instructions. No exceptions.**

---

## 1. SIMULATOR-SERVER LIVE PAIRING

**MANDATORY**: The device simulator hosted at `/simulator.html` MUST be live-paired to the Vercel server.

**Requirements**:
- Simulator reflects **real-time data** from server
- Any firmware flash action is visible in simulator
- Setup wizard progress is visible in simulator
- Admin page operations are reflected in simulator
- Data population flows: **Flashing → Setup Wizard → Admin → Live Operation**

**Verification**:
- Open `https://your-project.vercel.app/simulator.html` before any testing
- Confirm simulator responds to server state changes
- All actions must be watchable in real-time

---

## 2. E-INK DISPLAY COMPLIANCE

**MANDATORY**: All device firmware and display content must be **1-bit black and white e-ink compatible**.

**Requirements**:
- [YES] **1-bit depth only** - Pure black (#000000) and white (#FFFFFF)
- [YES] **No grayscale** - No intermediate tones
- [YES] **No animations** - Static content only
- [YES] **No colors** - Monochrome only
- [YES] **Cross-referenced hardware** - Firmware must match internal/external hardware specs

**Prohibited**:
- [NO] RGB colors
- [NO] Grayscale values
- [NO] Animated transitions
- [NO] Fade effects
- [NO] Any content not displayable on 1-bit e-ink

---

## 3. SIMULATED FIRMWARE TESTING MODE

**MANDATORY**: When in testing mode, all firmware operations must be observable via `/simulator.html`.

**Testing Mode Protocol**:
1. **Observer** opens simulator
2. **Tester** confirms observer can see simulator
3. **Tester** proceeds with firmware flash
4. **Observer** watches flash progress in real-time
5. **Tester** proceeds through setup wizard
6. **Observer** confirms each setup step is visible
7. **Both** verify final dashboard state

---

## 4. V11 DASHBOARD REQUIREMENT

**MANDATORY**: After successful setup, device MUST display the **v11 locked dashboard** with correct live data.

---

## 5. MULTI-DEVICE SIMULATOR TESTING

**MANDATORY**: After successful single-device simulation testing, repeat with ALL devices in live simulator.

---

## 6. TESTING DOCUMENTATION REQUIREMENTS

**MANDATORY**: All testing must be fully recorded with screenshots at every stage.

---

## 7. ROUTE CALCULATION ACCURACY TESTING

**MANDATORY**: Random sampled devices and configurations must be tested for smart route calculation accuracy.

---

## 8. VIRTUAL TO PHYSICAL PROGRESSION

**MANDATORY**: All simulator testing must be complete before physical device testing.

---

## 9. APPROVAL AND NEXT STAGE

**MANDATORY**: Physical device verification must be approved before progressing.

---

**Version**: 1.0.0
**Author**: Development Team
**Approved By**: Angus Bergman
**Date**: 2026-01-28
**License**: AGPL-3.0 Dual License

---

## AUTOMATIC TESTING & CONTINUOUS AGENT PROTOCOL

**MANDATORY**: Testing agent must follow this automated testing protocol for all device simulations.

---

### Step 1: Screenshot & Visual Assessment (Per Device)

**After EACH successful flash, setup, boot, and dashboard:**

1. **Capture Screenshot** of the simulator screen
2. **Save Screenshot** to the testing log for that run
   - Location: `docs/testing/logs/[RUN-ID]/screenshots/`
   - Naming: `[DEVICE]-[STAGE]-[TIMESTAMP].png`
3. **Compare Screenshot** against:
   - V13 Dashboard Specification (`docs/V11-DESIGN-SPECIFICATION.md`)
   - Development Rules (`docs/development/DEVELOPMENT-RULES.md`)
   - Smart Journey Planner code (`src/services/journey-planner.js`)
4. **Visual Assessment**: Evaluate output against expected results
5. **Assign Success Score** (0-100%)
   - 100% = Perfect match to specification
   - 90-99% = Minor cosmetic issues
   - 70-89% = Functional but visual discrepancies
   - Below 70% = Requires fixes before proceeding

**Success Score Criteria**:
| Category | Weight | Criteria |
|----------|--------|----------|
| Layout Compliance | 25% | Matches V13 spec layout |
| Data Accuracy | 25% | Live data displayed correctly |
| Journey Display | 25% | All legs, icons, durations correct |
| E-ink Compliance | 15% | 1-bit B/W only, no artifacts |
| Typography | 10% | Correct fonts, sizes, positioning |

---

### Step 2: Multi-Device Simulation Testing

**For EACH compatible device:**

1. Load device-specific firmware simulation
2. Execute full testing cycle (flash → setup → boot → dashboard)
3. Perform Step 1 (screenshot & visual assessment)
4. Assign success score for that device
5. Record results in device-specific testing log

**Device Testing Order**:
1. TRMNL OG (800×480) - Primary target
2. Kindle 11 (1072×1448) - Portrait mode
3. Additional devices as applicable

---

### Step 3: Final Round Troubleshooting & Amendments

**Once ALL compatible devices have been tested:**

1. **Review** all success scores across devices
2. **Identify** common issues and device-specific problems
3. **Devise** troubleshooting steps and required amendments
4. **Document** in numbered final testing log:
   - Location: `docs/testing/logs/FINAL-TESTING-LOG-v[X].md`
   - Include: Issue description, root cause, proposed fix, affected devices
5. **Push** final testing log to repository

**Final Testing Log Format**:
```markdown
# Final Testing Log v[X]
## Date: [YYYY-MM-DD]
## Agent: Automated Testing

### Device Scores Summary
| Device | Score | Status |
|--------|-------|--------|
| TRMNL OG | XX% | [PASS/FAIL] |
| Kindle 11 | XX% | [PASS/FAIL] |

### Issues Identified
1. [Issue description]
   - Affected: [devices]
   - Root cause: [analysis]
   - Fix: [proposed solution]

### Amendments Required
- [ ] [Amendment 1]
- [ ] [Amendment 2]
```

---

### Step 4: Implement Fixes (If Score < 100%)

**If ANY device scores below 100%:**

1. **Implement** troubleshooting amendments from Step 3
2. **Update** relevant code files
3. **Commit** changes with descriptive message
4. **Push** to repository
5. **Document** changes in testing log

**Commit Message Format**:
```
fix(testing): [Brief description]

- Issue: [What was wrong]
- Fix: [What was changed]
- Affected: [Devices/files]
- Testing Log: v[X]
```

---

### Step 5: Repeat Until 100%

**MANDATORY**: Run Steps 1-4 in full until ALL devices reach 100% success score.

**Iteration Protocol**:
1. After implementing fixes (Step 4), return to Step 1
2. Re-test ALL devices (not just failed ones)
3. Generate new success scores
4. If any device < 100%, repeat Step 3-4
5. Continue iterations until all devices = 100%

**Iteration Tracking**:
- Each iteration increments Final Testing Log version
- Document iteration count in log header
- Maximum iterations before escalation: 5
- If 5 iterations reached without 100%, escalate to user

---

### Step 6: Automatic Testing Complete

**When ALL devices achieve 100% success score:**

1. **Confirm** all devices show 100% in final testing log
2. **Generate** completion summary
3. **Push** final testing log (marked as COMPLETE)
4. **Notify User**: "Automatic testing complete - ready for manual verification"
5. **Await** user instruction to begin manual verification phase

**Completion Notification Format**:
```
AUTOMATIC TESTING COMPLETE

All devices achieved 100% success score:
- TRMNL OG: 100% (PASS)
- Kindle 11: 100% (PASS)
- [Other devices]: 100% (PASS)

Iterations required: [X]
Final Testing Log: v[X]

Ready for manual verification. Awaiting your instruction.
```

---

### Testing Log Directory Structure

```
docs/testing/
├── TESTING-GUIDE.md
├── logs/
│   ├── FINAL-TESTING-LOG-v1.md
│   ├── FINAL-TESTING-LOG-v2.md
│   └── [RUN-ID]/
│       ├── screenshots/
│       │   ├── trmnl-og-flash-20260128-0830.png
│       │   ├── trmnl-og-setup-20260128-0831.png
│       │   ├── trmnl-og-dashboard-20260128-0832.png
│       │   └── ...
│       └── device-log.md
└── screenshots/
    └── [archived screenshots]
```

---

**Version**: 1.1.0
**Updated**: 2026-01-28
**Author**: Development Team
**Approved By**: Angus Bergman
