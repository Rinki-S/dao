export const settingsExtension = {
  id: 'settings',
  name: 'Settings',
  capabilities: {
    sidebarItems: [
      {
        id: 'settings',
        label: 'Settings',
        href: '#settings',
        order: 90,
      },
    ],
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
