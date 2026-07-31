# kbd

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style keyboard-hint composition is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/kbd.jsx:4` retains shadcn's native `<kbd>` semantics.
- `apps/web/src/components/ui/kbd.jsx:6` renders the keycap through `LisseSurface`, and `KbdGroup` keeps multi-key spacing from the golden pair.
- `.migration/kbd.md:1` records the native rationale and visual checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/kbd.jsx` returned no matches on 2026-07-24.

## Left alone

- Keyboard shortcut dispatch and platform-specific labels belong to command consumers, not this presentational wrapper.
- No external primitive is needed for native `<kbd>` markup.

## Behavior changes

None.

## Verify by hand

- Render single keys, modifier sequences, and long labels alongside surrounding text.
- Verify baseline alignment and legibility in light/dark themes and at 200% zoom.
- Confirm each keycap uses Lisse geometry without clipping glyphs. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
