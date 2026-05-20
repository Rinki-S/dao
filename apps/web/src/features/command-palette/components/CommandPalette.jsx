import { useEffect, useMemo, useRef, useState } from 'react';
import {
  coreCommands,
  filterCommands,
  getCommandFocusTarget,
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

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef(null);

  const visibleCommands = useMemo(() => {
    return filterCommands(coreCommands, query);
  }, [query]);
  const activeIndex = Math.min(selectedIndex, Math.max(visibleCommands.length - 1, 0));

  useEffect(() => {
    function handleKeyDown(event) {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        setQuery('');
        setSelectedIndex(0);
        setFeedback('');
        setIsOpen((currentIsOpen) => !currentIsOpen);
        return;
      }

      if (event.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  function handleClose() {
    setQuery('');
    setSelectedIndex(0);
    setFeedback('');
    setIsOpen(false);
  }

  function handleRunCommand(command) {
    const nextFeedback = runCommand(command);

    if (nextFeedback) {
      setFeedback(nextFeedback);
      return;
    }

    handleClose();
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((currentIndex) => {
        if (visibleCommands.length === 0) {
          return 0;
        }

        return (currentIndex + 1) % visibleCommands.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((currentIndex) => {
        if (visibleCommands.length === 0) {
          return 0;
        }

        return (currentIndex - 1 + visibleCommands.length) % visibleCommands.length;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const selectedCommand = visibleCommands[activeIndex];

      if (selectedCommand) {
        handleRunCommand(selectedCommand);
      }
    }
  }

  function handleQueryChange(event) {
    setQuery(event.target.value);
    setSelectedIndex(0);
    setFeedback('');
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="command-palette-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-4 py-20"
      role="dialog"
      onMouseDown={handleClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-[#374151] bg-[#111827] text-left shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#374151] px-4 py-3">
          <p id="command-palette-title" className="sr-only">
            Command Palette
          </p>
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#9CA3AF]"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command"
            aria-activedescendant={visibleCommands[activeIndex]?.id}
            aria-controls="command-palette-results"
          />
        </div>

        <div id="command-palette-results" className="max-h-80 overflow-y-auto p-2" role="listbox">
          {visibleCommands.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[#9CA3AF]">No commands found.</p>
          )}

          {visibleCommands.map((command, index) => {
            const isSelected = index === activeIndex;
            const commandClassName = [
              'w-full rounded-md px-3 py-2 text-left focus:outline-none',
              isSelected ? 'bg-[#064E3B]' : 'hover:bg-[#1F2937]',
            ].join(' ');

            return (
              <button
                key={command.id}
                id={command.id}
                aria-selected={isSelected}
                className={commandClassName}
                role="option"
                type="button"
                onClick={() => handleRunCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-white">{command.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-[#9CA3AF]">
                    {command.group}
                  </span>
                </span>
                <span className="mt-1 block truncate text-xs text-[#9CA3AF]">
                  {command.description}
                </span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <p className="border-t border-[#374151] px-4 py-2 text-xs text-[#FCA5A5]">{feedback}</p>
        )}

        <div className="flex items-center justify-between border-t border-[#374151] px-4 py-2 font-mono text-[11px] text-[#9CA3AF]">
          <span>Command/Ctrl + Shift + P</span>
          <span>Enter to run / Esc to close</span>
        </div>
      </div>
    </div>
  );
}
