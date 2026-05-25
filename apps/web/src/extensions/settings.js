export const settingsExtension = {
  id: 'settings',
  name: 'Settings',
  capabilities: {
    surfaces: [
      {
        id: 'settings',
        label: 'Settings',
        anchorId: 'settings',
        order: 90,
      },
    ],
    sidebarItems: [
      {
        id: 'settings',
        label: 'Settings',
        href: '#settings',
        icon: {
          type: 'material-symbol',
          name: 'settings',
        },
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
