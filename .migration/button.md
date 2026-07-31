# button

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the wrapper uses the real Base UI Button primitive and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/button.jsx:1` imports the real `@base-ui/react/button` primitive supplied by the Base golden pair; no Slot or hand-rolled render helper is used.
- `apps/web/src/components/ui/button.jsx:43` selects the Lisse corner policy from the button size, and `apps/web/src/components/ui/button.jsx:44` composes it into the primitive ref.
- `.migration/button.md:1` records the primitive choice and manual verification.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/button.jsx` returned no matches on 2026-07-24.

## Left alone

- `buttonVariants` remains exported for wrappers such as alert-dialog; keeping the shadcn public shape avoids unrelated consumer churn.
- Loading behavior remains a consumer composition of `Spinner` plus `disabled`; it was not hidden inside the primitive.

## Behavior changes

- Element substitution now uses Base UI's `render` prop. A non-button rendered element must set the appropriate Base UI `nativeButton` behavior and retain accessible keyboard semantics.

## Verify by hand

- Click and keyboard-activate every variant and size, including icon-only and disabled buttons.
- Render a link-like button through `render` and verify focus, Enter activation, and the final DOM element.
- Confirm the Lisse corner changes appropriately for regular and icon sizes without any CSS radius fallback. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
