<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# CCDash™ Dashboard Scenarios

**Version:** 1.0  
**Last Updated:** 2026-01-30  
**Status:** Active  
**Copyright:** © 2026 Angus Bergman — AGPL-3.0 Dual License

---

## Overview

This document catalogs all dashboard scenarios supported by the CommuteCompute™ engine and CCDash™ renderer. Each scenario demonstrates how the system handles different real-world transit situations.

---

## Table of Contents

1. [Normal Scenarios](#1-normal-scenarios)
2. [Delay Scenarios](#2-delay-scenarios)
3. [Disruption Scenarios](#3-disruption-scenarios)
4. [Coffee Scenarios](#4-coffee-scenarios)
5. [Multi-Modal Scenarios](#5-multi-modal-scenarios)
6. [Special Service Scenarios](#6-special-service-scenarios)
7. [Weather Scenarios](#7-weather-scenarios)
8. [Time-Based Scenarios](#8-time-based-scenarios)

---

## 1. Normal Scenarios

### 1.1 Standard Morning Commute

![Normal Commute](images/scenario-normal-coffee.png)

**Trigger:** No delays, no disruptions, on schedule

**Visual Elements:**
- Solid black borders on all legs
- Status bar: `LEAVE NOW → Arrive X:XX`
- Total time shown on right

**Engine Logic:**
```
IF no_delays AND no_disruptions
  status = "LEAVE NOW"
  border_style = solid
  show_total_time = true
```

### 1.2 Leave Soon

**Trigger:** Departure in 2-15 minutes

**Visual Elements:**
- Status bar: `LEAVE IN X MIN → Arrive X:XX`
- Countdown updates every refresh

---

## 2. Delay Scenarios

### 2.1 Single Service Delay

**Trigger:** One service delayed

**Visual Elements:**
- Dashed border on delayed leg
- "+X MIN" shown on affected leg
- Status bar: `[DELAY] DELAY → Arrive X:XX (+X min)`

### 2.2 Multiple Delays

![Multiple Delays](images/scenario-multiple-delays.png)

**Trigger:** Two or more services delayed

**Visual Elements:**
- Dashed borders on all delayed legs
- Individual delay amounts shown
- Status bar: `[DELAY] DELAYS → Arrive X:XX (+X min)` (plural)

**Engine Logic:**
```
IF count(delayed_services) > 1
  status_icon = "[DELAY]"
  status_text = "DELAYS" (plural)
  total_delay = sum(individual_delays)
```

---

## 3. Disruption Scenarios

### 3.1 Service Suspended

![Disruption](images/scenario-disruption.png)

**Trigger:** Line suspended (signal fault, emergency, etc.)

**Visual Elements:**
- Diagonal stripe pattern (135°) on cancelled leg
- "CANCELLED" text replacing duration
- "[!] [LINE] SUSPENDED -- [Reason]" on leg
- Rail replacement bus automatically inserted
- Status bar: `[!] DISRUPTION → Arrive X:XX (+X min)`

**Engine Logic:**
```
IF service.status == "SUSPENDED"
  leg.pattern = diagonal_stripes
  leg.text = "CANCELLED"
  insert_replacement_bus()
  recalculate_journey()
```

### 3.2 Tram/Bus Diversion

![Diversion](images/scenario-diversion.png)

**Trigger:** Route diverted due to works/events

**Visual Elements:**
- Arrow prefix on service name: `← Tram 70 Diverted`
- Extra walking leg: `← Walk Around Diversion`
- Dashed borders on affected legs
- Status bar: `[!] TRAM DIVERSION → Arrive X:XX (+X min)`

**Engine Logic:**
```
IF service.status == "DIVERTED"
  service.name = "← " + service.name + " Diverted"
  insert_walk_leg("Walk Around Diversion")
  border_style = dashed
```

### 3.3 Service Cancellation (Single Trip)

**Trigger:** Specific service cancelled, others running

**Visual Elements:**
- Strikethrough on cancelled service
- Next available service shown
- Dashed border

---

## 4. Coffee Scenarios

### 4.1 Time for Coffee

![Coffee Time](images/scenario-normal-coffee.png)

**Trigger:** Sufficient buffer before target arrival

**Visual Elements:**
- Coffee leg with "✓ TIME FOR COFFEE" subtitle
- Coffee icon
- Duration shown as "~X MIN" (approximate)
- Solid border

**Engine Logic:**
```
IF coffee_enabled AND
   cafe_is_open AND
   (arrival_time + coffee_duration) <= target_arrival
  insert_coffee_leg()
  coffee.status = "TIME FOR COFFEE"
```

### 4.2 Coffee Skip (Running Late)

![Coffee Skip](images/scenario-delay-skip.png)

**Trigger:** Delays would cause late arrival with coffee

**Visual Elements:**
- Coffee leg with "✗ SKIP — Running late" subtitle
- Dashed border
- Grayed appearance
- No duration shown

**Engine Logic:**
```
IF coffee_enabled AND delay_detected AND
   (arrival_time + delay + coffee_duration) > target_arrival
  coffee.status = "SKIP"
  coffee.reason = "Running late"
  coffee.border = dashed
```

### 4.3 Extra Time Coffee (Disruption)

**Trigger:** Disruption creates unexpected buffer time

**Visual Elements:**
- Coffee leg with "✓ EXTRA TIME — Disruption" subtitle
- Inserted because rail replacement adds buffer

### 4.4 Friday Treat

![Friday Treat](images/scenario-friday.png)

**Trigger:** Friday afternoon/evening, destination coffee

**Visual Elements:**
- Coffee leg with "✓ FRIDAY TREAT" subtitle
- Special end-of-week messaging

---

## 5. Multi-Modal Scenarios

### 5.1 Train + Tram

**Trigger:** Journey requires train and tram

**Visual Elements:**
- Different icons for each mode
- Walking legs between modes
- Clear transfer points

### 5.2 Tram + Bus

![Multi-Modal](images/scenario-multimodal.png)

**Trigger:** Journey requires tram and bus connection

**Visual Elements:**
- Tram icon and Bus icon
- Walking leg for interchange
- "Next: X, Y min" showing upcoming services

### 5.3 Rail Replacement

**Trigger:** Train replaced by bus due to disruption

**Visual Elements:**
- Bus icon with "Rail Replacement Bus" text
- Route: `S Yarra→Richmond` format
- Inserted automatically by disruption handling

---

## 6. Special Service Scenarios

### 6.1 Express Service

![Express](images/scenario-express.png)

**Trigger:** Express service available that saves time

**Visual Elements:**
- "EXPRESS" badge on service
- "Skips X stations" note
- Stops listed: `Stops: A → B → C only`
- Footer: `EXPRESS saves X min vs all-stops service`
- Alternative services shown: `Next EXPRESS: X:XX • All stops: X:XX, X:XX`

**Engine Logic:**
```
IF express_available AND express_saves_time
  service.badge = "EXPRESS"
  service.note = "Skips " + skipped_count + " stations"
  footer.note = "EXPRESS saves " + time_saved + " min"
```

### 6.2 Limited Stops

**Trigger:** Limited stops service (fewer skips than express)

**Visual Elements:**
- Service name with route details
- Fewer visual callouts than express

---

## 7. Weather Scenarios

### 7.1 Clear Weather

**Visual Elements:**
- Temperature in header
- "NO UMBRELLA" indicator
- Weather icon (sun, clouds, etc.)

### 7.2 Rain Expected

**Visual Elements:**
- "BRING UMBRELLA" indicator (inverted/highlighted)
- Rain probability considered

### 7.3 Maybe Rain

**Visual Elements:**
- "MAYBE RAIN" indicator
- Shown when probability is borderline

---

## 8. Time-Based Scenarios

### 8.1 Morning Commute (Home → Work)

**Trigger:** Before noon, work destination

**Visual Elements:**
- Work address in footer
- Morning weather

### 8.2 Evening Commute (Work → Home)

![Evening](images/scenario-friday.png)

**Trigger:** After noon, home destination

**Visual Elements:**
- "HOME — [Address]" in footer
- Evening weather

### 8.3 Weekend/Leisure

![Weekend](images/scenario-weekend.png)

**Trigger:** Weekend, non-work destination

**Visual Elements:**
- Leisure destination shown
- Descriptive subtitle ("Near the rotunda")
- Different journey style

---

## Visual States Reference

### Border Styles

| Border | Meaning |
|--------|---------|
| Solid 2px black | Normal service |
| Dashed 2px gray | Delayed/diverted/skip |
| Solid 2px gray | Muted (past leg) |

### Background Patterns

| Pattern | Meaning |
|---------|---------|
| White | Normal |
| Diagonal stripes (135°) | Cancelled/suspended |
| Vertical stripes (90°) | Diverted |

### Status Icons

| Icon | Meaning |
|------|---------|
| (none) | Normal |
| [DELAY] | Delay(s) |
| [!] | Disruption/diversion |

### Mode Icons

| Icon | Mode |
|------|------|
| [Walk] | Walk |
| [Train] | Train |
| [Tram] | Tram |
| [Bus] | Bus |
| [Coffee] | Coffee |
| [Ferry] | Ferry |

---

## Engine Decision Tree

```
START
  │
  ├─► Fetch GTFS-RT data (30s cache)
  │
  ├─► Check service alerts
  │     ├─► Suspended? → Insert replacement + DISRUPTION status
  │     ├─► Diverted? → Add walk leg + DIVERSION status
  │     └─► Cancelled? → Show next service
  │
  ├─► Check delays
  │     ├─► Single delay? → DELAY status
  │     └─► Multiple? → DELAYS status (plural)
  │
  ├─► Coffee decision
  │     ├─► Time available? → Insert coffee + "TIME FOR COFFEE"
  │     ├─► Running late? → Skip coffee + "SKIP — Running late"
  │     └─► Extra buffer? → Insert coffee + "EXTRA TIME"
  │
  ├─► Express detection
  │     └─► Saves time? → Show EXPRESS badge + savings
  │
  ├─► Weather check
  │     └─► Rain likely? → "BRING UMBRELLA"
  │
  └─► Render CCDash™ V15.0 layout
```

---

## Related Documents

- [CCDashDesignV15.0](../specs/CCDashDesignV15.md) — Visual specification (LOCKED)
- [ARCHITECTURE.md](ARCHITECTURE.md) — System architecture
- [DEVELOPMENT-RULES.md](../DEVELOPMENT-RULES.md) — Development rules

---

*Copyright © 2026 Angus Bergman — AGPL-3.0 Dual License*
