export const workspacesExtension = {
  id: 'workspaces',
  name: 'Workspaces',
  capabilities: {
    sidebarItems: [
      {
        id: 'workspaces',
        label: 'Workspaces',
        href: '#workspaces',
        order: 20,
      },
    ],
    commands: [
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
        id: 'open-workspaces',
        title: 'Open Workspaces',
        description: 'Jump to workspace management',
        group: 'Navigate',
        keywords: ['workspace'],
        targetId: 'workspaces',
      },
      {
        id: 'switch-workspace',
        title: 'Switch Workspace',
        description: 'Review available workspaces',
        group: 'Navigate',
        keywords: ['workspace', 'change workspace'],
        targetId: 'workspaces',
        focusSelector: '[data-command-target="workspace-name"]',
      },
    ],
  },
};
