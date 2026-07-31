import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { AppSearchBar } from './AppSearchBar.jsx';

export function AppTitleBar({ isSidebarOpen, onToggleSidebar }) {
  return (
    <header className="app-drag-region relative z-100 flex h-12 shrink-0 items-center border-b border-border bg-surface">
      <div className="flex w-20 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 pb-0.5">
        <Button
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="app-no-drag size-8 text-muted-foreground"
          size="icon-lg"
          type="button"
          variant="ghost"
          onClick={onToggleSidebar}
        >
          {isSidebarOpen ? (
            <IconLayoutSidebarLeftCollapse
              aria-hidden="true"
              className="size-[18px] shrink-0 translate-y-px"
              data-icon="inline-start"
            />
          ) : (
            <IconLayoutSidebarLeftExpand
              aria-hidden="true"
              className="size-[18px] shrink-0 translate-y-px"
              data-icon="inline-start"
            />
          )}
        </Button>
        <div className="min-w-0 truncate text-xs font-medium text-muted-foreground">Dao</div>
      </div>
      <div className="absolute left-1/2 w-[min(28rem,calc(100%-16rem))] -translate-x-1/2">
        <AppSearchBar />
      </div>
    </header>
  );
}
