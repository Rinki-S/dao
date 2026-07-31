import { IconChevronDown, IconMinus, IconPhotoPlus, IconTable } from '@tabler/icons-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.jsx';
import { Input } from '@/components/ui/input.jsx';
import { escapeMarkdownDestination, getMarkdownTitleError } from './markdown-toolbar-values.js';

function getImageSourceError(source) {
  const trimmedSource = source.trim();

  if (!trimmedSource) {
    return '';
  }

  try {
    const url = new URL(trimmedSource);

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return '';
    }
  } catch {
    // The shared error below covers malformed and relative values.
  }

  return 'Use an HTTP or HTTPS URL. Local attachments are not available yet.';
}

function getImageAltTextError(altText) {
  return /[[\]`]/.test(altText) ? 'Alt text cannot contain square brackets or backticks.' : '';
}

export function MarkdownInsertControl({ disabled = false, editor }) {
  const altTextId = useId();
  const imageSourceId = useId();
  const imageTitleId = useId();
  const [altText, setAltText] = useState('');
  const [imageCommandError, setImageCommandError] = useState('');
  const [imageSource, setImageSource] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
  const insertButtonRef = useRef(null);
  const normalizedImageSource = imageSource.trim();
  const imageSourceError = getImageSourceError(imageSource);
  const imageAltTextError = getImageAltTextError(altText);
  const imageTitleError = getMarkdownTitleError(imageTitle);
  const hasImageError = Boolean(imageSourceError || imageAltTextError || imageTitleError);

  const resetImageForm = () => {
    setAltText('');
    setImageCommandError('');
    setImageSource('');
    setImageTitle('');
  };

  const closeImageDialog = () => {
    setIsImageDialogOpen(false);
    resetImageForm();
    queueMicrotask(() => {
      insertButtonRef.current?.focus();
    });
  };

  const handleInsertAction = (key) => {
    if (key === 'image') {
      setImageCommandError('');
      setIsInsertMenuOpen(false);
      setIsImageDialogOpen(true);
      return;
    }

    if (key === 'horizontal-rule') {
      setIsInsertMenuOpen(false);
      editor.chain().focus().setHorizontalRule().run();
      return;
    }

    if (key === 'table') {
      setIsInsertMenuOpen(false);
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
  };

  const insertImage = (event) => {
    event.preventDefault();

    if (!normalizedImageSource || hasImageError) {
      return;
    }

    const image = {
      src: escapeMarkdownDestination(new URL(normalizedImageSource).href),
    };
    const normalizedAltText = altText.trim();
    const normalizedImageTitle = imageTitle.trim();

    if (normalizedAltText) {
      image.alt = normalizedAltText;
    }

    if (normalizedImageTitle) {
      image.title = normalizedImageTitle;
    }

    const didInsert = editor.chain().focus().setImage(image).run();

    if (didInsert) {
      closeImageDialog();
    } else {
      setImageCommandError('The image could not be inserted at this position.');
    }
  };

  return (
    <>
      <DropdownMenu open={isInsertMenuOpen} onOpenChange={setIsInsertMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Insert Markdown block"
              className="dao-markdown-toolbar__insert"
              disabled={disabled}
              ref={insertButtonRef}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                if (!isInsertMenuOpen) {
                  setIsInsertMenuOpen(true);
                }
              }}
            />
          }
        >
          <span>Insert</span>
          <IconChevronDown aria-hidden="true" className="size-3.5" data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem label="Divider" onClick={() => handleInsertAction('horizontal-rule')}>
              <IconMinus aria-hidden="true" data-icon="inline-start" />
              Divider
            </DropdownMenuItem>
            <DropdownMenuItem label="Image" onClick={() => handleInsertAction('image')}>
              <IconPhotoPlus aria-hidden="true" data-icon="inline-start" />
              Image
            </DropdownMenuItem>
            <DropdownMenuItem label="Table" onClick={() => handleInsertAction('table')}>
              <IconTable aria-hidden="true" data-icon="inline-start" />
              Table
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isImageDialogOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setIsImageDialogOpen(true);
          } else {
            closeImageDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert image reference</DialogTitle>
            <DialogDescription>
              Add a portable remote image reference to this Markdown note.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={insertImage}>
            <FieldGroup className="gap-3">
              <Field data-invalid={Boolean(imageSourceError)}>
                <FieldLabel htmlFor={imageSourceId}>Image URL</FieldLabel>
                <Input
                  autoFocus
                  aria-invalid={Boolean(imageSourceError) || undefined}
                  id={imageSourceId}
                  placeholder="https://example.com/diagram.png"
                  required
                  value={imageSource}
                  onChange={(event) => {
                    setImageSource(event.target.value);
                  }}
                />
                <FieldError>{imageSourceError}</FieldError>
              </Field>
              <Field data-invalid={Boolean(imageAltTextError)}>
                <FieldLabel htmlFor={altTextId}>Alt text</FieldLabel>
                <Input
                  aria-invalid={Boolean(imageAltTextError) || undefined}
                  id={altTextId}
                  placeholder="Describe the image"
                  value={altText}
                  onChange={(event) => {
                    setAltText(event.target.value);
                  }}
                />
                <FieldError>{imageAltTextError}</FieldError>
              </Field>
              <Field data-invalid={Boolean(imageTitleError)}>
                <FieldLabel htmlFor={imageTitleId}>Title</FieldLabel>
                <Input
                  aria-invalid={Boolean(imageTitleError) || undefined}
                  id={imageTitleId}
                  placeholder="Optional title"
                  value={imageTitle}
                  onChange={(event) => {
                    setImageTitle(event.target.value);
                  }}
                />
                <FieldError>{imageTitleError}</FieldError>
              </Field>
              {imageCommandError && (
                <p className="text-xs text-destructive" role="alert">
                  {imageCommandError}
                </p>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeImageDialog}>
                Cancel
              </Button>
              <Button disabled={!normalizedImageSource || hasImageError} type="submit">
                Insert image
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
