import { IconMessageCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { DaoSidebar } from '@/components/shell/DaoSidebar.jsx';
import { WorkingDirectoryOnboarding } from '@/components/app/WorkingDirectoryOnboarding.jsx';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar.jsx';
import { WindowSidebarTrigger } from '@/components/shell/WindowSidebarTrigger.jsx';
import { TitlebarPeekContext } from '@/components/shell/use-titlebar-inset.js';
import { Spinner } from '@/components/ui/spinner.jsx';
import { CommandPalette } from '@/features/command-palette/components/CommandPalette.jsx';
import { NoteEditorPanel } from '@/features/notes/components/NoteEditorPanel.jsx';
import { TodaySummaryCard } from '@/features/ai/components/TodaySummaryCard.jsx';
import { SearchWorkspace } from '@/features/search/components/SearchWorkspace.jsx';
import { SettingsDialog } from '@/features/settings/components/SettingsDialog.jsx';
import { TasksWorkspace } from '@/features/tasks/components/TasksWorkspace.jsx';
import { useAppearance } from '@/hooks/use-appearance.js';
import { useDaoWorkspace } from './use-dao-workspace.js';

function EmptyHome({ model }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No recent work</EmptyTitle>
        <EmptyDescription>Create a note to begin this workspace.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => model.addNote()}>Create note</Button>
      </EmptyContent>
    </Empty>
  );
}

// A surface of its own rather than a card on Home: Home means the note you
// were last writing, and a card that only appears when there is no such note
// would be out of reach exactly when there is a day worth summarising.
function TodayView({ model, onOpenSettings }) {
  return (
    <div className="flex h-full items-start justify-center overflow-auto p-6">
      <TodaySummaryCard
        workspaceId={model.currentWorkspace?.id ?? ''}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

export function DaoApp() {
  const model = useDaoWorkspace();
  const { appearance, setAppearance } = useAppearance();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Peeking the hidden sidebar back in: owned here because the sidebar and the
  // trigger are siblings and both have to move together.
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [replayOnboarding, setReplayOnboarding] = useState(false);

  if (model.status === 'loading') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <Spinner aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Opening your workspace…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  if (model.status === 'error') {
    return (
      <Empty role="alert">
        <EmptyHeader>
          <EmptyTitle>Unable to open Dao</EmptyTitle>
          <EmptyDescription>{model.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (model.status === 'onboarding') {
    return <WorkingDirectoryOnboarding onComplete={model.completeOnboarding} />;
  }
  if (replayOnboarding) {
    return (
      <WorkingDirectoryOnboarding
        hasWorkspace={model.workspaces.length > 0}
        initialPath={model.workingDirectory?.path ?? ''}
        onCancel={() => setReplayOnboarding(false)}
        onComplete={async (input) => {
          await model.completeOnboarding(input);
          setReplayOnboarding(false);
        }}
      />
    );
  }

  const content = (() => {
    if (model.activeView === 'home')
      return model.selectedNote ? (
        <NoteEditorPanel noteId={model.selectedNote.id} />
      ) : (
        <EmptyHome model={model} />
      );
    if (model.activeView === 'today')
      return <TodayView model={model} onOpenSettings={() => setSettingsOpen(true)} />;
    if (model.activeView === 'tasks') return <TasksWorkspace model={model} />;
    if (model.activeView === 'search') return <SearchWorkspace model={model} />;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconMessageCircle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Chats will live here.</EmptyTitle>
          <EmptyDescription>
            The navigation is reserved for Dao's future AI context, but no AI behavior is enabled
            yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  })();

  return (
    <SidebarProvider>
      <TitlebarPeekContext.Provider value={sidebarPeek}>
        <CommandPalette model={model} onOpenSettings={() => setSettingsOpen(true)} />
        <DaoSidebar
          model={model}
          peeking={sidebarPeek}
          onOpenSettings={() => setSettingsOpen(true)}
          onPeekChange={setSidebarPeek}
        />
        <WindowSidebarTrigger peeking={sidebarPeek} onPeekChange={setSidebarPeek} />
        <SidebarInset>
          <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
        </SidebarInset>
        <SettingsDialog
          appearance={appearance}
          model={model}
          open={settingsOpen}
          onAppearanceChange={setAppearance}
          onOpenChange={setSettingsOpen}
          onReplayOnboarding={() => {
            setSettingsOpen(false);
            setReplayOnboarding(true);
          }}
        />
      </TitlebarPeekContext.Provider>
    </SidebarProvider>
  );
}
