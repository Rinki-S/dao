# 002 — Morph the primary nav pill instead of swapping it

- **Status**: DONE (executed with one deviation — see Execution note)
- **Commit**: 79cc6af
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Easing & duration
- **Estimated scope**: 2 files (1 component, 1 test), ~20 lines

## Problem

The primary navigation shows the current view as a pill carrying its label and
the other three as bare icons. Switching views changes all of that in a single
frame: the pill appears at its final width, the label pops into existence, and
the background cuts in.

```jsx
// apps/web/src/components/shell/DaoSidebar.jsx:184-207 — current
function PrimaryNavItem({ active, item, onSelect }) {
  const button = (
    <Button
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      className={cn(
        'rounded-full before:rounded-full',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
      )}
      disabled={item.disabled}
      size={active ? 'sm' : 'icon-sm'}
      variant="ghost"
      onClick={onSelect}
    >
      <item.icon aria-hidden="true" />
      {active ? <span>{item.label}</span> : null}
    </Button>
  );
```

Three separate hard cuts, none of them in a transition:

1. **Width.** `size` swaps between `'icon-sm': 'size-8 sm:size-7'` (a fixed
   square) and `'sm': 'h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-7'`
   (content width) — `apps/web/src/components/ui/button.jsx:18` and `:26`.
2. **The label.** It is mounted only while active, so it cannot animate at all.
3. **Background and text colour.** The Button's base transition list is
   `transition-shadow` (`apps/web/src/components/ui/button.jsx:9`), so
   `background-color` and `color` are not among the properties that transition.

This matters more than a one-off because navigation is among the most-used
controls in the app, and because two elements change at once: the pill that
grows and the pill that shrinks. Without motion there is nothing tying them
together, so the eye has to re-find the current view rather than follow it.

Everything else in the shell moves — the sidebar slide, the titlebar inset, the
trigger travel, the peek material — so this row is the one part of the chrome
that jumps.

## Target

One element that morphs, on the shell's own curve.

```jsx
/* apps/web/src/components/shell/DaoSidebar.jsx:184-207 — target */
function PrimaryNavItem({ active, item, onSelect }) {
  const button = (
    <Button
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      className={cn(
        'rounded-full before:rounded-full',
        // gap-0 so a collapsed label contributes no width at all; the spacing
        // it needs when open lives inside it instead.
        'gap-0 transition-[padding,background-color,color] duration-200 ease-shell',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        active
          ? 'bg-sidebar-accent px-[calc(--spacing(2.5)-1px)] font-medium text-sidebar-accent-foreground'
          : 'px-[calc(--spacing(1.5)-1px)]',
      )}
      disabled={item.disabled}
      size="sm"
      variant="ghost"
      onClick={onSelect}
    >
      <item.icon aria-hidden="true" />
      {/* 0fr to 1fr animates to the label's own width, which a max-width
          cannot: any fixed ceiling finishes the visible growth early. */}
      <span
        aria-hidden={active ? undefined : 'true'}
        className={cn(
          'grid transition-[grid-template-columns,opacity] duration-200 ease-shell',
          active ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0',
        )}
      >
        <span className="overflow-hidden whitespace-nowrap ps-1.5">{item.label}</span>
      </span>
    </Button>
  );
```

Values, all of them:

- **Curve**: `--ease-shell`, i.e. `cubic-bezier(0.32, 0.72, 0, 1)`. Already the
  token for shell motion; do not add a curve.
- **Duration**: `200ms` for every property, matching the rest of the shell.
- **Properties**: `grid-template-columns` and `opacity` on the label wrapper;
  `padding`, `background-color`, `color` on the button.
- **Padding**: `calc(--spacing(1.5)-1px)` inactive, `calc(--spacing(2.5)-1px)`
  active. The `-1px` is the repo's convention for absorbing the button border —
  see `apps/web/src/components/ui/button.jsx:17`. Inactive comes out at
  `2×5px + 2×1px border + 16px icon = 28px`, which is exactly `h-7`, so an
  inactive item stays a circle.
- **`size="sm"` in both states.** `icon-sm` fixes the width to a square, which
  would pin the morph shut.

The label stays mounted in both states — it cannot animate otherwise — and is
`aria-hidden` while collapsed, since text clipped to zero width is not
perceivable and the button already carries `aria-label`.

Font weight snaps rather than transitions; `font-medium` cannot interpolate
without a variable font axis. It lands while the label is still near-invisible,
so it is not worth adding one for.

## Repo conventions to follow

- Motion tokens are in `apps/web/src/index.css` inside `@theme`
  (`apps/web/src/index.css:101`): `--ease-shell: cubic-bezier(0.32, 0.72, 0, 1)`
  for shell motion, `--duration-overlay: 140ms` for overlays. **Reuse
  `ease-shell` at `duration-200`; add no tokens.**
