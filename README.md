# Dao

**Dao is an AI-native, local-first workspace for developer growth.**

Dao helps developers manage projects, tasks, notes, learning records, and long-term engineering context in one focused workspace.

## Vision

The name **Dao** comes from the Chinese concept of **道**.

In this product, Dao means more than a road or path. It represents principle, method, order, discipline, practice, and long-term mastery.

Dao is designed to support the long process of becoming a better developer.

## Why Dao?

Developer growth is not a straight line.

It is built through:

- learning
- building
- debugging
- reflecting
- organizing knowledge
- maintaining projects
- improving workflows

Dao brings these fragments into one calm, local-first workspace.

## Core Ideas

- **Local-first**: core data should be useful and accessible locally.
- **Developer-native**: keyboard-first, project-centered, searchable, and workflow-oriented.
- **Growth-focused**: designed around long-term developer growth rather than short-term task completion only.
- **AI-native**: future AI features should understand the user’s real projects, notes, tasks, and activity context.
- **Core + Extensions**: keep the core simple and add stage-specific features through official extensions.

## Tech Stack

- Electron
- React
- JavaScript
- Go
- SQLite
- shadcn/ui
- Tailwind CSS
- Zod
- JSDoc

## Current Status

Dao is currently in early development.

The first technical milestone is complete:

```txt
Electron app starts
React renders the UI
Go local service runs
SQLite stores workspace data
React displays that data
```

Current working loop:

```txt
Electron starts the Go local service
Go runs SQLite migrations
React lists workspaces
React creates workspaces
React lists projects
React creates projects
React lists tasks
React creates tasks
React lists notes
React creates notes
React searches projects, tasks, and notes
SQLite persists workspace data locally
```

## MVP Scope

The first version will focus on:

- Workspace
- Project
- Task
- Note
- Search
- Command Palette
- Activity Log
- Settings

## Deferred Features

These features are planned for later stages:

- AI Agent
- Cloud sync
- GitHub integration
- LeetCode extension
- Third-party plugin marketplace
- Mobile app
- Collaboration

## Roadmap

- [x] Initialize desktop app
- [x] Initialize React renderer
- [x] Initialize Go local service
- [x] Add SQLite migrations
- [x] Build workspace module
- [x] Build project module
- [x] Build task module
- [x] Build note module
- [x] Add search
- [x] Add command palette
- [x] Add activity log
- [x] Add extension system
- [ ] Add AI summary features
- [ ] Add contextual AI workflow features

## Architecture

Dao follows a clear boundary between the desktop shell, UI, business logic, and local data.

```txt
Electron Main
  ├── window management
  ├── app lifecycle
  ├── preload bridge
  └── Go service process management

React Renderer
  ├── UI
  ├── routing
  ├── state management
  ├── API client
  └── command palette

Go Local Service
  ├── business logic
  ├── local HTTP API
  ├── SQLite access
  ├── search
  └── future AI workflows

SQLite
  ├── workspaces
  ├── projects
  ├── tasks
  ├── notes
  └── activities
```

For details, see [`docs/architecture.md`](./docs/architecture.md).

## Design

Dao uses a calm, jade-accented design language inspired by long-term growth and the Chinese idea of Dao.

Design principle:

```txt
Neutral-first.
Jade for intention.
```

Primary accent:

```txt
#00A86B
```

For details, see [`DESIGN.md`](./DESIGN.md).

## Documentation

- [`DESIGN.md`](./DESIGN.md) — visual identity, UI style, design tokens, and interaction tone.
- [`AGENTS.md`](./AGENTS.md) — agent instructions, coding rules, architecture guardrails, and collaboration workflow.
- [`docs/vision.md`](./docs/vision.md) — product vision, positioning, principles, and long-term shape.
- [`docs/product-plan.md`](./docs/product-plan.md) — MVP scope, module roadmap, user flows, and product milestones.
- [`docs/architecture.md`](./docs/architecture.md) — system boundaries, local service design, data model, API contracts, search, tags, and AI/vector strategy.
- [`docs/ai-harness.md`](./docs/ai-harness.md) — future AI execution layer, context, tools, permissions, validation, traces, and confirmation rules.
- [`docs/open-source-strategy.md`](./docs/open-source-strategy.md) — when and how to extract companion packages from real Dao needs.
- [`docs/development-log.md`](./docs/development-log.md) — completed milestones, current milestone context, and near-term development direction.

## Development

Repository structure:

```txt
dao/
  apps/
    desktop/
    web/
    local-service/

  packages/
    ui/
    shared-schemas/
    extension-sdk/

  extensions/
    notes/
    tasks/
    projects/
    interview/
    leetcode/
    github/

  docs/
    vision.md
    product-plan.md
    architecture.md

  AGENTS.md
  DESIGN.md
  README.md
```

## License

MIT
