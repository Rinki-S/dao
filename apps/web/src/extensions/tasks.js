import { IconChecklist } from '@tabler/icons-react';

export const tasksExtension = {
  id: 'tasks',
  name: 'Tasks',
  capabilities: {
    surfaces: [
      {
        id: 'tasks',
        label: 'Tasks',
        anchorId: 'tasks',
        order: 40,
      },
    ],
    sidebarItems: [
      {
        id: 'tasks',
        label: 'Tasks',
        href: '#tasks',
        icon: IconChecklist,
        order: 40,
      },
    ],
    commands: [
      // There is no form to focus any more: a task is a line you type into the
      // file, so opening it is the whole command.
      {
        id: 'open-tasks',
        title: 'Open Tasks',
        description: 'Jump to your task list',
        group: 'Navigate',
        keywords: ['task', 'todo', 'new task', 'add task'],
        targetId: 'tasks',
      },
    ],
  },
};
