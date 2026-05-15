# Dao Product Plan

## 1. Product Summary

Dao is an AI-native personal workspace for developer growth.

It helps developers manage projects, tasks, notes, learning records, and development workflows. The product starts with a local-first desktop app and grows toward AI-assisted developer workflow management.

## 2. Core User

The first version focuses on:

```txt
Student developers who are learning technology, building projects, preparing for internships, and preparing for job hunting.
```

This user group has strong needs around:

- project organization
- task planning
- technical notes
- interview preparation
- learning roadmap
- portfolio building
- long-term knowledge accumulation

## 3. User Lifecycle

Dao starts from the student stage but should continue to be useful after the user enters the workplace.

### Student stage

Needs:

- learning plan
- project management
- interview preparation
- LeetCode records
- technical notes
- resume project organization

### Internship / job-hunting stage

Needs:

- interview tracker
- company records
- project polishing
- technical review
- AI mock interview
- resume-related project summaries

### Professional stage

Needs:

- project workflow
- meeting notes
- engineering logs
- technical knowledge base
- side project management
- AI-assisted planning and review

## 4. Product Structure

Dao should use a **Core + Extensions** model.

### Core

Core features should remain useful for all users over a long period.

Core modules:

- workspace
- project
- task
- note
- search
- command palette
- activity log
- settings

### Extensions

Extensions serve stage-specific or domain-specific needs.

Example extensions:

- interview
- LeetCode
- GitHub
- daily review
- AI assistant
- career
- snippets

The first version should only support official built-in extensions.

A third-party plugin marketplace should be deferred.

## 5. MVP User Flow

The MVP user flow:

```txt
1. User opens Dao
2. User creates a workspace
3. User creates a project
4. User creates tasks under the project
5. User writes notes related to the project
6. User searches across projects, tasks, and notes
7. User uses command palette to quickly create or open content
8. User reviews recent activity
```

## 6. MVP Modules

## 6.1 Workspace

Workspace is the top-level container.

Examples:

- Personal
- Internship
- Job Hunting
- Side Projects
- Learning

### MVP features

- create workspace
- list workspaces
- switch workspace
- rename workspace
- delete workspace

### Future features

- workspace icon
- workspace theme
- cloud sync per workspace
- workspace export
- workspace import

## 6.2 Project

Project is the central unit of Dao.

A project can contain:

- tasks
- notes
- activity records
- files
- links
- future AI summaries
- future GitHub repository links

### MVP features

- create project
- list projects
- update project
- archive project
- delete project
- project detail page

### Project status

```txt
active
paused
completed
archived
```

## 6.3 Task

Task is used for execution and planning.

### MVP features

- create task
- list tasks
- update task
- change task status
- delete task
- filter by project
- filter by status

### Task status

```txt
todo
doing
done
archived
```

### Task priority

```txt
low
medium
high
```

## 6.4 Note

Note is used for technical knowledge accumulation.

### MVP features

- create note
- edit note
- delete note
- list notes
- associate note with project
- markdown support

### Note types

```txt
general
project
learning
daily
interview
```

## 6.5 Search

Search should be available from early versions.

### MVP search scope

- project name
- project description
- task title
- task description
- note title
- note content

### First implementation

```txt
SQLite FTS5
```

### Future implementation

```txt
semantic search
embedding
RAG
AI context retrieval
```

## 6.6 Command Palette

The command palette is one of the most important UX features.

Shortcut:

```txt
Cmd/Ctrl + K
```

### MVP commands

- create project
- create task
- create note
- open project
- search all
- switch workspace
- open settings

### Future commands

- summarize today
- generate weekly plan
- create task from note
- ask AI about project
- run extension command

## 6.7 Activity Log

Activity log records important user actions.

Examples:

- project created
- task completed
- note created
- note updated
- project archived

This prepares the foundation for future AI summaries and growth review.

## 7. Deferred Features

These features should not enter the first MVP.

```txt
AI Agent
cloud sync
third-party plugin marketplace
mobile app
collaboration
GitHub integration
LeetCode integration
calendar integration
auto update
complex analytics
```

## 8. AI Roadmap

AI should be added after the core data model becomes stable.

### Phase AI-0: Data Foundation

Build reliable data entities:

- project
- task
- note
- activity

### Phase AI-1: Summary

AI can summarize:

