import { Button } from '@heroui/react';

export function AppTabBar({ tabs, activeTabId, onSelectTab, onCloseTab }) {
  return (
    <div className="flex h-10 shrink-0 items-center overflow-hidden border-b border-border bg-surface px-2">
      {tabs.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No tab open</p>
      ) : (
        <div
          aria-label="Open tabs"
          className="no-scrollbar flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                className={`group flex h-8 max-w-56 shrink-0 items-center gap-1 rounded-t-lg border px-2 text-sm transition-colors ${
                  isActive
                    ? 'border-border border-b-surface bg-sidebar text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <button
                  aria-selected={isActive}
                  className="min-w-0 truncate outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  role="tab"
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                >
                  {tab.title}
                </button>
                <Button
                  aria-label={`Close ${tab.title} tab`}
                  className="size-5 min-w-0 rounded-md p-0 text-muted-foreground opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onPress={() => onCloseTab(tab.id)}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    ×
                  </span>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
