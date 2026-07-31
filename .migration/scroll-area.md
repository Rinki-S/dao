# scroll-area

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: scroll-area is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/scroll-area.jsx:1` imports `@base-ui/react/scroll-area` and uses Base Root, Viewport, Scrollbar, Thumb, and Corner parts.
- `apps/web/src/components/ui/scroll-area.jsx:26` applies Lisse to the scrollbar thumb rather than using CSS radius.
- `.migration/scroll-area.md:1` records the scroll-family behavior and interaction checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/scroll-area.jsx` returned no matches on 2026-07-24.

## Left alone

- The scroll viewport itself has no rounded surface in this wrapper, so Lisse is limited to the visible thumb.
- Consumer sizing and overscroll policy remain outside this primitive report.

## Behavior changes

- Radix ScrollArea's `type` prop is not part of the Base UI contract; scrollbar visibility follows the Base wrapper/CSS behavior.

## Verify by hand

- Scroll vertically and horizontally with wheel, trackpad, keyboard, and by dragging each thumb.
- Verify nested content, RTL if supported, and scrollbar appearance/disappearance near content limits.
- Check thumb hit area and Lisse geometry at small sizes; focus/scrollbars must not be clipped by unrelated surfaces. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
