import { Button, FieldError, Input, Label, Popover, TextField } from '@heroui/react';
import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon';

import {
  escapeMarkdownDestination,
  getMarkdownLinkDestinationError,
  getMarkdownTitleError,
} from './markdown-toolbar-values.js';

export function MarkdownLinkControl({ editor, isActive }) {
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

  return (
    <Popover isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button
        aria-label={isActive ? 'Edit link' : 'Add link'}
        aria-pressed={isActive || undefined}
        className="dao-markdown-toolbar__button"
        isIconOnly
        size="sm"
        type="button"
        variant={isActive ? 'secondary' : 'ghost'}
      >
        <HugeiconsIcon aria-hidden="true" className="size-4" icon={Link01Icon} />
      </Button>
      <Popover.Content className="dao-markdown-link-popover__content" placement="bottom">
        <Popover.Dialog className="dao-markdown-link-popover">
          <form className="dao-markdown-link-popover__form" onSubmit={applyLink}>
            <TextField
              fullWidth
              isInvalid={Boolean(hrefError)}
              value={href}
              onChange={(value) => {
                setHref(value);
                setLinkCommandError('');
              }}
            >
              <Label>Link URL</Label>
              <Input autoFocus placeholder="https://example.com" variant="secondary" />
              <FieldError>{hrefError}</FieldError>
            </TextField>
            <TextField fullWidth isInvalid={Boolean(titleError)} value={title} onChange={setTitle}>
              <Label>Title</Label>
              <Input placeholder="Optional title" variant="secondary" />
              <FieldError>{titleError}</FieldError>
            </TextField>
            <div className="dao-markdown-link-popover__actions">
              {isActive && (
                <Button size="sm" type="button" variant="ghost" onPress={removeLink}>
                  Remove
                </Button>
              )}
              <Button size="sm" type="button" variant="ghost" onPress={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                isDisabled={
                  href.trim() === '' || Boolean(destinationError || titleError || linkCommandError)
                }
                size="sm"
                type="submit"
              >
                Apply
              </Button>
            </div>
          </form>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
