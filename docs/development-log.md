# Dao Development Log

This log records meaningful development milestones and near-term direction.

## Milestone 0: Workspace Loop

Status: complete

Dao now has the smallest Electron + React + Go + SQLite loop:

```txt
Electron app starts
React renders the UI
Electron starts the Go local service
Go service runs SQLite migrations
SQLite stores workspace data
React lists and creates workspaces
```

Implemented pieces:

- React + Vite renderer
- Electron desktop shell
- Electron preload bridge
- Go local service with `/health`
- SQLite database initialization
- Goose migration for `workspaces`
- Workspace repository and API
- Vite proxy for local development API calls
- Tailwind CSS setup
- Workspace list and creation UI

Important decisions:

- Keep Electron Main thin.
- Keep business logic and persistence in Go.
- Use local HTTP between React and Go.
- Use SQLite as the first local database.
- Use `net/http` first, with a possible future move to `chi` when routing and middleware complexity justify it.
- Use Tailwind CSS for styling.
- Use HeroUI for the React component system, with Dao-specific design tokens and composition on top.

## Milestone 1: Project Loop

Status: complete

Branch:

```txt
feat/project-api-ui
```

Goal:

```txt
Projects can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `projects` migration
- add project repository
- add `GET /api/projects`
- add `POST /api/projects`
- validate project API responses in React with Zod
- add project list and creation UI
- associate projects with a workspace through `workspace_id`

Keep deferred:

- project detail page
- task linkage
- search indexing
- command palette integration
- AI features

Notes:

- SQLite uses `snake_case` column names.
- HTTP JSON uses `camelCase` field names.
- Project JSON uses `workspaceId`, while SQLite uses `workspace_id`.
- Project list and creation currently use the selected workspace in the React UI.

## Milestone 2: Task Loop

Status: complete

Branch:

```txt
feat/task-api-ui
```

Goal:

```txt
Tasks can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `tasks` migration
- add task repository
- add `GET /api/tasks`
- add `POST /api/tasks`
- validate task API responses in React with Zod
- add task list and creation UI
- associate tasks with a workspace through `workspace_id`
- optionally associate tasks with a project through `project_id`

Initial task fields:

```txt
id
workspace_id
project_id
title
description
status
priority
due_date
created_at
updated_at
deleted_at
version
sync_status
```

Keep deferred:

- task detail page
- drag-and-drop task board
- recurring tasks
- reminders
- search indexing
- command palette integration

Notes:

- Task JSON uses `workspaceId`, `projectId`, and `dueDate`.
- SQLite uses `workspace_id`, `project_id`, and `due_date`.
- Task `status` starts as `todo`.
- Task `priority` defaults to `medium`.
- The React UI supports creating tasks in a workspace with an optional project association.

## Milestone 3: Note Loop

Status: complete

Branch:

```txt
feat/note-api-ui
```

Goal:

