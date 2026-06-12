---
name: TrackMind Industrial Light
colors:
  surface: '#f6fafe'
  surface-dim: '#d6dade'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f8'
  surface-container: '#eaeef2'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#171c1f'
  on-surface-variant: '#434655'
  inverse-surface: '#2c3134'
  inverse-on-surface: '#edf1f5'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#46566c'
  on-tertiary: '#ffffff'
  tertiary-container: '#5e6e85'
  on-tertiary-container: '#e9f0ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f6fafe'
  on-background: '#171c1f'
  surface-variant: '#dfe3e7'
typography:
  display-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  panel-header:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  body-base:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.07em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  data-mono-bold:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 18px
  data-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  baseline: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  gutter: 4px
  margin-desktop: 12px
  row-height-dense: 28px
---

## Brand & Style

This design system is engineered for mission-critical railway operations, prioritizing cognitive clarity and visual stability. The brand personality is clinical, authoritative, and instrument-grade—designed for high-performance daylight environments.

The design style is **Minimalist-Industrial**. It rejects all aesthetic embellishments such as gradients, background blurs, or drop shadows. Instead, it relies on high-density layouts, crisp 1px boundaries, and a rigid 4px baseline grid. The goal is to reduce eye strain during intense operational shifts by providing a clean, high-contrast interface that feels like a physical control console.

- **Atmosphere:** Technical, dense, and precise.
- **Visual Rigor:** Flat surfaces with sharp, geometric definition.
- **Hierarchy:** Established through tonal layering and hair-thin borders rather than depth effects.

## Colors

The palette is rooted in the **Slate** spectrum to provide a neutral, low-distraction base. Functional colors are used sparingly and with absolute intent to signal safety states and critical telemetry.

- **Core Surfaces:** The application uses a "Slate 100" background to represent the machine casing, while all active workspace modules use pure "White" panels to maximize text contrast.
- **Functional Accents:**
    - **Blue 600:** Primary actions and system interactivity.
    - **Red 600:** Critical alerts, occupied blocks, or emergency states.
    - **Amber 500:** Impending conflicts or moderate delays.
    - **Green 600:** Cleared lines and normal trajectories.
- **Contrast:** Text colors are strictly governed by legibility. All primary data uses "Slate 900" for maximum contrast (9.8:1) against white surfaces, exceeding WCAG AAA standards.

## Typography

This system employs a dual-font strategy to balance editorial clarity with technical precision.

1.  **IBM Plex Sans:** Used for all UI controls, section headers, and instructional labels. It provides a professional, humanist touch that remains legible at small scales.
2.  **JetBrains Mono:** **CRITICAL** for all telemetry, train IDs, timestamps, speeds, and coordinates. The monospaced nature ensures that updating values do not cause layout shifts, allowing controllers to vertically scan and compare numbers instantly.

**Rules:**
- Use `label-caps` for all table headers and small metadata labels to maximize scannability.
- All numerical data must be right-aligned in tables to maintain decimal and digit alignment.
- Line heights are kept tight (1.2 to 1.4) to accommodate the high-density nature of the NCC terminal.

## Layout & Spacing

The layout is a **Fixed-Grid 5-Zone system** designed for 1080p and 1440p terminal displays. It prioritizes "single-pane-of-glass" visibility where all critical modules are visible simultaneously without scrolling.

- **The 4px Rule:** All padding, margins, and component alignments must be direct multiples of 4px.
- **Density:** Gaps between major workspace blocks are restricted to 4px–8px. Whitespace is treated as functional separation, not aesthetic "breathing room."
- **Zones:**
    1.  **Command Bar (44px top):** Global KPIs and session settings.
    2.  **Nav Rail (56px left):** Tool switching.
    3.  **Visual Canvas (Center):** Network Map and Time-Space graphs.
    4.  **Inspector (320px right):** Detailed telemetry and event details.
    5.  **Register (Bottom):** Fixed-height data table for train schedules.

## Elevation & Depth

This design system uses a **Flat Tonal Layering** approach. Traditional shadows are strictly prohibited as they introduce visual noise and "softness" that contradicts the industrial aesthetic.

- **Level 0 (Base):** Slate 100.
- **Level 1 (Panels):** Pure White with 1px Hard Slate 300 borders.
- **Depth via Borders:** 1px solid lines define all component boundaries. In dense tables, 1px Slate 200 internal dividers are used to guide the eye along rows and columns.
- **Active State:** Focus and active states are indicated by a 2px solid Blue 600 border. No outer glow or ambient shadow is applied.

## Shapes

The shape language is **Sharp and Geometric**. 

- **Corner Radius:** A universal 2px radius is applied to all buttons, inputs, and panel containers. This provides just enough softening to prevent visual "aliasing" while maintaining a precise, physical instrument appearance.
- **Elements:** Large containers (cards/panels) and small elements (buttons/chips) all share the same 2px radius to maintain a consistent "machined" look across the system.

## Components

### Buttons
- **Primary:** Solid Blue 600, White text, 2px radius. Standard height: 30px.
- **Secondary:** White background, 1px Slate 300 border, Slate 900 text.
- **Critical:** Solid Red 600, White text. Reserved for "Emergency Stop" or "Override" actions.

### Data Tables (Train Register)
- **Density:** 28px fixed row height. 
- **Zebra Stripping:** Alternate rows using Slate 50.
- **States:** Rows with critical delays (>15m) use a flat Red 50 background. Warning delays (>5m) use Amber 50.
- **Typography:** Column headers in 11px uppercase; cell data in 13px monospaced.

### Action Cards (AI Inspector)
- **Styling:** White background, 1px Slate 300 border.
- **Priority Indicator:** A 3px thick solid vertical bar on the extreme left edge (Red 600 for Critical, Amber 500 for Warning, Slate 500 for Info).
- **Padding:** Tight 12px internal padding.

### Inputs
- **Field Height:** 28px.
- **Border:** 1px Slate 300; snaps to 2px Blue 600 on focus.
- **Labels:** 11px uppercase sans-serif with wide tracking (0.07em) placed above the input.

### Canvas Controls
- **Grid:** The Network Map must feature a 12px x 12px underlying grid of hair-thin Slate 200 lines.
- **Vectors:** Block status lines are 3px thick solid colors (Green/Amber/Red) without any glow effects.