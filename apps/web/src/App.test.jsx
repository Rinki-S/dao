import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App.jsx';

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
    </TooltipProvider>,
  );
}

describe('App', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders only the active surface from the sidebar', async () => {
    const user = userEvent.setup();

    renderApp();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Tasks' }));

    expect(window.location.hash).toBe('#tasks');
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('switches surfaces from the command palette', async () => {
    const user = userEvent.setup();

    renderApp();

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(screen.getByPlaceholderText('Type a command'), 'open notes');
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#notes');
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Command Palette' })).not.toBeInTheDocument();
  });
});
