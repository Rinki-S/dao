# Animation plans

Plans produced by `improve-animations`. Each is self-contained: an executor with
no context should be able to run one without further instruction.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| [001](001-sidebar-peek-to-docked-material.md) | Ease the sidebar's material and shadow between peeked and docked | MEDIUM | DONE (deviated) |

## Execution order

001 stands alone — no dependencies. It shipped with a deviation; the plan
records what changed and why.

## Motion conventions in this repo

Recorded here so later plans extend them instead of inventing parallel ones.

- Tokens live in `apps/web/src/index.css` inside `@theme`:
  - `--ease-shell: cubic-bezier(0.32, 0.72, 0, 1)` — shell motion (sidebar
    slide, titlebar inset, trigger travel). This is the iOS-drawer curve.
  - `--duration-overlay: 140ms` — every modal and floating overlay enters and
    leaves on this.
- Shell motion runs at a hardcoded `duration-200` alongside `ease-shell`.
- Context menus are deliberately instant — a right-click menu should be there
  the moment the pointer stops. Do not report or "fix" this.

## Known gaps not yet planned

- **No `prefers-reduced-motion` support anywhere.** A repo-wide grep finds no
  `prefers-reduced-motion` or `motion-reduce` in `apps/web/src`. Everything
  animated — the sidebar slide, the titlebar inset, the trigger travel, every
  overlay — moves regardless of the OS setting. This wants one coordinated pass
  across the shell and the overlay primitives, not a guard bolted onto whichever
  component is being touched. Worth its own plan.
