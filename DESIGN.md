# Dao Design

## 1. Design Direction

Dao is a calm, focused, developer-native workspace for long-term growth.

The visual system should communicate:

- clarity
- discipline
- growth
- craftsmanship
- long-term accumulation
- modern engineering
- subtle Chinese cultural identity

Dao should avoid visual clichés such as brush strokes, dragons, red-and-gold festival colors, excessive ink effects, or ornamental patterns.

The design should feel like:

```txt
a quiet developer workspace
with a strong sense of growth, order, and focus
```

## 2. Brand Keywords

```txt
Calm
Focused
Precise
Crafted
Local-first
AI-native
Developer-native
Long-term
Jade
Growth
Path
Principle
```

## 3. Meaning of “Dao”

“Dao” comes from the Chinese concept of “道”.

In this product, Dao represents more than a road or path. It also means:

- method
- principle
- order
- discipline
- practice
- long-term mastery
- the way a person grows through repeated effort

This meaning should guide the design system.

Dao should look modern and international, while quietly carrying the idea of Chinese “道” through form, motion, rhythm, and restraint.

## 4. Visual Identity Principle

```txt
Neutral-first.
Jade for intention.
```

Most of the UI should stay neutral, quiet, and readable.

Jade green should appear only where the user needs focus, direction, progress, or confirmation.

The brand should feel premium through restraint rather than decoration.

## 5. Logo Direction

## 5.1 English Wordmark

The English wordmark uses the lowercase form:

```txt
dao
```

The style should be:

- bold
- rounded
- geometric
- minimal
- friendly but technical
- easy to recognize at small sizes

The current English logo direction uses:

- dark neutral letters for `d` and `o`
- jade green for the center `a`
- rounded, modular shapes
- strong negative space

This creates a memorable identity while connecting the brand to growth and flow.

## 5.2 Chinese Logo

The Chinese logo uses the character:

```txt
道
```

The Chinese mark should follow the same visual logic as the English logo:

- thick geometric strokes
- rounded terminals
- simplified structure
- dark neutral base
- jade green accent
- high recognizability
- no calligraphy
- no brush texture
- no traditional stereotype

The jade accent can be applied to the inner structure of the character to echo the green `a` in the English wordmark.

The Chinese mark should be used as:

- app icon
- splash screen mark
- Chinese brand variant
- social avatar
- documentation favicon candidate

## 5.3 Logo Personality

The logo should feel:

```txt
modern
calm
strong
memorable
culturally aware
developer-focused
```

It should not feel:

```txt
religious
mystical
touristic
calligraphic
overly decorative
generic SaaS
```

## 6. Color Palette

## 6.1 Core Palette

| Role | Name | Hex | Usage |
|---|---|---:|---|
| Primary Accent | Jade Green | `#00A86B` | Focus, active states, progress, key brand moments |
| Accent Hover | Soft Jade | `#34C38F` | Hover, selected surfaces, subtle highlights |
| Dark Base | Ink Black | `#111827` | Main text, dark UI, logo dark tone |
| Dark Surface | Deep Navy | `#0B1220` | App chrome, dark mode background |
| Soft Background | Warm Ivory | `#F7F4ED` | Light mode background, brand surfaces |
| Text | Soft Charcoal | `#2B2F36` | Primary text in light mode |
| Border | Stone Gray | `#9CA3AF` | Borders, inactive UI, metadata |
| Light Border | Mist Gray | `#E5E7EB` | Dividers, subtle UI boundaries |

## 6.2 Color Usage Ratio

Use this approximate balance:

```txt
70% neutral surfaces
20% gray structure
10% jade accent
```

Jade should feel intentional. It should not dominate the whole interface.

## 6.3 Jade Green

```txt
#00A86B
```

Jade green is the emotional core of Dao.

It supports:

- growth
- calm energy
- focus
- vitality
- Chinese cultural identity
- long-term cultivation

Use Jade Green for:

- active navigation state
- focus ring
- selected command
- primary progress
- successful completion
- AI-ready status
- important call-to-action
- logo accent

Avoid using Jade Green for:

- large backgrounds
- every button
- every icon
- dense text
- decorative gradients

## 6.4 Light Mode Tokens

