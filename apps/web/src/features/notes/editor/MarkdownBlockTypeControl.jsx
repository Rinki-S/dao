import { Button, Dropdown } from '@heroui/react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import { useEditorState } from '@tiptap/react';

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

export function MarkdownBlockTypeControl({ editor, isDisabled = false }) {
  const activeTextStyleId = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor && !currentEditor.isDestroyed
        ? getActiveTextStyleId(currentEditor)
        : null,
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
    <Dropdown>
      <Button
        aria-label={`Text style: ${activeTextStyle?.label ?? 'Other block'}`}
        className="dao-markdown-toolbar__block-type"
        isDisabled={isDisabled}
        size="sm"
        type="button"
        variant="ghost"
      >
        <span className="dao-markdown-toolbar__block-type-label">
          {activeTextStyle?.shortLabel ?? 'Style'}
        </span>
        <HugeiconsIcon aria-hidden="true" className="size-3.5" icon={ArrowDown01Icon} />
      </Button>
      <Dropdown.Popover className="w-52" placement="bottom start">
        <Dropdown.Menu
          aria-label="Text style"
          selectedKeys={activeTextStyle ? new Set([activeTextStyle.id]) : new Set()}
          selectionMode="single"
          onAction={handleBlockTypeAction}
        >
          {BLOCK_TYPES.map((blockType) => (
            <Dropdown.Item id={blockType.id} key={blockType.id} textValue={blockType.label}>
              <Dropdown.ItemIndicator />
              <span className="dao-markdown-block-option__label">{blockType.label}</span>
              <kbd aria-hidden="true" className="dao-markdown-block-option__shortcut">
                {blockType.shortcut}
              </kbd>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
