import { createElement } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import FileUnknownIcon from '@hugeicons/core-free-icons/FileUnknownIcon';
import { dashboardExtension } from './dashboard.js';
import { notesExtension } from './notes.js';
import { projectsExtension } from './projects.js';
import { searchExtension } from './search.js';
import { settingsExtension } from './settings.js';
import { ExtensionListSchema } from './schemas.js';
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

export const registeredExtensions = ExtensionListSchema.parse(builtInExtensions);

function UnknownDocumentIcon(props) {
  return createElement(HugeiconsIcon, {
    icon: FileUnknownIcon,
    ...props,
  });
}

export function getRegisteredCommands(extensions = registeredExtensions) {
  return extensions.flatMap((extension) => extension.capabilities?.commands ?? []);
}

export function getRegisteredSidebarItems(extensions = registeredExtensions) {
  return extensions
    .flatMap((extension) => extension.capabilities?.sidebarItems ?? [])
    .toSorted((firstItem, secondItem) => firstItem.order - secondItem.order);
}

export function getRegisteredSurfaces(extensions = registeredExtensions) {
  return extensions
    .flatMap((extension) => extension.capabilities?.surfaces ?? [])
    .toSorted((firstSurface, secondSurface) => firstSurface.order - secondSurface.order);
}

export function getRegisteredContentFormats(extensions = registeredExtensions) {
  return extensions.flatMap((extension) => extension.capabilities?.contentFormats ?? []);
}

export function getContentFormatIcon(format, extensions = registeredExtensions) {
  return (
    getRegisteredContentFormats(extensions).find((contentFormat) => contentFormat.format === format)
      ?.icon ?? UnknownDocumentIcon
  );
}
