import { describe, expect, it } from 'vitest';
import {
  builtInExtensions,
  getContentFormatIcon,
  getRegisteredCommands,
  getRegisteredContentFormats,
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
      'switch-workspace',
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

    expect(sidebarItems.map((item) => item.id)).toEqual(['tasks', 'settings']);
    expect(sidebarItems.every((item) => typeof item.icon === 'function')).toBe(true);
  });

  it('registers surfaces by order', () => {
    const surfaces = getRegisteredSurfaces();

    expect(surfaces.map((surface) => surface.id)).toEqual([
      'dashboard',
      'tasks',
      'notes',
      'settings',
    ]);
  });

  it('registers content formats', () => {
    const contentFormats = getRegisteredContentFormats();

    expect(contentFormats.map((contentFormat) => contentFormat.format)).toEqual(['markdown']);
    expect(contentFormats.every((contentFormat) => typeof contentFormat.icon === 'function')).toBe(
      true,
    );
    expect(getContentFormatIcon('markdown')).toBe(contentFormats[0].icon);
    expect(typeof getContentFormatIcon('unknown-format')).toBe('function');
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

  it('ignores extensions without content format capabilities', () => {
    const contentFormats = getRegisteredContentFormats([
      {
        id: 'empty',
        name: 'Empty',
        capabilities: {},
      },
    ]);

    expect(contentFormats).toEqual([]);
  });
});
