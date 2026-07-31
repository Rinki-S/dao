# table

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite · Verdict: the Base-style native table composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/table.jsx:3` retains shadcn's native table and overflow-container structure.
- Header, body, footer, row, head, cell, and caption exports preserve semantic HTML and the Base golden pair's styling.
- `.migration/table.md:1` records why this component has no Base primitive import.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/table.jsx` returned no matches on 2026-07-24.

## Left alone

- Sorting, selection, virtualization, and data logic remain consumer responsibilities.
- Lisse is not applied because the table wrapper itself defines no visible rounded geometry; any enclosing surface must own its Lisse clipping.

## Behavior changes

None.

## Verify by hand

- Render headers, caption, empty body, long content, and footer; verify semantic structure in the accessibility tree.
- Test horizontal overflow, keyboard focus inside cells, and row hover/selection styling.
- Place the table inside its real Lisse-owned panel and confirm scrolling and focus outlines are not clipped. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
