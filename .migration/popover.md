# popover

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: popover is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/popover.jsx:1` imports `@base-ui/react/popover`; `apps/web/src/components/ui/popover.jsx:28` uses the Base `Portal > Positioner > Popup` shape supplied by the golden pair.
- `apps/web/src/components/ui/popover.jsx:14` keeps positioning props on the Positioner, and `apps/web/src/components/ui/popover.jsx:23` applies Lisse to the popup ref.
- Base UI Title and Description parts remain available for accessible structured content.
- `.migration/popover.md:1` records positioning and focus deltas.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/popover.jsx` returned no matches on 2026-07-24.

## Left alone

- Popover trigger content and controlled state remain consumer-owned.
- No former Radix Anchor shim is retained; consumers needing a custom anchor must use the Base Positioner anchor contract.

## Behavior changes

- Positioning props now live on Base UI Positioner, whose collision/arrow padding defaults differ from Radix.
- Auto-focus/dismiss callbacks use Base `initialFocus`, `finalFocus`, and root event-details reasons rather than Radix interaction events.
- A modal Base popover requires a close control in the popup to preserve an escape path.

## Verify by hand

- Open by pointer and keyboard near every viewport edge; confirm flip/shift behavior and trigger alignment.
- Tab through interactive content, close with Escape/outside press, and verify final focus.
- Inspect popup Lisse clipping during enter/exit animation and at narrow widths. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
