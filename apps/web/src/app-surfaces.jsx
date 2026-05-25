import { ActivityMetricsPanel } from './features/activities/components/ActivityMetricsPanel.jsx';
import { NotePanel } from './features/notes/components/NotePanel.jsx';
import { ProjectPanel } from './features/projects/components/ProjectPanel.jsx';
import { SettingsPanel } from './features/settings/components/SettingsPanel.jsx';
import { TaskPanel } from './features/tasks/components/TaskPanel.jsx';

export function getSurfaceComponent(
  surfaceId,
  { currentWorkspace, currentWorkingDirectory, hasWorkspace, onReplayOnboardingComplete },
) {
  const surfaceComponents = {
    dashboard: (
      <section id="dashboard">
        <ActivityMetricsPanel />
      </section>
    ),
    projects: <ProjectPanel currentWorkspace={currentWorkspace} />,
    tasks: <TaskPanel currentWorkspace={currentWorkspace} />,
    notes: <NotePanel currentWorkspace={currentWorkspace} />,
    settings: (
      <SettingsPanel
        currentWorkingDirectory={currentWorkingDirectory}
        hasWorkspace={hasWorkspace}
        onReplayOnboardingComplete={onReplayOnboardingComplete}
      />
    ),
  };

  return surfaceComponents[surfaceId] ?? null;
}
