import { useEffect, useMemo, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getRegisteredCommands } from '../../../extensions/registry.js';
import {
  filterCommands,
  getCommandFocusTarget,
  getCommandSearchText,
  getCommandTarget,
} from '../commands.js';

function isCommandPaletteShortcut(event) {
  const isModifierPressed = event.metaKey || event.ctrlKey;

  return isModifierPressed && event.shiftKey && event.key.toLowerCase() === 'p';
}

function focusCommandTarget(command) {
  window.setTimeout(() => {
    const focusTarget = getCommandFocusTarget(command);

    focusTarget?.focus();
  }, 0);
}

function runCommand(command) {
  const target = getCommandTarget(command);

  if (!target) {
    return `${command.title} is not available yet.`;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${command.targetId}`);
  focusCommandTarget(command);

  return '';
}

function getCommandValue(command) {
  return `${command.id} ${getCommandSearchText(command)}`;
}

function groupCommands(commands) {
  const commandGroups = new Map();

  for (const command of commands) {
    const existingCommands = commandGroups.get(command.group);

    if (existingCommands) {
      existingCommands.push(command);
      continue;
    }

    commandGroups.set(command.group, [command]);
  }

  return Array.from(commandGroups, ([group, groupedCommands]) => ({
    group,
    commands: groupedCommands,
  }));
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCommandValue, setSelectedCommandValue] = useState('');
  const [feedback, setFeedback] = useState('');

  const commands = useMemo(() => getRegisteredCommands(), []);
  const visibleCommands = useMemo(() => filterCommands(commands, query), [commands, query]);
  const commandGroups = useMemo(() => groupCommands(visibleCommands), [visibleCommands]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setIsOpen((currentIsOpen) => {
          const nextIsOpen = !currentIsOpen;

          if (nextIsOpen) {
            setQuery('');
            setSelectedCommandValue(commands[0] ? getCommandValue(commands[0]) : '');
            setFeedback('');
          }

          return nextIsOpen;
        });
        return;
      }

      if (event.key === 'Escape') {
        handleClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [commands]);

  function handleClose() {
    setQuery('');
    setSelectedCommandValue('');
    setFeedback('');
    setIsOpen(false);
  }

  function handleOpenChange(nextIsOpen) {
    if (nextIsOpen) {
      setQuery('');
      setSelectedCommandValue(commands[0] ? getCommandValue(commands[0]) : '');
      setFeedback('');
      setIsOpen(true);
      return;
    }

    handleClose();
  }

  function handleRunCommand(command) {
    const nextFeedback = runCommand(command);

    if (nextFeedback) {
      setFeedback(nextFeedback);
      return;
    }

    handleClose();
  }

  function handleQueryChange(nextQuery) {
    setQuery(nextQuery);
    const nextVisibleCommands = filterCommands(commands, nextQuery);
    setSelectedCommandValue(nextVisibleCommands[0] ? getCommandValue(nextVisibleCommands[0]) : '');
    setFeedback('');
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Search for a command to run."
    >
      <Command
        shouldFilter={false}
        value={selectedCommandValue}
        onValueChange={setSelectedCommandValue}
      >
        <CommandInput
          value={query}
          onValueChange={handleQueryChange}
          placeholder="Type a command"
        />

        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>

          {commandGroups.map((commandGroup) => (
            <CommandGroup key={commandGroup.group} heading={commandGroup.group}>
              {commandGroup.commands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={getCommandValue(command)}
                  onSelect={() => handleRunCommand(command)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{command.title}</span>
                    <span className="truncate text-muted-foreground">{command.description}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>

        {feedback && (
          <p className="border-t border-border px-4 py-2 text-xs text-destructive">{feedback}</p>
        )}

        <CommandFooter>
          <div className="flex items-center justify-between px-4 py-2 font-mono text-[11px] text-muted-foreground">
            <span>Command/Ctrl + Shift + P</span>
            <span>Enter to run / Esc to close</span>
          </div>
        </CommandFooter>
      </Command>
    </CommandDialog>
  );
}
