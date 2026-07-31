# input-group

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style input-group composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/input-group.jsx:9` composes the migrated Button, Input, and Textarea wrappers using the shadcn Base golden pair.
- `apps/web/src/components/ui/input-group.jsx:11` renders the shared group shell through `LisseSurface`, centralizing the visible clipped geometry.
- Addon, button, text, input, and textarea exports preserve the registry API used by consumers.
- `.migration/input-group.md:1` records the composition and geometry checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/input-group.jsx` returned no matches on 2026-07-24.

## Left alone

- Input and Textarea primitive behavior stays in their dedicated wrappers; the group only composes them.
- Consumer-specific validation, search, and submit behavior is tracked by the app-level sweep.

## Behavior changes

None.

## Verify by hand

- Render inline-start/end and block-start/end addons with text, icons, and buttons.
- Type into single-line and multiline group controls; confirm focus ring, disabled state, and click targeting across the joined surface.
- Resize content and inspect Lisse clipping around every edge without double-rounded children. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
