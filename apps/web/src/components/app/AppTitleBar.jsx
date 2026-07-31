import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { Button } from '@/components/ui/button.jsx';
import { AppSearchBar } from './AppSearchBar.jsx';

export function AppTitleBar({ isSidebarOpen, onToggleSidebar }) {
  return (
    <header className="app-drag-region relative z-100 flex h-12 shrink-0 items-center border-b border-border bg-background/40">
      <div className="flex w-20 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 pl-3">
        <Button
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="app-no-drag size-8 translate-y-[0.5px] text-muted-foreground"
          size="icon-lg"
          type="button"
          variant="ghost"
          onClick={onToggleSidebar}
        >
          {isSidebarOpen ? (
            <IconLayoutSidebarLeftCollapse
              aria-hidden="true"
              className="size-[18px] shrink-0"
              data-icon="inline-start"
            />
          ) : (
            <IconLayoutSidebarLeftExpand
              aria-hidden="true"
              className="size-[18px] shrink-0"
              data-icon="inline-start"
            />
          )}
        </Button>
        <div className="min-w-0 truncate text-xs font-medium text-muted-foreground">Dao</div>
      </div>
      <div className="absolute top-1/2 left-1/2 w-[min(28rem,calc(100%-16rem))] -translate-x-1/2 -translate-y-1/2">
        <AppSearchBar />
      </div>
    </header>
  );
}
