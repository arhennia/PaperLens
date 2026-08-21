---
name: Stand Up Theme
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#424752'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#737783'
  outline-variant: '#c3c6d4'
  surface-tint: '#1f5bb7'
  primary: '#00377d'
  on-primary: '#ffffff'
  primary-container: '#004da9'
  on-primary-container: '#aac3ff'
  inverse-primary: '#aec6ff'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd6b2a'
  on-secondary-container: '#5b1c00'
  tertiary: '#003e5e'
  on-tertiary: '#ffffff'
  tertiary-container: '#005681'
  on-tertiary-container: '#89cbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#aec6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#802a00'
  tertiary-fixed: '#cbe6ff'
  tertiary-fixed-dim: '#8fcdff'
  on-tertiary-fixed: '#001e30'
  on-tertiary-fixed-variant: '#004b71'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style

This design system is built on a foundation of empowerment, clarity, and bold advocacy. It is designed to inspire action and confidence, making it ideal for platforms focused on social impact, education, or community engagement. 

The visual style is **High-Contrast / Bold** with elements of **Corporate Modernism**. It utilizes a vibrant, high-energy palette paired with clean, geometric structures. The aesthetic is loud and expressive but maintains a professional structural integrity. Visual interest is generated through large typography, playful illustrative iconography, and a rhythmic use of primary colors against crisp white backgrounds.

## Colors

The color palette is anchored by a deep, authoritative **Stand Up Blue** (#004DA9) and balanced by a high-energy **Action Orange** (#F66625). 

- **Primary Blue (#004DA9):** Used for primary actions, headers, and brand-heavy backgrounds.
- **Secondary Orange (#F66625):** Reserved for high-priority CTAs, alerts, and accent details to draw immediate attention.
- **Tertiary Cyan (#12AFFF):** Used for interactive secondary elements, links, and illustrative accents.
- **Surface & Neutrals:** Surfaces are primarily white (#FFFFFF) to ensure maximum legibility for the bold palette. Neutrals (#737373 and #D9D9D9) are used for secondary text and subtle borders.

## Typography

The design system exclusively uses **Montserrat** to achieve a modern, geometric, and highly legible feel. 

Typography is utilized as a primary design element. Headlines should be set with tight tracking and heavy weights (Bold or ExtraBold) to convey strength. Body copy maintains generous line heights for readability. Use the uppercase label style for section headers and small navigational elements to maintain an organized, systematic hierarchy.

## Layout & Spacing

This design system employs a **Fluid Grid** model with a standard 12-column layout for desktop and a 4-column layout for mobile. 

The spacing rhythm is based on an 8px scale, ensuring consistent alignment across all components. Layouts should favor generous vertical white space (using `lg` and `xl` tokens) to allow the bold typography and colors to breathe. On desktop, content is contained within a max-width of 1280px, while on mobile, the layout stretches edge-to-edge with a 16px safe margin.

## Elevation & Depth

Hierarchy is established primarily through **Tonal Layering** and **Bold Outlines** rather than complex shadows.

- **Flat Surfaces:** Most cards and containers sit flat on the background with a 1px border (#D9D9D9).
- **Active Elevation:** When an element requires depth (like a modal or a floating action button), use a crisp, low-blur shadow with a slight blue tint (e.g., `0px 4px 12px rgba(0, 77, 169, 0.1)`) to maintain the brand's color integrity.
- **Overlays:** Use semi-transparent white or Primary Blue (at 90% opacity) for full-screen overlays to keep the focus sharp and high-contrast.

## Shapes

The shape language is **Rounded**, striking a balance between the friendliness of circles and the efficiency of squares. 

- **Containers & Cards:** Use a 0.5rem (8px) radius as the standard.
- **Buttons:** Large buttons can use the `rounded-xl` (1.5rem) setting or even a full pill-shape to distinguish them from structural content containers.
- **Icons:** Icons should feature rounded terminals and consistent stroke weights to match the Montserrat letterforms.

## Components

- **Buttons:** Primary buttons use the Primary Blue background with white text. Secondary buttons use a thick 2px outline of Action Orange. Use `ExtraBold` weight for button labels.
- **Chips & Tags:** Use light-tint backgrounds (e.g., Cyan at 10% opacity) with Primary Blue text for categorization.
- **Input Fields:** Use a 1px neutral border that transitions to a 2px Primary Blue border on focus. Labels should always sit above the input in `label-bold`.
- **Cards:** White backgrounds with an 8px corner radius. Use the Action Orange for small accent bars or icons within the card to denote status or type.
- **Speech Bubbles:** A signature component of this system. Use for quotes, tooltips, or callouts, featuring a distinct "tail" and high-contrast background (either Cyan or White).