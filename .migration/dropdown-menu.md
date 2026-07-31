# dropdown-menu

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the dropdown wrapper uses Base UI Menu and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/dropdown-menu.jsx:1` imports `@base-ui/react/menu`; the golden pair supplies `Portal > Positioner > Popup`, group, submenu, checkbox, and radio structures.
- `apps/web/src/components/ui/dropdown-menu.jsx:29` applies Lisse to popup content and item-like parts beginning at `apps/web/src/components/ui/dropdown-menu.jsx:73`.
- Submenu triggers use Base UI's `data-popup-open` state attribute; every current production radio-menu consumer passes `closeOnClick` when a one-shot selection should dismiss the menu.
- Submenu and checked indicators use Tabler icons, and public shadcn wrapper names remain stable.
- `.migration/dropdown-menu.md:1` records the menu behavior deltas and manual checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/dropdown-menu.jsx` returned no matches on 2026-07-24.

## Left alone

- Menu command callbacks and business actions remain in consumers; this report does not claim to change their logic.
- Shared Lisse and Button implementations are reused rather than duplicated.

## Behavior changes

- Base UI menu checkbox and radio items default `closeOnClick` to false; Radix closed after selection. Dao's task form and Markdown block selector now opt into `closeOnClick` explicitly.
- Consumers must use `render` instead of `asChild`, and click/change callbacks may receive Base UI event details.

## Verify by hand

- Open the menu with pointer and keyboard, then navigate with Arrow keys, Home/End, typeahead, Enter, and Escape.
- Open submenus in both directions near a window edge and confirm positioning plus focus return.
- Toggle checkbox and radio items and validate each consumer's explicit close behavior; inspect popup/item Lisse geometry.
- Runtime QA on 2026-07-24 confirmed the task project's radio menu closes after selection, restores the selected label, and mounts a `data-state="ready"` Lisse popup with a non-empty `clip-path`. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
