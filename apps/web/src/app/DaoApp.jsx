import { useState } from 'react';
import { IconMessageCircle } from '@tabler/icons-react';
import { DaoSidebar } from '@/components/shell/DaoSidebar.jsx';
import { EntityInspector } from '@/components/shell/EntityInspector.jsx';
import { WorkingDirectoryOnboarding } from '@/components/app/WorkingDirectoryOnboarding.jsx';
import { ActivityWorkspace } from '@/features/activities/components/ActivityWorkspace.jsx';
import { CommandPalette } from '@/features/command-palette/components/CommandPalette.jsx';
import { NoteEditorPanel } from '@/features/notes/components/NoteEditorPanel.jsx';
import { SearchWorkspace } from '@/features/search/components/SearchWorkspace.jsx';
import { SettingsDialog } from '@/features/settings/components/SettingsDialog.jsx';
import { TasksWorkspace } from '@/features/tasks/components/TasksWorkspace.jsx';
import { SidebarProvider } from '@/components/ui/sidebar.jsx';
import { useDaoWorkspace } from './use-dao-workspace.js';

function EmptyHome({ model }) {
  return (
    <section className="dao-empty-state dao-home-empty">
      <h2>No recent work</h2>
      <p>Create a note to begin this workspace.</p>
      <button type="button" onClick={() => model.addNote()}>
        Create note
      </button>
    </section>
  );
}

export function DaoApp() {
  const model = useDaoWorkspace();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replayOnboarding, setReplayOnboarding] = useState(false);

  if (model.status === 'loading') {
    return (
      <main className="dao-boot app-drag-region">
        <span className="dao-boot-mark dao-corner">D</span>
        <p>Opening your workspace…</p>
      </main>
    );
  }
  if (model.status === 'error') {
    return (
      <main className="dao-boot">
        <p className="dao-error" role="alert">
          {model.error}
        </p>
      </main>
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
      <section className="dao-empty-state dao-chat-placeholder">
        <IconMessageCircle aria-hidden="true" />
        <h2>Chats will live here.</h2>
        <p>
          The navigation is reserved for Dao's future AI context, but no AI behavior is enabled yet.
        </p>
      </section>
    );
  })();

  return (
    <SidebarProvider className="dao-app isolate">
      <CommandPalette model={model} onOpenSettings={() => setSettingsOpen(true)} />
      <DaoSidebar
        model={model}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="dao-main">{content}</main>
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
