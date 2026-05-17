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
- Introduce Base UI later when accessible interactive primitives are needed.

## Next Milestone: Project Loop

Recommended branch:

```txt
feat/project-api-ui
```

Goal:

```txt
Projects can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Planned scope:

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
