import { useEffect, useRef } from 'react';
import { Button } from '@heroui/react';

export function AppTabBar({ tabs, activeTabId, onSelectTab, onCloseTab }) {
  const tabListRef = useRef(null);

  useEffect(() => {
    const activeTab = tabListRef.current?.querySelector('[data-active-tab="true"]');

    activeTab?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId, tabs.length]);

  return (
    <div className="flex h-10 shrink-0 items-center overflow-hidden border-b border-border bg-sidebar">
      {tabs.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">No tab open</p>
      ) : (
        <div
          ref={tabListRef}
          aria-label="Open tabs"
          className="app-tabbar-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                data-active-tab={isActive ? 'true' : undefined}
                className={`group relative flex h-10 max-w-56 shrink-0 items-center gap-1 border-r border-border/60 pr-3 pl-4 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface text-foreground before:absolute before:top-0 before:right-0 before:left-0 before:h-0.5 before:bg-accent'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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
