import { IconFile, IconPhoto, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';

/** A picture gets a picture's icon; everything else is a file. */
function iconFor(mediaType) {
  return mediaType?.startsWith('image/') ? IconPhoto : IconFile;
}

/**
 * The files on a turn, named.
 *
 * Named rather than shown. Nothing is copied when a file is attached, so the
 * only way to draw a thumbnail would be to read the file back off disk on
 * every render — and the file may since have moved, been edited, or been
 * deleted, which would make the transcript's picture of a past turn depend on
 * what is true now. A name is a claim the transcript can keep.
 */
export function Attachments({ files, onRemove }) {
  if (!files || files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((file) => {
        const Icon = iconFor(file.mediaType);

        return (
          <li
            className="flex max-w-56 items-center gap-1.5 rounded-md border bg-muted/40 py-1 ps-2 pe-1 text-xs"
            key={file.path}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            {/* The name, and the path behind it. Two files called shot.png from
                different folders are otherwise the same chip twice. */}
            <span className="truncate" title={file.path}>
              {file.filename}
            </span>
            {onRemove ? (
              <Button
                aria-label={`Remove ${file.filename}`}
                className="size-5 shrink-0"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={() => onRemove(file)}
              >
                <IconX aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
