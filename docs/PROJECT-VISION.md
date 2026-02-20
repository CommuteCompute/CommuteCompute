<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute System™ — Project Vision & Roadmap

**Version:** 2.1
**Last Updated:** 2026-02-15
**Author:** Angus Bergman
**Licence:** AGPL-3.0 Dual Licence

---

## Vision Statement

**Commute Compute System™ aims to be the definitive open-source smart transit display for Australian public transport** — empowering commuters with real-time journey information on beautiful e-ink displays, while maintaining complete privacy and user control.

---

## Core Values

### Privacy First
Your commute data stays on YOUR server. No tracking, no analytics, no central database. Each user owns their complete stack.

### Truly Free
Runs entirely on free-tier infrastructure (Vercel). No subscriptions, no hidden costs, no premium features locked behind paywalls. Optional paid APIs (Google Places) have free fallbacks.

### Zero Dependencies
No reliance on third-party clouds or services. CCFirm™ custom firmware means your device connects only to your server — not to any external cloud display service.

### Australian Focus
Purpose-built for Australian public transport systems. Full support for Victoria (Transport Victoria OpenData API), with NSW and Queensland supported and architecture designed for all states/territories.

### Open Source
All code, specifications, and documentation freely available under AGPL-3.0 (dual-licensed). Community contributions welcome.

---

## Brand Architecture

| Brand | Purpose |
|-------|---------|
| **Commute Compute System™** | Overall system name |
| **Commute Compute™** | Short brand name |
| **CommuteCompute™** | Journey calculation engine |
| **CCDash™** | Dashboard rendering specification |
| **CC LiveDash™** | Multi-device live renderer |
| **CCFirm™** | Custom firmware family |

All trademarks © 2026 Angus Bergman.

---

## Product Goals

### Primary Goal
Create a **"set and forget"** smart transit display that tells you exactly when to leave for work, including coffee time.

### User Experience Goals

| Goal | Metric | Status |
|------|--------|--------|
| **Setup Time** | ~60-90 minutes from deployment to working display (first-time) | [YES] Achieved |
| **Zero Maintenance** | Device runs indefinitely without user intervention | [YES] Achieved |
| **Glanceable** | All critical info visible in < 2 seconds | [YES] Achieved |
| **Accurate** | Real-time data within 30 seconds of actuality | [YES] Achieved |
| **Multi-State** | Support all Australian states | In Progress |

### Technical Goals

| Goal | Target | Status |
|------|--------|--------|
| **Refresh Cycle** | 20 seconds (optimal for e-ink + data freshness) | [YES] Achieved |
| **Uptime** | 99.9% (Vercel SLA) | [YES] Achieved |
| **Response Time** | < 500ms for zone endpoints | [YES] Achieved |
| **Memory Usage** | < 100KB heap on ESP32-C3 | [YES] Achieved |
| **Zero Bricked Devices** | Anti-brick firmware rules | [YES] Achieved |

---

## Target Users

### Primary: Australian Capital City Commuters
- Daily train/tram/bus commuters in Melbourne, Sydney, Brisbane
- Want to optimise morning routine
- Value knowing exactly when to leave
- Appreciate "coffee time" calculation

### Secondary: Australian Transit Enthusiasts
- Public transport advocates
- Smart home enthusiasts
- E-ink display hobbyists
- Open-source contributors

### Tertiary: Technical Users
- Developers wanting to fork/extend
- IoT experimenters
- Smart display builders
- Transit data enthusiasts

---

## Feature Roadmap

### Phase 1: Foundation -- COMPLETE
- [x] Core server architecture
- [x] CCDashDesignV15.0 dashboard specification (CCDash™)
- [x] Zone-based partial refresh
- [x] Transport Victoria API integration
- [x] Weather (BOM) integration
- [x] Setup Wizard
- [x] Device simulator

### Phase 2: Firmware -- COMPLETE
- [x] CCFirm™ custom ESP32-C3 firmware
- [x] Anti-brick safeguards (12/12 rules)
- [x] State machine architecture
- [x] Zone-based rendering
- [x] WiFi configuration portal
- [x] bb_epaper library integration

### Phase 3: Documentation -- COMPLETE
- [x] DEVELOPMENT-RULES.md v1.28 (24 sections, 210+ compliance checks)
- [x] System architecture documentation (v4.2.0)
- [x] Setup Wizard architecture (v2.0)
- [x] Project vision and roadmap
- [x] Installation guides
- [x] API documentation
- [x] Firmware anti-brick documentation

### Phase 4: Multi-State & Engine -- COMPLETE
- [x] CommuteCompute™ engine
- [x] CC LiveDash™ multi-device renderer
- [x] NSW (TfNSW) support
- [x] Queensland (TransLink) support
- [x] State auto-detection
- [x] Timetable-based coverage for non-VIC states

### Phase 5: Setup & UX -- COMPLETE
- [x] Zero-config serverless architecture
- [x] Free-tier caching strategy
- [x] API key validation with live tests
- [x] OSM Nominatim fallback geocoding
- [x] Cafe hours caching
- [x] iOS Safari compatibility
- [x] Device pairing system

### Phase 6: Testing -- IN PROGRESS
- [x] Firmware testing on physical device
- [x] Zone rendering verification
- [x] API endpoint testing
- [ ] End-to-end automated testing
- [ ] Load testing
- [ ] Edge case validation

### Phase 7: Polish -- IN PROGRESS
- [x] Error state screens
- [x] Service disruption handling
- [x] Health monitoring
- [ ] Improved error messages
- [ ] Multi-language support (future)
- [ ] Alternative dashboard layouts (future)

