import { useEffect, useMemo, useState } from 'react';
import {
  IconActivity,
  IconCircleCheck,
  IconFile,
  IconHome,
  IconSearch,
  IconSettings,
} from '@tabler/icons-react';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from '@/components/ui/command.jsx';
import { Kbd, KbdGroup } from '@/components/ui/kbd.jsx';

export function CommandPalette({ model, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => [
      {
        value: 'home',
        label: 'Open Home',
        icon: IconHome,
        shortcut: '⌘1',
        action: () => model.setActiveView('home'),
      },
      {
        value: 'tasks',
        label: 'Open Tasks',
        icon: IconCircleCheck,
        shortcut: '⌘2',
        action: () => model.setActiveView('tasks'),
      },
      {
        value: 'search',
        label: 'Search workspace',
        icon: IconSearch,
        shortcut: '⌘F',
        action: () => model.setActiveView('search'),
      },
      {
        value: 'activity',
        label: 'Open Activity',
        icon: IconActivity,
        action: () => model.setActiveView('activity'),
      },
      {
        value: 'new-note',
        label: 'Create new note',
        icon: IconFile,
        shortcut: '⌘N',
        action: () => model.addNote(),
      },
      {
        value: 'settings',
        label: 'Open Settings',
        icon: IconSettings,
        shortcut: '⌘,',
        action: onOpenSettings,
      },
    ],
    [model, onOpenSettings],
  );

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function run(item) {
    item.action();
    setOpen(false);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command items={items}>
          <CommandInput placeholder="Search commands…" />
          <CommandPanel>
            <CommandEmpty>No command found.</CommandEmpty>
            <CommandList>
              <CommandGroup items={items}>
                <CommandGroupLabel>Dao</CommandGroupLabel>
                <CommandCollection>
                  {(item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem key={item.value} value={item.value} onClick={() => run(item)}>
                        <Icon aria-hidden="true" />
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                      </CommandItem>
                    );
                  }}
                </CommandCollection>
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span>Navigate with arrows</span>
            <KbdGroup>
              <Kbd>Esc</Kbd>
              <span>Close</span>
            </KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
