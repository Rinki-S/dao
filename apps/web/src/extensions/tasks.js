export const tasksExtension = {
  id: 'tasks',
  name: 'Tasks',
  capabilities: {
    sidebarItems: [
      {
        id: 'tasks',
        label: 'Tasks',
        href: '#tasks',
        order: 40,
      },
    ],
    commands: [
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
        id: 'open-tasks',
        title: 'Open Tasks',
        description: 'Jump to task management',
        group: 'Navigate',
        keywords: ['task', 'todo'],
        targetId: 'tasks',
      },
    ],
  },
};
