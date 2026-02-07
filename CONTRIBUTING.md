<p align="center">
  <img src="assets/brand/cc-mark-cropped.png" alt="Commute Compute™" width="120">
</p>

# Contributing to Commute Compute™

Thank you for your interest in contributing! This project welcomes community contributions.

## IMPORTANT -- Before You Start

**MANDATORY:** Read [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) before making any changes.

Key requirements:
- CCDashDesignV15.0 spec is **LOCKED** — no UI changes without approval
- Never use "PTV API" — use "Transport Victoria OpenData API"
- Custom firmware only — NO usetrmnl.com dependencies
- 1-bit BMP rendering — no grayscale
- AGPL-3.0 dual license required on all contributions (see [LICENSE](LICENSE))

## How to Contribute

### Bug Reports
1. Check existing issues first
2. Include device type, browser, and steps to reproduce
3. Share relevant error messages or screenshots
4. Reference which section of DEVELOPMENT-RULES.md might be relevant

### Feature Requests
1. Open an issue describing the feature
2. Explain the use case and benefit
3. Check if it conflicts with the CCDashDesignV15.0 spec (locked)
4. Be patient — this is a hobby project

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. **Read DEVELOPMENT-RULES.md** — ensure compliance
4. Follow existing code style
5. Test your changes locally with the simulator
6. Run the pre-commit checklist (Section 14)
7. Commit with clear messages
8. Open a Pull Request

## Code Style

- Use ES6+ JavaScript
- Prefer `const` over `let`
- Use meaningful variable names
- Add comments explaining WHY, not WHAT
- Keep functions focused and small

## Pre-Commit Checklist

Before submitting (from DEVELOPMENT-RULES.md Section 14):

- [ ] `npm run lint` passes
- [ ] `npm run test` passes (if tests exist)
- [ ] Firmware compiles: `pio run -e trmnl`
- [ ] No hardcoded API keys
- [ ] No forbidden terms (Section 1.1)
- [ ] Documentation updated if API changed

## Testing

Before submitting:
```bash
npm install
npm run dev
# Open http://localhost:3000/preview.html
# Test all changes in the dashboard preview
```

## License

By contributing, you agree that your contributions will be dual-licensed under **AGPL-3.0** and commercial terms (see [LICENSE](LICENSE)).

All contributions must include the license header:
```
Copyright (c) 2026 Angus Bergman
SPDX-License-Identifier: AGPL-3.0-or-later
Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
```

## Questions?

- Open an issue for bugs or features
- Check [docs/](docs/) for architecture and guides
- Read [DEVELOPMENT-RULES.md](DEVELOPMENT-RULES.md) for all rules

---

*Thank you for helping make Commute Compute better!*
