export const coreCommands = [
  {
    id: 'create-workspace',
    title: 'Create Workspace',
    description: 'Focus the workspace form',
    group: 'Create',
    keywords: ['new workspace', 'add workspace'],
    targetId: 'workspaces',
    focusSelector: '[data-command-target="workspace-name"]',
  },
  {
    id: 'create-project',
    title: 'Create Project',
    description: 'Focus the project form',
    group: 'Create',
    keywords: ['new project', 'add project'],
    targetId: 'projects',
    focusSelector: '[data-command-target="project-name"]',
  },
  {
    id: 'create-task',
    title: 'Create Task',
    description: 'Focus the task form',
    group: 'Create',
    keywords: ['new task', 'add task', 'todo'],
    targetId: 'tasks',
    focusSelector: '[data-command-target="task-title"]',
  },
  {
    id: 'create-note',
    title: 'Create Note',
    description: 'Focus the note form',
    group: 'Create',
    keywords: ['new note', 'add note', 'capture'],
    targetId: 'notes',
    focusSelector: '[data-command-target="note-title"]',
  },
  {
    id: 'open-workspaces',
    title: 'Open Workspaces',
    description: 'Jump to workspace management',
    group: 'Navigate',
    keywords: ['workspace', 'switch workspace'],
    targetId: 'workspaces',
  },
  {
    id: 'open-projects',
    title: 'Open Projects',
    description: 'Jump to project management',
    group: 'Navigate',
    keywords: ['project'],
    targetId: 'projects',
  },
  {
    id: 'open-tasks',
    title: 'Open Tasks',
    description: 'Jump to task management',
    group: 'Navigate',
    keywords: ['task', 'todo'],
    targetId: 'tasks',
  },
  {
    id: 'open-notes',
    title: 'Open Notes',
    description: 'Jump to notes',
    group: 'Navigate',
    keywords: ['note'],
    targetId: 'notes',
  },
  {
    id: 'open-search',
    title: 'Search All',
    description: 'Jump to local search',
    group: 'Navigate',
    keywords: ['open search', 'find'],
    targetId: 'search',
    focusSelector: '[data-command-target="search-query"]',
  },
  {
    id: 'open-settings',
    title: 'Open Settings',
    description: 'Jump to workspace settings',
    group: 'Navigate',
    keywords: ['settings', 'preferences'],
    targetId: 'settings',
  },
];

export function getCommandSearchText(command) {
  return [command.title, command.description, command.group, ...command.keywords].join(' ');
}

export function filterCommands(commands, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === '') {
    return commands;
  }

  return commands.filter((command) => {
    const searchableText = getCommandSearchText(command).toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getCommandTarget(command, root = document) {
  return root.getElementById(command.targetId);
}

export function getCommandFocusTarget(command, root = document) {
  if (!command.focusSelector) {
    return null;
  }

  const focusTarget = root.querySelector(command.focusSelector);

  if (focusTarget instanceof HTMLElement && !focusTarget.hasAttribute('disabled')) {
    return focusTarget;
  }

  return null;
}
