import { useEffect, useMemo, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { getRegisteredCommands } from '../../../extensions/registry.js';
import { getCommandFocusTarget, getCommandSearchText, getCommandTarget } from '../commands.js';

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

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState('');

  const commands = useMemo(() => getRegisteredCommands(), []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setIsOpen((currentIsOpen) => {
          const nextIsOpen = !currentIsOpen;

          if (nextIsOpen) {
            setQuery('');
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
  }, []);

  function handleClose() {
    setQuery('');
    setFeedback('');
    setIsOpen(false);
  }

  function handleOpenChange(nextIsOpen) {
    if (nextIsOpen) {
      setQuery('');
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
    setFeedback('');
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title="Command Palette"
      description="Search for a command to run."
    >
      <Command shouldFilter>
        <CommandInput
          value={query}
          onValueChange={handleQueryChange}
          placeholder="Type a command"
        />

        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>

          {commands.map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.id} ${getCommandSearchText(command)}`}
              onSelect={() => handleRunCommand(command)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{command.title}</span>
                <span className="truncate text-muted-foreground">{command.description}</span>
              </span>
              <CommandShortcut>{command.group}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandList>

        {feedback && (
          <p className="border-t border-border px-4 py-2 text-xs text-destructive">{feedback}</p>
        )}

        <CommandSeparator />
        <div className="flex items-center justify-between px-4 py-2 font-mono text-[11px] text-muted-foreground">
          <span>Command/Ctrl + Shift + P</span>
          <span>Enter to run / Esc to close</span>
        </div>
      </Command>
    </CommandDialog>
  );
}
