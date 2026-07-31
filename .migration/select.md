# select

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: select is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/select.jsx:1` imports `@base-ui/react/select`, and `apps/web/src/components/ui/select.jsx:7` keeps the Base generic Root as a bare re-export.
- `apps/web/src/components/ui/select.jsx:30` applies Lisse to the trigger, `apps/web/src/components/ui/select.jsx:71` uses Base `Portal > Positioner > Popup > List`, and `apps/web/src/components/ui/select.jsx:110` applies Lisse to items.
- Group, GroupLabel, item text/indicator, separator, and scroll-arrow anatomy follows the Base golden pair; icons come from Tabler.
- `.migration/select.md:1` records nullable values, positioning, and keyboard checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/select.jsx` returned no matches on 2026-07-24.

## Left alone

- Options/items are supplied by consumers through the Base Root `items` contract; domain value schemas remain consumer-owned.
- No Radix `position` compatibility prop is retained.

## Behavior changes

- Base UI `onValueChange` can emit `null` and an event-details argument.
- Radix `position="popper"`/`"item-aligned"` maps to Base `alignItemWithTrigger`; callers must use the Base wrapper contract.
- Base collision padding and typeahead behavior should be rechecked with real option data.

## Verify by hand

- Open with pointer, Space, Enter, and Arrow keys; navigate with typeahead, Home/End, and select an item.
- Test grouped, disabled, long, and scrollable option lists near every viewport edge.
- Clear/reset the value if supported and confirm null handling, focus return, and Lisse geometry on trigger, popup, and items. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
