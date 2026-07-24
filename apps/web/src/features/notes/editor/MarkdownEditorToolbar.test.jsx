import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditorToolbar } from './MarkdownEditorToolbar.jsx';

vi.mock('@tiptap/react', async () => {
  const actual = await vi.importActual('@tiptap/react');

  return {
    ...actual,
    useEditorState: ({ editor, selector }) => selector({ editor }),
  };
});

function createFluentChain(methods) {
  const chain = {};

  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }

  chain.run = vi.fn(() => true);
  return chain;
}

function createEditor({ activeTypes = [], headingLevel = null, linkAttributes = {} } = {}) {
  const capabilityChain = createFluentChain(['redo', 'undo']);
  const commandChain = createFluentChain([
    'focus',
    'extendMarkRange',
    'insertTable',
    'redo',
    'setHeading',
    'setHorizontalRule',
    'setImage',
    'setLink',
    'setParagraph',
    'toggleBlockquote',
    'toggleBold',
    'toggleBulletList',
    'toggleCode',
    'toggleCodeBlock',
    'toggleItalic',
    'toggleOrderedList',
    'toggleStrike',
    'toggleTaskList',
    'undo',
    'unsetLink',
  ]);
  const activeTypeSet = new Set(activeTypes);
  const editor = {
    can: vi.fn(() => ({ chain: () => capabilityChain })),
    chain: vi.fn(() => commandChain),
    getAttributes: vi.fn(() => linkAttributes),
    isActive: vi.fn((type, attributes) => {
      if (type === 'heading') {
        return attributes?.level === headingLevel;
      }

      return activeTypeSet.has(type);
    }),
    isDestroyed: false,
  };

  return { capabilityChain, commandChain, editor };
}