```txt
Notes can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Completed scope:

- create `notes` migration
- add note repository
- add `GET /api/notes`
- add `POST /api/notes`
- validate note API responses in React with Zod
- add note list and creation UI
- associate notes with a workspace through `workspace_id`
- optionally associate notes with a project through `project_id`

Initial note fields:

```txt
id
workspace_id
project_id
title
content
content_type
note_type
created_at
updated_at
deleted_at
version
sync_status
```

Keep deferred:

- full note editor
- markdown preview
- note detail page
- note tags
- note search indexing
- command palette integration

Tag decision:

- Tags are a valid future organization feature for notes.
- Do not implement tags in the basic Note Loop.
- Prefer a normalized tag model over storing plain tag text directly on notes.
- Future options include `tags` + `note_tags`, or a more general tagging model that can also support tasks, projects, learning records, snippets, and extension data.
- Revisit tags during a later search, filtering, or organization milestone.

Notes:

- Note JSON uses `workspaceId`, `projectId`, `contentType`, and `noteType`.
- SQLite uses `workspace_id`, `project_id`, `content_type`, and `note_type`.
- Note `contentType` starts as `markdown`.
- Note `noteType` defaults to `general`.
- The React UI supports creating notes in a workspace with an optional project association.

## Milestone 4: Search Loop

Status: complete

Branch:

```txt
feat/search-api-ui
```

Goal:

```txt
Users can search across projects, tasks, and notes through SQLite-backed local search.
```

Completed scope:

- add SQLite FTS5 search schema
- index project name and description
- index task title and description
- index note title and content
- add `GET /api/search?q=`
- validate search API responses in React with Zod
- add a basic search UI
- keep search scoped to local data

Initial indexing strategy:

- Use a shared SQLite FTS5 table named `search_index`.
- Store searchable rows for projects, tasks, and notes.
- Keep `workspace_id` and `project_id` as unindexed metadata for filtering.
- In the first implementation, write search index rows explicitly from create flows instead of adding database triggers.
- If update/delete behavior grows more complex, revisit a dedicated search service, trigger-based indexing, or a rebuild-index command.

Keep deferred:

- semantic search
- embeddings
- AI retrieval
- advanced filters
- ranking customization
- command palette integration

Notes:

- Search uses SQLite FTS5 through the shared `search_index` table.
- Project, task, and note create flows explicitly write search index rows.
- Entity creation and search indexing run in the same transaction.
- Search query input is sanitized before reaching FTS5 `MATCH`.
- Existing data created before the search index was introduced is not automatically backfilled yet.

## Milestone 5: Command Palette Loop

Status: complete

Branch:

```txt
feat/command-palette
```

Goal:

```txt
Users can open a command palette and quickly trigger core workspace actions.
```

Completed scope:

- add command palette UI
- support `Command/Ctrl + Shift + P`
- register core commands
- support quick navigation to workspace sections
- support create workspace/project/task/note commands at a basic level
- keep command registration simple until the extension registry exists
- add `Switch Workspace` as a first-class MVP command
- split command definitions and filtering logic from the React component
- add Vitest and Testing Library coverage for command filtering and keyboard interaction

Keep deferred:

- fuzzy command ranking
- extension command registration
- AI commands
- command history
- global desktop shortcut

Notes:

- Command execution currently stays in the React renderer and focuses existing UI surfaces.
- Create commands intentionally focus the relevant form instead of duplicating create API logic inside the palette.
- Command registration remains static until the extension registry milestone introduces a broader registration contract.
- Command palette tests currently cover filtering, open/close behavior, keyboard selection, command execution, hash updates, and focus targets.

## Milestone 6: Activity Log Loop

Status: complete

Branch:

```txt
feat/activity-log
```

Goal:

```txt
Dao records important local user actions so future review and AI summaries have reliable activity context.
```

Product direction:

```txt
Activity Log is an internal event layer, not a detailed user-facing feed.
```

User-facing activity should appear later as lightweight aggregate metrics, review signals, or AI-generated summaries.

Completed scope:

- add `activities` SQLite migration
- add activity model and repository in the Go local service
- write activity rows from create workspace/project/task/note flows
- add `GET /api/activities`
- add `GET /api/activities/metrics`
- validate activity API responses in React with Zod
- show lightweight aggregate activity metrics in the React renderer
- keep activity logging explicit and small for the MVP
- refresh lightweight activity metrics after create actions with a small frontend event

Keep deferred:

- detailed activity feed UI
- richer dashboard activity metrics
- shared query invalidation or React Query
- activity filters
- timeline grouping
- activity editing
- analytics
- AI summaries

Notes:

- Activity rows are written from the existing create flows, inside the same transaction as the source entity where applicable.
- Activity metrics are deliberately aggregate-only so the feature supports future review and AI context without exposing a detailed user-facing feed.
- The frontend uses a small local event to refresh metrics after successful create actions.
- Shared query invalidation or React Query remains deferred until more frontend data surfaces need coordinated cache behavior.

## Milestone 7: Extension Registry Loop

Status: complete

Branch:

```txt
feat/extension-registry
```

Goal:

```txt
Dao defines a small built-in extension registry so core modules can expose commands, sidebar items, and surfaces through a consistent contract.
```

Completed scope:

- document the first extension registry contract
- keep the registry limited to built-in extensions
- model extensions as capability providers rather than sidebar entries
- move existing core module navigation metadata toward registry-driven definitions
- prepare command registration for extension-owned commands
- split built-in extension definitions by core domain
- add command, sidebar item, and surface capability helpers
- render app surfaces in registry order while keeping React component assembly in the app layer
- validate built-in extensions at the registry boundary with Zod
- keep third-party plugin marketplace support deferred

Design constraints:

- support built-in extension capabilities first: commands, sidebar items, and surfaces
- leave room for future routes, importers, exporters, content transforms, browser integrations, file handlers, background jobs, settings sections, and AI context providers
- avoid dynamic external plugin loading, marketplace distribution, signing, sandboxing, and permission prompts in the MVP
- keep command capabilities lightweight so they route users to existing UI flows instead of bypassing page validation and state

Notes:

- Command Palette reads registered command capabilities instead of owning a static command list.
- Sidebar navigation reads registered sidebar item capabilities.
- The main app renders registered surfaces in registry order.
- `registeredExtensions` is parsed from `builtInExtensions` with Zod before registry helpers consume it.
- Extension metadata remains declarative; React components are still explicitly mapped in the app layer.

Keep deferred:

- route capability and route library integration
- third-party plugin marketplace
- dynamic external plugin loading
- plugin permissions, signing, sandboxing, and review
- importer, exporter, transform, browser integration, job, settings, and AI context provider capabilities

## Milestone 8: UI Foundation

Status: complete

Branch:

```txt
feat/ui-foundation
```

Goal:

```txt
Dao replaces temporary test-oriented renderer styling with a consistent shadcn/ui foundation.
```

Completed scope:

- switch the renderer UI direction to shadcn/ui
- configure shadcn/ui for the Vite React app
- add the initial shadcn component set used by current MVP surfaces
- migrate workspace, project, task, note, search, activity metrics, and settings surfaces to shadcn component composition
- migrate the command palette to shadcn `Command` and `Dialog` backed by `cmdk`
- group command palette commands by extension-provided `command.group`
- use `Kbd` for command palette keyboard hints
- align app shell styling with semantic Tailwind tokens
- apply Geist Variable as the UI body font and Outfit Variable as the heading font
- remove unused Vite starter assets and early workspace form CSS
- keep current screens functionally equivalent while preparing for product UI work

Keep deferred:

- product-grade app shell information architecture
- route-like active surface navigation
- dashboard redesign
- project detail page
- task workspace layout
- note editor and preview experience
- filesystem-backed markdown notes with realtime autosave
- WYSIWYG markdown editor exploration
- scoped custom markdown renderer exploration
- design token consolidation in `src/index.css`
- reusable Dao-specific component wrappers above shadcn/ui
- visual QA with browser screenshots across desktop and small viewports

Notes:

- This milestone is a UI foundation milestone, not the final product UI.
- This milestone used a shadcn-style local component layer. Dao later chose to migrate the component foundation to HeroUI while keeping Dao-specific composition and product density.
- Current screens still primarily expose MVP create/list/test flows.
- The next UI phase should turn the renderer from stacked feature panels into a real product workspace.
- The first product UI branch should focus on the app shell, active surface navigation, dashboard shape, and command palette fit inside the product workflow.

## Active Foundation Migration: HeroUI and hugeicons

Status: complete

Branch:

```txt
feat/heroui-hugeicons
```

Goal:

```txt
Dao moves its React component foundation to HeroUI and replaces Material Symbols with hugeicons.
```

Direction:

- use HeroUI as the maintained accessible primitive layer for buttons, inputs, overlays, tables, menus, keyboard hints, and related controls
- keep Dao-specific layout and product composition in app-owned components
- import HeroUI components directly in migrated or new UI code instead of creating shadcn-compatible wrapper layers
- keep `cmdk` as the command palette interaction core; use HeroUI for the modal shell, keyboard hints, colors, and overlay behavior
- import hugeicons directly where icons are used; do not add a centralized icon gateway
- replace `@nine-thirty-five/material-symbols-react` with `@hugeicons/react` and `@hugeicons/core-free-icons`
- remove shadcn, Radix, class-variance-authority, and tailwind-merge only after no current component imports depend on them

Completed scope:

- install HeroUI and hugeicons dependencies
- import HeroUI styles after Tailwind CSS
- define Dao's HeroUI theme variables in `apps/web/src/index.css`
- set the current app font to Funnel Sans Variable
- migrate the titlebar, sidebar, workspace switcher, project tree, project contents, task panel, settings panel, onboarding, command palette shell, and note editor shell toward HeroUI
- replace Material Symbols usage with direct hugeicons imports
- keep extension-owned content format icons in the extension registry, including the built-in `markdown` content format
- keep the command palette on `cmdk` while styling it with HeroUI surface, field, focus, muted, danger, separator, and accent-soft tokens
- center the command palette and keep its global overlay above the app titlebar
- remove unused shadcn-era local UI compatibility files and old dependencies after import checks
- unify page and inline loading states with HeroUI `Skeleton`
- preserve filesystem-backed markdown notes and debounced autosave while leaving rich editor internals for the dedicated editor milestone

Validation:

- web focused interaction tests passed
- web production build passed
- Go service tests passed
- Go vet passed

Notes:

- The text editing area remained intentionally lightweight at the end of this milestone. Dao later selected Tiptap for the dedicated rich Markdown editor milestone.
- Remaining visual QA should happen as part of normal feature work rather than blocking the HeroUI foundation migration.

## Milestone 9: Product Shell

Status: complete

Branch:

```txt
feat/product-shell
```

Goal:

```txt
Dao starts moving from functional test panels to a real product workspace experience.
```

Completed scope:

- replace the stacked all-surfaces page with route-like active surface navigation
- add a fixed app titlebar with sidebar toggle and global search
- add a resizable sidebar that can be hidden with a GSAP-assisted reveal/collapse animation
- keep the main sidebar navigation focused on Tasks and Settings
- render projects as folders in the sidebar file tree
- render project notes under their project folder and unassigned notes at the workspace root
- add file-tree context menus for opening, creating, renaming, and deleting projects and notes
- open project folders into a project contents surface
- open notes from the file tree into the note editor surface
- add runtime-only global workspace tabs for tasks, settings, projects, and notes
- keep workspace switches from showing resource tabs that belong to another workspace
- keep page title/header areas fixed while scrollable content stays inside the active surface
- add a settings surface with iOS-style sections for storage and debug actions
- add full-window onboarding for first working directory selection and first workspace creation
- add replay onboarding from Settings
- add a development-only Go service restart action through the desktop preload bridge
- preserve existing API contracts and MVP create/list behavior while reorganizing the UI
- avoid AI features until the product shell can carry existing local context clearly

Keep deferred:

- a real Dashboard/home surface
- richer project detail editing
- route capability support in the extension registry
- browser-level visual QA across desktop and narrow viewports
- persisted tabs or route restoration
- AI features

## Current Milestone: Tiptap Markdown Rich Editor

Recommended branch:

```txt
feat/tiptap-editor
```

Goal:

```txt
Dao replaces the temporary markdown textarea with a Tiptap rich-text editor while keeping Markdown files as the only durable note body format.
```

Planned scope:

- preserve the existing note shell, breadcrumbs, title editing, save status chip, loading skeleton, and error state
- keep the Go file-backed note content API unchanged: React receives Markdown and sends Markdown back
- parse Markdown into Tiptap's document model only in renderer memory; never persist Tiptap, ProseMirror, JSON, or HTML as the note body
- isolate Tiptap behind a Dao-owned Markdown editor component so note loading and persistence remain editor-agnostic
- lazy-load Tiptap in the note body so the title and note shell render without adding ProseMirror to the main application chunk
- serialize title and content autosaves per note, flush the latest draft on switch or close, and drain pending saves before restarting the Go service
- keep failed-save behavior intact so unsaved editor state is not lost
- add a focused formatting toolbar, keyboard-friendly editing, and Dao theme integration
- expose Paragraph and H1-H6 through one block-type selector; keep low-frequency dividers, remote image references, and GFM tables in a compact Insert menu
- keep local image attachments deferred until the Go file layer owns asset copying and note-relative path resolution
- support the initial Markdown subset with explicit round-trip tests, including headings, emphasis, links, lists, task lists, blockquotes, code, tables, dividers, and images
- require real Tiptap-to-Markdown autosave coverage and a second-round-trip idempotence check before merge
- treat Tiptap Markdown support as a compatibility boundary because `@tiptap/markdown` is currently beta and semantic round trips may normalize source formatting
- fall back to a safe Markdown source editor when frontmatter, raw HTML, HTML comments, reference definitions, or footnote definitions would otherwise risk silent loss
- keep CodeMirror or another dedicated source editor available as a later enhancement if the fallback experience needs richer source editing
- keep AI features deferred

Architecture decision:

- [`docs/adr/0001-tiptap-markdown-editor.md`](./adr/0001-tiptap-markdown-editor.md)

## Later Milestone: AI Summary Loop

Recommended branch:

```txt
feat/ai-summary
```

Goal:

```txt
Dao starts the first AI feature by generating structured summaries from existing local workspace context through the AI Harness boundary.
```

Planned scope:

- read `docs/ai-harness.md` before implementation
- define the first AI summary contract
- keep AI calls out of random React components and feature modules
- validate AI output with Zod before using it
- require user confirmation before writing AI-generated changes
- keep tool calling and agent workflows deferred
