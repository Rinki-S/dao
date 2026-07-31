import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppTabBar } from './AppTabBar.jsx';

const tabs = [
  {
    id: 'tasks',
    title: 'Tasks',
    surfaceId: 'tasks',
    resourceType: 'surface',
    resourceId: null,
  },
  {
    id: 'project:project-1',
    title: 'Dao Project',
    surfaceId: 'project-contents',
    resourceType: 'project',
    resourceId: 'project-1',
  },
];

describe('AppTabBar', () => {
  it('renders an empty state label when no tabs are open', () => {
    render(<AppTabBar tabs={[]} activeTabId="" onSelectTab={vi.fn()} onCloseTab={vi.fn()} />);

    expect(screen.getByText('No tab open')).toBeInTheDocument();
  });

  it('marks the active tab', () => {
    render(
      <AppTabBar
        tabs={tabs}
        activeTabId="project:project-1"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Dao Project/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a tab when clicked', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <AppTabBar tabs={tabs} activeTabId="tasks" onSelectTab={onSelectTab} onCloseTab={vi.fn()} />,
    );

    await user.click(screen.getByRole('tab', { name: /Dao Project/ }));

    expect(onSelectTab).toHaveBeenCalledWith('project:project-1');
  });

  it('closes a tab without selecting it from the close button click', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <AppTabBar
        tabs={tabs}
        activeTabId="tasks"
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close Dao Project tab' }));

    expect(onCloseTab).toHaveBeenCalledWith('project:project-1');
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});
