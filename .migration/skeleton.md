# skeleton

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style skeleton wrapper is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/skeleton.jsx:4` keeps the shadcn native loading placeholder.
- `apps/web/src/components/ui/skeleton.jsx:6` renders its visible shape through `LisseSurface`, so arbitrary consumer sizes do not use CSS radius.
- `.migration/skeleton.md:1` records the presentational rationale and checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/skeleton.jsx` returned no matches on 2026-07-24.

## Left alone

- Loading state timing, announcement, and layout reservation remain consumer responsibilities.
- No external primitive is needed for a non-interactive placeholder.

## Behavior changes

None.

## Verify by hand

- Render line, avatar-like, and panel skeletons at small and large dimensions.
- Confirm animation respects the app's reduced-motion policy.
- Resize dynamically and verify Lisse recomputes the intended geometry without layout jump or clipped animation. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
