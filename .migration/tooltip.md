# tooltip

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: tooltip is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/tooltip.jsx:1` imports `@base-ui/react/tooltip`; the final Base composition is `Portal > Positioner > Popup`.
- `apps/web/src/components/ui/tooltip.jsx:6` exposes the Base `delay` provider contract, and `apps/web/src/components/ui/tooltip.jsx:28` applies Lisse to the popup.
- The decorative arrow was removed: Base UI requires Arrow to be nested in Popup, while Lisse clips Popup descendants, so retaining it would produce invalid or visibly clipped geometry.
- `apps/web/src/lib/lisse.test.jsx` exercises real Base UI hover mounting and verifies the portaled popup receives its shadcn slot and Lisse corner contract.
- `.migration/tooltip.md:1` records the delay/interaction deltas and checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/tooltip.jsx` returned no matches on 2026-07-24.

## Left alone

- Tooltip trigger contents and accessible labels stay at consumer call sites.
- No decorative arrow fallback is kept outside Popup; doing so would violate Base UI anatomy.

## Behavior changes

- Radix `delayDuration` becomes Base UI `delay`; the Radix skip-delay concept is not available.
- Radix `disableHoverableContent` has no direct Base UI equivalent and must remain a flagged consumer behavior if it was used.
- Positioning and open callbacks use Base Positioner/event-details semantics.

## Verify by hand

- Focus and hover the trigger, move the pointer between trigger and popup, and judge the configured delay/close feel.
- Open near all viewport edges and confirm collision handling, stable gap from the trigger, Escape dismissal, and focus stability without an arrow.
- Inspect Lisse popup clipping with one-line and wrapped content. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
