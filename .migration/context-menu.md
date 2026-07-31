# context-menu

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the context-menu wrapper uses Base UI's context-menu family and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/context-menu.jsx:1` imports `@base-ui/react/context-menu`; the Base golden pair supplies `Portal > Positioner > Popup`, submenu, checkbox, and radio anatomy.
- `apps/web/src/components/ui/context-menu.jsx:35` applies Lisse to the popup, while item-like parts starting at `apps/web/src/components/ui/context-menu.jsx:79` use the shared Lisse ref for visible selection geometry.
- `apps/web/src/components/ui/context-menu.jsx:115` uses Base UI's `data-popup-open` submenu-trigger state attribute.
- Tabler icons replace registry placeholders for submenu and checked-state indicators.
- `.migration/context-menu.md:1` records the family-specific behavior deltas and QA.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/context-menu.jsx` returned no matches on 2026-07-24.

## Left alone

- Native right-click invocation and application callbacks remain in consumers; this report covers only the wrapper contract.
- The shared Lisse adapter is reused, and non-menu app code is tracked in `.migration/project.md`.

## Behavior changes

- Base UI ContextMenu removes Radix's `modal` root prop and `disabled` trigger prop; consumers must gate disabled triggers themselves.
- Base UI checkbox and radio menu items default `closeOnClick` to false, unlike Radix's close-on-select behavior. No Dao production consumer currently uses these context-menu variants; future consumers must choose the behavior explicitly.
- Open/change callbacks use Base UI event details, and item selection uses click semantics rather than Radix `onSelect`.

## Verify by hand

- Right-click near each viewport edge and confirm the popup flips/shifts without detaching from the pointer.
- Navigate items and submenus with Arrow keys, typeahead, Enter, and Escape; verify focus restoration.
- Toggle checkbox/radio items and confirm whether the menu intentionally stays open; inspect Lisse popup and item geometry. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
