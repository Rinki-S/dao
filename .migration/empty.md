# empty

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style empty-state composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/empty.jsx:6` keeps shadcn's native empty-state structure and `apps/web/src/components/ui/empty.jsx:8` uses `LisseSurface` for the outer surface.
- `apps/web/src/components/ui/empty.jsx:47` applies Lisse to the optional media treatment while retaining the golden pair's variants.
- `.migration/empty.md:1` records why this presentational component has no Base primitive import.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/empty.jsx` returned no matches on 2026-07-24.

## Left alone

- Empty-state copy, actions, and illustrations remain consumer content.
- No external primitive was introduced because this shadcn composition is native markup in both source and target.

## Behavior changes

None.

## Verify by hand

- Render the empty state with and without media, description, and actions; check alignment and accessible heading order.
- Test a long localized description and narrow panel width.
- Inspect both outer and media Lisse geometry for clipping or focus-outline loss. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
