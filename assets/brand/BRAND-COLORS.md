<p align="center">
  <img src="cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# Commute Compute(TM) Brand Colors

**Last Updated:** 2026-02-07

## Primary Palette

| Name | Hex | CSS Variable | RGB | Usage |
|------|-----|--------------|-----|-------|
| **CC Navy** | `#1a2744` | `--cc-navy` | 26, 39, 68 | Backgrounds, containers |
| **CC Teal** | `#4fb28e` | `--cc-teal` | 79, 178, 142 | Buttons, links, accents |
| **CC Teal Dark** | `#2d6b5a` | `--cc-teal-dark` | 45, 107, 90 | Hover states, shadows |
| **CC White** | `#ffffff` | `--cc-white` | 255, 255, 255 | Text, highlights |
| **CC Grey** | `#a8b0bc` | `--cc-grey` | 168, 176, 188 | Secondary text, icons |

## Extended Palette

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| CC Teal Light | `#6ec9a8` | `--cc-teal-light` | Hover accents |
| CC Navy Light | `#2a3d5c` | `--cc-navy-light` | Lighter backgrounds |
| CC Navy Dark | `#0f1a2e` | `--cc-navy-dark` | Darker backgrounds |

## CSS Variables (Copy & Paste)

```css
:root {
  /* Primary Palette */
  --cc-navy: #1a2744;
  --cc-teal: #4fb28e;
  --cc-teal-dark: #2d6b5a;
  --cc-white: #ffffff;
  --cc-grey: #a8b0bc;
  
  /* RGB Versions (for rgba() usage) */
  --cc-navy-rgb: 26, 39, 68;
  --cc-teal-rgb: 79, 178, 142;
  
  /* Extended Palette */
  --cc-teal-light: #6ec9a8;
  --cc-navy-light: #2a3d5c;
  --cc-navy-dark: #0f1a2e;
}

/* Example Usage */
.button {
  background: var(--cc-teal);
  color: var(--cc-white);
}

.button:hover {
  background: var(--cc-teal-dark);
}

.overlay {
  background: rgba(var(--cc-navy-rgb), 0.9);
}
```

## Typography

| Element | Font | Weight | Color | Letter-spacing |
|---------|------|--------|-------|----------------|
| **COMMUTE** | Montserrat | 500 (Medium) | `#4fb28e` | 0.25em |
| **COMPUTE** | Montserrat | 700 (Bold) | `#ffffff` | 0.25em |

**Font Stack:** `'Montserrat', system-ui, -apple-system, sans-serif`

## Definitive Source Logo

All branding variants are derived exclusively from the single canonical source:

| Source | Format | Dimensions | Usage |
|--------|--------|------------|-------|
| `cc-logo-square.png` | PNG | 900x900 | Canonical source for all logo variants |

All size variants (512, 256, 200, 128, 64, 32, 16, apple-touch) are derived from `cc-logo-square.png`.

The TM mark after "COMPUTE" is included in the source image and all derived variants.

## E-Ink Display Assets

Firmware e-ink BMPs in `firmware/include/` are maintained separately and must not
be regenerated from the branding sources without explicit approval.

## Logo Usage

- All logo files include the TM mark baked directly into the image
- Wordmark logos: "TM" appears as white superscript after "COMPUTE"
- Mark-only logos: "TM" appears near the top-right of the CC icon
- "COMMUTE" and "COMPUTE" must align center
- Minimum clear space: 20% of logo height on all sides
- Do not alter colors, proportions, alignment, or remove the TM mark
- Canonical source: `cc-logo-square.png` (900x900) -- all size variants derived from this

---
*Commute Compute(TM) System -- Copyright (c) 2026 Angus Bergman -- AGPL-3.0 Dual License*
