import { ActivityMetricsPanel } from './features/activities/components/ActivityMetricsPanel.jsx';
import { NotePanel } from './features/notes/components/NotePanel.jsx';
import { SettingsPanel } from './features/settings/components/SettingsPanel.jsx';
import { TaskPanel } from './features/tasks/components/TaskPanel.jsx';

export function getSurfaceComponent(
  surfaceId,
  { currentWorkspace, currentWorkingDirectory, onReplayOnboarding },
) {
  const surfaceComponents = {
    dashboard: (
      <section id="dashboard">
        <ActivityMetricsPanel />
      </section>
    ),
    tasks: <TaskPanel currentWorkspace={currentWorkspace} />,
    notes: <NotePanel currentWorkspace={currentWorkspace} />,
    settings: (
      <SettingsPanel
        currentWorkingDirectory={currentWorkingDirectory}
        onReplayOnboarding={onReplayOnboarding}
      />
    ),
  };

  return surfaceComponents[surfaceId] ?? null;
}
