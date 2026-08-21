---
name: PaperLens
colors:
  surface: '#0c112b'
  surface-dim: '#0c112b'
  surface-bright: '#333853'
  surface-container-lowest: '#070c25'
  surface-container-low: '#151a33'
  surface-container: '#191e38'
  surface-container-high: '#232843'
  surface-container-highest: '#2e334e'
  on-surface: '#dee1ff'
  on-surface-variant: '#ccc3d7'
  inverse-surface: '#dee1ff'
  inverse-on-surface: '#2a2f49'
  outline: '#958da1'
  outline-variant: '#4a4455'
  surface-tint: '#d3bbff'
  primary: '#d3bbff'
  on-primary: '#3f008d'
  primary-container: '#6d28d9'
  on-primary-container: '#dac5ff'
  inverse-primary: '#7331df'
  secondary: '#93ccff'
  on-secondary: '#003351'
  secondary-container: '#3198dc'
  on-secondary-container: '#002c47'
  tertiary: '#68dba9'
  on-tertiary: '#003825'
  tertiary-container: '#006545'
  on-tertiary-container: '#70e4b1'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ebddff'
  primary-fixed-dim: '#d3bbff'
  on-primary-fixed: '#250059'
  on-primary-fixed-variant: '#5b00c5'
  secondary-fixed: '#cce5ff'
  secondary-fixed-dim: '#93ccff'
  on-secondary-fixed: '#001d31'
  on-secondary-fixed-variant: '#004b73'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#0c112b'
  on-background: '#dee1ff'
  surface-variant: '#2e334e'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  container-max: 1280px
  gutter: 20px
---

## Brand & Style
The design system is rooted in a "Developer-Grade Utilitarian" aesthetic. It prioritizes information density, precision, and high-contrast readability to support intensive academic analysis. The interface avoids ephemeral trends like glassmorphism or soft neomorphism in favor of a structural, "handcrafted" feel that suggests reliability and technical rigor.

The target audience—educators, researchers, and high-performance students—requires a UI that fades into the background, allowing the content of complex exam papers and AI-driven insights to take center stage. The emotional response is one of serious focus, intellectual clarity, and systematic order.

## Colors
The palette is strictly dark-mode, utilizing a deep navy-black base to reduce eye strain during long study sessions. 

- **Base Surfaces:** The background and surface colors use low-vibrancy cool tones to maintain a professional, hardware-like feel.
- **Accents:** High-chroma accents (Purple, Blue, Emerald) are used sparingly for interactive states, data visualization, and AI-generated insights.
- **Borders:** A critical element of this system, borders use a slightly lighter navy (#1E233D) to define structure without the need for shadows.
- **Status:** Crimson and Amber are reserved strictly for system errors, critical warnings, or negative exam trends.

## Typography
The system uses **Inter** for all primary text due to its exceptional legibility in dark environments. For technical metadata, code snippets, and exam IDs, **JetBrains Mono** is utilized to reinforce the "developer-grade" utility of the platform.

Typography should be treated as a structural element. Use `headline-lg` for primary dashboard titles and `label-md` (monospaced) for status tags, difficulty levels, and timestamps. Paragraph text should maintain a generous line height (1.6) to ensure long-form exam questions remain readable.

## Layout & Spacing
This design system employs a **fixed-fluid hybrid grid**. Main content areas are capped at 1280px for optimal readability, while sidebars and utility panels are fluid. 

- **The 4px Rhythm:** All spacing (padding, margins, internal gaps) must be a multiple of 4px. 
- **Internal Padding:** Use 16px (md) for standard card padding and 24px (lg) for major section spacing. 
- **Mobile Adaptation:** On mobile devices, side margins should shrink to 16px, and vertical gaps between "exam blocks" should be standardized to 12px to maximize vertical screen real estate.

## Elevation & Depth
Elevation is communicated through **tonal layering and crisp outlines**, never through soft drop shadows. 

1. **Level 0 (Background):** #0B0D1B. Used for the global application canvas.
2. **Level 1 (Cards/Containers):** #14172B with a 1px solid border of #1E233D. 
3. **Level 2 (Active/Hover):** When a card is hovered or active, the border color shifts to the primary accent (#6D28D9) or secondary accent (#0284C7).

To create a sense of depth, use "In-set" borders for input fields to make them appear carved into the surface. Floating elements (like tooltips or dropdowns) should use a slightly lighter background (#1E233D) to clearly distinguish them from the base surfaces.

## Shapes
In alignment with the utilitarian and "handcrafted" aesthetic, the design system uses a **Soft (0.25rem)** roundedness profile. This provides just enough softness to feel modern without sacrificing the structural, grid-heavy look.

- **Standard Elements:** Buttons, inputs, and small cards use 4px (0.25rem).
- **Large Containers:** Dashboard widgets and main content areas use 8px (0.5rem).
- **Interactive Triggers:** Selectable chips and tags maintain a 4px radius; avoid pill-shapes to keep the aesthetic "technical" rather than "lifestyle."

## Components
- **Buttons:** Use solid fills for primary actions (Electric Blue or Purple) with white text. Secondary buttons should be "Ghost" style: #14172B background with a 1px border.
- **Input Fields:** Dark background (#0B0D1B), 1px border (#1E233D). On focus, the border color must change to the primary accent with no outer glow.
- **Chips/Tags:** Use JetBrains Mono for text. Backgrounds should be low-opacity versions of the accent colors (e.g., 10% Emerald for "Easy" difficulty tags).
- **Exam Cards:** These should feature a header row with monospaced metadata, a divider line (#1E233D), and the body text below.
- **Data Visualization:** Use high-contrast lines. Area charts should have no gradient fills—only sharp, distinct lines to emphasize data precision over "eye candy."
- **Scrollbars:** Custom-styled to be thin, dark gray (#1E233D), and rectangular to match the UI's structural rigidity.