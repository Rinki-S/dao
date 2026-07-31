import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  FOOTNOTE_DEFINITION_FIXTURES,
  REFERENCE_DEFINITION_FIXTURES,
  UNSAFE_QUOTED_TITLE_FIXTURES,
} from './markdown-compatibility.fixtures.js';
import { MarkdownRichEditor } from './MarkdownRichEditor.jsx';
import { MarkdownEditorToolbar } from './MarkdownEditorToolbar.jsx';

describe('MarkdownRichEditor', () => {
  it('renders a stable loading toolbar before the editor instance is ready', () => {
    render(<MarkdownEditorToolbar editor={null} />);

    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('renders supported Markdown in the rich-text editor without emitting an initial change', async () => {
    const onMarkdownChange = vi.fn();

    render(<MarkdownRichEditor initialMarkdown="# Dao" onMarkdownChange={onMarkdownChange} />);

    const editor = await screen.findByRole('textbox', { name: 'Markdown note content' });

    expect(editor).toHaveTextContent('Dao');
    expect(screen.getByRole('toolbar', { name: 'Markdown formatting' })).toBeInTheDocument();
    expect(onMarkdownChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Link URL')).not.toBeInTheDocument();
  });

  it('opens the shadcn Base UI link editor instead of a native prompt', async () => {
    render(<MarkdownRichEditor initialMarkdown="Link me" onMarkdownChange={vi.fn()} />);

    await screen.findByRole('textbox', { name: 'Markdown note content' });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(await screen.findByText('Link URL')).toBeInTheDocument();
    const urlInput = screen.getByPlaceholderText('https://example.com');
    expect(urlInput).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    fireEvent.change(urlInput, { target: { value: 'https://dao.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Link URL')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(await screen.findByPlaceholderText('https://example.com'), {
      target: { value: 'https://dao.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.queryByText('Link URL')).not.toBeInTheDocument();
    });
  });

  it('falls back to a source textarea and preserves unsupported Markdown edits', () => {
    const onMarkdownChange = vi.fn();
    const markdown = '---\ntitle: Dao\n---\n\nBody';

    render(<MarkdownRichEditor initialMarkdown={markdown} onMarkdownChange={onMarkdownChange} />);

    const editor = screen.getByRole('textbox', { name: 'Markdown note content' });
    const descriptionId = editor.getAttribute('aria-describedby');
    expect(editor).toHaveValue(markdown);
    expect(screen.getByText('Source mode')).toBeInTheDocument();
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId)).toHaveTextContent('frontmatter');

    fireEvent.change(editor, { target: { value: `${markdown}\n\nUpdated` } });

    expect(onMarkdownChange).toHaveBeenLastCalledWith(`${markdown}\n\nUpdated`);
  });

  it.each(REFERENCE_DEFINITION_FIXTURES)(
    'keeps $name in source mode instead of parsing it with Tiptap',
    ({ markdown }) => {
      const onMarkdownChange = vi.fn();
      const normalizedMarkdown = markdown.replaceAll('\r\n', '\n');

      render(<MarkdownRichEditor initialMarkdown={markdown} onMarkdownChange={onMarkdownChange} />);

      const editor = screen.getByRole('textbox', { name: 'Markdown note content' });
      const descriptionId = editor.getAttribute('aria-describedby');
      expect(editor).toHaveValue(normalizedMarkdown);
      expect(screen.getByText('Source mode')).toBeInTheDocument();
      expect(descriptionId).toBeTruthy();
      expect(document.getElementById(descriptionId)).toHaveTextContent('reference definitions');
      expect(onMarkdownChange).not.toHaveBeenCalled();

      fireEvent.change(editor, { target: { value: `${normalizedMarkdown}\nUpdated` } });
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`${normalizedMarkdown}\nUpdated`);
    },
  );

  it.each(FOOTNOTE_DEFINITION_FIXTURES)(
    'keeps $name in source mode instead of escaping it through Tiptap',
    ({ markdown }) => {
      const onMarkdownChange = vi.fn();

      render(<MarkdownRichEditor initialMarkdown={markdown} onMarkdownChange={onMarkdownChange} />);

      const editor = screen.getByRole('textbox', { name: 'Markdown note content' });
      const descriptionId = editor.getAttribute('aria-describedby');
      expect(editor).toHaveValue(markdown);
      expect(screen.getByText('Source mode')).toBeInTheDocument();
      expect(descriptionId).toBeTruthy();
      expect(document.getElementById(descriptionId)).toHaveTextContent('footnote definitions');

      fireEvent.change(editor, { target: { value: `${markdown}\nUpdated` } });
      expect(onMarkdownChange).toHaveBeenLastCalledWith(`${markdown}\nUpdated`);
    },
  );

  it.each(UNSAFE_QUOTED_TITLE_FIXTURES)(
    'keeps $name in source mode instead of rewriting its delimiter',
    ({ markdown }) => {
      const onMarkdownChange = vi.fn();

      render(<MarkdownRichEditor initialMarkdown={markdown} onMarkdownChange={onMarkdownChange} />);

      const editor = screen.getByRole('textbox', { name: 'Markdown note content' });
      const descriptionId = editor.getAttribute('aria-describedby');
      expect(editor).toHaveValue(markdown);
      expect(screen.getByText('Source mode')).toBeInTheDocument();
      expect(descriptionId).toBeTruthy();
      expect(document.getElementById(descriptionId)).toHaveTextContent(
        'link or image titles with double quotes',
      );
      expect(onMarkdownChange).not.toHaveBeenCalled();
    },
  );
});
