import { SettingsIcon } from '@/components/icons.jsx';

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
        icon: SettingsIcon,
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
