# project

2026-07-24 · Strategy: whole-project golden-pair migration via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with component-by-component overwrite and Lisse replay · Verdict: all 24 shadcn UI wrappers and production consumers are source-clean; the mainline must still fill the final static-build and runtime results below.

## Changed

- `apps/web/components.json:3` identifies the target style as `base-mira`; the selected preset is `b1D0eTD6`, with Tabler Icons and the existing JavaScript/Tailwind aliases.
- `apps/web/package.json:16` installs `@base-ui/react`; `apps/web/package.json:19` pins `@lisse/react` to the `^0.6.0` line, and `apps/web/package.json:20` installs Tabler Icons.
- `apps/web/src/components/ui/` contains the 24 per-component golden-pair wrappers documented beside this report. The current batch scan `grep -RInE "radix-ui|@radix-ui" apps/web/src/components/ui --include='*.jsx'` returned no matches on 2026-07-24.
- Visible rounded wrapper geometry is replayed through `apps/web/src/lib/lisse.jsx`; wrappers without rounded surfaces remain native/Base markup rather than receiving decorative radius.
- The production consumer sweep across `apps/web/src/` is clean for HeroUI, Hugeicons, direct Radix imports, `asChild`, and CSS/Tailwind radius tokens when test fixtures are excluded; shadcn wrapper names remain stable and icons use Tabler.
- `apps/web/package.json` and the web importer in `pnpm-lock.yaml` no longer declare HeroUI, Hugeicons, direct `radix-ui`, Geist, Inter, or Outfit dependencies. Funnel Sans remains the selected application font.
- `apps/web/src/components/ui/command.jsx:1` intentionally remains powered by `cmdk`, while `CommandDialog` composes the Base UI Dialog wrapper. `cmdk@1.1.1` is not a Radix primitive, but it transitively depends on `@radix-ui/react-dialog`; `pnpm --filter @dao/web why @radix-ui/react-dialog` proves cmdk is the dependency path.
- `.migration/alert-dialog.md` through `.migration/tooltip.md` provide self-contained component evidence; `.migration/project.md:1` records whole-project gates.

## Left alone

- `cmdk` is intentionally retained under the shadcn Command shell, in accordance with the migration skill's hard rule.
- Transitive Radix packages required by the intentionally retained `cmdk@1.1.1` remain in the lockfile; they are not imported by Dao application code or shadcn wrappers.
- Product behavior, filesystem-backed workspaces/projects/notes, and editor data flow must not be altered by a primitive migration.
- This report task does not edit application code, dependencies, lockfiles, tests, or project documentation.

## Behavior changes

- Universal composition changes from Radix `asChild` to Base UI `render`; Base callbacks commonly add an event-details argument.
- Dialog-family focus/dismiss customization uses `initialFocus`, `finalFocus`, and root open-change reasons. Alert-dialog default initial focus can differ from Radix.
- Menu checkbox/radio items default to staying open in Base UI; ContextMenu removes Radix root `modal` and trigger `disabled` props.
- Select values can become `null`, and positioning uses Base `alignItemWithTrigger`/Positioner semantics.
- ScrollArea `type`, Separator `decorative`, Tooltip skip-delay, and `disableHoverableContent` do not have direct Base equivalents and require consumer verification.

## Verify by hand

- **Recorded source/dependency state:** production renderer scans excluding `*.test.*` return no HeroUI, Hugeicons, direct Radix imports, `asChild`, CSS/Tailwind radius tokens, or obsolete font imports; the manifest and lockfile importer contain the Base UI/Lisse/Tabler/Funnel replacement set. The cmdk transitive Radix path is explicitly documented above.
- **Mainline final-fill required — static gates:** record exact results for formatter/check, lint, all web tests, production build, and `pnpm dlx shadcn@latest info --json` proving `base: "base"` and `style: "base-mira"`.
- **Mainline final-fill required — geometry audit:** record the renderer-wide zero-match scan for CSS/Tailwind border-radius usage and the Lisse boundary test result.
- **Mainline final-fill required — runtime QA:** exercise dialogs, menus, select, tooltip, command palette, workspace/project navigation, tasks, settings, and markdown note editing in the real desktop/web runtime, including keyboard/focus and persisted data.
- Current derived wrapper status: 24 wrappers scanned, 0 wrappers remain on Radix. Whole-project completion is not claimed until every mainline final-fill item above has an actual result.
