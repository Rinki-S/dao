import { Dashboard } from '@nine-thirty-five/material-symbols-react/rounded';

export const dashboardExtension = {
  id: 'dashboard',
  name: 'Dashboard',
  capabilities: {
    surfaces: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        anchorId: 'dashboard',
        order: 10,
      },
    ],
    sidebarItems: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '#dashboard',
        icon: Dashboard,
        order: 10,
      },
    ],
  },
};