```css
:root {
  --color-bg: #F7F4ED;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F2EFE8;
  --color-text: #2B2F36;
  --color-text-muted: #6B7280;
  --color-border: #E5E7EB;
  --color-border-strong: #9CA3AF;
  --color-accent: #00A86B;
  --color-accent-hover: #34C38F;
  --color-focus: rgba(0, 168, 107, 0.28);
}
```

## 6.5 Dark Mode Tokens

```css
.dark {
  --color-bg: #0B1220;
  --color-surface: #111827;
  --color-surface-muted: #1F2937;
  --color-text: #E5E7EB;
  --color-text-muted: #9CA3AF;
  --color-border: #1F2937;
  --color-border-strong: #374151;
  --color-accent: #00A86B;
  --color-accent-hover: #34C38F;
  --color-focus: rgba(0, 168, 107, 0.35);
}
```

## 7. Typography

## 7.1 Typography Goal

Because “Dao” is a short name, typography carries a large part of the brand personality.

The typography should communicate:

- clarity
- precision
- quiet confidence
- developer-tool maturity
- long-form readability

## 7.2 Recommended Font Stack

| Usage | Typeface |
|---|---|
| Brand / Headings | Geist |
| UI Body | Inter |
| Code / Technical surfaces | JetBrains Mono |

## 7.3 Brand Typeface

Use **Geist** for:

- wordmark
- landing page headings
- key product messaging
- dashboard headings

Why Geist works:

- modern
- clear
- technical
- restrained
- suitable for developer tools

## 7.4 UI Body Typeface

Use **Inter** for:

- app UI
- body text
- settings
- tables
- forms
- documentation

Inter provides strong readability and scales well across dense interfaces.

## 7.5 Code Typeface

Use **JetBrains Mono** for:

- code blocks
- shortcuts
- command palette metadata
- logs
- AI tool execution traces
- developer-facing details

## 7.6 Typography Rules

Use:

```txt
clear hierarchy
moderate letter spacing
compact line height
strong readability
```

Avoid:

```txt
overly futuristic fonts
decorative Chinese-style fonts
large SaaS-style hero typography inside the app
excessive tracking in body text
```

## 8. UI Style

## 8.1 Interface Personality

Dao should feel closer to:

- Linear
- Raycast
- Cursor
- Arc
- Obsidian

than to a generic SaaS dashboard.

The app should feel:

```txt
dense enough for developers
quiet enough for long sessions
structured enough for complex work
```

## 8.2 Layout Direction

Avoid a generic card-heavy dashboard.

Prefer:

- focused workspace layout
- compact sidebar
- strong command palette
- project-centered navigation
- editor-like surfaces
- subtle panels
- clear hierarchy
- keyboard-first interactions

## 8.3 Density

Dao should use medium-high information density.

Recommended direction:

```txt
compact controls
moderate spacing
small radius
minimal shadows
clear borders
```

This helps Dao feel like a serious tool rather than a marketing template.

## 8.4 Radius

Recommended radius scale:

```css
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

Use:

- `4px–8px` for controls
- `8px–12px` for panels
- `16px` only for app icon / large brand surfaces

Avoid overly large rounded corners in the main application UI.

## 8.5 Shadow

Use shadows sparingly.

Prefer:

- borders
- surface contrast
- subtle elevation
- background layering

Recommended shadow:

```css
--shadow-popover: 0 12px 32px rgba(15, 23, 42, 0.12);
--shadow-dialog: 0 20px 60px rgba(15, 23, 42, 0.22);
```

Avoid heavy card shadows.

## 9. Component System

Dao uses:

```txt
Base UI + Tailwind CSS + custom Dao design system
```

Base UI provides accessible headless primitives.

Dao should define its own component layer instead of importing Base UI directly inside business pages.

## 9.1 Recommended Component Package

```txt
packages/ui/
  Button.jsx
  Input.jsx
  Textarea.jsx
  Dialog.jsx
  Dropdown.jsx
  Tabs.jsx
  Tooltip.jsx
  Command.jsx
  Badge.jsx
  Sidebar.jsx
  Panel.jsx
