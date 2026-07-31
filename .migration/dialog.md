# dialog

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the dialog wrapper is backed by Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/dialog.jsx:1` uses `@base-ui/react/dialog`; the CLI golden pair maps overlay/content to Base UI `Backdrop` and `Popup`.
- `apps/web/src/components/ui/dialog.jsx:37` exposes `overlayClassName` for consumer-controlled backdrop styling; `apps/web/src/components/ui/dialog.jsx:45` composes the popup ref with Lisse, while close actions use Base UI's `render` contract with the migrated Button.
- `.migration/dialog.md:1` records the overlay-family migration evidence.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/dialog.jsx` returned no matches on 2026-07-24.

## Left alone

- Dialog content remains consumer-owned, including the required accessible `DialogTitle`.
- App-specific open state and destructive confirmation logic are handled in consumers and summarized by the project sweep.

## Behavior changes

- `onOpenChange` now receives Base UI event details. Outside-press/Escape cancellation moves to the root reason/cancel API.
- Radix auto-focus event callbacks are replaced by Base UI `initialFocus` and `finalFocus` targets.
- Base UI Portal renders a wrapper element, so consumer CSS must not rely on a wrapper-free portal.

## Verify by hand

- Open from mouse and keyboard, confirm the title is announced, and tab through the complete focus trap.
- Close through the X button, footer action, Escape, and outside press as applicable; focus must return to the trigger.
- Verify nested/long dialog content and popup Lisse clipping at narrow window widths. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
