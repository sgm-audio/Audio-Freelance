# Component Specs — Audio-Freelance Design System

Brand: **SGM Studios · Console** (steel / ink / VU amber). Dark surfaces, 2px radii, no purple, no neon glow.
Source of truth: `assets/design-tokens.css` — components must reference **component tokens** (`--button-*`, `--card-*`, `--badge-*`, `--input-*`), never raw values.

## Button (Primary)

| Property | Default | Hover | Active | Focus | Disabled |
|----------|---------|-------|--------|-------|----------|
| Background | `--button-primary-bg` | `--button-primary-bg-hover` | `--button-primary-bg-hover` (no shift) | same as default | surface-elevated |
| Text | `--button-primary-fg` | `--button-primary-fg` | `--button-primary-fg` | `--button-primary-fg` | `--color-foreground-muted` |
| Border | none | none | none | 2px `--color-ring` | none |
| Shadow | `--button-primary-shadow` | none | none | none | none |
| Radius | `--button-primary-radius` | — | — | — | — |
| Padding | `--button-primary-padding-x` / `--button-primary-padding-y` | — | — | — | — |

Feedback ordering: **transform → shadow → background**. Hover brightens (`bg-hover`), active removes the glow shadow, focus draws the ring, disabled drops contrast and removes pointer events.

### Variants

| Variant | Background | Text | Border | Use |
|---------|-----------|------|--------|-----|
| `primary` | `--color-primary` | `--color-primary-foreground` | none | single call-to-action per view |
| `secondary` | transparent | `--color-secondary` | 2px `--color-secondary` | paired / ghost action on dark |
| `outline` | transparent | `--color-foreground` | 1px `--color-border` | mid-weight action |
| `ghost` | transparent | `--color-foreground-secondary` | none | inline / toolbar action |
| `destructive` | `--color-destructive` | `--color-foreground` (steel-0) | none | irreversible action |

## Card

| Property | Default | Hover | Active | Disabled |
|----------|---------|-------|--------|----------|
| Background | `--card-bg` | `--card-bg` | `--card-bg` | `--color-surface` |
| Border | `--card-border` | `--card-border-hover` | `--card-border` | `--card-border` (50% opacity) |
| Radius | `--card-radius` | — | — | — |
| Padding | `--card-padding` | — | — | — |
| Shadow | `--card-shadow` | `--primitive-shadow-lg` | `--card-shadow` | none |

Hover is **border-tint only** (VU ring), active snaps back, disabled shows as flat surface. Never stacks multiple raised shadows (violates Console flatness).

## Input

| Property | Default | Focus | Valid | Invalid | Disabled |
|----------|---------|-------|-------|---------|----------|
| Background | `--input-bg` | `--input-bg` | `--input-bg` | `--input-bg` | `--color-surface` |
| Border | `--input-border` | 2px `--input-focus-ring` | 1px `--color-success` | 1px `--color-destructive` | `--color-surface-elevated` |
| Text | `--color-foreground` | — | — | — | `--color-foreground-muted` |
| Radius | `--input-radius` | — | — | — | — |
| Padding | `--input-padding-x` / `--input-padding-y` | — | — | — | — |

## Badge

| Property | Default | Hover | Variant change |
|----------|---------|-------|----------------|
| Background | `--badge-bg` | `--color-surface-elevated` | `--color-surface` |
| Text | `--badge-fg` | `--badge-fg` | `--color-primary` |
| Border | `--badge-border` | `--badge-border` | — |
| Radius | `--badge-radius` (`full`) | — | — |

Variants: **signal** (default, `--color-secondary` text), **vu** (`--color-primary` text + glow shadow), **neutral** (`--color-foreground-muted`). Used for slide section labels and lead-status chips.

## Spacing & Typography Scales

| Token family | Scale source |
|--------------|--------------|
| Spacing | `--primitive-spacing-*` (0 → 4rem, 4px base grid) |
| Font size | `--primitive-fontSize-*` (xs → 6xl) |
| Weight | `--primitive-fontWeight-*` (regular → extrabold) |
| Radius | `--primitive-radius-*` (0 → full; console 1–4px) |
| Duration / easing | `--primitive-duration-*` + `--primitive-easing-out` (`cubic-bezier(0.22, 1, 0.36, 1)`) |

## Rules

1. No raw hex/HSL in components — only `var(--token)`.
2. Interactive states come from component tokens (third layer), not semantic.
3. Opacity overrides for rgba must use brand-channel rgba (validator allow-list).
4. Keep gradient usage to `--primitive-gradient-primary` (VU amber) — never purple.