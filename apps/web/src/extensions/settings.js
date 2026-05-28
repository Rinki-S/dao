import { createElement } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';

function SettingsIcon(props) {
  return createElement(HugeiconsIcon, {
    icon: Settings01Icon,
    ...props,
  });
}

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