describe('MarkdownEditorToolbar', () => {
  it('lists Paragraph and every Markdown heading level with the active level selected', async () => {
    const user = userEvent.setup();
    const { editor } = createEditor({ headingLevel: 3 });

    render(<MarkdownEditorToolbar editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Text style: Heading 3' }));

    const expectedBlockTypes = [
      'Paragraph',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Heading 5',
      'Heading 6',
    ];

    for (const blockType of expectedBlockTypes) {
      expect(screen.getByRole('menuitemradio', { name: blockType })).toBeInTheDocument();
    }

    expect(screen.getByRole('menuitemradio', { name: 'Heading 3' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('sets the selected heading level and can restore a paragraph', async () => {
    const user = userEvent.setup();
    const { commandChain, editor } = createEditor({ headingLevel: 3 });

    const { rerender } = render(<MarkdownEditorToolbar editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Text style: Heading 3' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Heading 4' }));

    expect(commandChain.focus).toHaveBeenCalledTimes(1);
    expect(commandChain.setHeading).toHaveBeenCalledWith({ level: 4 });
    expect(commandChain.run).toHaveBeenCalledTimes(1);

    const headingFourEditor = createEditor({ headingLevel: 4 });
    rerender(<MarkdownEditorToolbar editor={headingFourEditor.editor} />);
    expect(screen.getByRole('button', { name: 'Text style: Heading 4' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Text style: Heading 4' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Paragraph' }));

    expect(headingFourEditor.commandChain.setParagraph).toHaveBeenCalledTimes(1);
    expect(headingFourEditor.commandChain.run).toHaveBeenCalledTimes(1);

    const paragraphEditor = createEditor({ activeTypes: ['paragraph'] });
    rerender(<MarkdownEditorToolbar editor={paragraphEditor.editor} />);
    expect(screen.getByRole('button', { name: 'Text style: Paragraph' })).toBeInTheDocument();
  });

  it('uses a neutral text-style state for blocks outside the paragraph and heading subset', () => {
    const { editor } = createEditor({ activeTypes: ['codeBlock'] });

    render(<MarkdownEditorToolbar editor={editor} />);

    expect(screen.getByRole('button', { name: 'Text style: Other block' })).toHaveTextContent(
      'Style',
    );
  });

  it('disables block-level toolbar commands inside a GFM table cell', () => {
    const { editor } = createEditor({ activeTypes: ['paragraph', 'table'] });

    render(<MarkdownEditorToolbar editor={editor} />);

    expect(screen.getByRole('button', { name: 'Text style: Paragraph' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ordered list' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Task list' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Blockquote' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Code block' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insert Markdown block' })).toBeDisabled();
  });

  it('inserts dividers and portable GFM tables from one compact menu', async () => {
    const user = userEvent.setup();
    const { commandChain, editor } = createEditor();

    render(<MarkdownEditorToolbar editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Insert Markdown block' }));
    await user.click(screen.getByRole('menuitem', { name: 'Divider' }));

    expect(commandChain.setHorizontalRule).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Insert Markdown block' }));
    await user.click(screen.getByRole('menuitem', { name: 'Table' }));

    expect(commandChain.insertTable).toHaveBeenCalledWith({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    });
    expect(commandChain.run).toHaveBeenCalledTimes(2);
  });

  it('inserts a remote Markdown image with alt text and an optional title', async () => {
    const user = userEvent.setup();
    const { commandChain, editor } = createEditor();

    render(<MarkdownEditorToolbar editor={editor} />);

    const insertMenuButton = screen.getByRole('button', { name: 'Insert Markdown block' });
    await user.click(insertMenuButton);
    await user.click(screen.getByRole('menuitem', { name: 'Image' }));

    expect(
      await screen.findByRole('dialog', { name: 'Insert image reference' }),
    ).toBeInTheDocument();

    const imageUrl = screen.getByRole('textbox', { name: 'Image URL' });
    const imageSubmitButton = screen.getByRole('button', { name: 'Insert image' });
    expect(imageSubmitButton).toBeDisabled();

    await user.type(imageUrl, './diagram.png');
    expect(screen.getByText(/Use an HTTP or HTTPS URL/)).toBeInTheDocument();
    expect(imageSubmitButton).toBeDisabled();

    await user.clear(imageUrl);
    await user.type(imageUrl, 'https://example.com/diagram(1).png');
    const altText = screen.getByRole('textbox', { name: 'Alt text' });
    fireEvent.change(altText, { target: { value: 'Architecture [draft]' } });
    expect(
      screen.getByText('Alt text cannot contain square brackets or backticks.'),
    ).toBeInTheDocument();
    expect(imageSubmitButton).toBeDisabled();

    await user.clear(altText);
    await user.type(altText, 'Architecture `draft`');
    expect(
      screen.getByText('Alt text cannot contain square brackets or backticks.'),
    ).toBeInTheDocument();
    expect(imageSubmitButton).toBeDisabled();

    await user.clear(altText);
    await user.type(altText, 'Architecture');
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.type(title, 'Dao "architecture"');
    expect(screen.getByText('Titles cannot contain double quotes.')).toBeInTheDocument();
    expect(imageSubmitButton).toBeDisabled();

    await user.clear(title);
    await user.type(title, 'Dao architecture');
    await user.click(imageSubmitButton);

    expect(commandChain.setImage).toHaveBeenCalledWith({
      src: 'https://example.com/diagram%281%29.png',
      alt: 'Architecture',
      title: 'Dao architecture',
    });
    expect(commandChain.run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(insertMenuButton).toHaveFocus());
  });

  it('restores focus to Insert after dismissing the image dialog', async () => {
    const user = userEvent.setup();
    const { editor } = createEditor();

    render(<MarkdownEditorToolbar editor={editor} />);

    const insertMenuButton = screen.getByRole('button', { name: 'Insert Markdown block' });
    await user.click(insertMenuButton);
    await user.click(screen.getByRole('menuitem', { name: 'Image' }));
    await screen.findByRole('dialog', { name: 'Insert image reference' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Insert image reference' })).not.toBeInTheDocument();
      expect(insertMenuButton).toHaveFocus();
    });

    await user.click(insertMenuButton);
    await user.click(screen.getByRole('menuitem', { name: 'Image' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(insertMenuButton).toHaveFocus());
  });

  it('edits the optional Markdown link title without discarding its URL', async () => {
    const user = userEvent.setup();
    const { commandChain, editor } = createEditor({
      activeTypes: ['link'],
      linkAttributes: { href: 'https://example.com/docs (draft)', title: 'Old title' },
    });

    render(<MarkdownEditorToolbar editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Edit link' }));

    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://example.com/docs (draft)',
    );
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('Old title');

    await user.clear(title);
    await user.type(title, 'New "title"');
    expect(screen.getByText('Titles cannot contain double quotes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(commandChain.extendMarkRange).toHaveBeenCalledWith('link');
    expect(commandChain.setLink).toHaveBeenCalledWith({
      href: 'https://example.com/docs%20%28draft%29',
      title: 'New title',
    });
  });

  it('keeps unsupported link protocols open with an actionable error', async () => {
    const user = userEvent.setup();
    const { commandChain, editor } = createEditor();

    render(<MarkdownEditorToolbar editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'javascript:alert(1)');

    expect(screen.getByText('This link protocol is not supported.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(commandChain.setLink).not.toHaveBeenCalled();
  });

  it('keeps inline mark state on the existing toggle buttons', () => {
    const { editor } = createEditor({ activeTypes: ['bold'] });

    render(<MarkdownEditorToolbar editor={editor} />);

    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italic' })).not.toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
