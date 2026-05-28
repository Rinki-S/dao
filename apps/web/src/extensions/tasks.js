import { createElement } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import TaskDone01Icon from '@hugeicons/core-free-icons/TaskDone01Icon';

function TasksIcon(props) {
  return createElement(HugeiconsIcon, {
    icon: TaskDone01Icon,
    ...props,
  });
}

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
        icon: TasksIcon,
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
