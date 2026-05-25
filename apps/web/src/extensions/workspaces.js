export const workspacesExtension = {
  id: 'workspaces',
  name: 'Workspaces',
  capabilities: {
    commands: [
      {
        id: 'create-workspace',
        title: 'Create Workspace',
        description: 'Open the workspace creation dialog',
        group: 'Create',
        keywords: ['new workspace', 'add workspace'],
        action: 'create-workspace',
      },
      {
        id: 'switch-workspace',
        title: 'Switch Workspace',
        description: 'Open the workspace switcher',
        group: 'Navigate',
        keywords: ['workspace', 'change workspace'],
        action: 'switch-workspace',
      },
    ],
  },
};
