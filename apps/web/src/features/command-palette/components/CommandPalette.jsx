import {
  Kbd,
  Modal,
  Separator,
} from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import { Command as CommandPrimitive } from 'cmdk';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Modal.Backdrop className="z-[200]!">
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog aria-label="Command Palette" className="overflow-hidden p-0">
            <Modal.Header className="sr-only">
              <Modal.Heading>Command Palette</Modal.Heading>
              <p>Search for a command to run.</p>
            </Modal.Header>

            <CommandPrimitive
              label="Command Palette"
              shouldFilter={false}
              value={selectedCommandValue}
              onValueChange={setSelectedCommandValue}
              className="flex size-full flex-col overflow-hidden rounded-xl bg-surface p-3 text-surface-foreground"
            >
              <div>
                <div className="flex h-8 items-center gap-2 rounded-field border border-field-border bg-field px-2 shadow-none focus-within:border-focus focus-within:ring-3 focus-within:ring-focus/30">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    aria-hidden="true"
                    className="size-[18px] shrink-0 translate-y-px text-field-placeholder"
                  />
                  <CommandPrimitive.Input
                    ref={searchInputRef}
                    value={query}
                    onValueChange={handleQueryChange}
                    placeholder="Type a command"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm text-field-foreground outline-none placeholder:text-field-placeholder disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <CommandPrimitive.List className="no-scrollbar mt-2 max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none">
                <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted">
                  No commands found.
                </CommandPrimitive.Empty>

                {visibleCommands.length > 0 && (
                  <>
                    {commandGroups.map((commandGroup) => (
                      <CommandPrimitive.Group
                        key={commandGroup.group}
                        heading={commandGroup.group}
                        className="overflow-hidden py-1 text-surface-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted"
                      >
                        {commandGroup.commands.map((command) => (
                          <CommandPrimitive.Item
                            key={command.id}
                            value={getCommandValue(command)}
                            onSelect={() => handleRunCommand(command)}
                            className="relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-soft-foreground data-[disabled=true]:opacity-50"
                          >
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate font-medium">{command.title}</span>
                              <span className="truncate text-muted group-data-[selected=true]:text-accent-soft-foreground">
                                {command.description}
                              </span>
                            </span>
                          </CommandPrimitive.Item>
                        ))}
                      </CommandPrimitive.Group>
                    ))}
                  </>
                )}
              </CommandPrimitive.List>

              {feedback && (
                <p className="border-t border-separator px-4 py-2 text-xs text-danger">
                  {feedback}
                </p>
              )}

              <Separator className="mt-2" />
              <div className="flex w-full items-center justify-between pt-2 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1">
                    <Kbd>
                      <Kbd.Abbr keyValue="command" />
                    </Kbd>
                    <Kbd>
                      <Kbd.Abbr keyValue="ctrl" />
                    </Kbd>
                  </span>
                  <span>+</span>
                  <Kbd>
                    <Kbd.Abbr keyValue="shift" />
                  </Kbd>
                  <span>+</span>
                  <Kbd>
                    <Kbd.Content>P</Kbd.Content>
                  </Kbd>
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>
                    <Kbd.Abbr keyValue="enter" />
                  </Kbd>
                  <span>to run</span>
                  <span>/</span>
                  <Kbd>
                    <Kbd.Abbr keyValue="escape" />
                  </Kbd>
                  <span>to close</span>
                </span>
              </div>
            </CommandPrimitive>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
