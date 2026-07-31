# label

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite using the native-label target rule · Verdict: the Radix Label dependency is removed from this wrapper and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/label.jsx:3` renders a native `<label>`, the documented Base migration target for Radix Label because Base UI has no standalone counterpart.
- The golden pair's styling and `htmlFor` passthrough remain available through the native element.
- `.migration/label.md:1` records the deliberate native replacement.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/label.jsx` returned no matches on 2026-07-24.

## Left alone

- Labels nested in the shadcn Field helper continue using this native wrapper; no Base UI Field dependency was forced into unrelated forms.
- Lisse is not applied because the label wrapper has no visible rounded geometry.

## Behavior changes

- Radix Label's double-click text-selection prevention is not inherent to a native label. Add `select-none` only where product behavior requires it.

## Verify by hand

- Click label text for text inputs, checkboxes, and other associated controls; the correct control must receive focus or toggle.
- Verify `htmlFor`, disabled styling, nested labels, and screen-reader naming.
- Double-click label text and confirm native selection behavior is acceptable. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
