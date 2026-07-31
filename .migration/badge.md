# badge

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the polymorphic badge wrapper is Base-compatible and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/badge.jsx:1` uses Base UI `mergeProps` and `useRender`, preserving shadcn's polymorphic `render` API without a Radix Slot.
- `apps/web/src/components/ui/badge.jsx:30` composes the forwarded ref with Lisse before rendering the badge, so its pill/compact geometry comes from the shared Lisse corner policy.
- `.migration/badge.md:1` records the component-specific evidence and QA.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/badge.jsx` returned no matches on 2026-07-24.

## Left alone

- Badge consumers keep the public `Badge` and `badgeVariants` exports; their visual use is part of the app-level sweep in `.migration/project.md`.
- `apps/web/src/lib/lisse.jsx` remains the single shared implementation of smooth corners.

## Behavior changes

- Polymorphism now uses Base UI's `render` contract rather than Radix `asChild`; consumers must pass an element through `render`.

## Verify by hand

- Render every badge variant with text and an icon and confirm alignment, color, and focus/hover styles.
- Render a badge through the `render` prop and verify consumer props and refs land on the final element.
- Check a short and a long badge at multiple zoom levels; the Lisse pill edge should not flatten or clip. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