- today’s progress
- project status
- note content
- completed tasks

### Phase AI-2: RAG

AI can answer questions based on local notes and projects.

Example:

```txt
What did I previously write about Redis cache breakdown?
```

### Phase AI-3: Tool Calling

AI can call Dao tools:

- create task
- search notes
- summarize project
- create daily plan

### Phase AI-4: Agent Workflow

AI can plan and execute multi-step workflows.

Example:

```txt
Help me prepare for a Go backend interview.
```

Expected behavior:

```txt
1. retrieve related notes
2. inspect current tasks
3. create study plan
4. generate review tasks
5. produce mock interview questions
6. ask user before writing major changes
```

## 9. Extension Roadmap

### Phase 1: Core modules

- notes
- tasks
- projects

### Phase 2: Student-focused extensions

- interview
- LeetCode
- resume projects

### Phase 3: Developer workflow extensions

- GitHub
- snippets
- daily review
- engineering log

### Phase 4: AI extensions

- AI summary
- AI planner
- AI project reviewer
- AI interview coach

## 10. UI Structure

### Sidebar

```txt
Dashboard
Projects
Tasks
Notes
Search
Extensions
Settings
```

### Dashboard

Dashboard should show:

- today’s tasks
- active projects
- recent notes
- recent activity
- quick actions

### Project detail page

Project detail should show:

- overview
- related tasks
- related notes
- activity
- future AI summary

### Notes page

Notes page should show:

- all notes
- project notes
- learning notes
- interview notes later

## 11. Product Milestones

## Month 1: Foundation

Goal:

```txt
Electron + React + Go + SQLite minimal loop works.
```

Deliverables:

- desktop window
- React renderer
- Go local service
- SQLite migration
- health check API
- basic app layout

## Month 2: Core MVP

Goal:

```txt
Dao can be used as a local project, task, and note workspace.
```

Deliverables:

- workspace CRUD
- project CRUD
- task CRUD
- note CRUD
- dashboard
- settings

## Month 3: Search and Efficiency

Goal:

```txt
Dao starts to feel like a developer-native tool.
```

Deliverables:

- SQLite FTS5 search
- command palette
- shortcuts
- activity log
- better empty states
- better project detail page

## Month 4: Extensions

Goal:

```txt
Dao supports module-based official extensions.
```

Deliverables:

- extension registry
- route registration
- sidebar registration
- command registration
- interview extension prototype
- LeetCode extension prototype

## Month 5: AI Layer

Goal:

```txt
Dao gains contextual AI features based on user data.
```

Deliverables:

- note summary
- project summary
- daily summary
- create task from note
- AI output validation with Zod
- AI usage log

## Month 6: Portfolio-quality Polish

Goal:

```txt
Dao becomes a presentable long-term project for internship/job-hunting.
```

Deliverables:

- README
- landing page
- demo video
- architecture docs
- installer prototype
- technical blog posts
- project retrospective

## 12. First Week Plan

### Day 1

- create repository
- create docs
- write vision
- write product plan
- write architecture overview

### Day 2

- initialize React + Vite app
- configure Tailwind
- create base layout
- create placeholder pages

### Day 3

- initialize Electron
- connect Electron to React renderer
- configure preload

### Day 4

- initialize Go local service
- add `/health` API
- start Go service from Electron
- call health API from React

### Day 5

- add SQLite
- add goose migrations
- create workspace table

### Day 6

- implement workspace API
- create workspace UI
- add Zod validation

### Day 7

- update README
- document architecture
- clean project structure
- write development log

## 13. Portfolio Value

Dao should demonstrate:

### Frontend ability

- React architecture
- complex UI
- command palette
- state management
- desktop renderer safety

### Backend ability

- Go service design
- REST API
- SQLite schema
- migration
- search
- modular architecture

### Engineering ability

- monorepo
- CI
- testing
- release
- local-first design
- cross-platform app

### AI ability

- RAG
- tool calling
- AI output validation
- context engineering
- agent workflow

### Product ability

- clear target user
- user lifecycle thinking
- core + extension design
- long-term retention
- student-to-professional transition

## 14. Current Immediate Goal

The immediate goal is:

```txt
Build the smallest Electron + React + Go + SQLite loop.
```

The first meaningful demo should prove:

```txt
Dao can open as a desktop app, create a workspace, save it to SQLite, and display it in React.
```
