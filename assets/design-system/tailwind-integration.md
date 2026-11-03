# Tailwind v4 Integration — SGM Console Tokens

Source of truth: `../design-tokens.css` (153 vars, 3 layers) generated from `../design-tokens.json`.
Frontend: Next.js 16 + Tailwind v4 — `frontend/src/app/globals.css` uses `@theme inline`.

> **Status: NOT applied to the live app.** The dashboard's dark theme is deliberately "Ash"
> (REAPER-style warm greys + matte orange, `globals.css` `.dark` block), which is a different
> skin. SGM Console tokens serve the marketing assets (slides, decks, one-pagers).
> Adopt when the marketing site is built or a brand-native dashboard skin is wanted.

## Why not the generator's `-f tailwind` output

`generate-tokens.cjs --format tailwind` emits Tailwind **v3** `module.exports = { colors: { 'foreground.secondary': ... } }`.
Dotted keys are invalid utility names and v4 has no `tailwind.config.ts`. Discard it; use the v4 block below.

## Mapping — paste into `globals.css`

Add inside the existing `@theme inline {}` block (right side refs the shadcn `:root`/`.dark` vars):

```css
/* SGM Console (marketing brand) — keep separate from Ash dashboard vars */
--color-vu: #e85d04;
--color-vu-hover: #ff7a1a;
--color-vu-deep: #b84703;
--color-vu-amber: #f59e0b;
--color-steel-0: #f4f5f7;
--color-steel-1: #e2e5ea;
--color-steel-2: #c5cad3;
--color-steel-3: #9aa3af;
--color-steel-4: #6f7680;
--color-ink-0: #0b0d12;
--color-ink-1: #12141a;
--color-ink-2: #1c222c;
--color-signal: #0d9488;
--color-signal-hover: #14b8a6;
--font-display: "Space Grotesk", system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
--radius-console: 2px;
--ease-console: cubic-bezier(0.22, 1, 0.36, 1);
```

Then `bg-vu`, `text-steel-2`, `font-display`, `rounded-[--radius-console]` etc. work as utilities.

## Semantic aliases for shadcn/base — only if adopting Console as the app skin

```css
:root, .dark {
  --background: #0b0d12;
  --foreground: #f4f5f7;
  --card: #1c222c;
  --card-foreground: #f4f5f7;
  --primary: #e85d04;
  --primary-foreground: #0b0d12;
  --secondary: #14b8a6;
  --secondary-foreground: #f4f5f7;
  --muted: #1c222c;
  --muted-foreground: #9aa3af;
  --accent: #0d9488;
  --accent-foreground: #f4f5f7;
  --destructive: #dc2626;
  --border: #1c222c;
  --input: #12141a;
  --ring: #e85d04;
  --radius: 0.125rem; /* console 2px */
}
```

Swap the Google Fonts imports (`@fontsource/variable/inter` stays; add Space Grotesk
via `next/font` in `layout.tsx`).

## Read-only bindings (recommended; reuses all 153 tokens verbatim)

Add `assets/design-tokens.css` to the frontend without retheming:
`import "../../../assets/design-tokens.css"` in `frontend/src/app/page.tsx` or
`frontend/src/app/layout.tsx`, then reference `var(--color-primary)` etc. directly in
marketing components. No shadcn coupling, no migration.