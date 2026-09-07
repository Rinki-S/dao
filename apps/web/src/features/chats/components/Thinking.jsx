import { IconChevronRight, IconSparkles } from '@tabler/icons-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.jsx';

/**
 * A reasoning model's working, folded away above the answer it produced.
 *
 * Folded rather than shown, and shown at all only when the reader has asked
 * for it in Settings. The working is routinely longer than the reply and is
 * not addressed to anybody — it is the model talking to itself on the way to
 * an answer, and a transcript that led with it every time would bury the part
 * that was written to be read.
 *
 * It is plain text, not Markdown. A model's working is full of half-finished
 * lists and stray symbols it never meant as formatting, and rendering those as
 * headings and bullets dresses a train of thought up as a document.
 */
export function Thinking({ text, live = false }) {
  if (!text) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-sm text-muted-foreground text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <IconChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-200 group-data-panel-open:rotate-90"
        />
        <IconSparkles aria-hidden="true" className="size-3.5 shrink-0" />
        {/* The present tense while it is arriving, the past tense once it has.
            A line still saying "Thinking" under a finished reply would be
            describing something that stopped happening. */}
        <span>{live ? 'Thinking' : 'Thought about this'}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-2 whitespace-pre-wrap border-l-2 py-0.5 pl-3 text-muted-foreground text-xs leading-relaxed">
          {text}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