```

Business code should import from `packages/ui`.

## 9.2 Component Design Rules

Components should be:

- accessible
- compact
- keyboard-friendly
- visually quiet
- consistent across light/dark mode
- easy to compose

## 9.3 Button

Button variants:

```txt
primary
secondary
ghost
danger
icon
```

Primary button should use Jade Green only for important actions.

Most common actions can use neutral buttons.

## 9.4 Input

Input should feel precise and calm.

Recommended style:

```txt
small radius
clear border
subtle focus ring
no heavy shadows
```

Focus ring:

```css
box-shadow: 0 0 0 3px rgba(0, 168, 107, 0.28);
```

## 9.5 Command Palette

Command palette is a core Dao interaction.

It should feel fast, dense, and developer-native.

Shortcut:

```txt
Cmd/Ctrl + K
```

Command palette should support:

- quick search
- create project
- create task
- create note
- switch workspace
- extension commands
- AI commands later

Visual rules:

- dark mode should feel premium
- selected item uses subtle jade highlight
- metadata uses muted text
- keyboard hints use JetBrains Mono

## 10. Motion

Motion should be minimal and functional.

Motion principles:

```txt
fast
subtle
directional
useful
```

Recommended durations:

```css
--motion-fast: 120ms;
--motion-base: 180ms;
--motion-slow: 240ms;
```

Use motion for:

- command palette opening
- dialog appearance
- selected state transitions
- sidebar hover
- progress feedback

Avoid:

- bouncy animations
- decorative page transitions
- excessive hover effects
- AI-themed glowing animations

## 11. Iconography

Icon style should be:

- simple
- outline-based
- geometric
- consistent stroke width
- minimal

Recommended icon library:

```txt
Lucide
```

Icon stroke width:

```txt
1.75px or 2px
```

Use jade for active icons only.

Most icons should use muted neutral colors.

## 12. App Icon Direction

The app icon should use the Chinese `道` mark or a simplified geometric Dao symbol.

Recommended app icon style:

- rounded square container
- dark background
- jade accent
- simplified character mark
- high contrast
- recognizable at 16px

Icon backgrounds:

```txt
Dark: #111827
Light: #F7F4ED
```

The icon should remain clear at:

```txt
16px
32px
64px
128px
256px
512px
```

## 13. Brand Applications

## 13.1 GitHub README

Use:

- English wordmark
- short tagline
- clean product screenshot
- architecture diagram
- build status badges
- minimal color usage

## 13.2 Landing Page

Landing page should feel editorial and product-focused.

Hero copy example:

```txt
Dao is an AI-native workspace for developer growth.
```

Supporting copy:

```txt
Manage projects, tasks, notes, and long-term engineering context in one local-first workspace.
```

## 13.3 Social Preview

Social preview should include:

- Dao logo
- tagline
- calm neutral background
- one product screenshot or abstract UI block
- jade accent

## 14. Do / Don’t

## 14.1 Do

- use jade intentionally
- keep interfaces calm
- prefer structure over decoration
- create compact developer-focused layouts
- use typography as a brand tool
- keep Chinese cultural references subtle
- make command palette feel excellent
- design for long daily usage

## 14.2 Don’t

- use brush stroke clichés
- use red-and-gold festival colors
- make everything green
- copy default shadcn/ui style
- build a generic SaaS dashboard
- use heavy gradients
- overuse shadows
- make the app look like a meditation product
- make the brand feel mystical or religious

## 15. Product Screens to Design First

Prioritize these screens:

```txt
1. App shell
2. Dashboard
3. Project list
4. Project detail
5. Task list
6. Note editor
7. Command palette
8. Settings
```

The first polished screen should be the app shell with sidebar and command palette.

This screen defines the whole product feeling.

## 16. Design Success Criteria

Dao’s design is successful when:

- it is recognizable without looking loud
- it feels different from generic AI tools
- it feels usable for long coding sessions
- it carries Chinese cultural meaning without stereotypes
- it looks like a real developer product
- it works in both light and dark mode
- the jade accent feels intentional
- the UI remains scalable as features grow

## 17. Current Design Decision

Dao should use:

```txt
Base UI + Tailwind CSS
Custom Dao UI layer
Jade Green #00A86B as primary accent
Neutral-first interface
Geist / Inter / JetBrains Mono typography
Geometric English and Chinese logo system
```

The overall design direction is:

```txt
A calm, jade-accented developer workspace inspired by long-term growth and the Chinese idea of Dao.
```
