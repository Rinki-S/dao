import { Button, Dropdown, FieldError, Input, Label, Modal, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ImageAdd01Icon from '@hugeicons/core-free-icons/ImageAdd01Icon';
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon';
import TableIcon from '@hugeicons/core-free-icons/TableIcon';

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
  return /[[\]`]/.test(altText)
    ? 'Alt text cannot contain square brackets or backticks.'
    : '';
}

export function MarkdownInsertControl({ editor, isDisabled = false }) {
  const [altText, setAltText] = useState('');
  const [imageCommandError, setImageCommandError] = useState('');
  const [imageSource, setImageSource] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
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
      setIsImageDialogOpen(true);
      return;
    }

    if (key === 'horizontal-rule') {
      editor.chain().focus().setHorizontalRule().run();
      return;
    }

    if (key === 'table') {
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
      <Dropdown>
        <Button
          aria-label="Insert Markdown block"
          className="dao-markdown-toolbar__insert"
          isDisabled={isDisabled}
          ref={insertButtonRef}
          size="sm"
          type="button"
          variant="ghost"
        >
          <span>Insert</span>
          <HugeiconsIcon aria-hidden="true" className="size-3.5" icon={ArrowDown01Icon} />
        </Button>
        <Dropdown.Popover className="w-44" placement="bottom end">
          <Dropdown.Menu aria-label="Insert Markdown block" onAction={handleInsertAction}>
            <Dropdown.Item id="horizontal-rule" textValue="Divider">
              <HugeiconsIcon aria-hidden="true" className="size-4" icon={MinusSignIcon} />
              <Label>Divider</Label>
            </Dropdown.Item>
            <Dropdown.Item id="image" textValue="Image">
              <HugeiconsIcon aria-hidden="true" className="size-4" icon={ImageAdd01Icon} />
              <Label>Image</Label>
            </Dropdown.Item>
            <Dropdown.Item id="table" textValue="Table">
              <HugeiconsIcon aria-hidden="true" className="size-4" icon={TableIcon} />
              <Label>Table</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Modal
        isOpen={isImageDialogOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setIsImageDialogOpen(true);
          } else {
            closeImageDialog();
          }
        }}
      >
        <Modal.Trigger aria-hidden="true" className="sr-only" tabIndex={-1}>
          Open image dialog
        </Modal.Trigger>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog aria-label="Insert image reference">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Insert image</Modal.Heading>
                <p className="text-sm text-muted">
                  Add a portable remote image reference to this Markdown note.
                </p>
              </Modal.Header>
              <form onSubmit={insertImage}>
                <Modal.Body className="flex flex-col gap-3">
                  <TextField
                    fullWidth
                    isInvalid={Boolean(imageSourceError)}
                    isRequired
                    value={imageSource}
                    onChange={setImageSource}
                  >
                    <Label>Image URL</Label>
                    <Input autoFocus placeholder="https://example.com/diagram.png" />
                    <FieldError>{imageSourceError}</FieldError>
                  </TextField>
                  <TextField
                    fullWidth
                    isInvalid={Boolean(imageAltTextError)}
                    value={altText}
                    onChange={setAltText}
                  >
                    <Label>Alt text</Label>
                    <Input placeholder="Describe the image" />
                    <FieldError>{imageAltTextError}</FieldError>
                  </TextField>
                  <TextField
                    fullWidth
                    isInvalid={Boolean(imageTitleError)}
                    value={imageTitle}
                    onChange={setImageTitle}
                  >
                    <Label>Title</Label>
                    <Input placeholder="Optional title" />
                    <FieldError>{imageTitleError}</FieldError>
                  </TextField>
                  {imageCommandError && (
                    <p className="text-sm text-danger" role="alert">
                      {imageCommandError}
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button type="button" variant="ghost" onPress={closeImageDialog}>
                    Cancel
                  </Button>
                  <Button isDisabled={!normalizedImageSource || hasImageError} type="submit">
                    Insert image
                  </Button>
                </Modal.Footer>
              </form>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