### Phase 8: Launch -- COMPLETE
- [x] Public repository finalization
- [x] Community documentation
- [x] Reddit/social media announcement (222k+ views)
- [x] IP Australia trade mark applications filed (TM 2627709, TM 2627710)
- [x] ABN registered (59 402 869 395)
- [x] Live deployment on Vercel
- [ ] Video tutorials (future)

### Phase 9: Expansion -- FUTURE
- [ ] South Australia (Adelaide Metro)
- [ ] Western Australia (Transperth)
- [ ] Tasmania (Metro Tasmania)
- [ ] ACT (Transport Canberra)
- [ ] Northern Territory
- [ ] New Zealand (Auckland Transport)
- [ ] Inkplate device support
- [ ] Waveshare display support

---

## Architecture Principles

### Server-Side Rendering
All computation happens on the server. The device is "dumb" — it receives images and displays them. This enables:
- Minimal firmware complexity
- Easy updates (server-side only)
- Low device memory requirements
- Consistent rendering across devices

### Zero-Config Deployment
Users should never need to edit environment variables or configuration files. All configuration happens through the Setup Wizard and is embedded in URL tokens.

### Self-Hosted Only
No central server, no shared infrastructure, no SaaS model. Each user deploys their own complete stack. This ensures:
- Complete privacy
- No single point of failure
- User ownership of data
- Unlimited scaling (each user pays their own hosting)

### Specification-Driven Development
All UI and behaviour is defined in locked specifications (CCDash™ V15.0). Changes require explicit approval and version bumps. This prevents:
- UI inconsistency
- Scope creep
- Breaking changes
- Developer confusion

### Free-Tier First
The entire system must be usable for free. Paid APIs (Google Places) are optional with free fallbacks (OSM Nominatim). No feature should require payment.

---

## Technical Constraints

### E-ink Display Limitations
| Constraint | Impact |
|------------|--------|
| 1-bit colour | Black and white only, no grayscale |
| Slow refresh | 2-3 seconds full, 500ms partial |
| Ghosting | Requires anti-ghosting patterns |
| Power | USB-C recommended; battery supported (several days) |

### ESP32-C3 Limitations
| Constraint | Impact |
|------------|--------|
| 400KB RAM | Zone batching required, 40KB buffer minimum |
| No PSRAM | Streaming, no full-frame buffer |
| Single core | State machine architecture required |
| WiFi 2.4GHz only | Must be within range |
| bb_epaper quirks | No allocBuffer(), FONT_8x8 only |

### API Limitations
| Constraint | Impact |
|------------|--------|
| GTFS-RT updates | 30-second freshness |
| Rate limits | Respectful caching required |
| BOM data | 5-minute freshness acceptable |
| Google Places | Optional, cached at setup time |

---

## Success Metrics

### User Success
- Users can set up a working display in ~60-90 minutes (first-time) [YES]
- Display shows accurate departure times [YES]
- Coffee decision logic is trusted [YES]
- System requires zero maintenance [YES]
- Works across VIC, NSW, QLD [YES]

### Technical Success
- Zero bricked devices [YES]
- < 1% error rate on API calls [YES]
- 20-second refresh cycle maintained [YES]
- Memory stable over weeks of operation [YES]
- Vercel free tier sufficient [YES]

### Community Success
- Active GitLab discussions
- Community contributions
- Forks for other transit systems
- Positive user feedback

---

## Non-Goals

Things we explicitly **will not** pursue:

| Non-Goal | Reason |
|----------|--------|
| Central SaaS | Violates privacy-first principle |
| Mobile app | E-ink is the focus |
| Ad-supported | Conflicts with user experience |
| Premium features | Everything is free |
| Real-time location tracking | Privacy concern |
| Social features | Out of scope |
| Third-party cloud display integration | Independence required |

---

## Governance

### Project Ownership
- **Creator:** Angus Bergman
- **Licence:** AGPL-3.0 Dual Licence
- **Repository:** Public GitLab
- **Trademarks:** All ™ marks owned by Angus Bergman

### Decision Making
- Major changes require specification updates
- CCDashDesignV15.0 spec is LOCKED — changes require new version
- DEVELOPMENT-RULES.md v1.28 is the source of truth
- Community input welcome via GitLab Issues

### Contribution Model
- Fork and pull request
- Must follow DEVELOPMENT-RULES.md
- AGPL-3.0 dual licence required on contributions
- Code review required for merges

---

## Support Model

### Self-Service
- Comprehensive documentation
- Setup Wizard guidance
- Troubleshooting guides
- Device simulator for testing
- Help page in admin panel

### Community
- GitLab Issues for bugs
- GitLab Discussions for questions
- No paid support tier

### Donations
- Buy Me a Coffee: [buymeacoffee.com/angusbergman](https://buymeacoffee.com/angusbergman)
- All donations support development time

---

## Timeline

| Phase | Target | Status |
|-------|--------|--------|
| Foundation | Q4 2025 | [YES] Complete |
| Firmware | Q4 2025 | [YES] Complete |
| Documentation | Q1 2026 | [YES] Complete |
| Multi-State & Engine | Q1 2026 | [YES] Complete |
| Setup & UX | Q1 2026 | [YES] Complete |
| Testing | Q1 2026 | In Progress |
| Polish | Q1 2026 | In Progress |
| Launch | Q1 2026 | [YES] Complete |
| Expansion | Q2 2026+ | Future |

---

## Conclusion

Commute Compute System™ represents a commitment to privacy-respecting, user-empowering technology. By keeping everything self-hosted and open-source, we ensure that users truly own their smart transit experience — no strings attached.

The project succeeds when an Australian commuter can glance at their e-ink display, see "LEAVE NOW — Coffee included", and walk out the door knowing they'll catch their train on time.

---

**Built with coffee in Melbourne**

*Copyright (c) 2026 Angus Bergman — AGPL-3.0 Dual Licence*
