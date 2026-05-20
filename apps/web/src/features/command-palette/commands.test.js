import { describe, expect, it } from 'vitest';
import { coreCommands, filterCommands } from './commands.js';

describe('command palette command filtering', () => {
  it('returns every core command for an empty query', () => {
    expect(filterCommands(coreCommands, '')).toEqual(coreCommands);
    expect(filterCommands(coreCommands, '   ')).toEqual(coreCommands);
  });

  it('matches command titles', () => {
    const results = filterCommands(coreCommands, 'create task');

    expect(results.map((command) => command.id)).toEqual(['create-task']);
  });

  it('matches command keywords', () => {
    const results = filterCommands(coreCommands, 'preferences');

    expect(results.map((command) => command.id)).toEqual(['open-settings']);
  });

  it('returns an empty list when no command matches', () => {
    expect(filterCommands(coreCommands, 'publish release')).toEqual([]);
  });
});
