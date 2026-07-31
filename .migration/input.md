# input

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: input is backed by the Base UI Input primitive and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/input.jsx:1` imports `@base-ui/react/input`, matching the CLI's Base golden pair.
- `apps/web/src/components/ui/input.jsx:6` exposes an explicit corner selection and `apps/web/src/components/ui/input.jsx:7` composes the primitive ref through `useLisseRef`.
- `.migration/input.md:1` records the source evidence and control checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/input.jsx` returned no matches on 2026-07-24.

## Left alone

- Field labels, descriptions, validation messages, and input-group chrome stay in their respective wrappers.
- Value parsing and domain validation remain consumer responsibilities.

## Behavior changes

- Base UI input change/value callbacks may expose event details in Base-managed field contexts; ordinary native `onChange` use remains available.

## Verify by hand

- Test text, search, password, number, and file inputs with typing, selection, paste, and autofill.
- Verify focus-visible, disabled, read-only, invalid, and placeholder states.
- Inspect standalone and input-group rendering to ensure Lisse clips only the intended outer surface. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
