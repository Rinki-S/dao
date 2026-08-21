import { IconChevronDown } from '@tabler/icons-react';
import { useEditorState } from '@tiptap/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.jsx';
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuShortcut,
  MenuTrigger,
} from '@/components/ui/menu.jsx';
import { ToolbarButton } from '@/components/ui/toolbar.jsx';

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
    <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <MenuTrigger
        render={
          <ToolbarButton
            render={
              <Button
                aria-label={`Text style: ${activeTextStyle?.label ?? 'Other block'}`}
                disabled={disabled}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  if (!isMenuOpen) setIsMenuOpen(true);
                }}
              />
            }
          />
        }
      >
        <span>{activeTextStyle?.shortLabel ?? 'Style'}</span>
        <IconChevronDown aria-hidden="true" data-icon="inline-end" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuGroup>
          <MenuRadioGroup value={activeTextStyle?.id ?? ''} onValueChange={handleBlockTypeAction}>
            {BLOCK_TYPES.map((blockType) => (
              <MenuRadioItem closeOnClick key={blockType.id} value={blockType.id}>
                <span>{blockType.label}</span>
                <MenuShortcut aria-hidden="true">{blockType.shortcut}</MenuShortcut>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
