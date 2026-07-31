# field

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the shadcn Base-style field composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/field.jsx:9` provides the native `fieldset`/legend/group composition delivered by the Base golden pair and composes the native Label and Separator wrappers.
- `apps/web/src/components/ui/field.jsx:87` applies the shared Lisse ref to the selectable field-label surface without introducing CSS radius.
- Error normalization and stable exports for `Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, and related parts are retained.
- `.migration/field.md:1` records the native composition and verification scope.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/field.jsx` returned no matches on 2026-07-24.

## Left alone

- This shadcn field helper is native React markup rather than a Radix primitive; no unnecessary Base UI Field abstraction was introduced.
- Form schemas, submit handlers, and validation policy remain consumer-owned.

## Behavior changes

None in the wrapper itself; consumers still need to verify native label/control association and error announcement.

## Verify by hand

- Tab through a field group and activate each control through its label.
- Trigger one and multiple validation errors, checking `aria-describedby`, visual invalid state, and error announcement.
- Exercise horizontal/responsive orientations and verify any selectable field-label surface keeps its Lisse geometry and focus outline. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
