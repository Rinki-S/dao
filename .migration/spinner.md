# spinner

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite · Verdict: the Base-style spinner wrapper is installed with Tabler Icons and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/spinner.jsx:1` keeps the shadcn native loading-indicator wrapper and `apps/web/src/components/ui/spinner.jsx:2` uses Tabler's loader glyph.
- The component preserves accessible status semantics from the golden pair without adding an unrelated primitive.
- `.migration/spinner.md:1` records the presentational migration and checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/spinner.jsx` returned no matches on 2026-07-24.

## Left alone

- Button loading state remains an explicit `Spinner` plus `disabled` composition at consumers.
- Lisse is not applied because the spinner has no bounded rounded surface; its circular motion is icon geometry, not CSS border radius.

## Behavior changes

None.

## Verify by hand

- Render the spinner alone and inside disabled buttons at each supported size.
- Confirm status text is available to assistive technology without adding visible duplicate copy.
- Check animation, alignment, and reduced-motion behavior in light/dark themes. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
