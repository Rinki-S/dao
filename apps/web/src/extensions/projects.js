import { FolderOpen } from '@nine-thirty-five/material-symbols-react/rounded';

export const projectsExtension = {
  id: 'projects',
  name: 'Projects',
  capabilities: {
    surfaces: [
      {
        id: 'projects',
        label: 'Projects',
        anchorId: 'projects',
        order: 30,
      },
    ],
    sidebarItems: [
      {
        id: 'projects',
        label: 'Projects',
        href: '#projects',
        icon: FolderOpen,
        order: 30,
      },
    ],
    commands: [
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
        id: 'open-projects',
        title: 'Open Projects',
        description: 'Jump to project management',
        group: 'Navigate',
        keywords: ['project'],
        targetId: 'projects',
      },
    ],
  },
};
