export const settingsExtension = {
  id: 'settings',
  name: 'Settings',
  capabilities: {
    commands: [
      {
        id: 'open-settings',
        title: 'Open Settings',
        description: 'Jump to workspace settings',
        group: 'Navigate',
        keywords: ['settings', 'preferences'],
        targetId: 'settings',
      },
    ],
  },
};
