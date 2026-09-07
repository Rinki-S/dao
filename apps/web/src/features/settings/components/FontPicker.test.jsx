import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FontPicker } from './FontPicker.jsx';

beforeEach(() => {
  window.queryLocalFonts = vi
    .fn()
    .mockResolvedValue([{ family: 'Georgia' }, { family: 'Menlo' }, { family: 'Georgia' }]);
});

afterEach(() => {
  vi.clearAllMocks();
  delete window.queryLocalFonts;
});

function renderPicker(overrides = {}) {
  const props = {
    id: 'font-interface',
    value: '',
    fallbackLabel: 'Public Sans',
    onChange: vi.fn(),
    ...overrides,
  };

  render(<FontPicker {...props} />);

  return props;
}

async function open() {
  await userEvent.click(screen.getByRole('combobox'));
}

describe('FontPicker', () => {
  it('does not read the font list until it is opened', async () => {
    renderPicker();

    // The query needs a gesture, and a permission prompt raised by opening
    // Settings would be one with no visible cause.
    expect(window.queryLocalFonts).not.toHaveBeenCalled();

    await open();

    expect(window.queryLocalFonts).toHaveBeenCalledTimes(1);
  });

  it('offers each installed family once, however many styles it has', async () => {
    renderPicker();
    await open();

    // Georgia was reported twice, as two faces of one family.
    expect(await screen.findAllByRole('option', { name: 'Georgia' })).toHaveLength(1);
    expect(await screen.findByRole('option', { name: 'Menlo' })).toBeInTheDocument();
  });

  it('draws every name in its own face', async () => {
    renderPicker();
    await open();

    // The whole point of the control. A list of font names set in one font is
    // a list of words.
    const georgia = await screen.findByRole('option', { name: 'Georgia' });
    expect(georgia).toHaveStyle({ fontFamily: '"Georgia"' });
  });

  it('reports the family that was picked', async () => {
    const props = renderPicker();
    await open();

    await userEvent.click(await screen.findByRole('option', { name: 'Menlo' }));

    expect(props.onChange).toHaveBeenCalledWith('Menlo');
  });

  it('clears the choice back to the bundled default', async () => {
    const props = renderPicker({ value: 'Menlo' });
    await open();

    await userEvent.click(await screen.findByRole('option', { name: 'Public Sans' }));

    // The empty string, not the default's name: storing the default as a value
    // would freeze it, and a later change of default would not reach anybody
    // who had opened this dialog.
    expect(props.onChange).toHaveBeenCalledWith('');
  });

  it('opens onto the whole list even when a font is already chosen', async () => {
    renderPicker({ value: 'Menlo' });
    await open();

    // The field carries the chosen name, and left to itself the combobox
    // treats that name as a search — filtering the list down to the one font
    // already picked, which makes the control impossible to browse.
    expect(await screen.findByRole('option', { name: 'Georgia' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Public Sans' })).toBeInTheDocument();
  });

  it('filters once somebody types', async () => {
    renderPicker();
    await open();
    await userEvent.type(screen.getByRole('combobox'), 'georg');

    expect(await screen.findByRole('option', { name: 'Georgia' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Menlo' })).toBeNull();
  });

  it('still shows a chosen font that has since been uninstalled', async () => {
    // The machine no longer reports it. Showing the picker as though nobody
    // had chosen would be the app disagreeing with what it is actually doing.
    renderPicker({ value: 'Some Removed Face' });
    await open();

    expect(
      await screen.findByRole('option', { name: 'Some Removed Face (not installed)' }),
    ).toBeInTheDocument();
  });
});
