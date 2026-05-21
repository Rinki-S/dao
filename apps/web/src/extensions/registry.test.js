import { describe, expect, it } from 'vitest';
import { builtInExtensions, getRegisteredCommands } from './registry.js';

describe('extension registry', () => {
  it('registers built-in extension commands', () => {
    const commands = getRegisteredCommands();

    expect(builtInExtensions.map((extension) => extension.id)).toEqual([
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
});
