import { IconCircleCheck } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ToolbarButton } from '@/components/ui/toolbar.jsx';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip.jsx';
import { useTitlebarInset } from '@/components/shell/use-titlebar-inset.js';
import { cn } from '@/lib/utils';

/** An icon button in an editor toolbar, labelled for both a screen reader and a tooltip. */
export function EditorToolbarButton({
  disabled = false,
  editor,
  icon: Icon,
  isActive = false,
  label,
  onClick,
}) {
  const button = (
    <ToolbarButton
      render={
        <Button
          aria-label={label}
          aria-pressed={isActive || undefined}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
          onClick={() => onClick(editor)}
        />
      }
    >
      <Icon aria-hidden="true" />
    </ToolbarButton>
  );

  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={button} />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The bar every editor toolbar sits in: window-control clearance on the left,
 * the controls centred, and the save status on the right. Only the controls
 * differ between a note and a task list.
 */
export function EditorToolbarShell({ children, saveStatus, saveStatusLabel }) {
  const titlebarInset = useTitlebarInset();

  return (
    <div className="flex h-12 items-center gap-2 border-b px-2">
      {/* Equal-flex rails on both sides keep the toolbar centred in the bar no
          matter how wide the save status gets; the leading one also reserves
          room for the window controls while the sidebar is hidden. */}
      <div aria-hidden="true" className={cn('flex self-stretch', titlebarInset.rail)}>
        <div className={cn(titlebarInset.drag, 'flex-1', titlebarInset.controlsOffset)} />
      </div>
      {children}
      {/* Drag lives here rather than on the bar: an app-region ancestor swallows
          clicks for the fixed window trigger overlapping it, and the trigger is
          not a descendant of this bar. */}
      <div
        className={cn(
          titlebarInset.drag,
          'flex min-w-0 flex-1 items-center justify-end self-stretch',
        )}
      >
        {saveStatusLabel ? (
          <Badge
            aria-live="polite"
            variant={
              saveStatus === 'failed' ? 'error' : saveStatus === 'saved' ? 'success' : 'secondary'
            }
          >
            <IconCircleCheck aria-hidden="true" />
            {saveStatusLabel}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
