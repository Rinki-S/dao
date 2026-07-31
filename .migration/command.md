# command

2026-07-24 · Strategy: golden pair via shadcn CLI (`base-mira`, preset `b1D0eTD6`) with overwrite, followed by Lisse customization · Verdict: the shadcn command shell is migrated without replacing its intentionally retained cmdk engine, and the wrapper has no direct Radix import.

## Changed

- `apps/web/src/components/ui/command.jsx:1` intentionally imports `cmdk`; the Base-style shadcn golden pair preserves this third-party interaction core instead of inventing a Base UI replacement.
- `apps/web/src/components/ui/command.jsx:16` applies Lisse to the command root and `apps/web/src/components/ui/command.jsx:127` applies it to selectable items.
- The command dialog shell composes the migrated Base UI `Dialog` and input-group wrappers rather than using cmdk's dialog export, and icons come from Tabler.
- `.migration/command.md:1` distinguishes an application-level clean wrapper from cmdk's documented transitive dependency.
- `grep -n "radix-ui\|@radix-ui" apps/web/src/components/ui/command.jsx` returned no matches on 2026-07-24.

## Left alone

- `cmdk` behavior, filtering, keyboard navigation, and value semantics are intentionally untouched by the Radix-to-Base migration, as required by the migration skill.
- `cmdk@1.1.1` transitively depends on `@radix-ui/react-dialog`; `pnpm --filter @dao/web why @radix-ui/react-dialog` identifies cmdk as the only path. The app and shadcn wrappers do not import that primitive directly.
- Command-palette consumers are validated in the whole-project sweep rather than rewritten inside this wrapper report.

## Behavior changes

None from the primitive migration; the command interaction engine remains cmdk.

## Verify by hand

- Open the command dialog, type a query, and navigate results with Arrow keys, Home/End, and Enter.
- Verify empty, grouped, disabled, checked, and shortcut presentations.
- Close with Escape and confirm focus returns to the opener; inspect root and item Lisse clipping during highlight changes. Derived wrapper count after the batch scan: 0 wrappers remain on Radix.
