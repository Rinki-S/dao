# checkbox

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: checkbox is backed by Base UI, preserves its expanded pointer target, and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/checkbox.jsx:1` uses `@base-ui/react/checkbox`, with Base UI `Root` and `Indicator` anatomy from the CLI golden pair.
- `apps/web/src/components/ui/checkbox.jsx:14` keeps the semantic Base UI root unclipped so its `after:` hit-target expansion remains usable; `apps/web/src/components/ui/checkbox.jsx:23` applies Lisse only to the inner visual surface.
- Checked and indeterminate states use separate Tabler check/minus glyphs, Base `data-disabled` styling, and Base state attributes.
- `.migration/checkbox.md:1` records the migration evidence and state checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/checkbox.jsx` returned no matches on 2026-07-24.

## Left alone

- Checkbox labels remain consumer-owned; field association is handled by the surrounding native/shadcn field composition.
- The shared Lisse adapter and Tabler icon package are reused without component-local copies.

## Behavior changes

- Base UI represents indeterminate state with a separate `indeterminate` boolean instead of Radix's `checked="indeterminate"` value.
- Base UI renders the interactive root as a semantic `span` plus hidden input; disabled styling therefore follows `data-disabled`, not a native `:disabled` selector.
- Base UI change callbacks can include event details; existing one-argument handlers remain valid but event-aware consumers need the Base signature.

## Verify by hand

- Toggle the checkbox with pointer, Space, and its associated label; verify focus remains visible.
- Exercise unchecked, checked, indeterminate, disabled, and invalid states.
- Confirm the indicator appears once and the Lisse shape stays crisp at 100% and 200% zoom.
- Runtime QA on 2026-07-24 confirmed all four probe points outside the 16×16 visual box but inside the expanded target resolve to the checkbox, and an actual click eight pixels outside the visual box toggles it. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
