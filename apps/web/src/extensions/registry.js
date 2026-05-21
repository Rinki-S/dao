import { dashboardExtension } from './dashboard.js';
import { notesExtension } from './notes.js';
import { projectsExtension } from './projects.js';
import { searchExtension } from './search.js';
import { settingsExtension } from './settings.js';
import { tasksExtension } from './tasks.js';
import { workspacesExtension } from './workspaces.js';

export const builtInExtensions = [
  dashboardExtension,
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

export function getRegisteredSidebarItems(extensions = builtInExtensions) {
  return extensions
    .flatMap((extension) => extension.capabilities?.sidebarItems ?? [])
    .toSorted((firstItem, secondItem) => firstItem.order - secondItem.order);
}

export function getRegisteredSurfaces(extensions = builtInExtensions) {
  return extensions
    .flatMap((extension) => extension.capabilities?.surfaces ?? [])
    .toSorted((firstSurface, secondSurface) => firstSurface.order - secondSurface.order);
}
