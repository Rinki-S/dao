# separator

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite · Verdict: separator is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/separator.jsx:1` imports `@base-ui/react/separator`, preserving horizontal and vertical orientation through the Base golden pair.
- `apps/web/src/components/ui/separator.jsx:5` forwards the shadcn wrapper contract and Base data attributes.
- `.migration/separator.md:1` records the semantic delta and checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/separator.jsx` returned no matches on 2026-07-24.

## Left alone

- Lisse is not applied because the separator is a straight one-pixel rule with no visible rounded geometry.
- Layout-specific spacing remains at consumer call sites.

## Behavior changes

- Radix's `decorative` prop is not part of the Base UI Separator contract; consumers must verify whether the separator should be announced or purely presentational.

## Verify by hand

- Inspect horizontal and vertical separators in light/dark themes and at high zoom.
- Verify surrounding flex/grid layouts do not collapse the requested orientation.
- Check the accessibility tree for both semantic and decorative usages. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
