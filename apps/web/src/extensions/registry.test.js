import { describe, expect, it } from 'vitest';
import { builtInExtensions, getRegisteredCommands } from './registry.js';

describe('extension registry', () => {
  it('registers built-in extension commands', () => {
    const commands = getRegisteredCommands();

    expect(builtInExtensions.map((extension) => extension.id)).toEqual(['core']);
    expect(commands.map((command) => command.id)).toContain('create-task');
    expect(commands.map((command) => command.id)).toContain('switch-workspace');
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
