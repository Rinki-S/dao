import { IconLink } from '@tabler/icons-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button.jsx';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover.jsx';
import { ToolbarButton } from '@/components/ui/toolbar.jsx';
import {
  escapeMarkdownDestination,
  getMarkdownLinkDestinationError,
  getMarkdownTitleError,
} from './markdown-toolbar-values.js';

export function MarkdownLinkControl({ editor, isActive }) {
  const hrefId = useId();
  const titleId = useId();
  const [href, setHref] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [linkCommandError, setLinkCommandError] = useState('');
  const [title, setTitle] = useState('');
  const destinationError = getMarkdownLinkDestinationError(href);
  const titleError = getMarkdownTitleError(title);
  const hrefError = destinationError || linkCommandError;

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      const attributes = editor.getAttributes('link');

      setHref(attributes.href ?? '');
      setTitle(attributes.title ?? '');
      setLinkCommandError('');
    }
    setIsOpen(nextOpen);
  };

  const applyLink = (event) => {
    event.preventDefault();
    const nextHref = href.trim();

    if (nextHref && !destinationError && !titleError) {
      const link = { href: escapeMarkdownDestination(nextHref) };
      const nextTitle = title.trim();

      if (nextTitle) {
        link.title = nextTitle;
      }

      const didApply = editor.chain().focus().extendMarkRange('link').setLink(link).run();

      if (didApply) {
        setLinkCommandError('');
        setIsOpen(false);
      } else {
        setLinkCommandError('This link destination could not be applied.');
      }
    }
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setHref('');
    setTitle('');
    setIsOpen(false);
  };

  const trigger = (
    <ToolbarButton
      render={
        <Button
          aria-label={isActive ? 'Edit link' : 'Add link'}
          aria-pressed={isActive || undefined}
          size="icon-sm"
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
        />
      }
    >
      <IconLink aria-hidden="true" data-icon="inline-start" />
    </ToolbarButton>
  );

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent>
        <PopoverTitle className="sr-only">
          {isActive ? 'Edit Markdown link' : 'Add Markdown link'}
        </PopoverTitle>
        <form onSubmit={applyLink}>
          <div className="grid gap-3">
            <Field data-invalid={Boolean(hrefError)}>
              <FieldLabel htmlFor={hrefId}>Link URL</FieldLabel>
              <Input
                autoFocus
                aria-invalid={Boolean(hrefError) || undefined}
                id={hrefId}
                placeholder="https://example.com"
                value={href}
                onChange={(event) => {
                  setHref(event.target.value);
                  setLinkCommandError('');
                }}
              />
              <FieldError>{hrefError}</FieldError>
            </Field>
            <Field data-invalid={Boolean(titleError)}>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                aria-invalid={Boolean(titleError) || undefined}
                id={titleId}
                placeholder="Optional title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              <FieldError>{titleError}</FieldError>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {isActive && (
              <Button size="sm" type="button" variant="ghost" onClick={removeLink}>
                Remove
              </Button>
            )}
            <Button size="sm" type="button" variant="ghost" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                href.trim() === '' || Boolean(destinationError || titleError || linkCommandError)
              }
              size="sm"
              type="submit"
            >
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
