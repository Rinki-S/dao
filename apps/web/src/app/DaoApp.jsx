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
import { ChatsWorkspace } from '@/features/chats/components/ChatsWorkspace.jsx';
import { ConversationsProvider } from '@/features/chats/components/ConversationsProvider.jsx';
import { CommandPalette } from '@/features/command-palette/components/CommandPalette.jsx';
import { NoteEditorPanel } from '@/features/notes/components/NoteEditorPanel.jsx';
import { TodayWorkspace } from '@/features/ai/components/TodayWorkspace.jsx';
import { SearchWorkspace } from '@/features/search/components/SearchWorkspace.jsx';
import { SettingsDialog } from '@/features/settings/components/SettingsDialog.jsx';
import { TasksWorkspace } from '@/features/tasks/components/TasksWorkspace.jsx';
import { useAppearance } from '@/hooks/use-appearance.js';
import { useFonts } from '@/hooks/use-fonts.js';
import { useShowThinking } from '@/hooks/use-show-thinking.js';
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
  const { appearance, setAppearance } = useAppearance();
  // Held here rather than in the pane that draws it, so that the switch in
  // Settings and the transcript are reading the same value.
  const { showThinking, setShowThinking } = useShowThinking();
  // Applied to the document by the hook, so every surface picks the choices up
  // from the CSS tokens rather than being handed them.
  const { fonts, setFont } = useFonts();
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
      return <TodayWorkspace model={model} onOpenSettings={() => setSettingsOpen(true)} />;
    if (model.activeView === 'tasks') return <TasksWorkspace model={model} />;
    if (model.activeView === 'search') return <SearchWorkspace model={model} />;
    return (
      <ChatsWorkspace
        model={model}
        showThinking={showThinking}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  })();

  return (
    // Above the sidebar as well as the workspace: the two are siblings, and the
    // conversation list is now shown by one and added to by the other.
    <ConversationsProvider model={model}>
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
            fonts={fonts}
            model={model}
            open={settingsOpen}
            showThinking={showThinking}
            onAppearanceChange={setAppearance}
            onFontChange={setFont}
            onShowThinkingChange={setShowThinking}
            onOpenChange={setSettingsOpen}
            onReplayOnboarding={() => {
              setSettingsOpen(false);
              setReplayOnboarding(true);
            }}
          />
        </TitlebarPeekContext.Provider>
      </SidebarProvider>
    </ConversationsProvider>
  );
}
