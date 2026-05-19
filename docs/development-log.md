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

## Next Milestone: Task Loop

Recommended branch:

```txt
feat/task-api-ui
```

Goal:

```txt
Tasks can be created, persisted in SQLite, listed through the Go API, and displayed in React.
```

Planned scope:

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
