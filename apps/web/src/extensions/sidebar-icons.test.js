import { GearSixIcon, PuzzlePieceIcon } from '@phosphor-icons/react';
import { describe, expect, it } from 'vitest';
import { resolveSidebarIcon } from './sidebar-icons.js';

describe('resolveSidebarIcon', () => {
  it('resolves phosphor icons from manifest icon names', () => {
    expect(resolveSidebarIcon({ type: 'phosphor', name: 'GearSixIcon' })).toBe(GearSixIcon);
  });

  it('falls back when the icon type or name is not supported', () => {
    expect(resolveSidebarIcon()).toBe(PuzzlePieceIcon);
    expect(resolveSidebarIcon({ type: 'phosphor', name: 'MissingIcon' })).toBe(PuzzlePieceIcon);
    expect(resolveSidebarIcon({ type: 'asset', name: 'GearSixIcon' })).toBe(PuzzlePieceIcon);
  });
});
