import { IconChevronDown } from '@tabler/icons-react';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';

const BLOCK_TYPES = [
  { id: 'paragraph', label: 'Paragraph', shortLabel: 'Text', shortcut: 'Mod+Alt+0' },
  ...Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;

    return {
      id: `heading-${level}`,
      label: `Heading ${level}`,
      level,
      shortLabel: `H${level}`,
      shortcut: `Mod+Alt+${level}`,
    };
  }),
];

function getActiveTextStyleId(editor) {
  const heading = BLOCK_TYPES.find(
    (blockType) => blockType.level && editor.isActive('heading', { level: blockType.level }),
  );

  if (heading) {
    return heading.id;
  }

  return editor.isActive('paragraph') ? 'paragraph' : null;
}

export function MarkdownBlockTypeControl({ disabled = false, editor }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeTextStyleId = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor && !currentEditor.isDestroyed ? getActiveTextStyleId(currentEditor) : null,
  });
  const activeTextStyle = BLOCK_TYPES.find((blockType) => blockType.id === activeTextStyleId);

  const handleBlockTypeAction = (key) => {
    const nextBlockType = BLOCK_TYPES.find((blockType) => blockType.id === String(key));

    if (!nextBlockType) {
      return;
    }

    const chain = editor.chain().focus();

    if (nextBlockType.level) {
      chain.setHeading({ level: nextBlockType.level }).run();
      return;
    }

    chain.setParagraph().run();
  };

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Text style: ${activeTextStyle?.label ?? 'Other block'}`}
            className="dao-markdown-toolbar__block-type"
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              if (!isMenuOpen) {
                setIsMenuOpen(true);
              }
            }}
          />
        }
      >
        <span className="dao-markdown-toolbar__block-type-label">
          {activeTextStyle?.shortLabel ?? 'Style'}
        </span>
        <IconChevronDown aria-hidden="true" className="size-3.5" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={activeTextStyle?.id ?? ''}
            onValueChange={handleBlockTypeAction}
          >
            {BLOCK_TYPES.map((blockType) => (
              <DropdownMenuRadioItem closeOnClick key={blockType.id} value={blockType.id}>
                <span className="dao-markdown-block-option__label">{blockType.label}</span>
                <DropdownMenuShortcut
                  aria-hidden="true"
                  className="dao-markdown-block-option__shortcut"
                >
                  {blockType.shortcut}
                </DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
