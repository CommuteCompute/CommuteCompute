<p align="center">
  <img src="../assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# CommuteCompute™ Consolidation Proposal

**Date:** 2026-01-31
**Status:** Proposed (Pre-V15.0 -- review relevance against current V15.0 architecture with new engines)
**Author:** Development Team

---

## Current State: 5 Files, 3,892 Lines

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| `src/engines/commute-compute.js` | 838 | Multi-state engine, GTFS-RT, weather | api/commutecompute.js, livedash.js |
| `src/core/smart-journey-engine.js` | 706 | Route discovery, journey display | api/zones.js, api/screen.js, server.js |
| `src/services/journey-planner.js` | 1,131 | Route segment building | server.js, route-planner.js |
| `src/services/smart-route-recommender.js` | 853 | Route optimization | commute-compute.js, journey-planner.js |
| `src/services/smart-journey-integration.js` | 364 | Integration layer | (unused?) |

**Problem:** Two parallel engines doing similar things, causing confusion and maintenance burden.

---

## Overlap Analysis

| Functionality | commute-compute.js | smart-journey-engine.js |
|--------------|:----------------:|:-----------------------:|
| Constructor/Init | [YES] | [YES] |
| State detection | [YES] | [NO] |
| GTFS-RT data | [YES] | [NO] |
| Weather (BOM) | [YES] | [NO] |
| Coffee decision | [YES] | [YES] |
| Route discovery | [NO] (uses recommender) | [YES] |
| Journey display build | [NO] | [YES] |
| Multi-state support | [YES] | [NO] |
| Config loading | [YES] | [YES] (from JSON) |

---

## Proposed Consolidation

### Target: 3 Files, ~1,800 Lines

```
BEFORE (5 files, 3,892 lines)          AFTER (3 files, ~1,800 lines)
─────────────────────────────          ──────────────────────────────

┌─────────────────────────┐            ┌─────────────────────────────┐
│ commute-compute.js (838)  │            │ commute-compute.js (~1,200)   │
│ - Multi-state           │            │ - Multi-state               │
│ - GTFS-RT               │     ┌─────▶│ - GTFS-RT                   │
│ - Weather               │     │      │ - Weather                   │
│ - Coffee                │     │      │ - Coffee                    │
└─────────────────────────┘     │      │ + Route discovery           │
                                │      │ + Journey display build     │
┌─────────────────────────┐     │      └─────────────────────────────┘
│ smart-journey-engine.js │─────┤
│ (706) - MERGE & DELETE  │     │      ┌─────────────────────────────┐
│ - Route discovery       │─────┘      │ smart-route-recommender.js  │
│ - Journey display       │            │ (~850) - KEEP AS-IS         │
└─────────────────────────┘            │ - Route optimization        │
                                       │ - Pattern matching          │
┌─────────────────────────┐            └─────────────────────────────┘
│ journey-planner.js      │
│ (1,131) - MERGE & DELETE│─────┐      ┌─────────────────────────────┐
│ - Segment building      │     └─────▶│ coffee-decision.js          │
└─────────────────────────┘            │ (~200) - KEEP AS-IS         │
                                       │ - Coffee logic              │
┌─────────────────────────┐            └─────────────────────────────┘
│ smart-journey-integ.js  │
│ (364) - DELETE          │
│ - Unused integration    │
└─────────────────────────┘

┌─────────────────────────┐
│ smart-route-recommender │
│ (853) - KEEP            │
└─────────────────────────┘
```

---

## Migration Plan

### Phase 1: Merge smart-journey-engine.js into commute-compute.js

**Add to CommuteCompute class:**
```javascript
// From smart-journey-engine.js
async discoverRoutes() { ... }
async buildJourneyForDisplay(transitData, weatherData) { ... }
formatLegForDisplay(leg, transitData, index) { ... }
findNearbyStops(location, allStops, radius) { ... }
```

### Phase 2: Update API Endpoints

| Endpoint | Current Import | New Import |
|----------|----------------|------------|
| `api/zones.js` | SmartJourneyEngine | CommuteCompute |
| `api/screen.js` | SmartJourneyEngine | CommuteCompute |
| `api/fullscreen.js` | SmartJourneyEngine | CommuteCompute |
| `api/zones-tiered.js` | SmartJourneyEngine | CommuteCompute |
| `src/server.js` | SmartJourneyEngine | CommuteCompute |

### Phase 3: Deprecate & Delete

1. Mark `smart-journey-engine.js` as deprecated
2. Mark `journey-planner.js` as deprecated (functionality in recommender)
3. Delete `smart-journey-integration.js` (unused)
4. After testing, delete deprecated files

---

## API Changes

**None.** All changes are internal refactoring.

| Endpoint | Change |
|----------|--------|
| `/api/zones` | Internal only - same response |
| `/api/screen` | Internal only - same response |
| `/api/commutecompute` | Already uses CommuteCompute |
| `/api/livedash` | Already uses CommuteCompute |

---

## Testing Checklist

- [ ] `/api/zones` returns correct zone data
- [ ] `/api/screen` renders correct PNG
- [ ] `/api/livedash` works for all device types
- [ ] Coffee decision still works
- [ ] Weather still works
- [ ] Route discovery finds correct routes
- [ ] Multi-state detection works
- [ ] Fallback timetables work without API key

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking zones API | Test thoroughly before merge |
| Coffee logic change | Keep CoffeeDecision class unchanged |
| Route discovery regression | Port tests from smart-journey-engine |
| State detection breaks | Already in commute-compute.js (no change) |

---

## Estimated Effort

| Phase | Time |
|-------|------|
| Phase 1: Merge code | 2-3 hours |
| Phase 2: Update imports | 1 hour |
| Phase 3: Testing | 1-2 hours |
| Phase 4: Cleanup | 30 min |
| **Total** | **~5 hours** |

---

## Approval

- [ ] Approved by Angus Bergman
- [ ] Backed up current code
- [ ] All tests passing before merge

---

**Recommendation:** Approve this consolidation to reduce codebase complexity and improve maintainability. The CommuteCompute engine should be the single source of truth for journey calculations.
