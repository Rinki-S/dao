import { notesExtension } from './notes.js';
import { projectsExtension } from './projects.js';
import { searchExtension } from './search.js';
import { settingsExtension } from './settings.js';
import { tasksExtension } from './tasks.js';
import { workspacesExtension } from './workspaces.js';

export const builtInExtensions = [
  workspacesExtension,
  projectsExtension,
  tasksExtension,
  notesExtension,
  searchExtension,
  settingsExtension,
];

export function getRegisteredCommands(extensions = builtInExtensions) {
  return extensions.flatMap((extension) => extension.capabilities?.commands ?? []);
}
