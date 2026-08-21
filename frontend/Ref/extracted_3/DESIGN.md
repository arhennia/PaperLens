---
name: Academic Intelligence
colors:
  surface: '#f6f9ff'
  surface-dim: '#d4dbe3'
  surface-bright: '#f6f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#edf4fd'
  surface-container: '#e7eff7'
  surface-container-high: '#e2e9f2'
  surface-container-highest: '#dce3ec'
  on-surface: '#151c23'
  on-surface-variant: '#434655'
  inverse-surface: '#2a3138'
  inverse-on-surface: '#eaf1fa'
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
  tertiary: '#973400'
  on-tertiary: '#ffffff'
  tertiary-container: '#c04400'
  on-tertiary-container: '#ffede7'
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
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#7f2b00'
  background: '#f6f9ff'
  on-background: '#151c23'
  surface-variant: '#dce3ec'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Montserrat
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  space-xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for high-density information environments where clarity and authority are paramount. It targets researchers, analysts, and academic professionals who require a UI that facilitates deep focus and rapid data synthesis.

The aesthetic blends **Modern Corporate** precision with **Academic Minimalism**. It prioritizes a crisp visual hierarchy and a structured layout to manage complex information sets without overwhelming the user. The emotional response should be one of confidence, reliability, and intellectual rigor. Visual clutter is eliminated in favor of intentional whitespace and precise alignment. No decorative iconography or emojis are permitted; every element must serve a functional purpose.

## Colors
The palette is rooted in a professional blue spectrum to evoke trust and stability. 

- **Primary Blue (#2563EB)** is reserved for primary actions and active states. 
- **Surface (#EFF6FF)** provides a cool, low-strain backdrop that distinguishes the workspace from the content.
- **Surface-Container (#FFFFFF)** is used for content modules and cards, creating a clear "elevated" layer for readability.
- **Secondary Navy (#0F172A)** ensures high-contrast legibility for headings and critical text.
- **Accent Amber (#EA580C)** is used sparingly for priority highlights, notifications, or critical status indicators to draw immediate attention without disrupting the overall harmony.
- **Outline (#E2E8F0)** serves as the primary structural divider for high-density grids.

## Typography
This design system utilizes **Montserrat** across all roles to maintain a cohesive, modern academic feel. The geometric nature of the typeface ensures legibility even at smaller sizes within high-density dashboards.

- **Headlines & Titles:** Use semi-bold or bold weights with slight negative letter-spacing to create a compact, authoritative presence.
- **Body Text:** Set in regular weight with standard line heights to facilitate long-form reading.
- **Labels:** Use uppercase for `label-lg` to create a distinct visual break for metadata and table headers.
- **Numeric Data:** Ensure tabular figures are used if the font variant allows, maintaining vertical alignment in data tables.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for high-density data visualization.

- **Desktop:** 12-column grid with 16px gutters. Margins are fixed at 32px to provide a breathable frame for the dense internal content.
- **Content Density:** Elements use a strict 4px/8px baseline shift. Padding within cards is standardized at 16px to maximize information per square inch while maintaining clarity.
- **Reflow:** On smaller screens, the 12-column layout collapses to 4 columns. Complex data tables should transition to a horizontal scroll or a condensed list view to maintain data integrity.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Low-Contrast Outlines** rather than aggressive shadows. 

- **Level 0 (Background):** Surface color (#EFF6FF).
- **Level 1 (Cards/Modules):** Surface-Container color (#FFFFFF) with a 1px outline (#E2E8F0).
- **Hover States:** Subtle ambient shadows (8px blur, 4% opacity, Secondary Navy tint) may be used to indicate interactivity on clickable cards.
- **Modals/Overlays:** Use a slightly stronger shadow (16px blur, 8% opacity) to separate the element from the data layer below, accompanied by a soft background dimming.

## Shapes
The shape language is disciplined and professional. A standard radius of **8px (Rounded)** is applied to all primary UI components including cards, buttons, and input fields. 

- Small components like tags or checkboxes should use a `rounded-sm` (4px) variant to maintain visual proportion.
- Large containers or structural panels may use `rounded-lg` (16px) for a softer external frame, though the 8px internal consistency is preferred for density.

## Components
- **Buttons:** Primary buttons are solid Blue (#2563EB) with white text. Secondary buttons use a transparent background with the Outline color (#E2E8F0) and Navy text.
- **Input Fields:** 1px Outline (#E2E8F0) with a 45px height for standard inputs. On focus, the border transitions to Primary Blue with a 1px inner glow.
- **Data Tables:** High-density rows (32px-40px height) with light horizontal dividers. Header rows should be slightly darker or use the `label-lg` typographic style.
- **Chips/Tags:** Small, 24px height, using a subtle tint of the primary or secondary color (10% opacity) with the solid text of that color.
- **Cards:** White background, 8px corner radius, 1px outline. No heavy drop shadows.
- **Priority Highlights:** Use the Accent color (#EA580C) as a vertical "status bar" (4px wide) on the left edge of cards or list items to denote urgency.