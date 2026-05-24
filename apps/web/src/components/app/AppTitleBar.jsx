import { SidebarTrigger } from '@/components/ui/sidebar';

export function AppTitleBar() {
  return (
    <header className="app-drag-region relative z-30 flex h-12 shrink-0 items-center border-b border-border bg-background">
      <div className="flex w-20 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <SidebarTrigger className="app-no-drag" />
        <div className="min-w-0 truncate text-xs font-medium text-muted-foreground">Dao</div>
      </div>
    </header>
  );
}
