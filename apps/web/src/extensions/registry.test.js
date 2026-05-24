import { describe, expect, it } from 'vitest';
import {
  builtInExtensions,
  getRegisteredCommands,
  getRegisteredSidebarItems,
  getRegisteredSurfaces,
  registeredExtensions,
} from './registry.js';
import { ExtensionListSchema } from './schemas.js';

describe('extension registry', () => {
  it('matches the built-in extension schema', () => {
    expect(registeredExtensions).toEqual(ExtensionListSchema.parse(builtInExtensions));
  });

  it('registers built-in extension commands', () => {
    const commands = getRegisteredCommands();

    expect(registeredExtensions.map((extension) => extension.id)).toEqual([
      'dashboard',
      'workspaces',
      'projects',
      'tasks',
      'notes',
      'search',
      'settings',
    ]);
    expect(commands.map((command) => command.id)).toEqual([
      'create-workspace',
      'open-workspaces',
      'switch-workspace',
      'create-project',
      'open-projects',
      'create-task',
      'open-tasks',
      'create-note',
      'open-notes',
      'open-search',
      'open-settings',
    ]);
  });

  it('registers sidebar items by order', () => {
    const sidebarItems = getRegisteredSidebarItems();

    expect(sidebarItems.map((item) => item.id)).toEqual([
      'dashboard',
      'workspaces',
      'projects',
      'tasks',
      'notes',
      'search',
      'settings',
    ]);
    expect(sidebarItems.map((item) => item.icon)).toEqual([
      { type: 'phosphor', name: 'SquaresFourIcon' },
      { type: 'phosphor', name: 'StackIcon' },
      { type: 'phosphor', name: 'FolderOpenIcon' },
      { type: 'phosphor', name: 'CheckSquareIcon' },
      { type: 'phosphor', name: 'NotePencilIcon' },
      { type: 'phosphor', name: 'MagnifyingGlassIcon' },
      { type: 'phosphor', name: 'GearSixIcon' },
    ]);
  });

  it('registers surfaces by order', () => {
    const surfaces = getRegisteredSurfaces();

    expect(surfaces.map((surface) => surface.id)).toEqual([
      'dashboard',
      'workspaces',
      'projects',
      'tasks',
      'notes',
      'search',
      'settings',
    ]);
  });

  it('ignores extensions without command capabilities', () => {
    const commands = getRegisteredCommands([
      {
        id: 'empty',
        name: 'Empty',
        capabilities: {},
      },
    ]);

    expect(commands).toEqual([]);
  });

  it('ignores extensions without sidebar item capabilities', () => {
    const sidebarItems = getRegisteredSidebarItems([
      {
        id: 'empty',
        name: 'Empty',
        capabilities: {},
      },
    ]);

    expect(sidebarItems).toEqual([]);
  });

  it('ignores extensions without surface capabilities', () => {
    const surfaces = getRegisteredSurfaces([
      {
        id: 'empty',
        name: 'Empty',
        capabilities: {},
      },
    ]);

    expect(surfaces).toEqual([]);
  });
});
