<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute™ UI/UX Redesign Task List

**Created:** 2026-01-29  
**Status:** [DONE] COMPLETE  
**Goal:** Complete UI/UX overhaul for all user skill levels

---

## [DONE] All Tasks Complete (2026-01-29)

### Phase 1: Foundation [DONE]
- [x] Footer Component - Consistent footer on all pages
- [x] Design Tokens - CSS variables standardized
- [x] LiveDash HTML - Complete redesign with header/footer

### Phase 2: Footer Coverage [DONE]
- [x] All 13 pages have consistent footers
- [x] Transport Victoria OpenData attribution (CC BY 4.0)
- [x] Buy me a coffee + GitLab Sponsors links
- [x] Feedback link → GitLab Issues
- [x] AGPL-3.0 license
- [x] © 2025-2026 Angus Bergman

### Phase 3: Page Consolidation [DONE]
- [x] preview.html - Complete rewrite with all 7 devices
- [x] help.html - New documentation page with FAQ
- [x] attribution.html - New page with all data sources
- [x] Navigation updated across all pages

### Phase 4: Polish [DONE]
- [x] Mobile hamburger menu on key pages
- [x] Animated menu icon with CSS
- [x] Responsive mobile navigation panel
- [x] ARIA accessibility labels
- [x] Archived deprecated demo pages

---

## Final State

### Active Pages (7)

| Page | Footer | Donate | Mobile Nav | Purpose |
|------|--------|--------|------------|---------|
| `index.html` | [DONE] | [DONE] | [DONE] | Landing / Home |
| `setup-wizard.html` | [DONE] | [DONE] | - | Zero-config setup |
| `admin.html` | [DONE] | [DONE] | - | Settings / Dashboard |
| `preview.html` | [DONE] | [DONE] | [DONE] | Multi-device preview |
| `help.html` | [DONE] | [DONE] | [DONE] | Documentation / FAQ |
| `attribution.html` | [DONE] | [DONE] | [DONE] | Data source credits |
| `simulator.html` | [DONE] | [DONE] | - | Device simulator |

### Archived Pages (6)

Moved to `/public/archive/`:
- `admin-v3.html` → replaced by `admin.html`
- `journey-demo.html` → replaced by `preview.html`
- `kindle-journey-demo.html` → replaced by `preview.html`
- `kindle11-demo.html` → replaced by `preview.html`
- `trmnl-og-v11.html` → replaced by `preview.html`
- `dashboard-template.html` → internal use only

### New Pages Created

1. `/help.html` - Full documentation with sidebar nav, FAQ, troubleshooting
2. `/attribution.html` - Complete data source credits and licensing

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Pages with footer | 3/13 | 13/13 |
| Pages with donation links | 3/13 | 13/13 |
| Pages with attribution | 6/13 | 13/13 |
| Pages with mobile menu | 0/13 | 4/7 active |
| Help documentation | None | Full page |
| Device preview options | 5 separate pages | 1 unified page |

---

## Site Map

```
/                      Landing page (Home)
├── /setup-wizard.html Setup flow
├── /admin.html        Dashboard settings
├── /preview.html      Multi-device preview (7 devices)
├── /help.html         Documentation & FAQ
├── /attribution.html  Data source credits
├── /simulator.html    Device simulator
├── /flasher/          Firmware flasher
└── /api/livedash      Live view (format=html)
```

---

## Commits (9 total)

| # | Hash | Description |
|---|------|-------------|
| 1 | `0f1ba48` | livedash 12-hour time fix |
| 2 | `7160746` | DEVELOPMENT-RULES.md v1.4 |
| 3 | `938403e` | CCDashDesignV15.0 spec compliance + multi-device docs |
| 4 | `d5d3a2e` | Phase 1 - LiveDash, Attribution page |
| 5 | `01823a2` | Phase 2 - Complete footer coverage |
| 6 | `03e427e` | Phase 3 - Unified Preview, Help page |
| 7 | `9bad532` | Navigation update |
| 8 | `d6b39f6` | Phase 4 - Mobile menu, archival |

---

**Completed:** 2026-01-29  
**Total Development Time:** ~45 minutes
