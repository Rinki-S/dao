import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolveSidebarIcon } from './sidebar-icons.js';

describe('resolveSidebarIcon', () => {
  it('resolves material symbol icons from manifest icon names', () => {
    const Icon = resolveSidebarIcon({ type: 'material-symbol', name: 'settings' });

    render(<Icon data-testid="icon" />);

    expect(screen.getByTestId('icon')).toHaveTextContent('settings');
  });

  it('falls back when the icon type or name is not supported', () => {
    const MissingIcon = resolveSidebarIcon();
    const InvalidIcon = resolveSidebarIcon({ type: 'material-symbol', name: 'MissingIcon' });
    const UnsupportedIcon = resolveSidebarIcon({ type: 'asset', name: 'settings' });

    render(
      <>
        <MissingIcon data-testid="missing-icon" />
        <InvalidIcon data-testid="invalid-icon" />
        <UnsupportedIcon data-testid="unsupported-icon" />
      </>,
    );

    expect(screen.getByTestId('missing-icon')).toHaveTextContent('extension');
    expect(screen.getByTestId('invalid-icon')).toHaveTextContent('extension');
    expect(screen.getByTestId('unsupported-icon')).toHaveTextContent('extension');
  });
});
