import { IconAlertTriangle, IconFile, IconPhoto, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils';

/** A picture gets a picture's icon; everything else is a file. */
function iconFor(file) {
  // A file that cannot be read any more is not really a picture or a document
  // — it is a name and a problem, and the icon should say the problem.
  if (file.unreadable) return IconAlertTriangle;

  return file.mediaType?.startsWith('image/') ? IconPhoto : IconFile;
}

/** How many bytes, in the units somebody reads a file size in. */
function readableSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        const Icon = iconFor(file);
        const size = readableSize(file.size);

        return (
          <li
            className={cn(
              'flex max-w-64 items-center gap-1.5 rounded-md border bg-muted/40 py-1 ps-2 pe-1 text-xs',
              // Not an error's full colour: nothing is broken, and the turn
              // still happened. It is a fact about the file now.
              file.unreadable && 'border-warning/32 bg-warning/4',
            )}
            key={file.path}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground',
                file.unreadable && 'text-warning',
              )}
            />
            {/* The name, and the path behind it. Two files called shot.png from
                different folders are otherwise the same chip twice. */}
            <span
              className="truncate"
              title={
                file.unreadable
                  ? `${file.path} — moved, changed or deleted since it was sent`
                  : file.path
              }
            >
              {file.filename}
            </span>
            {/* The size, which is the thing somebody wants before they send
                rather than after: five megabytes is the ceiling, and a photo
                straight off a phone is often over it. */}
            {size ? <span className="shrink-0 text-muted-foreground">{size}</span> : null}
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