- Exemplar of that pairing on a class-driven state change:
  `apps/web/src/components/shell/use-titlebar-inset.js:36` —
  `'transition-[padding-inline-start] duration-200 ease-shell'`.
- `className` overrides variant classes: Button feeds it through
  `cn(buttonVariants({ className, size, variant }))`
  (`apps/web/src/components/ui/button.jsx:71`), so `gap-0` and the `px-*` above
  win over the `sm` size's own `gap-1.5` and `px-*`.

## Steps

1. `apps/web/src/components/shell/DaoSidebar.jsx:184` — replace the body of
   `PrimaryNavItem`'s `button` with the target above. Leave the `Tooltip`
   wrapper below it (`:209-216`) untouched.
2. `apps/web/src/app/DaoApp.test.jsx` — the test
   `labels only the current view in the primary navigation` asserts
   `expect(item).toHaveTextContent('')` for the three inactive items. That is
   now wrong by design: the label is present so it can animate. Replace those
   two lines per item with an assertion that the collapsed label is hidden from
   assistive technology, which is what "not shown" now means:

   ```jsx
   const item = nav.getByRole('button', { name: label });
   expect(item).not.toHaveAttribute('aria-current');
   expect(within(item).getByText(label)).toHaveAttribute('aria-hidden', 'true');
   ```

   Keep the active-item assertions (`toHaveTextContent('Home')` and
   `aria-current="page"`) exactly as they are.
3. Run `pnpm --dir apps/web format`.

## Boundaries

- Do NOT touch `apps/web/src/components/ui/button.jsx`. The transition list is
  extended per-instance from `className`; widening it for every button in the
  app is a separate decision.
- Do NOT change the colours. `--sidebar-accent` / `--sidebar-accent-foreground`
  were chosen deliberately to match the sidebar's own selection.
- Do NOT change `NAV_ITEMS`, the click handling, the tooltip, or the disabled
  handling for Chats.
- Do NOT add a `prefers-reduced-motion` guard. This repo has none anywhere yet;
  a one-off here would be inconsistent. It is tracked in `plans/README.md`.
- Do NOT reach for `interpolate-size: allow-keywords`, a max-width ceiling, or a
  JS measurement. The `0fr`/`1fr` grid is the whole mechanism.
- Do NOT add dependencies.
- If a line does not match the excerpt above (drift since 79cc6af), STOP and
  report rather than improvising.

## Verification

- **Mechanical**:
  - `pnpm --dir apps/web lint` — no output.
  - `pnpm --dir apps/web format:check` — "All matched files use Prettier code style!".
  - `pnpm --dir apps/web test` — 112 passed.
- **Feel check** — the real verification; jsdom has no layout, so no test can
  see this. Run the desktop app (`pnpm --filter @dao/web dev` on 5173, then
  `pnpm --dir apps/desktop dev`) and click between Home, Tasks and Search:
  - The leaving pill collapses while the arriving one grows, at the same time.
    One should not wait for the other.
  - The icons must not slide. Only the pill's trailing edge moves; an icon that
    shifts means the padding is animating on the wrong side.
  - The label must not appear to be cut mid-letter. If it reads as clipped
    rather than revealed, shorten the label's opacity to `duration-[140ms]` so
    it is fully opaque before the width finishes.
  - Click rapidly back and forth: the morph must reverse from wherever it is,
    not restart. CSS transitions do this by default — confirm nothing has been
    made to re-mount.
  - Hover an inactive icon: the highlight must be a circle, not a wide pill. If
    it is wide, the inactive padding is too large.
  - In DevTools → Animations at 10% speed, confirm the background and the width
    start together rather than one leading.
- **Done when**: switching views reads as one pill moving along the row, the
  inactive items stay circular, and no frame shows the label at full width
  before the pill has room for it.

## Execution note (deviation from the plan as written)

`aria-hidden` went on the inner span that carries the text, not on the outer
grid wrapper as specified. The wrapper is a layout box; the text is what is
being hidden, and `getByText(label)` resolves to the inner span, so the
assertion in step 2 read the wrong element and failed. Hiding the element that
holds the text is both what the assertion expects and the more direct
statement.

Everything else shipped as written.

The primary navigation also moved out of `SidebarContent` and into
`SidebarHeader` in the same change, alongside the workspace switcher, for a
separate request: `SidebarContent` wraps its children in a ScrollArea, so
anything inside it scrolls away with the tree. Living in the header is what
pins the row, rather than a sticky offset. That also closed the gap between the
switcher and the row from 16px (the header's `pb-2` plus the group's `p-2`) to
`gap-1`, the sidebar's own rhythm between rows.
