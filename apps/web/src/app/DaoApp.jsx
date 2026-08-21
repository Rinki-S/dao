import { IconMessageCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { DaoSidebar } from '@/components/shell/DaoSidebar.jsx';
import { EntityInspector } from '@/components/shell/EntityInspector.jsx';
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
import { Spinner } from '@/components/ui/spinner.jsx';
import { ActivityWorkspace } from '@/features/activities/components/ActivityWorkspace.jsx';
import { CommandPalette } from '@/features/command-palette/components/CommandPalette.jsx';
import { NoteEditorPanel } from '@/features/notes/components/NoteEditorPanel.jsx';
import { SearchWorkspace } from '@/features/search/components/SearchWorkspace.jsx';
import { SettingsDialog } from '@/features/settings/components/SettingsDialog.jsx';
import { TasksWorkspace } from '@/features/tasks/components/TasksWorkspace.jsx';
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

export function DaoApp() {
  const model = useDaoWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    if (model.activeView === 'tasks') return <TasksWorkspace model={model} />;
    if (model.activeView === 'search') return <SearchWorkspace model={model} />;
    if (model.activeView === 'activity') return <ActivityWorkspace model={model} />;
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
      <CommandPalette model={model} onOpenSettings={() => setSettingsOpen(true)} />
      <DaoSidebar model={model} onOpenSettings={() => setSettingsOpen(true)} />
      <SidebarInset>
        <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
      </SidebarInset>
      <EntityInspector model={model} />
      <SettingsDialog
        model={model}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onReplayOnboarding={() => {
          setSettingsOpen(false);
          setReplayOnboarding(true);
        }}
      />
    </SidebarProvider>
  );
}
