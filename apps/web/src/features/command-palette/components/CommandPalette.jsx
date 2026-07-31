import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.jsx';
import { Kbd, KbdGroup } from '@/components/ui/kbd.jsx';
import { Separator } from '@/components/ui/separator.jsx';
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

function focusCommandTarget(command, root = document) {
  window.setTimeout(() => {
    const focusTarget = getCommandFocusTarget(command, root);

    focusTarget?.focus();
  }, 0);
}

function runCommand(command, onSelectSurface, onRunAction) {
  if (command.action) {
    onRunAction?.(command.action, command);
    return '';
  }

  onSelectSurface?.(command.targetId);

  const target = getCommandTarget(command);

  if (!target && !onSelectSurface) {
    return `${command.title} is not available yet.`;
  }

  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

export function CommandPalette({ onSelectSurface, onRunAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCommandValue, setSelectedCommandValue] = useState('');
  const [feedback, setFeedback] = useState('');
  const searchInputRef = useRef(null);

  const commands = useMemo(() => getRegisteredCommands(), []);
  const visibleCommands = useMemo(() => filterCommands(commands, query), [commands, query]);
  const commandGroups = useMemo(() => groupCommands(visibleCommands), [visibleCommands]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOpen]);

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
    const nextFeedback = runCommand(command, onSelectSurface, onRunAction);

    if (nextFeedback) {
      setFeedback(nextFeedback);
      return;
    }

    handleClose();

    if (command.focusSelector) {
      focusCommandTarget(command);
    }
  }

  function handleQueryChange(nextQuery) {
    setQuery(nextQuery);
    const nextVisibleCommands = filterCommands(commands, nextQuery);
    setSelectedCommandValue(nextVisibleCommands[0] ? getCommandValue(nextVisibleCommands[0]) : '');
    setFeedback('');
  }

  return (
    <CommandDialog
      className="top-1/2 z-[201] max-w-sm -translate-y-1/2"
      description="Search for a command to run."
      open={isOpen}
      overlayClassName="z-[200]"
      title="Command Palette"
      onOpenChange={handleOpenChange}
    >
      <Command
        className="p-3"
        label="Command Palette"
        shouldFilter={false}
        value={selectedCommandValue}
        onValueChange={setSelectedCommandValue}
      >
        <CommandInput
          ref={searchInputRef}
          className="text-sm"
          placeholder="Type a command"
          value={query}
          onValueChange={handleQueryChange}
        />

        <CommandList className="mt-2">
          <CommandEmpty className="text-muted-foreground">No commands found.</CommandEmpty>

          {visibleCommands.length > 0 &&
            commandGroups.map((commandGroup) => (
              <CommandGroup
                key={commandGroup.group}
                className="py-1 text-popover-foreground"
                heading={commandGroup.group}
              >
                {commandGroup.commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    className="text-sm data-selected:bg-accent-soft data-selected:text-accent-soft-foreground"
                    value={getCommandValue(command)}
                    onSelect={() => handleRunCommand(command)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{command.title}</span>
                      <span className="truncate text-muted-foreground group-data-selected/command-item:text-accent-soft-foreground">
                        {command.description}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
        </CommandList>

        {feedback && (
          <p className="border-t border-border px-4 py-2 text-xs text-destructive">{feedback}</p>
        )}

        <Separator className="mt-2" />
        <div className="flex w-full items-center justify-between pt-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <span>/</span>
              <Kbd>Ctrl</Kbd>
            </KbdGroup>
            <span>+</span>
            <Kbd>Shift</Kbd>
            <span>+</span>
            <Kbd>P</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd>
            <span>to run</span>
            <span>/</span>
            <Kbd>Esc</Kbd>
            <span>to close</span>
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
