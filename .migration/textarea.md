# textarea

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the Base-style native textarea wrapper is installed and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/textarea.jsx:4` retains the shadcn native `<textarea>` contract from the Base golden pair.
- `apps/web/src/components/ui/textarea.jsx:5` composes its forwarded ref with the shared Lisse geometry adapter.
- `.migration/textarea.md:1` records the native rationale and control checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/textarea.jsx` returned no matches on 2026-07-24.

## Left alone

- Markdown editing behavior belongs to the dedicated editor; this wrapper remains a plain form control.
- Field validation and input-group layout stay in their corresponding wrappers.

## Behavior changes

None.

## Verify by hand

- Type, paste, select, undo, and resize where allowed; verify scroll behavior with long multiline content.
- Check placeholder, focus-visible, disabled, read-only, and invalid states.
- Render standalone and in an input group, confirming only the intended outer surface owns Lisse clipping. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
