# Sidebar File Tree Context Menu Design

## Status

Approved for implementation planning.

## Goal

Add context menus to the sidebar file tree so users can manage projects and notes directly from the tree. The first complete version should support open, create note, rename, and delete operations where appropriate.

## Scope

### Project nodes

Project context menu actions:

- Open
- New note
- Rename
- Delete

### Note nodes

Note context menu actions:

- Open
- Rename
- Delete

## Delete Project Behavior

Deleting a project must let the user choose whether to delete notes inside the project.

| Case | Behavior |
| --- | --- |
| Delete empty project | Soft delete the project. |
| Delete non-empty project without deleting notes | Soft delete the project; keep notes and make them unassigned by setting their `project_id` to `NULL`. |
| Delete non-empty project and delete notes | Soft delete the project and soft delete notes currently assigned to that project. |

The delete confirmation dialog should show:

- Project name.
- Number of notes inside the project.
- Checkbox: `Also delete notes in this project`.

The checkbox must be unchecked by default to avoid accidental note loss.

## Delete Note Behavior

Deleting a note soft deletes the note. It should disappear from the sidebar tree and from project contents. The note content should not be hard-deleted in the first version.

## Rename Behavior

Project rename changes the project name.

Note rename changes the note title. The existing note PATCH API already supports note title updates; the UI can call that API.

## Architecture Boundaries

| Layer | Responsibility |
| --- | --- |
| React renderer | Render context menus, rename dialogs, delete confirmation dialogs, call local API, refresh tree state. |
| Go local service | Own project/note rename and delete business rules, including soft delete and project-note relationship changes. |
| SQLite | Persist soft deletes and updated project-note relationships. |
| Search index | Remove or update affected indexed rows so deleted notes and deleted projects do not remain searchable. |

No business rules should be implemented only in React.

## API Requirements

### Projects

Add project update and delete endpoints:

```txt
PATCH /api/projects/{id}
DELETE /api/projects/{id}
```

Project update request:

```json
{
  "name": "New project name",
  "description": "Optional description"
}
```

Project delete request:

```json
{
  "deleteNotes": false
}
```

If `deleteNotes` is `false`, project notes should be kept and unassigned.

If `deleteNotes` is `true`, project notes should be soft deleted.

### Notes

Add note delete endpoint:

```txt
DELETE /api/notes/{id}
```

The existing note update endpoint remains the rename path:

```txt
PATCH /api/notes/{id}
```

## UI Interaction

The sidebar tree should use a right-click context menu on project and note rows.

Use the current TaskPanel context menu pattern:

- Capture `contextmenu` event.
- Prevent the browser default menu.
- Store menu position and target node in React state.
- Render a small HeroUI menu/popover at the pointer position.
- Close on action, outside interaction, or escape.

Keyboard accessibility should be preserved by exposing actions through menu items once the menu is open. A future pass can add a dedicated keyboard shortcut for opening the context menu from a focused row.

## Error Handling

If an action fails:

- Keep the dialog/menu closed only if the action succeeded.
- Show a concise error message near the tree or inside the active dialog.
- Do not mutate local tree state optimistically unless the API request succeeds.
- Reload tree data after successful mutations.

## Activity and Search

Successful create, rename, and delete actions should notify activity changes through the existing activity event path.

Search index updates belong in the Go service. Deleted notes should be removed from search results. Renamed notes/projects should have updated search rows where search rows exist.

## Non-goals

- Hard delete.
- Trash/recovery UI.
- Drag-and-drop move between projects.
- Multi-select actions.
- Keyboard shortcut system for context menu.
- Cloud sync behavior beyond existing sync-ready fields.
