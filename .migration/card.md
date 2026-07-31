# card

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style native card composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/card.jsx:4` keeps shadcn's native semantic card parts while `apps/web/src/components/ui/card.jsx:6` renders the outer surface through `LisseSurface`.
- The CLI overwrite retained the `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, and `CardFooter` public exports expected by consumers.
- `.migration/card.md:1` records why this component has no external primitive import.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/card.jsx` returned no matches on 2026-07-24.

## Left alone

- Card subparts stay native because neither Radix nor Base UI owns this presentational composition.
- App-specific card layouts and content remain consumer concerns tracked by the project sweep.

## Behavior changes

None.

## Verify by hand

- Render a card with every subpart, a long title, actions, and a footer; verify grid alignment and text wrapping.
- Resize the card and inspect its border, shadow, and clipped descendants at all four corners.
- Confirm the outer shape is marked by the Lisse adapter and no child content is unintentionally clipped. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
