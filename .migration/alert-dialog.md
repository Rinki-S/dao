# alert-dialog

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the wrapper is migrated to Base UI and its source-level Radix scan is clean.

## Changed

- `apps/web/src/components/ui/alert-dialog.jsx:1` now uses `@base-ui/react/alert-dialog`; the CLI golden pair supplied the Base UI `Backdrop`/`Popup`/`Close` composition and Base `render` contract.
- `apps/web/src/components/ui/alert-dialog.jsx:33` applies the shared Lisse ref to the popup, and `apps/web/src/components/ui/alert-dialog.jsx:83` uses `LisseSurface` for the media shape, so visible curvature does not depend on CSS border radius.
- `.migration/alert-dialog.md:1` records the wrapper migration and the remaining manual checks.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/alert-dialog.jsx` returned no matches on 2026-07-24.

## Left alone

- `apps/web/src/lib/lisse.jsx` is the shared geometry adapter and was reused rather than duplicated in this component.
- Alert-dialog consumers are covered by the whole-project consumer sweep in `.migration/project.md`; unrelated app code is not claimed as part of this wrapper report.

## Behavior changes

- Base UI alert dialogs focus the first tabbable element by default, while Radix focused the cancel action. Consumers that require cancel-first focus must pass an explicit `initialFocus` target.
- `onOpenChange` receives a second Base UI event-details argument. Escape cancellation must use its reason/cancel API instead of a Radix keydown callback.
- Base UI has no `AlertDialog.Action` primitive; `AlertDialogAction` is a styled Button and does not close implicitly. Consumers must close through controlled state or an actions ref after a successful action.

## Verify by hand

- Open the alert dialog by keyboard, confirm the initial focus is intentional, and tab through every action without escaping the modal.
- Press Escape and activate Cancel; confirm the dialog closes and focus returns to the trigger.
- Activate the destructive/primary action once and confirm its callback and close behavior occur exactly once.
- Resize the dialog and inspect both popup and media clipping; their Lisse geometry should remain smooth. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
